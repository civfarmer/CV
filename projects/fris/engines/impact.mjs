// @ts-check
/**
 * Operational Impact Score (Regulatory Horizon).
 * Deterministic, explainable 0–100 score with per-factor contributions.
 *
 * The score blends the OBLIGATION BURDEN of an instrument (enforcement exposure,
 * breadth of business functions affected, magnitude of change, reporting /
 * technology / training / recordkeeping duties, cross-border reach, population of
 * affected entities) with a COMPLIANCE-URGENCY signal that models WHEN action is
 * required. Urgency is a *window*, not a step: an imminent FUTURE effective /
 * compliance date scores highest (that is the thing to prepare for now), a
 * recently-in-force instrument is moderate (still bedding in), and a long-settled
 * in-force instrument is low urgency (the work is historic). This is what a
 * horizon-scanning tool must prioritise — the burden factors keep the overall
 * "impact" sensible regardless of timing.
 */

/**
 * @typedef {Object} ImpactInput
 * @property {number} [daysToEffective]        Days until the effective date (negative = already in force).
 * @property {number} [businessFunctionsAffected]
 * @property {number} [enforcementExposure]    0..1 (0 none, 1 severe penalties).
 * @property {number} [policyChangeMagnitude]  0..1.
 * @property {boolean} [reportingObligations]
 * @property {boolean} [technologyChanges]
 * @property {boolean} [trainingRequirements]
 * @property {boolean} [recordkeepingRequirements]
 * @property {boolean} [crossBorder]
 * @property {number} [affectedEntities]
 */

// Urgency window (days). A future effective date within PEAK_FUTURE days is the
// operational priority (norm ~1). Beyond that, further-out dates carry a moderate,
// linearly-decaying lead-time urgency down to a floor. Once in force, urgency
// starts moderate (recently effective) and decays toward ~0 as the instrument
// becomes long-settled.
export const URGENCY = {
  peakFutureDays: 180,      // 0..180 days ahead => maximum urgency
  futureHorizonDays: 900,   // lead-time urgency fades to its floor by ~2.5y out
  futureFloor: 0.45,        // a far-future obligation still carries real urgency
  inForceStartDays: 730,    // "recently in force" window (~2y) starts at ~0.55
  inForceStart: 0.55,       // urgency the day it comes into force
  inForceFloor: 0.05,       // long-settled floor
};

/**
 * Compliance-urgency norm in [0,1] from days-to-effective.
 * @param {number} d days until effective (negative = in force that many days ago)
 */
export function urgencyNorm(d) {
  if (!Number.isFinite(d)) d = 365;
  if (d >= 0) {
    // FUTURE: imminent = peak, then decay by lead time to a floor.
    if (d <= URGENCY.peakFutureDays) return 1;
    const span = Math.max(1, URGENCY.futureHorizonDays - URGENCY.peakFutureDays);
    const t = Math.min(1, (d - URGENCY.peakFutureDays) / span);
    return clamp01(1 - t * (1 - URGENCY.futureFloor));
  }
  // IN FORCE: start moderate the day it takes effect, decay as it becomes settled.
  const ago = -d;
  const t = Math.min(1, ago / URGENCY.inForceStartDays);
  return clamp01(URGENCY.inForceStart - t * (URGENCY.inForceStart - URGENCY.inForceFloor));
}

/** Human-readable urgency description. */
function urgencyDescribe(d) {
  if (!Number.isFinite(d)) return 'Effective date unknown.';
  if (d >= 0) {
    if (d <= URGENCY.peakFutureDays) return `Effective in ${d} day(s) — imminent, prepare now.`;
    return `Effective in ${d} day(s) — on the horizon, lead time to plan.`;
  }
  const ago = -d;
  if (ago <= URGENCY.inForceStartDays) return `In force for ${ago} day(s) — recently effective, still bedding in.`;
  return `In force for ${ago} day(s) — long settled, low residual urgency.`;
}

