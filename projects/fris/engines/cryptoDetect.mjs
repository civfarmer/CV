// @ts-check
/**
 * Deterministic transaction-forensics detection analytics (Chain-Link Engine).
 * Pure functions over transaction/wallet arrays. Every alert carries a reason.
 */

export const THRESHOLDS = {
  fanIn: 6, // distinct senders into one node
  fanOut: 6, // distinct recipients from one node
  velocityWindowSec: 600, // 10 minutes
  velocityCount: 4, // >= N txs within window
  convergenceUpstream: 3, // distinct upstream peel wallets into an exchange
  peelChainMin: 8, // sequential peel hops to call it a chain
};

/**
 * Wallet/service node types that are EXPECTED to have high fan-in / fan-out and
 * are therefore benign as raw degree "hubs": centralised exchanges, exchange
 * deposit/withdrawal addresses and custodial services legitimately receive from
 * and send to very many counterparties. Flagging them as suspicious fan-in/out
 * hubs produces systematic false positives (real exchanges have millions of
 * depositors). High in-degree on an exchange is meaningfully expressed by
 * {@link detectExchangeConvergence}, not by raw fan-in. These types are excluded
 * from the fan-in/fan-out "suspicious hub" alerts.
 * @type {Set<string>}
 */
export const SERVICE_NODE_TYPES = new Set(['exchange', 'deposit', 'withdrawal', 'custodial']);

/** Build an id -> node_type map from a wallets array. */
function typeMap(wallets) {
  return new Map((wallets || []).map((w) => [w.id, String(w.node_type || 'wallet')]));
}

/**
 * @typedef {{id:string, from_id:string, to_id:string, amount_minor:number|bigint, ts:string, hop?:number, pattern?:string, trace_id?:string}} Tx
 * @typedef {{id:string, node_type:string, is_dormant?:number|boolean, last_seen?:string, label?:string}} Wallet
 */

/**
 * Fan-in: a node funnelling from many distinct senders. Known service nodes
 * (exchanges, deposit/withdrawal, custodial) are EXCLUDED — high in-degree there
 * is expected and benign; that signal is routed to exchange-convergence instead.
 * @param {readonly Tx[]} txs
 * @param {readonly Wallet[]} [wallets] wallet-type context (enables service-node exclusion)
 */
export function detectFanIn(txs, wallets = [], threshold = THRESHOLDS.fanIn) {
  const typeById = typeMap(wallets);
  /** @type {Map<string, Set<string>>} */
  const senders = new Map();
  for (const t of txs) {
    if (!senders.has(t.to_id)) senders.set(t.to_id, new Set());
    senders.get(t.to_id).add(t.from_id);
  }
  const alerts = [];
  for (const [node, set] of senders) {
    const nodeType = typeById.get(node) || 'wallet';
    if (SERVICE_NODE_TYPES.has(nodeType)) continue; // benign service infrastructure — not a suspicious hub
    if (set.size >= threshold)
      alerts.push({
        type: 'fan_in',
        severity: set.size >= threshold * 2 ? 'High' : 'Medium',
        walletId: node,
        count: set.size,
        reason: `Fan-in: ${set.size} distinct source wallets funnel into non-service node ${node} (threshold ${threshold}).`,
      });
  }
  return sortAlerts(alerts);
}

/**
 * Fan-out: a node dispersing to many distinct recipients. Known service nodes
 * (exchanges, deposit/withdrawal, custodial) are EXCLUDED — an exchange paying out
 * to many withdrawal addresses is normal, not a suspicious disperser.
 * @param {readonly Tx[]} txs
 * @param {readonly Wallet[]} [wallets] wallet-type context (enables service-node exclusion)
 */
