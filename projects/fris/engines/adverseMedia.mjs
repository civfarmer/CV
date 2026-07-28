// @ts-check
/**
 * Adverse-Media / OSINT Monitoring — deterministic negative-news classification
 * and entity-linked roll-up engine.
 *
 * A transparent, rule-based classifier in the same spirit as the regulatory
 * obligation extractor (`compare.mjs`) and the vendor-risk scorer
 * (`vendorRisk.mjs`): it reads a news-style item's TEXT, scores it against a set
 * of keyword signals per risk category, derives a severity from the category's
 * base weight plus intensity/exculpatory cues, and infers a sentiment — every
 * output attributable to a named signal so a human analyst can adjudicate. There
 * are no hidden components, no randomness and no network.
 *
 * Three public functions:
 *   classify(item)            — category (+ score breakdown), severity, sentiment,
 *                               a source-credibility grade, and an adverse-media
 *                               "impact" score in [0,100] for the single item.
 *   feed(filters)             — the whole corpus classified, filterable by
 *                               category / severity / sentiment / subject / text,
 *                               deduped and ranked (severity -> recency -> id).
 *   subjectProfile(subjectId) — an aggregated adverse-media risk profile for one
 *                               entity/vendor: count by category, peak severity,
 *                               a composite adverse-media score, and a timeline.
 *
 * -- Determinism --------------------------------------------------------------
 * Same corpus + same filters -> same output, byte-for-byte. Pure arithmetic,
 * stable ordering, no Date.now() (recency is measured against a passed/derived
 * reference), no randomness, no dependencies beyond the data module + the shared
 * tokenizer.
 *
 * -- Honesty ------------------------------------------------------------------
 * The corpus is SYNTHETIC (see data/adverseMedia.mjs). This engine demonstrates
 * negative-news classification and roll-up mechanics; it is NOT an adverse-media
 * system of record.
 */

import {
  ADVERSE_MEDIA, ADVERSE_MEDIA_BY_ID, AM_CATEGORIES, AM_CATEGORY_BY_CODE,
  AM_SEVERITIES, AM_SEVERITY_BY_CODE, AM_SEVERITY_RANK, AM_SENTIMENTS,
  AM_SENTIMENT_BY_CODE, AM_POSITIVE_CUES, AM_INTENSITY_CUES, AM_OUTLETS,
  AM_OUTLET_BY_CODE, ADVERSE_MEDIA_DISCLAIMER, ADVERSE_MEDIA_VERSION,
} from '../data/adverseMedia.mjs';
import { tokenize } from './compare.mjs';

// A fixed "as-of" reference so recency maths are deterministic in tests and the
// e2e harness. Callers (routes) may pass a different asOf; the default keeps unit
// tests reproducible without a clock. Chosen after the newest corpus date.
export const DEFAULT_AS_OF = '2026-07-01';

// Recency half-life (days): a mention loses half its recency weight this often.
const RECENCY_HALFLIFE_DAYS = 120;

// -- Classification: category signal scoring ----------------------------------
// For each category we count how many of its keyword signals appear in the item
// text (headline + snippet). Multi-word signals are matched as substrings on the
// normalised text; single tokens are matched against the token set. The winning
// category is the highest signal score; ties break by the category's base weight
// then a stable category order.

/** Normalise item text to a lowercase string + a token set. @param {object} item */
function textOf(item) {
  const raw = `${item.headline || ''} . ${item.snippet || ''}`;
  const lower = String(raw).toLowerCase();
  const tokens = new Set(tokenize(raw));
  return { lower, tokens };
}

/** Does a signal phrase appear in the item text? Multi-word -> substring; single -> token. */
function signalHit(signal, lower, tokens) {
  const s = String(signal).toLowerCase();
  if (s.includes(' ') || s.includes('-')) return lower.includes(s);
  return tokens.has(s);
}

