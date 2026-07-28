// @ts-check
/**
 * Litigation & Enforcement-Action Tracker — deterministic analytics engine over
 * the verified enforcement corpus in `data/enforcement.mjs`.
 *
 * Turns the sixteen real, public-record actions into:
 *   · listActions({sort,filter}) — the filterable / sortable case list.
 *   · getAction(id)              — one action + its category record + related
 *                                  real FRIS regulatory topics (honest mapping).
 *   · analytics()                — counts + summed amounts by year, category,
 *                                  regulator, jurisdiction and amount band, plus
 *                                  headline totals and the date range.
 *   · trends()                   — per-year penalty totals + counts and a running
 *                                  cumulative series for the trend chart.
 *
 * ── Honesty / provenance ─────────────────────────────────────────────────────
 * Every figure is VERBATIM from the verified corpus. Sums use `approxUsd` (an
 * ILLUSTRATIVE historical-FX scale) ONLY so heterogeneous currencies land on one
 * comparable axis — the analytics label this as illustrative, and every action's
 * AUTHORITATIVE native amount + currency is preserved and returned untouched.
 * The engine derives nothing beyond counts / sums / groupings of the sixteen; it
 * never fabricates a case. Appeal / annulled statuses are preserved as authored.
 *
 * ── Determinism ──────────────────────────────────────────────────────────────
 * Same corpus → same output, byte-for-byte. Pure arithmetic, stable ordering (a
 * final id tiebreak on every sort), no Date.now(), no randomness, no network, no
 * dependencies.
 */

import {
  ENFORCEMENT_ACTIONS, ENFORCEMENT_BY_ID, ENF_CATEGORIES, ENF_CATEGORY_BY_CODE,
  ENF_AMOUNT_BANDS, ENFORCEMENT_DISCLAIMER, ENFORCEMENT_VERSION,
} from '../data/enforcement.mjs';

// ── Small pure helpers ────────────────────────────────────────────────────────
const yearOf = (dateStr) => Number(String(dateStr).slice(0, 4));
function bandForApproxUsd(v) {
  const n = Number(v) || 0;
  for (const b of ENF_AMOUNT_BANDS) if (n >= b.min && n < b.max) return b;
  // The top band's max is Infinity, so this only falls through for negatives.
  return ENF_AMOUNT_BANDS[0];
}
const categoryRecord = (code) => ENF_CATEGORY_BY_CODE[code] || { code, color: '#5b6b82', label: code, blurb: '' };
// A penalty is "under appeal" when its status/note says the fine is being
// contested or was sent back — but NOT when it was UPHELD on appeal (confirmed).
function isUnderAppeal(a) {
  const text = `${a.status} ${a.statusNote || ''}`;
  if (/upheld/i.test(text)) return false;          // upheld = confirmed, not pending
  return /\bappeal|appealed|remit/i.test(text);
}

// Sort comparators. `date` and `amount` sort DESC by default (newest / biggest
// first) so the "worst / most recent" surface at the top; a final id tiebreak
// keeps ordering byte-stable. `entity` sorts A→Z. Amount sorts on the illustrative
// approxUsd scale (the only cross-currency-comparable figure), which is labelled.
const SORTS = Object.freeze({
  date: (a, b) => String(b.date).localeCompare(String(a.date)) || String(a.id).localeCompare(String(b.id)),
  amount: (a, b) => (b.approxUsd - a.approxUsd) || String(a.id).localeCompare(String(b.id)),
  entity: (a, b) => String(a.entity).localeCompare(String(b.entity)) || String(a.id).localeCompare(String(b.id)),
  category: (a, b) => String(a.category).localeCompare(String(b.category)) || (b.approxUsd - a.approxUsd) || String(a.id).localeCompare(String(b.id)),
});
export const ENF_SORT_KEYS = Object.freeze(Object.keys(SORTS));

/** Shape one action into the list/detail row the API + UI consume. Pure; copies
 * arrays so callers can never mutate the frozen corpus. */
function shapeAction(a) {
  const cat = categoryRecord(a.category);
  const band = bandForApproxUsd(a.approxUsd);
  return {
    id: a.id,
    entity: a.entity,
    date: a.date,
    year: yearOf(a.date),
    amountNative: a.amountNative,
    currency: a.currency,
    approxUsd: a.approxUsd,
    isApproxUsd: a.currency !== 'USD',   // true when approxUsd is an FX estimate, not the native figure
    category: a.category,
    categoryLabel: cat.label,
    categoryColor: cat.color,
    regulators: a.regulators.slice(),
    jurisdiction: a.jurisdiction,
    status: a.status,
    statusNote: a.statusNote || null,
    // Precise, honest status flags. `underAppeal` catches live "under appeal" /
    // "appealed" / "remitted" outcomes but NOT "upheld on appeal" (that fine was
    // confirmed, not pending). `annulled` catches a struck-down fine.
    underAppeal: isUnderAppeal(a),
    annulled: /annul/i.test(a.status) || /annul/i.test(a.statusNote || ''),
    summary: a.summary,
    sourceLabel: a.sourceLabel,
    sourceUrl: a.sourceUrl,
    amountBand: band.code,
    amountBandLabel: band.label,
  };
}

