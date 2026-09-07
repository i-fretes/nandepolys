import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import { Server as IOServer, type Socket } from 'socket.io';
import { nanoid } from 'nanoid';
import {
  MAX_PLAYERS, PLAYER_COLORS, RuleError, addPlayer, applyAction, rematch, removePlayer, rollDice, toClientState,
  updateSettings, type Action, type GameEvent, type GameState, type TokenId,
} from '@nandepoly/engine';
import { ActionSchema, ChatSchema, CreateRoomSchema, DraftingSchema, JoinRoomSchema, RejoinSchema, SettingsSchema, StrokeSchema } from './protocol';
import { RoomManager, type Room } from './rooms';
import { botAction } from './bots';
import { DICT_SIZE, isValidWord } from './dictionary';

const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? '0.0.0.0';
const DATA_DIR = process.env.DATA_DIR ?? null;
const ROOM_TTL_HOURS = Number(process.env.ROOM_TTL_HOURS ?? 6);
const AUCTION_SECONDS = Number(process.env.AUCTION_SECONDS ?? 20);
const BOT_DELAY_MS = Number(process.env.BOT_DELAY_MS ?? 900);

const here = dirname(fileURLToPath(import.meta.url));
const candidates = [
  process.env.PUBLIC_DIR,
  resolve(here, '../public'),
  resolve(here, '../../web/dist'),
  resolve(here, '../../../apps/web/dist'),
].filter(Boolean) as string[];
const PUBLIC_DIR = candidates.find(p => existsSync(join(p, 'index.html'))) ?? null;

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });
await app.register(fastifyCors, { origin: true });

if (PUBLIC_DIR) {
  await app.register(fastifyStatic, { root: PUBLIC_DIR, wildcard: false });
  app.setNotFoundHandler((req, reply) => {
    if (req.raw.url?.startsWith('/api') || req.raw.url?.startsWith('/socket.io')) return reply.code(404).send({ error: 'not found' });
    return reply.sendFile('index.html');
  });
  app.log.info(`Sirviendo cliente desde ${PUBLIC_DIR}`);
} else {
  app.log.warn('No se encontró el cliente compilado (apps/web/dist). Solo API/WebSocket.');
}

const rooms = new RoomManager(DATA_DIR, ROOM_TTL_HOURS * 3600 * 1000);

app.get('/api/health', async () => ({ ok: true, rooms: rooms.rooms.size, uptime: process.uptime() }));
app.get<{ Params: { code: string } }>('/api/rooms/:code', async (req, reply) => {
  const r = rooms.get(req.params.code);
  if (!r) return reply.code(404).send({ exists: false });
  return {
    exists: true, phase: r.state.phase, players: r.state.players.length,
    takenTokens: r.state.players.map(p => p.token), names: r.state.players.map(p => p.name),
  };
});

const io = new IOServer(app.server, { cors: { origin: true }, pingInterval: 10000, pingTimeout: 20000 });

// -------------------------------------------------------------------------------------------
// Sesiones de socket
// -------------------------------------------------------------------------------------------

interface Session { roomCode: string; playerId: string | null; playerToken: string; name: string }
const sessions = new Map<string, Session>(); // socket.id → sesión
const timers = new Map<string, { turn?: NodeJS.Timeout; auction?: NodeJS.Timeout; bot?: NodeJS.Timeout; limit?: NodeJS.Timeout; phase?: NodeJS.Timeout; go?: NodeJS.Timeout; tick?: NodeJS.Timeout }>();
const ARENA_VOTE_SECONDS = Number(process.env.ARENA_VOTE_SECONDS ?? 8);
const ARENA_RESULT_SECONDS = Number(process.env.ARENA_RESULT_SECONDS ?? 7);
const ARENA_TICK_MS = Number(process.env.ARENA_TICK_MS ?? 400);
const DUEL_ACCEPT_SECONDS = Number(process.env.DUEL_ACCEPT_SECONDS ?? 20);
const DUEL_IDLE_SECONDS = Number(process.env.DUEL_IDLE_SECONDS ?? 90);
const CHALLENGE_ACCEPT_SECONDS = Number(process.env.CHALLENGE_ACCEPT_SECONDS ?? 15);
const RENT_OFFER_SECONDS = Number(process.env.RENT_OFFER_SECONDS ?? 20);
const CASINO_IDLE_SECONDS = Number(process.env.CASINO_IDLE_SECONDS ?? 75);
const CHALLENGE_PLAY_SECONDS = Number(process.env.CHALLENGE_PLAY_SECONDS ?? 45);

