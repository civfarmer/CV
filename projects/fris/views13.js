// View: Asset Tracing & Recovery — the cross-suite CAPSTONE. A follow-the-asset
// recovery dashboard that JOINS the three existing FRIS datasets — the Sovereign
// Nexus ownership graph + entity assets, Chain-Link wallet balances, and the
// Liquidation Waterfall insolvency estates — into one "where is the recoverable
// value and who controls it" view per debtor. Pick a target (a debtor / case),
// read the recoverable-value KPIs (total traced, recoverable vs contested vs
// frozen), follow the asset breakdown (controller → controlled entities → their
// wallets / estates / assets as linked panels), review the recoverability breakdown
// (by band + by jurisdiction, colour + label), and work the traced-asset table
// (asset, type, value, jurisdiction, controller, recoverability, source module),
// each linking back to its originating Nexus / Chain-Link / Waterfall record.
//
// Honest posture: 100% REUSE of FRIS's existing SYNTHETIC, deterministic data —
// no new real-world facts. The ONLY newly-synthesised links (wallet beneficial
// control + a per-asset recovery-likelihood %) are fixed-seed and labelled
// illustrative (disclaimer shown). Renders in-page within the shell (never a
// viewport takeover), accessible (colour ALWAYS paired with a text label, scope
// headers on tables), DOM-light (a handful of KPIs, breakdown bars and one table).
// No SVG geometry; no getBBox / getBoundingClientRect / matchMedia dependence.
import { el, api, fmt, icon, card, emptyState, errorState, skeleton, infoDot } from './core.js';
import { pageHead, intro } from './views1.js';

// Recoverability band → colour (ALWAYS paired with the text label). Mirrors the
// engine's RECOVERABILITY_BANDS palette.
const BAND_COLOR = { recoverable: '#2f9e63', contested: '#c9a227', frozen: '#d5303e' };
const BAND_TEXT = { recoverable: '#0b1f14', contested: '#1f1804', frozen: '#20060a' };
// Source-module → colour (matches each module's own accent).
const SOURCE_COLOR = { waterfall: '#e08a3c', nexus: '#4d8df0', chainlink: '#37c2b4' };
const SOURCE_ICON = { waterfall: 'waterfall', nexus: 'nexus', chainlink: 'chain' };
const ACCENT = '#c77dff'; // a violet accent — the capstone, distinct from every module