// ── Public: the filterable / sortable case list ───────────────────────────────
/**
 * @param {{ sort?:string, filter?:{ category?:string, regulator?:string, jurisdiction?:string, status?:'appeal'|'annulled'|'final', year?:number, q?:string } }} [opts]
 * @returns {object}  { actions, total, count, sort, filter, categories, disclaimer, version }
 */
export function listActions(opts = {}) {
  const sortKey = SORTS[opts.sort] ? opts.sort : 'date';
  const f = opts.filter || {};
  let rows = ENFORCEMENT_ACTIONS.map(shapeAction);

  if (f.category) rows = rows.filter((r) => r.category === f.category);
  if (f.regulator) rows = rows.filter((r) => r.regulators.includes(f.regulator));
  if (f.jurisdiction) rows = rows.filter((r) => r.jurisdiction === f.jurisdiction);
  if (f.year != null && Number.isFinite(Number(f.year))) rows = rows.filter((r) => r.year === Number(f.year));
  if (f.status === 'appeal') rows = rows.filter((r) => r.underAppeal);
  else if (f.status === 'annulled') rows = rows.filter((r) => r.annulled);
  else if (f.status === 'final') rows = rows.filter((r) => !r.underAppeal && !r.annulled);
  if (f.q) {
    const q = String(f.q).toLowerCase();
    rows = rows.filter((r) => `${r.entity} ${r.summary} ${r.jurisdiction} ${r.regulators.join(' ')} ${r.categoryLabel}`.toLowerCase().includes(q));
  }

  rows.sort(SORTS[sortKey]);
  return {
    actions: rows,
    total: ENFORCEMENT_ACTIONS.length,
    count: rows.length,
    sort: sortKey,
    filter: { category: f.category || null, regulator: f.regulator || null, jurisdiction: f.jurisdiction || null, status: f.status || null, year: f.year != null ? Number(f.year) : null, q: f.q || null },
    categories: ENF_CATEGORIES.map((c) => ({ code: c.code, label: c.label, color: c.color, blurb: c.blurb })),
    disclaimer: ENFORCEMENT_DISCLAIMER,
    version: ENFORCEMENT_VERSION,
  };
}

// ── Public: one action + related real regulatory topics ───────────────────────
/**
 * @param {string} id
 * @returns {object|null}  null when the id is unknown.
 */
export function getAction(id) {
  const raw = ENFORCEMENT_BY_ID[id];
  if (!raw) return null;
  const action = shapeAction(raw);
  return {
    action,
    category: categoryRecord(raw.category),
    relatedRegulationTopics: relatedRegulations(action),
    disclaimer: ENFORCEMENT_DISCLAIMER,
    version: ENFORCEMENT_VERSION,
  };
}

// Honest, CHEAP mapping of a case's conduct category to the real FRIS regulatory
// topic areas it aligns with. This does NOT assert that a specific instrument was
// applied in the case; it points the analyst at the relevant real subject-matter
// (each links into Regulatory Horizon where the real, sourced instruments live).
// Kept as a static, auditable map — no DB dependency, safe in the browser build.
const CATEGORY_REGULATION_TOPICS = Object.freeze({
  Sanctions: ['Sanctions & embargo programmes (e.g. OFAC / EU sanctions)', 'AML/CFT transaction screening'],
  AML: ['AML/CFT frameworks (Bank Secrecy Act, EU AMLD, FINMA AMLO)', 'Know-your-customer & monitoring obligations'],
  'Bribery/Corruption': ['Anti-bribery / anti-corruption (FCPA, UK Bribery Act)', 'Third-party / intermediary due diligence'],
  'Market Manipulation': ['Market-conduct & benchmark integrity (MAR, CEA)', 'Trade-surveillance obligations'],
  'Data Protection': ['Data protection (GDPR, Swiss FADP, Geneva LIPAD)', 'International data-transfer safeguards'],
  'Consumer Protection': ['Consumer / investor protection & sales-conduct rules', 'Disclosure & suitability obligations'],
});
/**
 * @param {object} action  a shaped action (needs .category).
 * @returns {string[]}     related real regulatory topic areas (never fabricated cases).
 */
export function relatedRegulations(action) {
  return (CATEGORY_REGULATION_TOPICS[action.category] || []).slice();
}

// ── Public: analytics (counts + summed amounts by dimension) ──────────────────
// Every `amount` figure below is the ILLUSTRATIVE approxUsd scale (the analytics
// say so). Counts are exact. Groupings are ranked and stably ordered.
/**
 * @returns {object}
 */
