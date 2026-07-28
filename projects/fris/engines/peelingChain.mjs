// @ts-check
/**
 * Deterministic peeling-chain simulator (Chain-Link Engine).
 *
 * Models the classic laundering "peel chain": a main wallet forwards most of its
 * balance to the next wallet while peeling a small amount to a cash-out
 * destination at each hop. Fully deterministic from (seed + config).
 *
 * Value conservation (exact, tested):
 *   initialValue === residual + totalPeeled + totalFees
 *
 * All amounts are held as BigInt in 1e-8 minor units ("sats") so there is no
 * floating-point drift.
 */
import { Rng } from './prng.mjs';

const CRYPTO_SCALE = 8;
const CRYPTO_ONE = 10n ** BigInt(CRYPTO_SCALE);

/**
 * @typedef {Object} PeelConfig
 * @property {number|string} seed
 * @property {number} initialValue         Whole asset units (e.g. 120.5).
 * @property {string} [assetSymbol]        e.g. "ETH".
 * @property {number} [hops]               Number of hops (default 55).
 * @property {number} [peelPercent]        Fraction peeled each hop (0..1), e.g. 0.08.
 * @property {number} [minPeel]            Minimum peel per hop (whole units).
 * @property {number} [feePerTx]           Fee per transaction (whole units).
 * @property {number} [timeIntervalSec]    Base seconds between hops.
 * @property {number} [intervalVariance]   Variance fraction on the interval (0..1).
 * @property {boolean} [exchangeAggregation] Bias late-hop peels toward exchanges.
 * @property {boolean} [bridgeEvent]       Insert a bridge hop.
 * @property {boolean} [mixerEvent]        Insert a mixer hop.
 * @property {Record<string, number>} [destinationProbabilities]
 * @property {string} [startTs]            ISO start timestamp.
 */

const DEFAULT_DESTS = { exchange: 0.4, merchant: 0.2, wallet: 0.25, bridge: 0.1, mixer: 0.05 };

/** Convert whole units to BigInt sats. @param {number} v */
function toSats(v) {
  return BigInt(Math.round(v * Number(CRYPTO_ONE)));
}
/** @param {bigint} s */
export function fromSats(s) {
  const neg = s < 0n;
  const a = neg ? -s : s;
  const i = a / CRYPTO_ONE;
  const f = (a % CRYPTO_ONE).toString().padStart(CRYPTO_SCALE, '0').replace(/0+$/, '');
  return (neg ? '-' : '') + i.toString() + (f ? '.' + f : '');
}

/**
 * Run the simulation.
 * @param {PeelConfig} config
 */
export function simulatePeelChain(config) {
  const cfg = normaliseConfig(config);
  const rng = new Rng(`${cfg.seed}:peel`);
  const asset = cfg.assetSymbol;
  const feeSats = toSats(cfg.feePerTx);
  const minPeelSats = toSats(cfg.minPeel);
  const bp = BigInt(Math.round(cfg.peelPercent * 10000)); // basis points
  const bridgeAt = cfg.bridgeEvent ? Math.floor(cfg.hops * 0.4) : -1;
  const mixerAt = cfg.mixerEvent ? Math.floor(cfg.hops * 0.6) : -1;

  let V = toSats(cfg.initialValue);
  let totalPeeled = 0n;
  let totalFees = 0n;
  let cumFees = 0n;
  let t = new Date(cfg.startTs).getTime();
  let prevInterval = null;
  let velocityAnomalies = 0;
  const exchangeDestinations = new Set();
  /** @type {any[]} */
  const hops = [];
  let mainAddr = synthAddr(rng, asset);

  for (let h = 1; h <= cfg.hops; h++) {
    if (V <= feeSats + minPeelSats) break; // estate exhausted
    // peel amount
    let peel = (V * bp) / 10000n;
    if (peel < minPeelSats) peel = minPeelSats;
    if (peel > V - feeSats) peel = V - feeSats;

    // destination type
    let destType;
    if (h === bridgeAt) destType = 'bridge';
    else if (h === mixerAt) destType = 'mixer';
    else {
      const probs = { ...cfg.destinationProbabilities };
      if (cfg.exchangeAggregation && h > cfg.hops * 0.7) probs.exchange = (probs.exchange || 0.4) + 0.4;
      destType = rng.weighted(Object.entries(probs));
    }
    const destAddr = synthAddr(rng, asset);
    if (destType === 'exchange') exchangeDestinations.add(destAddr);

    // time interval + velocity anomaly
    const variance = 1 + (rng.float() * 2 - 1) * cfg.intervalVariance;
    const interval = Math.max(1, Math.round(cfg.timeIntervalSec * variance));
    if (prevInterval != null && interval < cfg.timeIntervalSec * 0.2) velocityAnomalies++;
    prevInterval = interval;
    t += interval * 1000;

    const nextAddr = synthAddr(rng, asset);
    const forwarded = V - peel - feeSats;

    totalPeeled += peel;
    totalFees += feeSats;
    cumFees += feeSats;

    hops.push({
      hop: h,
      fromAddr: mainAddr,
      toAddr: nextAddr,
      forwardedSats: forwarded.toString(),
      forwarded: fromSats(forwarded),
      peelSats: peel.toString(),
      peel: fromSats(peel),
      feeSats: feeSats.toString(),
      fee: fromSats(feeSats),
      peelDestType: destType,
      peelDestAddr: destAddr,
      ts: new Date(t).toISOString(),
      intervalSec: interval,
      cumulativeFees: fromSats(cumFees),
      residualAfter: fromSats(forwarded),
      asset,
    });

    V = forwarded;
    mainAddr = nextAddr;
  }

  const residual = V;
  const summary = {
    seed: cfg.seed,
    asset,
    initialValue: fromSats(toSats(cfg.initialValue)),
    hopCount: hops.length,
    totalPeeled: fromSats(totalPeeled),
    residual: fromSats(residual),
    cumulativeFees: fromSats(totalFees),
    exchangeDestinations: exchangeDestinations.size,
    velocityAnomalies,
    conserved:
      toSats(cfg.initialValue) === residual + totalPeeled + totalFees,
    // raw sats for exact assertions
    _initialSats: toSats(cfg.initialValue).toString(),
    _residualSats: residual.toString(),
    _peeledSats: totalPeeled.toString(),
    _feesSats: totalFees.toString(),
  };
  const alerts = summaryAlerts(summary, hops);
  return { config: cfg, hops, summary, alerts };
}

