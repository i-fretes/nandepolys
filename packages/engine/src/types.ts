// Todos los montos están en MILES de guaraníes: 60 = ₲ 60.000

export type Group =
  | 'marron' | 'celeste' | 'rosa' | 'naranja'
  | 'rojo' | 'amarillo' | 'verde' | 'azul';

export interface StreetTile {
  id: number; type: 'street'; name: string; group: Group;
  price: number; rents: [number, number, number, number, number, number]; houseCost: number;
}
export interface TransportTile { id: number; type: 'transport'; name: string; price: number }
export interface UtilityTile { id: number; type: 'utility'; name: string; price: number }
export interface TaxTile { id: number; type: 'tax'; name: string; amount: number; percent?: number }
export interface CardTile { id: number; type: 'chance' | 'community'; name: string }
export interface SpecialTile { id: number; type: 'go' | 'jail' | 'parking' | 'gotojail' | 'casino' | 'arena'; name: string }
export type Tile = StreetTile | TransportTile | UtilityTile | TaxTile | CardTile | SpecialTile;
export type PropertyTile = StreetTile | TransportTile | UtilityTile;

export type DeckId = 'chance' | 'community';

export type CardEffect =
  | { kind: 'moveTo'; tile: number; collectGo: boolean }
  | { kind: 'nearest'; tileType: 'utility' | 'transport' }
  | { kind: 'money'; amount: number }
  | { kind: 'jailFree' }
  | { kind: 'moveBack'; steps: number }
  | { kind: 'goToJail' }
  | { kind: 'repairs'; perHouse: number; perHotel: number }
  | { kind: 'payEach'; amount: number }
  | { kind: 'collectEach'; amount: number }
  | { kind: 'challenge'; amount: number };   // ¡Desafío!: elegís rival y mini-juego; el rival no puede negarse

export interface Card { id: string; deck: DeckId; text: string; effect: CardEffect }

export type TokenId = 'mate' | 'chipa' | 'nanduti' | 'carreta' | 'jaguarete' | 'arpa';

export interface GameSettings {
  startingCash: number;        // 1500 por defecto
  auctions: boolean;           // subastar propiedades rechazadas (regla oficial)
  freeParkingPot: boolean;     // regla casera: pozo en Estacionamiento Libre
  doubleGoSalary: boolean;     // regla casera: caer exacto en Salida paga doble
  noBuyFirstLap: boolean;      // regla casera: sin compras en la primera vuelta
  turnTimerSeconds: number;    // 0 = sin límite (lo aplica el servidor)
  timeLimitMinutes: number;    // 0 = sin límite (lo aplica el servidor)
  casino: boolean;             // las casillas Casino están abiertas
  casinoMaxBet: number;        // apuesta máxima (miles), 500 por defecto
  jackpot: boolean;            // lo perdido en el casino se acumula; doble seis se lo lleva
  rentDoubleOrNothing: boolean;// al caer en propiedad ajena podés proponer doble o nada
  challenges: boolean;         // desafíos entre jugadores (botón + cartas ¡Desafío!)
  arena: boolean;              // las casillas Arena: mini-juegos para todos con premio del banco
  lootbox: boolean;            // caja sorpresa al pasar por Salida en vez del sueldo fijo
  missions: boolean;           // misiones secretas por jugador
  events: boolean;             // eventos globales (ruleta al completar cada vuelta de mesa)
  duels: boolean;              // ficha de duelo cada 3 vueltas: Escopeta / Truco
}

export interface Player {
  id: string;
  name: string;
  token: TokenId;
  color: string;
  cash: number;
  position: number;
  inJail: boolean;
  jailTurns: number;
  jailCards: DeckId[];         // cartas "Salís de Tacumbú" que conserva
  bankrupt: boolean;
  connected: boolean;
  isBot: boolean;
  lapsCompleted: number;
  duelTokens: number;          // fichas de duelo (una cada 3 vueltas)
  missions: Mission[];         // misiones secretas (solo las ve el dueño)
  stats: PlayerStats;          // contadores para misiones
}

