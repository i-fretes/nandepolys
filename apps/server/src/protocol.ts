import { z } from 'zod';

// Mensajes cliente → servidor validados con Zod antes de tocar el estado.

export const TokenSchema = z.enum(['mate', 'chipa', 'nanduti', 'carreta', 'jaguarete', 'arpa']);

export const SettingsSchema = z.object({
  startingCash: z.number().int().min(500).max(5000).optional(),
  auctions: z.boolean().optional(),
  freeParkingPot: z.boolean().optional(),
  doubleGoSalary: z.boolean().optional(),
  noBuyFirstLap: z.boolean().optional(),
  turnTimerSeconds: z.number().int().min(0).max(600).optional(),
  timeLimitMinutes: z.number().int().min(0).max(600).optional(),
  casino: z.boolean().optional(),
  casinoMaxBet: z.number().int().min(50).max(5000).optional(),
  jackpot: z.boolean().optional(),
  rentDoubleOrNothing: z.boolean().optional(),
  challenges: z.boolean().optional(),
}).strict();

export const CreateRoomSchema = z.object({
  name: z.string().min(1).max(20),
  token: TokenSchema,
  settings: SettingsSchema.optional(),
});

export const JoinRoomSchema = z.object({
  roomCode: z.string().min(4).max(8),
  name: z.string().min(1).max(20),
  token: TokenSchema,
});

export const RejoinSchema = z.object({
  roomCode: z.string().min(4).max(8),
  playerToken: z.string().min(8).max(64),
});

export const TradeSideSchema = z.object({
  cash: z.number().int().min(0),
  properties: z.array(z.number().int().min(0).max(39)).max(28),
  jailCards: z.number().int().min(0).max(2),
});

const tileId = z.number().int().min(0).max(39);

export const ActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ROLL') }),
  z.object({ type: z.literal('BUY') }),
  z.object({ type: z.literal('DECLINE') }),
  z.object({ type: z.literal('BID'), amount: z.number().int().min(1).max(100000) }),
  z.object({ type: z.literal('AUCTION_PASS') }),
  z.object({ type: z.literal('BUILD'), tileId }),
  z.object({ type: z.literal('SELL_BUILDING'), tileId }),
  z.object({ type: z.literal('MORTGAGE'), tileId }),
  z.object({ type: z.literal('UNMORTGAGE'), tileId }),
  z.object({ type: z.literal('JAIL_PAY') }),
  z.object({ type: z.literal('JAIL_CARD') }),
  z.object({ type: z.literal('TAX_CHOICE'), choice: z.enum(['flat', 'percent']) }),
  z.object({ type: z.literal('TRADE_PROPOSE'), toPlayerId: z.string(), give: TradeSideSchema, receive: TradeSideSchema }),
  z.object({ type: z.literal('TRADE_ACCEPT'), tradeId: z.string() }),
  z.object({ type: z.literal('TRADE_REJECT'), tradeId: z.string() }),
  z.object({ type: z.literal('TRADE_CANCEL'), tradeId: z.string() }),
  z.object({ type: z.literal('PAY_DEBT') }),
  z.object({ type: z.literal('DECLARE_BANKRUPTCY') }),
  z.object({ type: z.literal('END_TURN') }),
  z.object({ type: z.literal('END_GAME') }),
  z.object({ type: z.literal('START_GAME') }),
  z.object({ type: z.literal('LEAVE_GAME'), targetId: z.string().optional() }),
  z.object({ type: z.literal('SET_BOT'), targetId: z.string(), isBot: z.boolean() }),
  z.object({ type: z.literal('CASINO_PLAY'), game: z.enum(['ruleta', 'quiniela', 'carrera']), amount: z.number().int().min(1).max(100000), pick: z.number().int().min(0).max(12).optional() }),
  z.object({ type: z.literal('CASINO_DOUBLE_START'), amount: z.number().int().min(1).max(100000) }),
  z.object({ type: z.literal('CASINO_DOUBLE_CONTINUE') }),
  z.object({ type: z.literal('CASINO_CASHOUT') }),
  z.object({ type: z.literal('CASINO_LEAVE') }),
  z.object({ type: z.literal('RENT_PAY') }),
  z.object({ type: z.literal('RENT_DON_PROPOSE') }),
  z.object({ type: z.literal('RENT_DON_ACCEPT') }),
  z.object({ type: z.literal('RENT_DON_REJECT') }),
  z.object({ type: z.literal('CHALLENGE_PROPOSE'), toId: z.string(), kind: z.enum(['dados', 'ppt', 'trivia', 'terere']), amount: z.number().int().min(0).max(100000) }),
  z.object({ type: z.literal('CHALLENGE_ACCEPT') }),
  z.object({ type: z.literal('CHALLENGE_REJECT') }),
  z.object({ type: z.literal('CHALLENGE_MOVE'), choice: z.enum(['piedra', 'papel', 'tijera']).optional(), answer: z.number().int().min(0).max(3).optional() }),
  z.object({ type: z.literal('CHALLENGE_CANCEL') }),
]);

export const ChatSchema = z.object({ text: z.string().min(1).max(300) });

export type ClientAction = z.infer<typeof ActionSchema>;
