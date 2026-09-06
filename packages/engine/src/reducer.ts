import { BOARD, GO_SALARY, JAIL_FINE, JAIL_TILE, PROPERTY_IDS, TOTAL_HOTELS, TOTAL_HOUSES, groupTiles, isProperty, tile } from './board';
import { CHALLENGE_CARDS, CHANCE_CARDS, COMMUNITY_CARDS, card } from './cards';
import { TRIVIA } from './trivia';
import { nextRandom, rollDice, shuffle } from './rng';
import {
  activePlayers, canBuild, canMortgage, canSellBuilding, canUnmortgage, currentPlayer,
  liquidationValue, mortgageValue, netWorth, player, propertiesOf, ranking, rentFor, unmortgageCost,
} from './selectors';
import {
  RuleError, type Action, type Card, type ChallengeKind, type DeckId, type GameEvent, type GameSettings, type GameState,
  type Player, type PptChoice, type PropertyTile, type TokenId, type TradeSide, type TurnPhase,
} from './types';

export const DEFAULT_SETTINGS: GameSettings = {
  startingCash: 1500,
  auctions: true,
  freeParkingPot: false,
  doubleGoSalary: false,
  noBuyFirstLap: false,
  turnTimerSeconds: 0,
  timeLimitMinutes: 0,
  casino: false,
  casinoMaxBet: 500,
  jackpot: false,
  rentDoubleOrNothing: false,
  challenges: false,
};

export const CASINO_TILE = 38;
export const CHALLENGE_KINDS: ChallengeKind[] = ['dados', 'ppt', 'trivia', 'terere'];
/** Pago de la quiniela según la suma elegida (veces la apuesta, además de recuperarla). */
export const QUINIELA_PAYOUT: Record<number, number> = { 2: 30, 3: 15, 4: 10, 5: 8, 6: 6, 7: 5, 8: 6, 9: 8, 10: 10, 11: 15, 12: 30 };
export const CARRETA_PAYOUT = 5;
export const DOUBLE_MAX_STEPS = 4;

export const MAX_PLAYERS = 6;
export const MIN_PLAYERS = 2;

export function fmt(thousands: number): string {
  return '₲ ' + (thousands * 1000).toLocaleString('es-PY');
}

// ---------------------------------------------------------------------------
// Creación y lobby
// ---------------------------------------------------------------------------

export function createGame(roomCode: string, hostId: string, seed: number, settings: Partial<GameSettings> = {}): GameState {
  const properties: GameState['properties'] = {};
  for (const id of PROPERTY_IDS) properties[id] = { owner: null, houses: 0, mortgaged: false };
  return {
    roomCode,
    phase: 'LOBBY',
    settings: { ...DEFAULT_SETTINGS, ...settings },
    players: [],
    hostId,
    currentPlayerIndex: 0,
    turnPhase: 'AWAITING_ROLL',
    turnNumber: 0,
    dice: null,
    doublesCount: 0,
    pendingReroll: false,
    properties,
    housesAvailable: TOTAL_HOUSES,
    hotelsAvailable: TOTAL_HOTELS,
    decks: { chance: CHANCE_CARDS.map(c => c.id), community: COMMUNITY_CARDS.map(c => c.id) },
    lastCard: null,
    auction: null,
    auctionQueue: [],
    pendingTrade: null,
    debt: null,
    freeParkingPot: 0,
    jackpot: 0,
    casino: null,
    rentOffer: null,
    challenge: null,
    log: [],
    seed,
    winnerId: null,
    startedAt: null,
    tradeCounter: 0,
  };
}

export function addPlayer(state: GameState, p: { id: string; name: string; token: TokenId; color: string; isBot?: boolean }): GameState {
  if (state.phase !== 'LOBBY') throw new RuleError('La partida ya empezó.');
  if (state.players.length >= MAX_PLAYERS) throw new RuleError('La sala está llena (máximo 6).');
  if (state.players.some(x => x.id === p.id)) throw new RuleError('Ese jugador ya está en la sala.');
  if (state.players.some(x => x.token === p.token)) throw new RuleError('Esa ficha ya está tomada.');
  const s = structuredClone(state);
  s.players.push({
    id: p.id, name: p.name.trim().slice(0, 20) || 'Jugador', token: p.token, color: p.color,
    cash: s.settings.startingCash, position: 0, inJail: false, jailTurns: 0, jailCards: [],
    bankrupt: false, connected: true, isBot: !!p.isBot, lapsCompleted: 0,
  });
  return s;
}

export function removePlayer(state: GameState, playerId: string): GameState {
  if (state.phase !== 'LOBBY') throw new RuleError('La partida ya empezó.');
  const s = structuredClone(state);
  s.players = s.players.filter(p => p.id !== playerId);
  if (s.hostId === playerId && s.players.length) s.hostId = s.players[0].id;
  return s;
}

export function updateSettings(state: GameState, settings: Partial<GameSettings>): GameState {
  if (state.phase !== 'LOBBY') throw new RuleError('La partida ya empezó.');
  const s = structuredClone(state);
  s.settings = { ...s.settings, ...settings };
  for (const p of s.players) p.cash = s.settings.startingCash;
  return s;
}

// ---------------------------------------------------------------------------
// Contexto interno
// ---------------------------------------------------------------------------

interface Ctx { s: GameState; events: GameEvent[] }

function emit(ctx: Ctx, type: string, text: string, playerId?: string, data?: Record<string, unknown>) {
  const ev: GameEvent = { type, text, playerId, data };
  ctx.events.push(ev);
  ctx.s.log.push(ev);
  if (ctx.s.log.length > 300) ctx.s.log.splice(0, ctx.s.log.length - 300);
}

function requireCurrent(ctx: Ctx, playerId: string): Player {
  const p = currentPlayer(ctx.s);
  if (p.id !== playerId) throw new RuleError('No es tu turno.');
  return p;
}

function requirePhase(ctx: Ctx, ...phases: TurnPhase[]) {
  if (!phases.includes(ctx.s.turnPhase)) throw new RuleError('Esa acción no está disponible ahora.');
}

function requirePlaying(ctx: Ctx) {
  if (ctx.s.phase !== 'PLAYING') throw new RuleError('La partida no está en curso.');
}

// ---------------------------------------------------------------------------
// Dinero
// ---------------------------------------------------------------------------

function credit(ctx: Ctx, playerId: string, amount: number) {
  player(ctx.s, playerId).cash += amount;
}

/**
 * Cobra `amount` a `debtorId`. Si no puede pagar, entra en fase DEBT (o quiebra directa
 * si ni liquidando todo alcanza). Devuelve true si pagó en el acto.
 */
function charge(ctx: Ctx, debtorId: string, amount: number, creditorIds: string[], reason: string): boolean {
  if (amount <= 0) return true;
  const debtor = player(ctx.s, debtorId);
  if (debtor.cash >= amount) {
    debtor.cash -= amount;
    distribute(ctx, amount, creditorIds, reason);
    return true;
  }
  if (liquidationValue(ctx.s, debtorId) < amount) {
    emit(ctx, 'cannot_pay', `${debtor.name} no puede reunir ${fmt(amount)} (${reason}) y quiebra.`, debtorId);
    bankrupt(ctx, debtorId, creditorIds);
    return false;
  }
  ctx.s.debt = { amount, creditorIds, reason, returnPhase: ctx.s.pendingReroll ? 'AWAITING_ROLL' : 'END_TURN' };
  ctx.s.pendingReroll = false;
  ctx.s.turnPhase = 'DEBT';
  emit(ctx, 'debt', `${debtor.name} debe ${fmt(amount)} (${reason}) y tiene que hipotecar o vender para pagar.`, debtorId, { amount });
  return false;
}

function distribute(ctx: Ctx, amount: number, creditorIds: string[], reason: string) {
  if (creditorIds.length === 0) {
    if (ctx.s.settings.freeParkingPot && (reason.startsWith('impuesto') || reason.startsWith('multa') || reason.startsWith('carta'))) {
      ctx.s.freeParkingPot += amount;
    }
    return;
  }
  const share = Math.floor(amount / creditorIds.length);
  for (const id of creditorIds) credit(ctx, id, share);
}

function settleDebt(ctx: Ctx) {
  const d = ctx.s.debt;
  if (!d) return;
  const debtor = currentPlayer(ctx.s);
  if (debtor.cash < d.amount) return;
  debtor.cash -= d.amount;
  distribute(ctx, d.amount, d.creditorIds, d.reason);
  emit(ctx, 'debt_paid', `${debtor.name} pagó ${fmt(d.amount)} (${d.reason}).`, debtor.id, { amount: d.amount });
  ctx.s.debt = null;
  ctx.s.turnPhase = d.returnPhase;
}

// ---------------------------------------------------------------------------
// Inicio
// ---------------------------------------------------------------------------

function startGame(ctx: Ctx, playerId: string) {
  const s = ctx.s;
  if (s.phase !== 'LOBBY') throw new RuleError('La partida ya empezó.');
  if (playerId !== s.hostId) throw new RuleError('Solo el anfitrión puede empezar.');
  if (s.players.length < MIN_PLAYERS) throw new RuleError('Se necesitan al menos 2 jugadores.');

  const base = { chance: CHANCE_CARDS.map(c => c.id), community: COMMUNITY_CARDS.map(c => c.id) };
  if (s.settings.challenges) {
    for (const c of CHALLENGE_CARDS) base[c.deck].push(c.id);
  }
  const ch = shuffle(base.chance, s.seed);
  const co = shuffle(base.community, ch.seed);
  s.decks.chance = ch.items;
  s.decks.community = co.items;
  s.seed = co.seed;

  // Tirada inicial para el orden
  const rolls = s.players.map(p => {
    const r = rollDice(s.seed);
    s.seed = r.seed;
    return { p, sum: r.dice[0] + r.dice[1], dice: r.dice };
  });
  rolls.sort((a, b) => b.sum - a.sum);
  s.players = rolls.map(r => r.p);
  for (const r of rolls) emit(ctx, 'order_roll', `${r.p.name} tiró ${r.dice[0]}+${r.dice[1]} para el orden de salida.`, r.p.id);

  s.phase = 'PLAYING';
  s.startedAt = Date.now();
  s.currentPlayerIndex = 0;
  s.turnNumber = 1;
  s.turnPhase = 'AWAITING_ROLL';
  emit(ctx, 'game_start', `¡Empieza la partida! Sale ${s.players[0].name}.`, s.players[0].id);
}

