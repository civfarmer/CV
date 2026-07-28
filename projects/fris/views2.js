// Views: Liquidation Waterfall, Regulatory Horizon, Data, Cases, Audit, Settings.
import { el, api, fmt, icon, kpi, card, dataTable, riskBadge, statusBadge, classBadge, openDrawer, toast, emptyState, errorState, skeleton, meter, confirmDialog, modal, infoDot, clickableRow } from './core.js';
import { sankey, barChart, donut } from './viz.js';
import { pageHead, tabsBar, labeled, exportData, intro, addToCase, addToCaseButton, fieldId } from './views1.js';

const RISKC = { High: '#f0616d', Medium: '#e5a53b', Low: '#46b877' };
const dt = (t) => el('dt', {}, t); const dd = (t) => el('dd', {}, t);

/* ============ Saved Views (activate the latent saved_views table) ============ */
// Capture the current view (route + a plain params object) under a name so the
// analyst can re-open the exact filtered slice later. A small named-save modal;
// the params are whatever the caller passes (filter state, or {} for a bare
// route). Persists via POST /api/saved-views (audited server-side).
function saveCurrentView(route, params, contextLabel) {
  const cleanParams = {};
  for (const [k, v] of Object.entries(params || {})) if (v !== '' && v != null) cleanParams[k] = v;
  const nameInput = el('input', { type: 'text', placeholder: 'e.g. High-impact EU finance', style: { width: '100%' } });
  const activeBits = Object.entries(cleanParams).map(([k, v]) => fmt.title(k === 'juris' ? 'jurisdiction' : k) + ': ' + v);
  modal({
    title: 'Save this view', width: 460,
    body: (b) => b.append(
      el('div', { class: 'small muted mb' }, 'Save ', el('b', {}, contextLabel || route), ' with its current filters so you can re-open it in one click.'),
      labeled('View name', nameInput),
      el('div', { class: 'small muted mt' }, 'Route: ', el('span', { class: 'mono' }, route)),
      activeBits.length ? el('div', { class: 'row wrap mt', style: { gap: '6px' } }, ...activeBits.map((t) => el('span', { class: 'badge sq neutral' }, t))) : el('div', { class: 'small muted mt' }, 'No active filters — saves the plain view.')),
    actions: (close) => [
      el('button', { class: 'btn', onclick: close }, 'Cancel'),
      el('button', { class: 'btn primary', onclick: async () => {
        const name = nameInput.value.trim();
        if (!name) { toast('Name required', { type: 'warn' }); return; }
        close();
        try { await api.post('/api/saved-views', { name, route, params_json: JSON.stringify(cleanParams) }); toast('View saved', { type: 'success' }); }
        catch (e) { toast(e.message, { type: 'error' }); }
      } }, 'Save view')],
  });
}

// Re-open a saved view: for the regulatory feed we hand its params to the feed's
// filter mechanism (pendingFeedFilter); every route then navigates via the hash.
function recallSavedView(v) {
  const route = v.route || '';
  const params = v.params || {};
  if (route.startsWith('#/regulatory/feed')) pendingFeedFilter = { sector: params.sector || '', impact: params.impact || '', verification: params.verification || '', juris: params.juris || '', q: params.q || '' };
  if (route) location.hash = route; else toast('This saved view has no route', { type: 'warn' });
}

// A reusable "Saved views" card: lists saved views with Open + Delete, and (if a
// current route is supplied) a "Save current view" affordance. Used by the Data
// view. `onChange` is called after a delete so the host can refresh.
async function savedViewsCard(opts = {}) {
  const box = el('div', {}, skeleton(160));
  const wrap = card('Saved views', { sub: 'Named, re-openable filtered views', actions: opts.currentRoute ? el('button', { class: 'btn sm', onclick: () => saveCurrentView(opts.currentRoute, opts.currentParams || {}, opts.currentLabel) }, icon('bookmark', 14), 'Save current') : null, flush: true }, box);
  async function refresh() {
    try {
      const d = await api.get('/api/saved-views');
      if (!d.rows.length) { box.replaceChildren(emptyState('No saved views yet', 'Use “Save this view” on the regulatory feed (or here) to store a filtered view.')); return; }
      const rows = d.rows.map((v) => {
        const paramBits = Object.entries(v.params || {}).map(([k, val]) => fmt.title(k === 'juris' ? 'jurisdiction' : k) + ': ' + val);
        return el('div', { class: 'linkrow' },
          el('div', { class: 'row', style: { gap: '8px', alignItems: 'center' } },
            el('div', {}, el('div', { class: 'linkrow-title' }, v.name), el('div', { class: 'small muted' }, el('span', { class: 'badge sq neutral' }, fmt.title(v.module)), ' ', el('span', { class: 'mono small' }, v.route))),
            el('span', { class: 'spacer' }),
            el('button', { class: 'btn sm ghost', title: 'Open this saved view', onclick: () => recallSavedView(v) }, icon('ext', 13), 'Open'),
            el('button', { class: 'btn sm ghost', title: 'Delete this saved view', onclick: () => del(v) }, icon('x', 13), 'Delete')),
          paramBits.length ? el('div', { class: 'row wrap mt', style: { gap: '5px' } }, ...paramBits.map((t) => el('span', { class: 'badge sq neutral' }, t))) : null);
      });
      box.replaceChildren(...rows);
    } catch (e) { box.replaceChildren(errorState(e.message)); }
  }
  async function del(v) {
    try {
      const res = await fetch('/api/saved-views/' + encodeURIComponent(v.id), { method: 'DELETE' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      toast('View deleted', { type: 'success' });
      refresh(); if (opts.onChange) opts.onChange();
    } catch (e) { toast(e.message, { type: 'error' }); }
  }
  refresh();
  return wrap;
}

/* ============ Liquidation Waterfall ============ */
export async function waterfall(root, parts) {
  if (parts[0] === 'sandbox') return waterfallSandbox(root);
  if (parts[0]) return waterfallCase(root, parts[0]);
  root.append(pageHead('Liquidation Waterfall', 'Multi-tranche insolvency & recovery model'));
  root.append(intro('Liquidation Waterfall', 'models who gets paid, and how much, when a company is wound down. Open a case below, then adjust the assumptions to see recoveries update live across the secured, preferential and unsecured creditor classes.'));
  root.append(el('div', { class: 'small muted', style: { margin: '-4px 0 14px', lineHeight: '1.55', display: 'flex', gap: '6px', alignItems: 'center' } },
    icon('eye', 14), el('span', {}, 'Select a case to open its full recovery waterfall — creditor ledger, estate assets, distribution Sankey and clawback analysis.')));
  // Prominent entry to the design-a-company sandbox (mirrors the well-liked
  // Comparison Sandbox pattern): invent a company and see who recovers what.
  {
    const goSandbox = () => { location.hash = '#/waterfall/sandbox'; };
    root.append(el('div', {
      class: 'module-card', tabindex: 0, role: 'link', title: 'Open the design-a-company insolvency sandbox',
      style: { '--mc': '#4d8df0', cursor: 'pointer', padding: '15px 16px', marginBottom: '16px' }, onclick: goSandbox,
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goSandbox(); } },
    },
      el('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center' } },
        el('div', { class: 'ic', style: { color: '#4d8df0' } }, icon('scale', 18)),
        el('div', { style: { flex: '1 1 auto' } },
          el('div', { style: { fontSize: '15px', fontWeight: '700', color: 'var(--text)' } }, 'Design-a-company sandbox'),
          el('div', { class: 'small muted' }, 'No case handy? Invent one — enter a company\u2019s assets, debts and costs and instantly see the full recovery waterfall.')),
        el('span', { class: 'mc-open', style: { marginTop: '0' } }, 'Open sandbox', icon('chevron', 15)))));
  }
  const box = el('div', {}, skeleton(280)); root.append(box);
  try {
    const d = await api.get('/api/insolvency/cases');
    // Enrich each case with its computed waterfall so the list reads as a full
    // mini-summary (reusing the exact engine the detail view uses). Only a
    // handful of synthetic estates, so this is cheap and keeps the page substantial.
    const enriched = await Promise.all(d.rows.map(async (r) => {
      try { const full = await api.get('/api/insolvency/cases/' + encodeURIComponent(r.id)); return { ...r, w: full.waterfall }; }
      catch { return { ...r, w: null }; }
    }));
    const num = (m) => (m && m.value != null ? Number(m.value) : 0);
    const totClaims = enriched.reduce((a, r) => a + num(r.w && r.w.totalClaims), 0);
    const totNet = enriched.reduce((a, r) => a + num(r.w && r.w.netRealisableEstate), 0);
    const totShort = enriched.reduce((a, r) => a + num(r.w && r.w.shortfall), 0);
    const blendedRecovery = totClaims > 0 ? Math.round((totClaims - totShort) / totClaims * 1000) / 10 : null;
    const strip = el('div', { class: 'grid k4' },
      kpi({ label: 'Estates modelled', value: fmt.num(enriched.length), iconName: 'waterfall' }),
      kpi({ label: 'Total admitted claims', value: fmt.num(Math.round(totClaims)) }),
      kpi({ label: 'Net realisable (all estates)', value: fmt.num(Math.round(totNet)) }),
      kpi({ label: 'Blended recovery', value: blendedRecovery == null ? '—' : fmt.pct(blendedRecovery) }));
    const rows = enriched.map(waterfallListRow);
    box.replaceChildren(
      strip,
      el('div', { class: 'mt2' }, card('Insolvency cases', { sub: `${enriched.length} synthetic estates — click any case to drill in`, flush: true },
        el('div', { style: { display: 'grid', gap: '12px', padding: '4px' } }, ...rows))));
  } catch (e) { box.replaceChildren(errorState(e.message)); }
}

// One clickable, self-summarising row for the waterfall case list. Built on the
// existing .module-card class so it gets cursor, hover-lift, a coloured accent
// bar and the .mc-open "View waterfall ->" affordance for free; the whole row
// links to the case. Interior layout uses inline styles (dark-theme tokens).
function waterfallListRow(r) {
  const w = r.w;
  const ccy = r.currency || '';
  const money = (m) => (m && m.display != null ? ccy + ' ' + m.display : '—');
  const rec = w ? w.overallRecoveryPct : null;
  const recColor = rec == null ? 'var(--text-2)' : rec >= 80 ? '#46b877' : rec >= 40 ? '#e5a53b' : '#f0616d';
  const stat = (label, value, color) => el('div', { style: { flex: '1 1 130px', minWidth: '110px' } },
    el('div', { class: 'small muted', style: { marginBottom: '2px' } }, label),
    el('div', { class: 'tabular', style: { fontSize: '14px', fontWeight: '600', color: color || 'var(--text)' } }, value));
  const go = () => (location.hash = '#/waterfall/' + r.id);
  return el('div', {
    class: 'module-card', tabindex: 0, role: 'link', title: 'Open ' + r.debtor_name + ' — full recovery waterfall',
    style: { '--mc': '#a97bf0', cursor: 'pointer', padding: '15px 16px' }, onclick: go,
    onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } },
  },
    el('div', { class: 'row wrap', style: { gap: '8px', alignItems: 'center', marginBottom: '10px' } },
      el('div', {},
        el('div', { style: { fontSize: '15px', fontWeight: '700', color: 'var(--text)' } }, r.debtor_name),
        el('div', { class: 'small muted' }, r.jurisdiction + ' · ' + ccy)),
      el('span', { class: 'spacer' }),
      statusBadge(r.status)),
    el('div', { class: 'row wrap', style: { gap: '14px', rowGap: '10px', alignItems: 'flex-start' } },
      stat('Admitted claims', money(w && w.totalClaims)),
      stat('Net realisable', money(w && w.netRealisableEstate)),
      stat('Blended recovery', rec == null ? '—' : fmt.pct(rec), recColor),
      stat('Shortfall', money(w && w.shortfall), w && Number(w.shortfall.value) > 0 ? '#f0616d' : 'var(--text-2)'),
      stat('Creditors', w ? fmt.num(w.recoveryByCreditor.length) : '—')),
    rec == null ? null : el('div', { style: { marginTop: '10px' } }, meter(rec, recColor)),
    el('div', { class: 'mc-open' }, 'View waterfall', icon('chevron', 15)));
}

