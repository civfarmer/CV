// @ts-check
/**
 * Screening & Watchlist — deterministic, dependency-free fuzzy-matching engine.
 *
 * Takes a query (a name, an alias, an entity, or a wallet address) and scores it
 * against a DATED SUBSET of REAL public sanctions lists in `../data/watchlists.mjs`
 * (OFAC SDN / UN Security Council / EU consolidated lists), returning ranked
 * candidate matches, each with a 0–100 score, the matched list type, an
 * explainable "why matched" breakdown (exact / token overlap / string similarity
 * / alias / date-of-birth proximity / country corroboration), and a suggested
 * band (strong / possible / weak). A batch mode screens a whole set of seeded
 * entities + wallets and returns a hit report.
 *
 * ── Determinism ──────────────────────────────────────────────────────────────
 * Same input → same output, byte-for-byte. Pure string maths (a token-set ratio
 * blended with Jaro-Winkler and a normalised Levenshtein similarity), stable
 * sorts everywhere (score desc, then id asc), no Date.now(), no randomness, no
 * network, no dependencies.
 *
 * ── Honesty ──────────────────────────────────────────────────────────────────
 * The watchlist is a DATED, ILLUSTRATIVE SUBSET of REAL public sanctions lists
 * (see watchlists.mjs). Lists change frequently; this engine demonstrates the
 * matching mechanics and is NOT a sanctions-compliance system of record — always
 * screen against the live official sources for any operational decision.
 */

import {
  WATCHLIST_ENTRIES, LIST_TYPES, LIST_TYPE_BY_CODE, BANDS, bandFor, BAND_FLOOR,
  SCREENING_DISCLAIMER, WATCHLIST_VERSION, WATCHLIST_BY_ID,
} from '../data/watchlists.mjs';

// ── Normalisation ────────────────────────────────────────────────────────────
// Fold accents/diacritics, lowercase, strip punctuation to spaces, and drop a
// small set of corporate/legal-form and title stopwords that otherwise inflate
// token overlap between unrelated companies/people. Deterministic and total.

const CORP_STOPWORDS = new Set(['ltd', 'limited', 'llc', 'inc', 'sa', 'ag', 'plc', 'co', 'company', 'corp', 'corporation', 'gmbh', 'sarl', 'srl', 'spa', 'pte', 'bv', 'nv', 'holding', 'holdings', 'group', 'trust', 'foundation', 'fund', 'the', 'and', 'of', 'mv', 'ms', 'sàrl']);
const TITLE_STOPWORDS = new Set(['mr', 'mrs', 'ms', 'dr', 'prof', 'sir', 'madam', 'mme', 'herr', 'frau']);

/**
 * Fold a string to a normalised comparison form: NFD accent-strip, lowercase,
 * non-alphanumerics → single spaces, trimmed.
 * @param {string} s
 */
export function normalise(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Tokenise a name/alias into meaningful comparison tokens (accent-folded,
 * corporate/legal-form + title stopwords removed, 1-char tokens dropped).
 * @param {string} s
 * @returns {string[]}
 */
export function tokeniseName(s) {
  return normalise(s)
    .split(' ')
    .filter((t) => t && t.length > 1 && !CORP_STOPWORDS.has(t) && !TITLE_STOPWORDS.has(t));
}

/** Is this a crypto-style address (0x… or bc1…/1…/3…)? Used to route address vs name screening. @param {string} s */
export function looksLikeAddress(s) {
  const t = String(s || '').trim();
  return /^0x[0-9a-fA-F]{6,}$/.test(t) || /^(bc1|tb1)[0-9a-z]{6,}$/i.test(t) || /^[13][a-km-zA-HJ-NP-Z1-9]{20,}$/.test(t);
}

// ── String-similarity primitives (pure) ──────────────────────────────────────

/**
 * Levenshtein edit distance (iterative, O(n·m) memory-light two-row form).
 * @param {string} a @param {string} b @returns {number}
 */
export function levenshtein(a, b) {
  a = a || ''; b = b || '';
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array(b.length + 1);
  let cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

/** Normalised Levenshtein similarity in [0,1]: 1 = identical. @param {string} a @param {string} b */
export function levSimilarity(a, b) {
  a = a || ''; b = b || '';
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return 1 - levenshtein(a, b) / max;
}

/**
 * Jaro similarity in [0,1]. @param {string} s1 @param {string} s2
 */
export function jaro(s1, s2) {
  s1 = s1 || ''; s2 = s2 || '';
  if (s1 === s2) return s1.length ? 1 : 1;
  const len1 = s1.length, len2 = s2.length;
  if (len1 === 0 || len2 === 0) return 0;
  const matchDistance = Math.max(0, Math.floor(Math.max(len1, len2) / 2) - 1);
  const s1Matches = new Array(len1).fill(false);
  const s2Matches = new Array(len2).fill(false);
  let matches = 0;
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, len2);
    for (let j = start; j < end; j++) {
      if (s2Matches[j]) continue;
      if (s1[i] !== s2[j]) continue;
      s1Matches[i] = true; s2Matches[j] = true; matches++; break;
    }
  }
  if (matches === 0) return 0;
  // Count transpositions.
  let t = 0, k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) t++;
    k++;
  }
  t /= 2;
  return (matches / len1 + matches / len2 + (matches - t) / matches) / 3;
}

