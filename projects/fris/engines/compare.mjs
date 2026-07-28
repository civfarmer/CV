// @ts-check
/**
 * Deterministic First-Pass Compliance Review (Regulatory Horizon).
 *
 * A transparent, rule-based comparison engine. It segments a regulatory
 * instrument into obligations, segments an internal policy into controls,
 * matches them via weighted phrase overlap, and raises explainable findings.
 *
 * THIS IS NOT AN AI LEGAL OPINION AND IS NOT LEGAL ADVICE. It is a
 * deterministic first-pass triage aid; every finding quotes the exact compared
 * fragments so a human analyst can adjudicate.
 */

export const STOPWORDS = new Set(
  ('a an the of to and or for in on at by with as is are be been being this that these those shall will must may not no any all such other its their our your his her they it we i you he she from into within under over per each which who whom whose than then so if when where while because about above below between during before after out off up down again further once here there than'.split(
    ' '
  ))
);

export const OBLIGATION_CUES = ['must', 'shall', 'required', 'require', 'requires', 'mandatory', 'ensure', 'maintain', 'retain', 'report', 'notify', 'submit', 'establish', 'implement', 'prohibit', 'prohibited', 'obligation', 'obliged', 'may not', 'must not'];
export const MATCH_THRESHOLD = 0.16; // below => treated as unmatched (missing control)
export const FULL_COVERAGE = 0.45; // at/above => obligation considered well covered

/** Tokenise into meaningful lowercase words. @param {string} text */
export function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9%\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && w.length > 1 && !STOPWORDS.has(w));
}

/** Split text into ordered segments (sentences / bullet lines). @param {string} text */
export function segment(text) {
  const parts = String(text || '')
    .replace(/\r/g, '')
    .split(/(?<=[.;:])\s+(?=[A-Z0-9])|\n+|(?:^|\s)[-*•]\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8);
  return parts.map((t, i) => ({ index: i, text: t, tokens: tokenize(t) }));
}

/** @param {string} regText */
export function extractObligations(regText) {
  return segment(regText)
    .filter((s) => OBLIGATION_CUES.some((c) => new RegExp(`\\b${c.replace(' ', '\\s+')}\\b`, 'i').test(s.text)))
    .map((s, i) => ({ id: `OBL-${i + 1}`, text: s.text, tokens: s.tokens }));
}

/** @param {string} policyText */
export function extractControls(policyText) {
  return segment(policyText).map((s, i) => ({ id: `CTL-${i + 1}`, text: s.text, tokens: s.tokens }));
}

/** Weighted token overlap (Jaccard blended with containment). */
function overlapScore(aTokens, bTokens) {
  if (!aTokens.length || !bTokens.length) return 0;
  const a = new Set(aTokens);
  const b = new Set(bTokens);
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = new Set([...a, ...b]).size;
  const jaccard = inter / union;
  const containment = inter / a.size; // how much of the obligation is covered
  return 0.5 * jaccard + 0.5 * containment;
}

/**
 * Find the best-matching control for an obligation.
 * @param {{tokens:string[],text:string}} obligation
 * @param {Array<{id:string,text:string,tokens:string[]}>} controls
 */
export function matchObligation(obligation, controls) {
  let best = null;
  let bestScore = 0;
  for (const c of controls) {
    const s = overlapScore(obligation.tokens, c.tokens);
    if (s > bestScore) { bestScore = s; best = c; }
  }
  return { control: best, score: round2(bestScore) };
}

/**
 * Build a single searchable corpus string for a regulation from its most
 * discriminating fields. Obligations and title are weighted more heavily by
 * simple repetition (title x3, tags/sector x2) because they carry the strongest
 * topical signal about what the instrument actually governs.
 * @param {{title?:string,summary?:string,obligations?:string[],obligations_json?:string,tags?:string[],tags_json?:string,sector?:string,authority?:string}} reg
 */