export interface PlayerStats {
  rentsCollected: number; rentsThisLap: number; auctionsWon: number; cheapAuctionWins: number;
  challengesWon: number; triviaWins: number; casinoWins: number; housesBuilt: number; hotelsBuilt: number;
  trades: number; jailVisits: number; jackpots: number; arenaWins: number; mortgagesRedeemed: number;
  duelsWon: number; doubles: number; salaries: number; donWins: number;
}

export interface Mission { id: string; text: string; reward: number; done: boolean }

export interface PropertyState { owner: string | null; houses: number; mortgaged: boolean } // houses 5 = hotel

export type TurnPhase =
  | 'AWAITING_ROLL' | 'AWAITING_BUY' | 'AUCTION' | 'TAX_CHOICE' | 'DEBT' | 'END_TURN'
  | 'CASINO' | 'RENT_OFFER' | 'CHALLENGE' | 'ARENA' | 'DUEL';

// ---------------------------------------------------------------------------
// La Arena: mini-juegos para todos
// ---------------------------------------------------------------------------
export type ArenaGame =
  | 'trivia' | 'cana' | 'barra' | 'cuantos' | 'bomba' | 'sapos' | 'oeste' | 'rayo' | 'penales' | 'globos' | 'dibujo'
  | 'cartas' | 'borrosa' | 'cadena' | 'ruleta' | 'bomba2';

export interface ArenaState {
  stage: 'vote' | 'play' | 'done';
  triggeredBy: string;
  options: ArenaGame[];                    // 3 opciones a votar
  votes: Record<string, number>;
  game: ArenaGame | null;
  players: string[];                       // participantes (activos al empezar)
  startedAt: number | null;                // reloj del servidor (ms) al empezar el juego
  round: number;
  alive: string[];                         // para juegos de eliminación
  eliminated: string[];                    // orden de eliminación (primero = peor)
  scores: Record<string, number>;
  data: Record<string, unknown>;           // estado público específico del juego
  secret: Record<string, unknown>;         // nunca viaja al cliente
  ranking: string[] | null;                // resultado final
  rewards: Record<string, number> | null;
}

// ---------------------------------------------------------------------------
// Eventos globales
// ---------------------------------------------------------------------------
export type GlobalEventId =
  | 'tranquilidad' | 'hora_feliz' | 'paro_ande' | 'aguinaldo' | 'control_set' | 'boom' | 'inflacion'
  | 'dia_nino' | 'ruta_cortada' | 'amnistia' | 'sequia' | 'san_juan' | 'mudanza' | 'solidaria'
  | 'corte_ruta' | 'remate' | 'terremoto' | 'loteria' | 'noche_casino' | 'presidente';

export interface ActiveEvent { id: GlobalEventId; roundsLeft: number; data?: Record<string, unknown> }

// ---------------------------------------------------------------------------
// Duelo mayor (ficha cada 3 vueltas): Escopeta / Truco
// ---------------------------------------------------------------------------
export type DuelGame = 'escopeta' | 'truco';
export interface DuelState {
  id: string;
  game: DuelGame;
  fromId: string;
  toId: string;
  amount: number;
  status: 'pending' | 'playing' | 'done';
  returnPhase: TurnPhase;
  turn: string;                            // a quién le toca
  data: Record<string, unknown>;           // público
  secret: Record<string, unknown>;         // oculto
  winnerId: string | null;
}

export type CasinoGame = 'ruleta' | 'quiniela' | 'doble' | 'carrera';
export interface CasinoState {
  playerId: string;
  played: boolean;             // ya jugó una vez (una apuesta por visita, salvo doble o nada en curso)
  double: { stake: number; step: number } | null;  // doble o nada en curso
}

export interface RentOfferState {
  payerId: string;
  ownerId: string;
  tileId: number;
  rent: number;
  proposed: boolean;           // el que paga propuso doble o nada; espera al dueño
  accepted: boolean;           // el dueño aceptó: falta que el que paga tire los dados
}

