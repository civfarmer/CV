// @ts-check
/**
 * Compliance-Query Sandbox — deterministic advisory engine.
 *
 * A pure, dependency-free routing + triage engine that evaluates a small
 * business profile (a free-text query / pasted policy + where it is based, where
 * it trades / employs, its size and its controller/processor role) against the
 * deterministic knowledge base in `../data/complianceKB.mjs`, and answers three
 * questions a non-lawyer actually reaches for first:
 *   (a) WHAT law/standard and internal-policy artefact applies — grouped BY
 *       JURISDICTION so the reader can find their own row fast;
 *   (b) whether it must be RAISED WITH LEGAL, handled via a DEFINED PROCESS, or
 *       HANDLED SIMPLY (the triage rubric); and
 *   (c) the CONCRETE NEXT STEPS.
 *
 * It reuses FRIS's proven text engines — `tokenize`, `rankRegulations`,
 * `compareTexts` from `compare.mjs` — rather than re-implementing text handling,
 * and joins its abstract frameworks to the real 47-instrument register via a
 * title substring match so every result links through to Regulatory Horizon.
 *
 * Determinism: same input → same output, byte-for-byte. Stable sorts everywhere
 * (jurisdiction by a fixed order, frameworks by mandatory-desc then name,
 * obligations by the KB's fixed order, triage reasons by weight-desc then id).
 * No Date.now(), no randomness, no network. NOT LEGAL ADVICE — the copy on every
 * result (the KB's DISCLAIMER) says so.
 */

import { tokenize, rankRegulations, compareTexts } from './compare.mjs';
import {
  JURISDICTIONS, SIZE_BANDS, ROLES, OBLIGATIONS, FRAMEWORKS, TOPICS,
  TRIAGE_VERDICTS, TRIAGE_SIGNALS, CLEAR_CUT_PROCESSES, DISCLAIMER, KB_VERSION,
  OBLIGATION_BY_ID, FRAMEWORK_BY_ID, JURISDICTION_BY_CODE,
} from '../data/complianceKB.mjs';

// Fixed jurisdiction display/sort order — the primary axis the reader navigates.
// Anything not listed sorts last (alphabetically) so new codes never crash.
const JURISDICTION_ORDER = JURISDICTIONS.map((j) => j.code);
const jOrder = (code) => { const i = JURISDICTION_ORDER.indexOf(code); return i < 0 ? 999 : i; };

// Fixed obligation order (the KB's declared order) so obligation lists are stable.
const OBLIGATION_ORDER = OBLIGATIONS.map((o) => o.id);
const oOrder = (id) => { const i = OBLIGATION_ORDER.indexOf(id); return i < 0 ? 999 : i; };

const VERDICT_BY_CODE = Object.fromEntries(TRIAGE_VERDICTS.map((v) => [v.code, v]));
const uniq = (arr) => [...new Set(arr)];
const arr = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);

// ── Counterparty / jurisdiction ("sovereign nexus") risk reference ────────────
// A SMALL, deliberately-conservative lookup used only to flag when a submitted
// brief NAMES a jurisdiction or structure that carries well-documented financial-
// crime risk, and to give a SHORT, plain reason WHY. It is a DATED snapshot of
// public designations (OFAC / EU / UK sanctions; FATF public statements) — NOT a
// live feed. Flagging a mention is not an allegation about any real party; verify
// against the current consolidated lists and the latest FATF plenary before
// acting. Bands: 'High' = prohibitive / FATF call-for-action; 'Elevated' =
// extensive measures, or offshore-secrecy / heightened-monitoring exposure.
const JURISDICTION_RISK = [
  { name: 'Iran', band: 'High', match: ['iran'], why: 'Comprehensively sanctioned (OFAC/EU/UK) and on the FATF "call for action" list — dealing with, or routing funds through, Iran is prohibited for most operators and can be strict-liability.' },
  { name: 'North Korea (DPRK)', band: 'High', match: ['north korea', 'dprk', "democratic people's republic of korea"], why: 'Comprehensively sanctioned and on the FATF "call for action" list — a prohibited counterparty and a proliferation-finance risk.' },
  { name: 'Syria', band: 'High', match: ['syria'], why: 'Subject to comprehensive / extensive sanctions (EU/UK/US) and elevated financial-crime risk — expect prohibition and enhanced due diligence.' },
  { name: 'Cuba', band: 'High', match: ['cuba'], why: 'Comprehensive US embargo (OFAC) — US-nexus dealings are broadly prohibited; check the EU/UK position too.' },
  { name: 'Russia-occupied regions of Ukraine', band: 'High', match: ['crimea', 'donetsk', 'luhansk', 'sevastopol'], why: 'Comprehensively sanctioned regions (OFAC/EU/UK) — dealing is prohibited.' },
  { name: 'Myanmar (Burma)', band: 'High', match: ['myanmar', 'burma'], why: 'On the FATF "call for action" list and subject to targeted sanctions — highest-risk; apply enhanced due diligence / counter-measures.' },
  { name: 'Russia', band: 'Elevated', match: ['russia', 'russian federation'], why: 'Subject to extensive sectoral sanctions and export controls (EU/UK/US) — high risk of touching a restricted party, bank or good; screen ownership (50% rule) and goods carefully.' },
  { name: 'Belarus', band: 'Elevated', match: ['belarus'], why: 'Subject to extensive sanctions and export controls alongside Russia — screen ownership and goods.' },
  { name: 'Venezuela', band: 'Elevated', match: ['venezuela'], why: 'Subject to targeted sanctions (notably the government / PdVSA) and elevated corruption risk — screen the specific counterparty and any state nexus.' },
  { name: 'Offshore secrecy centre', band: 'Elevated', match: ['british virgin islands', 'bvi', 'cayman', 'panama', 'seychelles', 'belize', 'marshall islands', 'nevis', 'vanuatu'], why: 'A high-secrecy offshore centre frequently used to layer ownership or funds — expect nominee directors, opaque UBO and rapid pass-through; identify the ultimate beneficial owner before proceeding.' },
];

// Structural / typology cues a brief may reveal (PEP, UBO opacity, layering,
// sanctions hit). Same honesty caveat — these flag WORDS in the text, not proven
// facts about any party.
const BRIEF_RISK_CUES = [
  { label: 'Possible sanctioned-party exposure', band: 'High', match: ['sdn', 'blocked person', 'designated person', 'sanctioned party', 'sanctioned entity', 'on the ofac', 'ofac list', 'asset freeze', 'specially designated'], why: 'The brief references a sanctions hit — do not proceed on a possible match: screen ownership (OFAC 50% rule), freeze if required, and report to the competent authority.' },
  { label: 'PEP exposure', band: 'Elevated', match: ['pep', 'politically exposed', 'politically-exposed', 'head of state', 'government minister', 'state-owned', 'public official', 'senior official'], why: 'A politically-exposed person (or family / close associate) may be involved — apply enhanced due diligence, senior sign-off and source-of-wealth checks.' },
  { label: 'Opaque ownership / UBO', band: 'Elevated', match: ['shell company', 'shell companies', 'nominee director', 'nominee shareholder', 'bearer shares', 'complex ownership', 'layered ownership', 'ultimate beneficial owner', 'beneficial owner', 'ubo'], why: 'Ownership may be layered or hidden (shell / nominee / bearer shares / trust) — identify the ultimate beneficial owner before onboarding.' },
  { label: 'Layering / rapid movement of funds', band: 'Elevated', match: ['mixer', 'tumbler', 'layering', 'structuring', 'smurfing', 'pass-through', 'round-tripping'], why: 'Funds appear to move through mixers, rapid hops or many intermediaries — a classic layering pattern; trace the flow and document source and destination.' },
];

const RISK_BAND_ORDER = { Elevated: 1, High: 2 };
function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function cueHits(match, lower) { return match.some((m) => new RegExp('\\b' + escapeRe(m)).test(lower)); }

/**
 * Scan a brief for NAMED high-risk jurisdictions and structural typology cues, and
 * return a short, plain reason WHY each is higher-risk (the "sovereign nexus"
 * read). Deterministic — a pure text scan over the dated reference tables above.
 * @param {string} lower — the lowercased brief / question text
 * @returns {{band:('High'|'Elevated'|null), jurisdictions:Array<object>, signals:Array<object>}}
 */
function detectCounterpartyRisk(lower) {
  if (!lower || !lower.trim()) return { band: null, jurisdictions: [], signals: [] };
  const jurisdictions = JURISDICTION_RISK.filter((j) => cueHits(j.match, lower)).map((j) => ({ name: j.name, band: j.band, why: j.why }));
  const signals = BRIEF_RISK_CUES.filter((c) => cueHits(c.match, lower)).map((c) => ({ label: c.label, band: c.band, why: c.why }));
  let band = null;
  for (const x of [...jurisdictions, ...signals]) if (!band || RISK_BAND_ORDER[x.band] > RISK_BAND_ORDER[band]) band = x.band;
  return { band, jurisdictions, signals };
}

