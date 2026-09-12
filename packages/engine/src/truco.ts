// Truco paraguayo mano a mano (dos jugadores), a 15 puntos, con envido, flor, truco/retruco/vale cuatro.
// Lógica pura: recibe un estado y una jugada, devuelve el nuevo estado y mensajes. El reducer se ocupa del dinero.
import { nextRandom, shuffle } from './rng';

export type Suit = 'espada' | 'basto' | 'oro' | 'copa';
export interface TCard { r: number; s: Suit } // r: 1,2,3,4,5,6,7,10,11,12

export type TrucoCall = 'envido' | 'real' | 'falta' | 'truco' | 'retruco' | 'vale4' | 'quiero' | 'no_quiero' | 'mazo' | 'flor';
export type TrucoMove = { kind: 'play'; card: number } | { kind: 'call'; what: TrucoCall };

export interface TrucoPublic {
  scores: Record<string, number>;
  target: number;
  maxHands: number;                   // se juegan como máximo estas manos; gana el que va adelante (empate: una más)
  hand: number;                       // número de mano
  dealer: string;                     // el "pie"
  mano: string;                       // el que juega primero
  turn: string;                       // a quién le toca actuar (jugar o responder)
  table: { [pid: string]: (TCard | null)[] }; // cartas jugadas por baza (índice 0..2)
  baza: number;                       // baza actual 0..2
  bazaWinners: (string | 'parda')[];
  handValue: number;                  // 1, 2 (truco), 3 (retruco), 4 (vale cuatro)
  trucoLevel: number;                 // 0 nada, 1 truco, 2 retruco, 3 vale4 (aceptados)
  trucoCallerLast: string | null;     // quién cantó el último truco aceptado (solo él puede subir... simplificado: el rival)
  pending: { type: 'envido' | 'truco'; level: number; by: string } | null; // canto que espera respuesta
  envidoDone: boolean;
  envidoChain: ('envido' | 'real' | 'falta')[];
  envidoPoints: number;               // puntos en juego del envido aceptado hasta ahora (si se rechaza, se gana lo anterior)
  cardCount: Record<string, number>;  // cuántas cartas le quedan a cada uno
  log: string[];
  finished: boolean;
  winner: string | null;
  lastEnvido: { [pid: string]: number } | null; // valores revelados
  flor: { [pid: string]: boolean };
  turnAfterCall?: string;             // a quién le tocaba antes del canto pendiente
}

export interface TrucoSecret { hands: Record<string, TCard[]>; seed: number }
export interface TrucoState { pub: TrucoPublic; sec: TrucoSecret }

const RANKS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];
const SUITS: Suit[] = ['espada', 'basto', 'oro', 'copa'];

/** Fuerza de la carta en el truco (mayor = gana). */
export function power(c: TCard): number {
  if (c.r === 1 && c.s === 'espada') return 14;
  if (c.r === 1 && c.s === 'basto') return 13;
  if (c.r === 7 && c.s === 'espada') return 12;
  if (c.r === 7 && c.s === 'oro') return 11;
  if (c.r === 3) return 10;
  if (c.r === 2) return 9;
  if (c.r === 1) return 8;
  if (c.r === 12) return 7;
  if (c.r === 11) return 6;
  if (c.r === 10) return 5;
  if (c.r === 7) return 4;
  if (c.r === 6) return 3;
  if (c.r === 5) return 2;
  return 1; // 4
}

const envVal = (c: TCard) => (c.r >= 10 ? 0 : c.r);

export function envidoValue(hand: TCard[]): number {
  let best = 0;
  for (const c of hand) best = Math.max(best, envVal(c));
  for (let i = 0; i < hand.length; i++) for (let j = i + 1; j < hand.length; j++) {
    if (hand[i].s === hand[j].s) best = Math.max(best, 20 + envVal(hand[i]) + envVal(hand[j]));
  }
  return best;
}

export function hasFlor(hand: TCard[]): boolean {
  return hand.length === 3 && hand.every(c => c.s === hand[0].s);
}