/**
 * Jaro-Winkler similarity in [0,1] — Jaro with a bonus for a shared prefix (up
 * to 4 chars), which suits names (surname/forename prefixes carry signal).
 * @param {string} s1 @param {string} s2 @param {number} [p=0.1]
 */
export function jaroWinkler(s1, s2, p = 0.1) {
  const j = jaro(s1, s2);
  if (j < 0.7) return j; // Winkler bonus only applied to already-similar strings
  let prefix = 0;
  const max = Math.min(4, s1.length, s2.length);
  for (let i = 0; i < max; i++) { if (s1[i] === s2[i]) prefix++; else break; }
  return j + prefix * p * (1 - j);
}

/**
 * Token-set ratio: best token-to-token alignment between two token lists using
 * a blended per-pair similarity (exact = 1, else max(JW, Lev)). Greedy, stable.
 * Only pairs at or above a per-token evidence floor count — a coincidental
 * weak character overlap between two unrelated tokens is NOT treated as a match,
 * which keeps unrelated names below the candidate floor. Returns
 * { score:[0,1], pairs:[{a,b,sim}], strongPairs:number }.
 *
 * The score is anchored on how many of BOTH sides' tokens are genuinely covered
 * (F1-of-coverage), so matching 1 token out of 3 scores far below matching 3/3.
 * @param {string[]} at @param {string[]} bt
 */
export function tokenSetRatio(at, bt) {
  if (!at.length || !bt.length) return { score: 0, pairs: [], strongPairs: 0 };
  const TOKEN_FLOOR = 0.82; // a pair must be this similar to count as evidence
  const [small, large, flipped] = at.length <= bt.length ? [at, bt, false] : [bt, at, true];
  const used = new Array(large.length).fill(false);
  const pairs = [];
  let sum = 0;      // sum of similarities of counted pairs
  let counted = 0;  // number of small-side tokens with a qualifying partner
  for (const tok of small) {
    let best = -1, bestSim = 0;
    for (let j = 0; j < large.length; j++) {
      if (used[j]) continue;
      const other = large[j];
      const sim = tok === other ? 1 : Math.max(jaroWinkler(tok, other), levSimilarity(tok, other));
      if (sim > bestSim) { bestSim = sim; best = j; }
    }
    if (best >= 0 && bestSim >= TOKEN_FLOOR) {
      used[best] = true; sum += bestSim; counted++;
      pairs.push({ a: flipped ? large[best] : tok, b: flipped ? tok : large[best], sim: round2(bestSim) });
    }
  }
  if (!counted) return { score: 0, pairs: [], strongPairs: 0 };
  const avgSim = sum / counted;                 // quality of the matched tokens
  // Coverage on both sides (precision & recall of token matching); combine as F1
  // so a partial match (few of many tokens) is scored well below a full match.
  const recall = counted / small.length;         // small side is the query-or-entry with fewer tokens
  const precision = counted / large.length;
  const f1 = (2 * precision * recall) / (precision + recall);
  const score = avgSim * f1;
  const strongPairs = pairs.filter((p) => p.sim >= 0.99).length;
  return { score: Math.max(0, Math.min(1, score)), pairs, strongPairs };
}

// ── Date-of-birth proximity ──────────────────────────────────────────────────
/**
 * Score date-of-birth corroboration in [0,1]: exact = 1, same year = 0.6,
 * within 2 years = 0.3, else 0. Missing on either side = null (no signal).
 * @param {string|undefined} a @param {string|undefined} b
 */
