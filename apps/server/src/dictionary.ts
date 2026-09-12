import { createRequire } from 'node:module';
import { PARAGUAYISMOS, normalizeWord } from '@nandepoly/engine';

/** Diccionario para Palabra bomba: español (~636k palabras, sin acentos, ñ→n) + paraguayismos. */
const require = createRequire(import.meta.url);
let words: string[] = [];
try { words = require('an-array-of-spanish-words') as string[]; } catch { words = []; }

const DICT = new Set<string>();
for (const w of words) if (w.length >= 3) DICT.add(normalizeWord(w));
for (const w of PARAGUAYISMOS) DICT.add(normalizeWord(w));

export function isValidWord(w: string): boolean {
  const n = normalizeWord(w);
  return n.length >= 3 && DICT.has(n);
}
export const DICT_SIZE = DICT.size;
