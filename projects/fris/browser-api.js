// FRIS browser-only API — reimplements the server's JSON API entirely in the
// browser, over an in-memory dataset (data.json) and the SAME pure engines used
// by the Node server. It patches window.fetch so the existing UI runs unchanged
// with no backend. Writes (notes, flags, findings, simulations) mutate the
// in-memory store for the session; "Reset" restores the original data.
import { computeFlightRisk } from './engines/flightRisk.mjs';
import { shortestPath, ownershipChains, structureSummary, neighbourhood, traceToUBO } from './engines/graph.mjs';
import { simulatePeelChain } from './engines/peelingChain.mjs';
import { runDetections, scoreTransaction, peelChainRiskIndicators } from './engines/cryptoDetect.mjs';
import { computeWaterfall, DEFAULT_PRIORITY_ORDER, CLASS_LABELS } from './engines/waterfall.mjs';
import { ingest } from './engines/parsers.mjs';
import { compareTexts, rankRegulations } from './engines/compare.mjs';
import { analyze as analyzeCompliance } from './engines/complianceAdvisor.mjs';
import { JURISDICTIONS as KB_JURISDICTIONS, SIZE_BANDS as KB_SIZE_BANDS, ROLES as KB_ROLES, TOPICS as KB_TOPICS, FRAMEWORKS as KB_FRAMEWORKS, TRIAGE_VERDICTS as KB_TRIAGE_VERDICTS, DISCLAIMER as KB_DISCLAIMER, KB_VERSION } from './data/complianceKB.mjs';
import { screen as runScreening, screenBatch, deriveScreeningOverlay, LIST_TYPES as WL_LIST_TYPES, BANDS as WL_BANDS, WATCHLIST_ENTRIES, SCREENING_DISCLAIMER, WATCHLIST_VERSION } from './engines/screening.mjs';
import { runMonitoring, buildSAR, RULES_META, RULE_META_BY_ID, RULE_IDS, STATUSES as MON_STATUSES, MONITORING_DISCLAIMER } from './engines/monitoring.mjs';
import { computeImpact, daysUntil } from './engines/impact.mjs';
import { listQuarters as listFinancialQuarters, computeReport as computeFinancialReport } from './engines/financials.mjs';
import { scoreVendor as scoreVendorRisk, scoreAll as scoreAllVendors, RATING_BANDS as VENDOR_RATING_BANDS, DEFAULT_AS_OF as VENDOR_AS_OF } from './engines/vendorRisk.mjs';
import { VENDOR_BY_ID, VENDOR_CATEGORIES, CONTRACT_STATUSES, VENDOR_DISCLAIMER, VENDOR_VERSION } from './data/vendors.mjs';
import { classify as classifyAdverse, feed as adverseFeed, subjectProfile as adverseSubjectProfile, DEFAULT_AS_OF as AM_AS_OF, AM_CATEGORIES, AM_SEVERITIES, ADVERSE_MEDIA_BY_ID, ADVERSE_MEDIA_DISCLAIMER } from './engines/adverseMedia.mjs';
import { jurisdictionRisk as countryJurisdictionRisk, matrix as countryMatrix, sectorRisk as countrySectorRisk, combined as countryCombined, SECTOR_BY_CODE as COUNTRY_SECTOR_BY_CODE, COUNTRY_BY_CODE as COUNTRY_RISK_BY_CODE, COUNTRY_RISK_DISCLAIMER } from './engines/countryRisk.mjs';
import { listActions as enfListActions, getAction as enfGetAction, analytics as enfAnalytics, trends as enfTrends, ENF_SORT_KEYS, ENF_CATEGORY_BY_CODE as ENF_CAT_BY_CODE, ENFORCEMENT_DISCLAIMER } from './engines/enforcement.mjs';
import { alerts as survAlerts, alert as survAlert, orderBook as survOrderBook, insiderList as survInsiderList, ALERT_TYPE_BY_CODE as SURV_TYPE_BY_CODE, SEVERITY_BY_CODE as SURV_SEV_BY_CODE, INSTRUMENT_BY_SYMBOL as SURV_INSTRUMENT_BY_SYMBOL } from './engines/surveillance.mjs';
import { register as grcRegister, obligation as grcObligation, postureMatrix as grcPostureMatrix, gaps as grcGaps, owners as grcOwners, summary as grcSummary, GRC_FRAMEWORK_BY_CODE as GRC_FW_BY_CODE, CONTROL_STATUS_BY_CODE as GRC_STATUS_BY_CODE } from './engines/grc.mjs';
import { targets as recoveryTargets, traceAssets as recoveryTrace, recoverySummary as recoverySummaryFn, assetsByRecoverability as recoveryAssets, BAND_BY_CODE as RECOVERY_BAND_BY_CODE } from './engines/assetTracing.mjs';
import { applicants as onboardingApplicants, assess as onboardingAssess, queue as onboardingQueue, summary as onboardingSummary, RATING_BANDS as ONBOARDING_RATING_BANDS, STAGES as ONBOARDING_STAGES, DEFAULT_AS_OF as ONBOARDING_AS_OF, ONBOARDING_DISCLAIMER } from './engines/onboarding.mjs';
import { catalogue as typologyCatalogue, presetScenario as typologyPreset, simulate as typologySimulate } from './engines/typologyStudio.mjs';
import { MAX_STAGES as TYPOLOGY_MAX_STAGES } from './data/typologyStudio.mjs';

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const now = () => new Date().toISOString();
const clone = (x) => JSON.parse(JSON.stringify(x));
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const asInt = (v, d, lo = -1e15, hi = 1e15) => { const n = parseInt(v, 10); return Number.isNaN(n) ? d : clamp(n, lo, hi); };
const asNum = (v, d, lo = -1e15, hi = 1e15) => { const n = Number(v); return Number.isFinite(n) ? clamp(n, lo, hi) : d; };
const enumOf = (v, allowed, d) => (allowed.includes(v) ? v : d);
const like = (hay, needle) => String(hay ?? '').toLowerCase().includes(String(needle).toLowerCase());

let RAW = null, DB = null;
export async function loadData() {
  if (typeof window !== 'undefined' && window.__FRIS_DATA__) { RAW = window.__FRIS_DATA__; }
  else {
    try { RAW = await (await fetch('./data.json')).json(); }
    catch (e) {
      if (typeof document !== 'undefined') { const app = document.getElementById('app'); if (app) app.innerHTML = '<div style="max-width:640px;margin:12vh auto;padding:2rem;color:#e7edf5;font-family:system-ui;text-align:center"><h2 style="color:#4d8df0">Open the single-file version</h2><p style="color:#aab6c8">This multi-file build must be served over http. For a no-server preview, open <b>FRIS-Standalone.html</b> in this same folder, or run the included launcher.</p></div>'; }
      throw e;
    }
  }
  DB = clone(RAW);
}
const T = (name) => DB[name] || [];
const byId = (name, id) => T(name).find((r) => r.id === id);
const nowSeq = { v: Date.now() };
const uid = (p) => `${p}-${(nowSeq.v++).toString(36)}`;

function audit(action, module, tt, tid, summary, detail) {
  T('audit_log').unshift({ id: nowSeq.v++, ts: now(), actor: 'demo.analyst', action, module, target_type: tt, target_id: tid, summary, detail_json: detail ? JSON.stringify(detail) : null });
}
function parseJsonFields(row, fields) { if (!row) return row; for (const f of fields) { if (row[f] != null) { try { row[f.replace(/_json$/, '')] = JSON.parse(row[f]); } catch { row[f.replace(/_json$/, '')] = null; } } } return row; }
function toCsv(rows, headers) { const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }; const head = (headers || (rows[0] ? Object.keys(rows[0]) : [])); return [head.map(esc).join(','), ...rows.map((r) => head.map((h) => esc(r[h])).join(','))].join('\n'); }
function paginate(rows, query, sortKeys, defaultSort, dir0 = 'asc') {
  const limit = asInt(query.limit, 50, 1, 1000), offset = asInt(query.offset, 0, 0);
  const sort = enumOf(query.sort, sortKeys, defaultSort), dir = enumOf(query.dir, ['asc', 'desc'], dir0);
  const sorted = rows.slice().sort((a, b) => { const av = a[sort], bv = b[sort]; const n = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av ?? '').localeCompare(String(bv ?? '')); return dir === 'asc' ? n : -n; });
  return { total: rows.length, limit, offset, rows: sorted.slice(offset, offset + limit) };
}

const JMAP = () => Object.fromEntries(T('jurisdictions').map((j) => [j.code, j]));
function fullGraph() {
  const js = JMAP();
  const nodes = T('entities').map((e) => ({ ...e, is_offshore: js[e.jurisdiction]?.is_offshore ? 1 : 0, _offshore: !!js[e.jurisdiction]?.is_offshore, _secrecy: js[e.jurisdiction]?.secrecy_score ?? 0 }));
  const edges = T('relationships').map((r) => ({ id: r.id, source: r.source_id, target: r.target_id, rel_type: r.rel_type, ownership_pct: r.ownership_pct, is_circular: r.is_circular }));
  return { nodes, edges, js };
}
const cleanNode = (n) => ({ id: n.id, label: n.legal_name, type: n.entity_type, jurisdiction: n.jurisdiction, risk: n.risk_flag, is_ubo: n.is_ubo, is_nominee: n.is_nominee, is_dormant: n.is_dormant, is_offshore: n.is_offshore ? 1 : 0, secrecy: n._secrecy ?? null, status: n.status });
const flightInput = (s, offshore, entity = {}) => ({ ownershipLayerDepth: s.depth, jurisdictionCount: s.jurisdictions, maxSecrecyScore: s.maxSecrecy, nomineeInvolved: s.nominee, dormantIntermediaries: s.dormant, circularOwnership: s.circular, offshoreConcentration: s.offshore, highRiskLegalForm: offshore, incompleteOwnershipData: s.incomplete != null ? !!s.incomplete : !!entity.incomplete_ownership, recentControlChanges: Number(entity.control_changes_12m) || 0, unexplainedTransfers: Number(entity.unexplained_transfers) || 0 });
const todayISO = () => new Date().toISOString().slice(0, 10);

// ── Router ──────────────────────────────────────────────────────────────────
const routes = [];
const add = (m, p, h) => routes.push({ m, parts: p.split('/').filter(Boolean), h });

export function handle(method, pathname, query = {}, body = {}) {
  const segs = pathname.split('/').filter(Boolean);
  for (const r of routes) {
    if (r.m !== method || r.parts.length !== segs.length) continue;
    const params = {}; let ok = true;
    for (let i = 0; i < r.parts.length; i++) { const p = r.parts[i]; if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(segs[i]); else if (p !== segs[i]) { ok = false; break; } }
    if (!ok) continue;
    return r.h({ params, query, body });
  }
  throw new HttpError(404, `unknown endpoint: ${method} ${pathname}`);
}

add('GET', 'api/health', () => ({ ok: true, ts: now(), mode: 'browser' }));

add('GET', 'api/overview', () => {
  const ents = T('entities');
  const alerts = runDetections({ wallets: T('wallets'), transactions: T('crypto_transactions') });
  const group = (arr, key) => { const m = {}; for (const r of arr) { const k = r[key]; if (k == null) continue; m[k] = (m[k] || 0) + 1; } return m; };
  const rb = group(ents.filter((e) => e.risk_flag), 'risk_flag');
  const ib = group(T('regulatory_instruments'), 'impact_level');
  return {
    modules: {
      nexus: { entities: ents.length, highRisk: ents.filter((e) => e.risk_flag === 'High').length, jurisdictions: T('jurisdictions').length },
      chainlink: { wallets: T('wallets').length, transactions: T('crypto_transactions').length, alerts: alerts.length },
      waterfall: { cases: T('insolvency_cases').length, scenarios: T('scenarios').length, creditors: T('creditors').length },
      regulatory: { instruments: T('regulatory_instruments').length, highImpact: T('regulatory_instruments').filter((r) => r.impact_level === 'High').length, upcoming: T('regulatory_instruments').filter((r) => r.effective_date >= todayISO()).length, openFindings: T('comparison_findings').filter((f) => f.analyst_status === 'Requires Review').length },
    },
    riskByBand: Object.entries(rb).map(([band, n]) => ({ band, n })),
    impactByLevel: Object.entries(ib).map(([level, n]) => ({ level, n })),
    topEntities: ents.filter((e) => e.risk_flag === 'High').slice(0, 6).map((e) => ({ id: e.id, legal_name: e.legal_name, jurisdiction: e.jurisdiction, risk_flag: e.risk_flag })),
    recentAudit: T('audit_log').slice(0, 8).map((a) => ({ ts: a.ts, action: a.action, module: a.module, summary: a.summary })),
    alertsPreview: alerts.slice(0, 6),
  };
});

add('GET', 'api/data/stats', () => {
  const tables = Object.keys(DB).sort().map((t) => ({ table: t, rows: T(t).length }));
  const cls = {}; for (const e of T('entities')) cls[e.data_classification] = (cls[e.data_classification] || 0) + 1;
  return { tables, classifications: Object.entries(cls).map(([c, n]) => ({ c, n })), settings: T('settings'), seededAt: (T('settings').find((s) => s.key === 'seeded_at') || {}).value };
});

add('GET', 'api/jurisdictions', () => ({ rows: T('jurisdictions').map((j) => ({ ...j, entity_count: T('entities').filter((e) => e.jurisdiction === j.code).length, high_risk: T('entities').filter((e) => e.jurisdiction === j.code && e.risk_flag === 'High').length })).sort((a, b) => a.name.localeCompare(b.name)) }));