/** @type {Array<{key:string,label:string,weight:number,norm:(i:ImpactInput)=>number,describe:(i:ImpactInput)=>string}>} */
export const IMPACT_FACTORS = [
  {
    key: 'urgency',
    label: 'Compliance urgency (deadline window)',
    weight: 16,
    norm: (i) => urgencyNorm(num(i.daysToEffective, 365)),
    describe: (i) => urgencyDescribe(num(i.daysToEffective, 365)),
  },
  { key: 'functions', label: 'Business functions affected', weight: 13, norm: (i) => clamp01(num(i.businessFunctionsAffected, 0) / 6), describe: (i) => `${num(i.businessFunctionsAffected, 0)} business function(s) affected.` },
  { key: 'enforcement', label: 'Enforcement exposure', weight: 15, norm: (i) => clamp01(num(i.enforcementExposure, 0)), describe: (i) => `Enforcement exposure rated ${Math.round(clamp01(num(i.enforcementExposure, 0)) * 100)}%.` },
  { key: 'magnitude', label: 'Policy-change magnitude', weight: 12, norm: (i) => clamp01(num(i.policyChangeMagnitude, 0)), describe: (i) => `Policy change magnitude ${Math.round(clamp01(num(i.policyChangeMagnitude, 0)) * 100)}%.` },
  { key: 'reporting', label: 'Reporting obligations', weight: 9, norm: (i) => bool(i.reportingObligations), describe: (i) => (i.reportingObligations ? 'Introduces new reporting obligations.' : 'No new reporting obligations.') },
  { key: 'technology', label: 'Technology changes', weight: 8, norm: (i) => bool(i.technologyChanges), describe: (i) => (i.technologyChanges ? 'Requires systems/technology changes.' : 'No technology changes required.') },
  { key: 'training', label: 'Training requirements', weight: 6, norm: (i) => bool(i.trainingRequirements), describe: (i) => (i.trainingRequirements ? 'Requires staff training.' : 'No training requirements.') },
  { key: 'recordkeeping', label: 'Recordkeeping requirements', weight: 7, norm: (i) => bool(i.recordkeepingRequirements), describe: (i) => (i.recordkeepingRequirements ? 'Adds recordkeeping/retention duties.' : 'No new recordkeeping duties.') },
  { key: 'crossborder', label: 'Cross-border implications', weight: 8, norm: (i) => bool(i.crossBorder), describe: (i) => (i.crossBorder ? 'Has cross-border implications.' : 'Domestic scope only.') },
  { key: 'entities', label: 'Affected entities', weight: 6, norm: (i) => clamp01(num(i.affectedEntities, 0) / 50), describe: (i) => `${num(i.affectedEntities, 0)} entit(y/ies) affected.` },
];

const TOTAL = IMPACT_FACTORS.reduce((a, f) => a + f.weight, 0);

/**
 * @param {ImpactInput} input
 * @returns {{score:number, level:'High'|'Medium'|'Low', factors:Array<{key:string,label:string,points:number,explanation:string}>}}
 */
export function computeImpact(input) {
  let weighted = 0;
  const factors = IMPACT_FACTORS.map((f) => {
    const n = clamp01(f.norm(input));
    weighted += f.weight * n;
    return { key: f.key, label: f.label, points: round2((f.weight * n / TOTAL) * 100), explanation: f.describe(input) };
  });
  const score = Math.round((weighted / TOTAL) * 100);
  factors.sort((a, b) => b.points - a.points);
  return { score, level: level(score), factors };
}

/** @param {number} score */
export function level(score) {
  if (score >= 66) return 'High';
  if (score >= 33) return 'Medium';
  return 'Low';
}

/** Days between now and an ISO date (positive = future). */
export function daysUntil(dateStr, from = new Date()) {
  if (!dateStr) return 365;
  const d = new Date(dateStr).getTime();
  if (Number.isNaN(d)) return 365;
  return Math.round((d - from.getTime()) / 86400000);
}

function clamp01(x) { return Number.isNaN(x) || x < 0 ? 0 : x > 1 ? 1 : x; }
function bool(x) { return x ? 1 : 0; }
function num(x, d = 0) { const n = Number(x); return Number.isFinite(n) ? n : d; }
function round2(x) { return Math.round(x * 100) / 100; }
