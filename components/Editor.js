import { useEffect, useRef } from 'react';
import MonacoEditor from '@monaco-editor/react';
import * as Y from 'yjs';
import { MonacoBinding } from 'y-monaco';

export default function Editor({ 
  roomId,
  fileId = 'main',
  socket, 
  currentUser, 
  language, 
  editorRef: parentEditorRef, 
  monacoRef: parentMonacoRef,
  onCodeChange,
  onCursorChange
}) {
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const ydocRef = useRef(null);
  const bindingRef = useRef(null);
  const awarenessRef = useRef(null);
  const remoteCursorsRef = useRef(new Map());
  const usersHandlerRef = useRef(null);
  const connectHandlerRef = useRef(null);
  const syncHandlerRef = useRef(null);
  const awarenessHandlerRef = useRef(null);
  const cursorHandlerRef = useRef(null);

  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    
    // Expose to parent component for AI Chat
    if (parentEditorRef) parentEditorRef.current = editor;
    if (parentMonacoRef) parentMonacoRef.current = monaco;

    // The web font may finish loading after Monaco measured character widths.
    document.fonts?.ready.then(() => monaco.editor.remeasureFonts());

    // Initialize Yjs document
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    // Get the shared text type
    const ytext = ydoc.getText('monaco');

    // Create a simple awareness implementation
    class SimpleAwareness {
  constructor(socket, roomId, fileId, clientID) {
    this.socket = socket;
    this.roomId = roomId;
    this.fileId = fileId;
    this.clientID = clientID;

    this.states = new Map();
    this.meta = new Map();
    this.handlers = new Map(); // required by MonacoBinding
  }

  on(event, handler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event).add(handler);
  }

  off(event, handler) {
    if (this.handlers.has(event)) {
      this.handlers.get(event).delete(handler);
    }
  }

  notify(event) {
    if (!this.handlers.has(event)) return;
    for (const handler of this.handlers.get(event)) {
      handler({ states: this.states });
    }
  }

  getLocalState() {
    return this.states.get(this.clientID);
  }

  setLocalState(state) {
    this.states.set(this.clientID, state);

    this.socket.emit("yjs-awareness", {
      roomId: this.roomId,
      fileId: this.fileId,
      update: { clientID: this.clientID, state }
    });

    this.notify("change");
  }

  setLocalStateField(field, value) {
    const s = this.getLocalState() || {};
    s[field] = value;
    this.setLocalState(s);
  }

  getStates() {
    return this.states;
  }
}

 const awareness = new SimpleAwareness(socket, roomId, fileId, socket.id);


    awarenessRef.current = awareness;

    // Set local user info
    awareness.setLocalStateField('user', {
      name: currentUser.name,
      color: currentUser.color
    });

    // Create Monaco binding
    const binding = new MonacoBinding(
      ytext,
      editor.getModel(),
      new Set([editor]),
      awareness
    );
    bindingRef.current = binding;
    onCodeChange?.(editor.getValue());

    // Handle Yjs updates from this client
    ydoc.on('update', (update, origin) => {
      if (origin === 'remote') return;
      socket.emit('yjs-sync', { roomId, fileId, update: Array.from(update) });
    });

    // Handle incoming Yjs updates from other clients
    syncHandlerRef.current = ({ fileId: incomingFileId = 'main', update } = {}) => {
      if (incomingFileId !== fileId || !Array.isArray(update)) return;
      try { Y.applyUpdate(ydoc, new Uint8Array(update), 'remote'); } catch (error) { console.warn('Ignored invalid Yjs update', error); }
    };
    socket.on('yjs-sync', syncHandlerRef.current);

    // Pull the room's current text, and push ours in case the server restarted and lost it.
    const syncWithServer = () => {
      if (!socket.connected) return;
      socket.emit('yjs-request-state', { roomId, fileId });
      socket.emit('yjs-sync', { roomId, fileId, update: Array.from(Y.encodeStateAsUpdate(ydoc)) });
    };
    syncWithServer();
    connectHandlerRef.current = syncWithServer;
    socket.on('connect', syncWithServer);

    // Handle incoming awareness updates
    awarenessHandlerRef.current = ({ fileId: incomingFileId = 'main', update } = {}) => {
      if (incomingFileId === fileId && update?.clientID !== socket.id && update?.clientID) {
        awareness.states.set(update.clientID, update.state);
        awareness.notify('change');
      }
    };
    socket.on('yjs-awareness', awarenessHandlerRef.current);

    // Listen for cursor position changes
    editor.onDidChangeCursorPosition((e) => {
      const position = e.position;
      onCursorChange?.({ lineNumber: position.lineNumber, column: position.column });
      socket.emit('cursor-position', {
        roomId,
        fileId,
        position: {
          lineNumber: position.lineNumber,
          column: position.column
        },
        user: currentUser
      });
    });

    // Handle remote cursor updates
    cursorHandlerRef.current = ({ fileId: incomingFileId = 'main', userId, position, user } = {}) => {
      if (incomingFileId !== fileId || !position || !user) return;
      upsertRemoteCursor(editor, monaco, userId, position, user);
    };
    socket.on('remote-cursor', cursorHandlerRef.current);

    // Drop carets of people who left the room
    usersHandlerRef.current = (users) => {
      const ids = new Set(users.map((u) => u.id));
      for (const id of remoteCursorsRef.current.keys()) {
        if (!ids.has(id)) removeRemoteCursor(editor, id);
      }
    };
    socket.on('users-update', usersHandlerRef.current);

    // Carets follow their tracked decoration when the text around them changes
    editor.onDidChangeModelContent(() => {
      for (const c of remoteCursorsRef.current.values()) editor.layoutContentWidget(c.widget);
    });

    editor.onDidChangeModelContent(() => {
      onCodeChange?.(editor.getValue());
    });
  };

  const upsertRemoteCursor = (editor, monaco, userId, position, user) => {
    const cursors = remoteCursorsRef.current;
    let c = cursors.get(userId);

    if (!c) {
      const node = document.createElement('div');
      node.className = 'remote-caret';
      node.style.height = `${editor.getOption(monaco.editor.EditorOption.lineHeight)}px`;
      const label = document.createElement('div');
      label.className = 'remote-caret-label';
      node.appendChild(label);

      c = { node, label, decorations: editor.createDecorationsCollection(), idleTimer: null };
      c.widget = {
        getId: () => `remote-caret-${userId}`,
        getDomNode: () => node,
        getPosition: () => ({
          position: c.decorations.getRange(0)?.getStartPosition() ?? null,
          preference: [monaco.editor.ContentWidgetPositionPreference.EXACT],
        }),
      };
      cursors.set(userId, c);
      editor.addContentWidget(c.widget);
    }

    const { lineNumber, column } = position;
    c.decorations.set([{
      range: new monaco.Range(lineNumber, column, lineNumber, column),
      options: { stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges },
    }]);

    c.node.style.background = user.color;
    c.label.style.background = user.color;
    c.label.textContent = user.name;
    // No room above the first line, so the label flips below the caret there.
    c.label.classList.toggle('below', lineNumber === 1);

    c.node.classList.remove('idle');
    clearTimeout(c.idleTimer);
    c.idleTimer = setTimeout(() => c.node.classList.add('idle'), 2500);

    editor.layoutContentWidget(c.widget);
  };

  const removeRemoteCursor = (editor, userId) => {
    const c = remoteCursorsRef.current.get(userId);
    if (!c) return;
    clearTimeout(c.idleTimer);
    c.decorations.clear();
    editor.removeContentWidget(c.widget);
    remoteCursorsRef.current.delete(userId);
  };

  useEffect(() => {
    return () => {
      // Cleanup
      if (bindingRef.current) {
        bindingRef.current.destroy();
      }
      if (ydocRef.current) {
        ydocRef.current.destroy();
      }
      
      // Remove socket listeners
      if (socket) {
        if (syncHandlerRef.current) socket.off('yjs-sync', syncHandlerRef.current);
        if (awarenessHandlerRef.current) socket.off('yjs-awareness', awarenessHandlerRef.current);
        if (cursorHandlerRef.current) socket.off('remote-cursor', cursorHandlerRef.current);
        if (usersHandlerRef.current) socket.off('users-update', usersHandlerRef.current);
        if (connectHandlerRef.current) socket.off('connect', connectHandlerRef.current);
      }
      for (const c of remoteCursorsRef.current.values()) clearTimeout(c.idleTimer);
      remoteCursorsRef.current.clear();
    };
  }, [socket]);

  return (
    <>
      <style jsx global>{`
        .remote-caret {
          width: 2px;
          pointer-events: none;
        }
        /* Small flag that stays visible once the name tag fades */
        .remote-caret::before {
          content: '';
          position: absolute;
          top: -3px;
          left: -2px;
          width: 6px;
          height: 6px;
          border-radius: 1px;
          background: inherit;
          opacity: 0;
          transition: opacity 0.2s;
        }
        .remote-caret.idle::before {
          opacity: 1;
        }
        .remote-caret-label {
          position: absolute;
          bottom: 100%;
          left: 0;
          margin-bottom: 1px;
          padding: 0 6px;
          border-radius: 3px 3px 3px 0;
          color: #0D0E0E;
          font: 600 10px/16px var(--font-mono), ui-monospace, monospace;
          letter-spacing: 0.02em;
          white-space: nowrap;
          transition: opacity 0.2s;
        }
        .remote-caret-label.below {
          bottom: auto;
          top: 100%;
          margin: 1px 0 0;
          border-radius: 0 3px 3px 3px;
        }
        .remote-caret.idle .remote-caret-label {
          opacity: 0;
        }
      `}</style>
      <MonacoEditor
        height="100%"
        language={language}
        theme="codesync"
        beforeMount={(monaco) => {
          // Monaco can't read CSS variables, so the palette from globals.css is repeated here.
          monaco.editor.defineTheme('codesync', {
            base: 'vs-dark',
            inherit: true,
            rules: [
              { token: 'comment', foreground: '6B716E', fontStyle: 'italic' },
              { token: 'keyword', foreground: 'C6C4DA' },
              { token: 'string', foreground: '6FD3A8' },
              { token: 'number', foreground: 'D1CEE4' },
              { token: 'type', foreground: 'BED6CD' },
              { token: 'type.identifier', foreground: 'BED6CD' },
              { token: 'tag', foreground: 'C6C4DA' },
              { token: 'attribute.name', foreground: 'BED6CD' },
              { token: 'attribute.value', foreground: '6FD3A8' },
              { token: 'delimiter', foreground: '8C928F' },
            ],
            colors: {
              'editor.background': '#131413',
              'editor.foreground': '#E4E2E1',
              'editor.lineHighlightBackground': '#1B1C1B',
              'editor.lineHighlightBorder': '#00000000',
              'editor.selectionBackground': '#6FD3A833',
              'editor.inactiveSelectionBackground': '#6FD3A81A',
              'editorCursor.foreground': '#6FD3A8',
              'editorLineNumber.foreground': '#424846',
              'editorLineNumber.activeForeground': '#8C928F',
              'editorIndentGuide.background1': '#FFFFFF0F',
              'editorWidget.background': '#1B1C1B',
              'editorWidget.border': '#FFFFFF24',
              'editorSuggestWidget.background': '#1B1C1B',
              'editorSuggestWidget.border': '#FFFFFF24',
              'editorSuggestWidget.selectedBackground': '#292A29',
              'minimap.background': '#131413',
              'scrollbarSlider.background': '#FFFFFF14',
              'scrollbarSlider.hoverBackground': '#FFFFFF24',
            },
          });
        }}
        onMount={handleEditorDidMount}
        options={{
          fontSize: 13,
          minimap: { enabled: true, renderCharacters: false },
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          automaticLayout: true,
          tabSize: 2,
          padding: { top: 16, bottom: 16 },
          fontFamily: "var(--font-mono), 'Cascadia Code', Consolas, monospace",
          fontLigatures: true,
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: true,
          smoothScrolling: true,
          renderLineHighlight: 'all',
          lineHeight: 22,
          suggest: {
            showInlineDetails: true,
            preview: true
          },
          quickSuggestions: {
            other: true,
            comments: false,
            strings: true
          },
          parameterHints: {
            enabled: true
          },
          formatOnPaste: true,
          formatOnType: true,
          autoClosingBrackets: 'always',
          autoClosingQuotes: 'always',
          bracketPairColorization: {
            enabled: true
          }
        }}
      />
    </>
  );
}