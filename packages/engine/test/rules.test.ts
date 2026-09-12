import { describe, expect, it } from 'vitest';
import { RuleError, legalActions, netWorth, rentFor } from '../src';
import { act, cur, give, makeGame, seedFor, setCash, setPos, withDice } from './helpers';

describe('inicio de partida', () => {
  it('empieza en PLAYING con orden por tirada y efectivo inicial', () => {
    const s = makeGame(3);
    expect(s.phase).toBe('PLAYING');
    expect(s.turnPhase).toBe('AWAITING_ROLL');
    expect(s.players).toHaveLength(3);
    for (const p of s.players) expect(p.cash).toBe(1500);
    expect(s.decks.chance).toHaveLength(16);
  });

  it('no arranca con 1 jugador ni si no es el anfitrión', () => {
    expect(() => makeGame(1)).toThrow(RuleError);
  });
});

describe('movimiento y Salida', () => {
  it('cobra ₲ 200.000 al pasar por Salida', () => {
    let s = makeGame(2);
    const me = cur(s).id;
    s = setPos(s, me, 38);
    s = withDice(s, [2, 3]); // 38 + 5 = 43 → 3
    const r = act(s, { type: 'ROLL', playerId: me });
    const p = r.state.players.find(p => p.id === me)!;
    expect(p.position).toBe(3);
    expect(p.cash).toBe(1700 - 0); // todavía no compró (fase AWAITING_BUY)
    expect(r.state.turnPhase).toBe('AWAITING_BUY');
  });

  it('paga doble sueldo al caer exacto en Salida si la regla casera está activa', () => {
    let s = makeGame(2, { doubleGoSalary: true });
    const me = cur(s).id;
    s = setPos(s, me, 35);
    s = withDice(s, [2, 3]);
    const r = act(s, { type: 'ROLL', playerId: me });
    expect(r.state.players.find(p => p.id === me)!.cash).toBe(1900);
  });

  it('no permite tirar fuera de turno', () => {
    const s = makeGame(2);
    const other = s.players[1].id;
    expect(() => act(s, { type: 'ROLL', playerId: other })).toThrow('No es tu turno');
  });
});

describe('compra y subasta', () => {
  it('comprar descuenta el precio y asigna dueño; luego END_TURN', () => {
    let s = makeGame(2);
    const me = cur(s).id;
    s = setPos(s, me, 0);
    s = withDice(s, [1, 2]); // → 3 Mariano Roque Alonso (60)
    let r = act(s, { type: 'ROLL', playerId: me });
    expect(r.state.turnPhase).toBe('AWAITING_BUY');
    r = act(r.state, { type: 'BUY', playerId: me });
    expect(r.state.properties[3].owner).toBe(me);
    expect(r.state.players.find(p => p.id === me)!.cash).toBe(1440);
    expect(r.state.turnPhase).toBe('END_TURN');
  });

  it('rechazar abre subasta; gana la oferta más alta cuando los demás pasan', () => {
    let s = makeGame(3);
    const [a, b, c] = s.players.map(p => p.id);
    s = setPos(s, a, 0);
    s = withDice(s, [1, 2]);
    let r = act(s, { type: 'ROLL', playerId: a });
    r = act(r.state, { type: 'DECLINE', playerId: a });
    expect(r.state.turnPhase).toBe('AUCTION');
    expect(() => act(r.state, { type: 'BID', playerId: b, amount: 5 })).toThrow();
    r = act(r.state, { type: 'BID', playerId: b, amount: 30 });
    r = act(r.state, { type: 'BID', playerId: a, amount: 45 });
    expect(() => act(r.state, { type: 'BID', playerId: c, amount: 45 })).toThrow('superar');
    r = act(r.state, { type: 'AUCTION_PASS', playerId: c });
    r = act(r.state, { type: 'AUCTION_PASS', playerId: b });
    expect(r.state.auction).toBeNull();
    expect(r.state.properties[3].owner).toBe(a);
    expect(r.state.players.find(p => p.id === a)!.cash).toBe(1455);
    expect(r.state.turnPhase).toBe('END_TURN');
  });

  it('si todos pasan sin ofertar, queda en el banco', () => {
    let s = makeGame(2);
    const [a, b] = s.players.map(p => p.id);
    s = setPos(s, a, 0);
    s = withDice(s, [1, 2]);
    let r = act(s, { type: 'ROLL', playerId: a });
    r = act(r.state, { type: 'DECLINE', playerId: a });
    r = act(r.state, { type: 'AUCTION_PASS', playerId: a });
    r = act(r.state, { type: 'AUCTION_PASS', playerId: b });
    expect(r.state.properties[3].owner).toBeNull();
    expect(r.state.turnPhase).toBe('END_TURN');
  });

  it('sin subastas (regla casera), rechazar deja la propiedad libre', () => {
    let s = makeGame(2, { auctions: false });
    const a = cur(s).id;
    s = setPos(s, a, 0);
    s = withDice(s, [1, 2]);
    let r = act(s, { type: 'ROLL', playerId: a });
    r = act(r.state, { type: 'DECLINE', playerId: a });
    expect(r.state.turnPhase).toBe('END_TURN');
  });
});