// 'reputational' is a deliberately GENERIC catch-all whose cues (alleged, probe,
// investigation, accused ...) co-occur with almost every substantive theme. It
// must only win when no substantive category fires, so its signal score is
// discounted when ranking -- otherwise a sanctions/fraud/corruption item would be
// mislabelled "reputational" merely because it also says "alleged". The discount
// affects RANKING only; the raw hit list is still reported for transparency.
const GENERIC_CATEGORIES = new Set(['reputational']);

/**
 * Score every category against an item's text.
 * @returns {Array<{code:string,label:string,hits:string[],score:number,rank:number,base:number}>}
 *          one row per category, ordered by ranking score desc then base desc then code.
 */
export function categoryScores(item) {
  const { lower, tokens } = textOf(item);
  const rows = AM_CATEGORIES.map((c) => {
    const hits = c.signals.filter((sig) => signalHit(sig, lower, tokens));
    // Ranking score: a substantive category counts full; the generic catch-all is
    // heavily discounted so it only ever wins when nothing substantive fired.
    const rank = GENERIC_CATEGORIES.has(c.code) ? hits.length * 0.15 : hits.length;
    return { code: c.code, label: c.label, base: c.base, hits, score: hits.length, rank };
  });
  rows.sort((a, b) => (b.rank - a.rank) || (b.base - a.base) || a.code.localeCompare(b.code));
  return rows;
}

// -- Classification: sentiment ------------------------------------------------
/** Infer sentiment from exculpatory vs negative cues. @param {object} item */
export function classifySentiment(item) {
  const { lower } = textOf(item);
  const positives = AM_POSITIVE_CUES.filter((c) => lower.includes(c));
  // Any adverse-category signal present at all implies a negative core.
  const hasNegativeCore = AM_CATEGORIES.some((c) => c.signals.some((sig) => lower.includes(String(sig).toLowerCase())));
  let code;
  if (positives.length && hasNegativeCore) code = 'mixed';        // wrongdoing raised AND softened
  else if (positives.length) code = 'neutral';                     // only exculpatory / cleared
  else if (hasNegativeCore) code = 'negative';                     // adverse with no softening
  else code = 'neutral';                                           // purely contextual
  return { code, cues: positives, label: AM_SENTIMENT_BY_CODE[code].label, score: AM_SENTIMENT_BY_CODE[code].score };
}

// -- Classification: severity -------------------------------------------------
/**
 * Derive a continuous risk intensity in [0,1] for an item, then map to a severity
 * band. Intensity = category base, lifted by intensity cues and the sharpness of
 * the winning category's signal, softened by exculpatory cues and low-credibility
 * sourcing. Fully deterministic and explainable.
 * @param {object} item
 * @param {{code:string,base:number,score:number,hits:string[]}} winner  top category row
 * @param {{code:string,cues:string[]}} sentiment
 */
export function severityIntensity(item, winner, sentiment) {
  const { lower } = textOf(item);
  let intensity = winner ? winner.base : 0.3;
  // Multiple corroborating signals in the winning category sharpen it a little.
  if (winner && winner.score >= 2) intensity += 0.05;
  // Intensity cues (convicted / frozen / raided / record fine ...) push up.
  const intensifiers = AM_INTENSITY_CUES.filter((c) => lower.includes(c));
  intensity += Math.min(0.18, intensifiers.length * 0.09);
  // Exculpatory cues (cleared / dismissed / dropped ...) pull down.
  const softeners = (sentiment.cues || []);
  intensity -= Math.min(0.30, softeners.length * 0.18);
  // A rumour-tier source can only ever support a High, never a Critical, on its own.
  const outlet = AM_OUTLET_BY_CODE[item.outlet] || null;
  const cred = outlet ? outlet.credibility : 0.6;
  if (cred < 0.5) intensity = Math.min(intensity, 0.78);
  intensity = clamp01(intensity);
  return { intensity, intensifiers, softeners, credibility: cred };
}

