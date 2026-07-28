// @ts-check
/**
 * Asset Tracing & Recovery — the cross-suite CAPSTONE join engine (Module 13).
 *
 * A "follow-the-asset" recovery map that JOINS the three existing FRIS datasets
 * into one "where is the recoverable value and who controls it" view, per target
 * (an insolvency debtor / case):
 *
 *   · Sovereign Nexus   — the ownership/control graph (reuses graph.mjs: UBO,
 *                         controllers, downstream holdings) + real entity_assets.
 *   · Chain-Link        — real wallet balances, clustered to controlled entities.
 *   · Waterfall         — the insolvency estate's net realisable value + creditor
 *                         claims (reuses computeWaterfall).
 *
 * For each traced asset it derives a RECOVERABILITY band (Recoverable / Contested /
 * Frozen) from REAL jurisdiction offshore + secrecy signals and the sanctions
 * screening overlay, produces a recovery summary (traced value by type, by
 * jurisdiction, by band; controller), and lists every asset with a link back to
 * its originating Nexus / Chain-Link / Waterfall record.
 *
 * ── DATA HONESTY ─────────────────────────────────────────────────────────────
 * 100% REUSE of FRIS's existing SYNTHETIC, deterministic data. No new real-world
 * facts, people or companies are invented. What is REUSED unchanged: the entity /
 * ownership graph, entity_assets, wallet balances, insolvency estates + creditors,
 * and jurisdiction secrecy/offshore attributes. The ONLY newly-synthesised linkage
 * is (a) which existing wallet cluster is *beneficially controlled* by which traced
 * entity, and (b) a per-asset recovery-likelihood %. Both are generated from a
 * FIXED-SEED PRNG (reproducible), are attached only to existing record ids, and are
 * clearly labelled illustrative. Every response carries RECOVERY_DISCLAIMER.
 *
 * ── DETERMINISM ──────────────────────────────────────────────────────────────
 * Pure over the snapshot passed in. Same snapshot → same output, byte-for-byte.
 * The synthetic links use Rng(seed) keyed to stable record ids; no Date.now(), no
 * Math.random, no network, no ambient state. All money is BigInt minor units.
 */

import { Rng } from './prng.mjs';
import { holdingsOf, controllersOf, traceToUBO, structureSummary } from './graph.mjs';
import { computeWaterfall } from './waterfall.mjs';
import { fromMinor, formatMinor, sumMinor } from './decimal.mjs';

export const RECOVERY_VERSION = '1.0.0';
export const RECOVERY_AS_OF = '2025-07-01';
export const RECOVERY_SEED = 'fris-asset-recovery-v1';
export const RECOVERY_DISCLAIMER =
  'Asset Tracing & Recovery is the cross-suite CAPSTONE: it REUSES FRIS’s existing SYNTHETIC, deterministic data — the Sovereign Nexus ownership graph and entity assets, Chain-Link wallet balances, and the Liquidation Waterfall insolvency estates — joined into one follow-the-asset recovery map. No new real-world facts, real people or real companies are introduced. The ONLY newly-synthesised links are the illustrative beneficial-control edges from a traced entity to an existing wallet cluster, and the per-asset recovery-likelihood %; both are generated from a fixed-seed PRNG for reproducibility and are labelled illustrative. This is a demonstration of cross-module joins, NOT an asset-recovery system of record, NOT a factual allegation of control, and NOT legal or financial advice.';

// ── Recoverability bands ─────────────────────────────────────────────────────
// Derived from REAL jurisdiction signals + the sanctions overlay. Colour is ALWAYS
// paired with a label in the UI; rank orders "worst-for-recovery" last.
export const RECOVERABILITY_BANDS = [
  { code: 'recoverable', label: 'Recoverable', color: '#2f9e63', rank: 0, likelihoodFloor: 60, blurb: 'Onshore / controlled asset with a clear path to realisation.' },
  { code: 'contested', label: 'Contested', color: '#c9a227', rank: 1, likelihoodFloor: 25, blurb: 'Offshore or high-secrecy jurisdiction — realisation is possible but slow and contested.' },
  { code: 'frozen', label: 'Frozen / sanctioned', color: '#d5303e', rank: 2, likelihoodFloor: 5, blurb: 'Sanctioned or frozen — legally blocked; recovery requires a licence or is not realisable.' },
];
export const BAND_BY_CODE = Object.fromEntries(RECOVERABILITY_BANDS.map((b) => [b.code, b]));

