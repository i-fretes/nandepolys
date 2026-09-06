import { create } from 'zustand';
import toast from 'react-hot-toast';
import { BOARD, GROUP_NAMES, ownsFullGroup, type Card, type ClientState, type GameEvent, type GameState, type Group } from '@nandepoly/engine';
import { emitAck, socket } from './socket';
import { sfx } from './sound';

export interface ChatMessage { id: string; playerId: string | null; name: string; text: string; at: number }

export interface RoomView {
  state: ClientState;
  chat: ChatMessage[];
  auctionDeadline: number | null;
  turnDeadline: number | null;
  phaseDeadline: number | null;
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
  phaseDeadline: number | null;
  cardModal: { card: Card; playerId: string } | null;
  rollingUntil: number;
  selectedTile: number | null;
  dialog: 'manage' | 'trade' | 'challenge' | null;
  unreadChat: number;
  activeTab: 'log' | 'chat';
  displayPos: Record<string, number>;   // posición animada de cada ficha
  rulesOpen: boolean;
  fx: FxEvent[];                        // cola de efectos visuales (la consume <FX/>)
  streak: Record<string, number>;       // alquileres cobrados seguidos sin pagar ninguno
  highlightGroup: { group: Group; until: number } | null;
  lastCasino: { id: number; data: Record<string, unknown> } | null;
  lastDon: { id: number; data: Record<string, unknown> } | null;
  challengeEvents: { id: number; type: string; data: Record<string, unknown>; text: string }[];

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
  pushFx(fx: FxInput): void;
  popFx(id: number): void;
  act(action: Record<string, unknown> & { type: string }): Promise<boolean>;
}

export type FxInput =
  | { kind: 'money'; from: string; to: string; amount: number }
  | { kind: 'float'; playerId: string; text: string; tone: 'good' | 'bad' | 'neutral' }
  | { kind: 'shake'; strength: number }
  | { kind: 'confetti'; playerId?: string; big?: boolean }
  | { kind: 'bars'; playerId: string }
  | { kind: 'crack'; playerId: string }
  | { kind: 'jackpot'; playerId: string; amount: number }
  | { kind: 'rain'; playerId: string };
export type FxEvent = FxInput & { id: number };

