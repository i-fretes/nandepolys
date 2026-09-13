import { describe, expect, it } from 'vitest';
import { TRIVIA } from '../src';

const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

describe('banco de trivia', () => {
  it('no tiene preguntas repetidas', () => {
    const seen = new Set<string>();
    for (const t of TRIVIA) {
      const k = norm(t.q);
      expect(seen.has(k), `repetida: ${t.q}`).toBe(false);
      seen.add(k);
    }
    expect(TRIVIA.length).toBeGreaterThan(300);
  });

  it('cada pregunta tiene 4 opciones distintas y la respuesta apunta a una de ellas', () => {
    for (const t of TRIVIA) {
      expect(t.options).toHaveLength(4);
      expect(new Set(t.options.map(norm)).size, `opciones repetidas en: ${t.q}`).toBe(4);
      expect(t.answer).toBeGreaterThanOrEqual(0);
      expect(t.answer).toBeLessThan(4);
    }
  });
});
