import { describe, expect, it } from 'vitest';
import { BOARD, CHANCE_CARDS, COMMUNITY_CARDS, GROUP_NAMES, groupTiles, isProperty, type Group } from '../src';

describe('tablero', () => {
  it('tiene 44 casillas con ids consecutivos', () => {
    expect(BOARD).toHaveLength(44);
    BOARD.forEach((t, i) => expect(t.id).toBe(i));
  });

  it('tiene 28 propiedades: 22 solares, 4 transportes, 2 servicios', () => {
    const props = BOARD.filter(isProperty);
    expect(props).toHaveLength(28);
    expect(props.filter(p => p.type === 'street')).toHaveLength(22);
    expect(props.filter(p => p.type === 'transport')).toHaveLength(4);
    expect(props.filter(p => p.type === 'utility')).toHaveLength(2);
  });

  it('grupos: marrón y azul con 2 solares, el resto con 3', () => {
    for (const g of Object.keys(GROUP_NAMES) as Group[]) {
      expect(groupTiles(g)).toHaveLength(g === 'marron' || g === 'azul' ? 2 : 3);
    }
  });

  it('casillas especiales en su lugar', () => {
    expect(BOARD[0].type).toBe('go');
    expect(BOARD[11].type).toBe('jail');
    expect(BOARD[22].type).toBe('parking');
    expect(BOARD[33].type).toBe('gotojail');
    expect(BOARD.filter(t => t.type === 'chance').map(t => t.id)).toEqual([8, 24, 40]);
    expect(BOARD.filter(t => t.type === 'community').map(t => t.id)).toEqual([2, 19, 36]);
    expect(BOARD.filter(t => t.type === 'tax').map(t => t.id)).toEqual([4, 42]);
    expect(BOARD.filter(t => t.type === 'casino').map(t => t.id)).toEqual([17, 39]);
    expect(BOARD.filter(t => t.type === 'arena').map(t => t.id)).toEqual([6, 28]);
  });

  it('alquileres crecientes y hipoteca = mitad del precio', () => {
    for (const t of BOARD) {
      if (t.type !== 'street') continue;
      for (let i = 1; i < 6; i++) expect(t.rents[i]).toBeGreaterThan(t.rents[i - 1]);
      expect(t.price % 2).toBe(0);
    }
  });
});

describe('cartas', () => {
  it('16 de Suerte y 16 de Cooperativa, ids únicos', () => {
    expect(CHANCE_CARDS).toHaveLength(16);
    expect(COMMUNITY_CARDS).toHaveLength(16);
    const ids = new Set([...CHANCE_CARDS, ...COMMUNITY_CARDS].map(c => c.id));
    expect(ids.size).toBe(32);
  });

  it('cada mazo tiene exactamente una carta de salir de la cárcel y una de ir a la cárcel', () => {
    for (const deck of [CHANCE_CARDS, COMMUNITY_CARDS]) {
      expect(deck.filter(c => c.effect.kind === 'jailFree')).toHaveLength(1);
      expect(deck.filter(c => c.effect.kind === 'goToJail')).toHaveLength(1);
    }
  });
});
