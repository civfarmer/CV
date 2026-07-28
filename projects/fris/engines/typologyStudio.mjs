// @ts-check
/**
 * Laundering / Illicit-Finance Typology Studio — the pure, deterministic engine.
 *
 * The crown-jewel synthesis of FRIS: a build-your-own financial-crime scenario lab.
 * Given a COMPOSED SCENARIO (ordered stage blocks + parameters), it:
 *   1. GENERATES the synthetic artefacts for each stage — fictional shell entities,
 *      wallets, a crypto peel chain (via the REAL `simulatePeelChain`), trade
 *      invoices, and a real-estate / operating-business integration asset — threading
 *      the value through the stages with fees / shrinkage so the money-flow is
 *      conserved (in = out + fees, within tolerance).
 *   2. Produces a step-by-step MONEY-FLOW NARRATIVE (placement → layering →
 *      integration) with the amount at every hop and the shrinkage taken.
 *   3. RUNS THE REAL FRIS DETECTORS over the generated artefacts —
 *      `monitoring.runMonitoring` (structuring / funnel / rapid / layering / high-risk
 *      counterparty / jurisdiction-hopping), `cryptoDetect.runDetections` (peel /
 *      velocity / convergence / mixer / bridge), `screening.screen` (sanctions / PEP),
 *      `graph.structureSummary` (ownership opacity), `waterfall.computeWaterfall`
 *      (integration recoverability) — and produces a DETECTOR-COVERAGE REPORT: for
 *      each stage, which detector(s) fired (caught ✓) vs which planted red-flag went
 *      undetected (gap ✗), with an explanation and an overall coverage score (% of
 *      injected red-flags caught).
 *
 * Everything is pure + fully deterministic from `spec.seed`: identical spec →
 * identical result, byte-for-byte. No Date.now(), no network, no DB. This is a
 * TRAINING / SIMULATION SANDBOX over 100% SYNTHETIC data (see the disclaimer).
 */
import { Rng } from './prng.mjs';
import { simulatePeelChain } from './peelingChain.mjs';
import { runDetections } from './cryptoDetect.mjs';
import { runMonitoring } from './monitoring.mjs';
import { screen } from './screening.mjs';
import { structureSummary } from './graph.mjs';
import { computeWaterfall } from './waterfall.mjs';
import {
  TYPOLOGY_STUDIO_VERSION, TYPOLOGY_STUDIO_DISCLAIMER, PHASES, PHASE_BY_CODE,
  DETECTORS, DETECTOR_BY_KEY, STAGE_BLOCKS, STAGE_BLOCK_BY_ID, BLOCKS_BY_PHASE,
  PRESETS, PRESET_BY_ID, MAX_STAGES,
} from '../data/typologyStudio.mjs';

const MINOR = 100000000; // 1 major unit = 1e8 minor — matches monitoring / waterfall
const CRYPTO_ONE = 100000000; // peel-chain sats scale (1e8)

// ── Small deterministic helpers ──────────────────────────────────────────────
const clampNum = (x, lo, hi) => { x = Number(x); if (!Number.isFinite(x)) return lo; return Math.min(hi, Math.max(lo, x)); };
const clampInt = (x, lo, hi) => Math.round(clampNum(x, lo, hi));
const round2 = (x) => Math.round(x * 100) / 100;
const toMinor = (units) => Math.round(Number(units) * MINOR);
const isoAdd = (baseMs, sec) => new Date(baseMs + sec * 1000).toISOString();

/**
 * The full catalogue the composer UI needs: phases, stage blocks (with params +
 * the detectors they should trip), the detector directory, and the presets.
 */
export function catalogue() {
  return {
    version: TYPOLOGY_STUDIO_VERSION,
    phases: PHASES.map((p) => ({ ...p })),
    blocks: STAGE_BLOCKS.map((b) => ({
      id: b.id, phase: b.phase, label: b.label, icon: b.icon, color: b.color,
      summary: b.summary, method: b.method,
      params: b.params.map((p) => ({ ...p })),
      redFlags: b.redFlags.slice(),
      detectors: b.detectors.map((k) => ({ key: k, label: (DETECTOR_BY_KEY[k] || {}).label || k, route: (DETECTOR_BY_KEY[k] || {}).route || null })),
    })),
    blocksByPhase: Object.fromEntries(PHASES.map((p) => [p.code, (BLOCKS_BY_PHASE[p.code] || []).map((b) => b.id)])),
    detectors: DETECTORS.map((d) => ({ ...d })),
    presets: PRESETS.map((p) => ({ id: p.id, name: p.name, tagline: p.tagline, blurb: p.blurb, seed: p.seed, stageCount: p.stages.length, blocks: p.stages.map((s) => s.block) })),
    disclaimer: TYPOLOGY_STUDIO_DISCLAIMER,
  };
}

/** Return a ready-to-run scenario spec for a preset id (or null). */
export function presetScenario(id) {
  const p = PRESET_BY_ID[id];
  if (!p) return null;
  return {
    id: p.id, name: p.name, tagline: p.tagline, blurb: p.blurb, seed: p.seed,
    stages: p.stages.map((s) => ({ block: s.block, params: { ...s.params } })),
  };
}

// ── Red-flag registry ─────────────────────────────────────────────────────────
// Every planted red-flag maps to a human title and the DETECTOR whose firing counts
// as "catching" it. The coverage report reconciles each planted flag to a catch/gap.
const RED_FLAG_META = {
  sub_threshold_deposits: { title: 'Sub-threshold structured deposits', detector: 'structuring' },
  funnel_collection: { title: 'Funnel / collection account (fan-in)', detector: 'funnel_fan_in' },
  rapid_pass_through: { title: 'Rapid in-out pass-through (velocity)', detector: 'rapid_movement' },
  ownership_opacity: { title: 'Opaque nominee ownership structure', detector: 'ownership_opacity' },
  jurisdiction_hopping: { title: 'Jurisdiction-hopping control chain', detector: 'jurisdiction_hopping' },
  nominee_masking: { title: 'Nominee interposed to mask the UBO', detector: 'ownership_opacity' },
  peel_chain: { title: 'Long crypto peel chain (layering)', detector: 'layering_peel' },
  mixer_proximity: { title: 'Funds routed through a mixer', detector: 'mixer_proximity' },
  bridge_usage: { title: 'Cross-chain bridge breaks provenance', detector: 'mixer_proximity' },
  exchange_convergence: { title: 'Peels converge on exchange deposits', detector: 'peel_chain_crypto' },
  velocity: { title: 'High-velocity hop bursts', detector: 'peel_chain_crypto' },
  price_deviation: { title: 'Trade invoice mis-priced vs fair value', detector: 'trade_mispricing' },
  sanctioned_counterparty: { title: 'Sanctioned front counterparty', detector: 'screening' },
  fan_out_dispersal: { title: 'Fan-out dispersal across mules', detector: 'peel_chain_crypto' },
  integration_asset: { title: 'Value integrated into a real asset', detector: 'estate_integration' },
  // Integration-phase concealment that NO transaction-level or screening detector
  // catches in real time — a genuine, well-documented blind spot. Marked as an
  // inherent gap so the coverage report teaches WHERE detection fails, not just
  // where it succeeds. (`detector: null` ⇒ always reported as a gap.)
  loan_back: { title: 'Loan-back financing (self-funded, looks legitimate)', detector: null, inherentGap: 'No real-time rule flags a loan-back: a self-funded mortgage looks like ordinary finance. It only surfaces on manual source-of-funds review of the lender.' },
  revenue_commingling: { title: 'Illicit funds commingled with real revenue', detector: null, inherentGap: 'Commingling with a cash-intensive business defeats transaction monitoring: once blended with genuine turnover, the illicit share is statistically indistinguishable without a forensic audit of the books.' },
};

