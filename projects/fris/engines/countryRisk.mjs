// @ts-check
/**
 * Country & Sector Risk Index — deterministic categorical risk-composition engine.
 *
 * Turns the categorical reference tables in `data/countryRisk.mjs` into:
 *   · jurisdictionRisk(code)  — one jurisdiction's per-dimension bands + a composed
 *                               OVERALL band + a plain-English explanation.
 *   · matrix()                — the full jurisdiction × dimension grid for the
 *                               heat-map, with an overall band per jurisdiction.
 *   · sectorRisk()            — the inherent-risk band per business sector.
 *   · combined(j, s)          — the inherent risk of operating in sector S inside
 *                               jurisdiction J (a categorical blend of the two).
 *
 * ── How the OVERALL band is composed (categorical, not a copyrighted score) ───
 * Each dimension has an ordinal band level (0=Low … 3=Very-high) and a relative
 * weight. The engine computes a weighted mean of the ordinal LEVELS, then maps
 * that back to the nearest band by threshold. This is a transparent CATEGORICAL
 * roll-up — it deliberately does NOT emit a 0–100 "index score" (which would look
 * like a copyrighted numeric index). The intermediate weighted level is exposed
 * only for tooltips / sorting, clearly labelled as an ordinal, never as an index.
 *
 *   level̄ = Σ(weightᵢ · levelᵢ) / Σ(weightᵢ)          (levelᵢ ∈ {0,1,2,3})
 *   overall band = the band whose threshold bracket contains level̄
 *
 * ── Honest reuse of real facts ────────────────────────────────────────────────
 * The `financial_secrecy` band is CATEGORICAL fallback data. When the caller
 * supplies the seeded jurisdiction's REAL secrecy score + offshore flag (from
 * `pools.mjs` / the `jurisdictions` table — a publicly-sourced FRIS fact), the
 * engine DERIVES the financial-secrecy band from that real number instead and
 * records the provenance ("derived from seeded secrecy score N/100"), so the
 * heat-map is anchored to real data where real data exists. Everything else stays
 * categorical and is labelled illustrative.
 *
 * ── Determinism ──────────────────────────────────────────────────────────────
 * Same code + same seeded facts → same output, byte-for-byte. Pure arithmetic,
 * stable ordering, no Date.now(), no randomness, no network, no dependencies.
 *
 * ── Honesty ──────────────────────────────────────────────────────────────────
 * The categorical tables are an illustrative demonstration posture (see the data
 * module's disclaimer). This engine demonstrates categorical risk-composition
 * mechanics; it is NOT a country-risk system of record.
 */

import {
  RISK_BANDS, BAND_BY_CODE, MAX_BAND_LEVEL, RISK_DIMENSIONS, DIMENSION_BY_KEY,
  COUNTRY_RISK, COUNTRY_BY_CODE, SECTOR_RISK, SECTOR_BY_CODE,
  COUNTRY_RISK_DISCLAIMER, COUNTRY_RISK_VERSION,
} from '../data/countryRisk.mjs';

const TOTAL_WEIGHT = RISK_DIMENSIONS.reduce((a, d) => a + d.weight, 0);

// Threshold brackets that map an ordinal weighted mean (0..3) back to a band.
// A value in [0,0.5) → Low, [0.5,1.5) → Moderate, [1.5,2.5) → High, [2.5,3] →
// Very-high. Nearest-integer rounding, expressed as explicit brackets so the
// mapping is auditable and stable.
const BAND_THRESHOLDS = Object.freeze([
  { code: 'Very-high', min: 2.5 },
  { code: 'High', min: 1.5 },
  { code: 'Moderate', min: 0.5 },
  { code: 'Low', min: 0 },
]);

/** Map an ordinal weighted-mean level (0..3) to a band code. @param {number} level */
export function bandForLevel(level) {
  const v = clampLevel(level);
  for (const t of BAND_THRESHOLDS) if (v >= t.min) return t.code;
  return 'Low';
}
/** The full band record for a band code (falls back to Low). @param {string} code */
export function bandRecord(code) { return BAND_BY_CODE[code] || RISK_BANDS[0]; }

