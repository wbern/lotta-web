/**
 * Deterministic PRNG for chaos-monkey runs.
 * mulberry32 — small, seedable, adequate for test randomness.
 */

export interface Rng {
  /** [0, 1) */
  float(): number
  /** integer in [min, max] inclusive */
  int(min: number, max: number): number
  /** pick a random element */
  pick<T>(xs: readonly T[]): T
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0
  const float = (): number => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    float,
    int(min, max) {
      return Math.floor(float() * (max - min + 1)) + min
    },
    pick(xs) {
      return xs[Math.floor(float() * xs.length)]
    },
  }
}