// ── Jurisdiction pools (synthetic) for shell placement ───────────────────────
// Onshore vs offshore secrecy havens, with a secrecy score — mirrors the shape the
// graph engine's structureSummary reads (_secrecy / is_offshore).
const ONSHORE = [
  { code: 'GE', name: 'Geneva', secrecy: 45, offshore: 0 },
  { code: 'ZG', name: 'Zug', secrecy: 55, offshore: 0 },
  { code: 'LU', name: 'Luxembourg', secrecy: 66, offshore: 0 },
  { code: 'CY', name: 'Cyprus', secrecy: 70, offshore: 0 },
  { code: 'SG', name: 'Singapore', secrecy: 60, offshore: 0 },
];
const OFFSHORE = [
  { code: 'BVI', name: 'British Virgin Islands', secrecy: 90, offshore: 1 },
  { code: 'KY', name: 'Cayman Islands', secrecy: 88, offshore: 1 },
  { code: 'JE', name: 'Jersey', secrecy: 80, offshore: 1 },
  { code: 'LI', name: 'Liechtenstein', secrecy: 82, offshore: 1 },
];
// Real listed sanctioned-front names, used so screening.screen() deterministically
// returns a strong sanctions match against the real public-sanctions subset
// (watchlists.mjs). These are genuine OFAC/UN designations reproduced for the demo.
const SANCTIONED_FRONTS = ['Bank Melli Iran', 'Sovcomflot', 'Wagner Group'];
// A real designated crypto address (the OFAC-listed Tornado Cash contract).
const SANCTIONED_WALLET = '0x8589427373D6D84E98730D7795D8f6f8731FDA16';
// Shell name particles (fictional).
const SHELL_HEADS = ['Meridian', 'Silverpeak', 'Northgate', 'Aurelia', 'Peregrine', 'Halcyon', 'Cascadia', 'Verano', 'Obsidian', 'Kestrel', 'Lyra', 'Solstice'];
const SHELL_TAILS = ['Holdings', 'Capital', 'Trading', 'Ventures', 'Partners', 'Investments', 'Global', 'Consulting'];

function synthShellName(rng) { return `${rng.pick(SHELL_HEADS)} ${rng.pick(SHELL_TAILS)} ${rng.pick(['SA', 'Ltd', 'AG', 'Sàrl', 'BV', 'GmbH'])}`; }
function synthPerson(rng) { return `${rng.pick(['Alex', 'Jordan', 'Sam', 'Robin', 'Casey', 'Morgan', 'Taylor', 'Devon'])} ${rng.pick(['Fisher', 'Vance', 'Doyle', 'Mercer', 'Rowe', 'Sloane', 'Keller', 'Nash'])}`; }

/**
 * Validate + normalise a composed scenario spec: an ordered list of stages, each a
 * known block id + clamped params, plus a numeric seed. Unknown blocks are dropped;
 * missing params fall back to the block's declared defaults (so a bare spec runs).
 * @param {{ seed?:number|string, stages?:Array<{block:string, params?:object}> }} spec
 */
export function normaliseSpec(spec = {}) {
  const seed = spec.seed == null || spec.seed === '' ? 71011 : spec.seed;
  const rawStages = Array.isArray(spec.stages) ? spec.stages.slice(0, MAX_STAGES) : [];
  const stages = [];
  for (const s of rawStages) {
    const block = STAGE_BLOCK_BY_ID[s && s.block];
    if (!block) continue;
    const params = {};
    for (const p of block.params) {
      const given = s.params ? s.params[p.key] : undefined;
      if (p.kind === 'bool') params[p.key] = given === undefined ? !!p.def : !!(given === true || given === 'true' || given === 1 || given === '1');
      else if (p.kind === 'select') params[p.key] = (p.options || []).includes(given) ? given : p.def;
      else if (p.kind === 'int') params[p.key] = clampInt(given === undefined ? p.def : given, p.min ?? 0, p.max ?? 1e9);
      else params[p.key] = round2(clampNum(given === undefined ? p.def : given, p.min ?? -1e9, p.max ?? 1e9));
    }
    stages.push({ block: block.id, phase: block.phase, params });
  }
  // If the composed scenario is empty, fall back to the classic three-stage preset
  // so a default simulate is always meaningful (and headless-safe).
  if (!stages.length) {
    const p = PRESET_BY_ID.classic_three_stage;
    for (const s of p.stages) {
      const block = STAGE_BLOCK_BY_ID[s.block];
      const params = {};
      for (const pp of block.params) params[pp.key] = s.params[pp.key] !== undefined ? s.params[pp.key] : pp.def;
      stages.push({ block: block.id, phase: block.phase, params });
    }
    return { seed: p.seed, stages, _fallback: true };
  }
  return { seed, stages, _fallback: false };
}

/**
 * SIMULATE — the heart of the Studio. Generate the artefacts for a composed
 * scenario, build the money-flow narrative, run the REAL detectors, score coverage.
 * @param {{ seed?:number|string, stages?:Array<{block:string, params?:object}>, name?:string }} spec
 */