// ---------------------------------------------------------------------------
// Movimiento
// ---------------------------------------------------------------------------

function sendToJail(ctx: Ctx, p: Player) {
  p.position = JAIL_TILE;
  p.inJail = true;
  p.jailTurns = 0;
  ctx.s.pendingReroll = false;
  ctx.s.doublesCount = 0;
  emit(ctx, 'jail', `${p.name} va preso a Tacumbú.`, p.id);
}

function moveForwardTo(ctx: Ctx, p: Player, target: number, collectGo: boolean) {
  const from = p.position;
  p.position = target;
  if (collectGo && target <= from) {
    p.lapsCompleted++;
    const salary = ctx.s.settings.doubleGoSalary && target === 0 ? GO_SALARY * 2 : GO_SALARY;
    credit(ctx, p.id, salary);
    emit(ctx, 'salary', `${p.name} pasó por Salida y cobró ${fmt(salary)}.`, p.id, { amount: salary });
  }
}

function moveBySteps(ctx: Ctx, p: Player, steps: number) {
  const target = (p.position + steps) % 40;
  moveForwardTo(ctx, p, target, true);
}

/** Resuelve la casilla donde está parado el jugador. */
function resolveLanding(ctx: Ctx, p: Player, opts: { rentMultiplier?: number; utilityForce10?: boolean } = {}) {
  const s = ctx.s;
  const t = tile(p.position);
  const landName = t.id === CASINO_TILE && s.settings.casino ? 'el Casino' : t.name;
  emit(ctx, 'land', `${p.name} cayó en ${landName}.`, p.id, { tileId: t.id });

  if (isProperty(t)) {
    const ps = s.properties[t.id];
    if (!ps.owner) {
      if (s.settings.noBuyFirstLap && p.lapsCompleted === 0) {
        emit(ctx, 'info', `Primera vuelta: ${t.name} no se puede comprar todavía.`, p.id);
        return finishResolution(ctx);
      }
      s.turnPhase = 'AWAITING_BUY';
      return;
    }
    if (ps.owner === p.id || ps.mortgaged) return finishResolution(ctx);
    const diceSum = s.dice ? s.dice[0] + s.dice[1] : 0;
    let rent = rentFor(s, t.id, diceSum);
    if (t.type === 'utility' && opts.utilityForce10) rent = diceSum * 10;
    if (opts.rentMultiplier) rent *= opts.rentMultiplier;
    const owner = player(s, ps.owner);
    if (s.settings.rentDoubleOrNothing && rent > 0 && !owner.bankrupt) {
      s.rentOffer = { payerId: p.id, ownerId: owner.id, tileId: t.id, rent, proposed: false };
      s.turnPhase = 'RENT_OFFER';
      emit(ctx, 'rent_due', `${p.name} debe ${fmt(rent)} de alquiler a ${owner.name} por ${t.name}. Puede pagar o proponer doble o nada.`, p.id, { amount: rent, to: owner.id, tileId: t.id });
      return;
    }
    payRent(ctx, p, owner, rent, t.name);
    return;
  }

  switch (t.type) {
    case 'tax':
      if (t.id === CASINO_TILE && s.settings.casino) {
        s.casino = { playerId: p.id, played: false, double: null };
        s.turnPhase = 'CASINO';
        emit(ctx, 'casino_enter', `${p.name} entró al Casino.`, p.id);
        return;
      }
      if (t.percent) { s.turnPhase = 'TAX_CHOICE'; return; }
      if (charge(ctx, p.id, t.amount, [], `impuesto: ${t.name}`)) {
        emit(ctx, 'tax', `${p.name} pagó ${fmt(t.amount)} de ${t.name}.`, p.id, { amount: t.amount });
        finishResolution(ctx);
      }
      return;
    case 'chance': return drawCard(ctx, p, 'chance');
    case 'community': return drawCard(ctx, p, 'community');
    case 'gotojail':
      sendToJail(ctx, p);
      return finishResolution(ctx);
    case 'parking':
      if (s.settings.freeParkingPot && s.freeParkingPot > 0) {
        credit(ctx, p.id, s.freeParkingPot);
        emit(ctx, 'pot', `${p.name} se llevó el pozo de ${fmt(s.freeParkingPot)}.`, p.id, { amount: s.freeParkingPot });
        s.freeParkingPot = 0;
      }
      return finishResolution(ctx);
    default:
      return finishResolution(ctx);
  }
}

function finishResolution(ctx: Ctx) {
  const s = ctx.s;
  if (s.phase !== 'PLAYING') return;
  const p = currentPlayer(s);
  if (p.bankrupt) return nextTurn(ctx);
  if (s.pendingReroll && !p.inJail) {
    s.pendingReroll = false;
    s.turnPhase = 'AWAITING_ROLL';
    emit(ctx, 'reroll', `${p.name} sacó dobles y vuelve a tirar.`, p.id);
  } else {
    s.pendingReroll = false;
    s.turnPhase = 'END_TURN';
  }
}

function nextTurn(ctx: Ctx) {
  const s = ctx.s;
  if (s.phase !== 'PLAYING') return;
  const alive = activePlayers(s);
  if (alive.length <= 1) return endGame(ctx, alive[0]?.id ?? null);
  let idx = s.currentPlayerIndex;
  for (let i = 0; i < s.players.length; i++) {
    idx = (idx + 1) % s.players.length;
    if (!s.players[idx].bankrupt) break;
  }
  s.currentPlayerIndex = idx;
  s.turnNumber++;
  s.dice = null;
  s.doublesCount = 0;
  s.pendingReroll = false;
  s.turnPhase = 'AWAITING_ROLL';
  s.lastCard = null;
  emit(ctx, 'turn', `Turno de ${s.players[idx].name}.`, s.players[idx].id);
}

function endGame(ctx: Ctx, winnerId: string | null) {
  const s = ctx.s;
  s.phase = 'FINISHED';
  s.winnerId = winnerId ?? ranking(s)[0]?.playerId ?? null;
  s.turnPhase = 'END_TURN';
  const w = s.winnerId ? player(s, s.winnerId) : null;
  emit(ctx, 'game_over', w ? `¡${w.name} ganó la partida con un patrimonio de ${fmt(netWorth(s, w.id))}!` : 'La partida terminó.', w?.id, { ranking: ranking(s) });
}

// ---------------------------------------------------------------------------
// Tirar dados
// ---------------------------------------------------------------------------

function roll(ctx: Ctx, playerId: string) {
  const s = ctx.s;
  requirePlaying(ctx);
  requirePhase(ctx, 'AWAITING_ROLL');
  const p = requireCurrent(ctx, playerId);
  const r = rollDice(s.seed);
  s.seed = r.seed;
  s.dice = r.dice;
  const [a, b] = r.dice;
  const doubles = a === b;
  emit(ctx, 'roll', `${p.name} tiró ${a} + ${b} = ${a + b}${doubles ? ' (¡dobles!)' : ''}.`, p.id, { dice: r.dice });

  if (a === 6 && b === 6 && s.settings.jackpot && s.jackpot > 0) {
    const pot = s.jackpot;
    s.jackpot = 0;
    p.cash += pot;
    emit(ctx, 'jackpot', `¡DOBLE SEIS! ${p.name} se lleva el JACKPOT del Casino: ${fmt(pot)}.`, p.id, { amount: pot });
  }

  if (p.inJail) {
    if (doubles) {
      p.inJail = false;
      p.jailTurns = 0;
      emit(ctx, 'jail_out', `${p.name} sacó dobles y sale de Tacumbú.`, p.id);
      s.pendingReroll = false; // al salir con dobles no se vuelve a tirar
      moveBySteps(ctx, p, a + b);
      return resolveLanding(ctx, p);
    }
    p.jailTurns++;
    if (p.jailTurns >= 3) {
      emit(ctx, 'jail_forced', `Tercer turno preso: ${p.name} paga ${fmt(JAIL_FINE)} y sale.`, p.id);
      p.inJail = false;
      p.jailTurns = 0;
      const paid = charge(ctx, p.id, JAIL_FINE, [], 'multa: salida de Tacumbú');
      if (!paid) {
        // Queda en DEBT; al pagar continúa el turno desde END_TURN. Movemos primero.
        moveBySteps(ctx, p, a + b);
        return; // la casilla se resuelve al saldar la deuda (ver PAY_DEBT)
      }
      moveBySteps(ctx, p, a + b);
      return resolveLanding(ctx, p);
    }
    emit(ctx, 'jail_stay', `${p.name} sigue preso (turno ${p.jailTurns} de 3).`, p.id);
    s.turnPhase = 'END_TURN';
    return;
  }

  if (doubles) {
    s.doublesCount++;
    if (s.doublesCount >= 3) {
      emit(ctx, 'three_doubles', `¡Tres dobles seguidos! ${p.name} va preso.`, p.id);
      sendToJail(ctx, p);
      s.turnPhase = 'END_TURN';
      return;
    }
    s.pendingReroll = true;
  } else {
    s.pendingReroll = false;
  }
  moveBySteps(ctx, p, a + b);
  resolveLanding(ctx, p);
}

// ---------------------------------------------------------------------------
// Cartas
// ---------------------------------------------------------------------------

function drawCard(ctx: Ctx, p: Player, deck: DeckId) {
  const s = ctx.s;
  const id = s.decks[deck].shift();
  if (!id) return finishResolution(ctx);
  const c = card(id);
  if (c.effect.kind !== 'jailFree') s.decks[deck].push(id); // vuelve al fondo
  s.lastCard = { card: c, playerId: p.id };
  emit(ctx, 'card', `${p.name} sacó una carta de ${deck === 'chance' ? 'Suerte' : 'Cooperativa'}: "${c.text}"`, p.id, { cardId: c.id, deck });
  applyCard(ctx, p, c);
}