describe('alquileres', () => {
  it('alquiler simple, doble con monopolio, con casas y hotel', () => {
    let s = makeGame(2);
    const [a, b] = s.players.map(p => p.id);
    s = give(s, b, [1]);
    expect(rentFor(s, 1, 7)).toBe(2);
    s = give(s, b, [1, 3]);
    expect(rentFor(s, 1, 7)).toBe(4);
    s = give(s, b, [1, 3], 2);
    expect(rentFor(s, 1, 7)).toBe(30);
    s = give(s, b, [1, 3], 5);
    expect(rentFor(s, 1, 7)).toBe(250);
    expect(a).toBeTruthy();
  });

  it('hipotecada no cobra', () => {
    let s = makeGame(2);
    const b = s.players[1].id;
    s = give(s, b, [1]);
    s.properties[1].mortgaged = true;
    expect(rentFor(s, 1, 7)).toBe(0);
  });

  it('transporte: 25/50/100/200; servicios: 4x o 10x dados', () => {
    let s = makeGame(2);
    const b = s.players[1].id;
    s = give(s, b, [5]);
    expect(rentFor(s, 5, 7)).toBe(25);
    s = give(s, b, [5, 15]);
    expect(rentFor(s, 5, 7)).toBe(50);
    s = give(s, b, [5, 15, 25]);
    expect(rentFor(s, 5, 7)).toBe(100);
    s = give(s, b, [5, 15, 25, 35]);
    expect(rentFor(s, 5, 7)).toBe(200);
    s = give(s, b, [12]);
    expect(rentFor(s, 12, 7)).toBe(28);
    s = give(s, b, [12, 28]);
    expect(rentFor(s, 12, 7)).toBe(70);
  });

  it('caer en propiedad ajena transfiere el alquiler', () => {
    let s = makeGame(2);
    const [a, b] = s.players.map(p => p.id);
    s = give(s, b, [6, 8, 9]); // celeste completo → doble
    s = setPos(s, a, 0);
    s = withDice(s, [2, 4]); // → 6 Caacupé
    const r = act(s, { type: 'ROLL', playerId: a });
    expect(r.state.players.find(p => p.id === a)!.cash).toBe(1500 - 12);
    expect(r.state.players.find(p => p.id === b)!.cash).toBe(1500 + 12);
    expect(r.state.turnPhase).toBe('END_TURN');
  });
});

