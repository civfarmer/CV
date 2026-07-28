// @ts-check
/**
 * Third-Party / Vendor Risk — deterministic composite risk-scoring engine.
 *
 * Aggregates cross-module signals into ONE explainable composite risk score for
 * a vendor / counterparty. Built in the transparent weighted-factor idiom of
 * `flightRisk.mjs` / `impact.mjs`: every dimension maps its raw inputs to a
 * normalised [0,1] contribution; the composite is the weighted average scaled to
 * 0–100, so EVERY point is attributable to a named dimension and reproducible
 * from the same inputs. There are no hidden components.
 *
 *   composite = round( Σ(weightᵢ · normᵢ) / Σ(weightᵢ) · 100 )
 *
 * The six dimensions, each reusing a real FRIS signal where one exists:
 *   1. Ownership & flight risk   — reuse the Nexus flight-risk score (graph.mjs
 *                                  structureSummary → flightRisk.computeFlightRisk)
 *                                  when the vendor links to a seeded entity.
 *   2. Sanctions / PEP exposure  — reuse the Screening engine's best hit
 *                                  (screening.screen / batch overlay sanctionedIds)
 *                                  against the vendor name / linked entity.
 *   3. Jurisdiction & secrecy    — the home jurisdiction's secrecy score /
 *                                  offshore status (jurisdictions data).
 *   4. Financial & criticality   — annual spend + business-criticality tier
 *                                  (a bigger, more critical vendor is a bigger
 *                                  inherent exposure) + inherent category risk.
 *   5. Adverse signals           — synthetic adverse-media / red-flag markers on
 *                                  the vendor row, severity-weighted.
 *   6. Governance & data access   — contract status (expired/lapsed) + data-access
 *                                  sensitivity + review-cadence overdue-ness.
 *
 * Output: the composite 0–100 score, a banded rating (Low / Medium / High /
 * Critical), the per-dimension contributions (points + share of the score + a
 * plain-English explanation), the winning signals, and recommended due-diligence
 * actions.
 *
 * A SANCTIONS hit is treated as an overriding factor: a vendor with a strong
 * synthetic sanctions match is floored to CRITICAL regardless of the weighted
 * average (the industry treats a true sanctions hit as a hard stop), and the
 * override is surfaced explicitly so it is never a hidden adjustment.
 *
 * ── Determinism ──────────────────────────────────────────────────────────────
 * Same vendor + same signals → same output, byte-for-byte. Pure arithmetic,
 * stable ordering, no Date.now() (the "as-of" date is passed in), no randomness,
 * no network, no dependencies.
 *
 * ── Honesty ──────────────────────────────────────────────────────────────────
 * The register and signals are SYNTHETIC (see data/vendors.mjs). This engine
 * demonstrates TPRM scoring mechanics; it is NOT a vendor-risk system of record.
 */

import {
  VENDORS, VENDOR_BY_ID, CATEGORY_BY_CODE, CONTRACT_STATUS_BY_CODE,
  CRITICALITY_BY_TIER, DATA_ACCESS_BY_CODE, REVIEW_CADENCE_DAYS,
  VENDOR_DISCLAIMER, VENDOR_VERSION,
} from '../data/vendors.mjs';

// A fixed "as-of" reference so cadence maths are deterministic in tests and the
// e2e harness. Callers (routes) may pass a different asOf; the default keeps unit
// tests reproducible without a clock.
export const DEFAULT_AS_OF = '2026-07-01';

