import { describe, expect, it } from 'vitest';
import { applyAction, bjValue, legalActions, type GameState } from '../src';
import { act, cur, makeGame } from './helpers';

/** Arma un desafío de blackjack ya aceptado, con el mazo que queramos (se saca del final). */
function table(deckTop: number[], amount = 100) {
  let s = makeGame(2, { challenges: true });
  const house = cur(s).id;
  const bettor = s.players.find(p => p.id !== house)!.id;
  s = act(s, { type: 'CHALLENGE_PROPOSE', playerId: house, toId: bettor, kind: 'blackjack', amount }).state;
  s = act(s, { type: 'CHALLENGE_ACCEPT', playerId: bettor }).state;
  // reemplazamos el mazo: las cartas se reparten apostador, banca, apostador, banca
  if (deckTop.length) {
    const c = s.challenge!;
    const fixed: GameState = structuredClone(s);
    fixed.challenge!.secret.deck = [...(c.secret.deck ?? []).slice(0, 52 - deckTop.length), ...[...deckTop].reverse()];
    // volvemos a repartir desde cero con el mazo fijo
    fixed.challenge!.data.bj = undefined;
    fixed.challenge!.status = 'playing';
    // re-ejecutamos el reparto llamando al comienzo del desafío por la vía pública: aceptar de nuevo no es posible,
    // así que repartimos a mano igual que el motor
    const bj = { house, bettor, hands: { [house]: [] as number[], [bettor]: [] as number[] }, hidden: true, stake: amount, doubled: false, stage: 'bettor' as const };
    const deck = fixed.challenge!.secret.deck!;
    bj.hands[bettor].push(deck.pop()!); bj.hands[house].push(deck.pop()!); bj.hands[bettor].push(deck.pop()!); bj.hands[house].push(deck.pop()!);
    fixed.challenge!.data.bj = bj;
    return { s: fixed, house, bettor };
  }
  return { s, house, bettor };
}
// cartas: valor = índice % 13 → 0=A, 1=2 … 8=9, 9=10, 10=J, 11=Q, 12=K ; palo = ÷13
const A = 0, TWO = 1, FIVE = 4, SIX = 5, SEVEN = 6, NINE = 8, TEN = 9, K = 12, Q = 11;

