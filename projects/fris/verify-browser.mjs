// Browser-build verifier (run in Node with a DOM shim). Proves the browser-only
// build renders every view and passes the critical workflows using the in-browser
// API (browser-api.js) + pure engines, with NO server. Safe to delete.
import { writeSync, readFileSync } from 'node:fs';
const log = (m) => writeSync(1, m + '\n');

class FakeNode {
  constructor(tag = 'div') { this.tagName = String(tag).toUpperCase(); this.children = []; this.attributes = {}; this.dataset = {}; this.style = {}; this.className = ''; this.value = ''; this._text = ''; this._html = ''; const s = new Set(); this.classList = { add: (x) => s.add(x), remove: (x) => s.delete(x), toggle: (x, f) => (f ? s.add(x) : s.delete(x)), contains: (x) => s.has(x) }; }
  appendChild(c) { this.children.push(c); return c; } append(...cs) { for (const c of cs) if (c != null) this.children.push(c); } prepend(...cs) { this.children.unshift(...cs); }
  replaceChildren(...cs) { this.children = cs.filter((c) => c != null); } removeChild(c) { this.children = this.children.filter((x) => x !== c); } replaceWith() {} remove() {}
  insertBefore(c) { this.children.unshift(c); return c; } setAttribute(k, v) { this.attributes[k] = v; } setAttributeNS(_n, k, v) { this.attributes[k] = v; } getAttribute(k) { return this.attributes[k]; } removeAttribute(k) { delete this.attributes[k]; }
  addEventListener() {} removeEventListener() {} dispatchEvent() {} getBoundingClientRect() { return { width: 960, height: 480, left: 0, top: 0, right: 960, bottom: 480 }; }
  querySelector() { return new FakeNode(); } querySelectorAll() { return []; } closest() { return null; } focus() {} click() {} blur() {} getContext() { return {}; }
  get firstChild() { return this.children[0] || null; } get textContent() { return this._text; } set textContent(v) { this._text = v; }
  get innerHTML() { return this._html; } set innerHTML(v) { this._html = v; this.children = [new FakeNode('svg')]; } get nextSibling() { return new FakeNode(); } get parentNode() { return null; }
}
const doc = { createElement: (t) => new FakeNode(t), createElementNS: (_n, t) => new FakeNode(t), createTextNode: (t) => Object.assign(new FakeNode('#text'), { _text: String(t) }), getElementById: () => new FakeNode(), querySelector: () => new FakeNode(), querySelectorAll: () => [], addEventListener: () => {}, removeEventListener: () => {}, body: new FakeNode('body'), documentElement: new FakeNode('html') };
globalThis.Node = FakeNode; globalThis.document = doc;
globalThis.window = { innerWidth: 1440, innerHeight: 900, addEventListener: () => {}, removeEventListener: () => {}, matchMedia: () => ({ matches: false, addEventListener() {} }) };
globalThis.requestAnimationFrame = (f) => setTimeout(f, 0); globalThis.location = { hash: '#/overview', href: 'http://localhost/' }; globalThis.prompt = () => null; globalThis.getComputedStyle = () => ({});
globalThis.window.location = globalThis.location;
globalThis.window.__FRIS_NO_AUTOSTART__ = true;
globalThis.window.__FRIS_DATA__ = JSON.parse(readFileSync(new URL('./data.json', import.meta.url)));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let warnings = 0; process.on('unhandledRejection', () => warnings++);
function countNodes(n, seen) { seen = seen || new Set(); if (!n || typeof n !== 'object' || seen.has(n)) return 0; seen.add(n); let c = 1; for (const k of n.children || []) c += (k && k.children) ? countNodes(k, seen) : 1; return c; }