export function cardName(c: TCard): string {
  const names: Record<number, string> = { 1: 'As', 2: 'Dos', 3: 'Tres', 4: 'Cuatro', 5: 'Cinco', 6: 'Seis', 7: 'Siete', 10: 'Sota', 11: 'Caballo', 12: 'Rey' };
  return `${names[c.r]} de ${c.s}`;
}

export function newTruco(a: string, b: string, seed: number, target = 15, maxHands = 3): TrucoState {
  const st: TrucoState = {
    pub: {
      scores: { [a]: 0, [b]: 0 }, target, maxHands, hand: 0, dealer: b, mano: a, turn: a, table: { [a]: [], [b]: [] },
      baza: 0, bazaWinners: [], handValue: 1, trucoLevel: 0, trucoCallerLast: null, pending: null, envidoDone: false,
      envidoChain: [], envidoPoints: 0, cardCount: { [a]: 3, [b]: 3 }, log: [], finished: false, winner: null, lastEnvido: null, flor: {},
    },
    sec: { hands: {}, seed },
  };
  deal(st);
  return st;
}

function other(st: TrucoState, pid: string): string {
  return Object.keys(st.pub.scores).find(x => x !== pid)!;
}

function deal(st: TrucoState) {
  const p = st.pub;
  p.hand++;
  // alternar dealer a partir de la segunda mano
  if (p.hand > 1) { const d = p.dealer; p.dealer = p.mano; p.mano = d; }
  const deck: TCard[] = [];
  for (const s of SUITS) for (const r of RANKS) deck.push({ r, s });
  const sh = shuffle(deck, st.sec.seed);
  st.sec.seed = sh.seed;
  const [a, b] = [p.mano, p.dealer];
  st.sec.hands = { [a]: sh.items.slice(0, 3), [b]: sh.items.slice(3, 6) };
  p.table = { [a]: [], [b]: [] };
  p.baza = 0; p.bazaWinners = []; p.handValue = 1; p.trucoLevel = 0; p.trucoCallerLast = null; p.pending = null;
  p.envidoDone = false; p.envidoChain = []; p.envidoPoints = 0; p.cardCount = { [a]: 3, [b]: 3 }; p.lastEnvido = null;
  p.turn = p.mano;
  p.flor = { [a]: hasFlor(st.sec.hands[a]), [b]: hasFlor(st.sec.hands[b]) };
  p.log.push(`Mano ${p.hand}: reparte ${p.dealer}, es mano ${p.mano}.`);
  // Flor: se canta sola y vale 3 (si los dos tienen, gana la mayor)
  const fa = p.flor[a], fb = p.flor[b];
  if (fa || fb) {
    p.envidoDone = true;
    if (fa && fb) {
      const va = envidoValue(st.sec.hands[a]), vb = envidoValue(st.sec.hands[b]);
      const w = va >= vb ? a : b;
      p.scores[w] += 3;
      p.log.push(`¡Flor contra flor! ${a} ${va} vs ${b} ${vb}: 3 puntos para ${w}.`);
    } else {
      const w = fa ? a : b;
      p.scores[w] += 3;
      p.log.push(`¡${w} canta flor! 3 puntos.`);
    }
    checkEnd(st);
  }
}

function checkEnd(st: TrucoState, handOver = false): boolean {
  const p = st.pub;
  for (const id of Object.keys(p.scores)) {
    if (p.scores[id] >= p.target) { p.finished = true; p.winner = id; p.log.push(`${id} llegó a ${p.target}. ¡Ganó el truco!`); return true; }
  }
  if (handOver && p.hand >= p.maxHands) {
    const [x, y] = Object.keys(p.scores);
    if (p.scores[x] !== p.scores[y]) {
      const w = p.scores[x] > p.scores[y] ? x : y;
      p.finished = true; p.winner = w; p.log.push(`Se jugaron ${p.hand} manos: gana ${w} ${p.scores[w]} a ${p.scores[w === x ? y : x]}.`);
      return true;
    }
    p.log.push('Empate tras las manos pactadas: ¡una mano más de desempate!');
  }
  return false;
}

