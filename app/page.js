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
  user: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  database: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4',
  eyeOff: 'M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21',
  download: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4',
  shield: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  info: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
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
          <span className="text-accent">Live</span>
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

const LIFECYCLE = [
  { step: '01', title: 'Open a room', text: 'You get a link. No sign-up, no email.' },
  { step: '02', title: 'Code together', text: 'Edits sync live and are held only in memory.' },
  { step: '03', title: 'Everyone leaves', text: 'A 2-minute grace period covers refreshes and dropped Wi-Fi.' },
  { step: '04', title: 'It’s gone', text: 'The room and its code are deleted. No copies, no history.' },
];

const PRIVACY = [
  { icon: 'user', title: 'No accounts', text: 'Just pick a display name. It stays in your browser.' },
  { icon: 'database', title: 'No database', text: 'Your code is never written to disk. There’s nothing to breach.' },
  { icon: 'eyeOff', title: 'No tracking', text: 'No analytics, no ad scripts, no profiles of what you write.' },
  { icon: 'download', title: 'Your code, your copy', text: 'Save downloads the file straight to your machine.' },
];

const FINE_PRINT = [
  'The AI assistant is optional. When you use it, your question and the current code are sent to Google Gemini.',
  'The room link is the key. Anyone who has it can join and edit, so share it like a password.',
  'While a room is open its code sits in server memory so it can sync — it isn’t end-to-end encrypted.',
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
          <a href="#privacy" className={`${btn} hidden h-8 px-3 font-medium text-muted hover:bg-white/5 hover:text-fg sm:inline-flex`}>
            Privacy
          </a>
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
            Open a room, share the link, and edit side by side. No accounts, nothing stored — when everyone leaves, the room disappears.
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
          <ul className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-muted">
            {['No sign-up', 'Nothing stored', 'Gone when you leave'].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <Icon name="check" className="h-4 w-4 text-accent" />
                {t}
              </li>
            ))}
          </ul>
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

        <section id="privacy" className="mx-auto max-w-6xl scroll-mt-6 px-6 pb-24">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-lavender">Private by design</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">
            We can’t leak what we never keep.
          </h2>
          <p className="mt-3 max-w-[60ch] text-soft">
            CodeSync has no accounts and no database. Your code exists only while your room is open — then it’s gone for good.
          </p>

          <ol className="mt-10 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
            {LIFECYCLE.map((s, i) => {
              const last = i === LIFECYCLE.length - 1;
              return (
                <li key={s.step} className={`p-5 ${last ? 'bg-lavender/[0.06]' : 'bg-surface'}`}>
                  <span className={`font-mono text-[11px] font-semibold ${last ? 'text-lavender' : 'text-accent'}`}>{s.step}</span>
                  <p className="mt-2 font-medium">{s.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{s.text}</p>
                </li>
              );
            })}
          </ol>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr_minmax(0,1.1fr)]">
            <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
              {PRIVACY.map((p) => (
                <div key={p.title} className="flex gap-4 rounded-lg border border-line bg-surface p-5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded border border-line bg-raised text-accent">
                    <Icon name={p.icon} />
                  </span>
                  <div>
                    <h3 className="font-medium">{p.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-soft">{p.text}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-line-strong bg-raised p-5">
              <p className="flex items-center gap-2 font-medium">
                <Icon name="info" className="h-4 w-4 text-lavender" />
                The fine print, in plain words
              </p>
              <ul className="mt-3 space-y-3">
                {FINE_PRINT.map((t) => (
                  <li key={t} className="flex gap-2.5 text-sm leading-relaxed text-soft">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
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
                <p className="text-sm text-muted">Open a room and send the link. When you’re done, it’s gone.</p>
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
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <Logo />
          <p className="flex items-center gap-2">
            <Icon name="shield" className="h-4 w-4 text-accent" />
            No accounts · No database · No tracking
          </p>
          <a href={GITHUB_URL} className={`rounded hover:text-fg ${focus}`}>Source on GitHub</a>
        </div>
      </footer>
    </div>
  );
}