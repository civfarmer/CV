// @ts-check
/**
 * Safe, deterministic money mathematics.
 *
 * Rationale: IEEE-754 floating point cannot represent most decimal fractions
 * exactly, which is unacceptable for insolvency distributions where totals must
 * reconcile to the penny. FRIS therefore represents every monetary amount as an
 * INTEGER NUMBER OF MINOR UNITS held in a BigInt (e.g. CHF 1,234.56 => 123456n).
 *
 * Rounding policy (documented and tested):
 *   - All intermediate ratio/rate operations round HALF-UP (round-half-away-from-zero
 *     for the non-negative amounts used in this domain).
 *   - Pro-rata distribution uses the LARGEST-REMAINDER method so the sum of the
 *     parts exactly equals the pool (no rounding leakage).
 *   - Currency scale is fixed at 2 minor units (2 dp) for all fiat currencies.
 *   - FX rates are expressed with 6 dp of precision (scaled by 1e6).
 */

export const MINOR_SCALE = 2; // fiat: 2 decimal places
export const RATE_SCALE = 6; // rates/percentages: 6 decimal places
const RATE_ONE = 10n ** BigInt(RATE_SCALE); // 1_000_000n

/**
 * Parse a decimal amount (string or number) into BigInt minor units.
 * @param {string|number|bigint} amount
 * @param {number} [dp=MINOR_SCALE]
 * @returns {bigint}
 */
export function toMinor(amount, dp = MINOR_SCALE) {
  if (typeof amount === 'bigint') return amount;
  const s = typeof amount === 'number' ? amount.toFixed(dp + 2) : String(amount).trim();
  if (!/^-?\d*(\.\d+)?$/.test(s) || s === '' || s === '-' || s === '.') {
    throw new Error(`toMinor: invalid amount "${amount}"`);
  }
  const neg = s.startsWith('-');
  const body = neg ? s.slice(1) : s;
  const [intPart, fracPartRaw = ''] = body.split('.');
  const frac = (fracPartRaw + '0'.repeat(dp)).slice(0, dp);
  const rounding = fracPartRaw.length > dp && Number(fracPartRaw[dp]) >= 5 ? 1n : 0n;
  const minor = BigInt(intPart || '0') * 10n ** BigInt(dp) + BigInt(frac || '0') + rounding;
  return neg ? -minor : minor;
}

/**
 * Format BigInt minor units back to a decimal string.
 * @param {bigint} minor
 * @param {number} [dp=MINOR_SCALE]
 * @returns {string}
 */
export function fromMinor(minor, dp = MINOR_SCALE) {
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const base = 10n ** BigInt(dp);
  const intPart = abs / base;
  const fracPart = abs % base;
  const fracStr = dp > 0 ? '.' + fracPart.toString().padStart(dp, '0') : '';
  return (neg ? '-' : '') + intPart.toString() + fracStr;
}

/**
 * Format minor units as a grouped display string, e.g. "1,234,567.89".
 * @param {bigint} minor
 * @param {number} [dp=MINOR_SCALE]
 */
export function formatMinor(minor, dp = MINOR_SCALE) {
  const raw = fromMinor(minor, dp);
  const neg = raw.startsWith('-');
  const body = neg ? raw.slice(1) : raw;
  const [i, f] = body.split('.');
  const grouped = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-' : '') + grouped + (f ? '.' + f : '');
}

/**
 * BigInt division rounding half-up (away from zero).
 * @param {bigint} a numerator
 * @param {bigint} b denominator (non-zero)
 * @returns {bigint}
 */
export function roundHalfUpDiv(a, b) {
  if (b === 0n) throw new Error('roundHalfUpDiv: division by zero');
  const sign = a < 0n !== b < 0n ? -1n : 1n;
  const aa = a < 0n ? -a : a;
  const bb = b < 0n ? -b : b;
  const q = aa / bb;
  const r = aa % bb;
  const rounded = r * 2n >= bb ? q + 1n : q;
  return sign * rounded;
}

/**
 * Multiply minor units by a ratio numerator/denominator, rounding half-up.
 * @param {bigint} minor
 * @param {bigint|number} num
 * @param {bigint|number} den
 * @returns {bigint}
 */
export function mulRatio(minor, num, den) {
  return roundHalfUpDiv(minor * BigInt(num), BigInt(den));
}

/**
 * Apply a percentage (0..100, up to 6dp) to minor units.
 * @param {bigint} minor
 * @param {number} percent
 * @returns {bigint}
 */
export function applyPercent(minor, percent) {
  const scaled = BigInt(Math.round(percent * Number(RATE_ONE))); // percent * 1e6
  return roundHalfUpDiv(minor * scaled, 100n * RATE_ONE);
}

/**
 * Convert an amount from one currency to another using an FX multiplier.
 * @param {bigint} minor amount in source currency (minor units)
 * @param {number} rate multiplier such that target = source * rate
 * @returns {bigint} amount in target currency (minor units)
 */
export function applyFx(minor, rate) {
  const scaled = BigInt(Math.round(rate * Number(RATE_ONE)));
  return roundHalfUpDiv(minor * scaled, RATE_ONE);
}

/**
 * Distribute a pool across weights using the largest-remainder method so the
 * sum of the parts EXACTLY equals the pool.
 * @param {bigint} pool
 * @param {readonly (bigint|number)[]} weights non-negative
 * @returns {bigint[]}
 */
export function proRata(pool, weights) {
  const w = weights.map((x) => BigInt(x));
  const total = w.reduce((a, b) => a + b, 0n);
  if (total <= 0n) return w.map(() => 0n);
  const base = w.map((wi) => (pool * wi) / total);
  const remainders = w.map((wi, i) => ({ i, rem: (pool * wi) % total }));
  let allocated = base.reduce((a, b) => a + b, 0n);
  let leftover = pool - allocated;
  // Distribute leftover minor units to the largest remainders (deterministic tie-break by index).
  remainders.sort((a, b) => (b.rem === a.rem ? a.i - b.i : b.rem > a.rem ? 1 : -1));
  const out = base.slice();
  let k = 0;
  while (leftover > 0n && k < remainders.length) {
    out[remainders[k].i] += 1n;
    leftover -= 1n;
    k++;
  }
  return out;
}

/** Sum a list of BigInt minor units. @param {readonly bigint[]} xs */
export function sumMinor(xs) {
  return xs.reduce((a, b) => a + b, 0n);
}

/** Clamp a BigInt between lo and hi. */
export function clampBig(x, lo, hi) {
  return x < lo ? lo : x > hi ? hi : x;
}

/** max(0, x) */
export function nonNeg(x) {
  return x < 0n ? 0n : x;
}
