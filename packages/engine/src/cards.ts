import type { Card } from './types';

export const CHANCE_CARDS: Card[] = [
  { id: 'S1', deck: 'chance', text: '¡Ganaste el sorteo de la Expo de Mariano! Avanzá hasta Salida y cobrá ₲ 200.000.', effect: { kind: 'moveTo', tile: 0, collectGo: true } },
  { id: 'S2', deck: 'chance', text: 'Viaje de compras a Ciudad del Este. Si pasás por Salida, cobrá ₲ 200.000.', effect: { kind: 'moveTo', tile: 24, collectGo: true } },
  { id: 'S3', deck: 'chance', text: 'Te invitaron a un asado en Coronel Oviedo. Si pasás por Salida, cobrá ₲ 200.000.', effect: { kind: 'moveTo', tile: 11, collectGo: true } },
  { id: 'S4', deck: 'chance', text: 'Se cortó la luz. Avanzá hasta el servicio público más cercano. Si está libre podés comprarlo; si tiene dueño, tirá los dados y pagale 10 veces el resultado.', effect: { kind: 'nearest', tileType: 'utility' } },
  { id: 'S5', deck: 'chance', text: 'Salió el pasaje. Avanzá hasta el transporte más cercano. Si está libre podés comprarlo; si tiene dueño, pagale el doble del alquiler.', effect: { kind: 'nearest', tileType: 'transport' } },
  { id: 'S6', deck: 'chance', text: 'Salió el pasaje. Avanzá hasta el transporte más cercano. Si está libre podés comprarlo; si tiene dueño, pagale el doble del alquiler.', effect: { kind: 'nearest', tileType: 'transport' } },
  { id: 'S7', deck: 'chance', text: 'La cooperativa repartió excedentes. Cobrá ₲ 50.000.', effect: { kind: 'money', amount: 50 } },
  { id: 'S8', deck: 'chance', text: 'Salís de Tacumbú. Guardá esta carta hasta usarla o vendérsela a otro jugador.', effect: { kind: 'jailFree' } },
  { id: 'S9', deck: 'chance', text: 'Te olvidaste el tereré. Retrocedé 3 casillas.', effect: { kind: 'moveBack', steps: 3 } },
  { id: 'S10', deck: 'chance', text: 'Te agarraron en el semáforo sin cédula. Vaya directo a Tacumbú. No pasés por Salida, no cobrés ₲ 200.000.', effect: { kind: 'goToJail' } },
  { id: 'S11', deck: 'chance', text: 'Reparaciones generales en todas tus propiedades: pagá ₲ 25.000 por cada casa y ₲ 100.000 por cada hotel.', effect: { kind: 'repairs', perHouse: 25, perHotel: 100 } },
  { id: 'S12', deck: 'chance', text: 'Multa de la Patrulla Caminera por exceso de velocidad. Pagá ₲ 15.000.', effect: { kind: 'money', amount: -15 } },
  { id: 'S13', deck: 'chance', text: 'Viaje en colectivo a la Terminal de Ómnibus. Si pasás por Salida, cobrá ₲ 200.000.', effect: { kind: 'moveTo', tile: 5, collectGo: true } },
  { id: 'S14', deck: 'chance', text: 'Recepción en el Palacio de López. Avanzá hasta ahí.', effect: { kind: 'moveTo', tile: 39, collectGo: false } },
  { id: 'S15', deck: 'chance', text: 'Te eligieron presidente de la comisión vecinal. Pagá ₲ 50.000 a cada jugador.', effect: { kind: 'payEach', amount: 50 } },
  { id: 'S16', deck: 'chance', text: 'Venció tu certificado de ahorro. Cobrá ₲ 150.000.', effect: { kind: 'money', amount: 150 } },
];

