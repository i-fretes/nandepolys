import { ARENA_TILES, BOARD, BOARD_SIZE, CASINO_TILES, GO_SALARY, JAIL_FINE, JAIL_TILE, PALACIO_TILE, PROPERTY_IDS, TOTAL_HOTELS, TOTAL_HOUSES, groupTiles, isProperty, tile } from './board';
import { ARENA_GAMES, ARENA_REWARDS, BLACK_CARDS, BLURRY, BOMB_SYLLABLES, CHAINS, CUANTOS, DRAW_WORDS, EVENTS, LOOTBOX, MISSIONS, WHITE_CARDS } from './arena-data';
import { applyTruco, newTruco, type TrucoMove, type TrucoState } from './truco';
import { CHALLENGE_CARDS, CHANCE_CARDS, COMMUNITY_CARDS, card } from './cards';
import { TRIVIA } from './trivia';
import { nextRandom, rollDice, shuffle } from './rng';
import {
  activePlayers, canBuild, canMortgage, canSellBuilding, canUnmortgage, currentPlayer,
  liquidationValue, mortgageValue, netWorth, player, propertiesOf, ranking, rentFor, unmortgageCost,
} from './selectors';
import {
  RuleError, type Action, type ArenaGame, type Card, type ChallengeKind, type DeckId, type DuelGame, type GameEvent, type GameSettings, type GameState,
  type GlobalEventId, type Player, type PlayerStats, type PptChoice, type PropertyTile, type TokenId, type TradeSide, type TurnPhase,
} from './types';
import { countTransports, countUtilities } from './selectors';

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
  arena: false,
  lootbox: false,
  missions: false,
  events: false,
  duels: false,
};

export const ARENA_COUNTDOWN_MS = 3000;   // "3, 2, 1, ¡ya!" antes de cada mini-juego
export const ARENA_REVEAL_MS = 3500;      // tiempo mostrando la respuesta correcta en la trivia
export const TRUCO_HANDS = 2;             // el duelo de truco se define en 2 manos (empate: una más)
export const DUEL_MAX_BET = 500;
export const DUEL_COWARD_FEE = 50;
export const LAPS_PER_DUEL_TOKEN = 3;

export function emptyStats(): PlayerStats {
  return {
    rentsCollected: 0, rentsThisLap: 0, auctionsWon: 0, cheapAuctionWins: 0, challengesWon: 0, triviaWins: 0, casinoWins: 0,
    housesBuilt: 0, hotelsBuilt: 0, trades: 0, jailVisits: 0, jackpots: 0, arenaWins: 0, mortgagesRedeemed: 0, duelsWon: 0, doubles: 0, salaries: 0, donWins: 0,
  };
}
export const CHALLENGE_KINDS: ChallengeKind[] = ['dados', 'ppt', 'trivia', 'terere'];
/** Pago de la quiniela según la suma elegida (veces la apuesta, además de recuperarla). */
// Pagos del Casino: siempre por debajo de lo "justo" (la banca gana a la larga, ~15 %)
export const QUINIELA_PAYOUT: Record<number, number> = { 2: 25, 3: 13, 4: 8, 5: 6, 6: 5, 7: 4, 8: 5, 9: 6, 10: 8, 11: 13, 12: 25 };
export const CARRETA_PAYOUT = 4;
export const RULETA_WIN_CHANCE = 43;          // de 100: la ruleta paga 1 a 1 pero gana menos de la mitad de las veces
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
    arena: null,
    activeEvent: null,
    eventHistory: [],
    usedContent: {},
    roundStarterId: null,
    duel: null,
    lastLootbox: null,
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
    duelTokens: 0, missions: [], stats: emptyStats(),
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
  if (d.reason.startsWith('alquiler') && d.creditorIds.length === 1) { const o = player(ctx.s, d.creditorIds[0]); o.stats.rentsCollected++; o.stats.rentsThisLap++; }
  emit(ctx, 'debt_paid', `${debtor.name} pagó ${fmt(d.amount)} (${d.reason}).`, debtor.id, { amount: d.amount, to: d.creditorIds[0] });
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
  s.roundStarterId = s.players[0].id;
  if (s.settings.missions) {
    for (const p of s.players) {
      const pool = shuffle(MISSIONS.map(m => m.id), s.seed);
      s.seed = pool.seed;
      p.missions = pool.items.slice(0, 3).map(id => { const m = MISSIONS.find(x => x.id === id)!; return { id: m.id, text: m.text, reward: m.reward, done: false }; });
    }
    emit(ctx, 'missions', 'Cada jugador recibió tres misiones secretas.');
  }
  emit(ctx, 'game_start', `¡Empieza la partida! Sale ${s.players[0].name}.`, s.players[0].id);
}

// ---------------------------------------------------------------------------
// Movimiento
// ---------------------------------------------------------------------------

function sendToJail(ctx: Ctx, p: Player) {
  p.position = JAIL_TILE;
  p.inJail = true;
  p.jailTurns = 0;
  p.stats.jailVisits++;
  ctx.s.pendingReroll = false;
  ctx.s.doublesCount = 0;
  emit(ctx, 'jail', `${p.name} va preso a Tacumbú.`, p.id);
}

function moveForwardTo(ctx: Ctx, p: Player, target: number, collectGo: boolean) {
  const s = ctx.s;
  const from = p.position;
  p.position = target;
  if (collectGo && target <= from) {
    p.lapsCompleted++;
    p.stats.rentsThisLap = 0;
    p.stats.salaries++;
    if (s.settings.lootbox) {
      openLootbox(ctx, p);
    } else {
      let salary = s.settings.doubleGoSalary && target === 0 ? GO_SALARY * 2 : GO_SALARY;
      if (s.activeEvent?.id === 'san_juan') salary *= 2;
      credit(ctx, p.id, salary);
      emit(ctx, 'salary', `${p.name} pasó por Salida y cobró ${fmt(salary)}.`, p.id, { amount: salary });
    }
    if (s.settings.duels && p.lapsCompleted % LAPS_PER_DUEL_TOKEN === 0) {
      p.duelTokens++;
      emit(ctx, 'duel_token', `${p.name} completó ${p.lapsCompleted} vueltas y gana una ficha de Duelo mayor.`, p.id, { tokens: p.duelTokens });
    }
  }
}

function openLootbox(ctx: Ctx, p: Player) {
  const s = ctx.s;
  const total = LOOTBOX.reduce((n, x) => n + x.weight, 0);
  let r = nextRandomInt(ctx, total);
  let idx = 0;
  for (let i = 0; i < LOOTBOX.length; i++) { r -= LOOTBOX[i].weight; if (r < 0) { idx = i; break; } }
  const prize = LOOTBOX[idx];
  let text = `${p.name} pasó por Salida y abrió la caja sorpresa: ${prize.label}`;
  let amount = prize.amount;
  if (prize.id === 'casa') {
    const target = propertiesOf(s, p.id).find(t => t.type === 'street' && !canBuild(s, p.id, t.id) && s.housesAvailable > 0);
    if (target) {
      const ps = s.properties[target.id];
      if (ps.houses === 4) { ps.houses = 5; s.hotelsAvailable--; s.housesAvailable += 4; } else { ps.houses++; s.housesAvailable--; }
      text += ` en ${target.name}.`;
    } else { amount = 100; text += ' (sin grupo completo: cobra ₲ 100.000).'; }
  } else if (prize.id === 'carcel') {
    const deck: DeckId = s.decks.chance.includes('S8') ? 'chance' : s.decks.community.includes('C5') ? 'community' : 'chance';
    if (s.decks[deck].includes(deck === 'chance' ? 'S8' : 'C5')) {
      s.decks[deck] = s.decks[deck].filter(x => x !== (deck === 'chance' ? 'S8' : 'C5'));
      p.jailCards.push(deck);
      text += '.';
    } else { amount = 150; text += ' (no quedaban: cobra ₲ 150.000).'; }
  } else if (prize.id === 'tirada') {
    s.pendingReroll = true;
    text += '.';
  } else text += '.';
  if (amount > 0) credit(ctx, p.id, amount);
  if (amount < 0) { p.cash = Math.max(0, p.cash + amount); }
  s.lastLootbox = { playerId: p.id, prize: prize.id, amount, index: idx };
  emit(ctx, 'lootbox', text, p.id, { prize: prize.id, label: prize.label, amount, index: idx });
}

function moveBySteps(ctx: Ctx, p: Player, steps: number) {
  const target = (p.position + steps) % BOARD_SIZE;
  moveForwardTo(ctx, p, target, true);
}

/** Resuelve la casilla donde está parado el jugador. */
function resolveLanding(ctx: Ctx, p: Player, opts: { rentMultiplier?: number; utilityForce10?: boolean } = {}) {
  const s = ctx.s;
  const t = tile(p.position);
  emit(ctx, 'land', `${p.name} cayó en ${t.name}.`, p.id, { tileId: t.id });

  if (t.type === 'casino') {
    if (!s.settings.casino) { emit(ctx, 'info', 'El Casino está cerrado en esta sala.', p.id); return finishResolution(ctx); }
    s.casino = { playerId: p.id, played: false, double: null };
    s.turnPhase = 'CASINO';
    emit(ctx, 'casino_enter', `${p.name} entró al Casino.`, p.id);
    return;
  }
  if (t.type === 'arena') {
    if (!s.settings.arena || activePlayers(s).length < 2) { emit(ctx, 'info', 'La Arena está cerrada.', p.id); return finishResolution(ctx); }
    return startArena(ctx, p);
  }

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
    if (s.activeEvent?.id === 'presidente' && t.id === PALACIO_TILE) {
      credit(ctx, p.id, 100);
      emit(ctx, 'income', `Visita del presidente: ${p.name} no paga alquiler en el Palacio y cobra ${fmt(100)}.`, p.id, { amount: 100 });
      return finishResolution(ctx);
    }
    const diceSum = s.dice ? s.dice[0] + s.dice[1] : 0;
    let rent = rentFor(s, t.id, diceSum);
    if (rent <= 0) { emit(ctx, 'info', `Hoy ${t.name} no cobra alquiler.`, p.id); return finishResolution(ctx); }
    if (t.type === 'utility' && opts.utilityForce10) rent = diceSum * 10;
    if (opts.rentMultiplier) rent *= opts.rentMultiplier;
    const owner = player(s, ps.owner);
    if (s.settings.rentDoubleOrNothing && rent > 0 && !owner.bankrupt) {
      s.rentOffer = { payerId: p.id, ownerId: owner.id, tileId: t.id, rent, proposed: false, accepted: false };
      s.turnPhase = 'RENT_OFFER';
      emit(ctx, 'rent_due', `${p.name} debe ${fmt(rent)} de alquiler a ${owner.name} por ${t.name}. Puede pagar o proponer doble o nada.`, p.id, { amount: rent, to: owner.id, tileId: t.id });
      return;
    }
    payRent(ctx, p, owner, rent, t.name);
    return;
  }

  switch (t.type) {
    case 'tax':
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
  // ¿Se completó una vuelta de mesa? (volvió al que abrió la vuelta, o ese ya no está y llegamos al primero activo)
  const starterAlive = s.roundStarterId && !player(s, s.roundStarterId).bankrupt;
  const firstActive = alive[0].id;
  const newRound = starterAlive ? s.players[idx].id === s.roundStarterId : s.players[idx].id === firstActive;
  if (newRound) {
    s.roundStarterId = s.players[idx].id;
    endOfRound(ctx);
  }
}