async function waterfallCase(root, id) {
  root.append(pageHead('Liquidation Waterfall', id, [el('a', { class: 'btn sm ghost', href: '#/waterfall' }, '‹ All cases')]));
  const layout = el('div', { class: 'split' }); root.append(layout);
  const assumeBox = el('div'); const resultBox = el('div', {}, skeleton(400));
  layout.append(assumeBox, resultBox);
  let base;
  try { base = await api.get('/api/insolvency/cases/' + encodeURIComponent(id)); } catch (e) { resultBox.replaceChildren(errorState(e.message)); return; }
  const ccy = (base.case && base.case.currency) || 'CHF';
  // Seed the editable priority order from the engine's own normalised default
  // (echoed back on every waterfall response) so the class set + labels can never
  // drift from the distribution logic. Fall back to the ladder in recoveryByClass.
  const defaultOrder = (base.waterfall && base.waterfall.assumptions && Array.isArray(base.waterfall.assumptions.priorityOrder) && base.waterfall.assumptions.priorityOrder.length)
    ? base.waterfall.assumptions.priorityOrder.slice()
    : (base.waterfall ? base.waterfall.recoveryByClass.map((x) => x.class) : []);
  const classLabels = {};
  if (base.waterfall) for (const x of base.waterfall.recoveryByClass) classLabels[x.class] = x.label;
  const labelFor = (cls) => classLabels[cls] || fmt.title(cls.replace(/_/g, ' '));
  const A = { recoveryDelta: 0, enforcementDelta: 0, admissionDelta: 0, administratorCostPct: 3, discountRatePct: 5, disputedTreatment: 'include', legalCostMinor: 0, litigationCostMinor: 0, clawback: { amountMinor: 0, probabilityPct: 0 }, fxRates: { EUR: 0.96, USD: 0.89 }, priorityOrder: defaultOrder.slice() };
  // Explanations shown as an accessible info dot (aria-label + native tooltip) next
  // to each control, so every assumption states plainly what it does to the model.
  const HELP = {
    recoveryDelta: 'Shifts the expected realisation percentage of EVERY asset up or down by this many points — a blanket optimism/pessimism dial on how much the estate can be sold for.',
    enforcementDelta: 'Adjusts enforcement/collection cost as a percentage of each realisation — higher values erode net proceeds before any creditor is paid.',
    admissionDelta: 'Moves every creditor’s admitted claim percentage — modelling claims being disallowed or reduced on adjudication (only downward here).',
    administratorCostPct: 'Insolvency practitioner fees as a percentage of realisations. Charged as a first-priority expense before creditors.',
    discountRatePct: 'Annual discount rate applied over the expected recovery timing to show the present value of the distributable estate (time-value of money).',
    disputedTreatment: 'How disputed assets are handled: included at full value, haircut by 50%, or excluded entirely from realisations.',
    legalCost: 'A FIXED legal-fees amount added to the insolvency expense pool (top priority). Use for advisory/legal spend that is not a percentage of realisations.',
    litigationCost: 'A FIXED litigation-cost amount (e.g. pursuing clawback or asset-recovery claims) added to the expense pool ahead of creditors.',
    clawbackAmount: 'The gross value of transactions the office-holder expects to claw back (e.g. voidable preferences), before applying the success probability.',
    clawbackProb: 'The probability the clawback succeeds. Expected clawback = amount × probability, added to the distributable free estate.',
    priorityOrder: 'The statutory ranking of creditor classes. Funds cascade strictly top-to-bottom — a class is only paid once every class above it is paid in full. Reordering models a different jurisdiction’s priorities (e.g. ranking employees ahead of tax).',
  };
  const rangeRow = (label, key, min, max, step, unit, helpKey, obj = A) => {
    const valEl = el('span', { class: 'val' }, obj[key] + (unit || ''));
    const rid = fieldId('rng');
    const r = el('input', { type: 'range', id: rid, min, max, step, value: obj[key], oninput: (e) => { obj[key] = Number(e.target.value); valEl.textContent = obj[key] + (unit || ''); schedule(); } });
    return el('div', { class: 'assume-row' }, el('div', {}, el('label', { for: rid }, label, helpKey ? el('span', {}, ' ', infoDot(HELP[helpKey])) : null), r), valEl);
  };
  const cbAmount = el('input', { type: 'number', id: fieldId('num'), value: 0, step: 'any', style: { width: '110px' }, oninput: (e) => { A.clawback.amountMinor = Math.round(Number(e.target.value) * 100); schedule(); } });
  const cbProb = el('input', { type: 'range', id: fieldId('rng'), min: 0, max: 100, step: 5, value: 0, oninput: (e) => { A.clawback.probabilityPct = Number(e.target.value); e.target.nextSibling.textContent = e.target.value + '%'; schedule(); } });
  const disputed = el('select', { id: fieldId('sel'), onchange: (e) => { A.disputedTreatment = e.target.value; schedule(); } }, ...['include', 'haircut', 'exclude'].map((o) => el('option', { value: o }, fmt.title(o))));
  // Fixed-cost inputs (previously engine-only). Entered in MAJOR currency units and
  // stored as integer minor units (× 100) so the money stays exact — never a float.
  const costInput = (setter) => el('input', { type: 'number', id: fieldId('num'), min: 0, value: 0, step: 'any', style: { width: '110px' }, oninput: (e) => { setter(Math.max(0, Math.round(Number(e.target.value) * 100)) || 0); schedule(); } });
  const legalCost = costInput((v) => { A.legalCostMinor = v; });
  const litigationCost = costInput((v) => { A.litigationCostMinor = v; });
  // Priority-order editor: an accessible, reorderable ranked list. Up/Down move a
  // class within the ladder; Reset restores the statutory default. Every change
  // writes the full ordered array to A.priorityOrder and triggers live recompute.
  const orderBox = el('div', { role: 'list', 'aria-label': 'Creditor priority ranking (highest first)', style: { display: 'grid', gap: '4px' } });
  function renderOrder() {
    const rows = A.priorityOrder.map((cls, i) => el('div', {
      role: 'listitem',
      style: { display: 'grid', gridTemplateColumns: '20px 1fr auto', gap: '8px', alignItems: 'center', padding: '5px 8px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '6px' },
    },
      el('span', { class: 'small mono muted', style: { textAlign: 'right' } }, String(i + 1)),
      el('span', { style: { fontSize: '12px', color: 'var(--text)' } }, labelFor(cls)),
      el('span', { class: 'row', style: { gap: '3px' } },
        el('button', { class: 'btn sm ghost', 'aria-label': 'Move ' + labelFor(cls) + ' up', title: 'Move up', disabled: i === 0 ? true : null, onclick: () => moveClass(i, -1) }, '▲'),
        el('button', { class: 'btn sm ghost', 'aria-label': 'Move ' + labelFor(cls) + ' down', title: 'Move down', disabled: i === A.priorityOrder.length - 1 ? true : null, onclick: () => moveClass(i, 1) }, '▼'))));
    orderBox.replaceChildren(...rows);
  }
  function moveClass(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= A.priorityOrder.length) return;
    const arr = A.priorityOrder.slice();
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    A.priorityOrder = arr;
    renderOrder(); schedule();
  }
  function resetOrder() { A.priorityOrder = defaultOrder.slice(); renderOrder(); schedule(); }
  renderOrder();
  const priorityCard = card('Priority order (creditor ranking)', { sub: 'Drag-free reorder — highest rank paid first', actions: el('button', { class: 'btn sm', onclick: resetOrder }, 'Reset to statutory') },
    el('div', { class: 'small muted mb', style: { lineHeight: '1.5' } }, 'Funds cascade strictly down this ladder — a class is only reached once every class above it is paid in full. Reorder to model a different jurisdiction’s ranking. ', infoDot(HELP.priorityOrder)),
    orderBox);
  assumeBox.append(card('Assumptions', { sub: 'Live recompute' },
    rangeRow('Recovery Δ (all assets)', 'recoveryDelta', -50, 50, 5, ' pp', 'recoveryDelta'),
    rangeRow('Enforcement Δ', 'enforcementDelta', -20, 40, 5, ' pp', 'enforcementDelta'),
    rangeRow('Claim admission Δ', 'admissionDelta', -30, 0, 5, ' pp', 'admissionDelta'),
    rangeRow('Administrator cost', 'administratorCostPct', 0, 25, 1, '%', 'administratorCostPct'),
    rangeRow('Discount rate', 'discountRatePct', 0, 20, 1, '%', 'discountRatePct'),
    el('div', { class: 'assume-row' }, el('label', { for: disputed.id }, 'Disputed asset treatment', el('span', {}, ' ', infoDot(HELP.disputedTreatment))), disputed),
    el('div', { class: 'assume-row' }, el('label', { for: legalCost.id }, 'Legal costs (' + ccy + ', fixed)', el('span', {}, ' ', infoDot(HELP.legalCost))), legalCost),
    el('div', { class: 'assume-row' }, el('label', { for: litigationCost.id }, 'Litigation costs (' + ccy + ', fixed)', el('span', {}, ' ', infoDot(HELP.litigationCost))), litigationCost),
    el('div', { class: 'assume-row' }, el('label', { for: cbAmount.id }, 'Clawback amount (' + ccy + ')', el('span', {}, ' ', infoDot(HELP.clawbackAmount))), cbAmount),
    el('div', { class: 'assume-row' }, el('label', { for: cbProb.id }, 'Clawback probability', el('span', {}, ' ', infoDot(HELP.clawbackProb))), el('div', { class: 'row' }, cbProb, el('span', { class: 'val' }, '0%'))),
    el('div', { class: 'row mt', style: { gap: '8px' } }, el('button', { class: 'btn primary sm', onclick: saveScenario }, 'Save scenario'), el('button', { class: 'btn sm', onclick: () => exportData('creditors') }, icon('download', 14), 'Creditors CSV'))));
  assumeBox.append(el('div', { class: 'mt2' }, priorityCard));
  let timer;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(recompute, 220); };
  async function recompute() {
    try { const r = await api.post('/api/insolvency/cases/' + encodeURIComponent(id) + '/waterfall', { assumptions: A }); renderResults(r); } catch (e) { toast(e.message, { type: 'error' }); }
  }
  async function saveScenario() { try { await api.post('/api/insolvency/cases/' + encodeURIComponent(id) + '/waterfall', { assumptions: A, save: true, name: 'Scenario ' + new Date().toISOString().slice(11, 16) }); toast('Scenario saved', { type: 'success' }); } catch (e) { toast(e.message, { type: 'error' }); } }
  function renderResults(r) {
    const w = r.waterfall; const c = base.case;
    const money = (m) => c.currency + ' ' + m.display;
    // Per-creditor-class recovery rate (pence in the pound) is the HONEST headline:
    // a single blended % mixes fully-paid secured with wiped-out unsecured. The
    // unsecured dividend is the figure ordinary creditors actually ask for.
    const rcp = (cls) => { const x = w.recoveryByClass.find((y) => y.class === cls); return x && x.recoveryPct != null ? x.recoveryPct : null; };
    // "Pence in the pound/CHF": minor units recovered per one major unit of claim.
    const penceIn = (pctVal) => (pctVal == null ? null : (Math.round(pctVal) + 'p / ' + c.currency + '1'));
    const unsecuredPct = rcp('unsecured');
    const securedColl = (w.securedFromCollateral && w.securedFromCollateral.length)
      ? Math.round(w.securedFromCollateral.reduce((a, s) => a + Number(String(s.paid).replace(/,/g, '')), 0) / Math.max(1e-9, w.securedFromCollateral.reduce((a, s) => a + Number(String(s.admitted).replace(/,/g, '')), 0)) * 1000) / 10
      : null;
    const kpis = el('div', { class: 'grid k4' },
      kpi({ label: 'Total admitted claims', value: money(w.totalClaims) }),
      kpi({ label: 'Unsecured dividend (p in the ' + c.currency + ')', value: unsecuredPct == null ? '—' : fmt.pct(unsecuredPct) + '  ·  ' + penceIn(unsecuredPct) }),
      kpi({ label: 'Secured recovery (from collateral)', value: securedColl == null ? 'n/a' : fmt.pct(securedColl) }),
      kpi({ label: 'Blended recovery (all ranks)', value: fmt.pct(w.overallRecoveryPct) }));
    const kpis2 = el('div', { class: 'grid k4 mt2' },
      kpi({ label: 'Gross book value', value: money(w.grossBookValue) }),
      kpi({ label: 'Realisation losses + costs', value: money(w.realisationLosses) }),
      kpi({ label: 'Total shortfall', value: money(w.shortfall) }),
      kpi({ label: 'Shareholder residual', value: money(w.shareholderResidual) }));
    const sankeyBox = el('div'); sankey(sankeyBox, { links: w.flows, height: 320 });
    const classTable = dataTable([
      { key: 'label', label: 'Class', render: (x) => el('span', {}, x.label) },
      { key: 'group', label: 'Rank', render: (x) => el('span', { class: 'badge sq neutral' }, fmt.title(x.group)) },
      { key: 'demand', label: 'Claim', align: 'right', render: (x) => el('span', { class: 'tabular' }, x.demand) },
      { key: 'paid', label: 'Recovered', align: 'right', render: (x) => el('span', { class: 'tabular' }, x.paid) },
      { key: 'shortfall', label: 'Shortfall', align: 'right', render: (x) => el('span', { class: 'tabular', style: { color: Number(String(x.shortfall).replace(/,/g, '')) > 0 ? '#f0616d' : 'var(--text-2)' } }, x.shortfall) },
      { key: 'recoveryPct', label: 'Recovery', align: 'right', render: (x) => x.recoveryPct == null ? '—' : el('div', { style: { minWidth: '90px' } }, el('div', { class: 'small tabular', style: { textAlign: 'right' } }, fmt.pct(x.recoveryPct)), meter(x.recoveryPct, x.recoveryPct >= 80 ? '#46b877' : x.recoveryPct >= 40 ? '#e5a53b' : '#f0616d')) },
    ], w.recoveryByClass.filter((x) => x.class !== 'residual' && (Number(String(x.demand).replace(/,/g, '')) > 0 || x.paid !== '0.00')), { pageSize: 14 });
    const credTable = dataTable([
      { key: 'name', label: 'Creditor', sortable: true }, { key: 'classLabel', label: 'Class', sortable: true, render: (x) => el('span', { class: 'badge sq neutral' }, x.classLabel) },
      { key: 'admitted', label: 'Admitted claim', align: 'right', sortable: true, sortVal: (x) => Number(x.admittedMinor), render: (x) => el('span', { class: 'tabular' }, x.admitted) },
      { key: 'paid', label: 'Recovered', align: 'right', sortable: true, sortVal: (x) => Number(x.paidMinor), render: (x) => el('span', { class: 'tabular' }, x.paid) },
      { key: 'shortfall', label: 'Shortfall', align: 'right', sortable: true, sortVal: (x) => Number(x.shortfallMinor), render: (x) => el('span', { class: 'tabular', style: { color: Number(x.shortfallMinor) > 0 ? '#f0616d' : 'var(--text-2)' } }, x.shortfall) },
      { key: 'recoveryPct', label: 'Recovery', align: 'right', sortable: true, render: (x) => el('span', { class: 'tabular' }, fmt.pct(x.recoveryPct)) },
    ], w.recoveryByCreditor, { searchable: true, searchKeys: ['name', 'classLabel'], pageSize: 10 });
    const rc = (cls) => { const x = w.recoveryByClass.find((y) => y.class === cls); return x ? x.recoveryPct : null; };
    const secRc = (w.securedFromCollateral && w.securedFromCollateral.length) ? Math.round(w.securedFromCollateral.reduce((a, s) => a + Number(String(s.paid).replace(/,/g, '')), 0) / Math.max(1, w.securedFromCollateral.reduce((a, s) => a + Number(String(s.admitted).replace(/,/g, '')), 0)) * 1000) / 10 : null;
    const pctText = (v) => (v == null ? 'n/a' : fmt.pct(v));
    const summaryEl = card('Outcome summary', { sub: 'Where the money goes, in priority order' }, el('p', { class: 'about-p' }, `Against ${c.currency} ${w.totalClaims.display} of admitted claims across ${w.recoveryByCreditor.length} creditors, the estate realises ${c.currency} ${w.netRealisableEstate.display} and distributes ${c.currency} ${w.totalDistributed.display}, for a blended recovery across all ranks of ${fmt.pct(w.overallRecoveryPct)} (secured, preferential and unsecured combined) and a total shortfall of ${c.currency} ${w.shortfall.display}. Secured creditors recover ${pctText(secRc)} from their collateral, preferential ranks (e.g. employees ${pctText(rc('employee_preferential'))}, tax ${pctText(rc('tax_preferential'))}) rank ahead of ordinary unsecured creditors (${pctText(rc('unsecured'))}). Shareholders receive ${w.surplus.value === '0.00' ? 'nothing — the estate is exhausted before equity' : c.currency + ' ' + w.surplus.display + ' as a residual surplus'}.`));
    const assetsCard = card('Estate assets — gross to net realisation', { sub: `${w.assetRealisation.length} assets`, flush: true }, dataTable([
      { key: 'label', label: 'Asset' },
      { key: 'type', label: 'Type', render: (a) => el('span', { class: 'badge sq neutral' }, fmt.title(a.type)) },
      { key: 'gross', label: 'Gross', align: 'right', render: (a) => el('span', { class: 'tabular' }, a.gross) },
      { key: 'recoveryPct', label: 'Recovery', align: 'right', render: (a) => el('span', { class: 'tabular' }, fmt.pct(a.recoveryPct)) },
      { key: 'net', label: 'Net to estate', align: 'right', render: (a) => el('span', { class: 'tabular' }, a.net) },
    ], w.assetRealisation, { pageSize: 6 }));
    resultBox.replaceChildren(kpis, kpis2, el('div', { class: 'mt2' }, summaryEl), el('div', { class: 'mt2' }, assetsCard),
      el('div', { class: 'mt2' }, card('Recovery flow (Sankey)', { sub: 'Gross assets → costs → distributions' }, sankeyBox)),
      el('div', { class: 'mt2' }, card('Recovery rate by creditor class (pence in the ' + c.currency + ')', { sub: `Per-rank recovery — the honest breakdown behind the blended figure · timing ${w.expectedRecoveryTimingMonths} months · PV ${c.currency} ${w.presentValueOfEstate.display}`, flush: true }, classTable)),
      el('div', { class: 'mt2' }, card('Recovery by creditor', { flush: true }, credTable)));
  }
  cbProb.nextSibling; // noop
  // Side-by-side scenario comparison (consumes seeded comparison_groups and/or
  // this case's own saved scenarios). Rendered full-width beneath the split.
  root.append(el('div', { class: 'mt2' }, await waterfallCompareSection(base, ccy, labelFor)));
  recompute();
}