let fxCounter = 0;

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
  phaseDeadline: null,
  cardModal: null,
  rollingUntil: 0,
  selectedTile: null,
  dialog: null,
  unreadChat: 0,
  activeTab: 'log',
  displayPos: {},
  rulesOpen: false,
  fx: [],
  streak: {},
  highlightGroup: null,
  lastCasino: null,
  lastDon: null,
  challengeEvents: [],

  setConnected: v => set({ connected: v }),

  enterRoom: info => set({
    roomCode: info.roomCode, playerId: info.playerId, playerToken: info.playerToken, spectator: info.spectator,
    state: info.state, chat: info.chat, auctionDeadline: info.auctionDeadline, turnDeadline: info.turnDeadline, phaseDeadline: info.phaseDeadline ?? null,
    events: info.state.log.slice(-60),
    displayPos: Object.fromEntries(info.state.players.map(p => [p.id, p.position])),
  }),

  applyView: (view, events = []) => {
    const me = get().playerId;
    const prev = get().state;
    const patch: Partial<Store> = {
      state: view.state, chat: view.chat, auctionDeadline: view.auctionDeadline, turnDeadline: view.turnDeadline, phaseDeadline: view.phaseDeadline ?? null,
    };
    const fx: FxEvent[] = [];
    const push = (f: FxInput) => fx.push({ ...f, id: ++fxCounter } as FxEvent);
    const streak = { ...get().streak };
    const bigger = (n: number) => n >= 300;
    if (events.length) {
      patch.events = [...get().events, ...events].slice(-200);
      for (const e of events) {
        const amt = typeof e.data?.amount === 'number' ? (e.data.amount as number) : 0;
        const to = typeof e.data?.to === 'string' ? (e.data.to as string) : null;
        // Dinero que se mueve entre jugadores / banco
        if ((e.type === 'rent' || e.type === 'debt_paid' || e.type === 'challenge_done' || e.type === 'rent_don_roll') && e.playerId && to && amt > 0) {
          if (e.type === 'rent_don_roll' && e.data?.win) { /* no pagó */ } else {
            const payer = e.type === 'challenge_done' ? (e.data?.loser as string) : e.playerId;
            push({ kind: 'money', from: payer, to, amount: amt });
            push({ kind: 'float', playerId: payer, text: `−${moneyFmt(amt)}`, tone: 'bad' });
            push({ kind: 'float', playerId: to, text: `+${moneyFmt(amt)}`, tone: 'good' });
            if (bigger(amt)) push({ kind: 'shake', strength: Math.min(1, amt / 1500) });
            if (e.type === 'rent') { streak[to] = (streak[to] ?? 0) + 1; streak[payer] = 0; }
          }
        }
        if ((e.type === 'tax' || e.type === 'expense' || e.type === 'jail_out' || e.type === 'buy' || e.type === 'build' || e.type === 'unmortgage') && e.playerId && amt > 0) {
          push({ kind: 'money', from: e.playerId, to: 'bank', amount: amt });
          push({ kind: 'float', playerId: e.playerId, text: `−${moneyFmt(amt)}`, tone: 'bad' });
          if (e.type === 'tax' || e.type === 'expense') streak[e.playerId] = 0;
        }
        if ((e.type === 'salary' || e.type === 'income' || e.type === 'pot' || e.type === 'mortgage' || e.type === 'sell_building' || e.type === 'casino_cashout') && e.playerId && amt > 0) {
          push({ kind: 'money', from: 'bank', to: e.playerId, amount: amt });
          push({ kind: 'float', playerId: e.playerId, text: `+${moneyFmt(amt)}`, tone: 'good' });
          if (e.type === 'salary') push({ kind: 'rain', playerId: e.playerId });
        }
        if (e.type === 'casino_result' && e.playerId) {
          const win = !!e.data?.win; const payout = (e.data?.payout as number) ?? 0;
          if (win) { push({ kind: 'money', from: 'bank', to: e.playerId, amount: payout }); push({ kind: 'float', playerId: e.playerId, text: `+${moneyFmt(payout - amt)}`, tone: 'good' }); if (payout - amt >= 200) push({ kind: 'confetti', playerId: e.playerId }); }
          else push({ kind: 'float', playerId: e.playerId, text: `−${moneyFmt(amt)}`, tone: 'bad' });
          patch.lastCasino = { id: ++fxCounter, data: e.data ?? {} };
        }
        if (e.type === 'casino_double' && e.playerId) patch.lastCasino = { id: ++fxCounter, data: { game: 'doble', ...e.data } };
        if (e.type === 'rent_don_roll') patch.lastDon = { id: ++fxCounter, data: { ...(e.data ?? {}), playerId: e.playerId } };
        if (e.type === 'jackpot' && e.playerId) { push({ kind: 'jackpot', playerId: e.playerId, amount: amt }); push({ kind: 'confetti', playerId: e.playerId, big: true }); sfx.bigWin(); }
        if (e.type === 'jail' && e.playerId) { push({ kind: 'bars', playerId: e.playerId }); sfx.bars(); }
        if ((e.type === 'bankrupt' || e.type === 'leave') && e.playerId) push({ kind: 'crack', playerId: e.playerId });
        if (e.type === 'game_over' && e.playerId) push({ kind: 'confetti', playerId: e.playerId, big: true });
        if (e.type.startsWith('challenge_')) {
          patch.challengeEvents = [...(patch.challengeEvents ?? get().challengeEvents), { id: ++fxCounter, type: e.type, data: e.data ?? {}, text: e.text }].slice(-30);
          if (e.type === 'challenge_go') sfx.go();
          if (e.type === 'challenge_done' && e.data?.winner === me) sfx.win();
          if (e.type === 'challenge_done' && e.data?.loser === me) sfx.lose();
          if (e.type === 'challenge_proposed' && e.data?.to === me) { toast('⚔️ ¡Te desafiaron!'); sfx.notify(); }
        }
        if (e.type === 'rent_don_proposed' && e.data?.to === me) { toast('🎲 Te proponen doble o nada'); sfx.notify(); }
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
    // Grupo de color completado → resaltar y festejar
    if (prev) {
      for (const p of view.state.players) {
        for (const g of Object.keys(GROUP_NAMES) as Group[]) {
          const now = ownsFullGroup(view.state as unknown as GameState, p.id, g);
          const before = ownsFullGroup(prev as unknown as GameState, p.id, g);
          if (now && !before) { patch.highlightGroup = { group: g, until: Date.now() + 2500 }; push({ kind: 'confetti', playerId: p.id }); sfx.win(); }
        }
      }
    }
    patch.streak = streak;
    if (fx.length) patch.fx = [...get().fx, ...fx].slice(-40);
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
    auctionDeadline: null, turnDeadline: null, phaseDeadline: null, cardModal: null, selectedTile: null, dialog: null,
    fx: [], streak: {}, highlightGroup: null, lastCasino: null, lastDon: null, challengeEvents: [],
  }),

  setCardModal: v => set({ cardModal: v }),
  setSelectedTile: id => set({ selectedTile: id }),
  setDialog: d => set({ dialog: d }),
  setActiveTab: t => set({ activeTab: t, unreadChat: t === 'chat' ? 0 : get().unreadChat }),
  setRulesOpen: v => set({ rulesOpen: v }),
  pushFx: f => set(s => ({ fx: [...s.fx, { ...f, id: ++fxCounter } as FxEvent] })),
  popFx: id => set(s => ({ fx: s.fx.filter(f => f.id !== id) })),

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

function moneyFmt(thousands: number) { return '₲ ' + (thousands * 1000).toLocaleString('es-PY'); }
void BOARD;

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

// Acceso para pruebas automatizadas
if (typeof window !== 'undefined') {
  const w = window as unknown as { __nandepoly?: Record<string, unknown> };
  w.__nandepoly = { ...(w.__nandepoly ?? {}), store: useStore };
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
