import {
  PARAGUAYISMOS, canBuild, canMortgage, canSellBuilding, currentPlayer, groupTiles, legalActions, normalizeWord, ownsFullGroup,
  propertiesOf, tile, type Action, type GameState, type PropertyTile,
} from '@nandepoly/engine';

const COMMON_WORDS = ['casa', 'mesa', 'perro', 'gato', 'tomate', 'camino', 'carreta', 'ventana', 'puerta', 'comida', 'pelota', 'barrio', 'sapo', 'rio', 'plata', 'mate', 'campo', 'tierra', 'agua', 'fuego', 'mano', 'cabeza', 'silla', 'libro', 'papel', 'tarde', 'noche', 'lunes', 'partido', 'moneda', 'banco', 'tren', 'barco', 'puente', 'calle', 'plaza', 'iglesia', 'escuela', 'medico', 'musica', 'guitarra', 'sombrero', 'zapato', 'camisa', 'pantalon', 'naranja', 'manzana', 'banana', 'sandia', 'melon', 'pescado', 'carne', 'pollo', 'arroz', 'fideo', 'queso', 'leche', 'huevo', 'azucar', 'harina', 'mandioca', 'chipa', 'terere', 'pombero'];

/** Pseudoaleatorio determinista por estado (los bots no usan Math.random para ser reproducibles en tests). */
function hash(s: GameState, salt = 0): number {
  let h = (s.turnNumber * 2654435761 + salt * 40503 + (s.arena?.round ?? 0) * 97 + (s.dice?.[0] ?? 0)) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

function arenaBot(s: GameState): Action | null {
  const a = s.arena!;
  const bots = a.players.filter(id => s.players.find(p => p.id === id)?.isBot && !s.players.find(p => p.id === id)?.bankrupt);
  if (!bots.length) return null;
  const now = Date.now();
  if (a.stage === 'vote') {
    const pending = bots.find(id => a.votes[id] === undefined);
    return pending ? { type: 'ARENA_VOTE', playerId: pending, option: Math.floor(hash(s, pending.length) * a.options.length) } : null;
  }
  if (a.stage !== 'play') return null;
  const d = a.data as Record<string, any>;
  switch (a.game) {
    case 'trivia': { const b = bots.find(id => d.answered?.[id] === undefined); return b ? { type: 'ARENA_MOVE', playerId: b, now, payload: { answer: Math.floor(hash(s, 1 + Object.keys(d.answered ?? {}).length) * 4) } } : null; }
    case 'cana': { const b = bots[Math.floor(hash(s, now % 1000) * bots.length)]; return { type: 'ARENA_MOVE', playerId: b, now, payload: { taps: 5 } }; }
    case 'barra': { const b = bots.find(id => (d.attempts?.[id]?.length ?? 3) < 3); return b ? { type: 'ARENA_MOVE', playerId: b, now, payload: { distance: Math.floor(hash(s, d.attempts[b].length + 7) * 30) } } : null; }
    case 'cuantos': { const b = bots.find(id => d.answers?.[id] === undefined); return b ? { type: 'ARENA_MOVE', playerId: b, now, payload: { value: Math.floor(hash(s, 3) * 400) } } : null; }
    case 'bomba': {
      if (!bots.includes(d.turn)) return null;
      const syl = normalizeWord(String(d.syllable));
      const used: string[] = d.used ?? [];
      const w = [...COMMON_WORDS, ...PARAGUAYISMOS].find(x => normalizeWord(x).includes(syl) && !used.includes(normalizeWord(x)));
      // el bot "piensa": responde solo si ya pasó al menos 1,5 s
      if (!w || now - (d.turnStartedAt ?? now) < 1500) return null;
      return { type: 'ARENA_MOVE', playerId: d.turn, now, payload: { word: w } };
    }
    case 'sapos': { const b = bots.find(id => !(d.finished ?? []).includes(id)); if (!b) return null; const last = d.lastSide?.[b]; return { type: 'ARENA_MOVE', playerId: b, now, payload: { side: last === 'L' ? 'R' : 'L' } }; }
    case 'oeste': {
      if (!d.go) return null;
      const b = bots.find(id => a.alive.includes(id) && !d.shots?.[id] && !(d.jammed ?? []).includes(id));
      if (!b) return null;
      const targets = a.alive.filter(x => x !== b);
      return targets.length ? { type: 'ARENA_MOVE', playerId: b, now, payload: { target: targets[Math.floor(hash(s, 5) * targets.length)] } } : null;
    }
    case 'rayo': { const b = bots.find(id => a.alive.includes(id) && d.picks?.[id] === undefined); return b ? { type: 'ARENA_MOVE', playerId: b, now, payload: { cell: Math.floor(hash(s, b.length + (d.round ?? 0)) * ((d.gridSize ?? 3) ** 2)) } } : null; }
    case 'penales': { const b = bots.find(id => (d.shots?.[id]?.length ?? 3) < 3); return b ? { type: 'ARENA_MOVE', playerId: b, now, payload: { power: 50 + Math.floor(hash(s, d.shots[b].length) * 40), dir: hash(s, 11 + d.shots[b].length) * 2 - 1 } } : null; }
    case 'globos': { if (!bots.includes(d.turn)) return null; const free = Array.from({ length: d.balloons as number }, (_, i) => i).filter(i => !(d.popped ?? []).includes(i)); return free.length ? { type: 'ARENA_MOVE', playerId: d.turn, now, payload: { balloon: free[Math.floor(hash(s, free.length) * free.length)] } } : null; }
    case 'dibujo': return null; // los bots no dibujan ni adivinan
  }
  return null;
}

function duelBot(s: GameState): Action | null {
  const d = s.duel!;
  const isBot = (id: string) => !!s.players.find(p => p.id === id)?.isBot;
  if (d.status === 'pending') {
    if (!isBot(d.toId)) return null;
    const to = s.players.find(p => p.id === d.toId)!;
    return d.amount <= to.cash * 0.3 ? { type: 'DUEL_ACCEPT', playerId: d.toId } : { type: 'DUEL_REJECT', playerId: d.toId };
  }
  if (d.status !== 'playing') return null;
  if (d.game === 'escopeta') {
    if (!isBot(d.turn)) return null;
    const data = d.data as Record<string, any>;
    const items: string[] = data.items?.[d.turn] ?? [];
    const known = data.known as { live: number; blank: number };
    const peek = (data.peek as Record<string, string>)?.[d.turn];
    if (items.includes('lupa') && !peek) return { type: 'DUEL_MOVE', playerId: d.turn, move: { kind: 'item', item: 'lupa' } };
    if (items.includes('esposas') && data.cuffed === null && known.live >= 2) return { type: 'DUEL_MOVE', playerId: d.turn, move: { kind: 'item', item: 'esposas' } };
    if (peek === 'blank') return { type: 'DUEL_MOVE', playerId: d.turn, move: { kind: 'shoot', target: 'self' } };
    if (peek === 'live') return { type: 'DUEL_MOVE', playerId: d.turn, move: { kind: 'shoot', target: 'opp' } };
    if (items.includes('cerveza') && known.live > 0 && known.blank > known.live) return { type: 'DUEL_MOVE', playerId: d.turn, move: { kind: 'item', item: 'cerveza' } };
    return { type: 'DUEL_MOVE', playerId: d.turn, move: { kind: 'shoot', target: known.blank > known.live ? 'self' : 'opp' } };
  }
  // Truco
  const pub = d.data.truco as { pending: { type: string; by: string } | null; turn: string; cardCount: Record<string, number>; envidoDone: boolean; baza: number; trucoLevel: number } | undefined;
  if (!pub) return null;
  if (pub.pending) {
    const responder = pub.pending.by === d.fromId ? d.toId : d.fromId;
    if (!isBot(responder)) return null;
    return { type: 'DUEL_MOVE', playerId: responder, move: { kind: 'call', what: hash(s, 21) < 0.6 ? 'quiero' : 'no_quiero' } };
  }
  if (!isBot(pub.turn)) return null;
  const r = hash(s, 31 + pub.baza);
  if (!pub.envidoDone && pub.baza === 0 && r < 0.2) return { type: 'DUEL_MOVE', playerId: pub.turn, move: { kind: 'call', what: 'envido' } };
  if (pub.trucoLevel === 0 && r > 0.85) return { type: 'DUEL_MOVE', playerId: pub.turn, move: { kind: 'call', what: 'truco' } };
  return { type: 'DUEL_MOVE', playerId: pub.turn, move: { kind: 'play', card: Math.floor(hash(s, 41) * Math.max(1, pub.cardCount[pub.turn] ?? 1)) } };
}

/**
 * Bot sencillo: compra si le queda margen, construye en su grupo más barato,
 * responde subastas hasta un precio razonable y acepta intercambios que le completan grupo.
 * Devuelve la próxima acción que un bot debería ejecutar, o null si no le toca a ningún bot.
 */
export function botAction(s: GameState): Action | null {
  if (s.phase !== 'PLAYING') return null;
  if (s.turnPhase === 'ARENA' && s.arena) return arenaBot(s);
  if (s.turnPhase === 'DUEL' && s.duel) return duelBot(s);

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
      if (legal.has('DUEL_PROPOSE') && p.cash >= 400) {
        const rivals = s.players.filter(x => !x.bankrupt && x.id !== p.id && x.cash >= 200);
        if (rivals.length) return { type: 'DUEL_PROPOSE', playerId: p.id, toId: rivals[s.turnNumber % rivals.length].id, game: s.turnNumber % 2 ? 'truco' : 'escopeta', amount: 200 };
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