export async function recovery(root, parts) {
  root.append(pageHead('Asset Tracing & Recovery', 'The cross-suite CAPSTONE: a follow-the-asset recovery map that joins the Sovereign Nexus ownership graph, Chain-Link wallet balances and Liquidation Waterfall estates into one “where is the recoverable value and who controls it” view. Reuses FRIS’s existing synthetic data — the only new links (wallet beneficial control + recovery-likelihood %) are fixed-seed and labelled illustrative', [
    el('a', { class: 'btn sm ghost', href: '#/waterfall', title: 'The Liquidation Waterfall estates joined here' }, icon('waterfall', 15), 'Waterfall'),
    el('a', { class: 'btn sm ghost', href: '#/nexus', title: 'The Sovereign Nexus ownership graph joined here' }, icon('nexus', 15), 'Nexus'),
  ]));
  root.append(intro('Asset Tracing & Recovery',
    'is the suite’s capstone — it demonstrates FRIS’s unity by REUSING the other modules’ engines and data rather than inventing a parallel dataset. Pick a debtor (an insolvency case) and it follows the asset: it resolves the debtor to its Sovereign Nexus entity, walks the ownership / control graph to its ultimate beneficial owners and every controlled entity, then attaches those entities’ Chain-Link wallet balances, their Sovereign Nexus assets, and the debtor’s Liquidation Waterfall estate realisable value — classifying each asset as Recoverable, Contested or Frozen from real jurisdiction offshore / secrecy signals and the sanctions screening overlay. Read the recoverable-value KPIs, follow the controller → controlled-entities → assets breakdown, review the recoverability and jurisdiction split, and work the traced-asset table, each row linking back to its originating Nexus / Chain-Link / Waterfall record. Everything is reused synthetic data; the wallet beneficial-control links and the recovery-likelihood % are the only new, illustrative, fixed-seed additions.'));

  // Honesty banner.
  root.append(el('div', { class: 'intro', role: 'note', style: { marginTop: '10px', '--mc': ACCENT } },
    el('span', { class: 'ico' }, icon('info', 18)),
    el('div', { class: 't' }, el('b', {}, 'Reused synthetic data, joined — one illustrative new link. '),
      'This module introduces NO new real-world facts. It REUSES FRIS’s existing synthetic, deterministic data — the Sovereign Nexus entities / ownership graph / assets, the Chain-Link wallet balances, and the Liquidation Waterfall estates + creditors — joined into one recovery map. The ONLY newly-synthesised links are which existing wallet cluster is beneficially controlled by which traced entity, and the per-asset recovery-likelihood %; both are generated from a fixed-seed PRNG for reproducibility and are labelled illustrative. It is NOT an asset-recovery system of record, NOT a factual allegation of control, and NOT legal or financial advice.')));

  const body = el('div', { class: 'mt' });
  root.append(body);
  // A #/recovery/TARGET route deep-links straight to a target's trace.
  const initialTarget = parts[0] ? decodeURIComponent(parts[0]) : null;
  await renderDashboard(body, initialTarget);
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD — target picker, KPIs, follow-the-asset breakdown, recoverability
// breakdown, traced-asset table.
// ─────────────────────────────────────────────────────────────────────────────
async function renderDashboard(root, initialTarget) {
  const panel = el('div', {}, skeleton(360));
  root.append(panel);

  let targetsData;
  try { targetsData = await api.get('/api/recovery/targets'); }
  catch (e) { panel.replaceChildren(errorState(e.message)); return; }
  if (!targetsData.targets.length) { panel.replaceChildren(emptyState('No traceable targets')); return; }

  // Resolve the active target: the deep-linked one if valid, else the first.
  const valid = new Set(targetsData.targets.map((t) => t.id));
  const state = { targetId: (initialTarget && valid.has(initialTarget)) ? initialTarget : targetsData.targets[0].id, band: '' };

  const picker = targetPicker(targetsData, state, () => load());
  const traceWrap = el('div', { class: 'mt' });
  panel.replaceChildren(picker, traceWrap);

  async function load() {
    traceWrap.replaceChildren(skeleton(320));
    let trace;
    try { trace = await api.get('/api/recovery/trace/' + encodeURIComponent(state.targetId)); }
    catch (e) { traceWrap.replaceChildren(errorState(e.message)); return; }
    renderTrace(traceWrap, trace, state, () => load());
  }
  await load();
}

// The target (debtor / case) picker — a labelled <select> plus a compact summary
// of the chosen target's resolved controller.
function targetPicker(data, state, onChange) {
  const sel = el('select', { class: 'fin-select', 'aria-label': 'Choose a debtor / case to trace', style: { ...selectStyle(), minWidth: '320px' }, onchange: (e) => { state.targetId = e.target.value; state.band = ''; onChange(); } },
    ...data.targets.map((t) => el('option', { value: t.id }, `${t.debtorName} (${t.id})${t.controllerId ? '' : ' — no Nexus link'}`)));
  sel.value = state.targetId;
  return card('Trace a target', { sub: `${data.count} traceable debtors — each an insolvency case resolved to its Sovereign Nexus controller`, actions: el('span', { class: 'badge sq neutral' }, 'Capstone') },
    el('div', { class: 'row wrap', style: { gap: '12px', alignItems: 'center' } },
      el('span', { class: 'mc-icon', style: { color: ACCENT, flex: '0 0 auto' } }, icon('database', 18)),
      el('label', { class: 'small muted', style: { alignSelf: 'center' } }, 'Debtor / case'),
      sel),
    el('div', { class: 'small muted', style: { marginTop: '8px' } }, 'Pick a debtor to follow its recoverable value across Sovereign Nexus, Chain-Link and the Liquidation Waterfall.'));
}

function renderTrace(root, trace, state, reload) {
  const nodes = [];
  const s = trace.summary;
  const t = trace.target;

  // Controller header — who ultimately controls the recoverable value.
  nodes.push(controllerHeader(trace));

  // KPI strip: total traced, recoverable, contested, frozen, controlled entities.
  nodes.push(el('div', { class: 'row wrap', style: { gap: '10px', marginBottom: '12px' } },
    kpiChip('Total traced value', s.totalTracedValue.display, ACCENT, 'Illustrative common-CHF value of every traced asset across the three modules'),
    kpiChip('Recoverable', s.recoverableValue.display, BAND_COLOR.recoverable, `Onshore / controlled assets with a clear path to realisation (${s.recoverablePct}% of traced value)`),
    kpiChip('Contested', s.contestedValue.display, BAND_COLOR.contested, 'Offshore / high-secrecy or disputed assets — realisation is slow and contested'),
    kpiChip('Frozen / sanctioned', s.frozenValue.display, BAND_COLOR.frozen, 'Sanctioned or frozen assets — legally blocked'),
    kpiChip('Controlled entities', trace.controlledEntities.length, '#4d8df0', 'Sovereign Nexus entities the debtor controls (directly or downstream)'),
    kpiChip('Traced assets', s.assetCount, '#37c2b4', 'Assets joined from Waterfall estates, Nexus assets and Chain-Link wallets')));

  // Recoverable-vs-total headline bar.
  nodes.push(recoverabilityBar(s));

  // Two-column breakdowns: by source module, and by jurisdiction.
  nodes.push(el('div', { class: 'grid-2', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '12px', marginBottom: '4px' } },
    sourceBreakdownCard(s),
    jurisdictionBreakdownCard(s)));

  // Follow-the-asset breakdown (controller → controlled entities → assets).
  nodes.push(followTheAssetCard(trace));

  // The traced-asset table (filterable by recoverability band).
  nodes.push(tracedAssetTableCard(trace, state, reload));

  // The waterfall roll-up (reused figures) if the debtor has an estate.
  if (trace.waterfall) nodes.push(waterfallCard(trace));

  nodes.push(disclaimerNote(trace.disclaimer));
  root.replaceChildren(...nodes);
}