// ── Dimension definitions (weighted-factor model) ────────────────────────────
// Each dimension: a key, a display label, a weight, a norm(inputs)→[0,1] that
// reads a NORMALISED signal object, and a describe(inputs)→string.
/** @type {Array<{key:string,label:string,weight:number,norm:(s:object)=>number,describe:(s:object)=>string}>} */
export const RISK_DIMENSIONS = [
  {
    key: 'ownership',
    label: 'Ownership & flight risk',
    weight: 22,
    norm: (s) => clamp01(num(s.flightRiskScore) / 100),
    describe: (s) => (s.linkedEntityId
      ? `Linked Nexus entity ${s.linkedEntityId} carries a flight-risk score of ${num(s.flightRiskScore)}/100 (${s.flightRiskBand || 'n/a'}); ${num(s.ownershipDepth)} ownership layer(s), ${num(s.jurisdictionCount)} jurisdiction(s).`
      : 'No linked Sovereign Nexus entity — ownership / flight-risk could not be pulled; treated as neutral.'),
  },
  {
    key: 'sanctions',
    label: 'Sanctions / PEP exposure',
    weight: 24,
    norm: (s) => clamp01(num(s.screeningNorm)),
    describe: (s) => {
      if (!s.screeningMatched) return 'No public-sanctions-subset match on the vendor name or linked entity.';
      return `Public-sanctions-subset ${s.screeningList || 'watchlist'} match "${s.screeningMatchedName || ''}" scored ${num(s.screeningScore)}/100 (${s.screeningBand || ''} band) — ${s.screeningList === 'sanctions' ? 'OVERRIDING sanctions exposure' : 'elevated exposure'}.`;
    },
  },
  {
    key: 'jurisdiction',
    label: 'Jurisdiction & secrecy',
    weight: 16,
    norm: (s) => clamp01(0.75 * (num(s.secrecyScore) / 100) + (s.offshore ? 0.25 : 0)),
    describe: (s) => (s.homeJurisdiction
      ? `Home jurisdiction ${s.jurisdictionLabel || s.homeJurisdiction} has a secrecy score of ${num(s.secrecyScore)}/100${s.offshore ? ' and is an offshore centre' : ''}.`
      : 'No home jurisdiction on file — treated as neutral.'),
  },
  {
    key: 'financial',
    label: 'Financial & criticality',
    weight: 16,
    // Blend: business criticality (tier weight), spend exposure (log-scaled to
    // ~USD 10m), and the category's inherent risk. All in [0,1].
    norm: (s) => clamp01(0.45 * num(s.criticalityWeight) + 0.30 * spendNorm(num(s.annualSpend)) + 0.25 * num(s.categoryInherent)),
    describe: (s) => `${s.criticalityLabel || 'Criticality n/a'}; annual spend ~USD ${fmtThousands(num(s.annualSpend))}k; ${s.categoryLabel || 'category n/a'} (inherent ${pct(num(s.categoryInherent))}).`,
  },
  {
    key: 'adverse',
    label: 'Adverse signals',
    weight: 12,
    norm: (s) => clamp01(num(s.adverseNorm)),
    describe: (s) => (num(s.adverseCount) > 0
      ? `${num(s.adverseCount)} adverse signal(s) on file (severity-weighted): ${(s.adverseLabels || []).slice(0, 3).join('; ')}${(s.adverseLabels || []).length > 3 ? '…' : ''}.`
      : 'No adverse-media or red-flag signals recorded.'),
  },
  {
    key: 'governance',
    label: 'Governance & data access',
    weight: 10,
    // Blend: contract-status risk, data-access sensitivity, and overdue review.
    norm: (s) => clamp01(0.45 * num(s.contractRisk) + 0.35 * num(s.dataAccessWeight) + 0.20 * (s.reviewOverdue ? 1 : num(s.reviewProgress))),
    describe: (s) => `Contract ${s.contractLabel || 'n/a'}; ${s.dataAccessLabel || 'data access n/a'}; review ${s.reviewOverdue ? `OVERDUE by ${num(s.reviewOverdueDays)} day(s)` : `due in ${num(s.reviewDueInDays)} day(s)`}.`,
  },
];

const TOTAL_WEIGHT = RISK_DIMENSIONS.reduce((a, d) => a + d.weight, 0);

// ── Rating bands (0–100 → Low / Medium / High / Critical) ────────────────────
export const RATING_BANDS = Object.freeze([
  { code: 'Low', min: 0, color: '#46b877', blurb: 'Standard due diligence; review on the normal cadence.' },
  { code: 'Medium', min: 35, color: '#e5a53b', blurb: 'Enhanced monitoring; shorten the review cadence.' },
  { code: 'High', min: 60, color: '#f0616d', blurb: 'Enhanced due diligence; senior sign-off before renewal.' },
  { code: 'Critical', min: 80, color: '#c1121f', blurb: 'Escalate immediately; consider suspension pending review.' },
]);