export const COMMUNITY_CARDS: Card[] = [
  { id: 'C1', deck: 'community', text: 'Fiesta de San Juan en el barrio. Avanzá hasta Salida y cobrá ₲ 200.000.', effect: { kind: 'moveTo', tile: 0, collectGo: true } },
  { id: 'C2', deck: 'community', text: 'Error a tu favor en la transferencia del banco. Cobrá ₲ 200.000.', effect: { kind: 'money', amount: 200 } },
  { id: 'C3', deck: 'community', text: 'Consulta médica en el IPS que igual pagaste particular. Pagá ₲ 50.000.', effect: { kind: 'money', amount: -50 } },
  { id: 'C4', deck: 'community', text: 'Vendiste tu cosecha de mandioca. Cobrá ₲ 50.000.', effect: { kind: 'money', amount: 50 } },
  { id: 'C5', deck: 'community', text: 'Salís de Tacumbú. Guardá esta carta hasta usarla o vendérsela a otro jugador.', effect: { kind: 'jailFree' } },
  { id: 'C6', deck: 'community', text: 'Te encontraron con mercadería sin factura en el Puente. Vaya directo a Tacumbú. No pasés por Salida, no cobrés ₲ 200.000.', effect: { kind: 'goToJail' } },
  { id: 'C7', deck: 'community', text: 'Cobraste el aguinaldo. Cobrá ₲ 100.000.', effect: { kind: 'money', amount: 100 } },
  { id: 'C8', deck: 'community', text: 'La SET te devolvió el IVA. Cobrá ₲ 20.000.', effect: { kind: 'money', amount: 20 } },
  { id: 'C9', deck: 'community', text: '¡Es tu cumpleaños! Cada jugador te da ₲ 10.000.', effect: { kind: 'collectEach', amount: 10 } },
  { id: 'C10', deck: 'community', text: 'Venció tu seguro de vida. Cobrá ₲ 100.000.', effect: { kind: 'money', amount: 100 } },
  { id: 'C11', deck: 'community', text: 'Internación en sanatorio privado. Pagá ₲ 100.000.', effect: { kind: 'money', amount: -100 } },
  { id: 'C12', deck: 'community', text: 'Cuota del colegio de los chicos. Pagá ₲ 50.000.', effect: { kind: 'money', amount: -50 } },
  { id: 'C13', deck: 'community', text: 'Honorarios por una consultoría. Cobrá ₲ 25.000.', effect: { kind: 'money', amount: 25 } },
  { id: 'C14', deck: 'community', text: 'Te tocó el arreglo de las calles del barrio: pagá ₲ 40.000 por cada casa y ₲ 115.000 por cada hotel.', effect: { kind: 'repairs', perHouse: 40, perHotel: 115 } },
  { id: 'C15', deck: 'community', text: 'Segundo premio en el concurso de chipa. Cobrá ₲ 10.000.', effect: { kind: 'money', amount: 10 } },
  { id: 'C16', deck: 'community', text: 'Herencia de un tío en Encarnación. Cobrá ₲ 100.000.', effect: { kind: 'money', amount: 100 } },
];

// Cartas extra que entran al mazo solo si la sala tiene activados los desafíos
export const CHALLENGE_CARDS: Card[] = [
  { id: 'S17', deck: 'chance', text: '¡Desafío! Se armó la timba en la esquina: elegí a un rival y un mini-juego. Se juega por ₲ 100.000 y no puede negarse.', effect: { kind: 'challenge', amount: 100 } },
  { id: 'C17', deck: 'community', text: '¡Desafío! La cooperativa organiza un torneo relámpago: elegí a un rival y un mini-juego por ₲ 100.000. No puede negarse.', effect: { kind: 'challenge', amount: 100 } },
];

export const ALL_CARDS: Record<string, Card> = Object.fromEntries(
  [...CHANCE_CARDS, ...COMMUNITY_CARDS, ...CHALLENGE_CARDS].map(c => [c.id, c]),
);

export function card(id: string): Card {
  const c = ALL_CARDS[id];
  if (!c) throw new Error(`Carta inválida: ${id}`);
  return c;
}