function applyCard(ctx: Ctx, p: Player, c: Card) {
  const s = ctx.s;
  const e = c.effect;
  switch (e.kind) {
    case 'moveTo':
      moveForwardTo(ctx, p, e.tile, e.collectGo);
      return resolveLanding(ctx, p);
    case 'nearest': {
      let pos = p.position;
      for (let i = 1; i <= 40; i++) {
        const t = BOARD[(p.position + i) % 40];
        if (t.type === e.tileType) { pos = t.id; break; }
      }
      moveForwardTo(ctx, p, pos, true);
      if (e.tileType === 'utility') {
        const ps = s.properties[pos];
        if (ps.owner && ps.owner !== p.id && !ps.mortgaged) {
          const r = rollDice(s.seed);
          s.seed = r.seed;
          s.dice = r.dice;
          emit(ctx, 'roll', `${p.name} tiró ${r.dice[0]} + ${r.dice[1]} para el servicio.`, p.id, { dice: r.dice });
        }
        return resolveLanding(ctx, p, { utilityForce10: true });
      }
      return resolveLanding(ctx, p, { rentMultiplier: 2 });
    }
    case 'money':
      if (e.amount >= 0) {
        credit(ctx, p.id, e.amount);
        emit(ctx, 'income', `${p.name} cobró ${fmt(e.amount)}.`, p.id, { amount: e.amount });
        return finishResolution(ctx);
      }
      if (charge(ctx, p.id, -e.amount, [], `carta: ${c.id}`)) {
        emit(ctx, 'expense', `${p.name} pagó ${fmt(-e.amount)}.`, p.id, { amount: -e.amount });
        finishResolution(ctx);
      }
      return;
    case 'jailFree':
      p.jailCards.push(c.deck);
      emit(ctx, 'jail_card', `${p.name} guarda una carta "Salís de Tacumbú".`, p.id);
      return finishResolution(ctx);
    case 'moveBack': {
      p.position = (p.position - e.steps + 40) % 40;
      return resolveLanding(ctx, p);
    }
    case 'goToJail':
      sendToJail(ctx, p);
      return finishResolution(ctx);
    case 'repairs': {
      let total = 0;
      for (const t of propertiesOf(s, p.id)) {
        const h = s.properties[t.id].houses;
        total += h === 5 ? e.perHotel : h * e.perHouse;
      }
      if (total === 0) return finishResolution(ctx);
      if (charge(ctx, p.id, total, [], `carta: reparaciones`)) {
        emit(ctx, 'expense', `${p.name} pagó ${fmt(total)} en reparaciones.`, p.id, { amount: total });
        finishResolution(ctx);
      }
      return;
    }
    case 'payEach': {
      const others = activePlayers(s).filter(x => x.id !== p.id);
      const total = e.amount * others.length;
      if (charge(ctx, p.id, total, others.map(o => o.id), `carta: pago a cada jugador`)) {
        emit(ctx, 'expense', `${p.name} pagó ${fmt(e.amount)} a cada jugador.`, p.id, { amount: total });
        finishResolution(ctx);
      }
      return;
    }
    case 'challenge':
      return startChallengePick(ctx, p, e.amount);
    case 'collectEach': {
      // Cada jugador paga lo que puede; simplificación: se descuenta directo (montos chicos).
      let total = 0;
      for (const o of activePlayers(s)) {
        if (o.id === p.id) continue;
        const amt = Math.min(e.amount, Math.max(0, o.cash));
        o.cash -= amt;
        total += amt;
      }
      credit(ctx, p.id, total);
      emit(ctx, 'income', `${p.name} cobró ${fmt(e.amount)} de cada jugador (${fmt(total)}).`, p.id, { amount: total });
      return finishResolution(ctx);
    }
  }
}

// ---------------------------------------------------------------------------
// Compra, subasta
// ---------------------------------------------------------------------------

function buy(ctx: Ctx, playerId: string) {
  const s = ctx.s;
  requirePlaying(ctx);
  requirePhase(ctx, 'AWAITING_BUY');
  const p = requireCurrent(ctx, playerId);
  const t = tile(p.position) as PropertyTile;
  if (p.cash < t.price) throw new RuleError('No tenés efectivo suficiente. Podés rechazarla (va a subasta).');
  p.cash -= t.price;
  s.properties[t.id].owner = p.id;
  emit(ctx, 'buy', `${p.name} compró ${t.name} por ${fmt(t.price)}.`, p.id, { tileId: t.id, amount: t.price });
  finishResolution(ctx);
}

function decline(ctx: Ctx, playerId: string) {
  const s = ctx.s;
  requirePlaying(ctx);
  requirePhase(ctx, 'AWAITING_BUY');
  const p = requireCurrent(ctx, playerId);
  const t = tile(p.position) as PropertyTile;
  emit(ctx, 'decline', `${p.name} no compró ${t.name}.`, p.id, { tileId: t.id });
  if (!s.settings.auctions) return finishResolution(ctx);
  startAuction(ctx, t.id, true);
}

function startAuction(ctx: Ctx, tileId: number, returnToTurnFlow: boolean, resumePhase?: TurnPhase) {
  const s = ctx.s;
  const bidders = activePlayers(s).map(p => p.id);
  s.auction = { tileId, highestBid: 0, highestBidderId: null, activeBidders: bidders, returnToTurnFlow, resumePhase };
  s.turnPhase = 'AUCTION';
  emit(ctx, 'auction_start', `Se subasta ${tile(tileId).name}. Oferta mínima ${fmt(10)}.`, undefined, { tileId });
}

function bid(ctx: Ctx, playerId: string, amount: number) {
  const s = ctx.s;
  requirePlaying(ctx);
  requirePhase(ctx, 'AUCTION');
  const a = s.auction!;
  if (!a.activeBidders.includes(playerId)) throw new RuleError('No estás en la subasta.');
  if (!Number.isInteger(amount)) throw new RuleError('Oferta inválida.');
  if (amount < 10) throw new RuleError('La oferta mínima es ₲ 10.000.');
  if (amount <= a.highestBid) throw new RuleError('Tenés que superar la oferta actual.');
  const p = player(s, playerId);
  if (amount > p.cash) throw new RuleError('No tenés ese efectivo.');
  a.highestBid = amount;
  a.highestBidderId = playerId;
  emit(ctx, 'bid', `${p.name} ofrece ${fmt(amount)} por ${tile(a.tileId).name}.`, playerId, { amount });
  checkAuctionEnd(ctx);
}

function auctionPass(ctx: Ctx, playerId: string) {
  const s = ctx.s;
  requirePlaying(ctx);
  requirePhase(ctx, 'AUCTION');
  const a = s.auction!;
  if (!a.activeBidders.includes(playerId)) throw new RuleError('No estás en la subasta.');
  if (a.highestBidderId === playerId && a.activeBidders.length > 1) throw new RuleError('Tenés la oferta más alta; esperá a los demás.');
  a.activeBidders = a.activeBidders.filter(id => id !== playerId);
  emit(ctx, 'auction_pass', `${player(s, playerId).name} se retira de la subasta.`, playerId);
  checkAuctionEnd(ctx);
}

function checkAuctionEnd(ctx: Ctx) {
  const s = ctx.s;
  const a = s.auction!;
  const t = tile(a.tileId) as PropertyTile;
  const onlyWinnerLeft = a.activeBidders.length === 1 && a.highestBidderId === a.activeBidders[0];
  const nobodyLeft = a.activeBidders.length === 0;
  if (!onlyWinnerLeft && !nobodyLeft) return;

  if (a.highestBidderId) {
    const w = player(s, a.highestBidderId);
    w.cash -= a.highestBid;
    s.properties[t.id].owner = w.id;
    s.properties[t.id].mortgaged = false;
    emit(ctx, 'auction_won', `${w.name} ganó la subasta de ${t.name} por ${fmt(a.highestBid)}.`, w.id, { tileId: t.id, amount: a.highestBid });
  } else {
    emit(ctx, 'auction_unsold', `Nadie ofertó por ${t.name}; queda en el banco.`, undefined, { tileId: t.id });
  }
  s.auction = null;

  if (s.auctionQueue.length) {
    const next = s.auctionQueue.shift()!;
    return startAuction(ctx, next, a.returnToTurnFlow, a.resumePhase);
  }
  if (currentPlayer(s).bankrupt) return nextTurn(ctx);
  if (a.returnToTurnFlow) return finishResolution(ctx);
  // Subasta por quiebra/abandono de otro jugador: el turno actual sigue donde estaba
  s.turnPhase = a.resumePhase ?? 'END_TURN';
}

// ---------------------------------------------------------------------------
// Construcción e hipotecas (permitidas fuera de subastas/impuesto)
// ---------------------------------------------------------------------------

function requireManagementAllowed(ctx: Ctx, playerId: string) {
  requirePlaying(ctx);
  const ph = ctx.s.turnPhase;
  if (ph === 'DEBT') {
    if (currentPlayer(ctx.s).id !== playerId) throw new RuleError('Esperá a que se resuelva la deuda.');
    return;
  }
  if (ph !== 'AWAITING_ROLL' && ph !== 'END_TURN' && ph !== 'AWAITING_BUY') throw new RuleError('Esa acción no está disponible ahora.');
  if (player(ctx.s, playerId).bankrupt) throw new RuleError('Estás fuera de la partida.');
}

function build(ctx: Ctx, playerId: string, tileId: number) {
  requireManagementAllowed(ctx, playerId);
  if (ctx.s.turnPhase === 'DEBT') throw new RuleError('No podés construir mientras debés.');
  const why = canBuild(ctx.s, playerId, tileId);
  if (why) throw new RuleError(why);
  const t = tile(tileId);
  if (t.type !== 'street') return;
  const ps = ctx.s.properties[tileId];
  const p = player(ctx.s, playerId);
  p.cash -= t.houseCost;
  if (ps.houses === 4) {
    ps.houses = 5;
    ctx.s.hotelsAvailable--;
    ctx.s.housesAvailable += 4;
    emit(ctx, 'build', `${p.name} construyó un hotel en ${t.name}.`, playerId, { tileId });
  } else {
    ps.houses++;
    ctx.s.housesAvailable--;
    emit(ctx, 'build', `${p.name} construyó una casa en ${t.name} (${ps.houses}).`, playerId, { tileId });
  }
}

