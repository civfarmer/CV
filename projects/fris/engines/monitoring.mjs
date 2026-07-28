// @ts-check
/**
 * Transaction Monitoring & SAR — deterministic typology-rule alerting engine.
 *
 * Runs a set of named AML/CFT **typology rules** over the seeded crypto
 * transactions + wallets (and, where useful, entity activity) and emits an
 * **alert queue**: each alert carries a stable id, a rule id, a severity, a
 * 0–100 score, a plain-language reason, and the implicated subjects/transactions.
 * A companion **SAR builder** turns an alert (or a group) into a structured
 * suspicious-activity-report narrative (who / what / when / where / why-suspicious
 * / amounts / typology) — deterministically, straight from the data.
 *
 * ── Determinism ──────────────────────────────────────────────────────────────
 * Same input → same output, byte-for-byte. Pure arithmetic + set logic, stable
 * sorts everywhere (severity desc, then score desc, then alert-id asc), no
 * Date.now(), no randomness, no network, no dependencies. Aggregation dedupes by
 * a deterministic alert id derived from (ruleId + primary subject).
 *
 * ── Honesty ──────────────────────────────────────────────────────────────────
 * The transactions, wallets and entities are SYNTHETIC demonstration data (see
 * seed.mjs). This engine demonstrates monitoring/typology mechanics and the SAR
 * drafting workflow; the SAR narratives it produces are labelled synthetic and
 * are NOT filed regulatory reports. This is NOT a monitoring system of record.
 *
 * ── Reuse ────────────────────────────────────────────────────────────────────
 * Where a signal already exists in the suite we reuse it rather than re-deriving:
 * the Chain-Link detectors (fan-in / fan-out / velocity / dormant activation /
 * service proximity) from cryptoDetect.mjs, the SERVICE_NODE_TYPES benign-hub set
 * (so exchanges/deposit rails never false-fire as suspicious hubs), and the
 * Screening overlay's `sanctionedIds` (mixers + a watchlisted exchange) as the
 * high-risk-counterparty anchor.
 */

import {
  SERVICE_NODE_TYPES, THRESHOLDS as CD_THRESHOLDS,
  detectFanIn, detectFanOut, detectVelocityAnomalies, detectDormantActivation,
} from './cryptoDetect.mjs';

// ── Tunable rule thresholds ──────────────────────────────────────────────────
// Kept explicit and importable so tests + the UI can reason about them and they
// can never silently drift. Amounts are in MINOR units (the seed stores crypto
// amounts as major × 1e8), matching crypto_transactions.amount_minor.
export const MINOR = 100000000; // 1 major unit = 1e8 minor (matches the seed)

export const RULES_META = [
  {
    id: 'structuring', label: 'Structuring / smurfing', severity: 'High',
    typology: 'Structuring (a.k.a. smurfing)',
    blurb: 'Multiple transfers deliberately kept just below a reporting threshold, from a single originator over a short span — a hallmark of structuring to avoid a currency-transaction / large-value report.',
  },
  {
    id: 'rapid_movement', label: 'Rapid in-out (velocity)', severity: 'High',
    typology: 'Rapid movement of funds (velocity / pass-through)',
    blurb: 'A wallet receives and then rapidly re-sends value, or fires many outgoing transactions inside a short window — pass-through / layering behaviour with no economic hold.',
  },
  {
    id: 'high_risk_counterparty', label: 'High-risk counterparty', severity: 'High',
    typology: 'Exposure to a high-risk counterparty (mixer / sanctioned / bridge)',
    blurb: 'Value moves directly to or from a mixing service, a sanctioned / watchlisted address, or (lower weight) a cross-chain bridge — obfuscation infrastructure that breaks provenance.',
  },
  {
    id: 'round_tripping', label: 'Round-tripping', severity: 'Medium',
    typology: 'Round-tripping / circular flow',
    blurb: 'Funds leave a wallet and return to it through one or more intermediaries — a closed loop that manufactures apparent activity or obscures the true source.',
  },
  {
    id: 'dormant_then_active', label: 'Dormant-then-active', severity: 'High',
    typology: 'Dormant account re-activation',
    blurb: 'A long-dormant wallet suddenly transacts — a classic indicator of account takeover, a mule waking up, or staged laundering.',
  },
  {
    id: 'fan_in', label: 'Fan-in (funnel)', severity: 'Medium',
    typology: 'Fan-in / funnel account',
    blurb: 'Many distinct sources funnel value into a single non-service wallet — a collection / funnel account aggregating placement.',
  },
  {
    id: 'fan_out', label: 'Fan-out (dispersal)', severity: 'Medium',
    typology: 'Fan-out / dispersal',
    blurb: 'A single non-service wallet disperses value to many distinct destinations — layering by scattering the trail across fresh addresses.',
  },
  {
    id: 'layering_peel', label: 'Layering (peel chain)', severity: 'High',
    typology: 'Layering via a peel chain',
    blurb: 'A long sequence of hops each peels a small cash-out and forwards the remainder — a textbook long-layering topology designed to exhaust a tracing effort.',
  },
  {
    id: 'jurisdiction_hopping', label: 'Jurisdiction-hopping', severity: 'Medium',
    typology: 'Jurisdiction-hopping ownership',
    blurb: 'An entity\'s control structure threads through several jurisdictions (including secrecy / offshore havens) — complexity that frustrates beneficial-ownership transparency.',
  },
];