add('GET', 'api/entities', ({ query }) => {
  let rows = T('entities');
  if (query.type) rows = rows.filter((e) => e.entity_type === query.type);
  if (query.juris) rows = rows.filter((e) => e.jurisdiction === query.juris);
  if (query.risk) rows = rows.filter((e) => e.risk_flag === query.risk);
  if (query.q) rows = rows.filter((e) => like(e.legal_name, query.q));
  return paginate(rows, query, ['legal_name', 'entity_type', 'jurisdiction', 'risk_flag', 'incorporation_date'], 'legal_name');
});

add('GET', 'api/entities/:id', ({ params }) => {
  const e = byId('entities', params.id); if (!e) throw new HttpError(404, 'entity not found');
  const rels = T('relationships');
  const out = rels.filter((r) => r.source_id === params.id).map((r) => ({ ...r, target_name: (byId('entities', r.target_id) || {}).legal_name, target_type: (byId('entities', r.target_id) || {}).entity_type }));
  const inn = rels.filter((r) => r.target_id === params.id).map((r) => ({ ...r, source_name: (byId('entities', r.source_id) || {}).legal_name, source_type: (byId('entities', r.source_id) || {}).entity_type }));
  const { nodes, edges, js } = fullGraph();
  const summary = structureSummary(nodes, edges, params.id);
  const flightRisk = computeFlightRisk(flightInput(summary, !!js[e.jurisdiction]?.is_offshore, e));
  const chains = ownershipChains(nodes, edges, params.id).slice(0, 25);
  return { entity: e, out, in: inn, assets: T('entity_assets').filter((a) => a.owner_id === params.id), evidence: T('evidence').filter((v) => v.entity_id === params.id), notes: T('notes').filter((n) => n.target_type === 'entity' && n.target_id === params.id), tags: T('tags').filter((t) => t.target_type === 'entity' && t.target_id === params.id).map((t) => t.label), flightRisk, ownershipChains: chains, structure: summary, bookmarked: !!T('bookmarks').find((b) => b.target_type === 'entity' && b.target_id === params.id) , screening: screeningLinkFor({ name: e.legal_name, kindHint: e.entity_type === 'person' ? 'person' : 'organisation' }) };
});

add('GET', 'api/graph', ({ query }) => {
  let { nodes, edges } = fullGraph();
  if (query.types) { const set = new Set(query.types.split(',')); nodes = nodes.filter((n) => set.has(n.entity_type)); }
  if (query.risk) nodes = nodes.filter((n) => n.risk_flag === query.risk);
  let ids = new Set(nodes.map((n) => n.id));
  if (query.focus) { const near = neighbourhood(edges, query.focus, asInt(query.depth, 2, 1, 4)); ids = new Set([...ids].filter((x) => near.has(x))); }
  let e2 = edges.filter((e) => ids.has(e.source) && ids.has(e.target));
  if (query.rel) { const rset = new Set(query.rel.split(',')); e2 = e2.filter((e) => rset.has(e.rel_type)); }
  const n2 = nodes.filter((n) => ids.has(n.id));
  return { nodes: n2.map(cleanNode), edges: e2, focus: query.focus || null, counts: { nodes: n2.length, edges: e2.length } };
});

add('GET', 'api/graph/path', ({ query }) => {
  if (!query.from || !query.to) throw new HttpError(400, 'from and to required');
  const path = shortestPath(fullGraph().edges, query.from, query.to);
  return { from: query.from, to: query.to, path, length: path ? path.length - 1 : null };
});

add('GET', 'api/graph/ubo', ({ query }) => {
  if (!query.id) throw new HttpError(400, 'id required');
  const { nodes, edges } = fullGraph();
  const nameById = new Map(nodes.map((n) => [n.id, n.legal_name]));
  const t = traceToUBO(nodes, edges, query.id);
  const ubos = t.ubos.map((uidx) => {
    const best = t.chains.filter((c) => c.ultimate === uidx).reduce((m, c) => (m == null || (c.effectivePct ?? -1) > (m.effectivePct ?? -1) ? c : m), null);
    return { id: uidx, name: nameById.get(uidx) || uidx, effectivePct: best ? best.effectivePct : null };
  });
  return { id: query.id, ubos, nodeIds: t.nodeIds, edgeIds: t.edgeIds, circular: t.circular, chains: t.chains };
});

add('GET', 'api/wallets', ({ query }) => {
  let rows = T('wallets');
  if (query.type) rows = rows.filter((w) => w.node_type === query.type);
  if (query.risk) rows = rows.filter((w) => w.risk_category === query.risk);
  if (query.q) rows = rows.filter((w) => like(w.address, query.q) || like(w.label, query.q));
  return paginate(rows, query, ['id', 'node_type', 'risk_category', 'balance_minor'], 'node_type');
});

add('GET', 'api/wallets/:id', ({ params }) => {
  const w = byId('wallets', params.id); if (!w) throw new HttpError(404, 'wallet not found');
  const tx = T('crypto_transactions');
  return { wallet: w, out: tx.filter((t) => t.from_id === params.id).slice(0, 200), in: tx.filter((t) => t.to_id === params.id).slice(0, 200), notes: T('notes').filter((n) => n.target_type === 'wallet' && n.target_id === params.id) , screening: screeningLinkFor({ name: w.label || w.address, kindHint: 'wallet' }) };
});

add('GET', 'api/transactions', ({ query }) => {
  let rows = T('crypto_transactions');
  if (query.trace) rows = rows.filter((t) => t.trace_id === query.trace);
  if (query.pattern) rows = rows.filter((t) => t.pattern === query.pattern);
  if (query.risk === 'High') rows = rows.filter((t) => t.risk_score >= 66); else if (query.risk === 'Medium') rows = rows.filter((t) => t.risk_score >= 33 && t.risk_score < 66); else if (query.risk === 'Low') rows = rows.filter((t) => t.risk_score < 33);
  if (query.minAmount) rows = rows.filter((t) => t.amount_minor >= asNum(query.minAmount, 0) * 1e8);
  return paginate(rows, query, ['ts', 'amount_minor', 'hop', 'risk_score'], 'ts');
});

add('GET', 'api/transactions/:id', ({ params }) => { const t = byId('crypto_transactions', params.id); if (!t) throw new HttpError(404, 'transaction not found'); return { transaction: { ...t, from: byId('wallets', t.from_id), to: byId('wallets', t.to_id) } }; });

add('GET', 'api/crypto/graph', ({ query }) => {
  const tx = query.trace ? T('crypto_transactions').filter((t) => t.trace_id === query.trace).sort((a, b) => (a.hop || 0) - (b.hop || 0)) : T('crypto_transactions').slice(0, asInt(query.limit, 300, 10, 800));
  const ids = new Set(); for (const t of tx) { ids.add(t.from_id); ids.add(t.to_id); }
  const wallets = T('wallets').filter((w) => ids.has(w.id));
  return { nodes: wallets.map((w) => ({ id: w.id, label: w.label || w.id, type: w.node_type, risk: w.risk_category, cluster: w.cluster_id, dormant: w.is_dormant })), edges: tx.map((t) => ({ id: t.id, source: t.from_id, target: t.to_id, amount: t.amount_minor, pattern: t.pattern, hop: t.hop, risk: t.risk_score })) };
});

add('GET', 'api/crypto/alerts', () => { const alerts = runDetections({ wallets: T('wallets'), transactions: T('crypto_transactions') }); return { total: alerts.length, alerts: alerts.slice(0, 200) }; });
add('GET', 'api/traces', () => ({ rows: T('traces') }));

add('GET', 'api/crypto/risk-preview', ({ query }) => {
  const truthy = (v, def) => (v === undefined ? def : !(v === 'false' || v === '0' || v === false));
  const cfg = {
    hops: asInt(query.hops, 55, 1, 500),
    peelPercent: asNum(query.peelPercent, 0.07, 0.001, 0.9),
    exchangeAggregation: truthy(query.exchangeAggregation, false),
    bridgeEvent: truthy(query.bridgeEvent, true),
    mixerEvent: truthy(query.mixerEvent, true),
  };
  const indicators = peelChainRiskIndicators(cfg);
  return { config: cfg, indicators, present: indicators.filter((i) => i.present).length };
});

add('POST', 'api/crypto/simulate', ({ body }) => {
  const cfg = { seed: asNum(body.seed, 20260701), initialValue: asNum(body.initialValue, 500, 0.01, 1e7), assetSymbol: enumOf(body.assetSymbol, ['ETH', 'BTC', 'USDT', 'USDC', 'XMR'], 'ETH'), hops: asInt(body.hops, 55, 1, 500), peelPercent: asNum(body.peelPercent, 0.07, 0.001, 0.9), minPeel: asNum(body.minPeel, 0.4, 0), feePerTx: asNum(body.feePerTx, 0.002, 0), timeIntervalSec: asNum(body.timeIntervalSec, 900, 1), intervalVariance: asNum(body.intervalVariance, 0.4, 0, 1), exchangeAggregation: !!body.exchangeAggregation, bridgeEvent: body.bridgeEvent === undefined ? true : !!body.bridgeEvent, mixerEvent: body.mixerEvent === undefined ? true : !!body.mixerEvent };
  const result = simulatePeelChain(cfg);
  if (body.save) { const id = uid('TRC'); T('traces').unshift({ id, name: body.name || 'Saved trace', seed_wallet_id: null, config_json: JSON.stringify(result.config), summary_json: JSON.stringify(result.summary), created_at: now(), data_classification: 'simulated-analysis' }); audit('simulate', 'chainlink', 'trace', id, `Peel-chain simulation saved (${result.summary.hopCount} hops)`); }
  else audit('simulate', 'chainlink', 'trace', null, `Peel-chain simulation run (${result.summary.hopCount} hops)`);
  return { config: result.config, summary: result.summary, alerts: result.alerts, hops: result.hops.slice(0, 300) };
});

add('GET', 'api/insolvency/cases', () => ({ rows: T('insolvency_cases').map((c) => ({ ...c, assets: T('estate_assets').filter((a) => a.case_id === c.id).length, creditors: T('creditors').filter((cr) => cr.case_id === c.id).length })) }));

add('GET', 'api/insolvency/cases/:id', ({ params }) => {
  const c = byId('insolvency_cases', params.id); if (!c) throw new HttpError(404, 'case not found');
  const assets = T('estate_assets').filter((a) => a.case_id === params.id), creditors = T('creditors').filter((cr) => cr.case_id === params.id);
  return { case: c, assets, creditors, scenarios: T('scenarios').filter((s) => s.case_id === params.id), waterfall: computeWaterfall({ currency: c.currency, assets, creditors }, {}) };
});

add('POST', 'api/insolvency/cases/:id/waterfall', ({ params, body }) => {
  const c = byId('insolvency_cases', params.id); if (!c) throw new HttpError(404, 'case not found');
  const assets = T('estate_assets').filter((a) => a.case_id === params.id), creditors = T('creditors').filter((cr) => cr.case_id === params.id);
  const waterfall = computeWaterfall({ currency: c.currency, assets, creditors }, body.assumptions || {});
  if (body.save) { const id = uid('SCN'); T('scenarios').unshift({ id, case_id: params.id, name: body.name || 'Scenario', assumptions_json: JSON.stringify(body.assumptions || {}), created_at: now(), data_classification: 'simulated-analysis' }); audit('scenario.create', 'waterfall', 'scenario', id, `Scenario saved for ${c.debtor_name}`); }
  return { case: c, waterfall };
});