function sellBuilding(ctx: Ctx, playerId: string, tileId: number) {
  requireManagementAllowed(ctx, playerId);
  const why = canSellBuilding(ctx.s, playerId, tileId);
  if (why) throw new RuleError(why);
  const t = tile(tileId);
  if (t.type !== 'street') return;
  const ps = ctx.s.properties[tileId];
  const p = player(ctx.s, playerId);
  const value = Math.floor(t.houseCost / 2);
  if (ps.houses === 5) {
    ps.houses = 4;
    ctx.s.hotelsAvailable++;
    ctx.s.housesAvailable -= 4;
    emit(ctx, 'sell_building', `${p.name} vendió el hotel de ${t.name} por ${fmt(value)}.`, playerId, { tileId });
  } else {
    ps.houses--;
    ctx.s.housesAvailable++;
    emit(ctx, 'sell_building', `${p.name} vendió una casa de ${t.name} por ${fmt(value)}.`, playerId, { tileId });
  }
  p.cash += value;
  if (ctx.s.turnPhase === 'DEBT') settleDebt(ctx);
}

function mortgage(ctx: Ctx, playerId: string, tileId: number) {
  requireManagementAllowed(ctx, playerId);
  const why = canMortgage(ctx.s, playerId, tileId);
  if (why) throw new RuleError(why);
  const t = tile(tileId) as PropertyTile;
  const p = player(ctx.s, playerId);
  ctx.s.properties[tileId].mortgaged = true;
  const v = mortgageValue(t);
  p.cash += v;
  emit(ctx, 'mortgage', `${p.name} hipotecó ${t.name} por ${fmt(v)}.`, playerId, { tileId, amount: v });
  if (ctx.s.turnPhase === 'DEBT') settleDebt(ctx);
}

function unmortgage(ctx: Ctx, playerId: string, tileId: number) {
  requireManagementAllowed(ctx, playerId);
  if (ctx.s.turnPhase === 'DEBT') throw new RuleError('No podés deshipotecar mientras debés.');
  const why = canUnmortgage(ctx.s, playerId, tileId);
  if (why) throw new RuleError(why);
  const t = tile(tileId) as PropertyTile;
  const p = player(ctx.s, playerId);
  const cost = unmortgageCost(t);
  p.cash -= cost;
  ctx.s.properties[tileId].mortgaged = false;
  emit(ctx, 'unmortgage', `${p.name} deshipotecó ${t.name} pagando ${fmt(cost)}.`, playerId, { tileId, amount: cost });
}

// ---------------------------------------------------------------------------
// Cárcel
// ---------------------------------------------------------------------------

function jailPay(ctx: Ctx, playerId: string) {
  requirePlaying(ctx);
  requirePhase(ctx, 'AWAITING_ROLL');
  const p = requireCurrent(ctx, playerId);
  if (!p.inJail) throw new RuleError('No estás preso.');
  if (p.cash < JAIL_FINE) throw new RuleError('No tenés ₲ 50.000.');
  p.cash -= JAIL_FINE;
  distribute(ctx, JAIL_FINE, [], 'multa: salida de Tacumbú');
  p.inJail = false;
  p.jailTurns = 0;
  emit(ctx, 'jail_out', `${p.name} pagó ${fmt(JAIL_FINE)} y sale de Tacumbú.`, p.id, { amount: JAIL_FINE });
}

function jailCard(ctx: Ctx, playerId: string) {
  requirePlaying(ctx);
  requirePhase(ctx, 'AWAITING_ROLL');
  const p = requireCurrent(ctx, playerId);
  if (!p.inJail) throw new RuleError('No estás preso.');
  const deck = p.jailCards.shift();
  if (!deck) throw new RuleError('No tenés carta para salir.');
  const id = deck === 'chance' ? 'S8' : 'C5';
  ctx.s.decks[deck].push(id);
  p.inJail = false;
  p.jailTurns = 0;
  emit(ctx, 'jail_out', `${p.name} usó su carta y sale de Tacumbú.`, p.id);
}

// ---------------------------------------------------------------------------
// Impuesto a la renta
// ---------------------------------------------------------------------------

function taxChoice(ctx: Ctx, playerId: string, choice: 'flat' | 'percent') {
  requirePlaying(ctx);
  requirePhase(ctx, 'TAX_CHOICE');
  const p = requireCurrent(ctx, playerId);
  const t = tile(p.position);
  if (t.type !== 'tax' || !t.percent) throw new RuleError('No corresponde.');
  const amount = choice === 'flat' ? t.amount : Math.ceil((netWorth(ctx.s, p.id) * t.percent) / 100);
  if (charge(ctx, p.id, amount, [], `impuesto: ${t.name}`)) {
    emit(ctx, 'tax', `${p.name} pagó ${fmt(amount)} de ${t.name} (${choice === 'flat' ? 'monto fijo' : '10 % del patrimonio'}).`, p.id, { amount });
    finishResolution(ctx);
  }
}

// ---------------------------------------------------------------------------
// Intercambios
// ---------------------------------------------------------------------------

function validateSide(s: GameState, ownerId: string, side: TradeSide) {
  const p = player(s, ownerId);
  if (!Number.isInteger(side.cash) || side.cash < 0) throw new RuleError('Efectivo inválido.');
  if (side.cash > p.cash) throw new RuleError(`${p.name} no tiene ese efectivo.`);
  if (side.jailCards < 0 || side.jailCards > p.jailCards.length) throw new RuleError(`${p.name} no tiene esas cartas.`);
  for (const id of side.properties) {
    const t = tile(id);
    if (!isProperty(t)) throw new RuleError('Casilla no intercambiable.');
    const ps = s.properties[id];
    if (ps.owner !== ownerId) throw new RuleError(`${t.name} no pertenece a ${p.name}.`);
    if (t.type === 'street' && groupTiles(t.group).some(g => s.properties[g.id].houses > 0)) {
      throw new RuleError(`Vendé los edificios del grupo de ${t.name} antes de intercambiar.`);
    }
  }
}

function tradePropose(ctx: Ctx, playerId: string, toPlayerId: string, give: TradeSide, receive: TradeSide) {
  const s = ctx.s;
  requirePlaying(ctx);
  if (['AUCTION', 'TAX_CHOICE', 'CASINO', 'RENT_OFFER', 'CHALLENGE'].includes(s.turnPhase)) throw new RuleError('Esperá a que termine la acción en curso.');
  if (s.pendingTrade) throw new RuleError('Ya hay una propuesta pendiente.');
  if (playerId === toPlayerId) throw new RuleError('No podés negociar con vos mismo.');
  const from = player(s, playerId);
  const to = player(s, toPlayerId);
  if (from.bankrupt || to.bankrupt) throw new RuleError('Ese jugador está fuera.');
  if (s.turnPhase === 'DEBT' && currentPlayer(s).id !== playerId) throw new RuleError('Esperá a que se resuelva la deuda.');
  const empty = (x: TradeSide) => x.cash === 0 && x.properties.length === 0 && x.jailCards === 0;
  if (empty(give) && empty(receive)) throw new RuleError('La propuesta está vacía.');
  validateSide(s, playerId, give);
  validateSide(s, toPlayerId, receive);
  s.tradeCounter++;
  s.pendingTrade = { id: `t${s.tradeCounter}`, fromId: playerId, toId: toPlayerId, give, receive };
  emit(ctx, 'trade_proposed', `${from.name} le propone un intercambio a ${to.name}.`, playerId, { tradeId: s.pendingTrade.id });
}

function transferProperty(ctx: Ctx, tileId: number, toId: string) {
  const ps = ctx.s.properties[tileId];
  ps.owner = toId;
  if (ps.mortgaged) {
    const t = tile(tileId) as PropertyTile;
    const fee = Math.ceil(mortgageValue(t) * 0.1);
    const to = player(ctx.s, toId);
    if (to.cash >= fee) {
      to.cash -= fee;
      emit(ctx, 'mortgage_fee', `${to.name} pagó ${fmt(fee)} de interés por recibir ${t.name} hipotecada.`, toId, { amount: fee });
    }
  }
}

function tradeAccept(ctx: Ctx, playerId: string, tradeId: string) {
  const s = ctx.s;
  requirePlaying(ctx);
  const tr = s.pendingTrade;
  if (!tr || tr.id !== tradeId) throw new RuleError('La propuesta ya no existe.');
  if (tr.toId !== playerId) throw new RuleError('Esta propuesta no es para vos.');
  // Revalidar (pudo cambiar el estado)
  validateSide(s, tr.fromId, tr.give);
  validateSide(s, tr.toId, tr.receive);
  const from = player(s, tr.fromId);
  const to = player(s, tr.toId);
  from.cash -= tr.give.cash; to.cash += tr.give.cash;
  to.cash -= tr.receive.cash; from.cash += tr.receive.cash;
  for (let i = 0; i < tr.give.jailCards; i++) to.jailCards.push(from.jailCards.shift()!);
  for (let i = 0; i < tr.receive.jailCards; i++) from.jailCards.push(to.jailCards.shift()!);
  for (const id of tr.give.properties) transferProperty(ctx, id, to.id);
  for (const id of tr.receive.properties) transferProperty(ctx, id, from.id);
  s.pendingTrade = null;
  const desc = (side: TradeSide) => [
    side.cash ? fmt(side.cash) : null,
    ...side.properties.map(id => tile(id).name),
    side.jailCards ? `${side.jailCards} carta(s) de cárcel` : null,
  ].filter(Boolean).join(', ') || 'nada';
  emit(ctx, 'trade_done', `${from.name} entregó ${desc(tr.give)} y ${to.name} entregó ${desc(tr.receive)}.`, playerId);
  if (s.turnPhase === 'DEBT') settleDebt(ctx);
}

function tradeReject(ctx: Ctx, playerId: string, tradeId: string) {
  const tr = ctx.s.pendingTrade;
  if (!tr || tr.id !== tradeId) throw new RuleError('La propuesta ya no existe.');
  if (tr.toId !== playerId && tr.fromId !== playerId) throw new RuleError('No participás de esa propuesta.');
  ctx.s.pendingTrade = null;
  emit(ctx, 'trade_rejected', `${player(ctx.s, playerId).name} ${tr.fromId === playerId ? 'canceló' : 'rechazó'} el intercambio.`, playerId);
}

// ---------------------------------------------------------------------------
// Deuda y quiebra
// ---------------------------------------------------------------------------