export function detectFanOut(txs, wallets = [], threshold = THRESHOLDS.fanOut) {
  const typeById = typeMap(wallets);
  /** @type {Map<string, Set<string>>} */
  const recips = new Map();
  for (const t of txs) {
    if (!recips.has(t.from_id)) recips.set(t.from_id, new Set());
    recips.get(t.from_id).add(t.to_id);
  }
  const alerts = [];
  for (const [node, set] of recips) {
    const nodeType = typeById.get(node) || 'wallet';
    if (SERVICE_NODE_TYPES.has(nodeType)) continue; // benign service infrastructure — not a suspicious disperser
    if (set.size >= threshold)
      alerts.push({
        type: 'fan_out',
        severity: set.size >= threshold * 2 ? 'High' : 'Medium',
        walletId: node,
        count: set.size,
        reason: `Fan-out: non-service node ${node} disperses funds to ${set.size} distinct destination wallets (threshold ${threshold}).`,
      });
  }
  return sortAlerts(alerts);
}

/**
 * Velocity anomalies: wallets emitting many transactions within a short window.
 * @param {readonly Tx[]} txs
 */
export function detectVelocityAnomalies(txs, windowSec = THRESHOLDS.velocityWindowSec, minCount = THRESHOLDS.velocityCount) {
  /** @type {Map<string, number[]>} */
  const byWallet = new Map();
  for (const t of txs) {
    const ms = Date.parse(t.ts);
    if (Number.isNaN(ms)) continue;
    if (!byWallet.has(t.from_id)) byWallet.set(t.from_id, []);
    byWallet.get(t.from_id).push(ms);
  }
  const alerts = [];
  for (const [wallet, times] of byWallet) {
    times.sort((a, b) => a - b);
    let maxBurst = 1;
    let start = 0;
    for (let end = 0; end < times.length; end++) {
      while (times[end] - times[start] > windowSec * 1000) start++;
      maxBurst = Math.max(maxBurst, end - start + 1);
    }
    if (maxBurst >= minCount)
      alerts.push({
        type: 'velocity_anomaly',
        severity: maxBurst >= minCount * 2 ? 'High' : 'Medium',
        walletId: wallet,
        count: maxBurst,
        reason: `Velocity: ${wallet} emitted ${maxBurst} transactions within ${windowSec}s (threshold ${minCount}).`,
      });
  }
  return sortAlerts(alerts);
}

/**
 * Exchange convergence: exchange nodes receiving from many distinct peel wallets.
 * @param {readonly Tx[]} txs
 * @param {readonly Wallet[]} wallets
 */
export function detectExchangeConvergence(txs, wallets, minUpstream = THRESHOLDS.convergenceUpstream) {
  const typeById = new Map(wallets.map((w) => [w.id, w.node_type]));
  /** @type {Map<string, Set<string>>} */
  const into = new Map();
  for (const t of txs) {
    if (typeById.get(t.to_id) === 'exchange') {
      if (!into.has(t.to_id)) into.set(t.to_id, new Set());
      into.get(t.to_id).add(t.from_id);
    }
  }
  const alerts = [];
  for (const [ex, set] of into) {
    if (set.size >= minUpstream)
      alerts.push({
        type: 'exchange_convergence',
        severity: set.size >= minUpstream * 2 ? 'High' : 'Medium',
        walletId: ex,
        count: set.size,
        reason: `Convergence: ${set.size} upstream wallets deposit into exchange node ${ex} (threshold ${minUpstream}).`,
      });
  }
  return sortAlerts(alerts);
}

/**
 * Dormant-wallet activation: wallets flagged dormant that appear as a sender.
 * @param {readonly Wallet[]} wallets
 * @param {readonly Tx[]} txs
 */
export function detectDormantActivation(wallets, txs) {
  const active = new Set(txs.map((t) => t.from_id));
  const alerts = [];
  for (const w of wallets) {
    if ((w.is_dormant === 1 || w.is_dormant === true) && active.has(w.id))
      alerts.push({
        type: 'dormant_activation',
        severity: 'High',
        walletId: w.id,
        reason: `Dormant wallet ${w.id} (${w.label || 'unlabelled'}) reactivated and is now transacting.`,
      });
  }
  return sortAlerts(alerts);
}