// ── Company size ─────────────────────────────────────────────────────────────
// The size axis genuinely changes obligations (GDPR Art.30(5) <250 exemption,
// US state thresholds, DORA microenterprise). Accept a band code OR a raw
// { employees, annualRevenueUSD } and derive a representative employee count so
// the `sizeAtLeast` / `sizeBelow` triggers have a number to test.
const SIZE_BY_CODE = Object.fromEntries(SIZE_BANDS.map((b) => [b.code, b]));

/**
 * Normalise a company-size input to a stable { band, employees, annualRevenueUSD }.
 * A raw employee number wins; otherwise the band's lower bound is used as the
 * representative headcount (deliberately conservative — a "small" org is treated
 * as 10 employees, not 49, so size-gated obligations are not under-applied).
 * @param {any} companySize
 */
function normaliseSize(companySize) {
  if (companySize && typeof companySize === 'object') {
    const employees = Number.isFinite(+companySize.employees) ? Math.max(0, Math.floor(+companySize.employees)) : null;
    const revenue = Number.isFinite(+companySize.annualRevenueUSD) ? Math.max(0, +companySize.annualRevenueUSD) : null;
    const band = employees != null
      ? (SIZE_BANDS.find((b) => employees >= b.employeesFrom && (b.employeesTo == null || employees <= b.employeesTo)) || SIZE_BANDS[SIZE_BANDS.length - 1]).code
      : (typeof companySize.band === 'string' && SIZE_BY_CODE[companySize.band] ? companySize.band : 'small');
    return { band, employees: employees != null ? employees : SIZE_BY_CODE[band].employeesFrom, annualRevenueUSD: revenue };
  }
  const code = typeof companySize === 'string' && SIZE_BY_CODE[companySize] ? companySize : 'small';
  return { band: code, employees: SIZE_BY_CODE[code].employeesFrom, annualRevenueUSD: null };
}

// ── Step 1 — resolve the jurisdiction set ────────────────────────────────────
// regions = unique(businessBase ∪ tradesWhere ∪ employsWhere). Selecting a US
// state implies the US federal context; selecting the Geneva canton implies CH.
// Empty selection ⇒ ALL covered codes + showAllGrouped=true (the owner's
// "omitted → show everything, grouped by jurisdiction" fallback).
const ALL_REGION_CODES = uniq(FRAMEWORKS.flatMap((f) => f.appliesInRegions));

/** @param {string[]} codes */
function expandRegions(codes) {
  const out = new Set();
  for (const raw of codes) {
    const code = String(raw || '').trim();
    if (!code) continue;
    if (!JURISDICTION_BY_CODE[code]) continue; // ignore unknown codes rather than crash
    out.add(code);
    const j = JURISDICTION_BY_CODE[code];
    // A US state implies the US federal context; the Geneva canton implies CH.
    if (j.kind === 'us-state') out.add('US');
    if (j.group === 'CH' && code !== 'CH') out.add('CH');
    // ...and the reverse: picking the country pulls in its sub-jurisdictions, so
    // "United States" surfaces the comprehensive state privacy laws and
    // "Switzerland" covers the Geneva canton — the user need not list each one.
    if (code === 'US') for (const c in JURISDICTION_BY_CODE) { if (JURISDICTION_BY_CODE[c].kind === 'us-state') out.add(c); }
    if (code === 'CH') for (const c in JURISDICTION_BY_CODE) { if (JURISDICTION_BY_CODE[c].group === 'CH') out.add(c); }
  }
  return out;
}

/**
 * @param {{businessBase?:string[], tradesInternationally?:boolean, tradesWhere?:string[], employsInternationally?:boolean, employsWhere?:string[]}} profile
 * @returns {{regions:string[], showAllGrouped:boolean}}
 */
function resolveRegions(profile) {
  const picked = uniq([
    ...arr(profile.businessBase),
    ...(profile.tradesInternationally === false ? [] : arr(profile.tradesWhere)),
    ...(profile.employsInternationally === false ? [] : arr(profile.employsWhere)),
  ].map((c) => String(c || '').trim()).filter(Boolean));
  if (!picked.length) {
    return { regions: uniq([...ALL_REGION_CODES, ...JURISDICTION_ORDER]).sort((a, b) => jOrder(a) - jOrder(b)), showAllGrouped: true };
  }
  const expanded = expandRegions(picked);
  return { regions: [...expanded].sort((a, b) => jOrder(a) - jOrder(b)), showAllGrouped: false };
}

// ── Step 2 — route the free text to topics ───────────────────────────────────
// Tokenise with the existing tokenize() (stopwords/casing handled), then test
// each topic's patterns as case-insensitive SUBSTRINGS against the lowercased
// raw query (so multi-word cues like "subject access" and "lost laptop" work).
/**
 * @param {string} queryText
 * @returns {{topics:Array<{id:string,label:string}>, topicIds:string[], frameworkIds:string[], obligationIds:string[], tokens:string[], lower:string}}
 */
// Match one topic CUE against the lowercased query. Multi-word / punctuated cues
// ("lost laptop", "50 percent rule", "14-day") are specific enough to test as raw
// substrings. A single alphabetic token must start on a WORD BOUNDARY so a cue can
// never fire INSIDE an unrelated word — this is what stops "reach" (REACH
// chemicals) matching inside "b<reach>". Very short tokens (<=3 chars) must match
// as a whole word ("ai", "aws"); longer tokens may still match as a prefix/stem so
// "exfiltrat" catches "exfiltration" and "sanction" catches "sanctions".
function matchTopicCue(q, lower) {
  if (/[^a-z]/.test(q)) return lower.includes(q);
  if (q.length <= 3) return new RegExp('\\b' + q + '\\b').test(lower);
  return new RegExp('\\b' + q).test(lower);
}

function routeTopics(queryText) {
  const lower = String(queryText || '').toLowerCase();
  const tokens = tokenize(queryText); // reused from compare.mjs (kept for determinism + future use)
  const matched = [];
  for (const t of TOPICS) {
    if (t.patterns.some((p) => matchTopicCue(String(p).toLowerCase(), lower))) matched.push(t);
  }
  const frameworkIds = uniq(matched.flatMap((t) => t.frameworks));
  const obligationIds = uniq(matched.flatMap((t) => t.obligations));
  return {
    topics: matched.map((t) => ({ id: t.id, label: t.label })),
    topicIds: matched.map((t) => t.id),
    frameworkIds, obligationIds, tokens, lower,
  };
}

// ── Step 3 — evaluate framework applicability against the profile ────────────
// The small, total trigger grammar (documented in the KB header). Returns the
// human-readable "why" for each trigger that passed so the UI can explain it.
/**
 * @param {object} trigger
 * @param {{regionsSet:Set<string>, processesPersonalData:boolean, size:{employees:number}, role:string, sectors:string[], flags:Record<string,boolean>}} ctx
 * @returns {{ok:boolean, why:string|null}}
 */
function evalTrigger(trigger, ctx) {
  switch (trigger.type) {
    case 'always':
      return { ok: true, why: 'Applies wherever the jurisdiction is in scope.' };
    case 'processesPersonalData':
      return { ok: ctx.processesPersonalData, why: ctx.processesPersonalData ? 'You handle personal data.' : null };
    case 'targetsRegion': {
      // Direct match, OR — for a US-state comprehensive-privacy framework whose
      // trigger names the US-OTHER placeholder but whose appliesInRegions lists
      // several states — a match if the profile selected ANY state this framework
      // covers. This honours the KB's declared multi-state coverage without the
      // trigger having to enumerate every state code.
      let ok = ctx.regionsSet.has(trigger.region);
      if (!ok && trigger.region === 'US-OTHER' && ctx.frameworkRegions) {
        ok = ctx.frameworkRegions.some((c) => ctx.regionsSet.has(c) && (JURISDICTION_BY_CODE[c] || {}).kind === 'us-state');
      }
      const j = JURISDICTION_BY_CODE[trigger.region];
      return { ok, why: ok ? `You are based in, trade into, or employ people in ${j ? j.label : trigger.region}.` : null };
    }
    case 'sizeAtLeast': {
      const ok = ctx.size.employees >= trigger.employees;
      return { ok, why: ok ? `Your size (~${ctx.size.employees} employees) meets the ${trigger.employees}+ threshold.` : null };
    }
    case 'sizeBelow': {
      const ok = ctx.size.employees < trigger.employees;
      return { ok, why: ok ? `Your size (~${ctx.size.employees} employees) is below the ${trigger.employees} threshold.` : null };
    }
    case 'role': {
      const ok = ctx.role === trigger.role || (ctx.role === 'joint' && trigger.role === 'controller') || ctx.role === 'unknown';
      return { ok, why: ok ? `Relevant to your role (${trigger.role}).` : null };
    }
    case 'sector': {
      const wanted = arr(trigger.anyOf).map((s) => String(s).toLowerCase());
      const ok = ctx.sectors.some((s) => wanted.includes(s));
      return { ok, why: ok ? `Your sector (${ctx.sectors.filter((s) => wanted.includes(s)).join(', ')}) is in scope.` : null };
    }
    case 'flag': {
      const ok = !!ctx.flags[trigger.name];
      return { ok, why: ok ? `Flagged: ${humaniseFlag(trigger.name)}.` : null };
    }
    default:
      return { ok: false, why: null };
  }
}