/** Map an intensity in [0,1] to a severity band code. @param {number} intensity */
export function severityFor(intensity) {
  let out = AM_SEVERITIES[AM_SEVERITIES.length - 1].code; // Info
  for (const s of AM_SEVERITIES) if (intensity >= s.min) { out = s.code; break; }
  return out;
}

// -- Public: classify one item ------------------------------------------------
/**
 * Classify a single adverse-media item deterministically.
 * @param {object} item  A row from data/adverseMedia.mjs (or same shape).
 * @returns {object}
 */
export function classify(item) {
  const scores = categoryScores(item);
  const winner = scores[0] && scores[0].score > 0
    ? scores[0]
    // No keyword hit at all -> fall back to the authored category (kept aligned in
    // the corpus) or 'reputational'. This never happens for the seeded corpus.
    : { code: item.category || 'reputational', label: (AM_CATEGORY_BY_CODE[item.category || 'reputational'] || {}).label || 'Reputational', base: (AM_CATEGORY_BY_CODE[item.category || 'reputational'] || {}).base || 0.35, hits: [], score: 0 };

  const sentiment = classifySentiment(item);
  const sev = severityIntensity(item, winner, sentiment);
  const severity = severityFor(sev.intensity);
  const sevRec = AM_SEVERITY_BY_CODE[severity];
  const catRec = AM_CATEGORY_BY_CODE[winner.code] || null;
  const outlet = AM_OUTLET_BY_CODE[item.outlet] || null;

  // A per-item adverse-media "impact" score in [0,100]: severity intensity is the
  // spine, lightly weighted by source credibility so a serious claim from a wire
  // outweighs the same claim from a forum. Explainable, deterministic.
  const impact = Math.round(clamp01(sev.intensity) * (0.8 + 0.2 * clamp01(sev.credibility)) * 100);

  // Build an explanation trail (why this classification).
  const why = [];
  if (winner.hits.length) why.push({ kind: 'category', detail: `Matched ${winner.hits.length} "${winner.label}" signal(s): ${winner.hits.slice(0, 4).join(', ')}.` });
  else why.push({ kind: 'category', detail: `No strong keyword signal; classified as ${winner.label} from context.` });
  if (sev.intensifiers.length) why.push({ kind: 'intensity', detail: `Intensity cue(s) raised severity: ${sev.intensifiers.slice(0, 3).join(', ')}.` });
  if (sev.softeners.length) why.push({ kind: 'exculpatory', detail: `Exculpatory cue(s) softened it: ${sev.softeners.slice(0, 3).join(', ')}.` });
  why.push({ kind: 'source', detail: `Source "${outlet ? outlet.name : item.outlet}" has a ${pct(sev.credibility)} credibility grade (${outlet ? outlet.tier : 'unknown tier'}).` });

  return {
    id: item.id,
    headline: item.headline,
    snippet: item.snippet,
    date: item.date,
    outlet: item.outlet,
    outletName: outlet ? outlet.name : item.outlet,
    outletTier: outlet ? outlet.tier : null,
    credibility: round2(sev.credibility),
    subjects: (item.subjects || []).map((s) => ({ type: s.type, id: s.id, name: s.name })),
    category: winner.code,
    categoryLabel: winner.label,
    categoryColor: catRec ? catRec.color : '#7d8aa0',
    categoryScores: scores.filter((s) => s.score > 0).map((s) => ({ code: s.code, label: s.label, hits: s.hits, score: s.score })),
    severity,
    severityRank: sevRec.rank,
    severityColor: sevRec.color,
    intensity: round2(sev.intensity),
    sentiment: sentiment.code,
    sentimentLabel: sentiment.label,
    impact,
    why,
    data_classification: 'synthetic-demo',
  };
}