/** Aplica una jugada. Lanza Error si es ilegal. */
export function applyTruco(st: TrucoState, pid: string, move: TrucoMove): TrucoState {
  const s: TrucoState = structuredClone(st);
  const p = s.pub;
  if (p.finished) throw new Error('El truco ya terminó.');
  const opp = other(s, pid);

  if (move.kind === 'call') return applyCall(s, pid, opp, move.what);

  // Jugar carta
  if (p.turn !== pid) throw new Error('No es tu turno.');
  if (p.pending) throw new Error('Primero respondé el canto.');
  const hand = s.sec.hands[pid];
  if (move.card < 0 || move.card >= hand.length) throw new Error('Carta inválida.');
  const card = hand.splice(move.card, 1)[0];
  p.table[pid][p.baza] = card;
  p.cardCount[pid] = hand.length;
  p.log.push(`${pid} juega ${cardName(card)}.`);
  const oppCard = p.table[opp][p.baza];
  if (!oppCard) { p.turn = opp; return s; }
  // Resolver baza
  const a = power(card), b = power(oppCard);
  const winner = a === b ? 'parda' : a > b ? pid : opp;
  p.bazaWinners.push(winner);
  p.log.push(winner === 'parda' ? 'Baza parda.' : `Baza para ${winner}.`);
  const hw = handWinner(p);
  if (hw) return endHand(s, hw, p.handValue);
  p.baza++;
  // El ganador de la baza (o el mano si fue parda) juega primero
  p.turn = winner === 'parda' ? p.mano : winner;
  return s;
}

function handWinner(p: TrucoPublic): string | null {
  const w = p.bazaWinners;
  const ids = Object.keys(p.scores);
  const count = (id: string) => w.filter(x => x === id).length;
  for (const id of ids) if (count(id) >= 2) return id;
  if (w.length >= 2) {
    // primera parda: gana quien gane la segunda
    if (w[0] === 'parda' && w[1] !== 'parda') return w[1];
    // segunda parda: gana quien ganó la primera
    if (w[1] === 'parda' && w[0] !== 'parda') return w[0];
  }
  if (w.length === 3) {
    if (w[2] !== 'parda') return w[2];
    // tres pardas o primera ganada y las otras pardas
    const first = w.find(x => x !== 'parda');
    return first ?? p.mano;
  }
  return null;
}