/** @param {PeelConfig} config */
export function normaliseConfig(config) {
  return {
    seed: config.seed ?? 20260701,
    initialValue: clampNum(config.initialValue ?? 100, 0.00000001, 1e9),
    assetSymbol: config.assetSymbol || 'ETH',
    hops: Math.max(1, Math.min(2000, Math.floor(config.hops ?? 55))),
    peelPercent: clampNum(config.peelPercent ?? 0.08, 0.0001, 0.9),
    minPeel: clampNum(config.minPeel ?? 0.01, 0, 1e6),
    feePerTx: clampNum(config.feePerTx ?? 0.001, 0, 1e6),
    timeIntervalSec: clampNum(config.timeIntervalSec ?? 900, 1, 1e7),
    intervalVariance: clampNum(config.intervalVariance ?? 0.4, 0, 1),
    exchangeAggregation: !!config.exchangeAggregation,
    bridgeEvent: config.bridgeEvent ?? true,
    mixerEvent: config.mixerEvent ?? true,
    destinationProbabilities: config.destinationProbabilities || DEFAULT_DESTS,
    startTs: config.startTs || '2026-01-05T09:00:00.000Z',
  };
}

function summaryAlerts(summary, hops) {
  /** @type {{type:string,severity:string,reason:string}[]} */
  const alerts = [];
  if (summary.hopCount >= 50)
    alerts.push({
      type: 'peel_chain',
      severity: 'High',
      reason: `Sequential peel chain of ${summary.hopCount} hops detected — classic layering topology.`,
    });
  if (summary.velocityAnomalies > 0)
    alerts.push({
      type: 'velocity_anomaly',
      severity: 'Medium',
      reason: `${summary.velocityAnomalies} hop(s) executed at anomalously high velocity (< 20% of base interval).`,
    });
  if (hops.some((h) => h.peelDestType === 'mixer'))
    alerts.push({ type: 'mixer_proximity', severity: 'High', reason: 'Funds routed within one hop of a mixing service.' });
  if (hops.some((h) => h.peelDestType === 'bridge'))
    alerts.push({ type: 'bridge_usage', severity: 'Medium', reason: 'Cross-chain bridge used mid-chain to break provenance.' });
  if (summary.exchangeDestinations >= 3)
    alerts.push({
      type: 'exchange_convergence',
      severity: 'Medium',
      reason: `Peels converge on ${summary.exchangeDestinations} distinct exchange deposit addresses.`,
    });
  return alerts;
}

function synthAddr(rng, asset) {
  const prefix = asset === 'BTC' ? 'bc1' : '0x';
  return prefix + rng.hex(asset === 'BTC' ? 18 : 20);
}
function clampNum(x, lo, hi) {
  x = Number(x);
  if (!Number.isFinite(x)) return lo;
  return Math.min(hi, Math.max(lo, x));
}
