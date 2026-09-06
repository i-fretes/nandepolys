import { create } from 'zustand';
import toast from 'react-hot-toast';
import type { Card, ClientState, GameEvent } from '@nandepoly/engine';
import { emitAck, socket } from './socket';
import { sfx } from './sound';

export interface ChatMessage { id: string; playerId: string | null; name: string; text: string; at: number }

export interface RoomView {
  state: ClientState;
  chat: ChatMessage[];
  auctionDeadline: number | null;
  turnDeadline: number | null;
}

interface Store {
  connected: boolean;
  roomCode: string | null;
  playerId: string | null;
  playerToken: string | null;
  spectator: boolean;
  state: ClientState | null;
  chat: ChatMessage[];
  events: GameEvent[];
  auctionDeadline: number | null;
  turnDeadline: number | null;
  cardModal: { card: Card; playerId: string } | null;
  rollingUntil: number;
  selectedTile: number | null;
  dialog: 'manage' | 'trade' | null;
  unreadChat: number;
  activeTab: 'log' | 'chat';
  displayPos: Record<string, number>;   // posición animada de cada ficha
  rulesOpen: boolean;

  setConnected(v: boolean): void;
  enterRoom(info: { roomCode: string; playerId: string | null; playerToken: string; spectator: boolean } & RoomView): void;
  applyView(view: RoomView, events?: GameEvent[]): void;
  addChat(msg: ChatMessage): void;
  leaveRoom(): void;
  setCardModal(v: Store['cardModal']): void;
  setSelectedTile(id: number | null): void;
  setDialog(d: Store['dialog']): void;
  setActiveTab(t: Store['activeTab']): void;
  setRulesOpen(v: boolean): void;
  act(action: Record<string, unknown> & { type: string }): Promise<boolean>;
}

export const useStore = create<Store>((set, get) => ({
  connected: false,
  roomCode: null,
  playerId: null,
  playerToken: null,
  spectator: false,
  state: null,
  chat: [],
  events: [],
  auctionDeadline: null,
  turnDeadline: null,
  cardModal: null,
  rollingUntil: 0,
  selectedTile: null,
  dialog: null,
  unreadChat: 0,
  activeTab: 'log',
  displayPos: {},
  rulesOpen: false,

  setConnected: v => set({ connected: v }),

  enterRoom: info => set({
    roomCode: info.roomCode, playerId: info.playerId, playerToken: info.playerToken, spectator: info.spectator,
    state: info.state, chat: info.chat, auctionDeadline: info.auctionDeadline, turnDeadline: info.turnDeadline,
    events: info.state.log.slice(-60),
    displayPos: Object.fromEntries(info.state.players.map(p => [p.id, p.position])),
  }),

  applyView: (view, events = []) => {
    const me = get().playerId;
    const prev = get().state;
    const patch: Partial<Store> = {
      state: view.state, chat: view.chat, auctionDeadline: view.auctionDeadline, turnDeadline: view.turnDeadline,
    };
    if (events.length) {
      patch.events = [...get().events, ...events].slice(-200);
      for (const e of events) {
        if (e.type === 'roll') { patch.rollingUntil = Date.now() + 600; sfx.dice(); }
        if (e.type === 'card' && view.state.lastCard) { patch.cardModal = view.state.lastCard; sfx.card(); }
        if (e.type === 'trade_proposed' && view.state.pendingTrade?.toId === me) { toast('Te propusieron un intercambio', { icon: '🤝' }); sfx.notify(); }
        if ((e.type === 'rent' || e.type === 'debt_paid') && e.data?.to === me) { toast.success(e.text); sfx.coin(); }
        if ((e.type === 'rent' || e.type === 'tax' || e.type === 'expense') && e.playerId === me) sfx.pay();
        if ((e.type === 'income' || e.type === 'salary' || e.type === 'pot') && e.playerId === me) sfx.coin();
        if (e.type === 'buy' || e.type === 'auction_won') sfx.buy();
        if (e.type === 'build') sfx.build();
        if (e.type === 'turn' && e.playerId === me) { toast('¡Es tu turno!', { icon: '🎲' }); sfx.turn(); }
        if (e.type === 'auction_start') { toast(e.text, { icon: '🔨' }); sfx.auction(); }
        if (e.type === 'bankrupt' || e.type === 'leave') { toast(e.text, { icon: '💸', duration: 6000 }); if (e.playerId === me) sfx.lose(); }
        if (e.type === 'game_over') { toast(e.text, { icon: '🏆', duration: 8000 }); if (e.playerId === me) sfx.win(); else sfx.lose(); }
        if (e.type === 'jail' && e.playerId === me) { toast.error('¡Vas preso a Tacumbú!'); }
        if (e.type === 'jail') sfx.jail();
        if (e.type === 'info' || e.type === 'bot' || e.type === 'rematch') toast(e.text);
      }
    }
    set(patch);
    if (prev) animateMoves(prev, view.state, events);
    else set({ displayPos: Object.fromEntries(view.state.players.map(p => [p.id, p.position])) });
  },

  addChat: msg => set(s => ({
    chat: [...s.chat, msg].slice(-200),
    unreadChat: s.activeTab === 'chat' ? 0 : s.unreadChat + 1,
  })),

  leaveRoom: () => set({
    roomCode: null, playerId: null, playerToken: null, spectator: false, state: null, chat: [], events: [],
    auctionDeadline: null, turnDeadline: null, cardModal: null, selectedTile: null, dialog: null,
  }),

  setCardModal: v => set({ cardModal: v }),
  setSelectedTile: id => set({ selectedTile: id }),
  setDialog: d => set({ dialog: d }),
  setActiveTab: t => set({ activeTab: t, unreadChat: t === 'chat' ? 0 : get().unreadChat }),
  setRulesOpen: v => set({ rulesOpen: v }),

  act: async action => {
    try {
      await emitAck('game:action', action);
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    }
  },
}));