export type ChallengeKind = 'dados' | 'ppt' | 'trivia' | 'terere';
export type PptChoice = 'piedra' | 'papel' | 'tijera';
export interface TriviaQuestion { q: string; options: [string, string, string, string]; answer: number }
export interface ChallengeState {
  id: string;
  kind: ChallengeKind | null;  // null mientras el jugador elige (carta ¡Desafío!)
  fromId: string;
  toId: string | null;
  amount: number;
  status: 'pick' | 'pending' | 'playing' | 'done';
  forced: boolean;             // por carta: el rival no puede rechazar
  returnPhase: TurnPhase;
  data: {
    rolls?: Record<string, [number, number]>;
    lastRolls?: Record<string, [number, number]>;
    round?: number;
    rounds?: { a: PptChoice; b: PptChoice; winner: string | null }[];
    score?: Record<string, number>;
    chosen?: string[];                       // ppt: quiénes ya eligieron esta ronda (sin revelar qué)
    question?: { q: string; options: string[] };
    qIndex?: number;
    answered?: Record<string, number>;       // trivia: respuestas ya dadas en la pregunta actual
    go?: boolean;                            // terere: ya apareció la señal
    winnerId?: string | null;
    reason?: string;
  };
  /** Si el desafío nació de un alquiler a doble o nada, acá va el contexto para resolverlo. */
  rent?: { payerId: string; ownerId: string; tileId: number; rent: number } | null;
  secret: {                                   // nunca se envía a los clientes
    choices?: Record<string, PptChoice>;
    answer?: number;
    used?: number[];
  };
}

export interface AuctionState {
  tileId: number;
  highestBid: number;
  highestBidderId: string | null;
  activeBidders: string[];
  returnToTurnFlow: boolean;   // true: fue una subasta por rechazo; false: por quiebra
  resumePhase?: TurnPhase;     // quiebra de un jugador que no era el actual: fase a la que se vuelve
}

export interface TradeSide { cash: number; properties: number[]; jailCards: number }
export interface TradeState {
  id: string; fromId: string; toId: string; give: TradeSide; receive: TradeSide;
}

export interface DebtState {
  amount: number;
  creditorIds: string[];       // vacío = banco
  reason: string;
  returnPhase: TurnPhase;
}

export interface GameEvent {
  type: string;
  playerId?: string;
  text: string;
  data?: Record<string, unknown>;
}

export interface GameState {
  roomCode: string;
  phase: 'LOBBY' | 'PLAYING' | 'FINISHED';
  settings: GameSettings;
  players: Player[];
  hostId: string;
  currentPlayerIndex: number;
  turnPhase: TurnPhase;
  turnNumber: number;
  dice: [number, number] | null;
  doublesCount: number;
  pendingReroll: boolean;
  properties: Record<number, PropertyState>;
  housesAvailable: number;
  hotelsAvailable: number;
  decks: Record<DeckId, string[]>;
  lastCard: { card: Card; playerId: string } | null;
  auction: AuctionState | null;
  auctionQueue: number[];
  pendingTrade: TradeState | null;
  debt: DebtState | null;
  freeParkingPot: number;
  jackpot: number;
  casino: CasinoState | null;
  rentOffer: RentOfferState | null;
  challenge: ChallengeState | null;
  arena: ArenaState | null;
  activeEvent: ActiveEvent | null;
  eventHistory: GlobalEventId[];
  /** Índices ya usados de cada catálogo (trivia, imágenes, cadenas…) para no repetir en la misma partida. */
  usedContent: Record<string, number[]>;
  roundStarterId: string | null;           // quién abrió la vuelta de mesa actual
  duel: DuelState | null;
  lastLootbox: { playerId: string; prize: string; amount: number; index: number } | null;
  log: GameEvent[];
  seed: number;
  winnerId: string | null;
  startedAt: number | null;
  tradeCounter: number;
}