/**
 * Mixer/bridge proximity: transactions touching a mixer or bridge node.
 * @param {readonly Tx[]} txs
 * @param {readonly Wallet[]} wallets
 */
export function detectServiceProximity(txs, wallets) {
  const typeById = new Map(wallets.map((w) => [w.id, w.node_type]));
  const alerts = [];
  for (const t of txs) {
    const ft = typeById.get(t.from_id);
    const tt = typeById.get(t.to_id);
    if (ft === 'mixer' || tt === 'mixer')
      alerts.push({ type: 'mixer_proximity', severity: 'High', txId: t.id, reason: `Transaction ${t.id} is adjacent to a mixing service.` });
    else if (ft === 'bridge' || tt === 'bridge')
      alerts.push({ type: 'bridge_usage', severity: 'Medium', txId: t.id, reason: `Transaction ${t.id} uses a cross-chain bridge.` });
  }
  return sortAlerts(alerts);
}

/**
 * Run the full detection battery.
 * @param {{wallets:readonly Wallet[], transactions:readonly Tx[]}} data
 */
export function runDetections(data) {
  const { wallets, transactions } = data;
  return [
    ...detectFanIn(transactions, wallets),
    ...detectFanOut(transactions, wallets),
    ...detectVelocityAnomalies(transactions),
    ...detectExchangeConvergence(transactions, wallets),
    ...detectDormantActivation(wallets, transactions),
    ...detectServiceProximity(transactions, wallets),
  ];
}

/**
 * Per-transaction risk score (0..100) with reason, deterministic.
 * @param {Tx} tx
 * @param {Map<string,string>} typeById
 */
export function scoreTransaction(tx, typeById) {
  let score = 10;
  const reasons = [];
  const ft = typeById.get(tx.from_id);
  const tt = typeById.get(tx.to_id);
  if (tt === 'mixer' || ft === 'mixer') { score += 60; reasons.push('mixer adjacency'); }
  if (tt === 'bridge' || ft === 'bridge') { score += 25; reasons.push('bridge usage'); }
  if (tt === 'exchange') { score += 15; reasons.push('exchange deposit'); }
  if (tx.pattern === 'peel') { score += 25; reasons.push('peel-chain hop'); }
  if (tx.pattern === 'fan_out') { score += 15; reasons.push('fan-out'); }
  if (tx.pattern === 'fan_in') { score += 15; reasons.push('fan-in'); }
  score = Math.max(0, Math.min(100, score));
  return { score, band: score >= 66 ? 'High' : score >= 33 ? 'Medium' : 'Low', reason: reasons.join(', ') || 'baseline transfer' };
}

function sortAlerts(a) {
  const rank = { High: 0, Medium: 1, Low: 2 };
  return a.sort((x, y) => (rank[x.severity] - rank[y.severity]) || String(x.walletId || x.txId).localeCompare(String(y.walletId || y.txId)));
}

/**
 * Base "reputation" contribution by wallet/service type. Service infrastructure
 * that is inherently laundering-relevant (mixers) starts high; reputable
 * custodial infrastructure and personal wallets start low. This is the
 * type-derived component of {@link deriveWalletRisk}.
 * @type {Record<string, number>}
 */
export const TYPE_BASE_RISK = {
  mixer: 70,        // designed to obfuscate provenance — always suspicious
  bridge: 34,       // legitimate but frequently abused to break the trail
  exchange: 22,     // reputable venue; risk comes from *what flows into it*
  deposit: 24,      // exchange deposit address — slightly elevated
  withdrawal: 18,
  custodial: 16,
  merchant: 10,     // point-of-sale cash-out; ordinary
  wallet: 12,       // ordinary personal wallet — low by default
};

/** Map a 0..100 score to a band. */
export function riskBand(score) {
  return score >= 66 ? 'High' : score >= 33 ? 'Medium' : 'Low';
}

