import { describe, expect, it } from 'vitest';
import {
  ARENA_REWARDS, EVENTS, LOOTBOX, MISSIONS, applyAction, applyTruco, envidoValue, hasFlor, newTruco, power, rentFor, toClientState,
  type GameState,
} from '../src';
import { act, cur, give, makeGame, seedFor, setPos, withDice } from './helpers';

const full = { arena: true, lootbox: true, missions: true, events: true, duels: true, auctions: true };

describe('caja sorpresa (lootbox)', () => {
  it('reemplaza el sueldo de Salida y promedia cerca de ₲ 200.000', () => {
    const total = LOOTBOX.reduce((n, x) => n + x.weight, 0);
    const cashEV = LOOTBOX.reduce((n, x) => n + x.amount * x.weight, 0) / total;
    expect(total).toBe(100);
    expect(cashEV).toBeGreaterThan(170);
    expect(cashEV).toBeLessThan(215);
    let seen = new Set<string>();
    for (let seed = 1; seed < 60; seed++) {
      let s = makeGame(2, { lootbox: true }, seed);
      const a = cur(s).id;
      s = setPos(s, a, 42);
      s = { ...s, seed: seedFor([1, 2], seed * 977) }; // → 1
      const r = act(s, { type: 'ROLL', playerId: a });
      expect(r.state.lastLootbox?.playerId).toBe(a);
      seen.add(r.state.lastLootbox!.prize);
      expect(r.events.some(e => e.type === 'lootbox')).toBe(true);
    }
    expect(seen.size).toBeGreaterThan(4);
  });
  it('sin la opción se cobra el sueldo fijo', () => {
    let s = makeGame(2);
    const a = cur(s).id;
    const r = act(withDice(setPos(s, a, 42), [1, 2]), { type: 'ROLL', playerId: a });
    expect(r.state.players[0].cash).toBe(1700);
    expect(r.state.lastLootbox).toBeNull();
  });
});

describe('misiones secretas', () => {
  it('cada jugador recibe 3 misiones distintas y se pagan al cumplirse', () => {
    let s = makeGame(3, { missions: true });
    for (const p of s.players) {
      expect(p.missions).toHaveLength(3);
      expect(new Set(p.missions.map(m => m.id)).size).toBe(3);
    }
    const a = cur(s).id;
    const c = structuredClone(s) as GameState;
    const def = MISSIONS.find(m => m.check === 'fullGroup:marron')!;
    c.players[0].missions = [{ id: def.id, text: def.text, reward: def.reward, done: false }];
    let st = give(c, a, [1, 3]);
    const r = act(withDice(setPos(st, a, 20), [1, 1]), { type: 'ROLL', playerId: a }); // → 22 Estacionamiento
    expect(r.state.players[0].missions[0].done).toBe(true);
    expect(r.state.players[0].cash).toBe(1500 + def.reward);
    expect(r.events.some(e => e.type === 'mission_done')).toBe(true);
  });
  it('el estado para el cliente oculta las misiones ajenas', () => {
    const s = makeGame(2, { missions: true });
    const cs = toClientState(s, s.players[0].id);
    expect(cs.players[0].missions[0].text).not.toBe('???');
    expect(cs.players[1].missions[0].text).toBe('???');
    expect((cs as unknown as { seed?: number }).seed).toBeUndefined();
  });
  it('sin la opción nadie tiene misiones', () => {
    const s = makeGame(2);
    expect(s.players.every(p => p.missions.length === 0)).toBe(true);
  });
});