function payDebt(ctx: Ctx, playerId: string) {
  requirePlaying(ctx);
  requirePhase(ctx, 'DEBT');
  requireCurrent(ctx, playerId);
  const d = ctx.s.debt!;
  if (currentPlayer(ctx.s).cash < d.amount) throw new RuleError(`Te faltan ${fmt(d.amount - currentPlayer(ctx.s).cash)}.`);
  const wasJailFine = d.reason === 'multa: salida de Tacumbú';
  settleDebt(ctx);
  if (wasJailFine) resolveLanding(ctx, currentPlayer(ctx.s));
}

function declareBankruptcy(ctx: Ctx, playerId: string) {
  requirePlaying(ctx);
  const p = player(ctx.s, playerId);
  if (p.bankrupt) throw new RuleError('Ya estás fuera.');
  const creditors = ctx.s.turnPhase === 'DEBT' && currentPlayer(ctx.s).id === playerId ? ctx.s.debt!.creditorIds : [];
  emit(ctx, 'bankruptcy_declared', `${p.name} se declara en quiebra.`, playerId);
  bankrupt(ctx, playerId, creditors);
}

function bankrupt(ctx: Ctx, debtorId: string, creditorIds: string[]) {
  const s = ctx.s;
  const debtor = player(s, debtorId);
  const wasCurrent = currentPlayer(s).id === debtorId;
  const debtAmount = s.debt?.amount ?? 0;
  const singleCreditor = creditorIds.length === 1 ? player(s, creditorIds[0]) : null;

  // Edificios: se venden al banco a mitad de precio; el efectivo va al acreedor
  let cash = debtor.cash;
  for (const t of propertiesOf(s, debtorId)) {
    const ps = s.properties[t.id];
    if (t.type === 'street' && ps.houses > 0) {
      cash += Math.floor((ps.houses * t.houseCost) / 2);
      if (ps.houses === 5) s.hotelsAvailable++; else s.housesAvailable += ps.houses;
      ps.houses = 0;
    }
  }
  debtor.cash = 0;

  if (singleCreditor) {
    singleCreditor.cash += cash;
    for (const t of propertiesOf(s, debtorId)) transferProperty(ctx, t.id, singleCreditor.id);
    singleCreditor.jailCards.push(...debtor.jailCards);
    emit(ctx, 'bankrupt', `${debtor.name} quebró. ${singleCreditor.name} recibe todos sus bienes.`, debtorId, { creditor: singleCreditor.id, debt: debtAmount });
  } else {
    // Al banco (o a varios acreedores): las propiedades se subastan
    if (creditorIds.length > 1) {
      const share = Math.floor(cash / creditorIds.length);
      for (const id of creditorIds) credit(ctx, id, share);
    }
    const props = propertiesOf(s, debtorId);
    for (const t of props) {
      s.properties[t.id] = { owner: null, houses: 0, mortgaged: false };
    }
    for (const deck of debtor.jailCards) s.decks[deck].push(deck === 'chance' ? 'S8' : 'C5');
    emit(ctx, 'bankrupt', `${debtor.name} quebró. Sus propiedades vuelven al banco y se subastan.`, debtorId, { debt: debtAmount });
    s.auctionQueue.push(...props.map(t => t.id));
  }
  debtor.jailCards = [];
  debtor.bankrupt = true;
  debtor.inJail = false;
  s.debt = null;
  if (s.pendingTrade && (s.pendingTrade.fromId === debtorId || s.pendingTrade.toId === debtorId)) s.pendingTrade = null;
  if (s.challenge && (s.challenge.fromId === debtorId || s.challenge.toId === debtorId)) {
    const rp = s.challenge.returnPhase;
    s.challenge = null;
    if (s.turnPhase === 'CHALLENGE') s.turnPhase = rp;
  }
  if (s.rentOffer && (s.rentOffer.payerId === debtorId || s.rentOffer.ownerId === debtorId)) {
    s.rentOffer = null;
    if (s.turnPhase === 'RENT_OFFER') s.turnPhase = 'END_TURN';
  }
  if (s.casino && s.casino.playerId === debtorId) { s.casino = null; if (s.turnPhase === 'CASINO') s.turnPhase = 'END_TURN'; }

  if (activePlayers(s).length <= 1) return endGame(ctx, activePlayers(s)[0]?.id ?? null);

  if (s.auctionQueue.length && s.settings.auctions) {
    if (s.auction) return; // ya hay una subasta en curso: las nuevas quedan en cola
    const next = s.auctionQueue.shift()!;
    return startAuction(ctx, next, false, wasCurrent ? undefined : s.turnPhase);
  }
  s.auctionQueue = [];
  if (wasCurrent) nextTurn(ctx);
}

function payRent(ctx: Ctx, p: Player, owner: Player, rent: number, tileName: string) {
  const paid = charge(ctx, p.id, rent, [owner.id], `alquiler de ${tileName}`);
  if (paid) {
    emit(ctx, 'rent', `${p.name} pagó ${fmt(rent)} de alquiler a ${owner.name} por ${tileName}.`, p.id, { amount: rent, to: owner.id });
    finishResolution(ctx);
  }
}

// ---------------------------------------------------------------------------
// Alquiler a doble o nada
// ---------------------------------------------------------------------------

function rentPay(ctx: Ctx, playerId: string) {
  requirePlaying(ctx); requirePhase(ctx, 'RENT_OFFER');
  const o = ctx.s.rentOffer!;
  if (o.payerId !== playerId) throw new RuleError('No te corresponde.');
  ctx.s.rentOffer = null;
  payRent(ctx, player(ctx.s, o.payerId), player(ctx.s, o.ownerId), o.rent, tile(o.tileId).name);
}

function rentDonPropose(ctx: Ctx, playerId: string) {
  requirePlaying(ctx); requirePhase(ctx, 'RENT_OFFER');
  const o = ctx.s.rentOffer!;
  if (o.payerId !== playerId) throw new RuleError('No te corresponde.');
  if (o.proposed) throw new RuleError('Ya propusiste.');
  const payer = player(ctx.s, playerId);
  if (payer.cash < o.rent * 2 && liquidationValue(ctx.s, playerId) < o.rent * 2) throw new RuleError('No podrías pagar el doble si perdés.');
  o.proposed = true;
  emit(ctx, 'rent_don_proposed', `${payer.name} le propone doble o nada a ${player(ctx.s, o.ownerId).name}: con 7 o más no paga nada, con 6 o menos paga ${fmt(o.rent * 2)}.`, playerId, { amount: o.rent, to: o.ownerId });
}

function rentDonAnswer(ctx: Ctx, playerId: string, accept: boolean) {
  const s = ctx.s;
  requirePlaying(ctx); requirePhase(ctx, 'RENT_OFFER');
  const o = s.rentOffer!;
  if (o.ownerId !== playerId) throw new RuleError('No te corresponde.');
  if (!o.proposed) throw new RuleError('Todavía no te propusieron nada.');
  const payer = player(s, o.payerId);
  const owner = player(s, o.ownerId);
  const name = tile(o.tileId).name;
  s.rentOffer = null;
  if (!accept) {
    emit(ctx, 'rent_don_rejected', `${owner.name} no aceptó el doble o nada.`, playerId);
    return payRent(ctx, payer, owner, o.rent, name);
  }
  const r = rollDice(s.seed);
  s.seed = r.seed;
  const sum = r.dice[0] + r.dice[1];
  const win = sum >= 7;
  emit(ctx, 'rent_don_roll', `${owner.name} aceptó. ${payer.name} tiró ${r.dice[0]} + ${r.dice[1]} = ${sum}: ${win ? '¡no paga nada!' : `paga el doble, ${fmt(o.rent * 2)}.`}`, o.payerId, { dice: r.dice, win, amount: o.rent * 2, to: o.ownerId });
  if (win) return finishResolution(ctx);
  payRent(ctx, payer, owner, o.rent * 2, name);
}

// ---------------------------------------------------------------------------
// Casino
// ---------------------------------------------------------------------------

function casinoPlayer(ctx: Ctx, playerId: string): Player {
  requirePlaying(ctx); requirePhase(ctx, 'CASINO');
  const c = ctx.s.casino!;
  if (c.playerId !== playerId) throw new RuleError('No estás en el Casino.');
  return player(ctx.s, playerId);
}

function casinoLoss(ctx: Ctx, amount: number) {
  if (ctx.s.settings.jackpot) ctx.s.jackpot += amount;
  else if (ctx.s.settings.freeParkingPot) ctx.s.freeParkingPot += amount;
}

function validateBet(ctx: Ctx, p: Player, amount: number) {
  if (!Number.isInteger(amount) || amount < 10) throw new RuleError('La apuesta mínima es ₲ 10.000.');
  if (amount > ctx.s.settings.casinoMaxBet) throw new RuleError(`La apuesta máxima es ${fmt(ctx.s.settings.casinoMaxBet)}.`);
  if (amount > p.cash) throw new RuleError('No tenés ese efectivo.');
}

function casinoLeave(ctx: Ctx, playerId: string) {
  const p = casinoPlayer(ctx, playerId);
  const c = ctx.s.casino!;
  if (c.double) {
    // salir con doble o nada en curso equivale a retirar lo acumulado
    p.cash += c.double.stake;
    emit(ctx, 'casino_cashout', `${p.name} se retira del Casino con ${fmt(c.double.stake)}.`, playerId, { amount: c.double.stake });
  } else {
    emit(ctx, 'casino_leave', `${p.name} salió del Casino.`, playerId);
  }
  ctx.s.casino = null;
  finishResolution(ctx);
}