function ok<T>(data: T) { return { ok: true as const, ...data }; }
function fail(message: string) { return { ok: false as const, error: message }; }

function roomView(room: Room, viewerId?: string | null) {
  return {
    state: toClientState(room.state, viewerId ?? undefined),
    serverTime: Date.now(),
    chat: room.chat.slice(-100),
    auctionDeadline: room.auctionDeadline,
    turnDeadline: room.turnDeadline,
    phaseDeadline: room.phaseDeadline,
  };
}

/** Aplica una acción generada por el servidor (temporizadores) sin romper si el estado cambió. */
function serverAction(room: Room, action: Action, note?: string) {
  try {
    const prev = room.state;
    room.state = applyAction(room.state, action).state;
    rooms.touch(room);
    afterStateChange(room, prev);
    broadcast(room, note ? [{ type: 'info', text: note }] : []);
  } catch (e) { app.log.warn(e); }
}
// Nota: serverAction con note '' no agrega texto al registro.

/** Cada jugador recibe su propia vista (misiones propias, mano de truco, lupa). Espectadores: vista neutra. */
function broadcast(room: Room, events: GameEvent[] = []) {
  const base = { chat: room.chat.slice(-100), auctionDeadline: room.auctionDeadline, turnDeadline: room.turnDeadline, phaseDeadline: room.phaseDeadline, serverTime: Date.now(), events };
  const perViewer = new Map<string | null, ReturnType<typeof toClientState>>();
  for (const [socketId, sess] of sessions) {
    if (sess.roomCode !== room.code) continue;
    let state = perViewer.get(sess.playerId);
    if (!state) { state = toClientState(room.state, sess.playerId ?? undefined); perViewer.set(sess.playerId, state); }
    io.to(socketId).emit('state:update', { ...base, state });
  }
}

function setConnected(room: Room, playerId: string, connected: boolean) {
  const p = room.state.players.find(p => p.id === playerId);
  if (p && p.connected !== connected) {
    p.connected = connected;
    return true;
  }
  return false;
}

/** Aplica una acción del motor, difunde y programa temporizadores/bots. */
function dispatch(room: Room, action: Action): GameEvent[] {
  const before = room.state;
  const { state, events } = applyAction(before, action);
  room.state = state;
  rooms.touch(room);
  afterStateChange(room, before);
  broadcast(room, events);
  return events;
}

