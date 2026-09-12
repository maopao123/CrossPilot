/**
 * Seedable deterministic RNG for the Commerce Simulator.
 *
 * The world state carries a single `rngSeed`; every engine draws from an
 * independent stream derived from (worldSeed, dayIndex, streamName), so a
 * given (seed, dayIndex) always reproduces the exact same day.
 */

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32-bit string hash. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function deriveSeed(worldSeed: number, dayIndex: number, stream: string): number {
  let h = (hashString(stream) ^ (worldSeed >>> 0)) >>> 0;
  h = Math.imul(h, 0x9e3779b1) >>> 0;
  h = (h ^ (dayIndex >>> 0)) >>> 0;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  return h;
}

export function createStreamRng(worldSeed: number, dayIndex: number, stream: string): Rng {
  return mulberry32(deriveSeed(worldSeed, dayIndex, stream));
}

export function randRange(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

export function pickOne<T>(rng: Rng, items: T[]): T {
  return items[Math.floor(rng() * items.length)];
}
