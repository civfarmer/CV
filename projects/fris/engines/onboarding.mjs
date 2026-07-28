// @ts-check
/**
 * KYC / Onboarding & Identity-Risk — deterministic Customer Due Diligence (CDD)
 * rating engine that COMPOSES the other FRIS modules.
 *
 * For each applicant it runs the existing engines and folds their outputs into ONE
 * explainable customer-risk rating, in the transparent weighted-factor idiom of
 * `vendorRisk.mjs`: every risk factor maps its raw input to a normalised [0,1]
 * contribution; the customer-risk score is the weighted average scaled to 0–100, so
 * EVERY point is attributable to a named factor and reproducible from the same
 * inputs. There are no hidden components.
 *
 *   score = round( Σ(weightᵢ · normᵢ) / Σ(weightᵢ) · 100 )
 *
 * ── The engines it consumes (this is the point of the module) ─────────────────
 *   · Screening   (engines/screening.mjs)   — screen()/screenBatch(): the best
 *                                             sanctions / PEP / adverse-list match on
 *                                             the applicant (or its linked Nexus entity).
 *   · Adverse-Media (engines/adverseMedia.mjs) — subjectProfile()/classify(): the
 *                                             recency-weighted negative-news composite
 *                                             for the linked entity.
 *   · Country Risk (engines/countryRisk.mjs) — jurisdictionRisk()+sectorRisk(): the
 *                                             composed country band (anchored to the
 *                                             seeded secrecy score) and the inherent
 *                                             sector band, feeding the geography and
 *                                             industry factors.
 *
 * ── Overrides (surfaced, never hidden) ────────────────────────────────────────
 * A strong synthetic SANCTIONS match is a hard stop: the score is floored to the
 * Prohibited threshold (the industry treats a true sanctions hit as non-negotiable),
 * and the override is reported explicitly. EDD is REQUIRED whenever the rating is
 * High or above, OR the applicant self-declares PEP, OR a sanctions/PEP screening
 * match is found, OR the country of residence/incorporation composes to a Very-high
 * jurisdiction band — each trigger is listed in the assessment.
 *
 * ── Review cadence ────────────────────────────────────────────────────────────
 * The rating band sets the periodic-review cadence (Low = 36 months, Medium = 24,
 * High = 12 / annual, Prohibited = 6 with an escalate-to-decline posture). The next
 * review date is computed forward from a fixed "as-of" date so it is deterministic.
 *
 * ── Determinism ──────────────────────────────────────────────────────────────
 * Same applicant + same seeded facts → same output, byte-for-byte. Pure arithmetic,
 * stable ordering, no Date.now() (the as-of date is passed in / defaulted), no
 * randomness, no network, no dependencies.
 *
 * ── Honesty ──────────────────────────────────────────────────────────────────
 * The register is SYNTHETIC (see data/onboarding.mjs). This engine demonstrates CDD
 * risk-rating mechanics over a real, publicly-documented factor-weighting methodology;
 * it is NOT a KYC / onboarding system of record.
 */

import {
  APPLICANTS, APPLICANT_BY_ID, CUSTOMER_TYPE_BY_CODE, PRODUCT_BY_CODE, CHANNEL_BY_CODE,
  STAGES, STAGE_BY_CODE, RATING_BANDS, RATING_BY_CODE, RISK_FACTORS, FACTOR_BY_KEY,
  TOTAL_FACTOR_WEIGHT, ONBOARDING_DISCLAIMER, ONBOARDING_VERSION,
} from '../data/onboarding.mjs';
import { screen as runScreening, BANDS as SCREENING_BANDS, WATCHLIST_ENTRIES } from '../engines/screening.mjs';
import { subjectProfile as adverseSubjectProfile, AM_RISK_BANDS } from '../engines/adverseMedia.mjs';
import { jurisdictionRisk as countryJurisdictionRisk, sectorRisk as countrySectorRisk, SECTOR_BY_CODE as COUNTRY_SECTOR_BY_CODE } from '../engines/countryRisk.mjs';

// A fixed "as-of" reference so review-cadence maths are deterministic in tests and
// the e2e harness (callers may pass a different asOf).
export const DEFAULT_AS_OF = '2026-07-01';