function afterStateChange(room: Room, before: GameState) {
  const s = room.state;
  const t = timers.get(room.code) ?? {};
  timers.set(room.code, t);

  // Subasta: cuenta regresiva desde la última oferta/paso
  if (t.auction) { clearTimeout(t.auction); t.auction = undefined; }
  room.auctionDeadline = null;
  if (s.phase === 'PLAYING' && s.turnPhase === 'AUCTION' && s.auction) {
    room.auctionDeadline = Date.now() + AUCTION_SECONDS * 1000;
    t.auction = setTimeout(() => {
      try {
        const a = room.state.auction;
        if (!a || room.state.turnPhase !== 'AUCTION') return;
        // Retirar a todos menos al mejor postor; si nadie ofertó, retirar a todos
        let st = room.state;
        for (const id of [...a.activeBidders]) {
          if (st.auction && id !== st.auction.highestBidderId) st = applyAction(st, { type: 'AUCTION_PASS', playerId: id }).state;
        }
        if (st.auction) st = applyAction(st, { type: 'AUCTION_PASS', playerId: st.auction.activeBidders[0] }).state;
        const prev = room.state;
        room.state = st;
        rooms.touch(room);
        afterStateChange(room, prev);
        broadcast(room, [{ type: 'info', text: 'La subasta se cerró por tiempo.' }]);
      } catch (e) { app.log.error(e); }
    }, AUCTION_SECONDS * 1000);
  }

  // Temporizador de turno (regla casera)
  const turnChanged = before.turnNumber !== s.turnNumber || before.phase !== s.phase;
  if (s.phase === 'PLAYING' && s.settings.turnTimerSeconds > 0) {
    if (turnChanged || !t.turn) {
      if (t.turn) clearTimeout(t.turn);
      room.turnDeadline = Date.now() + s.settings.turnTimerSeconds * 1000;
      t.turn = setTimeout(() => {
        try {
          if (room.state.phase !== 'PLAYING') return;
          const prev = room.state;
          room.state = applyAction(room.state, { type: 'FORCE_END_TURN', playerId: room.state.hostId }).state;
          rooms.touch(room);
          t.turn = undefined;
          afterStateChange(room, prev);
          broadcast(room, [{ type: 'info', text: 'Se acabó el tiempo del turno; se tomaron las decisiones por defecto.' }]);
        } catch (e) { app.log.error(e); }
      }, s.settings.turnTimerSeconds * 1000);
    }
  } else {
    if (t.turn) { clearTimeout(t.turn); t.turn = undefined; }
    room.turnDeadline = null;
  }

  // Límite de tiempo de partida
  if (s.phase === 'PLAYING' && s.settings.timeLimitMinutes > 0 && s.startedAt && !t.limit) {
    const remaining = s.startedAt + s.settings.timeLimitMinutes * 60000 - Date.now();
    t.limit = setTimeout(() => {
      try {
        if (room.state.phase !== 'PLAYING') return;
        dispatch(room, { type: 'END_GAME', playerId: room.state.hostId });
      } catch (e) { app.log.error(e); }
    }, Math.max(0, remaining));
  }
  if (s.phase !== 'PLAYING' && t.limit) { clearTimeout(t.limit); t.limit = undefined; }

  // Temporizadores de fase: desafío pendiente / en juego, oferta de alquiler, casino, señal del tereré
  if (t.phase) { clearTimeout(t.phase); t.phase = undefined; }
  if (t.go) { clearTimeout(t.go); t.go = undefined; }
  room.phaseDeadline = null;
  if (s.phase === 'PLAYING') {
    const arm = (secs: number, action: Action, note: string) => {
      room.phaseDeadline = Date.now() + secs * 1000;
      t.phase = setTimeout(() => { t.phase = undefined; serverAction(room, action, note); }, secs * 1000);
    };
    if (s.turnPhase === 'CHALLENGE' && s.challenge) {
      const c = s.challenge;
      if (c.status === 'pending') arm(CHALLENGE_ACCEPT_SECONDS, { type: 'CHALLENGE_REJECT', playerId: c.toId! }, 'El desafío venció sin respuesta.');
      else if (c.status === 'pick') arm(CHALLENGE_PLAY_SECONDS, { type: 'CHALLENGE_CANCEL', playerId: s.hostId }, 'El desafío se anuló por tiempo.');
      else if (c.status === 'playing') {
        arm(CHALLENGE_PLAY_SECONDS, { type: 'CHALLENGE_CANCEL', playerId: s.hostId }, 'El desafío se anuló por tiempo.');
        if (c.kind === 'terere' && !c.data.go) {
          const wait = 1500 + Math.floor(Math.random() * 3000);
          t.go = setTimeout(() => { t.go = undefined; serverAction(room, { type: 'CHALLENGE_GO', playerId: s.hostId }); }, wait);
        }
      }
    } else if (s.turnPhase === 'RENT_OFFER' && s.rentOffer) {
      const o = s.rentOffer;
      if (!o.proposed) arm(RENT_OFFER_SECONDS, { type: 'RENT_PAY', playerId: o.payerId }, 'Se pagó el alquiler por tiempo.');
      else arm(RENT_OFFER_SECONDS, { type: 'RENT_DON_REJECT', playerId: o.ownerId }, 'El dueño no respondió: se cobra el alquiler normal.');
    } else if (s.turnPhase === 'CASINO' && s.casino) {
      arm(CASINO_IDLE_SECONDS, { type: 'CASINO_LEAVE', playerId: s.casino.playerId }, 'El Casino cerró por inactividad.');
    } else if (s.turnPhase === 'ARENA' && s.arena) {
      const a = s.arena;
      if (a.stage === 'vote') {
        // la votación cierra a los N segundos o cuando votaron todos (ver dispatch)
        const allVoted = a.players.every(id => a.votes[id] !== undefined);
        if (allVoted) { room.phaseDeadline = Date.now() + 1200; t.phase = setTimeout(() => { t.phase = undefined; serverAction(room, { type: 'ARENA_START', playerId: s.hostId, now: Date.now() }); }, 1200); }
        else arm(ARENA_VOTE_SECONDS, { type: 'ARENA_START', playerId: s.hostId, now: Date.now() + ARENA_VOTE_SECONDS * 1000 }, '');
      } else if (a.stage === 'done') {
        arm(ARENA_RESULT_SECONDS, { type: 'ARENA_END', playerId: s.hostId }, '');
      } else {
        // en juego: ticks periódicos con el reloj del servidor
        room.phaseDeadline = null;
      }
    } else if (s.turnPhase === 'DUEL' && s.duel) {
      const d = s.duel;
      if (d.status === 'pending') arm(DUEL_ACCEPT_SECONDS, { type: 'DUEL_REJECT', playerId: d.toId }, 'El duelo venció sin respuesta.');
      else if (d.status === 'playing') arm(DUEL_IDLE_SECONDS, { type: 'DUEL_CANCEL', playerId: s.hostId }, 'El duelo se anuló por inactividad.');
    }
  }

  // Tick de la Arena (solo mientras se juega)
  const arenaPlaying = s.phase === 'PLAYING' && s.turnPhase === 'ARENA' && s.arena?.stage === 'play';
  if (arenaPlaying && !t.tick) {
    t.tick = setInterval(() => {
      try {
        const st = room.state;
        if (st.phase !== 'PLAYING' || st.turnPhase !== 'ARENA' || st.arena?.stage !== 'play') { clearInterval(t.tick); t.tick = undefined; return; }
        const before = room.state;
        const { state, events } = applyAction(before, { type: 'ARENA_TICK', playerId: st.hostId, now: Date.now() });
        const changed = state !== before && (events.length > 0 || JSON.stringify(state.arena) !== JSON.stringify(before.arena));
        room.state = state;
        if (changed) { rooms.touch(room); afterStateChange(room, before); broadcast(room, events); }
      } catch (e) { app.log.warn(e); }
    }, ARENA_TICK_MS);
  }
  if (!arenaPlaying && t.tick) { clearInterval(t.tick); t.tick = undefined; }

  // Bots
  if (t.bot) { clearTimeout(t.bot); t.bot = undefined; }
  if (s.phase === 'PLAYING') {
    const next = botAction(s);
    if (next) {
      t.bot = setTimeout(() => {
        t.bot = undefined;
        try {
          const a = botAction(room.state);
          if (a) dispatch(room, a);
        } catch (e) {
          app.log.error(e);
          // Si el bot se traba, forzamos el turno para no bloquear la partida
          try { dispatch(room, { type: 'FORCE_END_TURN', playerId: room.state.hostId }); } catch { /* ignore */ }
        }
      }, s.turnPhase === 'ARENA' ? Math.min(BOT_DELAY_MS, 250) : BOT_DELAY_MS);
    }
  }
}