export const RULE_META_BY_ID = Object.fromEntries(RULES_META.map((r) => [r.id, r]));
export const RULE_IDS = RULES_META.map((r) => r.id);

export const SEVERITY_RANK = { High: 0, Medium: 1, Low: 2 };
export const STATUSES = ['open', 'escalated', 'closed', 'false-positive'];

export const MONITORING_DISCLAIMER = 'Transaction Monitoring & SAR is a deterministic demonstration of typology-rule alerting and suspicious-activity-report drafting over SYNTHETIC transaction, wallet and entity data. Every alert and every generated SAR narrative is illustrative and is NOT a filed regulatory report or a factual allegation against any real person, company or wallet. This is NOT a monitoring or reporting system of record; do not rely on it for a real suspicious-activity determination.';

// ── Small deterministic helpers ──────────────────────────────────────────────
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const sevRank = (s) => (SEVERITY_RANK[s] ?? 3);
const uniq = (arr) => [...new Set(arr)];
/** Milliseconds for a transaction timestamp, or null. @param {any} ts */
function tsMs(ts) { const m = Date.parse(ts); return Number.isNaN(m) ? null : m; }

/**
 * @typedef {{id:string, from_id:string, to_id:string, amount_minor:number, ts:string, hop?:number|null, pattern?:string, trace_id?:string|null, risk_score?:number}} Tx
 * @typedef {{id:string, node_type:string, is_dormant?:number|boolean, label?:string, address?:string, cluster_id?:string|null, risk_category?:string, first_seen?:string, last_seen?:string}} Wallet
 * @typedef {{ruleId:string, severity:'High'|'Medium'|'Low', score:number, primarySubject:{type:string,id:string,label?:string}, reason:string, subjects:Array<{type:string,id:string,label?:string,role?:string}>, txIds:string[], metrics:Record<string,any>}} RawAlert
 */

/** Resolve a wallet label for display, falling back to its id. */
function walletLabel(w) { return (w && (w.label || w.id)) || ''; }

// ── Individual typology rules ────────────────────────────────────────────────
// Each rule is a pure function (data) -> RawAlert[]. Every alert names a primary
// subject (what the queue row is "about"), a human reason, the implicated
// transaction ids, the implicated subjects, and a stable metrics bag the SAR
// builder reads. Scores are bounded 0–100.

/**
 * STRUCTURING / SMURFING — a single originator emitting several transfers that
 * are each just below a reporting threshold, clustered in time. We look per
 * source wallet for a run of ≥ minCount outgoing txs whose amounts sit in the
 * band (floor, threshold) — i.e. deliberately under the line — inside a rolling
 * window. Service nodes are excluded (an exchange paying out sub-threshold is
 * routine). Deterministic.
 * @param {readonly Tx[]} txs @param {readonly Wallet[]} wallets
 * @param {{thresholdMinor?:number, floorFraction?:number, minCount?:number, windowSec?:number}} [opts]
 */
export function detectStructuring(txs, wallets, opts = {}) {
  const thresholdMinor = opts.thresholdMinor ?? 10 * MINOR; // "reporting threshold" (synthetic): 10 units
  const floorFraction = opts.floorFraction ?? 0.7;           // count only amounts in [0.7×, 1×) of the threshold
  const minCount = opts.minCount ?? 3;
  const windowSec = opts.windowSec ?? 24 * 3600;             // within a rolling day
  const floorMinor = Math.floor(thresholdMinor * floorFraction);
  const typeById = new Map(wallets.map((w) => [w.id, String(w.node_type || 'wallet')]));
  const labelById = new Map(wallets.map((w) => [w.id, walletLabel(w)]));
  /** @type {Map<string, Tx[]>} */
  const bySource = new Map();
  for (const t of txs) {
    const amt = Number(t.amount_minor);
    if (!(amt >= floorMinor && amt < thresholdMinor)) continue; // only "just under" movements
    if (SERVICE_NODE_TYPES.has(typeById.get(t.from_id) || 'wallet')) continue;
    if (!bySource.has(t.from_id)) bySource.set(t.from_id, []);
    bySource.get(t.from_id).push(t);
  }
  const alerts = [];
  for (const [src, list] of bySource) {
    if (list.length < minCount) continue;
    // Find the densest window: sort by time and slide.
    const withMs = list.map((t) => ({ t, ms: tsMs(t.ts) })).filter((x) => x.ms != null).sort((a, b) => a.ms - b.ms);
    let bestRun = [];
    let start = 0;
    for (let end = 0; end < withMs.length; end++) {
      while (withMs[end].ms - withMs[start].ms > windowSec * 1000) start++;
      const run = withMs.slice(start, end + 1);
      if (run.length > bestRun.length) bestRun = run;
    }
    if (bestRun.length < minCount) continue;
    const runTxs = bestRun.map((x) => x.t);
    const total = runTxs.reduce((s, t) => s + Number(t.amount_minor), 0);
    const near = Math.round((1 - (total / runTxs.length) / thresholdMinor) * 100); // how close to the line, %
    const score = clamp(52 + (runTxs.length - minCount) * 8 + Math.max(0, 20 - near), 0, 100);
    const dests = uniq(runTxs.map((t) => t.to_id));
    alerts.push({
      ruleId: 'structuring', severity: 'High', score,
      primarySubject: { type: 'wallet', id: src, label: labelById.get(src) },
      reason: `Structuring: ${runTxs.length} transfers from ${labelById.get(src) || src} each just under the ${thresholdMinor / MINOR}-unit reporting threshold (largest ${(Math.max(...runTxs.map((t) => Number(t.amount_minor))) / MINOR)} units), clustered within ${Math.round(windowSec / 3600)}h to a small set of ${dests.length} destination(s).`,
      subjects: [
        { type: 'wallet', id: src, label: labelById.get(src), role: 'originator' },
        ...dests.map((d) => ({ type: 'wallet', id: d, label: labelById.get(d), role: 'destination' })),
      ],
      txIds: runTxs.map((t) => t.id).sort(),
      metrics: { count: runTxs.length, thresholdMinor, floorMinor, totalMinor: total, destinations: dests.length, windowSec, meanMinor: Math.round(total / runTxs.length) },
    });
  }
  return alerts;
}