function casinoPlay(ctx: Ctx, playerId: string, game: 'ruleta' | 'quiniela' | 'carrera', amount: number, pick?: number) {
  const s = ctx.s;
  const p = casinoPlayer(ctx, playerId);
  const c = s.casino!;
  if (c.played || c.double) throw new RuleError('Una apuesta por visita al Casino.');
  validateBet(ctx, p, amount);
  p.cash -= amount;
  c.played = true;

  if (game === 'ruleta') {
    const r = nextRandomInt(ctx, 100) + 1; // 1..100
    const win = r <= 49;
    if (win) p.cash += amount * 2; else casinoLoss(ctx, amount);
    emit(ctx, 'casino_result', `${p.name} apostó ${fmt(amount)} en la Ruleta: salió ${r}, ${win ? `¡ganó ${fmt(amount)}!` : 'perdió.'}`, playerId,
      { game, amount, roll: r, win, payout: win ? amount * 2 : 0 });
  } else if (game === 'quiniela') {
    if (pick === undefined || pick < 2 || pick > 12) throw new RuleError('Elegí un número del 2 al 12.');
    const r = rollDice(s.seed); s.seed = r.seed;
    const sum = r.dice[0] + r.dice[1];
    const win = sum === pick;
    const payout = win ? amount * (QUINIELA_PAYOUT[pick] + 1) : 0;
    if (win) p.cash += payout; else casinoLoss(ctx, amount);
    emit(ctx, 'casino_result', `${p.name} jugó ${fmt(amount)} al ${pick} en la Quiniela: salió ${r.dice[0]} + ${r.dice[1]} = ${sum}, ${win ? `¡ganó ${fmt(payout - amount)}!` : 'perdió.'}`, playerId,
      { game, amount, pick, dice: r.dice, sum, win, payout });
  } else {
    if (pick === undefined || pick < 0 || pick > 5) throw new RuleError('Elegí una carreta del 1 al 6.');
    // Carrera: 6 carretas avanzan 1-3 por paso durante 10 pasos; gana la que más lejos llega (empates: la primera)
    const steps = 10;
    const race: number[][] = Array.from({ length: 6 }, () => []);
    const totals = [0, 0, 0, 0, 0, 0];
    for (let st = 0; st < steps; st++) {
      for (let k = 0; k < 6; k++) {
        totals[k] += 1 + nextRandomInt(ctx, 3);
        race[k].push(totals[k]);
      }
    }
    let winner = 0;
    for (let k = 1; k < 6; k++) if (totals[k] > totals[winner]) winner = k;
    const win = winner === pick;
    const payout = win ? amount * (CARRETA_PAYOUT + 1) : 0;
    if (win) p.cash += payout; else casinoLoss(ctx, amount);
    emit(ctx, 'casino_result', `${p.name} apostó ${fmt(amount)} a la carreta ${pick + 1}: ganó la carreta ${winner + 1}, ${win ? `¡cobra ${fmt(payout - amount)}!` : 'perdió.'}`, playerId,
      { game, amount, pick, race, winner, win, payout });
  }
  // El jugador puede quedarse mirando y salir cuando quiera (CASINO_LEAVE)
}

function casinoDoubleStart(ctx: Ctx, playerId: string, amount: number) {
  const s = ctx.s;
  const p = casinoPlayer(ctx, playerId);
  const c = s.casino!;
  if (c.played || c.double) throw new RuleError('Una apuesta por visita al Casino.');
  validateBet(ctx, p, amount);
  p.cash -= amount;
  c.played = true;
  c.double = { stake: amount, step: 0 };
  casinoDoubleRoll(ctx, p);
}

function casinoDoubleContinue(ctx: Ctx, playerId: string) {
  const p = casinoPlayer(ctx, playerId);
  const c = ctx.s.casino!;
  if (!c.double) throw new RuleError('No hay doble o nada en curso.');
  casinoDoubleRoll(ctx, p);
}

function casinoDoubleRoll(ctx: Ctx, p: Player) {
  const s = ctx.s;
  const c = s.casino!;
  const d = c.double!;
  const r = rollDice(s.seed); s.seed = r.seed;
  const sum = r.dice[0] + r.dice[1];
  const win = sum % 2 === 0;
  if (win) {
    d.stake *= 2;
    d.step++;
    emit(ctx, 'casino_double', `${p.name} tiró ${r.dice[0]} + ${r.dice[1]} (par): ¡dobla a ${fmt(d.stake)}! Paso ${d.step} de ${DOUBLE_MAX_STEPS}.`, p.id, { dice: r.dice, win: true, stake: d.stake, step: d.step });
    if (d.step >= DOUBLE_MAX_STEPS) {
      p.cash += d.stake;
      emit(ctx, 'casino_cashout', `${p.name} llegó al tope y se lleva ${fmt(d.stake)}.`, p.id, { amount: d.stake });
      c.double = null;
    }
  } else {
    emit(ctx, 'casino_double', `${p.name} tiró ${r.dice[0]} + ${r.dice[1]} (impar): perdió ${fmt(d.stake)}.`, p.id, { dice: r.dice, win: false, stake: d.stake, step: d.step });
    casinoLoss(ctx, d.stake);
    c.double = null;
  }
}

function casinoCashout(ctx: Ctx, playerId: string) {
  const p = casinoPlayer(ctx, playerId);
  const c = ctx.s.casino!;
  if (!c.double) throw new RuleError('No hay nada que retirar.');
  p.cash += c.double.stake;
  emit(ctx, 'casino_cashout', `${p.name} se retira con ${fmt(c.double.stake)}.`, playerId, { amount: c.double.stake });
  c.double = null;
}

/** Entero uniforme en [0, n) usando la semilla de la partida. */
function nextRandomInt(ctx: Ctx, n: number): number {
  const r = nextRandom(ctx.s.seed);
  ctx.s.seed = r.seed;
  return Math.floor(r.value * n);
}

// ---------------------------------------------------------------------------
// Desafíos (mini-juegos entre dos jugadores)
// ---------------------------------------------------------------------------

function startChallengePick(ctx: Ctx, p: Player, amount: number) {
  const s = ctx.s;
  const rivals = activePlayers(s).filter(x => x.id !== p.id && x.cash > 0);
  if (!rivals.length || p.cash <= 0) return finishResolution(ctx);
  s.tradeCounter++;
  s.challenge = {
    id: `d${s.tradeCounter}`, kind: null, fromId: p.id, toId: null, amount, status: 'pick', forced: true,
    returnPhase: 'END_TURN', data: {}, secret: {},   // al terminar se llama a finishResolution (respeta los dobles)
  };
  s.turnPhase = 'CHALLENGE';
}

function challengePropose(ctx: Ctx, playerId: string, toId: string, kind: ChallengeKind, amount: number) {
  const s = ctx.s;
  requirePlaying(ctx);
  if (!s.settings.challenges) throw new RuleError('Los desafíos no están activados en esta sala.');
  if (!CHALLENGE_KINDS.includes(kind)) throw new RuleError('Mini-juego inválido.');
  const from = player(s, playerId);
  const to = player(s, toId);
  if (from.bankrupt || to.bankrupt || from.id === to.id) throw new RuleError('Rival inválido.');

  const picking = s.turnPhase === 'CHALLENGE' && s.challenge?.status === 'pick' && s.challenge.fromId === playerId;
  if (picking) {
    const c = s.challenge!;
    const amt = Math.min(c.amount, from.cash, to.cash);
    if (amt <= 0) { s.challenge = null; s.turnPhase = c.returnPhase; return; }
    c.kind = kind; c.toId = toId; c.amount = amt; c.status = 'playing';
    emit(ctx, 'challenge_start', `${from.name} desafió a ${to.name} a ${challengeName(kind)} por ${fmt(amt)} (por carta: no puede negarse).`, playerId, { kind, amount: amt, to: toId, forced: true });
    return beginChallenge(ctx);
  }

  requireCurrent(ctx, playerId);
  requirePhase(ctx, 'AWAITING_ROLL', 'END_TURN');
  if (s.challenge) throw new RuleError('Ya hay un desafío en curso.');
  if (!Number.isInteger(amount) || amount < 10) throw new RuleError('La apuesta mínima es ₲ 10.000.');
  if (amount > from.cash) throw new RuleError('No tenés ese efectivo.');
  if (amount > to.cash) throw new RuleError(`${to.name} no tiene ese efectivo.`);
  s.tradeCounter++;
  s.challenge = {
    id: `d${s.tradeCounter}`, kind, fromId: playerId, toId, amount, status: 'pending', forced: false,
    returnPhase: s.turnPhase, data: {}, secret: {},
  };
  s.turnPhase = 'CHALLENGE';
  emit(ctx, 'challenge_proposed', `${from.name} desafía a ${to.name} a ${challengeName(kind)} por ${fmt(amount)}.`, playerId, { kind, amount, to: toId });
}

export function challengeName(kind: ChallengeKind): string {
  return { dados: 'Duelo de dados', ppt: 'Piedra, papel o tijera', trivia: 'Trivia paraguaya', terere: 'Tereré caliente' }[kind];
}

function challengeAnswer(ctx: Ctx, playerId: string, accept: boolean) {
  const s = ctx.s;
  requirePlaying(ctx); requirePhase(ctx, 'CHALLENGE');
  const c = s.challenge!;
  if (c.status !== 'pending') throw new RuleError('El desafío ya empezó.');
  if (c.toId !== playerId) throw new RuleError('El desafío no es para vos.');
  if (!accept) {
    emit(ctx, 'challenge_rejected', `${player(s, playerId).name} no aceptó el desafío.`, playerId);
    s.turnPhase = c.returnPhase;
    s.challenge = null;
    return;
  }
  c.status = 'playing';
  emit(ctx, 'challenge_accepted', `${player(s, playerId).name} aceptó el desafío. ¡Empieza ${challengeName(c.kind!)}!`, playerId, { kind: c.kind });
  beginChallenge(ctx);
}

function beginChallenge(ctx: Ctx) {
  const s = ctx.s;
  const c = s.challenge!;
  switch (c.kind) {
    case 'dados': {
      // Se tira hasta que no haya empate
      for (let i = 0; i < 20; i++) {
        const a = rollDice(s.seed); s.seed = a.seed;
        const b = rollDice(a.seed); s.seed = b.seed;
        c.data.rolls = { [c.fromId]: a.dice, [c.toId!]: b.dice };
        const sa = a.dice[0] + a.dice[1], sb = b.dice[0] + b.dice[1];
        if (sa !== sb) return finishChallenge(ctx, sa > sb ? c.fromId : c.toId!, `${sa} contra ${sb}`);
        emit(ctx, 'challenge_tie', `Empate ${sa} a ${sb}: se tira de nuevo.`, undefined, { rolls: c.data.rolls });
      }
      return finishChallenge(ctx, null, 'empate persistente');
    }
    case 'ppt':
      c.data.rounds = []; c.data.score = { [c.fromId]: 0, [c.toId!]: 0 }; c.data.chosen = []; c.secret.choices = {};
      return;
    case 'trivia':
      c.data.qIndex = 0; c.secret.used = [];
      return nextTriviaQuestion(ctx);
    case 'terere':
      c.data.go = false;
      return;
  }
}