// Map a country-risk ordinal band level (0=Low..3=Very-high) to a normalised [0,1].
const BAND_LEVEL_NORM = Object.freeze({ 0: 0.15, 1: 0.45, 2: 0.72, 3: 1.0 });
// Map a screening band (weak/possible/strong) to a normalised [0,1] contribution,
// weighted up for the sanctions list (the most serious).
const SCREENING_BAND_NORM = Object.freeze({ weak: 0.35, possible: 0.6, strong: 0.9 });
// Map an adverse-media risk band to a normalised [0,1].
const ADVERSE_BAND_NORM = Object.freeze({ None: 0.0, Low: 0.25, Elevated: 0.5, High: 0.75, Severe: 1.0 });

// ── The weighted risk-factor model (norm + describe per factor) ───────────────
// Each factor reads the NORMALISED signal object (built by normaliseSignals) and
// returns a [0,1] contribution + a plain-English explanation. Mirrors RISK_FACTORS
// in the data module (same keys, same weights).
const FACTOR_LOGIC = {
  customer_type: {
    norm: (s) => clamp01(s.typeInherent),
    describe: (s) => `${s.typeLabel} (inherent look-through risk ${pct(s.typeInherent)}). ${s.kind === 'corporate' ? 'A legal-entity / structure customer requires beneficial-ownership resolution.' : 'A natural-person customer is comparatively straightforward to verify.'}`,
  },
  geography: {
    norm: (s) => clamp01(s.geoNorm),
    describe: (s) => (s.country
      ? `${s.countryName} (${s.country}) composes to an inherent ${s.countryBandLabel.toUpperCase()} jurisdiction band in the Country & Sector Risk Index${s.countrySeeded ? `, anchored to the seeded secrecy score` : ''}.`
      : 'No country on file — treated as neutral.'),
  },
  industry: {
    norm: (s) => clamp01(s.sectorNorm),
    describe: (s) => (s.sector
      ? `${s.sectorLabel} carries an inherent ${s.sectorBandLabel.toUpperCase()} sector-risk band in the Country & Sector Risk Index.`
      : 'No sector on file — treated as neutral.'),
  },
  product: {
    norm: (s) => clamp01(s.productInherent),
    describe: (s) => `${s.productLabel} (inherent product risk ${pct(s.productInherent)}).`,
  },
  channel: {
    norm: (s) => clamp01(s.channelInherent),
    describe: (s) => `${s.channelLabel} (inherent channel risk ${pct(s.channelInherent)}).`,
  },
  screening: {
    norm: (s) => clamp01(s.screeningNorm),
    describe: (s) => {
      if (!s.screeningMatched) return 'No public-sanctions-subset match on the applicant or its linked Nexus entity.';
      return `Public-sanctions-subset ${s.screeningList || 'watchlist'} match "${s.screeningMatchedName || ''}" scored ${s.screeningScore}/100 (${s.screeningBand || ''} band)${s.screeningList === 'sanctions' ? ' — OVERRIDING sanctions exposure' : ''}${s.screeningList === 'pep' ? ' — PEP exposure' : ''}.`;
    },
  },
  adverse_media: {
    norm: (s) => clamp01(s.adverseNorm),
    describe: (s) => (s.adverseFound
      ? `${s.adverseItemCount} adverse-media item(s) on the linked entity; composite ${s.adverseScore}/100 (${s.adverseBand} band), peak severity ${s.adversePeakSeverity || 'n/a'}.`
      : 'No adverse-media items on file for the linked entity (or no Nexus link).'),
  },
};

/** Map a 0–100 customer-risk score to its rating band code. @param {number} score */
export function ratingFor(score) {
  let out = RATING_BANDS[0].code;
  for (const b of RATING_BANDS) if (score >= b.min) out = b.code;
  return out;
}
/** The band record for a rating code. @param {string} code */
export function bandRecord(code) { return RATING_BY_CODE[code] || RATING_BANDS[0]; }