function endOfRound(ctx: Ctx) {
  const s = ctx.s;
  if (s.activeEvent) {
    s.activeEvent.roundsLeft--;
    if (s.activeEvent.roundsLeft <= 0) { emit(ctx, 'event_end', `Terminó el evento: ${EVENTS.find(e => e.id === s.activeEvent!.id)!.name}.`); s.activeEvent = null; }
  }
  if (s.settings.events) spinEvent(ctx);
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
  const single = s.activeEvent?.id === 'ruta_cortada';
  s.dice = single ? [r.dice[0], 0] : r.dice;
  const [a, b] = s.dice;
  const doubles = !single && a === b;
  emit(ctx, 'roll', single ? `${p.name} tiró un solo dado (ruta cortada): ${a}.` : `${p.name} tiró ${a} + ${b} = ${a + b}${doubles ? ' (¡dobles!)' : ''}.`, p.id, { dice: s.dice });
  if (doubles) p.stats.doubles++;

  if (a === 6 && b === 6 && s.settings.jackpot && s.jackpot > 0) {
    const pot = s.jackpot;
    s.jackpot = 0;
    p.cash += pot;
    p.stats.jackpots++;
    emit(ctx, 'jackpot', `¡DOBLE SEIS! ${p.name} se lleva el JACKPOT del Casino: ${fmt(pot)}.`, p.id, { amount: pot });
  }
  if (s.activeEvent?.id === 'loteria' && a + b === (s.activeEvent.data?.number as number)) {
    credit(ctx, p.id, 300);
    emit(ctx, 'income', `¡LOTERÍA! ${p.name} sacó ${a + b} y cobra ${fmt(300)}.`, p.id, { amount: 300 });
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
      for (let i = 1; i <= BOARD_SIZE; i++) {
        const t = BOARD[(p.position + i) % BOARD_SIZE];
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
      p.position = (p.position - e.steps + BOARD_SIZE) % BOARD_SIZE;
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
    w.stats.auctionsWon++;
    if (a.highestBid < 100) w.stats.cheapAuctionWins++;
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
  const cost = ctx.s.activeEvent?.id === 'boom' ? Math.floor(t.houseCost / 2) : t.houseCost;
  p.cash -= cost;
  if (ps.houses === 4) {
    ps.houses = 5;
    ctx.s.hotelsAvailable--;
    ctx.s.housesAvailable += 4;
    p.stats.hotelsBuilt++;
    emit(ctx, 'build', `${p.name} construyó un hotel en ${t.name}.`, playerId, { tileId, amount: cost });
  } else {
    ps.houses++;
    ctx.s.housesAvailable--;
    p.stats.housesBuilt++;
    emit(ctx, 'build', `${p.name} construyó una casa en ${t.name} (${ps.houses}).`, playerId, { tileId, amount: cost });
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
  p.stats.mortgagesRedeemed++;
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
  if (['AUCTION', 'TAX_CHOICE', 'CASINO', 'RENT_OFFER', 'CHALLENGE', 'ARENA', 'DUEL'].includes(s.turnPhase)) throw new RuleError('Esperá a que termine la acción en curso.');
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
  emit(ctx, 'trade_proposed', `${from.name} le propone un intercambio a ${to.name}.`, playerId, { tradeId: s.pendingTrade.id, from: from.id, to: to.id, give, receive });
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
  from.stats.trades++; to.stats.trades++;
  const desc = (side: TradeSide) => [
    side.cash ? fmt(side.cash) : null,
    ...side.properties.map(id => tile(id).name),
    side.jailCards ? `${side.jailCards} carta(s) de cárcel` : null,
  ].filter(Boolean).join(', ') || 'nada';
  emit(ctx, 'trade_done', `${from.name} entregó ${desc(tr.give)} y ${to.name} entregó ${desc(tr.receive)}.`, playerId, { tradeId: tr.id, from: from.id, to: to.id, give: tr.give, receive: tr.receive });
  if (s.turnPhase === 'DEBT') settleDebt(ctx);
}

function tradeReject(ctx: Ctx, playerId: string, tradeId: string) {
  const tr = ctx.s.pendingTrade;
  if (!tr || tr.id !== tradeId) throw new RuleError('La propuesta ya no existe.');
  if (tr.toId !== playerId && tr.fromId !== playerId) throw new RuleError('No participás de esa propuesta.');
  ctx.s.pendingTrade = null;
  emit(ctx, 'trade_rejected', `${player(ctx.s, playerId).name} ${tr.fromId === playerId ? 'canceló' : 'rechazó'} el intercambio.`, playerId, { tradeId: tr.id, from: tr.fromId, to: tr.toId, give: tr.give, receive: tr.receive, cancelled: tr.fromId === playerId });
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
  if (s.arena) {
    s.arena.players = s.arena.players.filter(id => id !== debtorId);
    s.arena.alive = s.arena.alive.filter(id => id !== debtorId);
    if (s.arena.players.length < 2 && s.turnPhase === 'ARENA') { s.arena = null; s.turnPhase = 'END_TURN'; }
  }
  if (s.duel && (s.duel.fromId === debtorId || s.duel.toId === debtorId)) {
    const rp = s.duel.returnPhase; s.duel = null; if (s.turnPhase === 'DUEL') s.turnPhase = rp;
  }

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
    owner.stats.rentsCollected++; owner.stats.rentsThisLap++;
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
  if (o.accepted) throw new RuleError('Ya aceptaste: falta la tirada.');
  const payer = player(s, o.payerId);
  const owner = player(s, o.ownerId);
  const name = tile(o.tileId).name;
  if (!accept) {
    s.rentOffer = null;
    emit(ctx, 'rent_don_rejected', `${owner.name} no aceptó el doble o nada.`, playerId);
    return payRent(ctx, payer, owner, o.rent, name);
  }
  // Aceptado: se juega un mini-desafío mano a mano. Si gana el que paga, no paga nada; si gana el dueño, paga doble.
  const kind = CHALLENGE_KINDS[nextRandomInt(ctx, CHALLENGE_KINDS.length)];
  s.tradeCounter++;
  s.rentOffer = null;
  s.challenge = {
    id: `r${s.tradeCounter}`, kind, fromId: o.payerId, toId: o.ownerId, amount: 0, status: 'playing', forced: true,
    returnPhase: 'END_TURN', data: {}, secret: {}, rent: { payerId: o.payerId, ownerId: o.ownerId, tileId: o.tileId, rent: o.rent },
  };
  s.turnPhase = 'CHALLENGE';
  emit(ctx, 'rent_don_accepted', `⚔️ ${owner.name} aceptó el doble o nada: lo definen a ${challengeName(kind)}. Si gana ${payer.name} no paga nada; si gana ${owner.name}, cobra ${fmt(o.rent * 2)}.`, playerId, { to: o.payerId, amount: o.rent, kind });
  beginChallenge(ctx);
}

/** La tirada del doble o nada: la hace el que paga (o el servidor, si se le acaba el tiempo). */
function rentDonRoll(ctx: Ctx, playerId: string) {
  const s = ctx.s;
  requirePlaying(ctx); requirePhase(ctx, 'RENT_OFFER');
  const o = s.rentOffer!;
  if (!o.accepted) throw new RuleError('Todavía no aceptaron el doble o nada.');
  if (o.payerId !== playerId && playerId !== s.hostId) throw new RuleError('Tira el que tiene que pagar.');
  const payer = player(s, o.payerId);
  const owner = player(s, o.ownerId);
  const name = tile(o.tileId).name;
  s.rentOffer = null;
  const r = rollDice(s.seed);
  s.seed = r.seed;
  const sum = r.dice[0] + r.dice[1];
  const win = sum >= 7;
  emit(ctx, 'rent_don_roll', `${payer.name} tiró ${r.dice[0]} + ${r.dice[1]} = ${sum}: ${win ? '¡no paga nada!' : `paga el doble, ${fmt(o.rent * 2)}.`}`, o.payerId, { dice: r.dice, win, amount: o.rent * 2, to: o.ownerId });
  if (win) { payer.stats.donWins++; return finishResolution(ctx); }
  return payRent(ctx, payer, owner, o.rent * 2, `${name} (doble o nada)`);
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
  const max = ctx.s.settings.casinoMaxBet * (ctx.s.activeEvent?.id === 'noche_casino' ? 2 : 1);
  if (amount > max) throw new RuleError(`La apuesta máxima es ${fmt(max)}.`);
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
    const win = r <= RULETA_WIN_CHANCE;
    const mult = s.activeEvent?.id === 'noche_casino' ? 3 : 2;
    if (win) { p.cash += amount * mult; p.stats.casinoWins++; } else casinoLoss(ctx, amount);
    emit(ctx, 'casino_result', `${p.name} apostó ${fmt(amount)} en la Ruleta: salió ${r}, ${win ? `¡ganó ${fmt(amount)}!` : 'perdió.'}`, playerId,
      { game, amount, roll: r, win, payout: win ? amount * 2 : 0 });
  } else if (game === 'quiniela') {
    if (pick === undefined || pick < 2 || pick > 12) throw new RuleError('Elegí un número del 2 al 12.');
    const r = rollDice(s.seed); s.seed = r.seed;
    const sum = r.dice[0] + r.dice[1];
    const win = sum === pick;
    const payout = win ? amount * (QUINIELA_PAYOUT[pick] + 1) : 0;
    if (win) { p.cash += payout; p.stats.casinoWins++; } else casinoLoss(ctx, amount);
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
    if (win) { p.cash += payout; p.stats.casinoWins++; } else casinoLoss(ctx, amount);
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
  const win = sum % 2 === 0 && sum !== 2;   // par, pero el 2 (doble uno) revienta la racha
  if (win) {
    d.stake *= 2;
    d.step++;
    p.stats.casinoWins++;
    emit(ctx, 'casino_double', `${p.name} tiró ${r.dice[0]} + ${r.dice[1]} (par): ¡dobla a ${fmt(d.stake)}! Paso ${d.step} de ${DOUBLE_MAX_STEPS}.`, p.id, { dice: r.dice, win: true, stake: d.stake, step: d.step });
    if (d.step >= DOUBLE_MAX_STEPS) {
      p.cash += d.stake;
      emit(ctx, 'casino_cashout', `${p.name} llegó al tope y se lleva ${fmt(d.stake)}.`, p.id, { amount: d.stake });
      c.double = null;
    }
  } else {
    emit(ctx, 'casino_double', `${p.name} tiró ${r.dice[0]} + ${r.dice[1]} (${sum === 2 ? '¡doble uno!' : 'impar'}): perdió ${fmt(d.stake)}.`, p.id, { dice: r.dice, win: false, stake: d.stake, step: d.step });
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
/**
 * Elige un índice al azar de un catálogo evitando los ya usados en esta partida.
 * Cuando se agotan todos, la lista se reinicia (y vuelve a empezar sin repetir).
 */
function pickUnused(ctx: Ctx, key: string, total: number): number {
  const s = ctx.s;
  if (!s.usedContent) s.usedContent = {};
  let used = s.usedContent[key];
  if (!used || used.length >= total) { used = []; s.usedContent[key] = used; }
  let idx = nextRandomInt(ctx, total);
  for (let i = 0; i < total && used.includes(idx); i++) idx = (idx + 1) % total;
  used.push(idx);
  return idx;
}

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
    case 'dados':
      // Cada uno tira cuando quiere (botón); con empate se vuelve a tirar
      c.data.rolls = {}; c.data.round = 1;
      return;
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
  const idx = pickUnused(ctx, 'trivia', TRIVIA.length);   // sin repetir en toda la partida
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
    case 'dados': {
      const rolls = c.data.rolls as Record<string, [number, number]>;
      if (rolls[playerId]) throw new RuleError('Ya tiraste. Esperá al rival.');
      const r = rollDice(s.seed); s.seed = r.seed;
      rolls[playerId] = r.dice;
      emit(ctx, 'challenge_round', `${player(s, playerId).name} tiró ${r.dice[0]} + ${r.dice[1]} = ${r.dice[0] + r.dice[1]}.`, playerId, { dice: r.dice, roll: true });
      if (!rolls[other]) return;
      const sa = rolls[c.fromId][0] + rolls[c.fromId][1], sb = rolls[c.toId!][0] + rolls[c.toId!][1];
      if (sa !== sb) return finishChallenge(ctx, sa > sb ? c.fromId : c.toId!, `${sa} contra ${sb}`);
      emit(ctx, 'challenge_tie', `Empate ${sa} a ${sb}: ¡se tira de nuevo!`, undefined, { rolls: { ...rolls } });
      c.data.lastRolls = { ...rolls }; c.data.rolls = {}; c.data.round = ((c.data.round as number) ?? 1) + 1;
      return;
    }
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
  // Desafío nacido de un alquiler a doble o nada: se resuelve el alquiler, no una apuesta
  if (c.rent) {
    const r = c.rent;
    const payer = player(s, r.payerId), owner = player(s, r.ownerId);
    const name = tile(r.tileId).name;
    s.challenge = null;
    s.turnPhase = c.returnPhase;
    if (winnerId === r.payerId) {
      payer.stats.donWins++;
      emit(ctx, 'rent_don_roll', `🎉 ${payer.name} ganó el doble o nada (${reason}) y no paga nada en ${name}.`, r.payerId, { win: true, amount: r.rent, to: r.ownerId, kind: c.kind });
      return finishResolution(ctx);
    }
    if (!winnerId) {
      emit(ctx, 'rent_don_roll', `Empate en el doble o nada: ${payer.name} paga el alquiler normal.`, r.payerId, { win: false, amount: r.rent, to: r.ownerId, tie: true });
      return payRent(ctx, payer, owner, r.rent, name);
    }
    emit(ctx, 'rent_don_roll', `💸 ${owner.name} ganó el doble o nada (${reason}): ${payer.name} paga ${fmt(r.rent * 2)}.`, r.payerId, { win: false, amount: r.rent * 2, to: r.ownerId, kind: c.kind });
    return payRent(ctx, payer, owner, r.rent * 2, `${name} (doble o nada)`);
  }
  if (winnerId) {
    const loserId = winnerId === c.fromId ? c.toId! : c.fromId;
    const winner = player(s, winnerId), loser = player(s, loserId);
    const amt = Math.min(c.amount, loser.cash);
    loser.cash -= amt;
    winner.cash += amt;
    winner.stats.challengesWon++;
    if (c.kind === 'trivia') winner.stats.triviaWins++;
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
// Eventos globales
// ---------------------------------------------------------------------------

function spinEvent(ctx: Ctx) {
  const s = ctx.s;
  // 2 de cada 3 giros: tranquilidad
  const calm = nextRandomInt(ctx, 3) < 2;
  const pool = EVENTS.filter(e => e.id !== 'tranquilidad' && !s.eventHistory.slice(-4).includes(e.id));
  const ev = calm ? EVENTS[0] : pool[nextRandomInt(ctx, pool.length)];
  s.eventHistory.push(ev.id);
  const idx = EVENTS.findIndex(e => e.id === ev.id);
  const data: Record<string, unknown> = {};
  emit(ctx, 'event_spin', `Gira la ruleta de eventos… ${ev.icon} ${ev.name}: ${ev.desc}`, undefined, { eventId: ev.id, index: idx });
  if (ev.id === 'tranquilidad') return;
  if (!ev.instant) {
    if (ev.id === 'loteria') data.number = 2 + nextRandomInt(ctx, 11);
    s.activeEvent = { id: ev.id, roundsLeft: 1, data };
    if (ev.id === 'loteria') emit(ctx, 'event_start', `Lotería: el número es ${data.number}. Quien saque esa suma esta vuelta cobra ${fmt(300)}.`, undefined, { eventId: ev.id, number: data.number });
    return;
  }
  const alive = activePlayers(s);
  switch (ev.id) {
    case 'aguinaldo':
      for (const p of alive) credit(ctx, p.id, 100);
      emit(ctx, 'income', `Aguinaldo: todos cobran ${fmt(100)}.`, undefined, { amount: 100 });
      break;
    case 'control_set': {
      const rich = [...alive].sort((a, b) => b.cash - a.cash)[0];
      const amt = Math.floor(rich.cash * 0.1);
      rich.cash -= amt;
      emit(ctx, 'expense', `Control de la SET: ${rich.name} paga ${fmt(amt)}.`, rich.id, { amount: amt });
      break;
    }
    case 'dia_nino': {
      const poor = [...alive].sort((a, b) => netWorth(s, a.id) - netWorth(s, b.id))[0];
      credit(ctx, poor.id, 200);
      emit(ctx, 'income', `Día del Niño: ${poor.name} cobra ${fmt(200)}.`, poor.id, { amount: 200 });
      break;
    }
    case 'amnistia':
      for (const p of alive) if (p.inJail) { p.inJail = false; p.jailTurns = 0; emit(ctx, 'jail_out', `Amnistía: ${p.name} sale de Tacumbú.`, p.id); }
      break;
    case 'mudanza': {
      if (alive.length >= 2) {
        const i = nextRandomInt(ctx, alive.length);
        let j = nextRandomInt(ctx, alive.length - 1); if (j >= i) j++;
        const a = alive[i], b = alive[j];
        if (!a.inJail && !b.inJail) {
          [a.position, b.position] = [b.position, a.position];
          emit(ctx, 'mudanza', `Mudanza: ${a.name} y ${b.name} intercambian de lugar.`, undefined, { a: a.id, b: b.id });
        }
      }
      break;
    }
    case 'solidaria': {
      const sorted = [...alive].sort((a, b) => b.cash - a.cash);
      const rich = sorted[0], poor = sorted[sorted.length - 1];
      if (rich.id !== poor.id) {
        const amt = Math.min(100, rich.cash);
        rich.cash -= amt; poor.cash += amt;
        emit(ctx, 'rent', `Cooperativa solidaria: ${rich.name} le da ${fmt(amt)} a ${poor.name}.`, rich.id, { amount: amt, to: poor.id });
      }
      break;
    }
    case 'remate': {
      const free = PROPERTY_IDS.filter(id => !s.properties[id].owner);
      if (free.length && s.settings.auctions && !s.auction) {
        const id = free[nextRandomInt(ctx, free.length)];
        emit(ctx, 'info', `Remate del banco: se subasta ${tile(id).name}.`, undefined, { tileId: id });
        startAuction(ctx, id, false, s.turnPhase);
      }
      break;
    }
    case 'terremoto': {
      for (const p of alive) {
        const withHouses = propertiesOf(s, p.id).filter(t => s.properties[t.id].houses > 0);
        if (!withHouses.length) continue;
        const t = withHouses[nextRandomInt(ctx, withHouses.length)];
        const ps = s.properties[t.id];
        if (t.type !== 'street') continue;
        if (ps.houses === 5) { ps.houses = 4; s.hotelsAvailable++; s.housesAvailable -= 4; } else { ps.houses--; s.housesAvailable++; }
        const refund = Math.floor(t.houseCost / 2);
        p.cash += refund;
        emit(ctx, 'sell_building', `Terremoto: ${p.name} pierde un edificio en ${t.name} (recibe ${fmt(refund)}).`, p.id, { tileId: t.id, amount: refund });
      }
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Misiones secretas
// ---------------------------------------------------------------------------

function checkMissions(ctx: Ctx) {
  const s = ctx.s;
  if (!s.settings.missions || s.phase !== 'PLAYING') return;
  for (const p of s.players) {
    if (p.bankrupt) continue;
    for (const m of p.missions) {
      if (m.done) continue;
      const def = MISSIONS.find(x => x.id === m.id)!;
      if (missionMet(s, p, def.check)) {
        m.done = true;
        credit(ctx, p.id, m.reward);
        emit(ctx, 'mission_done', `🎯 ${p.name} cumplió una misión secreta: "${m.text}" y cobra ${fmt(m.reward)}.`, p.id, { amount: m.reward, missionId: m.id });
      }
    }
  }
}

function missionMet(s: GameState, p: Player, check: string): boolean {
  const st = p.stats;
  const cmp = check.match(/^(\w+)>=(\d+)$/);
  if (cmp) {
    const [, key, n] = cmp;
    const val: Record<string, number> = {
      ...st, cash: p.cash, netWorth: netWorth(s, p.id), laps: p.lapsCompleted,
      transports: countTransports(s, p.id), utilities: countUtilities(s, p.id), properties: propertiesOf(s, p.id).length,
    };
    return (val[key] ?? 0) >= Number(n);
  }
  if (check === 'fullGroup') return (Object.keys(groupTilesByName()) as Array<keyof ReturnType<typeof groupTilesByName>>).some(g => ownsFullGroupLocal(s, p.id, g));
  if (check.startsWith('fullGroup:')) return ownsFullGroupLocal(s, p.id, check.split(':')[1]);
  if (check.startsWith('ownsGroupAny:')) { const g = check.split(':')[1]; return groupTiles(g as never).some(t => s.properties[t.id].owner === p.id); }
  if (check.startsWith('owns:')) return s.properties[Number(check.split(':')[1])]?.owner === p.id;
  return false;
}
function groupTilesByName() { return { marron: 1, celeste: 1, rosa: 1, naranja: 1, rojo: 1, amarillo: 1, verde: 1, azul: 1 }; }
function ownsFullGroupLocal(s: GameState, pid: string, g: string) { return groupTiles(g as never).every(t => s.properties[t.id].owner === pid); }

// ---------------------------------------------------------------------------
// La Arena
// ---------------------------------------------------------------------------

function startArena(ctx: Ctx, trigger: Player) {
  const s = ctx.s;
  const n = activePlayers(s).length;
  const eligible = ARENA_GAMES.filter(g => !(g.id === 'cartas' && n < 3) && !(g.id === 'bomba2' && n < 3) && !(g.id === 'dibujo' && n < 2)).map(g => g.id);
  const pool = shuffle(eligible, s.seed);
  s.seed = pool.seed;
  const options = pool.items.slice(0, 3);
  s.arena = {
    stage: 'vote', triggeredBy: trigger.id, options, votes: {}, game: null,
    players: activePlayers(s).map(p => p.id), startedAt: null, round: 0, alive: [], eliminated: [],
    scores: {}, data: {}, secret: {}, ranking: null, rewards: null,
  };
  s.turnPhase = 'ARENA';
  emit(ctx, 'arena_open', `¡${trigger.name} abrió la Arena! Todos votan qué se juega.`, trigger.id, { options });
}

function arenaVote(ctx: Ctx, playerId: string, option: number) {
  const s = ctx.s;
  requirePlaying(ctx); requirePhase(ctx, 'ARENA');
  const a = s.arena!;
  if (a.stage !== 'vote') throw new RuleError('La votación ya cerró.');
  if (!a.players.includes(playerId)) throw new RuleError('No participás.');
  if (option < 0 || option >= a.options.length) throw new RuleError('Opción inválida.');
  a.votes[playerId] = option;
  emit(ctx, 'arena_vote', `${player(s, playerId).name} votó.`, playerId, { option });
}

function arenaStart(ctx: Ctx, now: number) {
  const s = ctx.s;
  requirePlaying(ctx); requirePhase(ctx, 'ARENA');
  const a = s.arena!;
  if (a.stage !== 'vote') return;
  const counts = a.options.map((_, i) => Object.values(a.votes).filter(v => v === i).length);
  const max = Math.max(...counts);
  const top = counts.map((c, i) => (c === max ? i : -1)).filter(i => i >= 0);
  const chosen = a.options[top[nextRandomInt(ctx, top.length)]];
  a.game = chosen; a.stage = 'play'; a.startedAt = now + ARENA_COUNTDOWN_MS; a.round = 1;
  a.alive = [...a.players]; a.eliminated = [];
  for (const id of a.players) a.scores[id] = 0;
  const def = ARENA_GAMES.find(g => g.id === chosen)!;
  emit(ctx, 'arena_start', `¡Se juega ${def.name}! ${def.desc}`, undefined, { game: chosen });
  arenaSetup(ctx);
}

function arenaSetup(ctx: Ctx) {
  const s = ctx.s;
  const a = s.arena!;
  const d = a.data, sec = a.secret;
  switch (a.game) {
    case 'trivia': { sec.used = []; d.qIndex = 0; arenaNextTrivia(ctx); return; }
    case 'cana': { d.taps = Object.fromEntries(a.players.map(id => [id, 0])); d.duration = 5000; return; }
    case 'barra': { d.attempts = Object.fromEntries(a.players.map(id => [id, [] as number[]])); return; }
    case 'cuantos': { const q = CUANTOS[pickUnused(ctx, 'cuantos', CUANTOS.length)]; d.q = q.q; d.unit = q.unit ?? ''; sec.answer = q.a; d.answers = {}; return; }
    case 'bomba': {
      d.lives = Object.fromEntries(a.players.map(id => [id, 1]));   // una sola vida: el primer boom te deja afuera
      d.turnIdx = 0; d.turn = a.alive[0]; d.used = []; d.level = 0;
      arenaNewSyllable(ctx); sec.fuse = bombFuse(ctx, 0); d.turnStartedAt = a.startedAt; return;
    }
    case 'oeste': { d.go = false; d.shots = {}; d.jammed = []; d.roundStartedAt = a.startedAt; return; }
    case 'rayo': { d.gridSize = 3; d.picks = {}; d.hits = null; d.roundStartedAt = a.startedAt; return; }
    case 'penales': { d.shots = Object.fromEntries(a.players.map(id => [id, [] as { power: number; dir: number; keeper: number; goal: boolean }[]])); d.goals = Object.fromEntries(a.players.map(id => [id, 0])); return; }
    case 'globos': { d.turnIdx = 0; d.turn = a.alive[0]; d.balloons = a.alive.length + 1; d.popped = []; sec.needle = nextRandomInt(ctx, d.balloons as number); return; }
    case 'sapos': {
      // Pista vertical de 3 carriles: los sapos avanzan solos (cada vez más rápido); el jugador solo cambia de carril.
      // Cada fila tiene, como mucho, un charco (nunca dos filas seguidas con charco: siempre hay salida).
      const goal = SAPOS_GOAL, lanes = 3;
      const track: number[] = [];
      let prev = -1;
      for (let r = 0; r < goal; r++) {
        if (r < 6 || prev >= 0) { track.push(-1); prev = -1; continue; }
        const lane = nextRandomInt(ctx, 100) < 48 ? nextRandomInt(ctx, lanes) : -1;
        track.push(lane); prev = lane;
      }
      d.goal = goal; d.lanes = lanes; d.track = track;
      d.lane = Object.fromEntries(a.players.map(id => [id, 1]));
      d.lastRow = Object.fromEntries(a.players.map(id => [id, -1]));
      d.out = {}; d.finished = []; d.finishTime = {};
      return;
    }
    case 'cartas': {
      d.round = 1; d.rounds = 3; d.judgeIdx = 0; d.stage = 'pick'; d.played = []; d.pickedIds = []; d.lastWin = null; d.stageAt = a.startedAt;
      const deck = shuffle(WHITE_CARDS.map((_, i) => i), s.seed); s.seed = deck.seed;
      const blacks = { items: [] as number[] };
      for (let i = 0; i < 6; i++) blacks.items.push(pickUnused(ctx, 'black', BLACK_CARDS.length));
      sec.deck = deck.items; sec.blacks = blacks.items; sec.hands = {}; sec.plays = {}; sec.playedIds = [];
      for (const id of a.players) (sec.hands as Record<string, number[]>)[id] = (sec.deck as number[]).splice(0, 6);
      cartasNewRound(ctx);
      return;
    }
    case 'borrosa': { d.qIndex = 0; d.rounds = 3; sec.used = []; borrosaNext(ctx); return; }
    case 'cadena': { d.qIndex = 0; d.rounds = 2; sec.used = []; cadenaNext(ctx); return; }
    case 'ruleta': {
      d.turn = a.alive[0]; d.pos = 0; d.clicks = 0; d.passes = Object.fromEntries(a.players.map(id => [id, 1])); d.lastShot = null; d.turnStartedAt = a.startedAt; d.reloads = 0;
      sec.chamber = nextRandomInt(ctx, 6);
      return;
    }
    case 'bomba2': {
      const sab = a.players.includes(a.triggeredBy) ? a.triggeredBy : a.players[0];
      d.saboteur = sab; d.round = 1; d.rounds = 3; d.wires = 4; d.stage = 'plant'; d.cuts = {}; d.reveal = null; d.stageAt = a.startedAt;
      d.defusers = a.players.filter(id => id !== sab);
      sec.trap = null;
      return;
    }
    case 'dibujo': {
      const trig = player(s, a.triggeredBy);
      d.drawer = trig.isBot ? (a.players.find(id => !player(s, id).isBot) ?? a.triggeredBy) : a.triggeredBy;
      const w = DRAW_WORDS[pickUnused(ctx, 'draw', DRAW_WORDS.length)]; sec.word = w; d.hint = w.replace(/[^ ]/g, '_'); d.guesses = []; return;
    }
  }
}

function arenaNextTrivia(ctx: Ctx) {
  const a = ctx.s.arena!;
  const idx = pickUnused(ctx, 'trivia', TRIVIA.length);
  const t = TRIVIA[idx];
  a.data.question = { q: t.q, options: [...t.options] };
  a.data.answered = {};
  a.data.correctOrder = [];
  a.data.reveal = null; a.data.revealUntil = null;
  a.secret.answer = t.answer;
  a.data.questionStartedAt = null; // lo fija el servidor con el próximo tick
}

function arenaNewSyllable(ctx: Ctx) {
  const a = ctx.s.arena!;
  const level = Math.min(2, Math.floor(((a.data.used as string[]).length) / 6));
  const pool = level === 0 ? BOMB_SYLLABLES.facil : level === 1 ? BOMB_SYLLABLES.medio : BOMB_SYLLABLES.dificil;
  a.data.syllable = pool[pickUnused(ctx, `bomba${level}`, pool.length)];
  a.data.level = level;
}

export function normalizeWord(w: string): string {
  return w.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ñ/gi, 'n').toLowerCase().trim();
}

/** Jugada de un participante. `now` es el reloj del servidor. */
function arenaMove(ctx: Ctx, playerId: string, now: number, payload: Record<string, unknown>) {
  const s = ctx.s;
  requirePlaying(ctx); requirePhase(ctx, 'ARENA');
  const a = s.arena!;
  if (a.stage !== 'play') throw new RuleError('El juego no está en curso.');
  if (!a.players.includes(playerId)) throw new RuleError('No participás.');
  if (now < (a.startedAt ?? 0)) throw new RuleError('Todavía no empezó: esperá la cuenta regresiva.');
  const d = a.data, sec = a.secret;
  const p = player(s, playerId);

  switch (a.game) {
    case 'trivia': {
      const ans = Number(payload.answer);
      const answered = d.answered as Record<string, number>;
      if (d.reveal !== undefined && d.reveal !== null) throw new RuleError('Esperá la próxima pregunta.');
      if (answered[playerId] !== undefined) throw new RuleError('Ya respondiste.');
      answered[playerId] = ans;
      if (ans === sec.answer) {
        const order = d.correctOrder as string[];
        order.push(playerId);
        const pts = 3 + Math.max(0, 2 - (order.length - 1));
        a.scores[playerId] += pts;
        emit(ctx, 'arena_point', `${p.name} acertó (+${pts}).`, playerId, { points: pts });
      }
      if (Object.keys(answered).length >= a.players.length) arenaTriviaReveal(ctx, now);
      return;
    }
    case 'cana': {
      const taps = d.taps as Record<string, number>;
      const n = Math.max(0, Math.min(12, Number(payload.taps) || 0));
      if (now - (a.startedAt ?? now) > (d.duration as number) + 1500) return;
      taps[playerId] = (taps[playerId] ?? 0) + n;
      return;
    }
    case 'barra': {
      const attempts = d.attempts as Record<string, number[]>;
      if (attempts[playerId].length >= 3) throw new RuleError('Ya usaste tus tres intentos.');
      const dist = Math.max(0, Math.min(100, Number(payload.distance)));
      attempts[playerId].push(dist);
      if (a.players.every(id => attempts[id].length >= 3)) arenaFinish(ctx);
      return;
    }
    case 'cuantos': {
      const answers = d.answers as Record<string, number>;
      if (answers[playerId] !== undefined) throw new RuleError('Ya respondiste.');
      answers[playerId] = Number(payload.value);
      if (Object.keys(answers).length >= a.players.length) arenaFinish(ctx);
      return;
    }
    case 'bomba': {
      if (d.turn !== playerId) throw new RuleError('No es tu turno.');
      const word = normalizeWord(String(payload.word ?? ''));
      const valid = payload.valid === true; // lo verifica el servidor con el diccionario
      const syl = normalizeWord(d.syllable as string);
      const used = d.used as string[];
      if (!word.includes(syl)) { emit(ctx, 'arena_round', `"${word.toUpperCase()}" no contiene ${d.syllable}.`, playerId, { ok: false }); return; }
      if (used.includes(word)) { emit(ctx, 'arena_round', `"${word.toUpperCase()}" ya se usó.`, playerId, { ok: false }); return; }
      if (!valid) { emit(ctx, 'arena_round', `"${word.toUpperCase()}" no está en el diccionario.`, playerId, { ok: false }); return; }
      used.push(word);
      a.scores[playerId] += 1;
      emit(ctx, 'arena_round', `${p.name}: ${word.toUpperCase()} ✔`, playerId, { ok: true, word });
      arenaBombNext(ctx, now);
      return;
    }
    case 'oeste': {
      if (!a.alive.includes(playerId)) throw new RuleError('Estás eliminado.');
      const shots = d.shots as Record<string, string>;
      const jammed = d.jammed as string[];
      if (shots[playerId] || jammed.includes(playerId)) throw new RuleError('Ya disparaste.');
      if (!d.go) { jammed.push(playerId); emit(ctx, 'arena_round', `${p.name} se adelantó: ¡se le trabó el revólver!`, playerId, { jammed: true }); return; }
      const target = String(payload.target);
      if (!a.alive.includes(target) || target === playerId) throw new RuleError('Blanco inválido.');
      shots[playerId] = target;
      const pending = a.alive.filter(id => !shots[id] && !jammed.includes(id));
      if (pending.length === 0) arenaOesteResolve(ctx, now);
      return;
    }
    case 'rayo': {
      if (!a.alive.includes(playerId)) throw new RuleError('Estás eliminado.');
      const picks = d.picks as Record<string, number>;
      const n = (d.gridSize as number) ** 2;
      const cell = Number(payload.cell);
      if (cell < 0 || cell >= n) throw new RuleError('Casilla inválida.');
      picks[playerId] = cell;
      if (a.alive.every(id => picks[id] !== undefined)) arenaRayoResolve(ctx, now);
      return;
    }
    case 'penales': {
      const shots = d.shots as Record<string, { power: number; dir: number; keeper: number; goal: boolean }[]>;
      if (shots[playerId].length >= 3) throw new RuleError('Ya pateaste tres.');
      const power = Math.max(0, Math.min(100, Number(payload.power)));
      const dir = Math.max(-1, Math.min(1, Number(payload.dir)));
      const zone = dir < -0.33 ? 0 : dir > 0.33 ? 2 : 1;
      const keeper = nextRandomInt(ctx, 3);
      const goal = power >= 35 && power <= 92 && zone !== keeper;
      shots[playerId].push({ power, dir, keeper, goal });
      if (goal) (d.goals as Record<string, number>)[playerId]++;
      emit(ctx, 'arena_round', `${p.name} patea ${['a la izquierda', 'al medio', 'a la derecha'][zone]}: ${goal ? '¡GOL!' : power > 92 ? 'se fue por arriba' : power < 35 ? 'muy débil' : 'atajó el arquero'}.`, playerId, { goal, zone, keeper, power });
      if (a.players.every(id => shots[id].length >= 3)) arenaFinish(ctx);
      return;
    }
    case 'globos': {
      if (d.turn !== playerId) throw new RuleError('No es tu turno.');
      const popped = d.popped as number[];
      const b = Number(payload.balloon);
      if (b < 0 || b >= (d.balloons as number) || popped.includes(b)) throw new RuleError('Globo inválido.');
      popped.push(b);
      if (b === sec.needle) {
        emit(ctx, 'arena_round', `💥 ¡${p.name} pinchó el globo con la aguja! Queda afuera.`, playerId, { needle: true, balloon: b });
        arenaEliminate(ctx, playerId);
        if (a.alive.length <= 1) return arenaFinish(ctx);
        d.balloons = a.alive.length + 1; d.popped = []; sec.needle = nextRandomInt(ctx, d.balloons as number);
        d.turnIdx = 0; d.turn = a.alive[0];
        return;
      }
      emit(ctx, 'arena_round', `${p.name} pinchó el globo ${b + 1}: ¡pum! Nada.`, playerId, { needle: false, balloon: b });
      const remaining = a.alive.filter(id => !(d.pickedThisRound as string[] | undefined)?.includes(id));
      d.pickedThisRound = [...((d.pickedThisRound as string[]) ?? []), playerId];
      if ((d.pickedThisRound as string[]).length >= a.alive.length) {
        // nadie encontró la aguja: nueva ronda
        d.balloons = a.alive.length + 1; d.popped = []; sec.needle = nextRandomInt(ctx, d.balloons as number); d.pickedThisRound = [];
        emit(ctx, 'arena_round', 'Nadie encontró la aguja. Se inflan de nuevo.', undefined, {});
      }
      void remaining;
      const order = a.alive;
      const next = order[((order.indexOf(playerId) + 1) % order.length)];
      d.turn = next;
      return;
    }
    case 'sapos': {
      const lanes = d.lanes as number;
      const lane = d.lane as Record<string, number>;
      if ((d.finished as string[]).includes(playerId) || (d.out as Record<string, number>)[playerId] !== undefined) return;
      sapoAdvance(ctx, playerId, now);                  // primero recorre las filas pendientes con el carril viejo
      if ((d.out as Record<string, number>)[playerId] !== undefined) return;
      let next = payload.lane !== undefined ? Number(payload.lane) : lane[playerId] + (payload.side === 'L' ? -1 : 1);
      next = Math.max(0, Math.min(lanes - 1, Math.floor(next)));
      if (next === lane[playerId]) return;
      lane[playerId] = next;
      // si se pasa a un carril con charco en la fila actual, se resbala
      const row = Math.min((d.goal as number) - 1, Math.floor(sapoPos(now - (a.startedAt ?? now))));
      if (row >= 0 && (d.track as number[])[row] === next) sapoSplash(ctx, playerId, row);
      return;
    }
    case 'cartas': {
      if (d.stage === 'pick') {
        if (playerId === d.judge) throw new RuleError('El juez espera las cartas de los demás.');
        const hand = (sec.hands as Record<string, number[]>)[playerId];
        const plays = sec.plays as Record<string, number>;
        if (plays[playerId] !== undefined) throw new RuleError('Ya jugaste tu carta.');
        const idx = Number(payload.card);
        if (!(idx >= 0 && idx < hand.length)) throw new RuleError('Carta inválida.');
        plays[playerId] = hand.splice(idx, 1)[0];
        const deck = sec.deck as number[];
        if (deck.length) hand.push(deck.shift()!);
        (d.pickedIds as string[]).push(playerId);
        const pending = a.players.filter(id => id !== d.judge && plays[id] === undefined);
        if (pending.length === 0) cartasToJudge(ctx, now);
        return;
      }
      if (d.stage === 'judge') {
        if (playerId !== d.judge) throw new RuleError('Solo el juez elige.');
        const pick = Number(payload.pick);
        const ids = sec.playedIds as string[];
        if (!(pick >= 0 && pick < ids.length)) throw new RuleError('Carta inválida.');
        const winner = ids[pick];
        a.scores[winner] += 1;
        d.lastWin = { text: (d.played as string[])[pick], winner, black: d.black };
        emit(ctx, 'arena_round', `🃏 El juez ${p.name} eligió "${(d.played as string[])[pick]}" — punto para ${player(s, winner).name}.`, winner, { winner, card: (d.played as string[])[pick] });
        d.stage = 'result'; d.stageAt = now;
        return;
      }
      throw new RuleError('Esperá la próxima ronda.');
    }
    case 'borrosa': {
      if (d.reveal !== null && d.reveal !== undefined) throw new RuleError('Esperá la próxima imagen.');
      const answered = d.answered as Record<string, number>;
      if (answered[playerId] !== undefined) throw new RuleError('Ya respondiste en esta ronda.');
      const ans = Number(payload.answer);
      answered[playerId] = ans;
      if (ans === sec.answer) {
        a.scores[playerId] += 3;
        emit(ctx, 'arena_point', `${p.name} acertó (+3).`, playerId, { points: 3 });
        borrosaReveal(ctx, now, playerId);
      } else {
        emit(ctx, 'arena_round', `${p.name} falló: queda afuera de esta ronda.`, playerId, { wrong: true });
        if (a.players.every(id => answered[id] !== undefined)) borrosaReveal(ctx, now, null);
      }
      return;
    }
    case 'cadena': {
      if (d.reveal !== null && d.reveal !== undefined) throw new RuleError('Esperá la próxima cadena.');
      const orders = d.orders as Record<string, number[]>;
      if (orders[playerId]) throw new RuleError('Ya ordenaste.');
      const order = Array.isArray(payload.order) ? (payload.order as unknown[]).map(Number) : [];
      const n = (d.shown as string[]).length;
      if (order.length !== n || new Set(order).size !== n || order.some(v => !(v >= 0 && v < n))) throw new RuleError('Tenés que ordenar las cuatro.');
      orders[playerId] = order;
      if (a.players.every(id => orders[id])) cadenaReveal(ctx, now);
      return;
    }
    case 'ruleta': {
      if (!a.alive.includes(playerId)) throw new RuleError('Ya quedaste afuera.');
      if (d.turn !== playerId) throw new RuleError('No es tu turno.');
      const kind = String(payload.kind);
      if (kind === 'pass') {
        const passes = d.passes as Record<string, number>;
        if ((passes[playerId] ?? 0) <= 0) throw new RuleError('Ya usaste tu pase.');
        passes[playerId]--;
        emit(ctx, 'arena_round', `${p.name} pasa el revólver sin apretar (usó su pase).`, playerId, { pass: true });
        ruletaNextTurn(ctx, now);
        return;
      }
      if (kind === 'spin') {
        sec.chamber = nextRandomInt(ctx, 6); d.pos = 0; d.clicks = 0;
        emit(ctx, 'arena_round', `${p.name} gira el tambor…`, playerId, { spin: true });
      } else if (kind !== 'shoot') throw new RuleError('Jugada inválida.');
      ruletaShoot(ctx, playerId, now);
      return;
    }
    case 'bomba2': {
      const wire = Number(payload.wire);
      if (!(wire >= 0 && wire < (d.wires as number))) throw new RuleError('Cable inválido.');
      if (d.stage === 'plant') {
        if (playerId !== d.saboteur) throw new RuleError('El saboteador está eligiendo la trampa…');
        sec.trap = wire; d.stage = 'cut'; d.stageAt = now;
        emit(ctx, 'arena_round', `🧨 ${p.name} plantó la trampa. ¡A cortar cables!`, playerId, { planted: true });
        return;
      }
      if (d.stage === 'cut') {
        if (playerId === d.saboteur) throw new RuleError('Vos plantaste la bomba: esperá.');
        if (!a.alive.includes(playerId)) throw new RuleError('Ya volaste.');
        const cuts = d.cuts as Record<string, number>;
        if (cuts[playerId] !== undefined) throw new RuleError('Ya cortaste.');
        cuts[playerId] = wire;
        const pending = (d.defusers as string[]).filter(id => a.alive.includes(id) && cuts[id] === undefined);
        if (pending.length === 0) bomba2Resolve(ctx, now);
        return;
      }
      throw new RuleError('Esperá la próxima ronda.');
    }
    case 'dibujo': {
      if (playerId === d.drawer) throw new RuleError('El que dibuja no adivina.');
      const guess = normalizeWord(String(payload.guess ?? ''));
      const guesses = d.guesses as { id: string; guess: string }[];
      guesses.push({ id: playerId, guess });
      if (guess === normalizeWord(sec.word as string)) {
        emit(ctx, 'arena_round', `🎨 ¡${p.name} adivinó: ${String(sec.word).toUpperCase()}!`, playerId, { correct: true });
        a.ranking = [playerId, d.drawer as string];
        return arenaFinish(ctx);
      }
      emit(ctx, 'arena_round', `${p.name}: "${guess}"`, playerId, { correct: false });
      return;
    }
  }
}

/** Muestra la respuesta correcta y lo que puso cada uno durante unos segundos. */
function arenaTriviaReveal(ctx: Ctx, now: number) {
  const a = ctx.s.arena!;
  const d = a.data;
  if (d.reveal !== undefined && d.reveal !== null) return;
  d.reveal = a.secret.answer; d.revealUntil = now + ARENA_REVEAL_MS;
  emit(ctx, 'arena_round', `La respuesta era "${(d.question as { options: string[] }).options[a.secret.answer as number]}".`, undefined, { reveal: a.secret.answer, answered: { ...(d.answered as Record<string, number>) } });
}

function arenaTriviaAdvance(ctx: Ctx) {
  const a = ctx.s.arena!;
  const d = a.data;
  d.reveal = null; d.revealUntil = null;
  d.qIndex = (d.qIndex as number) + 1;
  if ((d.qIndex as number) >= 3) return arenaFinish(ctx);
  arenaNextTrivia(ctx);
}

/** Mecha de la Palabra bomba: arranca en 5-9 s y se acorta con cada palabra, hasta 2 s. */
function bombFuse(ctx: Ctx, wordsPlayed: number): number {
  const base = Math.max(2000, 9000 - wordsPlayed * 450);
  const min = Math.max(1800, base - 4000);
  return min + nextRandomInt(ctx, Math.max(1, base - min));
}

function arenaBombNext(ctx: Ctx, now: number) {
  const a = ctx.s.arena!;
  const d = a.data;
  arenaNewSyllable(ctx);
  a.secret.fuse = bombFuse(ctx, (d.used as string[]).length);
  d.turnStartedAt = now;
  const order = a.alive;
  const i = order.indexOf(d.turn as string);
  d.turn = order[(i + 1) % order.length];
}

function arenaEliminate(ctx: Ctx, playerId: string) {
  const a = ctx.s.arena!;
  a.alive = a.alive.filter(id => id !== playerId);
  a.eliminated.push(playerId);
}

function arenaOesteResolve(ctx: Ctx, now: number) {
  const s = ctx.s;
  const a = s.arena!;
  const d = a.data;
  const shots = d.shots as Record<string, string>;
  const order = (d.shotOrder as string[]) ?? Object.keys(shots); // orden de llegada
  const dead: string[] = [];
  for (const shooter of order) {
    if (dead.includes(shooter)) continue;
    const target = shots[shooter];
    if (target && !dead.includes(target)) {
      dead.push(target);
      emit(ctx, 'arena_round', `🔫 ${player(s, shooter).name} dispara a ${player(s, target).name}: ¡cae!`, shooter, { shooter, target });
    }
  }
  for (const id of dead) arenaEliminate(ctx, id);
  a.round++;
  d.go = false; d.shots = {}; d.shotOrder = []; d.jammed = []; d.roundStartedAt = now;
  if (a.alive.length <= 1 || a.round > 6) return arenaFinish(ctx);
  emit(ctx, 'arena_round', `Quedan ${a.alive.length}. Nueva ronda…`, undefined, { round: a.round });
}

function arenaRayoResolve(ctx: Ctx, now: number) {
  const s = ctx.s;
  const a = s.arena!;
  const d = a.data;
  const size = d.gridSize as number;
  const n = size * size;
  const picks = d.picks as Record<string, number>;
  for (const id of a.alive) if (picks[id] === undefined) picks[id] = nextRandomInt(ctx, n);
  const hits: number[] = [];
  const count = Math.max(1, Math.floor(n / 3));
  while (hits.length < count) { const c = nextRandomInt(ctx, n); if (!hits.includes(c)) hits.push(c); }
  d.hits = hits; d.lastPicks = { ...picks };
  const struck = a.alive.filter(id => hits.includes(picks[id]));
  for (const id of struck) emit(ctx, 'arena_round', `⚡ ¡El rayo le cayó a ${player(s, id).name}!`, id, { struck: true });
  // si caen todos, nadie se elimina esa ronda
  if (struck.length < a.alive.length) for (const id of struck) arenaEliminate(ctx, id);
  a.round++;
  d.picks = {}; d.roundStartedAt = now;
  if (a.round === 4 && size > 2) d.gridSize = 2;
  if (a.alive.length <= 1 || a.round > 8) return arenaFinish(ctx);
}

// --- Carrera de sapos ---
export const SAPOS_GOAL = 60;        // filas hasta la meta
export const SAPOS_MAX_MS = 25000;
/** Filas recorridas a los `ms` milisegundos: arranca a 2 filas/s y acelera (velocidad = 2 + t/6). */
export function sapoPos(ms: number): number {
  const t = Math.max(0, ms) / 1000;
  return 2 * t + (t * t) / 12;
}
function sapoSplash(ctx: Ctx, id: string, row: number) {
  const a = ctx.s.arena!;
  (a.data.out as Record<string, number>)[id] = row;
  arenaEliminate(ctx, id);
  emit(ctx, 'arena_round', `💦 ¡${player(ctx.s, id).name} cayó en un charco en la fila ${row + 1}!`, id, { splash: true, row });
}
/** Avanza el sapo hasta la fila actual, revisando charcos fila por fila. */
function sapoAdvance(ctx: Ctx, id: string, now: number) {
  const a = ctx.s.arena!;
  const d = a.data;
  const fin = d.finished as string[], out = d.out as Record<string, number>, last = d.lastRow as Record<string, number>;
  if (fin.includes(id) || out[id] !== undefined) return;
  const elapsed = now - (a.startedAt ?? now);
  if (elapsed < 0) return;
  const goal = d.goal as number, track = d.track as number[], lane = (d.lane as Record<string, number>)[id];
  const cur = Math.floor(sapoPos(elapsed));
  for (let r = (last[id] ?? -1) + 1; r <= Math.min(cur, goal - 1); r++) {
    last[id] = r;
    if (track[r] === lane) { sapoSplash(ctx, id, r); return; }
  }
  if (cur >= goal) {
    fin.push(id); (d.finishTime as Record<string, number>)[id] = now; last[id] = goal;
    emit(ctx, 'arena_round', `🐸 ¡${player(ctx.s, id).name} llegó a la meta!`, id, { finished: fin.length });
  }
}

// --- Cartas contra el Paraguay ---
export const CARTAS_PICK_MS = 35000, CARTAS_JUDGE_MS = 25000, CARTAS_RESULT_MS = 4000;
function cartasNewRound(ctx: Ctx) {
  const a = ctx.s.arena!;
  const d = a.data, sec = a.secret;
  d.judge = a.players[((d.judgeIdx as number)) % a.players.length];
  void sec.blacks;
  d.black = BLACK_CARDS[pickUnused(ctx, 'black', BLACK_CARDS.length)];
  d.stage = 'pick'; d.played = []; d.pickedIds = []; sec.plays = {}; sec.playedIds = [];
}
function cartasToJudge(ctx: Ctx, now: number) {
  const a = ctx.s.arena!;
  const d = a.data, sec = a.secret;
  const plays = sec.plays as Record<string, number>;
  const ids = Object.keys(plays);
  if (ids.length === 0) { emit(ctx, 'arena_round', 'Nadie jugó una carta. Se pasa de ronda.', undefined, {}); return cartasNext(ctx, now); }
  const sh = shuffle(ids, ctx.s.seed); ctx.s.seed = sh.seed;
  sec.playedIds = sh.items;
  d.played = sh.items.map(id => WHITE_CARDS[plays[id]]);
  d.stage = 'judge'; d.stageAt = now;
}
function cartasNext(ctx: Ctx, now: number) {
  const a = ctx.s.arena!;
  const d = a.data;
  d.round = (d.round as number) + 1; d.judgeIdx = (d.judgeIdx as number) + 1;
  if ((d.round as number) > (d.rounds as number)) return arenaFinish(ctx);
  cartasNewRound(ctx); d.stageAt = now;
}

// --- La foto borrosa ---
export const BORROSA_ROUND_MS = 14000, BORROSA_REVEAL_MS = 3000;
function borrosaNext(ctx: Ctx) {
  const a = ctx.s.arena!;
  const d = a.data, sec = a.secret;
  const item = BLURRY[pickUnused(ctx, 'blurry', BLURRY.length)];
  const opts = shuffle([...item.options], ctx.s.seed); ctx.s.seed = opts.seed;
  d.emoji = item.emoji; d.options = opts.items; sec.answer = opts.items.indexOf(item.answer);
  d.answered = {}; d.reveal = null; d.roundStartedAt = null; d.winner = null;
}
function borrosaReveal(ctx: Ctx, now: number, winner: string | null) {
  const a = ctx.s.arena!;
  const d = a.data;
  d.reveal = a.secret.answer; d.revealUntil = now + BORROSA_REVEAL_MS; d.winner = winner;
  emit(ctx, 'arena_round', winner ? `🔍 ¡${player(ctx.s, winner).name} adivinó: ${(d.options as string[])[a.secret.answer as number]}!` : `Nadie adivinó. Era: ${(d.options as string[])[a.secret.answer as number]}.`, winner ?? undefined, { reveal: a.secret.answer, winner });
}
function borrosaAdvance(ctx: Ctx) {
  const a = ctx.s.arena!;
  const d = a.data;
  d.qIndex = (d.qIndex as number) + 1;
  if ((d.qIndex as number) >= (d.rounds as number)) return arenaFinish(ctx);
  borrosaNext(ctx);
}

// --- Ordená la cadena ---
export const CADENA_ROUND_MS = 25000, CADENA_REVEAL_MS = 4000;
function cadenaNext(ctx: Ctx) {
  const a = ctx.s.arena!;
  const d = a.data, sec = a.secret;
  const ch = CHAINS[pickUnused(ctx, 'chains', CHAINS.length)];
  const sh = shuffle(ch.items.map((_, i) => i), ctx.s.seed); ctx.s.seed = sh.seed;
  d.title = ch.title; d.shown = sh.items.map(i => ch.items[i]);           // orden mezclado que ve la gente
  sec.correct = ch.items.map(it => (d.shown as string[]).indexOf(it));     // índices de d.shown en el orden correcto
  d.orders = {}; d.results = null; d.reveal = null; d.roundStartedAt = null;
}
function cadenaReveal(ctx: Ctx, now: number) {
  const a = ctx.s.arena!;
  const d = a.data;
  const correct = a.secret.correct as number[];
  const orders = d.orders as Record<string, number[]>;
  const results: Record<string, number> = {};
  for (const id of a.players) {
    const o = orders[id];
    results[id] = o ? o.reduce((n, v, i) => n + (v === correct[i] ? 1 : 0), 0) : 0;
    a.scores[id] += results[id];
  }
  d.results = results; d.reveal = correct; d.revealUntil = now + CADENA_REVEAL_MS;
  const best = a.players.filter(id => results[id] === 4);
  emit(ctx, 'arena_round', best.length ? `🔗 Orden perfecto: ${best.map(id => player(ctx.s, id).name).join(', ')}.` : '🔗 Nadie acertó el orden completo.', undefined, { reveal: correct, results });
}
function cadenaAdvance(ctx: Ctx) {
  const a = ctx.s.arena!;
  const d = a.data;
  d.qIndex = (d.qIndex as number) + 1;
  if ((d.qIndex as number) >= (d.rounds as number)) return arenaFinish(ctx);
  cadenaNext(ctx);
}

// --- Ruleta de la muerte ---
export const RULETA_TURN_MS = 12000;
function ruletaNextTurn(ctx: Ctx, now: number) {
  const a = ctx.s.arena!;
  const d = a.data;
  const order = a.alive;
  const i = order.indexOf(d.turn as string);
  d.turn = order[(i + 1) % order.length] ?? order[0];
  d.turnStartedAt = now;
}
function ruletaShoot(ctx: Ctx, playerId: string, now: number) {
  const a = ctx.s.arena!;
  const d = a.data, sec = a.secret;
  const p = player(ctx.s, playerId);
  if (d.pos === sec.chamber) {
    d.lastShot = { by: playerId, bang: true };
    emit(ctx, 'arena_round', `💥 ¡BANG! ${p.name} quedó afuera.`, playerId, { bang: true });
    arenaEliminate(ctx, playerId);
    sec.chamber = nextRandomInt(ctx, 6); d.pos = 0; d.clicks = 0; d.reloads = (d.reloads as number) + 1;
    if (a.alive.length <= 1) return arenaFinish(ctx);
    // el turno pasa al siguiente en la ronda (el eliminado ya no está)
    d.turn = a.alive[(a.eliminated.length + (d.reloads as number)) % a.alive.length]; d.turnStartedAt = now;
    return;
  }
  d.pos = (d.pos as number) + 1; d.clicks = (d.clicks as number) + 1;
  d.lastShot = { by: playerId, bang: false };
  emit(ctx, 'arena_round', `${p.name} aprieta… clic. (${6 - (d.clicks as number)} recámaras quedan)`, playerId, { bang: false, clicks: d.clicks });
  ruletaNextTurn(ctx, now);
}

// --- Plantá la bomba ---
export const BOMBA2_PLANT_MS = 12000, BOMBA2_CUT_MS = 15000, BOMBA2_REVEAL_MS = 4000;
function bomba2Resolve(ctx: Ctx, now: number) {
  const a = ctx.s.arena!;
  const d = a.data, sec = a.secret;
  const cuts = d.cuts as Record<string, number>;
  const trap = sec.trap as number;
  const defusers = (d.defusers as string[]).filter(id => a.alive.includes(id));
  for (const id of defusers) if (cuts[id] === undefined) cuts[id] = nextRandomInt(ctx, d.wires as number); // el indeciso corta cualquiera
  const blown = defusers.filter(id => cuts[id] === trap);
  for (const id of defusers) if (!blown.includes(id)) a.scores[id] += 1;
  a.scores[d.saboteur as string] += blown.length;
  for (const id of blown) arenaEliminate(ctx, id);
  d.reveal = { trap, cuts: { ...cuts }, blown }; d.stage = 'reveal'; d.stageAt = now;
  emit(ctx, 'arena_round', blown.length ? `🧨 ¡BOOM! El cable trampa era el ${['rojo', 'azul', 'verde', 'amarillo'][trap]}: ${blown.map(id => player(ctx.s, id).name).join(', ')} volaron.` : `Todos cortaron bien: el cable trampa era el ${['rojo', 'azul', 'verde', 'amarillo'][trap]}.`, undefined, { trap, blown });
}
function bomba2Next(ctx: Ctx, now: number) {
  const a = ctx.s.arena!;
  const d = a.data;
  d.round = (d.round as number) + 1;
  const left = (d.defusers as string[]).filter(id => a.alive.includes(id));
  if ((d.round as number) > (d.rounds as number) || left.length === 0) return arenaFinish(ctx);
  d.stage = 'plant'; d.cuts = {}; d.reveal = null; a.secret.trap = null; d.stageAt = now;
}

/** Temporizadores y señales que dispara el servidor. */
function arenaTick(ctx: Ctx, now: number) {
  const s = ctx.s;
  if (s.turnPhase !== 'ARENA' || !s.arena) return;
  const a = s.arena;
  if (a.stage !== 'play') return;
  const d = a.data;
  const elapsed = now - (a.startedAt ?? now);
  if (elapsed < 0) return; // cuenta regresiva
  switch (a.game) {
    case 'trivia':
      if (d.reveal !== undefined && d.reveal !== null) {
        if (now >= (d.revealUntil as number)) { arenaTriviaAdvance(ctx); if (s.arena?.stage === 'play') s.arena.data.questionStartedAt = now; }
        return;
      }
      if (d.questionStartedAt === null) { d.questionStartedAt = now; return; }
      if (now - (d.questionStartedAt as number) >= 15000) arenaTriviaReveal(ctx, now);
      return;
    case 'cana': if (elapsed >= (d.duration as number) + 1500) arenaFinish(ctx); return;
    case 'barra': if (elapsed >= 25000) arenaFinish(ctx); return;
    case 'cuantos': if (elapsed >= 20000) arenaFinish(ctx); return;
    case 'bomba': {
      if (now - (d.turnStartedAt as number) >= (a.secret.fuse as number)) {
        const victim = d.turn as string;
        const lives = d.lives as Record<string, number>;
        lives[victim]--;
        emit(ctx, 'arena_round', `💣 ¡BOOM! Le explotó a ${player(s, victim).name} (${lives[victim]} vida${lives[victim] === 1 ? '' : 's'}).`, victim, { boom: true, lives: lives[victim] });
        if (lives[victim] <= 0) arenaEliminate(ctx, victim);
        if (a.alive.length <= 1) return arenaFinish(ctx);
        // siguiente jugador vivo
        if (!a.alive.includes(victim)) { d.turn = a.alive[0]; arenaNewSyllable(ctx); a.secret.fuse = bombFuse(ctx, (d.used as string[]).length); d.turnStartedAt = now; }
        else arenaBombNext(ctx, now);
      }
      if (elapsed >= 180000) arenaFinish(ctx);
      return;
    }
    case 'oeste': {
      if (!d.go) {
        if (now - (d.roundStartedAt as number) >= (d.goDelay as number ?? 2500)) { d.go = true; d.goAt = now; d.goDelay = 1500 + nextRandomInt(ctx, 3000); emit(ctx, 'arena_go', '🔔 ¡Campana! ¡Disparen!', undefined, { go: true }); }
        return;
      }
      if (now - (d.goAt as number) >= 3500) arenaOesteResolve(ctx, now);
      return;
    }
    case 'rayo': if (now - (d.roundStartedAt as number) >= 3000) arenaRayoResolve(ctx, now); return;
    case 'penales': if (elapsed >= 40000) arenaFinish(ctx); return;
    case 'globos': if (elapsed >= 90000) arenaFinish(ctx); return;
    case 'dibujo': if (elapsed >= 60000) { a.ranking = [d.drawer as string]; arenaFinish(ctx); } return;
    case 'sapos': {
      for (const id of [...a.alive]) sapoAdvance(ctx, id, now);
      const fin = d.finished as string[], out = d.out as Record<string, number>;
      const pending = a.players.filter(id => !fin.includes(id) && out[id] === undefined);
      if (pending.length === 0 || elapsed >= SAPOS_MAX_MS) arenaFinish(ctx);
      return;
    }
    case 'cartas': {
      const since = now - (d.stageAt as number);
      if (d.stage === 'pick' && since >= CARTAS_PICK_MS) cartasToJudge(ctx, now);
      else if (d.stage === 'judge' && since >= CARTAS_JUDGE_MS) {
        const ids = a.secret.playedIds as string[];
        const pick = nextRandomInt(ctx, ids.length);
        a.scores[ids[pick]] += 1;
        d.lastWin = { text: (d.played as string[])[pick], winner: ids[pick], black: d.black };
        emit(ctx, 'arena_round', `El juez se durmió: gana al azar "${(d.played as string[])[pick]}" (${player(s, ids[pick]).name}).`, ids[pick], { winner: ids[pick] });
        d.stage = 'result'; d.stageAt = now;
      } else if (d.stage === 'result' && since >= CARTAS_RESULT_MS) cartasNext(ctx, now);
      return;
    }
    case 'borrosa': {
      if (d.reveal !== null && d.reveal !== undefined) { if (now >= (d.revealUntil as number)) { borrosaAdvance(ctx); if (s.arena?.stage === 'play') s.arena.data.roundStartedAt = now; } return; }
      if (d.roundStartedAt === null) { d.roundStartedAt = now; return; }
      if (now - (d.roundStartedAt as number) >= BORROSA_ROUND_MS) borrosaReveal(ctx, now, null);
      return;
    }
    case 'cadena': {
      if (d.reveal !== null && d.reveal !== undefined) { if (now >= (d.revealUntil as number)) { cadenaAdvance(ctx); if (s.arena?.stage === 'play') s.arena.data.roundStartedAt = now; } return; }
      if (d.roundStartedAt === null) { d.roundStartedAt = now; return; }
      if (now - (d.roundStartedAt as number) >= CADENA_ROUND_MS) cadenaReveal(ctx, now);
      return;
    }
    case 'ruleta': {
      if (now - (d.turnStartedAt as number) >= RULETA_TURN_MS) { emit(ctx, 'arena_round', `${player(s, d.turn as string).name} tardó demasiado: aprieta solo.`, d.turn as string, {}); ruletaShoot(ctx, d.turn as string, now); }
      if (elapsed >= 120000) arenaFinish(ctx);
      return;
    }
    case 'bomba2': {
      const since = now - (d.stageAt as number);
      if (d.stage === 'plant' && since >= BOMBA2_PLANT_MS) { a.secret.trap = nextRandomInt(ctx, d.wires as number); d.stage = 'cut'; d.stageAt = now; emit(ctx, 'arena_round', 'El saboteador se durmió: la trampa se plantó al azar. ¡A cortar!', undefined, { planted: true }); }
      else if (d.stage === 'cut' && since >= BOMBA2_CUT_MS) bomba2Resolve(ctx, now);
      else if (d.stage === 'reveal' && since >= BOMBA2_REVEAL_MS) bomba2Next(ctx, now);
      return;
    }
  }
}

function arenaRanking(a: NonNullable<GameState['arena']>): string[] {
  const d = a.data;
  const byScoreDesc = (score: (id: string) => number, asc = false) =>
    [...a.players].sort((x, y) => (asc ? score(x) - score(y) : score(y) - score(x)));
  switch (a.game) {
    case 'trivia': return byScoreDesc(id => a.scores[id]);
    case 'cana': return byScoreDesc(id => (d.taps as Record<string, number>)[id] ?? 0);
    case 'barra': return byScoreDesc(id => { const at = (d.attempts as Record<string, number[]>)[id]; return at.length ? Math.min(...at) : 999; }, true);
    case 'cuantos': return byScoreDesc(id => { const v = (d.answers as Record<string, number>)[id]; return v === undefined ? 1e12 : Math.abs(v - (a.secret.answer as number)); }, true);
    case 'penales': return byScoreDesc(id => (d.goals as Record<string, number>)[id] * 1000 + (d.shots as Record<string, { power: number }[]>)[id].reduce((n, x) => n + x.power, 0));
    case 'bomba': case 'oeste': case 'rayo': case 'globos': case 'ruleta': return [...a.alive, ...[...a.eliminated].reverse()];
    case 'sapos': {
      const fin = d.finished as string[], out = d.out as Record<string, number>, last = d.lastRow as Record<string, number>, ft = d.finishTime as Record<string, number>;
      const finished = [...fin].sort((x, y) => (ft[x] ?? 0) - (ft[y] ?? 0));
      const running = a.players.filter(id => !fin.includes(id) && out[id] === undefined).sort((x, y) => (last[y] ?? 0) - (last[x] ?? 0));
      const fell = Object.keys(out).sort((x, y) => out[y] - out[x]);
      return [...finished, ...running, ...fell];
    }
    case 'cartas': case 'borrosa': case 'cadena': return byScoreDesc(id => a.scores[id]);
    case 'bomba2': return byScoreDesc(id => a.scores[id] * 10 + (id === d.saboteur ? 0 : 1));
    case 'dibujo': return a.ranking ?? [d.drawer as string];
  }
  return [...a.players];
}

function arenaFinish(ctx: Ctx) {
  const s = ctx.s;
  const a = s.arena!;
  if (a.stage === 'done') return;
  a.stage = 'done';
  if (a.game === 'cuantos') a.data.answer = a.secret.answer;      // se revela la respuesta correcta
  if (a.game === 'dibujo') a.data.word = a.secret.word;
  const ranking = a.ranking ?? arenaRanking(a);
  a.ranking = ranking;
  const rewards: Record<string, number> = {};
  const worths = activePlayers(s).map(p => ({ id: p.id, w: p.cash })).sort((x, y) => x.w - y.w);
  const poorest = worths.length > 1 && worths[0].w < worths[1].w ? worths[0].id : null; // el de menos efectivo (sin empate) cobra doble
  const winner = ranking[0];
  // empates en el primer puesto (mismo puntaje) comparten el primer premio
  ranking.forEach((id, i) => {
    if (i >= ARENA_REWARDS.length) return;
    let amt = ARENA_REWARDS[i];
    if (a.game === 'dibujo' && ranking.length === 1) amt = 100; // nadie adivinó: consuelo al dibujante
    if (i === 0 && id === poorest) amt *= 2;
    rewards[id] = amt;
    credit(ctx, id, amt);
  });
  a.rewards = rewards;
  a.data.doubled = winner === poorest ? winner : null;
  const w = player(s, winner);
  w.stats.arenaWins++;
  emit(ctx, 'arena_done', `🏟️ Arena: ganó ${w.name} (${fmt(rewards[winner])}${winner === poorest ? ', ¡remontada x2 por tener menos efectivo!' : ''}).` +
    (ranking[1] && rewards[ranking[1]] ? ` 2º ${player(s, ranking[1]).name} ${fmt(rewards[ranking[1]])}.` : '') +
    (ranking[2] && rewards[ranking[2]] ? ` 3º ${player(s, ranking[2]).name} ${fmt(rewards[ranking[2]])}.` : ''),
    winner, { ranking, rewards, game: a.game, to: winner, amount: rewards[winner] });
}

/** Cierra la Arena (tras mostrar el resultado) y sigue el turno. */
function arenaEnd(ctx: Ctx) {
  const s = ctx.s;
  if (s.turnPhase !== 'ARENA' || !s.arena) return;
  if (s.arena.stage !== 'done') arenaFinish(ctx);
  s.arena = null;
  finishResolution(ctx);
}

// ---------------------------------------------------------------------------
// Duelo mayor (Escopeta / Truco)
// ---------------------------------------------------------------------------

function duelPropose(ctx: Ctx, playerId: string, toId: string, game: DuelGame, amount: number) {
  const s = ctx.s;
  requirePlaying(ctx);
  if (!s.settings.duels) throw new RuleError('Los duelos mayores no están activados.');
  requireCurrent(ctx, playerId);
  requirePhase(ctx, 'AWAITING_ROLL', 'END_TURN');
  const from = player(s, playerId), to = player(s, toId);
  if (from.duelTokens <= 0) throw new RuleError('No tenés fichas de duelo (una cada 3 vueltas).');
  if (to.bankrupt || to.id === from.id) throw new RuleError('Rival inválido.');
  if (!Number.isInteger(amount) || amount < 50 || amount > DUEL_MAX_BET) throw new RuleError(`La apuesta va de ₲ 50.000 a ${fmt(DUEL_MAX_BET)}.`);
  if (amount > from.cash || amount > to.cash) throw new RuleError('Alguno de los dos no tiene ese efectivo.');
  from.duelTokens--;
  s.tradeCounter++;
  s.duel = { id: `m${s.tradeCounter}`, game, fromId: playerId, toId, amount, status: 'pending', returnPhase: s.turnPhase, turn: toId, data: {}, secret: {}, winnerId: null };
  s.turnPhase = 'DUEL';
  emit(ctx, 'duel_proposed', `⚔️ ${from.name} usa su ficha y desafía a ${to.name} a un Duelo mayor de ${game === 'truco' ? 'Truco' : 'Escopeta'} por ${fmt(amount)}. Negarse cuesta ${fmt(DUEL_COWARD_FEE)}.`, playerId, { game, amount, to: toId });
}

function duelAnswer(ctx: Ctx, playerId: string, accept: boolean) {
  const s = ctx.s;
  requirePlaying(ctx); requirePhase(ctx, 'DUEL');
  const d = s.duel!;
  if (d.status !== 'pending') throw new RuleError('El duelo ya empezó.');
  if (d.toId !== playerId) throw new RuleError('El duelo no es para vos.');
  const to = player(s, playerId), from = player(s, d.fromId);
  if (!accept) {
    const fee = Math.min(DUEL_COWARD_FEE, to.cash);
    to.cash -= fee; from.cash += fee;
    emit(ctx, 'duel_rejected', `${to.name} no aceptó el duelo y paga ${fmt(fee)} a ${from.name}.`, playerId, { amount: fee, to: d.fromId });
    from.duelTokens++; // la ficha se conserva
    s.turnPhase = d.returnPhase; s.duel = null;
    return;
  }
  d.status = 'playing';
  emit(ctx, 'duel_accepted', `${to.name} aceptó. ¡Empieza el duelo de ${d.game === 'truco' ? 'Truco' : 'Escopeta'}!`, playerId, { game: d.game });
  if (d.game === 'truco') {
    const t = newTruco(d.fromId, d.toId, s.seed, 15, TRUCO_HANDS);
    s.seed = t.sec.seed;
    d.data = { truco: t.pub }; d.secret = { truco: t.sec }; d.turn = t.pub.turn;
  } else escopetaLoad(ctx, true);
}

function escopetaLoad(ctx: Ctx, first: boolean) {
  const s = ctx.s;
  const d = s.duel!;
  const live = 1 + nextRandomInt(ctx, 4);   // 1-4 de verdad
  const blank = 1 + nextRandomInt(ctx, 4);  // 1-4 de fogueo
  const shells: boolean[] = [...Array(live).fill(true), ...Array(blank).fill(false)];
  const sh = shuffle(shells, s.seed); s.seed = sh.seed;
  const items = ['lupa', 'cerveza', 'esposas'];
  const give = () => { const n = 1 + nextRandomInt(ctx, 2); const out: string[] = []; for (let i = 0; i < n; i++) out.push(items[nextRandomInt(ctx, items.length)]); return out; };
  const prev = (d.data.items as Record<string, string[]> | undefined) ?? { [d.fromId]: [], [d.toId]: [] };
  d.data = {
    ...d.data,
    lives: first ? { [d.fromId]: 3, [d.toId]: 3 } : d.data.lives,
    known: { live, blank }, shellsLeft: shells.length,
    items: { [d.fromId]: [...prev[d.fromId], ...give()].slice(0, 4), [d.toId]: [...prev[d.toId], ...give()].slice(0, 4) },
    cuffed: null, peek: {}, lastShot: null, round: ((d.data.round as number) ?? 0) + 1,
  };
  d.secret = { shells: sh.items };
  if (first) d.turn = d.toId; // empieza el desafiado
  emit(ctx, 'duel_round', `🔫 Se carga la escopeta: ${live} de verdad, ${blank} de fogueo.`, undefined, { live, blank });
}

function duelMove(ctx: Ctx, playerId: string, move: Record<string, unknown>) {
  const s = ctx.s;
  requirePlaying(ctx); requirePhase(ctx, 'DUEL');
  const d = s.duel!;
  if (d.status !== 'playing') throw new RuleError('El duelo no está en juego.');
  if (playerId !== d.fromId && playerId !== d.toId) throw new RuleError('No participás.');
  const opp = playerId === d.fromId ? d.toId : d.fromId;
  const p = player(s, playerId), o = player(s, opp);

  if (d.game === 'truco') {
    const st: TrucoState = { pub: d.data.truco as TrucoState['pub'], sec: d.secret.truco as TrucoState['sec'] };
    let next: TrucoState;
    try { next = applyTruco(st, playerId, move as unknown as TrucoMove); } catch (e) { throw new RuleError((e as Error).message); }
    const before = st.pub.log.length;
    d.data = { truco: next.pub }; d.secret = { truco: next.sec }; d.turn = next.pub.turn;
    for (const line of next.pub.log.slice(before)) emit(ctx, 'duel_round', line.split(d.fromId).join(player(s, d.fromId).name).split(d.toId).join(player(s, d.toId).name), playerId, {});
    if (next.pub.finished && next.pub.winner) duelFinish(ctx, next.pub.winner);
    return;
  }

  // Escopeta
  if (d.turn !== playerId) throw new RuleError('No es tu turno.');
  const kind = String(move.kind);
  const items = d.data.items as Record<string, string[]>;
  const shells = d.secret.shells as boolean[];
  if (kind === 'item') {
    const item = String(move.item);
    const idx = items[playerId].indexOf(item);
    if (idx < 0) throw new RuleError('No tenés ese ítem.');
    items[playerId].splice(idx, 1);
    if (item === 'lupa') {
      (d.data.peek as Record<string, string>)[playerId] = shells[0] ? 'live' : 'blank';
      emit(ctx, 'duel_round', `${p.name} usa la lupa y mira el próximo cartucho.`, playerId, { item });
    } else if (item === 'cerveza') {
      const ejected = shells.shift();
      d.data.shellsLeft = shells.length;
      const known = d.data.known as { live: number; blank: number };
      if (ejected) known.live--; else known.blank--;
      (d.data.peek as Record<string, string>)[playerId] = '';
      emit(ctx, 'duel_round', `${p.name} usa la cerveza y expulsa un cartucho: era ${ejected ? 'DE VERDAD' : 'de fogueo'}.`, playerId, { item, ejected: !!ejected });
      if (shells.length === 0) escopetaLoad(ctx, false);
    } else if (item === 'esposas') {
      if (d.data.cuffed === opp) throw new RuleError('Ya está esposado.');
      d.data.cuffed = opp;
      emit(ctx, 'duel_round', `${p.name} esposa a ${o.name}: pierde su próximo turno.`, playerId, { item });
    }
    return;
  }
  if (kind !== 'shoot') throw new RuleError('Jugada inválida.');
  const target = move.target === 'self' ? playerId : opp;
  const shell = shells.shift()!;
  d.data.shellsLeft = shells.length;
  const known = d.data.known as { live: number; blank: number };
  if (shell) known.live--; else known.blank--;
  (d.data.peek as Record<string, string>)[playerId] = '';
  const lives = d.data.lives as Record<string, number>;
  d.data.lastShot = { by: playerId, target, live: shell };
  if (shell) {
    lives[target]--;
    emit(ctx, 'duel_round', `💥 ${p.name} dispara a ${target === playerId ? 'sí mismo' : o.name}: ¡ERA DE VERDAD! ${player(s, target).name} pierde una vida (${lives[target]}).`, playerId, { target, live: true, lives: lives[target] });
  } else {
    emit(ctx, 'duel_round', `${p.name} dispara a ${target === playerId ? 'sí mismo' : o.name}: clic. De fogueo.`, playerId, { target, live: false });
  }
  if (lives[target] <= 0) return duelFinish(ctx, target === playerId ? opp : playerId);
  // Turno: dispararse con fogueo mantiene el turno; si no, pasa (salvo esposas)
  let nextTurn: string = shell || target !== playerId ? opp : playerId;
  if (nextTurn === opp && d.data.cuffed === opp) { d.data.cuffed = null; nextTurn = playerId; emit(ctx, 'duel_round', `${o.name} está esposado: ${p.name} sigue.`, undefined, {}); }
  d.turn = nextTurn;
  if (shells.length === 0) escopetaLoad(ctx, false);
}

function duelFinish(ctx: Ctx, winnerId: string) {
  const s = ctx.s;
  const d = s.duel!;
  const loserId = winnerId === d.fromId ? d.toId : d.fromId;
  const w = player(s, winnerId), l = player(s, loserId);
  const amt = Math.min(d.amount, l.cash);
  l.cash -= amt; w.cash += amt;
  w.stats.duelsWon++;
  d.status = 'done'; d.winnerId = winnerId;
  emit(ctx, 'duel_done', `🏆 ¡${w.name} ganó el Duelo mayor de ${d.game === 'truco' ? 'Truco' : 'Escopeta'} y cobra ${fmt(amt)} de ${l.name}!`, winnerId, { winner: winnerId, loser: loserId, amount: amt, to: winnerId, game: d.game });
  s.turnPhase = d.returnPhase;
  s.duel = null;
}

function duelCancel(ctx: Ctx, playerId: string) {
  const s = ctx.s;
  const d = s.duel;
  if (!d) return;
  if (playerId !== s.hostId) throw new RuleError('Solo el anfitrión puede anular un duelo.');
  emit(ctx, 'duel_cancelled', 'El duelo se anuló; nadie paga.', playerId);
  player(s, d.fromId).duelTokens++;
  s.turnPhase = d.returnPhase; s.duel = null;
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
      bankrupt: false, lapsCompleted: 0, duelTokens: 0, missions: [], stats: emptyStats(),
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
    } else if (ph === 'ARENA') arenaEnd(ctx);
    else if (ph === 'DUEL') {
      if (s.duel!.status === 'pending') duelAnswer(ctx, s.duel!.toId, false);
      else duelCancel(ctx, s.hostId);
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
    case 'RENT_DON_ROLL': rentDonRoll(ctx, action.playerId); break;
    case 'CHALLENGE_PROPOSE': challengePropose(ctx, action.playerId, action.toId, action.kind, action.amount); break;
    case 'CHALLENGE_ACCEPT': challengeAnswer(ctx, action.playerId, true); break;
    case 'CHALLENGE_REJECT': challengeAnswer(ctx, action.playerId, false); break;
    case 'CHALLENGE_MOVE': challengeMove(ctx, action.playerId, action.choice, action.answer); break;
    case 'CHALLENGE_GO': challengeGo(ctx); break;
    case 'CHALLENGE_CANCEL': challengeCancel(ctx, action.playerId); break;
    case 'ARENA_VOTE': arenaVote(ctx, action.playerId, action.option); break;
    case 'ARENA_START': arenaStart(ctx, action.now); break;
    case 'ARENA_MOVE': arenaMove(ctx, action.playerId, action.now, action.payload); break;
    case 'ARENA_TICK': arenaTick(ctx, action.now); break;
    case 'ARENA_END':
      if (action.playerId !== ctx.s.hostId && ctx.s.arena?.stage !== 'done') throw new RuleError('Solo el anfitrión puede cerrar la Arena.');
      arenaEnd(ctx); break;
    case 'DUEL_PROPOSE': duelPropose(ctx, action.playerId, action.toId, action.game, action.amount); break;
    case 'DUEL_ACCEPT': duelAnswer(ctx, action.playerId, true); break;
    case 'DUEL_REJECT': duelAnswer(ctx, action.playerId, false); break;
    case 'DUEL_MOVE': duelMove(ctx, action.playerId, action.move); break;
    case 'DUEL_CANCEL': duelCancel(ctx, action.playerId); break;
    default: throw new RuleError('Acción desconocida.');
  }
  checkMissions(ctx);
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
    if (o.ownerId === playerId && o.proposed && !o.accepted) { out.add('RENT_DON_ACCEPT'); out.add('RENT_DON_REJECT'); }
    if (o.payerId === playerId && o.accepted) out.add('RENT_DON_ROLL');
  }
  if (ph === 'ARENA' && state.arena) {
    const a = state.arena;
    if (a.stage === 'vote' && a.players.includes(playerId) && a.votes[playerId] === undefined) out.add('ARENA_VOTE');
    if (a.stage === 'play' && a.players.includes(playerId)) out.add('ARENA_MOVE');
    if (a.stage === 'done' || playerId === state.hostId) out.add('ARENA_END');
  }
  if (ph === 'DUEL' && state.duel) {
    const d = state.duel;
    if (d.status === 'pending' && d.toId === playerId) { out.add('DUEL_ACCEPT'); out.add('DUEL_REJECT'); }
    if (d.status === 'playing' && (d.fromId === playerId || d.toId === playerId)) out.add('DUEL_MOVE');
    if (playerId === state.hostId) out.add('DUEL_CANCEL');
  }
  if (isCurrent && (ph === 'AWAITING_ROLL' || ph === 'END_TURN') && state.settings.duels && p.duelTokens > 0 && !state.duel && activePlayers(state).length > 1) out.add('DUEL_PROPOSE');
  if (ph === 'CHALLENGE' && state.challenge) {
    const c = state.challenge;
    if (c.status === 'pick' && c.fromId === playerId) out.add('CHALLENGE_PROPOSE');
    if (c.status === 'pending' && c.toId === playerId) { out.add('CHALLENGE_ACCEPT'); out.add('CHALLENGE_REJECT'); }
    if (c.status === 'playing' && (c.fromId === playerId || c.toId === playerId)) out.add('CHALLENGE_MOVE');
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