describe('eventos globales', () => {
  it('gira al completar una vuelta de mesa y 2 de cada 3 giros son Tranquilidad', () => {
    let calm = 0, total = 0;
    for (let seed = 1; seed <= 40; seed++) {
      let s = makeGame(2, { events: true }, seed);
      for (let i = 0; i < 30 && s.phase === 'PLAYING'; i++) s = applyAction(s, { type: 'FORCE_END_TURN', playerId: s.hostId }).state;
      total += s.eventHistory.length;
      calm += s.eventHistory.filter(e => e === 'tranquilidad').length;
    }
    expect(total).toBeGreaterThan(200);
    const ratio = calm / total;
    expect(ratio).toBeGreaterThan(0.58);
    expect(ratio).toBeLessThan(0.75);
  });
  it('los modificadores de alquiler se aplican solo mientras dura el evento', () => {
    let s = makeGame(2);
    const b = s.players[1].id;
    s = give(s, b, [7, 9, 10], 2); // Caacupé con 2 casas: 90
    s = give(s, b, [5, 16]);        // dos transportes: 50
    s = give(s, b, [13]);           // ANDE: 4x dados
    expect(rentFor(s, 7, 7)).toBe(90);
    s.activeEvent = { id: 'hora_feliz', roundsLeft: 1 };
    expect(rentFor(s, 7, 7)).toBe(180);
    s.activeEvent = { id: 'inflacion', roundsLeft: 1 };
    expect(rentFor(s, 7, 7)).toBe(135);
    s.activeEvent = { id: 'paro_ande', roundsLeft: 1 };
    expect(rentFor(s, 13, 7)).toBe(0);
    expect(rentFor(s, 5, 7)).toBe(0);
    expect(rentFor(s, 7, 7)).toBe(90);
    s.activeEvent = { id: 'corte_ruta', roundsLeft: 1 };
    expect(rentFor(s, 5, 7)).toBe(150);
    s.activeEvent = { id: 'sequia', roundsLeft: 1 };
    expect(rentFor(s, 7, 7)).toBe(90);      // con casas cobra
    s.properties[7].houses = 0; s.properties[9].houses = 0; s.properties[10].houses = 0;
    expect(rentFor(s, 7, 7)).toBe(0);       // sin casas no cobra
    s.activeEvent = null;
    expect(rentFor(s, 7, 7)).toBe(12);
  });
  it('el catálogo tiene 20 eventos con Tranquilidad primero', () => {
    expect(EVENTS).toHaveLength(20);
    expect(EVENTS[0].id).toBe('tranquilidad');
  });
});

describe('La Arena', () => {
  function openArena(seed = 3) {
    let s = makeGame(3, { arena: true }, seed);
    const a = cur(s).id;
    s = setPos(s, a, 3);
    s = withDice(s, [1, 2]); // → 6 Arena
    return act(s, { type: 'ROLL', playerId: a }).state;
  }
  it('caer en la Arena abre la votación con 3 juegos para todos', () => {
    const s = openArena();
    expect(s.turnPhase).toBe('ARENA');
    expect(s.arena?.stage).toBe('vote');
    expect(s.arena?.options).toHaveLength(3);
    expect(s.arena?.players).toHaveLength(3);
  });
  it('sin la opción la Arena es una casilla de descanso', () => {
    let s = makeGame(2);
    const a = cur(s).id;
    const r = act(withDice(setPos(s, a, 3), [1, 2]), { type: 'ROLL', playerId: a });
    expect(r.state.turnPhase).toBe('END_TURN');
    expect(r.state.arena).toBeNull();
  });
  it('trivia relámpago: puntos por acertar, el banco paga 300/150/50 y el más pobre dobla', () => {
    let s = openArena();
    const ids = s.arena!.players;
    // forzamos trivia como opción 0 y votamos todos por ella
    s.arena!.options[0] = 'trivia';
    for (const id of ids) s = applyAction(s, { type: 'ARENA_VOTE', playerId: id, option: 0 }).state;
    s = applyAction(s, { type: 'ARENA_START', playerId: 'server', now: 1000 }).state;
    expect(s.arena!.stage).toBe('play');
    expect(s.arena!.game).toBe('trivia');
    const cs = toClientState(s, ids[0]);
    expect(cs.arena!.secret).toEqual({});
    // hacemos que el primero acierte siempre y los demás fallen
    const cash0 = s.players.find(p => p.id === ids[0])!.cash;
    let guard = 0;
    while (s.arena && s.arena.stage === 'play' && guard++ < 50) {
      const answer = s.arena.secret.answer as number;
      for (const id of ids) {
        if (!s.arena || s.arena.stage !== 'play') break;
        s = applyAction(s, { type: 'ARENA_MOVE', playerId: id, now: 2000, payload: { answer: id === ids[0] ? answer : (answer + 1) % 4 } }).state;
      }
    }
    expect(s.arena!.stage).toBe('done');
    expect(s.arena!.ranking![0]).toBe(ids[0]);
    expect(s.players.find(p => p.id === ids[0])!.cash).toBe(cash0 + ARENA_REWARDS[0]); // todos empatados en patrimonio: sin x2
    expect(s.arena!.rewards![s.arena!.ranking![1]]).toBe(ARENA_REWARDS[1]);
    s = applyAction(s, { type: 'ARENA_END', playerId: 'server' }).state;
    expect(s.arena).toBeNull();
    expect(s.turnPhase).toBe('END_TURN');
  });
  it('FORCE_END_TURN cierra la Arena y sigue la partida', () => {
    let s = openArena();
    s = applyAction(s, { type: 'FORCE_END_TURN', playerId: s.hostId }).state;
    expect(s.arena).toBeNull();
    expect(s.turnPhase).toBe('AWAITING_ROLL');
  });
});