/**
 * Derive a realistic, deterministic per-wallet risk score (0..100) + band from
 * wallet TYPE and GRAPH POSITION — not from a coin flip. A wallet scores higher
 * when it is a mixer, sits one hop from a mixer, deposits into / one hop from a
 * sanctioned exchange, participates in a long peel chain, fans out to many
 * addresses, or is a re-activated dormant wallet. Ordinary personal wallets and
 * reputable exchanges that are not implicated stay Low/Medium. Pure + stable:
 * identical inputs => identical output, no randomness consumed.
 *
 * @param {readonly Wallet[]} wallets
 * @param {readonly Tx[]} transactions
 * @param {{sanctionedIds?: Iterable<string>}} [opts]
 * @returns {Map<string,{score:number, band:string, reasons:string[]}>}
 */
export function deriveWalletRisk(wallets, transactions, opts = {}) {
  const typeById = new Map(wallets.map((w) => [w.id, String(w.node_type || 'wallet')]));
  const sanctioned = new Set(opts.sanctionedIds || []);
  const neighbours = new Map();     // id -> Set of directly-connected ids (either direction)
  const outDistinct = new Map();    // id -> Set of distinct recipients (fan-out)
  const peelTouch = new Set();      // ids that appear on a peel-pattern edge
  const nearMixer = new Set();      // ids one hop from a mixer
  const nearSanctioned = new Set(); // ids one hop from a sanctioned node
  const depositsToExchange = new Set();
  const link = (a, b) => { if (!neighbours.has(a)) neighbours.set(a, new Set()); neighbours.get(a).add(b); };
  for (const t of transactions) {
    const f = t.from_id, to = t.to_id;
    link(f, to); link(to, f);
    if (!outDistinct.has(f)) outDistinct.set(f, new Set());
    outDistinct.get(f).add(to);
    if (t.pattern === 'peel') { peelTouch.add(f); peelTouch.add(to); }
    const ft = typeById.get(f), tt = typeById.get(to);
    if (ft === 'mixer') nearMixer.add(to);
    if (tt === 'mixer') nearMixer.add(f);
    if (sanctioned.has(f)) nearSanctioned.add(to);
    if (sanctioned.has(to)) nearSanctioned.add(f);
    if (tt === 'exchange') depositsToExchange.add(f);
  }
  const out = new Map();
  for (const w of wallets) {
    const type = String(w.node_type || 'wallet');
    let score = TYPE_BASE_RISK[type] ?? 12;
    /** @type {string[]} */
    const reasons = [];
    if (type === 'mixer') reasons.push('mixing service');
    else if (type === 'bridge') reasons.push('cross-chain bridge');
    if (nearMixer.has(w.id) && type !== 'mixer') { score += 34; reasons.push('one hop from a mixing service'); }
    if (sanctioned.has(w.id)) { score += 40; reasons.push('sanctioned / watchlisted service'); }
    if (nearSanctioned.has(w.id) && !sanctioned.has(w.id)) { score += 22; reasons.push('one hop from a sanctioned exchange'); }
    if (peelTouch.has(w.id)) { score += 26; reasons.push('on a peel-chain layering route'); }
    const fo = (outDistinct.get(w.id) || new Set()).size;
    if (fo >= THRESHOLDS.fanOut) { score += 18; reasons.push(`fans out to ${fo} addresses`); }
    else if (fo >= 4) { score += 8; reasons.push(`disperses to ${fo} addresses`); }
    if (w.is_dormant === 1 || w.is_dormant === true) {
      const active = (outDistinct.get(w.id) || new Set()).size > 0;
      if (active) { score += 30; reasons.push('re-activated dormant wallet'); }
      else { score += 6; reasons.push('dormant'); }
    }
    if (type === 'exchange' && !depositsToExchange.size) score -= 4;
    score = Math.max(0, Math.min(100, Math.round(score)));
    out.set(w.id, { score, band: riskBand(score), reasons });
  }
  return out;
}