function pickColor(state: GameState): string {
  return PLAYER_COLORS.find(c => !state.players.some(p => p.color === c)) ?? PLAYER_COLORS[0];
}

function handleError(e: unknown, cb?: (r: unknown) => void) {
  if (e instanceof RuleError) return cb?.(fail(e.message));
  if (e && typeof e === 'object' && 'issues' in e) return cb?.(fail('Datos inválidos.'));
  app.log.error(e);
  cb?.(fail('Error interno.'));
}

io.on('connection', (socket: Socket) => {
  socket.on('room:create', (raw, cb) => {
    try {
      const data = CreateRoomSchema.parse(raw);
      const playerId = rooms.newPlayerId();
      const room = rooms.create(playerId, data.settings ?? {});
      room.state = addPlayer(room.state, { id: playerId, name: data.name, token: data.token as TokenId, color: pickColor(room.state) });
      const playerToken = rooms.newToken();
      room.tokens[playerToken] = playerId;
      attach(socket, room, playerId, playerToken, data.name);
      rooms.touch(room);
      cb?.(ok({ roomCode: room.code, playerId, playerToken, ...roomView(room) }));
      broadcast(room);
    } catch (e) { handleError(e, cb); }
  });

  socket.on('room:join', (raw, cb) => {
    try {
      const data = JoinRoomSchema.parse(raw);
      const room = rooms.get(data.roomCode);
      if (!room) return cb?.(fail('No existe una sala con ese código.'));
      const playerToken = rooms.newToken();
      if (room.state.phase === 'LOBBY' && room.state.players.length < MAX_PLAYERS) {
        const playerId = rooms.newPlayerId();
        room.state = addPlayer(room.state, { id: playerId, name: data.name, token: data.token as TokenId, color: pickColor(room.state) });
        room.tokens[playerToken] = playerId;
        attach(socket, room, playerId, playerToken, data.name);
        rooms.touch(room);
        cb?.(ok({ roomCode: room.code, playerId, playerToken, spectator: false, ...roomView(room) }));
        broadcast(room, [{ type: 'join', text: `${data.name} se unió a la sala.` }]);
      } else {
        room.spectators[playerToken] = data.name;
        attach(socket, room, null, playerToken, data.name);
        cb?.(ok({ roomCode: room.code, playerId: null, playerToken, spectator: true, ...roomView(room) }));
        io.to(room.code).emit('chat:message', sysMsg(room, `${data.name} entró como espectador.`));
      }
    } catch (e) { handleError(e, cb); }
  });

  socket.on('room:rejoin', (raw, cb) => {
    try {
      const data = RejoinSchema.parse(raw);
      const room = rooms.get(data.roomCode);
      if (!room) return cb?.(fail('La sala ya no existe.'));
      const playerId = room.tokens[data.playerToken];
      const spectatorName = room.spectators[data.playerToken];
      if (!playerId && !spectatorName) return cb?.(fail('Sesión inválida.'));
      const name = playerId ? room.state.players.find(p => p.id === playerId)?.name ?? '' : spectatorName;
      attach(socket, room, playerId ?? null, data.playerToken, name);
      if (playerId && setConnected(room, playerId, true)) broadcast(room, [{ type: 'reconnect', text: `${name} volvió a conectarse.`, playerId }]);
      // Si mientras no estaba lo reemplazó un bot, recupera el control al volver
      const pl = playerId ? room.state.players.find(p => p.id === playerId) : null;
      if (pl && pl.isBot && room.state.phase === 'PLAYING' && !pl.bankrupt) {
        try { dispatch(room, { type: 'SET_BOT', playerId, targetId: playerId, isBot: false }); } catch (e) { app.log.warn(e); }
      }
      cb?.(ok({ roomCode: room.code, playerId: playerId ?? null, playerToken: data.playerToken, spectator: !playerId, ...roomView(room) }));
    } catch (e) { handleError(e, cb); }
  });

  socket.on('room:settings', (raw, cb) => {
    try {
      const sess = sessions.get(socket.id);
      const room = sess && rooms.get(sess.roomCode);
      if (!room || !sess?.playerId) return cb?.(fail('Sin sala.'));
      if (room.state.hostId !== sess.playerId) return cb?.(fail('Solo el anfitrión puede cambiar las reglas.'));
      const settings = SettingsSchema.parse(raw);
      room.state = updateSettings(room.state, settings);
      rooms.touch(room);
      cb?.(ok({}));
      broadcast(room);
    } catch (e) { handleError(e, cb); }
  });

  socket.on('room:addBot', (_raw, cb) => {
    try {
      const sess = sessions.get(socket.id);
      const room = sess && rooms.get(sess.roomCode);
      if (!room || !sess?.playerId) return cb?.(fail('Sin sala.'));
      if (room.state.hostId !== sess.playerId) return cb?.(fail('Solo el anfitrión puede agregar bots.'));
      const tokens: TokenId[] = ['mate', 'chipa', 'nanduti', 'carreta', 'jaguarete', 'arpa'];
      const free = tokens.find(t => !room.state.players.some(p => p.token === t));
      if (!free) return cb?.(fail('No hay fichas libres.'));
      const names = ['Bot Karaí', 'Bot Kuñataĩ', 'Bot Mitã', 'Bot Ñandejára', 'Bot Pombero'];
      const name = names.find(n => !room.state.players.some(p => p.name === n)) ?? 'Bot';
      room.state = addPlayer(room.state, { id: rooms.newPlayerId(), name, token: free, color: pickColor(room.state), isBot: true });
      rooms.touch(room);
      cb?.(ok({}));
      broadcast(room, [{ type: 'join', text: `${name} se unió a la sala.` }]);
    } catch (e) { handleError(e, cb); }
  });

  socket.on('room:rematch', (_raw, cb) => {
    try {
      const sess = sessions.get(socket.id);
      const room = sess && rooms.get(sess.roomCode);
      if (!room || !sess?.playerId) return cb?.(fail('Sin sala.'));
      if (room.state.hostId !== sess.playerId) return cb?.(fail('Solo el anfitrión puede pedir la revancha.'));
      const before = room.state;
      room.state = rematch(room.state, Math.floor(Math.random() * 2 ** 31));
      room.chat.push(sysMsg(room, '¡Revancha! Nueva partida en el lobby.'));
      rooms.touch(room);
      afterStateChange(room, before);
      cb?.(ok({}));
      broadcast(room, [{ type: 'rematch', text: 'Revancha: todos de vuelta al lobby.' }]);
    } catch (e) { handleError(e, cb); }
  });

  socket.on('room:removePlayer', (raw, cb) => {
    try {
      const sess = sessions.get(socket.id);
      const room = sess && rooms.get(sess.roomCode);
      if (!room || !sess?.playerId) return cb?.(fail('Sin sala.'));
      const targetId = typeof raw?.playerId === 'string' ? raw.playerId : sess.playerId;
      if (targetId !== sess.playerId && room.state.hostId !== sess.playerId) return cb?.(fail('Solo el anfitrión puede expulsar.'));
      const target = room.state.players.find(p => p.id === targetId);
      room.state = removePlayer(room.state, targetId);
      for (const [tok, pid] of Object.entries(room.tokens)) if (pid === targetId) delete room.tokens[tok];
      rooms.touch(room);
      cb?.(ok({}));
      broadcast(room, [{ type: 'leave', text: `${target?.name ?? 'Un jugador'} salió de la sala.` }]);
    } catch (e) { handleError(e, cb); }
  });

  socket.on('game:action', (raw, cb) => {
    try {
      const sess = sessions.get(socket.id);
      const room = sess && rooms.get(sess.roomCode);
      if (!room || !sess?.playerId) return cb?.(fail('Sos espectador.'));
      const parsed = ActionSchema.parse(raw);
      const action = { ...parsed, playerId: sess.playerId } as Action;
      if (action.type === 'LEAVE_GAME' && !action.targetId) action.targetId = sess.playerId;
      if (action.type === 'ARENA_MOVE') {
        action.now = Date.now();
        const payload = { ...action.payload } as Record<string, unknown>;
        if (room.state.arena?.game === 'bomba') payload.valid = isValidWord(String(payload.word ?? ''));
        else delete payload.valid;
        action.payload = payload;
      }
      dispatch(room, action);
      cb?.(ok({}));
    } catch (e) { handleError(e, cb); }
  });

  // Trazos del "Adiviná el dibujo": solo el dibujante, se reenvían a los demás sin tocar el estado
  socket.on('arena:stroke', (raw) => {
    try {
      const sess = sessions.get(socket.id);
      const room = sess && rooms.get(sess.roomCode);
      if (!room || !sess?.playerId) return;
      const a = room.state.arena;
      if (!a || a.game !== 'dibujo' || a.data.drawer !== sess.playerId) return;
      const stroke = StrokeSchema.parse(raw);
      socket.to(room.code).emit('arena:stroke', stroke);
    } catch { /* ignorar trazos inválidos */ }
  });

  // "Abrir caja": el dueño de la caja sorpresa avisa que la abre y todos ven girar el carrete a la vez
  socket.on('lootbox:open', () => {
    const sess = sessions.get(socket.id);
    const room = sess && rooms.get(sess.roomCode);
    if (!room || !sess?.playerId) return;
    if (room.state.lastLootbox?.playerId !== sess.playerId) return;
    io.to(room.code).emit('lootbox:open', { playerId: sess.playerId, at: Date.now() });
  });

  // Presencia de negociación: "X está negociando con Y" en la tabla en vivo
  socket.on('trade:drafting', (raw) => {
    try {
      const sess = sessions.get(socket.id);
      const room = sess && rooms.get(sess.roomCode);
      if (!room || !sess?.playerId) return;
      const { toId } = DraftingSchema.parse(raw);
      io.to(room.code).emit('trade:drafting', { fromId: sess.playerId, toId, at: Date.now() });
    } catch { /* ignorar */ }
  });

  socket.on('chat:send', (raw, cb) => {
    try {
      const sess = sessions.get(socket.id);
      const room = sess && rooms.get(sess.roomCode);
      if (!room || !sess) return cb?.(fail('Sin sala.'));
      const { text } = ChatSchema.parse(raw);
      const msg = { id: nanoid(8), playerId: sess.playerId, name: sess.name, text, at: Date.now() };
      room.chat.push(msg);
      if (room.chat.length > 200) room.chat.splice(0, room.chat.length - 200);
      rooms.touch(room);
      io.to(room.code).emit('chat:message', msg);
      cb?.(ok({}));
    } catch (e) { handleError(e, cb); }
  });

  // Herramientas de prueba (solo con DEBUG_TOOLS=1): fijar posición y próximos dados para reproducir situaciones
  if (process.env.DEBUG_TOOLS === '1') {
    socket.on('debug:set', (raw, cb) => {
      try {
        const sess = sessions.get(socket.id);
        const room = sess && rooms.get(sess.roomCode);
        if (!room || !sess?.playerId) return cb?.(fail('Sin sala.'));
        const st = structuredClone(room.state);
        if (typeof raw?.position === 'number') { const p = st.players.find(x => x.id === (raw.playerId ?? sess.playerId)); if (p) p.position = raw.position; }
        if (Array.isArray(raw?.dice)) {
          for (let seed = 1; seed < 500000; seed++) { const r = rollDice(seed); if (r.dice[0] === raw.dice[0] && r.dice[1] === raw.dice[1]) { st.seed = seed; break; } }
        }
        if (typeof raw?.cash === 'number') { const p = st.players.find(x => x.id === (raw.playerId ?? sess.playerId)); if (p) p.cash = raw.cash; }
        if (typeof raw?.give === 'number') { st.properties[raw.give] = { owner: raw.playerId ?? sess.playerId, houses: 0, mortgaged: false }; }
        if (typeof raw?.duelTokens === 'number') { const p = st.players.find(x => x.id === (raw.playerId ?? sess.playerId)); if (p) p.duelTokens = raw.duelTokens; }
        if (typeof raw?.arenaGame === 'string' && st.arena) st.arena.options[0] = raw.arenaGame;
        if (typeof raw?.laps === 'number') { const p = st.players.find(x => x.id === (raw.playerId ?? sess.playerId)); if (p) p.lapsCompleted = raw.laps; }
        room.state = st;
        broadcast(room);
        cb?.(ok({}));
      } catch (e) { handleError(e, cb); }
    });
  }

  socket.on('disconnect', () => {
    const sess = sessions.get(socket.id);
    sessions.delete(socket.id);
    if (!sess?.playerId) return;
    const room = rooms.get(sess.roomCode);
    if (!room) return;
    // ¿Queda otro socket del mismo jugador?
    const stillConnected = [...sessions.values()].some(s => s.roomCode === room.code && s.playerId === sess.playerId);
    if (!stillConnected && setConnected(room, sess.playerId, false)) {
      broadcast(room, [{ type: 'disconnect', text: `${sess.name} se desconectó.`, playerId: sess.playerId }]);
    }
  });
});

function attach(socket: Socket, room: Room, playerId: string | null, playerToken: string, name: string) {
  const prev = sessions.get(socket.id);
  if (prev) socket.leave(prev.roomCode);
  sessions.set(socket.id, { roomCode: room.code, playerId, playerToken, name });
  socket.join(room.code);
}

function sysMsg(room: Room, text: string) {
  const msg = { id: nanoid(8), playerId: null, name: 'Sistema', text, at: Date.now() };
  room.chat.push(msg);
  return msg;
}

await app.listen({ port: PORT, host: HOST });
app.log.info(`Ñandepoly escuchando en http://${HOST}:${PORT} · diccionario: ${DICT_SIZE} palabras`);