// Controller header — the linked Nexus entity + its ultimate beneficial owners.
function controllerHeader(trace) {
  const t = trace.target;
  const ubos = trace.ultimateControllers || [];
  const controllerLine = t.controllerId
    ? el('div', { class: 'small', style: { color: 'var(--text-2)', marginTop: '8px', lineHeight: '1.6' } },
        el('span', { style: { fontWeight: '600', color: 'var(--text)' } }, 'Controlled via: '),
        el('a', { href: '#/nexus/directory', style: { color: ACCENT, textDecoration: 'none' }, title: 'Open in Sovereign Nexus' }, t.controllerName),
        ` (${t.controllerId}${t.controllerJurisdiction ? ' · ' + t.controllerJurisdiction : ''})`)
    : el('div', { class: 'small muted', style: { marginTop: '8px' } }, 'No Sovereign Nexus entity resolved for this debtor — the estate is traced on its own.');
  const uboLine = ubos.length
    ? el('div', { class: 'row wrap', style: { gap: '6px', alignItems: 'center', marginTop: '8px' } },
        el('span', { class: 'small muted', style: { alignSelf: 'center' } }, `Ultimate controller${ubos.length === 1 ? '' : 's'}:`),
        ...ubos.slice(0, 6).map((u) => el('span', { class: 'badge', style: { background: hexToRgba(ACCENT, 0.16), color: ACCENT, borderColor: hexToRgba(ACCENT, 0.5) }, title: `${u.type || 'owner'}${u.effectivePct != null ? ' · effective ' + u.effectivePct + '%' : ''}` },
          el('span', { class: 'dot', style: { background: ACCENT } }), u.name + (u.effectivePct != null ? ` · ${u.effectivePct}%` : ''))),
        ubos.length > 6 ? el('span', { class: 'small muted' }, `+${ubos.length - 6} more`) : null)
    : null;
  return el('div', { class: 'card', style: { '--mc': ACCENT, borderLeft: '4px solid ' + ACCENT } },
    el('div', { class: 'card-body' },
      el('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center', marginBottom: '2px' } },
        el('span', { class: 'mc-icon', style: { color: ACCENT, flex: '0 0 auto' } }, icon('nexus', 20)),
        el('span', { style: { fontWeight: '800', color: 'var(--text)', fontSize: '18px' } }, t.debtorName),
        el('span', { class: 'badge sq neutral', title: 'Insolvency case id' }, t.id),
        el('span', { class: 'badge sq neutral', title: 'Debtor jurisdiction' }, t.jurisdiction),
        el('span', { class: 'badge sq neutral' }, t.status)),
      controllerLine,
      uboLine));
}