/**
 * RAPID IN-OUT (VELOCITY) — a wallet firing many outgoing transactions inside a
 * short window (pass-through / no economic hold). Reuses the Chain-Link velocity
 * detector for the burst detection, then enriches each into a monitoring alert
 * with the implicated txs (the burst) and destinations. Deterministic.
 * @param {readonly Tx[]} txs @param {readonly Wallet[]} wallets
 */
export function detectRapidMovement(txs, wallets, opts = {}) {
  const windowSec = opts.windowSec ?? CD_THRESHOLDS.velocityWindowSec;
  const minCount = opts.minCount ?? CD_THRESHOLDS.velocityCount;
  const labelById = new Map(wallets.map((w) => [w.id, walletLabel(w)]));
  const base = detectVelocityAnomalies(txs, windowSec, minCount); // [{walletId,count,severity,...}]
  const alerts = [];
  for (const a of base) {
    // Reconstruct the burst window for this wallet to attach the implicated txs.
    const out = txs.filter((t) => t.from_id === a.walletId).map((t) => ({ t, ms: tsMs(t.ts) })).filter((x) => x.ms != null).sort((x, y) => x.ms - y.ms);
    let bestRun = [];
    let start = 0;
    for (let end = 0; end < out.length; end++) {
      while (out[end].ms - out[start].ms > windowSec * 1000) start++;
      const run = out.slice(start, end + 1);
      if (run.length > bestRun.length) bestRun = run;
    }
    const runTxs = bestRun.map((x) => x.t);
    const total = runTxs.reduce((s, t) => s + Number(t.amount_minor), 0);
    const dests = uniq(runTxs.map((t) => t.to_id));
    const score = clamp(50 + (a.count - minCount) * 9, 0, 100);
    alerts.push({
      ruleId: 'rapid_movement', severity: a.count >= minCount * 2 ? 'High' : 'High', score,
      primarySubject: { type: 'wallet', id: a.walletId, label: labelById.get(a.walletId) },
      reason: `Velocity: ${labelById.get(a.walletId) || a.walletId} emitted ${a.count} outgoing transfers within ${windowSec}s (threshold ${minCount}) to ${dests.length} destination(s) — rapid pass-through with no economic hold.`,
      subjects: [
        { type: 'wallet', id: a.walletId, label: labelById.get(a.walletId), role: 'originator' },
        ...dests.map((d) => ({ type: 'wallet', id: d, label: labelById.get(d), role: 'destination' })),
      ],
      txIds: runTxs.map((t) => t.id).sort(),
      metrics: { burst: a.count, windowSec, totalMinor: total, destinations: dests.length },
    });
  }
  return alerts;
}

/**
 * HIGH-RISK COUNTERPARTY — value adjacent to a mixer, a sanctioned/watchlisted
 * node, or a bridge. We group per NON-service subject wallet (the party under
 * scrutiny) the transactions that touch a high-risk counterparty, so the queue
 * has one alert per implicated wallet rather than one per edge. Mixer &
 * sanctioned exposure is High; bridge-only exposure is Medium. Benign service
 * nodes themselves are never the primary subject. Deterministic.
 * @param {readonly Tx[]} txs @param {readonly Wallet[]} wallets
 * @param {{sanctionedIds?:Iterable<string>}} [opts]
 */
