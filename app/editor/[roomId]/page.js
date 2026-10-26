'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { io } from 'socket.io-client';

const Editor = dynamic(() => import('../../../components/Editor'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-surface">
      <div className="flex items-center font-mono text-xs text-muted">
        <div className="mr-3 h-5 w-5 animate-spin rounded-full border-2 border-line-strong border-t-accent"></div>
        Loading editor...
      </div>
    </div>
  ),
});

const AIChat = dynamic(() => import('../../../components/AIChat'), { ssr: false });

// Leave NEXT_PUBLIC_SOCKET_URL unset to connect to the same origin that served the page.
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL;
const NAME_KEY = 'codesync:name';
const TEMP_NOTICE_KEY = 'codesync:temp-notice-dismissed';

const LANGUAGES = [
  { value: 'javascript', label: 'JavaScript', ext: 'js' },
  { value: 'typescript', label: 'TypeScript', ext: 'ts' },
  { value: 'python', label: 'Python', ext: 'py' },
  { value: 'java', label: 'Java', ext: 'java' },
  { value: 'cpp', label: 'C++', ext: 'cpp' },
  { value: 'html', label: 'HTML', ext: 'html' },
  { value: 'css', label: 'CSS', ext: 'css' },
  { value: 'json', label: 'JSON', ext: 'json' },
];

const ICONS = {
  terminal: 'M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  link: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1',
  sparkles: 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z',
  code: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4',
  copy: 'M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z',
  check: 'M5 13l4 4L19 7',
  menu: 'M4 6h16M4 12h16M4 18h16',
  file: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  bulb: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z',
  save: 'M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4',
  upload: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12',
  clock: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  x: 'M6 18L18 6M6 6l12 12',
};

const MAX_UPLOAD_BYTES = 1024 * 1024;