/** Map a 0–100 composite score to its rating band code. @param {number} score */
export function ratingFor(score) {
  let out = RATING_BANDS[0].code;
  for (const b of RATING_BANDS) if (score >= b.min) out = b.code;
  return out;
}
/** The band record for a rating code. @param {string} code */
export function bandRecord(code) { return RATING_BANDS.find((b) => b.code === code) || RATING_BANDS[0]; }

// ── Public: score one vendor from its cross-module signals ────────────────────
/**
 * @typedef {Object} VendorSignals
 * @property {object|null} [flightRisk]   Nexus flight-risk result { score, band, factors, structure? }.
 * @property {object|null} [screening]    Best screening hit { score, band, list, matchedName } or null.
 * @property {{ code:string, secrecy_score?:number, is_offshore?:number|boolean, name?:string }|null} [jurisdiction]  Seeded jurisdiction row.
 * @property {string} [asOf]              ISO "as-of" date for cadence maths (default DEFAULT_AS_OF).
 */

/**
 * Compute a vendor's composite risk score + full explanation.
 * @param {object} vendor            A row from data/vendors.mjs (or same shape).
 * @param {VendorSignals} [signals]  Cross-module signals (all optional).
 * @returns {object}
 */
export function scoreVendor(vendor, signals = {}) {
  const s = normaliseSignals(vendor, signals);

  // Per-dimension contributions.
  let weighted = 0;
  const dimensions = RISK_DIMENSIONS.map((d) => {
    const n = clamp01(d.norm(s));
    const contribution = d.weight * n;
    weighted += contribution;
    return {
      key: d.key,
      label: d.label,
      weight: d.weight,
      normalised: round2(n),
      points: round2((contribution / TOTAL_WEIGHT) * 100), // share of the 0–100 composite
      contributionPct: 0, // filled after the composite is known
      explanation: d.describe(s),
    };
  });

  let composite = Math.round((weighted / TOTAL_WEIGHT) * 100);
  const baseComposite = composite;

  // ── Sanctions override ──────────────────────────────────────────────────────
  // A strong synthetic SANCTIONS match is a hard stop: floor the composite to the
  // Critical threshold (industry treats a true sanctions hit as non-negotiable).
  // Surfaced explicitly so it is never a hidden adjustment.
  const override = { applied: false, reason: null, floor: null };
  if (s.screeningList === 'sanctions' && s.screeningBand === 'strong') {
    const floor = bandRecord('Critical').min;
    if (composite < floor) { composite = floor; override.applied = true; override.reason = 'Strong real-public-source sanctions match — floored to Critical (hard stop).'; override.floor = floor; }
    else { override.applied = true; override.reason = 'Strong real-public-source sanctions match — composite already at/above Critical.'; override.floor = floor; }
  }
  composite = Math.max(0, Math.min(100, composite));

  // contributionPct = share of the FINAL composite attributable to each dimension.
  for (const d of dimensions) d.contributionPct = composite > 0 ? round2((d.points / composite) * 100) : 0;
  // Stable ordering: biggest contributor first, then a stable dimension key.
  dimensions.sort((a, b) => (b.points - a.points) || String(a.key).localeCompare(String(b.key)));

  const rating = ratingFor(composite);
  const band = bandRecord(rating);

  return {
    vendorId: vendor.id,
    name: vendor.name,
    category: vendor.category,
    categoryLabel: s.categoryLabel,
    homeJurisdiction: vendor.homeJurisdiction || null,
    jurisdictionLabel: s.jurisdictionLabel,
    criticality: vendor.criticality,
    criticalityLabel: s.criticalityLabel,
    annualSpend: vendor.annualSpend,
    contractStatus: vendor.contractStatus,
    contractLabel: s.contractLabel,
    dataAccess: vendor.dataAccess,
    entityId: vendor.entityId || null,
    composite,
    baseComposite,
    rating,
    ratingColor: band.color,
    ratingBlurb: band.blurb,
    totalWeight: TOTAL_WEIGHT,
    dimensions,
    override,
    signals: {
      flightRisk: s.linkedEntityId ? { entityId: s.linkedEntityId, score: s.flightRiskScore, band: s.flightRiskBand, depth: s.ownershipDepth, jurisdictions: s.jurisdictionCount } : null,
      screening: s.screeningMatched ? { matched: true, score: s.screeningScore, band: s.screeningBand, list: s.screeningList, matchedName: s.screeningMatchedName } : { matched: false },
      jurisdiction: s.homeJurisdiction ? { code: s.homeJurisdiction, label: s.jurisdictionLabel, secrecy: s.secrecyScore, offshore: !!s.offshore } : null,
      adverse: { count: s.adverseCount, labels: s.adverseLabels },
      review: { asOf: s.asOf, lastReviewedAt: vendor.lastReviewedAt || null, dueAt: s.reviewDueAt, overdue: s.reviewOverdue, overdueDays: s.reviewOverdueDays, dueInDays: s.reviewDueInDays, cadenceDays: s.cadenceDays },
    },
    recommendedActions: recommendActions(vendor, s, { composite, rating, override }),
    data_classification: 'synthetic-demo',
  };
}