export function detectHighRiskCounterparty(txs, wallets, opts = {}) {
  const typeById = new Map(wallets.map((w) => [w.id, String(w.node_type || 'wallet')]));
  const labelById = new Map(wallets.map((w) => [w.id, walletLabel(w)]));
  const sanctioned = new Set(opts.sanctionedIds || []);
  const isHighRisk = (id) => typeById.get(id) === 'mixer' || sanctioned.has(id);
  const isBridge = (id) => typeById.get(id) === 'bridge';
  /** @type {Map<string, {txs:Tx[], counterparties:Set<string>, kinds:Set<string>, worst:'mixer'|'sanctioned'|'bridge'}>} */
  const bySubject = new Map();
  const consider = (subjectId, cpId, tx, kind) => {
    const st = typeById.get(subjectId) || 'wallet';
    if (SERVICE_NODE_TYPES.has(st) || st === 'mixer' || st === 'bridge') return; // subject is infrastructure — not the party under scrutiny
    if (!bySubject.has(subjectId)) bySubject.set(subjectId, { txs: [], counterparties: new Set(), kinds: new Set(), worst: 'bridge' });
    const e = bySubject.get(subjectId);
    e.txs.push(tx); e.counterparties.add(cpId); e.kinds.add(kind);
    if (kind === 'mixer' || kind === 'sanctioned') e.worst = e.worst === 'bridge' ? kind : e.worst;
    if (kind === 'mixer') e.worst = 'mixer';
  };
  for (const t of txs) {
    const f = t.from_id, to = t.to_id;
    // Classify the counterparty relative to each endpoint.
    if (isHighRisk(to)) consider(f, to, t, typeById.get(to) === 'mixer' ? 'mixer' : 'sanctioned');
    if (isHighRisk(f)) consider(to, f, t, typeById.get(f) === 'mixer' ? 'mixer' : 'sanctioned');
    if (isBridge(to) && !isHighRisk(to)) consider(f, to, t, 'bridge');
    if (isBridge(f) && !isHighRisk(f)) consider(to, f, t, 'bridge');
  }
  const alerts = [];
  for (const [subject, e] of bySubject) {
    const worst = e.worst;
    const severity = worst === 'bridge' ? 'Medium' : 'High';
    const cpLabels = uniq([...e.counterparties].map((c) => labelById.get(c) || c));
    const kindWord = worst === 'mixer' ? 'a mixing service' : worst === 'sanctioned' ? 'a sanctioned / watchlisted address' : 'a cross-chain bridge';
    const base = worst === 'mixer' ? 74 : worst === 'sanctioned' ? 70 : 42;
    const score = clamp(base + Math.min(18, (e.txs.length - 1) * 4) + Math.min(8, (e.counterparties.size - 1) * 4), 0, 100);
    alerts.push({
      ruleId: 'high_risk_counterparty', severity, score,
      primarySubject: { type: 'wallet', id: subject, label: labelById.get(subject) },
      reason: `High-risk counterparty: ${labelById.get(subject) || subject} transacts directly with ${kindWord} (${cpLabels.join(', ')}) across ${e.txs.length} transfer(s) — provenance-breaking exposure.`,
      subjects: [
        { type: 'wallet', id: subject, label: labelById.get(subject), role: 'subject' },
        ...[...e.counterparties].sort().map((c) => ({ type: 'wallet', id: c, label: labelById.get(c), role: 'high-risk counterparty' })),
      ],
      txIds: e.txs.map((t) => t.id).sort(),
      metrics: { exposure: worst, transfers: e.txs.length, counterparties: e.counterparties.size, kinds: [...e.kinds].sort() },
    });
  }
  return alerts;
}

/**
 * ROUND-TRIPPING — funds leave a wallet and return to it via ≥1 intermediary
 * (a closed loop). We walk short directed paths (up to maxDepth hops) from each
 * candidate origin and flag any that return to the origin. Direct A→A self-loops
 * are ignored; a loop must involve at least one distinct intermediary. Service
 * nodes may appear as intermediaries but are not treated as origins. Bounded and
 * deterministic (paths explored in a stable id order, capped).
 * @param {readonly Tx[]} txs @param {readonly Wallet[]} wallets
 * @param {{maxDepth?:number, maxOrigins?:number}} [opts]
 */
export function detectRoundTripping(txs, wallets, opts = {}) {
  const maxDepth = opts.maxDepth ?? 4;
  const typeById = new Map(wallets.map((w) => [w.id, String(w.node_type || 'wallet')]));
  const labelById = new Map(wallets.map((w) => [w.id, walletLabel(w)]));
  // Adjacency: from -> [{to, txId}], stable order.
  /** @type {Map<string, Array<{to:string, id:string}>>} */
  const adj = new Map();
  for (const t of txs) {
    if (t.from_id === t.to_id) continue;
    if (!adj.has(t.from_id)) adj.set(t.from_id, []);
    adj.get(t.from_id).push({ to: t.to_id, id: t.id });
  }
  for (const list of adj.values()) list.sort((a, b) => a.to.localeCompare(b.to) || a.id.localeCompare(b.id));
  const origins = [...adj.keys()].filter((id) => !SERVICE_NODE_TYPES.has(typeById.get(id) || 'wallet') && typeById.get(id) !== 'mixer').sort();
  const seenLoops = new Set(); // canonical cycle key -> dedupe
  const alerts = [];
  for (const origin of origins) {
    // DFS up to maxDepth looking for a path back to origin (≥1 intermediary).
    const stack = [{ node: origin, path: [origin], txPath: [] }];
    let found = null;
    let guard = 0;
    while (stack.length && !found && guard < 5000) {
      guard++;
      const { node, path, txPath } = stack.pop();
      if (path.length > maxDepth + 1) continue;
      for (const edge of (adj.get(node) || [])) {
        if (edge.to === origin && path.length >= 2) { found = { path: [...path, origin], txPath: [...txPath, edge.id] }; break; }
        if (path.includes(edge.to)) continue; // no revisits (other than closing on origin)
        stack.push({ node: edge.to, path: [...path, edge.to], txPath: [...txPath, edge.id] });
      }
    }
    if (!found) continue;
    // Canonical key: the set of nodes in the loop (order-independent) so A→B→A and
    // B→A→B are one finding.
    const loopNodes = uniq(found.path);
    const key = loopNodes.slice().sort().join('>');
    if (seenLoops.has(key)) continue;
    seenLoops.add(key);
    const hops = found.path.length - 1;
    const score = clamp(46 + (loopNodes.length - 2) * 6, 0, 100);
    const intermediaries = found.path.slice(1, -1);
    alerts.push({
      ruleId: 'round_tripping', severity: 'Medium', score,
      primarySubject: { type: 'wallet', id: origin, label: labelById.get(origin) },
      reason: `Round-tripping: value from ${labelById.get(origin) || origin} returns to it through ${intermediaries.length} intermediary wallet(s) (${found.path.map((n) => labelById.get(n) || n).join(' → ')}) — a circular flow.`,
      subjects: uniq(found.path).map((n) => ({ type: 'wallet', id: n, label: labelById.get(n), role: n === origin ? 'origin/return' : 'intermediary' })),
      txIds: uniq(found.txPath).sort(),
      metrics: { hops, loopSize: loopNodes.length, cycle: found.path },
    });
  }
  return alerts;
}

