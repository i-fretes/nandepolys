import { describe, expect, it } from 'vitest';
import {
  TOTAL_HOTELS, TOTAL_HOUSES, applyAction, canBuild, canMortgage, canSellBuilding, currentPlayer, legalActions, nextRandom,
  propertiesOf, type Action, type GameState,
} from '../src';
import { makeGame } from './helpers';

/** Jugador automático: elige una acción legal al azar (con sesgo razonable). */
function randomAction(s: GameState, rnd: () => number): Action | null {
  // Primero, jugadores que deban responder (subasta / intercambio)
  if (s.turnPhase === 'AUCTION' && s.auction) {
    const a = s.auction;
    const bidderId = a.activeBidders[Math.floor(rnd() * a.activeBidders.length)];
    const p = s.players.find(x => x.id === bidderId)!;
    if (a.highestBidderId === bidderId) {
      // si es el único que queda con la oferta más alta el motor ya cerró; si hay más, no puede pasar
      const others = a.activeBidders.filter(x => x !== bidderId);
      if (others.length) return { type: 'AUCTION_PASS', playerId: others[0] };
    }
    const next = a.highestBid + 10 + Math.floor(rnd() * 50);
    if (rnd() < 0.5 && next <= p.cash) return { type: 'BID', playerId: bidderId, amount: next };
    return { type: 'AUCTION_PASS', playerId: bidderId };
  }
  if (s.pendingTrade) {
    return rnd() < 0.5
      ? { type: 'TRADE_ACCEPT', playerId: s.pendingTrade.toId, tradeId: s.pendingTrade.id }
      : { type: 'TRADE_REJECT', playerId: s.pendingTrade.toId, tradeId: s.pendingTrade.id };
  }
  const p = currentPlayer(s);
  const legal = legalActions(s, p.id);
  switch (s.turnPhase) {
    case 'AWAITING_ROLL':
      if (legal.has('BUILD') && rnd() < 0.6) {
        const t = propertiesOf(s, p.id).find(t => !canBuild(s, p.id, t.id));
        if (t) return { type: 'BUILD', playerId: p.id, tileId: t.id };
      }
      if (legal.has('UNMORTGAGE') && rnd() < 0.3) {
        const t = propertiesOf(s, p.id).find(t => s.properties[t.id].mortgaged);
        if (t) return { type: 'UNMORTGAGE', playerId: p.id, tileId: t.id };
      }
      if (legal.has('JAIL_CARD')) return { type: 'JAIL_CARD', playerId: p.id };
      if (legal.has('JAIL_PAY') && rnd() < 0.5) return { type: 'JAIL_PAY', playerId: p.id };
      return { type: 'ROLL', playerId: p.id };
    case 'AWAITING_BUY':
      return legal.has('BUY') && rnd() < 0.8 ? { type: 'BUY', playerId: p.id } : { type: 'DECLINE', playerId: p.id };
    case 'TAX_CHOICE':
      return { type: 'TAX_CHOICE', playerId: p.id, choice: rnd() < 0.5 ? 'flat' : 'percent' };
    case 'DEBT': {
      if (legal.has('PAY_DEBT')) return { type: 'PAY_DEBT', playerId: p.id };
      const props = propertiesOf(s, p.id);
      const sellable = props.find(t => !canSellBuilding(s, p.id, t.id));
      if (sellable && rnd() < 0.7) return { type: 'SELL_BUILDING', playerId: p.id, tileId: sellable.id };
      const m = props.find(t => !canMortgage(s, p.id, t.id));
      if (m) return { type: 'MORTGAGE', playerId: p.id, tileId: m.id };
      return { type: 'DECLARE_BANKRUPTCY', playerId: p.id };
    }
    case 'END_TURN': {
      if (legal.has('TRADE_PROPOSE') && rnd() < 0.05) {
        const others = s.players.filter(x => !x.bankrupt && x.id !== p.id);
        const to = others[Math.floor(rnd() * others.length)];
        const mine = propertiesOf(s, p.id).filter(t => s.properties[t.id].houses === 0);
        const theirs = propertiesOf(s, to.id).filter(t => s.properties[t.id].houses === 0);
        if (mine.length && theirs.length) {
          return {
            type: 'TRADE_PROPOSE', playerId: p.id, toPlayerId: to.id,
            give: { cash: 0, properties: [mine[0].id], jailCards: 0 },
            receive: { cash: 0, properties: [theirs[0].id], jailCards: 0 },
          };
        }
      }
      return { type: 'END_TURN', playerId: p.id };
    }
  }
  return null;
}