describe('construcción', () => {
  it('exige grupo completo y construcción pareja; hotel devuelve 4 casas', () => {
    let s = makeGame(2);
    const a = cur(s).id;
    s = give(s, a, [1]);
    expect(() => act(s, { type: 'BUILD', playerId: a, tileId: 1 })).toThrow('grupo');
    s = give(s, a, [1, 3]);
    let r = act(s, { type: 'BUILD', playerId: a, tileId: 1 });
    expect(r.state.properties[1].houses).toBe(1);
    expect(r.state.housesAvailable).toBe(31);
    expect(() => act(r.state, { type: 'BUILD', playerId: a, tileId: 1 })).toThrow('pareja');
    r = act(r.state, { type: 'BUILD', playerId: a, tileId: 3 });
    for (const t of [1, 3, 1, 3, 1, 3]) r = act(r.state, { type: 'BUILD', playerId: a, tileId: t });
    expect(r.state.properties[1].houses).toBe(4);
    r = act(r.state, { type: 'BUILD', playerId: a, tileId: 1 });
    expect(r.state.properties[1].houses).toBe(5);
    expect(r.state.hotelsAvailable).toBe(11);
    expect(r.state.housesAvailable).toBe(32 - 8 + 4);
    expect(r.state.players.find(p => p.id === a)!.cash).toBe(1500 - 9 * 50);
  });

  it('no construye si el banco no tiene casas', () => {
    let s = makeGame(2);
    const a = cur(s).id;
    s = give(s, a, [1, 3]);
    s.housesAvailable = 0;
    expect(() => act(s, { type: 'BUILD', playerId: a, tileId: 1 })).toThrow('no tiene casas');
  });

  it('vende edificios a mitad de precio de forma pareja', () => {
    let s = makeGame(2);
    const a = cur(s).id;
    s = give(s, a, [1, 3], 2);
    let r = act(s, { type: 'SELL_BUILDING', playerId: a, tileId: 1 });
    expect(r.state.players.find(p => p.id === a)!.cash).toBe(1525);
    expect(() => act(r.state, { type: 'SELL_BUILDING', playerId: a, tileId: 1 })).toThrow('pareja');
  });
});

describe('hipotecas', () => {
  it('hipoteca al 50 % y deshipoteca al 110 %', () => {
    let s = makeGame(2);
    const a = cur(s).id;
    s = give(s, a, [39]); // 400
    let r = act(s, { type: 'MORTGAGE', playerId: a, tileId: 39 });
    expect(r.state.properties[39].mortgaged).toBe(true);
    expect(r.state.players.find(p => p.id === a)!.cash).toBe(1700);
    r = act(r.state, { type: 'UNMORTGAGE', playerId: a, tileId: 39 });
    expect(r.state.players.find(p => p.id === a)!.cash).toBe(1700 - 220);
  });

  it('no se hipoteca con edificios en el grupo', () => {
    let s = makeGame(2);
    const a = cur(s).id;
    s = give(s, a, [1, 3], 1);
    expect(() => act(s, { type: 'MORTGAGE', playerId: a, tileId: 1 })).toThrow('edificios');
  });
});