export function dobProximity(a, b) {
  if (!a || !b) return null;
  const da = String(a), db = String(b);
  if (da === db) return 1;
  const ya = parseInt(da.slice(0, 4), 10), yb = parseInt(db.slice(0, 4), 10);
  if (!Number.isFinite(ya) || !Number.isFinite(yb)) return null;
  const gap = Math.abs(ya - yb);
  if (gap === 0) return 0.6;
  if (gap <= 2) return 0.3;
  return 0;
}

// ── Scoring one query against one watchlist entry ────────────────────────────

/**
 * @typedef {Object} ScoreQuery
 * @property {string} name          The name / alias / address to screen.
 * @property {string} [country]     Optional country code for corroboration.
 * @property {string} [dob]         Optional YYYY-MM-DD for persons.
 * @property {string} [kindHint]    Optional 'person'|'organisation'|'wallet' hint.
 */

/**
 * Score a normalised query object against one watchlist entry, returning a
 * 0–100 score, the winning matched string (primary name or a specific alias),
 * and an explainable list of "why" reasons. Deterministic.
 *
 * @param {{ nameRaw:string, tokens:string[], norm:string, isAddress:boolean, country?:string, dob?:string }} q
 * @param {import('../data/watchlists.mjs').WatchlistEntry} entry
 */
function scoreEntry(q, entry) {
  const why = [];
  const isWalletEntry = entry.kind === 'wallet';

  // ── Address screening path (wallet queries / wallet entries) ───────────────
  if (q.isAddress || (isWalletEntry && entry.address)) {
    const qAddr = normalise(q.nameRaw).replace(/\s+/g, '');
    const eAddr = entry.address ? normalise(entry.address).replace(/\s+/g, '') : '';
    if (qAddr && eAddr) {
      if (qAddr === eAddr) { why.push({ kind: 'exact-address', detail: 'Wallet address matches exactly.', weight: 1 }); return finalise(100, entry.name, why, entry, { addr: 1 }); }
      // Near-address: shared long prefix/suffix (transposition/typo) — rare but surfaced.
      const sim = levSimilarity(qAddr, eAddr);
      if (sim >= 0.92) { why.push({ kind: 'near-address', detail: `Wallet address is ${Math.round(sim * 100)}% similar (possible typo / truncation).`, weight: sim }); return finalise(Math.round(sim * 100), entry.name, why, entry, { addr: sim }); }
      // If the query is purely an address and the entry address doesn't match, fall
      // through to a label-name compare below (the entry may also carry a name/alias).
    }
  }

  // ── Name screening path ────────────────────────────────────────────────────
  const candidates = [{ label: entry.name, isAlias: false }, ...(entry.aliases || []).map((a) => ({ label: a, isAlias: true }))];
  let best = { score: 0, label: entry.name, isAlias: false, pairs: [], exact: false };
  for (const c of candidates) {
    const cNorm = normalise(c.label);
    if (!cNorm) continue;
    const cTokens = tokeniseName(c.label);
    // Exact normalised-string equality is the strongest name signal.
    if (q.norm && q.norm === cNorm) { best = { score: 1, label: c.label, isAlias: c.isAlias, pairs: [], exact: true }; break; }
    const { score, pairs, strongPairs } = tokenSetRatio(q.tokens, cTokens);
    // Whole-string Jaro-Winkler is used ONLY to nudge an already-supported match
    // (e.g. a single-token name, or a re-ordering the token loop under-credits) —
    // never as a standalone channel, so two unrelated names that merely share a
    // few characters cannot manufacture a score. Requires ≥1 counted token pair.
    let combined = score;
    if (pairs.length) {
      const whole = jaroWinkler(q.norm.replace(/\s+/g, ''), cNorm.replace(/\s+/g, ''));
      // Single-token vs single-token: trust the whole-string JW directly.
      if (q.tokens.length === 1 && cTokens.length === 1) combined = Math.max(score, whole);
      else combined = Math.max(score, 0.75 * score + 0.25 * whole);
    }
    if (combined > best.score) best = { score: combined, label: c.label, isAlias: c.isAlias, pairs, exact: false, strongPairs };
  }

  let score100 = Math.round(best.score * 100);
  if (best.exact) {
    why.push({ kind: best.isAlias ? 'exact-alias' : 'exact-name', detail: best.isAlias ? `Query exactly matches a known alias ("${best.label}").` : 'Query exactly matches the primary name.', weight: 1 });
    score100 = 100;
  } else if (best.score > 0) {
    const overlapTokens = best.pairs.filter((p) => p.sim >= 0.99).map((p) => p.a);
    const fuzzyTokens = best.pairs.filter((p) => p.sim < 0.99 && p.sim >= 0.7);
    if (overlapTokens.length) why.push({ kind: 'token-overlap', detail: `Shared name tokens: ${uniq(overlapTokens).join(', ')}.`, weight: 0.9 });
    if (fuzzyTokens.length) why.push({ kind: 'string-similarity', detail: `Similar (not identical) tokens: ${fuzzyTokens.map((p) => `${p.a}≈${p.b}`).join(', ')}.`, weight: 0.7 });
    if (best.isAlias) why.push({ kind: 'alias', detail: `Best match is against a known alias ("${best.label}").`, weight: 0.5 });
    if (!overlapTokens.length && !fuzzyTokens.length) why.push({ kind: 'string-similarity', detail: `Overall name similarity ${score100}%.`, weight: 0.5 });
  }

  // ── Corroboration adjustments (only when there is a name signal) ────────────
  const corroboration = {};
  if (score100 >= BAND_FLOOR - 10) {
    // Date-of-birth proximity (persons).
    const dp = dobProximity(q.dob, entry.dob);
    if (dp != null) {
      corroboration.dob = dp;
      if (dp >= 1) { score100 = Math.min(100, score100 + 6); why.push({ kind: 'dob-exact', detail: `Date of birth matches exactly (${entry.dob}).`, weight: 0.8 }); }
      else if (dp >= 0.6) { score100 = Math.min(100, score100 + 3); why.push({ kind: 'dob-year', detail: `Birth year matches (${String(entry.dob).slice(0, 4)}).`, weight: 0.5 }); }
      else if (dp === 0) { score100 = Math.max(0, score100 - 4); why.push({ kind: 'dob-mismatch', detail: 'Dates of birth differ — reduces confidence.', weight: -0.4 }); }
    }
    // Country corroboration.
    if (q.country && entry.country) {
      if (normalise(q.country) === normalise(entry.country)) { corroboration.country = 1; score100 = Math.min(100, score100 + 4); why.push({ kind: 'country', detail: `Country corroborates (${entry.country}).`, weight: 0.5 }); }
      else { corroboration.country = 0; why.push({ kind: 'country-note', detail: `Query country (${q.country}) differs from list country (${entry.country}).`, weight: -0.1 }); }
    }
  }

  return finalise(score100, best.label, why, entry, corroboration);
}

