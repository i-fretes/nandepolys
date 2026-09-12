import { describe, expect, it } from 'vitest';
import { CHALLENGE_CARDS, RuleError, TRIVIA, applyAction, legalActions, nextRandom, toClientState, type GameState } from '../src';
import { act, cur, give, makeGame, seedFor, setCash, setPos, withDice } from './helpers';

const casinoGame = (n = 2, extra = {}) => makeGame(n, { casino: true, jackpot: true, ...extra });

function landOnCasino(s: GameState) {
  const a = cur(s).id;
  s = setPos(s, a, 36);
  s = withDice(s, [1, 2]); // → 39 Casino
  return act(s, { type: 'ROLL', playerId: a }).state;
}

describe('casino', () => {
  it('sin la opción, el Casino es una casilla de descanso (y el lujo sigue en la 42)', () => {
    let s = makeGame(2);
    s = landOnCasino(s);
    expect(s.players[0].cash).toBe(1500);
    expect(s.turnPhase).toBe('END_TURN');
    let t = makeGame(2);
    t = act(setPos(withDice(t, [1, 2]), cur(t).id, 39), { type: 'ROLL', playerId: cur(t).id }).state;
    expect(t.players[0].cash).toBe(1400);
  });

  it('caer en el Casino abre la mesa para todos: el que cayó apuesta sí o sí, los demás pueden pasar', () => {
    let s = casinoGame();
    s = landOnCasino(s);
    const [a, b] = s.players.map(p => p.id);
    expect(s.turnPhase).toBe('CASINO');
    expect(s.casino!.triggeredBy).toBe(a);
    expect(s.casino!.players).toContain(b);
    // los dos pueden jugar
    expect(legalActions(s, a).has('CASINO_PLAY')).toBe(true);
    expect(legalActions(s, b).has('CASINO_PLAY')).toBe(true);
    // el que cayó no puede irse sin apostar
    expect(() => act(s, { type: 'CASINO_LEAVE', playerId: a })).toThrow('tenés que apostar');
    // el otro sí
    let r = act(s, { type: 'CASINO_LEAVE', playerId: b });
    expect(r.state.turnPhase).toBe('CASINO');
    expect(r.state.casino!.passed[b]).toBe(true);
    // cuando el que cayó apuesta y se va, se cierra la mesa
    r = act(r.state, { type: 'CASINO_PLAY', playerId: a, game: 'ruleta', amount: 50 });
    r = act(r.state, { type: 'CASINO_LEAVE', playerId: a });
    expect(r.state.casino).toBeNull();
    expect(r.state.turnPhase).toBe('END_TURN');
  });

  it('ruleta: gana o pierde exactamente la apuesta; lo perdido va al jackpot; una apuesta por visita', () => {
    let s = casinoGame();
    s = landOnCasino(s);
    const a = s.players[0].id;
    expect(() => act(s, { type: 'CASINO_PLAY', playerId: a, game: 'ruleta', amount: 5 })).toThrow('mínima');
    expect(() => act(s, { type: 'CASINO_PLAY', playerId: a, game: 'ruleta', amount: 600 })).toThrow('máxima');
    const r = act(s, { type: 'CASINO_PLAY', playerId: a, game: 'ruleta', amount: 100 });
    const ev = r.events.find(e => e.type === 'casino_result')!;
    const cash = r.state.players[0].cash;
    if (ev.data!.win) { expect(cash).toBe(1600); expect(r.state.jackpot).toBe(0); }
    else { expect(cash).toBe(1400); expect(r.state.jackpot).toBe(100); }
    expect(r.state.turnPhase).toBe('CASINO');
    expect(() => act(r.state, { type: 'CASINO_PLAY', playerId: a, game: 'ruleta', amount: 100 })).toThrow('Una apuesta');
  });

  it('ruleta: la banca tiene ventaja (se gana cerca del 43 %)', () => {
    let wins = 0;
    const N = 3000;
    const base = casinoGame(2);
    for (let i = 0; i < N; i++) {
      const s: GameState = { ...base, seed: i * 7919 + 13, turnPhase: 'CASINO', casino: { triggeredBy: base.players[0].id, players: base.players.map(x => x.id), played: {}, passed: {}, double: {} } };
      const r = act(s, { type: 'CASINO_PLAY', playerId: s.players[0].id, game: 'ruleta', amount: 50 });
      if (r.events.find(e => e.type === 'casino_result')!.data!.win) wins++;
    }
    expect(wins / N).toBeGreaterThan(0.39);
    expect(wins / N).toBeLessThan(0.47);   // siempre por debajo del 50 %: a la larga gana la casa
  });

  it('quiniela paga según el número; carrera devuelve la pista completa y paga 5 a 1', () => {
    let s = casinoGame();
    s = landOnCasino(s);
    const a = s.players[0].id;
    expect(() => act(s, { type: 'CASINO_PLAY', playerId: a, game: 'quiniela', amount: 50, pick: 13 })).toThrow();
    const q = act(s, { type: 'CASINO_PLAY', playerId: a, game: 'quiniela', amount: 50, pick: 7 });
    const qe = q.events.find(e => e.type === 'casino_result')!.data!;
    expect(q.state.players[0].cash).toBe(qe.win ? 1500 + 50 * 5 : 1450);

    const c = act(s, { type: 'CASINO_PLAY', playerId: a, game: 'carrera', amount: 50, pick: 2 });
    const ce = c.events.find(e => e.type === 'casino_result')!.data! as { race: number[][]; winner: number; win: boolean };
    expect(ce.race).toHaveLength(6);
    expect(ce.race[0]).toHaveLength(10);
    const finals = ce.race.map(r => r[9]);
    expect(finals[ce.winner]).toBe(Math.max(...finals));
    expect(c.state.players[0].cash).toBe(ce.win ? 1500 + 50 * 5 : 1450);
  });

  it('doble o nada: dobla con par, pierde con impar, retira cuando quiere y tope en 4 pasos', () => {
    let s = casinoGame();
    s = landOnCasino(s);
    const a = s.players[0].id;
    // forzar par: buscamos una semilla cuyo próximo tiro sea par
    let st = { ...s, seed: seedFor([2, 4]) };
    let r = act(st, { type: 'CASINO_DOUBLE_START', playerId: a, amount: 100 });
    expect(r.state.casino?.double[a]).toEqual({ stake: 200, step: 1 });
    expect(r.state.players[0].cash).toBe(1400);
    r = act(r.state, { type: 'CASINO_CASHOUT', playerId: a });
    expect(r.state.players[0].cash).toBe(1600);
    expect(r.state.casino?.double[a]).toBeNull();
    // impar pierde
    st = { ...s, seed: seedFor([1, 2]) };
    r = act(st, { type: 'CASINO_DOUBLE_START', playerId: a, amount: 100 });
    expect(r.state.players[0].cash).toBe(1400);
    expect(r.state.jackpot).toBe(100);
    expect(r.state.casino?.double[a]).toBeNull();
    // cuatro pares seguidos → cobra 16x
    st = { ...s, seed: seedFor([2, 4]) };
    r = act(st, { type: 'CASINO_DOUBLE_START', playerId: a, amount: 10 });
    for (let i = 0; i < 3 && r.state.casino?.double[a]; i++) {
      r = act({ ...r.state, seed: seedFor([3, 3]) }, { type: 'CASINO_DOUBLE_CONTINUE', playerId: a });
    }
    expect(r.state.casino?.double[a]).toBeNull();
    expect(r.state.players[0].cash).toBe(1500 - 10 + 160);
  });

  it('el doble seis se lleva el jackpot', () => {
    let s = casinoGame(2);
    s.jackpot = 300;
    s = withDice(s, [6, 6]);
    const r = act(s, { type: 'ROLL', playerId: cur(s).id });
    expect(r.events.some(e => e.type === 'jackpot')).toBe(true);
    expect(r.state.jackpot).toBe(0);
    expect(r.state.players[0].cash).toBeGreaterThanOrEqual(1500 + 300 - 100); // menos lo que pague al caer
  });
});