// ── Build the normalised signal object for one applicant ──────────────────────
// This is where the OTHER engines are consumed. Pure over the seeded data + the
// applicant row. `seededJurisdiction` (secrecy_score + offshore) is the honest fact
// the country engine anchors the secrecy band to.
/**
 * @param {object} applicant     A row from data/onboarding.mjs (or same shape).
 * @param {object} [ctx]
 * @param {Record<string,{code:string,name?:string,secrecy_score?:number,is_offshore?:number|boolean}>} [ctx.jurisdictions]  seeded jurisdiction lookup by code.
 * @param {object[]} [ctx.watchlist]  watchlist override (defaults to the full synthetic list).
 * @param {string} [ctx.asOf]     ISO as-of date.
 * @returns {object}  normalised signals + the consumed sub-reports.
 */
function normaliseSignals(applicant, ctx = {}) {
  const watchlist = Array.isArray(ctx.watchlist) ? ctx.watchlist : WATCHLIST_ENTRIES;
  const jmap = ctx.jurisdictions || null;
  const seeded = jmap && applicant.country ? (jmap[applicant.country] || null) : null;

  // 1) Customer type (inherent).
  const t = CUSTOMER_TYPE_BY_CODE[applicant.type] || null;

  // 2) Geography — CONSUME countryRisk.jurisdictionRisk (anchored to seeded secrecy).
  const cprofile = applicant.country ? countryJurisdictionRisk(applicant.country, { seeded }) : null;
  const geoNorm = cprofile ? levelNorm(Math.round(cprofile.weightedLevel)) : 0.3;

  // 3) Industry — CONSUME countryRisk.sectorRisk for the applicant's sector.
  const secRec = applicant.sector ? (COUNTRY_SECTOR_BY_CODE[applicant.sector] || null) : null;
  const secBand = secRec ? secRec.band : null;
  const sectorNorm = secBand ? levelNormFromBand(secBand) : 0.3;

  // 4) Product / 5) Channel (inherent).
  const prod = PRODUCT_BY_CODE[applicant.product] || null;
  const chan = CHANNEL_BY_CODE[applicant.channel] || null;

  // 6) Screening — CONSUME screening.screen() against the applicant name (or its
  // linked Nexus entity's name — same name here), keep the strongest match.
  const kindHint = applicant.kind === 'corporate' ? 'organisation' : 'person';
  const scRes = runScreening({ name: applicant.legalName, kindHint }, watchlist, { limit: 3 });
  const scTop = scRes.matches[0] || null;
  // Weight sanctions/pep matches higher than a generic list at the same score.
  let screeningNorm = 0;
  if (scTop) {
    const base = SCREENING_BAND_NORM[scTop.band] || (scTop.score / 100);
    const listBoost = scTop.list === 'sanctions' ? 1.0 : scTop.list === 'pep' ? 0.9 : scTop.list === 'adverse-media' ? 0.75 : 0.6;
    screeningNorm = clamp01(base * listBoost);
  }

  // 7) Adverse-media — CONSUME adverseMedia.subjectProfile() for the linked entity.
  let adverse = { found: false, itemCount: 0, adverseMediaScore: 0, riskBand: 'None', peakSeverity: null };
  if (applicant.entityId) {
    const ap = adverseSubjectProfile(applicant.entityId, { asOf: ctx.asOf || DEFAULT_AS_OF });
    adverse = ap;
  }
  const adverseNorm = ADVERSE_BAND_NORM[adverse.riskBand] != null ? ADVERSE_BAND_NORM[adverse.riskBand] : clamp01(adverse.adverseMediaScore / 100);

  // A self-declared PEP raises the screening factor floor (a declaration is itself
  // an EDD trigger even without a list match).
  const pepDeclared = !!applicant.pep;
  const screeningNormWithPep = pepDeclared ? Math.max(screeningNorm, 0.55) : screeningNorm;

  return {
    // customer type
    typeCode: applicant.type, typeLabel: t ? t.label : applicant.type, typeInherent: t ? t.inherent : 0.4, kind: applicant.kind,
    // geography
    country: applicant.country || null, countryName: cprofile ? cprofile.name : (applicant.country || null),
    countryBand: cprofile ? cprofile.overall : null, countryBandLabel: cprofile ? cprofile.overallLabel : 'n/a',
    countryLevel: cprofile ? Math.round(cprofile.weightedLevel) : null, countrySeeded: cprofile ? cprofile.seeded : false,
    countryProfile: cprofile, geoNorm,
    // industry
    sector: applicant.sector || null, sectorLabel: secRec ? secRec.label : (applicant.sector || null),
    sectorBand: secBand, sectorBandLabel: secBand ? bandLabelFor(secBand) : 'n/a', sectorNorm, sectorDrivers: secRec ? secRec.drivers.slice() : [],
    // product / channel
    productCode: applicant.product, productLabel: prod ? prod.label : applicant.product, productInherent: prod ? prod.inherent : 0.4,
    channelCode: applicant.channel, channelLabel: chan ? chan.label : applicant.channel, channelInherent: chan ? chan.inherent : 0.4,
    // screening
    screeningMatched: !!scTop, screeningScore: scTop ? scTop.score : 0, screeningBand: scTop ? scTop.band : null,
    screeningList: scTop ? scTop.list : null, screeningListLabel: scTop ? scTop.listLabel : null,
    screeningMatchedName: scTop ? scTop.matchedName : null, screeningNorm: screeningNormWithPep, screeningMatches: scRes.matches,
    // adverse
    adverseFound: !!adverse.found, adverseItemCount: adverse.itemCount || 0, adverseScore: adverse.adverseMediaScore || 0,
    adverseBand: adverse.riskBand || 'None', adversePeakSeverity: adverse.peakSeverity || null, adverseNorm, adverseProfile: adverse,
    // context
    pep: pepDeclared, seeded, asOf: ctx.asOf || DEFAULT_AS_OF,
  };
}