/** The list codes an entry belongs to (membership). Always >=1 ('sanctions'). */
function entryLists(entry) {
  if (Array.isArray(entry.lists) && entry.lists.length) return entry.lists;
  if (entry.list) return [entry.list]; // backward-compat with the old scalar schema
  return ['sanctions'];
}
/** The PRIMARY (highest-severity) list of an entry — drives the singular `list`
 *  field that downstream consumers (onboarding, vendor-risk, overlay, UI badges)
 *  still read. Severity order: sanctions > pep/adverse-media > internal. */
function primaryList(lists) {
  const order = ['sanctions', 'pep', 'adverse-media', 'internal'];
  for (const code of order) if (lists.includes(code)) return code;
  return lists[0];
}

/** Assemble the final match object (or null if below the candidate floor). */
function finalise(score, matchedName, why, entry, corroboration) {
  score = Math.max(0, Math.min(100, Math.round(score)));
  if (score < BAND_FLOOR) return null;
  const band = bandFor(score);
  const lists = entryLists(entry);
  const primary = primaryList(lists);
  const lt = LIST_TYPE_BY_CODE[primary];
  // Full label/severity per membership list (so the UI can render every chip).
  const listLabels = lists.map((c) => (LIST_TYPE_BY_CODE[c] ? LIST_TYPE_BY_CODE[c].label : c));
  // Order the why-reasons by descending weight then a stable label, for a stable render.
  const reasons = why.slice().sort((a, b) => (Math.abs(b.weight) - Math.abs(a.weight)) || String(a.kind).localeCompare(String(b.kind)));
  return {
    entryId: entry.id,
    // `lists` is the full membership array; `list` remains the PRIMARY list code
    // for backward compatibility with every existing consumer.
    lists,
    listLabels,
    list: primary,
    listLabel: lt ? lt.label : primary,
    listSeverity: lt ? lt.severity : 'Medium',
    kind: entry.kind,
    matchedName,
    listedName: entry.name,
    aliases: entry.aliases || [],
    dob: entry.dob || null,
    country: entry.country || null,
    program: entry.program,
    // Real-public-source provenance fields (surfaced so the UI can show the
    // sanctioning authority, listing date, source link and reason-for-listing).
    authority: entry.authority || null,
    authorities: entry.authorities || (entry.authority ? [entry.authority] : []),
    listingDate: entry.listingDate || null,
    sourceUrl: entry.sourceUrl || null,
    additionalSources: entry.additionalSources || [],
    description: entry.description || entry.note || null,
    note: entry.note,
    address: entry.address || null,
    imo: entry.imo || null,
    score,
    band,
    why: reasons.map((r) => ({ kind: r.kind, detail: r.detail })),
    corroboration,
  };
}

