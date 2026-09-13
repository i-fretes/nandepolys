import { describe, it, expect } from 'vitest';
import { RAYO_PICK_MS, RAYO_REVEAL_MS, RAYO_ALL_PICKED_MS, applyAction, toClientState, type GameState } from '../src';
import { makeGame, seedFor } from './helpers';

/**
 * "Esquivá el rayo": lo importante es que dé tiempo a elegir. La ronda tiene su ventana de elección
 * y los rayos se muestran aparte; la ventana siguiente arranca recién cuando se apagan.
 */
function openRayo(): { s: GameState; ids: string[] } {
  let s = makeGame(3, { arena: true }, seedFor([1, 2]));
  const me = s.players[s.currentPlayerIndex].id;
  s.players.find(p => p.id === me)!.position = 3;
  s = applyAction(s, { type: 'ROLL', playerId: me }).state;     // → casilla 6: La Arena
  const ids = s.arena!.players;
  s.arena!.options[0] = 'rayo';
  for (const id of ids) s = applyAction(s, { type: 'ARENA_VOTE', playerId: id, option: 0 }).state;
  s = applyAction(s, { type: 'ARENA_START', playerId: 'server', now: 1000 }).state;
  return { s, ids };
}
const tick = (s: GameState, now: number) => applyAction(s, { type: 'ARENA_TICK', playerId: 'server', now }).state;
const pick = (s: GameState, id: string, cell: number, now: number) => applyAction(s, { type: 'ARENA_MOVE', playerId: id, now, payload: { cell } }).state;

describe('Esquivá el rayo', () => {
  it('la ronda da su tiempo completo para elegir y se puede cambiar de casilla', () => {
    const { s: s0, ids } = openRayo();
    const start = s0.arena!.startedAt!;
    expect(s0.arena!.data.phase).toBe('pick');
    expect(s0.arena!.data.pickUntil).toBe(start + RAYO_PICK_MS);

    let s = pick(s0, ids[0], 0, start + 200);
    expect((s.arena!.data.picks as Record<string, number>)[ids[0]]).toBe(0);
    s = pick(s, ids[0], 5, start + 1200);                        // cambia de idea: vale
    expect((s.arena!.data.picks as Record<string, number>)[ids[0]]).toBe(5);

    // mientras no se cumpla la ventana, la ronda sigue abierta
    s = tick(s, start + RAYO_PICK_MS - 100);
    expect(s.arena!.data.phase).toBe('pick');
  });

  it('si eligen todos se acelera, pero deja un momento para arrepentirse', () => {
    const { s: s0, ids } = openRayo();
    const start = s0.arena!.startedAt!;
    let s = s0;
    ids.forEach((id, i) => { s = pick(s, id, i % 9, start + 300); });
    expect(s.arena!.data.pickUntil).toBe(start + 300 + RAYO_ALL_PICKED_MS);
    expect(s.arena!.data.phase).toBe('pick');                    // todavía no se resolvió
    s = pick(s, ids[0], 8, start + 900);                         // aún se puede cambiar
    expect((s.arena!.data.picks as Record<string, number>)[ids[0]]).toBe(8);
  });

  it('los rayos quedan a la vista y la ronda siguiente arranca recién cuando se apagan', () => {
    const { s: s0, ids } = openRayo();
    const start = s0.arena!.startedAt!;
    let s = s0;
    ids.forEach((id, i) => { s = pick(s, id, i, start + 200); });
    const resolveAt = start + 200 + RAYO_ALL_PICKED_MS;
    s = tick(s, resolveAt);
    expect(s.arena!.data.phase).toBe('reveal');
    expect((s.arena!.data.hits as number[]).length).toBeGreaterThan(0);
    expect(s.arena!.round).toBe(1);                              // la ronda no avanza durante el destape
    const vivo = s.arena!.alive[0] ?? ids[0];
    expect(() => pick(s, vivo, 1, resolveAt + 100)).toThrow(/próxima ronda|eliminado/);

    s = tick(s, resolveAt + RAYO_REVEAL_MS - 100);               // todavía se ven los rayos
    expect(s.arena!.data.phase).toBe('reveal');

    s = tick(s, resolveAt + RAYO_REVEAL_MS);
    if (s.arena) {
      expect(s.arena.data.phase).toBe('pick');
      expect(s.arena.round).toBe(2);
      expect(s.arena.data.hits).toBeNull();
      // la ventana nueva empieza entera, no arrastra el tiempo del destape
      expect(s.arena.data.pickUntil).toBe(resolveAt + RAYO_REVEAL_MS + RAYO_PICK_MS);
    }
  });

  it('mientras se elige, nadie ve la casilla de los demás (sólo que ya eligieron)', () => {
    const { s: s0, ids } = openRayo();
    const start = s0.arena!.startedAt!;
    let s = s0;
    s = pick(s, ids[0], 4, start + 100);
    s = pick(s, ids[1], 7, start + 150);
    const view = toClientState(s, ids[0]);
    const picks = view.arena!.data.picks as Record<string, number>;
    expect(picks[ids[0]]).toBe(4);
    expect(picks[ids[1]]).toBeUndefined();
    expect(view.arena!.data.picked).toEqual(expect.arrayContaining([ids[0], ids[1]]));
  });

  it('al que no elige lo para el azar, pero nunca antes de que termine su tiempo', () => {
    const { s: s0, ids } = openRayo();
    const start = s0.arena!.startedAt!;
    let s = pick(s0, ids[0], 0, start + 100);
    s = tick(s, start + RAYO_PICK_MS - 1);
    expect(s.arena!.data.phase).toBe('pick');
    s = tick(s, start + RAYO_PICK_MS);
    expect(s.arena!.data.phase).toBe('reveal');
    const last = s.arena!.data.lastPicks as Record<string, number>;
    for (const id of ids) expect(typeof last[id]).toBe('number');
  });
});
