'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { nanoid } from 'nanoid';

const GITHUB_URL = 'https://github.com/keshavvsonii01/Codesync/'; // TODO: your repo link

const ICONS = {
  terminal: 'M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  plus: 'M12 4v16m8-8H4',
  arrow: 'M14 5l7 7m0 0l-7 7m7-7H3',
  check: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  code: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4',
  chat: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z',
  pencil: 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z',
};

const Icon = ({ name, className = 'h-4 w-4' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={ICONS[name]} />
  </svg>
);

const focus =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas';
const btn = `inline-flex items-center justify-center gap-2 rounded text-sm font-semibold transition-colors ${focus}`;
const btnPrimary = `${btn} bg-accent text-on-accent hover:bg-accent-hover`;
const btnSecondary = `${btn} border border-line-strong bg-raised text-fg hover:bg-overlay disabled:cursor-not-allowed disabled:text-muted disabled:hover:bg-raised`;

const Logo = () => (
  <a href="/" className={`flex items-center gap-2 rounded font-semibold tracking-tight ${focus}`}>
    <span className="grid h-6 w-6 place-items-center rounded bg-accent text-on-accent">
      <Icon name="terminal" className="h-3.5 w-3.5" />
    </span>
    CodeSync
  </a>
);

const A_TEXT = 'const need = target - nums[i];';
const B_TEXT = 'if (seen.has(need)) return [seen.get(need), i];';

// Accepts a bare room ID or a pasted room link.
const parseRoomId = (raw) => {
  const clean = raw.trim().split(/[?#]/)[0];
  return clean.split('/').filter(Boolean).pop() || '';
};

function Caret({ tone, name }) {
  const bg = tone === 'accent' ? 'bg-accent text-on-accent' : 'bg-lavender text-canvas';
  return (
    <span className={`relative inline-block h-[1.2em] w-[2px] translate-y-[3px] ${bg}`}>
      <span className={`absolute bottom-full left-0 mb-0.5 whitespace-nowrap rounded-sm px-1.5 font-mono text-[10px] font-semibold leading-4 ${bg}`}>
        {name}
      </span>
    </span>
  );
}

const K = ({ children }) => <span className="text-lavender">{children}</span>;
const F = ({ children }) => <span className="text-accent">{children}</span>;

function LiveEditor({ roomId }) {
  const [t, setT] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setT(999);
      return;
    }
    const id = setInterval(() => setT((v) => (v > 120 ? 0 : v + 1)), 90);
    return () => clearInterval(id);
  }, []);

  const a = A_TEXT.slice(0, t);
  const b = B_TEXT.slice(0, Math.max(0, t - 12));
  const aDone = a.length === A_TEXT.length;
  const bDone = b.length === B_TEXT.length;

  const lines = [
    <><K>function</K> <F>twoSum</F>(nums, target) {'{'}</>,
    <>{'  '}<K>const</K> seen = <K>new</K> Map();</>,
    <>{'  '}<K>for</K> (<K>let</K> i = 0; i &lt; nums.length; i++) {'{'}</>,
    <>
      {'    '}
      {a}
      {!aDone && <Caret tone="lavender" name="Aarav" />}
    </>,
    <>
      {'    '}
      {b}
      {!bDone && <Caret tone="accent" name="Mira" />}
    </>,
    <>{'    '}seen.<F>set</F>(nums[i], i);</>,
    <>{'  }'}</>,
    <>{'  '}<K>return</K> [];</>,
    <>{'}'}</>,
  ];

  return (
    <div
      className="overflow-hidden rounded-lg border border-line-strong bg-surface text-left shadow-[0_12px_32px_-4px_rgba(0,0,0,0.6)]"
      role="img"
      aria-label="Two people editing the same function at the same time"
    >
      <div className="flex h-11 items-center justify-between border-b border-line px-4">
        <span className="rounded border border-line bg-raised px-2 py-0.5 font-mono text-[11px] text-soft"># {roomId}</span>
        <span className="flex items-center gap-2 font-mono text-[11px] text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          2 in room
        </span>
      </div>
      <div className="overflow-x-auto px-4 py-5 font-mono text-[13px] leading-7">
        {lines.map((line, i) => (
          <div key={i} className="flex">
            <span className="w-8 shrink-0 select-none pr-4 text-right text-muted/50">{i + 1}</span>
            <span className="whitespace-pre text-fg">{line}</span>
          </div>
        ))}
      </div>
      <div className="flex h-8 items-center justify-between border-t border-line px-4 font-mono text-[11px] text-muted">
        <span className="flex items-center gap-3">
          <span className="text-accent">Saved</span>
          <span>JavaScript</span>
        </span>
        <span>Ln 4, Col {a.length + 5}</span>
      </div>
    </div>
  );
}