/**
 * DORMANT-THEN-ACTIVE — a dormant wallet that now sends. Wraps the Chain-Link
 * dormant-activation detector and enriches with the implicated (post-activation)
 * transactions and destinations. Deterministic.
 * @param {readonly Wallet[]} wallets @param {readonly Tx[]} txs
 */
export function detectDormantThenActive(wallets, txs) {
  const labelById = new Map(wallets.map((w) => [w.id, walletLabel(w)]));
  const base = detectDormantActivation(wallets, txs); // [{walletId,...}]
  const alerts = [];
  for (const a of base) {
    const out = txs.filter((t) => t.from_id === a.walletId);
    const dests = uniq(out.map((t) => t.to_id));
    const total = out.reduce((s, t) => s + Number(t.amount_minor), 0);
    const score = clamp(60 + Math.min(20, out.length * 5), 0, 100);
    alerts.push({
      ruleId: 'dormant_then_active', severity: 'High', score,
      primarySubject: { type: 'wallet', id: a.walletId, label: labelById.get(a.walletId) },
      reason: `Dormant re-activation: previously dormant wallet ${labelById.get(a.walletId) || a.walletId} is transacting again — ${out.length} outgoing transfer(s) to ${dests.length} destination(s).`,
      subjects: [
        { type: 'wallet', id: a.walletId, label: labelById.get(a.walletId), role: 'reactivated wallet' },
        ...dests.map((d) => ({ type: 'wallet', id: d, label: labelById.get(d), role: 'destination' })),
      ],
      txIds: out.map((t) => t.id).sort(),
      metrics: { outgoing: out.length, destinations: dests.length, totalMinor: total },
    });
  }
  return alerts;
}

/**
 * FAN-IN / FAN-OUT — many sources into (or destinations out of) one non-service
 * wallet. Wraps the Chain-Link detectors (which already exclude benign service
 * nodes) and enriches each with the implicated txs + counterparties.
 * @param {readonly Tx[]} txs @param {readonly Wallet[]} wallets
 */
export function detectFunnels(txs, wallets) {
  const labelById = new Map(wallets.map((w) => [w.id, walletLabel(w)]));
  const alerts = [];
  for (const a of detectFanIn(txs, wallets)) {
    const inTx = txs.filter((t) => t.to_id === a.walletId);
    const sources = uniq(inTx.map((t) => t.from_id));
    const total = inTx.reduce((s, t) => s + Number(t.amount_minor), 0);
    const score = clamp(48 + Math.min(24, (a.count - CD_THRESHOLDS.fanIn) * 4), 0, 100);
    alerts.push({
      ruleId: 'fan_in', severity: a.severity === 'High' ? 'High' : 'Medium', score,
      primarySubject: { type: 'wallet', id: a.walletId, label: labelById.get(a.walletId) },
      reason: `Fan-in: ${a.count} distinct source wallets funnel into ${labelById.get(a.walletId) || a.walletId} — a collection / funnel account.`,
      subjects: [
        { type: 'wallet', id: a.walletId, label: labelById.get(a.walletId), role: 'funnel account' },
        ...sources.map((s) => ({ type: 'wallet', id: s, label: labelById.get(s), role: 'source' })),
      ],
      txIds: inTx.map((t) => t.id).sort(),
      metrics: { sources: sources.length, totalMinor: total },
    });
  }
  for (const a of detectFanOut(txs, wallets)) {
    const outTx = txs.filter((t) => t.from_id === a.walletId);
    const dests = uniq(outTx.map((t) => t.to_id));
    const total = outTx.reduce((s, t) => s + Number(t.amount_minor), 0);
    const score = clamp(48 + Math.min(24, (a.count - CD_THRESHOLDS.fanOut) * 4), 0, 100);
    alerts.push({
      ruleId: 'fan_out', severity: a.severity === 'High' ? 'High' : 'Medium', score,
      primarySubject: { type: 'wallet', id: a.walletId, label: labelById.get(a.walletId) },
      reason: `Fan-out: ${labelById.get(a.walletId) || a.walletId} disperses value to ${a.count} distinct destinations — layering by scattering the trail.`,
      subjects: [
        { type: 'wallet', id: a.walletId, label: labelById.get(a.walletId), role: 'disperser' },
        ...dests.map((d) => ({ type: 'wallet', id: d, label: labelById.get(d), role: 'destination' })),
      ],
      txIds: outTx.map((t) => t.id).sort(),
      metrics: { destinations: dests.length, totalMinor: total },
    });
  }
  return alerts;
}

/**
 * LAYERING (PEEL CHAIN) — a long run of sequential 'peel'-pattern hops sharing a
 * trace id. We group peel transactions by trace_id and flag any trace whose hop
 * count clears the peel-chain threshold. One alert per trace. Deterministic.
 * @param {readonly Tx[]} txs @param {readonly Wallet[]} wallets
 * @param {{minHops?:number}} [opts]
 */