/**
 * Plain-language "where does the risk come from" indicators for a peel-chain
 * configuration, computable BEFORE the simulation runs (and re-usable after).
 * Deterministic — mirrors how the simulator places bridge/mixer hops and how the
 * destination mix behaves — so the operator can see the exposure near the figure
 * inputs without executing anything.
 *
 * @param {{hops?:number, peelPercent?:number, bridgeEvent?:boolean, mixerEvent?:boolean, exchangeAggregation?:boolean, destinationProbabilities?:Record<string,number>}} config
 * @returns {{id:string, severity:string, present:boolean, title:string, detail:string}[]}
 */
export function peelChainRiskIndicators(config = {}) {
  const hops = Math.max(1, Math.floor(Number(config.hops ?? 55)));
  const mixerEvent = config.mixerEvent ?? true;
  const bridgeEvent = config.bridgeEvent ?? true;
  const aggregate = !!config.exchangeAggregation;
  const probs = config.destinationProbabilities || { exchange: 0.4, merchant: 0.2, wallet: 0.25, bridge: 0.1, mixer: 0.05 };
  const mixerAt = mixerEvent ? Math.floor(hops * 0.6) : -1;
  const bridgeAt = bridgeEvent ? Math.floor(hops * 0.4) : -1;
  const pExch = aggregate ? Math.min(0.9, (probs.exchange || 0.4) + 0.12) : (probs.exchange || 0.4);
  const expExchangeAddrs = Math.round(hops * pExch * 0.5);
  const fanOut = hops;
  const peelChainLong = hops >= THRESHOLDS.peelChainMin;
  const ind = [];
  ind.push({
    id: 'mixer_proximity', severity: 'High', present: mixerEvent,
    title: 'Routed within 1 hop of a mixing service',
    detail: mixerEvent ? `A mixer hop is inserted at hop ${mixerAt} of ${hops} — funds pass directly through a tumbler, the single strongest laundering signal. Disable "Include a mixer event" to avoid it.` : 'No mixer hop — funds never touch a tumbler in this configuration.',
  });
  ind.push({
    id: 'bridge_usage', severity: 'Medium', present: bridgeEvent,
    title: 'Crosses a cross-chain bridge',
    detail: bridgeEvent ? `A bridge hop at hop ${bridgeAt} moves value across chains, breaking on-chain provenance for downstream tracing.` : 'No bridge hop — provenance stays on a single chain.',
  });
  ind.push({
    id: 'peel_chain', severity: peelChainLong ? 'High' : 'Medium', present: peelChainLong,
    title: `Peel chain longer than ${THRESHOLDS.peelChainMin} hops`,
    detail: `Configured for ${hops} sequential hops${hops >= 50 ? ' — a classic long-layering topology' : ''}. Each hop peels a small cash-out and forwards the remainder.`,
  });
  ind.push({
    id: 'fan_out', severity: fanOut >= THRESHOLDS.fanOut ? 'Medium' : 'Low', present: fanOut >= THRESHOLDS.fanOut,
    title: `Fans out into ~${fanOut} addresses`,
    detail: `Every hop forwards to a fresh address, dispersing the trail across ~${fanOut} wallets (fan-out threshold ${THRESHOLDS.fanOut}).`,
  });
  ind.push({
    id: 'exchange_convergence', severity: expExchangeAddrs >= THRESHOLDS.convergenceUpstream ? 'Medium' : 'Low', present: expExchangeAddrs >= THRESHOLDS.convergenceUpstream,
    title: 'Converges on flagged exchange deposits',
    detail: `${aggregate ? 'Late-hop aggregation biases peels toward exchanges; ' : ''}~${expExchangeAddrs} distinct exchange deposit addresses are expected to receive peels (convergence threshold ${THRESHOLDS.convergenceUpstream}).`,
  });
  return ind;
}