// Source-module vocabulary (where a traced asset originates).
export const ASSET_SOURCES = [
  { code: 'waterfall', label: 'Liquidation Waterfall', module: 'Waterfall', color: '#e08a3c' },
  { code: 'nexus', label: 'Sovereign Nexus asset', module: 'Nexus', color: '#4d8df0' },
  { code: 'chainlink', label: 'Chain-Link wallet', module: 'Chain-Link', color: '#37c2b4' },
];
export const SOURCE_BY_CODE = Object.fromEntries(ASSET_SOURCES.map((s) => [s.code, s]));

// A stable USD-per-CHF and per-ETH illustrative conversion so that the three
// modules' native units land on ONE comparable scale for the traced-value totals.
// Money is kept in fiat minor units (cents) throughout. These rates are labelled
// illustrative (they exist only so heterogeneous assets can be summed for a
// headline). Crypto balance_minor is 1e-8 units; entity_assets value_usd + estate
// gross_minor are already whole-currency minor/whole units respectively.
const ILLUSTRATIVE_ETH_USD = 3000; // labelled illustrative price for scale only
const USD_TO_CHF = 0.9; // labelled illustrative FX for scale only

// ── Small pure helpers ───────────────────────────────────────────────────────
const num = (x, d = 0) => { const n = Number(x); return Number.isFinite(n) ? n : d; };
const money = (minor) => ({ minor: minor.toString(), value: fromMinor(minor), display: formatMinor(minor) });
function jurisRec(js, code) { return js[code] || { code, name: code, is_offshore: 0, secrecy_score: 0 }; }

// Normalise a snapshot: accept arrays keyed by the DB table names. Missing tables
// default to empty so the engine never throws on a partial store.
function normaliseSnapshot(snap) {
  const s = snap || {};
  return {
    entities: s.entities || [],
    relationships: s.relationships || [],
    jurisdictions: s.jurisdictions || [],
    entityAssets: s.entity_assets || s.entityAssets || [],
    wallets: s.wallets || [],
    clusters: s.clusters || [],
    cases: s.insolvency_cases || s.cases || [],
    estateAssets: s.estate_assets || s.estateAssets || [],
    creditors: s.creditors || [],
    sanctionedEntityIds: new Set(s.sanctionedEntityIds || []),
    sanctionedWalletIds: new Set(s.sanctionedWalletIds || []),
  };
}

// Build the ownership graph (nodes/edges) in the exact shape graph.mjs expects,
// carrying the jurisdiction offshore/secrecy attributes the other engines use.
function buildGraph(s) {
  const js = Object.fromEntries(s.jurisdictions.map((j) => [j.code, j]));
  const nodes = s.entities.map((e) => ({
    ...e,
    is_offshore: js[e.jurisdiction]?.is_offshore ? 1 : 0,
    _offshore: !!js[e.jurisdiction]?.is_offshore,
    _secrecy: js[e.jurisdiction]?.secrecy_score ?? 0,
  }));
  const edges = s.relationships.map((r) => ({ id: r.id, source: r.source_id, target: r.target_id, rel_type: r.rel_type, ownership_pct: r.ownership_pct, is_circular: r.is_circular }));
  return { nodes, edges, js };
}

// Deterministically resolve the Nexus entity that a debtor case maps to: prefer an
// exact legal-name match, else the first COMPANY whose legal name shares the
// debtor's leading name token (e.g. "Silverpeak Property Holding AG" -> the
// "Silverpeak *" company), else any entity sharing the token, else null. Stable:
// entities are considered in id order. This links REAL records only.
function resolveController(c, entities) {
  const debtor = String(c.debtor_name || '');
  const sorted = entities.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const exact = sorted.find((e) => e.legal_name && e.legal_name.toLowerCase() === debtor.toLowerCase());
  if (exact) return exact;
  const token = debtor.split(/\s+/)[0].toLowerCase();
  if (token.length >= 3) {
    const co = sorted.find((e) => e.entity_type === 'company' && e.legal_name && e.legal_name.toLowerCase().includes(token));
    if (co) return co;
    const any = sorted.find((e) => e.legal_name && e.legal_name.toLowerCase().includes(token));
    if (any) return any;
  }
  return null;
}