const USES = [
  {
    icon: 'code',
    title: 'Pair on a problem',
    text: 'Work through a bug or a LeetCode question in the same file, and see exactly where your partner is looking.',
  },
  {
    icon: 'chat',
    title: 'Run a mock interview',
    text: 'The interviewer sends a link, you start typing. Nothing to install, and no account for either of you.',
  },
  {
    icon: 'pencil',
    title: 'Teach by editing',
    text: 'Fix a student’s code on their screen while they watch it change, instead of describing the fix.',
  },
];

export default function Home() {
  const router = useRouter();
  const [roomId, setRoomId] = useState('');
  const [previewId, setPreviewId] = useState('k3x9Qm2LpA');

  // Random preview name after mount, so server and client HTML match.
  useEffect(() => setPreviewId(nanoid(10)), []);

  const createNewRoom = () => {
    router.push(`/editor/${nanoid(10)}`);
  };

  const joinRoom = (e) => {
    e.preventDefault();
    const id = parseRoomId(roomId);
    if (id) router.push(`/editor/${id}`);
  };

  // globals.css locks body scrolling for the editor, so this page scrolls itself.
  return (
    <div className="h-screen overflow-y-auto bg-canvas bg-[radial-gradient(ellipse_60%_420px_at_50%_0%,rgb(var(--accent)/0.07),transparent)] text-fg">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Logo />
        <nav className="flex items-center gap-2">
          <a href={GITHUB_URL} className={`${btn} h-8 px-3 font-medium text-muted hover:bg-white/5 hover:text-fg`}>
            GitHub
          </a>
          <button onClick={createNewRoom} className={`${btnPrimary} h-8 px-3`}>
            Start a room
            <Icon name="arrow" className="h-3.5 w-3.5" />
          </button>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-3xl px-6 pb-16 pt-16 text-center sm:pt-24">
          <span className="inline-flex items-center gap-2 rounded border border-accent/25 bg-accent/[0.08] px-2.5 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Real-time collaborative editor
          </span>
          <h1 className="mt-6 text-4xl font-semibold leading-[1.1] tracking-[-0.03em] sm:text-5xl">
            Write code together, in the same file.
          </h1>
          <p className="mx-auto mt-5 max-w-[52ch] text-base leading-relaxed text-soft sm:text-lg">
            Open a room, share the link, and edit side by side. Everyone’s changes merge as they type, and the room can be saved at any time.
          </p>

          <form
            onSubmit={joinRoom}
            className="mx-auto mt-10 flex max-w-xl flex-col gap-1.5 rounded-lg border border-line-strong bg-surface p-1.5 sm:flex-row"
          >
            <button type="button" onClick={createNewRoom} className={`${btnPrimary} h-10 shrink-0 px-4`}>
              <Icon name="plus" />
              Start a new room
            </button>
            <label htmlFor="roomId" className="sr-only">Room ID or link</label>
            <input
              id="roomId"
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="Paste a room ID or link"
              autoComplete="off"
              spellCheck={false}
              className="h-10 min-w-0 flex-1 rounded border border-line bg-canvas px-3 font-mono text-sm placeholder:text-muted/70 focus-visible:border-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
            />
            <button type="submit" disabled={!parseRoomId(roomId)} className={`${btnSecondary} h-10 px-4`}>
              Join
            </button>
          </form>
          <p className="mt-4 flex items-center justify-center gap-2 text-sm text-muted">
            <Icon name="check" className="h-4 w-4 text-accent" />
            No sign-up. Anyone with the link can edit.
          </p>
        </section>

        <section className="mx-auto max-w-4xl px-6 pb-24">
          <LiveEditor roomId={previewId} />
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-20">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-accent">Made for working together</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">
            Built around the way people actually solve things.
          </h2>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {USES.map((u) => (
              <div key={u.title} className="rounded-lg border border-line bg-surface p-6">
                <span className="grid h-9 w-9 place-items-center rounded border border-line bg-raised text-accent">
                  <Icon name={u.icon} />
                </span>
                <h3 className="mt-5 text-lg font-medium tracking-[-0.015em]">{u.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-soft">{u.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-24">
          <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded border border-line bg-raised text-accent">
                <Icon name="terminal" />
              </span>
              <div>
                <p className="font-medium">Ready when you are</p>
                <p className="text-sm text-muted">Open a room and send the link. That’s the whole setup.</p>
              </div>
            </div>
            <button onClick={createNewRoom} className={`${btnPrimary} h-10 px-4`}>
              Start a new room
              <Icon name="arrow" className="h-3.5 w-3.5" />
            </button>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 text-sm text-muted">
          <Logo />
          <a href={GITHUB_URL} className={`rounded hover:text-fg ${focus}`}>Source on GitHub</a>
        </div>
      </footer>
    </div>
  );
}