// Recoverable-vs-total headline bar (recoverable / contested / frozen segments).
function recoverabilityBar(s) {
  const total = Number(s.totalTracedValue.value) || 0;
  const seg = (label, band, val, pct) => {
    const w = total > 0 ? Math.max(0, (Number(val) / total) * 100) : 0;
    if (w <= 0) return null;
    return el('div', { style: { width: w + '%', height: '100%', background: BAND_COLOR[band], display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '0' }, title: `${label}: ${fmt.money ? '' : ''}${valStr(val)} (${pct}%)`, 'aria-label': `${label} ${pct}%` },
      w >= 10 ? el('span', { style: { fontSize: '11px', fontWeight: '700', color: BAND_TEXT[band] } }, pct + '%') : null);
  };
  return card('Recoverable value', { sub: 'The share of traced value that is recoverable, contested or frozen', actions: el('span', { class: 'badge sq neutral' }, 'Illustrative bands') },
    el('div', { class: 'row', style: { height: '26px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)', marginBottom: '10px' }, role: 'img', 'aria-label': `Recoverable ${s.byBand.find((b) => b.code === 'recoverable').pct}%, contested ${s.byBand.find((b) => b.code === 'contested').pct}%, frozen ${s.byBand.find((b) => b.code === 'frozen').pct}%` },
      seg('Recoverable', 'recoverable', s.recoverableValue.value, s.byBand.find((b) => b.code === 'recoverable').pct),
      seg('Contested', 'contested', s.contestedValue.value, s.byBand.find((b) => b.code === 'contested').pct),
      seg('Frozen', 'frozen', s.frozenValue.value, s.byBand.find((b) => b.code === 'frozen').pct)),
    bandLegend(s.byBand));
}

// Per-source breakdown card (how much value comes from each module).
function sourceBreakdownCard(s) {
  const rows = s.bySource.filter((x) => x.count > 0).map((x) => breakdownRow(x.module, x.count, x.tracedValue.display, x.pct, SOURCE_COLOR[x.code], SOURCE_ICON[x.code]));
  return card('Traced value by source module', { sub: 'Which FRIS module each traced asset comes from' },
    el('div', { class: 'small muted', style: { marginBottom: '8px' } }, 'The capstone joins three engines — this is the value each contributes.'),
    ...(rows.length ? rows : [emptyState('No traced value')]));
}

// Per-jurisdiction breakdown card.
function jurisdictionBreakdownCard(s) {
  const top = s.byJurisdiction.slice(0, 8);
  const rows = top.map((x) => breakdownRow(x.jurisdiction || '—', x.count, x.tracedValue.display, x.pct, ACCENT, null));
  return card('Traced value by jurisdiction', { sub: 'Where the recoverable value sits' },
    el('div', { class: 'small muted', style: { marginBottom: '8px' } }, 'Offshore / high-secrecy jurisdictions drive the Contested band.'),
    ...(rows.length ? rows : [emptyState('No traced value')]),
    s.byJurisdiction.length > 8 ? el('div', { class: 'small muted', style: { marginTop: '6px' } }, `+${s.byJurisdiction.length - 8} more jurisdictions`) : null);
}