// ── "Design-a-company" insolvency sandbox (mirrors src/server/routes.mjs) ─────
// Assembles ad-hoc user figures into the exact { currency, assets, creditors }
// estate + assumptions computeWaterfall expects and runs the SAME pure engine, so
// the browser build returns byte-identical results to the Node server. Every
// major-unit money input becomes integer minor units via Math.round(x*100).
const SANDBOX_ASSET_TYPES = ['real_estate', 'equipment', 'inventory', 'receivables', 'cash', 'securities', 'ip', 'litigation', 'contingent'];
const sbStr = (v, max, def) => (v == null || v === '' ? (def ?? '') : String(v).replace(/[\u0000-\u001F\u007F]/g, '').slice(0, max));
const sbMinor = (x) => Math.max(0, Math.round(asNum(x, 0, 0, 1e13) * 100));
function buildSandboxEstate(body) {
  const currency = sbStr(body.currency, 8, 'CHF') || 'CHF';
  const assets = [];
  const creditors = [];
  const inAssets = Array.isArray(body.assets) ? body.assets.slice(0, 40) : [];
  const inCred = body.creditors && typeof body.creditors === 'object' ? body.creditors : {};
  inAssets.forEach((a, i) => {
    if (!a || typeof a !== 'object') return;
    assets.push({ id: `SA-${i + 1}`, label: sbStr(a.label, 60, `Asset ${i + 1}`), asset_type: enumOf(a.type, SANDBOX_ASSET_TYPES, 'contingent'), currency, gross_minor: sbMinor(a.grossMajor ?? a.gross), recovery_pct: asNum(a.recoveryPct ?? a.recovery, 100, 0, 100), enforcement_pct: 0, dispute_status: 'Undisputed', timing_months: asInt(a.timingMonths, 6, 0, 120) });
  });
  const secured = Array.isArray(inCred.secured) ? inCred.secured.slice(0, 30) : [];
  secured.forEach((c, i) => {
    if (!c || typeof c !== 'object') return;
    const claim = sbMinor(c.amountMajor ?? c.amount);
    if (claim <= 0) return;
    const collateral = sbMinor(c.collateralMajor ?? c.collateral ?? c.securityMajor ?? c.security);
    const collId = `SC-${i + 1}`;
    assets.push({ id: collId, label: `${sbStr(c.name, 60, 'Secured lender ' + (i + 1))} — pledged collateral`, asset_type: 'real_estate', currency, gross_minor: collateral, recovery_pct: 100, enforcement_pct: 0, dispute_status: 'Undisputed', timing_months: asInt(c.timingMonths, 6, 0, 120) });
    creditors.push({ id: `CS-${i + 1}`, name: sbStr(c.name, 60, 'Secured lender ' + (i + 1)), class: 'fixed_charge_secured', currency, claim_minor: claim, admitted_pct: asNum(c.admittedPct, 100, 0, 100), collateral_asset_id: collId, collateral_minor: collateral });
  });
  const pref = Array.isArray(inCred.preferential) ? inCred.preferential.slice(0, 30) : [];
  pref.forEach((c, i) => {
    if (!c || typeof c !== 'object') return;
    const claim = sbMinor(c.amountMajor ?? c.amount);
    if (claim <= 0) return;
    creditors.push({ id: `CP-${i + 1}`, name: sbStr(c.name, 60, 'Preferential creditor ' + (i + 1)), class: enumOf(c.class, ['employee_preferential', 'pension_preferential', 'tax_preferential', 'general_preferential'], 'employee_preferential'), currency, claim_minor: claim, admitted_pct: asNum(c.admittedPct, 100, 0, 100) });
  });
  const uns = Array.isArray(inCred.unsecured) ? inCred.unsecured.slice(0, 30) : [];
  uns.forEach((c, i) => {
    if (!c || typeof c !== 'object') return;
    const claim = sbMinor(c.amountMajor ?? c.amount);
    if (claim <= 0) return;
    creditors.push({ id: `CU-${i + 1}`, name: sbStr(c.name, 60, 'Trade creditor ' + (i + 1)), class: 'unsecured', currency, claim_minor: claim, admitted_pct: asNum(c.admittedPct, 100, 0, 100) });
  });
  const costs = body.costs && typeof body.costs === 'object' ? body.costs : {};
  const assumptions = { ...(body.assumptions && typeof body.assumptions === 'object' ? body.assumptions : {}), administratorCostPct: asNum(costs.adminPct ?? costs.administratorCostPct, 0, 0, 100), legalCostMinor: sbMinor(costs.legalMajor ?? costs.legal), litigationCostMinor: sbMinor(costs.litigationMajor ?? costs.litigation) };
  return { estate: { currency, assets, creditors }, assumptions };
}

add('POST', 'api/insolvency/sandbox', ({ body }) => {
  const { estate, assumptions } = buildSandboxEstate(body || {});
  if (!estate.creditors.length) throw new HttpError(400, 'provide at least one creditor claim');
  const waterfall = computeWaterfall(estate, assumptions);
  return { currency: estate.currency, estate, assumptions, waterfall, inputsEcho: { assetCount: estate.assets.length, creditorCount: estate.creditors.length } };
});

add('GET', 'api/scenarios/:id', ({ params }) => {
  const s = byId('scenarios', params.id); if (!s) throw new HttpError(404, 'scenario not found');
  const c = byId('insolvency_cases', s.case_id);
  return { scenario: s, case: c, waterfall: computeWaterfall({ currency: c.currency, assets: T('estate_assets').filter((a) => a.case_id === s.case_id), creditors: T('creditors').filter((cr) => cr.case_id === s.case_id) }, JSON.parse(s.assumptions_json || '{}')) };
});

// Waterfall scenario comparison (mirrors the Node server). The priority ladder as
// {class,label} pairs comes from the engine's own exports so class ordering can
// never drift from the distribution logic. Money figures are passed through as the
// engine's exact {minor,value,display} shape (integer minor units — never a float).
const WATERFALL_LADDER = DEFAULT_PRIORITY_ORDER.map((cl) => ({ class: cl, label: CLASS_LABELS[cl] || cl }));
function scenarioComparisonRow(s) {
  const c = byId('insolvency_cases', s.case_id);
  if (!c) return null;
  const assets = T('estate_assets').filter((a) => a.case_id === s.case_id);
  const creditors = T('creditors').filter((cr) => cr.case_id === s.case_id);
  let assumptions = {};
  try { assumptions = JSON.parse(s.assumptions_json || '{}'); } catch { assumptions = {}; }
  const w = computeWaterfall({ currency: c.currency, assets, creditors }, assumptions);
  const cls = (name) => w.recoveryByClass.find((y) => y.class === name) || null;
  const unsecured = cls('unsecured');
  const byClass = {};
  for (const x of w.recoveryByClass) byClass[x.class] = { label: x.label, group: x.group, paidMinor: x.paidMinor, paid: x.paid, demandMinor: x.demandMinor, demand: x.demand, shortfall: x.shortfall, recoveryPct: x.recoveryPct };
  return {
    id: s.id, name: s.name, caseId: c.id, debtorName: c.debtor_name, currency: c.currency, createdAt: s.created_at, assumptions,
    metrics: {
      totalClaims: w.totalClaims, netRealisableEstate: w.netRealisableEstate, distributableEstate: w.distributableEstate,
      totalDistributed: w.totalDistributed, totalDistributedToCreditors: w.totalDistributedToCreditors,
      shortfall: w.shortfall, surplus: w.surplus, overallRecoveryPct: w.overallRecoveryPct,
      unsecuredRecoveryPct: unsecured && unsecured.recoveryPct != null ? unsecured.recoveryPct : null,
      expectedRecoveryTimingMonths: w.expectedRecoveryTimingMonths,
    },
    byClass,
  };
}
function buildComparison(ids, group) {
  const seen = new Set();
  const rows = [];
  for (const id of ids) {
    if (seen.has(id)) continue; seen.add(id);
    const s = byId('scenarios', id);
    if (!s) continue;
    const row = scenarioComparisonRow(s);
    if (row) rows.push(row);
  }
  const present = new Set();
  for (const r of rows) for (const k of Object.keys(r.byClass)) present.add(k);
  const ordered = WATERFALL_LADDER.filter((cl) => present.has(cl.class) && cl.class !== 'residual');
  return { group: group || null, scenarioIds: rows.map((r) => r.id), scenarios: rows, classes: ordered };
}

add('GET', 'api/insolvency/comparison-groups', () => {
  const rows = T('comparison_groups').slice().sort((a, b) => String(a.id).localeCompare(String(b.id))).map((g) => {
    let ids = []; try { ids = JSON.parse(g.scenario_ids || '[]'); } catch { ids = []; }
    const scenarios = ids.map((id) => { const s = byId('scenarios', id); if (!s) return null; const c = byId('insolvency_cases', s.case_id); return { id: s.id, name: s.name, case_id: s.case_id, created_at: s.created_at, debtor_name: c ? c.debtor_name : null }; }).filter(Boolean);
    return { id: g.id, name: g.name, created_at: g.created_at, scenario_ids: ids, scenarios };
  });
  return { rows };
});

add('POST', 'api/insolvency/compare', ({ body }) => {
  let ids = Array.isArray(body.scenarioIds) ? body.scenarioIds.map(String).slice(0, 12) : [];
  let group = null;
  if (body.groupId) {
    const g = byId('comparison_groups', String(body.groupId));
    if (!g) throw new HttpError(404, 'comparison group not found');
    try { ids = JSON.parse(g.scenario_ids || '[]'); } catch { ids = []; }
    group = { id: g.id, name: g.name };
  }
  if (!ids.length) throw new HttpError(400, 'provide groupId or a non-empty scenarioIds array');
  return buildComparison(ids, group);
});

add('GET', 'api/regulatory/instruments', ({ query }) => {
  let rows = T('regulatory_instruments');
  for (const [k, col] of [['sector', 'sector'], ['impact', 'impact_level'], ['juris', 'jurisdiction'], ['status', 'implementation_status'], ['verification', 'verification_status']]) if (query[k]) rows = rows.filter((r) => r[col] === query[k]);
  if (query.q) rows = rows.filter((r) => like(r.title, query.q) || like(r.summary, query.q));
  if (query.watchlist === 'true' || query.watchlist === '1') rows = rows.filter((r) => r.is_watchlisted);
  if (query.unread === 'true') rows = rows.filter((r) => !r.is_read);
  const p = paginate(rows, query, ['effective_date', 'publication_date', 'impact_score', 'title'], 'effective_date', 'desc');
  p.rows = p.rows.map((r) => ({ id: r.id, title: r.title, authority: r.authority, jurisdiction: r.jurisdiction, sector: r.sector, doc_type: r.doc_type, publication_date: r.publication_date, effective_date: r.effective_date, impact_level: r.impact_level, impact_score: r.impact_score, implementation_status: r.implementation_status, verification_status: r.verification_status, source_type: r.source_type, is_read: r.is_read, is_watchlisted: r.is_watchlisted }));
  return p;
});

add('GET', 'api/regulatory/instruments/:id', ({ params }) => {
  const r = clone(byId('regulatory_instruments', params.id)); if (!r) throw new HttpError(404, 'instrument not found');
  parseJsonFields(r, ['obligations_json', 'affected_json', 'impact_factors_json', 'implementation_actions_json', 'tags_json', 'related_json']);
  r.daysToEffective = daysUntil(r.effective_date);
  return { instrument: r, notes: T('notes').filter((n) => n.target_type === 'instrument' && n.target_id === params.id) };
});

add('GET', 'api/regulatory/upcoming', () => ({
  rows: T('regulatory_instruments').filter((r) => r.effective_date >= todayISO()).sort((a, b) => a.effective_date.localeCompare(b.effective_date)).slice(0, 40).map((r) => ({ id: r.id, title: r.title, authority: r.authority, sector: r.sector, effective_date: r.effective_date, impact_level: r.impact_level, implementation_status: r.implementation_status })),
  overdue: T('regulatory_instruments').filter((r) => r.effective_date < todayISO() && r.implementation_status !== 'Complete').sort((a, b) => b.effective_date.localeCompare(a.effective_date)).slice(0, 40).map((r) => ({ id: r.id, title: r.title, authority: r.authority, sector: r.sector, effective_date: r.effective_date, implementation_status: r.implementation_status })),
}));

// Coverage matrix: sector (rows) x jurisdiction (columns) instrument counts with
// row/column totals. Mirrors GET /api/regulatory/coverage in src/server/routes.mjs.
add('GET', 'api/regulatory/coverage', () => {
  const jurisdictions = ['European Union', 'Switzerland', 'Geneva'];
  const jset = new Set(jurisdictions);
  const instr = T('regulatory_instruments');
  const sectors = [...new Set(instr.map((r) => r.sector))].sort();
  const cell = {};
  const colTotals = Object.fromEntries(jurisdictions.map((j) => [j, 0]));
  const rowTotals = Object.fromEntries(sectors.map((s) => [s, 0]));
  let grand = 0;
  for (const r of instr) {
    rowTotals[r.sector] = (rowTotals[r.sector] || 0) + 1;
    grand += 1;
    if (jset.has(r.jurisdiction)) { const k = r.sector + '::' + r.jurisdiction; cell[k] = (cell[k] || 0) + 1; colTotals[r.jurisdiction] += 1; }
  }
  const matrix = sectors.map((s) => ({ sector: s, cells: jurisdictions.map((j) => ({ jurisdiction: j, count: cell[s + '::' + j] || 0 })), total: rowTotals[s] || 0 }));
  const maxCell = Math.max(0, ...sectors.flatMap((s) => jurisdictions.map((j) => cell[s + '::' + j] || 0)));
  return { jurisdictions, sectors, matrix, colTotals, grandTotal: grand, maxCell, total: instr.length };
});

add('POST', 'api/regulatory/instruments/:id/flags', ({ params, body }) => {
  const r = byId('regulatory_instruments', params.id); if (!r) throw new HttpError(404, 'instrument not found');
  if (body.read !== undefined) r.is_read = body.read ? 1 : 0;
  if (body.watchlist !== undefined) { r.is_watchlisted = body.watchlist ? 1 : 0; audit(body.watchlist ? 'watchlist.add' : 'watchlist.remove', 'regulatory', 'instrument', params.id, 'Watchlist updated'); }
  if (body.implementation_status !== undefined) r.implementation_status = enumOf(body.implementation_status, ['Not Started', 'In Progress', 'Complete', 'Overdue'], 'Not Started');
  return { id: r.id, is_read: r.is_read, is_watchlisted: r.is_watchlisted, implementation_status: r.implementation_status };
});

add('GET', 'api/policies', () => ({ rows: T('policies').map((p) => ({ id: p.id, title: p.title, owner_org: p.owner_org, sector: p.sector, version: p.version, updated_at: p.updated_at })) }));
add('GET', 'api/policies/:id', ({ params }) => { const p = byId('policies', params.id); if (!p) throw new HttpError(404, 'policy not found'); return { policy: p }; });

