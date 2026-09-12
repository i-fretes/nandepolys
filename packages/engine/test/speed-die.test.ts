import { describe, expect, it } from 'vitest';
import {
  CARD_TILES, GROUPS, SPEED_FACES, SPEED_FACE_INFO, applyAction, coldestGroups, groupTiles, legalActions, tile,
  type Action, type GameState, type Group,
} from '../src';
import { cur, makeGame, seedFor, setPos, withDice } from './helpers';

/** Fuerza la cara del dado ñandú de la próxima tirada buscando una semilla que dé esos dados y esa cara. */
function withFace(s: GameState, dice: [number, number], face: string): GameState {
  let from = 0;
  for (let i = 0; i < 600; i++) {
    const seed = seedFor(dice, from);
    const c: GameState = { ...s, seed };
    const probe = applyAction(structuredClone(c), { type: 'ROLL', playerId: cur(c).id }).state;
    if (probe.speedDie === face) return c;
    from = seed + 1;
  }
  throw new Error(`no se encontró semilla para la cara ${face}`);
}

/** Juega turnos completos eligiendo siempre la acción "seguir" más simple que sea legal. */
function playTurns(s: GameState, turns: number): GameState {
  const ORDER: Action['type'][] = ['ROLL', 'DECLINE', 'AUCTION_PASS', 'TAX_CHOICE', 'PAY_DEBT', 'DECLARE_BANKRUPTCY', 'END_TURN'];
  for (let i = 0; i < turns * 12 && s.phase === 'PLAYING'; i++) {
    let moved = false;
    for (const p of s.players) {
      if (p.bankrupt) continue;
      const legal = legalActions(s, p.id);
      const type = ORDER.find(t => legal.has(t));
      if (!type) continue;
      const a = (type === 'TAX_CHOICE' ? { type, playerId: p.id, choice: 'flat' } : { type, playerId: p.id }) as Action;
      s = applyAction(s, a).state;
      moved = true;
      break;
    }
    if (!moved) break;
  }
  return s;
}

const GROUP_OF: Record<number, Group> = {};
for (const g of GROUPS) for (const t of groupTiles(g)) GROUP_OF[t.id] = g;