export function regulationCorpus(reg) {
  if (!reg) return '';
  const obl = Array.isArray(reg.obligations)
    ? reg.obligations
    : (() => { try { return JSON.parse(reg.obligations_json || '[]'); } catch { return []; } })();
  const tags = Array.isArray(reg.tags)
    ? reg.tags
    : (() => { try { return JSON.parse(reg.tags_json || '[]'); } catch { return []; } })();
  const title = reg.title || '';
  const sector = reg.sector || '';
  const parts = [
    title, title, title, // title carries the strongest signal
    reg.summary || '',
    ...obl,
    ...tags, ...tags, // tags are curated topical labels
    sector, sector,
    reg.authority || '',
  ];
  return parts.join(' ');
}

/** Build a term-frequency map from a token list. @param {string[]} tokens */
function termFreq(tokens) {
  const tf = new Map();
  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
  return tf;
}

/**
 * Cosine similarity between two term-frequency maps, in [0, 1].
 * Deterministic; order-independent; robust to differing document lengths.
 * @param {Map<string,number>} a @param {Map<string,number>} b
 */
function cosineTF(a, b) {
  if (!a.size || !b.size) return 0;
  let dot = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const [term, w] of small) { const o = large.get(term); if (o) dot += w * o; }
  if (dot === 0) return 0;
  let magA = 0, magB = 0;
  for (const w of a.values()) magA += w * w;
  for (const w of b.values()) magB += w * w;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/**
 * Rank a set of regulations by textual similarity to a pasted policy.
 *
 * Deterministic, dependency-free relevance scorer: it tokenises both the policy
 * and each regulation's corpus (title+summary+obligations+tags+sector+authority)
 * to lowercase words with stopwords removed, then scores each regulation by the
 * cosine similarity of their term-frequency vectors, normalised to 0-100. Used
 * to suggest which regulations a policy most likely relates to before the user
 * has chosen one. No AI, no network - the same input always yields the same rank.
 *
 * @param {string} policyText
 * @param {Array<object>} regulations rows carrying id/title/summary/obligations(_json)/tags(_json)/sector
 * @param {{limit?:number, minScore?:number}} [opts]
 * @returns {Array<{id:string,title:string,authority?:string,sector?:string,score:number,overlap:string[]}>}
 */
export function rankRegulations(policyText, regulations, opts = {}) {
  const limit = opts.limit == null ? 8 : Math.max(1, opts.limit);
  const minScore = opts.minScore == null ? 1 : opts.minScore;
  const policyTokens = tokenize(policyText);
  const policyTF = termFreq(policyTokens);
  const policySet = new Set(policyTokens);
  const list = Array.isArray(regulations) ? regulations : [];
  const scored = list.map((reg) => {
    const corpus = regulationCorpus(reg);
    const tokens = tokenize(corpus);
    const tf = termFreq(tokens);
    const sim = cosineTF(policyTF, tf);
    const score = Math.round(sim * 1000) / 10; // 0.0-100.0, one decimal
    // The most informative shared terms, for a human-readable "why" hint.
    const overlap = [...tf.keys()]
      .filter((t) => policySet.has(t) && t.length > 2)
      .sort((x, y) => (tf.get(y) + (policyTF.get(y) || 0)) - (tf.get(x) + (policyTF.get(x) || 0)))
      .slice(0, 6);
    return {
      id: reg.id,
      title: reg.title || reg.id,
      authority: reg.authority || null,
      sector: reg.sector || null,
      score,
      overlap,
    };
  });
  // Stable ordering: by score desc, then title asc, then id asc for determinism.
  scored.sort((a, b) => (b.score - a.score) || String(a.title).localeCompare(String(b.title)) || String(a.id).localeCompare(String(b.id)));
  return scored.filter((r) => r.score >= minScore).slice(0, limit);
}

const has = (text, re) => re.test(text.toLowerCase());

