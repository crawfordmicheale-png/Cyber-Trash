/**
 * Seeded PRNG (mulberry32). Runs are reproducible from a single seed, which is
 * what makes the roguelite layout generation debuggable.
 */
export class Rng {
  private state: number;

  constructor(seed: number = (Math.random() * 0xffffffff) >>> 0) {
    this.state = seed >>> 0 || 0x9e3779b9;
  }

  /** [0, 1) */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [lo, hi) */
  range(lo: number, hi: number): number {
    return lo + this.next() * (hi - lo);
  }

  /** Integer in [lo, hi] inclusive. */
  int(lo: number, hi: number): number {
    return Math.floor(this.range(lo, hi + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Weighted pick. `weight` defaults to a `weight` field on the item. */
  weighted<T>(arr: readonly T[], weight: (item: T) => number): T {
    let total = 0;
    for (const item of arr) total += Math.max(0, weight(item));
    let roll = this.next() * total;
    for (const item of arr) {
      roll -= Math.max(0, weight(item));
      if (roll <= 0) return item;
    }
    return arr[arr.length - 1];
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** Random unit-ish spread, biased to the centre. Good for particle cones. */
  spread(amount: number): number {
    return (this.next() + this.next() - 1) * amount;
  }

  fork(): Rng {
    return new Rng((this.next() * 0xffffffff) >>> 0);
  }
}

/** Shared unseeded stream for pure cosmetics (particles, debris, flicker). */
export const fxRng = new Rng();