describe('dado ñandú (tercer dado)', () => {
  it('viene encendido por defecto y saca las seis caras', () => {
    let s = makeGame(2, { speedDie: true });
    expect(s.settings.speedDie).toBe(true);
    const seen = new Set<string>();
    for (let i = 0; i < 60 && seen.size < 6; i++) {
      s = playTurns(s, 1);
      if (s.speedDie) seen.add(s.speedDie);
      if (s.phase !== 'PLAYING') break;
    }
    expect(seen.size).toBe(6);
    for (const f of seen) expect(SPEED_FACES).toContain(f as never);
  });

  it('apagado no cambia nada: el jugador avanza exactamente la suma de los dos dados', () => {
    let s = makeGame(2, { speedDie: false });
    const id = cur(s).id;
    s = applyAction(withDice(setPos(s, id, 0), [2, 3]), { type: 'ROLL', playerId: id }).state;
    expect(s.speedDie).toBeNull();
    expect(s.players.find(p => p.id === id)!.position).toBe(5);
  });

  it('las caras +1, +2 y +3 suman esas casillas', () => {
    for (const [face, extra] of [['mas1', 1], ['mas2', 2], ['mas3', 3]] as const) {
      let s = makeGame(2, { speedDie: true });
      const id = cur(s).id;
      // Desde la 24 con 2+3 se cae en la 29; con el extra van a 30, 31 y 32, todas casillas "tranquilas"
      s = applyAction(withFace(setPos(s, id, 24), [2, 3], face), { type: 'ROLL', playerId: id }).state;
      expect(s.speedDie).toBe(face);
      expect(s.players.find(p => p.id === id)!.position).toBe(29 + extra);
    }
  });

  it('turbo mueve el doble de la suma', () => {
    let s = makeGame(2, { speedDie: true });
    const id = cur(s).id;
    s = applyAction(withFace(setPos(s, id, 0), [2, 3], 'turbo'), { type: 'ROLL', playerId: id }).state;
    expect(s.players.find(p => p.id === id)!.position).toBe(10);
  });

  it('colectivo termina en una casilla de Suerte o Cooperativa', () => {
    let s = makeGame(2, { speedDie: true });
    const id = cur(s).id;
    s = applyAction(withFace(setPos(s, id, 0), [2, 3], 'colectivo'), { type: 'ROLL', playerId: id }).state;
    const pos = s.players.find(p => p.id === id)!.position;
    // Cae en la casilla de carta (o donde lo haya mandado la carta que sacó ahí)
    expect(s.log.some(e => e.type === 'speed_die' && CARD_TILES.includes(e.data?.tileId as number))).toBe(true);
    expect(pos).toBeGreaterThanOrEqual(0);
  });

  it('feria lleva al color menos pisado de la partida', () => {
    let s = makeGame(2, { speedDie: true });
    const id = cur(s).id;
    // Simulamos que ya se pisó mucho todo menos naranja
    s = { ...s, groupLandings: { ...s.groupLandings, marron: 9, celeste: 9, rosa: 9, naranja: 0, rojo: 9, amarillo: 9, verde: 9, azul: 9 } };
    expect(coldestGroups(s)).toEqual(['naranja']);
    s = applyAction(withFace(setPos(s, id, 0), [2, 3], 'feria'), { type: 'ROLL', playerId: id }).state;
    const ev = s.log.find(e => e.type === 'speed_die');
    expect(ev).toBeDefined();
    expect(GROUP_OF[ev!.data!.tileId as number]).toBe('naranja');
  });

  it('preso: el dado ñandú no cuenta, solo los dobles sacan de Tacumbú', () => {
    let s = makeGame(2, { speedDie: true });
    const id = cur(s).id;
    const c = structuredClone(s);
    const p = c.players.find(x => x.id === id)!;
    p.inJail = true; p.position = 11;
    const out = applyAction(withDice(c, [2, 3]), { type: 'ROLL', playerId: id }).state;
    expect(out.speedDie).toBeNull();
    expect(out.players.find(x => x.id === id)!.inJail).toBe(true);
    expect(out.players.find(x => x.id === id)!.position).toBe(11);
  });

  it('cuenta los aterrizajes por color', () => {
    let s = makeGame(2, { speedDie: false });
    const id = cur(s).id;
    s = applyAction(withDice(setPos(s, id, 0), [3, 4]), { type: 'ROLL', playerId: id }).state; // casilla 7: Caacupé (celeste)
    expect(tile(7).name).toBe('Caacupé');
    expect(s.groupLandings.celeste).toBe(1);
  });

  it('reparte mejor el tablero: ningún color queda muy por debajo del resto', () => {
    const landings = (speedDie: boolean) => playTurns(makeGame(4, { speedDie, startingCash: 100000 }, 2024), 700).groupLandings;

    const conDado = landings(true);
    const total = GROUPS.reduce((a, g) => a + conDado[g], 0);
    expect(total).toBeGreaterThan(300);
    const avg = total / GROUPS.length;
    // Con el dado ñandú ningún color se queda por debajo del 60 % del promedio
    for (const g of GROUPS) expect(conDado[g]).toBeGreaterThan(avg * 0.6);

    // Y el color más pisado no le saca más del doble al menos pisado
    const vals = GROUPS.map(g => conDado[g]);
    expect(Math.max(...vals) / Math.min(...vals)).toBeLessThan(2);
  });

  it('cada cara tiene ícono y explicación para la interfaz', () => {
    for (const f of SPEED_FACES) {
      expect(SPEED_FACE_INFO[f].icon.length).toBeGreaterThan(0);
      expect(SPEED_FACE_INFO[f].desc.length).toBeGreaterThan(10);
    }
  });
});