// ── Follow-the-asset breakdown: controller → controlled entities → assets ─────
function followTheAssetCard(trace) {
  const tree = trace.tree;
  const ctrl = tree.controller;
  const entityBlocks = tree.entities.map((e) => entityPanel(e));
  return card('Follow the asset', { sub: `${ctrl.name} → ${tree.entities.length} value-bearing node${tree.entities.length === 1 ? '' : 's'} → their assets`, actions: el('span', { class: 'badge sq neutral' }, 'Controller → entities → assets') },
    // The controller node.
    el('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center', padding: '10px 12px', borderRadius: '10px', background: hexToRgba(ACCENT, 0.1), border: '1px solid ' + hexToRgba(ACCENT, 0.4), marginBottom: '12px' } },
      el('span', { class: 'mc-icon', style: { color: ACCENT, flex: '0 0 auto' } }, icon('nexus', 18)),
      el('div', { style: { flex: '1 1 auto', minWidth: '0' } },
        el('div', { style: { fontWeight: '700', color: 'var(--text)' } }, ctrl.name),
        el('div', { class: 'small muted' }, `${cap(ctrl.type)}${ctrl.jurisdiction ? ' · ' + ctrl.jurisdiction : ''} · controls the debtor ${ctrl.linkedDebtor}`)),
      el('span', { class: 'badge sq neutral', title: 'The resolved controller' }, 'Controller')),
    el('div', { class: 'small muted', style: { marginBottom: '10px' } }, 'Each controlled node below carries the assets attributed to it, with its recoverability. Click an asset to jump to its source record.'),
    ...(entityBlocks.length ? entityBlocks : [emptyState('No value-bearing controlled entities')]));
}

// One controlled-entity panel with its assets.
function entityPanel(e) {
  const offshoreBadge = e.isOffshore ? el('span', { class: 'badge sq', style: { background: hexToRgba(BAND_COLOR.contested, 0.16), color: BAND_COLOR.contested, borderColor: hexToRgba(BAND_COLOR.contested, 0.5) }, title: `Offshore jurisdiction (secrecy ${e.secrecy})` }, 'Offshore') : null;
  const assetRows = e.assets.map((a) => el('div', { class: 'row wrap', style: { gap: '8px', alignItems: 'center', padding: '5px 0', borderTop: '1px solid var(--border)' } },
    el('span', { class: 'mc-icon', style: { color: SOURCE_COLOR[a.source], flex: '0 0 auto' }, title: sourceLabel(a.source) }, icon(SOURCE_ICON[a.source], 13)),
    el('a', { href: assetRoute(a), style: { color: 'var(--text)', textDecoration: 'none', fontWeight: '600', flex: '1 1 auto', minWidth: '0' }, title: 'Open ' + a.id + ' in ' + sourceLabel(a.source) }, a.label),
    el('span', { class: 'badge sq neutral', title: 'Asset type' }, fmt.title(String(a.type).replace(/_/g, ' '))),
    bandBadge(a.band),
    el('span', { class: 'small tabular', style: { fontWeight: '700', color: 'var(--text)', minWidth: '90px', textAlign: 'right' } }, a.tracedValue.display)));
  return el('div', { class: 'card', style: { '--mc': e.isLinkedDebtor ? ACCENT : '#4d8df0', borderLeft: '4px solid ' + (e.isLinkedDebtor ? ACCENT : '#4d8df0'), marginBottom: '10px' } },
    el('div', { class: 'card-body' },
      el('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center', marginBottom: '6px' } },
        el('span', { style: { fontWeight: '700', color: 'var(--text)', flex: '1 1 auto', minWidth: '0' } }, e.name),
        e.isLinkedDebtor ? el('span', { class: 'badge sq', style: { background: hexToRgba(ACCENT, 0.16), color: ACCENT, borderColor: hexToRgba(ACCENT, 0.5) }, title: 'The debtor’s linked Nexus entity' }, 'Debtor entity') : null,
        el('span', { class: 'badge sq neutral', title: 'Entity type / id' }, cap(e.type)),
        e.jurisdiction ? el('span', { class: 'badge sq neutral' }, e.jurisdiction) : null,
        offshoreBadge),
      el('div', { class: 'row wrap', style: { gap: '16px', marginBottom: assetRows.length ? '4px' : '0' } },
        metaItem('Assets', String(e.assetCount), 'Assets attributed to this node'),
        metaItem('Traced value', e.tracedValue.display, 'Illustrative common-CHF value')),
      ...assetRows));
}

