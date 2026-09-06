import { describe, expect, it } from 'vitest';
import { RuleError, applyAction, rematch } from '../src';
import { act, cur, give, makeGame, setPos, withDice } from './helpers';

describe('abandono y reemplazo por bot', () => {
  it('un jugador que no es el actual abandona: sus propiedades se subastan y el turno vuelve a donde estaba', () => {
    let s = makeGame(3);
    const [a, b, c] = s.players.map(p => p.id);
    s = give(s, b, [1, 5]);
    expect(s.turnPhase).toBe('AWAITING_ROLL');
    let r = act(s, { type: 'LEAVE_GAME', playerId: b, targetId: b });
    expect(r.state.players.find(p => p.id === b)!.bankrupt).toBe(true);
    expect(r.state.turnPhase).toBe('AUCTION');
    expect(r.state.auction?.activeBidders).toEqual([a, c]);
    r = act(r.state, { type: 'AUCTION_PASS', playerId: a });
    r = act(r.state, { type: 'AUCTION_PASS', playerId: c });
    expect(r.state.turnPhase).toBe('AUCTION'); // segunda propiedad
    r = act(r.state, { type: 'BID', playerId: c, amount: 20 });
    r = act(r.state, { type: 'AUCTION_PASS', playerId: a });
    expect(r.state.properties[5].owner).toBe(c);
    expect(cur(r.state).id).toBe(a);
    expect(r.state.turnPhase).toBe('AWAITING_ROLL'); // a todavía no tiró
  });

  it('el jugador actual abandona: pasa el turno', () => {
    let s = makeGame(3);
    const [a, b] = s.players.map(p => p.id);
    const r = act(s, { type: 'LEAVE_GAME', playerId: a, targetId: a });
    expect(r.state.players[0].bankrupt).toBe(true);
    expect(cur(r.state).id).toBe(b);
  });

  it('solo el anfitrión puede sacar a otro; el anfitrión puede', () => {
    const s = makeGame(3);
    const [, b, c] = s.players.map(p => p.id);
    expect(() => act(s, { type: 'LEAVE_GAME', playerId: b, targetId: c })).toThrow(RuleError);
    const r = act(s, { type: 'LEAVE_GAME', playerId: s.hostId, targetId: c });
    expect(r.state.players.find(p => p.id === c)!.bankrupt).toBe(true);
  });

  it('abandonar durante una subasta en la que tenía la mejor oferta la reinicia', () => {
    let s = makeGame(3);
    const [a, b, c] = s.players.map(p => p.id);
    s = setPos(s, a, 0);
    s = withDice(s, [1, 2]);
    let r = act(s, { type: 'ROLL', playerId: a });
    r = act(r.state, { type: 'DECLINE', playerId: a });
    r = act(r.state, { type: 'BID', playerId: b, amount: 50 });
    r = act(r.state, { type: 'LEAVE_GAME', playerId: b, targetId: b });
    expect(r.state.turnPhase).toBe('AUCTION');
    expect(r.state.auction?.highestBidderId).toBeNull();
    expect(r.state.auction?.activeBidders).toEqual([a, c]);
    r = act(r.state, { type: 'AUCTION_PASS', playerId: a });
    r = act(r.state, { type: 'AUCTION_PASS', playerId: c });
    expect(r.state.properties[3].owner).toBeNull();
    expect(r.state.turnPhase).toBe('END_TURN');
  });

  it('si queda uno solo, termina la partida', () => {
    const s = makeGame(2);
    const r = act(s, { type: 'LEAVE_GAME', playerId: s.players[1].id, targetId: s.players[1].id });
    expect(r.state.phase).toBe('FINISHED');
    expect(r.state.winnerId).toBe(s.players[0].id);
  });

  it('SET_BOT marca y desmarca', () => {
    const s = makeGame(2);
    const b = s.players[1].id;
    let r = act(s, { type: 'SET_BOT', playerId: s.hostId, targetId: b, isBot: true });
    expect(r.state.players[1].isBot).toBe(true);
    r = act(r.state, { type: 'SET_BOT', playerId: b, targetId: b, isBot: false });
    expect(r.state.players[1].isBot).toBe(false);
    expect(() => act(s, { type: 'SET_BOT', playerId: b, targetId: s.hostId, isBot: true })).toThrow(RuleError);
  });
});

describe('revancha', () => {
  it('crea un lobby nuevo con los mismos jugadores, reglas y efectivo inicial', () => {
    let s = makeGame(3, { freeParkingPot: true, startingCash: 2000 });
    s = give(s, s.players[0].id, [1, 3], 2);
    let r = act(s, { type: 'END_GAME', playerId: s.hostId });
    expect(r.state.phase).toBe('FINISHED');
    const n = rematch(r.state, 7);
    expect(n.phase).toBe('LOBBY');
    expect(n.players.map(p => p.id)).toEqual(s.players.map(p => p.id));
    expect(n.players.every(p => p.cash === 2000 && p.position === 0 && !p.bankrupt)).toBe(true);
    expect(n.settings.freeParkingPot).toBe(true);
    expect(Object.values(n.properties).every(p => p.owner === null && p.houses === 0)).toBe(true);
    expect(n.housesAvailable).toBe(32);
    const started = applyAction(n, { type: 'START_GAME', playerId: n.hostId }).state;
    expect(started.phase).toBe('PLAYING');
  });

  it('no permite revancha si la partida no terminó', () => {
    expect(() => rematch(makeGame(2), 1)).toThrow(RuleError);
  });
});