export function detectLayering(txs, wallets, opts = {}) {
  const minHops = opts.minHops ?? CD_THRESHOLDS.peelChainMin;
  const labelById = new Map(wallets.map((w) => [w.id, walletLabel(w)]));
  /** @type {Map<string, Tx[]>} */
  const byTrace = new Map();
  for (const t of txs) {
    if (t.pattern !== 'peel' || !t.trace_id) continue;
    if (!byTrace.has(t.trace_id)) byTrace.set(t.trace_id, []);
    byTrace.get(t.trace_id).push(t);
  }
  const alerts = [];
  for (const [trace, list] of byTrace) {
    const hops = uniq(list.map((t) => t.hop).filter((h) => h != null)).length || list.length;
    if (hops < minHops) continue;
    const total = list.reduce((s, t) => s + Number(t.amount_minor), 0);
    const wallets_ = uniq(list.flatMap((t) => [t.from_id, t.to_id]));
    // Primary subject: the origin wallet of hop 1 if identifiable, else the trace.
    const hop1 = list.filter((t) => t.hop === 1).sort((a, b) => a.id.localeCompare(b.id))[0];
    const originId = hop1 ? hop1.from_id : (list[0] && list[0].from_id);
    const score = clamp(60 + Math.min(30, (hops - minHops)), 0, 100);
    alerts.push({
      ruleId: 'layering_peel', severity: 'High', score,
      primarySubject: { type: 'trace', id: trace, label: `Peel chain ${trace}` },
      reason: `Layering: peel chain ${trace} runs ${hops} sequential hops across ${wallets_.length} wallets, each peeling a small cash-out and forwarding the remainder — a long-layering topology.`,
      subjects: [
        { type: 'trace', id: trace, label: `Peel chain ${trace}`, role: 'trace' },
        originId ? { type: 'wallet', id: originId, label: labelById.get(originId), role: 'origin' } : null,
      ].filter(Boolean),
      txIds: list.map((t) => t.id).sort().slice(0, 40),
      metrics: { hops, wallets: wallets_.length, totalMinor: total, trace },
    });
  }
  return alerts;
}

/**
 * JURISDICTION-HOPPING — an entity whose control structure threads through many
 * distinct jurisdictions (weighted up when secrecy/offshore havens are involved).
 * Consumes precomputed structure summaries (from the graph engine) so the engine
 * stays free of a DB dependency. Each summary: { id, name, jurisdictions,
 * maxSecrecy, offshore, depth }. Fires when jurisdictions ≥ minJurisdictions.
 * Deterministic.
 * @param {Array<{id:string,name?:string,jurisdictions:number,maxSecrecy?:number,offshore?:boolean,depth?:number,homeJurisdiction?:string}>} summaries
 * @param {{minJurisdictions?:number}} [opts]
 */
export function detectJurisdictionHopping(summaries, opts = {}) {
  const minJ = opts.minJurisdictions ?? 3;
  const alerts = [];
  for (const s of (summaries || [])) {
    const j = Number(s.jurisdictions) || 0;
    if (j < minJ) continue;
    const offshore = !!s.offshore;
    const secrecy = Number(s.maxSecrecy) || 0;
    const score = clamp(40 + (j - minJ) * 8 + (offshore ? 12 : 0) + Math.round(secrecy * 0.15), 0, 100);
    alerts.push({
      ruleId: 'jurisdiction_hopping', severity: score >= 66 ? 'High' : 'Medium', score,
      primarySubject: { type: 'entity', id: s.id, label: s.name || s.id },
      reason: `Jurisdiction-hopping: the control structure of ${s.name || s.id} threads through ${j} jurisdictions${offshore ? ' including an offshore / secrecy haven' : ''} (depth ${s.depth ?? '—'}) — complexity that frustrates beneficial-ownership transparency.`,
      subjects: [{ type: 'entity', id: s.id, label: s.name || s.id, role: 'subject entity' }],
      txIds: [],
      metrics: { jurisdictions: j, offshore, maxSecrecy: secrecy, depth: s.depth ?? null },
    });
  }
  return alerts;
}

// ── Aggregation into a deduped alert queue ───────────────────────────────────

/**
 * Deterministic stable alert id from the rule + primary subject. This is what
 * dedupe keys on (a given rule can only raise one queue row per primary subject),
 * and what dispositions / SAR requests address. Stable across runs.
 * @param {RawAlert} a
 */
export function alertId(a) {
  return `ALRT-${a.ruleId}-${a.primarySubject.type}-${a.primarySubject.id}`;
}

/**
 * Run every typology rule over the data, dedupe, and return a ranked alert queue
 * plus summary counts. Deterministic end-to-end.
 *
 * @param {{ transactions:readonly Tx[], wallets:readonly Wallet[], entitySummaries?:Array<object>, sanctionedIds?:Iterable<string> }} data
 * @param {{ rules?:string[] }} [opts]  Restrict to a subset of rule ids (default: all).
 * @returns {{ alerts:Array<object>, summary:object, rules:Array<object>, disclaimer:string }}
 */
