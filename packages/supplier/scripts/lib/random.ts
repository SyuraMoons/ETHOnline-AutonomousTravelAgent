// Seeded randomness shared by every generator.
//
// Determinism is the whole contract here: same seed plus same inputs must give
// byte-identical output, so regenerating an unchanged dataset is a no-op in git
// and a demo never shifts under you.
//
// Each entity gets its own stream, seeded from a string key (a route and date,
// a city, a hotel id). That makes generation order-independent: adding a city
// does not renumber the ones already there.

/** mulberry32 — small, fast, stable across engines and Node versions. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a over a key string, so each entity's stream is independent. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A generator scoped to one entity key. */
export function streamFor(key: string, seedSalt: number): () => number {
  return mulberry32(hashSeed(key) ^ seedSalt);
}

export function pick<T>(rand: () => number, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)]!;
}

/** Picks `count` distinct items, preserving input order. */
export function pickSome<T>(
  rand: () => number,
  items: readonly T[],
  count: number,
): T[] {
  const chosen = new Set<number>();
  const wanted = Math.min(count, items.length);
  let guard = 0;
  while (chosen.size < wanted && guard < 500) {
    chosen.add(Math.floor(rand() * items.length));
    guard += 1;
  }
  return [...chosen].sort((a, b) => a - b).map((index) => items[index]!);
}

export function intBetween(
  rand: () => number,
  min: number,
  max: number,
): number {
  return min + Math.floor(rand() * (max - min + 1));
}

/** Rounds to a whole currency unit so prices never look machine-generated. */
export function roundPrice(minor: number, step = 100): number {
  return Math.max(step, Math.round(minor / step) * step);
}