function nextTriviaQuestion(ctx: Ctx) {
  const c = ctx.s.challenge!;
  const used = c.secret.used!;
  let idx = nextRandomInt(ctx, TRIVIA.length);
  for (let i = 0; i < TRIVIA.length && used.includes(idx); i++) idx = (idx + 1) % TRIVIA.length;
  used.push(idx);
  const t = TRIVIA[idx];
  c.data.question = { q: t.q, options: [...t.options] };
  c.data.answered = {};
  c.secret.answer = t.answer;
}

function challengeMove(ctx: Ctx, playerId: string, choice?: PptChoice, answer?: number) {
  const s = ctx.s;
  requirePlaying(ctx); requirePhase(ctx, 'CHALLENGE');
  const c = s.challenge!;
  if (c.status !== 'playing') throw new RuleError('El desafío no está en juego.');
  if (playerId !== c.fromId && playerId !== c.toId) throw new RuleError('No participás de este desafío.');
  const other = playerId === c.fromId ? c.toId! : c.fromId;

  switch (c.kind) {
    case 'ppt': {
      if (!choice || !['piedra', 'papel', 'tijera'].includes(choice)) throw new RuleError('Elegí piedra, papel o tijera.');
      if (c.secret.choices![playerId]) throw new RuleError('Ya elegiste en esta ronda.');
      c.secret.choices![playerId] = choice;
      c.data.chosen = Object.keys(c.secret.choices!);
      if (!c.secret.choices![other]) return;
      const a = c.secret.choices![c.fromId], b = c.secret.choices![c.toId!];
      const beats: Record<PptChoice, PptChoice> = { piedra: 'tijera', papel: 'piedra', tijera: 'papel' };
      const winner = a === b ? null : beats[a] === b ? c.fromId : c.toId!;
      c.data.rounds!.push({ a, b, winner });
      if (winner) c.data.score![winner]++;
      c.secret.choices = {}; c.data.chosen = [];
      emit(ctx, 'challenge_round', `Ronda ${c.data.rounds!.length}: ${player(s, c.fromId).name} ${a} · ${player(s, c.toId!).name} ${b} → ${winner ? `punto para ${player(s, winner).name}` : 'empate'}.`, undefined, { a, b, winner, score: c.data.score });
      const [s1, s2] = [c.data.score![c.fromId], c.data.score![c.toId!]];
      if (s1 >= 2) return finishChallenge(ctx, c.fromId, `${s1} a ${s2}`);
      if (s2 >= 2) return finishChallenge(ctx, c.toId!, `${s2} a ${s1}`);
      if (c.data.rounds!.length >= 7) return finishChallenge(ctx, null, 'demasiados empates');
      return;
    }
    case 'trivia': {
      if (answer === undefined || answer < 0 || answer > 3) throw new RuleError('Elegí una opción.');
      if (c.data.answered![playerId] !== undefined) throw new RuleError('Ya respondiste esta pregunta.');
      c.data.answered![playerId] = answer;
      const name = player(s, playerId).name;
      if (answer === c.secret.answer) {
        emit(ctx, 'challenge_round', `${name} respondió "${c.data.question!.options[answer]}": ¡correcto!`, playerId, { correct: true, answer: c.secret.answer });
        return finishChallenge(ctx, playerId, 'acertó primero');
      }
      emit(ctx, 'challenge_round', `${name} respondió "${c.data.question!.options[answer]}": incorrecto.`, playerId, { correct: false });
      if (c.data.answered![other] === undefined) return; // el otro todavía puede acertar
      // Los dos fallaron
      emit(ctx, 'challenge_round', `Nadie acertó. La respuesta era "${c.data.question!.options[c.secret.answer!]}".`, undefined, { reveal: c.secret.answer });
      c.data.qIndex!++;
      if (c.data.qIndex! >= 3) {
        const r = rollDice(s.seed); s.seed = r.seed;
        const w = r.dice[0] >= r.dice[1] ? c.fromId : c.toId!; // desempate a un dado
        return finishChallenge(ctx, w, 'desempate al dado tras tres preguntas falladas');
      }
      return nextTriviaQuestion(ctx);
    }
    case 'terere': {
      if (!c.data.go) {
        emit(ctx, 'challenge_round', `${player(s, playerId).name} se adelantó: ¡tocó antes de tiempo!`, playerId, { falseStart: true });
        return finishChallenge(ctx, other, 'salida en falso del rival');
      }
      return finishChallenge(ctx, playerId, 'tocó primero');
    }
    default:
      throw new RuleError('Este desafío no recibe jugadas.');
  }
}

function challengeGo(ctx: Ctx) {
  const c = ctx.s.challenge;
  if (!c || c.kind !== 'terere' || c.status !== 'playing' || c.data.go) return;
  c.data.go = true;
  emit(ctx, 'challenge_go', '¡TERERÉ! ¡Tocá ahora!', undefined, { go: true });
}

function finishChallenge(ctx: Ctx, winnerId: string | null, reason: string) {
  const s = ctx.s;
  const c = s.challenge!;
  c.status = 'done';
  c.data.winnerId = winnerId;
  c.data.reason = reason;
  if (winnerId) {
    const loserId = winnerId === c.fromId ? c.toId! : c.fromId;
    const winner = player(s, winnerId), loser = player(s, loserId);
    const amt = Math.min(c.amount, loser.cash);
    loser.cash -= amt;
    winner.cash += amt;
    emit(ctx, 'challenge_done', `¡${winner.name} ganó el desafío (${reason}) y cobra ${fmt(amt)} de ${loser.name}!`, winnerId, { kind: c.kind, winner: winnerId, loser: loserId, amount: amt, to: winnerId });
  } else {
    emit(ctx, 'challenge_done', `El desafío terminó sin ganador (${reason}). Nadie paga.`, undefined, { kind: c.kind, winner: null, amount: 0 });
  }
  s.challenge = null;
  s.turnPhase = c.returnPhase;
  if (c.forced) finishResolution(ctx);
}

function challengeCancel(ctx: Ctx, playerId: string) {
  const s = ctx.s;
  requirePlaying(ctx);
  const c = s.challenge;
  if (!c) return;
  if (playerId !== s.hostId && playerId !== c.fromId) throw new RuleError('Solo el anfitrión puede anular un desafío.');
  emit(ctx, 'challenge_cancelled', 'El desafío se anuló; nadie paga.', playerId);
  s.challenge = null;
  s.turnPhase = c.returnPhase;
  if (c.forced) finishResolution(ctx);
}

// ---------------------------------------------------------------------------
// Abandono / reemplazo por bot
// ---------------------------------------------------------------------------

function leaveGame(ctx: Ctx, playerId: string, targetId: string) {
  const s = ctx.s;
  requirePlaying(ctx);
  if (playerId !== targetId && playerId !== s.hostId) throw new RuleError('Solo el anfitrión puede sacar a otro jugador.');
  const target = player(s, targetId);
  if (target.bankrupt) throw new RuleError('Ese jugador ya está fuera.');

  // Si estaba en una subasta, se retira (y si tenía la mejor oferta, la subasta se reinicia)
  if (s.auction && s.auction.activeBidders.includes(targetId)) {
    s.auction.activeBidders = s.auction.activeBidders.filter(id => id !== targetId);
    if (s.auction.highestBidderId === targetId) { s.auction.highestBidderId = null; s.auction.highestBid = 0; }
  }
  emit(ctx, 'leave', playerId === targetId ? `${target.name} abandonó la partida.` : `${player(s, playerId).name} sacó a ${target.name} de la partida.`, targetId);

  const wasAuction = s.turnPhase === 'AUCTION';
  bankrupt(ctx, targetId, []);
  // bankrupt() pudo encolar subastas nuevas; si había una en curso y el que se fue no era el actual,
  // la subasta en curso sigue con los que quedan.
  if (wasAuction && s.auction && s.phase === 'PLAYING') checkAuctionEnd(ctx);
}

function setBot(ctx: Ctx, playerId: string, targetId: string, isBot: boolean) {
  const s = ctx.s;
  requirePlaying(ctx);
  if (playerId !== s.hostId && playerId !== targetId) throw new RuleError('Solo el anfitrión puede hacer eso.');
  const target = player(s, targetId);
  if (target.bankrupt) throw new RuleError('Ese jugador ya está fuera.');
  if (target.isBot === isBot) return;
  target.isBot = isBot;
  emit(ctx, 'bot', isBot ? `${target.name} ahora es controlado por un bot.` : `${target.name} volvió a tomar el control de su jugador.`, targetId);
}

/** Nueva partida en el lobby con los mismos jugadores y reglas (revancha). */
export function rematch(state: GameState, seed: number): GameState {
  if (state.phase !== 'FINISHED') throw new RuleError('La partida todavía no terminó.');
  const fresh = createGame(state.roomCode, state.hostId, seed, state.settings);
  for (const p of state.players) {
    fresh.players.push({
      ...p, cash: fresh.settings.startingCash, position: 0, inJail: false, jailTurns: 0, jailCards: [],
      bankrupt: false, lapsCompleted: 0,
    });
  }
  if (!fresh.players.some(p => p.id === fresh.hostId)) fresh.hostId = fresh.players[0]?.id ?? fresh.hostId;
  return fresh;
}

// ---------------------------------------------------------------------------
// Fin de turno
// ---------------------------------------------------------------------------

function endTurn(ctx: Ctx, playerId: string) {
  requirePlaying(ctx);
  requirePhase(ctx, 'END_TURN');
  requireCurrent(ctx, playerId);
  nextTurn(ctx);
}

