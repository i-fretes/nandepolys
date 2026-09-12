import { addPlayer, applyAction, createGame, rollDice, type Action, type GameState, type GameSettings, type TokenId } from '../src';

const TOKENS: TokenId[] = ['mate', 'chipa', 'nanduti', 'carreta', 'jaguarete', 'arpa'];

export function makeGame(n = 2, settings: Partial<GameSettings> = {}, seed = 42): GameState {
  let s = createGame('TEST', 'p1', seed, settings);
  for (let i = 1; i <= n; i++) {
    s = addPlayer(s, { id: `p${i}`, name: `Jugador ${i}`, token: TOKENS[i - 1], color: '#000' });
  }
  s = applyAction(s, { type: 'START_GAME', playerId: 'p1' }).state;
  return s;
}

/** Busca una semilla que produzca exactamente los dados pedidos en la próxima tirada. */
export function seedFor(dice: [number, number], from = 0): number {
  for (let seed = from; seed < from + 200000; seed++) {
    const r = rollDice(seed);
    if (r.dice[0] === dice[0] && r.dice[1] === dice[1]) return seed;
  }
  throw new Error('no seed');
}

export function withDice(s: GameState, dice: [number, number]): GameState {
  return { ...s, seed: seedFor(dice) };
}

export function act(s: GameState, a: Action) {
  return applyAction(s, a);
}

export function cur(s: GameState) {
  return s.players[s.currentPlayerIndex];
}

export function setPos(s: GameState, playerId: string, pos: number): GameState {
  const c = structuredClone(s);
  c.players.find(p => p.id === playerId)!.position = pos;
  return c;
}

export function give(s: GameState, playerId: string, tileIds: number[], houses = 0): GameState {
  const c = structuredClone(s);
  for (const id of tileIds) {
    c.properties[id] = { owner: playerId, houses, mortgaged: false };
    if (houses === 5) c.hotelsAvailable--; else c.housesAvailable -= houses;
  }
  return c;
}

export function setCash(s: GameState, playerId: string, cash: number): GameState {
  const c = structuredClone(s);
  c.players.find(p => p.id === playerId)!.cash = cash;
  return c;
}