// ── Traced-asset table (filterable by recoverability band) ───────────────────
function tracedAssetTableCard(trace, state, reload) {
  const wrap = el('div');
  const bands = trace.assets.reduce((m, a) => { m[a.band] = (m[a.band] || 0) + 1; return m; }, {});
  const bandFilter = el('select', { class: 'fin-select', 'aria-label': 'Filter by recoverability band', style: selectStyle(), onchange: (e) => { state.band = e.target.value; render(); } },
    el('option', { value: '' }, `All bands (${trace.assets.length})`),
    ...['recoverable', 'contested', 'frozen'].map((b) => el('option', { value: b }, `${bandLabel(b)} (${bands[b] || 0})`)));
  const srcFilter = el('select', { class: 'fin-select', 'aria-label': 'Filter by source module', style: selectStyle(), onchange: (e) => { state.source = e.target.value; render(); } },
    el('option', { value: '' }, 'All sources'),
    ...['waterfall', 'nexus', 'chainlink'].map((sc) => el('option', { value: sc }, sourceLabel(sc))));
  if (state.band) bandFilter.value = state.band;

  const controls = el('div', { class: 'row wrap', style: { gap: '10px', marginBottom: '10px', alignItems: 'center' } }, bandFilter, srcFilter);

  function filtered() {
    let rows = trace.assets.slice();
    if (state.band) rows = rows.filter((a) => a.band === state.band);
    if (state.source) rows = rows.filter((a) => a.source === state.source);
    return rows;
  }
  function render() {
    const rows = filtered();
    const thead = el('thead', {}, el('tr', {},
      el('th', { scope: 'col', style: { textAlign: 'left' } }, 'Asset'),
      el('th', { scope: 'col', style: { textAlign: 'left' } }, 'Type'),
      el('th', { scope: 'col', style: { textAlign: 'right' } }, 'Traced value', infoDot('Illustrative common-CHF value used so heterogeneous assets can be summed')),
      el('th', { scope: 'col', style: { textAlign: 'left' } }, 'Jurisdiction'),
      el('th', { scope: 'col', style: { textAlign: 'left' } }, 'Controller'),
      el('th', { scope: 'col', style: { textAlign: 'center' } }, 'Recoverability', infoDot('Recoverable / Contested / Frozen with an illustrative likelihood %')),
      el('th', { scope: 'col', style: { textAlign: 'left' } }, 'Source')));
    const body = rows.length ? rows.map((a) => assetRow(a)) : [el('tr', {}, el('td', { colspan: 7 }, emptyState('No assets match these filters')))];
    const table = el('table', { class: 'tbl', style: { width: '100%', borderCollapse: 'collapse' } }, thead, el('tbody', {}, ...body));
    wrap.replaceChildren(controls,
      el('div', { class: 'small muted', style: { marginBottom: '8px' } }, `${rows.length} of ${trace.assets.length} traced asset${trace.assets.length === 1 ? '' : 's'} — each links back to its Nexus / Chain-Link / Waterfall source record.`),
      el('div', { class: 'tbl-wrap', style: { overflowX: 'auto' } }, table));
  }
  render();
  return card('Traced assets', { sub: `${trace.assets.length} asset${trace.assets.length === 1 ? '' : 's'} joined from three modules, classified by recoverability`, actions: el('span', { class: 'badge sq neutral' }, 'Cross-module join') }, wrap);
}