describe('duelos mayores', () => {
  function withTokens(seed = 5) {
    let s = makeGame(2, { duels: true }, seed);
    s.players[0].duelTokens = 1;
    return s;
  }
  it('se gana una ficha cada 3 vueltas', () => {
    let s = makeGame(2, { duels: true });
    const a = cur(s).id;
    s.players[0].lapsCompleted = 2;
    const r = act(withDice(setPos(s, a, 42), [1, 2]), { type: 'ROLL', playerId: a });
    expect(r.state.players[0].duelTokens).toBe(1);
    expect(r.events.some(e => e.type === 'duel_token')).toBe(true);
  });
  it('rechazar cuesta ₲ 50.000 y devuelve la ficha', () => {
    let s = withTokens();
    const [a, b] = s.players.map(p => p.id);
    let r = act(s, { type: 'DUEL_PROPOSE', playerId: a, toId: b, game: 'escopeta', amount: 200 });
    expect(r.state.turnPhase).toBe('DUEL');
    expect(r.state.players[0].duelTokens).toBe(0);
    r = act(r.state, { type: 'DUEL_REJECT', playerId: b });
    expect(r.state.duel).toBeNull();
    expect(r.state.players[1].cash).toBe(1450);
    expect(r.state.players[0].cash).toBe(1550);
    expect(r.state.players[0].duelTokens).toBe(1);
    expect(r.state.turnPhase).toBe('AWAITING_ROLL');
  });
  it('la apuesta va de 50 a 500 y hace falta ficha', () => {
    const s = withTokens();
    const [a, b] = s.players.map(p => p.id);
    expect(() => act(s, { type: 'DUEL_PROPOSE', playerId: a, toId: b, game: 'truco', amount: 600 })).toThrow('apuesta');
    expect(() => act(s, { type: 'DUEL_PROPOSE', playerId: b, toId: a, game: 'truco', amount: 100 })).toThrow();
  });
  it('escopeta: se juega hasta que alguien pierde 3 vidas y el ganador cobra la apuesta', () => {
    let s = withTokens(9);
    const [a, b] = s.players.map(p => p.id);
    s = act(s, { type: 'DUEL_PROPOSE', playerId: a, toId: b, game: 'escopeta', amount: 300 }).state;
    s = act(s, { type: 'DUEL_ACCEPT', playerId: b }).state;
    expect(s.duel!.status).toBe('playing');
    expect(s.duel!.data.lives).toEqual({ [a]: 3, [b]: 3 });
    const cs = toClientState(s, a);
    expect(cs.duel!.secret).toEqual({});
    let guard = 0;
    let done: { winner: string; loser: string; amount: number } | null = null;
    const step = (st: GameState, action: Parameters<typeof applyAction>[1]) => { const r = applyAction(st, action); const e = r.events.find(x => x.type === 'duel_done'); if (e) done = e.data as typeof done; return r.state; };
    while (s.duel && s.duel.status === 'playing' && guard++ < 200) {
      const turn = s.duel.turn;
      const items = (s.duel.data.items as Record<string, string[]>)[turn];
      if (items.includes('lupa')) {
        s = step(s, { type: 'DUEL_MOVE', playerId: turn, move: { kind: 'item', item: 'lupa' } });
        const peek = toClientState(s, turn).duel!.data.peek as Record<string, string>;
        expect(['live', 'blank']).toContain(peek[turn]);
        const other = turn === a ? b : a;
        expect((toClientState(s, other).duel!.data.peek as Record<string, string>)[turn]).toBeUndefined();
        const target = peek[turn] === 'blank' ? 'self' : 'opp';
        s = step(s, { type: 'DUEL_MOVE', playerId: turn, move: { kind: 'shoot', target } });
      } else {
        s = step(s, { type: 'DUEL_MOVE', playerId: turn, move: { kind: 'shoot', target: 'opp' } });
      }
    }
    expect(done).not.toBeNull();
    const w = done!.winner, l = done!.loser;
    expect(done!.amount).toBe(300);
    expect(s.players.find(p => p.id === w)!.cash).toBe(1800);
    expect(s.players.find(p => p.id === l)!.cash).toBe(1200);
    expect(s.duel).toBeNull();
    expect(s.turnPhase).toBe('AWAITING_ROLL');
  });
  it('truco: la mano propia solo la ve su dueño', () => {
    let s = withTokens(11);
    const [a, b] = s.players.map(p => p.id);
    s = act(s, { type: 'DUEL_PROPOSE', playerId: a, toId: b, game: 'truco', amount: 100 }).state;
    s = act(s, { type: 'DUEL_ACCEPT', playerId: b }).state;
    const ca = toClientState(s, a), cb = toClientState(s, b), spectator = toClientState(s);
    expect(ca.mine!.trucoHand).toHaveLength(3);
    expect(cb.mine!.trucoHand).toHaveLength(3);
    expect(ca.mine!.trucoHand).not.toEqual(cb.mine!.trucoHand);
    expect(spectator.mine).toBeNull();
    expect(ca.duel!.secret).toEqual({});
  });
});