describe('alquiler a doble o nada', () => {
  function landOnRival() {
    let s = makeGame(2, { rentDoubleOrNothing: true });
    const [a, b] = s.players.map(p => p.id);
    s = give(s, b, [7, 9, 10]); // celeste completo: alquiler 12 en Caacupé
    s = setPos(s, a, 0);
    s = withDice(s, [3, 4]); // → 7
    return { s: act(s, { type: 'ROLL', playerId: a }).state, a, b };
  }

  it('abre la fase; pagar normal cobra el alquiler', () => {
    const { s, a, b } = landOnRival();
    expect(s.turnPhase).toBe('RENT_OFFER');
    expect(s.rentOffer?.rent).toBe(12);
    expect(legalActions(s, a).has('RENT_DON_PROPOSE')).toBe(true);
    expect(legalActions(s, b).has('RENT_DON_ACCEPT')).toBe(false);
    const r = act(s, { type: 'RENT_PAY', playerId: a });
    expect(r.state.players[0].cash).toBe(1488);
    expect(r.state.players[1].cash).toBe(1512);
    expect(r.state.turnPhase).toBe('END_TURN');
  });

  it('proponer → dueño rechaza → paga normal; dueño acepta → se define en un mini-desafío', () => {
    const { s, a, b } = landOnRival();
    let r = act(s, { type: 'RENT_DON_PROPOSE', playerId: a });
    expect(r.state.rentOffer?.proposed).toBe(true);
    expect(legalActions(r.state, b).has('RENT_DON_ACCEPT')).toBe(true);
    const rej = act(r.state, { type: 'RENT_DON_REJECT', playerId: b });
    expect(rej.state.players[0].cash).toBe(1488);

    // Aceptar abre un desafío mano a mano entre el que paga y el dueño (sin apuesta propia)
    const acc = act(r.state, { type: 'RENT_DON_ACCEPT', playerId: b });
    expect(acc.state.rentOffer).toBeNull();
    expect(acc.state.turnPhase).toBe('CHALLENGE');
    const ch = acc.state.challenge!;
    expect(ch.status).toBe('playing');
    expect(ch.forced).toBe(true);
    expect(ch.amount).toBe(0);
    expect([ch.fromId, ch.toId]).toEqual([a, b]);
    expect(ch.rent).toEqual({ payerId: a, ownerId: b, tileId: 7, rent: 12 });

    // Jugamos el desafío hasta el final con piedra-papel-tijera forzado
    const ppt = structuredClone(acc.state);
    ppt.challenge!.kind = 'ppt';
    ppt.challenge!.data = { rounds: [], score: { [a]: 0, [b]: 0 }, chosen: [] };
    ppt.challenge!.secret = { choices: {} };
    // el que paga gana 2 a 0 → no paga nada
    let win = { state: ppt } as ReturnType<typeof act>;
    for (let i = 0; i < 2; i++) {
      win = act(win.state, { type: 'CHALLENGE_MOVE', playerId: a, choice: 'piedra' });
      win = act(win.state, { type: 'CHALLENGE_MOVE', playerId: b, choice: 'tijera' });
    }
    expect(win.state.challenge).toBeNull();
    expect(win.state.players[0].cash).toBe(1500);          // no pagó nada
    expect(win.state.players[1].cash).toBe(1500);
    expect(win.state.turnPhase).toBe('END_TURN');
    expect(win.events.some(e => e.type === 'rent_don_roll' && e.data?.win === true)).toBe(true);

    // el dueño gana 2 a 0 → paga el doble
    let lose = { state: structuredClone(ppt) } as ReturnType<typeof act>;
    for (let i = 0; i < 2; i++) {
      lose = act(lose.state, { type: 'CHALLENGE_MOVE', playerId: a, choice: 'tijera' });
      lose = act(lose.state, { type: 'CHALLENGE_MOVE', playerId: b, choice: 'piedra' });
    }
    expect(lose.state.players[0].cash).toBe(1500 - 24);
    expect(lose.state.players[1].cash).toBe(1500 + 24);

    // si se cuelga el desafío, el anfitrión lo cancela y se paga el alquiler normal
    const forced = act(acc.state, { type: 'FORCE_END_TURN', playerId: s.hostId });
    expect(forced.state.challenge).toBeNull();
    expect(forced.state.rentOffer).toBeNull();
  });
});

