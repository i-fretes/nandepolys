import { describe, expect, it } from 'vitest';
import {
  ARENA_GAMES, ARENA_REWARDS, BLURRY, CARRETA_PAYOUT, CHAINS, CUANTOS, EVENTS, QUINIELA_PAYOUT, RULETA_WIN_CHANCE, TRIVIA, LOOTBOX, MISSIONS, applyAction, applyTruco, envidoValue, hasFlor, newTruco, power, rentFor, sapoPos, toClientState,
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
    expect(() => applyAction(s, { type: 'ARENA_MOVE', playerId: ids[0], now: 1500, payload: { answer: 0 } })).toThrow('cuenta regresiva');
    expect(s.arena!.game).toBe('trivia');
    const cs = toClientState(s, ids[0]);
    expect(cs.arena!.secret).toEqual({});
    // hacemos que el primero acierte siempre y los demás fallen
    const cash0 = s.players.find(p => p.id === ids[0])!.cash;
    let guard = 0;
    let now = 5000;
    while (s.arena && s.arena.stage === 'play' && guard++ < 50) {
      const answer = s.arena.secret.answer as number;
      for (const id of ids) {
        if (!s.arena || s.arena.stage !== 'play') break;
        s = applyAction(s, { type: 'ARENA_MOVE', playerId: id, now, payload: { answer: id === ids[0] ? answer : (answer + 1) % 4 } }).state;
      }
      // fase de revelación: se ve la respuesta y lo que puso cada uno; el tick avanza a la siguiente pregunta
      expect(s.arena!.data.reveal).toBe(answer);
      expect((s.arena!.data.answered as Record<string, number>)[ids[1]]).toBe((answer + 1) % 4);
      now += 4000;
      s = applyAction(s, { type: 'ARENA_TICK', playerId: 'server', now }).state;
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
    let st = newTruco('A', 'B', 7, 15, 99);
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

describe('v1.3.2', () => {
  it('carrera de sapos: avanzan solos, el charco elimina y el ranking premia a quien llega', () => {
    let s = makeGame(3, { arena: true }, 8);
    const a = cur(s).id;
    s = act(withDice(setPos(s, a, 3), [1, 2]), { type: 'ROLL', playerId: a }).state;
    const ids = s.arena!.players;
    s.arena!.options[0] = 'sapos';
    for (const id of ids) s = applyAction(s, { type: 'ARENA_VOTE', playerId: id, option: 0 }).state;
    s = applyAction(s, { type: 'ARENA_START', playerId: 'server', now: 1000 }).state;
    const d = s.arena!.data as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(d.track).toHaveLength(60);
    expect((d.track as number[]).every((v, i, arr) => v < 0 || i === 0 || arr[i - 1] < 0)).toBe(true);
    const start = s.arena!.startedAt!;
    const firstPuddleRow = (d.track as number[]).findIndex(v => v === 1);
    let now = start, guard = 0;
    while (s.arena && s.arena.stage === 'play' && guard++ < 400) {
      now += 100;
      const dd = s.arena.data as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      const row = Math.floor(sapoPos(now - start));
      for (const id of ids.slice(1)) {
        const bad = (dd.track as number[])[Math.min(59, row + 1)], here = (dd.track as number[])[Math.min(59, row)];
        const lane = (dd.lane as Record<string, number>)[id];
        if (bad === lane || here === lane) { const safe = [0, 1, 2].find(l => l !== bad && l !== here)!; try { s = applyAction(s, { type: 'ARENA_MOVE', playerId: id, now, payload: { lane: safe } }).state; } catch { /* terminó */ } }
      }
      if (s.arena?.stage === 'play') s = applyAction(s, { type: 'ARENA_TICK', playerId: 'server', now }).state;
    }
    const dd = s.arena!.data as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(s.arena!.stage).toBe('done');
    expect(dd.out[ids[0]]).toBe(firstPuddleRow);
    expect(s.arena!.ranking![2]).toBe(ids[0]);
  });

  it('el truco del duelo se define en 2 manos (empate: una más)', () => {
    let st = newTruco('A', 'B', 3, 15, 2);
    let rs = 7;
    const rnd = () => { rs = (rs * 1103515245 + 12345) % 2147483648; return rs / 2147483648; };
    let guard = 0;
    while (!st.pub.finished && guard++ < 2000) {
      const p = st.pub;
      try {
        if (p.pending) { st = applyTruco(st, p.pending.by === 'A' ? 'B' : 'A', { kind: 'call', what: 'quiero' }); continue; }
        st = applyTruco(st, p.turn, { kind: 'play', card: Math.floor(rnd() * st.sec.hands[p.turn].length) });
      } catch { /* ilegal */ }
    }
    expect(st.pub.finished).toBe(true);
    expect(st.pub.hand).toBeGreaterThanOrEqual(2);
    expect(st.pub.scores[st.pub.winner!]).toBeGreaterThan(st.pub.scores[st.pub.winner === 'A' ? 'B' : 'A']);
    expect(st.pub.hand).toBeLessThanOrEqual(4);
  });

  it('en la Arena, el que tiene menos efectivo cobra doble si gana (también de a dos)', () => {
    let s = makeGame(2, { arena: true }, 4);
    const a = cur(s).id, b = s.players.find(p => p.id !== a)!.id;
    s.players.find(p => p.id === a)!.cash = 900; // el más pobre
    s = act(withDice(setPos(s, a, 3), [1, 2]), { type: 'ROLL', playerId: a }).state;
    s.arena!.options[0] = 'cuantos';
    for (const id of [a, b]) s = applyAction(s, { type: 'ARENA_VOTE', playerId: id, option: 0 }).state;
    s = applyAction(s, { type: 'ARENA_START', playerId: 'server', now: 0 }).state;
    const answer = s.arena!.secret.answer as number;
    s = applyAction(s, { type: 'ARENA_MOVE', playerId: a, now: 5000, payload: { value: answer } }).state;
    s = applyAction(s, { type: 'ARENA_MOVE', playerId: b, now: 5000, payload: { value: answer + 50 } }).state;
    expect(s.arena!.stage).toBe('done');
    expect(s.arena!.rewards![a]).toBe(ARENA_REWARDS[0] * 2);
    expect(s.arena!.data.doubled).toBe(a);
    expect(s.arena!.data.answer).toBe(answer);
  });

  it('los eventos instantáneos mueven la plata: aguinaldo +100 a todos y Control de la SET −10 % al más rico', () => {
    let seenAguinaldo = false, seenSet = false;
    for (let seed = 1; seed <= 60 && !(seenAguinaldo && seenSet); seed++) {
      let s = makeGame(3, { events: true }, seed);
      for (let i = 0; i < 40 && s.phase === 'PLAYING'; i++) {
        const before = s.players.map(p => p.cash);
        const mover = s.players[s.currentPlayerIndex].id;
        const r = applyAction(s, { type: 'FORCE_END_TURN', playerId: s.hostId });
        const spin = r.events.find(e => e.type === 'event_spin');
        // lo que recibió cada uno por alquileres en la misma acción (el que movió puede haber pagado)
        const rentTo = (id: string) => r.events.filter(e => e.type === 'rent' && e.data?.to === id).reduce((n, e) => n + (e.data!.amount as number), 0);
        if (spin?.data?.eventId === 'aguinaldo') {
          r.state.players.forEach((p, i) => { if (!p.bankrupt && p.id !== mover) expect(p.cash).toBe(before[i] + 100 + rentTo(p.id)); });
          seenAguinaldo = true;
        }
        if (spin?.data?.eventId === 'control_set') {
          const ev = r.events.find(e => e.type === 'expense' && e.text.startsWith('Control de la SET'))!;
          expect(ev).toBeTruthy();
          const idx = r.state.players.findIndex(p => p.id === ev.playerId);
          const cashAtSpin = before[idx] + (ev.playerId !== mover ? rentTo(ev.playerId!) : 0);
          if (ev.playerId !== mover) expect(r.state.players[idx].cash).toBe(cashAtSpin - (ev.data!.amount as number));
          expect(ev.data!.amount).toBeGreaterThan(0);
          seenSet = true;
        }
        s = r.state;
      }
    }
    expect(seenAguinaldo && seenSet).toBe(true);
  });
});

describe('v1.3.4: juegos nuevos de la Arena', () => {
  function arenaWith(game: string, n = 3, seed = 12) {
    let s = makeGame(n, { arena: true }, seed);
    const a = cur(s).id;
    s = act(withDice(setPos(s, a, 3), [1, 2]), { type: 'ROLL', playerId: a }).state;
    s.arena!.options[0] = game as never;
    for (const id of s.arena!.players) s = applyAction(s, { type: 'ARENA_VOTE', playerId: id, option: 0 }).state;
    s = applyAction(s, { type: 'ARENA_START', playerId: 'server', now: 0 }).state;
    return { s, ids: s.arena!.players, trig: a };
  }
  const D = (s: GameState) => s.arena!.data as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

  it('hay 16 juegos y los de 3+ no se ofrecen de a dos', () => {
    expect(ARENA_GAMES).toHaveLength(16);
    for (let seed = 1; seed < 30; seed++) {
      let s = makeGame(2, { arena: true }, seed);
      const a = cur(s).id;
      s = act(withDice(setPos(s, a, 3), [1, 2]), { type: 'ROLL', playerId: a }).state;
      expect(s.arena!.options).not.toContain('cartas');
      expect(s.arena!.options).not.toContain('bomba2');
    }
  });

  it('Cartas contra el Paraguay: manos privadas, juez rota, 3 rondas', () => {
    let { s, ids } = arenaWith('cartas');
    let now = 5000;
    for (let round = 1; round <= 3; round++) {
      const judge = D(s).judge as string;
      expect(judge).toBe(ids[round - 1]);
      for (const id of ids) {
        const hand = toClientState(s, id).mine!.arenaHand!;
        expect(hand).toHaveLength(6);
        expect(toClientState(s, ids.find(x => x !== id)!).mine!.arenaHand).not.toEqual(hand);
        if (id === judge) { if (D(s).stage === 'pick') expect(() => applyAction(s, { type: 'ARENA_MOVE', playerId: id, now, payload: { card: 0 } })).toThrow('juez'); continue; }
        s = applyAction(s, { type: 'ARENA_MOVE', playerId: id, now, payload: { card: 2 } }).state;
        expect(toClientState(s, id).mine!.arenaHand).toHaveLength(6); // repone
      }
      expect(D(s).stage).toBe('judge');
      expect((D(s).played as string[]).length).toBe(ids.length - 1);
      expect(toClientState(s, judge).arena!.secret).toEqual({});
      s = applyAction(s, { type: 'ARENA_MOVE', playerId: judge, now, payload: { pick: 0 } }).state;
      expect(D(s).stage).toBe('result');
      now += 5000;
      s = applyAction(s, { type: 'ARENA_TICK', playerId: 'server', now }).state;
    }
    expect(s.arena!.stage).toBe('done');
    expect(Object.values(s.arena!.scores).reduce((a, b) => a + b, 0)).toBe(3);
  });

  it('La foto borrosa: el primero que acierta gana la ronda, el que erra queda afuera de la ronda', () => {
    let { s, ids } = arenaWith('borrosa');
    s = applyAction(s, { type: 'ARENA_TICK', playerId: 'server', now: 4000 }).state;
    const ans = s.arena!.secret.answer as number;
    expect(toClientState(s, ids[0]).arena!.secret).toEqual({});
    s = applyAction(s, { type: 'ARENA_MOVE', playerId: ids[1], now: 5000, payload: { answer: (ans + 1) % 4 } }).state;
    expect(() => applyAction(s, { type: 'ARENA_MOVE', playerId: ids[1], now: 5000, payload: { answer: ans } })).toThrow('Ya respondiste');
    s = applyAction(s, { type: 'ARENA_MOVE', playerId: ids[0], now: 5100, payload: { answer: ans } }).state;
    expect(s.arena!.scores[ids[0]]).toBe(3);
    expect(D(s).reveal).toBe(ans);
    expect(() => applyAction(s, { type: 'ARENA_MOVE', playerId: ids[2], now: 5200, payload: { answer: ans } })).toThrow('Esperá');
    s = applyAction(s, { type: 'ARENA_TICK', playerId: 'server', now: 9000 }).state;
    expect(D(s).qIndex).toBe(1);
    expect(D(s).reveal).toBeNull();
  });

  it('Ordená la cadena: puntos por posición correcta', () => {
    let { s, ids } = arenaWith('cadena');
    s = applyAction(s, { type: 'ARENA_TICK', playerId: 'server', now: 4000 }).state;
    const correct = s.arena!.secret.correct as number[];
    s = applyAction(s, { type: 'ARENA_MOVE', playerId: ids[0], now: 5000, payload: { order: correct } }).state;
    s = applyAction(s, { type: 'ARENA_MOVE', playerId: ids[1], now: 5000, payload: { order: [...correct].reverse() } }).state;
    expect(() => applyAction(s, { type: 'ARENA_MOVE', playerId: ids[2], now: 5000, payload: { order: [0, 0, 1, 2] } })).toThrow('cuatro');
    s = applyAction(s, { type: 'ARENA_TICK', playerId: 'server', now: 4000 + 26000 }).state; // se le acabó el tiempo al tercero
    expect(D(s).results[ids[0]]).toBe(4);
    expect(D(s).results[ids[2]]).toBe(0);
    expect(s.arena!.scores[ids[0]]).toBe(4);
  });

  it('Ruleta de la muerte: clic, bang, pase y último en pie', () => {
    let { s, ids } = arenaWith('ruleta', 3, 21);
    let now = 4000, guard = 0;
    let bangs = 0;
    while (s.arena && s.arena.stage === 'play' && guard++ < 60) {
      const turn = D(s).turn as string;
      const passes = D(s).passes as Record<string, number>;
      const r = applyAction(s, { type: 'ARENA_MOVE', playerId: turn, now, payload: { kind: passes[turn] > 0 && guard % 4 === 0 ? 'pass' : 'shoot' } });
      if (r.events.some(e => e.data?.bang === true)) bangs++;
      s = r.state; now += 1000;
    }
    expect(s.arena!.stage).toBe('done');
    expect(bangs).toBe(2);
    expect(s.arena!.alive).toHaveLength(1);
    expect(s.arena!.ranking![0]).toBe(s.arena!.alive[0]);
    expect(ids).toContain(s.arena!.ranking![0]);
  });

  it('Plantá la bomba: el saboteador planta, los demás cortan, el que corta la trampa vuela', () => {
    let { s, ids, trig } = arenaWith('bomba2', 4, 33);
    expect(D(s).saboteur).toBe(trig);
    const defusers = ids.filter(id => id !== trig);
    expect(() => applyAction(s, { type: 'ARENA_MOVE', playerId: defusers[0], now: 4000, payload: { wire: 1 } })).toThrow('saboteador');
    s = applyAction(s, { type: 'ARENA_MOVE', playerId: trig, now: 4000, payload: { wire: 2 } }).state;
    expect(D(s).stage).toBe('cut');
    expect(toClientState(s, defusers[0]).arena!.secret).toEqual({});
    s = applyAction(s, { type: 'ARENA_MOVE', playerId: defusers[0], now: 5000, payload: { wire: 2 } }).state; // corta la trampa
    s = applyAction(s, { type: 'ARENA_MOVE', playerId: defusers[1], now: 5000, payload: { wire: 0 } }).state;
    s = applyAction(s, { type: 'ARENA_MOVE', playerId: defusers[2], now: 5000, payload: { wire: 1 } }).state;
    expect(D(s).stage).toBe('reveal');
    expect(D(s).reveal.blown).toEqual([defusers[0]]);
    expect(s.arena!.alive).not.toContain(defusers[0]);
    expect(s.arena!.scores[trig]).toBe(1);
    expect(s.arena!.scores[defusers[1]]).toBe(1);
    s = applyAction(s, { type: 'ARENA_TICK', playerId: 'server', now: 10000 }).state;
    expect(D(s).round).toBe(2);
    expect(D(s).stage).toBe('plant');
    // el saboteador se duerme dos rondas: la trampa se planta al azar y los que no cortan reciben un cable al azar
    s = applyAction(s, { type: 'ARENA_TICK', playerId: 'server', now: 23000 }).state;
    expect(D(s).stage).toBe('cut');
    s = applyAction(s, { type: 'ARENA_TICK', playerId: 'server', now: 39000 }).state;
    expect(D(s).stage).toBe('reveal');
    s = applyAction(s, { type: 'ARENA_TICK', playerId: 'server', now: 44000 }).state;
    if (s.arena!.stage === 'play') {
      s = applyAction(s, { type: 'ARENA_TICK', playerId: 'server', now: 57000 }).state;
      s = applyAction(s, { type: 'ARENA_TICK', playerId: 'server', now: 73000 }).state;
      s = applyAction(s, { type: 'ARENA_TICK', playerId: 'server', now: 78000 }).state;
    }
    expect(s.arena!.stage).toBe('done');
    expect(s.arena!.ranking).toHaveLength(4);
  });
});

describe('v1.3.5: contenido, casino y tiempos', () => {
  const D = (s: GameState) => s.arena!.data as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

  it('hay mucho más contenido y no se repite dentro de una misma partida', () => {
    expect(TRIVIA.length).toBeGreaterThanOrEqual(270);
    expect(CUANTOS.length).toBeGreaterThanOrEqual(65);
    expect(BLURRY.length).toBeGreaterThanOrEqual(60);
    expect(CHAINS.length).toBeGreaterThanOrEqual(40);
    // las preguntas de trivia no se repiten aunque se jueguen muchos desafíos seguidos
    let s = makeGame(2, { challenges: true }, 5);
    const [a, b] = s.players.map(p => p.id);
    const vistas = new Set<string>();
    for (let i = 0; i < 40; i++) {
      s = applyAction(s, { type: 'CHALLENGE_PROPOSE', playerId: a, toId: b, kind: 'trivia', amount: 10 }).state;
      s = applyAction(s, { type: 'CHALLENGE_ACCEPT', playerId: b }).state;
      const q = s.challenge!.data.question!.q;
      expect(vistas.has(q)).toBe(false);
      vistas.add(q);
      s = applyAction(s, { type: 'CHALLENGE_CANCEL', playerId: s.hostId }).state;
      if (s.turnPhase !== 'AWAITING_ROLL') s = applyAction(s, { type: 'FORCE_END_TURN', playerId: s.hostId }).state;
      s.currentPlayerIndex = s.players.findIndex(p => p.id === a);
      s.turnPhase = 'AWAITING_ROLL';
    }
    expect(vistas.size).toBe(40);
    expect(s.usedContent.trivia).toHaveLength(40);
  });

  it('Palabra bomba: una sola vida y la mecha se acorta con cada palabra', () => {
    let s = makeGame(3, { arena: true }, 15);
    const a = cur(s).id;
    s = act(withDice(setPos(s, a, 3), [1, 2]), { type: 'ROLL', playerId: a }).state;
    const ids = s.arena!.players;
    s.arena!.options[0] = 'bomba';
    for (const id of ids) s = applyAction(s, { type: 'ARENA_VOTE', playerId: id, option: 0 }).state;
    s = applyAction(s, { type: 'ARENA_START', playerId: 'server', now: 0 }).state;
    expect(Object.values(D(s).lives as Record<string, number>).every(v => v === 1)).toBe(true);
    const fuse0 = s.arena!.secret.fuse as number;
    expect(fuse0).toBeLessThanOrEqual(9000);
    // el que tiene el turno deja explotar la bomba → queda afuera con un solo boom
    const victim = D(s).turn as string;
    s = applyAction(s, { type: 'ARENA_TICK', playerId: 'server', now: 5000 + fuse0 + 100 }).state;
    expect(s.arena!.eliminated).toContain(victim);
    expect(s.arena!.alive).toHaveLength(2);
  });

  it('el Casino paga menos de lo justo en las cuatro mesas (gana la banca)', () => {
    // Ruleta: menos del 50 % de chances a pago 1 a 1
    expect(RULETA_WIN_CHANCE).toBeLessThan(50);
    // Quiniela: para cada número, pago < (36/combinaciones) - 1
    const combos: Record<number, number> = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };
    for (const n of Object.keys(combos).map(Number)) {
      const justo = 36 / combos[n] - 1;
      expect(QUINIELA_PAYOUT[n]).toBeLessThan(justo);
    }
    // Carrera: 6 carretas, pago justo sería 5 a 1
    expect(CARRETA_PAYOUT).toBeLessThan(5);
  });

  it('doble o nada del casino: el doble uno corta la racha', () => {
    let s = makeGame(2, { casino: true }, 3);
    const a = cur(s).id;
    s = { ...s, turnPhase: 'CASINO', casino: { playerId: a, played: false, double: null } };
    s = applyAction({ ...s, seed: seedFor([1, 1]) }, { type: 'CASINO_DOUBLE_START', playerId: a, amount: 100 }).state;
    expect(s.casino!.double).toBeNull();                      // perdió con doble uno
    expect(s.players.find(p => p.id === a)!.cash).toBe(1400);
  });
});