// The set of entities beneficially controlled by / under the debtor's linked
// entity: the entity itself + everything downstream (holdingsOf) + its immediate
// ownership peers within the same top control cluster. Deterministic + cycle-safe.
function controlledEntitySet(linkedId, edges) {
  const set = new Set([linkedId]);
  for (const id of holdingsOf(edges, linkedId)) set.add(id);
  return set;
}

// ── Recoverability classifier (REAL signals + one illustrative likelihood) ────
// Band is driven by REAL data: a sanctioned id (from the screening overlay) is
// Frozen; an offshore or high-secrecy jurisdiction is Contested; otherwise
// Recoverable. The likelihood % starts from the band floor and is nudged by a
// FIXED-SEED PRNG keyed to the asset id (labelled illustrative) so the map has a
// realistic spread without inventing a real-world fact.
function classifyRecoverability(rng, { assetId, jurisdiction, js, sanctioned, disputed }) {
  const jr = jurisRec(js, jurisdiction);
  let band;
  if (sanctioned) band = 'frozen';
  else if (jr.is_offshore || (jr.secrecy_score ?? 0) >= 75 || disputed) band = 'contested';
  else band = 'recoverable';
  const b = BAND_BY_CODE[band];
  // Illustrative likelihood: band floor + a deterministic 0..30 jitter, capped by
  // the next band's floor so bands never overlap. Frozen stays low.
  const ceiling = band === 'recoverable' ? 95 : band === 'contested' ? 55 : 20;
  const span = ceiling - b.likelihoodFloor;
  const jitter = Math.floor(rng.float() * (span + 1));
  const likelihood = Math.min(ceiling, b.likelihoodFloor + jitter);
  return { band, bandLabel: b.label, bandColor: b.color, bandRank: b.rank, likelihoodPct: likelihood };
}

// Convert a native amount into the illustrative common CHF scale (minor units,
// i.e. Rappen). entity_assets.value_usd is whole USD; estate gross is CHF minor
// already; crypto is 1e-8 units priced at the illustrative ETH/USD.
function usdWholeToChfMinor(usdWhole) { return BigInt(Math.round(num(usdWhole) * USD_TO_CHF * 100)); }
function cryptoMinorToChfMinor(balMinor1e8) {
  const coins = num(balMinor1e8) / 1e8;
  const usd = coins * ILLUSTRATIVE_ETH_USD;
  return BigInt(Math.round(usd * USD_TO_CHF * 100));
}

// ── Public: the traceable targets (debtors / cases) ──────────────────────────
/**
 * List every traceable target — one per insolvency case — with its resolved Nexus
 * controller (if any) and a headline traced-value figure so the picker can rank.
 * @param {object} snap  DB snapshot (see normaliseSnapshot).
 * @returns {object}
 */
export function targets(snap) {
  const s = normaliseSnapshot(snap);
  const { edges } = buildGraph(s);
  const entities = s.entities;
  const rows = s.cases.map((c) => {
    const ctrl = resolveController(c, entities);
    const controlledIds = ctrl ? controlledEntitySet(ctrl.id, edges) : new Set();
    const estGross = sumMinor(s.estateAssets.filter((a) => a.case_id === c.id).map((a) => BigInt(Math.round(num(a.gross_minor)))));
    return {
      id: c.id,
      debtorName: c.debtor_name,
      jurisdiction: c.jurisdiction,
      currency: c.currency,
      status: c.status,
      controllerId: ctrl ? ctrl.id : null,
      controllerName: ctrl ? ctrl.legal_name : null,
      controllerType: ctrl ? ctrl.entity_type : null,
      controlledEntityCount: controlledIds.size,
      estateGross: money(estGross),
    };
  });
  rows.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return { targets: rows, count: rows.length, asOf: RECOVERY_AS_OF, version: RECOVERY_VERSION, disclaimer: RECOVERY_DISCLAIMER };
}

// ── Public: the full follow-the-asset trace for a target ─────────────────────
/**
 * Trace a target's recoverable value: controller -> controlled entities ->
 * {wallets, estate, other assets}, each with a recoverability band + explanation.
 * @param {object} snap
 * @param {string} targetId
 * @returns {object|null}  null when the target id is unknown.
 */