describe('blackjack como desafío', () => {
  it('cuenta las manos como corresponde (ases 11 o 1, figuras 10)', () => {
    expect(bjValue([A, K]).total).toBe(21);
    expect(bjValue([A, A]).total).toBe(12);
    expect(bjValue([A, SIX, K]).total).toBe(17);
    expect(bjValue([K, Q, TWO]).total).toBe(22);
    expect(bjValue([A, SIX]).soft).toBe(true);
  });

  it('el que desafía es la banca; el retado apuesta y decide', () => {
    const { s, house, bettor } = table([]);
    const bj = s.challenge!.data.bj!;
    expect(bj.house).toBe(house);
    expect(bj.bettor).toBe(bettor);
    expect(bj.hands[house]).toHaveLength(2);
    expect(bj.hands[bettor]).toHaveLength(2);
    if (bj.stage === 'bettor') {
      expect(() => act(s, { type: 'CHALLENGE_MOVE', playerId: house, bj: 'hit' })).toThrow('banca juega sola');
      expect(legalActions(s, bettor).has('CHALLENGE_MOVE')).toBe(true);
    }
  });

  it('plantarse: la banca pide hasta 17 y gana el total más alto', () => {
    // apostador: 10 + 9 = 19 ; banca: 10 + 6 = 16 → pide → saca 5 = 21 → gana la banca
    const { s, house, bettor } = table([TEN, TEN, NINE, SIX, FIVE]);
    const r = act(s, { type: 'CHALLENGE_MOVE', playerId: bettor, bj: 'stand' });
    expect(r.state.challenge).toBeNull();
    expect(r.state.players.find(p => p.id === house)!.cash).toBe(1600);
    expect(r.state.players.find(p => p.id === bettor)!.cash).toBe(1400);
  });

  it('pasarse de 21 pierde en el acto', () => {
    // apostador: 10 + 9 → pide → K = 29
    const { s, house, bettor } = table([TEN, TEN, NINE, SIX, K]);
    const r = act(s, { type: 'CHALLENGE_MOVE', playerId: bettor, bj: 'hit' });
    expect(r.state.challenge).toBeNull();
    expect(r.state.players.find(p => p.id === house)!.cash).toBe(1600);
    expect(r.events.some(e => e.type === 'challenge_done' && /se pasó/.test(e.text))).toBe(true);
    expect(bettor).toBeTruthy();
  });

  it('blackjack natural paga 3 a 2', () => {
    // apostador: A + K ; banca: 10 + 6
    const { s, bettor } = table([A, TEN, K, SIX]);
    // se resuelve solo al repartir: forzamos la resolución simulando el stand (ya está cerrado si stage != bettor)
    const st = s.challenge!.data.bj!.stage === 'bettor' ? act(s, { type: 'CHALLENGE_MOVE', playerId: bettor, bj: 'stand' }).state : s;
    expect(st.players.find(p => p.id === bettor)!.cash).toBe(1650);
  });

  it('doblar duplica la apuesta, da una sola carta y cierra la mano', () => {
    // apostador: 5 + 6 = 11 → dobla → saca 10 = 21 ; banca: 10 + 7 = 17 se planta
    const { s, house, bettor } = table([FIVE, TEN, SIX, SEVEN, TEN]);
    const r = act(s, { type: 'CHALLENGE_MOVE', playerId: bettor, bj: 'double' });
    expect(r.state.challenge).toBeNull();
    expect(r.state.players.find(p => p.id === bettor)!.cash).toBe(1700);
    expect(r.state.players.find(p => p.id === house)!.cash).toBe(1300);
  });

  it('no se puede doblar con más de dos cartas', () => {
    // apostador: 2 + 5 → pide (saca 2) → intenta doblar
    const { s, bettor } = table([TWO, TEN, FIVE, SEVEN, TWO]);
    const r = act(s, { type: 'CHALLENGE_MOVE', playerId: bettor, bj: 'hit' });
    expect(() => act(r.state, { type: 'CHALLENGE_MOVE', playerId: bettor, bj: 'double' })).toThrow('dos primeras');
  });

  it('empate: nadie paga', () => {
    // apostador 10 + 9 = 19 ; banca 10 + 9 = 19
    const { s, house, bettor } = table([TEN, TEN, NINE, NINE]);
    const r = act(s, { type: 'CHALLENGE_MOVE', playerId: bettor, bj: 'stand' });
    expect(r.state.players.find(p => p.id === house)!.cash).toBe(1500);
    expect(r.state.players.find(p => p.id === bettor)!.cash).toBe(1500);
  });

  it('en el doble o nada del alquiler la banca es el dueño', () => {
    let s = makeGame(2, { rentDoubleOrNothing: true, challenges: true }, 5);
    const payer = cur(s).id;
    const owner = s.players.find(p => p.id !== payer)!.id;
    // el dueño tiene Caacupé (7); el que paga cae ahí
    s = structuredClone(s);
    s.properties[7].owner = owner;
    s.players.find(p => p.id === payer)!.position = 0;
    // buscamos una semilla que dé 3+4 y luego elija blackjack como desafío
    for (let seed = 1; seed < 400000; seed++) {
      const t = applyAction({ ...s, seed }, { type: 'ROLL', playerId: payer }).state;
      if (t.turnPhase !== 'RENT_OFFER') continue;
      let u = applyAction(t, { type: 'RENT_DON_PROPOSE', playerId: payer }).state;
      u = applyAction(u, { type: 'RENT_DON_ACCEPT', playerId: owner }).state;
      if (u.challenge?.kind !== 'blackjack') continue;
      expect(u.challenge.data.bj!.house).toBe(owner);
      expect(u.challenge.data.bj!.bettor).toBe(payer);
      return;
    }
    throw new Error('no se encontró semilla');
  });
});