// ── Derive a financial-secrecy BAND from a real seeded secrecy score ──────────
// The seeded `jurisdictions` secrecy_score is a real, publicly-sourced FRIS fact
// on a 0–100 scale. Map it to our categorical band with fixed, auditable cut-offs
// (offshore status nudges a borderline case up one band). This keeps the heat-map
// anchored to real data where real data exists — see the module header.
/**
 * @param {number} secrecyScore  0–100 seeded secrecy score.
 * @param {boolean} offshore     seeded offshore flag.
 * @returns {'Low'|'Moderate'|'High'|'Very-high'}
 */
export function secrecyBandFromScore(secrecyScore, offshore) {
  const s = Number(secrecyScore);
  if (!Number.isFinite(s)) return 'Moderate';
  let band;
  if (s >= 85) band = 'Very-high';
  else if (s >= 65) band = 'High';
  else if (s >= 45) band = 'Moderate';
  else band = 'Low';
  // An offshore centre sitting right at the top of "High" is treated as Very-high.
  if (offshore && band === 'High' && s >= 80) band = 'Very-high';
  return band;
}

// ── Public: one jurisdiction's full risk profile ──────────────────────────────
/**
 * @typedef {{ code:string, secrecy_score?:number, is_offshore?:number|boolean, name?:string, country?:string }} SeededJurisdiction
 */
/**
 * Compose a jurisdiction's per-dimension bands + overall band + explanation.
 * @param {string} code                       jurisdiction code (COUNTRY_RISK / seeded).
 * @param {{ seeded?:SeededJurisdiction|null }} [opts]  optional seeded facts for the honest secrecy override.
 * @returns {object|null}  null when the code is unknown.
 */
export function jurisdictionRisk(code, opts = {}) {
  const row = COUNTRY_BY_CODE[code];
  if (!row) return null;
  const seeded = opts.seeded || null;

  // Per-dimension bands (categorical), with the honest secrecy override applied.
  let secrecyProvenance = 'illustrative-categorical';
  let secrecyDetail = null;
  const bands = { ...row.bands };
  if (seeded && seeded.secrecy_score != null && Number.isFinite(Number(seeded.secrecy_score))) {
    const offshore = !!(seeded.is_offshore === 1 || seeded.is_offshore === true);
    bands.financial_secrecy = secrecyBandFromScore(seeded.secrecy_score, offshore);
    secrecyProvenance = 'derived-from-seeded-fact';
    secrecyDetail = `Financial-secrecy band derived from the seeded jurisdiction secrecy score of ${Number(seeded.secrecy_score)}/100${offshore ? ' (flagged offshore)' : ''} — a publicly-sourced FRIS fact.`;
  }

  // Build the per-dimension detail rows (stable dimension order).
  const dimensions = RISK_DIMENSIONS.map((d) => {
    const bandCode = bands[d.key] || 'Moderate';
    const rec = bandRecord(bandCode);
    return {
      key: d.key,
      label: d.label,
      short: d.short,
      weight: d.weight,
      band: bandCode,
      level: rec.level,
      color: rec.color,
      bandLabel: rec.label,
      description: d.description,
      provenance: d.key === 'financial_secrecy' ? secrecyProvenance : 'illustrative-categorical',
      provenanceDetail: d.key === 'financial_secrecy' ? secrecyDetail : null,
    };
  });

  // Composed OVERALL band from the weighted mean of ordinal levels.
  let weightedLevel = 0;
  for (const dim of dimensions) weightedLevel += dim.weight * dim.level;
  const meanLevel = round2(weightedLevel / TOTAL_WEIGHT);
  const overallCode = bandForLevel(meanLevel);
  const overall = bandRecord(overallCode);

  // The single highest-band dimension(s) — the plain "what makes this risky" note.
  const peak = dimensions.reduce((mx, dim) => (dim.level > mx.level ? dim : mx), dimensions[0]);
  const peakDims = dimensions.filter((dim) => dim.level === peak.level).map((dim) => dim.label);

  return {
    code: row.code,
    name: (seeded && seeded.name) || row.name,
    country: (seeded && seeded.country) || row.country,
    region: row.region,
    seeded: !!seeded,
    overall: overallCode,
    overallLabel: overall.label,
    overallColor: overall.color,
    overallBlurb: overall.blurb,
    weightedLevel: meanLevel,          // ordinal 0..3 (NOT an index score) — for tooltips / sorting only
    maxLevel: MAX_BAND_LEVEL,
    dimensions,
    peakDimensions: peakDims,
    explanation: buildExplanation(row, dimensions, overall, peakDims, secrecyDetail),
    note: row.note,
    data_classification: 'illustrative-categorical',
  };
}