export function traceAssets(snap, targetId) {
  const s = normaliseSnapshot(snap);
  const c = s.cases.find((x) => x.id === targetId);
  if (!c) return null;
  const { nodes, edges, js } = buildGraph(s);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const rng = new Rng(RECOVERY_SEED + ':' + targetId);

  const ctrl = resolveController(c, s.entities);
  const controlledIds = ctrl ? controlledEntitySet(ctrl.id, edges) : new Set();
  const controlledList = [...controlledIds];

  // Ultimate controller(s) of the linked entity (the "who controls it" answer),
  // reusing the real UBO trace. If no Nexus link, controller is the debtor itself.
  let ubos = [];
  let structure = null;
  if (ctrl) {
    const t = traceToUBO(nodes, edges, ctrl.id);
    structure = structureSummary(nodes, edges, ctrl.id);
    ubos = t.ubos.map((uid) => {
      const best = t.chains.filter((ch) => ch.ultimate === uid).reduce((m, ch) => (m == null || (ch.effectivePct ?? -1) > (m.effectivePct ?? -1) ? ch : m), null);
      const n = nodeById.get(uid);
      return { id: uid, name: n ? n.legal_name : uid, type: n ? n.entity_type : null, effectivePct: best ? best.effectivePct : null, jurisdiction: n ? n.jurisdiction : null };
    });
  }

  const assets = [];

  // 1) WATERFALL — the insolvency estate is the debtor's own realisable value.
  const estAssets = s.estateAssets.filter((a) => a.case_id === c.id).slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const creditors = s.creditors.filter((cr) => cr.case_id === c.id);
  let waterfall = null;
  if (estAssets.length) {
    waterfall = computeWaterfall({ currency: c.currency, assets: estAssets, creditors }, {});
    const netByAsset = new Map(waterfall.assetRealisation.map((r) => [r.id, r]));
    for (const a of estAssets) {
      const rec = netByAsset.get(a.id) || { net: 0, realisation: 0 };
      const disputed = a.dispute_status === 'Disputed';
      const cls = classifyRecoverability(rng, { assetId: a.id, jurisdiction: a.jurisdiction || c.jurisdiction, js, sanctioned: false, disputed });
      const grossMinor = BigInt(Math.round(num(a.gross_minor)));
      const netMinor = BigInt(Math.round(num(rec.net) * 100)); // net realisable already in whole CHF from engine -> to minor
      assets.push({
        id: a.id, source: 'waterfall', sourceLabel: SOURCE_BY_CODE.waterfall.label,
        label: a.label, type: a.asset_type, jurisdiction: a.jurisdiction || c.jurisdiction, currency: c.currency,
        controllerId: ctrl ? ctrl.id : null, controllerName: c.debtor_name,
        grossValue: money(grossMinor), realisableValue: money(netMinor),
        tracedValueChfMinor: netMinor.toString(),
        disputed, ...cls,
        recordRef: { module: 'Waterfall', route: '#/waterfall/' + c.id, id: a.id, label: 'Estate asset in ' + c.debtor_name },
        explanation: recoverabilityExplanation(cls, { jurisdiction: a.jurisdiction || c.jurisdiction, js, disputed, source: 'waterfall' }),
      });
    }
  }

  // 2) NEXUS — real entity_assets owned by any controlled entity.
  const nexusAssets = s.entityAssets.filter((a) => controlledIds.has(a.owner_id)).slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
  for (const a of nexusAssets) {
    const owner = nodeById.get(a.owner_id);
    const sanctioned = s.sanctionedEntityIds.has(a.owner_id);
    const cls = classifyRecoverability(rng, { assetId: a.id, jurisdiction: a.jurisdiction, js, sanctioned, disputed: false });
    const chfMinor = usdWholeToChfMinor(a.value_usd);
    assets.push({
      id: a.id, source: 'nexus', sourceLabel: SOURCE_BY_CODE.nexus.label,
      label: a.label, type: a.asset_type, jurisdiction: a.jurisdiction, currency: 'USD',
      controllerId: a.owner_id, controllerName: owner ? owner.legal_name : a.owner_id,
      grossValue: { minor: (BigInt(Math.round(num(a.value_usd) * 100))).toString(), value: num(a.value_usd), display: formatMinor(BigInt(Math.round(num(a.value_usd) * 100))) },
      realisableValue: money(chfMinor), tracedValueChfMinor: chfMinor.toString(),
      disputed: false, sanctioned, ...cls,
      recordRef: { module: 'Nexus', route: '#/nexus/directory', id: a.owner_id, label: (owner ? owner.legal_name : a.owner_id) + ' · ' + a.id },
      explanation: recoverabilityExplanation(cls, { jurisdiction: a.jurisdiction, js, sanctioned, source: 'nexus' }),
    });
  }

  // 3) CHAIN-LINK — wallet clusters beneficially controlled by a controlled entity.
  // THE ONE SYNTHETIC LINK: deterministically assign each cluster (and any high-
  // balance unclustered wallet sample) to a controlled entity, keyed to stable ids.
  const walletLinks = beneficialWalletLinks(rng, s, controlledList, nodeById);
  for (const wl of walletLinks) {
    const owner = nodeById.get(wl.controllerId);
    const sanctioned = s.sanctionedWalletIds.has(wl.walletId);
    const jur = owner ? owner.jurisdiction : c.jurisdiction;
    const cls = classifyRecoverability(rng, { assetId: wl.walletId, jurisdiction: jur, js, sanctioned, disputed: false });
    const chfMinor = cryptoMinorToChfMinor(wl.balanceMinor);
    assets.push({
      id: wl.walletId, source: 'chainlink', sourceLabel: SOURCE_BY_CODE.chainlink.label,
      label: wl.label, type: 'crypto_wallet', jurisdiction: jur, currency: wl.asset,
      controllerId: wl.controllerId, controllerName: owner ? owner.legal_name : wl.controllerId,
      grossValue: { minor: '0', value: wl.balanceCoins, display: wl.balanceCoins.toLocaleString(undefined, { maximumFractionDigits: 4 }) + ' ' + wl.asset },
      realisableValue: money(chfMinor), tracedValueChfMinor: chfMinor.toString(),
      balanceCoins: wl.balanceCoins, clusterId: wl.clusterId, clusterLabel: wl.clusterLabel,
      disputed: false, sanctioned, syntheticLink: true, ...cls,
      recordRef: { module: 'Chain-Link', route: '#/chainlink/wallets', id: wl.walletId, label: 'Wallet ' + wl.walletId + (wl.clusterId ? ' · ' + wl.clusterLabel : '') },
      explanation: recoverabilityExplanation(cls, { jurisdiction: jur, js, sanctioned, source: 'chainlink' }) + ' Beneficial control of this wallet cluster is an illustrative, fixed-seed synthetic link.',
    });
  }

  // Stable order for the flat asset list: band rank (best first), then traced value
  // desc, then id.
  assets.sort((a, b) => a.bandRank - b.bandRank || cmpBig(b.tracedValueChfMinor, a.tracedValueChfMinor) || String(a.id).localeCompare(String(b.id)));

  // Build the controller -> controlled entity -> assets tree.
  const tree = buildTree(c, ctrl, controlledList, nodeById, assets, js);
  const summary = summariseAssets(assets, c, ctrl, ubos, waterfall);

  return {
    target: {
      id: c.id, debtorName: c.debtor_name, jurisdiction: c.jurisdiction, currency: c.currency, status: c.status,
      controllerId: ctrl ? ctrl.id : null, controllerName: ctrl ? ctrl.legal_name : null, controllerType: ctrl ? ctrl.entity_type : null,
      controllerJurisdiction: ctrl ? ctrl.jurisdiction : null,
    },
    ultimateControllers: ubos,
    structure,
    controlledEntities: controlledList.map((id) => {
      const n = nodeById.get(id);
      const jr = jurisRec(js, n ? n.jurisdiction : null);
      return { id, name: n ? n.legal_name : id, type: n ? n.entity_type : null, jurisdiction: n ? n.jurisdiction : null, isOffshore: !!jr.is_offshore, secrecy: jr.secrecy_score ?? 0, isLinkedDebtor: !!(ctrl && id === ctrl.id) };
    }),
    tree,
    assets,
    waterfall: waterfall ? {
      grossBookValue: waterfall.grossBookValue, netRealisableEstate: waterfall.netRealisableEstate,
      distributableEstate: waterfall.distributableEstate, totalClaims: waterfall.totalClaims,
      totalDistributedToCreditors: waterfall.totalDistributedToCreditors, shortfall: waterfall.shortfall,
      overallRecoveryPct: waterfall.overallRecoveryPct, creditorCount: creditors.length,
    } : null,
    summary,
    asOf: RECOVERY_AS_OF, version: RECOVERY_VERSION, disclaimer: RECOVERY_DISCLAIMER,
  };
}

