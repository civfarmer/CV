// @ts-check
/**
 * Deterministic pseudo-random number generation.
 *
 * The entire FRIS synthetic dataset and every simulation is reproducible from a
 * numeric seed. We use a small, well-understood generator (mulberry32) seeded
 * through a string hash (xmur3) so both numeric and string seeds are supported.
 *
 * Determinism guarantees:
 *   - identical seed + identical call sequence => identical output
 *   - no reliance on Math.random, Date.now, or any ambient state
 */

/**
 * xmur3 string hash — produces a 32-bit seed from an arbitrary string.
 * @param {string} str
 * @returns {() => number}
 */
export function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/**
 * mulberry32 — fast, high-quality 32-bit PRNG.
 * @param {number} a seed
 * @returns {() => number} function returning float in [0, 1)
 */
export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A deterministic RNG with convenience helpers.
 */
export class Rng {
  /** @param {number|string} seed */
  constructor(seed) {
    const s = typeof seed === 'number' ? String(seed >>> 0) : String(seed);
    const seedFn = xmur3(s);
    this._next = mulberry32(seedFn());
    this.seed = seed;
  }

  /** @returns {number} float in [0,1) */
  float() {
    return this._next();
  }

  /**
   * Integer in [min, max] inclusive.
   * @param {number} min
   * @param {number} max
   */
  int(min, max) {
    if (max < min) [min, max] = [max, min];
    return min + Math.floor(this._next() * (max - min + 1));
  }

  /**
   * Float in [min, max).
   * @param {number} min
   * @param {number} max
   */
  range(min, max) {
    return min + this._next() * (max - min);
  }

  /**
   * Boolean with probability p of being true.
   * @param {number} [p=0.5]
   */
  bool(p = 0.5) {
    return this._next() < p;
  }

  /**
   * Pick one element from an array.
   * @template T
   * @param {readonly T[]} arr
   * @returns {T}
   */
  pick(arr) {
    if (arr.length === 0) throw new Error('Rng.pick: empty array');
    return arr[Math.floor(this._next() * arr.length)];
  }

  /**
   * Pick a value from a weighted list of [value, weight] tuples.
   * @template T
   * @param {ReadonlyArray<[T, number]>} pairs
   * @returns {T}
   */
  weighted(pairs) {
    const total = pairs.reduce((a, [, w]) => a + w, 0);
    let r = this._next() * total;
    for (const [value, weight] of pairs) {
      r -= weight;
      if (r < 0) return value;
    }
    return pairs[pairs.length - 1][0];
  }

  /**
   * Return n unique samples from arr (without replacement).
   * @template T
   * @param {readonly T[]} arr
   * @param {number} n
   * @returns {T[]}
   */
  sample(arr, n) {
    const copy = arr.slice();
    this.shuffle(copy);
    return copy.slice(0, Math.min(n, copy.length));
  }

  /**
   * In-place Fisher–Yates shuffle.
   * @template T
   * @param {T[]} arr
   * @returns {T[]}
   */
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this._next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /**
   * Approx. normal via sum of uniforms (Irwin–Hall, n=6), scaled.
   * @param {number} mean
   * @param {number} stdev
   */
  gaussian(mean, stdev) {
    let s = 0;
    for (let i = 0; i < 6; i++) s += this._next();
    // Irwin–Hall(6) has mean 3, variance 0.5 => stdev sqrt(0.5)
    const z = (s - 3) / Math.sqrt(0.5);
    return mean + z * stdev;
  }

  /**
   * A deterministic short hex token of the given byte length.
   * @param {number} [bytes=8]
   */
  hex(bytes = 8) {
    let out = '';
    for (let i = 0; i < bytes; i++) {
      out += Math.floor(this._next() * 256)
        .toString(16)
        .padStart(2, '0');
    }
    return out;
  }
}

export default Rng;