// One traced-asset row.
function assetRow(a) {
  const labelTh = el('th', { scope: 'row', style: { textAlign: 'left' } },
    el('a', { href: assetRoute(a), style: { color: 'var(--text)', textDecoration: 'none', fontWeight: '600' }, title: (a.recordRef && a.recordRef.label) || a.id }, a.label),
    el('div', { class: 'small muted', style: { maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, title: a.explanation }, a.id + (a.syntheticLink ? ' · illustrative link' : '')));
  const typeTd = el('td', {}, el('span', { class: 'small' }, fmt.title(String(a.type).replace(/_/g, ' '))));
  const valTd = el('td', { style: { textAlign: 'right' } }, el('span', { class: 'small tabular', style: { fontWeight: '700', color: 'var(--text)' } }, a.tracedValue ? a.tracedValue.display : a.realisableValue.display));
  const jurTd = el('td', {}, el('span', { class: 'badge sq neutral', title: 'Asset jurisdiction' }, a.jurisdiction || '—'));
  const ctrlTd = el('td', {}, el('span', { class: 'small', title: a.controllerId || '' }, (a.controllerName || '—')));
  const bandTd = el('td', { style: { textAlign: 'center' } }, bandBadge(a.band), el('div', { class: 'small muted', style: { marginTop: '2px' }, title: 'Illustrative recovery likelihood' }, a.likelihoodPct + '%'));
  const srcTd = el('td', {}, el('span', { class: 'badge sq', style: { background: hexToRgba(SOURCE_COLOR[a.source], 0.16), color: SOURCE_COLOR[a.source], borderColor: hexToRgba(SOURCE_COLOR[a.source], 0.5) }, title: sourceLabel(a.source) }, icon(SOURCE_ICON[a.source], 11), ' ', SOURCE_LABEL_SHORT[a.source]));
  return el('tr', { class: 'clickable' }, labelTh, typeTd, valTd, jurTd, ctrlTd, bandTd, srcTd);
}

// The waterfall roll-up card (reused figures from computeWaterfall).
function waterfallCard(trace) {
  const w = trace.waterfall;
  return card('Liquidation Waterfall roll-up', { sub: `Reused figures from the debtor’s estate — ${w.creditorCount} creditors`, actions: el('a', { class: 'badge sq neutral', href: '#/waterfall/' + trace.target.id, style: { textDecoration: 'none' }, title: 'Open the full waterfall' }, 'Open estate') },
    el('div', { class: 'row wrap', style: { gap: '10px' } },
      kpiChip('Gross book value', w.grossBookValue.display, '#e08a3c', 'The estate’s gross book value'),
      kpiChip('Net realisable estate', w.netRealisableEstate.display, BAND_COLOR.recoverable, 'Expected realisation net of costs + clawback'),
      kpiChip('Distributable', w.distributableEstate.display, ACCENT, 'The free estate distributed down the priority ladder'),
      kpiChip('Creditor recovery', w.overallRecoveryPct + '%', coverageColor(w.overallRecoveryPct), 'Overall creditor recovery on admitted claims'),
      kpiChip('Shortfall', w.shortfall.display, BAND_COLOR.frozen, 'Admitted claims that go unpaid')));
}

// ── Shared small helpers ──────────────────────────────────────────────────────
function breakdownRow(label, count, valueDisplay, pct, color, iconName) {
  const w = Math.max(0, Math.min(100, pct));
  return el('div', { class: 'row wrap', style: { gap: '8px', alignItems: 'center', padding: '5px 0' }, title: `${label}: ${valueDisplay} (${pct}%)` },
    iconName ? el('span', { class: 'mc-icon', style: { color, flex: '0 0 auto' } }, icon(iconName, 14)) : el('span', { style: { width: '11px', height: '11px', borderRadius: '3px', background: color, display: 'inline-block', flex: '0 0 auto' } }),
    el('span', { class: 'small', style: { flex: '0 0 130px', fontWeight: '600', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, label),
    el('div', { style: { flex: '1 1 60px', height: '7px', background: 'var(--surface-2, #131924)', borderRadius: '4px', overflow: 'hidden' }, role: 'presentation' },
      el('span', { style: { display: 'block', width: w + '%', height: '100%', background: color } })),
    el('span', { class: 'small tabular', style: { flex: '0 0 auto', color: 'var(--text-2)' } }, count + ' · '),
    el('span', { class: 'small tabular', style: { flex: '0 0 auto', fontWeight: '700', color: 'var(--text)', minWidth: '96px', textAlign: 'right' } }, valueDisplay));
}
function bandBadge(band) {
  const color = BAND_COLOR[band] || '#5b6b82';
  const cls = band === 'recoverable' ? 'low' : band === 'contested' ? 'med' : 'high';
  return el('span', { class: 'badge ' + cls, title: 'Recoverability: ' + bandLabel(band), style: { background: hexToRgba(color, 0.18), color, borderColor: hexToRgba(color, 0.5) } }, el('span', { class: 'dot', style: { background: color } }), bandLabel(band));
}
function bandLegend(byBand) {
  return el('div', { class: 'row wrap', style: { gap: '14px' }, role: 'img', 'aria-label': 'Recoverability legend: ' + byBand.map((b) => b.label).join(', ') },
    el('span', { class: 'small muted', style: { alignSelf: 'center' } }, 'Bands:'),
    ...byBand.map((b) => el('span', { class: 'row', style: { gap: '6px', alignItems: 'center' } },
      el('span', { style: { width: '13px', height: '13px', borderRadius: '3px', background: BAND_COLOR[b.code] || '#5b6b82', display: 'inline-block', border: '1px solid rgba(0,0,0,0.2)' } }),
      el('span', { class: 'small' }, `${b.label} — ${b.count} · ${b.tracedValue.display} (${b.pct}%)`))));
}
const SOURCE_LABEL_SHORT = { waterfall: 'Waterfall', nexus: 'Nexus', chainlink: 'Chain-Link' };
function sourceLabel(code) { return ({ waterfall: 'Liquidation Waterfall', nexus: 'Sovereign Nexus asset', chainlink: 'Chain-Link wallet' })[code] || code; }
function bandLabel(band) { return ({ recoverable: 'Recoverable', contested: 'Contested', frozen: 'Frozen / sanctioned' })[band] || band; }
// Route back to the originating module record (the recordRef the engine attaches).
function assetRoute(a) { return (a.recordRef && a.recordRef.route) || (a.source === 'waterfall' ? '#/waterfall' : a.source === 'nexus' ? '#/nexus/directory' : '#/chainlink/wallets'); }
function metaItem(label, value, tip) {
  return el('div', { style: { minWidth: '0' }, title: tip || undefined },
    el('div', { class: 'small muted' }, label, tip ? infoDot(tip) : null),
    el('div', { class: 'small', style: { fontWeight: '600', color: 'var(--text)' } }, value));
}
function kpiChip(label, value, colour, tip) {
  return el('div', { class: 'card', style: { flex: '1 1 130px', padding: '10px 12px' }, title: tip || undefined },
    el('div', { class: 'small muted' }, label, tip ? infoDot(tip) : null),
    el('div', { class: 'tabular', style: { fontWeight: '800', fontSize: '18px', color: colour || 'var(--text)' } }, String(value)));
}
function coverageColor(pct) { if (pct >= 80) return '#2f9e63'; if (pct >= 55) return '#c9a227'; if (pct >= 30) return '#e07b39'; return '#d5303e'; }
function selectStyle() { return { padding: '7px 10px', background: 'var(--surface-2, #131924)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '14px' }; }
function disclaimerNote(text) {
  return el('div', { class: 'intro', style: { marginTop: '18px' } }, el('span', { class: 'ico' }, icon('info', 18)), el('div', { class: 't' }, el('b', {}, 'Reused synthetic data, joined. '), text));
}
function valStr(v) { const n = Number(v) || 0; return n.toLocaleString(undefined, { maximumFractionDigits: 0 }); }
function cap(x) { return String(x || '').charAt(0).toUpperCase() + String(x || '').slice(1); }
// Small pure hex->rgba (guarded; no DOM/canvas dependency, e2e-safe).
function hexToRgba(hex, alpha) {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6) return `rgba(199,125,255,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