// -- Public: the classified, filterable feed ----------------------------------
/**
 * Classify the whole corpus and return a ranked, filtered feed + facet counts.
 * @param {object} [filters]
 * @param {string} [filters.category]   an AM_CATEGORIES code
 * @param {string} [filters.severity]   an AM_SEVERITIES code
 * @param {string} [filters.sentiment]  an AM_SENTIMENTS code
 * @param {string} [filters.subjectId]  an ENT-#### or VEN-#### id (any linked subject)
 * @param {string} [filters.q]          free-text search over headline + snippet + subject names
 * @param {string} [filters.asOf]       ISO reference date for recency (default DEFAULT_AS_OF)
 * @param {object[]} [filters.items]    override the corpus (defaults to ADVERSE_MEDIA)
 * @returns {object}
 */
export function feed(filters = {}) {
  const asOf = filters.asOf || DEFAULT_AS_OF;
  const src = Array.isArray(filters.items) ? filters.items : ADVERSE_MEDIA;
  const all = src.map(classify);

  // Facet counts computed over the UNFILTERED classified set (so the UI can show
  // totals per facet regardless of the active filter).
  const byCategory = countBy(all, (m) => m.category);
  const bySeverity = countBy(all, (m) => m.severity);
  const bySentiment = countBy(all, (m) => m.sentiment);

  const q = String(filters.q || '').trim().toLowerCase();
  let rows = all.filter((m) =>
    (!filters.category || m.category === filters.category) &&
    (!filters.severity || m.severity === filters.severity) &&
    (!filters.sentiment || m.sentiment === filters.sentiment) &&
    (!filters.subjectId || (m.subjects || []).some((s) => s.id === filters.subjectId)) &&
    (!q || (`${m.headline} ${m.snippet} ${(m.subjects || []).map((s) => s.name).join(' ')}`).toLowerCase().includes(q)));

  // Rank: severity rank desc -> recency (date desc) -> id asc (stable).
  rows = rows.slice().sort((a, b) => (b.severityRank - a.severityRank) || (a.date < b.date ? 1 : a.date > b.date ? -1 : 0) || String(a.id).localeCompare(String(b.id)));

  return {
    items: rows,
    total: rows.length,
    grandTotal: all.length,
    facets: {
      byCategory: AM_CATEGORIES.map((c) => ({ code: c.code, label: c.label, color: c.color, count: byCategory[c.code] || 0 })),
      bySeverity: AM_SEVERITIES.map((s) => ({ code: s.code, rank: s.rank, color: s.color, count: bySeverity[s.code] || 0 })),
      bySentiment: AM_SENTIMENTS.map((s) => ({ code: s.code, label: s.label, color: s.color, count: bySentiment[s.code] || 0 })),
    },
    asOf,
    categories: AM_CATEGORIES.map((c) => ({ code: c.code, label: c.label, color: c.color, base: c.base })),
    severities: AM_SEVERITIES.map((s) => ({ code: s.code, rank: s.rank, color: s.color, blurb: s.blurb })),
    sentiments: AM_SENTIMENTS.map((s) => ({ code: s.code, label: s.label, color: s.color })),
    disclaimer: ADVERSE_MEDIA_DISCLAIMER,
    version: ADVERSE_MEDIA_VERSION,
  };
}

// -- Public: the aggregated per-subject profile -------------------------------
/**
 * Aggregate every adverse-media item that links to a subject (entity or vendor)
 * into one adverse-media risk profile: count by category, peak severity, a
 * composite adverse-media score in [0,100], and a chronological timeline.
 *
 * The composite score blends the subject's peak-item impact with a
 * diminishing-returns aggregation of ALL its items (so many corroborating
 * mentions raise the score, but never past 100), each item recency-weighted so
 * old news counts for less. Every component is attributable.
 *
 * @param {string} subjectId  an ENT-#### or VEN-#### id
 * @param {object} [opts]
 * @param {string} [opts.asOf]  ISO reference date for recency (default DEFAULT_AS_OF)
 * @param {object[]} [opts.items]  override the corpus
 * @returns {object}
 */