// ── Public: the whole jurisdiction × dimension matrix (heat-map) ──────────────
/**
 * Build the heat-map grid. Rows = jurisdictions (ranked worst-first by overall
 * ordinal, then code), columns = dimensions, each cell carrying its band code +
 * colour + label. An `overall` band is attached per jurisdiction.
 *
 * @param {{ seededByCode?:Record<string,SeededJurisdiction> }} [opts]  optional seeded-fact lookup for the honest secrecy override.
 * @returns {object}
 */
export function matrix(opts = {}) {
  const seededByCode = opts.seededByCode || null;
  const rows = COUNTRY_RISK.map((c) => {
    const seeded = seededByCode ? (seededByCode[c.code] || null) : null;
    const profile = jurisdictionRisk(c.code, { seeded });
    return {
      code: profile.code,
      name: profile.name,
      country: profile.country,
      region: profile.region,
      seeded: profile.seeded,
      overall: profile.overall,
      overallLabel: profile.overallLabel,
      overallColor: profile.overallColor,
      weightedLevel: profile.weightedLevel,
      cells: profile.dimensions.map((dim) => ({
        key: dim.key, band: dim.band, level: dim.level, color: dim.color, label: dim.bandLabel,
        provenance: dim.provenance,
      })),
    };
  });
  // Stable ordering: highest composed ordinal first, then jurisdiction code.
  rows.sort((a, b) => (b.weightedLevel - a.weightedLevel) || String(a.code).localeCompare(String(b.code)));

  // Distribution of overall bands (for a compact legend / summary).
  const byOverall = {};
  for (const b of RISK_BANDS) byOverall[b.code] = 0;
  for (const r of rows) byOverall[r.overall] = (byOverall[r.overall] || 0) + 1;

  return {
    dimensions: RISK_DIMENSIONS.map((d) => ({ key: d.key, label: d.label, short: d.short, weight: d.weight, description: d.description })),
    bands: RISK_BANDS.map((b) => ({ code: b.code, level: b.level, color: b.color, label: b.label, blurb: b.blurb })),
    rows,
    summary: { total: rows.length, byOverall, seededCount: rows.filter((r) => r.seeded).length },
    disclaimer: COUNTRY_RISK_DISCLAIMER,
    version: COUNTRY_RISK_VERSION,
  };
}

// ── Public: the sector-risk table ─────────────────────────────────────────────
/**
 * Return the inherent-risk band per business sector, ranked worst-first.
 * @returns {object}
 */
export function sectorRisk() {
  const sectors = SECTOR_RISK.map((s) => {
    const rec = bandRecord(s.band);
    return { code: s.code, label: s.label, band: s.band, level: rec.level, color: rec.color, bandLabel: rec.label, drivers: s.drivers.slice(), note: s.note };
  });
  sectors.sort((a, b) => (b.level - a.level) || String(a.code).localeCompare(String(b.code)));
  const byBand = {}; for (const b of RISK_BANDS) byBand[b.code] = 0;
  for (const s of sectors) byBand[s.band] = (byBand[s.band] || 0) + 1;
  return {
    sectors,
    bands: RISK_BANDS.map((b) => ({ code: b.code, level: b.level, color: b.color, label: b.label, blurb: b.blurb })),
    summary: { total: sectors.length, byBand },
    disclaimer: COUNTRY_RISK_DISCLAIMER,
    version: COUNTRY_RISK_VERSION,
  };
}

