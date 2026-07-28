// Views: Executive Overview, Sovereign Nexus, Chain-Link Engine.
import { el, api, fmt, icon, kpi, card, dataTable, riskBadge, statusBadge, classBadge, openDrawer, toast, emptyState, errorState, skeleton, meter, confirmDialog, modal, helpButton, clickableRow, infoDot } from './core.js';
import { donut, barChart, jurisdictionMap } from './viz.js';
import { flowGraph } from './graph.js';
import { chainTrace } from './chainTrace.js';

export function intro(lead, rest) {
  return el('div', { class: 'intro' }, el('span', { class: 'ico' }, icon('info', 18)), el('div', { class: 't' }, el('b', {}, lead + ' '), rest));
}
export function pageHead(title, sub, actions = []) {
  return el('div', { class: 'page-head' }, el('div', {}, el('h1', { class: 'page-title' }, title), sub ? el('div', { class: 'page-sub' }, sub) : null), el('div', { class: 'page-actions' }, ...actions, helpButton()));
}
export function tabsBar(items, active, onSelect) {
  // ARIA tablist: role=tablist on the wrapper, role=tab + aria-selected + roving
  // tabindex on each tab, and Left/Right/Home/End arrow-key navigation between tabs
  // (ARIA APG). Activating a tab navigates (changes the hash), which re-renders.
  const tabs = [];
  const focusTab = (i) => { const n = tabs[(i + tabs.length) % tabs.length]; if (n && n.focus) { try { n.focus(); } catch (_e) {} } };
  const wrap = el('div', { class: 'tabs', role: 'tablist' });
  items.forEach(([k, l], idx) => {
    const selected = k === active;
    const t = el('div', {
      class: 'tab' + (selected ? ' active' : ''), role: 'tab', 'aria-selected': selected ? 'true' : 'false',
      tabindex: selected ? 0 : -1,
      onclick: () => onSelect(k),
      onkeydown: (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); onSelect(k); }
        else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); focusTab(idx + 1); }
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); focusTab(idx - 1); }
        else if (e.key === 'Home') { e.preventDefault(); focusTab(0); }
        else if (e.key === 'End') { e.preventDefault(); focusTab(items.length - 1); }
      },
    }, l);
    tabs.push(t); wrap.appendChild(t);
  });
  return wrap;
}
const RISKC = { High: '#f0616d', Medium: '#e5a53b', Low: '#46b877' };

