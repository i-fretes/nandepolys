// Generador determinista (mulberry32). El estado de la partida guarda la semilla;
// cada tirada devuelve la semilla siguiente, así las partidas son reproducibles en tests.

export function nextRandom(seed: number): { value: number; seed: number } {
  let t = (seed + 0x6d2b79f5) | 0;
  let r = t;
  r = Math.imul(r ^ (r >>> 15), r | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  const value = ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  return { value, seed: t };
}

export function rollDie(seed: number): { die: number; seed: number } {
  const { value, seed: s } = nextRandom(seed);
  return { die: 1 + Math.floor(value * 6), seed: s };
}

export function rollDice(seed: number): { dice: [number, number]; seed: number } {
  const a = rollDie(seed);
  const b = rollDie(a.seed);
  return { dice: [a.die, b.die], seed: b.seed };
}

export function shuffle<T>(items: T[], seed: number): { items: T[]; seed: number } {
  const arr = [...items];
  let s = seed;
  for (let i = arr.length - 1; i > 0; i--) {
    const r = nextRandom(s);
    s = r.seed;
    const j = Math.floor(r.value * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return { items: arr, seed: s };
}