// ── Public: assess ONE applicant (the full CDD breakdown) ─────────────────────
/**
 * Compute an applicant's customer-risk rating + full explainable breakdown.
 * @param {string} applicantId
 * @param {object} [ctx]  { jurisdictions, watchlist, asOf } — see normaliseSignals.
 * @returns {object|null}  null when the applicant id is unknown.
 */
export function assess(applicantId, ctx = {}) {
  const applicant = APPLICANT_BY_ID[applicantId];
  if (!applicant) return null;
  return assessApplicant(applicant, ctx);
}

/** Assess an applicant row directly (used by applicants()/queue()/summary()). */
export function assessApplicant(applicant, ctx = {}) {
  const s = normaliseSignals(applicant, ctx);

  // Per-factor contributions (weighted-factor model).
  let weighted = 0;
  const factors = RISK_FACTORS.map((f) => {
    const logic = FACTOR_LOGIC[f.key];
    const n = clamp01(logic.norm(s));
    const contribution = f.weight * n;
    weighted += contribution;
    return {
      key: f.key, label: f.label, short: f.short, weight: f.weight,
      normalised: round2(n),
      points: round2((contribution / TOTAL_FACTOR_WEIGHT) * 100), // share of the 0–100 score
      contributionPct: 0, // filled after the score is known
      explanation: logic.describe(s),
      description: f.description,
    };
  });

  let score = Math.round((weighted / TOTAL_FACTOR_WEIGHT) * 100);
  const baseScore = score;

  // ── Sanctions override (hard stop) ──────────────────────────────────────────
  const override = { applied: false, reason: null, floor: null };
  if (s.screeningList === 'sanctions' && s.screeningBand === 'strong') {
    const floor = bandRecord('Prohibited').min;
    override.applied = true; override.floor = floor;
    if (score < floor) { score = floor; override.reason = 'Strong real-public-source sanctions match — floored to Prohibited (hard stop; do not onboard without board-level exception).'; }
    else override.reason = 'Strong real-public-source sanctions match — score already at/above the Prohibited threshold.';
  }
  score = Math.max(0, Math.min(100, score));

  for (const d of factors) d.contributionPct = score > 0 ? round2((d.points / score) * 100) : 0;
  // Stable ordering: biggest contributor first, then a stable factor key.
  factors.sort((a, b) => (b.points - a.points) || String(a.key).localeCompare(String(b.key)));

  const rating = ratingFor(score);
  const band = bandRecord(rating);

  // ── EDD decision + triggers ────────────────────────────────────────────────
  const triggers = [];
  if (rating === 'High' || rating === 'Prohibited') triggers.push({ code: 'rating', label: `Customer-risk rating is ${rating}` });
  if (s.pep) triggers.push({ code: 'pep', label: 'Applicant self-declares as a politically-exposed person (PEP)' });
  if (s.screeningMatched && (s.screeningList === 'sanctions' || s.screeningList === 'pep') && (s.screeningBand === 'strong' || s.screeningBand === 'possible')) triggers.push({ code: 'screening', label: `Public-sanctions-subset ${s.screeningList} screening match (${s.screeningBand})` });
  if (s.countryBand === 'Very-high') triggers.push({ code: 'geography', label: `Country of residence / incorporation is a Very-high jurisdiction band (${s.countryName})` });
  if (s.adverseBand === 'High' || s.adverseBand === 'Severe') triggers.push({ code: 'adverse', label: `Adverse-media exposure is ${s.adverseBand}` });
  const requiresEDD = triggers.length > 0;
  // Required due-diligence level: EDD if triggered, else the band's baseline DD level.
  const ddLevel = requiresEDD ? (rating === 'Prohibited' ? 'EDD / decline' : 'EDD') : band.dd;

  // ── Review cadence + next review date (deterministic, forward from asOf) ─────
  const cadenceMonths = band.cadenceMonths;
  const nextReviewDate = addMonthsIso(s.asOf, cadenceMonths);

  // ── Rationale (plain-English, deterministic) ────────────────────────────────
  const rationale = buildRationale(applicant, s, { score, rating, band, override, requiresEDD, triggers, cadenceMonths, nextReviewDate });

  return {
    applicantId: applicant.id,
    legalName: applicant.legalName,
    type: applicant.type, typeLabel: s.typeLabel, kind: applicant.kind,
    country: applicant.country, countryName: s.countryName,
    sector: applicant.sector, sectorLabel: s.sectorLabel,
    product: applicant.product, productLabel: s.productLabel,
    channel: applicant.channel, channelLabel: s.channelLabel,
    pep: s.pep, ubo: applicant.ubo || null, entityId: applicant.entityId || null,
    stage: applicant.stage, expectedActivity: applicant.expectedActivity || null, expectedMonthlyUsdK: applicant.expectedMonthlyUsdK,
    // the rating
    score, baseScore, rating, ratingColor: band.color, ratingBlurb: band.blurb,
    totalWeight: TOTAL_FACTOR_WEIGHT, factors, override,
    // due-diligence + cadence
    requiresEDD, ddLevel, dueDiligenceTriggers: triggers,
    cadenceMonths, asOf: s.asOf, nextReviewDate,
    // the CONSUMED signals — surfaced explicitly, each linking back to its module
    signals: {
      screening: s.screeningMatched
        ? { matched: true, score: s.screeningScore, band: s.screeningBand, list: s.screeningList, listLabel: s.screeningListLabel, matchedName: s.screeningMatchedName, matches: s.screeningMatches }
        : { matched: false, matches: [] },
      adverseMedia: s.adverseFound
        ? { found: true, itemCount: s.adverseItemCount, score: s.adverseScore, band: s.adverseBand, peakSeverity: s.adversePeakSeverity, timeline: (s.adverseProfile.timeline || []).slice(0, 6) }
        : { found: false, itemCount: 0, score: 0, band: 'None' },
      country: s.countryProfile
        ? { code: s.country, name: s.countryName, band: s.countryBand, bandLabel: s.countryBandLabel, level: s.countryLevel, seeded: s.countrySeeded, peakDimensions: (s.countryProfile.peakDimensions || []).slice(0, 3) }
        : null,
      sector: s.sector
        ? { code: s.sector, label: s.sectorLabel, band: s.sectorBand, bandLabel: s.sectorBandLabel, drivers: s.sectorDrivers.slice(0, 4) }
        : null,
    },
    rationale,
    disclaimer: ONBOARDING_DISCLAIMER,
    data_classification: 'synthetic-demo',
  };
}