async function main() {
  const B = await import('./browser-api.js');
  await B.loadData(); B.installFetch();
  const health = await (await fetch('/api/health')).json();
  if (!health.ok || health.mode !== 'browser') throw new Error('browser API not ready');
  const V1 = await import('./views1.js'); const V2 = await import('./views2.js'); const V3 = await import('./views3.js'); const V6 = await import('./views6.js');
  const suite = [
    ['Executive Overview', V1.overview, []], ['Nexus · Network', V1.nexus, ['network']], ['Nexus · Directory', V1.nexus, ['directory']], ['Nexus · Map', V1.nexus, ['map']],
    ['Chain-Link · Graph', V1.chainlink, ['graph']], ['Chain-Link · Simulator', V1.chainlink, ['simulator']], ['Chain-Link · Wallets', V1.chainlink, ['wallets']], ['Chain-Link · Alerts', V1.chainlink, ['alerts']],
    ['Waterfall · Cases', V2.waterfall, []], ['Waterfall · Case detail', V2.waterfall, ['INS-001']],
    ['Regulatory · Feed', V2.regulatory, ['feed']], ['Regulatory · Upcoming', V2.regulatory, ['upcoming']], ['Regulatory · Sandbox', V2.regulatory, ['sandbox']], ['Regulatory · Imports', V2.regulatory, ['imports']],
    ['Compliance Sandbox', V3.compliance, []],
    ['Financial Report - latest', V6.financials, []], ['Financial Report - FY2025 Q4', V6.financials, ['FY2025%20Q4']], ['Financial Report - FY2024 Q1', V6.financials, ['FY2024%20Q1']],
    ['Data Management', V2.data, []], ['Saved Cases', V2.cases, []], ['Audit Log', V2.audit, []], ['System Settings', V2.settings, []],
  ];
  let pass = 0, fail = 0;
  for (const [name, fn, parts] of suite) {
    const root = new FakeNode();
    try { await Promise.race([fn(root, parts), sleep(3500).then(() => { throw new Error('render timeout'); })]); await sleep(60); const c = countNodes(root); if (c < 3) throw new Error(`only ${c} nodes`); log(`  ok   ${name}  (${c} nodes)`); pass++; }
    catch (e) { log(`  FAIL ${name}: ${e.message}`); fail++; }
  }
  const flows = []; const assert = (c, l) => flows.push([!!c, l]);
  const sim = await (await fetch('/api/crypto/simulate', { method: 'POST', body: JSON.stringify({ seed: 3, hops: 55 }) })).json();
  assert(sim.summary.hopCount >= 50, 'peel-chain ≥50 hops'); assert(sim.summary.conserved === true, 'value conserved');
  const w1 = await (await fetch('/api/insolvency/cases/INS-001/waterfall', { method: 'POST', body: JSON.stringify({ assumptions: { recoveryDelta: 0 } }) })).json();
  const w2 = await (await fetch('/api/insolvency/cases/INS-001/waterfall', { method: 'POST', body: JSON.stringify({ assumptions: { recoveryDelta: -40 } }) })).json();
  assert(w1.waterfall.distributableEstate.minor !== w2.waterfall.distributableEstate.minor, 'assumption changes distributions');
  const cmp = await (await fetch('/api/regulatory/compare', { method: 'POST', body: JSON.stringify({ instrumentId: 'REG-0001', policyId: 'POL-005', save: true }) })).json();
  assert(cmp.findings.length > 0, 'comparison produces findings'); assert(cmp.sessionId, 'session persists');
  const full = await (await fetch('/api/comparisons/' + cmp.sessionId)).json();
  if (full.findings[0]) { const pr = await fetch('/api/findings/' + full.findings[0].id, { method: 'PATCH', body: JSON.stringify({ analyst_status: 'Requires Review' }) }); assert(pr.ok, 'finding marked for review'); }
  const exp = await (await fetch('/api/export?type=entities&format=csv')).json();
  assert(exp.content && exp.content.includes(','), 'export produces CSV');
  const g = await (await fetch('/api/graph?focus=ENT-0001&depth=2')).json();
  assert(g.nodes.length > 0, 'graph filter works');
  const finRep = await (await fetch('/api/financials/report?quarter=' + encodeURIComponent('FY2025 Q4'))).json();
  const finWf = finRep.cashflowWaterfall; const finBridge = finWf.openingCash + finWf.steps.filter((x) => x.kind === 'delta').reduce((a, x) => a + x.delta, 0);
  assert(finWf.bridges === true && finBridge === finWf.closingCash, 'financials waterfall bridges opening->closing');
  assert(finRep.segments.rows.reduce((a, r) => a + r.revenue, 0) === finRep.pnl.totals.revenue && finRep.segments.shareSum === 100, 'financials segments reconcile to revenue');
  let wp = 0; log('\n  Workflows:'); for (const [ok, l] of flows) { log(`  ${ok ? 'ok  ' : 'FAIL'} ${l}`); ok ? wp++ : fail++; }
  log(`\n  BROWSER BUILD — Views ${pass}/${suite.length} · Workflows ${wp}/${flows.length} · warnings ${warnings}`);
  log(fail ? '  RESULT: FAIL' : '  RESULT: PASS'); process.exit(fail ? 1 : 0);
}
main().catch((e) => { log('harness error: ' + (e && e.stack || e)); process.exit(1); });