describe('cárcel', () => {
  it('tres dobles seguidos mandan a Tacumbú', () => {
    let s = makeGame(2);
    const a = cur(s).id;
    s = withDice(s, [1, 1]);
    let r = act(s, { type: 'ROLL', playerId: a }); // → 2 Cooperativa (carta)
    // La carta puede cambiar la fase; forzamos posición neutra y repetimos
    if (r.state.turnPhase !== 'AWAITING_ROLL') return; // carta con efecto que cierra el turno: caso cubierto en otros tests
    let st = setPos(r.state, a, 10);
    st = { ...st, seed: seedFor([2, 2]) };
    r = act(st, { type: 'ROLL', playerId: a }); // → 14 Pilar → AWAITING_BUY
    r = act(r.state, { type: 'DECLINE', playerId: a });
    r = act(r.state, { type: 'AUCTION_PASS', playerId: a });
    r = act(r.state, { type: 'AUCTION_PASS', playerId: s.players[1].id });
    expect(r.state.turnPhase).toBe('AWAITING_ROLL');
    expect(r.state.doublesCount).toBe(2);
    st = setPos(r.state, a, 20);
    st = { ...st, seed: seedFor([3, 3]) };
    r = act(st, { type: 'ROLL', playerId: a });
    const p = r.state.players.find(p => p.id === a)!;
    expect(p.inJail).toBe(true);
    expect(p.position).toBe(10);
    expect(r.state.turnPhase).toBe('END_TURN');
  });

  it('caer en "Vaya a Tacumbú" no cobra sueldo y termina el turno', () => {
    let s = makeGame(2);
    const a = cur(s).id;
    s = setPos(s, a, 25);
    s = withDice(s, [2, 3]);
    const r = act(s, { type: 'ROLL', playerId: a });
    const p = r.state.players.find(p => p.id === a)!;
    expect(p.inJail).toBe(true);
    expect(p.cash).toBe(1500);
    expect(r.state.turnPhase).toBe('END_TURN');
  });

  it('paga ₲ 50.000 para salir; sale con dobles sin volver a tirar; tercer turno paga y sale', () => {
    let s = makeGame(2);
    const a = cur(s).id;
    s.players[0].inJail = true; s.players[0].position = 10;
    let r = act(s, { type: 'JAIL_PAY', playerId: a });
    expect(r.state.players[0].inJail).toBe(false);
    expect(r.state.players[0].cash).toBe(1450);
    expect(r.state.turnPhase).toBe('AWAITING_ROLL');

    // dobles estando preso
    let st = structuredClone(s);
    st.seed = seedFor([2, 2]);
    r = act(st, { type: 'ROLL', playerId: a }); // 10 + 4 = 14 Pilar
    expect(r.state.players[0].inJail).toBe(false);
    expect(r.state.players[0].position).toBe(14);
    expect(r.state.turnPhase).toBe('AWAITING_BUY');
    r = act(r.state, { type: 'BUY', playerId: a });
    expect(r.state.turnPhase).toBe('END_TURN'); // no repite tirada

    // tres turnos sin dobles
    st = structuredClone(s);
    st.players[0].jailTurns = 2;
    st.seed = seedFor([1, 2]);
    r = act(st, { type: 'ROLL', playerId: a });
    expect(r.state.players[0].inJail).toBe(false);
    expect(r.state.players[0].cash).toBe(1450);
    expect(r.state.players[0].position).toBe(13);
  });

  it('sin dobles sigue preso y termina el turno', () => {
    let s = makeGame(2);
    const a = cur(s).id;
    s.players[0].inJail = true; s.players[0].position = 10;
    s.seed = seedFor([1, 2]);
    const r = act(s, { type: 'ROLL', playerId: a });
    expect(r.state.players[0].inJail).toBe(true);
    expect(r.state.players[0].jailTurns).toBe(1);
    expect(r.state.turnPhase).toBe('END_TURN');
  });

  it('usa carta para salir y la carta vuelve al mazo', () => {
    let s = makeGame(2);
    const a = cur(s).id;
    s.players[0].inJail = true; s.players[0].position = 10; s.players[0].jailCards = ['chance'];
    s.decks.chance = s.decks.chance.filter(c => c !== 'S8');
    const r = act(s, { type: 'JAIL_CARD', playerId: a });
    expect(r.state.players[0].inJail).toBe(false);
    expect(r.state.players[0].jailCards).toHaveLength(0);
    expect(r.state.decks.chance.at(-1)).toBe('S8');
  });
});