export function simulate(spec = {}) {
  const norm = normaliseSpec(spec);
  const rng = new Rng(`${norm.seed}:typology`);
  const baseMs = Date.parse('2026-02-02T09:00:00.000Z');

  // Accumulated artefacts across all stages.
  /** @type {any[]} */ const wallets = [];
  /** @type {any[]} */ const transactions = [];
  /** @type {any[]} */ const entities = [];   // shells (graph nodes)
  /** @type {any[]} */ const edges = [];       // ownership edges
  /** @type {any[]} */ const invoices = [];
  /** @type {any[]} */ const estateAssets = [];
  /** @type {string[]} */ const sanctionedWalletIds = [];
  /** @type {Array<{name:string, kind:string, jurisdiction?:string, stageId:string}>} */ const screenSubjects = [];
  /** @type {any[]} */ const flowSteps = [];    // money-flow narrative
  /** @type {any[]} */ const stageArtefacts = []; // per-stage record for the report

  // Value threaded through the pipeline (major units). Seeded from the first stage
  // that declares an amount; each stage takes some shrinkage (fees / commissions).
  let value = null;       // current laundered value in flight (major units)
  let injected = null;    // the original dirty value (major units)
  let totalShrink = 0;    // cumulative fees / shrinkage
  let clock = baseMs;
  let walletSeq = 0, entitySeq = 0, txSeq = 0, invSeq = 0, assetSeq = 0;
  const nextWallet = (node_type, label, extra) => {
    const id = `TS-W${String(++walletSeq).padStart(3, '0')}`;
    const addr = '0x' + rng.hex(20);
    const w = { id, address: addr, label, node_type, is_dormant: 0, cluster_id: null, ...(extra || {}) };
    wallets.push(w); return w;
  };
  const nextEntity = (name, jur) => {
    const id = `TS-E${String(++entitySeq).padStart(3, '0')}`;
    const e = { id, legal_name: name, entity_type: 'company', jurisdiction: jur.code, _secrecy: jur.secrecy, is_offshore: jur.offshore, _offshore: !!jur.offshore, is_nominee: false };
    entities.push(e); return e;
  };
  const pushTx = (from_id, to_id, amountMinor, tsMs, opts = {}) => {
    const id = `TS-T${String(++txSeq).padStart(4, '0')}`;
    transactions.push({ id, from_id, to_id, amount_minor: Math.max(0, Math.round(amountMinor)), ts: new Date(tsMs).toISOString(), hop: opts.hop ?? null, pattern: opts.pattern ?? null, trace_id: opts.trace_id ?? null });
    return id;
  };
  const takeShrink = (amount, pct, why) => { const s = round2(amount * pct); totalShrink = round2(totalShrink + s); return s; };

  // ── Generate each stage ────────────────────────────────────────────────────
  for (let i = 0; i < norm.stages.length; i++) {
    const st = norm.stages[i];
    const block = STAGE_BLOCK_BY_ID[st.block];
    const P = st.params;
    const stageId = `S${i + 1}`;
    const rec = { stageId, order: i + 1, blockId: block.id, phase: block.phase, label: block.label, method: block.method, params: { ...P }, redFlags: block.redFlags.slice(), artefacts: {}, inValue: null, outValue: null, shrink: 0 };
    clock += rng.int(1800, 7200) * 1000; // some time passes between stages
    const inValue = value;

    if (block.id === 'cash_structuring') {
      const total = P.amount; // k units
      injected = injected == null ? total : injected;
      value = value == null ? total : value;
      const perDeposit = total / P.deposits;
      const threshold = P.thresholdK;
      // Keep each deposit "just under" the threshold in the detector's units (the
      // monitoring rule works in whole units with a 10-unit synthetic threshold, so
      // scale k-unit deposits into the detector band [0.7*thr, thr)).
      const smurfWallets = Array.from({ length: P.smurfs }, (_, k) => nextWallet('wallet', `Smurf depositor ${k + 1} (synthetic)`));
      const funnel = nextWallet('wallet', 'Placement funnel account (synthetic)');
      rec.artefacts.funnelWalletId = funnel.id;
      rec.artefacts.smurfWalletIds = smurfWallets.map((w) => w.id);
      // Deterministic sub-threshold amounts in the detector band, clustered in a day.
      let t = clock;
      const depTx = [];
      for (let d = 0; d < P.deposits; d++) {
        const smurf = smurfWallets[d % smurfWallets.length];
        // amount in whole detector-units, in [0.72*thr, 0.985*thr)
        const frac = 0.72 + rng.float() * 0.26;
        const amtUnits = round2(threshold * frac);
        t += rng.int(600, 5400) * 1000;
        depTx.push(pushTx(smurf.id, funnel.id, toMinor(amtUnits), t, { pattern: 'fan_in' }));
      }
      rec.artefacts.depositTxIds = depTx;
      rec.artefacts.deposits = P.deposits; rec.artefacts.thresholdK = threshold;
      clock = t;
      flowSteps.push(flowStep(stageId, block, 'placement', `${P.deposits} sub-threshold deposits (~${round2(threshold * 0.85)}k each) from ${P.smurfs} smurfs collected into one funnel`, total, 0, funnel.id));
      rec.inValue = inValue; rec.outValue = value; rec.shrink = 0;

    } else if (block.id === 'funnel_account') {
      if (value == null) { value = 100; injected = injected == null ? 100 : injected; }
      // Many feeder sources fan into one collection account, which forwards quickly.
      const collection = nextWallet('wallet', 'Collection / funnel account (synthetic)');
      const feeders = Array.from({ length: P.sources }, (_, k) => nextWallet('wallet', `Feeder source ${k + 1} (synthetic)`));
      rec.artefacts.collectionWalletId = collection.id;
      rec.artefacts.feederWalletIds = feeders.map((w) => w.id);
      const per = value / P.sources;
      let t = clock;
      const inTx = [];
      for (let k = 0; k < feeders.length; k++) { t += rng.int(300, 3600) * 1000; inTx.push(pushTx(feeders[k].id, collection.id, toMinor(per), t, { pattern: 'fan_in' })); }
      // Rapid onward burst: the funnel re-sends in several quick outgoing txs (velocity).
      const onward = nextWallet('wallet', 'Layering hand-off wallet (synthetic)');
      let t2 = t + P.holdHours * 3600 * 1000;
      const outTx = [];
      const burst = Math.min(6, Math.max(4, Math.round(P.sources / 2)));
      for (let k = 0; k < burst; k++) { t2 += rng.int(20, 90) * 1000; outTx.push(pushTx(collection.id, onward.id, toMinor(value / burst), t2, { pattern: 'fan_out' })); }
      rec.artefacts.onwardWalletId = onward.id;
      rec.artefacts.feederTxIds = inTx; rec.artefacts.onwardTxIds = outTx;
      clock = t2;
      flowSteps.push(flowStep(stageId, block, 'placement', `${P.sources} feeders funnel into one account, then a rapid ${burst}-transfer burst forwards the aggregate`, value, 0, onward.id));
      rec.inValue = inValue; rec.outValue = value; rec.shrink = 0;

    } else if (block.id === 'shell_layering') {
      if (value == null) { value = 1000; injected = injected == null ? 1000 : injected; }
      // A chain of shells across jurisdictions; a nominee heads the top; ownership edges
      // wire UBO -> shell_n -> ... -> shell_1 so structureSummary sees depth + spread.
      const nJur = P.jurisdictions;
      const jurs = [];
      const onshorePool = rng.shuffle(ONSHORE.slice());
      const offshorePool = rng.shuffle(OFFSHORE.slice());
      for (let k = 0; k < nJur; k++) {
        if (P.offshore && k === nJur - 1) jurs.push(offshorePool[0]);
        else jurs.push(onshorePool[k % onshorePool.length]);
      }
      const shells = [];
      for (let k = 0; k < P.shells; k++) {
        const jur = jurs[k % jurs.length];
        const e = nextEntity(synthShellName(rng), jur);
        shells.push(e);
      }
      // UBO (a natural person) + optional nominee. `entity_type: 'person'` so the
      // graph engine's ownershipChains treats them as terminal beneficial owners.
      const uboId = `TS-UBO${stageId}`;
      const uboName = synthPerson(rng);
      entities.push({ id: uboId, legal_name: uboName, entity_type: 'person', jurisdiction: (P.offshore ? offshorePool[0] : jurs[0]).code, _secrecy: 0, is_offshore: 0, _offshore: false, is_nominee: false, is_ubo: true });
      let topOwnerId = uboId;
      if (P.nominee) {
        const nomId = `TS-NOM${stageId}`;
        entities.push({ id: nomId, legal_name: synthPerson(rng) + ' (nominee)', entity_type: 'person', jurisdiction: jurs[0].code, _secrecy: 0, is_offshore: 0, _offshore: false, is_nominee: true });
        // nominee owns the top shell; UBO controls the nominee (masked)
        topOwnerId = nomId;
        edges.push({ id: `TS-R${stageId}-nom`, source: uboId, target: nomId, rel_type: 'controls', ownership_pct: null });
        shells[0]._nominee_top = true;
        shells[0].is_nominee = true;
      }
      // Chain ownership: topOwner -> shell[0] -> shell[1] -> ... 
      edges.push({ id: `TS-R${stageId}-0`, source: topOwnerId, target: shells[0].id, rel_type: 'owns', ownership_pct: P.nominee ? null : 100 });
      for (let k = 0; k < shells.length - 1; k++) {
        edges.push({ id: `TS-R${stageId}-${k + 1}`, source: shells[k].id, target: shells[k + 1].id, rel_type: 'owns', ownership_pct: rng.int(70, 100) });
      }
      // Move value along the shell chain as wallet transfers (some shrinkage as fees).
      const shellWallets = shells.map((e, k) => nextWallet('wallet', `${e.legal_name} operating wallet`, { entity_id: e.id }));
      let t = clock;
      let carry = value;
      const chainTx = [];
      for (let k = 0; k < shellWallets.length - 1; k++) {
        const fee = takeShrink(carry, 0.015, 'shell management / professional fees');
        carry = round2(carry - fee);
        t += rng.int(3600, 43200) * 1000;
        chainTx.push(pushTx(shellWallets[k].id, shellWallets[k + 1].id, toMinor(carry), t));
        rec.shrink = round2(rec.shrink + fee);
      }
      value = carry;
      clock = t;
      // Screen each shell name + the UBO (and nominee) against the watchlist.
      for (const e of shells) screenSubjects.push({ name: e.legal_name, kind: 'organisation', jurisdiction: e.jurisdiction, stageId });
      screenSubjects.push({ name: uboName, kind: 'person', stageId });
      rec.artefacts.shellEntityIds = shells.map((e) => e.id);
      rec.artefacts.uboId = uboId;
      rec.artefacts.jurisdictions = [...new Set(shells.map((e) => e.jurisdiction))];
      // The bottom shell (holds the value) is the trace root: ownershipChains walks
      // UP from it through every shell to the UBO, so structureSummary sees the full
      // depth, jurisdiction spread and nominee interposition.
      rec.artefacts.rootId = shells[shells.length - 1].id;
      flowSteps.push(flowStep(stageId, block, 'layering', `Value threaded through ${P.shells} nominee-owned shells across ${rec.artefacts.jurisdictions.length} jurisdictions${P.offshore ? ' (incl. an offshore haven)' : ''}`, inValue, round2(inValue - value), shellWallets[shellWallets.length - 1].id));
      rec.inValue = inValue; rec.outValue = value;

    } else if (block.id === 'crypto_peel') {
      if (value == null) { value = P.amountEth; injected = injected == null ? P.amountEth : injected; }
      // Convert to crypto and run the REAL peel-chain simulator over the value.
      const peelCfg = {
        seed: `${norm.seed}:${stageId}:peel`, initialValue: P.amountEth, assetSymbol: 'ETH',
        hops: P.hops, peelPercent: P.peelPercent / 100, minPeel: Math.max(0.01, P.amountEth * 0.002), feePerTx: Math.max(0.001, P.amountEth * 0.0005),
        timeIntervalSec: 900, intervalVariance: 0.5, exchangeAggregation: true,
        bridgeEvent: !!P.bridge, mixerEvent: !!P.mixer,
      };
      const peel = simulatePeelChain(peelCfg);
      // Materialise the peel hops as wallet + tx artefacts the crypto/monitoring
      // detectors can run over. The main-chain wallets + peel destinations become nodes.
      const trace = `TS-PEEL-${stageId}`;
      const mainWallets = new Map(); // addr -> wallet
      const ensureW = (addr, node_type, label) => {
        if (mainWallets.has(addr)) return mainWallets.get(addr);
        const id = `TS-CW${String(++walletSeq).padStart(3, '0')}`;
        const w = { id, address: addr, label: label || 'Peel-chain wallet', node_type, is_dormant: 0, cluster_id: trace };
        wallets.push(w); mainWallets.set(addr, w); return w;
      };
      // Exchange cash-outs converge on a SMALL POOL of shared exchange deposit
      // addresses (realistic: deposit addresses are reused), so the peels from many
      // distinct upstream peel wallets land on the same exchange nodes — which is
      // exactly what the Chain-Link exchange-convergence detector is built to catch.
      const exchangePool = [ensureW('0x' + rng.hex(20), 'exchange', 'Exchange deposit A (synthetic)'), ensureW('0x' + rng.hex(20), 'exchange', 'Exchange deposit B (synthetic)'), ensureW('0x' + rng.hex(20), 'exchange', 'Exchange deposit C (synthetic)')];
      let hopTx = [];
      let exIdx = 0;
      for (const h of peel.hops) {
        const fromW = ensureW(h.fromAddr, 'wallet', `Peel main wallet (hop ${h.hop})`);
        const toW = ensureW(h.toAddr, 'wallet', `Peel main wallet (hop ${h.hop + 1})`);
        const destType = h.peelDestType === 'exchange' ? 'exchange' : h.peelDestType === 'mixer' ? 'mixer' : h.peelDestType === 'bridge' ? 'bridge' : h.peelDestType === 'merchant' ? 'merchant' : 'wallet';
        const destW = destType === 'exchange' ? exchangePool[(exIdx++) % exchangePool.length] : ensureW(h.peelDestAddr, destType, `${destType} cash-out`);
        const tms = Date.parse(h.ts);
        // forward-hop (main chain) + peel-out (cash-out) as separate txs
        hopTx.push(pushTx(fromW.id, toW.id, Math.round(Number(h.forwarded) * MINOR), tms, { hop: h.hop, pattern: 'peel', trace_id: trace }));
        pushTx(fromW.id, destW.id, Math.round(Number(h.peel) * MINOR), tms + 1000, { hop: h.hop, pattern: 'peel', trace_id: trace });
      }
      // Plant a designated (sanctioned) cash-out address so screening trips on-chain too.
      const sancW = ensureW(SANCTIONED_WALLET, 'wallet', 'Designated cash-out address (synthetic)');
      sanctionedWalletIds.push(sancW.id);
      screenSubjects.push({ name: SANCTIONED_WALLET, kind: 'wallet', stageId });
      // The peel chain peels cash-outs + fees away; the on-chain RESIDUAL is what
      // survives layering. We express that as a SURVIVAL RATIO and apply it to the
      // carried value (whatever its unit), recording the drop as this stage's
      // shrinkage in the carried unit — so the whole-flow conservation identity
      // (injected = survived + Σshrinkage) holds across mixed units.
      const survivedEth = Number(peel.summary.residual);
      const survivalRatio = P.amountEth > 0 ? clampNum(survivedEth / P.amountEth, 0, 1) : 1;
      const carriedBefore = value;
      const carriedAfter = round2(carriedBefore * survivalRatio);
      rec.shrink = round2(carriedBefore - carriedAfter);
      value = carriedAfter > 0 ? carriedAfter : round2(carriedBefore * 0.001);
      totalShrink = round2(totalShrink + rec.shrink);
      clock = Math.max(clock, Date.parse(peel.hops.length ? peel.hops[peel.hops.length - 1].ts : new Date(clock).toISOString()));
      rec.artefacts.trace = trace;
      rec.artefacts.peelSummary = peel.summary;
      rec.artefacts.peelAlerts = peel.alerts;
      rec.artefacts.hopCount = peel.summary.hopCount;
      rec.artefacts.peelTxIds = hopTx.slice(0, 60);
      flowSteps.push(flowStep(stageId, block, 'layering', `${peel.summary.hopCount}-hop crypto peel chain${P.mixer ? ' through a mixer' : ''}${P.bridge ? ' + a bridge' : ''}; on-chain ${peel.summary.totalPeeled} ETH peeled to cash-outs (${Math.round((1 - survivalRatio) * 100)}% of value bled off in layering), ${peel.summary.residual} ETH survives`, carriedBefore, rec.shrink, sancW.id));
      rec.inValue = carriedBefore; rec.outValue = value;

    } else if (block.id === 'trade_invoice') {
      if (value == null) { value = P.fairValueK; injected = injected == null ? P.fairValueK : injected; }
      const fair = P.fairValueK;
      const invoiced = round2(fair * (1 + P.overInvoicePct / 100));
      const valueMoved = round2(invoiced - fair);
      const counterpartyName = P.counterpartySanctioned ? rng.pick(SANCTIONED_FRONTS) : synthShellName(rng);
      const inv = { id: `TS-INV${String(++invSeq).padStart(2, '0')}`, stageId, counterparty: counterpartyName, sanctioned: !!P.counterpartySanctioned, fairValueK: fair, invoicedK: invoiced, overInvoicePct: P.overInvoicePct, valueMovedK: Math.abs(valueMoved), direction: P.overInvoicePct >= 0 ? 'over-invoiced import' : 'under-invoiced export' };
      invoices.push(inv);
      screenSubjects.push({ name: counterpartyName, kind: 'organisation', stageId });
      // Value transferred by the mis-pricing is added to the laundered flow.
      value = round2(value + Math.abs(valueMoved) * 0.0); // trade leg moves value laterally; carried value unchanged, but record the moved amount
      rec.artefacts.invoice = inv;
      flowSteps.push(flowStep(stageId, block, 'layering', `Trade ${inv.direction}: ${fair}k goods invoiced at ${invoiced}k (${P.overInvoicePct}%), moving ~${Math.abs(valueMoved)}k to ${P.counterpartySanctioned ? 'a sanctioned front' : 'the counterparty'}`, inValue == null ? fair : inValue, 0, null));
      rec.inValue = inValue == null ? fair : inValue; rec.outValue = value; rec.shrink = 0;

    } else if (block.id === 'mule_network') {
      if (value == null) { value = 500; injected = injected == null ? 500 : injected; }
      // Fan value out across many mules that each forward quickly (fan-out + velocity).
      const hub = nextWallet('wallet', 'Mule-network dispersal hub (synthetic)');
      const mules = Array.from({ length: P.mules }, (_, k) => nextWallet('wallet', `Mule account ${k + 1} (synthetic)`));
      const sink = nextWallet('wallet', 'Reconsolidation wallet (synthetic)');
      let t = clock;
      const per = value / P.mules;
      const outTx = [];
      // Dispersal burst from hub (fan-out + velocity)
      for (let k = 0; k < mules.length; k++) { t += rng.int(15, 120) * 1000; outTx.push(pushTx(hub.id, mules[k].id, toMinor(per), t, { pattern: 'fan_out' })); }
      // Each mule forwards on after a short hold (fee = mule commission)
      let carry = value;
      for (let k = 0; k < mules.length; k++) {
        const fee = takeShrink(per, 0.05, 'mule commission');
        rec.shrink = round2(rec.shrink + fee);
        const t2 = t + P.holdMinutes * 60 * 1000 + rng.int(30, 300) * 1000;
        pushTx(mules[k].id, sink.id, toMinor(per - fee), t2, { pattern: 'fan_in' });
      }
      value = round2(value - rec.shrink);
      clock = t + P.holdMinutes * 60 * 1000 + 600000;
      rec.artefacts.hubWalletId = hub.id; rec.artefacts.muleWalletIds = mules.map((w) => w.id); rec.artefacts.sinkWalletId = sink.id;
      flowSteps.push(flowStep(stageId, block, 'layering', `Dispersed across ${P.mules} mules (fan-out) that each forward within ~${P.holdMinutes}m to one reconsolidation wallet`, inValue, rec.shrink, sink.id));
      rec.inValue = inValue; rec.outValue = value;

    } else if (block.id === 'real_estate') {
      if (value == null) { value = P.priceK; injected = injected == null ? P.priceK : injected; }
      const price = P.priceK;
      const mortgage = round2(price * P.mortgagePct / 100);
      const equity = round2(price - mortgage);
      const asset = {
        id: `TS-A${String(++assetSeq).padStart(2, '0')}`, stageId, label: 'Prestige residential property (synthetic)', asset_type: 'real_estate',
        gross_minor: toMinor(price), recovery_pct: P.recoveryPct, enforcement_pct: 8, timing_months: 14, currency: 'CHF', dispute_status: 'Undisputed',
        priceK: price, mortgageK: mortgage, equityK: equity, loanBack: mortgage > 0,
      };
      estateAssets.push(asset);
      rec.artefacts.asset = asset;
      // Integration consumes the carried value into the asset (equity portion).
      flowSteps.push(flowStep(stageId, block, 'integration', `Value integrated into a ${price}k property (${equity}k equity + ${mortgage}k loan-back mortgage) held via a shell`, inValue == null ? price : inValue, 0, asset.id));
      rec.inValue = inValue == null ? price : inValue; rec.outValue = value; rec.shrink = 0;

    } else if (block.id === 'operating_business') {
      if (value == null) { value = P.commingledK; injected = injected == null ? P.commingledK : injected; }
      const asset = {
        id: `TS-A${String(++assetSeq).padStart(2, '0')}`, stageId, label: 'Cash-intensive operating business (synthetic)', asset_type: 'business',
        gross_minor: toMinor(P.annualRevK + P.commingledK), recovery_pct: 55, enforcement_pct: 15, timing_months: 20, currency: 'CHF', dispute_status: 'Disputed',
        annualRevK: P.annualRevK, commingledK: P.commingledK, overDeclaredPct: round2((P.commingledK / P.annualRevK) * 100),
      };
      estateAssets.push(asset);
      rec.artefacts.asset = asset;
      flowSteps.push(flowStep(stageId, block, 'integration', `Commingled ${P.commingledK}k of illicit funds into a business declaring ${P.annualRevK}k revenue (turnover over-declared ~${asset.overDeclaredPct}%)`, inValue == null ? P.commingledK : inValue, 0, asset.id));
      rec.inValue = inValue == null ? P.commingledK : inValue; rec.outValue = value; rec.shrink = 0;
    }

    stageArtefacts.push(rec);
  }

  // ── RUN THE REAL DETECTORS over the generated artefacts ─────────────────────
  const detectorHits = runAllDetectors({ wallets, transactions, entities, edges, invoices, estateAssets, sanctionedWalletIds, screenSubjects, stageArtefacts });

  // ── Build the coverage report: reconcile each planted red-flag to a catch/gap ─
  const coverage = buildCoverage(stageArtefacts, detectorHits);

  // ── Money-flow reconciliation ──────────────────────────────────────────────
  const injectedVal = injected == null ? 0 : round2(injected);
  const survivedVal = value == null ? 0 : round2(value);
  const flow = {
    injected: injectedVal,
    survived: survivedVal,
    shrinkage: round2(totalShrink),
    // Conservation: injected ≈ survived + shrinkage (within a small tolerance, since
    // a crypto peel leg scales value by a survival ratio). Report both the identity
    // and the residual so the UI / tests can assert it.
    reconciles: Math.abs(injectedVal - (survivedVal + round2(totalShrink))) <= Math.max(0.5, injectedVal * 0.02),
    residual: round2(injectedVal - (survivedVal + round2(totalShrink))),
    tolerance: Math.max(0.5, round2(injectedVal * 0.02)),
    steps: flowSteps,
    unit: 'k units / ETH (per stage; mixed units are labelled)',
  };

  return {
    spec: { seed: norm.seed, stages: norm.stages, fallback: norm._fallback, name: spec.name || null },
    phases: PHASES.map((p) => ({ ...p })),
    stages: stageArtefacts.map((s) => summariseStage(s, coverage.byStage[s.stageId])),
    flow,
    artefacts: {
      walletCount: wallets.length, transactionCount: transactions.length,
      entityCount: entities.length, shellCount: entities.filter((e) => e.entity_type === 'company').length,
      invoiceCount: invoices.length, estateAssetCount: estateAssets.length,
      sanctionedWalletCount: sanctionedWalletIds.length,
    },
    detectors: detectorHits.report,
    coverage: {
      score: coverage.score,
      band: coverageBand(coverage.score),
      caughtFlags: coverage.caught, totalFlags: coverage.total, gapFlags: coverage.gaps,
      byPhase: coverage.byPhase,
      gaps: coverage.gapList,
    },
    disclaimer: TYPOLOGY_STUDIO_DISCLAIMER,
  };
}