// ── Public: combined jurisdiction × sector inherent risk ──────────────────────
/**
 * The inherent risk of operating in sector S inside jurisdiction J. Categorical
 * blend: take the jurisdiction's composed ordinal level and the sector's inherent
 * ordinal level, combine them (a weighted blend biased slightly toward the higher
 * of the two — the industry treats "high-risk sector in a high-risk place" as the
 * worst case, so the max is floored in), and map back to a band. Fully explained.
 *
 * @param {string} jurisdictionCode
 * @param {string} sectorCode
 * @param {{ seeded?:SeededJurisdiction|null }} [opts]  optional seeded facts for the honest secrecy override.
 * @returns {object|null}  null when either code is unknown.
 */
export function combined(jurisdictionCode, sectorCode, opts = {}) {
  const jr = jurisdictionRisk(jurisdictionCode, { seeded: opts.seeded || null });
  const sr = SECTOR_BY_CODE[sectorCode];
  if (!jr || !sr) return null;
  const sectorRec = bandRecord(sr.band);

  const jLevel = jr.weightedLevel;          // 0..3 ordinal
  const sLevel = sectorRec.level;           // 0..3 ordinal
  // Blend: 55% the higher of the two + 45% the mean. This keeps a very-high sector
  // in a moderate place (and vice-versa) meaningfully elevated without either
  // input being able to single-handedly dominate a materially lower other input.
  const higher = Math.max(jLevel, sLevel);
  const mean = (jLevel + sLevel) / 2;
  const blended = round2(0.55 * higher + 0.45 * mean);
  const combinedCode = bandForLevel(blended);
  const combinedBand = bandRecord(combinedCode);

  return {
    jurisdiction: { code: jr.code, name: jr.name, overall: jr.overall, overallLabel: jr.overallLabel, overallColor: jr.overallColor, weightedLevel: jr.weightedLevel, seeded: jr.seeded },
    sector: { code: sr.code, label: sr.label, band: sr.band, bandLabel: sectorRec.label, color: sectorRec.color, level: sLevel, drivers: sr.drivers.slice() },
    combined: combinedCode,
    combinedLabel: combinedBand.label,
    combinedColor: combinedBand.color,
    combinedBlurb: combinedBand.blurb,
    weightedLevel: blended,
    maxLevel: MAX_BAND_LEVEL,
    explanation: `Operating a ${sr.label.toLowerCase()} business (inherent ${sectorRec.label.toLowerCase()} risk) in ${jr.name} (overall ${jr.overallLabel.toLowerCase()} jurisdiction risk) blends to an inherent ${combinedBand.label.toUpperCase()} risk posture. The blend is biased toward the higher of the two inputs, so a high-risk line of business in a high-risk place is treated as the worst case. This is an illustrative categorical combination, not a compliance determination.`,
    data_classification: 'illustrative-categorical',
  };
}

// ── Meta re-exports the routes / UI consume ───────────────────────────────────
export {
  RISK_BANDS, RISK_DIMENSIONS, DIMENSION_BY_KEY, COUNTRY_RISK, COUNTRY_BY_CODE,
  SECTOR_RISK, SECTOR_BY_CODE, COUNTRY_RISK_DISCLAIMER, COUNTRY_RISK_VERSION, TOTAL_WEIGHT,
};

// ── Small pure helpers ────────────────────────────────────────────────────────
function buildExplanation(row, dimensions, overall, peakDims, secrecyDetail) {
  const worst = dimensions.filter((d) => d.level >= 2).map((d) => `${d.label} (${d.bandLabel})`);
  const parts = [];
  parts.push(`${row.name} composes to an OVERALL ${overall.label.toUpperCase()} inherent risk from its six dimensions.`);
  if (worst.length) parts.push(`The elevated dimensions are: ${worst.join('; ')}.`);
  else parts.push('No dimension reaches the High band; the profile is comparatively contained.');
  if (secrecyDetail) parts.push(secrecyDetail);
  parts.push(`${row.note}`);
  parts.push('Bands are illustrative and categorical — not a copyrighted index or a legal determination.');
  return parts.join(' ');
}
function clampLevel(x) { const v = Number(x); if (!Number.isFinite(v) || v < 0) return 0; return v > MAX_BAND_LEVEL ? MAX_BAND_LEVEL : v; }
function round2(x) { return Math.round(x * 100) / 100; }