// ── Public: the applicant register (filterable) with a compact assessment ─────
/**
 * Score every applicant and return a ranked register + a summary. Optional filters
 * by rating band and pipeline stage.
 * @param {object} [opts]  { status?, rating?, jurisdictions, watchlist, asOf }
 *   `status` filters by stage code; `rating` filters by rating band code.
 * @returns {object}
 */
export function applicants(opts = {}) {
  const ctx = { jurisdictions: opts.jurisdictions, watchlist: opts.watchlist, asOf: opts.asOf || DEFAULT_AS_OF };
  const scored = APPLICANTS.map((a) => compactRow(assessApplicant(a, ctx)));
  // Stable ordering: highest score first, then applicant id.
  scored.sort((a, b) => (b.score - a.score) || String(a.applicantId).localeCompare(String(b.applicantId)));

  let rows = scored;
  const rating = opts.rating && RATING_BY_CODE[opts.rating] ? opts.rating : '';
  const stage = opts.status && STAGE_BY_CODE[opts.status] ? opts.status : '';
  if (rating) rows = rows.filter((r) => r.rating === rating);
  if (stage) rows = rows.filter((r) => r.stage === stage);

  return {
    applicants: rows,
    summary: summariseRows(scored),
    ratingBands: RATING_BANDS.map((b) => ({ code: b.code, min: b.min, color: b.color, dd: b.dd, cadenceMonths: b.cadenceMonths, blurb: b.blurb })),
    stages: STAGES.map((s) => ({ code: s.code, label: s.label, order: s.order, terminal: s.terminal, color: s.color, blurb: s.blurb })),
    factors: RISK_FACTORS.map((f) => ({ key: f.key, label: f.label, short: f.short, weight: f.weight, description: f.description })),
    version: ONBOARDING_VERSION,
    disclaimer: ONBOARDING_DISCLAIMER,
    asOf: ctx.asOf,
  };
}

