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
export interface SpecialTile { id: number; type: 'go' | 'jail' | 'parking' | 'gotojail'; name: string }
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
  | { kind: 'collectEach'; amount: number };

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
}

export interface PropertyState { owner: string | null; houses: number; mortgaged: boolean } // houses 5 = hotel

export type TurnPhase =
  | 'AWAITING_ROLL' | 'AWAITING_BUY' | 'AUCTION' | 'TAX_CHOICE' | 'DEBT' | 'END_TURN';

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
  | { type: 'SET_BOT'; playerId: string; targetId: string; isBot: boolean }; // anfitrión: reemplazar por bot / devolver

export class RuleError extends Error {
  constructor(message: string) { super(message); this.name = 'RuleError'; }
}
