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
    case 'CASINO': {
      const c = s.casino!;
      if (c.double) return rnd() < 0.5 ? { type: 'CASINO_DOUBLE_CONTINUE', playerId: c.playerId } : { type: 'CASINO_CASHOUT', playerId: c.playerId };
      if (c.played) return { type: 'CASINO_LEAVE', playerId: c.playerId };
      const cash = s.players.find(x => x.id === c.playerId)!.cash;
      const amount = Math.min(s.settings.casinoMaxBet, Math.max(10, Math.floor(cash / 10)));
      if (cash < 10 || rnd() < 0.2) return { type: 'CASINO_LEAVE', playerId: c.playerId };
      const k = rnd();
      if (k < 0.25) return { type: 'CASINO_PLAY', playerId: c.playerId, game: 'ruleta', amount };
      if (k < 0.5) return { type: 'CASINO_PLAY', playerId: c.playerId, game: 'quiniela', amount, pick: 2 + Math.floor(rnd() * 11) };
      if (k < 0.75) return { type: 'CASINO_PLAY', playerId: c.playerId, game: 'carrera', amount, pick: Math.floor(rnd() * 6) };
      return { type: 'CASINO_DOUBLE_START', playerId: c.playerId, amount };
    }
    case 'RENT_OFFER': {
      const o = s.rentOffer!;
      if (!o.proposed) return rnd() < 0.5 ? { type: 'RENT_PAY', playerId: o.payerId } : { type: 'RENT_DON_PROPOSE', playerId: o.payerId };
      return rnd() < 0.5 ? { type: 'RENT_DON_ACCEPT', playerId: o.ownerId } : { type: 'RENT_DON_REJECT', playerId: o.ownerId };
    }
    case 'CHALLENGE': {
      const c = s.challenge!;
      const kinds = ['dados', 'ppt', 'trivia', 'terere'] as const;
      if (c.status === 'pick') {
        const rivals = s.players.filter(x => !x.bankrupt && x.id !== c.fromId);
        return { type: 'CHALLENGE_PROPOSE', playerId: c.fromId, toId: rivals[Math.floor(rnd() * rivals.length)].id, kind: kinds[Math.floor(rnd() * 4)], amount: 100 };
      }
      if (c.status === 'pending') return rnd() < 0.7 ? { type: 'CHALLENGE_ACCEPT', playerId: c.toId! } : { type: 'CHALLENGE_REJECT', playerId: c.toId! };
      const who = rnd() < 0.5 ? c.fromId : c.toId!;
      if (c.kind === 'ppt') return { type: 'CHALLENGE_MOVE', playerId: who, choice: (['piedra', 'papel', 'tijera'] as const)[Math.floor(rnd() * 3)] };
      if (c.kind === 'trivia') return { type: 'CHALLENGE_MOVE', playerId: who, answer: Math.floor(rnd() * 4) };
      if (c.kind === 'terere') return !c.data.go && rnd() < 0.8 ? { type: 'CHALLENGE_GO', playerId: 'server' } : { type: 'CHALLENGE_MOVE', playerId: who };
      return { type: 'CHALLENGE_CANCEL', playerId: s.hostId };
    }
    case 'AWAITING_ROLL':
      if (legal.has('BUILD') && rnd() < 0.6) {
        const t = propertiesOf(s, p.id).find(t => !canBuild(s, p.id, t.id));
        if (t) return { type: 'BUILD', playerId: p.id, tileId: t.id };
      }
      if (legal.has('UNMORTGAGE') && rnd() < 0.3) {
        const t = propertiesOf(s, p.id).find(t => s.properties[t.id].mortgaged);
        if (t) return { type: 'UNMORTGAGE', playerId: p.id, tileId: t.id };
      }
      if (legal.has('CHALLENGE_PROPOSE') && rnd() < 0.08) {
        const rivals = s.players.filter(x => !x.bankrupt && x.id !== p.id && x.cash >= 50);
        if (rivals.length && p.cash >= 50) return { type: 'CHALLENGE_PROPOSE', playerId: p.id, toId: rivals[0].id, kind: (['dados', 'ppt', 'trivia', 'terere'] as const)[Math.floor(rnd() * 4)], amount: 50 };
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
  const extra = s.settings.challenges ? 1 : 0;
  expect(s.decks.chance.length + (s.decks.chance.includes('S8') ? 0 : 1)).toBe(16 + extra);
  expect(s.decks.community.length + (s.decks.community.includes('C5') ? 0 : 1)).toBe(16 + extra);
}

function simulate(players: number, seed: number, maxSteps = 20000, settings: Record<string, unknown> = {}) {
  let s = makeGame(players, settings, seed);
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
      else if (a.type === 'CHALLENGE_PROPOSE' && s.turnPhase !== 'CHALLENGE') { /* rival sin plata: seguimos */ }
      else if (a.type.startsWith('CASINO')) s = applyAction(s, { type: 'CASINO_LEAVE', playerId: (a as { playerId: string }).playerId }).state;
      else if (a.type === 'RENT_DON_PROPOSE') s = applyAction(s, { type: 'RENT_PAY', playerId: a.playerId }).state;
      else if (a.type === 'CHALLENGE_MOVE') { /* ya eligió en esta ronda */ }
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

  it('6 jugadores con casino, jackpot, doble o nada y desafíos: sin errores de estado', () => {
    for (const seed of [4, 8, 15]) {
      const { s } = simulate(6, seed, 20000, { casino: true, jackpot: true, rentDoubleOrNothing: true, challenges: true, freeParkingPot: true });
      expect(['PLAYING', 'FINISHED']).toContain(s.phase);
      if (s.phase === 'FINISHED') expect(s.players.filter(p => !p.bankrupt).length).toBeLessThanOrEqual(1);
    }
  });

  it('FORCE_END_TURN con todas las opciones siempre avanza el turno', () => {
    let s = makeGame(4, { casino: true, jackpot: true, rentDoubleOrNothing: true, challenges: true }, 77);
    for (let i = 0; i < 300 && s.phase === 'PLAYING'; i++) {
      const before = s.turnNumber;
      s = applyAction(s, { type: 'FORCE_END_TURN', playerId: s.hostId }).state;
      if (s.phase === 'PLAYING') expect(s.turnNumber).toBeGreaterThan(before);
      checkInvariants(s);
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