// ---- Scenario comparison (Waterfall) ---------------------------------------
// A side-by-side comparison of two or more saved scenarios' recovery outcomes.
// Two data sources: (a) a seeded comparison_group (a named grouping of scenarios,
// which may span cases), or (b) an ad-hoc pick of THIS case's saved scenarios.
// Both resolve through POST /api/insolvency/compare, which computes each
// scenario's waterfall server-side and returns per-scenario headline metrics plus
// per-class recoveries. The result renders as a matrix: scenarios are columns,
// metrics/creditor-classes are rows, with the best/worst cell per row highlighted
// so "which recovery strategy is better" reads at a glance. Currency-exact: money
// rows are compared on integer minor units, never a float.
async function waterfallCompareSection(base, ccy, labelFor) {
  const wrap = el('div');
  const caseScenarios = Array.isArray(base.scenarios) ? base.scenarios : [];
  const groupSel = el('select', {}, el('option', { value: '' }, '— pick this case’s scenarios below —'));
  const picks = new Set();
  // Fetched comparison groups, keyed by id, so `compare()` can re-check a group's
  // resolvable scenario count without another round-trip.
  const groupsById = new Map();
  const resultBox = el('div', { class: 'mt2' });
  // Ad-hoc checkbox list of the current case's saved scenarios.
  const pickList = el('div', { style: { display: 'grid', gap: '4px' } });
  if (!caseScenarios.length) pickList.append(el('div', { class: 'small muted' }, 'This case has no saved scenarios yet — use “Save scenario” to store the current assumptions, then compare.'));
  for (const s of caseScenarios) {
    const cb = el('input', { type: 'checkbox', value: s.id, 'aria-label': 'Include ' + s.name, onchange: (e) => { if (e.target.checked) picks.add(s.id); else picks.delete(s.id); } });
    pickList.append(el('label', { class: 'row', style: { gap: '8px', fontSize: '12px', color: 'var(--text)', cursor: 'pointer' } }, cb, el('span', {}, s.name), el('span', { class: 'mono small muted' }, s.id)));
  }
  async function runGroups() {
    try {
      const d = await api.get('/api/insolvency/comparison-groups');
      for (const g of (d.rows || [])) {
        const n = Array.isArray(g.scenarios) ? g.scenarios.length : 0;
        groupsById.set(g.id, g);
        // Omit single-scenario (or empty) groups: they advertise a count but can
        // never satisfy the two-scenario minimum, which would dead-end the user.
        if (n < 2) continue;
        groupSel.append(el('option', { value: g.id }, g.name + ' (' + n + ')'));
      }
    } catch { /* groups are optional; ad-hoc pick still works */ }
  }
  async function compare() {
    resultBox.replaceChildren(skeleton(200));
    const gid = groupSel.value;
    let body;
    if (gid) {
      // Defence-in-depth: single-scenario groups are already omitted from the
      // picker, but if one is somehow selected, explain rather than error out.
      const g = groupsById.get(gid);
      if (g && Array.isArray(g.scenarios) && g.scenarios.length < 2) {
        resultBox.replaceChildren(el('div', { class: 'small muted' }, 'This comparison group has only one scenario, so there is nothing to compare against — pick a group with two or more scenarios, or tick this case’s scenarios below.'));
        return;
      }
      body = { groupId: gid };
    } else {
      const ids = [...picks];
      if (ids.length < 2) { resultBox.replaceChildren(el('div', { class: 'small muted' }, 'Select at least two scenarios (or a saved comparison group) to compare.')); return; }
      body = { scenarioIds: ids };
    }
    try {
      const d = await api.post('/api/insolvency/compare', body);
      renderComparisonMatrix(resultBox, d, ccy, labelFor);
    } catch (e) { resultBox.replaceChildren(errorState(e.message)); }
  }
  await runGroups();
  wrap.append(card('Scenario comparison', { sub: 'Compare two or more recovery scenarios side by side' },
    el('div', { class: 'small muted mb', style: { lineHeight: '1.5' } }, 'Pick a saved comparison group, or tick two or more of this case’s scenarios, then compare their recovery outcomes. Best value per metric is highlighted green, worst red.'),
    el('div', { class: 'grid k2' },
      labeled('Saved comparison group', groupSel),
      labeled('This case’s scenarios', pickList)),
    el('div', { class: 'row mt', style: { gap: '8px' } }, el('button', { class: 'btn primary sm', onclick: compare }, icon('scale', 14), 'Compare scenarios')),
    resultBox));
  return wrap;
}