function humaniseFlag(name) {
  const map = {
    transfersDataInternationally: 'personal data leaves the region',
    usesProcessors: 'you use third-party processors',
    highRiskProcessing: 'high-risk processing',
    sellsOrSharesData: 'you sell or share personal data',
    sensitiveData: 'special-category / sensitive data',
    largeScaleMonitoring: 'large-scale monitoring',
    processesPersonalData: 'you handle personal data',
  };
  return map[name] || name;
}

/**
 * Evaluate one framework against the profile context under its logic ('any'/'all').
 * @returns {{inScope:boolean, why:string[]}}
 */
function evalFramework(fw, ctx) {
  const logic = fw.logic || 'all';
  const fctx = { ...ctx, frameworkRegions: fw.appliesInRegions };
  const results = (fw.triggers || []).map((t) => evalTrigger(t, fctx));
  const passed = results.filter((r) => r.ok);
  const inScope = logic === 'any' ? passed.length > 0 : results.length > 0 && passed.length === results.length;
  const why = uniq(passed.map((r) => r.why).filter(Boolean));
  return { inScope, why };
}

// ── Step 5 helper — join a framework to a real instrument by title substring ─
/**
 * @param {string} linkTitleMatch
 * @param {Array<{id:string,title:string}>} instruments
 * @returns {{id:string,title:string}|null}
 */
function linkInstrument(linkTitleMatch, instruments) {
  if (!linkTitleMatch) return null;
  const needle = String(linkTitleMatch).toLowerCase();
  // Stable: prefer the shortest matching title (usually the canonical instrument),
  // then lowest id, so the same framework always links to the same instrument.
  const hits = instruments
    .filter((r) => String(r.title || '').toLowerCase().includes(needle))
    .sort((a, b) => (String(a.title).length - String(b.title).length) || String(a.id).localeCompare(String(b.id)));
  return hits.length ? { id: hits[0].id, title: hits[0].title } : null;
}

// ── Step 4 helper — role/size footnotes on an obligation ─────────────────────
function roleNoteFor(obligationId, role) {
  if (obligationId === 'ropa') {
    if (role === 'processor') return 'As a processor you keep a narrower Art.30(2) record (of processing carried out on behalf of controllers).';
    if (role === 'controller' || role === 'joint') return 'As a controller you keep the fuller Art.30(1) record.';
    if (role === 'unknown') return 'Determine whether you are controller or processor first — it changes what this record must contain.';
  }
  if (obligationId === 'dpa-contract') {
    if (role === 'processor') return 'As a processor you must accept Art.28 terms from your controllers AND flow them down to any sub-processors.';
    if (role === 'controller' || role === 'joint') return 'As a controller you must put an Art.28 contract in place with every processor you use.';
  }
  return null;
}

function sizeNoteFor(obligationId, size) {
  if (obligationId === 'ropa' && size.employees < 250) {
    return 'A <250-employee exemption CAN apply — but only if ALL of: processing is occasional, is not likely to risk rights/freedoms, AND excludes special-category/criminal data. The EDPB reads "occasional" narrowly (a website, employee records, CRM, marketing are not occasional), so in practice most businesses still need a RoPA.';
  }
  return null;
}

// ── Step 7 — triage resolver ─────────────────────────────────────────────────
/**
 * Fire every matching TRIAGE_SIGNAL, then pick the highest-order verdict with any
 * fired signal (escalate ▸ defined ▸ simple); ties/doubt break toward the more
 * cautious verdict. If none fire, default to defined-process — never silent.
 * @param {{topicIds:string[], lower:string, obligationIds:string[], flags:Record<string,boolean>, regionCount:number}} ctx
 */
function resolveTriage(ctx) {
  const fired = [];
  for (const sig of TRIAGE_SIGNALS) {
    let hit = false;
    if (sig.patterns && sig.patterns.some((p) => ctx.lower.includes(String(p).toLowerCase()))) hit = true;
    if (!hit && sig.whenTopic && sig.whenTopic.some((t) => ctx.topicIds.includes(t))) hit = true;
    if (!hit && sig.whenObligation && sig.whenObligation.some((o) => ctx.obligationIds.includes(o))) hit = true;
    if (!hit && sig.whenProfile) {
      for (const cond of sig.whenProfile) {
        if (cond.type === 'flag' && ctx.flags[cond.name]) { hit = true; break; }
        if (cond.type === 'multiRegion' && ctx.regionCount >= (cond.min || 3)) { hit = true; break; }
      }
    }
    if (hit) fired.push(sig);
  }

  // Highest-order verdict with any fired signal wins.
  let winner = null;
  for (const v of TRIAGE_VERDICTS) { // TRIAGE_VERDICTS is declared high→low order
    if (fired.some((s) => s.verdict === v.code)) { winner = v; break; }
  }
  if (!winner) {
    return {
      verdict: 'defined-process',
      label: VERDICT_BY_CODE['defined-process'].label,
      colour: VERDICT_BY_CODE['defined-process'].colour,
      meaning: VERDICT_BY_CODE['defined-process'].meaning,
      reasons: ['No specific escalation signal fired. Confirm which framework applies, then follow your standard internal procedure — and escalate to legal if anything unusual surfaces.'],
      firedSignals: [],
    };
  }
  const reasons = fired
    .filter((s) => s.verdict === winner.code)
    .sort((a, b) => (b.weight - a.weight) || String(a.id).localeCompare(String(b.id)))
    .map((s) => s.reason);
  return {
    verdict: winner.code,
    label: winner.label,
    colour: winner.colour,
    meaning: winner.meaning,
    reasons,
    firedSignals: fired.filter((s) => s.verdict === winner.code).map((s) => s.id).sort(),
  };
}

// ── describeProfile — the echoed, normalised inputs ──────────────────────────
/**
 * @param {object} profile
 * @returns {object}
 */
export function describeProfile(profile) {
  const p = profile || {};
  const size = normaliseSize(p.companySize);
  const roleCode = ROLES.some((r) => r.code === p.role) ? p.role : 'unknown';
  const sectors = uniq(arr(p.sector).concat(arr(p.sectors)).map((s) => String(s || '').toLowerCase()).filter(Boolean));
  return {
    mode: ['flag', 'policy', 'freetext'].includes(p.mode) ? p.mode : 'freetext',
    businessBase: uniq(arr(p.businessBase).map(String)),
    tradesInternationally: p.tradesInternationally === true,
    tradesWhere: uniq(arr(p.tradesWhere).map(String)),
    employsInternationally: p.employsInternationally === true,
    employsWhere: uniq(arr(p.employsWhere).map(String)),
    companySize: size,
    role: roleCode,
    roleLabel: (ROLES.find((r) => r.code === roleCode) || ROLES[ROLES.length - 1]).label,
    sectors,
    policyIds: uniq(arr(p.policyIds).map(String)),
  };
}

// ── analyze — the public deterministic entry point (§5 Steps 1–8) ────────────
/**
 * @param {object} profile — see the design doc §4 query object.
 * @param {{ instruments?:Array<object>, policies?:Array<{id:string,title?:string,body:string}> }} [opts]
 *   `instruments` are the real register rows (id/title/summary/obligations/tags…)
 *   the route passes in so the engine can reuse rankRegulations + title-link
 *   without importing regulations.mjs; `policies` are the resolved policy bodies
 *   for the optional gap read. Both default to empty (engine still runs).
 * @returns {object} the §5 output shape (all fields deterministic).
 */