// ── Public: screen one query ─────────────────────────────────────────────────

/**
 * Screen a single query against the watchlist (optionally filtered to list
 * types), returning ranked matches above the candidate floor.
 *
 * @param {string|ScoreQuery} query   A name/address string, or a {name,country,dob,kindHint}.
 * @param {import('../data/watchlists.mjs').WatchlistEntry[]} [watchlist]  Defaults to the full synthetic watchlist.
 * @param {{ types?:string[], limit?:number, minScore?:number }} [opts]
 * @returns {{ query:object, matches:Array<object>, counts:{candidates:number, byBand:Record<string,number>, byList:Record<string,number>}, listTypes:Array<object>, disclaimer:string }}
 */
export function screen(query, watchlist = WATCHLIST_ENTRIES, opts = {}) {
  const q = normaliseQuery(query);
  const types = Array.isArray(opts.types) && opts.types.length ? new Set(opts.types.filter((t) => LIST_TYPE_BY_CODE[t])) : null;
  const minScore = Number.isFinite(opts.minScore) ? Math.max(BAND_FLOOR, Number(opts.minScore)) : BAND_FLOOR;
  const limit = opts.limit == null ? 25 : Math.max(1, opts.limit);

  // List-type filter is by MEMBERSHIP: keep an entry if ANY of its lists is requested.
  const list = (Array.isArray(watchlist) ? watchlist : WATCHLIST_ENTRIES).filter((e) => !types || entryLists(e).some((c) => types.has(c)));
  const matches = [];
  for (const entry of list) {
    const m = scoreEntry(q, entry);
    if (m && m.score >= minScore) matches.push(m);
  }
  // Stable ordering: score desc, then list severity (High→Low), then entryId asc.
  const sevRank = { High: 0, Medium: 1, Low: 2 };
  matches.sort((a, b) => (b.score - a.score) || ((sevRank[a.listSeverity] ?? 3) - (sevRank[b.listSeverity] ?? 3)) || String(a.entryId).localeCompare(String(b.entryId)));

  const byBand = {}; const byList = {};
  // byBand counts each match once (by band); byList is by MEMBERSHIP — a match that
  // is on both 'sanctions' and 'pep' counts toward both list tallies.
  for (const m of matches) {
    byBand[m.band] = (byBand[m.band] || 0) + 1;
    for (const c of (Array.isArray(m.lists) && m.lists.length ? m.lists : [m.list])) byList[c] = (byList[c] || 0) + 1;
  }

  return {
    query: { name: q.nameRaw, normalised: q.norm, tokens: q.tokens, isAddress: q.isAddress, country: q.country || null, dob: q.dob || null, kind: q.kindHint || (q.isAddress ? 'wallet' : null) },
    matches: matches.slice(0, limit),
    counts: { candidates: matches.length, byBand, byList },
    listTypes: LIST_TYPES.map((l) => ({ code: l.code, label: l.label, severity: l.severity, blurb: l.blurb })),
    disclaimer: SCREENING_DISCLAIMER,
  };
}

/** Coerce a string/object query into the internal normalised shape. */
function normaliseQuery(query) {
  const obj = typeof query === 'string' ? { name: query } : (query || {});
  const nameRaw = String(obj.name || '').trim();
  const isAddress = looksLikeAddress(nameRaw);
  return {
    nameRaw,
    norm: normalise(nameRaw),
    tokens: isAddress ? [] : tokeniseName(nameRaw),
    isAddress,
    country: obj.country ? String(obj.country).trim() : undefined,
    dob: obj.dob ? String(obj.dob).trim() : undefined,
    kindHint: obj.kindHint ? String(obj.kindHint).trim() : undefined,
  };
}