// ── Public: score the whole register (portfolio) ─────────────────────────────
/**
 * Score every vendor and return a ranked register + a portfolio summary. The
 * `signalsFor(vendor)` resolver supplies cross-module signals per vendor (the
 * routes wire it to the graph / screening / jurisdiction data). When omitted,
 * vendors are scored from their row alone (jurisdiction secrecy still applied if
 * a `jurisdictions` map is passed).
 *
 * @param {object} [opts]
 * @param {(vendor:object)=>VendorSignals} [opts.signalsFor]  Per-vendor signal resolver.
 * @param {Record<string,{code:string,secrecy_score?:number,is_offshore?:number|boolean,name?:string}>} [opts.jurisdictions]  Optional jurisdiction lookup by code (used when signalsFor omits it).
 * @param {string} [opts.asOf]  ISO as-of date.
 * @param {object[]} [opts.vendors]  Override the vendor list (defaults to the register).
 * @returns {object}
 */
export function scoreAll(opts = {}) {
  const asOf = opts.asOf || DEFAULT_AS_OF;
  const list = Array.isArray(opts.vendors) ? opts.vendors : VENDORS;
  const jmap = opts.jurisdictions || null;

  const scored = list.map((v) => {
    const sig = opts.signalsFor ? (opts.signalsFor(v) || {}) : {};
    if (!sig.asOf) sig.asOf = asOf;
    if (!sig.jurisdiction && jmap && v.homeJurisdiction) sig.jurisdiction = jmap[v.homeJurisdiction] || null;
    return scoreVendor(v, sig);
  });

  // Stable ordering: composite desc, then vendor id asc.
  scored.sort((a, b) => (b.composite - a.composite) || String(a.vendorId).localeCompare(String(b.vendorId)));

  // ── Portfolio summary ──────────────────────────────────────────────────────
  const byRating = {}; for (const b of RATING_BANDS) byRating[b.code] = 0;
  const byCategory = {};
  let totalSpend = 0;
  const overdue = [];
  for (const v of scored) {
    byRating[v.rating] = (byRating[v.rating] || 0) + 1;
    byCategory[v.category] = (byCategory[v.category] || 0) + 1;
    totalSpend += Number(v.annualSpend) || 0;
    if (v.signals.review && v.signals.review.overdue) overdue.push({ vendorId: v.vendorId, name: v.name, overdueDays: v.signals.review.overdueDays, rating: v.rating });
  }
  // Concentration: spend share of the top vendor and top-3 vendors (a classic
  // third-party concentration risk metric). Computed over the ranked-by-spend list.
  const bySpend = scored.slice().sort((a, b) => (Number(b.annualSpend) - Number(a.annualSpend)) || String(a.vendorId).localeCompare(String(b.vendorId)));
  const topSpend = bySpend[0] ? Number(bySpend[0].annualSpend) : 0;
  const top3Spend = bySpend.slice(0, 3).reduce((a, v) => a + (Number(v.annualSpend) || 0), 0);
  const criticalTier1 = scored.filter((v) => v.criticality === 1).length;

  // Top risks (highest composite) — a compact list for the dashboard.
  const topRisks = scored.slice(0, 5).map((v) => ({ vendorId: v.vendorId, name: v.name, composite: v.composite, rating: v.rating, category: v.category, topDimension: v.dimensions[0] ? v.dimensions[0].label : null }));

  return {
    vendors: scored,
    summary: {
      total: scored.length,
      byRating,
      byCategory,
      totalSpendThousands: totalSpend,
      concentration: {
        topVendorSharePct: totalSpend > 0 ? round1((topSpend / totalSpend) * 100) : 0,
        top3SharePct: totalSpend > 0 ? round1((top3Spend / totalSpend) * 100) : 0,
        criticalTier1,
      },
      overdueReviews: overdue.sort((a, b) => b.overdueDays - a.overdueDays),
      topRisks,
      asOf,
    },
    ratingBands: RATING_BANDS.map((b) => ({ code: b.code, min: b.min, color: b.color, blurb: b.blurb })),
    disclaimer: VENDOR_DISCLAIMER,
    version: VENDOR_VERSION,
  };
}