/* ============ Executive Overview ============ */
export async function overview(root) {
  root.append(pageHead('Executive Overview', 'Unified intelligence across all four operational modules — synthetic demonstration data'));
  const kpis = el('div', { class: 'grid k4' }, skeleton(96), skeleton(96), skeleton(96), skeleton(96));
  const body = el('div', { class: 'grid k2 mt2' });
  root.append(kpis, body);
  let d;
  try { d = await api.get('/api/overview'); } catch (e) { root.append(errorState(e.message)); return; }
  const m = d.modules;
  kpis.replaceChildren(
    kpi({ label: 'Entities under review', value: fmt.num(m.nexus.entities), delta: `${m.nexus.highRisk} high-risk · ${m.nexus.jurisdictions} jurisdictions`, iconName: 'nexus' }),
    kpi({ label: 'Traced transactions', value: fmt.num(m.chainlink.transactions), delta: `${m.chainlink.wallets} wallets · ${m.chainlink.alerts} alerts`, iconName: 'chain' }),
    kpi({ label: 'Insolvency cases', value: fmt.num(m.waterfall.cases), delta: `${m.waterfall.creditors} creditor claims · ${m.waterfall.scenarios} scenarios`, iconName: 'waterfall' }),
    kpi({ label: 'Regulatory instruments', value: fmt.num(m.regulatory.instruments), delta: `${m.regulatory.highImpact} high-impact · ${m.regulatory.upcoming} upcoming`, iconName: 'regulatory' }),
  );
  const riskDonut = el('div');
  donut(riskDonut, d.riskByBand.map((r) => ({ value: r.n, color: RISKC[r.band] || '#8aa0bd' })), { label: 'entities' });
  const legend = el('div', { class: 'mt' }, ...d.riskByBand.map((r) => el('div', { class: 'row', style: { justifyContent: 'space-between', padding: '4px 0' } }, el('span', {}, riskBadge(r.band)), el('span', { class: 'tabular' }, r.n))));
  const impactBars = el('div');
  barChart(impactBars, d.impactByLevel.map((i) => ({ label: i.level, value: i.n, color: RISKC[i.level] || '#4d8df0' })), { height: 180 });
  body.append(
    card('Corporate risk distribution', { sub: 'Jurisdictional Asset Flight Risk bands' }, el('div', { class: 'row', style: { gap: '20px', alignItems: 'center' } }, riskDonut, el('div', { class: 'spacer' }, legend))),
    card('Regulatory operational impact', { sub: 'By impact level' }, impactBars),
  );
  const alerts = el('div');
  if (d.alertsPreview.length) alerts.append(...d.alertsPreview.map((a) => el('div', { class: 'row', style: { padding: '8px 0', borderBottom: '1px solid var(--border)' } }, statusBadge(a.severity), el('span', { class: 'small' }, a.reason))));
  else alerts.append(emptyState('No alerts'));
  const topE = el('div');
  d.topEntities.forEach((e) => topE.append(clickableRow({ class: 'row clickable', 'aria-label': `Open ${e.legal_name} — ${e.jurisdiction}, ${e.risk_flag} risk`, style: { padding: '8px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }, onClick: () => openEntityDrawer(e.id) }, el('span', {}, e.legal_name), el('span', { class: 'spacer' }), el('span', { class: 'badge neutral sq' }, e.jurisdiction), riskBadge(e.risk_flag))));
  body.append(card('Chain-Link alerts', { sub: 'Latest detections', actions: el('a', { class: 'btn sm ghost', href: '#/chainlink' }, 'Open') }, alerts), card('Highest-risk entities', { actions: el('a', { class: 'btn sm ghost', href: '#/nexus' }, 'Open') }, topE));
  const audit = el('div');
  d.recentAudit.forEach((a) => audit.append(el('div', { class: 'row', style: { padding: '7px 0', borderBottom: '1px solid var(--border)' } }, el('span', { class: 'badge sq neutral' }, a.module || 'system'), el('span', { class: 'small' }, a.summary), el('span', { class: 'spacer' }), el('span', { class: 'small muted nowrap' }, fmt.date(a.ts)))));
  root.append(el('div', { class: 'mt2' }, card('Recent activity', { sub: 'Local audit trail', actions: el('a', { class: 'btn sm ghost', href: '#/audit' }, 'Full log') }, audit)));
}

/* ============ Sovereign Nexus ============ */
export async function nexus(root, parts) {
  const tab = parts[0] || 'map';
  root.append(pageHead('Sovereign Nexus', 'Corporate forensics & beneficial-ownership explorer', [
    el('button', { class: 'btn sm', title: 'Download the entity directory as a CSV file', onclick: () => exportData('entities') }, icon('download', 15), 'Export CSV'),
  ]));
  root.append(intro('Sovereign Nexus', 'maps who really owns and controls companies. Use the Network Explorer to trace ownership across jurisdictions, the Jurisdiction Map to see where entities sit, and click any node for its beneficial owners and a transparent flight-risk score.'));
  root.append(tabsBar([['map', 'Jurisdiction Map'], ['network', 'Network Explorer'], ['directory', 'Entity Directory']], tab, (k) => (location.hash = '#/nexus/' + k)));
  const panel = el('div'); root.append(panel);
  if (tab === 'directory') return nexusDirectory(panel);
  if (tab === 'map') return nexusMap(panel);
  return nexusNetwork(panel, parts[1]);
}

// ── Sovereign Nexus — Network Explorer ──────────────────────────────────────
// A single full-graph fetch is filtered/investigated entirely in the browser so
// interactions are instant. Visual encoding: colour = flight-risk band, shape =
// entity type, size = connectedness, arrows = who controls whom, % on emphasis.
// flowGraph does its own visual encoding (colour = risk band, tier = ownership
// depth, always-on red-flag emphasis), so it needs only {mode,nodes,edges,onNodeClick}.
// The one encoding accessor still used by the Explorer chrome is `nexusIsFlagged`,
// which the count-bar uses to report how many entities match a red-flag signal.
const nexusIsFlagged = (n) => !!(n.is_nominee || n.is_dormant || n.is_offshore);

// Handle to the currently-mounted Network-Explorer graph, so the Ownership X-ray in
// the entity drawer can (when convenient) trace a control chain directly on the graph.
// Null whenever the Network tab is not the mounted view.
let _lastNexusGraph = null;

async function nexusNetwork(panel, focusId) {
  panel.append(skeleton(60));
  let full;
  try { full = await api.get('/api/graph'); } catch (e) { panel.replaceChildren(errorState(e.message)); return; }
  const allNodes = full.nodes, allEdges = full.edges;
  const byId = new Map(allNodes.map((n) => [n.id, n]));
  const jurisdictions = [...new Set(allNodes.map((n) => n.jurisdiction).filter(Boolean))].sort();
  const types = [...new Set(allNodes.map((n) => n.type).filter(Boolean))].sort();

  const state = { type: '', risk: '', juris: '', rel: '', q: '', flags: false, focus: '' };
  let graph = null;

  // ---- controls ----
  const searchInput = el('input', { type: 'search', placeholder: 'Search entity name / ID…', style: { minWidth: '190px' }, oninput: (e) => { state.q = e.target.value.trim(); applyFilters(); }, onkeydown: (e) => { if (e.key === 'Enter') centreOnSearch(); } });
  const typeSel = selectField('Type', ['', ...types], (v) => { state.type = v; applyFilters(); });
  const riskSel = selectField('Risk', ['', 'High', 'Medium', 'Low'], (v) => { state.risk = v; applyFilters(); });
  const jurisSel = selectField('Jurisdiction', ['', ...jurisdictions], (v) => { state.juris = v; applyFilters(); });
  const relSel = selectField('Relationship', ['', 'owns', 'controls', 'director_of', 'nominee_for', 'agent_for', 'beneficiary_of'], (v) => { state.rel = v; applyFilters(); });
  const flagsBtn = el('button', { class: 'btn sm', title: 'Spotlight red flags: circular ownership, nominee layers, offshore & dormant entities', onclick: () => { state.flags = !state.flags; flagsBtn.classList.toggle('primary', state.flags); if (graph) graph.toggleFlags(state.flags); } }, icon('alert', 14), 'Red flags');
  const uboBtn = el('button', { class: 'btn sm', title: 'Trace the control chain of the selected entity up to its ultimate beneficial owner(s)', disabled: true, onclick: traceUBO }, icon('nexus', 14), 'Trace to UBO');
  const pathBtn = el('button', { class: 'btn sm', title: 'Highlight the shortest relationship path between two entities', onclick: pathTool }, icon('link', 14), 'Path between');
  const resetBtn = el('button', { class: 'btn sm', title: 'Clear focus and filters', onclick: () => { state.type = state.risk = state.juris = state.rel = state.q = ''; state.flags = false; state.focus = ''; searchInput.value = ''; [typeSel, riskSel, jurisSel, relSel].forEach((f) => { const s = f.querySelector('select'); if (s) s.value = ''; }); flagsBtn.classList.remove('primary'); uboBtn.disabled = true; applyFilters(); } }, icon('reset', 14), 'Reset');

  const controls = el('div', { class: 'filters' }, labeled('Search', searchInput), typeSel, riskSel, jurisSel, relSel, el('span', { class: 'lg-spacer', style: { flex: '1 1 auto' } }), flagsBtn, uboBtn, pathBtn, resetBtn);
  const countBar = el('div', { class: 'small muted mt', style: { display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'center' } });
  const graphBox = el('div');
  const focusBar = el('div', { class: 'small mt', style: { display: 'none' } });
  panel.replaceChildren(controls, countBar, graphBox, focusBar);

  function filteredData() {
    const q = state.q.toLowerCase();
    let ns = allNodes.filter((n) =>
      (!state.type || n.type === state.type) &&
      (!state.risk || n.risk === state.risk) &&
      (!state.juris || n.jurisdiction === state.juris) &&
      (!q || String(n.label || '').toLowerCase().includes(q) || String(n.id).toLowerCase().includes(q)));
    const keep = new Set(ns.map((n) => n.id));
    let es = allEdges.filter((e) => keep.has(e.source) && keep.has(e.target) && (!state.rel || e.rel_type === state.rel));
    return { nodes: ns, edges: es };
  }

  function updateCounts(shownN, shownE) {
    const flagged = allNodes.filter(nexusIsFlagged).length;
    const circ = allEdges.filter((e) => e.is_circular).length;
    countBar.replaceChildren(
      el('span', {}, 'Showing ', el('strong', {}, String(shownN)), ' of ', String(allNodes.length), ' entities · ', el('strong', {}, String(shownE)), ' relationships'),
      el('span', { class: 'badge sq high', title: 'Entities matching a red-flag signal' }, String(flagged), ' flagged'),
      circ ? el('span', { class: 'badge sq high', title: 'Edges in a circular-ownership loop' }, String(circ), ' circular') : null,
      el('span', { class: 'muted' }, 'Click a node to trace its controllers & holdings'));
  }

  function build() {
    const d = filteredData();
    if (!d.nodes.length) { graphBox.replaceChildren(emptyState('No entities match the current filters', 'Loosen a filter or clear the search to see the network.')); updateCounts(0, 0); graph = null; _lastNexusGraph = null; return; }
    const box = el('div', { style: { height: '640px' } });
    graphBox.replaceChildren(box);
    // The winning "Variant B" tiered-ownership renderer (flowGraph). It draws its
    // own encoding-driven legend and lays owners on the TOP tier, so the answer is
    // structural. We wrap its handle so the existing Network-Explorer toolbar
    // (trace-to-UBO, path-between, search-centre, red-flags) keeps working.
    const fg = flowGraph(box, {
      mode: 'nexus',
      nodes: d.nodes,
      edges: d.edges,
      onNodeClick: (id) => { const n = byId.get(id); state.focus = id; uboBtn.disabled = false; if (n) showFocusBar(n); openEntityDrawer(id); },
      onViewTable: () => { location.hash = '#/nexus/directory'; },
    });
    graph = {
      _fg: fg,
      focus: (id) => { try { fg.select(id); } catch (_e) {} },
      // Draw the WHOLE chain/path (nodes + connecting edges), rest dimmed, in colour.
      highlightPath: (ids, color) => { if (ids && ids.length) { try { fg.highlightPath(ids, color); } catch (_e) {} } },
      clearFocus: () => { try { fg.clearSpotlight(); fg.reset(); } catch (_e) {} },
      // Red-flags spotlight: highlight circular / nominee / offshore / dormant entities
      // (and their links) and dim the rest; toggling off restores the full view.
      toggleFlags: (on) => { try { fg.spotlightFlagged(on); } catch (_e) {} },
      fit: () => { try { fg.fit(); } catch (_e) {} },
      destroy: () => { try { fg.destroy(); } catch (_e) {} },
    };
    // if the red-flags toggle is active across a re-filter, re-apply the spotlight
    if (state.flags) { try { fg.spotlightFlagged(true); } catch (_e) {} }
    _lastNexusGraph = graph; // let the drawer's Ownership X-ray trace on this graph
    updateCounts(d.nodes.length, d.edges.length);
  }

  // re-filter without losing node positions when possible (rebuild is cheap + deterministic)
  function applyFilters() { state.focus = ''; uboBtn.disabled = true; focusBar.style.display = 'none'; build(); }

  function showFocusBar(n) {
    focusBar.style.display = 'flex';
    focusBar.style.gap = '10px';
    focusBar.style.alignItems = 'center';
    focusBar.style.flexWrap = 'wrap';
    focusBar.replaceChildren(
      el('span', { class: 'badge sq' }, 'Focused'),
      el('strong', {}, n.label || n.id),
      el('span', { class: 'muted' }, '— upstream controllers (blue) & downstream holdings (teal) highlighted'),
      el('button', { class: 'btn sm ghost', onclick: () => { state.focus = ''; uboBtn.disabled = true; focusBar.style.display = 'none'; if (graph) graph.clearFocus(); } }, 'Clear focus'));
  }

  async function traceUBO() {
    if (!state.focus) { toast('Select a company first, then trace to its UBO', { type: 'warn' }); return; }
    try {
      const r = await api.get('/api/graph/ubo?id=' + encodeURIComponent(state.focus));
      if (!r.nodeIds || r.nodeIds.length <= 1) { toast('No ownership chain found for this entity', { type: 'warn' }); return; }
      if (graph) graph.highlightPath(r.nodeIds, '#e5a53b');
      const start = byId.get(state.focus);
      const names = (r.ubos || []).map((u) => `${u.name}${u.effectivePct != null ? ' (' + u.effectivePct + '%)' : ''}`);
      const msg = names.length ? `UBO(s) of ${start ? start.label : state.focus}: ${names.join('; ')}` : `Traced ${r.nodeIds.length} entities in the control structure of ${start ? start.label : state.focus}`;
      focusBar.style.display = 'flex';
      focusBar.replaceChildren(
        el('span', { class: 'badge sq med' }, 'UBO trace'),
        el('strong', {}, start ? start.label : state.focus),
        el('span', {}, ' → '),
        ...(names.length ? names.map((nm) => el('span', { class: 'badge', style: { background: '#271f10', color: '#e5a53b', borderColor: '#4a3a17' } }, nm)) : [el('span', { class: 'muted' }, 'no distinct UBO — chain terminates in a company')]),
        r.circular ? el('span', { class: 'badge sq high', title: 'This control structure contains a circular-ownership loop' }, 'circular') : null,
        el('button', { class: 'btn sm ghost', onclick: () => { if (graph) graph.clearFocus(); focusBar.style.display = 'none'; state.focus = ''; uboBtn.disabled = true; } }, 'Clear'));
      toast(msg, { type: 'success', title: 'Trace to ultimate beneficial owner', timeout: 8000 });
    } catch (e) { toast(e.message, { type: 'error' }); }
  }

  function centreOnSearch() {
    const q = state.q.toLowerCase(); if (!q) return;
    const hit = allNodes.find((n) => String(n.label || '').toLowerCase().includes(q) || String(n.id).toLowerCase() === q);
    if (hit && graph) { state.focus = hit.id; uboBtn.disabled = false; showFocusBar(hit); graph.focus(hit.id); openEntityDrawer(hit.id); }
  }

  async function pathTool() {
    const opt = (n) => el('option', { value: n.id }, `${n.label} (${n.id})`);
    const sorted = allNodes.slice().sort((a, b) => String(a.label).localeCompare(String(b.label)));
    const fromSel = el('select', { style: { width: '100%' } }, ...sorted.map(opt));
    const toSel = el('select', { style: { width: '100%' } }, ...sorted.map(opt));
    if (sorted[Math.min(19, sorted.length - 1)]) toSel.value = sorted[Math.min(19, sorted.length - 1)].id;
    modal({ title: 'Shortest connection path', body: (b) => b.append(labeled('From entity', fromSel), el('div', { class: 'mt' }), labeled('To entity', toSel), el('p', { class: 'small muted mt' }, 'Finds and highlights the shortest chain of relationships between two entities.')), actions: (close) => [
      el('button', { class: 'btn', onclick: close }, 'Cancel'),
      el('button', { class: 'btn primary', onclick: async () => { close(); try { const r = await api.get(`/api/graph/path?from=${encodeURIComponent(fromSel.value)}&to=${encodeURIComponent(toSel.value)}`); if (!r.path) { toast('No connection path found between those entities', { type: 'warn' }); return; } state.type = state.risk = state.juris = state.rel = state.q = ''; searchInput.value = ''; [typeSel, riskSel, jurisSel, relSel].forEach((f) => { const s = f.querySelector('select'); if (s) s.value = ''; }); state.flags = false; flagsBtn.classList.remove('primary'); build(); if (graph) graph.highlightPath(r.path, '#4d8df0'); toast(`Path length ${r.length}: ${r.path.map((id) => (byId.get(id) || {}).label || id).join(' → ')}`, { type: 'success', title: 'Shortest connection path', timeout: 9000 }); } catch (e) { toast(e.message, { type: 'error' }); } } }, 'Find path')] });
  }

  build();
  // Deep-link focus: arriving via a "Trace on graph" link (#/nexus/network/<id>) opens
  // that specific entity focused on the graph, so the analyst keeps their context
  // instead of landing on the default view and having to hunt for it again.
  if (focusId) {
    const fn = byId.get(focusId);
    if (fn) { state.focus = focusId; uboBtn.disabled = false; showFocusBar(fn); if (graph) graph.focus(focusId); openEntityDrawer(focusId); }
  }
}

async function nexusDirectory(panel) {
  panel.append(skeleton(300));
  try {
    const d = await api.get('/api/entities?limit=500');
    const table = dataTable([
      { key: 'legal_name', label: 'Legal name', sortable: true, render: (r) => el('span', { style: { fontWeight: 500 } }, r.legal_name) },
      { key: 'entity_type', label: 'Type', sortable: true, render: (r) => el('span', { class: 'badge sq neutral' }, fmt.title(r.entity_type)) },
      { key: 'jurisdiction', label: 'Jurisdiction', sortable: true },
      { key: 'status', label: 'Status', sortable: true, render: (r) => statusBadge(r.status) },
      { key: 'risk_flag', label: 'Flight risk', sortable: true, sortVal: (r) => ({ High: 3, Medium: 2, Low: 1 }[r.risk_flag] || 0), render: (r) => r.risk_flag ? riskBadge(r.risk_flag) : el('span', { class: 'muted' }, '—') },
      { key: 'verification_status', label: 'Verification', sortable: true, render: (r) => statusBadge(r.verification_status) },
    ], d.rows, { searchable: true, searchKeys: ['legal_name', 'jurisdiction', 'entity_type'], searchPlaceholder: 'Search entities…', pageSize: 14, onRowClick: (r) => openEntityDrawer(r.id) });
    panel.replaceChildren(card('Entity Directory', { sub: `${d.total} synthetic entities`, flush: true }, table));
  } catch (e) { panel.replaceChildren(errorState(e.message)); }
}

async function jurisEntitiesDrawer(p) {
  const body = openDrawer({ title: `${p.name} — registered entities`, subtitle: `${p.entity_count || 0} entities · ${p.high_risk || 0} high-risk · secrecy ${p.secrecy_score}/100${p.is_offshore ? ' · offshore' : ''}`, body: (b) => b.append(skeleton(220)) });
  try {
    const d = await api.get(`/api/entities?juris=${encodeURIComponent(p.code)}&limit=500`);
    const table = dataTable([
      { key: 'legal_name', label: 'Legal name', sortable: true, render: (r) => el('span', { style: { fontWeight: 500 } }, r.legal_name) },
      { key: 'entity_type', label: 'Type', sortable: true, render: (r) => el('span', { class: 'badge sq neutral' }, fmt.title(r.entity_type)) },
      { key: 'risk_flag', label: 'Flight risk', sortable: true, sortVal: (r) => ({ High: 3, Medium: 2, Low: 1 }[r.risk_flag] || 0), render: (r) => r.risk_flag ? riskBadge(r.risk_flag) : el('span', { class: 'muted' }, '—') },
      { key: 'status', label: 'Status', sortable: true, render: (r) => statusBadge(r.status) },
    ], d.rows, { searchable: true, searchKeys: ['legal_name', 'entity_type'], searchPlaceholder: 'Filter entities…', pageSize: 12, onRowClick: (r) => openEntityDrawer(r.id), empty: 'No entities registered in this jurisdiction' });
    body.replaceChildren(
      el('div', { class: 'row wrap', style: { gap: '8px', marginBottom: '12px' } }, el('span', { class: 'badge sq neutral' }, p.code), el('span', { class: 'badge sq neutral' }, p.region || p.country || '—'), p.is_offshore ? el('span', { class: 'badge high' }, el('span', { class: 'dot' }), 'Offshore secrecy jurisdiction') : null),
      table);
  } catch (e) { body.replaceChildren(errorState(e.message)); }
}

// "Offshore" explainer drawer — says what the badge means (a high-secrecy offshore
// financial centre, with its secrecy score) and lists the entities registered there,
// each click-through to the full entity drawer. Reuses openDrawer + the entities API.
async function jurisOffshoreDrawer(p) {
  const body = openDrawer({ title: `${p.name} — offshore secrecy centre`, subtitle: `Secrecy score ${p.secrecy_score}/100 · ${p.entity_count || 0} registered ${(p.entity_count || 0) === 1 ? 'entity' : 'entities'}`, body: (b) => b.append(skeleton(200)) });
  try {
    const d = await api.get(`/api/entities?juris=${encodeURIComponent(p.code)}&limit=500`);
    const explain = el('div', { class: 'jm-drawer-explain' },
      el('p', {}, el('b', {}, p.name + ' is flagged as an offshore secrecy centre. '), 'It combines strong financial-secrecy provisions with low or no corporate-transparency requirements, which is itself a forensic signal: it makes beneficial ownership harder to see. Its secrecy score is ', el('b', {}, (p.secrecy_score != null ? p.secrecy_score : '-') + '/100'), ' (higher = more secretive).'),
      el('p', { class: 'small muted' }, 'The ' + (d.rows.length) + ' entit' + (d.rows.length === 1 ? 'y' : 'ies') + ' below are the synthetic companies, trusts and vehicles registered in this jurisdiction. Open any to see its flight-risk breakdown and ownership X-ray.'));
    const table = dataTable([
      { key: 'legal_name', label: 'Legal name', sortable: true, render: (r) => el('span', { style: { fontWeight: 500 } }, r.legal_name) },
      { key: 'entity_type', label: 'Type', sortable: true, render: (r) => el('span', { class: 'badge sq neutral' }, fmt.title(r.entity_type)) },
      { key: 'risk_flag', label: 'Flight risk', sortable: true, sortVal: (r) => ({ High: 3, Medium: 2, Low: 1 }[r.risk_flag] || 0), render: (r) => r.risk_flag ? riskBadge(r.risk_flag) : el('span', { class: 'muted' }, '—') },
      { key: 'status', label: 'Status', sortable: true, render: (r) => statusBadge(r.status) },
    ], d.rows, { searchable: true, searchKeys: ['legal_name', 'entity_type'], searchPlaceholder: 'Filter entities…', pageSize: 12, onRowClick: (r) => openEntityDrawer(r.id), empty: 'No entities registered in this jurisdiction' });
    body.replaceChildren(
      el('div', { class: 'row wrap', style: { gap: '8px', marginBottom: '12px' } }, el('span', { class: 'badge high' }, el('span', { class: 'dot' }), 'Offshore secrecy jurisdiction'), el('span', { class: 'badge sq neutral' }, 'Secrecy ' + (p.secrecy_score != null ? p.secrecy_score : '-') + '/100'), el('span', { class: 'badge sq neutral' }, p.region || p.country || '—')),
      explain, table);
  } catch (e) { body.replaceChildren(errorState(e.message)); }
}

// "⚠ N high-risk" explainer drawer — lists the specific high-flight-risk entities
// registered in the jurisdiction, each click-through to the entity drawer.
async function jurisHighRiskDrawer(p) {
  const n = p.high_risk || 0;
  const body = openDrawer({ title: `${p.name} — high-risk entities`, subtitle: `${n} high flight-risk ${n === 1 ? 'entity' : 'entities'} of ${p.entity_count || 0} registered`, body: (b) => b.append(skeleton(200)) });
  try {
    const d = await api.get(`/api/entities?juris=${encodeURIComponent(p.code)}&risk=High&limit=500`);
    const explain = el('div', { class: 'jm-drawer-explain' },
      el('p', {}, el('b', {}, 'High-risk'), ' here means the entity carries a High Jurisdictional Asset Flight Risk — a deterministic 0–100 score built from weighted factors (recent control changes, unexplained transfers, incomplete ownership, nominee/dormant signals and the jurisdiction\'s own secrecy). Open any entity to see the exact factor breakdown.'),
      el('p', { class: 'small muted' }, 'These are the ' + d.rows.length + ' high-risk ' + (d.rows.length === 1 ? 'entity' : 'entities') + ' registered in ' + p.name + '.'));
    const table = dataTable([
      { key: 'legal_name', label: 'Legal name', sortable: true, render: (r) => el('span', { style: { fontWeight: 500 } }, r.legal_name) },
      { key: 'entity_type', label: 'Type', sortable: true, render: (r) => el('span', { class: 'badge sq neutral' }, fmt.title(r.entity_type)) },
      { key: 'risk_flag', label: 'Flight risk', sortable: true, render: (r) => riskBadge(r.risk_flag || 'High') },
      { key: 'status', label: 'Status', sortable: true, render: (r) => statusBadge(r.status) },
    ], d.rows, { searchable: true, searchKeys: ['legal_name', 'entity_type'], searchPlaceholder: 'Filter high-risk entities…', pageSize: 12, onRowClick: (r) => openEntityDrawer(r.id), empty: 'No high-risk entities registered in this jurisdiction' });
    body.replaceChildren(
      el('div', { class: 'row wrap', style: { gap: '8px', marginBottom: '12px' } }, el('span', { class: 'badge high' }, el('span', { class: 'dot' }), n + ' high flight-risk'), el('span', { class: 'badge sq neutral' }, (p.entity_count || 0) + ' total'), el('span', { class: 'badge sq neutral' }, p.region || p.country || '—')),
      explain, table);
  } catch (e) { body.replaceChildren(errorState(e.message)); }
}

// Derive cross-border ownership pathways client-side from the live graph: for every
// relationship whose source & target entities sit in DIFFERENT jurisdictions, count
// a directed (fromCode -> toCode) tie. Feeds the map's pathway arcs + law-crossing.
function crossBorderPathways(graph) {
  const jur = new Map((graph.nodes || []).map((n) => [n.id, n.jurisdiction]));
  const agg = new Map();
  for (const e of graph.edges || []) {
    const a = jur.get(e.source), b = jur.get(e.target);
    if (!a || !b || a === b) continue;
    const key = a + '|' + b;
    agg.set(key, (agg.get(key) || 0) + 1);
  }
  return [...agg.entries()].map(([k, count]) => { const [from, to] = k.split('|'); return { from, to, count }; });
}

async function nexusMap(panel) {
  panel.append(skeleton(440));
  try {
    // Jurisdiction points come from the live API; cross-border pathways are derived
    // from the full ownership graph (relationships crossing a jurisdiction boundary).
    const [d, graph] = await Promise.all([api.get('/api/jurisdictions'), api.get('/api/graph').catch(() => ({ nodes: [], edges: [] }))]);
    const pathways = crossBorderPathways(graph);
    // Entities per jurisdiction code (each graph node carries its jurisdiction). Feeds the
    // map's deep-zoom entity fan-out: zoom into a jurisdiction and its individual registered
    // entities spread out around it, separately visible + clickable (opens the entity drawer).
    const entitiesByCode = {};
    for (const n of (graph.nodes || [])) { const j = n.jurisdiction; if (!j) continue; (entitiesByCode[j] ||= []).push(n); }
    const box = el('div');
    jurisdictionMap(box, d.rows, {
      pathways,
      entitiesByCode,
      onSelect: () => {},
      onDrill: (p) => jurisEntitiesDrawer(p),
      onEntity: (node) => openEntityDrawer(node.id),
      onOffshore: (p) => jurisOffshoreDrawer(p),
      onHighRisk: (p) => jurisHighRiskDrawer(p),
    });
    const table = dataTable([
      { key: 'name', label: 'Jurisdiction', sortable: true, render: (r) => el('span', { class: 'clickable', style: { fontWeight: 500, cursor: 'pointer' }, onclick: () => jurisEntitiesDrawer(r) }, r.name) },
      { key: 'region', label: 'Zone', sortable: true, render: (r) => el('span', { class: 'badge sq neutral' }, r.region) },
      { key: 'entity_count', label: 'Entities', sortable: true, align: 'right' },
      { key: 'high_risk', label: 'High-risk', sortable: true, align: 'right', render: (r) => (r.high_risk || 0) ? el('button', { class: 'linklike', type: 'button', title: 'List the ' + r.high_risk + ' high-risk ' + ((r.high_risk === 1) ? 'entity' : 'entities') + ' in ' + r.name, onclick: (ev) => { ev.stopPropagation(); jurisHighRiskDrawer(r); } }, String(r.high_risk)) : el('span', { class: 'muted' }, '0') },
      { key: 'secrecy_score', label: 'Secrecy score', sortable: true, align: 'right', render: (r) => el('span', {}, r.secrecy_score, ' ', r.is_offshore ? el('button', { class: 'badge sq med linklike', type: 'button', title: 'What “Offshore” means + the entities registered in ' + r.name, onclick: (ev) => { ev.stopPropagation(); jurisOffshoreDrawer(r); } }, 'Offshore') : null) },
    ], d.rows, { pageSize: 15, onRowClick: (r) => jurisEntitiesDrawer(r) });
    panel.replaceChildren(el('div', { class: 'small muted mb' }, 'Coloured jurisdictional zones (EU, Switzerland, Offshore, Asia, Americas) drawn on an offline, accurate equirectangular world (real Natural-Earth coastlines). Bubble size ∝ entities registered, colour = zone, dashed ring = offshore, ⚠ = high-risk. Dashed vertical lines are UTC time-zone meridians (read the working-hours gap between locations at a glance). Zoom with Ctrl/⌘ + scroll (a plain scroll moves the page) — zoom in far enough and co-located jurisdictions de-overlap and each jurisdiction’s individual registered entities fan out, separately clickable. Click a jurisdiction for who governs it, the rules it must report under, and where its ownership flows.'), box, el('div', { class: 'mt2' }, card('Jurisdiction summary', { sub: 'Click a row to list its registered entities', flush: true }, table)));
  } catch (e) { panel.replaceChildren(errorState(e.message)); }
}

export async function openEntityDrawer(id) {
  const body = openDrawer({ title: 'Loading…', subtitle: id, body: (b) => b.append(skeleton(200)) });
  let d;
  try { d = await api.get('/api/entities/' + encodeURIComponent(id)); } catch (e) { body.replaceChildren(errorState(e.message)); return; }
  const e = d.entity; const fr = d.flightRisk;
  const head = document.querySelector('.drawer-head .title'); if (head) head.textContent = e.legal_name;
  const maxPts = Math.max(...fr.factors.map((f) => f.points), 1);
  const factorList = el('div', {}, ...fr.factors.slice(0, 8).map((f) => el('div', { class: 'factor-row' }, el('div', {}, el('div', { class: 'fl' }, f.label), el('div', { class: 'fe' }, f.explanation)), el('div', {}, el('div', { class: 'tabular', style: { textAlign: 'right', fontSize: '12px' } }, '+' + f.points), meter((f.points / maxPts) * 100, RISKC[fr.band])))));
  const rels = [...d.out.map((r) => ({ ...r, dir: '→', other: r.target_name, otype: r.target_type })), ...d.in.map((r) => ({ ...r, dir: '←', other: r.source_name, otype: r.source_type }))];
  const relList = rels.length ? el('div', {}, ...rels.slice(0, 40).map((r) => el('div', { class: 'row', style: { padding: '6px 0', borderBottom: '1px solid var(--border)' } }, el('span', { class: 'badge sq neutral' }, fmt.title(r.rel_type)), el('span', { class: 'small' }, r.dir, ' ', r.other), r.ownership_pct != null ? el('span', { class: 'spacer small tabular muted' }, r.ownership_pct + '%') : null))) : emptyState('No relationships');
  const noteInput = el('textarea', { 'aria-label': 'Add an analyst note', placeholder: 'Add an analyst note…', style: { minHeight: '60px' } });
  // Ownership X-ray: a first-class, readable answer to "who really controls this,
  // and through what layers". Rendered progressively so the drawer paints instantly;
  // fills from data already on `d` (ownershipChains + structure) plus two light graph
  // fetches (UBO names, and a full node/edge map for readable chains & holdings).
  const xrayBox = el('div', { class: 'mt2' }, skeleton(120));
  renderOwnershipXray(xrayBox, id, d).catch(() => { try { xrayBox.replaceChildren(ownershipXrayShell(el('div', { class: 'small muted' }, 'Ownership X-ray unavailable for this entity.'))); } catch (_e) {} });
  body.replaceChildren(
    el('div', { class: 'row wrap', style: { gap: '8px', marginBottom: '14px' } }, el('span', { class: 'badge sq neutral' }, fmt.title(e.entity_type)), statusBadge(e.status), e.risk_flag ? riskBadge(e.risk_flag) : null, statusBadge(e.verification_status), classBadge(e.data_classification)),
    el('dl', { class: 'dl' },
      dt('Synthetic ID'), dd(e.id), dt('Jurisdiction'), dd(e.jurisdiction || '—'), dt('Legal form'), dd(e.legal_form || '—'),
      dt('Incorporated'), dd(fmt.date(e.incorporation_date)), dt('Registered office'), dd(e.registered_office || '—'), dt('Source type'), dd(fmt.title(e.source_type || '—'))),
    el('div', { class: 'card mt2' }, el('div', { class: 'card-head' }, el('div', { class: 'card-title' }, 'Jurisdictional Asset Flight Risk'), el('span', { class: 'spacer' }), el('span', { class: 'value tabular', style: { fontSize: '22px', color: RISKC[fr.band] } }, fr.score), riskBadge(fr.band)), el('div', { class: 'card-body' }, el('div', { class: 'small muted mb' }, `Deterministic score from ${fr.factors.length} weighted factors (0–100). Contributions:`), factorList)),
    xrayBox,
    el('div', { class: 'mt2' }, el('div', { class: 'card-title mb' }, 'Relationships & ownership'), relList),
    d.assets.length ? el('div', { class: 'mt2' }, el('div', { class: 'card-title mb' }, 'Assets'), ...d.assets.map((a) => el('div', { class: 'row', style: { padding: '5px 0' } }, el('span', { class: 'badge sq neutral' }, fmt.title(a.asset_type)), el('span', { class: 'small' }, a.label), el('span', { class: 'spacer small tabular' }, 'USD ' + fmt.num(a.value_usd))))) : null,
    el('div', { class: 'mt2' }, el('div', { class: 'card-title mb' }, 'Analyst notes'), el('div', { id: 'noteList' }, ...(d.notes || []).map(noteRow)), noteInput, el('button', { class: 'btn sm mt', onclick: async () => { if (!noteInput.value.trim()) return; try { const r = await api.post('/api/notes', { target_type: 'entity', target_id: id, body: noteInput.value }); noteInput.value = ''; document.getElementById('noteList').replaceChildren(...r.notes.map(noteRow)); toast('Note saved', { type: 'success' }); } catch (er) { toast(er.message, { type: 'error' }); } } }, 'Add note')),
  );
  // drawer footer actions
  const drawer = document.querySelector('.drawer');
  if (drawer && !drawer.querySelector('.drawer-foot')) drawer.append(el('div', { class: 'drawer-foot' }, addToCaseButton('entity', id, e.legal_name), el('button', { class: 'btn sm', onclick: async () => { try { const r = await api.post('/api/bookmarks', { target_type: 'entity', target_id: id, label: e.legal_name }); toast(r.bookmarked ? 'Bookmarked' : 'Bookmark removed', { type: 'success' }); } catch (er) { toast(er.message, { type: 'error' }); } } }, icon('bookmark', 14), 'Bookmark'), el('button', { class: 'btn sm', onclick: () => exportData('entities') }, icon('download', 14), 'Export')));
}
const noteRow = (n) => el('div', { class: 'fragment' }, el('div', {}, n.body), el('div', { class: 'small muted' }, (n.author || 'analyst') + ' · ' + fmt.date(n.created_at)));
const dt = (t) => el('dt', {}, t); const dd = (t) => el('dd', {}, t);

/* ── Ownership X-ray ────────────────────────────────────────────────
 * Surfaces the graph engine's beneficial-ownership analytics (traceToUBO /
 * ownershipChains with cumulative effective %, controllers/holdings, circular
 * detection) as a durable, scannable part of the entity profile — the flagship
 * corporate-forensics answer to "who really controls this, and through what
 * layers?". Text-first (stands alone without the graph); the graph tie-in is an
 * optional convenience. Deterministic and e2e-safe (all DOM/geometry-free). */

// ownership/control edges only (mirrors the engine's isOwnership: owns|controls)
const _isOwnEdge = (e) => { const t = e.rel_type || 'owns'; return t === 'owns' || t === 'controls'; };
// A wrapping card so every render path (loaded / empty / error) looks consistent.
function ownershipXrayShell(...kids) {
  return el('div', { class: 'card' },
    el('div', { class: 'card-head' },
      el('div', { class: 'card-title' }, 'Ownership X-ray'),
      infoDot('Who ultimately controls this entity and through which layers. Effective % multiplies ownership along each chain; a loop means the structure owns itself in a circle.'),
      el('span', { class: 'spacer' })),
    el('div', { class: 'card-body' }, ...kids.filter(Boolean)));
}
// One readable control chain, e.g. "Ivan Petrov → 60% → Meridian Holdings → 100% → Alpha Trading AG",
// with a cumulative effective-% badge. `path` is ordered ULTIMATE → … → this entity.
function xrayChainRow(path, effectivePct, meta, pctByPair, onOpen) {
  const seq = [];
  for (let i = 0; i < path.length; i++) {
    const nid = path[i];
    const m = meta.get(nid) || {};
    const isEnds = i === 0 || i === path.length - 1;
    seq.push(el('button', {
      class: 'btn ghost', style: { height: 'auto', minHeight: '22px', padding: '1px 7px', fontSize: '12px', fontWeight: isEnds ? 700 : 500, whiteSpace: 'normal', textAlign: 'left', borderRadius: '6px', color: isEnds ? 'var(--text)' : 'var(--text-2)' },
      title: [m.type ? fmt.title(m.type) : null, m.jurisdiction, m.risk ? m.risk + ' risk' : null].filter(Boolean).join(' · ') || nid,
      onclick: () => onOpen(nid),
    }, m.label || nid));
    if (i < path.length - 1) {
      const pct = pctByPair.get(path[i] + '>' + path[i + 1]);
      seq.push(el('span', { class: 'small', style: { color: 'var(--text-3)', padding: '0 2px' } }, '→'));
      seq.push(el('span', { class: 'small tabular', style: { color: pct == null ? 'var(--text-3)' : 'var(--accent-ink)', padding: '0 1px' } }, pct == null ? '?%' : pct + '%'));
      seq.push(el('span', { class: 'small', style: { color: 'var(--text-3)', padding: '0 2px' } }, '→'));
    }
  }
  const effBadge = el('span', { class: 'badge sq ' + (effectivePct == null ? 'neutral' : effectivePct >= 50 ? 'med' : 'info'), title: 'Cumulative effective ownership: the ownership percentages multiplied along this chain' },
    effectivePct == null ? 'effective % unknown' : 'effective ' + effectivePct + '%');
  return el('div', { style: { padding: '8px 0', borderBottom: '1px solid var(--border)' } },
    el('div', { class: 'row', style: { flexWrap: 'wrap', alignItems: 'center', gap: '2px' } }, ...seq),
    el('div', { class: 'mt', style: { marginTop: '4px' } }, effBadge));
}

async function renderOwnershipXray(container, id, d) {
  const structure = d.structure || {};
  const localChains = Array.isArray(d.ownershipChains) ? d.ownershipChains : [];
  // Two light fetches: UBO names + cumulative %, and a full node/edge map so chains
  // and holdings read with names and per-hop percentages. Both degrade gracefully.
  let ubo = null, graph = null;
  try { ubo = await api.get('/api/graph/ubo?id=' + encodeURIComponent(id)); } catch (_e) { ubo = null; }
  try { graph = await api.get('/api/graph'); } catch (_e) { graph = null; }
  const gNodes = (graph && graph.nodes) || [];
  const gEdges = (graph && graph.edges) || [];
  const meta = new Map(gNodes.map((n) => [n.id, n]));
  if (!meta.has(id)) meta.set(id, { id, label: (d.entity && d.entity.legal_name) || id, type: d.entity && d.entity.entity_type, jurisdiction: d.entity && d.entity.jurisdiction, risk: d.entity && d.entity.risk_flag });
  const nameOf = (nid) => (meta.get(nid) || {}).label || nid;
  // per-hop ownership % keyed by "owner>owned"
  const pctByPair = new Map();
  for (const e of gEdges) if (_isOwnEdge(e) && e.ownership_pct != null) pctByPair.set(e.source + '>' + e.target, e.ownership_pct);

  // Prefer the engine's traced chains (from the UBO endpoint) — they already stop at
  // the true UBO; fall back to the drawer's ownershipChains if the fetch failed.
  const chains = (ubo && Array.isArray(ubo.chains) && ubo.chains.length ? ubo.chains : localChains)
    .slice().sort((a, b) => (b.effectivePct ?? -1) - (a.effectivePct ?? -1));
  const circular = !!(structure.circular || (ubo && ubo.circular));

  // ── Ultimate beneficial owners (cumulative effective %) ──
  const ubos = (ubo && Array.isArray(ubo.ubos)) ? ubo.ubos.slice().sort((a, b) => (b.effectivePct ?? -1) - (a.effectivePct ?? -1)) : [];
  let uboBlock;
  if (ubos.length) {
    uboBlock = el('div', {},
      el('div', { class: 'small muted mb' }, 'Ultimate beneficial owner' + (ubos.length > 1 ? 's' : '') + ' — the natural person(s) or flagged UBO at the top of every control chain, with ownership multiplied down to this entity:'),
      ...ubos.map((u) => clickableRow({ class: 'row', style: { padding: '7px 0', borderBottom: '1px solid var(--border)', gap: '8px', alignItems: 'center', cursor: 'pointer' }, onClick: () => openEntityDrawer(u.id) },
        el('span', { class: 'badge sq med', title: 'Ultimate beneficial owner' }, icon('nexus', 12), 'UBO'),
        el('span', { style: { fontWeight: 600 } }, u.name || nameOf(u.id)),
        el('span', { class: 'spacer' }),
        el('span', { class: 'badge sq ' + (u.effectivePct == null ? 'neutral' : u.effectivePct >= 50 ? 'high' : 'info'), title: 'Cumulative effective ownership held by this UBO in this entity' },
          u.effectivePct == null ? 'effective % unknown' : u.effectivePct + '% effective'))));
  } else {
    uboBlock = el('div', { class: 'small muted' }, chains.length
      ? 'No distinct natural-person UBO — every control chain terminates in another company (no person or flagged beneficial owner above it).'
      : 'No upstream owners on record — this entity is not shown as controlled by any other party.');
  }

  // ── Control chain(s) in plain, readable form ──
  const chainRows = chains.slice(0, 12).map((c) => xrayChainRow(c.path, c.effectivePct, meta, pctByPair, (nid) => openEntityDrawer(nid)));
  const chainBlock = chainRows.length
    ? el('div', {}, el('div', { class: 'small muted mb' }, 'Control chain' + (chains.length > 1 ? 's' : '') + ' from the ultimate owner down to this entity (percentage on each arrow is that single link; the badge is the cumulative effective stake):'), ...chainRows,
        chains.length > 12 ? el('div', { class: 'small muted mt' }, '+ ' + (chains.length - 12) + ' more chain(s)') : null)
    : el('div', { class: 'small muted' }, 'No ownership chain leads up to this entity.');

  // ── What this entity controls / holds (downstream) ──
  const outByOwner = new Map();
  for (const e of gEdges) { if (!_isOwnEdge(e)) continue; if (!outByOwner.has(e.source)) outByOwner.set(e.source, []); outByOwner.get(e.source).push(e); }
  const directHoldings = (outByOwner.get(id) || []);
  // transitive downstream set (excludes self), cycle-safe
  const downSet = new Set(); const stack = [id];
  while (stack.length) { const cur = stack.pop(); for (const e of outByOwner.get(cur) || []) if (!downSet.has(e.target) && e.target !== id) { downSet.add(e.target); stack.push(e.target); } }
  const indirectCount = Math.max(0, downSet.size - directHoldings.length);
  let holdBlock;
  if (directHoldings.length) {
    holdBlock = el('div', {},
      el('div', { class: 'small muted mb' }, 'Companies this entity directly owns or controls' + (indirectCount ? ' (plus ' + indirectCount + ' more held indirectly, further down)' : '') + ':'),
      ...directHoldings.slice(0, 20).map((e) => clickableRow({ class: 'row', style: { padding: '6px 0', borderBottom: '1px solid var(--border)', gap: '8px', alignItems: 'center', cursor: 'pointer' }, onClick: () => openEntityDrawer(e.target) },
        el('span', { class: 'badge sq neutral' }, fmt.title(e.rel_type || 'owns')),
        el('span', { class: 'small' }, nameOf(e.target)),
        el('span', { class: 'spacer' }),
        e.ownership_pct != null ? el('span', { class: 'small tabular muted' }, e.ownership_pct + '%') : null)),
      directHoldings.length > 20 ? el('div', { class: 'small muted mt' }, '+ ' + (directHoldings.length - 20) + ' more direct holding(s)') : null);
  } else {
    holdBlock = el('div', { class: 'small muted' }, 'This entity does not own or control any other entity in the register (it sits at the bottom of its structure).');
  }

  // ── Circular-ownership callout ──
  let circBlock = null;
  if (circular) {
    const loops = _findOwnershipCycles(gEdges, ubo && ubo.nodeIds ? ubo.nodeIds : null);
    circBlock = el('div', { class: 'card', style: { marginTop: '2px', borderColor: '#5a2328', background: 'var(--high-bg)' } },
      el('div', { class: 'card-body', style: { display: 'flex', gap: '9px', alignItems: 'flex-start' } },
        el('span', { style: { color: 'var(--high)', flex: '0 0 auto', lineHeight: '1' } }, icon('alert', 16)),
        el('div', {},
          el('div', { class: 'small', style: { fontWeight: 600, color: 'var(--high)' } }, 'Circular ownership detected'),
          el('div', { class: 'small muted', style: { marginTop: '2px' } }, 'This control structure contains a loop — entities owning each other in a circle, which obscures the true beneficial owner and can defeat clean attribution.'),
          loops.length ? el('div', { class: 'mt', style: { marginTop: '6px' } }, ...loops.slice(0, 3).map((cyc) =>
            el('div', { class: 'small tabular', style: { color: 'var(--text-2)' } }, cyc.concat(cyc[0]).map(nameOf).join(' → ')))) : null)));
  }

  // ── Summary chips + optional graph tie-in ──
  const chips = el('div', { class: 'row wrap', style: { gap: '6px', marginBottom: '10px' } },
    el('span', { class: 'badge sq ' + (ubos.length ? 'med' : 'neutral') }, String(ubos.length), ' UBO', ubos.length === 1 ? '' : 's'),
    typeof structure.depth === 'number' ? el('span', { class: 'badge sq neutral', title: 'Longest ownership chain, in layers' }, structure.depth + ' layer' + (structure.depth === 1 ? '' : 's') + ' deep') : null,
    typeof structure.jurisdictions === 'number' && structure.jurisdictions > 1 ? el('span', { class: 'badge sq info', title: 'Distinct jurisdictions spanned by the structure' }, structure.jurisdictions + ' jurisdictions') : null,
    downSet.size ? el('span', { class: 'badge sq neutral', title: 'Total entities held directly or indirectly downstream' }, 'controls ' + downSet.size) : null,
    structure.nominee ? el('span', { class: 'badge sq med', title: 'A nominee is interposed, masking the real owner' }, 'nominee layer') : null,
    circular ? el('span', { class: 'badge sq high' }, 'circular') : null,
    structure.incomplete ? el('span', { class: 'badge sq med', title: 'Beneficial ownership is not fully attributable (unknown %, nominee, or a loop)' }, 'attribution incomplete') : null);

  const traceBtn = el('button', { class: 'btn sm', title: 'Highlight this control structure on the Network Explorer graph', onclick: () => {
    const ids = (ubo && ubo.nodeIds && ubo.nodeIds.length) ? ubo.nodeIds : Array.from(new Set(chains.flatMap((c) => c.path)));
    if (_lastNexusGraph && ids.length > 1) { try { _lastNexusGraph.highlightPath(ids, '#e5a53b'); toast('Control structure highlighted on the graph', { type: 'success' }); return; } catch (_e) {} }
    location.hash = '#/nexus/network/' + encodeURIComponent(id);
  } }, icon('nexus', 14), 'Trace on graph');

  container.replaceChildren(ownershipXrayShell(
    chips,
    el('div', { class: 'small', style: { fontWeight: 600, marginBottom: '4px' } }, 'Ultimate beneficial owners'),
    uboBlock,
    el('div', { class: 'small', style: { fontWeight: 600, margin: '14px 0 4px' } }, 'Control chains'),
    chainBlock,
    el('div', { class: 'small', style: { fontWeight: 600, margin: '14px 0 4px' } }, 'What this entity controls'),
    holdBlock,
    circBlock,
    el('div', { class: 'mt2' }, traceBtn)));
}

// Client-side directed-ownership cycle finder (mirrors graph.mjs detectCycles),
// optionally restricted to a set of node ids (the traced control structure).
function _findOwnershipCycles(edges, restrictIds) {
  const allow = restrictIds ? new Set(restrictIds) : null;
  const out = new Map(); const nodes = new Set();
  for (const e of edges) {
    if (!_isOwnEdge(e)) continue;
    if (allow && (!allow.has(e.source) || !allow.has(e.target))) continue;
    if (!out.has(e.source)) out.set(e.source, []);
    out.get(e.source).push(e.target); nodes.add(e.source); nodes.add(e.target);
  }
  const WHITE = 0, GRAY = 1, BLACK = 2; const color = new Map();
  for (const n of nodes) color.set(n, WHITE);
  const cycles = [];
  const dfs = (u, path) => {
    color.set(u, GRAY); path.push(u);
    for (const v of out.get(u) || []) {
      if (color.get(v) === GRAY) { const i = path.indexOf(v); if (i >= 0) cycles.push(path.slice(i)); }
      else if (color.get(v) === WHITE) dfs(v, path);
    }
    path.pop(); color.set(u, BLACK);
  };
  for (const n of nodes) if (color.get(n) === WHITE) dfs(n, []);
  // dedupe by member set
  const seen = new Set(); const uniq = [];
  for (const c of cycles) { const k = [...c].sort().join('|'); if (!seen.has(k)) { seen.add(k); uniq.push(c); } }
  return uniq;
}

/* ============ Chain-Link Engine ============ */
export async function chainlink(root, parts) {
  const tab = parts[0] || 'graph';
  root.append(pageHead('Chain-Link Engine', 'Synthetic crypto transaction forensics'));
  root.append(intro('Chain-Link Engine', 'traces crypto funds across wallets. Run the Peeling-Chain Simulator to generate a laundering pattern over 50+ hops, watch it play out on the Transaction Graph, and review the automated detection alerts.'));
  root.append(tabsBar([['graph', 'Transaction Graph'], ['simulator', 'Peeling-Chain Simulator'], ['wallets', 'Wallet Directory'], ['alerts', 'Detection Alerts']], tab, (k) => (location.hash = '#/chainlink/' + k)));
  const panel = el('div'); root.append(panel);
  if (tab === 'simulator') return simulator(panel);
  if (tab === 'wallets') return walletDir(panel);
  if (tab === 'alerts') return cryptoAlerts(panel);
  return cryptoGraph(panel);
}

// The Chain-Link Transaction Graph is drawn by the DEDICATED chainTrace renderer
// (the winning "Variant A" aggregated Sankey-by-volume), NOT the shared flowGraph.
// It collapses the illegible 58-hop "endless line" into ~17 expandable capsule/gate
// steps that fit ONE screen: a tapering flow ribbon (width = amount, log-scaled),
// full-height mixer/bridge gate lanes, a cash-out lane, a critical-path summary strip
// and 9-stat headline, with the risk-95 hot path pre-lit. It owns its own visual
// grammar + closable legend internally, so it needs only {nodes,edges,onNodeClick,
// traceId}. The Sovereign Nexus network tab still uses flowGraph, unchanged.

// Compute the plain-language findings for the header from the raw trace data, so the
// page answers the investigator's four questions (where from → where to → how much
// cashed out where → what's high-risk) BEFORE the user touches anything. Mirrors the
// aggregation the in-page graph does; kept simple and deterministic.
function chainFindings(d) {
  const nodes = d.nodes, edges = d.edges;
  const inE = new Map(), outE = new Map();
  for (const e of edges) { (outE.get(e.source) || outE.set(e.source, []).get(e.source)).push(e); (inE.get(e.target) || inE.set(e.target, []).get(e.target)).push(e); }
  let source = nodes.find((n) => outE.has(n.id) && !inE.has(n.id)) || nodes[0];
  const firstOut = (outE.get(source.id) || []).slice().sort((a, b) => b.amount - a.amount);
  const originated = (firstOut[0] ? firstOut[0].amount : 0) + (firstOut[1] ? firstOut[1].amount : 0);
  const sumInByType = (t) => nodes.filter((n) => n.type === t).reduce((acc, n) => acc + (inE.get(n.id) || []).reduce((a, e) => a + e.amount, 0), 0);
  const toExch = sumInByType('exchange'), toMerch = sumInByType('merchant'), toDep = sumInByType('deposit');
  const cnt = (t) => nodes.filter((n) => n.type === t).length;
  const highRisk = nodes.filter((n) => n.risk === 'High').length;
  const hotEdges = edges.filter((e) => e.risk === 95).length;
  const hopMax = edges.length ? edges.reduce((m, e) => (e.hop > m ? e.hop : m), 0) : 0;
  return { source, originated, toExch, toMerch, toDep, mixers: cnt('mixer'), bridges: cnt('bridge'),
    exchanges: cnt('exchange'), merchants: cnt('merchant'), highRisk, hotEdges, hopMax,
    nodeCount: nodes.length, edgeCount: edges.length };
}

async function cryptoGraph(panel) {
  panel.append(skeleton(80));
  const traces = await api.get('/api/traces');
  const sel = el('select', {}, ...traces.rows.map((t) => el('option', { value: t.id }, t.name)));
  // The in-page chainTrace renderer carries its OWN canvas controls (Fit, Reset, zoom,
  // a closable Key). These page-level buttons drive the returned handle. The renderer
  // now lives INSIDE the normal .page content as a bounded card — the FRIS sidebar,
  // top-bar and breadcrumb stay visible and the page scrolls normally.
  const fitBtn = el('button', { class: 'btn sm primary', title: 'Fit the whole flow into the graph card' }, icon('search', 14), 'Fit to view');
  const resetBtn = el('button', { class: 'btn sm', title: 'Clear focus and refit the graph' }, icon('reset', 14), 'Reset view');
  const head = el('div');     // findings header card
  const box = el('div');      // the bounded graph card
  const tableBox = el('div'); // the underlying-transactions table card
  panel.replaceChildren(el('div', { class: 'filters' }, labeled('Saved trace', sel), labeled('View', el('div', { class: 'row' }, fitBtn, resetBtn))), head, box, tableBox);
  let graph = null;
  async function load() {
    head.replaceChildren();
    box.replaceChildren(skeleton(480));
    tableBox.replaceChildren();
    const d = await api.get('/api/crypto/graph?trace=' + encodeURIComponent(sel.value));
    const f = chainFindings(d);

    // ── Findings header: the story in words + KPI stat chips ──────────────────
    const stat = (label, value, cls) => el('div', { class: 'clg-stat' + (cls ? ' ' + cls : '') },
      el('div', { class: 'clg-stat-v' }, value), el('div', { class: 'clg-stat-k' }, label));
    head.replaceChildren(card('What this trace shows', { sub: 'Trace ' + sel.value + ' — automated summary' },
      el('p', { class: 'clg-story' },
        `The money originates at `, el('strong', {}, f.source.label || f.source.id),
        ` (~${fmt.crypto(f.originated, 'ETH')}), then runs a ${f.hopMax}-hop peel chain — `,
        `bulk moving forward while small amounts peel off almost every hop. Along the way it funnels through `,
        el('strong', {}, `${f.mixers} mixer${f.mixers === 1 ? '' : 's'}`), ` and `,
        el('strong', {}, `${f.bridges} cross-chain bridge${f.bridges === 1 ? '' : 's'}`),
        `, and cashes out at exchanges and merchants. `,
        f.hotEdges ? el('strong', { class: 'clg-hot-text' }, `${f.hotEdges} risk-95 "hot" hop${f.hotEdges === 1 ? '' : 's'}`) : 'No risk-95 hops',
        f.hotEdges ? ` and ${f.highRisk} high-risk wallets are pre-highlighted below.` : ` were found; ${f.highRisk} high-risk wallets are marked.`),
      el('div', { class: 'clg-stats' },
        stat('Originated at source', fmt.crypto(f.originated, 'ETH')),
        stat('Cashed out — exchanges', fmt.crypto(f.toExch, 'ETH'), 'ex'),
        stat('Cashed out — merchants', fmt.crypto(f.toMerch, 'ETH'), 'me'),
        stat('Peeled to deposits', fmt.crypto(f.toDep, 'ETH'), 'de'),
        stat('Mixers / bridges', `${f.mixers} / ${f.bridges}`, 'mx'),
        stat('High-risk wallets', String(f.highRisk), 'hi'),
        stat('Hot hops (risk 95)', String(f.hotEdges), 'hi'),
        stat('Hops → nodes', `${f.hopMax} → ${f.nodeCount}`))));

    // ── The bounded, in-page graph card (position:relative; overflow:hidden) ──
    // A fixed, sensible height like every other FRIS view — NO viewport takeover.
    const g = el('div', { class: 'clg-frame', style: { position: 'relative', height: '620px', overflow: 'hidden' } });
    box.replaceChildren(card('Transaction flow', {
      sub: `${f.nodeCount} wallets/services · ${f.edgeCount} transactions · ${f.hopMax} hops aggregated into a single-screen entity flow`,
      flush: true,
    }, g));
    graph = chainTrace(g, {
      nodes: d.nodes,
      edges: d.edges,
      traceId: sel.value,
      onNodeClick: (id) => openWalletDrawer(id),
    });

    // ── The underlying transactions, in a normal sortable/searchable table ────
    const rows = d.edges.map((e) => {
      const s = d.nodes.find((n) => n.id === e.source), t = d.nodes.find((n) => n.id === e.target);
      return { id: e.id, hop: e.hop, from: s ? (s.label || s.id) : e.source, fromId: e.source,
        to: t ? (t.label || t.id) : e.target, toId: e.target, toType: t ? t.type : '',
        amount: e.amount, pattern: e.pattern, risk: e.risk };
    });
    tableBox.replaceChildren(el('div', { class: 'mt2' }, card('Underlying transactions', { sub: 'Every hop in the trace — click a row to open the receiving wallet' },
      dataTable([
        { key: 'hop', label: 'Hop', sortable: true, align: 'right' },
        { key: 'from', label: 'From', sortable: true, render: (r) => el('span', { class: 'small' }, r.from) },
        { key: 'to', label: 'To', sortable: true, render: (r) => el('span', { class: 'row', style: { gap: '6px' } }, el('span', { class: 'small' }, r.to), r.toType ? el('span', { class: 'badge sq neutral' }, fmt.title(r.toType)) : null) },
        { key: 'amount', label: 'Amount', sortable: true, align: 'right', sortVal: (r) => r.amount, render: (r) => el('span', { class: 'tabular small' }, fmt.crypto(r.amount, 'ETH')) },
        { key: 'pattern', label: 'Pattern', render: (r) => el('span', { class: 'badge sq neutral' }, r.pattern) },
        { key: 'risk', label: 'Edge risk', sortable: true, align: 'right', sortVal: (r) => r.risk, render: (r) => el('span', { class: 'badge sq ' + (r.risk >= 95 ? 'high' : r.risk >= 60 ? 'med' : 'neutral') }, String(r.risk) + (r.risk >= 95 ? ' HOT' : '')) },
      ], rows, {
        sort: 'hop', dir: 'asc', pageSize: 12, searchable: true, searchKeys: ['from', 'to', 'pattern', 'id'],
        searchPlaceholder: 'Filter transactions…', empty: 'No transactions in this trace',
        onRowClick: (r) => openWalletDrawer(r.toId),
      }))));
  }
  fitBtn.onclick = () => { if (graph) graph.fit(); };
  resetBtn.onclick = () => { if (graph) graph.reset(); };
  sel.onchange = load;
  await load();
}

// Plain-language "where does the risk come from" indicators for a peel-chain
// config, computed in the browser so the operator sees the exposure the instant
// they change a figure — BEFORE running anything. This is a faithful mirror of the
// server engine's peelChainRiskIndicators(); the /api/crypto/risk-preview route is
// the canonical, unit-tested version and the two are kept in lock-step.
const PEEL_THRESH = { fanOut: 6, convergenceUpstream: 3, peelChainMin: 8 };
function peelRiskPreview(cfg) {
  const hops = Math.max(1, Math.floor(Number(cfg.hops) || 55));
  const mixerEvent = !!cfg.mixerEvent, bridgeEvent = !!cfg.bridgeEvent, aggregate = !!cfg.exchangeAggregation;
  const mixerAt = mixerEvent ? Math.floor(hops * 0.6) : -1;
  const bridgeAt = bridgeEvent ? Math.floor(hops * 0.4) : -1;
  const pExch = aggregate ? Math.min(0.9, 0.4 + 0.12) : 0.4;
  const expExchangeAddrs = Math.round(hops * pExch * 0.5);
  const fanOut = hops;
  const peelChainLong = hops >= PEEL_THRESH.peelChainMin;
  return [
    { id: 'mixer_proximity', severity: 'High', present: mixerEvent, title: 'Routed within 1 hop of a mixing service',
      detail: mixerEvent ? `Mixer hop inserted at hop ${mixerAt} of ${hops} — funds pass straight through a tumbler, the strongest laundering signal. Turn off “Include a mixer event” to avoid it.` : 'No mixer hop — funds never touch a tumbler.' },
    { id: 'bridge_usage', severity: 'Medium', present: bridgeEvent, title: 'Crosses a cross-chain bridge',
      detail: bridgeEvent ? `Bridge hop at hop ${bridgeAt} moves value across chains, breaking on-chain provenance.` : 'No bridge hop — provenance stays on one chain.' },
    { id: 'peel_chain', severity: peelChainLong ? 'High' : 'Medium', present: peelChainLong, title: `Peel chain longer than ${PEEL_THRESH.peelChainMin} hops`,
      detail: `Configured for ${hops} sequential hops${hops >= 50 ? ' — a classic long-layering topology' : ''}; each hop peels a small cash-out and forwards the rest.` },
    { id: 'fan_out', severity: fanOut >= PEEL_THRESH.fanOut ? 'Medium' : 'Low', present: fanOut >= PEEL_THRESH.fanOut, title: `Fans out into ~${fanOut} addresses`,
      detail: `Each hop forwards to a fresh address, spreading the trail across ~${fanOut} wallets (threshold ${PEEL_THRESH.fanOut}).` },
    { id: 'exchange_convergence', severity: expExchangeAddrs >= PEEL_THRESH.convergenceUpstream ? 'Medium' : 'Low', present: expExchangeAddrs >= PEEL_THRESH.convergenceUpstream, title: 'Converges on flagged exchange deposits',
      detail: `${aggregate ? 'Late-hop aggregation biases peels toward exchanges; ' : ''}~${expExchangeAddrs} distinct exchange deposit addresses expected to receive peels (threshold ${PEEL_THRESH.convergenceUpstream}).` },
  ];
}

async function simulator(panel) {
  const cfg = { seed: 20260701, initialValue: 500, assetSymbol: 'ETH', hops: 58, peelPercent: 0.07, minPeel: 0.4, feePerTx: 0.002, timeIntervalSec: 900, intervalVariance: 0.4, exchangeAggregation: false, bridgeEvent: true, mixerEvent: true };
  const inputs = {};
  const num = (k, label, step) => { const i = el('input', { type: 'number', id: fieldId('num'), value: cfg[k], step: step || 'any', style: { width: '110px' }, oninput: refreshPreview }); inputs[k] = i; return el('div', { class: 'assume-row' }, el('label', { for: i.id }, label), i); };
  const chk = (k, label) => { const i = el('input', { type: 'checkbox', onchange: refreshPreview }); i.checked = cfg[k]; inputs[k] = i; return el('label', { class: 'row small', style: { padding: '6px 0' } }, i, ' ', label); };
  // Risk-exposure preview shown right beside the figure inputs (updates live).
  const previewList = el('div');
  const preview = el('div', { class: 'card', style: { marginTop: '12px', borderColor: '#3a2a2f', background: '#160f12' } },
    el('div', { class: 'card-head', style: { alignItems: 'flex-start' } },
      el('div', {}, el('div', { class: 'card-title', style: { display: 'flex', alignItems: 'center', gap: '6px' } }, icon('alert', 15), 'Risk exposure — before you run'),
        el('div', { class: 'small muted', style: { marginTop: '2px' } }, 'Where the risk in these figures comes from. E.g. how do you avoid routing funds within one hop of a mixing service? Flip the switches below and watch this update.')),
      el('span', { class: 'spacer' })),
    el('div', { class: 'card-body' }, previewList));
  function refreshPreview() {
    const c = { hops: Number(inputs.hops.value), peelPercent: Number(inputs.peelPercent.value), exchangeAggregation: inputs.exchangeAggregation.checked, bridgeEvent: inputs.bridgeEvent.checked, mixerEvent: inputs.mixerEvent.checked };
    const ind = peelRiskPreview(c);
    const active = ind.filter((i) => i.present);
    const rows = ind.map((i) => {
      const on = i.present;
      const cls = !on ? 'low' : i.severity === 'High' ? 'high' : i.severity === 'Medium' ? 'med' : 'low';
      return el('div', { class: 'row', style: { alignItems: 'flex-start', gap: '9px', padding: '7px 0', borderBottom: '1px solid var(--border)', opacity: on ? '1' : '0.5' } },
        el('span', { class: `badge sq ${cls}`, style: { flex: '0 0 auto', minWidth: '58px', justifyContent: 'center' } }, on ? i.severity : 'clear'),
        el('div', {}, el('div', { class: 'small', style: { fontWeight: on ? 600 : 400 } }, (on ? '' : 'Avoided — ') + i.title), el('div', { class: 'small muted' }, i.detail)));
    });
    previewList.replaceChildren(
      el('div', { class: 'row small', style: { gap: '8px', marginBottom: '8px' } },
        el('span', { class: `badge sq ${active.some((a) => a.severity === 'High') ? 'high' : active.length ? 'med' : 'low'}` }, `${active.length} of ${ind.length} risk signals active`),
        el('span', { class: 'muted' }, active.length ? 'These fire when you run with the current figures.' : 'Configuration currently clean.')),
      ...rows);
  }
  const form = card('Simulation configuration', { sub: 'Deterministic — same seed + inputs ⇒ same result' },
    num('seed', 'Random seed'), num('initialValue', 'Initial value'),
    labeled('Asset', selectRaw(['ETH', 'BTC', 'USDT', 'USDC', 'XMR'], 'ETH', (v) => (cfg.assetSymbol = v)), inputs, 'assetSymbol'),
    num('hops', 'Hops'), num('peelPercent', 'Peel fraction', '0.01'), num('minPeel', 'Min peel'), num('feePerTx', 'Fee / tx'), num('timeIntervalSec', 'Interval (s)'), num('intervalVariance', 'Interval variance', '0.1'),
    chk('exchangeAggregation', 'Aggregate to exchanges late in the chain'), chk('bridgeEvent', 'Include a bridge event'), chk('mixerEvent', 'Include a mixer event'),
    preview,
    el('div', { class: 'row mt', style: { gap: '8px' } }, el('button', { class: 'btn primary', onclick: run }, icon('play', 15), 'Run simulation'), el('button', { class: 'btn', onclick: () => run(true) }, 'Run & save trace')));
  const results = el('div');
  panel.replaceChildren(el('div', { class: 'split' }, form, results));
  refreshPreview();
  async function run(save) {
    const payload = { assetSymbol: cfg.assetSymbol }; for (const k of ['seed', 'initialValue', 'hops', 'peelPercent', 'minPeel', 'feePerTx', 'timeIntervalSec', 'intervalVariance']) payload[k] = Number(inputs[k].value); for (const k of ['exchangeAggregation', 'bridgeEvent', 'mixerEvent']) payload[k] = inputs[k].checked; if (save) { payload.save = true; payload.name = 'Sim ' + new Date().toISOString().slice(11, 19); }
    results.replaceChildren(skeleton(300));
    try {
      const r = await api.post('/api/crypto/simulate', payload);
      const s = r.summary;
      const kpis = el('div', { class: 'grid k2' }, kpi({ label: 'Hops generated', value: s.hopCount }), kpi({ label: 'Total peeled', value: s.totalPeeled + ' ' + s.asset }), kpi({ label: 'Residual', value: s.residual + ' ' + s.asset }), kpi({ label: 'Cumulative fees', value: s.cumulativeFees + ' ' + s.asset }));
      const conserved = el('div', { class: 'row small', style: { gap: '8px' } }, s.conserved ? statusBadge('Verified') : statusBadge('High'), el('span', { class: 'muted' }, `Value conservation: initial ${s.initialValue} = residual + peeled + fees (${s.conserved ? 'exact' : 'MISMATCH'})`));
      const alertList = el('div', {}, ...r.alerts.map((a) => el('div', { class: 'row', style: { padding: '6px 0', borderBottom: '1px solid var(--border)' } }, statusBadge(a.severity), el('span', { class: 'small' }, a.reason))));
      const rows = r.hops.slice(0, 60);
      const table = dataTable([
        { key: 'hop', label: 'Hop', sortable: true, align: 'right' }, { key: 'peel', label: 'Peel', align: 'right', render: (h) => el('span', { class: 'tabular' }, h.peel) },
        { key: 'peelDestType', label: 'Destination', render: (h) => el('span', { class: 'badge sq neutral' }, h.peelDestType) }, { key: 'forwarded', label: 'Forwarded', align: 'right', render: (h) => el('span', { class: 'tabular' }, h.forwarded) },
        { key: 'ts', label: 'Time', render: (h) => el('span', { class: 'small muted' }, h.ts.slice(0, 16).replace('T', ' ')) },
      ], rows, { pageSize: 8 });
      results.replaceChildren(kpis, el('div', { class: 'mt' }, conserved), el('div', { class: 'mt2' }, card('Generated alerts', { sub: `${r.alerts.length}` }, alertList)), el('div', { class: 'mt2' }, card('Hop ledger', { sub: `first ${rows.length} of ${s.hopCount}`, flush: true }, table)));
      if (save) toast('Trace saved', { type: 'success' });
    } catch (e) { results.replaceChildren(errorState(e.message)); }
  }
  run();
}

async function walletDir(panel) {
  panel.append(skeleton(300));
  const d = await api.get('/api/wallets?limit=500');
  const table = dataTable([
    { key: 'id', label: 'ID', sortable: true, render: (r) => el('span', { class: 'mono small' }, r.id) },
    { key: 'label', label: 'Label', sortable: true, render: (r) => r.label || el('span', { class: 'mono small muted' }, fmt.short(r.address, 14)) },
    { key: 'node_type', label: 'Type', sortable: true, render: (r) => el('span', { class: 'badge sq neutral' }, fmt.title(r.node_type)) },
    { key: 'risk_category', label: 'Risk', sortable: true, render: (r) => riskBadge(r.risk_category) },
    { key: 'is_dormant', label: 'Dormant', sortable: true, render: (r) => r.is_dormant ? statusBadge('Watchlisted') : el('span', { class: 'muted' }, '—') },
    { key: 'balance_minor', label: 'Balance', sortable: true, align: 'right', render: (r) => el('span', { class: 'tabular' }, fmt.crypto(r.balance_minor, r.asset)) },
  ], d.rows, { searchable: true, searchKeys: ['id', 'label', 'address', 'node_type'], searchPlaceholder: 'Search wallets…', pageSize: 14, onRowClick: (r) => openWalletDrawer(r.id) });
  panel.replaceChildren(card('Wallet Directory', { sub: `${d.total} synthetic wallets & service nodes`, flush: true }, table));
}

async function cryptoAlerts(panel) {
  panel.append(skeleton(300));
  const d = await api.get('/api/crypto/alerts');
  const byType = {}; d.alerts.forEach((a) => (byType[a.type] ||= []).push(a));
  panel.replaceChildren(el('div', { class: 'grid k2' }, ...Object.entries(byType).map(([t, list]) => card(fmt.title(t), { sub: `${list.length}`, actions: statusBadge(list[0].severity) }, el('div', {}, ...list.slice(0, 8).map((a) => el('div', { class: 'small', style: { padding: '5px 0', borderBottom: '1px solid var(--border)' } }, a.reason)))))));
}

// Friendly, type-aware labels so a node is NEVER mislabelled — an exchange reads
// "Exchange", a mixer "Mixer", a bridge "Cross-chain bridge", etc. (the drawer used
// to hard-code every node as a "Wallet").
const WALLET_TYPE_LABEL = { exchange: 'Exchange', mixer: 'Mixer', bridge: 'Cross-chain bridge', deposit: 'Deposit address', withdrawal: 'Withdrawal address', merchant: 'Merchant', custodial: 'Custodial wallet', wallet: 'Wallet' };
function walletTypeLabel(t) { return WALLET_TYPE_LABEL[t] || fmt.title(t || 'wallet'); }

// A concise, honest "why is this flagged higher-risk" read for a node — from its
// TYPE, score, watchlist state and the risk_reasons on its own transactions. No
// fabricated certainty: a mixer/bridge is inherently trail-breaking; everything
// else is only surfaced when the data actually carries the signal.
function walletRiskReasons(w, txs) {
  const out = [];
  if (w.node_type === 'mixer') out.push('Mixer / tumbler — built to break the transaction trail (a classic layering step).');
  else if (w.node_type === 'bridge') out.push('Cross-chain bridge — moves value between chains, making the trail harder to follow.');
  else if (w.node_type === 'exchange') out.push('Exchange off-ramp — where crypto cashes out to fiat (a KYC / legal-process leverage point).');
  if (w.is_dormant) out.push('Flagged / watchlisted address.');
  const seen = new Set();
  for (const t of txs) { const r = t.risk_reason; if (r && (t.risk_score || 0) >= 66 && !seen.has(r)) { seen.add(r); out.push('Transaction signal: ' + r + '.'); } }
  if (!out.length && w.risk_category === 'High') out.push('Scored High risk in Chain-Link’s heuristics.');
  return out;
}

// One fund-flow row: DIRECTION arrow, the COUNTERPARTY (click to follow the money),
// the pattern, its risk reason, and the amount. Hot (risk >= 66) hops are marked.
function walletFlowRow(t, dir) {
  const other = dir === 'out' ? t.to_id : t.from_id;
  const hot = (t.risk_score || 0) >= 66;
  return el('div', { class: 'row', style: { padding: '6px 0', borderBottom: '1px solid var(--border)', gap: '8px', alignItems: 'baseline' } },
    el('span', { style: { color: dir === 'out' ? '#f0616d' : '#46b877', fontWeight: '700', flex: '0 0 auto' }, title: dir === 'out' ? 'Funds leave this node' : 'Funds arrive at this node' }, dir === 'out' ? '→ out' : '← in'),
    el('a', { class: 'mono small', href: '#', style: { color: 'var(--accent)', textDecoration: 'none', flex: '0 0 auto' }, title: 'Follow the money — open ' + other, onclick: (e) => { e.preventDefault(); openWalletDrawer(other); } }, other),
    el('span', { class: 'badge sq neutral' }, t.pattern),
    t.risk_reason ? el('span', { class: 'small muted', title: 'Why this hop is flagged' }, t.risk_reason) : null,
    hot ? el('span', { class: 'badge sq high' }, 'hot') : null,
    el('span', { class: 'spacer tabular small' }, fmt.crypto(t.amount_minor, t.asset)));
}

export async function openWalletDrawer(id) {
  const body = openDrawer({ title: 'Node', subtitle: id, body: (b) => b.append(skeleton(160)) });
  try {
    const d = await api.get('/api/wallets/' + encodeURIComponent(id));
    const w = d.wallet;
    const typeLabel = walletTypeLabel(w.node_type);
    // Retitle the drawer by the ACTUAL node type (Exchange / Mixer / Bridge / …).
    const head = body.parentElement;
    const titleEl = head && head.querySelector('.drawer-head .title');
    if (titleEl) titleEl.textContent = typeLabel;
    const subEl = head && head.querySelector('.drawer-head .small.muted');
    if (subEl) subEl.textContent = w.label ? w.label + ' · ' + id : id;
    const reasons = walletRiskReasons(w, [...d.out, ...d.in]);
    const outTx = d.out.slice(0, 20), inTx = d.in.slice(0, 20);
    body.replaceChildren(
      el('div', { class: 'row wrap mb', style: { gap: '8px' } }, el('span', { class: 'badge sq neutral', title: 'Entity type' }, typeLabel), riskBadge(w.risk_category), w.is_dormant ? statusBadge('Watchlisted') : null, classBadge(w.data_classification)),
      w.label ? el('div', { class: 'card-title', style: { marginBottom: '6px' } }, w.label) : null,
      reasons.length ? el('div', { class: 'intro', style: { margin: '2px 0 10px' } }, el('span', { class: 'ico' }, icon('alert', 16)), el('div', { class: 't' }, el('b', {}, 'Why flagged: '), reasons.join(' '))) : null,
      el('dl', { class: 'dl' }, dt('Address'), dd(el('span', { class: 'mono small' }, w.address)), dt('Cluster'), dd(w.cluster_id || '—'), dt('Asset'), dd(w.asset), dt('Balance'), dd(fmt.crypto(w.balance_minor, w.asset)), dt('First seen'), dd(fmt.date(w.first_seen)), dt('Last seen'), dd(fmt.date(w.last_seen))),
      el('div', { class: 'mt2' },
        el('div', { class: 'card-title mb' }, `Fund flow (${d.out.length} out · ${d.in.length} in)`),
        el('div', { class: 'small muted', style: { marginBottom: '6px' } }, 'Direction of each hop and its counterparty — click a counterparty to follow the money.'),
        outTx.length ? el('div', { class: 'small', style: { color: 'var(--text-3)', margin: '4px 0 2px' } }, 'Outgoing — funds leave here →') : null,
        ...outTx.map((t) => walletFlowRow(t, 'out')),
        inTx.length ? el('div', { class: 'small', style: { color: 'var(--text-3)', margin: '10px 0 2px' } }, '← Incoming — funds arrive here') : null,
        ...inTx.map((t) => walletFlowRow(t, 'in'))),
    );
    const drawer = document.querySelector('.drawer');
    if (drawer && !drawer.querySelector('.drawer-foot')) drawer.append(el('div', { class: 'drawer-foot' }, addToCaseButton('wallet', id, w.label || w.id), el('button', { class: 'btn sm', onclick: () => exportData('transactions') }, icon('download', 14), 'Export')));
  } catch (e) { body.replaceChildren(errorState(e.message)); }
}

/* ---------- small shared helpers ---------- */
// Monotonic id generator for programmatically associating <label for> with its
// control. Deterministic within a render pass; ids never need to be stable
// across renders, only unique in the live document.
let __fieldSeq = 0;
export function fieldId(prefix = 'f') { __fieldSeq += 1; return `fris-${prefix}-${__fieldSeq}`; }
// True for form controls a <label for=…> may legitimately target.
function isLabelable(node) {
  return !!node && typeof node.tagName === 'string' && /^(INPUT|SELECT|TEXTAREA)$/.test(node.tagName);
}
// Ensure `node` (a control, or a container holding one) is programmatically
// associated with `labelEl`. Sets for/id when the target is a labelable control;
// otherwise falls back to aria-labelledby so screen readers still pair them.
export function associateLabel(labelEl, node) {
  if (!labelEl || !node) return node;
  let target = isLabelable(node) ? node
    : (node.querySelector ? node.querySelector('input,select,textarea') : null);
  if (target) {
    if (!target.id) target.id = fieldId(String(target.tagName || 'f').toLowerCase());
    labelEl.setAttribute('for', target.id);
  } else {
    if (!labelEl.id) labelEl.id = fieldId('lbl');
    if (node.setAttribute && !node.getAttribute('aria-labelledby')) node.setAttribute('aria-labelledby', labelEl.id);
  }
  return node;
}
export function selectField(label, options, onChange) { const s = el('select', { onchange: (e) => onChange(e.target.value) }, ...options.map((o) => el('option', { value: o }, o === '' ? 'All ' + label.toLowerCase() : fmt.title(o)))); return labeled(label, s); }
export function labeled(label, node) { const lbl = el('label', {}, label); associateLabel(lbl, node); return el('div', { class: 'field' }, lbl, node); }
function selectRaw(options, val, onChange) { return el('select', { onchange: (e) => onChange(e.target.value) }, ...options.map((o) => el('option', { value: o, selected: o === val }, o))); }
export async function exportData(type) {
  try { const r = await api.get(`/api/export?type=${type}&format=csv`); const blob = new Blob([r.content], { type: r.mime }); const a = el('a', { href: URL.createObjectURL(blob), download: r.filename }); document.body.append(a); a.click(); a.remove(); toast(`Exported ${r.filename}`, { type: 'success' }); } catch (e) { toast(e.message, { type: 'error' }); }
}

// ── Add-to-case picker ──────────────────────────────────────────────────────
// Opens a small modal to attach a record (entity / wallet / instrument / …) to a
// saved case. Lists existing cases (filterable) and offers "New case…". On pick
// it POSTs the link and toasts. Reused by every drawer's "＋ Add to case" action.
// Only text-node content is used for data; no innerHTML.
function pickRow(props, ...kids) {
  const node = el('div', Object.assign({ class: 'case-pick-row', role: 'button', tabindex: 0 }, props), ...kids);
  const act = props.onclick;
  if (act) node.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { if (e.preventDefault) e.preventDefault(); act(e); } });
  return node;
}
export function addToCase({ targetType, targetId, label }) {
  const listBox = el('div', { style: { maxHeight: '320px', overflow: 'auto', marginTop: '10px' } }, skeleton(120));
  const filter = el('input', { type: 'text', 'aria-label': 'Filter cases', placeholder: 'Filter cases…', style: { width: '100%' }, oninput: () => render() });
  let cases = [];
  const link = async (caseId, close) => {
    try { const r = await api.post(`/api/cases/${encodeURIComponent(caseId)}/links`, { target_type: targetType, target_id: targetId, label }); close(); toast(r.created ? 'Added to case' : 'Already in this case', { type: r.created ? 'success' : 'info' }); }
    catch (e) { toast(e.message, { type: 'error' }); }
  };
  const { close } = modal({
    title: 'Add to case', width: 460,
    body: (b) => {
      b.append(el('div', { class: 'small muted mb' }, 'Attach ', el('b', {}, label || targetId), ' (', fmt.title(targetType), ') to a saved case.'), filter, listBox);
      render();
    },
  });
  function render() {
    const q = (filter.value || '').toLowerCase();
    const shown = cases.filter((c) => !q || (c.title || '').toLowerCase().includes(q) || (c.id || '').toLowerCase().includes(q));
    const rows = shown.map((c) => pickRow({ onclick: () => link(c.id, close) },
      el('div', {}, el('div', { class: 'case-pick-title' }, c.title), el('div', { class: 'small muted' }, c.id + ' · ' + fmt.title(c.module) + ' · ' + (c.links || 0) + ' linked')),
      el('span', { class: 'spacer' }), statusBadge(c.status)));
    const newRow = pickRow({ class: 'case-pick-row newcase', role: 'button', tabindex: 0, onclick: () => newCaseThenLink() }, icon('plus', 15), el('div', { class: 'case-pick-title' }, 'New case…'));
    listBox.replaceChildren(newRow, ...(rows.length ? rows : [emptyState(cases.length ? 'No matching cases' : 'No saved cases yet — create one')]));
  }
  async function newCaseThenLink() {
    const title = el('input', { type: 'text', placeholder: 'e.g. Aravis cross-border review', style: { width: '100%' } });
    const mod = el('select', { style: { width: '100%' } }, ...['cross', 'nexus', 'chainlink', 'waterfall', 'regulatory'].map((m) => el('option', { value: m }, fmt.title(m))));
    modal({ title: 'New case', width: 440, body: (b) => b.append(labeled('Title', title), el('div', { class: 'mt' }), labeled('Module', mod)), actions: (c2) => [
      el('button', { class: 'btn', onclick: c2 }, 'Cancel'),
      el('button', { class: 'btn primary', onclick: async () => {
        if (!title.value.trim()) { toast('Title required', { type: 'warn' }); return; }
        try { const nc = await api.post('/api/cases', { title: title.value, module: mod.value }); c2(); await api.post(`/api/cases/${encodeURIComponent(nc.id)}/links`, { target_type: targetType, target_id: targetId, label }); close(); toast('Case created and record added', { type: 'success' }); }
        catch (e) { toast(e.message, { type: 'error' }); }
      } }, 'Create & add')] });
  }
  api.get('/api/cases').then((d) => { cases = d.rows || []; render(); }).catch((e) => listBox.replaceChildren(errorState(e.message)));
}

// A ready-made "＋ Add to case" drawer-footer button for a given record.
export function addToCaseButton(targetType, targetId, label) {
  return el('button', { class: 'btn sm', onclick: () => addToCase({ targetType, targetId, label }) }, icon('folder', 14), 'Add to case');
}