// ── Public: batch / portfolio screening ──────────────────────────────────────

/**
 * Screen a set of seeded ENTITIES and WALLETS against the watchlist and return a
 * per-subject hit report. Only subjects with at least one candidate match are
 * returned (ranked by their top score). Deterministic.
 *
 * @param {{ entities?:Array<object>, wallets?:Array<object> }} inputs
 *   entities: rows with { id, legal_name, entity_type, jurisdiction }
 *   wallets:  rows with { id, label, address, node_type }
 * @param {import('../data/watchlists.mjs').WatchlistEntry[]} [watchlist]
 * @param {{ types?:string[], minScore?:number, perSubjectLimit?:number }} [opts]
 * @returns {{ hits:Array<object>, summary:object, disclaimer:string }}
 */
export function screenBatch(inputs = {}, watchlist = WATCHLIST_ENTRIES, opts = {}) {
  const entities = Array.isArray(inputs.entities) ? inputs.entities : [];
  const wallets = Array.isArray(inputs.wallets) ? inputs.wallets : [];
  const perSubjectLimit = opts.perSubjectLimit == null ? 5 : Math.max(1, opts.perSubjectLimit);
  const hits = [];

  const push = (subject) => {
    const res = screen(subject.query, watchlist, { types: opts.types, minScore: opts.minScore, limit: perSubjectLimit });
    if (!res.matches.length) return;
    const top = res.matches[0];
    hits.push({
      hitId: `HIT-${subject.subjectType}-${subject.subjectId}`,
      subjectType: subject.subjectType,
      subjectId: subject.subjectId,
      subjectName: subject.subjectName,
      subjectMeta: subject.subjectMeta || null,
      topScore: top.score,
      topBand: top.band,
      topList: top.list,
      topListLabel: top.listLabel,
      topSeverity: top.listSeverity,
      matchCount: res.matches.length,
      matches: res.matches,
    });
  };

  for (const e of entities) {
    if (!e || !e.legal_name) continue;
    const kindHint = e.entity_type === 'person' ? 'person' : 'organisation';
    // `source_type` is threaded through so the UI can flag a hit whose subject is a
    // REAL sanctioned party deliberately inserted into the seed (source_type
    // 'real-public-sanctions-demo') vs an incidental synthetic-name collision.
    push({ subjectType: 'entity', subjectId: e.id, subjectName: e.legal_name, subjectMeta: { entity_type: e.entity_type, jurisdiction: e.jurisdiction, source_type: e.source_type || null }, query: { name: e.legal_name, kindHint } });
  }
  for (const w of wallets) {
    if (!w) continue;
    // Screen the wallet by its address (if any) AND its label; keep the stronger.
    const byAddr = w.address ? screen({ name: w.address, kindHint: 'wallet' }, watchlist, { types: opts.types, minScore: opts.minScore, limit: perSubjectLimit }) : { matches: [] };
    const byLabel = w.label ? screen({ name: w.label, kindHint: 'wallet' }, watchlist, { types: opts.types, minScore: opts.minScore, limit: perSubjectLimit }) : { matches: [] };
    const merged = mergeMatches(byAddr.matches, byLabel.matches).slice(0, perSubjectLimit);
    if (!merged.length) continue;
    const top = merged[0];
    hits.push({
      hitId: `HIT-wallet-${w.id}`,
      subjectType: 'wallet', subjectId: w.id, subjectName: w.label || w.address || w.id,
      subjectMeta: { node_type: w.node_type, address: w.address || null },
      topScore: top.score, topBand: top.band, topList: top.list, topListLabel: top.listLabel, topSeverity: top.listSeverity,
      matchCount: merged.length, matches: merged,
    });
  }

  // Stable ordering: top score desc, then severity, then subjectId.
  const sevRank = { High: 0, Medium: 1, Low: 2 };
  hits.sort((a, b) => (b.topScore - a.topScore) || ((sevRank[a.topSeverity] ?? 3) - (sevRank[b.topSeverity] ?? 3)) || String(a.subjectId).localeCompare(String(b.subjectId)));

  const byBand = {}; const byList = {}; const bySubjectType = {};
  for (const h of hits) { byBand[h.topBand] = (byBand[h.topBand] || 0) + 1; byList[h.topList] = (byList[h.topList] || 0) + 1; bySubjectType[h.subjectType] = (bySubjectType[h.subjectType] || 0) + 1; }

  return {
    hits,
    summary: {
      subjectsScreened: entities.length + wallets.length,
      entitiesScreened: entities.length,
      walletsScreened: wallets.length,
      hitCount: hits.length,
      strongHits: byBand.strong || 0,
      byBand, byList, bySubjectType,
    },
    disclaimer: SCREENING_DISCLAIMER,
  };
}