// ── Recommended due-diligence actions (deterministic, evidence-driven) ────────
/**
 * Derive a prioritised, deterministic set of recommended actions from the
 * vendor's signals and composite. Each action { priority, action, rationale }.
 * @param {object} vendor @param {object} s @param {{composite:number,rating:string,override:object}} r
 */
function recommendActions(vendor, s, r) {
  const acts = [];
  const push = (priority, action, rationale) => acts.push({ priority, action, rationale });

  if (s.screeningList === 'sanctions' && (s.screeningBand === 'strong' || s.screeningBand === 'possible')) {
    push('Critical', 'Escalate to compliance and freeze new commitments pending sanctions review', `A synthetic ${s.screeningBand} sanctions match ("${s.screeningMatchedName}") requires immediate confirmation before any further dealing.`);
  } else if (s.screeningMatched) {
    push('High', 'Run a full screening review and disposition the watchlist match', `A synthetic ${s.screeningList} match was found — confirm or clear it in Screening & Watchlist.`);
  }

  if (s.linkedEntityId && num(s.flightRiskScore) >= 66) {
    push('High', 'Obtain a complete beneficial-ownership chart and verify UBOs', `The linked Nexus entity ${s.linkedEntityId} has a high flight-risk score (${num(s.flightRiskScore)}/100); ownership opacity should be resolved.`);
  } else if (!s.linkedEntityId) {
    push('Medium', 'Establish ultimate beneficial ownership (no Nexus link on file)', 'The vendor is not linked to a Sovereign Nexus entity, so ownership could not be pulled — perform primary UBO due diligence.');
  }

  if (num(s.secrecyScore) >= 75) {
    push('High', 'Apply enhanced due diligence for a high-secrecy jurisdiction', `The home jurisdiction (${s.jurisdictionLabel || s.homeJurisdiction}) scores ${num(s.secrecyScore)}/100 on secrecy${s.offshore ? ' and is offshore' : ''}.`);
  } else if (num(s.secrecyScore) >= 60) {
    push('Medium', 'Document the rationale for engaging in a moderate-secrecy jurisdiction', `The home jurisdiction (${s.jurisdictionLabel || s.homeJurisdiction}) carries elevated secrecy (${num(s.secrecyScore)}/100).`);
  }

  if (s.reviewOverdue) {
    push('High', `Complete the overdue periodic re-assessment (overdue by ${num(s.reviewOverdueDays)} days)`, `The last review was ${vendor.lastReviewedAt || 'n/a'}; the ${num(s.cadenceDays)}-day cadence has lapsed.`);
  } else if (num(s.reviewDueInDays) <= 30) {
    push('Medium', `Schedule the upcoming re-assessment (due in ${num(s.reviewDueInDays)} days)`, 'The review cadence is approaching; book it now to avoid a lapse.');
  }

  if (vendor.contractStatus === 'expired') push('High', 'Formalise or terminate the expired contract', 'The vendor is operating without a current agreement, creating governance and liability exposure.');
  else if (vendor.contractStatus === 'onboarding') push('Medium', 'Complete onboarding due-diligence before granting access', 'The vendor is mid-onboarding; finish KYC/EDD prior to go-live.');

  if (s.dataAccess === 'restricted') push('Medium', 'Verify a current data-processing agreement and security attestation', 'The vendor processes restricted / personal data; confirm the DPA and controls are in force.');

  if (vendor.criticality === 1) push('Medium', 'Confirm business-continuity and exit / substitutability planning', 'The vendor is Tier-1 critical; ensure a documented continuity and exit plan exists.');

  for (const a of vendor.adverse || []) {
    if (a.code === 'adverse-media') push('High', 'Assess and document the adverse-media finding', `Synthetic adverse-media signal on file: ${a.label}.`);
  }

  if (!acts.length) push('Low', 'Maintain standard monitoring on the normal cadence', 'No elevated signals detected; the vendor sits within appetite.');

  // Stable priority ordering (Critical → High → Medium → Low), then insertion.
  const rank = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  return acts
    .map((a, i) => ({ ...a, _i: i }))
    .sort((a, b) => ((rank[a.priority] ?? 4) - (rank[b.priority] ?? 4)) || (a._i - b._i))
    .map(({ _i, ...a }) => a);
}