// ── Public: the onboarding pipeline grouped by stage ──────────────────────────
/**
 * Group the scored applicants by pipeline stage (intake → screening → EDD → …).
 * @param {object} [opts]  { jurisdictions, watchlist, asOf }
 * @returns {object}
 */
export function queue(opts = {}) {
  const ctx = { jurisdictions: opts.jurisdictions, watchlist: opts.watchlist, asOf: opts.asOf || DEFAULT_AS_OF };
  const scored = APPLICANTS.map((a) => compactRow(assessApplicant(a, ctx)));
  const stages = STAGES.map((st) => {
    const items = scored.filter((r) => r.stage === st.code).sort((a, b) => (b.score - a.score) || String(a.applicantId).localeCompare(String(b.applicantId)));
    return {
      code: st.code, label: st.label, order: st.order, terminal: st.terminal, color: st.color, blurb: st.blurb,
      count: items.length,
      items,
      byRating: countByRating(items),
    };
  });
  return {
    stages,
    summary: summariseRows(scored),
    ratingBands: RATING_BANDS.map((b) => ({ code: b.code, min: b.min, color: b.color, dd: b.dd, cadenceMonths: b.cadenceMonths })),
    version: ONBOARDING_VERSION,
    disclaimer: ONBOARDING_DISCLAIMER,
    asOf: ctx.asOf,
  };
}

// ── Public: portfolio summary (counts by rating / stage / DD level) ───────────
/**
 * Roll the whole register up into counts by rating, stage and DD level + a few KPIs.
 * @param {object} [opts]  { jurisdictions, watchlist, asOf }
 * @returns {object}
 */
export function summary(opts = {}) {
  const ctx = { jurisdictions: opts.jurisdictions, watchlist: opts.watchlist, asOf: opts.asOf || DEFAULT_AS_OF };
  const scored = APPLICANTS.map((a) => compactRow(assessApplicant(a, ctx)));
  return {
    ...summariseRows(scored),
    ratingBands: RATING_BANDS.map((b) => ({ code: b.code, min: b.min, color: b.color, dd: b.dd, cadenceMonths: b.cadenceMonths })),
    stages: STAGES.map((s) => ({ code: s.code, label: s.label, order: s.order, terminal: s.terminal, color: s.color })),
    version: ONBOARDING_VERSION,
    disclaimer: ONBOARDING_DISCLAIMER,
    asOf: ctx.asOf,
  };
}