export type Action =
  | { type: 'START_GAME'; playerId: string }
  | { type: 'ROLL'; playerId: string }
  | { type: 'BUY'; playerId: string }
  | { type: 'DECLINE'; playerId: string }
  | { type: 'BID'; playerId: string; amount: number }
  | { type: 'AUCTION_PASS'; playerId: string }
  | { type: 'BUILD'; playerId: string; tileId: number }
  | { type: 'SELL_BUILDING'; playerId: string; tileId: number }
  | { type: 'MORTGAGE'; playerId: string; tileId: number }
  | { type: 'UNMORTGAGE'; playerId: string; tileId: number }
  | { type: 'JAIL_PAY'; playerId: string }
  | { type: 'JAIL_CARD'; playerId: string }
  | { type: 'TAX_CHOICE'; playerId: string; choice: 'flat' | 'percent' }
  | { type: 'TRADE_PROPOSE'; playerId: string; toPlayerId: string; give: TradeSide; receive: TradeSide }
  | { type: 'TRADE_ACCEPT'; playerId: string; tradeId: string }
  | { type: 'TRADE_REJECT'; playerId: string; tradeId: string }
  | { type: 'TRADE_CANCEL'; playerId: string; tradeId: string }
  | { type: 'PAY_DEBT'; playerId: string }
  | { type: 'DECLARE_BANKRUPTCY'; playerId: string }
  | { type: 'END_TURN'; playerId: string }
  | { type: 'FORCE_END_TURN'; playerId: string }   // servidor: temporizador vencido
  | { type: 'END_GAME'; playerId: string }          // anfitrión / límite de tiempo
  | { type: 'LEAVE_GAME'; playerId: string; targetId: string }            // abandonar (uno mismo) o expulsar (anfitrión)
  | { type: 'SET_BOT'; playerId: string; targetId: string; isBot: boolean } // anfitrión: reemplazar por bot / devolver
  // Casino
  | { type: 'CASINO_PLAY'; playerId: string; game: 'ruleta' | 'quiniela' | 'carrera'; amount: number; pick?: number }
  | { type: 'CASINO_DOUBLE_START'; playerId: string; amount: number }
  | { type: 'CASINO_DOUBLE_CONTINUE'; playerId: string }
  | { type: 'CASINO_CASHOUT'; playerId: string }
  | { type: 'CASINO_LEAVE'; playerId: string }
  // Alquiler a doble o nada
  | { type: 'RENT_PAY'; playerId: string }
  | { type: 'RENT_DON_PROPOSE'; playerId: string }
  | { type: 'RENT_DON_ACCEPT'; playerId: string }
  | { type: 'RENT_DON_REJECT'; playerId: string }
  | { type: 'RENT_DON_ROLL'; playerId: string }
  // Desafíos
  | { type: 'CHALLENGE_PROPOSE'; playerId: string; toId: string; kind: ChallengeKind; amount: number }
  | { type: 'CHALLENGE_ACCEPT'; playerId: string }
  | { type: 'CHALLENGE_REJECT'; playerId: string }
  | { type: 'CHALLENGE_MOVE'; playerId: string; choice?: PptChoice; answer?: number }
  | { type: 'CHALLENGE_GO'; playerId: string }        // solo servidor: señal del tereré
  | { type: 'CHALLENGE_CANCEL'; playerId: string }    // anfitrión/servidor: anula sin pagos
  // Arena
  | { type: 'ARENA_VOTE'; playerId: string; option: number }
  | { type: 'ARENA_START'; playerId: string; now: number }                 // servidor: cierra la votación
  | { type: 'ARENA_MOVE'; playerId: string; now: number; payload: Record<string, unknown> }
  | { type: 'ARENA_TICK'; playerId: string; now: number }                  // servidor: temporizadores / señales
  | { type: 'ARENA_END'; playerId: string }                                // servidor/anfitrión: cierra como esté
  // Duelos mayores
  | { type: 'DUEL_PROPOSE'; playerId: string; toId: string; game: DuelGame; amount: number }
  | { type: 'DUEL_ACCEPT'; playerId: string }
  | { type: 'DUEL_REJECT'; playerId: string }
  | { type: 'DUEL_MOVE'; playerId: string; move: Record<string, unknown> }
  | { type: 'DUEL_CANCEL'; playerId: string };

export class RuleError extends Error {
  constructor(message: string) { super(message); this.name = 'RuleError'; }
}