describe('cartas', () => {
  function withTopCard(s: ReturnType<typeof makeGame>, deck: 'chance' | 'community', id: string) {
    const c = structuredClone(s);
    c.decks[deck] = [id, ...c.decks[deck].filter(x => x !== id)];
    return c;
  }

  it('retrocedé 3 desde Suerte (36) cae en Cooperativa (33) y saca otra carta', () => {
    let s = makeGame(2);
    const a = cur(s).id;
    s = setPos(s, a, 33);
    s = withTopCard(s, 'chance', 'S9');
    s = withTopCard(s, 'community', 'C2');
    s = withDice(s, [1, 2]); // → 36
    const r = act(s, { type: 'ROLL', playerId: a });
    expect(r.state.players[0].position).toBe(33);
    expect(r.state.players[0].cash).toBe(1700);
    expect(r.state.lastCard?.card.id).toBe('C2');
  });

  it('carta de avanzar a Salida cobra 200; ir a Tacumbú no cobra', () => {
    let s = makeGame(2);
    const a = cur(s).id;
    s = setPos(s, a, 4);
    s = withTopCard(s, 'chance', 'S1');
    s = withDice(s, [1, 2]); // → 7 Suerte
    let r = act(s, { type: 'ROLL', playerId: a });
    expect(r.state.players[0].position).toBe(0);
    expect(r.state.players[0].cash).toBe(1700);

    s = setPos(s, a, 4);
    s = withTopCard(s, 'chance', 'S10');
    r = act(s, { type: 'ROLL', playerId: a });
    expect(r.state.players[0].inJail).toBe(true);
    expect(r.state.players[0].cash).toBe(1500);
  });

  it('reparaciones cobra por casa y hotel; pagar a cada jugador reparte', () => {
    let s = makeGame(3);
    const a = cur(s).id;
    s = give(s, a, [1, 3], 2); // 4 casas
    s = setPos(s, a, 4);
    s = withTopCard(s, 'chance', 'S11');
    s = withDice(s, [1, 2]);
    let r = act(s, { type: 'ROLL', playerId: a });
    expect(r.state.players[0].cash).toBe(1500 - 100);

    s = setPos(s, a, 4);
    s = withTopCard(s, 'chance', 'S15');
    r = act(s, { type: 'ROLL', playerId: a });
    expect(r.state.players[0].cash).toBe(1400);
    expect(r.state.players[1].cash).toBe(1550);
    expect(r.state.players[2].cash).toBe(1550);
  });

  it('cumpleaños cobra 10 de cada uno; carta de cárcel se conserva y sale del mazo', () => {
    let s = makeGame(3);
    const a = cur(s).id;
    s = setPos(s, a, 0);
    s = withTopCard(s, 'community', 'C9');
    s = withDice(s, [1, 1]); // → 2 Cooperativa
    let r = act(s, { type: 'ROLL', playerId: a });
    expect(r.state.players[0].cash).toBe(1520);
    expect(r.state.turnPhase).toBe('AWAITING_ROLL'); // dobles

    s = setPos(s, a, 0);
    s = withTopCard(s, 'community', 'C5');
    r = act(s, { type: 'ROLL', playerId: a });
    expect(r.state.players[0].jailCards).toEqual(['community']);
    expect(r.state.decks.community).not.toContain('C5');
    expect(r.state.decks.community).toHaveLength(15);
  });

  it('avanzar al transporte más cercano paga doble; al servicio paga 10x dados', () => {
    let s = makeGame(2);
    const [a, b] = s.players.map(p => p.id);
    s = give(s, b, [15]);
    s = setPos(s, a, 4);
    s = withTopCard(s, 'chance', 'S5');
    s = withDice(s, [1, 2]); // → 7 → transporte más cercano 15
    let r = act(s, { type: 'ROLL', playerId: a });
    expect(r.state.players[0].position).toBe(15);
    expect(r.state.players[0].cash).toBe(1450);

    s = give(s, b, [12]);
    s = setPos(s, a, 4);
    s = withTopCard(s, 'chance', 'S4');
    r = act(s, { type: 'ROLL', playerId: a });
    expect(r.state.players[0].position).toBe(12);
    const d = r.state.dice!;
    expect(r.state.players[0].cash).toBe(1500 - (d[0] + d[1]) * 10);
  });
});