// A money-flow narrative step.
function flowStep(stageId, block, phase, narrative, amountIn, shrink, toId) {
  return {
    stageId, phase, blockId: block.id, label: block.label,
    narrative, amountIn: amountIn == null ? null : round2(amountIn),
    shrink: round2(shrink || 0), amountOut: amountIn == null ? null : round2(amountIn - (shrink || 0)),
    toRef: toId || null, color: (PHASE_BY_CODE[phase] || {}).color || '#888',
  };
}

// Trim a stage record to the shape the API / UI consumes (drops bulky internals but
// keeps the coverage verdict + key artefact counts + red-flag reconciliation).
function summariseStage(rec, cov) {
  return {
    stageId: rec.stageId, order: rec.order, blockId: rec.blockId, phase: rec.phase, label: rec.label, method: rec.method,
    params: rec.params, inValue: rec.inValue, outValue: rec.outValue, shrink: round2(rec.shrink),
    artefacts: publicArtefacts(rec),
    redFlags: (cov ? cov.flags : []).map((f) => ({ id: f.id, title: f.title, caught: f.caught, inherentGap: !!f.inherentGap, detector: f.detector, detectorLabel: f.detectorLabel, route: f.route, explanation: f.explanation })),
    caught: cov ? cov.caught : 0, planted: cov ? cov.flags.length : rec.redFlags.length,
    coveragePct: cov ? cov.pct : 0,
  };
}
function publicArtefacts(rec) {
  const a = rec.artefacts || {};
  const out = {};
  if (a.deposits != null) out.deposits = a.deposits;
  if (a.thresholdK != null) out.thresholdK = a.thresholdK;
  if (a.smurfWalletIds) out.smurfs = a.smurfWalletIds.length;
  if (a.feederWalletIds) out.feeders = a.feederWalletIds.length;
  if (a.shellEntityIds) out.shells = a.shellEntityIds.length;
  if (a.jurisdictions) out.jurisdictions = a.jurisdictions;
  if (a.hopCount != null) out.hops = a.hopCount;
  if (a.peelSummary) out.peel = { hops: a.peelSummary.hopCount, peeled: a.peelSummary.totalPeeled, residual: a.peelSummary.residual, exchangeDeposits: a.peelSummary.exchangeDestinations };
  if (a.invoice) out.invoice = { fairValueK: a.invoice.fairValueK, invoicedK: a.invoice.invoicedK, overInvoicePct: a.invoice.overInvoicePct, valueMovedK: a.invoice.valueMovedK, counterparty: a.invoice.counterparty, sanctioned: a.invoice.sanctioned, direction: a.invoice.direction };
  if (a.muleWalletIds) out.mules = a.muleWalletIds.length;
  if (a.asset) out.asset = { label: a.asset.label, type: a.asset.asset_type, priceK: a.asset.priceK, mortgageK: a.asset.mortgageK, equityK: a.asset.equityK, annualRevK: a.asset.annualRevK, commingledK: a.asset.commingledK, recoveryPct: a.asset.recovery_pct };
  return out;
}