// The single synthetic linkage: map existing wallet clusters (+ a deterministic
// sample of high-balance unclustered wallets) to the target's controlled entities.
// Keyed to stable ids so the assignment never drifts. Returns flat wallet rows.
function beneficialWalletLinks(rng, s, controlledList, nodeById) {
  const out = [];
  if (!controlledList.length || !s.wallets.length) return out;
  // Prefer to attach the named clusters first (they carry the strongest narrative),
  // then a small, deterministic set of the highest-balance unclustered wallets.
  const clusters = s.clusters.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const walletsByCluster = new Map();
  for (const w of s.wallets) { if (!w.cluster_id) continue; if (!walletsByCluster.has(w.cluster_id)) walletsByCluster.set(w.cluster_id, []); walletsByCluster.get(w.cluster_id).push(w); }
  // Deterministically pick how many clusters this target gets (1..all) from the rng.
  const clusterTake = clusters.length ? 1 + Math.floor(rng.float() * clusters.length) : 0;
  const chosenClusters = clusters.slice(0, clusterTake);
  const entityPick = () => controlledList[Math.floor(rng.float() * controlledList.length)];
  for (const cl of chosenClusters) {
    const members = (walletsByCluster.get(cl.id) || []).slice().sort((a, b) => num(b.balance_minor) - num(a.balance_minor) || String(a.id).localeCompare(String(b.id)));
    const ctrlId = entityPick();
    for (const w of members) {
      out.push(walletRow(w, ctrlId, cl, nodeById));
    }
  }
  // A deterministic handful of the biggest unclustered wallets, attributed too.
  const unclustered = s.wallets.filter((w) => !w.cluster_id).slice().sort((a, b) => num(b.balance_minor) - num(a.balance_minor) || String(a.id).localeCompare(String(b.id)));
  const bigTake = Math.min(3, unclustered.length);
  for (let i = 0; i < bigTake; i++) {
    out.push(walletRow(unclustered[i], entityPick(), null, nodeById));
  }
  return out;
}
function walletRow(w, ctrlId, cluster, _nodeById) {
  return {
    walletId: w.id, controllerId: ctrlId, asset: w.asset || 'ETH',
    balanceMinor: num(w.balance_minor), balanceCoins: Math.round((num(w.balance_minor) / 1e8) * 1e4) / 1e4,
    label: w.label || (w.node_type ? cap(w.node_type) + ' wallet ' + w.id : 'Wallet ' + w.id),
    clusterId: cluster ? cluster.id : null, clusterLabel: cluster ? cluster.label : null,
  };
}