// ── Compact per-applicant row (for lists / queue / summary) ───────────────────
function compactRow(a) {
  return {
    applicantId: a.applicantId, legalName: a.legalName, type: a.type, typeLabel: a.typeLabel, kind: a.kind,
    country: a.country, countryName: a.countryName, sector: a.sector, sectorLabel: a.sectorLabel,
    product: a.product, productLabel: a.productLabel, channel: a.channel, channelLabel: a.channelLabel,
    pep: a.pep, entityId: a.entityId, stage: a.stage,
    score: a.score, rating: a.rating, ratingColor: a.ratingColor,
    requiresEDD: a.requiresEDD, ddLevel: a.ddLevel, triggerCount: a.dueDiligenceTriggers.length,
    cadenceMonths: a.cadenceMonths, nextReviewDate: a.nextReviewDate,
    topFactor: a.factors[0] ? a.factors[0].label : null,
    screeningHit: a.signals.screening.matched, screeningList: a.signals.screening.list || null,
    adverseHit: a.signals.adverseMedia.found, adverseBand: a.signals.adverseMedia.band,
    countryBand: a.signals.country ? a.signals.country.band : null,
    sectorBand: a.signals.sector ? a.signals.sector.band : null,
  };
}

// ── Summarise a set of compact rows into counts + KPIs ────────────────────────
function summariseRows(rows) {
  const byRating = {}; for (const b of RATING_BANDS) byRating[b.code] = 0;
  const byStage = {}; for (const s of STAGES) byStage[s.code] = 0;
  const byDd = {};
  let eddCount = 0, pepCount = 0, screeningHits = 0, adverseHits = 0, prohibited = 0;
  for (const r of rows) {
    byRating[r.rating] = (byRating[r.rating] || 0) + 1;
    byStage[r.stage] = (byStage[r.stage] || 0) + 1;
    byDd[r.ddLevel] = (byDd[r.ddLevel] || 0) + 1;
    if (r.requiresEDD) eddCount++;
    if (r.pep) pepCount++;
    if (r.screeningHit) screeningHits++;
    if (r.adverseHit) adverseHits++;
    if (r.rating === 'Prohibited') prohibited++;
  }
  // Highest-risk applicants (top 5 by score) for a dashboard.
  const topRisks = rows.slice().sort((a, b) => (b.score - a.score) || String(a.applicantId).localeCompare(String(b.applicantId))).slice(0, 5)
    .map((r) => ({ applicantId: r.applicantId, legalName: r.legalName, score: r.score, rating: r.rating, ddLevel: r.ddLevel, topFactor: r.topFactor }));
  return {
    total: rows.length, byRating, byStage, byDd,
    eddCount, pepCount, screeningHits, adverseHits, prohibited,
    inPipeline: rows.filter((r) => { const st = STAGE_BY_CODE[r.stage]; return st && !st.terminal; }).length,
    topRisks,
  };
}
function countByRating(rows) { const o = {}; for (const b of RATING_BANDS) o[b.code] = 0; for (const r of rows) o[r.rating] = (o[r.rating] || 0) + 1; return o; }

