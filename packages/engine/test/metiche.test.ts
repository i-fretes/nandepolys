import { describe, expect, it } from 'vitest';
import { METICHE_FEE, applyAction, legalActions } from '../src';
import { act, cur, give, makeGame } from './helpers';

const side = (o: Partial<{ cash: number; properties: number[]; jailCards: number }> = {}) =>
  ({ cash: 0, properties: [], jailCards: 0, ...o });

describe('metiche: meterse en el intercambio de otros', () => {
  const setup = () => {
    let s = makeGame(3);
    const [a, b, c] = s.players.map(p => p.id);
    s = give(s, a, [15]);        // Pilar, del que propone
    s = give(s, b, [10]);        // Villarrica, la que todos quieren
    s = give(s, c, [12]);        // Coronel Oviedo, del metiche
    // A propone: Pilar + 200 mil por Villarrica
    s = act(s, { type: 'TRADE_PROPOSE', playerId: a, toPlayerId: b, give: side({ cash: 200, properties: [15] }), receive: side({ properties: [10] }) }).state;
    return { s, a, b, c };
  };

  it('un tercero se mete pagando la entrada y su oferta compite por lo mismo', () => {
    const { s: s0, a, b, c } = setup();
    expect(legalActions(s0, c).has('TRADE_BUTT_IN')).toBe(true);
    expect(legalActions(s0, a).has('TRADE_BUTT_IN')).toBe(false);
    expect(legalActions(s0, b).has('TRADE_BUTT_IN')).toBe(false);

    const cashAntes = s0.players.find(p => p.id === c)!.cash;
    const s = act(s0, { type: 'TRADE_BUTT_IN', playerId: c, give: side({ cash: 1000 }) }).state;
    expect(s.players.find(p => p.id === c)!.cash).toBe(cashAntes - METICHE_FEE);
    expect(s.tradeRivals).toHaveLength(1);
    expect(s.tradeRivals[0].fromId).toBe(c);
    expect(s.tradeRivals[0].toId).toBe(b);
    // pide exactamente lo mismo que pedía el original
    expect(s.tradeRivals[0].receive.properties).toEqual([10]);
    // la propuesta original sigue viva
    expect(s.pendingTrade!.fromId).toBe(a);
    // no puede meterse dos veces
    expect(() => act(s, { type: 'TRADE_BUTT_IN', playerId: c, give: side({ cash: 300 }) })).toThrow('Ya te metiste');
  });

  it('el que propuso puede mejorar una sola vez', () => {
    const { s: s0, a, c } = setup();
    expect(legalActions(s0, a).has('TRADE_IMPROVE')).toBe(false);   // todavía no hay metiche
    let s = act(s0, { type: 'TRADE_BUTT_IN', playerId: c, give: side({ cash: 1000 }) }).state;
    expect(legalActions(s, a).has('TRADE_IMPROVE')).toBe(true);
    s = act(s, { type: 'TRADE_IMPROVE', playerId: a, give: side({ cash: 1200, properties: [15] }) }).state;
    expect(s.pendingTrade!.give.cash).toBe(1200);
    expect(s.tradeImproved).toBe(true);
    expect(() => act(s, { type: 'TRADE_IMPROVE', playerId: a, give: side({ cash: 1300 }) })).toThrow('una vez');
  });

  it('el dueño elige: si acepta la del metiche, el trato se hace con él', () => {
    const { s: s0, a, b, c } = setup();
    let s = act(s0, { type: 'TRADE_BUTT_IN', playerId: c, give: side({ cash: 1000 }) }).state;
    const oferta = s.tradeRivals[0].id;
    s = act(s, { type: 'TRADE_ACCEPT', playerId: b, tradeId: oferta }).state;
    expect(s.properties[10].owner).toBe(c);                 // Villarrica pasó al metiche
    expect(s.properties[15].owner).toBe(a);                 // Pilar no se movió
    expect(s.pendingTrade).toBeNull();
    expect(s.tradeRivals).toHaveLength(0);
    expect(s.players.find(p => p.id === b)!.cash).toBe(1500 + 1000);
  });

  it('rechazar cierra todo; el metiche puede retirar solo la suya', () => {
    const { s: s0, a, b, c } = setup();
    let s = act(s0, { type: 'TRADE_BUTT_IN', playerId: c, give: side({ cash: 1000 }) }).state;
    const oferta = s.tradeRivals[0].id;
    // el metiche retira la suya: el trato original sigue
    let r = act(s, { type: 'TRADE_CANCEL', playerId: c, tradeId: oferta }).state;
    expect(r.tradeRivals).toHaveLength(0);
    expect(r.pendingTrade).not.toBeNull();
    // el dueño rechaza la original: se cae todo
    r = act(s, { type: 'TRADE_REJECT', playerId: b, tradeId: s.pendingTrade!.id }).state;
    expect(r.pendingTrade).toBeNull();
    expect(r.tradeRivals).toHaveLength(0);
    expect(a).toBeTruthy();
  });

  it('no se puede meter sin plata para la entrada', () => {
    const { s: s0, c } = setup();
    const s = { ...s0, players: s0.players.map(p => (p.id === c ? { ...p, cash: 50 } : p)) };
    expect(legalActions(s, c).has('TRADE_BUTT_IN')).toBe(false);
    expect(() => applyAction(s, { type: 'TRADE_BUTT_IN', playerId: c, give: side({ cash: 10 }) })).toThrow('no te alcanza');
  });
});