/** Usado por el servidor cuando vence el temporizador: toma la decisión por defecto. */
function forceEndTurn(ctx: Ctx): void {
  const s = ctx.s;
  requirePlaying(ctx);
  // Bucle con tope: cada iteración avanza una decisión por defecto hasta que cambia el turno.
  const startTurn = s.turnNumber;
  for (let guard = 0; guard < 20 && s.phase === 'PLAYING' && s.turnNumber === startTurn; guard++) {
    const p = currentPlayer(s);
    const ph: TurnPhase = s.turnPhase;
    if (ph === 'AWAITING_ROLL') roll(ctx, p.id);
    else if (ph === 'AWAITING_BUY') decline(ctx, p.id);
    else if (ph === 'TAX_CHOICE') taxChoice(ctx, p.id, 'flat');
    else if (ph === 'AUCTION') {
      for (const id of [...s.auction!.activeBidders]) {
        if (s.auction && id !== s.auction.highestBidderId) auctionPass(ctx, id);
      }
      if (s.auction) auctionPass(ctx, s.auction.activeBidders[0]);
    } else if (ph === 'DEBT') {
      autoLiquidate(ctx, p.id);
      if (s.debt) declareBankruptcy(ctx, p.id);
    } else if (ph === 'CASINO') casinoLeave(ctx, s.casino!.playerId);
    else if (ph === 'RENT_OFFER') {
      if (s.rentOffer!.proposed) rentDonAnswer(ctx, s.rentOffer!.ownerId, false);
      else rentPay(ctx, s.rentOffer!.payerId);
    } else if (ph === 'CHALLENGE') {
      const c = s.challenge!;
      if (c.status === 'pending') challengeAnswer(ctx, c.toId!, false);
      else challengeCancel(ctx, s.hostId);
    } else if (ph === 'END_TURN') nextTurn(ctx);
  }
}

function autoLiquidate(ctx: Ctx, playerId: string) {
  const s = ctx.s;
  for (let guard = 0; guard < 100 && s.turnPhase === 'DEBT'; guard++) {
    const props = propertiesOf(s, playerId);
    const sellable = props.find(t => !canSellBuilding(s, playerId, t.id));
    if (sellable) { sellBuilding(ctx, playerId, sellable.id); continue; }
    const mortgageable = props.find(t => !canMortgage(s, playerId, t.id));
    if (mortgageable) { mortgage(ctx, playerId, mortgageable.id); continue; }
    break;
  }
}

// ---------------------------------------------------------------------------
// Punto de entrada
// ---------------------------------------------------------------------------

export function applyAction(state: GameState, action: Action): { state: GameState; events: GameEvent[] } {
  const ctx: Ctx = { s: structuredClone(state), events: [] };
  switch (action.type) {
    case 'START_GAME': startGame(ctx, action.playerId); break;
    case 'ROLL': roll(ctx, action.playerId); break;
    case 'BUY': buy(ctx, action.playerId); break;
    case 'DECLINE': decline(ctx, action.playerId); break;
    case 'BID': bid(ctx, action.playerId, action.amount); break;
    case 'AUCTION_PASS': auctionPass(ctx, action.playerId); break;
    case 'BUILD': build(ctx, action.playerId, action.tileId); break;
    case 'SELL_BUILDING': sellBuilding(ctx, action.playerId, action.tileId); break;
    case 'MORTGAGE': mortgage(ctx, action.playerId, action.tileId); break;
    case 'UNMORTGAGE': unmortgage(ctx, action.playerId, action.tileId); break;
    case 'JAIL_PAY': jailPay(ctx, action.playerId); break;
    case 'JAIL_CARD': jailCard(ctx, action.playerId); break;
    case 'TAX_CHOICE': taxChoice(ctx, action.playerId, action.choice); break;
    case 'TRADE_PROPOSE': tradePropose(ctx, action.playerId, action.toPlayerId, action.give, action.receive); break;
    case 'TRADE_ACCEPT': tradeAccept(ctx, action.playerId, action.tradeId); break;
    case 'TRADE_REJECT':
    case 'TRADE_CANCEL': tradeReject(ctx, action.playerId, action.tradeId); break;
    case 'PAY_DEBT': payDebt(ctx, action.playerId); break;
    case 'DECLARE_BANKRUPTCY': declareBankruptcy(ctx, action.playerId); break;
    case 'END_TURN': endTurn(ctx, action.playerId); break;
    case 'FORCE_END_TURN': forceEndTurn(ctx); break;
    case 'END_GAME':
      if (action.playerId !== ctx.s.hostId) throw new RuleError('Solo el anfitrión puede terminar la partida.');
      requirePlaying(ctx);
      endGame(ctx, null);
      break;
    case 'LEAVE_GAME': leaveGame(ctx, action.playerId, action.targetId); break;
    case 'SET_BOT': setBot(ctx, action.playerId, action.targetId, action.isBot); break;
    case 'CASINO_PLAY': casinoPlay(ctx, action.playerId, action.game, action.amount, action.pick); break;
    case 'CASINO_DOUBLE_START': casinoDoubleStart(ctx, action.playerId, action.amount); break;
    case 'CASINO_DOUBLE_CONTINUE': casinoDoubleContinue(ctx, action.playerId); break;
    case 'CASINO_CASHOUT': casinoCashout(ctx, action.playerId); break;
    case 'CASINO_LEAVE': casinoLeave(ctx, action.playerId); break;
    case 'RENT_PAY': rentPay(ctx, action.playerId); break;
    case 'RENT_DON_PROPOSE': rentDonPropose(ctx, action.playerId); break;
    case 'RENT_DON_ACCEPT': rentDonAnswer(ctx, action.playerId, true); break;
    case 'RENT_DON_REJECT': rentDonAnswer(ctx, action.playerId, false); break;
    case 'CHALLENGE_PROPOSE': challengePropose(ctx, action.playerId, action.toId, action.kind, action.amount); break;
    case 'CHALLENGE_ACCEPT': challengeAnswer(ctx, action.playerId, true); break;
    case 'CHALLENGE_REJECT': challengeAnswer(ctx, action.playerId, false); break;
    case 'CHALLENGE_MOVE': challengeMove(ctx, action.playerId, action.choice, action.answer); break;
    case 'CHALLENGE_GO': challengeGo(ctx); break;
    case 'CHALLENGE_CANCEL': challengeCancel(ctx, action.playerId); break;
    default: throw new RuleError('Acción desconocida.');
  }
  return { state: ctx.s, events: ctx.events };
}

/** Acciones legales para un jugador en el estado actual (para habilitar botones). */
export function legalActions(state: GameState, playerId: string): Set<Action['type']> {
  const out = new Set<Action['type']>();
  if (state.phase === 'LOBBY') { if (playerId === state.hostId && state.players.length >= MIN_PLAYERS) out.add('START_GAME'); return out; }
  if (state.phase !== 'PLAYING') return out;
  const p = state.players.find(x => x.id === playerId);
  if (!p || p.bankrupt) return out;
  const isCurrent = currentPlayer(state).id === playerId;
  const ph = state.turnPhase;
  if (isCurrent) {
    if (ph === 'AWAITING_ROLL') {
      out.add('ROLL');
      if (p.inJail && p.cash >= JAIL_FINE) out.add('JAIL_PAY');
      if (p.inJail && p.jailCards.length) out.add('JAIL_CARD');
    }
    if (ph === 'AWAITING_BUY') { out.add('DECLINE'); if (p.cash >= (tile(p.position) as PropertyTile).price) out.add('BUY'); }
    if (ph === 'TAX_CHOICE') out.add('TAX_CHOICE');
    if (ph === 'END_TURN') out.add('END_TURN');
    if (ph === 'DEBT') { out.add('DECLARE_BANKRUPTCY'); if (state.debt && p.cash >= state.debt.amount) out.add('PAY_DEBT'); }
    if ((ph === 'AWAITING_ROLL' || ph === 'END_TURN') && state.settings.challenges && !state.challenge && activePlayers(state).length > 1) out.add('CHALLENGE_PROPOSE');
  }
  if (ph === 'CASINO' && state.casino?.playerId === playerId) {
    out.add('CASINO_LEAVE');
    if (!state.casino.played) { out.add('CASINO_PLAY'); out.add('CASINO_DOUBLE_START'); }
    if (state.casino.double) { out.add('CASINO_DOUBLE_CONTINUE'); out.add('CASINO_CASHOUT'); }
  }
  if (ph === 'RENT_OFFER' && state.rentOffer) {
    const o = state.rentOffer;
    if (o.payerId === playerId && !o.proposed) { out.add('RENT_PAY'); out.add('RENT_DON_PROPOSE'); }
    if (o.ownerId === playerId && o.proposed) { out.add('RENT_DON_ACCEPT'); out.add('RENT_DON_REJECT'); }
  }
  if (ph === 'CHALLENGE' && state.challenge) {
    const c = state.challenge;
    if (c.status === 'pick' && c.fromId === playerId) out.add('CHALLENGE_PROPOSE');
    if (c.status === 'pending' && c.toId === playerId) { out.add('CHALLENGE_ACCEPT'); out.add('CHALLENGE_REJECT'); }
    if (c.status === 'playing' && (c.fromId === playerId || c.toId === playerId) && c.kind !== 'dados') out.add('CHALLENGE_MOVE');
    if (playerId === state.hostId) out.add('CHALLENGE_CANCEL');
  }
  if (ph === 'AUCTION' && state.auction?.activeBidders.includes(playerId)) { out.add('BID'); out.add('AUCTION_PASS'); }
  const mgmt = (ph === 'AWAITING_ROLL' || ph === 'END_TURN' || ph === 'AWAITING_BUY') || (ph === 'DEBT' && isCurrent);
  if (mgmt) {
    const props = propertiesOf(state, playerId);
    if (ph !== 'DEBT' && props.some(t => !canBuild(state, playerId, t.id))) out.add('BUILD');
    if (props.some(t => !canSellBuilding(state, playerId, t.id))) out.add('SELL_BUILDING');
    if (props.some(t => !canMortgage(state, playerId, t.id))) out.add('MORTGAGE');
    if (ph !== 'DEBT' && props.some(t => !canUnmortgage(state, playerId, t.id))) out.add('UNMORTGAGE');
    if (!state.pendingTrade && activePlayers(state).length > 1) out.add('TRADE_PROPOSE');
  }
  if (state.pendingTrade?.toId === playerId) { out.add('TRADE_ACCEPT'); out.add('TRADE_REJECT'); }
  if (state.pendingTrade?.fromId === playerId) out.add('TRADE_CANCEL');
  if (playerId === state.hostId) out.add('END_GAME');
  return out;
}