add('GET', 'api/comparisons', () => ({ rows: T('comparison_sessions').map((s) => ({ ...s, findings: T('comparison_findings').filter((f) => f.session_id === s.id).length })) }));
add('GET', 'api/comparisons/:id', ({ params }) => {
  const s = byId('comparison_sessions', params.id); if (!s) throw new HttpError(404, 'comparison not found');
  const instrument = s.instrument_id ? clone(byId('regulatory_instruments', s.instrument_id)) : null; if (instrument) parseJsonFields(instrument, ['obligations_json']);
  const rank = { High: 0, Medium: 1, Low: 2 };
  return { session: s, instrument, policy: s.policy_id ? byId('policies', s.policy_id) : null, findings: T('comparison_findings').filter((f) => f.session_id === params.id).sort((a, b) => rank[a.severity] - rank[b.severity]) };
});

add('POST', 'api/regulatory/compare', ({ body }) => {
  let regText = String(body.regText || ''); let instrument = null;
  if (body.instrumentId) { instrument = byId('regulatory_instruments', String(body.instrumentId)); if (!instrument) throw new HttpError(404, 'instrument not found'); let obl = []; try { obl = JSON.parse(instrument.obligations_json || '[]'); } catch { obl = []; } regText = `${instrument.summary} ${obl.join(' ')}`; }
  let policyText = String(body.policyText || ''); let policy = null;
  if (body.policyId) { policy = byId('policies', String(body.policyId)); if (!policy) throw new HttpError(404, 'policy not found'); policyText = policy.body; }
  if (!regText || !policyText) throw new HttpError(400, 'both a regulatory instrument/text and a policy/text are required');
  const result = compareTexts(regText, policyText, { effectiveDate: instrument?.effective_date, instrumentTitle: instrument?.title, policyTitle: policy?.title });
  if (body.save) {
    const sid = uid('CS'); T('comparison_sessions').unshift({ id: sid, instrument_id: instrument?.id || null, policy_id: policy?.id || null, name: body.name || 'Comparison session', overall_score: result.overallScore, verdict: result.verdict, created_at: now(), data_classification: 'simulated-analysis' });
    result.findings.forEach((f, i) => T('comparison_findings').push({ id: `${sid}-F${i + 1}`, session_id: sid, finding_type: f.finding_type, severity: f.severity, confidence: f.confidence, reg_fragment: f.reg_fragment, policy_fragment: f.policy_fragment, explanation: f.explanation, recommendation: f.recommendation, analyst_status: f.analyst_status, analyst_note: '', data_classification: 'simulated-analysis' }));
    audit('compare', 'regulatory', 'comparison', sid, `Comparison run: ${result.verdict} (${result.overallScore}%)`); result.sessionId = sid;
  } else audit('compare', 'regulatory', 'comparison', null, `Comparison preview: ${result.verdict}`);
  return result;
});

// Auto-detect the applicable regulation: rank all real instruments by textual
// similarity to a pasted policy so the user need not pre-select a law.
add('POST', 'api/regulatory/suggest', ({ body }) => {
  const text = String(body.text || body.policyText || '');
  if (!text.trim()) throw new HttpError(400, 'policy text is required');
  const limit = Math.max(1, Math.min(25, Number(body.limit) || 8));
  const regs = T('regulatory_instruments');
  const suggestions = rankRegulations(text, regs, { limit, minScore: 1 });
  audit('suggest', 'regulatory', 'comparison', null, `Suggested ${suggestions.length} regulations for pasted policy`);
  return { total: regs.length, count: suggestions.length, suggestions };
});

// ── Compliance-Query Sandbox (mirrors the server's /api/compliance/* routes) ──
// Same jurisdiction-aware routing + triage engine and KB the Node server uses,
// run in-browser over the in-memory register (regulatory_instruments) and
// policies. Read-only, deterministic; omitting the location questions returns
// every compiled framework, grouped by jurisdiction.
add('GET', 'api/compliance/kb', () => ({
  version: KB_VERSION,
  jurisdictions: KB_JURISDICTIONS.map((j) => ({ code: j.code, label: j.label, group: j.group, kind: j.kind, note: j.note || null })),
  sizeBands: KB_SIZE_BANDS.map((b) => ({ code: b.code, label: b.label })),
  roles: KB_ROLES.map((r) => ({ code: r.code, label: r.label, note: r.note })),
  topics: KB_TOPICS.map((t) => ({ id: t.id, label: t.label })),
  frameworks: KB_FRAMEWORKS.map((f) => ({ id: f.id, name: f.name, kind: f.kind, authorityType: f.authorityType, mandatory: !!f.mandatory, appliesInRegions: f.appliesInRegions, summary: f.summary, source: f.source || null })),
  verdicts: KB_TRIAGE_VERDICTS,
  disclaimer: KB_DISCLAIMER,
}));

add('POST', 'api/compliance/analyze', ({ body }) => {
  const raw = (body && typeof body.profile === 'object' && body.profile) ? body.profile : (body || {});
  const jCodes = KB_JURISDICTIONS.map((j) => j.code);
  const roleCodes = KB_ROLES.map((r) => r.code);
  const bandCodes = KB_SIZE_BANDS.map((b) => b.code);
  const codeList = (v) => (Array.isArray(v) ? v : []).map((c) => enumOf(String(c), jCodes, '')).filter(Boolean).slice(0, 24);
  let companySize;
  if (raw.companySize && typeof raw.companySize === 'object') {
    companySize = { employees: asInt(raw.companySize.employees, 0, 0, 5000000), annualRevenueUSD: asNum(raw.companySize.annualRevenueUSD, 0, 0, 1e14) };
  } else {
    companySize = enumOf(String(raw.companySize || ''), bandCodes, 'small');
  }
  const profile = {
    mode: enumOf(String(raw.mode || ''), ['flag', 'policy', 'freetext'], 'freetext'),
    queryText: String(raw.queryText != null ? raw.queryText : (raw.policyText || '')).slice(0, 60000),
    businessBase: codeList(raw.businessBase),
    tradesInternationally: raw.tradesInternationally === true || raw.tradesInternationally === 'true',
    tradesWhere: codeList(raw.tradesWhere),
    employsInternationally: raw.employsInternationally === true || raw.employsInternationally === 'true',
    employsWhere: codeList(raw.employsWhere),
    companySize,
    role: enumOf(String(raw.role || ''), roleCodes, 'unknown'),
    sector: String(raw.sector || '').slice(0, 60),
    policyIds: (Array.isArray(raw.policyIds) ? raw.policyIds : []).map((x) => String(x)).slice(0, 12),
  };
  const instruments = T('regulatory_instruments');
  const policies = [];
  for (const pid of profile.policyIds) { const pol = byId('policies', pid); if (pol && pol.body) policies.push({ id: pol.id, title: pol.title, body: pol.body }); }
  const result = analyzeCompliance(profile, { instruments, policies });
  audit('analyze', 'compliance', 'sandbox', null, `Compliance sandbox: ${result.triage.verdict} across ${result.byJurisdiction.length} jurisdiction(s)`, { verdict: result.triage.verdict, regions: result.regionsResolved.map((r) => r.code), topics: result.matchedTopics.map((t) => t.id) });
  return result;
});

add('PATCH', 'api/findings/:id', ({ params, body }) => {
  const f = byId('comparison_findings', params.id); if (!f) throw new HttpError(404, 'finding not found');
  f.analyst_status = enumOf(body.analyst_status, ['Accepted', 'Rejected', 'Requires Review', 'Remediated'], f.analyst_status);
  f.analyst_note = String(body.analyst_note || '').slice(0, 2000);
  audit('finding.disposition', 'regulatory', 'finding', params.id, `Finding marked ${f.analyst_status}`);
  return f;
});

// -- Screening & Watchlist (mirrors the server's /api/screening/* routes) -------
// Deterministic name / entity / wallet screening over the SYNTHETIC watchlist,
// running in-browser over the in-memory directory (entities + wallets) with the
// SAME pure screening engine the Node server uses. Dispositions are session-
// scoped (held in memory, audited). NOT a sanctions-compliance system of record.
const SCREENING_DISPOSITIONS = new Map();

function screeningSubjects() {
  const entities = T('entities').map((e) => ({ id: e.id, legal_name: e.legal_name, entity_type: e.entity_type, jurisdiction: e.jurisdiction, source_type: e.source_type }));
  const wallets = T('wallets').map((w) => ({ id: w.id, label: w.label, address: w.address, node_type: w.node_type }));
  return { entities, wallets };
}
function computePortfolioHits(opts = {}) {
  const { entities, wallets } = screeningSubjects();
  const report = screenBatch({ entities, wallets }, WATCHLIST_ENTRIES, opts);
  for (const h of report.hits) {
    const d = SCREENING_DISPOSITIONS.get(h.hitId);
    h.disposition = d ? { status: d.status, note: d.note, ts: d.ts } : { status: 'open', note: '', ts: null };
  }
  return report;
}
function screeningLinkFor(subject) {
  if (!subject || !subject.name) return null;
  const res = runScreening({ name: subject.name, kindHint: subject.kindHint }, WATCHLIST_ENTRIES, { limit: 3 });
  if (!res.matches.length) return null;
  const top = res.matches[0];
  return { matched: true, topScore: top.score, topBand: top.band, topList: top.list, topListLabel: top.listLabel, topSeverity: top.listSeverity, matchedName: top.matchedName, program: top.program, matchCount: res.matches.length, note: 'Synthetic watchlist match - review in Screening & Watchlist. Not an allegation.' };
}

add('GET', 'api/screening/watchlists', ({ query }) => {
  // list-type filter is by MEMBERSHIP (entry.lists[]); kind filter is separate.
  const type = enumOf(query.type, WL_LIST_TYPES.map((l) => l.code), '');
  const kind = enumOf(query.kind, ['person', 'organisation', 'wallet', 'vessel'], '');
  const q = String(query.q || '').toLowerCase();
  const listsOf = (e) => (Array.isArray(e.lists) && e.lists.length ? e.lists : (e.list ? [e.list] : ['sanctions']));
  let rows = WATCHLIST_ENTRIES.filter((e) => (!type || listsOf(e).includes(type)) && (!kind || e.kind === kind));
  if (q) rows = rows.filter((e) => (e.name + ' ' + (e.aliases || []).join(' ') + ' ' + (e.program || '')).toLowerCase().includes(q));
  return {
    version: WATCHLIST_VERSION, listTypes: WL_LIST_TYPES, bands: WL_BANDS, total: rows.length,
    rows: rows.map((e) => ({ id: e.id, lists: listsOf(e), kind: e.kind, name: e.name, aliases: e.aliases || [], dob: e.dob || null, country: e.country || null, program: e.program, authority: e.authority || null, authorities: e.authorities || (e.authority ? [e.authority] : []), listingDate: e.listingDate || null, description: e.description || e.note || null, sourceUrl: e.sourceUrl || null, additionalSources: e.additionalSources || [], note: e.note, address: e.address || null, imo: e.imo || null, data_classification: e.data_classification })),
    disclaimer: SCREENING_DISCLAIMER,
  };
});

add('POST', 'api/screening/search', ({ body }) => {
  const raw = body || {};
  const name = String(raw.name != null ? raw.name : (raw.entity != null ? raw.entity : (raw.address != null ? raw.address : (raw.query || '')))).slice(0, 200);
  if (!name.trim()) throw new HttpError(400, 'provide a name, entity or address to screen');
  const types = (Array.isArray(raw.types) ? raw.types : []).map((t) => enumOf(t, WL_LIST_TYPES.map((l) => l.code), '')).filter(Boolean);
  const q = { name, country: raw.country ? String(raw.country).slice(0, 40) : undefined, dob: raw.dob ? String(raw.dob).slice(0, 20) : undefined, kindHint: raw.kindHint ? String(raw.kindHint).slice(0, 20) : undefined };
  const result = runScreening(q, WATCHLIST_ENTRIES, { types: types.length ? types : undefined, limit: asInt(raw.limit, 25, 1, 100) });
  audit('screening.search', 'screening', 'query', null, `Screened "${name}" - ${result.counts.candidates} candidate(s)`, { candidates: result.counts.candidates, byBand: result.counts.byBand, types });
  return result;
});

add('GET', 'api/screening/hits', ({ query }) => {
  const types = String(query.types || '');
  const typeList = types ? types.split(',').map((t) => enumOf(t, WL_LIST_TYPES.map((l) => l.code), '')).filter(Boolean) : undefined;
  return computePortfolioHits(typeList && typeList.length ? { types: typeList } : {});
});

add('GET', 'api/screening/overlay', () => {
  const report = computePortfolioHits({});
  const overlay = deriveScreeningOverlay(report);
  return {
    overlay,
    counts: { sanctionedEntities: overlay.sanctionedEntityIds.length, sanctionedWallets: overlay.sanctionedWalletIds.length, pepEntities: overlay.pepEntityIds.length, pepWallets: overlay.pepWalletIds.length },
    note: 'Strong-band sanctions/PEP hits over the seeded directory. sanctionedIds (wallet ids) is consumable by Chain-Link deriveWalletRisk; the entity id sets drive a Sovereign Nexus sanctions/PEP overlay.',
    disclaimer: SCREENING_DISCLAIMER,
  };
});