export function subjectProfile(subjectId, opts = {}) {
  const asOf = opts.asOf || DEFAULT_AS_OF;
  const src = Array.isArray(opts.items) ? opts.items : ADVERSE_MEDIA;
  const asOfMs = dateMs(asOf);

  const linked = src.filter((m) => (m.subjects || []).some((s) => s.id === subjectId)).map(classify);
  // Chronological timeline (oldest -> newest) for a stable, readable history.
  linked.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || String(a.id).localeCompare(String(b.id)));

  // Resolve a display name + subject type from the first link that names it.
  let subjectName = subjectId, subjectType = null;
  for (const m of linked) {
    const s = (m.subjects || []).find((x) => x.id === subjectId);
    if (s) { subjectName = s.name || subjectId; subjectType = s.type; break; }
  }

  if (!linked.length) {
    return {
      subjectId, subjectName, subjectType, found: false,
      itemCount: 0, adverseMediaScore: 0, riskBand: 'None',
      peakSeverity: null, byCategory: [], bySeverity: [], sentiments: {}, timeline: [],
      latest: null, asOf, disclaimer: ADVERSE_MEDIA_DISCLAIMER,
    };
  }

  // Count by category and by severity.
  const catCounts = countBy(linked, (m) => m.category);
  const sevCounts = countBy(linked, (m) => m.severity);
  const sentCounts = countBy(linked, (m) => m.sentiment);

  // Peak severity (highest rank present).
  let peak = linked[0];
  for (const m of linked) if (m.severityRank > peak.severityRank) peak = m;
  const peakSeverity = peak.severity;

  // Composite adverse-media score: peak recency-weighted impact + a
  // diminishing-returns lift from the remaining items.
  const weighted = linked.map((m) => ({ m, w: recencyWeight(m.date, asOfMs), rw: (m.impact / 100) * recencyWeight(m.date, asOfMs) }));
  const peakRw = Math.max(...weighted.map((x) => x.rw));
  // 1 - product(1 - rw*k) compounds corroborating items with diminishing returns.
  let prod = 1; for (const x of weighted) prod *= (1 - clamp01(x.rw * 0.5));
  const breadthLift = clamp01(1 - prod);
  const composite = Math.round(clamp01(0.7 * peakRw + 0.3 * breadthLift) * 100);
  const riskBand = amBandFor(composite);

  return {
    subjectId,
    subjectName,
    subjectType,
    found: true,
    itemCount: linked.length,
    adverseMediaScore: composite,
    riskBand,
    riskColor: amBandColor(riskBand),
    peakSeverity,
    peakSeverityColor: AM_SEVERITY_BY_CODE[peakSeverity].color,
    peakItem: { id: peak.id, headline: peak.headline, date: peak.date, severity: peak.severity, category: peak.category },
    byCategory: AM_CATEGORIES.filter((c) => catCounts[c.code]).map((c) => ({ code: c.code, label: c.label, color: c.color, count: catCounts[c.code] })).sort((a, b) => (b.count - a.count) || a.code.localeCompare(b.code)),
    bySeverity: AM_SEVERITIES.filter((s) => sevCounts[s.code]).map((s) => ({ code: s.code, rank: s.rank, color: s.color, count: sevCounts[s.code] })),
    sentiments: sentCounts,
    latest: (() => { const l = linked[linked.length - 1]; return { id: l.id, headline: l.headline, date: l.date, severity: l.severity, category: l.category }; })(),
    timeline: linked.map((m) => ({ id: m.id, headline: m.headline, date: m.date, outlet: m.outletName, category: m.category, categoryLabel: m.categoryLabel, categoryColor: m.categoryColor, severity: m.severity, severityColor: m.severityColor, sentiment: m.sentiment, impact: m.impact, credibility: m.credibility })),
    asOf,
    disclaimer: ADVERSE_MEDIA_DISCLAIMER,
  };
}

