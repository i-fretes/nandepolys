import type { Tile, Group, StreetTile, PropertyTile } from './types';

const street = (
  id: number, name: string, group: Group, price: number,
  rents: [number, number, number, number, number, number], houseCost: number,
): StreetTile => ({ id, type: 'street', name, group, price, rents, houseCost });

export const BOARD: Tile[] = [
  { id: 0, type: 'go', name: 'Salida' },
  street(1, 'Villa Hayes', 'marron', 60, [2, 10, 30, 90, 160, 250], 50),
  { id: 2, type: 'community', name: 'Cooperativa' },
  street(3, 'Mariano Roque Alonso', 'marron', 60, [4, 20, 60, 180, 320, 450], 50),
  { id: 4, type: 'tax', name: 'Impuesto a la Renta (SET)', amount: 200, percent: 10 },
  { id: 5, type: 'transport', name: 'Terminal de Ómnibus', price: 200 },
  { id: 6, type: 'arena', name: 'La Arena' },
  street(7, 'Caacupé', 'celeste', 100, [6, 30, 90, 270, 400, 550], 50),
  { id: 8, type: 'chance', name: 'Suerte' },
  street(9, 'Paraguarí', 'celeste', 100, [6, 30, 90, 270, 400, 550], 50),
  street(10, 'Villarrica', 'celeste', 120, [8, 40, 100, 300, 450, 600], 50),
  { id: 11, type: 'jail', name: 'Tacumbú' },
  street(12, 'Coronel Oviedo', 'rosa', 140, [10, 50, 150, 450, 625, 750], 100),
  { id: 13, type: 'utility', name: 'ANDE', price: 150 },
  street(14, 'Concepción', 'rosa', 140, [10, 50, 150, 450, 625, 750], 100),
  street(15, 'Pilar', 'rosa', 160, [12, 60, 180, 500, 700, 900], 100),
  { id: 16, type: 'transport', name: 'Aeropuerto Silvio Pettirossi', price: 200 },
  { id: 17, type: 'casino', name: 'Casino' },
  street(18, 'Luque', 'naranja', 180, [14, 70, 200, 550, 750, 950], 100),
  { id: 19, type: 'community', name: 'Cooperativa' },
  street(20, 'San Lorenzo', 'naranja', 180, [14, 70, 200, 550, 750, 950], 100),
  street(21, 'Fernando de la Mora', 'naranja', 200, [16, 80, 220, 600, 800, 1000], 100),
  { id: 22, type: 'parking', name: 'Estacionamiento Libre' },
  street(23, 'Encarnación', 'rojo', 220, [18, 90, 250, 700, 875, 1050], 150),
  { id: 24, type: 'chance', name: 'Suerte' },
  street(25, 'Pedro Juan Caballero', 'rojo', 220, [18, 90, 250, 700, 875, 1050], 150),
  street(26, 'Ciudad del Este', 'rojo', 240, [20, 100, 300, 750, 925, 1100], 150),
  { id: 27, type: 'transport', name: 'Puerto de Asunción', price: 200 },
  { id: 28, type: 'arena', name: 'La Arena' },
  street(29, 'Av. Mariscal López', 'amarillo', 260, [22, 110, 330, 800, 975, 1150], 150),
  street(30, 'Av. España', 'amarillo', 260, [22, 110, 330, 800, 975, 1150], 150),
  { id: 31, type: 'utility', name: 'ESSAP', price: 150 },
  street(32, 'Av. Aviadores del Chaco', 'amarillo', 280, [24, 120, 360, 850, 1025, 1200], 150),
  { id: 33, type: 'gotojail', name: 'Vaya a Tacumbú' },
  street(34, 'Villa Morra', 'verde', 300, [26, 130, 390, 900, 1100, 1275], 200),
  street(35, 'Las Carmelitas', 'verde', 300, [26, 130, 390, 900, 1100, 1275], 200),
  { id: 36, type: 'community', name: 'Cooperativa' },
  street(37, 'Mburucuyá', 'verde', 320, [28, 150, 450, 1000, 1200, 1400], 200),
  { id: 38, type: 'transport', name: 'Puente de la Amistad', price: 200 },
  { id: 39, type: 'casino', name: 'Casino' },
  { id: 40, type: 'chance', name: 'Suerte' },
  street(41, 'Costanera de Asunción', 'azul', 350, [35, 175, 500, 1100, 1300, 1500], 200),
  { id: 42, type: 'tax', name: 'Impuesto al lujo', amount: 100 },
  street(43, 'Palacio de López', 'azul', 400, [50, 200, 600, 1400, 1700, 2000], 200),
];

export const BOARD_SIZE = 44;
export const SIDE_LEN = 10;            // casillas entre esquinas
export const GO_SALARY = 200;
export const JAIL_TILE = 11;
export const GO_TO_JAIL_TILE = 33;
export const PARKING_TILE = 22;
export const CASINO_TILES = [17, 39];
export const ARENA_TILES = [6, 28];
export const PALACIO_TILE = 43;
export const JAIL_FINE = 50;
export const TOTAL_HOUSES = 32;
export const TOTAL_HOTELS = 12;

export const GROUPS: Group[] = ['marron', 'celeste', 'rosa', 'naranja', 'rojo', 'amarillo', 'verde', 'azul'];

/** Casillas que reparten cartas (Suerte y Cooperativa): destino de la cara "colectivo". */
export const CARD_TILES = [2, 8, 19, 24, 36, 40];

/** Primera casilla de la lista que aparece avanzando desde `from` (sin contar `from`). */
export function nextTileForward(from: number, targets: number[]): number {
  for (let i = 1; i <= BOARD_SIZE; i++) {
    const t = (from + i) % BOARD_SIZE;
    if (targets.includes(t)) return t;
  }
  return from;
}

export const GROUP_COLORS: Record<Group, string> = {
  marron: '#8B4513', celeste: '#6EC1E4', rosa: '#E75480', naranja: '#F7941D',
  rojo: '#D62828', amarillo: '#F4D03F', verde: '#2E8B57', azul: '#1F4E9A',
};

export const GROUP_NAMES: Record<Group, string> = {
  marron: 'Marrón', celeste: 'Celeste', rosa: 'Rosa', naranja: 'Naranja',
  rojo: 'Rojo', amarillo: 'Amarillo', verde: 'Verde', azul: 'Azul',
};

export const TOKENS: { id: string; label: string; emoji: string }[] = [
  { id: 'mate', label: 'Guampa y bombilla', emoji: '🧉' },
  { id: 'chipa', label: 'Chipa', emoji: '🥯' },
  { id: 'nanduti', label: 'Ñandutí', emoji: '🕸️' },
  { id: 'carreta', label: 'Carreta', emoji: '🛺' },
  { id: 'jaguarete', label: 'Jaguareté', emoji: '🐆' },
  { id: 'arpa', label: 'Arpa paraguaya', emoji: '🎼' },
];

export const PLAYER_COLORS = ['#D62828', '#1F4E9A', '#2E8B57', '#F7941D', '#8E44AD', '#00A6A6'];

export function isProperty(t: Tile): t is PropertyTile {
  return t.type === 'street' || t.type === 'transport' || t.type === 'utility';
}

export const PROPERTY_IDS = BOARD.filter(isProperty).map(t => t.id);

export function groupTiles(group: Group): StreetTile[] {
  return BOARD.filter((t): t is StreetTile => t.type === 'street' && t.group === group);
}

export function tile(id: number): Tile {
  const t = BOARD[id];
  if (!t) throw new Error(`Casilla inválida: ${id}`);
  return t;
}