// Render the comparison payload as a highlighted matrix table. `dir` per metric is
// 'up' (higher is better) or 'down' (lower is better); the best cell in each row
// gets a green tint, the worst a red tint (only when the row has >1 distinct value).
function renderComparisonMatrix(container, d, ccy, labelFor) {
  const scenarios = d.scenarios || [];
  if (scenarios.length < 2) { container.replaceChildren(el('div', { class: 'small muted' }, 'Need at least two resolvable scenarios to compare.')); return; }
  const money = (m) => (m && m.display != null ? ccy + ' ' + m.display : '—');
  const pct = (v) => (v == null ? '—' : fmt.pct(v));
  // Money rows compare on exact minor units (BigInt); percentage rows on the number.
  const bigOf = (m) => { try { return BigInt(m && m.minor != null ? m.minor : '0'); } catch { return 0n; } };
  const numOf = (v) => (v == null ? null : Number(v));
  const metricRows = [
    { label: 'Total admitted claims', kind: 'money', get: (s) => s.metrics.totalClaims, dir: null },
    { label: 'Net realisable estate', kind: 'money', get: (s) => s.metrics.netRealisableEstate, dir: 'up' },
    { label: 'Distributable estate', kind: 'money', get: (s) => s.metrics.distributableEstate, dir: 'up' },
    { label: 'Total distributed', kind: 'money', get: (s) => s.metrics.totalDistributed, dir: 'up' },
    { label: 'Distributed to creditors', kind: 'money', get: (s) => s.metrics.totalDistributedToCreditors, dir: 'up' },
    { label: 'Total shortfall', kind: 'money', get: (s) => s.metrics.shortfall, dir: 'down' },
    { label: 'Shareholder surplus', kind: 'money', get: (s) => s.metrics.surplus, dir: 'up' },
    { label: 'Blended recovery (all ranks)', kind: 'pct', get: (s) => s.metrics.overallRecoveryPct, dir: 'up' },
    { label: 'Unsecured dividend (p in the ' + ccy + ')', kind: 'pct', get: (s) => s.metrics.unsecuredRecoveryPct, dir: 'up' },
    { label: 'Expected timing (months)', kind: 'raw', get: (s) => s.metrics.expectedRecoveryTimingMonths, dir: 'down' },
  ];
  const classRows = (d.classes || []).map((cl) => ({ label: labelFor ? labelFor(cl.class) : cl.label, kind: 'clspct', cls: cl.class, dir: 'up' }));

  const GREEN = 'rgba(70, 184, 119, 0.16)', RED = 'rgba(240, 97, 109, 0.16)';
  const th = (txt, extra) => el('th', { style: { padding: '9px 12px', textAlign: extra && extra.right ? 'right' : 'left', color: 'var(--text-2)', fontWeight: 600, fontSize: '12px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', ...(extra && extra.style || {}) } }, txt);
  const head = el('tr', {}, th('Metric'), ...scenarios.map((s) => th(el('div', {}, el('div', { style: { color: 'var(--text)', fontWeight: 700 } }, s.name), el('div', { class: 'small muted' }, s.debtorName || s.caseId)), { right: true })));

  function rowCells(row) {
    // Extract comparable values + display strings per scenario.
    const vals = scenarios.map((s) => {
      if (row.kind === 'money') { const m = row.get(s); return { cmp: bigOf(m), disp: money(m), has: m != null }; }
      if (row.kind === 'pct') { const v = row.get(s); return { cmp: numOf(v), disp: pct(v), has: v != null }; }
      if (row.kind === 'raw') { const v = row.get(s); return { cmp: numOf(v), disp: v == null ? '—' : String(v), has: v != null }; }
      // per-class recovery %
      const bc = s.byClass && s.byClass[row.cls]; const v = bc ? bc.recoveryPct : null;
      return { cmp: numOf(v), disp: bc ? pct(v) : '—', has: v != null };
    });
    // Determine best/worst indices when a direction is set and values differ.
    let bestIdx = -1, worstIdx = -1;
    if (row.dir) {
      const present = vals.map((v, i) => ({ i, c: v.cmp, has: v.has })).filter((x) => x.has && x.c != null);
      if (present.length > 1) {
        const distinct = new Set(present.map((x) => String(x.c)));
        if (distinct.size > 1) {
          const cmpLt = (a, b) => (typeof a === 'bigint' && typeof b === 'bigint') ? (a < b) : (Number(a) < Number(b));
          let hi = present[0], lo = present[0];
          for (const x of present) { if (cmpLt(hi.c, x.c)) hi = x; if (cmpLt(x.c, lo.c)) lo = x; }
          const best = row.dir === 'up' ? hi : lo;
          const worst = row.dir === 'up' ? lo : hi;
          bestIdx = best.i; worstIdx = worst.i;
        }
      }
    }
    return vals.map((v, i) => el('td', {
      class: 'tabular',
      style: { padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid var(--border)', background: i === bestIdx ? GREEN : i === worstIdx ? RED : 'transparent', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' },
    }, v.disp));
  }
  const bodyRows = [];
  for (const row of metricRows) bodyRows.push(el('tr', {}, el('th', { style: { padding: '8px 12px', textAlign: 'left', fontWeight: 500, color: 'var(--text-2)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' } }, row.label), ...rowCells(row)));
  if (classRows.length) {
    bodyRows.push(el('tr', {}, el('th', { colspan: scenarios.length + 1, style: { padding: '10px 12px 4px', textAlign: 'left', color: 'var(--text-3)', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' } }, 'Recovery rate by creditor class')));
    for (const row of classRows) bodyRows.push(el('tr', {}, el('th', { style: { padding: '8px 12px', textAlign: 'left', fontWeight: 500, color: 'var(--text-2)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' } }, row.label), ...rowCells(row)));
  }
  const table = el('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' } }, el('thead', {}, head), el('tbody', {}, ...bodyRows));
  const note = el('div', { class: 'small muted mt', style: { lineHeight: '1.5' } }, d.group ? ('Comparison group: ' + d.group.name + ' · ') : '', scenarios.length + ' scenarios compared. Green = best, red = worst for each metric (money compared on exact minor units).');
  container.replaceChildren(el('div', { class: 'tbl-wrap' }, table), note);
}

/* ============ Regulatory Horizon ============ */
export async function regulatory(root, parts) {
  const tab = parts[0] || 'feed';
  root.append(pageHead('Regulatory Horizon', 'Geneva, Swiss & EU compliance intelligence — real, publicly-sourced regulations', [el('button', { class: 'btn sm', title: 'Download the regulatory register as a CSV file', onclick: () => exportData('instruments') }, icon('download', 15), 'Export CSV')]));
  root.append(intro('Regulatory Horizon', 'tracks real regulatory change across Geneva, Switzerland and the EU (finance, education and healthcare) — every instrument here is a genuine law, circular or regulation with a link to its official source (GDPR, MiCA, DORA, FINMA circulars, the Swiss FADP, Geneva LIPAD and more). Browse the Alert Feed by operational impact, then use Policy Comparison to check an internal policy against a regulation for gaps and contradictions.'));
  root.append(tabsBar([['feed', 'Alert Feed'], ['coverage', 'Coverage Matrix'], ['upcoming', 'Upcoming Dates'], ['sandbox', 'Policy Comparison'], ['policies', 'Policy Library'], ['imports', 'Feed & Imports']], tab, (k) => (location.hash = '#/regulatory/' + k)));
  const panel = el('div'); root.append(panel);
  if (tab === 'coverage') return regCoverage(panel);
  if (tab === 'upcoming') return regUpcoming(panel);
  if (tab === 'sandbox') return regSandbox(panel);
  if (tab === 'policies') return regPolicies(panel);
  if (tab === 'imports') return regImports(panel);
  return regFeed(panel);
}

// Cross-tab hand-off: a coverage-matrix cell click stashes the sector+jurisdiction
// filter here and navigates to the feed, which consumes it on load. Kept module-
// local (the regulatory view re-renders per tab via the hash router).
let pendingFeedFilter = null;

async function regFeed(panel) {
  const filters = el('div', { class: 'filters' });
  const box = el('div', {}, skeleton(300));
  panel.append(filters, box);
  // Consume a pending sector+jurisdiction filter handed off from the coverage
  // matrix (reuses this same feed/filter mechanism); default to an empty filter.
  const state = { sector: '', impact: '', verification: '', q: '', juris: '' };
  if (pendingFeedFilter) { Object.assign(state, pendingFeedFilter); pendingFeedFilter = null; }
  const mk = (label, key, opts) => labeled(label, el('select', { onchange: (e) => { state[key] = e.target.value; load(); } }, ...opts.map((o) => el('option', { value: o, selected: state[key] === o }, o === '' ? 'All' : fmt.title(o)))));
  const searchInput = el('input', { type: 'text', placeholder: 'Title/summary…', value: state.q, oninput: (e) => { state.q = e.target.value; clearTimeout(box._t); box._t = setTimeout(load, 250); } });
  const saveBtn = el('button', { class: 'btn sm', title: 'Save the current feed filters as a named view you can re-open later', onclick: () => saveCurrentView('#/regulatory/feed', { sector: state.sector, impact: state.impact, verification: state.verification, juris: state.juris, q: state.q }, 'Regulatory feed') }, icon('bookmark', 14), 'Save this view');
  filters.append(
    mk('Sector', 'sector', ['', 'finance', 'education', 'healthcare', 'cross-sector']),
    mk('Jurisdiction', 'juris', ['', 'European Union', 'Switzerland', 'Geneva']),
    mk('Impact', 'impact', ['', 'High', 'Medium', 'Low']),
    mk('Verification', 'verification', ['', 'Verified', 'Unverified']),
    labeled('Search', searchInput),
    el('div', { class: 'field', style: { alignSelf: 'flex-end' } }, saveBtn));
  async function load() {
    box.replaceChildren(skeleton(300));
    const q = new URLSearchParams({ limit: '300' }); for (const k of ['sector', 'impact', 'verification', 'q', 'juris']) if (state[k]) q.set(k, state[k]);
    try {
      const d = await api.get('/api/regulatory/instruments?' + q);
      const active = ['sector', 'juris', 'impact', 'verification', 'q'].filter((k) => state[k]).map((k) => fmt.title(k === 'juris' ? 'jurisdiction' : k) + ': ' + state[k]);
      const table = dataTable([
        { key: 'impact_level', label: 'Impact', sortable: true, sortVal: (r) => r.impact_score, render: (r) => riskBadge(r.impact_level) },
        { key: 'title', label: 'Instrument', sortable: true, render: (r) => el('div', {}, el('div', { style: { fontWeight: 500 } }, r.is_read ? '' : el('span', { title: 'Unread', style: { color: 'var(--accent)', marginRight: '5px' } }, '●'), r.title), el('div', { class: 'small muted' }, r.authority)) },
        { key: 'sector', label: 'Sector', sortable: true, render: (r) => el('span', { class: 'badge sq neutral' }, fmt.title(r.sector)) },
        { key: 'jurisdiction', label: 'Jurisdiction', sortable: true },
        { key: 'effective_date', label: 'Effective', sortable: true, render: (r) => fmt.date(r.effective_date) },
        { key: 'implementation_status', label: 'Status', sortable: true, render: (r) => statusBadge(r.implementation_status) },
        { key: 'is_watchlisted', label: '', render: (r) => r.is_watchlisted ? icon('bookmark', 15) : '' },
      ], d.rows, { pageSize: 12, onRowClick: (r) => openInstrumentDrawer(r.id, load) });
      box.replaceChildren(card('Operational impact alert feed', { sub: active.length ? `${d.total} instruments · filtered by ${active.join(' · ')}` : `${d.total} instruments`, flush: true }, table));
    } catch (e) { box.replaceChildren(errorState(e.message)); }
  }
  load();
}
// Coverage matrix: sector (rows) x jurisdiction (columns) instrument counts, with
// row/column totals and a subtle heat shade by count. Clicking a cell (or a total)
// filters the Alert Feed to that sector+jurisdiction via the shared feed filter,
// so a compliance officer can see where regulatory exposure concentrates and jump
// straight to the underlying instruments. Empty cells reveal coverage gaps.
async function regCoverage(panel) {
  panel.append(skeleton(280));
  let d;
  try { d = await api.get('/api/regulatory/coverage'); }
  catch (e) { panel.replaceChildren(errorState(e.message)); return; }
  // Jump to the feed pre-filtered. sector/juris may be '' meaning "all" for that axis.
  const goFeed = (sector, juris) => { pendingFeedFilter = { sector: sector || '', juris: juris || '' }; location.hash = '#/regulatory/feed'; };
  // Heat shade: translucent accent whose opacity scales with the count. 0 stays bare.
  const shade = (n) => (n > 0 && d.maxCell > 0 ? `rgba(77, 141, 240, ${(0.12 + 0.5 * (n / d.maxCell)).toFixed(3)})` : 'transparent');
  const th = (txt, extra) => el('th', { scope: 'col', style: { padding: '9px 12px', textAlign: extra && extra.align || 'left', color: 'var(--text-2)', fontWeight: 600, fontSize: '12px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', ...(extra && extra.style || {}) } }, txt);
  const cellTd = (label, count, sector, juris, opts = {}) => {
    const clickable = !opts.noClick;
    const go = () => goFeed(sector, juris);
    return el('td', {
      class: clickable ? 'clickable' : null,
      role: clickable ? 'button' : null,
      tabindex: clickable ? 0 : null,
      title: clickable ? `${count} instrument(s) — ${label}. Click to open in the feed.` : null,
      onclick: clickable ? go : null,
      onkeydown: clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } } : null,
      style: { padding: '10px 12px', textAlign: 'center', borderBottom: '1px solid var(--border)', cursor: clickable ? 'pointer' : 'default', background: opts.bg != null ? opts.bg : shade(count), fontWeight: opts.strong ? 700 : 500, color: count > 0 ? 'var(--text)' : 'var(--text-3)', fontVariantNumeric: 'tabular-nums', ...(opts.style || {}) },
    }, count === 0 && !opts.strong ? '·' : String(count));
  };
  const headRow = el('tr', {}, th('Sector ↓  /  Jurisdiction →'), ...d.jurisdictions.map((j) => th(j, { align: 'center' })), th('All', { align: 'center', style: { color: 'var(--text)' } }));
  const bodyRows = d.matrix.map((row) => el('tr', {},
    el('th', { scope: 'row', style: { padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' } }, fmt.title(row.sector)),
    ...row.cells.map((c) => cellTd(fmt.title(row.sector) + ' in ' + c.jurisdiction, c.count, row.sector, c.jurisdiction)),
    cellTd('All ' + fmt.title(row.sector), row.total, row.sector, '', { strong: true, bg: 'var(--surface-2)' })));
  const totalRow = el('tr', {},
    el('th', { scope: 'row', style: { padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text)', borderTop: '2px solid var(--border-strong)' } }, 'All sectors'),
    ...d.jurisdictions.map((j) => cellTd('All sectors in ' + j, d.colTotals[j] || 0, '', j, { strong: true, bg: 'var(--surface-2)', style: { borderTop: '2px solid var(--border-strong)' } })),
    cellTd('All instruments', d.grandTotal, '', '', { strong: true, bg: 'var(--surface-2)', style: { borderTop: '2px solid var(--border-strong)', color: 'var(--accent)' } }));
  const table = el('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '14px' } }, el('thead', {}, headRow), el('tbody', {}, ...bodyRows, totalRow));
  const gaps = [];
  for (const row of d.matrix) for (const c of row.cells) if (c.count === 0) gaps.push(fmt.title(row.sector) + ' × ' + c.jurisdiction);
  const legend = el('div', { class: 'row wrap small muted', style: { gap: '14px', alignItems: 'center', marginTop: '12px' } },
    el('span', {}, 'Heat shade scales with instrument count.'),
    el('span', { class: 'row', style: { gap: '6px', alignItems: 'center' } }, el('span', { style: { display: 'inline-block', width: '14px', height: '14px', borderRadius: '3px', background: shade(d.maxCell), border: '1px solid var(--border)' } }), 'busiest (' + d.maxCell + ')'),
    el('span', { class: 'row', style: { gap: '6px', alignItems: 'center' } }, el('span', { style: { display: 'inline-block', width: '14px', height: '14px', borderRadius: '3px', background: 'transparent', border: '1px solid var(--border)' } }), 'no coverage'));
  const kpis = el('div', { class: 'grid k4' },
    kpi({ label: 'Instruments mapped', value: fmt.num(d.grandTotal), iconName: 'regulatory' }),
    kpi({ label: 'Sectors', value: fmt.num(d.sectors.length) }),
    kpi({ label: 'Jurisdictions', value: fmt.num(d.jurisdictions.length) }),
    kpi({ label: 'Coverage gaps', value: fmt.num(gaps.length), iconName: 'alert' }));
  panel.replaceChildren(
    kpis,
    el('div', { class: 'mt2' }, card('Regulatory coverage matrix', { sub: 'Sector × jurisdiction instrument counts — click any cell to open that slice in the Alert Feed', flush: true }, el('div', { style: { overflowX: 'auto' } }, table), el('div', { style: { padding: '0 14px 12px' } }, legend))),
    gaps.length ? el('div', { class: 'mt2' }, card('Coverage gaps', { sub: `${gaps.length} sector × jurisdiction combination(s) with no tracked instrument` }, el('div', { class: 'row wrap', style: { gap: '6px' } }, ...gaps.map((g) => el('span', { class: 'badge sq med' }, g))))) : null);
}

async function openInstrumentDrawer(id, onChange) {
  const body = openDrawer({ title: 'Instrument', subtitle: id, body: (b) => b.append(skeleton(200)) });
  try {
    const d = await api.get('/api/regulatory/instruments/' + encodeURIComponent(id));
    const r = d.instrument;
    if (!r.is_read) api.post(`/api/regulatory/instruments/${id}/flags`, { read: true }).then(onChange).catch(() => {});
    const h = document.querySelector('.drawer-head .title'); if (h) h.textContent = r.title;
    const factorList = el('div', {}, ...(r.impact_factors || []).slice(0, 6).map((f) => el('div', { class: 'factor-row' }, el('div', {}, el('div', { class: 'fl' }, f.label), el('div', { class: 'fe' }, f.explanation)), el('div', {}, el('div', { class: 'small tabular', style: { textAlign: 'right' } }, '+' + f.points), meter((f.points / Math.max(1, ...(r.impact_factors || []).map((x) => x.points))) * 100, RISKC[r.impact_level])))));
    body.replaceChildren(
      el('div', { class: 'row wrap mb', style: { gap: '8px' } }, riskBadge(r.impact_level), el('span', { class: 'badge sq neutral' }, fmt.title(r.sector)), statusBadge(r.verification_status), classBadge(r.data_classification || 'verified-public-source')),
      el('div', { class: 'small muted mb' }, r.summary),
      el('dl', { class: 'dl' }, dt('Authority'), dd(r.authority), dt('Jurisdiction'), dd(r.jurisdiction), dt('Type'), dd(fmt.title(r.doc_type)), dt('Published'), dd(fmt.date(r.publication_date)), dt('Effective'), dd(el('span', {}, fmt.date(r.effective_date), ' ', el('span', { class: 'small muted' }, r.daysToEffective >= 0 ? `(in ${r.daysToEffective}d)` : `(${-r.daysToEffective}d ago)`))), dt('Source'), dd(r.source_url ? el('a', { href: r.source_url, target: '_blank', rel: 'noreferrer' }, r.source_url, ' ', icon('ext', 12)) : '—')),
      el('div', { class: 'card mt2' }, el('div', { class: 'card-head' }, el('div', { class: 'card-title' }, 'Operational impact'), el('span', { class: 'spacer' }), el('span', { class: 'value tabular', style: { fontSize: '20px', color: RISKC[r.impact_level] } }, r.impact_score)), el('div', { class: 'card-body' }, factorList)),
      el('div', { class: 'mt2' }, el('div', { class: 'card-title mb' }, 'Obligations'), ...(r.obligations || []).map((o) => el('div', { class: 'fragment reg' }, o))),
    );
    const drawer = document.querySelector('.drawer');
    if (drawer && !drawer.querySelector('.drawer-foot')) drawer.append(el('div', { class: 'drawer-foot' },
      addToCaseButton('instrument', id, r.title),
      el('button', { class: 'btn sm', onclick: async () => { const res = await api.post(`/api/regulatory/instruments/${id}/flags`, { watchlist: !r.is_watchlisted }); r.is_watchlisted = res.is_watchlisted; toast(res.is_watchlisted ? 'Added to watchlist' : 'Removed', { type: 'success' }); onChange && onChange(); } }, icon('bookmark', 14), 'Watchlist'),
      el('select', { class: 'btn sm', onchange: async (e) => { await api.post(`/api/regulatory/instruments/${id}/flags`, { implementation_status: e.target.value }); toast('Status updated', { type: 'success' }); onChange && onChange(); } }, ...['Not Started', 'In Progress', 'Complete', 'Overdue'].map((s) => el('option', { value: s, selected: s === r.implementation_status }, s)))));
  } catch (e) { body.replaceChildren(errorState(e.message)); }
}

async function regUpcoming(panel) {
  panel.append(skeleton(300));
  const d = await api.get('/api/regulatory/upcoming');
  const list = (rows, over) => rows.length ? el('div', {}, ...rows.map((r) => clickableRow({ class: 'row clickable', 'aria-label': `Open ${r.title} — effective ${fmt.date(r.effective_date)}`, style: { padding: '9px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }, onClick: () => openInstrumentDrawer(r.id) }, el('span', { class: 'badge sq ' + (over ? 'high' : 'neutral') }, fmt.date(r.effective_date)), el('span', { class: 'small' }, r.title), el('span', { class: 'spacer' }), statusBadge(r.implementation_status || r.impact_level)))) : emptyState('None');
  panel.replaceChildren(el('div', { class: 'grid k2' }, card('Upcoming effective dates', { sub: `${d.rows.length}` }, list(d.rows, false)), card('Overdue implementation', { sub: `${d.overdue.length}` }, list(d.overdue, true))));
}

async function regSandbox(panel) {
  panel.append(skeleton(120));
  const [instruments, policies] = await Promise.all([api.get('/api/regulatory/instruments?limit=300'), api.get('/api/policies')]);
  const instSel = el('select', { onchange: showInst }, el('option', { value: '' }, 'Auto-detect (recommended) — or pick a regulation…'), ...instruments.rows.filter((r) => r.sector !== 'cross-sector').map((r) => el('option', { value: r.id }, `${r.title.slice(0, 46)} — ${r.authority.split('(')[0]}`)));
  const polSel = el('select', { onchange: showPol }, el('option', { value: '' }, 'Seeded policy…'), ...policies.rows.map((p) => el('option', { value: p.id }, p.title)));
  const instPane = el('div', { class: 'card-body' }, el('div', { class: 'muted small' }, 'Leave this on Auto-detect and paste a policy — the tool will suggest which regulations it matches. Or pick a specific regulation to extract its obligations.'));
  const polText = el('textarea', { 'aria-label': 'Internal policy text to check', placeholder: 'Paste an internal policy, choose a seeded one, or edit here…', style: { minHeight: '220px' } });
  const runBtn = el('button', { class: 'btn primary', onclick: run }, icon('scale', 15), 'Run first pass');
  const exampleBtn = el('button', { class: 'btn', title: 'Preload a finance regulation + a partially-compliant policy and run', onclick: () => { const inst = instruments.rows.find((x) => x.sector === 'finance') || instruments.rows[0]; if (inst) { instSel.value = inst.id; showInst(); } polSel.value = 'POL-002'; showPol(); setTimeout(compare, 350); } }, icon('play', 14), 'Load worked example');
  const suggestBox = el('div', { class: 'mt2' });
  const findingsBox = el('div', { class: 'mt2' });
  panel.replaceChildren(
    el('div', { class: 'small muted mb' }, 'Deterministic First-Pass Compliance Review — a rule-based triage aid. Not an AI legal opinion; not legal advice.'),
    el('div', { class: 'split' },
      el('div', { class: 'card' }, el('div', { class: 'card-head' }, el('div', { class: 'card-title' }, 'Regulatory instrument'), el('span', { class: 'spacer' }), instSel), instPane),
      el('div', { class: 'card' }, el('div', { class: 'card-head' }, el('div', { class: 'card-title' }, 'Internal policy'), el('span', { class: 'spacer' }), polSel), el('div', { class: 'card-body' }, polText))),
    el('div', { class: 'row mt', style: { gap: '8px', alignItems: 'center' } }, runBtn, exampleBtn, el('span', { class: 'small muted' }, 'No regulation chosen? We’ll detect the closest matches first.')),
    suggestBox,
    findingsBox);
  let curInst = null;
  function showInst() { suggestBox.replaceChildren(); const r = instruments.rows.find((x) => x.id === instSel.value); curInst = r; if (!r) { instPane.replaceChildren(el('div', { class: 'muted small' }, 'Auto-detect is on — paste a policy and run to see suggested regulations.')); return; } api.get('/api/regulatory/instruments/' + r.id).then((d) => { const ins = d.instrument; instPane.replaceChildren(el('div', { class: 'row wrap mb', style: { gap: '6px' } }, riskBadge(ins.impact_level), el('span', { class: 'badge sq neutral' }, fmt.title(ins.sector)), el('span', { class: 'small muted' }, 'Effective ' + fmt.date(ins.effective_date))), el('div', { class: 'small muted mb' }, ins.summary), el('div', { class: 'card-title mb' }, 'Extracted obligations'), ...(ins.obligations || []).map((o) => el('div', { class: 'fragment reg' }, o))); }); }
  function showPol() { const p = policies.rows.find((x) => x.id === polSel.value); if (p) api.get('/api/policies/' + p.id).then((d) => (polText.value = d.policy.body)); }
  // Entry point for the primary button. If the analyst has NOT chosen a
  // regulation, first auto-detect the most likely matches and let them pick;
  // if a regulation is already chosen, run the full comparison directly.
  async function run() {
    if (!polText.value.trim()) { toast('Provide a policy (paste, pick, or type)', { type: 'warn' }); return; }
    if (!instSel.value) return suggest();
    return compare();
  }
  // Auto-detect: rank ALL real regulations by textual similarity to the pasted
  // policy and present the top matches, each pick-able. This is the owner's
  // favourite path — paste, click, and let the tool point at the right law.
  async function suggest() {
    findingsBox.replaceChildren();
    suggestBox.replaceChildren(card('Detecting applicable regulations…', {}, skeleton(120)));
    try {
      const res = await api.post('/api/regulatory/suggest', { text: polText.value, limit: 6 });
      renderSuggestions(res.suggestions || []);
    } catch (e) { suggestBox.replaceChildren(errorState(e.message)); }
  }
  function renderSuggestions(list) {
    if (!list.length) { suggestBox.replaceChildren(card('Suggested regulations', { sub: 'Auto-detected by textual similarity' }, emptyState('No close matches — pick a regulation manually, or add more detail to the policy.'))); return; }
    const max = Math.max(1, ...list.map((s) => s.score));
    const headline = 'Looks related to: ' + list.slice(0, 3).map((s) => shortReg(s.title) + ' ' + fmt.pct(s.score)).join(' · ');
    const rowFor = (s, i) => {
      const barColor = i === 0 ? 'var(--accent)' : s.score >= max * 0.6 ? '#4d8df0' : 'var(--text-3)';
      const pick = () => { instSel.value = s.id; showInst(); compare(); };
      return el('div', {
        class: 'module-card', tabindex: 0, role: 'button', title: 'Compare the policy against ' + s.title,
        style: { '--mc': barColor, cursor: 'pointer', padding: '13px 15px' }, onclick: pick,
        onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } },
      },
        el('div', { class: 'row', style: { gap: '10px', alignItems: 'baseline' } },
          el('span', { class: 'tabular', style: { color: 'var(--text-3)', fontWeight: '700', fontSize: '13px' } }, '#' + (i + 1)),
          el('span', { style: { fontWeight: '600', color: 'var(--text)', flex: '1 1 auto' } }, s.title),
          el('span', { class: 'tabular', style: { color: barColor, fontWeight: '700', fontSize: '15px' } }, fmt.pct(s.score))),
        el('div', { style: { marginTop: '7px' } }, meter(s.score / max * 100, barColor)),
        el('div', { class: 'row wrap', style: { gap: '6px', marginTop: '7px', alignItems: 'center' } },
          s.sector ? el('span', { class: 'badge sq neutral' }, fmt.title(s.sector)) : null,
          s.authority ? el('span', { class: 'small muted' }, s.authority.split('(')[0].trim()) : null,
          (s.overlap && s.overlap.length) ? el('span', { class: 'small muted' }, 'shared terms: ' + s.overlap.slice(0, 5).join(', ')) : null,
          el('span', { class: 'spacer' }),
          el('span', { class: 'mc-open', style: { marginTop: '0' } }, 'Compare', icon('chevron', 14))));
    };
    suggestBox.replaceChildren(card('Suggested regulations', { sub: 'Auto-detected by textual similarity — pick one to run the full gap analysis', actions: el('span', { class: 'badge sq neutral', title: 'Deterministic relevance scoring' }, 'Auto-detected') },
      el('div', { class: 'row', style: { gap: '8px', alignItems: 'center', marginBottom: '12px', color: 'var(--text-2)', fontSize: '13px' } }, icon('search', 15), el('span', {}, headline)),
      el('div', { style: { display: 'grid', gap: '10px' } }, ...list.map(rowFor))));
  }
  // Run the full gap/contradiction comparison against the currently-selected
  // instrument (the existing "pick a regulation then compare" path).
  async function compare() {
    if (!polText.value.trim()) { toast('Provide a policy (paste, pick, or type)', { type: 'warn' }); return; }
    findingsBox.replaceChildren(skeleton(200));
    const payload = { policyText: polText.value, save: true, name: 'Sandbox ' + new Date().toISOString().slice(11, 16) };
    if (instSel.value) payload.instrumentId = instSel.value; else payload.regText = 'The institution must maintain records and shall report within the prescribed period.';
    try {
      const res = await api.post('/api/regulatory/compare', payload);
      const full = res.sessionId ? await api.get('/api/comparisons/' + res.sessionId) : { findings: [] };
      renderFindings(res, full.findings);
    } catch (e) { findingsBox.replaceChildren(errorState(e.message)); }
  }
  function renderFindings(res, findings) {
    const against = curInst ? el('span', { class: 'small muted' }, 'against ' + shortReg(curInst.title)) : null;
    const head = card('Comparison findings', { sub: `Coverage ${res.overallScore}% · ${res.obligationCount} obligations · ${res.matchedCount} matched`, actions: [against, statusBadge(res.verdict)].filter(Boolean) },
      findings.length ? el('div', {}, ...findings.map(findingRow)) : emptyState('No findings raised'));
    findingsBox.replaceChildren(head);
  }
  function findingRow(f) {
    const status = el('span', {}, statusBadge(f.analyst_status));
    const disp = el('div', { class: 'row wrap', style: { gap: '5px', marginTop: '6px' } }, ...['Accepted', 'Requires Review', 'Remediated', 'Rejected'].map((s) => el('button', { class: 'btn sm ghost', onclick: async () => { try { await api.patch('/api/findings/' + f.id, { analyst_status: s }); status.replaceChildren(statusBadge(s)); toast('Marked ' + s, { type: 'success' }); } catch (e) { toast(e.message, { type: 'error' }); } } }, s)));
    return el('div', { style: { padding: '11px 0', borderBottom: '1px solid var(--border)' } },
      el('div', { class: 'row wrap', style: { gap: '8px' } }, statusBadge(f.severity), el('span', { class: 'badge sq neutral' }, fmt.title(f.finding_type)), el('span', { class: 'small muted' }, 'confidence ' + f.confidence + '%'), el('span', { class: 'spacer' }), status),
      el('div', { class: 'small mt' }, f.explanation),
      f.reg_fragment ? el('div', { class: 'fragment reg' }, '“' + f.reg_fragment + '”') : null,
      f.policy_fragment ? el('div', { class: 'fragment pol' }, '“' + f.policy_fragment + '”') : null,
      el('div', { class: 'small muted mt' }, 'Recommended: ' + f.recommendation), disp);
  }
}

// Compact display name for a regulation: prefer the acronym in parentheses
// (MiCA, GDPR, FADP), else a short prefix of the title.
function shortReg(title) {
  const t = String(title || '');
  const m = t.match(/\(([A-Za-z0-9/. ]{2,12})\)/);
  if (m) return m[1].split('/')[0].trim();
  return t.split(/[—–-]/)[0].trim().slice(0, 22);
}

async function regPolicies(panel) {
  panel.append(skeleton(200));
  const d = await api.get('/api/policies');
  panel.replaceChildren(card('Policy Library', { sub: `${d.rows.length} internal policies`, flush: true }, dataTable([
    { key: 'title', label: 'Policy', sortable: true }, { key: 'owner_org', label: 'Owner', sortable: true }, { key: 'sector', label: 'Sector', sortable: true, render: (r) => el('span', { class: 'badge sq neutral' }, fmt.title(r.sector)) }, { key: 'version', label: 'Version' }, { key: 'updated_at', label: 'Updated', sortable: true, render: (r) => fmt.date(r.updated_at) },
  ], d.rows, { pageSize: 12, onRowClick: (r) => api.get('/api/policies/' + r.id).then((x) => openDrawer({ title: r.title, subtitle: r.id, body: (b) => b.append(el('div', { class: 'row wrap mb', style: { gap: '6px' } }, el('span', { class: 'badge sq neutral' }, fmt.title(r.sector)), classBadge('imported-user-material')), el('div', { style: { whiteSpace: 'pre-wrap', lineHeight: '1.6' } }, x.policy.body)) })) })));
}

async function regImports(panel) {
  panel.append(skeleton(200));
  const sample = '[{"title":"Sample import notice","authority":"FINMA","publication_date":"2026-03-01","effective_date":"2026-09-01","sector":"finance","summary":"Firms must report and retain records.","obligations":["Firms must report within 30 days."]},\n{"title":"","authority":"Missing title — will be rejected"}]';
  const input = el('textarea', { 'aria-label': 'Regulatory feed data to ingest', placeholder: 'Paste JSON / CSV / RSS / Atom / Markdown here…', style: { minHeight: '150px' } });
  input.value = sample;
  const fmtSel = el('select', {}, ...['auto', 'json', 'csv', 'rss', 'atom', 'markdown', 'text'].map((f) => el('option', { value: f }, f)));
  const out = el('div', { class: 'mt' });
  const logsBox = el('div', {}, skeleton(150));
  async function loadLogs() { const d = await api.get('/api/import-logs'); logsBox.replaceChildren(card('Import history', { flush: true }, dataTable([{ key: 'ts', label: 'When', render: (r) => fmt.date(r.ts) }, { key: 'source_name', label: 'Source' }, { key: 'format', label: 'Format', render: (r) => el('span', { class: 'badge sq neutral' }, r.format) }, { key: 'received', label: 'Received', align: 'right' }, { key: 'accepted', label: 'Accepted', align: 'right' }, { key: 'rejected', label: 'Rejected', align: 'right', render: (r) => r.rejected ? el('span', { class: 'badge sq high' }, r.rejected) : '0' }], d.rows, { pageSize: 6 })), d.rejected.length ? card('Rejected records', { sub: 'Malformed input handled safely', flush: true }, dataTable([{ key: 'reason', label: 'Reason' }, { key: 'raw', label: 'Raw', render: (r) => el('span', { class: 'mono small muted' }, fmt.short(r.raw, 40)) }], d.rejected, { pageSize: 6 })) : null); }
  panel.replaceChildren(
    intro('Feed & Imports', 'shows how FRIS ingests regulatory updates. Paste JSON, CSV, RSS, Atom or Markdown on the left and watch the pipeline parse, normalise, deduplicate and safely reject malformed records — the same defensive process a live feed would use. Import history and rejected records appear on the right.'),
    el('div', { class: 'split' },
      card('Ingest regulatory feed', { sub: 'Defensive parser — malformed records rejected safely' }, labeled('Format', fmtSel), el('div', { class: 'mt' }, input), el('button', { class: 'btn primary mt', onclick: doImport }, icon('download', 15), 'Ingest'), out),
      el('div', {}, logsBox)));
  await loadLogs();
  async function doImport() {
    out.replaceChildren(skeleton(60));
    try { const r = await api.post('/api/regulatory/ingest', { input: input.value, format: fmtSel.value, sourceName: 'Manual import' }); out.replaceChildren(el('div', { class: 'row wrap', style: { gap: '8px' } }, statusBadge('Complete'), el('span', { class: 'small' }, r.summary)), r.rejected.length ? el('div', { class: 'mt small muted' }, r.rejected.length + ' rejected: ' + r.rejected.map((x) => x.reason).join('; ')) : null); toast(`Imported ${r.accepted}, rejected ${r.rejected.length}`, { type: 'success' }); loadLogs(); } catch (e) { out.replaceChildren(errorState(e.message)); }
  }
}

/* ============ Data Management ============ */
export async function data(root) {
  root.append(pageHead('Data Management', 'Dataset overview, import, export & reset'));
  const box = el('div', {}, skeleton(240)); root.append(box);
  try {
    const d = await api.get('/api/data/stats');
    const total = d.tables.reduce((a, t) => a + t.rows, 0);
    const kpis = el('div', { class: 'grid k4' }, kpi({ label: 'Total records', value: fmt.num(total), iconName: 'database' }), kpi({ label: 'Tables', value: d.tables.length }), kpi({ label: 'Seeded', value: fmt.date(d.seededAt) }), kpi({ label: 'Classification', value: 'Synthetic', iconName: 'alert' }));
    const tableCounts = dataTable([{ key: 'table', label: 'Table', sortable: true }, { key: 'rows', label: 'Rows', sortable: true, align: 'right', render: (r) => el('span', { class: 'tabular' }, fmt.num(r.rows)) }], d.tables, { pageSize: 16, searchable: true, searchKeys: ['table'] });
    const exports = el('div', { class: 'row wrap', style: { gap: '8px' } }, ...['entities', 'transactions', 'instruments', 'creditors', 'audit'].map((t) => el('button', { class: 'btn sm', onclick: () => exportData(t) }, icon('download', 14), fmt.title(t))));
    const resetBtn = el('button', { class: 'btn danger', onclick: async () => { if (await confirmDialog({ title: 'Reset demonstration data', message: 'This restores the deterministic seed, replacing all local changes (notes, saved traces, scenarios, imports). This cannot be undone.', confirmLabel: 'Reset data', danger: true, requireText: 'RESET' })) { toast('Resetting…'); try { const r = await api.post('/api/data/reset', { confirm: 'RESET' }); toast('Data reset complete', { type: 'success' }); setTimeout(() => location.reload(), 600); } catch (e) { toast(e.message, { type: 'error' }); } } } }, icon('reset', 15), 'Reset demonstration data');
    // Saved views: recall/delete the named views stored in the saved_views table,
    // plus a generic "Save current view" affordance (saves the Data route itself).
    const savedCard = await savedViewsCard({ currentRoute: '#/data', currentParams: {}, currentLabel: 'Data Management' });
    box.replaceChildren(kpis,
      el('div', { class: 'grid k2 mt2' }, card('Database statistics', { flush: true }, tableCounts), el('div', {}, card('Export', { sub: 'CSV / JSON' }, exports), el('div', { class: 'mt2' }, card('Danger zone', { sub: 'Deterministic re-seed' }, el('div', { class: 'small muted mb' }, 'Restore the original synthetic dataset.'), resetBtn)))),
      el('div', { class: 'mt2' }, savedCard));
  } catch (e) { box.replaceChildren(errorState(e.message)); }
}


/* ============ Saved Cases + Case Dossier ============ */
// Route dispatcher: `#/cases` lists cases; `#/cases/CASE-0001` opens the full
// dossier for that case (header, narrative, linked records grouped by type,
// notes, audit slice) with a one-click print-optimised report.
export async function cases(root, parts) {
  if (parts && parts[0]) return caseDossier(root, parts[0]);
  return casesList(root);
}

async function casesList(root) {
  root.append(pageHead('Saved Cases', 'Cross-module dossiers linking investigations, traces, scenarios & instruments', [el('button', { class: 'btn sm primary', onclick: newCase }, icon('plus', 15), 'New case')]));
  const box = el('div', {}, skeleton(240)); root.append(box);
  async function load() {
    try {
      const d = await api.get('/api/cases');
      box.replaceChildren(card('Cases', { sub: `${d.rows.length}`, flush: true }, dataTable([
        { key: 'title', label: 'Title', sortable: true },
        { key: 'module', label: 'Module', sortable: true, render: (r) => el('span', { class: 'badge sq neutral' }, fmt.title(r.module)) },
        { key: 'priority', label: 'Priority', sortable: true, render: (r) => statusBadge(r.priority) },
        { key: 'status', label: 'Status', sortable: true, render: (r) => statusBadge(r.status) },
        { key: 'links', label: 'Records', align: 'right' },
        { key: 'modified_at', label: 'Modified', sortable: true, render: (r) => fmt.date(r.modified_at) },
      ], d.rows, { pageSize: 12, onRowClick: (r) => { location.hash = '#/cases/' + r.id; } })));
    } catch (e) { box.replaceChildren(errorState(e.message)); }
  }
  function newCase() {
    const title = el('input', { type: 'text', placeholder: 'e.g. Aravis cross-border review', style: { width: '100%' } });
    const mod = el('select', { style: { width: '100%' } }, ...['cross', 'nexus', 'chainlink', 'waterfall', 'regulatory'].map((m) => el('option', { value: m }, fmt.title(m))));
    const prio = el('select', { style: { width: '100%' } }, ...['High', 'Medium', 'Low'].map((x) => el('option', { value: x, selected: x === 'Medium' }, x)));
    modal({ title: 'New case', body: (b) => b.append(labeled('Title', title), el('div', { class: 'mt' }), labeled('Module', mod), el('div', { class: 'mt' }), labeled('Priority', prio)), actions: (close) => [
      el('button', { class: 'btn', onclick: close }, 'Cancel'),
      el('button', { class: 'btn primary', onclick: async () => { if (!title.value.trim()) { toast('Title required', { type: 'warn' }); return; } close(); try { const nc = await api.post('/api/cases', { title: title.value, module: mod.value, priority: prio.value }); toast('Case created', { type: 'success' }); location.hash = '#/cases/' + nc.id; } catch (e) { toast(e.message, { type: 'error' }); } } }, 'Create case')] });
  }
  load();
}

const LINK_GROUP_LABEL = { entity: 'Entities', wallet: 'Wallets', instrument: 'Regulatory instruments', trace: 'Traces', scenario: 'Scenarios', policy: 'Policies', evidence: 'Evidence' };

// Full dossier for one case.
async function caseDossier(root, id) {
  const noteRow = (n) => el('div', { class: 'fragment' }, el('div', {}, n.body), el('div', { class: 'small muted' }, (n.author || 'analyst') + ' · ' + fmt.date(n.created_at)));
  root.append(pageHead('Case Dossier', id, [el('a', { class: 'btn sm ghost', href: '#/cases' }, '‹ All cases')]));
  const box = el('div', {}, skeleton(280)); root.append(box);
  let d;
  try { d = await api.get('/api/cases/' + encodeURIComponent(id) + '/dossier'); }
  catch (e) { box.replaceChildren(errorState(e.message)); return; }
  render();

  function render() {
    const c = d.case;
    // Header
    const header = card(c.title, { sub: c.id }, el('div', { class: 'row wrap mb', style: { gap: '6px' } },
        statusBadge(c.status), statusBadge(c.priority), el('span', { class: 'badge sq neutral' }, fmt.title(c.module)), classBadge(c.data_classification)),
      el('dl', { class: 'dl' }, dt('Owner'), dd(c.owner || '—'), dt('Created'), dd(fmt.date(c.created_at)), dt('Modified'), dd(fmt.date(c.modified_at)), dt('Records linked'), dd(String(d.counts.links))),
      c.description ? el('div', { class: 'small muted mt' }, c.description) : null);

    // Narrative editor (saved as a case note) + notes log
    const narrative = el('textarea', { 'aria-label': 'Case narrative note', placeholder: 'Write a case summary / narrative — findings, working hypothesis, next steps…', style: { minHeight: '80px', width: '100%' } });
    const notesLog = el('div', { id: 'caseNotes' }, ...(d.notes.length ? d.notes.map(noteRow) : [emptyState('No notes yet')]));
    const addNarr = el('button', { class: 'btn sm primary mt', onclick: async () => {
      if (!narrative.value.trim()) { toast('Write something first', { type: 'warn' }); return; }
      try { const r = await api.post('/api/notes', { target_type: 'case', target_id: id, body: narrative.value }); narrative.value = ''; d.notes = r.notes; document.getElementById('caseNotes').replaceChildren(...(r.notes.length ? r.notes.map(noteRow) : [emptyState('No notes yet')])); toast('Saved to case', { type: 'success' }); } catch (e) { toast(e.message, { type: 'error' }); }
    } }, icon('note', 14), 'Add to narrative');
    const narrativeCard = card('Case summary & narrative', { sub: 'Editable analyst notes for this case' }, narrative, addNarr, el('div', { class: 'card-title mb mt2' }, 'Notes'), notesLog);

    // Linked records grouped by type
    const groupsWrap = el('div');
    if (!d.groups.length) groupsWrap.append(emptyState('No records linked yet', 'Open an entity, wallet or instrument and use “Add to case”.'));
    for (const g of d.groups) {
      const rows = g.items.map((l) => linkRow(l));
      groupsWrap.append(card((LINK_GROUP_LABEL[g.type] || fmt.title(g.type)), { sub: `${g.items.length}` }, ...rows));
    }

    // Audit slice
    const auditRows = d.audit.length ? d.audit.slice(0, 25).map((a) => el('div', { class: 'row', style: { padding: '6px 0', borderBottom: '1px solid var(--border)' } }, el('span', { class: 'badge sq neutral' }, a.module || 'system'), el('span', { class: 'mono small' }, a.action), el('span', { class: 'small' }, a.summary), el('span', { class: 'spacer' }), el('span', { class: 'small muted nowrap' }, fmt.date(a.ts)))) : [emptyState('No related activity')];
    const auditCard = card('Related activity', { sub: 'Audit trail slice for this case & its records' }, ...auditRows);

    const actions = el('div', { class: 'row wrap mb', style: { gap: '8px' } },
      el('button', { class: 'btn sm primary', onclick: () => caseReport(id) }, icon('regulatory', 15), 'Generate report'),
      el('button', { class: 'btn sm', onclick: () => toast('Open an entity, wallet or instrument, then use “Add to case”.', { type: 'info' }) }, icon('plus', 14), 'How to add records'));

    box.replaceChildren(actions, el('div', { class: 'grid k2' }, el('div', {}, header, el('div', { class: 'mt2' }, narrativeCard)), el('div', {}, card('Linked records', { sub: `${d.counts.links} across ${d.counts.groups} type(s)`, flush: true }, groupsWrap), el('div', { class: 'mt2' }, auditCard))));
  }

  // One linked-record row: title/subtitle, key detail, Open + Unlink.
  function linkRow(l) {
    const detail = (l.detail || []).filter((x) => x.v && x.v !== '—').slice(0, 4);
    const head = el('div', { class: 'row', style: { gap: '8px' } },
      el('div', {}, el('div', { class: 'linkrow-title' }, l.title || l.target_id), el('div', { class: 'small muted' }, (l.subtitle || l.target_type) + ' · ' + l.target_id)),
      el('span', { class: 'spacer' }),
      l.risk ? riskBadge(l.risk) : null,
      l.missing ? el('span', { class: 'badge sq med' }, 'missing') : null,
      l.route ? el('a', { class: 'btn sm ghost', href: l.route, title: 'Open in its module' }, icon('ext', 13), 'Open') : null,
      el('button', { class: 'btn sm ghost', title: 'Remove from case', onclick: () => unlink(l) }, icon('x', 13), 'Unlink'));
    const dl = detail.length ? el('dl', { class: 'dl linkrow-dl' }, ...detail.flatMap((x) => [dt(x.k), dd(x.v)])) : null;
    return el('div', { class: 'linkrow' }, head, dl, l.note ? el('div', { class: 'small muted mt' }, l.note) : null);
  }

  async function unlink(l) {
    try {
      const res = await fetch('/api/cases/' + encodeURIComponent(id) + '/links/' + encodeURIComponent(l.id), { method: 'DELETE' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      d = await api.get('/api/cases/' + encodeURIComponent(id) + '/dossier');
      render(); toast('Removed from case', { type: 'success' });
    } catch (e) { toast(e.message, { type: 'error' }); }
  }
}

// Render a clean, self-contained, print-optimised dossier report and hand off to
// the browser's native Save-as-PDF. No PDF library — a `@media print` block in
// styles.css lays it out for print. window.print is guarded for the e2e shim.
async function caseReport(id) {
  let d;
  try { d = await api.get('/api/cases/' + encodeURIComponent(id) + '/report'); }
  catch (e) { toast(e.message, { type: 'error' }); return; }
  const rep = d.report; const c = d.case;
  const sec = (title) => el('h2', { class: 'rep-h2' }, title);
  const kvBlock = (pairs) => el('table', { class: 'rep-kv' }, el('tbody', {}, ...pairs.filter((p) => p[1] != null && p[1] !== '').map(([k, v]) => el('tr', {}, el('th', {}, k), el('td', {}, String(v))))));

  // Cover
  const cover = el('section', { class: 'rep-cover' },
    el('div', { class: 'rep-mark' }, el('span', { class: 'rep-mark-badge' }, 'FRIS'), el('span', { class: 'rep-mark-name' }, 'Forensic & Regulatory Intelligence Suite')),
    el('div', { class: 'rep-cover-main' },
      el('div', { class: 'rep-kicker' }, 'Case Dossier'),
      el('h1', { class: 'rep-title' }, c.title),
      el('div', { class: 'rep-ref' }, 'Reference ', el('b', {}, rep.ref)),
      el('div', { class: 'rep-meta' }, 'Status: ' + (c.status || '—') + '  ·  Priority: ' + (c.priority || '—') + '  ·  Module: ' + fmt.title(c.module)),
      el('div', { class: 'rep-meta' }, 'Owner: ' + (c.owner || '—') + '  ·  Generated: ' + fmt.date(rep.generatedAt) + ' ' + String(rep.generatedAt).slice(11, 19))),
    el('div', { class: 'rep-provenance' }, el('b', {}, 'Provenance & data notice. '), rep.provenance));

  // Executive summary
  const exec = el('section', { class: 'rep-section' }, sec('Executive summary'),
    el('p', { class: 'rep-p' }, c.description || 'No case description was recorded.'),
    kvBlock([['Records linked', d.counts.links], ['Record types', d.counts.groups], ['Notes on file', d.counts.notes], ['Created', fmt.date(c.created_at)], ['Last modified', fmt.date(c.modified_at)]]));

  // Linked records detail
  const records = el('section', { class: 'rep-section' }, sec('Linked records'));
  if (!d.groups.length) records.append(el('p', { class: 'rep-p muted' }, 'No records are linked to this case.'));
  for (const g of d.groups) {
    records.append(el('h3', { class: 'rep-h3' }, (LINK_GROUP_LABEL[g.type] || fmt.title(g.type)) + ' (' + g.items.length + ')'));
    for (const l of g.items) {
      records.append(el('div', { class: 'rep-record' },
        el('div', { class: 'rep-record-head' }, el('span', { class: 'rep-record-title' }, l.title || l.target_id), el('span', { class: 'rep-record-id' }, l.target_id + (l.missing ? ' · (record no longer present)' : ''))),
        (l.detail && l.detail.length) ? kvBlock(l.detail.map((x) => [x.k, x.v])) : null,
        l.note ? el('div', { class: 'rep-note' }, 'Note: ' + l.note) : null));
    }
  }

  // Findings / notes
  const findings = el('section', { class: 'rep-section' }, sec('Findings & analyst notes'));
  if (d.notes.length) for (const n of d.notes) findings.append(el('div', { class: 'rep-finding' }, el('div', { class: 'rep-finding-body' }, n.body), el('div', { class: 'rep-finding-meta' }, (n.author || 'analyst') + ' · ' + fmt.date(n.created_at))));
  else findings.append(el('p', { class: 'rep-p muted' }, 'No notes were recorded for this case.'));

  // Audit appendix
  const appendix = el('section', { class: 'rep-section' }, sec('Appendix — audit trail'));
  if (d.audit.length) {
    appendix.append(el('table', { class: 'rep-table' }, el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, 'Time'), el('th', { scope: 'col' }, 'Module'), el('th', { scope: 'col' }, 'Action'), el('th', { scope: 'col' }, 'Summary'))),
      el('tbody', {}, ...d.audit.slice(0, 40).map((a) => el('tr', {}, el('td', {}, String(a.ts).slice(0, 19).replace('T', ' ')), el('td', {}, a.module || 'system'), el('td', {}, a.action), el('td', {}, a.summary))))));
  } else appendix.append(el('p', { class: 'rep-p muted' }, 'No related activity recorded.'));

  const printBtn = el('button', { class: 'btn primary', onclick: () => { if (typeof window !== 'undefined' && typeof window.print === 'function') window.print(); } }, icon('download', 15), 'Print / Save as PDF');
  const closeBtn = el('button', { class: 'btn', onclick: () => teardown() }, 'Close');
  const bar = el('div', { class: 'rep-toolbar no-print' }, el('span', { class: 'rep-toolbar-title' }, 'Dossier report — ', c.title), el('span', { class: 'spacer' }), printBtn, closeBtn);
  const paper = el('div', { class: 'rep-paper' }, cover, exec, records, findings, appendix, el('div', { class: 'rep-foot' }, 'Generated by ' + rep.product + ' · ' + rep.ref + ' · local synthetic workspace'));
  const overlay = el('div', { class: 'report-view', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Dossier report' }, bar, el('div', { class: 'rep-scroll' }, paper));

  function teardown() { if (typeof document !== 'undefined' && document.body && document.body.classList) document.body.classList.remove('printing-report'); overlay.remove(); }
  if (typeof document !== 'undefined' && document.body) { document.body.append(overlay); if (document.body.classList) document.body.classList.add('printing-report'); }
}

/* ============ Audit Log ============ */
export async function audit(root) {
  root.append(pageHead('Audit Log', 'Local record of significant actions'));
  const filters = el('div', { class: 'filters' }); const box = el('div', {}, skeleton(300));
  root.append(filters, box);
  const state = { module: '', action: '' };
  filters.append(labeled('Module', el('select', { onchange: (e) => { state.module = e.target.value; load(); } }, ...['', 'nexus', 'chainlink', 'waterfall', 'regulatory', 'system', 'cross'].map((m) => el('option', { value: m }, m === '' ? 'All modules' : fmt.title(m))))));
  async function load() { const q = new URLSearchParams({ limit: '300' }); if (state.module) q.set('module', state.module); try { const d = await api.get('/api/audit?' + q); box.replaceChildren(card('Audit trail', { sub: `${d.rows.length} events`, flush: true }, dataTable([{ key: 'ts', label: 'Time', sortable: true, render: (r) => el('span', { class: 'small nowrap' }, r.ts.slice(0, 19).replace('T', ' ')) }, { key: 'module', label: 'Module', sortable: true, render: (r) => el('span', { class: 'badge sq neutral' }, r.module || 'system') }, { key: 'action', label: 'Action', sortable: true, render: (r) => el('span', { class: 'mono small' }, r.action) }, { key: 'summary', label: 'Summary' }, { key: 'actor', label: 'Actor', render: (r) => el('span', { class: 'small muted' }, r.actor) }], d.rows, { pageSize: 16, searchable: true, searchKeys: ['summary', 'action', 'module'] }))); } catch (e) { box.replaceChildren(errorState(e.message)); } }
  load();
}

/* ============ Settings ============ */
export async function settings(root) {
  root.append(pageHead('System Settings', 'Local configuration & disclaimers'));
  const box = el('div', {}, skeleton(200)); root.append(box);
  try {
    const d = await api.get('/api/settings');
    const rows = d.rows.map((s) => el('div', { class: 'assume-row' }, el('label', {}, fmt.title(s.key)), el('span', { class: 'val' }, s.value)));
    box.replaceChildren(
      el('div', { class: 'grid k2' },
        card('Configuration', { sub: 'Read-only demo settings' }, ...rows),
        card('About FRIS', {}, el('div', { class: 'dl' }, dt('Product'), dd('Forensic & Regulatory Intelligence Suite'), dt('Build'), dd('Local · zero-dependency'), dt('Database'), dd('SQLite (node:sqlite)'), dt('Theme'), dd('Enterprise dark')))),
      el('div', { class: 'mt2' }, card('Disclaimers', { sub: 'Important' }, el('ul', { style: { margin: 0, paddingLeft: '18px', lineHeight: '1.9', color: 'var(--text-2)' } },
        el('li', {}, 'The platform contains synthetic demonstration data only. No record represents a real person or company.'),
        el('li', {}, 'Simulated analytical scores (flight risk, operational impact, transaction risk) are not factual allegations.'),
        el('li', {}, 'The Deterministic First-Pass Compliance Review is a triage aid, not legal advice.'),
        el('li', {}, 'Regulatory scenarios are illustrative; verify against official sources before reliance.')))));
  } catch (e) { box.replaceChildren(errorState(e.message)); }
}

// ── "Design-a-company" insolvency sandbox ────────────────────────────────────
// A prominent, self-contained playground on the Waterfall view: the user types a
// made-up company's assets, debts and costs and instantly sees the full recovery
// waterfall — mirroring the well-liked regulatory Comparison Sandbox. It POSTs the
// figures to /api/insolvency/sandbox, which assembles the exact estate the engine
// expects and runs the SAME pure, deterministic, currency-exact waterfall the
// seeded cases use. Money is entered in major units and sent as-is; the server
// converts to integer minor units (× 100) so nothing is ever a float.
const SB_HELP = {
  asset: 'A balance-sheet asset the estate will sell. Enter its gross book value and the % you expect to realise on a forced sale (a fire-sale discount is normal — property might fetch 60–80%, plant 30–50%, stock 40–60%).',
  recovery: 'Realisation rate: pence recovered per £1 of book value when sold in a wind-down. 100% = sells at book; lower reflects the forced-sale discount.',
  secured: 'A lender with a fixed/floating charge over specific assets (e.g. the bank). It is paid FIRST from its security. Enter the debt and the realisable value of the collateral — if the security is worth less than the debt, the shortfall drops down to rank with ordinary unsecured creditors.',
  collateral: 'The realisable value of the assets pledged to this lender. Caps how much the lender recovers ahead of everyone else.',
  preferential: 'Preferential claims — chiefly employees (unpaid wages/holiday) and, in some regimes, certain taxes/pensions. Paid after insolvency costs but AHEAD of ordinary unsecured creditors.',
  unsecured: 'Ordinary unsecured creditors — trade suppliers, most tax, landlords. Paid only after secured, costs and preferential ranks; they usually bear the shortfall.',
  adminPct: 'Insolvency practitioner (office-holder) fees as a % of asset realisations. A first-priority expense, paid before any creditor.',
  legal: 'Fixed legal / advisory fees of the administration, added to the first-priority expense pool.',
  litigation: 'Fixed litigation costs (e.g. pursuing recoveries), added to the first-priority expense pool.',
};
const SB_EXAMPLE = {
  currency: 'GBP',
  assets: [
    { label: 'Freehold property', type: 'real_estate', grossMajor: 2000000, recoveryPct: 75 },
    { label: 'Plant & equipment', type: 'equipment', grossMajor: 900000, recoveryPct: 40 },
    { label: 'Inventory / stock', type: 'inventory', grossMajor: 600000, recoveryPct: 45 },
    { label: 'Trade receivables', type: 'receivables', grossMajor: 800000, recoveryPct: 70 },
    { label: 'Cash at bank', type: 'cash', grossMajor: 150000, recoveryPct: 100 },
  ],
  secured: [{ name: 'Business Bank plc', amountMajor: 1800000, collateralMajor: 1500000 }],
  preferential: [{ name: 'Employees (wages & holiday)', amountMajor: 250000 }],
  unsecured: [{ name: 'Trade creditors', amountMajor: 1600000 }, { name: 'HMRC (unsecured)', amountMajor: 400000 }],
  costs: { adminPct: 8, legalMajor: 120000, litigationMajor: 40000 },
};
const SB_ASSET_TYPES = ['real_estate', 'equipment', 'inventory', 'receivables', 'cash', 'securities', 'ip', 'litigation', 'contingent'];

async function waterfallSandbox(root) {
  root.append(pageHead('Design-a-company sandbox', 'Model a wind-down — enter a company and see who recovers what', [el('a', { class: 'btn sm ghost', href: '#/waterfall' }, '‹ All cases')]));
  root.append(intro('Design-a-company sandbox', 'lets you invent a company and instantly see how an insolvency would play out. Enter its assets and how much each would fetch in a forced sale, its debts by class (secured, preferential, unsecured) and the costs of the administration — then run the same deterministic waterfall the real cases use. It applies the statutory priority order: insolvency costs first, then preferential creditors (e.g. employees), then ordinary unsecured creditors, with secured lenders paid from their own collateral before all of them, and anything left over returned to shareholders.'));

  // ---- Mutable input model (major currency units in the form; converted server-side) ----
  const model = {
    currency: 'GBP',
    assets: SB_EXAMPLE.assets.map((a) => ({ ...a })),
    secured: SB_EXAMPLE.secured.map((c) => ({ ...c })),
    preferential: SB_EXAMPLE.preferential.map((c) => ({ ...c })),
    unsecured: SB_EXAMPLE.unsecured.map((c) => ({ ...c })),
    costs: { ...SB_EXAMPLE.costs },
  };

  const ccyInput = el('input', { type: 'text', id: fieldId('ccy'), value: model.currency, maxlength: 4, style: { width: '80px' }, 'aria-label': 'Currency code', oninput: (e) => { model.currency = (e.target.value || 'GBP').toUpperCase().slice(0, 4); } });
  const numInput = (val, onIn, aria) => el('input', { type: 'number', min: 0, step: 'any', value: val, style: { width: '100%' }, 'aria-label': aria, oninput: (e) => onIn(Math.max(0, Number(e.target.value) || 0)) });
  const pctInput = (val, onIn, aria) => el('input', { type: 'number', min: 0, max: 100, step: 1, value: val, style: { width: '80px' }, 'aria-label': aria, oninput: (e) => onIn(Math.max(0, Math.min(100, Number(e.target.value) || 0))) });
  const txtInput = (val, onIn, aria) => el('input', { type: 'text', value: val, style: { width: '100%' }, maxlength: 60, 'aria-label': aria, oninput: (e) => onIn(e.target.value) });

  // ---- Asset lines editor ----
  const assetBody = el('div', { style: { display: 'grid', gap: '8px' } });
  function renderAssets() {
    const gcols = { display: 'grid', gridTemplateColumns: 'minmax(120px,2fr) minmax(120px,1.3fr) minmax(90px,1fr) 90px 32px', gap: '6px', alignItems: 'center' };
    const head = el('div', { style: { ...gcols, marginBottom: '2px' }, class: 'small muted', role: 'row' }, el('span', {}, 'Asset'), el('span', {}, 'Type'), el('span', { style: { textAlign: 'right' } }, 'Gross value'), el('span', { style: { textAlign: 'right' } }, 'Realise %'), el('span', {}, ''));
    const rows = model.assets.map((a, i) => el('div', { style: gcols, role: 'row' },
      txtInput(a.label, (v) => { a.label = v; }, 'Asset ' + (i + 1) + ' name'),
      el('select', { 'aria-label': 'Asset ' + (i + 1) + ' type', onchange: (e) => { a.type = e.target.value; } }, ...SB_ASSET_TYPES.map((t) => el('option', { value: t, selected: t === a.type }, fmt.title(t.replace(/_/g, ' '))))),
      numInput(a.grossMajor, (v) => { a.grossMajor = v; }, 'Asset ' + (i + 1) + ' gross value'),
      pctInput(a.recoveryPct, (v) => { a.recoveryPct = v; }, 'Asset ' + (i + 1) + ' realisation percent'),
      el('button', { class: 'btn sm ghost', title: 'Remove this asset', 'aria-label': 'Remove asset ' + (i + 1), onclick: () => { model.assets.splice(i, 1); renderAssets(); } }, '✕')));
    assetBody.replaceChildren(head, ...rows,
      el('button', { class: 'btn sm', onclick: () => { model.assets.push({ label: 'New asset', type: 'contingent', grossMajor: 0, recoveryPct: 50 }); renderAssets(); } }, icon('plus', 14), 'Add asset'));
  }

  // ---- Creditor lines editor (one block per class, with a collateral column for secured) ----
  function creditorBlock(listKey, label, help, withCollateral) {
    const body = el('div', { style: { display: 'grid', gap: '8px' } });
    const gcols = withCollateral
      ? { display: 'grid', gridTemplateColumns: 'minmax(140px,2fr) minmax(90px,1fr) minmax(90px,1fr) 32px', gap: '6px', alignItems: 'center' }
      : { display: 'grid', gridTemplateColumns: 'minmax(140px,2fr) minmax(90px,1fr) 32px', gap: '6px', alignItems: 'center' };
    function render() {
      const head = withCollateral
        ? el('div', { style: { ...gcols, marginBottom: '2px' }, class: 'small muted', role: 'row' }, el('span', {}, 'Creditor'), el('span', { style: { textAlign: 'right' } }, 'Debt'), el('span', { style: { textAlign: 'right' } }, 'Collateral value'), el('span', {}, ''))
        : el('div', { style: { ...gcols, marginBottom: '2px' }, class: 'small muted', role: 'row' }, el('span', {}, 'Creditor'), el('span', { style: { textAlign: 'right' } }, 'Amount'), el('span', {}, ''));
      const rows = model[listKey].map((c, i) => el('div', { style: gcols, role: 'row' }, [
        txtInput(c.name, (v) => { c.name = v; }, label + ' ' + (i + 1) + ' name'),
        numInput(c.amountMajor, (v) => { c.amountMajor = v; }, label + ' ' + (i + 1) + ' amount'),
        withCollateral ? numInput(c.collateralMajor || 0, (v) => { c.collateralMajor = v; }, label + ' ' + (i + 1) + ' collateral value') : null,
        el('button', { class: 'btn sm ghost', title: 'Remove', 'aria-label': 'Remove ' + label + ' ' + (i + 1), onclick: () => { model[listKey].splice(i, 1); render(); } }, '✕'),
      ].filter(Boolean)));
      body.replaceChildren(head, ...rows,
        el('button', { class: 'btn sm', onclick: () => { model[listKey].push(withCollateral ? { name: 'New lender', amountMajor: 0, collateralMajor: 0 } : { name: 'New creditor', amountMajor: 0 }); render(); } }, icon('plus', 14), 'Add ' + label.toLowerCase()));
    }
    render();
    return card(label, { sub: help ? undefined : null, actions: infoDot(help) }, body);
  }

  // ---- Cost inputs ----
  const adminPct = pctInput(model.costs.adminPct, (v) => { model.costs.adminPct = v; }, 'Administrator fee percent');
  const legalIn = numInput(model.costs.legalMajor, (v) => { model.costs.legalMajor = v; }, 'Legal costs');
  const litIn = numInput(model.costs.litigationMajor, (v) => { model.costs.litigationMajor = v; }, 'Litigation costs');
  const costCard = card('Costs of the administration', { sub: 'Paid first, ahead of every creditor', actions: infoDot('The office-holder’s fees and the fixed legal/litigation costs of running the insolvency. These rank as first-priority expenses and are met before any distribution to creditors.') },
    el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', alignItems: 'end' } },
      el('div', { class: 'field' }, el('label', { for: adminPct.id || (adminPct.id = fieldId('adm')) }, 'Administrator fee (% of realisations) ', infoDot(SB_HELP.adminPct)), adminPct),
      labeled(el('span', {}, 'Legal costs (fixed) ', infoDot(SB_HELP.legal)), legalIn),
      labeled(el('span', {}, 'Litigation costs (fixed) ', infoDot(SB_HELP.litigation)), litIn)));

  renderAssets();
  const resultBox = el('div', { class: 'mt2' });
  const runBtn = el('button', { class: 'btn primary', onclick: run }, icon('play', 15), 'Run the waterfall');
  const exampleBtn = el('button', { class: 'btn', title: 'Reload the worked example figures', onclick: () => { loadExample(); } }, icon('play', 14), 'Load example');

  const inputsCol = el('div',
    card('Estate assets', { sub: 'What the company owns and what it would fetch in a wind-down', actions: infoDot(SB_HELP.asset) }, assetBody),
    el('div', { class: 'mt2' }, creditorBlock('secured', 'Secured creditors', SB_HELP.secured, true)),
    el('div', { class: 'mt2' }, creditorBlock('preferential', 'Preferential creditors', SB_HELP.preferential, false)),
    el('div', { class: 'mt2' }, creditorBlock('unsecured', 'Unsecured creditors', SB_HELP.unsecured, false)),
    el('div', { class: 'mt2' }, costCard),
    el('div', { class: 'row mt2', style: { gap: '8px', alignItems: 'center' } }, el('div', { class: 'field', style: { margin: 0 } }, el('label', { for: ccyInput.id }, 'Currency'), ccyInput), el('span', { class: 'spacer' }), exampleBtn, runBtn));

  root.append(inputsCol, resultBox);

  function loadExample() {
    model.currency = SB_EXAMPLE.currency;
    model.assets = SB_EXAMPLE.assets.map((a) => ({ ...a }));
    model.secured = SB_EXAMPLE.secured.map((c) => ({ ...c }));
    model.preferential = SB_EXAMPLE.preferential.map((c) => ({ ...c }));
    model.unsecured = SB_EXAMPLE.unsecured.map((c) => ({ ...c }));
    model.costs = { ...SB_EXAMPLE.costs };
    ccyInput.value = model.currency;
    // Re-render the whole panel by re-running the view (cheap, deterministic).
    root.replaceChildren(); waterfallSandbox(root);
    setTimeout(run, 60);
  }

  async function run() {
    const payload = {
      currency: model.currency,
      assets: model.assets.map((a) => ({ label: a.label, type: a.type, grossMajor: a.grossMajor, recoveryPct: a.recoveryPct })),
      creditors: {
        secured: model.secured.map((c) => ({ name: c.name, amountMajor: c.amountMajor, collateralMajor: c.collateralMajor || 0 })),
        preferential: model.preferential.map((c) => ({ name: c.name, class: 'employee_preferential', amountMajor: c.amountMajor })),
        unsecured: model.unsecured.map((c) => ({ name: c.name, amountMajor: c.amountMajor })),
      },
      costs: { adminPct: model.costs.adminPct, legalMajor: model.costs.legalMajor, litigationMajor: model.costs.litigationMajor },
    };
    if (!payload.creditors.secured.length && !payload.creditors.preferential.length && !payload.creditors.unsecured.length) { toast('Add at least one creditor', { type: 'warn' }); return; }
    resultBox.replaceChildren(skeleton(320));
    try {
      const res = await api.post('/api/insolvency/sandbox', payload);
      renderSandboxResults(resultBox, res);
    } catch (e) { resultBox.replaceChildren(errorState(e.message)); }
  }

  run();
}

// Render the sandbox waterfall result, reusing the case-detail results style:
// headline KPIs (with the honest per-class recovery), an outcome narrative that
// states the priority order applied, the estate asset realisation, the recovery
// Sankey, and the per-class / per-creditor recovery tables.
function renderSandboxResults(box, res) {
  const w = res.waterfall;
  const ccy = res.currency;
  const money = (m) => ccy + ' ' + m.display;
  const rcp = (cls) => { const x = w.recoveryByClass.find((y) => y.class === cls); return x && x.recoveryPct != null ? x.recoveryPct : null; };
  const paidsum = (arr, k) => arr.reduce((a, s) => a + Number(String(s[k]).replace(/,/g, '')), 0);
  const unsecuredPct = rcp('unsecured');
  const securedColl = (w.securedFromCollateral && w.securedFromCollateral.length)
    ? Math.round(paidsum(w.securedFromCollateral, 'paid') / Math.max(1e-9, paidsum(w.securedFromCollateral, 'admitted')) * 1000) / 10
    : null;
  const penceIn = (pctVal) => (pctVal == null ? null : (Math.round(pctVal) + 'p / ' + ccy + '1'));
  const kpis = el('div', { class: 'grid k4' },
    kpi({ label: 'Total admitted claims', value: money(w.totalClaims) }),
    kpi({ label: 'Net realisable estate', value: money(w.netRealisableEstate) }),
    kpi({ label: 'Total distributed', value: money(w.totalDistributed) }),
    kpi({ label: 'Blended recovery (all ranks)', value: fmt.pct(w.overallRecoveryPct) }));
  const kpis2 = el('div', { class: 'grid k4 mt2' },
    kpi({ label: 'Secured recovery (from collateral)', value: securedColl == null ? 'n/a' : fmt.pct(securedColl) }),
    kpi({ label: 'Unsecured dividend (p in the ' + ccy + ')', value: unsecuredPct == null ? '—' : fmt.pct(unsecuredPct) + '  ·  ' + penceIn(unsecuredPct) }),
    kpi({ label: 'Total shortfall', value: money(w.shortfall) }),
    kpi({ label: 'Shareholder residual', value: money(w.shareholderResidual) }));
  const rc = (cls) => { const x = w.recoveryByClass.find((y) => y.class === cls); return x ? x.recoveryPct : null; };
  const pctText = (v) => (v == null ? 'n/a' : fmt.pct(v));
  const summaryEl = card('Outcome — who gets paid, in priority order', { sub: 'Statutory waterfall applied' },
    el('p', { class: 'about-p' }, `Against ${money(w.totalClaims)} of admitted claims across ${w.recoveryByCreditor.length} creditors, the estate realises ${money(w.netRealisableEstate)} and distributes ${money(w.totalDistributed)}, a blended recovery of ${fmt.pct(w.overallRecoveryPct)} with a total shortfall of ${money(w.shortfall)}. The waterfall pays in strict order: (1) the costs of the administration — office-holder fees plus fixed legal/litigation (${money(w.insolvencyCosts)}) — first; (2) secured lenders from their own collateral (recovering ${pctText(securedColl)}), any shortfall dropping to rank as unsecured; (3) preferential creditors such as employees (${pctText(rc('employee_preferential'))}); then (4) ordinary unsecured creditors (${pctText(unsecuredPct)}). ${w.surplus.value === '0.00' ? 'Nothing is left for shareholders — the estate is exhausted before equity.' : 'Shareholders receive ' + money(w.shareholderResidual) + ' as a residual surplus.'}`));
  const sankeyBox = el('div'); sankey(sankeyBox, { links: w.flows, height: 320 });
  const classTable = dataTable([
    { key: 'label', label: 'Class', render: (x) => el('span', {}, x.label) },
    { key: 'group', label: 'Rank', render: (x) => el('span', { class: 'badge sq neutral' }, fmt.title(x.group)) },
    { key: 'demand', label: 'Claim', align: 'right', render: (x) => el('span', { class: 'tabular' }, x.demand) },
    { key: 'paid', label: 'Recovered', align: 'right', render: (x) => el('span', { class: 'tabular' }, x.paid) },
    { key: 'shortfall', label: 'Shortfall', align: 'right', render: (x) => el('span', { class: 'tabular', style: { color: Number(String(x.shortfall).replace(/,/g, '')) > 0 ? '#f0616d' : 'var(--text-2)' } }, x.shortfall) },
    { key: 'recoveryPct', label: 'Recovery', align: 'right', render: (x) => x.recoveryPct == null ? '—' : el('div', { style: { minWidth: '90px' } }, el('div', { class: 'small tabular', style: { textAlign: 'right' } }, fmt.pct(x.recoveryPct)), meter(x.recoveryPct, x.recoveryPct >= 80 ? '#46b877' : x.recoveryPct >= 40 ? '#e5a53b' : '#f0616d')) },
  ], w.recoveryByClass.filter((x) => x.class !== 'residual' && (Number(String(x.demand).replace(/,/g, '')) > 0 || x.paid !== '0.00')), { pageSize: 14 });
  const credTable = dataTable([
    { key: 'name', label: 'Creditor', sortable: true }, { key: 'classLabel', label: 'Class', sortable: true, render: (x) => el('span', { class: 'badge sq neutral' }, x.classLabel) },
    { key: 'admitted', label: 'Admitted claim', align: 'right', sortable: true, sortVal: (x) => Number(x.admittedMinor), render: (x) => el('span', { class: 'tabular' }, x.admitted) },
    { key: 'paid', label: 'Recovered', align: 'right', sortable: true, sortVal: (x) => Number(x.paidMinor), render: (x) => el('span', { class: 'tabular' }, x.paid) },
    { key: 'shortfall', label: 'Shortfall', align: 'right', sortable: true, sortVal: (x) => Number(x.shortfallMinor), render: (x) => el('span', { class: 'tabular', style: { color: Number(x.shortfallMinor) > 0 ? '#f0616d' : 'var(--text-2)' } }, x.shortfall) },
    { key: 'recoveryPct', label: 'Recovery', align: 'right', sortable: true, render: (x) => el('span', { class: 'tabular' }, fmt.pct(x.recoveryPct)) },
  ], w.recoveryByCreditor, { searchable: true, searchKeys: ['name', 'classLabel'], pageSize: 10 });
  const assetsCard = card('Estate assets — gross to net realisation', { sub: `${w.assetRealisation.length} lines (incl. pledged collateral)`, flush: true }, dataTable([
    { key: 'label', label: 'Asset' },
    { key: 'type', label: 'Type', render: (a) => el('span', { class: 'badge sq neutral' }, fmt.title(a.type)) },
    { key: 'gross', label: 'Gross', align: 'right', render: (a) => el('span', { class: 'tabular' }, a.gross) },
    { key: 'recoveryPct', label: 'Recovery', align: 'right', render: (a) => el('span', { class: 'tabular' }, fmt.pct(a.recoveryPct)) },
    { key: 'net', label: 'Net to estate', align: 'right', render: (a) => el('span', { class: 'tabular' }, a.net) },
  ], w.assetRealisation, { pageSize: 8 }));
  box.replaceChildren(kpis, kpis2, el('div', { class: 'mt2' }, summaryEl), el('div', { class: 'mt2' }, assetsCard),
    el('div', { class: 'mt2' }, card('Recovery flow (Sankey)', { sub: 'Gross assets → costs → distributions' }, sankeyBox)),
    el('div', { class: 'mt2' }, card('Recovery rate by creditor class (pence in the ' + ccy + ')', { sub: 'Per-rank recovery — the honest breakdown behind the blended figure', flush: true }, classTable)),
    el('div', { class: 'mt2' }, card('Recovery by creditor', { flush: true }, credTable)));
}