// ---------------------------------------------------------------------------------------
// Animación de fichas: recorren el tablero casilla por casilla (o saltan, si van presas)
// ---------------------------------------------------------------------------------------
const animTimers: Record<string, ReturnType<typeof setTimeout>> = {};

function animateMoves(prev: ClientState, next: ClientState, events: GameEvent[]) {
  const patchNow: Record<string, number> = {};
  for (const p of next.players) {
    const before = prev.players.find(x => x.id === p.id);
    const from = useStore.getState().displayPos[p.id] ?? before?.position ?? p.position;
    if (from === p.position) continue;
    if (p.bankrupt) { patchNow[p.id] = p.position; continue; }
    const teleport = events.some(e => (e.type === 'jail' || e.type === 'three_doubles') && e.playerId === p.id) || next.phase !== 'PLAYING';
    const back = events.some(e => e.type === 'card' && e.playerId === p.id && e.data?.cardId === 'S9');
    if (teleport) { patchNow[p.id] = p.position; continue; }
    const forward = (p.position - from + 40) % 40;
    const steps = back ? -((from - p.position + 40) % 40) : forward;
    const n = Math.abs(steps);
    const speed = n <= 12 ? 130 : Math.max(45, 1400 / n);
    if (animTimers[p.id]) clearTimeout(animTimers[p.id]);
    let i = 0;
    let pos = from;
    const target = p.position;
    const tick = () => {
      i++;
      pos = (pos + Math.sign(steps) + 40) % 40;
      useStore.setState(s => ({ displayPos: { ...s.displayPos, [p.id]: pos } }));
      if (i < n && pos !== target) { sfx.hop(); animTimers[p.id] = setTimeout(tick, speed); }
      else { useStore.setState(s => ({ displayPos: { ...s.displayPos, [p.id]: target } })); delete animTimers[p.id]; }
    };
    animTimers[p.id] = setTimeout(tick, 350); // deja ver los dados primero
  }
  if (Object.keys(patchNow).length) useStore.setState(s => ({ displayPos: { ...s.displayPos, ...patchNow } }));
}

// Suscripciones globales al socket
socket.on('connect', () => useStore.getState().setConnected(true));
socket.on('disconnect', () => useStore.getState().setConnected(false));
socket.on('state:update', (payload: RoomView & { events: GameEvent[] }) => {
  useStore.getState().applyView(payload, payload.events);
});
socket.on('chat:message', (msg: ChatMessage) => useStore.getState().addChat(msg));

// Selectores útiles
export const useMe = () => useStore(s => s.state?.players.find(p => p.id === s.playerId) ?? null);
export const useIsMyTurn = () => useStore(s => !!s.state && s.state.phase === 'PLAYING' && s.state.players[s.state.currentPlayerIndex]?.id === s.playerId);
