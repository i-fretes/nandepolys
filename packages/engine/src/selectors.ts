import { BOARD, groupTiles, isProperty, tile } from './board';
import type { GameState, Player, PropertyTile, StreetTile, Group } from './types';

export function player(state: GameState, id: string): Player {
  const p = state.players.find(p => p.id === id);
  if (!p) throw new Error(`Jugador inexistente: ${id}`);
  return p;
}

export function currentPlayer(state: GameState): Player {
  return state.players[state.currentPlayerIndex];
}

export function activePlayers(state: GameState): Player[] {
  return state.players.filter(p => !p.bankrupt);
}

export function ownerOf(state: GameState, tileId: number): string | null {
  return state.properties[tileId]?.owner ?? null;
}

export function propertiesOf(state: GameState, playerId: string): PropertyTile[] {
  return BOARD.filter(isProperty).filter(t => state.properties[t.id]?.owner === playerId);
}

export function ownsFullGroup(state: GameState, playerId: string, group: Group): boolean {
  return groupTiles(group).every(t => state.properties[t.id]?.owner === playerId);
}

export function countTransports(state: GameState, playerId: string): number {
  return BOARD.filter(t => t.type === 'transport' && state.properties[t.id]?.owner === playerId).length;
}

export function countUtilities(state: GameState, playerId: string): number {
  return BOARD.filter(t => t.type === 'utility' && state.properties[t.id]?.owner === playerId).length;
}

/** Alquiler que debe pagarse al caer en tileId (sin multiplicadores de cartas). */
export function rentFor(state: GameState, tileId: number, diceSum: number): number {
  const t = tile(tileId);
  const ps = state.properties[tileId];
  if (!isProperty(t) || !ps?.owner || ps.mortgaged) return 0;
  if (t.type === 'street') {
    if (ps.houses > 0) return t.rents[ps.houses];
    return ownsFullGroup(state, ps.owner, t.group) ? t.rents[0] * 2 : t.rents[0];
  }
  if (t.type === 'transport') {
    const n = countTransports(state, ps.owner);
    return 25 * Math.pow(2, n - 1);
  }
  const n = countUtilities(state, ps.owner);
  return diceSum * (n >= 2 ? 10 : 4);
}

/** Patrimonio: efectivo + propiedades (hipotecadas a la mitad) + edificios al costo. */
export function netWorth(state: GameState, playerId: string): number {
  const p = player(state, playerId);
  let total = p.cash;
  for (const t of propertiesOf(state, playerId)) {
    const ps = state.properties[t.id];
    total += ps.mortgaged ? Math.floor(t.price / 2) : t.price;
    if (t.type === 'street') total += ps.houses * t.houseCost;
  }
  return total;
}

/** Máximo efectivo que un jugador puede reunir vendiendo edificios e hipotecando. */
export function liquidationValue(state: GameState, playerId: string): number {
  const p = player(state, playerId);
  let total = p.cash;
  for (const t of propertiesOf(state, playerId)) {
    const ps = state.properties[t.id];
    if (t.type === 'street') total += Math.floor((ps.houses * t.houseCost) / 2);
    if (!ps.mortgaged) total += Math.floor(t.price / 2);
  }
  return total;
}

export function buildingsOf(state: GameState, playerId: string): { houses: number; hotels: number } {
  let houses = 0, hotels = 0;
  for (const t of propertiesOf(state, playerId)) {
    const h = state.properties[t.id].houses;
    if (h === 5) hotels++; else houses += h;
  }
  return { houses, hotels };
}

/** ¿Puede construir una casa/hotel en esta calle? Devuelve el motivo si no. */
export function canBuild(state: GameState, playerId: string, tileId: number): string | null {
  const t = tile(tileId);
  if (t.type !== 'street') return 'Solo se puede construir en solares.';
  const ps = state.properties[tileId];
  if (ps.owner !== playerId) return 'No es tu propiedad.';
  if (!ownsFullGroup(state, playerId, t.group)) return 'Necesitás todo el grupo de color.';
  const group = groupTiles(t.group);
  if (group.some(g => state.properties[g.id].mortgaged)) return 'Hay una propiedad hipotecada en el grupo.';
  if (ps.houses >= 5) return 'Ya tiene hotel.';
  const minHouses = Math.min(...group.map(g => state.properties[g.id].houses));
  if (ps.houses > minHouses) return 'Construcción pareja: construí primero en las otras del grupo.';
  if (ps.houses === 4) {
    if (state.hotelsAvailable <= 0) return 'El banco no tiene hoteles.';
  } else if (state.housesAvailable <= 0) return 'El banco no tiene casas.';
  if (player(state, playerId).cash < t.houseCost) return 'No tenés efectivo suficiente.';
  return null;
}

export function canSellBuilding(state: GameState, playerId: string, tileId: number): string | null {
  const t = tile(tileId);
  if (t.type !== 'street') return 'No es un solar.';
  const ps = state.properties[tileId];
  if (ps.owner !== playerId) return 'No es tu propiedad.';
  if (ps.houses === 0) return 'No hay edificios.';
  const group = groupTiles(t.group);
  const maxHouses = Math.max(...group.map(g => state.properties[g.id].houses));
  if (ps.houses < maxHouses) return 'Venta pareja: vendé primero en las otras del grupo.';
  if (ps.houses === 5 && state.housesAvailable < 4) return 'El banco no tiene 4 casas para reemplazar el hotel.';
  return null;
}

export function canMortgage(state: GameState, playerId: string, tileId: number): string | null {
  const t = tile(tileId);
  if (!isProperty(t)) return 'No es una propiedad.';
  const ps = state.properties[tileId];
  if (ps.owner !== playerId) return 'No es tu propiedad.';
  if (ps.mortgaged) return 'Ya está hipotecada.';
  if (t.type === 'street') {
    const group = groupTiles(t.group);
    if (group.some(g => state.properties[g.id].houses > 0)) return 'Vendé los edificios del grupo antes de hipotecar.';
  }
  return null;
}

export function canUnmortgage(state: GameState, playerId: string, tileId: number): string | null {
  const t = tile(tileId);
  if (!isProperty(t)) return 'No es una propiedad.';
  const ps = state.properties[tileId];
  if (ps.owner !== playerId) return 'No es tu propiedad.';
  if (!ps.mortgaged) return 'No está hipotecada.';
  if (player(state, playerId).cash < unmortgageCost(t)) return 'No tenés efectivo suficiente.';
  return null;
}

export function mortgageValue(t: PropertyTile): number { return Math.floor(t.price / 2); }
export function unmortgageCost(t: PropertyTile): number {
  const v = mortgageValue(t);
  return v + Math.ceil(v * 0.1);
}

export function streetsOf(state: GameState, playerId: string): StreetTile[] {
  return propertiesOf(state, playerId).filter((t): t is StreetTile => t.type === 'street');
}

export function ranking(state: GameState): { playerId: string; netWorth: number }[] {
  return state.players
    .map(p => ({ playerId: p.id, netWorth: p.bankrupt ? -1 : netWorth(state, p.id) }))
    .sort((a, b) => b.netWorth - a.netWorth);
}

/** Estado visible para los clientes: sin el orden de los mazos ni la semilla del RNG. */
export type ClientState = Omit<GameState, 'decks' | 'seed'> & { deckCounts: Record<'chance' | 'community', number> };

export function toClientState(s: GameState): ClientState {
  const { decks, seed: _seed, ...rest } = s;
  return { ...rest, deckCounts: { chance: decks.chance.length, community: decks.community.length } };
}