const Icon = ({ name, className = 'h-4 w-4' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={ICONS[name]} />
  </svg>
);

// Same name always gets the same colour, so people keep their colour across visits.
const colorFor = (name) => {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h}, 65%, 55%)`;
};

const initials = (name) =>
  name.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

const focus =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50';
const btn = `inline-flex h-8 shrink-0 items-center gap-1.5 rounded px-2.5 text-sm font-medium transition-colors ${focus}`;
const btnPrimary = `${btn} bg-accent font-semibold text-on-accent hover:bg-accent-hover`;
const btnSecondary = `${btn} border border-line-strong bg-raised text-fg hover:bg-overlay`;
const btnGhost = `${btn} text-muted hover:bg-white/5 hover:text-fg`;
const eyebrow = 'font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-muted';

function NameDialog({ onSubmit }) {
  const [name, setName] = useState('');
  const submit = (e) => {
    e.preventDefault();
    if (name.trim()) onSubmit(name.trim());
  };
  return (
    <div
      className="absolute inset-0 z-[60] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="name-title"
    >
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-lg border border-line-strong bg-surface p-6 shadow-[0_12px_32px_-4px_rgba(0,0,0,0.6)]"
      >
        <p className={eyebrow}>Joining room</p>
        <h2 id="name-title" className="mt-2 text-lg font-semibold tracking-[-0.015em]">What should we call you?</h2>
        <p className="mt-1 text-sm text-muted">Others in the room see this name next to your cursor.</p>
        <label htmlFor="display-name" className="sr-only">Your name</label>
        <input
          id="display-name"
          autoFocus
          maxLength={24}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          autoComplete="nickname"
          className="mt-5 h-10 w-full rounded border border-line bg-canvas px-3 text-sm text-fg placeholder:text-muted/70 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <button
          type="submit"
          disabled={!name.trim()}
          className={`${btnPrimary} mt-3 h-10 w-full justify-center disabled:cursor-not-allowed disabled:opacity-50`}
        >
          Join room
        </button>
      </form>
    </div>
  );
}

export default function EditorPage() {
  const params = useParams();
  const roomId = params.roomId;

  const [profile, setProfile] = useState(undefined); // undefined = loading, null = needs a name
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [users, setUsers] = useState([]);
  const [files, setFiles] = useState([{ id: 'main', name: 'index.js', language: 'javascript' }]);
  const [activeFileId, setActiveFileId] = useState('main');
  const [fileOperationError, setFileOperationError] = useState(null);
  const [copied, setCopied] = useState(null); // 'id' | 'link' | null
  const [cursor, setCursor] = useState({ lineNumber: 1, column: 1 });
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile only; always visible on md+
  const [currentCode, setCurrentCode] = useState('');
  const [baseName, setBaseName] = useState('untitled');
  const [roomError, setRoomError] = useState(null);
  const [showTempNotice, setShowTempNotice] = useState(false);

  // Refs for Monaco editor access from AIChat
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const fileInputRef = useRef(null);

  // Load the saved display name
  useEffect(() => {
    let name = null;
    try {
      name = localStorage.getItem(NAME_KEY);
    } catch {}
    setProfile(name ? { name, color: colorFor(name) } : null);
    try {
      setShowTempNotice(!localStorage.getItem(TEMP_NOTICE_KEY));
    } catch {
      setShowTempNotice(true);
    }
  }, []);

  const dismissTempNotice = () => {
    setShowTempNotice(false);
    try {
      localStorage.setItem(TEMP_NOTICE_KEY, '1');
    } catch {}
  };

  const saveProfile = (name) => {
    try {
      localStorage.setItem(NAME_KEY, name);
    } catch {}
    setProfile({ name, color: colorFor(name) });
  };

  // Connect and join once we know who the user is
  useEffect(() => {
    if (!profile) return;
    const s = io(SOCKET_URL);
    setSocket(s);
    // Rejoin on every (re)connect: the server forgets a socket's rooms when it drops.
    s.on('connect', () => {
      setConnected(true);
      s.emit('join-room', { roomId, user: profile });
    });
    s.on('disconnect', () => setConnected(false));
    s.on('users-update', setUsers);
    const onProjectFiles = ({ files: nextFiles, action, fileId, createdBy } = {}) => {
      if (!Array.isArray(nextFiles) || nextFiles.length === 0) return;
      setFiles(nextFiles);
      setActiveFileId((current) => {
        // Only the person who created the file switches to it; collaborators keep their current file open.
        if (action === 'create' && createdBy === s.id && nextFiles.some((file) => file.id === fileId)) return fileId;
        return nextFiles.some((file) => file.id === current) ? current : nextFiles[0].id;
      });
    };
    const onFileOperationError = ({ message } = {}) => {
      setFileOperationError(typeof message === 'string' ? message : 'That file operation could not be completed.');
    };
    s.on('project-files', onProjectFiles);
    s.on('file-operation-error', onFileOperationError);
    s.on('room-error', ({ message } = {}) => {
      setRoomError(typeof message === 'string' ? message : 'You were disconnected from this room.');
      s.disconnect();
    });

    return () => {
      s.off('project-files', onProjectFiles);
      s.off('file-operation-error', onFileOperationError);
      s.disconnect();
      setSocket(null);
      setConnected(false);
      setUsers([]);
    };
  }, [roomId, profile]);

  // Escape closes the AI drawer
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setIsChatOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const copyText = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {}
  };

  const activeFile = files.find((file) => file.id === activeFileId) || files[0];
  const language = activeFile?.language || 'javascript';
  const ext = LANGUAGES.find((l) => l.value === language)?.ext ?? language;
  const languageLabel = LANGUAGES.find((l) => l.value === language)?.label ?? language;
  const fileName = activeFile?.name || `${baseName}.${ext}`;
  useEffect(() => {
    if (!activeFile) return;
    const dot = activeFile.name.lastIndexOf('.');
    setBaseName(dot > 0 ? activeFile.name.slice(0, dot) : activeFile.name);
  }, [activeFile?.id, activeFile?.name, activeFile?.language]);
  const people = [...users].sort((a, b) => (b.id === socket?.id) - (a.id === socket?.id));
  const others = Math.max(0, users.length - 1);

  const downloadFile = () => {
    const content = editorRef.current?.getValue() ?? currentCode;
    const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Ctrl/Cmd+S downloads the file instead of the browser's "save page"
  const downloadRef = useRef(downloadFile);
  downloadRef.current = downloadFile;
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        downloadRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const uploadFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // lets the same file be picked again
    const editor = editorRef.current;
    if (!file || !editor) return;

    const dot = file.name.lastIndexOf('.');
    const match = LANGUAGES.find((l) => l.ext === file.name.slice(dot + 1).toLowerCase());
    if (dot <= 0 || !match) {
      alert(`Unsupported file type. Supported: ${LANGUAGES.map((l) => '.' + l.ext).join(', ')}`);
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      alert('File is too large (max 1 MB).');
      return;
    }

    const text = await file.text();
    if (text.includes('\u0000')) {
      alert('That looks like a binary file, not code.');
      return;
    }
    if (editor.getValue().trim() && !confirm(`Replace the current code with ${file.name}? This changes it for everyone in the room.`)) {
      return;
    }

    // executeEdits (not setValue) keeps undo history and syncs through the Yjs binding.
    editor.executeEdits('upload', [{ range: editor.getModel().getFullModelRange(), text }]);
    editor.pushUndoStop();
    socket?.emit('file-rename', { roomId, fileId: activeFileId, name: file.name });
    socket?.emit('file-language', { roomId, fileId: activeFileId, language: match.value });
  };

  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-canvas text-fg">
      {profile === null && <NameDialog onSubmit={saveProfile} />}
      {roomError && (
        <div
          className="absolute inset-0 z-[60] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="room-error-title"
        >
          <div className="w-full max-w-sm rounded-lg border border-line-strong bg-surface p-6 shadow-[0_12px_32px_-4px_rgba(0,0,0,0.6)]">
            <p className={eyebrow}>Can&apos;t join</p>
            <h2 id="room-error-title" className="mt-2 text-lg font-semibold tracking-[-0.015em]">{roomError}</h2>
            <div className="mt-5 flex gap-2">
              <a href="/" className={`${btnPrimary} h-10 flex-1 justify-center`}>Start a new room</a>
              <button onClick={() => window.location.reload()} className={`${btnSecondary} h-10 flex-1 justify-center`}>
                Try again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile backdrop for the sidebar */}
      {sidebarOpen && (
        <div className="absolute inset-0 z-20 bg-black/60 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`absolute inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-line bg-canvas transition-transform duration-200 md:static md:translate-x-0 md:border-r-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-14 shrink-0 items-center px-4">
          <a href="/" className={`flex items-center gap-2 rounded font-semibold tracking-tight ${focus}`}>
            <span className="grid h-6 w-6 place-items-center rounded bg-accent text-on-accent">
              <Icon name="terminal" className="h-3.5 w-3.5" />
            </span>
            CodeSync
          </a>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-3 pb-3">
          <section className="rounded-lg border border-line bg-surface p-3">
            <div className="mb-2 flex items-center justify-between">
              <h2 className={eyebrow}>Room</h2>
              <span
                className={`flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] ${connected ? 'text-accent' : 'text-muted'}`}
                role="status"
              >
                <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-accent' : 'animate-pulse bg-muted'}`} />
                {connected ? 'Live' : 'Connecting'}
              </span>
            </div>
            <div className="flex items-center gap-2 rounded border border-line bg-canvas py-1.5 pl-2.5 pr-1.5">
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-soft" title={roomId}>{roomId}</span>
              <button
                onClick={() => copyText(roomId, 'id')}
                aria-label="Copy room ID"
                className={`rounded p-1 text-muted hover:bg-white/5 hover:text-fg ${focus}`}
              >
                <Icon name={copied === 'id' ? 'check' : 'copy'} className={`h-3.5 w-3.5 ${copied === 'id' ? 'text-accent' : ''}`} />
              </button>
            </div>
            <button
              onClick={() => copyText(window.location.href, 'link')}
              className={`${btnSecondary} mt-2 w-full justify-center text-xs`}
            >
              <Icon name={copied === 'link' ? 'check' : 'link'} className={`h-3.5 w-3.5 ${copied === 'link' ? 'text-accent' : ''}`} />
              {copied === 'link' ? 'Link copied' : 'Copy invite link'}
            </button>
          </section>

          <section className="rounded-lg border border-line bg-surface p-3">
            <div className="mb-2 flex items-center justify-between">
              <h2 className={eyebrow}>Project files ({files.length})</h2>
              <button
                type="button"
                className={`${btnGhost} h-6 px-1.5 text-xs`}
                title="Create a new file"
                onClick={() => {
                  const name = window.prompt('New file name (include extension)', 'utils.js');
                  if (!name?.trim()) return;
                  const dot = name.trim().lastIndexOf('.');
                  const extName = dot > 0 ? name.trim().slice(dot + 1).toLowerCase() : '';
                  const match = LANGUAGES.find((item) => item.ext === extName);
                  if (!match) { setFileOperationError(`Unsupported file extension. Use: ${LANGUAGES.map((item) => '.' + item.ext).join(', ')}`); return; }
                  const id = `file-${window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`}`;
                  setFileOperationError(null);
                  socket?.emit('file-create', { roomId, file: { id, name: name.trim(), language: match.value } });
                }}
              >+ New</button>
            </div>
            <ul className="space-y-1">
              {files.map((file) => (
                <li key={file.id} className="group flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => { setActiveFileId(file.id); setFileOperationError(null); }}
                    className={`min-w-0 flex-1 truncate rounded px-2 py-1.5 text-left font-mono text-xs ${file.id === activeFileId ? 'bg-accent/10 text-accent' : 'text-soft hover:bg-white/5 hover:text-fg'}`}
                    title={file.name}
                  >{file.name}</button>
                  <button
                    type="button"
                    className="rounded px-1.5 py-1 text-[10px] text-muted opacity-0 hover:bg-white/5 hover:text-fg focus:opacity-100 group-hover:opacity-100"
                    title={`Rename ${file.name}`}
                    onClick={() => {
                      const name = window.prompt('Rename file (include extension)', file.name);
                      if (!name?.trim() || name.trim() === file.name) return;
                      setFileOperationError(null);
                      socket?.emit('file-rename', { roomId, fileId: file.id, name: name.trim() });
                    }}
                  >Rename</button>
                  {file.id !== 'main' && <button
                    type="button"
                    className="rounded px-1.5 py-1 text-[10px] text-muted opacity-0 hover:bg-red-500/10 hover:text-red-300 focus:opacity-100 group-hover:opacity-100"
                    title={`Delete ${file.name}`}
                    onClick={() => {
                      if (!window.confirm(`Delete ${file.name} for everyone in this room?`)) return;
                      setFileOperationError(null);
                      socket?.emit('file-delete', { roomId, fileId: file.id });
                    }}
                  >×</button>}
                </li>
              ))}
            </ul>
            {fileOperationError && <p role="alert" className="mt-2 text-xs text-red-300">{fileOperationError}</p>}
          </section>

          <section>
            <h2 className={`${eyebrow} mb-2 px-1`}>In this room ({users.length})</h2>
            {users.length === 0 ? (
              <p className="px-1 py-2 text-sm text-muted">{connected ? 'No one here yet.' : 'Connecting…'}</p>
            ) : (
              <ul className="space-y-1.5">
                {people.map((u) => (
                  <li key={u.id} className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5">
                    <span
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-canvas"
                      style={{ backgroundColor: u.color }}
                    >
                      {initials(u.name)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">{u.name}</span>
                    {u.id === socket?.id && <span className={eyebrow}>You</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </aside>

      {/* Main */}
      <main className="flex min-w-0 flex-1 flex-col md:py-2 md:pr-2">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-line bg-surface md:rounded-lg md:border">
          <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-line px-2 sm:px-3">
            <div className="flex min-w-0 items-center gap-2">
              <button
                onClick={() => setSidebarOpen(true)}
                aria-label="Show people in this room"
                className={`${btnGhost} px-1.5 md:hidden`}
              >
                <Icon name="menu" className="h-5 w-5" />
              </button>
              <span className="flex min-w-0 items-center gap-2 rounded border border-line bg-raised px-2.5 py-1">
                <span className="font-mono text-[10px] font-semibold uppercase text-accent">{ext}</span>
                <span className="truncate text-sm">{fileName}</span>
              </span>
              <span
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-lavender/25 bg-lavender/10 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-lavender"
                title="Nothing is stored. The room is deleted 2 minutes after everyone leaves — use Save to keep a copy."
              >
                <Icon name="clock" className="h-3 w-3" />
                <span className="hidden sm:inline">Temporary</span>
                <span className="sr-only sm:hidden">Temporary room</span>
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              <select
                aria-label="Language"
                value={language}
                onChange={(e) => {
                  const nextLanguage = e.target.value;
                  const nextExt = LANGUAGES.find((item) => item.value === nextLanguage)?.ext || nextLanguage;
                  const dot = fileName.lastIndexOf('.');
                  const nextName = dot > 0 ? `${fileName.slice(0, dot)}.${nextExt}` : `${fileName}.${nextExt}`;
                  socket?.emit('file-language', { roomId, fileId: activeFileId, language: nextLanguage });
                  if (nextName !== fileName) socket?.emit('file-rename', { roomId, fileId: activeFileId, name: nextName });
                }}
                className={`h-8 cursor-pointer rounded border border-line-strong bg-raised px-2 text-sm text-fg ${focus}`}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>

              <button
                onClick={() => setIsChatOpen((o) => !o)}
                aria-pressed={isChatOpen}
                className={isChatOpen ? `${btn} border border-accent/40 bg-accent/10 text-accent` : btnGhost}
              >
                <Icon name="sparkles" />
                <span className="hidden lg:inline">AI assistant</span>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept={LANGUAGES.map((l) => '.' + l.ext).join(',')}
                onChange={uploadFile}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                title="Open a file from your computer"
                className={btnSecondary}
              >
                <Icon name="upload" />
                <span className="hidden sm:inline">Open</span>
              </button>
              <button onClick={downloadFile} title={`Download ${fileName}`} className={btnPrimary}>
                <Icon name="save" />
                <span className="hidden sm:inline">Save</span>
              </button>
            </div>
          </header>

          {showTempNotice && (
            <div className="flex shrink-0 items-center gap-2 border-b border-line bg-lavender/[0.06] px-3 py-1.5 text-xs text-soft" role="note">
              <Icon name="clock" className="h-3.5 w-3.5 shrink-0 text-lavender" />
              <p className="min-w-0 flex-1">
                <span className="font-medium text-fg">Nothing here is saved.</span>{' '}
                This room is deleted 2 minutes after everyone leaves — use{' '}
                <button onClick={downloadFile} className={`rounded font-medium text-accent underline-offset-2 hover:underline ${focus}`}>
                  Save
                </button>{' '}
                to download your code.
              </p>
              <button
                onClick={dismissTempNotice}
                aria-label="Dismiss"
                className={`shrink-0 rounded p-1 text-muted hover:bg-white/5 hover:text-fg ${focus}`}
              >
                <Icon name="x" className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Editor + AI chat */}
          <div className="relative flex-1 overflow-hidden">
            <div className="absolute inset-0">
              {socket && profile && (
                <Editor
                  key={activeFileId}
                  roomId={roomId}
                  fileId={activeFileId}
                  socket={socket}
                  currentUser={profile}
                  language={language}
                  editorRef={editorRef}
                  monacoRef={monacoRef}
                  onCodeChange={setCurrentCode}
                  onCursorChange={setCursor}
                />
              )}
            </div>

            {isChatOpen && (
              <div
                className="absolute inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300"
                onClick={() => setIsChatOpen(false)}
              />
            )}

            <div
              className={`absolute right-0 top-0 z-50 h-full w-80 max-w-full transform border-l border-line-strong bg-surface shadow-[0_12px_32px_-4px_rgba(0,0,0,0.6)] transition-transform duration-300 ease-out ${
                isChatOpen ? 'translate-x-0' : 'translate-x-full'
              }`}
            >
              <AIChat
                editorRef={editorRef}
                monacoRef={monacoRef}
                currentCode={currentCode}
                language={language}
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
              />
            </div>
          </div>

          <footer className="flex h-7 shrink-0 items-center justify-between gap-4 border-t border-line px-3 font-mono text-[11px] text-muted">
            <span className="flex items-center gap-4">
              <span>{languageLabel}</span>
              <span className="hidden sm:inline">UTF-8</span>
              <span className="hidden sm:inline">Spaces: 2</span>
              <span>Ln {cursor.lineNumber}, Col {cursor.column}</span>
            </span>
            <span className="flex items-center gap-1.5 truncate">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${connected ? 'bg-accent' : 'animate-pulse bg-muted'}`} />
              {!connected ? 'Connecting…' : others === 0 ? 'Only you here' : `${others} other${others === 1 ? '' : 's'} here`}
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}