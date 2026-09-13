// Prueba de servidor: un humano (script) + 5 bots juegan una partida completa vía Socket.IO.
import { io } from 'socket.io-client';

const BASE = process.argv[2] ?? 'http://localhost:8080';
const socket = io(BASE, { transports: ['websocket'] });
const ack = (ev, data) => new Promise((res, rej) => socket.emit(ev, data, r => (r?.ok ? res(r) : rej(new Error(r?.error ?? 'sin respuesta')))));

let state = null;
let me = null;
let actions = 0;
const t0 = Date.now();

socket.on('state:update', ({ state: s, events }) => {
  state = s;
  for (const e of events ?? []) {
    if (['bankrupt', 'game_over', 'auction_won', 'auction_unsold', 'trade_done', 'debt'].includes(e.type)) console.log('  ·', e.text);
  }
  setTimeout(play, 50);
});

async function play() {
  if (!state || state.phase !== 'PLAYING') return;
  const p = state.players.find(x => x.id === me);
  if (!p || p.bankrupt) return;
  const cur = state.players[state.currentPlayerIndex];
  const ph = state.turnPhase;
  try {
    if (ph === 'AUCTION' && state.auction?.activeBidders.includes(me) && state.auction.highestBidderId !== me) {
      const next = state.auction.highestBid + 10;
      if (Math.random() < 0.5 && next < p.cash / 4) await ack('game:action', { type: 'BID', amount: next });
      else await ack('game:action', { type: 'AUCTION_PASS' });
      actions++;
      return;
    }
    if (state.pendingTrade?.toId === me) { await ack('game:action', { type: 'TRADE_REJECT', tradeId: state.pendingTrade.id }); return; }
    if (cur.id !== me) return;
    if (ph === 'AWAITING_ROLL') await ack('game:action', { type: 'ROLL' });
    else if (ph === 'AWAITING_BUY') await ack('game:action', { type: Math.random() < 0.7 ? 'BUY' : 'DECLINE' }).catch(() => ack('game:action', { type: 'DECLINE' }));
    else if (ph === 'TAX_CHOICE') await ack('game:action', { type: 'TAX_CHOICE', choice: 'flat' });
    else if (ph === 'DEBT') {
      if (p.cash >= state.debt.amount) await ack('game:action', { type: 'PAY_DEBT' });
      else {
        const mine = Object.entries(state.properties).filter(([, ps]) => ps.owner === me && !ps.mortgaged);
        if (mine.length) await ack('game:action', { type: 'MORTGAGE', tileId: Number(mine[0][0]) }).catch(() => ack('game:action', { type: 'DECLARE_BANKRUPTCY' }));
        else await ack('game:action', { type: 'DECLARE_BANKRUPTCY' });
      }
    }
    else if (ph === 'END_TURN') await ack('game:action', { type: 'END_TURN' });
    actions++;
  } catch (e) {
    console.log('  (acción rechazada:', e.message, ')');
  }
}

socket.on('connect', async () => {
  const r = await ack('room:create', { name: 'Tester', token: 'mate', settings: { turnTimerSeconds: 0 } });
  me = r.playerId;
  state = r.state;
  console.log('Sala', r.roomCode);
  for (let i = 0; i < 5; i++) await ack('room:addBot', {});
  await ack('game:action', { type: 'START_GAME' });
  console.log('Partida iniciada con 5 bots');
});

const watchdog = setInterval(() => {
  if (!state) return;
  const alive = state.players.filter(p => !p.bankrupt).length;
  process.stdout.write(`\r  turno ${state.turnNumber} · fase ${state.turnPhase} · vivos ${alive} · acciones humanas ${actions} · ${Math.round((Date.now() - t0) / 1000)}s   `);
  if (state.phase === 'FINISHED') {
    const w = state.players.find(p => p.id === state.winnerId);
    console.log(`\n\n✔ Partida terminada en ${state.turnNumber} turnos. Ganó ${w?.name}.`);
    clearInterval(watchdog);
    socket.close();
    process.exit(0);
  }
  if (Date.now() - t0 > 170_000) {
    console.log(`\n\n⏱ Tope de tiempo: la partida sigue en turno ${state.turnNumber} con ${alive} jugadores vivos (sin errores).`);
    clearInterval(watchdog);
    socket.close();
    process.exit(0);
  }
}, 1000);