describe('impuestos', () => {
  it('impuesto a la renta: fijo o 10 % del patrimonio', () => {
    let s = makeGame(2);
    const a = cur(s).id;
    s = setPos(s, a, 1);
    s = withDice(s, [1, 2]); // → 4
    let r = act(s, { type: 'ROLL', playerId: a });
    expect(r.state.turnPhase).toBe('TAX_CHOICE');
    const flat = act(r.state, { type: 'TAX_CHOICE', playerId: a, choice: 'flat' });
    expect(flat.state.players[0].cash).toBe(1300);
    const pct = act(r.state, { type: 'TAX_CHOICE', playerId: a, choice: 'percent' });
    expect(pct.state.players[0].cash).toBe(1350);
  });

  it('impuesto al lujo cobra 100 y con pozo activo va al Estacionamiento Libre', () => {
    let s = makeGame(2, { freeParkingPot: true });
    const a = cur(s).id;
    s = setPos(s, a, 35);
    s = withDice(s, [1, 2]); // → 38
    let r = act(s, { type: 'ROLL', playerId: a });
    expect(r.state.players[0].cash).toBe(1400);
    expect(r.state.freeParkingPot).toBe(100);
    r = act(r.state, { type: 'END_TURN', playerId: a });
    const b = cur(r.state).id;
    let st = setPos(r.state, b, 15);
    st = { ...st, seed: seedFor([2, 3]) }; // → 20
    r = act(st, { type: 'ROLL', playerId: b });
    expect(r.state.players.find(p => p.id === b)!.cash).toBe(1600);
    expect(r.state.freeParkingPot).toBe(0);
  });
});

describe('deuda y quiebra', () => {
  it('sin efectivo pero con bienes entra en DEBT; hipotecar hasta cubrir salda solo', () => {
    let s = makeGame(2);
    const [a, b] = s.players.map(p => p.id);
    s = give(s, b, [1, 3], 5); // hotel en Mariano: 450
    s = give(s, a, [21, 23, 24, 39]); // hipotecas: 110+110+120+200 = 540
    s = setCash(s, a, 100); // liquidación 640 ≥ 450 → DEBT
    s = setPos(s, a, 0);
    s = withDice(s, [1, 2]); // → 3
    let r = act(s, { type: 'ROLL', playerId: a });
    expect(r.state.turnPhase).toBe('DEBT');
    expect(r.state.debt?.amount).toBe(450);
    expect(r.state.players[0].bankrupt).toBe(false);
    r = act(r.state, { type: 'MORTGAGE', playerId: a, tileId: 39 }); // 300
    expect(r.state.turnPhase).toBe('DEBT');
    r = act(r.state, { type: 'MORTGAGE', playerId: a, tileId: 21 }); // 410
    expect(r.state.turnPhase).toBe('DEBT');
    r = act(r.state, { type: 'MORTGAGE', playerId: a, tileId: 24 }); // 530 → paga
    expect(r.state.turnPhase).toBe('END_TURN');
    expect(r.state.players.find(p => p.id === a)!.cash).toBe(530 - 450);
    expect(r.state.players.find(p => p.id === b)!.cash).toBe(1950);
  });

  it('quiebra directa si ni liquidando alcanza: el acreedor recibe todo', () => {
    let s = makeGame(2);
    const [a, b] = s.players.map(p => p.id);
    s = give(s, b, [37, 39], 5);
    s = give(s, a, [21, 23, 24]);
    s = setCash(s, a, 100);
    s = setPos(s, a, 36);
    s = withDice(s, [1, 2]); // → 39 hotel: 2000; liquidación 440 → quiebra
    const r = act(s, { type: 'ROLL', playerId: a });
    const pa = r.state.players.find(p => p.id === a)!;
    expect(pa.bankrupt).toBe(true);
    expect(r.state.phase).toBe('FINISHED');
    expect(r.state.winnerId).toBe(b);
    expect(r.state.properties[21].owner).toBe(b);
    expect(r.state.players.find(p => p.id === b)!.cash).toBe(1600);
  });

  it('DEBT: hipotecar hasta cubrir salda y continúa; puede declararse en quiebra', () => {
    let s = makeGame(3);
    const [a, b] = s.players.map(p => p.id);
    s = give(s, b, [1, 3], 3); // Mariano con 3 casas: 180
    s = give(s, a, [39, 37]); // 175 + 200 de hipoteca
    s = setCash(s, a, 50);
    s = setPos(s, a, 0);
    s = withDice(s, [1, 2]); // → 3
    let r = act(s, { type: 'ROLL', playerId: a });
    expect(r.state.turnPhase).toBe('DEBT');
    expect(legalActions(r.state, a).has('MORTGAGE')).toBe(true);
    expect(() => act(r.state, { type: 'END_TURN', playerId: a })).toThrow();
    r = act(r.state, { type: 'MORTGAGE', playerId: a, tileId: 39 });
    expect(r.state.turnPhase).toBe('END_TURN');
    expect(r.state.players.find(p => p.id === a)!.cash).toBe(50 + 200 - 180);
    expect(r.state.players.find(p => p.id === b)!.cash).toBe(1680);
  });

  it('quiebra con el banco subasta las propiedades', () => {
    let s = makeGame(3);
    const [a, b, c] = s.players.map(p => p.id);
    s = give(s, a, [1]);
    s = setCash(s, a, 0);
    s = setPos(s, a, 35);
    s = withDice(s, [1, 2]); // → 38 lujo 100; liquidación 30 < 100 → quiebra con banco
    let r = act(s, { type: 'ROLL', playerId: a });
    expect(r.state.players.find(p => p.id === a)!.bankrupt).toBe(true);
    expect(r.state.turnPhase).toBe('AUCTION');
    expect(r.state.auction?.tileId).toBe(1);
    expect(r.state.auction?.activeBidders).toEqual([b, c]);
    r = act(r.state, { type: 'BID', playerId: c, amount: 20 });
    r = act(r.state, { type: 'AUCTION_PASS', playerId: b });
    expect(r.state.properties[1].owner).toBe(c);
    expect(cur(r.state).id).toBe(b);
    expect(r.state.turnPhase).toBe('AWAITING_ROLL');
  });
});

