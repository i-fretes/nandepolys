import {
  canBuild, canMortgage, canSellBuilding, currentPlayer, groupTiles, legalActions, ownsFullGroup,
  propertiesOf, tile, type Action, type GameState, type PropertyTile,
} from '@nandepoly/engine';

/**
 * Bot sencillo: compra si le queda margen, construye en su grupo más barato,
 * responde subastas hasta un precio razonable y acepta intercambios que le completan grupo.
 * Devuelve la próxima acción que un bot debería ejecutar, o null si no le toca a ningún bot.
 */
export function botAction(s: GameState): Action | null {
  if (s.phase !== 'PLAYING') return null;

  // Subasta: cualquier bot que participe
  if (s.turnPhase === 'AUCTION' && s.auction) {
    const a = s.auction;
    for (const id of a.activeBidders) {
      const p = s.players.find(x => x.id === id)!;
      if (!p.isBot) continue;
      if (a.highestBidderId === id) continue;
      const t = tile(a.tileId) as PropertyTile;
      const wantsGroup = t.type === 'street' && groupTiles(t.group).some(g => s.properties[g.id].owner === id);
      const limit = Math.min(p.cash - 150, Math.floor(t.price * (wantsGroup ? 1.3 : 0.9)));
      const next = a.highestBid + 10;
      if (next <= limit) return { type: 'BID', playerId: id, amount: next };
      return { type: 'AUCTION_PASS', playerId: id };
    }
    return null;
  }

  // Intercambio pendiente dirigido a un bot
  if (s.pendingTrade) {
    const tr = s.pendingTrade;
    const to = s.players.find(x => x.id === tr.toId)!;
    if (!to.isBot) return null;
    const gain = valueOf(s, to.id, tr.give) - valueOf(s, to.id, tr.receive);
    return gain >= 0
      ? { type: 'TRADE_ACCEPT', playerId: to.id, tradeId: tr.id }
      : { type: 'TRADE_REJECT', playerId: to.id, tradeId: tr.id };
  }

  // Casino
  if (s.turnPhase === 'CASINO' && s.casino) {
    const c = s.casino;
    const bp = s.players.find(x => x.id === c.playerId)!;
    if (!bp.isBot) return null;
    if (c.double) return c.double.step >= 2 ? { type: 'CASINO_CASHOUT', playerId: bp.id } : { type: 'CASINO_DOUBLE_CONTINUE', playerId: bp.id };
    if (c.played) return { type: 'CASINO_LEAVE', playerId: bp.id };
    const amount = Math.min(s.settings.casinoMaxBet, Math.max(10, Math.floor(bp.cash * 0.05 / 10) * 10));
    if (bp.cash < 200) return { type: 'CASINO_LEAVE', playerId: bp.id };
    const pickGame = (bp.cash + s.turnNumber) % 4;
    if (pickGame === 0) return { type: 'CASINO_PLAY', playerId: bp.id, game: 'ruleta', amount };
    if (pickGame === 1) return { type: 'CASINO_PLAY', playerId: bp.id, game: 'quiniela', amount, pick: 7 };
    if (pickGame === 2) return { type: 'CASINO_PLAY', playerId: bp.id, game: 'carrera', amount, pick: s.turnNumber % 6 };
    return { type: 'CASINO_DOUBLE_START', playerId: bp.id, amount };
  }

  // Alquiler a doble o nada
  if (s.turnPhase === 'RENT_OFFER' && s.rentOffer) {
    const o = s.rentOffer;
    const payer = s.players.find(x => x.id === o.payerId)!;
    const owner = s.players.find(x => x.id === o.ownerId)!;
    if (!o.proposed && payer.isBot) {
      // Propone si el alquiler es grande respecto a su efectivo y puede cubrir el doble
      return o.rent > payer.cash * 0.15 && payer.cash >= o.rent * 2 ? { type: 'RENT_DON_PROPOSE', playerId: payer.id } : { type: 'RENT_PAY', playerId: payer.id };
    }
    if (o.proposed && owner.isBot) {
      return o.rent < owner.cash * 0.2 ? { type: 'RENT_DON_ACCEPT', playerId: owner.id } : { type: 'RENT_DON_REJECT', playerId: owner.id };
    }
    return null;
  }

  // Desafíos
  if (s.turnPhase === 'CHALLENGE' && s.challenge) {
    const c = s.challenge;
    const from = s.players.find(x => x.id === c.fromId)!;
    const to = c.toId ? s.players.find(x => x.id === c.toId) : null;
    if (c.status === 'pick' && from.isBot) {
      const rivals = s.players.filter(x => !x.bankrupt && x.id !== from.id && x.cash > 0);
      if (!rivals.length) return { type: 'CHALLENGE_CANCEL', playerId: s.hostId };
      const rival = rivals[s.turnNumber % rivals.length];
      const kinds = ['dados', 'ppt', 'trivia', 'terere'] as const;
      return { type: 'CHALLENGE_PROPOSE', playerId: from.id, toId: rival.id, kind: kinds[s.turnNumber % 4], amount: c.amount };
    }
    if (c.status === 'pending' && to?.isBot) {
      return c.amount <= to.cash * 0.25 ? { type: 'CHALLENGE_ACCEPT', playerId: to.id } : { type: 'CHALLENGE_REJECT', playerId: to.id };
    }
    if (c.status === 'playing') {
      for (const b of [from, to]) {
        if (!b?.isBot) continue;
        if (c.kind === 'ppt' && !c.data.chosen?.includes(b.id)) {
          const opts = ['piedra', 'papel', 'tijera'] as const;
          return { type: 'CHALLENGE_MOVE', playerId: b.id, choice: opts[(b.cash + (c.data.rounds?.length ?? 0)) % 3] };
        }
        if (c.kind === 'trivia' && c.data.answered?.[b.id] === undefined) {
          return { type: 'CHALLENGE_MOVE', playerId: b.id, answer: (b.cash + (c.data.qIndex ?? 0)) % 4 }; // el bot "adivina"
        }
        if (c.kind === 'terere' && c.data.go) return { type: 'CHALLENGE_MOVE', playerId: b.id };
      }
    }
    return null;
  }

  const p = currentPlayer(s);
  if (!p.isBot) return null;
  const legal = legalActions(s, p.id);

  switch (s.turnPhase) {
    case 'AWAITING_ROLL': {
      if (legal.has('JAIL_CARD')) return { type: 'JAIL_CARD', playerId: p.id };
      if (legal.has('JAIL_PAY') && p.cash > 300) return { type: 'JAIL_PAY', playerId: p.id };
      const b = buildChoice(s, p.id);
      if (b !== null) return { type: 'BUILD', playerId: p.id, tileId: b };
      if (legal.has('UNMORTGAGE') && p.cash > 600) {
        const t = propertiesOf(s, p.id).find(t => s.properties[t.id].mortgaged);
        if (t) return { type: 'UNMORTGAGE', playerId: p.id, tileId: t.id };
      }
      return { type: 'ROLL', playerId: p.id };
    }
    case 'AWAITING_BUY': {
      const t = tile(p.position) as PropertyTile;
      return legal.has('BUY') && p.cash - t.price >= 120
        ? { type: 'BUY', playerId: p.id }
        : { type: 'DECLINE', playerId: p.id };
    }
    case 'TAX_CHOICE': {
      // elige lo más barato
      return { type: 'TAX_CHOICE', playerId: p.id, choice: 'percent' };
    }
    case 'DEBT': {
      if (legal.has('PAY_DEBT')) return { type: 'PAY_DEBT', playerId: p.id };
      const props = propertiesOf(s, p.id);
      const m = props.find(t => !canMortgage(s, p.id, t.id) && t.type !== 'street');
      if (m) return { type: 'MORTGAGE', playerId: p.id, tileId: m.id };
      const m2 = props.find(t => !canMortgage(s, p.id, t.id));
      if (m2) return { type: 'MORTGAGE', playerId: p.id, tileId: m2.id };
      const sell = props.find(t => !canSellBuilding(s, p.id, t.id));
      if (sell) return { type: 'SELL_BUILDING', playerId: p.id, tileId: sell.id };
      return { type: 'DECLARE_BANKRUPTCY', playerId: p.id };
    }
    case 'END_TURN': {
      const b = buildChoice(s, p.id);
      if (b !== null) return { type: 'BUILD', playerId: p.id, tileId: b };
      return { type: 'END_TURN', playerId: p.id };
    }
  }
  return null;
}

function buildChoice(s: GameState, playerId: string): number | null {
  const p = s.players.find(x => x.id === playerId)!;
  const candidates = propertiesOf(s, playerId)
    .filter(t => t.type === 'street' && !canBuild(s, playerId, t.id))
    .sort((a, b) => (a as any).houseCost - (b as any).houseCost);
  for (const t of candidates) {
    const cost = (t as any).houseCost as number;
    if (p.cash - cost >= 250) return t.id;
  }
  return null;
}

function valueOf(s: GameState, forPlayer: string, side: { cash: number; properties: number[]; jailCards: number }): number {
  let v = side.cash + side.jailCards * 50;
  for (const id of side.properties) {
    const t = tile(id) as PropertyTile;
    let price = s.properties[id].mortgaged ? t.price / 2 : t.price;
    if (t.type === 'street') {
      const others = groupTiles(t.group).filter(g => g.id !== id);
      if (others.every(g => s.properties[g.id].owner === forPlayer)) price *= 1.8; // completa grupo
      else if (ownsFullGroup(s, s.properties[id].owner ?? '', t.group)) price *= 1.5;
    }
    v += price;
  }
  return v;
}
