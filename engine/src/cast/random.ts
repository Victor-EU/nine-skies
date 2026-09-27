/**
 * The cast's dice (D92): a seeded generator, so a viewing's surprises are
 * drawn once and then fixed. The same seed, scene and cue draw the same
 * plan in any browser, on any frame rate, seeked to any second, which is
 * what lets a still, a probe or a shared link show the viewing again.
 *
 * Nothing of the cast calls `Math.random`; the shell draws one seed when
 * the page opens (or reads it from the address) and everything else
 * descends from it.
 */

/** A 32-bit hash of the parts, FNV-1a over their text: stable across runs and platforms. */
export function hashSeed(...parts: readonly (string | number)[]): number {
  let h = 0x811c9dc5;
  for (const part of parts) {
    const s = `${part}␟`;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
  }
  return h >>> 0;
}

/** Mulberry32: small, fast, and good enough for where a crane comes from. */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** A number in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** A number in [a, b). */
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }

  /** True with probability `p`. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** -1 or 1, evenly. */
  sign(): -1 | 1 {
    return this.next() < 0.5 ? -1 : 1;
  }

  /** A 32-bit seed for a generator of its own, so one draw's count never shifts another's. */
  fork(): number {
    return Math.floor(this.next() * 4294967296) >>> 0;
  }

  /** A key of `weights` drawn in proportion to its weight; null when none weighs anything. */
  pick<K extends string>(weights: Readonly<Partial<Record<K, number>>>): K | null {
    const entries = (Object.entries(weights) as [K, number | undefined][]).filter((e): e is [K, number] => (e[1] ?? 0) > 0);
    const total = entries.reduce((s, [, w]) => s + w, 0);
    if (total <= 0) return null;
    let r = this.next() * total;
    for (const [k, w] of entries) {
      r -= w;
      if (r < 0) return k;
    }
    return entries[entries.length - 1]![0];
  }
}