export function analytics() {
  const rows = ENFORCEMENT_ACTIONS.map(shapeAction);
  const totalApproxUsd = rows.reduce((a, r) => a + r.approxUsd, 0);

  // By year (ascending, for the trend axis).
  const byYearMap = new Map();
  for (const r of rows) {
    const y = byYearMap.get(r.year) || { year: r.year, count: 0, approxUsd: 0 };
    y.count += 1; y.approxUsd += r.approxUsd; byYearMap.set(r.year, y);
  }
  const byYear = [...byYearMap.values()].sort((a, b) => a.year - b.year);

  // By category (ranked by summed illustrative amount, then count, then code).
  const byCategory = ENF_CATEGORIES.map((c) => {
    const rs = rows.filter((r) => r.category === c.code);
    return { code: c.code, label: c.label, color: c.color, count: rs.length, approxUsd: rs.reduce((a, r) => a + r.approxUsd, 0) };
  }).filter((c) => c.count > 0).sort((a, b) => (b.approxUsd - a.approxUsd) || (b.count - a.count) || String(a.code).localeCompare(String(b.code)));

  // By regulator (each action can involve several — an action counts once per
  // regulator it names). Ranked by count, then summed illustrative amount, then name.
  const regMap = new Map();
  for (const r of rows) {
    for (const reg of r.regulators) {
      const g = regMap.get(reg) || { regulator: reg, count: 0, approxUsd: 0 };
      g.count += 1; g.approxUsd += r.approxUsd; regMap.set(reg, g);
    }
  }
  const byRegulator = [...regMap.values()].sort((a, b) => (b.count - a.count) || (b.approxUsd - a.approxUsd) || String(a.regulator).localeCompare(String(b.regulator)));

  // By jurisdiction (the descriptive locus string). Ranked by count then amount.
  const jurMap = new Map();
  for (const r of rows) {
    const g = jurMap.get(r.jurisdiction) || { jurisdiction: r.jurisdiction, count: 0, approxUsd: 0 };
    g.count += 1; g.approxUsd += r.approxUsd; jurMap.set(r.jurisdiction, g);
  }
  const byJurisdiction = [...jurMap.values()].sort((a, b) => (b.count - a.count) || (b.approxUsd - a.approxUsd) || String(a.jurisdiction).localeCompare(String(b.jurisdiction)));

  // By amount band (stable band order, smallest → largest).
  const amountBands = ENF_AMOUNT_BANDS.map((b) => {
    const rs = rows.filter((r) => r.amountBand === b.code);
    return { code: b.code, label: b.label, color: b.color, count: rs.length, approxUsd: rs.reduce((a, r) => a + r.approxUsd, 0) };
  });

  // Status split (honest surfacing of appeal / annulled outcomes).
  const underAppeal = rows.filter((r) => r.underAppeal).length;
  const annulled = rows.filter((r) => r.annulled).length;
  const finalCount = rows.length - underAppeal - annulled;

  const years = rows.map((r) => r.year);
  const dates = rows.map((r) => r.date).sort();

  return {
    count: rows.length,
    totals: {
      approxUsd: totalApproxUsd,
      count: rows.length,
      dateRange: { first: dates[0], last: dates[dates.length - 1] },
      yearRange: { first: Math.min(...years), last: Math.max(...years) },
      largest: rows.slice().sort((a, b) => b.approxUsd - a.approxUsd).slice(0, 1).map((r) => ({ id: r.id, entity: r.entity, approxUsd: r.approxUsd, amountNative: r.amountNative, currency: r.currency }))[0] || null,
      statusSplit: { final: finalCount, underAppeal, annulled },
    },
    byYear,
    byCategory,
    byRegulator,
    byJurisdiction,
    amountBands,
    amountBasis: 'approxUsd (illustrative historical FX — for chart scale only; native amount is authoritative)',
    disclaimer: ENFORCEMENT_DISCLAIMER,
    version: ENFORCEMENT_VERSION,
  };
}

// ── Public: trend over time (per-year totals/counts + cumulative series) ───────
/**
 * @returns {object}  { points:[{year,count,approxUsd,cumulativeCount,cumulativeApproxUsd}], peakYear, disclaimer, version }
 */
export function trends() {
  const a = analytics();
  let cumC = 0, cumUsd = 0;
  const points = a.byYear.map((y) => {
    cumC += y.count; cumUsd += y.approxUsd;
    return { year: y.year, count: y.count, approxUsd: y.approxUsd, cumulativeCount: cumC, cumulativeApproxUsd: cumUsd };
  });
  // Peak year by summed illustrative amount (stable tiebreak on earliest year).
  const peak = points.slice().sort((x, y) => (y.approxUsd - x.approxUsd) || (x.year - y.year))[0] || null;
  return {
    points,
    peakYear: peak ? { year: peak.year, approxUsd: peak.approxUsd, count: peak.count } : null,
    totalApproxUsd: cumUsd,
    totalCount: cumC,
    amountBasis: a.amountBasis,
    disclaimer: ENFORCEMENT_DISCLAIMER,
    version: ENFORCEMENT_VERSION,
  };
}

// ── Meta re-exports the routes / UI consume ───────────────────────────────
export {
  ENFORCEMENT_ACTIONS, ENFORCEMENT_BY_ID, ENF_CATEGORIES, ENF_CATEGORY_BY_CODE,
  ENF_AMOUNT_BANDS, ENFORCEMENT_DISCLAIMER, ENFORCEMENT_VERSION,
};