add('POST', 'api/screening/hits/:id/disposition', ({ params, body }) => {
  const report = computePortfolioHits({});
  const hit = report.hits.find((h) => h.hitId === params.id);
  if (!hit) throw new HttpError(404, 'screening hit not found');
  const status = enumOf(body.status, ['confirmed', 'false-positive', 'open'], 'open');
  const note = String(body.note || '').slice(0, 2000);
  if (status === 'open') SCREENING_DISPOSITIONS.delete(params.id);
  else SCREENING_DISPOSITIONS.set(params.id, { status, note, ts: now() });
  audit('screening.disposition', 'screening', 'hit', params.id, `Screening hit ${status}: ${hit.subjectName}`, { subjectType: hit.subjectType, subjectId: hit.subjectId, topList: hit.topList, topScore: hit.topScore });
  const d = SCREENING_DISPOSITIONS.get(params.id);
  return { hitId: params.id, disposition: d ? { status: d.status, note: d.note, ts: d.ts } : { status: 'open', note: '', ts: null } };
});

// -- Transaction Monitoring & SAR (mirrors the server's /api/monitoring/* routes) --
// Deterministic typology-rule alerting over the in-memory transactions/wallets +
// entity control structures, a SAR-narrative builder, and an alert-disposition
// workflow, running the SAME pure monitoring engine the Node server uses.
// Dispositions are session-scoped (held in memory, audited). NOT a monitoring /
// reporting system of record; every alert and SAR is synthetic demonstration output.
const MONITORING_DISPOSITIONS = new Map();

function monitoringInputs() {
  const transactions = T('crypto_transactions').map((t) => ({ id: t.id, from_id: t.from_id, to_id: t.to_id, amount_minor: Number(t.amount_minor), ts: t.ts, hop: t.hop, pattern: t.pattern, trace_id: t.trace_id, risk_score: t.risk_score, asset: t.asset }));
  const wallets = T('wallets').map((w) => ({ id: w.id, node_type: w.node_type, is_dormant: w.is_dormant, label: w.label, address: w.address, cluster_id: w.cluster_id, risk_category: w.risk_category, first_seen: w.first_seen, last_seen: w.last_seen }));
  const sanctioned = new Set(wallets.filter((w) => w.node_type === 'mixer').map((w) => w.id));
  try {
    const overlay = deriveScreeningOverlay(computePortfolioHits({}));
    for (const id of overlay.sanctionedWalletIds || []) sanctioned.add(id);
  } catch { /* screening optional */ }
  const { nodes, edges } = fullGraph();
  const nameById = new Map(nodes.map((n) => [n.id, n.legal_name]));
  const companies = nodes.filter((n) => n.entity_type === 'company').slice(0, 120);
  const entitySummaries = companies.map((n) => {
    const s = structureSummary(nodes, edges, n.id);
    return { id: n.id, name: nameById.get(n.id) || n.id, jurisdictions: s.jurisdictions, maxSecrecy: s.maxSecrecy, offshore: s.offshore, depth: s.depth, homeJurisdiction: n.jurisdiction };
  });
  return { transactions, wallets, sanctionedIds: [...sanctioned].sort(), entitySummaries };
}
function computeAlerts(opts = {}) {
  const inputs = monitoringInputs();
  const result = runMonitoring(inputs, opts);
  for (const a of result.alerts) {
    const d = MONITORING_DISPOSITIONS.get(a.id);
    a.disposition = d ? { status: d.status, note: d.note, ts: d.ts } : { status: 'open', note: '', ts: null };
  }
  return { result, inputs };
}

add('GET', 'api/monitoring/alerts', ({ query }) => {
  const severity = enumOf(query.severity, ['High', 'Medium', 'Low'], '');
  const rule = enumOf(query.rule, RULE_IDS, '');
  const status = enumOf(query.status, MON_STATUSES, '');
  const { result } = computeAlerts({});
  let alerts = result.alerts;
  if (severity) alerts = alerts.filter((a) => a.severity === severity);
  if (rule) alerts = alerts.filter((a) => a.ruleId === rule);
  if (status) alerts = alerts.filter((a) => (a.disposition ? a.disposition.status : 'open') === status);
  const rows = alerts.map((a) => ({ id: a.id, ruleId: a.ruleId, ruleLabel: a.ruleLabel, typology: a.typology, severity: a.severity, score: a.score, reason: a.reason, primarySubject: a.primarySubject, subjectCount: a.subjectCount, txCount: a.txCount, disposition: a.disposition }));
  return { total: rows.length, unfilteredTotal: result.summary.total, summary: result.summary, rules: result.rules, statuses: MON_STATUSES, rows, disclaimer: MONITORING_DISCLAIMER };
});

add('GET', 'api/monitoring/alerts/:id', ({ params }) => {
  const { result, inputs } = computeAlerts({});
  const alert = result.alerts.find((a) => a.id === params.id);
  if (!alert) throw new HttpError(404, 'alert not found');
  const txById = new Map(inputs.transactions.map((t) => [t.id, t]));
  const walletById = new Map(inputs.wallets.map((w) => [w.id, w]));
  const txs = (alert.txIds || []).map((id) => {
    const t = txById.get(id); if (!t) return null;
    return { id: t.id, ts: t.ts, from_id: t.from_id, to_id: t.to_id, amount_minor: Number(t.amount_minor), asset: t.asset || 'ETH', pattern: t.pattern, hop: t.hop, risk_score: t.risk_score, fromLabel: (walletById.get(t.from_id) || {}).label || t.from_id, toLabel: (walletById.get(t.to_id) || {}).label || t.to_id };
  }).filter(Boolean).slice(0, 200);
  const subjects = (alert.subjects || []).map((s) => {
    const link = s.type === 'wallet' ? '#/chainlink/wallets' : s.type === 'entity' ? '#/nexus/directory' : s.type === 'trace' ? '#/chainlink/graph' : null;
    const w = s.type === 'wallet' ? walletById.get(s.id) : null;
    return { ...s, link, node_type: w ? w.node_type : null, risk_category: w ? w.risk_category : null, address: w ? w.address : null };
  });
  return { alert: { ...alert, subjects, transactions: txs }, disclaimer: MONITORING_DISCLAIMER };
});

add('POST', 'api/monitoring/alerts/:id/disposition', ({ params, body }) => {
  const { result } = computeAlerts({});
  const alert = result.alerts.find((a) => a.id === params.id);
  if (!alert) throw new HttpError(404, 'alert not found');
  const raw = enumOf(body.status, ['escalate', 'close', 'false-positive', 'escalated', 'closed', 'open'], 'open');
  const status = raw === 'escalate' ? 'escalated' : raw === 'close' ? 'closed' : raw;
  const note = String(body.note || '').slice(0, 2000);
  if (status === 'open') MONITORING_DISPOSITIONS.delete(params.id);
  else MONITORING_DISPOSITIONS.set(params.id, { status, note, ts: now() });
  audit('monitoring.disposition', 'monitoring', 'alert', params.id, `Alert ${status}: ${alert.ruleLabel} - ${alert.primarySubject.label || alert.primarySubject.id}`, { ruleId: alert.ruleId, severity: alert.severity, score: alert.score });
  const d = MONITORING_DISPOSITIONS.get(params.id);
  return { alertId: params.id, disposition: d ? { status: d.status, note: d.note, ts: d.ts } : { status: 'open', note: '', ts: null } };
});

function sarForAlert(id) {
  const { result, inputs } = computeAlerts({});
  const alert = result.alerts.find((a) => a.id === id);
  if (!alert) throw new HttpError(404, 'alert not found');
  const sar = buildSAR(alert, { transactions: inputs.transactions, wallets: inputs.wallets, filedBy: 'demo.analyst' });
  return { alert: { id: alert.id, ruleLabel: alert.ruleLabel, severity: alert.severity, score: alert.score, primarySubject: alert.primarySubject }, sar };
}
add('GET', 'api/monitoring/alerts/:id/sar', ({ params }) => sarForAlert(params.id));
add('POST', 'api/monitoring/alerts/:id/sar', ({ params }) => {
  const out = sarForAlert(params.id);
  audit('monitoring.sar', 'monitoring', 'alert', params.id, `SAR narrative drafted: ${out.sar.reference}`, { ruleLabel: out.alert.ruleLabel, typologies: out.sar.typologies });
  return out;
});


add('POST', 'api/regulatory/ingest', ({ body }) => {
  const input = String(body.input || '').slice(0, 500000); if (!input) throw new HttpError(400, 'no input provided');
  const format = enumOf(body.format, ['auto', 'json', 'csv', 'rss', 'atom', 'markdown', 'text'], 'auto');
  const result = ingest(input, { format: format === 'auto' ? undefined : format, sourceName: body.sourceName || 'Manual import', sourceType: 'imported-user-material' });
  let inserted = 0;
  for (const rec of result.accepted) {
    const imp = computeImpact({ daysToEffective: daysUntil(rec.effective_date || rec.publication_date), businessFunctionsAffected: 2, enforcementExposure: 0.4, reportingObligations: /report|notify/i.test(rec.summary || ''), recordkeepingRequirements: /record|retain/i.test(rec.summary || '') });
    T('regulatory_instruments').unshift({ id: uid('REG-U'), title: rec.title, authority: rec.authority, jurisdiction: rec.jurisdiction, sector: rec.sector, doc_type: rec.doc_type, publication_date: rec.publication_date, effective_date: rec.effective_date, summary: rec.summary, obligations_json: rec.obligations_json, affected_json: '[]', impact_level: imp.level, impact_score: imp.score, impact_factors_json: JSON.stringify(imp.factors), implementation_actions_json: '[]', source_type: 'imported-user-material', verification_status: 'Unverified', implementation_status: 'Not Started', is_read: 0, is_watchlisted: 0, tags_json: JSON.stringify([rec.sector]), related_json: '[]', source_url: rec.source_url, last_checked: now(), feed_source_id: null, data_classification: 'synthetic-demo' });
    inserted++;
  }
  const impId = uid('IMP'); T('import_logs').unshift({ id: impId, ts: now(), source_name: body.sourceName || 'Manual import', format: result.format, received: result.received, accepted: inserted, rejected: result.rejected.length, duplicates: result.duplicates, summary: result.summary, data_classification: 'synthetic-demo' });
  for (const rj of result.rejected) T('rejected_records').unshift({ id: nowSeq.v++, import_id: impId, reason: rj.reason, raw: rj.raw, ts: now() });
  audit('import', 'regulatory', 'import', impId, result.summary);
  return { importId: impId, format: result.format, received: result.received, accepted: inserted, rejected: result.rejected, duplicates: result.duplicates, summary: result.summary };
});

add('GET', 'api/feed-sources', () => ({ rows: T('feed_sources') }));
add('GET', 'api/import-logs', () => ({ rows: T('import_logs'), rejected: T('rejected_records').slice(0, 100) }));

add('GET', 'api/cases', () => ({ rows: T('cases').map((c) => ({ ...c, links: T('case_links').filter((l) => l.case_id === c.id).length })) }));
add('GET', 'api/cases/:id', ({ params }) => { const c = byId('cases', params.id); if (!c) throw new HttpError(404, 'case not found'); return { case: c, links: T('case_links').filter((l) => l.case_id === params.id), notes: T('notes').filter((n) => n.target_type === 'case' && n.target_id === params.id) }; });
add('POST', 'api/cases', ({ body }) => {
  if (!body.title) throw new HttpError(400, 'missing required field: title');
  const id = uid('CASE'); const row = { id, title: String(body.title).slice(0, 120), description: String(body.description || '').slice(0, 4000), module: enumOf(body.module, ['nexus', 'chainlink', 'waterfall', 'regulatory', 'cross'], 'cross'), owner: 'demo.analyst', status: enumOf(body.status, ['Draft', 'Active Sweep', 'Complete'], 'Draft'), priority: enumOf(body.priority, ['High', 'Medium', 'Low'], 'Medium'), created_at: now(), modified_at: now(), data_classification: 'synthetic-demo' };
  T('cases').unshift(row); audit('case.create', 'cross', 'case', id, `Case created: ${row.title}`); return row;
});