function checkInvariants(s: GameState) {
  let houses = 0, hotels = 0;
  for (const ps of Object.values(s.properties)) {
    if (ps.houses === 5) hotels++; else houses += ps.houses;
    if (ps.owner) expect(s.players.find(p => p.id === ps.owner)!.bankrupt).toBe(false);
  }
  expect(houses + s.housesAvailable).toBe(TOTAL_HOUSES);
  expect(hotels + s.hotelsAvailable).toBe(TOTAL_HOTELS);
  for (const p of s.players) expect(p.cash).toBeGreaterThanOrEqual(0);
  const jailCardsHeld = s.players.reduce((n, p) => n + p.jailCards.length, 0);
  const jailCardsInDecks = (s.decks.chance.includes('S8') ? 1 : 0) + (s.decks.community.includes('C5') ? 1 : 0);
  expect(jailCardsHeld + jailCardsInDecks).toBe(2);
  expect(s.decks.chance.length + (s.decks.chance.includes('S8') ? 0 : 1)).toBe(16);
  expect(s.decks.community.length + (s.decks.community.includes('C5') ? 0 : 1)).toBe(16);
}

function simulate(players: number, seed: number, maxSteps = 20000) {
  let s = makeGame(players, {}, seed);
  let rs = seed * 7 + 1;
  const rnd = () => { const r = nextRandom(rs); rs = r.seed; return r.value; };
  let steps = 0;
  let errors = 0;
  while (s.phase === 'PLAYING' && steps < maxSteps) {
    const a = randomAction(s, rnd);
    if (!a) throw new Error(`Sin acción posible en fase ${s.turnPhase}`);
    try {
      s = applyAction(s, a).state;
    } catch (e) {
      // Una acción aleatoria puede ser ilegal (ej. oferta > efectivo); no debe romper el estado
      errors++;
      if (errors > 5000) throw e;
      if (a.type === 'BID') s = applyAction(s, { type: 'AUCTION_PASS', playerId: a.playerId }).state;
      else if (a.type === 'TRADE_PROPOSE') s = applyAction(s, { type: 'END_TURN', playerId: a.playerId }).state;
      else throw e;
    }
    if (steps % 50 === 0) checkInvariants(s);
    steps++;
  }
  checkInvariants(s);
  return { s, steps };
}

describe('partidas completas simuladas', () => {
  it('2 jugadores: termina con un ganador', () => {
    const { s, steps } = simulate(2, 1);
    expect(s.phase).toBe('FINISHED');
    expect(s.winnerId).toBeTruthy();
    expect(steps).toBeGreaterThan(20);
  });

  it('6 jugadores, varias semillas: sin errores de estado; termina o alcanza el tope', () => {
    for (const seed of [3, 11, 23, 57]) {
      const { s } = simulate(6, seed, 30000);
      expect(['PLAYING', 'FINISHED']).toContain(s.phase);
      if (s.phase === 'FINISHED') expect(s.players.filter(p => !p.bankrupt).length).toBeLessThanOrEqual(1);
    }
  });

  it('FORCE_END_TURN siempre avanza el turno sin romper el estado', () => {
    let s = makeGame(4, {}, 99);
    for (let i = 0; i < 300 && s.phase === 'PLAYING'; i++) {
      const before = s.turnNumber;
      s = applyAction(s, { type: 'FORCE_END_TURN', playerId: s.hostId }).state;
      if (s.phase === 'PLAYING') expect(s.turnNumber).toBeGreaterThan(before);
      checkInvariants(s);
    }
  });

  it('el mismo seed produce exactamente la misma partida (determinismo)', () => {
    const a = simulate(3, 5, 500);
    const b = simulate(3, 5, 500);
    const strip = (s: GameState) => JSON.stringify({ ...s, startedAt: 0 });
    expect(strip(a.s)).toBe(strip(b.s));
  });
});