// The controller -> controlled entity -> assets tree the UI renders.
function buildTree(c, ctrl, controlledList, nodeById, assets, js) {
  const byController = new Map();
  for (const a of assets) { const k = a.controllerId || '_debtor'; if (!byController.has(k)) byController.set(k, []); byController.get(k).push(a); }
  const entityNodes = controlledList.map((id) => {
    const n = nodeById.get(id);
    const jr = jurisRec(js, n ? n.jurisdiction : null);
    const own = byController.get(id) || [];
    return {
      id, name: n ? n.legal_name : id, type: n ? n.entity_type : null, jurisdiction: n ? n.jurisdiction : null,
      isOffshore: !!jr.is_offshore, secrecy: jr.secrecy_score ?? 0, isLinkedDebtor: !!(ctrl && id === ctrl.id),
      assetCount: own.length, tracedValue: money(sumMinor(own.map((a) => BigInt(a.tracedValueChfMinor)))),
      assets: own.map((a) => ({ id: a.id, label: a.label, type: a.type, source: a.source, band: a.band, tracedValue: a.realisableValue })),
    };
  }).filter((e) => e.assetCount > 0 || (ctrl && e.id === ctrl.id));
  // Estate assets attributed to the debtor itself (no Nexus owner).
  const debtorAssets = byController.get('_debtor') || [];
  const debtorNode = debtorAssets.length ? {
    id: c.id, name: c.debtor_name + ' (estate)', type: 'debtor', jurisdiction: c.jurisdiction,
    isOffshore: false, secrecy: 0, isLinkedDebtor: false, assetCount: debtorAssets.length,
    tracedValue: money(sumMinor(debtorAssets.map((a) => BigInt(a.tracedValueChfMinor)))),
    assets: debtorAssets.map((a) => ({ id: a.id, label: a.label, type: a.type, source: a.source, band: a.band, tracedValue: a.realisableValue })),
  } : null;
  entityNodes.sort((a, b) => (b.isLinkedDebtor ? 1 : 0) - (a.isLinkedDebtor ? 1 : 0) || cmpBig(b.tracedValue.minor, a.tracedValue.minor) || String(a.id).localeCompare(String(b.id)));
  return {
    controller: {
      id: ctrl ? ctrl.id : c.id, name: ctrl ? ctrl.legal_name : c.debtor_name,
      type: ctrl ? ctrl.entity_type : 'debtor', jurisdiction: ctrl ? ctrl.jurisdiction : c.jurisdiction,
      linkedDebtor: c.debtor_name,
    },
    entities: debtorNode ? [debtorNode, ...entityNodes] : entityNodes,
  };
}