describe('truco (módulo puro)', () => {
  it('jerarquía de cartas y envido', () => {
    expect(power({ r: 1, s: 'espada' })).toBeGreaterThan(power({ r: 1, s: 'basto' }));
    expect(power({ r: 7, s: 'espada' })).toBeGreaterThan(power({ r: 7, s: 'oro' }));
    expect(power({ r: 3, s: 'copa' })).toBeGreaterThan(power({ r: 2, s: 'espada' }));
    expect(power({ r: 1, s: 'copa' })).toBeGreaterThan(power({ r: 12, s: 'espada' }));
    expect(power({ r: 7, s: 'copa' })).toBeLessThan(power({ r: 10, s: 'copa' }));
    expect(envidoValue([{ r: 7, s: 'oro' }, { r: 6, s: 'oro' }, { r: 2, s: 'copa' }])).toBe(33);
    expect(envidoValue([{ r: 12, s: 'oro' }, { r: 11, s: 'oro' }, { r: 2, s: 'copa' }])).toBe(20);
    expect(envidoValue([{ r: 12, s: 'oro' }, { r: 5, s: 'basto' }, { r: 2, s: 'copa' }])).toBe(5);
    expect(hasFlor([{ r: 1, s: 'oro' }, { r: 5, s: 'oro' }, { r: 2, s: 'oro' }])).toBe(true);
    expect(hasFlor([{ r: 1, s: 'oro' }, { r: 5, s: 'oro' }, { r: 2, s: 'copa' }])).toBe(false);
  });
  it('una partida completa al azar termina con alguien en 15', () => {
    let st = newTruco('A', 'B', 7);
    let rs = 99;
    const rnd = () => { rs = (rs * 1103515245 + 12345) % 2147483648; return rs / 2147483648; };
    let guard = 0;
    while (!st.pub.finished && guard++ < 5000) {
      const p = st.pub;
      try {
        if (p.pending) { st = applyTruco(st, p.pending.by === 'A' ? 'B' : 'A', { kind: 'call', what: rnd() < 0.5 ? 'quiero' : 'no_quiero' }); continue; }
        const k = rnd();
        if (k < 0.1) st = applyTruco(st, p.turn, { kind: 'call', what: 'envido' });
        else if (k < 0.2) st = applyTruco(st, p.turn, { kind: 'call', what: 'truco' });
        else st = applyTruco(st, p.turn, { kind: 'play', card: Math.floor(rnd() * st.sec.hands[p.turn].length) });
      } catch { /* jugada ilegal aleatoria */ }
    }
    expect(st.pub.finished).toBe(true);
    expect(Math.max(st.pub.scores.A, st.pub.scores.B)).toBeGreaterThanOrEqual(15);
    expect(st.pub.winner).toBeTruthy();
  });
});

describe('estado del cliente', () => {
  it('elimina mazos y semilla y agrega conteos', () => {
    const s = makeGame(2, full);
    const cs = toClientState(s, s.players[0].id) as unknown as Record<string, unknown>;
    expect(cs.decks).toBeUndefined();
    expect(cs.seed).toBeUndefined();
    expect(cs.deckCounts).toEqual({ chance: 16, community: 16 });
  });
});