// ── Detector orchestration: run every REAL FRIS detector, return firing map ──
function runAllDetectors(ctx) {
  const { wallets, transactions, entities, edges, invoices, estateAssets, sanctionedWalletIds, screenSubjects, stageArtefacts } = ctx;
  /** @type {Record<string, {fired:boolean, count:number, detail:string, alerts?:any[]}>} */
  const fired = {};
  const mark = (key, count, detail, alerts) => {
    const ex = fired[key];
    if (!ex) fired[key] = { fired: count > 0, count, detail, alerts: alerts || [] };
    else { ex.count += count; ex.fired = ex.fired || count > 0; if (count > 0 && detail) ex.detail = detail; }
  };

  // 1) Transaction Monitoring & SAR typology rules (the real engine).
  let monitoring = { alerts: [], summary: { byRule: {} } };
  try {
    // Build structure summaries for jurisdiction-hopping from generated shell chains.
    const summaries = [];
    for (const rec of stageArtefacts) {
      if (rec.blockId === 'shell_layering' && rec.artefacts.rootId) {
        try {
          const s = structureSummary(entities, edges, rec.artefacts.rootId);
          summaries.push({ id: rec.artefacts.rootId, name: 'Shell chain ' + rec.stageId, jurisdictions: s.jurisdictions, maxSecrecy: s.maxSecrecy, offshore: s.offshore > 0, depth: s.depth });
          rec._structure = s;
        } catch { /* ignore */ }
      }
    }
    monitoring = runMonitoring({ transactions, wallets, entitySummaries: summaries, sanctionedIds: sanctionedWalletIds.slice() });
  } catch (e) { /* ignore */ }
  const byRule = monitoring.summary.byRule || {};
  mark('structuring', byRule.structuring || 0, `${byRule.structuring || 0} structuring alert(s) on the sub-threshold deposit runs.`, monitoring.alerts.filter((a) => a.ruleId === 'structuring'));
  mark('funnel_fan_in', byRule.fan_in || 0, `${byRule.fan_in || 0} fan-in / funnel alert(s) on the collection account(s).`, monitoring.alerts.filter((a) => a.ruleId === 'fan_in'));
  mark('rapid_movement', byRule.rapid_movement || 0, `${byRule.rapid_movement || 0} rapid in-out (velocity) alert(s) on the pass-through burst(s).`, monitoring.alerts.filter((a) => a.ruleId === 'rapid_movement'));
  mark('layering_peel', byRule.layering_peel || 0, `${byRule.layering_peel || 0} layering (peel-chain) alert(s) on the on-chain trace(s).`, monitoring.alerts.filter((a) => a.ruleId === 'layering_peel'));
  mark('high_risk_counterparty', byRule.high_risk_counterparty || 0, `${byRule.high_risk_counterparty || 0} high-risk-counterparty alert(s) (mixer / sanctioned / bridge exposure).`, monitoring.alerts.filter((a) => a.ruleId === 'high_risk_counterparty'));
  mark('jurisdiction_hopping', byRule.jurisdiction_hopping || 0, `${byRule.jurisdiction_hopping || 0} jurisdiction-hopping alert(s) on the shell control chain(s).`, monitoring.alerts.filter((a) => a.ruleId === 'jurisdiction_hopping'));

  // 2) Chain-Link transaction-forensics battery (the real crypto engine).
  let crypto = [];
  try { crypto = runDetections({ wallets, transactions }); } catch { crypto = []; }
  const cByType = {};
  for (const a of crypto) cByType[a.type] = (cByType[a.type] || 0) + 1;
  const peelBatteryCount = (cByType.velocity_anomaly || 0) + (cByType.exchange_convergence || 0) + (cByType.fan_out || 0) + (cByType.fan_in || 0);
  mark('peel_chain_crypto', peelBatteryCount, `Chain-Link battery fired: ${cByType.velocity_anomaly || 0} velocity, ${cByType.exchange_convergence || 0} convergence, ${cByType.fan_out || 0} fan-out, ${cByType.fan_in || 0} fan-in.`, crypto.filter((a) => ['velocity_anomaly', 'exchange_convergence', 'fan_out', 'fan_in'].includes(a.type)));
  mark('mixer_proximity', (cByType.mixer_proximity || 0) + (cByType.bridge_usage || 0), `${cByType.mixer_proximity || 0} mixer-proximity + ${cByType.bridge_usage || 0} bridge-usage alert(s).`, crypto.filter((a) => ['mixer_proximity', 'bridge_usage'].includes(a.type)));

  // 3) Sanctions / watchlist screening (the real screening engine).
  let screenHits = 0; const screenDetail = [];
  const screenAlerts = [];
  for (const s of screenSubjects) {
    try {
      const r = screen(s.kind === 'wallet' ? s.name : { name: s.name, kindHint: s.kind }, undefined, { minScore: 60, limit: 3 });
      const top = r.matches && r.matches[0];
      if (top && (top.band === 'strong' || top.band === 'possible')) {
        screenHits++;
        screenAlerts.push({ query: s.name, matchedName: top.entryName || top.name, list: top.list, band: top.band, score: top.score, stageId: s.stageId });
        screenDetail.push(`"${s.name}" → ${top.list} (${top.band})`);
      }
    } catch { /* ignore */ }
  }
  mark('screening', screenHits, screenHits ? `${screenHits} synthetic watchlist hit(s): ${screenDetail.slice(0, 3).join('; ')}.` : 'No watchlist match on any generated subject.', screenAlerts);

  // 4) Ownership-structure opacity (the real graph engine), per shell chain.
  let opaqueChains = 0; const opacityDetail = [];
  const opacityAlerts = [];
  for (const rec of stageArtefacts) {
    if (rec.blockId !== 'shell_layering') continue;
    const s = rec._structure;
    if (!s) continue;
    const opaque = s.incomplete || s.nominee || s.circular || s.depth >= 3;
    if (opaque) {
      opaqueChains++;
      opacityDetail.push(`${rec.stageId}: depth ${s.depth}, ${s.jurisdictions} jurisdictions${s.nominee ? ', nominee' : ''}${s.unknownChainPct ? ', unknown UBO %' : ''}`);
      opacityAlerts.push({ stageId: rec.stageId, depth: s.depth, jurisdictions: s.jurisdictions, nominee: s.nominee, incomplete: s.incomplete });
    }
  }
  mark('ownership_opacity', opaqueChains, opaqueChains ? `${opaqueChains} opaque ownership structure(s): ${opacityDetail.join('; ')}.` : 'No opaque ownership structure generated.', opacityAlerts);

  // 5) Trade over/under-invoicing analytic (Studio-native, deterministic).
  let mispriced = 0; const priceDetail = [];
  const priceAlerts = [];
  for (const inv of invoices) {
    const flagged = invoicePricing(inv);
    if (flagged.flagged) { mispriced++; priceDetail.push(`${inv.direction} ${inv.overInvoicePct}% (${flagged.severity})`); priceAlerts.push(flagged); }
  }
  mark('trade_mispricing', mispriced, mispriced ? `${mispriced} mis-priced trade invoice(s): ${priceDetail.join('; ')}.` : 'No trade invoice exceeded the fair-value tolerance.', priceAlerts);

  // 6) Estate / waterfall recoverability (the real waterfall engine) over integration.
  let integrated = 0; const estateDetail = [];
  const estateAlerts = [];
  for (const asset of estateAssets) {
    try {
      const wf = computeWaterfall({ currency: asset.currency, assets: [asset], creditors: [{ id: 'C1', class: 'unsecured', claim_minor: asset.gross_minor, currency: asset.currency, admitted_pct: 100 }] }, {});
      integrated++;
      const recPct = wf.assets && wf.assets[0] ? wf.assets[0].recoveryPct : asset.recovery_pct;
      estateDetail.push(`${asset.label}: ${recPct}% realisable`);
      estateAlerts.push({ assetId: asset.id, label: asset.label, recoveryPct: recPct, netRealisableMinor: wf.netRealisable ? String(wf.netRealisable) : null });
    } catch { /* ignore */ }
  }
  mark('estate_integration', integrated, integrated ? `Waterfall run over ${integrated} integrated asset(s): ${estateDetail.join('; ')}.` : 'No integration asset to run the waterfall over.', estateAlerts);

  // Build the flat detector report (directory of every detector, whether it fired here).
  const report = DETECTORS.map((d) => {
    const f = fired[d.key] || { fired: false, count: 0, detail: 'Not exercised by this scenario.', alerts: [] };
    return { key: d.key, label: d.label, module: d.module, route: d.route, blurb: d.blurb, fired: f.fired, count: f.count, detail: f.detail, alertCount: (f.alerts || []).length };
  });
  return { fired, report, monitoring, crypto };
}