// ── Plain-English rationale (deterministic) ───────────────────────────────────
function buildRationale(applicant, s, r) {
  const parts = [];
  parts.push(`${applicant.legalName} — a ${s.typeLabel.toLowerCase()} ${s.kind === 'corporate' ? 'onboarding' : 'applicant'} in ${s.countryName || 'an unspecified country'} for a ${s.productLabel.toLowerCase()} via ${s.channelLabel.toLowerCase()} — composes to a customer-risk score of ${r.score}/100, an overall ${r.rating.toUpperCase()} rating.`);
  // The largest-contributing factors, named in plain English.
  const named = [];
  if (s.countryBand === 'High' || s.countryBand === 'Very-high') named.push(`${s.countryName} being an inherent ${s.countryBandLabel.toLowerCase()} jurisdiction`);
  if (s.sectorBand === 'High' || s.sectorBand === 'Very-high') named.push(`${s.sectorLabel} being an inherent ${bandLabelFor(s.sectorBand).toLowerCase()} sector`);
  if (s.productInherent >= 0.65) named.push(`the ${s.productLabel.toLowerCase()} being a high-inherent-risk product`);
  if (s.screeningMatched) named.push(`a synthetic ${s.screeningList} screening match ("${s.screeningMatchedName}")`);
  if (s.adverseBand === 'High' || s.adverseBand === 'Severe' || (s.adverseFound && s.adverseItemCount >= 2)) named.push(`${s.adverseItemCount} adverse-media item(s) on the linked entity`);
  if (named.length) parts.push(`The rating is driven principally by ${named.slice(0, 3).join(', ')}.`);
  else parts.push('No single factor dominates; the profile is comparatively contained across the seven factors.');
  if (r.override.applied) parts.push(r.override.reason);
  parts.push(r.requiresEDD
    ? `Enhanced Due Diligence (${r.band.dd === 'EDD / decline' ? 'and an escalate-to-decline posture' : 'EDD'}) is REQUIRED — triggered by: ${r.triggers.map((t) => t.label).join('; ')}.`
    : `Standard Customer Due Diligence (${r.band.dd}) is sufficient; no EDD trigger is present.`);
  parts.push(`Periodic review cadence: every ${r.cadenceMonths} months — next review due ${r.nextReviewDate} (from an as-of date of ${s.asOf}).`);
  parts.push('This is an illustrative rating over a real CDD/EDD factor-weighting methodology applied to synthetic data — not a compliance determination.');
  return parts.join(' ');
}

// ── Meta re-exports the routes / UI consume ───────────────────────────────────
export {
  APPLICANTS, APPLICANT_BY_ID, CUSTOMER_TYPE_BY_CODE, PRODUCT_BY_CODE, CHANNEL_BY_CODE,
  STAGES, STAGE_BY_CODE, RATING_BANDS, RATING_BY_CODE, RISK_FACTORS, FACTOR_BY_KEY,
  TOTAL_FACTOR_WEIGHT, ONBOARDING_DISCLAIMER, ONBOARDING_VERSION,
};

// ── Small pure helpers ────────────────────────────────────────────────────────
function levelNorm(level) { const v = clampLevel(level); return BAND_LEVEL_NORM[v] != null ? BAND_LEVEL_NORM[v] : 0.3; }
function levelNormFromBand(bandCode) { const lvl = BAND_LEVEL_BY_CODE[bandCode]; return lvl != null ? levelNorm(lvl) : 0.3; }
const BAND_LEVEL_BY_CODE = Object.freeze({ Low: 0, Moderate: 1, High: 2, 'Very-high': 3 });
function bandLabelFor(bandCode) { return bandCode === 'Very-high' ? 'Very high' : (bandCode || 'n/a'); }
function clampLevel(x) { const v = Number(x); if (!Number.isFinite(v) || v < 0) return 0; return v > 3 ? 3 : Math.round(v); }
function clamp01(x) { const v = Number(x); if (Number.isNaN(v) || v < 0) return 0; return v > 1 ? 1 : v; }
function round2(x) { return Math.round(x * 100) / 100; }
function pct(x) { return Math.round(clamp01(x) * 100) + '%'; }
// Add N months to an ISO yyyy-mm-dd date, returning yyyy-mm-dd (deterministic, UTC).
function addMonthsIso(iso, months) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
  let y, mo, d;
  if (m) { y = +m[1]; mo = +m[2] - 1; d = +m[3]; } else { const dt = new Date(String(iso)); y = dt.getUTCFullYear(); mo = dt.getUTCMonth(); d = dt.getUTCDate(); }
  const total = mo + Number(months);
  const ny = y + Math.floor(total / 12);
  const nm = ((total % 12) + 12) % 12;
  // Clamp day to the last valid day of the target month.
  const lastDay = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  const nd = Math.min(d, lastDay);
  const pad = (n) => String(n).padStart(2, '0');
  return `${ny}-${pad(nm + 1)}-${pad(nd)}`;
}