// The recovery summary (totals + breakdowns) derived from the flat asset list. The
// sum of the per-band / per-type / per-jurisdiction / per-source breakdowns each
// reconcile to the same grand total (a testable invariant).
function summariseAssets(assets, c, ctrl, ubos, waterfall) {
  const totalMinor = sumMinor(assets.map((a) => BigInt(a.tracedValueChfMinor)));
  const bandAgg = new Map(RECOVERABILITY_BANDS.map((b) => [b.code, { code: b.code, label: b.label, color: b.color, rank: b.rank, count: 0, minor: 0n }]));
  const typeAgg = new Map();
  const jurAgg = new Map();
  const srcAgg = new Map(ASSET_SOURCES.map((sr) => [sr.code, { code: sr.code, label: sr.label, module: sr.module, color: sr.color, count: 0, minor: 0n }]));
  for (const a of assets) {
    const v = BigInt(a.tracedValueChfMinor);
    const b = bandAgg.get(a.band); if (b) { b.count++; b.minor += v; }
    const t = typeAgg.get(a.type) || { type: a.type, count: 0, minor: 0n }; t.count++; t.minor += v; typeAgg.set(a.type, t);
    const j = jurAgg.get(a.jurisdiction) || { jurisdiction: a.jurisdiction, count: 0, minor: 0n }; j.count++; j.minor += v; jurAgg.set(a.jurisdiction, j);
    const sr = srcAgg.get(a.source); if (sr) { sr.count++; sr.minor += v; }
  }
  // Finalisers strip the raw BigInt `minor` accumulator (it must never leak into
  // JSON) and replace it with the serialisable money object + a share %.
  const finBand = (m) => [...m.values()].map(({ minor, ...x }) => ({ ...x, tracedValue: money(minor), pct: totalMinor > 0n ? pct(minor, totalMinor) : 0 }));
  const finArr = (m, key) => [...m.values()].slice().sort((a, b) => cmpBig(b.minor.toString(), a.minor.toString()) || String(a[key]).localeCompare(String(b[key]))).map(({ minor, ...x }) => ({ ...x, tracedValue: money(minor), pct: totalMinor > 0n ? pct(minor, totalMinor) : 0 }));
  const recoverableMinor = bandAgg.get('recoverable').minor;
  const contestedMinor = bandAgg.get('contested').minor;
  const frozenMinor = bandAgg.get('frozen').minor;
  return {
    totalTracedValue: money(totalMinor),
    recoverableValue: money(recoverableMinor),
    contestedValue: money(contestedMinor),
    frozenValue: money(frozenMinor),
    recoverablePct: totalMinor > 0n ? pct(recoverableMinor, totalMinor) : 0,
    assetCount: assets.length,
    controlledEntityCount: new Set(assets.map((a) => a.controllerId)).size,
    ultimateControllerCount: ubos.length,
    byBand: finBand(bandAgg),
    byType: finArr(typeAgg, 'type'),
    byJurisdiction: finArr(jurAgg, 'jurisdiction'),
    bySource: [...srcAgg.values()].map(({ minor, ...x }) => ({ ...x, tracedValue: money(minor), pct: totalMinor > 0n ? pct(minor, totalMinor) : 0 })),
    estateShortfall: waterfall ? waterfall.shortfall : null,
    estateRecoveryPct: waterfall ? waterfall.overallRecoveryPct : null,
  };
}