/**
 * Trade over/under-invoicing analytic — the Studio's own deterministic detector.
 * Flags an invoice whose price deviates from fair-market value beyond a tolerance
 * band (the classic trade-based ML signal). Pure.
 */
export function invoicePricing(inv, tolerancePct = 15) {
  const dev = Number(inv.overInvoicePct) || 0;
  const absDev = Math.abs(dev);
  const flagged = absDev > tolerancePct;
  const severity = absDev >= 100 ? 'High' : absDev >= 40 ? 'Medium' : flagged ? 'Low' : 'None';
  return {
    invoiceId: inv.id, direction: inv.direction, fairValueK: inv.fairValueK, invoicedK: inv.invoicedK,
    deviationPct: dev, tolerancePct, flagged, severity, valueMovedK: inv.valueMovedK,
    reason: flagged ? `Invoice price deviates ${dev}% from fair value (tolerance ±${tolerancePct}%) — value transferred inside a ${inv.direction}.` : `Invoice price within ±${tolerancePct}% of fair value.`,
  };
}

// ── Coverage reconciliation: each planted red-flag → caught (by detector) or gap ─
function buildCoverage(stageArtefacts, detectorHits) {
  const fired = detectorHits.fired;
  const byStage = {}; const byPhase = {};
  let caught = 0, total = 0; const gapList = [];
  for (const rec of stageArtefacts) {
    const flags = [];
    for (const fid of rec.redFlags) {
      const meta = RED_FLAG_META[fid] || { title: fid, detector: null };
      const det = meta.detector ? DETECTOR_BY_KEY[meta.detector] : null;
      const hit = meta.detector ? fired[meta.detector] : null;
      const isCaught = !!(hit && hit.fired);
      total++;
      if (isCaught) caught++;
      const flag = {
        id: fid, title: meta.title, caught: isCaught,
        detector: meta.detector, detectorLabel: det ? det.label : null, route: det ? det.route : null,
        inherentGap: !meta.detector,
        explanation: isCaught
          ? `Caught by ${det ? det.label : meta.detector}: ${hit.detail}`
          : (meta.inherentGap
            ? `INHERENT GAP — ${meta.inherentGap}`
            : `GAP — no ${det ? det.label : meta.detector || 'detector'} fired for this planted red-flag in this scenario.`),
      };
      flags.push(flag);
      if (!isCaught) gapList.push({ stageId: rec.stageId, phase: rec.phase, label: rec.label, flag: meta.title, detector: det ? det.label : (meta.detector || 'none (inherent gap)'), inherent: !meta.detector, why: flag.explanation });
      byPhase[rec.phase] = byPhase[rec.phase] || { caught: 0, total: 0 };
      byPhase[rec.phase].total++; if (isCaught) byPhase[rec.phase].caught++;
    }
    const c = flags.filter((f) => f.caught).length;
    byStage[rec.stageId] = { flags, caught: c, pct: flags.length ? Math.round((c / flags.length) * 100) : 0 };
  }
  const score = total ? Math.round((caught / total) * 100) : 0;
  const byPhaseArr = PHASES.map((p) => ({ phase: p.code, label: p.label, color: p.color, caught: (byPhase[p.code] || {}).caught || 0, total: (byPhase[p.code] || {}).total || 0, pct: (byPhase[p.code] && byPhase[p.code].total) ? Math.round((byPhase[p.code].caught / byPhase[p.code].total) * 100) : 0 }));
  return { byStage, score, caught, total, gaps: total - caught, gapList, byPhase: byPhaseArr };
}

function coverageBand(score) {
  if (score >= 80) return 'Strong';
  if (score >= 55) return 'Partial';
  if (score >= 30) return 'Weak';
  return 'Minimal';
}

export default { catalogue, presetScenario, simulate, normaliseSpec, invoicePricing };
