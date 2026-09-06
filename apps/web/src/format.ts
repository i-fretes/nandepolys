import { TOKENS } from '@nandepoly/engine';

/** Montos del motor están en miles de guaraníes. */
export function money(thousands: number): string {
  return '₲ ' + (thousands * 1000).toLocaleString('es-PY');
}

/** Versión corta para las casillas: 60 → "60 mil", 1500 → "1,5 M" */
export function moneyShort(thousands: number): string {
  if (thousands >= 1000) return (thousands / 1000).toLocaleString('es-PY', { maximumFractionDigits: 1 }) + ' M';
  return thousands + ' mil';
}

export function tokenEmoji(id: string): string {
  return TOKENS.find(t => t.id === id)?.emoji ?? '●';
}

export function tokenLabel(id: string): string {
  return TOKENS.find(t => t.id === id)?.label ?? id;
}

export function timeLeft(deadline: number | null, now: number): number | null {
  if (!deadline) return null;
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}