/** Merge two match arrays by entryId keeping the higher-scoring copy; re-sort stably. */
function mergeMatches(a, b) {
  const map = new Map();
  for (const m of [...(a || []), ...(b || [])]) {
    const ex = map.get(m.entryId);
    if (!ex || m.score > ex.score) map.set(m.entryId, m);
  }
  const sevRank = { High: 0, Medium: 1, Low: 2 };
  return [...map.values()].sort((x, y) => (y.score - x.score) || ((sevRank[x.listSeverity] ?? 3) - (sevRank[y.listSeverity] ?? 3)) || String(x.entryId).localeCompare(String(y.entryId)));
}

// ── Connective tissue: expose sanctioned / PEP subject ids for other engines ──

/**
 * Given a batch hit report, return the sets of seeded ENTITY and WALLET ids that
 * hit the SANCTIONS (and, separately, PEP) lists at or above a confidence floor.
 * This is what the Chain-Link `deriveWalletRisk({ sanctionedIds })` input and a
 * Nexus "sanctions / PEP overlay" consume — turning a screening hit into a
 * risk signal in the other modules. Deterministic.
 *
 * @param {{ hits:Array<object> }} batchReport   Output of screenBatch().
 * @param {{ minScore?:number }} [opts]  Confidence floor (default: strong-band).
 * @returns {{ sanctionedEntityIds:string[], sanctionedWalletIds:string[], pepEntityIds:string[], pepWalletIds:string[], sanctionedIds:string[] }}
 */
export function deriveScreeningOverlay(batchReport, opts = {}) {
   const floor = Number.isFinite(opts.minScore) ? Number(opts.minScore) : BANDS.find((b) => b.code === 'strong').min;
  const out = { sanctionedEntityIds: new Set(), sanctionedWalletIds: new Set(), pepEntityIds: new Set(), pepWalletIds: new Set() };
  for (const h of (batchReport && batchReport.hits) || []) {
    for (const m of h.matches || []) {
      if (m.score < floor) continue;
      // Membership-aware: a match on the 'sanctions' list feeds the sanctioned sets;
      // a match on the 'pep' list feeds the PEP sets. An entry on BOTH feeds both.
      const lists = Array.isArray(m.lists) && m.lists.length ? m.lists : [m.list];
      if (lists.includes('sanctions')) {
        if (h.subjectType === 'entity') out.sanctionedEntityIds.add(h.subjectId);
        else if (h.subjectType === 'wallet') out.sanctionedWalletIds.add(h.subjectId);
      }
      if (lists.includes('pep')) {
        if (h.subjectType === 'entity') out.pepEntityIds.add(h.subjectId);
        else if (h.subjectType === 'wallet') out.pepWalletIds.add(h.subjectId);
      }
    }
  }
  const sanctionedEntityIds = [...out.sanctionedEntityIds].sort();
  const sanctionedWalletIds = [...out.sanctionedWalletIds].sort();
  return {
    sanctionedEntityIds,
    sanctionedWalletIds,
    pepEntityIds: [...out.pepEntityIds].sort(),
    pepWalletIds: [...out.pepWalletIds].sort(),
    // Convenience union for deriveWalletRisk({ sanctionedIds }) - wallet ids only.
    sanctionedIds: sanctionedWalletIds,
  };
}

// -- Meta re-exports the routes/UI consume --------------------------------------
export { LIST_TYPES, BANDS, bandFor, BAND_FLOOR, SCREENING_DISCLAIMER, WATCHLIST_VERSION, WATCHLIST_ENTRIES, WATCHLIST_BY_ID };

// -- Small helpers --------------------------------------------------------------
function uniq(arr) { return [...new Set(arr)]; }
function round2(x) { return Math.round(x * 100) / 100; }
