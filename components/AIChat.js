import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';

export default function AIChat({ editorRef, monacoRef, currentCode, language, isOpen, onClose }) {
  const [messages, setMessages] = useState([
    {
      role: 'model',
      content: '👋 Hi! I\'m your AI coding assistant. I can help you write code, debug issues, explain concepts, and more. Ask me anything!'
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = { role: 'user', content: input.trim() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          currentEditorCode: currentCode,
          language: language
        })
      });

      if (!response.ok) {
        const reason = response.status === 500 ? '' : (await response.text()).slice(0, 200);
        throw new Error(reason || 'Failed to get AI response');
      }

      // Handle streaming response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let aiResponse = '';

      // Create placeholder message
      setMessages(prev => [...prev, { role: 'model', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        aiResponse += chunk;

        // Update the last message with accumulated response
        setMessages(prev => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1] = {
            role: 'model',
            content: aiResponse
          };
          return newMessages;
        });
      }

    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [
        ...prev,
        {
          role: 'model',
          content: error.message && error.message !== 'Failed to get AI response' && !(error instanceof TypeError)
            ? `❌ ${error.message}`
            : '❌ Sorry, I encountered an error. Please try again.'
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const insertCodeAtCursor = (code) => {
    if (!editorRef.current || !monacoRef.current) {
      console.error('Editor not ready');
      return;
    }

    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const position = editor.getPosition();
    const range = new monaco.Range(
      position.lineNumber,
      position.column,
      position.lineNumber,
      position.column
    );

    // Insert code at cursor
    editor.executeEdits('ai-insert', [
      {
        range: range,
        text: code,
        forceMoveMarkers: true
      }
    ]);

    // Move cursor to end of inserted text
    const lines = code.split('\n');
    const lastLine = lines[lines.length - 1];
    const newPosition = {
      lineNumber: position.lineNumber + lines.length - 1,
      column: lines.length === 1 ? position.column + lastLine.length : lastLine.length + 1
    };
    editor.setPosition(newPosition);
    editor.focus();

    // Show success notification
    setMessages(prev => [
      ...prev,
      {
        role: 'model',
        content: '✅ Code inserted at cursor position!'
      }
    ]);
  };

  const clearChat = () => {
    setMessages([
      {
        role: 'model',
        content: '👋 Chat cleared! How can I help you?'
      }
    ]);
  };

  if (!isOpen) return null;

  return (
    <div className="flex h-full w-80 flex-col bg-surface">
      {/* Header */}
      <div className="flex h-12 items-center justify-between border-b border-line px-3">
        <div className="flex items-center space-x-2.5">
          <div className="grid h-7 w-7 place-items-center rounded border border-accent/25 bg-accent/10 text-accent">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-fg">AI Assistant</h3>
            <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted">Powered by Gemini</p>
          </div>
        </div>
        <div className="flex items-center space-x-1">
          <button
            onClick={clearChat}
            className="rounded p-1.5 text-muted transition-colors hover:bg-white/5 hover:text-fg"
            title="Clear chat"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
          <button
            onClick={onClose}
            className="rounded p-1.5 text-muted transition-colors hover:bg-white/5 hover:text-fg"
            title="Close chat"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-lg border p-3 ${
                msg.role === 'user'
                  ? 'border-accent/25 bg-accent/10 text-fg'
                  : 'border-line bg-raised text-fg'
              }`}
            >
              {msg.role === 'user' ? (
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              ) : (
                <div className="text-sm prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code({ node, inline, className, children, ...props }) {
                        const match = /language-(\w+)/.exec(className || '');
                        const codeString = String(children).replace(/\n$/, '');
                        
                        return !inline && match ? (
                          <div className="relative group my-2">
                            <button
                              onClick={() => insertCodeAtCursor(codeString)}
                              className="absolute top-2 right-2 px-2 py-1 bg-accent hover:bg-accent-hover text-on-accent text-xs font-semibold rounded opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity flex items-center space-x-1 z-10"
                              title="Insert code at cursor"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                              </svg>
                              <span>Insert</span>
                            </button>
                            <SyntaxHighlighter
                              style={vscDarkPlus}
                              language={match[1]}
                              PreTag="div"
                              customStyle={{
                                margin: 0,
                                background: '#0D0E0E',
                                border: '1px solid rgb(255 255 255 / 0.08)',
                                borderRadius: '0.25rem',
                                fontSize: '0.813rem',
                                padding: '1rem'
                              }}
                              {...props}
                            >
                              {codeString}
                            </SyntaxHighlighter>
                          </div>
                        ) : (
                          <code className="rounded border border-line bg-canvas px-1.5 py-0.5 font-mono text-xs" {...props}>
                            {children}
                          </code>
                        );
                      },
                      p({ children }) {
                        return <p className="mb-2 last:mb-0">{children}</p>;
                      },
                      ul({ children }) {
                        return <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>;
                      },
                      ol({ children }) {
                        return <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>;
                      },
                      li({ children }) {
                        return <li className="text-soft">{children}</li>;
                      },
                      strong({ children }) {
                        return <strong className="font-semibold text-fg">{children}</strong>;
                      }
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="rounded-lg border border-line bg-raised p-3">
              <div className="flex space-x-2">
                <div className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-line p-3">
        <div className="flex space-x-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            maxLength={4000}
            placeholder="Ask me anything about your code..."
            className="flex-1 resize-none rounded border border-line bg-canvas p-2 text-sm text-fg placeholder-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            rows="2"
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="px-3 bg-accent hover:bg-accent-hover disabled:bg-raised disabled:text-muted disabled:cursor-not-allowed text-on-accent rounded transition-colors flex items-center justify-center"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
        <p className="mt-2 font-mono text-[10px] text-muted">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}