export function runMonitoring(data, opts = {}) {
  const txs = Array.isArray(data.transactions) ? data.transactions : [];
  const wallets = Array.isArray(data.wallets) ? data.wallets : [];
  const summaries = Array.isArray(data.entitySummaries) ? data.entitySummaries : [];
  const sanctionedIds = data.sanctionedIds || [];
  const enabled = Array.isArray(opts.rules) && opts.rules.length ? new Set(opts.rules.filter((r) => RULE_META_BY_ID[r])) : null;
  const on = (id) => !enabled || enabled.has(id);

  /** @type {RawAlert[]} */
  const raw = [];
  if (on('structuring')) raw.push(...detectStructuring(txs, wallets));
  if (on('rapid_movement')) raw.push(...detectRapidMovement(txs, wallets));
  if (on('high_risk_counterparty')) raw.push(...detectHighRiskCounterparty(txs, wallets, { sanctionedIds }));
  if (on('round_tripping')) raw.push(...detectRoundTripping(txs, wallets));
  if (on('dormant_then_active')) raw.push(...detectDormantThenActive(wallets, txs));
  if (on('fan_in') || on('fan_out')) {
    for (const a of detectFunnels(txs, wallets)) if (on(a.ruleId)) raw.push(a);
  }
  if (on('layering_peel')) raw.push(...detectLayering(txs, wallets));
  if (on('jurisdiction_hopping')) raw.push(...detectJurisdictionHopping(summaries));

  // Dedupe by alert id; if two rules produce the same id (they can't — id embeds
  // the rule) keep the higher score. Attach a stable id + rule metadata.
  const byId = new Map();
  for (const a of raw) {
    const id = alertId(a);
    const meta = RULE_META_BY_ID[a.ruleId];
    const enriched = {
      id,
      ruleId: a.ruleId,
      ruleLabel: meta ? meta.label : a.ruleId,
      typology: meta ? meta.typology : a.ruleId,
      severity: a.severity,
      score: a.score,
      primarySubject: a.primarySubject,
      reason: a.reason,
      subjects: dedupeSubjects(a.subjects),
      txIds: uniq(a.txIds || []),
      txCount: uniq(a.txIds || []).length,
      subjectCount: dedupeSubjects(a.subjects).length,
      metrics: a.metrics || {},
    };
    const ex = byId.get(id);
    if (!ex || enriched.score > ex.score) byId.set(id, enriched);
  }

  const alerts = [...byId.values()].sort((a, b) =>
    (sevRank(a.severity) - sevRank(b.severity)) || (b.score - a.score) || a.id.localeCompare(b.id));

  const byRule = {}; const bySeverity = {};
  for (const a of alerts) {
    byRule[a.ruleId] = (byRule[a.ruleId] || 0) + 1;
    bySeverity[a.severity] = (bySeverity[a.severity] || 0) + 1;
  }
  return {
    alerts,
    summary: {
      total: alerts.length,
      bySeverity,
      byRule,
      high: bySeverity.High || 0,
      medium: bySeverity.Medium || 0,
      low: bySeverity.Low || 0,
      rulesFired: Object.keys(byRule).length,
      subjectsFlagged: uniq(alerts.map((a) => a.primarySubject.type + ':' + a.primarySubject.id)).length,
    },
    rules: RULES_META.map((r) => ({ id: r.id, label: r.label, severity: r.severity, typology: r.typology, blurb: r.blurb, fired: byRule[r.id] || 0 })),
    disclaimer: MONITORING_DISCLAIMER,
  };
}