/**
 * Compare a regulatory instrument text against an internal policy text.
 * @param {string} regText
 * @param {string} policyText
 * @param {{effectiveDate?:string, instrumentTitle?:string, policyTitle?:string}} [opts]
 */
export function compareTexts(regText, policyText, opts = {}) {
  const obligations = extractObligations(regText);
  const controls = extractControls(policyText);
  /** @type {any[]} */
  const findings = [];
  let coverageSum = 0;
  let matched = 0;
  let fid = 0;
  const mkId = () => `FND-${String(++fid).padStart(3, '0')}`;

  for (const obl of obligations) {
    const { control, score } = matchObligation(obl, controls);
    const coverage = Math.min(1, score / FULL_COVERAGE);
    coverageSum += coverage;
    const oblLower = obl.text.toLowerCase();
    const ctlText = control ? control.text : '';
    const ctlLower = ctlText.toLowerCase();

    if (score < MATCH_THRESHOLD || !control) {
      findings.push(mkFinding(mkId(), 'missing_control', 'High', clampConf((1 - score) * 100, 60, 96), obl.text, control ? ctlText : null, `No policy control substantively addresses this obligation (overlap ${score}).`, 'Draft and assign a control that satisfies this obligation.'));
      continue;
    }
    matched++;

    // Contradiction: negation mismatch on the same topic
    const oblNeg = has(oblLower, /\b(must not|shall not|may not|prohibit|prohibited)\b/);
    const ctlPermit = has(ctlLower, /\b(may|allow|allowed|permitted|permit|optional)\b/);
    if (oblNeg && ctlPermit) {
      findings.push(mkFinding(mkId(), 'contradiction', 'High', 82, obl.text, ctlText, 'Obligation is prohibitive but the matched control uses permissive language - potential direct contradiction.', 'Reconcile the control with the prohibition; remove permissive wording.'));
    }
    // Weak mandatory language
    if (has(oblLower, /\b(must|shall|required|mandatory)\b/) && !has(ctlLower, /\b(must|shall|required|mandatory|will)\b/) && has(ctlLower, /\b(should|may|encourage|endeavour|where possible)\b/)) {
      findings.push(mkFinding(mkId(), 'weak_language', 'Medium', 66, obl.text, ctlText, 'Obligation is mandatory but the control uses discretionary language ("should/may").', 'Strengthen the control to mandatory ("must"/"shall").'));
    }
    // Missing reporting
    if (has(oblLower, /\b(report|notify|submit|disclose)\b/) && !has(ctlLower, /\b(report|notify|submit|disclose|notification)\b/)) {
      findings.push(mkFinding(mkId(), 'missing_reporting', 'Medium', 70, obl.text, ctlText, 'Obligation requires reporting/notification not reflected in the control.', 'Add a reporting/notification step with recipient and timing.'));
    }
    // Missing recordkeeping
    if (has(oblLower, /\b(record|retain|retention|log|register|archive)\b/) && !has(ctlLower, /\b(record|retain|retention|log|register|archive)\b/)) {
      findings.push(mkFinding(mkId(), 'missing_recordkeeping', 'Medium', 68, obl.text, ctlText, 'Obligation implies recordkeeping/retention absent from the control.', 'Specify records to keep and a retention period.'));
    }
    // Missing escalation
    if (has(oblLower, /\b(breach|incident|escalat|violation)\b/) && !has(ctlLower, /\b(escalat|report to|notify the)\b/)) {
      findings.push(mkFinding(mkId(), 'missing_escalation', 'Medium', 64, obl.text, ctlText, 'Obligation concerns incidents/breaches but the control lacks an escalation path.', 'Define an escalation and notification path.'));
    }
    // Missing review frequency
    if (has(oblLower, /\b(review|periodic|annual|update)\b/) && !has(ctlLower, /\b(annual|annually|quarterly|monthly|periodic|every)\b/)) {
      findings.push(mkFinding(mkId(), 'missing_review_frequency', 'Low', 58, obl.text, ctlText, 'Obligation implies periodic review but the control states no frequency.', 'State an explicit review frequency.'));
    }
    // Missing deadline
    if (has(oblLower, /\b(within|no later than|deadline|by \d)\b/) && !has(ctlLower, /\b(within|no later than|days|hours|deadline)\b/)) {
      findings.push(mkFinding(mkId(), 'missing_deadline', 'Medium', 67, obl.text, ctlText, 'Obligation sets a time limit not reflected in the control.', 'Add the required timeframe to the control.'));
    }
    // Missing responsible owner
    if (!has(ctlLower, /\b(responsible|owner|officer|function|team|department|manager|committee)\b/)) {
      findings.push(mkFinding(mkId(), 'missing_owner', 'Low', 55, obl.text, ctlText, 'Matched control does not name a responsible owner.', 'Assign an accountable owner/function.'));
    }
    // Ambiguous language
    if (has(ctlLower, /\b(as appropriate|reasonable|etc|from time to time|as needed|may vary)\b/)) {
      findings.push(mkFinding(mkId(), 'ambiguous', 'Low', 52, obl.text, ctlText, 'Control uses ambiguous/discretionary phrasing.', 'Replace vague terms with specific, testable requirements.'));
    }
    // Outdated date
    const oldDate = detectOldDate(ctlText, opts.effectiveDate);
    if (oldDate) {
      findings.push(mkFinding(mkId(), 'outdated_date', 'Medium', 72, obl.text, ctlText, `Control references ${oldDate}, predating the instrument's effective date (${opts.effectiveDate}).`, 'Update the control to reflect the current effective date.'));
    }
    // Incomplete coverage (matched but weak)
    if (score >= MATCH_THRESHOLD && score < FULL_COVERAGE) {
      findings.push(mkFinding(mkId(), 'incomplete', 'Medium', clampConf((FULL_COVERAGE - score) * 200, 40, 80), obl.text, ctlText, `Control only partially covers the obligation (overlap ${score}).`, 'Extend the control to fully address the obligation.'));
    }
  }

  const overallScore = obligations.length ? Math.round((coverageSum / obligations.length) * 100) : 100;
  const hasHigh = findings.some((f) => f.severity === 'High');
  const verdict = deriveVerdict(overallScore, hasHigh, findings);
  return {
    instrumentTitle: opts.instrumentTitle || null,
    policyTitle: opts.policyTitle || null,
    obligationCount: obligations.length,
    controlCount: controls.length,
    matchedCount: matched,
    overallScore,
    verdict,
    findings,
    obligations: obligations.map((o) => ({ id: o.id, text: o.text })),
  };
}

function deriveVerdict(score, hasHigh, findings) {
  const missing = findings.filter((f) => f.finding_type === 'missing_control').length;
  const contradiction = findings.some((f) => f.finding_type === 'contradiction');
  if (contradiction || (missing >= 2 && score < 55)) return 'Non-Compliant';
  if (score >= 80 && !hasHigh) return 'Compliant';
  return 'Review Required';
}

function detectOldDate(text, effectiveDate) {
  if (!effectiveDate) return null;
  const eff = new Date(effectiveDate).getFullYear();
  if (Number.isNaN(eff)) return null;
  const m = text.match(/\b(19|20)\d{2}\b/);
  if (m && Number(m[0]) < eff) return m[0];
  return null;
}

function mkFinding(id, type, severity, confidence, reg, policy, explanation, recommendation) {
  return {
    id,
    finding_type: type,
    severity,
    confidence: Math.round(confidence),
    reg_fragment: reg,
    policy_fragment: policy,
    explanation,
    recommendation,
    analyst_status: 'Requires Review',
    analyst_note: '',
  };
}

function clampConf(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }
function round2(x) { return Math.round(x * 100) / 100; }
