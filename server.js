require('dotenv').config();

const express = require('express');
const next = require('next');
const { createServer } = require('http');
const { Server } = require('socket.io');
const Y = require('yjs');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT, 10) || 3000;
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();
const devLog = dev ? console.log : () => {};

const ROOM_GRACE_MS = 2 * 60 * 1000;
const MAX_ROOMS = Number(process.env.MAX_ROOMS) || 500;
const MAX_USERS_PER_ROOM = Number(process.env.MAX_USERS_PER_ROOM) || 20;
const MAX_DOC_CHARS = 1_000_000;
const MAX_FILES_PER_ROOM = 100;
const MAX_FILE_NAME_LENGTH = 100;
const EVENTS_PER_SECOND = 60;
const EVENT_BURST = 300;
const MAX_DROPPED_EVENTS = 500;
const rooms = new Map();

const DEFAULT_FILE = { id: 'main', name: 'index.js', language: 'javascript' };
const getRoom = (roomId) => {
  let room = rooms.get(roomId);
  if (!room) {
    room = {
      docs: new Map([[DEFAULT_FILE.id, new Y.Doc()]]),
      files: [{ ...DEFAULT_FILE }],
      users: new Map(),
      expiry: null,
    };
    rooms.set(roomId, room);
  }
  return room;
};
const getFile = (room, fileId) => room.files.find((file) => file.id === fileId);
const getDoc = (room, fileId) => room.docs.get(fileId);
const publicFiles = (room) => room.files.map((file) => ({ ...file }));
const scheduleRoomDeletion = (roomId) => {
  const room = rooms.get(roomId);
  if (!room || room.users.size > 0 || room.expiry) return;
  room.expiry = setTimeout(() => {
    for (const doc of room.docs.values()) doc.destroy();
    rooms.delete(roomId);
    devLog(`🗑️ Room ${roomId} expired`);
  }, ROOM_GRACE_MS);
};
const deleteRoom = (roomId) => {
  const room = rooms.get(roomId);
  if (!room) return;
  clearTimeout(room.expiry);
  for (const doc of room.docs.values()) doc.destroy();
  rooms.delete(roomId);
};
const isValidLanguage = (language) => typeof language === 'string' && /^[a-z+#]{1,20}$/.test(language);
const isValidFileName = (name) => typeof name === 'string' && name.trim().length > 0 && name.trim().length <= MAX_FILE_NAME_LENGTH && !/[\\/\0]/.test(name) && !/[. ]$/.test(name);
const isValidRoomId = (roomId) => typeof roomId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(roomId);
const isValidFileId = (fileId) => typeof fileId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(fileId);
const cleanUser = (user) => {
  const name = typeof user?.name === 'string' ? user.name.trim().slice(0, 24) : '';
  const color = typeof user?.color === 'string' && /^(#[0-9a-fA-F]{6}|hsl\(\d{1,3}, \d{1,3}%, \d{1,3}%\))$/.test(user.color)
    ? user.color : 'hsl(160, 55%, 63%)';
  return name ? { name, color } : null;
};
const isValidPosition = (p) => Number.isInteger(p?.lineNumber) && p.lineNumber > 0 && Number.isInteger(p?.column) && p.column > 0;
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
const isAllowedOrigin = (origin, host) => {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  try { return new URL(origin).host === host; } catch { return false; }
};
const CHAT_LIMIT = Number(process.env.CHAT_RATE_LIMIT) || 15;
const CHAT_WINDOW_MS = 5 * 60 * 1000;
const chatHits = new Map();
const chatRateLimit = (req, res, nextMiddleware) => {
  const now = Date.now();
  const key = req.ip;
  const entry = chatHits.get(key);
  if (!entry || now - entry.start > CHAT_WINDOW_MS) {
    chatHits.set(key, { start: now, count: 1 });
    return nextMiddleware();
  }
  if (entry.count >= CHAT_LIMIT) {
    res.set('Retry-After', String(Math.ceil((entry.start + CHAT_WINDOW_MS - now) / 1000)));
    return res.status(429).type('text/plain').send('Too many AI requests. Please wait a few minutes and try again.');
  }
  entry.count++;
  nextMiddleware();
};

app.prepare().then(() => {
  const expressApp = express();
  if (process.env.TRUST_PROXY) expressApp.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
  const server = createServer(expressApp);
  const io = new Server(server, {
    cors: allowedOrigins.length ? { origin: allowedOrigins, methods: ['GET', 'POST'] } : undefined,
    allowRequest: (req, callback) => callback(null, isAllowedOrigin(req.headers.origin, req.headers.host)),
  });

  io.on('connection', (socket) => {
    devLog('🔌 Client connected:', socket.id);
    let tokens = EVENT_BURST;
    let lastRefill = Date.now();
    let dropped = 0;
    socket.use((packet, nextPacket) => {
      const now = Date.now();
      tokens = Math.min(EVENT_BURST, tokens + ((now - lastRefill) / 1000) * EVENTS_PER_SECOND);
      lastRefill = now;
      if (tokens >= 1) { tokens -= 1; return nextPacket(); }
      if (++dropped > MAX_DROPPED_EVENTS) {
        console.warn('Disconnecting flooding client', socket.id);
        socket.disconnect(true);
      }
    });

    const inRoom = (roomId) => isValidRoomId(roomId) && socket.rooms.has(roomId) && rooms.has(roomId);
    const rejectJoin = (message) => socket.emit('room-error', { message });
    const sendFiles = (roomId) => {
      const room = rooms.get(roomId);
      if (room) socket.emit('project-files', { files: publicFiles(room) });
    };

    socket.on('join-room', ({ roomId, user } = {}) => {
      const profile = cleanUser(user);
      if (!isValidRoomId(roomId) || !profile) return;
      if ([...socket.rooms].some((r) => r !== socket.id && r !== roomId)) return;
      const existing = rooms.get(roomId);
      if (!existing && rooms.size >= MAX_ROOMS) return rejectJoin('The server is busy right now. Please try again in a few minutes.');
      if (existing && existing.users.size >= MAX_USERS_PER_ROOM && !existing.users.has(socket.id)) return rejectJoin(`This room is full (max ${MAX_USERS_PER_ROOM} people).`);

      socket.join(roomId);
      const room = getRoom(roomId);
      clearTimeout(room.expiry);
      room.expiry = null;
      room.users.set(socket.id, { id: socket.id, ...profile });
      io.to(roomId).emit('users-update', Array.from(room.users.values()));
      socket.emit('project-files', { files: publicFiles(room) });
      devLog(`👤 ${profile.name} joined room: ${roomId}`);
    });

    socket.on('project-files-request', ({ roomId } = {}) => {
      if (inRoom(roomId)) sendFiles(roomId);
    });

    socket.on('yjs-request-state', ({ roomId, fileId = 'main' } = {}) => {
      if (!inRoom(roomId) || !isValidFileId(fileId)) return;
      const room = rooms.get(roomId);
      const doc = getDoc(room, fileId);
      if (!doc || !getFile(room, fileId)) return;
      socket.emit('yjs-sync', { roomId, fileId, update: Array.from(Y.encodeStateAsUpdate(doc)) });
    });

    socket.on('yjs-sync', ({ roomId, fileId = 'main', update } = {}) => {
      if (!inRoom(roomId) || !isValidFileId(fileId) || !Array.isArray(update) || update.length > 2_000_000) return;
      const room = rooms.get(roomId);
      const doc = getDoc(room, fileId);
      if (!doc || !getFile(room, fileId)) return;
      try { Y.applyUpdate(doc, new Uint8Array(update)); }
      catch (err) { console.warn('Rejected bad Yjs update from', socket.id); return; }
      if (doc.getText('monaco').length > MAX_DOC_CHARS) {
        io.to(roomId).emit('room-error', { message: 'A file exceeded 1 million characters and the room was closed.' });
        io.in(roomId).socketsLeave(roomId);
        deleteRoom(roomId);
        return;
      }
      socket.to(roomId).emit('yjs-sync', { roomId, fileId, update });
    });

    socket.on('file-create', ({ roomId, file } = {}) => {
      if (!inRoom(roomId) || !file || !isValidFileId(file.id) || !isValidFileName(file.name) || !isValidLanguage(file.language)) return;
      const room = rooms.get(roomId);
      if (room.files.length >= MAX_FILES_PER_ROOM) return socket.emit('file-operation-error', { message: `A room can contain at most ${MAX_FILES_PER_ROOM} files.` });
      if (room.files.some((item) => item.id === file.id || item.name.toLowerCase() === file.name.trim().toLowerCase())) return socket.emit('file-operation-error', { message: 'A file with that ID or name already exists.' });
      const nextFile = { id: file.id, name: file.name.trim(), language: file.language };
      room.files.push(nextFile);
      room.docs.set(nextFile.id, new Y.Doc());
      io.to(roomId).emit('project-files', { files: publicFiles(room), action: 'create', fileId: nextFile.id, createdBy: socket.id });
    });

    socket.on('file-rename', ({ roomId, fileId, name } = {}) => {
      if (!inRoom(roomId) || !isValidFileId(fileId) || !isValidFileName(name)) return;
      const room = rooms.get(roomId);
      const file = getFile(room, fileId);
      if (!file) return;
      if (room.files.some((item) => item.id !== fileId && item.name.toLowerCase() === name.trim().toLowerCase())) return socket.emit('file-operation-error', { message: 'A file with that name already exists.' });
      file.name = name.trim();
      io.to(roomId).emit('project-files', { files: publicFiles(room), action: 'rename', fileId });
    });

    socket.on('file-language', ({ roomId, fileId, language } = {}) => {
      if (!inRoom(roomId) || !isValidFileId(fileId) || !isValidLanguage(language)) return;
      const room = rooms.get(roomId);
      const file = getFile(room, fileId);
      if (!file) return;
      file.language = language;
      io.to(roomId).emit('project-files', { files: publicFiles(room), action: 'language', fileId });
    });

    socket.on('file-delete', ({ roomId, fileId } = {}) => {
      if (!inRoom(roomId) || !isValidFileId(fileId) || fileId === DEFAULT_FILE.id) return;
      const room = rooms.get(roomId);
      if (!getFile(room, fileId)) return;
      const doc = room.docs.get(fileId);
      doc?.destroy();
      room.docs.delete(fileId);
      room.files = room.files.filter((file) => file.id !== fileId);
      io.to(roomId).emit('project-files', { files: publicFiles(room), action: 'delete', fileId });
    });

    socket.on('yjs-awareness', ({ roomId, fileId = 'main', update } = {}) => {
      if (!inRoom(roomId) || !isValidFileId(fileId) || !getDoc(rooms.get(roomId), fileId)) return;
      socket.to(roomId).emit('yjs-awareness', { fileId, update: { clientID: socket.id, state: update?.state ?? null } });
    });

    socket.on('cursor-position', ({ roomId, fileId = 'main', position } = {}) => {
      if (!inRoom(roomId) || !isValidFileId(fileId) || !getFile(rooms.get(roomId), fileId) || !isValidPosition(position)) return;
      const user = rooms.get(roomId).users.get(socket.id);
      if (!user) return;
      socket.to(roomId).emit('remote-cursor', { fileId, userId: socket.id, position: { lineNumber: position.lineNumber, column: position.column }, user: { name: user.name, color: user.color } });
    });

    // Backward-compatible metadata event: maps to the default file only.
    socket.on('file-meta', ({ roomId, meta } = {}) => {
      if (!inRoom(roomId) || !meta || !isValidLanguage(meta.language) || !isValidFileName(meta.baseName)) return;
      const room = rooms.get(roomId);
      const file = getFile(room, DEFAULT_FILE.id);
      file.language = meta.language;
      file.name = `${meta.baseName}.${({ javascript: 'js', typescript: 'ts', python: 'py', cpp: 'cpp' })[meta.language] || meta.language}`;
      io.to(roomId).emit('project-files', { files: publicFiles(room), action: 'legacy-meta', fileId: DEFAULT_FILE.id });
    });

    socket.on('disconnect', () => {
      devLog('🔌 Client disconnected:', socket.id);
      for (const [roomId, room] of rooms) {
        if (!room.users.delete(socket.id)) continue;
        io.to(roomId).emit('users-update', Array.from(room.users.values()));
        scheduleRoomDeletion(roomId);
      }
    });
  });

  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of chatHits) if (now - entry.start > CHAT_WINDOW_MS) chatHits.delete(key);
  }, CHAT_WINDOW_MS).unref();
  expressApp.post('/api/chat', chatRateLimit);
  expressApp.get('/healthz', (req, res) => res.json({ ok: true }));
  expressApp.all('*', (req, res) => handle(req, res));
  server.listen(port, (err) => {
    if (err) throw err;
    console.log(`🚀 Server ready on http://localhost:${port}`);
    console.log('🎨 CodeSync Collaborative Editor');
  });
  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received, shutting down`);
    io.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
});