// ── Case dossier: link records, assemble the dossier, generate the report ────
// Mirrors src/server/routes.mjs. resolveCaseLink expands a raw case_link into a
// display record with title/subtitle/detail, degrading to just the id if the
// target no longer exists.
function fmtTitleB(s) { return String(s || '').replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()); }
function resolveCaseLink(l) {
  const base = { id: l.id, case_id: l.case_id, target_type: l.target_type, target_id: l.target_id, note: l.note, title: l.target_id, subtitle: '', route: null, missing: false, detail: [] };
  const kv = (k, v) => ({ k, v: v == null || v === '' ? '—' : String(v) });
  if (l.target_type === 'entity') {
    const e = byId('entities', l.target_id);
    if (!e) return { ...base, missing: true };
    return { ...base, title: e.legal_name, subtitle: fmtTitleB(e.entity_type) + (e.jurisdiction ? ' · ' + e.jurisdiction : ''), route: '#/nexus/directory', risk: e.risk_flag, detail: [kv('Type', fmtTitleB(e.entity_type)), kv('Jurisdiction', e.jurisdiction), kv('Legal form', e.legal_form), kv('Status', e.status), kv('Risk flag', e.risk_flag), kv('Verification', e.verification_status), kv('Incorporated', e.incorporation_date)] };
  }
  if (l.target_type === 'wallet') {
    const w = byId('wallets', l.target_id);
    if (!w) return { ...base, missing: true };
    return { ...base, title: w.label || w.id, subtitle: fmtTitleB(w.node_type) + ' · ' + w.asset, route: '#/chainlink/wallets', risk: w.risk_category, detail: [kv('Type', fmtTitleB(w.node_type)), kv('Asset', w.asset), kv('Cluster', w.cluster_id), kv('Risk', w.risk_category), kv('Balance (minor)', w.balance_minor), kv('Dormant', w.is_dormant ? 'Yes' : 'No'), kv('Address', w.address)] };
  }
  if (l.target_type === 'instrument') {
    const r = byId('regulatory_instruments', l.target_id);
    if (!r) return { ...base, missing: true };
    return { ...base, title: r.title, subtitle: r.authority + ' · ' + r.jurisdiction, route: '#/regulatory/feed', risk: r.impact_level, detail: [kv('Authority', r.authority), kv('Jurisdiction', r.jurisdiction), kv('Sector', fmtTitleB(r.sector)), kv('Type', fmtTitleB(r.doc_type)), kv('Impact', r.impact_level + ' (' + r.impact_score + ')'), kv('Effective', r.effective_date), kv('Implementation', r.implementation_status), kv('Source', r.source_url)] };
  }
  if (l.target_type === 'trace') {
    const t = byId('traces', l.target_id);
    if (!t) return { ...base, missing: true };
    let summary = {}; try { summary = JSON.parse(t.summary_json || '{}'); } catch { summary = {}; }
    return { ...base, title: t.name, subtitle: 'Peel-chain trace', route: '#/chainlink', detail: [kv('Hops', summary.hopCount), kv('Created', t.created_at)] };
  }
  if (l.target_type === 'scenario') {
    const s = byId('scenarios', l.target_id);
    if (!s) return { ...base, missing: true };
    const c = byId('insolvency_cases', s.case_id);
    return { ...base, title: s.name, subtitle: 'Waterfall scenario · ' + ((c && c.debtor_name) || ''), route: '#/waterfall', detail: [kv('Debtor', c && c.debtor_name), kv('Created', s.created_at)] };
  }
  if (l.target_type === 'policy') {
    const p = byId('policies', l.target_id);
    if (!p) return { ...base, missing: true };
    return { ...base, title: p.title, subtitle: (p.owner_org || '') + ' · ' + fmtTitleB(p.sector), route: '#/regulatory/policies', detail: [kv('Owner', p.owner_org), kv('Sector', fmtTitleB(p.sector)), kv('Version', p.version)] };
  }
  return base;
}
function assembleCase(id) {
  const c = byId('cases', id);
  if (!c) throw new HttpError(404, 'case not found');
  const links = T('case_links').filter((l) => l.case_id === id).slice().sort((a, b) => (a.id || 0) - (b.id || 0)).map(resolveCaseLink);
  const order = ['entity', 'wallet', 'instrument', 'trace', 'scenario', 'policy', 'evidence'];
  const groups = [];
  for (const t of order) { const items = links.filter((l) => l.target_type === t); if (items.length) groups.push({ type: t, items }); }
  for (const l of links) if (!order.includes(l.target_type)) { let g = groups.find((x) => x.type === l.target_type); if (!g) { g = { type: l.target_type, items: [] }; groups.push(g); } g.items.push(l); }
  const notes = T('notes').filter((n) => n.target_type === 'case' && n.target_id === id);
  const linkIds = new Set(links.map((l) => l.target_id));
  const auditRows = T('audit_log').filter((a) => (a.target_type === 'case' && a.target_id === id) || (a.detail_json && a.detail_json.includes('"case_id":"' + id + '"')) || linkIds.has(a.target_id)).slice(0, 60);
  return { case: c, links, groups, notes, audit: auditRows, counts: { links: links.length, groups: groups.length, notes: notes.length } };
}

add('POST', 'api/cases/:id/links', ({ params, body }) => {
  const c = byId('cases', params.id); if (!c) throw new HttpError(404, 'case not found');
  const targetType = enumOf(body.target_type, ['entity', 'wallet', 'instrument', 'trace', 'scenario', 'policy', 'evidence'], '');
  if (!targetType) throw new HttpError(400, 'invalid target_type');
  const targetId = String(body.target_id || ''); if (!targetId) throw new HttpError(400, 'missing required field: target_id');
  const label = String(body.label || '').slice(0, 200);
  const links = () => T('case_links').filter((l) => l.case_id === params.id).map(resolveCaseLink);
  const existing = T('case_links').find((l) => l.case_id === params.id && l.target_type === targetType && l.target_id === targetId);
  if (existing) return { ok: true, created: false, link: resolveCaseLink(existing), links: links() };
  const row = { id: nowSeq.v++, case_id: params.id, target_type: targetType, target_id: targetId, note: label || null };
  T('case_links').push(row); c.modified_at = now();
  audit('case.link', 'cross', targetType, targetId, `${fmtTitleB(targetType)} ${targetId} added to case ${c.title}`, { case_id: params.id });
  return { ok: true, created: true, link: resolveCaseLink(row), links: links() };
});

add('DELETE', 'api/cases/:id/links/:linkId', ({ params }) => {
  const c = byId('cases', params.id); if (!c) throw new HttpError(404, 'case not found');
  const i = T('case_links').findIndex((l) => String(l.id) === String(params.linkId) && l.case_id === params.id);
  if (i < 0) throw new HttpError(404, 'link not found');
  const link = T('case_links')[i];
  T('case_links').splice(i, 1); c.modified_at = now();
  audit('case.unlink', 'cross', link.target_type, link.target_id, `${fmtTitleB(link.target_type)} ${link.target_id} removed from case ${c.title}`, { case_id: params.id });
  return { ok: true, links: T('case_links').filter((l) => l.case_id === params.id).map(resolveCaseLink) };
});

add('GET', 'api/cases/:id/dossier', ({ params }) => assembleCase(params.id));

add('GET', 'api/cases/:id/report', ({ params }) => {
  const d = assembleCase(params.id);
  audit('case.report', 'cross', 'case', params.id, `Dossier report generated for case ${d.case.title}`);
  return { ...d, report: { ref: d.case.id, generatedAt: now(), product: 'Forensic & Regulatory Intelligence Suite', provenance: 'This dossier is generated from a local FRIS workspace. All data is synthetic demonstration material and does not represent any real person or company, except regulatory instruments (Regulatory Horizon), which are drawn from real, publicly-sourced references. Analytical scores are illustrative, not factual allegations.' } };
});
add('POST', 'api/notes', ({ body }) => {
  const tt = enumOf(body.target_type, ['entity', 'wallet', 'transaction', 'instrument', 'case', 'scenario', 'finding'], 'entity');
  const tid = String(body.target_id || ''); const text = String(body.body || '').slice(0, 4000);
  if (!tid || !text) throw new HttpError(400, 'target_id and body required');
  T('notes').unshift({ id: nowSeq.v++, target_type: tt, target_id: tid, author: 'demo.analyst', body: text, created_at: now(), data_classification: 'synthetic-demo' });
  audit('note.add', 'cross', tt, tid, 'Note added');
  return { ok: true, notes: T('notes').filter((n) => n.target_type === tt && n.target_id === tid) };
});

add('POST', 'api/bookmarks', ({ body }) => {
  const tt = String(body.target_type || ''), tid = String(body.target_id || '');
  if (!tt || !tid) throw new HttpError(400, 'target_type and target_id required');
  const i = T('bookmarks').findIndex((b) => b.target_type === tt && b.target_id === tid);
  if (i >= 0) { T('bookmarks').splice(i, 1); audit('bookmark.remove', 'cross', tt, tid, 'Bookmark removed'); return { bookmarked: false }; }
  T('bookmarks').unshift({ id: nowSeq.v++, target_type: tt, target_id: tid, label: body.label || '', created_at: now() }); audit('bookmark.add', 'cross', tt, tid, 'Bookmark added'); return { bookmarked: true };
});