// ── Signal normalisation (turn raw cross-module inputs into a flat signal set) ─
/** @param {object} vendor @param {VendorSignals} signals */
function normaliseSignals(vendor, signals) {
  const cat = CATEGORY_BY_CODE[vendor.category] || { label: vendor.category, inherent: 0.4 };
  const crit = CRITICALITY_BY_TIER[vendor.criticality] || { label: 'n/a', weight: 0.4 };
  const contract = CONTRACT_STATUS_BY_CODE[vendor.contractStatus] || { label: vendor.contractStatus, risk: 0.3 };
  const dataAcc = DATA_ACCESS_BY_CODE[vendor.dataAccess] || { label: vendor.dataAccess, weight: 0.3 };

  // Flight risk (from Nexus) — only when a linked entity supplied a result.
  const fr = signals.flightRisk || null;
  const linkedEntityId = vendor.entityId || (fr && fr.entityId) || null;
  const flightRiskScore = fr && typeof fr.score === 'number' ? fr.score : 0;
  const structure = (fr && fr.structure) || {};

  // Screening (from the Screening engine) — best hit or null.
  const sc = signals.screening || null;
  const screeningMatched = !!(sc && (sc.matched === undefined ? true : sc.matched) && typeof sc.score === 'number');
  const screeningScore = screeningMatched ? sc.score : 0;
  const screeningBand = screeningMatched ? (sc.band || bandForScreening(screeningScore)) : null;
  const screeningList = screeningMatched ? (sc.list || null) : null;
  // Screening dimension norm: sanctions weighs full; other lists scale down.
  const listWeight = screeningList === 'sanctions' ? 1.0 : screeningList === 'pep' ? 0.7 : screeningList === 'adverse-media' ? 0.6 : screeningList === 'internal' ? 0.4 : 0;
  const screeningNorm = screeningMatched ? clamp01((screeningScore / 100) * listWeight) : 0;

  // Jurisdiction secrecy (from the jurisdictions data).
  const j = signals.jurisdiction || null;
  const secrecyScore = j && j.secrecy_score != null ? Number(j.secrecy_score) : 0;
  const offshore = !!(j && (j.is_offshore === 1 || j.is_offshore === true));

  // Adverse signals (severity-weighted) on the vendor row.
  const sevW = { High: 1.0, Medium: 0.6, Low: 0.3 };
  const adverse = Array.isArray(vendor.adverse) ? vendor.adverse : [];
  const adverseLabels = adverse.map((a) => a.label);
  // Diminishing-returns aggregation: 1 - Π(1 - w) so multiple signals compound
  // but never exceed 1, and one High signal alone is already substantial.
  let adverseNorm = 0;
  { let prod = 1; for (const a of adverse) prod *= (1 - (sevW[a.severity] ?? 0.4)); adverseNorm = clamp01(1 - prod); }

  // Review cadence (deterministic from lastReviewedAt + criticality cadence).
  const asOf = signals.asOf || DEFAULT_AS_OF;
  const cadenceDays = REVIEW_CADENCE_DAYS[vendor.criticality] || 365;
  const last = parseDate(vendor.lastReviewedAt);
  const asOfD = parseDate(asOf);
  let reviewDueAt = null, reviewOverdue = false, reviewOverdueDays = 0, reviewDueInDays = cadenceDays, reviewProgress = 0;
  if (last && asOfD) {
    reviewDueAt = addDaysISO(vendor.lastReviewedAt, cadenceDays);
    const dueD = parseDate(reviewDueAt);
    const gapDays = daysBetween(asOfD, dueD); // positive = days until due; negative = overdue
    reviewProgress = clamp01(daysBetween(last, asOfD) / cadenceDays);
    if (gapDays < 0) { reviewOverdue = true; reviewOverdueDays = -gapDays; reviewDueInDays = 0; }
    else { reviewDueInDays = gapDays; }
  }

  return {
    // financial / criticality / category
    categoryLabel: cat.label, categoryInherent: cat.inherent,
    criticalityLabel: crit.label, criticalityWeight: crit.weight,
    annualSpend: Number(vendor.annualSpend) || 0,
    // ownership / flight
    linkedEntityId, flightRiskScore, flightRiskBand: fr ? fr.band : null,
    ownershipDepth: structure.depth != null ? structure.depth : (fr && fr.depth != null ? fr.depth : 0),
    jurisdictionCount: structure.jurisdictions != null ? structure.jurisdictions : (fr && fr.jurisdictions != null ? fr.jurisdictions : 0),
    // screening
    screeningMatched, screeningScore, screeningBand, screeningList, screeningNorm,
    screeningMatchedName: screeningMatched ? (sc.matchedName || vendor.name) : null,
    // jurisdiction
    homeJurisdiction: vendor.homeJurisdiction || null, jurisdictionLabel: vendor.jurisdictionLabel || (j && j.name) || null,
    secrecyScore, offshore,
    // adverse
    adverseCount: adverse.length, adverseLabels, adverseNorm,
    // governance
    contractLabel: contract.label, contractRisk: contract.risk,
    dataAccess: vendor.dataAccess, dataAccessLabel: dataAcc.label, dataAccessWeight: dataAcc.weight,
    asOf, cadenceDays, reviewDueAt, reviewOverdue, reviewOverdueDays, reviewDueInDays, reviewProgress,
  };
}

