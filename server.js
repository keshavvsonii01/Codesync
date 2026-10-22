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

// Room IDs work as access keys and names are personal, so activity is only logged in dev.
const devLog = dev ? console.log : () => {};

// Rooms live only in memory and are deleted this long after the last person leaves.
const ROOM_GRACE_MS = 2 * 60 * 1000;

const MAX_ROOMS = Number(process.env.MAX_ROOMS) || 500;
const MAX_USERS_PER_ROOM = Number(process.env.MAX_USERS_PER_ROOM) || 20;
const MAX_DOC_CHARS = 1_000_000;

// Per-socket token bucket; fast typing is ~30 events/s (edit + cursor + presence).
const EVENTS_PER_SECOND = 60;
const EVENT_BURST = 300;
const MAX_DROPPED_EVENTS = 500;

// roomId -> { doc: Y.Doc, users: Map<socketId, user>, meta: { language, baseName }, expiry: Timeout | null }
const rooms = new Map();

const getRoom = (roomId) => {
  let room = rooms.get(roomId);
  if (!room) {
    room = { doc: new Y.Doc(), users: new Map(), meta: { language: 'javascript', baseName: 'untitled' }, expiry: null };
    rooms.set(roomId, room);
  }
  return room;
};

const scheduleRoomDeletion = (roomId) => {
  const room = rooms.get(roomId);
  if (!room || room.users.size > 0 || room.expiry) return;
  room.expiry = setTimeout(() => {
    room.doc.destroy();
    rooms.delete(roomId);
    devLog(`🗑️  Room ${roomId} expired`);
  }, ROOM_GRACE_MS);
};

const deleteRoom = (roomId) => {
  const room = rooms.get(roomId);
  if (!room) return;
  clearTimeout(room.expiry);
  room.doc.destroy();
  rooms.delete(roomId);
};