// ── Saved views (activate the latent saved_views table) ─────────────────────
// Mirrors GET/POST/DELETE /api/saved-views in src/server/routes.mjs. A saved view
// is a named (route + captured params) bookmark of a configured screen; route +
// params are kept inside config_json and `module` is derived from the route.
const SV_MODULES = ['nexus', 'chainlink', 'waterfall', 'regulatory', 'cross', 'data', 'cases', 'audit', 'overview', 'system'];
function moduleOfRoute(route) {
  const seg = String(route || '').replace(/^#?\/?/, '').split(/[/?]/)[0];
  return SV_MODULES.includes(seg) ? seg : 'cross';
}
function shapeSavedView(v) {
  let cfg = {}; try { cfg = JSON.parse(v.config_json || '{}'); } catch { cfg = {}; }
  return { id: v.id, name: v.name, module: v.module, kind: v.kind, route: cfg.route || '', params: cfg.params && typeof cfg.params === 'object' ? cfg.params : {}, created_at: v.created_at };
}
const savedViewRows = () => T('saved_views').slice().sort((a, b) => (b.id || 0) - (a.id || 0)).map(shapeSavedView);
add('GET', 'api/saved-views', () => ({ rows: savedViewRows() }));
add('POST', 'api/saved-views', ({ body }) => {
  const name = String(body.name || '').slice(0, 120); if (!name) throw new HttpError(400, 'missing required field: name');
  const route = String(body.route || '').slice(0, 400); if (!route) throw new HttpError(400, 'missing required field: route');
  let params = {};
  if (body.params_json !== undefined) { try { params = typeof body.params_json === 'string' ? JSON.parse(body.params_json) : body.params_json; } catch { throw new HttpError(400, 'params_json must be valid JSON'); } }
  else if (body.params && typeof body.params === 'object') params = body.params;
  if (params == null || typeof params !== 'object' || Array.isArray(params)) params = {};
  const module = moduleOfRoute(route);
  const row = { id: nowSeq.v++, module, name, kind: 'filter', config_json: JSON.stringify({ route, params }), created_at: now(), data_classification: 'synthetic-demo' };
  T('saved_views').push(row);
  audit('savedview.create', module, 'saved_view', String(row.id), `Saved view: ${name}`, { route });
  return { ok: true, view: shapeSavedView(row), rows: savedViewRows() };
});
add('DELETE', 'api/saved-views/:id', ({ params }) => {
  const i = T('saved_views').findIndex((v) => String(v.id) === String(params.id));
  if (i < 0) throw new HttpError(404, 'saved view not found');
  const v = T('saved_views')[i];
  T('saved_views').splice(i, 1);
  audit('savedview.delete', v.module, 'saved_view', String(params.id), `Saved view removed: ${v.name}`);
  return { ok: true, rows: savedViewRows() };
});

add('GET', 'api/audit', ({ query }) => {
  let rows = T('audit_log');
  if (query.module) rows = rows.filter((a) => a.module === query.module);
  if (query.action) rows = rows.filter((a) => a.action === query.action);
  return { rows: rows.slice(0, asInt(query.limit, 100, 1, 500)) };
});

add('GET', 'api/settings', () => ({ rows: T('settings') }));

add('GET', 'api/export', ({ query }) => {
  const type = enumOf(query.type, ['entities', 'transactions', 'instruments', 'creditors', 'audit'], 'entities');
  const format = enumOf(query.format, ['json', 'csv'], 'json');
  const pick = (arr, keys) => arr.map((r) => Object.fromEntries(keys.map((k) => [k, r[k]])));
  const map = {
    entities: () => pick(T('entities'), ['id', 'legal_name', 'entity_type', 'jurisdiction', 'status', 'risk_flag', 'verification_status', 'data_classification']),
    transactions: () => pick(T('crypto_transactions').slice(0, 2000), ['id', 'hash', 'from_id', 'to_id', 'asset', 'amount_minor', 'fee_minor', 'ts', 'hop', 'pattern', 'risk_score']),
    instruments: () => pick(T('regulatory_instruments'), ['id', 'title', 'authority', 'jurisdiction', 'sector', 'doc_type', 'publication_date', 'effective_date', 'impact_level', 'impact_score', 'verification_status']),
    creditors: () => pick(T('creditors'), ['id', 'case_id', 'name', 'class', 'currency', 'claim_minor', 'admitted_pct']),
    audit: () => pick(T('audit_log').slice(0, 1000), ['id', 'ts', 'actor', 'action', 'module', 'summary']),
  };
  const rows = map[type]();
  audit('export', 'system', 'dataset', type, `Exported ${rows.length} ${type} rows as ${format.toUpperCase()}`);
  if (format === 'csv') return { filename: `fris-${type}.csv`, mime: 'text/csv', content: toCsv(rows) };
  return { filename: `fris-${type}.json`, mime: 'application/json', content: JSON.stringify(rows, null, 2) };
});

add('POST', 'api/data/reset', ({ body }) => {
  if (String(body.confirm) !== 'RESET') throw new HttpError(400, 'confirmation required: send {"confirm":"RESET"}');
  DB = clone(RAW); audit('data.reset', 'system', 'dataset', 'seed', 'Demonstration data reset');
  return { ok: true, counts: Object.fromEntries(Object.keys(DB).map((t) => [t, T(t).length])) };
});

// -- Quarterly Financial Report (mirrors the server's /api/financials/* routes) --
// Deterministic corporate financials over a SYNTHETIC fictional company, served
// straight from the SAME pure reporting engine the Node server uses. Every figure
// is invented and generated deterministically; NOT a set of accounts.
add('GET', 'api/financials/quarters', () => listFinancialQuarters());

add('GET', 'api/financials/report', ({ query }) => {
  const list = listFinancialQuarters();
  const known = list.quarters.map((q) => q.quarter);
  const quarter = enumOf(String(query.quarter || ''), known, list.latest);
  return computeFinancialReport(quarter);
});

// -- Third-Party / Vendor Risk (mirrors the server's /api/vendors/* routes) -----
// A continuously-scored counterparty risk file that AGGREGATES signals from the
// other modules into one composite score, running the SAME pure vendorRisk engine
// the Node server uses over the in-memory directory (entities + jurisdictions).
// Reviews are session-scoped (held in memory, audited). NOT a TPRM system of record.
const VENDOR_REVIEWS = new Map();

function vendorSignalsFor(vendor, ctx) {
  const { nodes, edges, jmap } = ctx;
  let flightRisk = null;
  if (vendor.entityId) {
    const e = nodes.find((n) => n.id === vendor.entityId);
    if (e) {
      const summary = structureSummary(nodes, edges, vendor.entityId);
      const fr = computeFlightRisk(flightInput(summary, !!e._offshore, e));
      flightRisk = { entityId: vendor.entityId, score: fr.score, band: fr.band, structure: summary, factors: fr.factors };
    }
  }
  const res = runScreening({ name: vendor.name, kindHint: 'organisation' }, WATCHLIST_ENTRIES, { limit: 1 });
  const top = res.matches[0] || null;
  const screening = top ? { matched: true, score: top.score, band: top.band, list: top.list, listLabel: top.listLabel, matchedName: top.matchedName, program: top.program } : null;
  return { flightRisk, screening, jurisdiction: jmap[vendor.homeJurisdiction] || null };
}
function vendorContext() {
  const { nodes, edges } = fullGraph();
  return { nodes, edges, jmap: JMAP() };
}
function withVendorReview(scored) {
  const d = VENDOR_REVIEWS.get(scored.vendorId);
  return { ...scored, review: d ? { status: d.status, note: d.note, ts: d.ts, reviewer: d.reviewer } : { status: 'open', note: '', ts: null, reviewer: null } };
}

add('GET', 'api/vendors', ({ query }) => {
  const ctx = vendorContext();
  const all_ = scoreAllVendors({ signalsFor: (v) => vendorSignalsFor(v, ctx), jurisdictions: ctx.jmap, asOf: VENDOR_AS_OF });
  const rating = enumOf(query.rating, VENDOR_RATING_BANDS.map((b) => b.code), '');
  const category = enumOf(query.category, VENDOR_CATEGORIES.map((c) => c.code), '');
  const jurisdiction = String(query.jurisdiction || '').slice(0, 12);
  let rows = all_.vendors;
  if (rating) rows = rows.filter((v) => v.rating === rating);
  if (category) rows = rows.filter((v) => v.category === category);
  if (jurisdiction) rows = rows.filter((v) => v.homeJurisdiction === jurisdiction);
  return {
    vendors: rows.map(withVendorReview),
    summary: all_.summary,
    ratingBands: all_.ratingBands,
    categories: VENDOR_CATEGORIES.map((c) => ({ code: c.code, label: c.label, blurb: c.blurb, color: c.color })),
    contractStatuses: CONTRACT_STATUSES.map((s) => ({ code: s.code, label: s.label, color: s.color })),
    version: VENDOR_VERSION, disclaimer: VENDOR_DISCLAIMER,
  };
});

add('GET', 'api/vendors/:id', ({ params }) => {
  const vendor = VENDOR_BY_ID[params.id];
  if (!vendor) throw new HttpError(404, 'vendor not found');
  const ctx = vendorContext();
  const sig = vendorSignalsFor(vendor, ctx);
  const scored = withVendorReview(scoreVendorRisk(vendor, { ...sig, asOf: VENDOR_AS_OF }));
  let linkedEntity = null;
  if (vendor.entityId) {
    const e = byId('entities', vendor.entityId);
    if (e) linkedEntity = { id: e.id, legal_name: e.legal_name, entity_type: e.entity_type, jurisdiction: e.jurisdiction, risk_flag: e.risk_flag, status: e.status, flightRisk: sig.flightRisk ? { score: sig.flightRisk.score, band: sig.flightRisk.band, factors: (sig.flightRisk.factors || []).slice(0, 5) } : null };
  }
  const screeningRes = runScreening({ name: vendor.name, kindHint: 'organisation' }, WATCHLIST_ENTRIES, { limit: 5 });
  const jr = ctx.jmap[vendor.homeJurisdiction] || null;
  return {
    vendor: scored, linkedEntity,
    screening: { query: vendor.name, matches: screeningRes.matches, counts: screeningRes.counts, disclaimer: screeningRes.disclaimer },
    jurisdiction: jr ? { code: jr.code, name: jr.name, secrecy: jr.secrecy_score, offshore: !!jr.is_offshore } : null,
    ratingBands: VENDOR_RATING_BANDS.map((b) => ({ code: b.code, min: b.min, color: b.color, blurb: b.blurb })),
    history: scored.review && scored.review.ts ? [{ status: scored.review.status, note: scored.review.note, ts: scored.review.ts, reviewer: scored.review.reviewer }] : [],
    disclaimer: VENDOR_DISCLAIMER,
  };
});

add('POST', 'api/vendors/:id/review', ({ params, body }) => {
  const vendor = VENDOR_BY_ID[params.id];
  if (!vendor) throw new HttpError(404, 'vendor not found');
  const status = enumOf(body.status, ['approved', 'approved-with-conditions', 'rejected', 'escalated', 'open'], 'open');
  const note = String(body.note || '').slice(0, 2000);
  if (status === 'open') VENDOR_REVIEWS.delete(params.id);
  else VENDOR_REVIEWS.set(params.id, { status, note, ts: now(), reviewer: 'demo.analyst' });
  audit('vendor.review', 'vendors', 'vendor', params.id, `Vendor review ${status}: ${vendor.name}`, { status, category: vendor.category, homeJurisdiction: vendor.homeJurisdiction });
  const d = VENDOR_REVIEWS.get(params.id);
  return { vendorId: params.id, review: d ? { status: d.status, note: d.note, ts: d.ts, reviewer: d.reviewer } : { status: 'open', note: '', ts: null, reviewer: null } };
});

// -- Country & Sector Risk Index (mirrors the server's /api/risk-index/* routes) --
// A sourced, CATEGORICAL jurisdiction × risk-dimension heat-map / index over the
// illustrative reference tables (data/countryRisk.mjs), composed by the SAME pure
// engine the Node server uses. The engine reuses REAL, publicly-sourced FRIS facts
// where they exist — a jurisdiction's own secrecy score + offshore flag from the
// in-memory `jurisdictions` data — to derive the financial-secrecy band and cite it;
// everything else is an illustrative categorical posture. NOT a system of record.
function riskSeededByCode() {
  return Object.fromEntries(T('jurisdictions').map((j) => [j.code, j]));
}

add('GET', 'api/risk-index/matrix', () => countryMatrix({ seededByCode: riskSeededByCode() }));

add('GET', 'api/risk-index/sectors', () => countrySectorRisk());

add('GET', 'api/risk-index/jurisdiction/:code', ({ params }) => {
  const seededByCode = riskSeededByCode();
  const seeded = seededByCode[params.code] || null;
  const profile = countryJurisdictionRisk(params.code, { seeded });
  if (!profile) throw new HttpError(404, 'jurisdiction not in the country-risk index');
  // Entities registered in this jurisdiction (seeded Nexus data) — a small sample.
  const allEnt = T('entities').filter((e) => e.jurisdiction === params.code);
  const entities = allEnt.slice().sort((a, b) => ((b.risk_flag === 'High') - (a.risk_flag === 'High')) || String(a.id).localeCompare(String(b.id))).slice(0, 12)
    .map((e) => ({ id: e.id, name: e.legal_name, type: e.entity_type, risk: e.risk_flag, status: e.status }));
  // Vendors whose home jurisdiction is this code (synthetic register).
  const vendors = Object.values(VENDOR_BY_ID).filter((v) => v.homeJurisdiction === params.code)
    .map((v) => ({ id: v.id, name: v.name, category: v.category, criticality: v.criticality, entityId: v.entityId || null }));
  // Applicable REAL regulations: real instruments whose jurisdiction matches this
  // jurisdiction's country / region (a genuine, cited fact — links to the source).
  const regJuris = riskRegJurisdictionNamesFor(profile);
  const regSet = new Set(regJuris);
  const regs = regJuris.length
    ? T('regulatory_instruments').filter((r) => regSet.has(r.jurisdiction)).slice()
      .sort((a, b) => String(a.jurisdiction).localeCompare(String(b.jurisdiction)) || String(a.id).localeCompare(String(b.id))).slice(0, 12)
      .map((r) => ({ id: r.id, title: r.title, authority: r.authority, jurisdiction: r.jurisdiction, sector: r.sector, sourceUrl: r.source_url }))
    : [];
  return {
    profile,
    entities: { rows: entities, total: allEnt.length },
    vendors,
    regulations: regs,
    country: profile.country,
    disclaimer: COUNTRY_RISK_DISCLAIMER,
  };
});

add('GET', 'api/risk-index/combined', ({ query }) => {
  const jurisdiction = String(query.jurisdiction || '').slice(0, 12);
  const sector = String(query.sector || '').slice(0, 40);
  if (!jurisdiction || !COUNTRY_RISK_BY_CODE[jurisdiction]) throw new HttpError(400, 'valid jurisdiction required');
  if (!sector || !COUNTRY_SECTOR_BY_CODE[sector]) throw new HttpError(400, 'valid sector required');
  const seededByCode = riskSeededByCode();
  const result = countryCombined(jurisdiction, sector, { seeded: seededByCode[jurisdiction] || null });
  if (!result) throw new HttpError(404, 'combination not found');
  return { ...result, disclaimer: COUNTRY_RISK_DISCLAIMER };
});

// Map a country-risk profile to the regulatory `jurisdiction` label(s) that carry
// real instruments in the seeded register (Switzerland cantons roll up to
// Switzerland/Geneva; EU codes roll up to the European Union). Real, cited facts.
function riskRegJurisdictionNamesFor(profile) {
  const out = new Set();
  if (profile.region === 'Switzerland') { out.add('Switzerland'); out.add('Geneva'); }
  else if (profile.region === 'European Union') { out.add('European Union'); }
  else if (profile.country) { out.add(profile.country); }
  const present = new Set(T('regulatory_instruments').map((r) => r.jurisdiction));
  return [...out].filter((j) => present.has(j));
}


// -- KYC / Onboarding & Identity-Risk Workflow (mirrors the server's /api/onboarding/*) --
// A Customer Due Diligence (CDD) intake that produces an EXPLAINABLE customer-risk
// rating + review cadence over a SYNTHETIC applicant register (data/onboarding.mjs),
// composed by the SAME pure engine the Node server uses. For each applicant the
// engine CONSUMES the Screening best hit, the Adverse-Media composite for the linked
// Nexus entity, and the composed jurisdiction + inherent sector band from the Country
// & Sector Risk Index. A strong synthetic sanctions match is a surfaced hard-stop that
// floors the rating to Prohibited. NOT a KYC / onboarding system of record.
function onboardingCtx() {
  return { jurisdictions: JMAP(), asOf: ONBOARDING_AS_OF };
}

add('GET', 'api/onboarding/applicants', ({ query }) => {
  const rating = enumOf(query.rating, ONBOARDING_RATING_BANDS.map((b) => b.code), '');
  const stage = enumOf(query.stage, ONBOARDING_STAGES.map((s) => s.code), '');
  return onboardingApplicants({ ...onboardingCtx(), rating: rating || undefined, status: stage || undefined });
});

add('GET', 'api/onboarding/queue', () => onboardingQueue(onboardingCtx()));

add('GET', 'api/onboarding/summary', () => onboardingSummary(onboardingCtx()));

add('GET', 'api/onboarding/assess/:id', ({ params }) => {
  const out = onboardingAssess(params.id, onboardingCtx());
  if (!out) throw new HttpError(404, 'applicant not found');
  let linkedEntity = null;
  if (out.entityId) {
    const e = byId('entities', out.entityId);
    if (e) linkedEntity = { id: e.id, name: e.legal_name, type: e.entity_type, jurisdiction: e.jurisdiction, risk: e.risk_flag, status: e.status };
  }
  return { ...out, linkedEntity };
});

// -- Laundering / Illicit-Finance Typology Studio (mirrors the server's /api/typology/*) --
// A build-your-own financial-crime scenario lab (the WILDCARD capstone). The SAME
// pure engine the Node server uses GENERATES the synthetic artefacts for a composed
// typology (placement -> layering -> integration), then RUNS the REAL FRIS detectors
// (Transaction-Monitoring rules, the Chain-Link crypto battery, sanctions screening,
// the ownership-graph opacity summary, the Liquidation Waterfall) over them and
// reports a money-flow narrative + a detector-coverage report (caught vs gaps +
// score). 100% SYNTHETIC + deterministic; a training / simulation sandbox; NOT
// operational advice and NOT a detection system of record.
add('GET', 'api/typology/catalogue', () => typologyCatalogue());

add('GET', 'api/typology/preset/:id', ({ params }) => {
  const spec = typologyPreset(params.id);
  if (!spec) throw new HttpError(404, 'typology preset not found');
  return { spec };
});

add('POST', 'api/typology/simulate', ({ body }) => {
  const seed = asInt(body.seed, 71011, 0, 2147483647);
  const rawStages = Array.isArray(body.stages) ? body.stages.slice(0, TYPOLOGY_MAX_STAGES) : [];
  const stages = rawStages
    .filter((x) => x && typeof x.block === 'string')
    .map((x) => ({ block: String(x.block).slice(0, 40), params: (x.params && typeof x.params === 'object') ? x.params : {} }));
  const result = typologySimulate({ seed, name: (body.name ? String(body.name).slice(0, 80) : null), stages });
  audit('simulate', 'typology', 'scenario', null, `Typology simulation run (${result.stages.length} stages, coverage ${result.coverage.score}%)`);
  return result;
});

// -- Litigation & Enforcement-Action Tracker (mirrors the server's /api/enforcement/*) --
// A REAL, CITED corpus of sixteen public-record regulator fines / enforcement
// decisions (data/enforcement.mjs), with deterministic trend analytics computed by
// the SAME pure engine the Node server uses. Every figure is verbatim; native amount
// + currency is authoritative, approxUsd is illustrative FX for chart scale only,
// and appeal / annulled statuses are surfaced honestly. NOT a complete register.
add('GET', 'api/enforcement/actions', ({ query }) => {
  const category = enumOf(query.category, Object.keys(ENF_CAT_BY_CODE), '');
  const regulator = String(query.regulator || '').slice(0, 40);
  const jurisdiction = String(query.jurisdiction || '').slice(0, 80);
  const status = enumOf(query.status, ['appeal', 'annulled', 'final'], '');
  const year = query.year != null && query.year !== '' ? asInt(query.year, null, 1990, 2100) : null;
  const q = String(query.q || '').slice(0, 120);
  const sort = enumOf(query.sort, ENF_SORT_KEYS, 'date');
  return enfListActions({ sort, filter: { category: category || undefined, regulator: regulator || undefined, jurisdiction: jurisdiction || undefined, status: status || undefined, year, q: q || undefined } });
});

add('GET', 'api/enforcement/actions/:id', ({ params }) => {
  const out = enfGetAction(params.id);
  if (!out) throw new HttpError(404, 'enforcement action not found');
  return out;
});

add('GET', 'api/enforcement/analytics', () => enfAnalytics());

add('GET', 'api/enforcement/trends', () => enfTrends());

// -- Market-Abuse / Trade Surveillance (mirrors the server's /api/surveillance/*) --
// Deterministic, EXPLAINABLE MAR-style market-abuse detectors over a 100% SYNTHETIC
// order book (data/surveillance.mjs), run by the SAME pure engine the Node server
// uses. The detector LOGIC mirrors real MAR / Dodd-Frank / CEA typologies (insider
// dealing, spoofing/layering, wash trading); every datum is fabricated and every
// alert is illustrative, not a factual accusation. NOT a system of record.
add('GET', 'api/surveillance/alerts', ({ query }) => {
  const type = enumOf(query.type, Object.keys(SURV_TYPE_BY_CODE), '');
  const severity = enumOf(query.severity, Object.keys(SURV_SEV_BY_CODE), '');
  const instrument = enumOf(query.instrument, Object.keys(SURV_INSTRUMENT_BY_SYMBOL), '');
  const q = String(query.q || '').slice(0, 120);
  return survAlerts({ type: type || undefined, severity: severity || undefined, instrument: instrument || undefined, q: q || undefined });
});

add('GET', 'api/surveillance/alerts/:id', ({ params }) => {
  const out = survAlert(params.id);
  if (!out) throw new HttpError(404, 'surveillance alert not found');
  return out;
});

add('GET', 'api/surveillance/orderbook', ({ query }) => {
  const instrument = enumOf(query.instrument, Object.keys(SURV_INSTRUMENT_BY_SYMBOL), Object.keys(SURV_INSTRUMENT_BY_SYMBOL)[0]);
  const out = survOrderBook({ instrument });
  if (!out) throw new HttpError(404, 'instrument not found');
  return out;
});

add('GET', 'api/surveillance/insiders', () => survInsiderList());

// -- Adverse-Media / OSINT Monitoring (mirrors the server's /api/adverse-media/*) --
// Deterministic negative-news classification + entity-linked rollup over the
// SYNTHETIC corpus (data/adverseMedia.mjs), running the SAME pure engine the Node
// server uses. Dispositions are session-scoped (held in memory, audited). NOT an
// adverse-media / OSINT system of record; every item is synthetic demonstration output.
const ADVERSE_DISPOSITIONS = new Map();
function withAdverseDisposition(item) {
  const d = ADVERSE_DISPOSITIONS.get(item.id);
  return { ...item, disposition: d ? { status: d.status, note: d.note, ts: d.ts } : { status: 'open', note: '', ts: null } };
}

add('GET', 'api/adverse-media/feed', ({ query }) => {
  const category = enumOf(query.category, AM_CATEGORIES.map((c) => c.code), '');
  const severity = enumOf(query.severity, AM_SEVERITIES.map((s) => s.code), '');
  const sentiment = enumOf(query.sentiment, ['negative', 'neutral', 'mixed'], '');
  const subjectId = String(query.subject || '').slice(0, 24);
  const q = String(query.q || '').slice(0, 120);
  const out = adverseFeed({ category: category || undefined, severity: severity || undefined, sentiment: sentiment || undefined, subjectId: subjectId || undefined, q: q || undefined, asOf: AM_AS_OF });
  return { ...out, items: out.items.map(withAdverseDisposition) };
});

add('GET', 'api/adverse-media/subject/:subjectId', ({ params }) => {
  const profile = adverseSubjectProfile(params.subjectId, { asOf: AM_AS_OF });
  const ent = byId('entities', params.subjectId) || null;
  const entity = ent ? { id: ent.id, legal_name: ent.legal_name, entity_type: ent.entity_type, jurisdiction: ent.jurisdiction, risk_flag: ent.risk_flag, status: ent.status } : null;
  const vendor = VENDOR_BY_ID[params.subjectId] || null;
  return { profile, entity, vendor: vendor ? { id: vendor.id, name: vendor.name, category: vendor.category, homeJurisdiction: vendor.homeJurisdiction, entityId: vendor.entityId || null } : null, disclaimer: ADVERSE_MEDIA_DISCLAIMER };
});

add('GET', 'api/adverse-media/:id', ({ params }) => {
  const item = ADVERSE_MEDIA_BY_ID[params.id];
  if (!item) throw new HttpError(404, 'adverse-media item not found');
  const classified = withAdverseDisposition(classifyAdverse(item));
  const subjects = (item.subjects || []).map((s) => {
    const prof = adverseSubjectProfile(s.id, { asOf: AM_AS_OF });
    const ent = byId('entities', s.id) || null;
    const vendor = VENDOR_BY_ID[s.id] || null;
    return { id: s.id, name: s.name, type: s.type, adverseMediaScore: prof.adverseMediaScore, riskBand: prof.riskBand, riskColor: prof.riskColor, itemCount: prof.itemCount, peakSeverity: prof.peakSeverity, entity: ent ? { id: ent.id, legal_name: ent.legal_name, entity_type: ent.entity_type, jurisdiction: ent.jurisdiction, risk_flag: ent.risk_flag } : null, vendorId: vendor ? vendor.id : null, entityId: vendor && vendor.entityId ? vendor.entityId : (ent ? ent.id : null) };
  });
  return { item: classified, subjects, disclaimer: ADVERSE_MEDIA_DISCLAIMER };
});

add('POST', 'api/adverse-media/:id/disposition', ({ params, body }) => {
  const item = ADVERSE_MEDIA_BY_ID[params.id];
  if (!item) throw new HttpError(404, 'adverse-media item not found');
  const status = enumOf(body.status, ['relevant', 'not-relevant', 'open'], 'open');
  const note = String(body.note || '').slice(0, 2000);
  if (status === 'open') ADVERSE_DISPOSITIONS.delete(params.id);
  else ADVERSE_DISPOSITIONS.set(params.id, { status, note, ts: now() });
  audit('adverse-media.disposition', 'adverse-media', 'item', params.id, `Adverse-media item ${status}: ${item.headline.slice(0, 80)}`, { category: item.category, severity: item.severity, subjects: (item.subjects || []).map((s) => s.id) });
  const d = ADVERSE_DISPOSITIONS.get(params.id);
  return { itemId: params.id, disposition: d ? { status: d.status, note: d.note, ts: d.ts } : { status: 'open', note: '', ts: null } };
});

// -- Obligation → Control Register (GRC system-of-record) (mirrors /api/grc/*) --
// A persistent obligation→control→owner→evidence→test mapping with a live
// compliance-posture matrix. OBLIGATIONS are REAL (genuine high-level requirements
// of real frameworks already in FRIS — GDPR, UK GDPR, revFADP, ISO/IEC 27001,
// ISO/IEC 27701, DORA, NIS2, EU AMLR, Swiss AMLA, EU–US DPF — with real
// article/clause citations, data/grc.mjs), computed by the SAME pure engine the
// Node server uses. The compliance POSTURE (owners as fictional org roles, status,
// dates, results, evidence refs) is 100% SYNTHETIC, deterministic demonstration
// data seeded from a fixed PRNG. NOT a claim about a real organisation's controls.
add('GET', 'api/grc/register', ({ query }) => {
  const framework = enumOf(query.framework, Object.keys(GRC_FW_BY_CODE), '');
  const status = enumOf(query.status, Object.keys(GRC_STATUS_BY_CODE), '');
  const owner = String(query.owner || '').slice(0, 60);
  const q = String(query.q || '').slice(0, 120);
  return grcRegister({ framework: framework || undefined, status: status || undefined, owner: owner || undefined, q: q || undefined });
});

add('GET', 'api/grc/obligation/:id', ({ params }) => {
  const out = grcObligation(params.id);
  if (!out) throw new HttpError(404, 'obligation not found');
  return out;
});

add('GET', 'api/grc/posture', () => grcPostureMatrix());

add('GET', 'api/grc/gaps', () => grcGaps());

add('GET', 'api/grc/owners', () => grcOwners());

add('GET', 'api/grc/summary', () => grcSummary());

// -- Asset Tracing & Recovery (Module 13 - the cross-suite CAPSTONE) -----------
// A follow-the-asset recovery map that JOINS the three existing datasets (Sovereign
// Nexus ownership graph + entity assets, Chain-Link wallet balances, Liquidation
// Waterfall estates) into one recovery view per debtor. Mirrors src/server/routes.mjs
// exactly: the pure engine is fed a snapshot of the REAL seeded tables + the live
// sanctions overlay, so the browser build returns byte-identical results.
function recoverySnapshot() {
  let sanctionedEntityIds = [], sanctionedWalletIds = [];
  try { const overlay = deriveScreeningOverlay(computePortfolioHits({})); sanctionedEntityIds = overlay.sanctionedEntityIds || []; sanctionedWalletIds = overlay.sanctionedWalletIds || []; } catch { /* overlay optional */ }
  return {
    entities: T('entities'), relationships: T('relationships'), jurisdictions: T('jurisdictions'),
    entity_assets: T('entity_assets'), wallets: T('wallets'), clusters: T('clusters'),
    insolvency_cases: T('insolvency_cases'), estate_assets: T('estate_assets'), creditors: T('creditors'),
    sanctionedEntityIds, sanctionedWalletIds,
  };
}
add('GET', 'api/recovery/targets', () => recoveryTargets(recoverySnapshot()));
add('GET', 'api/recovery/trace/:targetId', ({ params }) => { const out = recoveryTrace(recoverySnapshot(), params.targetId); if (!out) throw new HttpError(404, 'recovery target not found'); return out; });
add('GET', 'api/recovery/summary/:targetId', ({ params }) => { const out = recoverySummaryFn(recoverySnapshot(), params.targetId); if (!out) throw new HttpError(404, 'recovery target not found'); return out; });
add('GET', 'api/recovery/assets/:targetId', ({ params, query }) => { const band = enumOf(query.band, Object.keys(RECOVERY_BAND_BY_CODE), ''); const out = recoveryAssets(recoverySnapshot(), params.targetId, band || undefined); if (!out) throw new HttpError(404, 'recovery target not found'); return out; });

// -- Patch window.fetch so the existing UI works unchanged -----------------------
export function installFetch() {
  const real = (typeof window !== 'undefined' ? window.fetch : globalThis.fetch)?.bind(typeof window !== 'undefined' ? window : globalThis);
  const patched = async (input, init) => {
    const raw = typeof input === 'string' ? input : (input && input.url) || '';
    const isApi = raw.startsWith('/api/') || /^https?:\/\/[^/]+\/api\//i.test(raw);
    if (!isApi) return real(input, init);
    const apiStr = raw.slice(raw.indexOf('/api/'));
    const qi = apiStr.indexOf('?');
    const pathname = qi >= 0 ? apiStr.slice(0, qi) : apiStr;
    const query = {}; if (qi >= 0) for (const [k, v] of new URLSearchParams(apiStr.slice(qi + 1))) query[k] = v;
    const method = (init && init.method) || 'GET';
    let body = {}; if (init && init.body) { try { body = JSON.parse(init.body); } catch { body = {}; } }
    try {
      const data = handle(method, pathname, query, body);
      return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message || 'error' }), { status: e.status || 500, headers: { 'Content-Type': 'application/json' } });
    }
  };
  globalThis.fetch = patched;
  if (typeof window !== 'undefined') window.fetch = patched;
}

// Bootstrap: load data, patch fetch, then start the app.
export async function start() {
  await loadData();
  installFetch();
  await import('./app.js');
}

// Auto-start when loaded in a browser: the multi-file index.html loads this
// module and the single-file bundle requires it as its entry point. Test
// harnesses set window.__FRIS_NO_AUTOSTART__ to drive the modules themselves.
if (typeof window !== 'undefined' && !window.__FRIS_NO_AUTOSTART__) start();