/** Dedupe subjects by type+id, keeping the first (most-specific role wins by order). */
function dedupeSubjects(subjects) {
  const seen = new Set();
  const out = [];
  for (const s of (subjects || [])) {
    if (!s || !s.id) continue;
    const k = s.type + ':' + s.id;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

// ── SAR (suspicious-activity report) builder ─────────────────────────────────

/**
 * Format a minor-unit crypto amount as a readable major-unit string. Pure.
 * @param {number} minor @param {string} [asset]
 */
export function fmtAmount(minor, asset = 'ETH') {
  const n = Number(minor) / MINOR;
  const s = n.toLocaleString('en-US', { maximumFractionDigits: 6 });
  return `${s} ${asset}`;
}

/**
 * Build a deterministic, structured SAR narrative from an alert (or a group of
 * alerts about the same primary subject). Reads the alert's own data + the
 * transaction/wallet context; returns a sectioned narrative object AND a
 * flattened plain-text rendering, both clearly labelled synthetic. No I/O.
 *
 * @param {object|object[]} alertOrGroup   One enriched alert, or an array of them.
 * @param {{ transactions?:readonly Tx[], wallets?:readonly Wallet[], reference?:string, filedBy?:string }} [ctx]
 * @returns {{ reference:string, subject:object, typologies:string[], sections:Array<{heading:string, body:string}>, amounts:object, transactions:Array<object>, narrative:string, disclaimer:string, generatedFrom:string[] }}
 */
export function buildSAR(alertOrGroup, ctx = {}) {
  const alerts = Array.isArray(alertOrGroup) ? alertOrGroup.slice() : [alertOrGroup];
  if (!alerts.length || !alerts[0]) throw new Error('buildSAR: an alert is required');
  // Stable order (severity, score) so a group renders deterministically.
  alerts.sort((a, b) => (sevRank(a.severity) - sevRank(b.severity)) || (b.score - a.score) || String(a.id).localeCompare(String(b.id)));
  const primary = alerts[0];
  const txs = Array.isArray(ctx.transactions) ? ctx.transactions : [];
  const wallets = Array.isArray(ctx.wallets) ? ctx.wallets : [];
  const txById = new Map(txs.map((t) => [t.id, t]));
  const walletById = new Map(wallets.map((w) => [w.id, w]));

  // Gather implicated transactions across the group (deduped, time-ordered).
  const implicatedIds = uniq(alerts.flatMap((a) => a.txIds || []));
  const implicated = implicatedIds.map((id) => txById.get(id)).filter(Boolean)
    .sort((a, b) => (tsMs(a.ts) ?? 0) - (tsMs(b.ts) ?? 0) || String(a.id).localeCompare(String(b.id)));
  const asset = implicated[0] ? (implicated[0].asset || 'ETH') : 'ETH';

  // WHO — primary subject + all implicated subjects across the group.
  const subjects = dedupeSubjects(alerts.flatMap((a) => a.subjects || []));
  const subjLine = (s) => {
    const w = walletById.get(s.id);
    const addr = w && w.address ? ` (${w.address})` : '';
    const nt = w && w.node_type ? `, ${w.node_type}` : '';
    return `${s.label || s.id} [${s.id}${nt}]${addr}${s.role ? ` — ${s.role}` : ''}`;
  };

  // WHEN — window from the implicated txs.
  const times = implicated.map((t) => t.ts).filter(Boolean);
  const first = times.length ? times[0] : null;
  const last = times.length ? times[times.length - 1] : null;

  // WHERE — jurisdictions (entity subjects) / rails (wallet node types) involved.
  const rails = uniq(subjects.map((s) => (walletById.get(s.id) || {}).node_type).filter(Boolean));

  // AMOUNTS.
  const totalMinor = implicated.reduce((s, t) => s + Number(t.amount_minor || 0), 0);
  const maxMinor = implicated.reduce((m, t) => Math.max(m, Number(t.amount_minor || 0)), 0);
  const amounts = {
    asset, transactionCount: implicated.length,
    totalMinor, total: fmtAmount(totalMinor, asset),
    largestMinor: maxMinor, largest: fmtAmount(maxMinor, asset),
    meanMinor: implicated.length ? Math.round(totalMinor / implicated.length) : 0,
  };

  const typologies = uniq(alerts.map((a) => a.typology));
  const reference = ctx.reference || `SAR-${primary.id}`;

  // WHY-SUSPICIOUS — one bullet per contributing rule, in the alert's own words.
  const whyLines = alerts.map((a) => `• [${a.severity}, score ${a.score}] ${a.reason}`);

  const sections = [
    { heading: 'Subject(s) of report', body: subjects.length ? subjects.map(subjLine).join('\n') : `${primary.primarySubject.label || primary.primarySubject.id} [${primary.primarySubject.id}]` },
    { heading: 'Suspicious activity — what was observed', body:
      `The subject was flagged by ${alerts.length} monitoring rule(s) implicating ${amounts.transactionCount} transaction(s). Observed typolog${typologies.length === 1 ? 'y' : 'ies'}: ${typologies.join('; ')}.` },
    { heading: 'When', body: first && last
      ? (first === last ? `Activity observed on ${first}.` : `Activity observed between ${first} and ${last}.`)
      : 'No timestamped transactions are attached to this alert (structural / ownership typology).' },
    { heading: 'Where — rails & counterparties', body:
      (rails.length ? `Value moved over the following rails / node types: ${rails.join(', ')}. ` : '') +
      `${subjects.length} distinct subject(s)/counterparties are implicated.` },
    { heading: 'Why it is suspicious', body: whyLines.join('\n') },
    { heading: 'Amounts', body:
      amounts.transactionCount
        ? `Across ${amounts.transactionCount} implicated transaction(s): total ${amounts.total}; largest single transfer ${amounts.largest}; mean ${fmtAmount(amounts.meanMinor, asset)}.`
        : 'No monetary transactions are attached to this alert (structural typology).' },
    { heading: 'Typology classification', body: typologies.map((t) => `- ${t}`).join('\n') },
    { heading: 'Recommended disposition', body:
      `${primary.severity === 'High' ? 'Escalate for enhanced review / consider filing a suspicious-activity report.' : 'Review and disposition (escalate, close, or mark false-positive) with a documented rationale.'} A human analyst decision is required before any action.` },
  ];

  const transactions = implicated.slice(0, 100).map((t) => ({
    id: t.id, ts: t.ts, from: t.from_id, to: t.to_id,
    fromLabel: (walletById.get(t.from_id) || {}).label || t.from_id,
    toLabel: (walletById.get(t.to_id) || {}).label || t.to_id,
    amountMinor: Number(t.amount_minor || 0), amount: fmtAmount(Number(t.amount_minor || 0), asset),
    pattern: t.pattern || null,
  }));

  const header = [
    'SUSPICIOUS ACTIVITY REPORT (SAR) — SYNTHETIC DEMONSTRATION',
    `Reference: ${reference}`,
    `Prepared by: ${ctx.filedBy || 'demo.analyst'} (local FRIS workspace)`,
    `Primary alert: ${primary.id} (${primary.ruleLabel})`,
    '',
    '*** THIS IS NOT A FILED REGULATORY REPORT. All data is synthetic demonstration material. ***',
    '',
  ].join('\n');
  const narrative = header + sections.map((s) => `${s.heading.toUpperCase()}\n${s.body}`).join('\n\n') +
    `\n\n---\n${MONITORING_DISCLAIMER}`;

  return {
    reference,
    subject: { ...primary.primarySubject, ruleLabel: primary.ruleLabel, severity: primary.severity, score: primary.score },
    typologies, sections, amounts, transactions, narrative,
    disclaimer: MONITORING_DISCLAIMER,
    generatedFrom: alerts.map((a) => a.id),
  };
}