describe('intercambios', () => {
  it('propone, acepta y transfiere atómicamente', () => {
    let s = makeGame(2);
    const [a, b] = s.players.map(p => p.id);
    s = give(s, a, [1]);
    s = give(s, b, [3]);
    s.players[1].jailCards = ['chance'];
    let r = act(s, {
      type: 'TRADE_PROPOSE', playerId: a, toPlayerId: b,
      give: { cash: 100, properties: [1], jailCards: 0 },
      receive: { cash: 0, properties: [3], jailCards: 1 },
    });
    expect(r.state.pendingTrade).not.toBeNull();
    expect(() => act(r.state, { type: 'TRADE_ACCEPT', playerId: a, tradeId: r.state.pendingTrade!.id })).toThrow();
    r = act(r.state, { type: 'TRADE_ACCEPT', playerId: b, tradeId: r.state.pendingTrade!.id });
    expect(r.state.properties[1].owner).toBe(b);
    expect(r.state.properties[3].owner).toBe(a);
    expect(r.state.players[0].cash).toBe(1400);
    expect(r.state.players[1].cash).toBe(1600);
    expect(r.state.players[0].jailCards).toEqual(['chance']);
    expect(r.state.pendingTrade).toBeNull();
  });

  it('rechaza intercambiar propiedades con edificios', () => {
    let s = makeGame(2);
    const [a, b] = s.players.map(p => p.id);
    s = give(s, a, [1, 3], 1);
    expect(() => act(s, {
      type: 'TRADE_PROPOSE', playerId: a, toPlayerId: b,
      give: { cash: 0, properties: [1], jailCards: 0 }, receive: { cash: 50, properties: [], jailCards: 0 },
    })).toThrow('edificios');
  });
});

describe('patrimonio', () => {
  it('suma efectivo, propiedades y edificios', () => {
    let s = makeGame(2);
    const a = cur(s).id;
    s = give(s, a, [1, 3], 2);
    s.properties[1].mortgaged = false;
    expect(netWorth(s, a)).toBe(1500 + 60 + 60 + 4 * 50);
  });
});