// ── Small pure helpers ───────────────────────────────────────────────────────
/** Log-scaled spend norm: ~USD 10m annual spend → 1.0. @param {number} thousands */
function spendNorm(thousands) {
  const v = Math.max(0, Number(thousands) || 0);
  if (v <= 0) return 0;
  // log10(v) over log10(10000) (10,000 thousands = USD 10m) → [0,1].
  return clamp01(Math.log10(v + 1) / Math.log10(10000));
}
function bandForScreening(score) { return score >= 85 ? 'strong' : score >= 60 ? 'possible' : 'weak'; }
function clamp01(x) { if (Number.isNaN(x) || x < 0) return 0; return x > 1 ? 1 : x; }
function num(x) { return typeof x === 'number' && !Number.isNaN(x) ? x : 0; }
function round1(x) { return Math.round(x * 10) / 10; }
function round2(x) { return Math.round(x * 100) / 100; }
function pct(x) { return Math.round(num(x) * 100) + '%'; }
function fmtThousands(n) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

// Date helpers (UTC, deterministic; no timezone surprises).
function parseDate(iso) { if (!iso) return null; const d = new Date(String(iso) + 'T00:00:00Z'); return Number.isNaN(d.getTime()) ? null : d; }
function daysBetween(a, b) { return Math.round((b.getTime() - a.getTime()) / 86400000); }
function addDaysISO(iso, days) { const d = parseDate(iso); if (!d) return null; d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }

// ── Meta re-exports the routes/UI consume ────────────────────────────────────
export { VENDORS, VENDOR_BY_ID, VENDOR_DISCLAIMER, VENDOR_VERSION, TOTAL_WEIGHT };