export function analyze(profile, opts = {}) {
  const p = profile || {};
  const norm = describeProfile(p);
  const instruments = Array.isArray(opts.instruments) ? opts.instruments : [];
  const policies = Array.isArray(opts.policies) ? opts.policies : [];

  // The single text field carries the query / policy / free-text question.
  const queryText = typeof p.queryText === 'string' && p.queryText
    ? p.queryText
    : (typeof p.policyText === 'string' ? p.policyText : '');

  // Step 1 — regions.
  const { regions, showAllGrouped } = resolveRegions(p);
  const regionsSet = new Set(regions);

  // Step 2 — topics.
  const routed = routeTopics(queryText);

  // Step 2b — counterparty / jurisdiction ("sovereign nexus") risk read from the
  // brief, then FOLDED BACK into topic routing so the whole analysis (triage,
  // "what applies", runbooks) actually responds to it. A brief that names Iran / a
  // PEP / a shell but not the literal word "sanctions" should still be handled as a
  // sanctions matter — otherwise it would flag High risk yet fall back to a generic
  // regional checklist.
  const counterpartyRisk = detectCounterpartyRisk(routed.lower);
  counterpartyRisk.note = 'Flags jurisdictions / structures NAMED in your text against a dated public snapshot (OFAC / EU / UK sanctions; FATF statements) — not a live list and not an allegation about any real party. Verify against the current lists before acting.';
  if (counterpartyRisk.jurisdictions.length || counterpartyRisk.signals.some((s) => /sanction/i.test(s.label))) {
    if (!routed.topicIds.includes('sanctions')) {
      const t = TOPICS.find((x) => x.id === 'sanctions');
      if (t) {
        routed.topics.push({ id: t.id, label: t.label });
        routed.topicIds.push(t.id);
        routed.frameworkIds = uniq(routed.frameworkIds.concat(t.frameworks));
        routed.obligationIds = uniq(routed.obligationIds.concat(t.obligations));
      }
    }
  }

  // Structural flags used by triggers + triage. A transfer flag is set if the
  // profile spans >1 country-group OR the query routes to the transfer topic;
  // sensitive/AI/high-risk flags come from the routed topics; processesPersonalData
  // is assumed true unless the profile is purely a voluntary-standard sector query.
  const groups = uniq(regions.map((c) => (JURISDICTION_BY_CODE[c] ? JURISDICTION_BY_CODE[c].group : c)));
  const explicitTransfer = p.tradesInternationally === true || p.employsInternationally === true;
  const flags = {
    processesPersonalData: p.processesPersonalData === false ? false : true,
    transfersDataInternationally: explicitTransfer || groups.length > 1 || routed.topicIds.includes('transfer'),
    usesProcessors: routed.topicIds.includes('vendor'),
    highRiskProcessing: routed.topicIds.includes('dpia-topic') || routed.topicIds.includes('ai') || routed.topicIds.includes('cctv'),
    sellsOrSharesData: routed.topicIds.includes('marketing'),
    sensitiveData: routed.topicIds.includes('sensitive'),
    largeScaleMonitoring: routed.topicIds.includes('cctv'),
  };
  if (p.flags && typeof p.flags === 'object') for (const [k, v] of Object.entries(p.flags)) flags[k] = !!v;

  const ctx = {
    regionsSet,
    processesPersonalData: flags.processesPersonalData,
    size: norm.companySize,
    role: norm.role,
    sectors: norm.sectors,
    flags,
  };

  // Step 3 — framework applicability. A framework is considered if its
  // appliesInRegions intersects the resolved regions; it is IN SCOPE if its
  // triggers pass under its logic. Track region-applicable-but-out-of-scope and
  // topic-mentioned-but-out-of-region separately (never silently dropped).
  const inScope = [];        // {fw, why}
  const consideredIds = new Set();
  for (const fw of FRAMEWORKS) {
    const regionMatch = fw.appliesInRegions.some((r) => regionsSet.has(r));
    if (!regionMatch) continue;
    consideredIds.add(fw.id);
    const { inScope: ok, why } = evalFramework(fw, ctx);
    if (ok) inScope.push({ fw, why });
  }
  const inScopeIds = new Set(inScope.map((x) => x.fw.id));
  // Frameworks the free text implicated but which are NOT applicable in the
  // selected regions — surfaced as a "mentioned but out of your regions" note.
  const mentionedOutOfRegion = uniq(routed.frameworkIds)
    .filter((id) => FRAMEWORK_BY_ID[id] && !inScopeIds.has(id))
    .map((id) => {
      const fw = FRAMEWORK_BY_ID[id];
      const regionMatch = fw.appliesInRegions.some((r) => regionsSet.has(r));
      return { id, name: fw.name, reason: regionMatch ? 'mentioned, but its applicability triggers were not met by your profile' : 'mentioned, but not applicable in your selected jurisdictions' };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // ── Query focus — narrow "what applies" + next-steps to what the QUESTION is
  // actually about ────────────────────────────────────────────────────────────
  // When the free text implicated specific topics we present only the frameworks
  // and obligations those topics point to (still filtered to, and grouped by, the
  // resolved jurisdictions). Without this, one breach question would surface every
  // employment, tax and IP obligation in the region and bury the real answer. When
  // the query implicated nothing (a bare profile, or "show everything"), the full
  // regional view is kept.
  const routedObligationSet = new Set(routed.obligationIds);
  const queryHasFocus = routed.frameworkIds.length > 0 || routedObligationSet.size > 0;
  const focusFrameworkIds = queryHasFocus
    ? new Set([
        ...routed.frameworkIds,
        // ...plus any in-scope framework that DRIVES one of the implicated obligations
        ...inScope.filter((x) => x.fw.obligations.some((o) => routedObligationSet.has(o))).map((x) => x.fw.id),
      ])
    : null;
  const focusFrameworks = focusFrameworkIds ? inScope.filter((x) => focusFrameworkIds.has(x.fw.id)) : inScope;
  // Only apply the focus if at least one focused framework is actually in scope for
  // the selected jurisdictions; otherwise fall back to the regional view so the
  // reader never gets an empty result (mentionedOutOfRegion still explains why).
  const focusApplied = !!(focusFrameworkIds && focusFrameworks.length);
  const presentedInScope = focusApplied ? focusFrameworks : inScope;
  const obligationFilter = focusApplied ? routedObligationSet : null;

  // Step 4 — assemble obligations, grouped by jurisdiction.
  // For each in-scope framework, expand its obligation ids, annotate with the
  // frameworks that drive them + role/size notes, and bucket by the framework's
  // appliesInRegions (intersected with the resolved regions).
  /** @type {Map<string, {frameworks:Map<string,object>, obligations:Map<string,object>}>} */
  const buckets = new Map();
  const ensureBucket = (code) => { if (!buckets.has(code)) buckets.set(code, { frameworks: new Map(), obligations: new Map() }); return buckets.get(code); };

  for (const { fw, why } of presentedInScope) {
    const link = linkInstrument(fw.linkTitleMatch, instruments);
    const fwOut = {
      id: fw.id, name: fw.name, kind: fw.kind, authorityType: fw.authorityType,
      mandatory: !!fw.mandatory, why, summary: fw.summary, source: fw.source || null,
      linkedInstrumentId: link ? link.id : null, linkedInstrumentTitle: link ? link.title : null,
    };
    const codes = fw.appliesInRegions.filter((c) => regionsSet.has(c));
    for (const code of codes) {
      const b = ensureBucket(code);
      if (!b.frameworks.has(fw.id)) b.frameworks.set(fw.id, fwOut);
      for (const oid of fw.obligations) {
        if (obligationFilter && !obligationFilter.has(oid)) continue;
        const ob = OBLIGATION_BY_ID[oid];
        if (!ob) continue;
        const existing = b.obligations.get(oid);
        if (existing) { if (!existing.drivenBy.includes(fw.id)) existing.drivenBy.push(fw.id); continue; }
        b.obligations.set(oid, {
          id: ob.id, name: ob.name, what: ob.what, whenTriggered: ob.whenTriggered, artefact: !!ob.artefact,
          drivenBy: [fw.id],
          roleNote: roleNoteFor(oid, norm.role),
          sizeNote: sizeNoteFor(oid, norm.companySize),
        });
      }
    }
  }

  const byJurisdiction = [...buckets.keys()]
    .sort((a, b) => jOrder(a) - jOrder(b))
    .map((code) => {
      const b = buckets.get(code);
      const j = JURISDICTION_BY_CODE[code] || { code, label: code, note: '' };
      const frameworks = [...b.frameworks.values()].sort((x, y) => (Number(y.mandatory) - Number(x.mandatory)) || x.name.localeCompare(y.name));
      const obligations = [...b.obligations.values()].sort((x, y) => (oOrder(x.id) - oOrder(y.id)) || x.id.localeCompare(y.id));
      for (const ob of obligations) ob.drivenBy = ob.drivenBy.slice().sort((m, n) => m.localeCompare(n));
      return { jurisdiction: { code: j.code, label: j.label, note: j.note || null, kind: j.kind }, frameworks, obligations };
    });

  // Step 5 — reuse the real register: rank the closest instruments to the query.
  const suggestedRealInstruments = queryText && queryText.trim()
    ? rankRegulations(queryText, instruments, { limit: 6, minScore: 1 })
    : [];

  // Step 6 — optional gap read against internal policies (reuses compareTexts).
  let policyGap;
  if (policies.length && inScope.length) {
    policyGap = [];
    for (const pol of policies) {
      if (!pol || !pol.body) continue;
      // Build a regText from the in-scope frameworks' summaries + their obligations'
      // plain-language "what" — the same shape compareTexts already reasons over.
      const oblIds = uniq(inScope.flatMap((x) => x.fw.obligations));
      const regText = [
        ...inScope.map((x) => x.fw.summary),
        ...oblIds.map((id) => (OBLIGATION_BY_ID[id] ? OBLIGATION_BY_ID[id].what : '')),
      ].join(' ');
      const result = compareTexts(regText, pol.body, { instrumentTitle: 'Applicable frameworks (composite)', policyTitle: pol.title || pol.id });
      policyGap.push({ policyId: pol.id, policyTitle: pol.title || pol.id, ...result });
    }
  }

  // Step 7 — triage verdict. IMPORTANT: triage's whenObligation matching uses the
  // obligations the QUERY actually implicated (routed.obligationIds), NOT the full
  // standing obligation set of every applicable framework — otherwise a routine
  // vendor question would fire sig-breach merely because GDPR lists breach
  // notification among its obligations. Topics + flags carry the situational signal.
  const triage = resolveTriage({
    topicIds: routed.topicIds,
    lower: routed.lower,
    obligationIds: routed.obligationIds,
    flags,
    regionCount: groups.filter((g) => g !== 'INTL').length,
  });

  // Step 8 — next steps / checklist + matched clear-cut process runbooks. Prefer
  // the runbooks the QUERY actually implicated (routed topics/obligations) so a
  // specific situation gets a focused runbook (a breach query → the breach
  // runbook, not all five). Only when the query implicated nothing (e.g. a bare
  // profile or the omitted-location "show everything" mode) fall back to the full
  // in-scope obligation set so the reader still gets relevant runbooks.
  const routedTopicIds = routed.topicIds;
  const routedObligationIds = new Set(routed.obligationIds);
  const inScopeObligationIds = new Set(byJurisdiction.flatMap((g) => g.obligations.map((o) => o.id)));
  const queryImplicated = routedTopicIds.length > 0 || routedObligationIds.size > 0;
  const matchProc = (proc, topicIds, obligationIds) => proc.forTopics.some((t) => topicIds.includes(t)) || proc.forObligations.some((o) => obligationIds.has(o));
  let chosenProcs = queryImplicated
    ? CLEAR_CUT_PROCESSES.filter((proc) => matchProc(proc, routedTopicIds, routedObligationIds))
    : [];
  if (!chosenProcs.length) chosenProcs = CLEAR_CUT_PROCESSES.filter((proc) => matchProc(proc, routedTopicIds, inScopeObligationIds));
  const processes = chosenProcs.map((proc) => ({ id: proc.id, title: proc.title, steps: proc.steps.slice(), illustrative: !!proc.illustrative }));

  // A query with real text that matched NO compiled topic (and isn't the explicit
  // "show everything" mode) is an UNMATCHED query — be honest about it and keep the
  // checklist slim rather than dumping every regional sector step.
  const unmatchedQuery = !!(queryText && queryText.trim() && !queryHasFocus && !showAllGrouped);
  const nextSteps = buildNextSteps(triage, byJurisdiction, norm, flags, unmatchedQuery);

  return {
    kbVersion: KB_VERSION,
    profile: norm,
    query: { mode: norm.mode, length: queryText.length },
    regionsResolved: regions.map((code) => { const j = JURISDICTION_BY_CODE[code]; return { code, label: j ? j.label : code }; }),
    showAllGrouped,
    matchedTopics: routed.topics,
    mentionedOutOfRegion,
    byJurisdiction,
    suggestedRealInstruments,
    ...(policyGap ? { policyGap } : {}),
    triage,
    counterpartyRisk,
    nextSteps,
    processes,
    disclaimer: DISCLAIMER,
  };
}

/**
 * A prioritised, deterministic, actionable checklist derived from the top
 * obligations in scope, led by the triage verdict (escalate verdicts lead with
 * "raise with legal"). Each step is { text, rating, why }: the visual-importance
 * rating is DERIVED from KB semantics — never cosmetic — and is honest (null
 * when nothing can be derived, and the UI then shows no chip):
 *   'high' — led by an escalate verdict, or an operative duty under a MANDATORY
 *            framework in scope (statutory conduct rules / notification clocks);
 *   'med'  — a statutory documentation artefact (register, notice, contract,
 *            assessment) or a scoping clarification that changes which duties bite;
 *   'low'  — driven only by voluntary / good-practice frameworks in scope;
 *   null   — generic pointers and the standing disclaimer.
 * Steps are de-duplicated by text, then stable-sorted high → med → low → unrated
 * (original order preserved within each tier) for a stable, scannable list.
 */
function buildNextSteps(triage, byJurisdiction, norm, flags, unmatched) {
  // Obligation semantics the ratings derive from: is the obligation a
  // documentation artefact, and does ANY in-scope framework driving it carry
  // the KB's mandatory flag (statute / binding regulation vs voluntary standard)?
  const oblMeta = new Map();
  for (const g of byJurisdiction) {
    for (const o of g.obligations) {
      const m = oblMeta.get(o.id) || { artefact: !!o.artefact, mandatory: false };
      if (o.drivenBy.some((fid) => FRAMEWORK_BY_ID[fid] && FRAMEWORK_BY_ID[fid].mandatory)) m.mandatory = true;
      oblMeta.set(o.id, m);
    }
  }
  const rate = (id) => {
    const m = oblMeta.get(id);
    if (!m) return { rating: null, why: null };
    if (m.mandatory && !m.artefact) return { rating: 'high', why: 'Operative duty under a mandatory framework in scope — statutory conduct rules or notification clocks can bite immediately.' };
    if (m.mandatory) return { rating: 'med', why: 'Statutory documentation artefact — required under a mandatory framework in scope, but usually not a same-day clock.' };
    return { rating: 'low', why: 'Recommended control — driven only by voluntary / good-practice frameworks in your scope.' };
  };
  const steps = [];
  if (triage.verdict === 'escalate-legal') {
    steps.push({ text: 'Raise this with your legal / privacy team now — treat any notification clock as already running.', rating: 'high', why: 'Led by the escalate-to-legal triage verdict — treat any statutory clock as already running.' });
  }
  if (norm.role === 'unknown') {
    steps.push({ text: 'Confirm whether you are the controller or the processor for this data — it changes which obligations bite.', rating: 'med', why: 'Scoping clarification — the controller / processor answer changes which statutory duties apply.' });
  }
  if (unmatched) {
    steps.push({ text: 'We couldn’t match your text to a specific compiled topic — pick a topic area or rephrase the question. The frameworks below are everything compiled for your selected jurisdiction(s); the pointers here are a privacy baseline.', rating: 'med', why: 'No specific compiled topic was recognised in your text.' });
  }
  const oblIds = new Set(byJurisdiction.flatMap((g) => g.obligations.map((o) => o.id)));
  const add = (id, text) => { if (oblIds.has(id)) steps.push({ text, ...rate(id) }); };
  // Sector-specific runbook steps (employment, company, consumer, IP, competition,
  // tax, environmental, product liability, bribery, sanctions, export controls) —
  // only when the query implicated a topic (focused) or in explicit "show
  // everything" mode; skipped for an UNMATCHED free-text query so it can never lead
  // with, say, maternity advice in answer to a sanctions question.
  if (!unmatched) {
  add('nondiscrimination-pay', 'Do not withhold or dock pay/bonus because of pregnancy or maternity — award the employee what a comparable colleague received; any pro-rating must be lawful, applied equally to all comparable absences, and must not cover the protected maternity period.');
  add('maternity-protection', 'Confirm the statutory maternity entitlements (leave, pay, the protected non-working period, and dismissal protection) are being honoured.');
  add('equal-treatment-return', 'Review why she was excluded from the team bonus; if it was connected to her maternity leave, correct it, document the reasoning, and respond to the complaint with qualified advice.');
  // ── Employment / labour next-steps (real cited law) ──────────────────────────
  add('fair-dismissal-process', 'Before dismissing, confirm you have a lawful reason and follow a fair procedure — check the applicable rules (UK unfair-dismissal + ACAS Code; CH abusive/immediate-termination rules under CO Art. 335-337; US at-will exceptions for discrimination/retaliation/public policy). Watch for automatically-unfair reasons (discrimination, whistleblowing, pregnancy) that apply regardless of service. Document the reason and the process, and take advice before acting.');
  add('notice-and-final-pay', 'Calculate the correct notice and settle final pay (CH: CO Art. 335 minima — 7 days in probation, then 1/2/3 months by seniority; UK: statutory minimum notice + accrued holiday and any redundancy pay). Confirm benefits, references and return of property.');
  add('collective-redundancy-consult', 'If several roles are at risk for economic/reorganisation reasons, check the collective-redundancy thresholds and duties BEFORE issuing notices (EU 98/59/EC; UK 20+ with 30/45-day consultation; US WARN 60-day notice; CH mass-dismissal procedure) — inform/consult representatives and notify the authority in time.');
  add('worker-classification', 'Assess status from the reality of the relationship, not the contract label (CH subordination/AHV test; UK employment status + IR35, use CEST; EU Platform Work presumption; US FLSA economic-reality/IRS tests). If they work under your direction and control, treat them as an employee and take advice — misclassification means back-tax, unpaid benefits and penalties.');
  add('working-time-limits', 'Check hours against the applicable limit and pay/compensate overtime correctly (EU/UK 48-hour average, UK opt-out in writing; CH ArG 45/50-hour maxima with Überzeit caps; US FLSA 1.5x over 40h/week). Keep working-time records and correct any unpaid overtime.');
  add('rest-and-holiday', 'Confirm statutory rest and paid holiday are given (EU 4 weeks + daily/weekly rest; UK 5.6 weeks + 20-min break; CH 4 weeks, 5 under age 20). US: paid leave/breaks are generally contractual, not FLSA-mandated. Do not pay holiday in lieu except on termination.');
  add('minimum-wage', 'Verify pay meets the wage floor for the work location (UK NMW/NLW by age band; US FLSA USD 7.25 or higher state/city rate; CH: no federal minimum but check cantonal minima and any binding GAV/CCT). Underpayment risks enforcement and penalties.');
  add('equal-pay-transparency', 'Check equal-pay and pay-transparency duties (EU Pay Transparency Directive: pre-interview pay ranges, no pay-history questions, pay-gap reporting; UK equal pay + 250+ gender-pay-gap reporting; US Equal Pay Act + state salary-range rules; CH equal-pay analysis at 100+). Address any unexplained gap.');
  add('nondiscrimination-general', 'Treat this as potential discrimination on a protected ground: do not discriminate, harass or victimise, and make reasonable adjustments/accommodations (UK Equality Act nine characteristics; EU 2000/78 & 2000/43; US Title VII/ADA/ADEA). Note CH offers only limited private-sector protection beyond sex. These claims often have no qualifying period and short deadlines — take advice.');
  add('workplace-health-safety', 'Assess the risk and make the workplace safe, then record it and inform/train staff (EU Framework Directive 89/391; UK HSWA 1974 + risk assessment, written policy at 5+; US OSH Act General Duty Clause; CH ArG Art. 6 + UVG/SUVA). Escalate any accident, injury or serious hazard — reporting duties may apply.');
  add('transfer-of-undertaking', 'On a business/service transfer, staff usually move automatically on their existing terms — plan the people side early (UK TUPE 2006; EU Acquired Rights Directive 2001/23; CH CO Art. 333 with joint liability). Inform and consult representatives, and remember transfer-connected dismissals are often automatically unfair. Take advice.');
  add('whistleblowing-protection', 'Handle any report of wrongdoing or alleged reprisal carefully and do not retaliate (UK PIDA day-one protection; EU Directive 2019/1937 reporting channels at 50+; US SOX/Dodd-Frank/OSHA 11(c)). CH protection is weak/non-statutory. Preserve confidentiality, follow the speak-up process, and take advice on any detriment/dismissal claim.');
  // ── Contract-law next-steps (real cited law) ─────────────────────────────────
  add('contract-formation', 'Confirm the contract is validly formed and enforceable before relying on it — matching offer/acceptance (CH CO Art. 1; UK mirror-image rule / US UCC 2-207 for goods), any consideration and required form (CH Art. 11; some deals need writing/notarisation). US goods sales are UCC Article 2; most other US contract law is state common law. Check signing authority and keep the executed version.');
  add('consumer-cancellation', 'Check whether a statutory consumer cancellation/cooling-off right applies and honour it: EU CRD 2011/83 and UK Consumer Contracts Regs 2013 give 14 days for distance/off-premises sales (refund within 14 days, extended by 12 months if you failed to inform); the US FTC Cooling-Off Rule gives only 3 business days for certain door-to-door sales (NOT most online orders); the CH revocation right is narrow (doorstep/phone over CHF 100). Give a clear cancellation notice and refund on time.');
  add('unfair-terms', 'Test the term before relying on it: EU 93/13/EEC (good-faith imbalance — unfair consumer terms are not binding); UK Consumer Rights Act 2015 Part 2 (fairness + transparency) and UCTA 1977 (reasonableness for business exclusions) — you can NEVER exclude liability for death/personal injury from negligence; US unconscionability, and penalty clauses are unenforceable. Draft exclusions narrowly and flag onerous terms.');
  add('misrepresentation-remedy', "Don't overstate facts to close a deal, and if you were misled preserve evidence and act quickly (rescission can be lost by delay/affirmation). UK: Misrepresentation Act 1967 — rescission and/or damages, with the maker liable unless it proves reasonable grounds to believe it was true (s.2(1)). CH: avoid the contract for fraud (Art. 28) or fundamental error (Art. 23–24). EU: UCPD 2005/29 bans misleading B2C practices. US: state fraud/UDAP law.");
  add('breach-remedies', 'On a breach, identify your rights before acting — wrongful termination is itself a breach. CH: CO Art. 97–109 (fault-based damages; set a Nachfrist grace period, then damages/rescind/perform). UK/US: distinguish a repudiatory/material breach from a minor one, check the contract\'s termination/notice clauses, mitigate loss (penalty clauses are unenforceable), and use the statutory sale-of-goods remedies (UK CRA 2015 / US UCC). Serve any required notice correctly and take advice before ending a significant contract.');
  add('late-payment-interest', 'On overdue B2B invoices you can usually claim statutory interest and recovery costs without waiving the debt: EU Late Payment Directive 2011/7 (ECB rate + 8pp, EUR 40 minimum plus costs); UK 1998 Act (8% + Bank of England base rate plus fixed compensation); CH default interest 5% (CO Art. 104); US mostly contract/state law. Set clear payment terms and follow the credit-control process.');
  // ── Companies-law next-steps (real cited law) ────────────────────────────────
  add('incorporation-register', 'Form the entity correctly and keep its register entries current: CH notarised incorporation + commercial-register entry (CO Art. 620 SA/AG, Art. 772 GmbH); UK Companies House incorporation and change filings; US state filing (e.g. Delaware certificate + registered agent); EU Directive 2017/1132 disclosure. Choose the form/jurisdiction deliberately — stale register data is itself an offence in several places.');
  add('directors-duties', "Meet directors' duties of care and loyalty and manage conflicts: UK Companies Act 2006 s.171–177 (incl. the s.172 success duty and s.175 conflicts); CH CO Art. 717/717a (due care, good faith, disclose conflicts without delay); US Delaware fiduciary duties (care under the business-judgment rule; loyalty; DGCL 144 for interested transactions). Keep board minutes, take advice on major/related-party decisions and don't rubber-stamp.");
  add('statutory-filings-accounts', 'File the accounts, returns and confirmations on time — most penalties are for LATENESS: UK annual accounts + confirmation statement (audit by size); EU Accounting Directive 2013/34; CH CO Art. 957 ff. (ordinary/limited audit or opting-out by size); US state annual report/franchise tax (e.g. Delaware by 1 March) plus SEC periodic reports for registrants. Track each deadline and apply the right size/audit thresholds.');
  add('ubo-register', 'Identify and register who ultimately owns/controls the company (~25% threshold): UK PSC register (Companies Act Part 21A, filed with the confirmation statement, criminal-backed); EU central UBO registers under the AML framework; CH register of beneficial owners. US Corporate Transparency Act BOI reporting to FinCEN — the March 2025 interim final rule EXEMPTS US-formed entities, leaving only foreign reporting companies, and the position is IN FLUX, so verify it. Keep the register current on any ownership change.');
  add('shareholder-rights', "Observe shareholders' rights and meeting formalities: UK Companies Act (notice, resolutions, minority protection); CH revised CO (general-meeting powers, information/inspection rights, virtual meetings); US Delaware (notice, voting, appraisal, books-and-records inspection under DGCL 220). Give proper notice, keep minutes and the share register accurate, and don't override minority or class rights.");
  add('insolvency-duties', "If the company is or may be insolvent, the board's duties shift to creditors — act early and take insolvency advice: UK Insolvency Act 1986 s.214 wrongful trading (personal liability unless you took every step to minimise creditor loss) / s.213 fraudulent trading; CH revised CO Art. 725–725b (monitor solvency, address capital loss, and on over-indebtedness prepare audited interim statements and notify the court unless curable within 90 days); US 'zone of insolvency' and Chapter 7/11. Minimise creditor losses, document decisions, and stop incurring credit you cannot repay.");
  // ── Employment sub-gap next-steps (round 1 follow-ups) ───────────────────────
  add('written-particulars', 'Give the required written statement of terms on time and update it when terms change: UK ERA 1996 s.1 (day-one right, mostly one document); EU Directive 2019/1152 (key items within 7 days, the rest within one month); CH CO Art. 330b (within one month). Many US states require a wage-rate notice at hire.');
  add('restrictive-covenant', 'Keep any non-compete/non-solicitation narrow and take advice before enforcing: CH CO Art. 340–340c (writing, insight into clients/secrets, reasonable in place/time/scope, generally max 3 years, lapses if the employer terminates without cause); UK (void as restraint of trade unless protecting a legitimate interest and no wider than necessary); US highly state-dependent (California voids most; the FTC ban is contested — verify).');
  add('right-to-work-check', 'Verify the right to work BEFORE the first day and keep dated evidence: UK prescribed check for a statutory excuse against the illegal-working civil penalty (raised in 2024 — verify the current maximum); US Form I-9 (employee section day one, employer section within 3 business days) and E-Verify where required; CH/EU work-permit checks for non-EU/EFTA nationals. Check everyone consistently to avoid discrimination.');
  add('family-leave', "Apply the correct family-leave entitlement and protect the employee from detriment: EU Work-Life Balance Directive 2019/1158 (10 days' paternity, 4 months' parental per parent, 5 days' carers'); UK (paternity, shared parental, unpaid parental, carer's leave); CH (2 weeks' paternity plus care leave, narrower than EU/UK); US FMLA (12 weeks UNPAID for covered employers — no federal paid leave). Confirm eligibility and the notice/evidence rules.");
  // ── Consumer / e-commerce / product-safety next-steps (real cited law) ───────
  add('product-safety-compliance', 'Treat a possibly-unsafe product as time-critical: contain the risk, preserve records and take corrective action, and notify authorities where required (EU GPSR (EU) 2023/988 — corrective action, inform consumers, notify via the Safety Gate; UK GPSR 2005 — authorities can order a recall; CH Product Safety Act PrSG; US CPSC — report a substantial product hazard, generally within 24 hours). Note the EU GPSR does NOT apply in GB but DOES bind sales into the EU/NI. Product-liability exposure runs alongside — take advice fast.');
  add('unfair-commercial-practices', 'Keep advertising and selling truthful, substantiated and non-aggressive: avoid misleading claims/omissions, fake discounts, fake reviews, undisclosed ads and greenwashing (EU UCPD 2005/29 + Omnibus 2019/2161; UK unfair-practices regime now in the DMCCA 2024, CMA-enforced with fines up to 10% of global turnover — verify; CH Unfair Competition Act UWG; US FTC Act §5 + state UDAP). Follow the marketing-compliance checklist and escalate a regulator contact or high-risk (health/environmental) claim.');
  add('online-platform-duties', "Identify your role and apply the matching DSA tier if you offer services in the EU (EU DSA (EU) 2022/2065 — contact point + transparent terms for all intermediaries; notice-and-action for hosting; complaint-handling, trusted flaggers, trader traceability and ad transparency for platforms/marketplaces; systemic-risk duties for very large platforms). The UK equivalent for illegal/harmful content is the Online Safety Act 2023 (Ofcom). Stand up notice-and-action and terms transparency, and escalate very-large-platform designation or a regulator/court order.");
  // ── Intellectual-property next-steps (real cited law) ────────────────────────
  add('trademark-protection', 'Clear your brand before use and enforce your marks: run a clearance search, register in your key markets (EU EUTM 2017/1001 via EUIPO; UK Trade Marks Act 1994 + passing off; US Lanham Act via USPTO; CH MSchG via IPI), watch for conflicting filings, and act promptly on infringement or counterfeits (customs seizure is often available). Preserve evidence and take specialist IP advice before sending threats — an unjustified threat can itself be actionable in some regimes.');
  add('copyright-compliance', "Do not use others' works without a licence or an exception, and manage rights in what you create: EU 2001/29 (InfoSoc) + DSM 2019/790 (text-and-data-mining, Art. 17 platform licensing); UK CDPA 1988 (automatic protection, fair dealing); US 17 U.S.C. (registration to sue, four-factor fair use, DMCA §512 takedown); CH URG. Licence in third-party text/images/music/code/fonts, keep evidence of your rights, and operate a takedown/permissions process. Take advice on scraping/AI-training on third-party data.");
  add('patent-protection', "File BEFORE any public disclosure — Europe has NO grace period (EPC/EPO and the Unitary Patent + UPC; UK Patents Act 1977; CH PatG; US 35 U.S.C. gives a one-year grace period for the inventor's own disclosure only). Consider a freedom-to-operate search before launching a technical product so you do not infringe a third-party patent, and take specialist patent advice — the process is expensive and strictly deadline-driven.");
  add('trade-secret-protection', "Act fast on a suspected trade-secret theft: preserve devices, access logs and evidence, identify what was taken and by whom, and check any NDA and post-termination covenants (EU Trade Secrets Directive 2016/943; UK Trade Secrets Regs 2018 + breach of confidence; US Defend Trade Secrets Act 18 U.S.C. §1836 + state UTSA; CH UWG Art. 6 + Criminal Code Art. 162). A prompt injunction can stop use/spread, but delay weakens the claim — take advice immediately and avoid tipping off the individual before evidence is secured.");
  add('ip-ownership-assignment', "Get IP ownership right in writing: an employee's work generally vests in the employer, but a CONTRACTOR/freelancer/agency usually KEEPS ownership without an express, signed assignment (UK/EU; US 'work made for hire' is narrow; CH CO Art. 332 for employee inventions). Use an express IP assignment for commissioned work, distinguish background from foreground IP, address moral rights (often waivable, not assignable) and open-source/third-party components, and escalate any dispute over who owns work product.");
  // ── Competition / antitrust next-steps (real cited law) ──────────────────────
  add('competition-compliance', 'STOP and take competition-law advice before any coordination with competitors — the risk is severe and personal (EU Arts 101/102 TFEU under Reg 1/2003 and UK Competition Act 1998: fines up to 10% of worldwide turnover; US Sherman Act: hardcore cartels are CRIMINAL with prison for individuals; CH Cartel Act Arts 5 & 7). Never agree prices, share markets/customers, rig bids or exchange commercially sensitive information with competitors, even informally. If a cartel may exist, consider leniency. Take advice before information exchange, JVs or distribution/resale-price terms.');
  add('merger-notification', "Check merger-control notification in EVERY affected country BEFORE closing, and do not integrate too early ('gun-jumping' is an offence): EU Merger Reg 139/2004 (worldwide EUR 5,000m + EU-wide EUR 250m for two parties, suspensory); US Hart-Scott-Rodino (filing + waiting period above the size-of-transaction threshold — verify the current figure); UK Enterprise Act 2002 (voluntary but call-in; target UK turnover > GBP 70m or 25% share — verify); CH Cartel Act Arts 9-10 (CHF 2bn worldwide / CHF 500m CH). Thresholds and tests differ and change — assess early and take advice.");
  // ── Tax / VAT next-steps (compliance trigger — NOT tax advice) ───────────────
  add('vat-registration', "Check your VAT/sales-tax registration and cross-border triggers — this is a compliance trigger, NOT tax advice, so confirm with a tax adviser. EU: for B2C cross-border e-commerce, VAT is due in the customer's Member State once intra-EU distance sales exceed EUR 10,000/year (Art. 59c) — use OSS, and IOSS for imports up to EUR 150. UK: register once taxable turnover exceeds GBP 90,000 (verify). US: no federal VAT — states impose sales tax with 'economic nexus' after Wayfair (commonly USD 100,000 or 200 transactions, but VARIES by state). CH: register once worldwide turnover reaches CHF 100,000 (foreign digital B2C: from the first franc). Monitor turnover by market and register on time.");
  // ── Environmental / product-market next-steps (real cited law) ─────────────
  add('product-market-conformity', 'Get product conformity marking right BEFORE placing goods on a market: identify every applicable product directive, run the conformity assessment (a notified body for higher-risk products), draw up the EU/UK declaration of conformity and technical file, and affix the correct mark. EU: CE marking under the New Legislative Framework (Reg (EC) 765/2008). GB: the UK now accepts CE marking INDEFINITELY for most product categories (Product Safety and Metrology etc. (Amendment) Regulations 2024), with UKCA still available and required for a few areas — verify which your product needs; Northern Ireland follows EU rules. Keep the technical documentation and appoint an authorised representative/importer where required.');
  add('chemicals-reach', "Check chemicals duties before placing substances on a market ('no data, no market'). EU REACH (Reg (EC) 1907/2006, via ECHA): register substances at/above 1 tonne/year, supply safety data sheets, and respect SVHC/authorisation and Annex XVII restrictions (notify SVHCs above 0.1% in articles). UK REACH (from 2021, HSE) is a SEPARATE GB system that may need its own registrations and is diverging — verify the current deadlines. US: no REACH — TSCA (EPA) needs a pre-manufacture notice for new chemicals plus significant-new-use/section 6 rules (e.g. PFAS). Identify your substances, tonnage and role, register/notify in each market, and pass SDS/SVHC information down the chain.");
  add('eee-rohs-weee', "For electrical/electronic equipment, meet BOTH regimes: RoHS (EU Dir 2011/65; GB RoHS Regs 2012) restricts ten hazardous substances (generally 0.1% by weight, 0.01% cadmium) as part of CE/UKCA conformity; and WEEE (EU Dir 2012/19; GB WEEE Regs 2013) makes producers finance e-waste collection/recycling, register (usually via a compliance scheme), mark the crossed-out wheelie-bin symbol and report volumes, with distributor take-back. Determine your role (producer/importer/distributor), restrict the substances, register, label and report.");
  add('packaging-epr', "If you place packaging or packaged goods on a market, check packaging-waste and EPR duties (register, report data, pay fees). EU: the PPWR (Reg (EU) 2025/40) is in force from 11 Feb 2025 and generally applies from 12 Aug 2026 (replacing Dir 94/62/EC), adding recyclability/recycled-content/labelling and EPR-financing rules that phase in to 2030+ — verify each date. UK: packaging EPR (Producer Responsibility Obligations (Packaging and Packaging Waste) Regs 2024) makes large producers (turnover >= GBP 2m AND >50t packaging/year) register, report and pay disposal-cost fees (base fees 2025-26, invoices from Oct 2025, modulated fees from 2026-27 — verify). US: no federal law — several states (Maine, Oregon, Colorado, California and more) have packaging EPR with differing definitions/timelines. Work out whether you are the obligated producer, then register and report.");
  add('sustainability-reporting', "Confirm whether you are in scope for sustainability/ESG reporting BEFORE assuming — the rules are mid-change. EU CSRD (Dir (EU) 2022/2464): ESRS reporting with assurance, but the 'Stop-the-Clock' Directive (EU) 2025/794 delayed timelines by two years and the 2025-26 'Omnibus' (Council-adopted 24 Feb 2026) narrows mandatory scope to companies with more than 1,000 employees (plus a turnover/balance-sheet condition) — verify your in-force scope and first-reporting year. CH: CO Art. 964a-964c require large public-interest companies (500+ employees and CHF 20m balance sheet or CHF 40m turnover) to publish an annual non-financial report (plus the Climate Disclosures Ordinance, TCFD-based). US: no single federal ESG law (SEC climate rules contested; some states e.g. California SB 253/261). Confirm scope and standard, then follow the reporting process.");
  // ── Product-liability next-step (defective-product damages) ───────────────
  add('product-liability', "Treat a defective-product injury/damage claim as urgent and high-stakes — liability is usually STRICT (no need to prove fault) and separate from product-safety duties. EU: the revised Product Liability Directive (EU) 2024/2853 (replacing 85/374/EEC; transpose by 9 Dec 2026, applying to products placed on the market after that date) covers software/AI, eases the claimant's burden and widens who is liable. UK: Consumer Protection Act 1987 Part I — strict liability, 3-year limitation, 10-year long-stop. CH: Product Liability Act (PrHG, SR 221.112.944) — fault-independent, CHF 900 property-damage franchise. US: STATE strict-liability tort (Restatement (Third): Products Liability — manufacturing/design/failure-to-warn defects) plus negligence/warranty, varying by state. Preserve design/testing/traceability records and product samples, notify your insurer, do NOT admit liability, and take specialist advice immediately.");
  add('anti-bribery-corruption', "Treat any bribe, kickback or facilitation payment as a serious CRIMINAL matter: do NOT pay or accept it, preserve records and take specialist advice (UK Bribery Act 2010 s.1/2/6 and the s.7 corporate 'failure to prevent' offence - the only defence is 'adequate procedures'; facilitation payments are illegal in the UK with NO exception; US FCPA anti-bribery + books-and-records/internal-controls via DOJ/SEC, only a NARROW facilitation exception, plus FEPA; CH StGB Art. 322ter ff. for officials and UWG Art. 4a for private bribery; OECD Convention/UNCAC/EU 2026/1021). To build controls: adopt proportionate anti-bribery procedures with top-level commitment, a gifts-and-hospitality policy and register, risk-based third-party/intermediary due diligence, training and a whistleblowing channel, and keep accurate books and records.");
  add('sanctions-screening', "Do NOT proceed on a possible sanctions hit until you have checked it and taken specialist advice - breaches can be strict-liability and criminal. Screen the party, its owners and the country against the relevant lists (US OFAC SDN, EU/UK consolidated lists, CH/SECO), apply OFAC's 50 PERCENT ownership rule and any control test, and if there is a match do not deal, freeze relevant funds/economic resources, and REPORT to the competent authority (US OFAC; UK OFSI - as soon as practicable, non-reporting is an offence; CH SECO; EU national authority). Apply for any licence before proceeding and keep an audit trail. Note US secondary sanctions can reach non-US persons.");
  add('export-controls', "Before exporting, re-exporting or transferring goods, software or technology - or sharing controlled technical data with a foreign national (a possible 'deemed export') - classify the item and check whether a licence is needed (US EAR by ECCN via BIS, and ITAR defence articles on the US Munitions List via DDTC with registration; EU Dual-Use Regulation (EU) 2021/821 Annex I plus a WMD/military catch-all; UK Export Control Order 2008 via the ECJU; CH Goods Control Act via SECO). Screen the destination and end-user, obtain the correct licence, and keep records; unlicensed export of controlled items is a criminal offence - escalate any potential military/dual-use item or restricted-party hit.");
  }
  add('lawful-basis', 'Confirm and document your lawful basis for the processing (and an Art.9 condition if special-category data is involved).');
  add('privacy-notice', 'Make sure your privacy notice / notice-at-collection covers this processing.');
  add('ropa', 'Record the processing in your RoPA (data map) — most businesses need one even below 250 employees.');
  add('dpia', 'Screen whether a DPIA / data-protection assessment is required for this (high-risk) processing.');
  add('dpa-contract', 'Put an Art.28 / data-processing agreement in place with any processor or vendor handling the data.');
  if (flags.transfersDataInternationally) add('transfer-safeguard', 'Choose a transfer mechanism (adequacy / DPF / SCCs / UK IDTA) and complete a transfer impact/risk assessment for data leaving the region.');
  add('breach-notification', 'Check the breach-notification path and deadlines, and keep an internal breach register.');
  add('consent-mgmt', 'Review consent / cookies / opt-out handling for marketing and non-essential tracking.');
  add('security-measures', 'Verify your technical & organisational security measures are appropriate to the risk.');
  add('retention-schedule', 'Apply your retention / deletion schedule to the data involved.');
  if (!steps.length) steps.push({ text: 'Confirm which of the frameworks above applies to your situation, then follow your standard internal procedure.', rating: null, why: null });
  steps.push({ text: 'This is a triage aid, not legal advice — verify against the cited sources and take qualified advice before acting.', rating: null, why: null });
  // De-duplicate by text (first occurrence keeps its tier), then sort by rating
  // with the original index as the explicit tie-breaker so the order is stable
  // and deterministic; unrated steps keep the tail.
  const seen = new Set();
  const deduped = steps.filter((s) => (seen.has(s.text) ? false : (seen.add(s.text), true)));
  const RANK = { high: 0, med: 1, low: 2 };
  return deduped
    .map((s, i) => [s, i])
    .sort((a, b) => (((a[0].rating != null && RANK[a[0].rating] != null) ? RANK[a[0].rating] : 3) - ((b[0].rating != null && RANK[b[0].rating] != null) ? RANK[b[0].rating] : 3)) || (a[1] - b[1]))
    .map(([s]) => s);
}