describe('desafíos', () => {
  const chGame = (n = 3) => makeGame(n, { challenges: true });

  it('las cartas ¡Desafío! solo entran al mazo con la opción activada', () => {
    expect(makeGame(2).decks.chance).not.toContain('S17');
    const s = chGame();
    expect(s.decks.chance).toContain('S17');
    expect(s.decks.community).toContain('C17');
    expect(CHALLENGE_CARDS).toHaveLength(2);
  });

  it('proponer, rechazar y aceptar; duelo de dados paga al ganador', () => {
    let s = chGame();
    const [a, b] = s.players.map(p => p.id);
    expect(() => act(makeGame(2), { type: 'CHALLENGE_PROPOSE', playerId: a, toId: b, kind: 'dados', amount: 100 })).toThrow(RuleError);
    let r = act(s, { type: 'CHALLENGE_PROPOSE', playerId: a, toId: b, kind: 'dados', amount: 100 });
    expect(r.state.turnPhase).toBe('CHALLENGE');
    expect(r.state.challenge?.status).toBe('pending');
    const rej = act(r.state, { type: 'CHALLENGE_REJECT', playerId: b });
    expect(rej.state.turnPhase).toBe('AWAITING_ROLL');
    expect(rej.state.challenge).toBeNull();

    r = act(r.state, { type: 'CHALLENGE_ACCEPT', playerId: b });
    expect(r.state.challenge?.status).toBe('playing');
    // cada uno tira con su botón; con empate se repite
    let guard = 0;
    while (r.state.challenge && guard++ < 20) {
      const rolls = r.state.challenge.data.rolls ?? {};
      const who = rolls[a] ? b : a;
      if (rolls[a]) expect(() => act(r.state, { type: 'CHALLENGE_MOVE', playerId: a })).toThrow('Ya tiraste'); // el que ya tiró no puede repetir
      r = act(r.state, { type: 'CHALLENGE_MOVE', playerId: who });
    }
    expect(r.state.challenge).toBeNull();
    expect(r.state.turnPhase).toBe('AWAITING_ROLL');
    const done = r.events.find(e => e.type === 'challenge_done')!;
    const w = done.data!.winner as string;
    const l = w === a ? b : a;
    expect(r.state.players.find(p => p.id === w)!.cash).toBe(1600);
    expect(r.state.players.find(p => p.id === l)!.cash).toBe(1400);
  });

  it('piedra, papel o tijera al mejor de tres con elecciones ocultas', () => {
    let s = chGame();
    const [a, b] = s.players.map(p => p.id);
    let r = act(s, { type: 'CHALLENGE_PROPOSE', playerId: a, toId: b, kind: 'ppt', amount: 50 });
    r = act(r.state, { type: 'CHALLENGE_ACCEPT', playerId: b });
    r = act(r.state, { type: 'CHALLENGE_MOVE', playerId: a, choice: 'piedra' });
    expect(r.state.challenge?.data.chosen).toEqual([a]);
    expect(toClientState(r.state).challenge?.secret).toEqual({});
    expect(() => act(r.state, { type: 'CHALLENGE_MOVE', playerId: a, choice: 'papel' })).toThrow('Ya elegiste');
    r = act(r.state, { type: 'CHALLENGE_MOVE', playerId: b, choice: 'tijera' });
    expect(r.state.challenge?.data.score).toEqual({ [a]: 1, [b]: 0 });
    r = act(r.state, { type: 'CHALLENGE_MOVE', playerId: a, choice: 'papel' });
    r = act(r.state, { type: 'CHALLENGE_MOVE', playerId: b, choice: 'papel' }); // empate
    expect(r.state.challenge?.data.rounds).toHaveLength(2);
    r = act(r.state, { type: 'CHALLENGE_MOVE', playerId: b, choice: 'papel' });
    r = act(r.state, { type: 'CHALLENGE_MOVE', playerId: a, choice: 'tijera' });
    expect(r.state.challenge).toBeNull();
    expect(r.state.players[0].cash).toBe(1550);
    expect(r.state.players[1].cash).toBe(1450);
  });

  it('trivia: el primero que acierta gana; la respuesta no viaja al cliente; no repite preguntas', () => {
    expect(TRIVIA.length).toBeGreaterThan(150);
    let s = chGame();
    const [a, b] = s.players.map(p => p.id);
    let r = act(s, { type: 'CHALLENGE_PROPOSE', playerId: a, toId: b, kind: 'trivia', amount: 80 });
    r = act(r.state, { type: 'CHALLENGE_ACCEPT', playerId: b });
    const c = r.state.challenge!;
    expect(c.data.question?.options).toHaveLength(4);
    expect(toClientState(r.state).challenge?.secret).toEqual({});
    const correct = c.secret.answer!;
    const wrong = (correct + 1) % 4;
    // a falla, b acierta
    r = act(r.state, { type: 'CHALLENGE_MOVE', playerId: a, answer: wrong });
    expect(r.state.challenge?.status).toBe('playing');
    r = act(r.state, { type: 'CHALLENGE_MOVE', playerId: b, answer: correct });
    expect(r.state.challenge).toBeNull();
    expect(r.state.players[1].cash).toBe(1580);

    // ambos fallan → nueva pregunta distinta
    let r2 = act(s, { type: 'CHALLENGE_PROPOSE', playerId: a, toId: b, kind: 'trivia', amount: 80 });
    r2 = act(r2.state, { type: 'CHALLENGE_ACCEPT', playerId: b });
    const q1 = r2.state.challenge!.data.question!.q;
    const ans = r2.state.challenge!.secret.answer!;
    r2 = act(r2.state, { type: 'CHALLENGE_MOVE', playerId: a, answer: (ans + 1) % 4 });
    r2 = act(r2.state, { type: 'CHALLENGE_MOVE', playerId: b, answer: (ans + 2) % 4 });
    expect(r2.state.challenge?.data.qIndex).toBe(1);
    expect(r2.state.challenge?.data.question?.q).not.toBe(q1);
  });

  it('tereré caliente: tocar antes de la señal pierde; después de la señal gana el primero', () => {
    let s = chGame();
    const [a, b] = s.players.map(p => p.id);
    let r = act(s, { type: 'CHALLENGE_PROPOSE', playerId: a, toId: b, kind: 'terere', amount: 100 });
    r = act(r.state, { type: 'CHALLENGE_ACCEPT', playerId: b });
    const early = act(r.state, { type: 'CHALLENGE_MOVE', playerId: a });
    expect(early.state.players[1].cash).toBe(1600); // b gana por salida en falso de a
    r = act(r.state, { type: 'CHALLENGE_GO', playerId: 'server' });
    expect(r.state.challenge?.data.go).toBe(true);
    r = act(r.state, { type: 'CHALLENGE_MOVE', playerId: b });
    expect(r.state.players[1].cash).toBe(1600);
    expect(r.state.challenge).toBeNull();
  });

  it('carta ¡Desafío!: el rival no puede negarse y el turno sigue normal', () => {
    let s = chGame(2);
    const [a, b] = s.players.map(p => p.id);
    s.decks.chance = ['S17', ...s.decks.chance.filter(x => x !== 'S17')];
    s = setPos(s, a, 5);
    s = withDice(s, [1, 2]); // → 8 Suerte
    let r = act(s, { type: 'ROLL', playerId: a });
    expect(r.state.turnPhase).toBe('CHALLENGE');
    expect(r.state.challenge?.status).toBe('pick');
    expect(legalActions(r.state, a).has('CHALLENGE_PROPOSE')).toBe(true);
    r = act(r.state, { type: 'CHALLENGE_PROPOSE', playerId: a, toId: b, kind: 'dados', amount: 999 });
    expect(r.state.challenge?.status).toBe('playing'); // por carta no hace falta aceptar
    let guard = 0, done = r.events.find(e => e.type === 'challenge_done');
    while (!done && guard++ < 20) {
      const rolls = r.state.challenge!.data.rolls ?? {};
      r = act(r.state, { type: 'CHALLENGE_MOVE', playerId: rolls[a] ? b : a });
      done = r.events.find(e => e.type === 'challenge_done');
    }
    expect(done!.data!.amount).toBe(100);
    expect(r.state.challenge).toBeNull();
    expect(r.state.turnPhase).toBe('END_TURN');
  });

  it('FORCE_END_TURN resuelve casino, oferta de alquiler y desafíos pendientes', () => {
    let s = makeGame(2, { casino: true, rentDoubleOrNothing: true, challenges: true });
    const [a, b] = s.players.map(p => p.id);
    let r = act(setPos(withDice(s, [1, 2]), a, 36), { type: 'ROLL', playerId: a });
    expect(r.state.turnPhase).toBe('CASINO');
    r = act(r.state, { type: 'FORCE_END_TURN', playerId: s.hostId });
    expect(cur(r.state).id).toBe(b);
    let r2 = act(s, { type: 'CHALLENGE_PROPOSE', playerId: a, toId: b, kind: 'ppt', amount: 50 });
    r2 = act(r2.state, { type: 'FORCE_END_TURN', playerId: s.hostId });
    expect(r2.state.challenge).toBeNull();
    expect(r2.state.players[0].cash).toBe(1500);
  });
});