// ── Public: recovery summary only (headline KPIs + breakdowns) ───────────────
/**
 * @param {object} snap
 * @param {string} targetId
 * @returns {object|null}
 */
export function recoverySummary(snap, targetId) {
  const t = traceAssets(snap, targetId);
  if (!t) return null;
  return {
    target: t.target,
    ultimateControllers: t.ultimateControllers,
    summary: t.summary,
    waterfall: t.waterfall,
    asOf: RECOVERY_AS_OF, version: RECOVERY_VERSION, disclaimer: RECOVERY_DISCLAIMER,
  };
}

// ── Public: the traced assets, optionally filtered by recoverability band ─────
/**
 * @param {object} snap
 * @param {string} targetId
 * @param {string} [band]  one of the RECOVERABILITY_BANDS codes.
 * @returns {object|null}
 */
export function assetsByRecoverability(snap, targetId, band) {
  const t = traceAssets(snap, targetId);
  if (!t) return null;
  let rows = t.assets;
  const filterBand = band && BAND_BY_CODE[band] ? band : null;
  if (filterBand) rows = rows.filter((a) => a.band === filterBand);
  return {
    target: t.target,
    band: filterBand,
    bands: RECOVERABILITY_BANDS.map((b) => ({ code: b.code, label: b.label, color: b.color, blurb: b.blurb, count: t.assets.filter((a) => a.band === b.code).length })),
    sources: ASSET_SOURCES,
    assets: rows,
    count: rows.length,
    total: t.assets.length,
    tracedValue: money(sumMinor(rows.map((a) => BigInt(a.tracedValueChfMinor)))),
    asOf: RECOVERY_AS_OF, version: RECOVERY_VERSION, disclaimer: RECOVERY_DISCLAIMER,
  };
}

// ── Explanation text (plain-English, honest about signals) ────────────────────
function recoverabilityExplanation(cls, { jurisdiction, js, sanctioned, disputed, source }) {
  const jr = jurisRec(js, jurisdiction);
  const where = jr.name ? `${jr.name} (${jurisdiction})` : jurisdiction;
  const parts = [];
  if (source === 'waterfall') parts.push('Realisable value from the debtor’s liquidation estate.');
  else if (source === 'nexus') parts.push('Asset held by a controlled Sovereign Nexus entity.');
  else if (source === 'chainlink') parts.push('Crypto balance clustered to a controlled entity.');
  if (cls.band === 'frozen') parts.push(`Sanctioned / frozen — legally blocked; recovery needs a licence.`);
  else if (cls.band === 'contested') {
    if (jr.is_offshore) parts.push(`Situated in the offshore jurisdiction ${where}; realisation is slow and contested.`);
    else if ((jr.secrecy_score ?? 0) >= 75) parts.push(`High financial-secrecy jurisdiction ${where}; realisation is contested.`);
    else if (disputed) parts.push('Subject to a dispute — realisation is contested.');
  } else parts.push(`Onshore / lower-secrecy jurisdiction ${where}; a clear path to realisation.`);
  if (sanctioned) parts.push('Flagged by the sanctions screening overlay.');
  parts.push(`Illustrative recovery likelihood ${cls.likelihoodPct}%.`);
  return parts.join(' ');
}

// ── tiny pure utils ──────────────────────────────────────────────────────────
function pct(a, b) { if (b === 0n) return 0; return Math.round(Number((a * 10000n) / b)) / 100; }
function cmpBig(a, b) { const x = BigInt(a), y = BigInt(b); return x < y ? -1 : x > y ? 1 : 0; }
function cap(x) { return String(x || '').charAt(0).toUpperCase() + String(x || '').slice(1); }