// -- Public: a compact roll-up of the top flagged subjects (for a dashboard) --
/**
 * Roll every item up per linked subject and return the highest-scoring subjects.
 * @param {object} [opts]
 * @param {number} [opts.limit]  how many top subjects to return (default 8)
 * @param {string} [opts.asOf]   ISO reference date
 * @param {object[]} [opts.items] override the corpus
 * @returns {Array<object>}
 */
export function topSubjects(opts = {}) {
  const limit = Number.isFinite(opts.limit) ? opts.limit : 8;
  const src = Array.isArray(opts.items) ? opts.items : ADVERSE_MEDIA;
  const ids = new Map(); // id -> {id,name,type}
  for (const m of src) for (const s of (m.subjects || [])) if (!ids.has(s.id)) ids.set(s.id, { id: s.id, name: s.name, type: s.type });
  const profiles = [...ids.keys()].map((id) => {
    const p = subjectProfile(id, { asOf: opts.asOf, items: src });
    return { subjectId: p.subjectId, subjectName: p.subjectName, subjectType: p.subjectType, itemCount: p.itemCount, adverseMediaScore: p.adverseMediaScore, riskBand: p.riskBand, riskColor: p.riskColor, peakSeverity: p.peakSeverity, topCategory: p.byCategory[0] ? p.byCategory[0].label : null };
  });
  profiles.sort((a, b) => (b.adverseMediaScore - a.adverseMediaScore) || (b.itemCount - a.itemCount) || String(a.subjectId).localeCompare(String(b.subjectId)));
  return profiles.slice(0, limit);
}

// -- Adverse-media risk bands (0-100 composite -> band) -----------------------
export const AM_RISK_BANDS = Object.freeze([
  { code: 'None', min: 0, color: '#46b877' },
  { code: 'Low', min: 20, color: '#4d8df0' },
  { code: 'Elevated', min: 45, color: '#e5a53b' },
  { code: 'High', min: 65, color: '#f0616d' },
  { code: 'Severe', min: 82, color: '#c1121f' },
]);
function amBandFor(score) { let out = AM_RISK_BANDS[0].code; for (const b of AM_RISK_BANDS) if (score >= b.min) out = b.code; return out; }
function amBandColor(code) { const b = AM_RISK_BANDS.find((x) => x.code === code); return b ? b.color : '#7d8aa0'; }

// -- Small pure helpers -------------------------------------------------------
function countBy(arr, keyFn) { const out = {}; for (const x of arr) { const k = keyFn(x); out[k] = (out[k] || 0) + 1; } return out; }
function clamp01(x) { if (Number.isNaN(x) || x < 0) return 0; return x > 1 ? 1 : x; }
function round2(x) { return Math.round(x * 100) / 100; }
function pct(x) { return Math.round(clamp01(x) * 100) + '%'; }
function dateMs(iso) { const d = new Date(String(iso) + 'T00:00:00Z'); return Number.isNaN(d.getTime()) ? 0 : d.getTime(); }
/** Exponential recency decay with a fixed half-life; in [0,1], 1.0 at asOf. */
function recencyWeight(dateIso, asOfMs) {
  const t = dateMs(dateIso);
  if (!t || !asOfMs) return 1;
  const days = Math.max(0, (asOfMs - t) / 86400000);
  return clamp01(Math.pow(0.5, days / RECENCY_HALFLIFE_DAYS));
}

// -- Meta re-exports the routes/UI consume ------------------------------------
export {
  ADVERSE_MEDIA, ADVERSE_MEDIA_BY_ID, AM_CATEGORIES, AM_CATEGORY_BY_CODE,
  AM_SEVERITIES, AM_SEVERITY_BY_CODE, AM_SEVERITY_RANK, AM_SENTIMENTS,
  AM_OUTLETS, AM_OUTLET_BY_CODE, ADVERSE_MEDIA_DISCLAIMER, ADVERSE_MEDIA_VERSION,
};