function applyCall(s: TrucoState, pid: string, opp: string, what: TrucoCall): TrucoState {
  const p = s.pub;
  const pend = p.pending;

  if (what === 'mazo') {
    if (pend && pend.by === pid) throw new Error('Esperá la respuesta.');
    p.log.push(`${pid} se va al mazo.`);
    // si hay envido cantado y no respondido por el que se va, el otro se lleva lo cantado como no querido
    let pts = p.handValue;
    if (pend?.type === 'truco') pts = p.handValue; // se rechaza implícitamente: vale lo anterior
    if (pend?.type === 'envido' && pend.by === opp) p.scores[opp] += Math.max(1, p.envidoPoints);
    if (!p.envidoDone && p.baza === 0 && p.table[pid].length === 0 && p.table[opp].length === 0) pts = Math.max(pts, 2); // irse al mazo antes de jugar da 2
    return endHand(s, opp, pts);
  }

  if (what === 'quiero' || what === 'no_quiero') {
    if (!pend) throw new Error('No hay nada que responder.');
    if (pend.by === pid) throw new Error('Tenés que esperar la respuesta.');
    if (pend.type === 'envido') {
      p.envidoDone = true;
      p.pending = null;
      if (what === 'quiero') {
        const va = envidoValue(s.sec.hands[pid]), vb = envidoValue(s.sec.hands[opp]);
        p.lastEnvido = { [pid]: va, [opp]: vb };
        const mano = p.mano;
        const w = va === vb ? mano : va > vb ? pid : opp;
        const pts = pendingEnvidoPoints(p);
        p.scores[w] += pts;
        p.log.push(`Quiero. ${pid} ${va} vs ${opp} ${vb}: ${pts} punto(s) para ${w}.`);
      } else {
        const prev = p.envidoPoints || 1;
        p.scores[opp] += prev;
        p.log.push(`No quiero. ${prev} punto(s) para ${opp}.`);
      }
      if (checkEnd(s)) return s;
      p.turn = p.turnAfterCall ?? p.turn; p.turnAfterCall = undefined;
      return s;
    }
    // truco
    p.pending = null;
    if (what === 'quiero') {
      p.trucoLevel = pend.level;
      p.handValue = pend.level + 1;
      p.trucoCallerLast = pend.by;
      p.log.push(`Quiero. La mano vale ${p.handValue}.`);
      p.turn = p.turnAfterCall ?? p.turn; p.turnAfterCall = undefined;
      return s;
    }
    p.log.push(`No quiero.`);
    return endHand(s, opp, p.handValue);
  }

  if (what === 'envido' || what === 'real' || what === 'falta') {
    if (p.envidoDone) throw new Error('El envido ya se jugó.');
    if (p.baza !== 0) throw new Error('El envido solo se canta en la primera baza.');
    if (pend && pend.type === 'truco') throw new Error('Hay un truco cantado; "el envido está primero" solo antes de responder.'); // simplificación
    if (pend && pend.type === 'envido') {
      if (pend.by === pid) throw new Error('Esperá la respuesta.');
      const order = ['envido', 'real', 'falta'];
      const last = p.envidoChain[p.envidoChain.length - 1];
      if (order.indexOf(what) <= order.indexOf(last) && !(what === 'envido' && last === 'envido' && p.envidoChain.length === 1)) throw new Error('Tenés que subir el envido.');
    } else {
      if (p.turn !== pid && p.table[pid].length > 0) throw new Error('No podés cantar envido ahora.');
      if (p.table[pid].length > 0) throw new Error('Ya jugaste carta: no podés cantar envido.');
    }
    p.envidoPoints = pendingEnvidoPoints(p); // lo que vale si se rechaza el nuevo canto
    p.envidoChain.push(what);
    p.turnAfterCall = p.turnAfterCall ?? p.turn;
    p.pending = { type: 'envido', level: p.envidoChain.length, by: pid };
    p.turn = opp;
    p.log.push(`${pid} canta ${what === 'envido' ? 'envido' : what === 'real' ? 'real envido' : 'falta envido'}.`);
    return s;
  }

  if (what === 'truco' || what === 'retruco' || what === 'vale4') {
    if (pend) throw new Error('Hay un canto pendiente.');
    const level = what === 'truco' ? 1 : what === 'retruco' ? 2 : 3;
    if (level !== p.trucoLevel + 1) throw new Error('Ese canto no corresponde ahora.');
    if (p.trucoLevel > 0 && p.trucoCallerLast === pid) throw new Error('Solo el rival puede subir el truco.');
    if (p.turn !== pid) throw new Error('Cantá en tu turno.');
    p.turnAfterCall = p.turn;
    p.pending = { type: 'truco', level, by: pid };
    p.turn = opp;
    p.log.push(`${pid} canta ${what === 'truco' ? '¡Truco!' : what === 'retruco' ? '¡Quiero retruco!' : '¡Quiero vale cuatro!'}`);
    return s;
  }

  throw new Error('Jugada inválida.');
}

function pendingEnvidoPoints(p: TrucoPublic): number {
  // envido=2, envido+envido=4, real=3 (se suma), falta = lo que le falta al que va ganando
  let pts = 0;
  for (const c of p.envidoChain) {
    if (c === 'envido') pts += 2;
    else if (c === 'real') pts += 3;
    else if (c === 'falta') { const max = Math.max(...Object.values(p.scores)); pts = Math.max(pts, p.target - max); }
  }
  return pts;
}

function endHand(s: TrucoState, winner: string, pts: number): TrucoState {
  const p = s.pub;
  p.scores[winner] += pts;
  p.log.push(`Mano para ${winner}: ${pts} punto(s). (${Object.entries(p.scores).map(([k, v]) => `${k} ${v}`).join(' · ')})`);
  p.pending = null; p.turnAfterCall = undefined;
  if (checkEnd(s, true)) return s;
  deal(s);
  return s;
}