const isValidLanguage = (language) => typeof language === 'string' && /^[a-z+#]{1,20}$/.test(language);

const isValidMeta = ({ language, baseName } = {}) =>
  isValidLanguage(language) &&
  typeof baseName === 'string' && baseName.length > 0 && baseName.length <= 100 && !/[\\/]/.test(baseName);

const isValidRoomId = (roomId) => typeof roomId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(roomId);

const MAX_NAME_LENGTH = 24;
const DEFAULT_COLOR = 'hsl(160, 55%, 63%)';

const cleanUser = (user) => {
  const name = typeof user?.name === 'string' ? user.name.trim().slice(0, MAX_NAME_LENGTH) : '';
  const color = typeof user?.color === 'string' && /^(#[0-9a-fA-F]{6}|hsl\(\d{1,3}, \d{1,3}%, \d{1,3}%\))$/.test(user.color)
    ? user.color
    : DEFAULT_COLOR;
  return name ? { name, color } : null;
};

const isValidPosition = (p) =>
  Number.isInteger(p?.lineNumber) && p.lineNumber > 0 && Number.isInteger(p?.column) && p.column > 0;

// Browsers send Origin on WebSocket upgrades too, but CORS doesn't protect those.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const isAllowedOrigin = (origin, host) => {
  if (!origin) return true; // non-browser clients
  if (allowedOrigins.includes(origin)) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
};

const CHAT_LIMIT = Number(process.env.CHAT_RATE_LIMIT) || 15;
const CHAT_WINDOW_MS = 5 * 60 * 1000;
const chatHits = new Map();

const chatRateLimit = (req, res, next) => {
  const now = Date.now();
  const key = req.ip;
  const entry = chatHits.get(key);
  if (!entry || now - entry.start > CHAT_WINDOW_MS) {
    chatHits.set(key, { start: now, count: 1 });
    return next();
  }
  if (entry.count >= CHAT_LIMIT) {
    res.set('Retry-After', String(Math.ceil((entry.start + CHAT_WINDOW_MS - now) / 1000)));
    return res.status(429).type('text/plain').send('Too many AI requests. Please wait a few minutes and try again.');
  }
  entry.count++;
  next();
};

app.prepare().then(() => {
  const expressApp = express();
  // Set TRUST_PROXY=1 behind a host's load balancer so req.ip is the real client.
  if (process.env.TRUST_PROXY) expressApp.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
  const server = createServer(expressApp);
  const io = new Server(server, {
    cors: allowedOrigins.length ? { origin: allowedOrigins, methods: ['GET', 'POST'] } : undefined,
    allowRequest: (req, callback) => callback(null, isAllowedOrigin(req.headers.origin, req.headers.host)),
  });

  // Socket.io connection handling
  io.on('connection', (socket) => {
    devLog('🔌 Client connected:', socket.id);

    let tokens = EVENT_BURST;
    let lastRefill = Date.now();
    let dropped = 0;
    socket.use((packet, nextPacket) => {
      const now = Date.now();
      tokens = Math.min(EVENT_BURST, tokens + ((now - lastRefill) / 1000) * EVENTS_PER_SECOND);
      lastRefill = now;
      if (tokens >= 1) {
        tokens -= 1;
        return nextPacket();
      }
      if (++dropped > MAX_DROPPED_EVENTS) {
        console.warn('Disconnecting flooding client', socket.id);
        socket.disconnect(true);
      }
    });

    const inRoom = (roomId) => isValidRoomId(roomId) && socket.rooms.has(roomId) && rooms.has(roomId);
    const rejectJoin = (message) => socket.emit('room-error', { message });

    socket.on('join-room', ({ roomId, user } = {}) => {
      const profile = cleanUser(user);
      if (!isValidRoomId(roomId) || !profile) return;

      // One room per connection, so a single client can't create rooms in bulk.
      if ([...socket.rooms].some((r) => r !== socket.id && r !== roomId)) return;

      const existing = rooms.get(roomId);
      if (!existing && rooms.size >= MAX_ROOMS) {
        return rejectJoin('The server is busy right now. Please try again in a few minutes.');
      }
      if (existing && existing.users.size >= MAX_USERS_PER_ROOM && !existing.users.has(socket.id)) {
        return rejectJoin(`This room is full (max ${MAX_USERS_PER_ROOM} people).`);
      }

      socket.join(roomId);

      const room = getRoom(roomId);
      clearTimeout(room.expiry);
      room.expiry = null;
      room.users.set(socket.id, { id: socket.id, ...profile });

      io.to(roomId).emit('users-update', Array.from(room.users.values()));
      socket.emit('file-meta', room.meta);

      devLog(`👤 ${profile.name} joined room: ${roomId}`);
    });

    // Sent by the editor once it's ready, so the reply can't arrive before it is listening.
    socket.on('yjs-request-state', ({ roomId } = {}) => {
      if (!inRoom(roomId)) return;
      socket.emit('yjs-sync', { update: Array.from(Y.encodeStateAsUpdate(rooms.get(roomId).doc)) });
    });

    // Handle Yjs sync messages
    socket.on('yjs-sync', ({ roomId, update } = {}) => {
      if (!inRoom(roomId) || !Array.isArray(update)) return;
      const room = rooms.get(roomId);
      try {
        Y.applyUpdate(room.doc, new Uint8Array(update));
      } catch (err) {
        // A malformed update would otherwise crash the whole server.
        console.warn('Rejected bad Yjs update from', socket.id);
        return;
      }

      // Updates can't be un-applied, so an oversized room is closed rather than trimmed.
      if (room.doc.getText('monaco').length > MAX_DOC_CHARS) {
        console.warn(`A room exceeded ${MAX_DOC_CHARS} characters; closing it`);
        io.to(roomId).emit('room-error', { message: 'This room got too large (over 1 million characters) and was closed.' });
        io.in(roomId).socketsLeave(roomId);
        deleteRoom(roomId);
        return;
      }
      
      // Broadcast to all other clients in the room
      socket.to(roomId).emit('yjs-sync', { update });
    });

    // Handle Yjs awareness updates
    socket.on('yjs-awareness', ({ roomId, update } = {}) => {
      if (!inRoom(roomId)) return;
      socket.to(roomId).emit('yjs-awareness', { update: { clientID: socket.id, state: update?.state ?? null } });
    });

    // Handle cursor position updates
    socket.on('cursor-position', ({ roomId, position } = {}) => {
      if (!inRoom(roomId) || !isValidPosition(position)) return;
      // Use the server's copy of the user so nobody can impersonate someone else.
      const user = rooms.get(roomId).users.get(socket.id);
      if (!user) return;
      socket.to(roomId).emit('remote-cursor', {
        userId: socket.id,
        position: { lineNumber: position.lineNumber, column: position.column },
        user: { name: user.name, color: user.color }
      });
    });

    // Handle file name / language changes
    socket.on('file-meta', ({ roomId, meta } = {}) => {
      if (!inRoom(roomId) || !isValidMeta(meta)) return;
      const next = { language: meta.language, baseName: meta.baseName };
      rooms.get(roomId).meta = next;
      socket.to(roomId).emit('file-meta', next);
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
    for (const [key, entry] of chatHits) {
      if (now - entry.start > CHAT_WINDOW_MS) chatHits.delete(key);
    }
  }, CHAT_WINDOW_MS).unref();

  expressApp.post('/api/chat', chatRateLimit);

  expressApp.get('/healthz', (req, res) => res.json({ ok: true }));

  // Handle all Next.js routes
  expressApp.all('*', (req, res) => {
    return handle(req, res);
  });

  server.listen(port, (err) => {
    if (err) throw err;
    console.log(`🚀 Server ready on http://localhost:${port}`);
    console.log(`🎨 CodeSync Collaborative Editor`);
  });

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received, shutting down`);
    // Clients auto-reconnect to the new instance and push their copy of the code back.
    io.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
});