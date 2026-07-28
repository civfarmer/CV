// View: Quarterly Financial Report — a deterministic corporate financials
// dashboard over a SYNTHETIC fictional company ("Aethergrid Systems plc"). A
// quarter selector drives five sections from the reporting engine
// (engines/financials.mjs): a P&L summary (statement table + KPI cards), a
// cash-flow waterfall CHART (a signed SVG bridge from opening to closing cash),
// a revenue-by-segment donut with a share legend, a YoY comparison table, and an
// expense breakdown. Renders in-page within the shell (never a viewport
// takeover), is print-friendly, accessible (labelled controls, scoped table
// headers) and clearly labelled as synthetic demonstration data — NOT a set of
// accounts or a financial system of record.
import { el, api, icon, card, toast, emptyState, errorState, skeleton, infoDot } from './core.js';
import { pageHead, intro } from './views1.js';
import { donut, barChart } from './viz.js';

// Reporting-unit accent palette (matches the app's dark enterprise style).
const POS = '#46b877';   // inflow / positive delta (green)
const NEG = '#f0616d';   // outflow / negative delta (red)
const NEUTRAL = '#8aa0bd';
const ANCHOR = '#4d8df0'; // opening / closing anchor bars

// ── Local thousands formatter (mirrors engines/financials.mjs formatUnit, kept
// here so the browser bundle never needs to import the engine into the view). ──
function fmtUnit(amountThousands, opts = {}) {
  const n = Math.round(Number(amountThousands) || 0);
  const abs = Math.abs(n);
  const grouped = String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (n < 0 && opts.paren) return `(${grouped})`;
  if (opts.sign) return (n < 0 ? '−' : n > 0 ? '+' : '') + grouped;
  return (n < 0 ? '−' : '') + grouped;
}
function fmtPct(v) { return v == null ? '—' : (Number(v).toFixed(Number(v) % 1 === 0 ? 0 : 1) + '%'); }
function fmtSignedPct(v) { if (v == null) return '—'; const s = Number(v); return (s > 0 ? '+' : '') + s.toFixed(s % 1 === 0 ? 0 : 1) + '%'; }
function fmtNum(n) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

const SVGNS = 'http://www.w3.org/2000/svg';
// Small SVG element helper (dependency-free, mirrors viz.js's private S). Safe in
// the e2e DOM shim: uses createElementNS + setAttribute only, no layout reads.
function S(tag, attrs = {}, ...kids) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) { if (v == null) continue; e.setAttribute(k, v); }
  for (const kid of kids.flat()) if (kid != null) e.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return e;
}

export async function financials(root, parts) {
  root.append(pageHead('Quarterly Financial Report', 'A synthetic corporate financials dashboard — P&L, a cash-flow waterfall, revenue by segment, a YoY comparison and the expense breakdown, per quarter', [
    el('button', { class: 'btn sm', id: 'fin-print-btn', title: 'Print / save this report as PDF', onclick: () => printReport() }, icon('download', 15), 'Print'),
  ]));
  root.append(intro('Quarterly Financial Report',
    'presents a chosen quarter of a fictional company’s results as a corporate financials dashboard: a P&L statement that reconciles from revenue down to net income (with margins), a cash-flow waterfall that bridges opening cash to closing cash step by step, revenue broken out by business segment, a year-on-year comparison against the same quarter a year earlier, and an operating-expense breakdown. Pick a quarter and every section updates. Every figure is invented and generated deterministically.'));

  // Honesty banner — synthetic company, not a system of record.
  root.append(el('div', { class: 'intro', role: 'note', style: { marginTop: '10px', '--mc': NEG } },
    el('span', { class: 'ico' }, icon('info', 18)),
    el('div', { class: 't' }, el('b', {}, 'Synthetic financials — not a set of accounts. '),
      'Every company, segment and figure here is FICTIONAL and generated deterministically for demonstration. Nothing refers to a real company, period or filed statement. This is a demonstration of financial-reporting mechanics (a P&L that reconciles, a cash-flow bridge that ties out), NOT an audited statement or a financial system of record.')));

  const body = el('div', { class: 'mt' }, skeleton(280));
  root.append(body);

  // Load the quarter list, then render the selector + the selected quarter's report.
  let ql;
  try { ql = await api.get('/api/financials/quarters'); }
  catch (e) { body.replaceChildren(errorState(e.message)); return; }
  if (!ql.quarters || !ql.quarters.length) { body.replaceChildren(emptyState('No quarters available')); return; }

  // Selected quarter comes from the route (#/financials/<QUARTER-ENCODED>) or defaults to latest.
  const routeQ = parts && parts[0] ? decodeURIComponent(parts[0]) : '';
  const known = new Set(ql.quarters.map((q) => q.quarter));
  const selected = known.has(routeQ) ? routeQ : ql.latest;

  await renderDashboard(body, ql, selected);
}

// ── The dashboard: quarter selector + the five report sections ────────────────
async function renderDashboard(root, ql, selected) {
  root.replaceChildren(skeleton(280));

  let rep;
  try { rep = await api.get('/api/financials/report?quarter=' + encodeURIComponent(selected)); }
  catch (e) { root.replaceChildren(errorState(e.message)); return; }

  const nodes = [];

  // ── Quarter selector (labelled <select> + prev/next, updates the whole view) ─
  nodes.push(renderSelector(root, ql, rep));

  // Company identity strip.
  const co = rep.company;
  nodes.push(el('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center', margin: '2px 2px 8px' } },
    el('span', { style: { fontWeight: '700', color: 'var(--text)', fontSize: '15px' } }, co.name),
    el('span', { class: 'badge sq neutral', title: 'Ticker' }, co.ticker),
    el('span', { class: 'small muted' }, co.sector),
    el('span', { class: 'spacer' }),
    el('span', { class: 'badge sq neutral', title: 'Reporting unit' }, 'Figures in ' + co.unitLabel),
    el('span', { class: 'badge sq neutral', title: 'Data classification' }, 'Synthetic')));

  // 1. P&L summary.
  nodes.push(renderPnl(rep));
  // 2. Cash-flow waterfall chart.
  nodes.push(renderWaterfall(rep));
  // Two-up: segment donut + YoY table.
  nodes.push(el('div', { class: 'fin-grid2', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px' } },
    renderSegments(rep),
    renderYoY(rep)));
  // 5. Expense breakdown.
  nodes.push(renderExpenses(rep));

  // Disclaimer footer.
  nodes.push(el('div', { class: 'intro', style: { marginTop: '18px' } },
    el('span', { class: 'ico' }, icon('info', 18)),
    el('div', { class: 't' }, el('b', {}, 'Not a system of record. '), rep.disclaimer,
      el('div', { class: 'small muted', style: { marginTop: '4px' } }, `Model v${rep.version.version} · ${rep.version.quarters} quarters · ${rep.version.segments} segments · deterministic`))));

  root.replaceChildren(...nodes);
}

// ── Quarter selector ──────────────────────────────────────────────────────────
function renderSelector(root, ql, rep) {
  // Newest-first list from the engine. A labelled <select> plus prev/next steppers.
  const quarters = ql.quarters; // newest first
  const curIdx = quarters.findIndex((q) => q.quarter === rep.quarter);

  const goTo = (q) => {
    if (!q || q === rep.quarter) return;
    // Reflect selection in the hash so it is linkable + survives reload, and
    // re-render the dashboard body in place.
    try { if (typeof location !== 'undefined') location.hash = '#/financials/' + encodeURIComponent(q); } catch { /* shim */ }
    renderDashboard(root, ql, q);
  };

  const select = el('select', {
    id: 'fin-quarter-select', class: 'fin-select', 'aria-label': 'Reporting quarter',
    style: { padding: '7px 10px', background: 'var(--surface-2, #131924)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '14px', minWidth: '160px' },
    onchange: (e) => goTo(e.target.value),
  }, ...quarters.map((q) => el('option', { value: q.quarter, selected: q.quarter === rep.quarter ? true : null }, q.quarter + (q.hasYoY ? '' : ' · no YoY'))));
  // Some shims don't reflect the selected attribute onto .value; set it explicitly.
  try { select.value = rep.quarter; } catch { /* shim */ }

  // prev = older (higher index in a newest-first list), next = newer (lower index).
  const olderBtn = el('button', { class: 'btn sm ghost', title: 'Previous (older) quarter', 'aria-label': 'Previous quarter', disabled: curIdx >= quarters.length - 1 ? true : null, onclick: () => { if (curIdx < quarters.length - 1) goTo(quarters[curIdx + 1].quarter); } }, icon('chevron', 14), 'Older');
  const newerBtn = el('button', { class: 'btn sm ghost', title: 'Next (newer) quarter', 'aria-label': 'Next quarter', disabled: curIdx <= 0 ? true : null, onclick: () => { if (curIdx > 0) goTo(quarters[curIdx - 1].quarter); } }, 'Newer', icon('chevron', 14));

  return card('Reporting period', { sub: `${quarters.length} quarters modelled · latest ${ql.latest}`, actions: el('span', { class: 'badge sq neutral' }, 'Deterministic') },
    el('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center' } },
      el('label', { for: 'fin-quarter-select', class: 'small muted', style: { fontWeight: '600' } }, 'Quarter:'),
      select,
      olderBtn, newerBtn,
      el('span', { class: 'spacer' }),
      rep.yoy && rep.yoy.available
        ? el('span', { class: 'badge low', title: 'A prior-year comparison quarter is available' }, el('span', { class: 'dot' }), 'YoY vs ' + rep.yoy.priorQuarter)
        : el('span', { class: 'badge sq neutral', title: 'No prior-year quarter is modelled for this period' }, 'No YoY')));
}

// ── 1. P&L summary — KPI cards + a clean statement ladder ──────────────────────
function renderPnl(rep) {
  const p = rep.pnl;
  const t = p.totals;

  // Headline KPI cards.
  const kpis = [
    { label: 'Revenue', value: fmtUnit(t.revenue), sub: 'total', color: 'var(--text)' },
    { label: 'Gross margin', value: fmtPct(t.grossMargin), sub: fmtUnit(t.grossProfit) + ' gross profit', color: POS },
    { label: 'EBITDA', value: fmtUnit(t.ebitda), sub: fmtPct(t.ebitdaMargin) + ' margin', color: 'var(--text)' },
    { label: 'EBIT', value: fmtUnit(t.ebit), sub: fmtPct(t.ebitMargin) + ' margin', color: 'var(--text)' },
    { label: 'Net income', value: fmtUnit(t.netIncome), sub: fmtUnit(t.netIncome) + ' after tax', color: t.netIncome >= 0 ? POS : NEG },
    { label: 'Net margin', value: fmtPct(t.netMargin), sub: 'of revenue', color: 'var(--text)' },
  ];
  const kpiRow = el('div', { class: 'row wrap', style: { gap: '10px', marginBottom: '12px' } },
    ...kpis.map((k) => el('div', { class: 'card', style: { flex: '1 1 140px', padding: '10px 12px' } },
      el('div', { class: 'small muted' }, k.label),
      el('div', { class: 'tabular', style: { fontWeight: '800', fontSize: '20px', color: k.color } }, k.value),
      el('div', { class: 'small muted', style: { marginTop: '2px' } }, k.sub))));

  // Statement ladder table.
  const rows = p.lines.map((ln) => {
    const emphasis = ln.emphasis;
    const isCost = ln.kind === 'cost';
    const amtColor = ln.kind === 'total' || ln.kind === 'subtotal' ? 'var(--text)' : (isCost ? NEG : 'var(--text-2)');
    return el('tr', { class: emphasis ? 'fin-emph' : null, style: emphasis ? { fontWeight: '700', background: 'var(--surface-2, rgba(255,255,255,0.02))' } : null },
      el('th', { scope: 'row', style: { textAlign: 'left', fontWeight: emphasis ? '700' : '500', color: emphasis ? 'var(--text)' : 'var(--text-2)', paddingLeft: (ln.kind === 'cost' ? '18px' : '8px') } }, ln.label),
      el('td', { class: 'tabular', style: { textAlign: 'right', color: amtColor } }, fmtUnit(ln.amount, { paren: true })),
      el('td', { class: 'tabular small muted', style: { textAlign: 'right', width: '78px' } }, ln.margin == null ? '—' : fmtPct(ln.margin)));
  });
  const table = el('div', { style: { overflowX: 'auto' } },
    el('table', { class: 'tbl fin-pnl-table', style: { width: '100%' } },
      el('caption', { class: 'small muted', style: { captionSide: 'top', textAlign: 'left', paddingBottom: '6px' } }, `Statement of operations — ${rep.quarter} (${rep.company.unitLabel})`),
      el('thead', {}, el('tr', {},
        el('th', { scope: 'col', style: { textAlign: 'left' } }, 'Line item'),
        el('th', { scope: 'col', style: { textAlign: 'right' } }, 'Amount'),
        el('th', { scope: 'col', style: { textAlign: 'right' } }, '% rev'))),
      el('tbody', {}, ...rows)));

  return card('P&L summary', { sub: `Revenue to net income · ${rep.quarter}`, actions: el('span', { class: 'badge sq neutral' }, rep.company.unitLabel) },
    kpiRow, table);
}

// ── 2. Cash-flow waterfall — a proper signed SVG bridge ───────────────────────
function renderWaterfall(rep) {
  const wf = rep.cashflowWaterfall;
  const chartWrap = el('div', { class: 'fin-waterfall', role: 'img', 'aria-label':
    `Cash-flow waterfall for ${rep.quarter}: opening cash ${fmtUnit(wf.openingCash)}, ` +
    wf.steps.filter((s) => s.kind === 'delta').map((s) => `${s.label} ${fmtUnit(s.delta, { sign: true })}`).join(', ') +
    `, closing cash ${fmtUnit(wf.closingCash)}.`,
    style: { overflowX: 'auto' } });
  waterfallChart(chartWrap, wf.steps, { unitLabel: rep.company.unitLabel });

  // A compact data table mirrors the chart (accessible + print fallback).
  const trows = wf.steps.map((s) => {
    const isDelta = s.kind === 'delta';
    const color = !isDelta ? ANCHOR : (s.delta > 0 ? POS : s.delta < 0 ? NEG : NEUTRAL);
    return el('tr', { style: s.kind === 'total' ? { fontWeight: '700' } : null },
      el('th', { scope: 'row', style: { textAlign: 'left', color: s.kind === 'total' ? 'var(--text)' : 'var(--text-2)' } }, s.label),
      el('td', { class: 'tabular', style: { textAlign: 'right', color } }, isDelta ? fmtUnit(s.delta, { sign: true }) : fmtUnit(s.delta)),
      el('td', { class: 'tabular small muted', style: { textAlign: 'right' } }, fmtUnit(s.running)));
  });
  const table = el('div', { style: { overflowX: 'auto', marginTop: '4px' } },
    el('table', { class: 'tbl fin-cf-table', style: { width: '100%' } },
      el('thead', {}, el('tr', {},
        el('th', { scope: 'col', style: { textAlign: 'left' } }, 'Cash-flow step'),
        el('th', { scope: 'col', style: { textAlign: 'right' } }, 'Change'),
        el('th', { scope: 'col', style: { textAlign: 'right' } }, 'Running cash'))),
      el('tbody', {}, ...trows)));

  // Bridge-ties-out badge (the engine surfaces `bridges`).
  const bridgeBadge = wf.bridges
    ? el('span', { class: 'badge low', title: 'Opening + Σ changes === closing cash' }, el('span', { class: 'dot' }), 'Bridge ties out')
    : el('span', { class: 'badge high', title: 'Bridge does not reconcile' }, el('span', { class: 'dot' }), 'Bridge error');

  const legend = el('div', { class: 'row wrap', style: { gap: '14px', margin: '2px 2px 8px' } },
    legendDot(ANCHOR, 'Opening / closing cash'),
    legendDot(POS, 'Cash inflow'),
    legendDot(NEG, 'Cash outflow'));

  return card('Cash-flow waterfall', {
    sub: `Opening → closing cash bridge · net change ${fmtUnit(wf.netChange, { sign: true })}`,
    actions: bridgeBadge,
  }, legend, chartWrap, table);
}

// The waterfall chart renderer. Builds a proper SVG waterfall: an opening-cash
// anchor bar, a signed up/down bridge bar per delta step (green up, red down)
// with floating connectors, ending at a closing-cash anchor bar, with value
// labels and step names. Pure geometry from the step values (no layout reads),
// so it renders identically in the browser and the e2e DOM shim.
//
// `steps` is the engine's ordered array: [{id,label,delta,running,kind,sign}...]
// with the first/last kind==='total' (anchors) and the middle kind==='delta'.
export function waterfallChart(container, steps, opts = {}) {
  const n = steps.length;
  const W = Math.max(560, n * 96);
  const H = 300;
  const PAD_L = 54, PAD_R = 16, PAD_T = 22, PAD_B = 58;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const band = plotW / n;
  const barW = Math.min(58, band * 0.62);

  // Vertical scale spans 0..max(running, anchors) with a little headroom so bars
  // read cleanly. Running totals are cash levels; deltas float between levels.
  let maxV = 0;
  for (const s of steps) { maxV = Math.max(maxV, s.running); if (s.kind === 'delta') maxV = Math.max(maxV, s.running - s.delta); }
  const top = maxV * 1.08 || 1;
  const y = (v) => PAD_T + plotH - (v / top) * plotH;
  const cx = (i) => PAD_L + band * i + band / 2;

  const svg = S('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, preserveAspectRatio: 'xMidYMid meet', 'font-family': 'inherit' });

  // Baseline + a couple of gridlines.
  const GRID = '#26304050';
  const AXIS = '#3a465c';
  const gridLines = 4;
  for (let g = 0; g <= gridLines; g++) {
    const v = (top / gridLines) * g;
    const yy = y(v);
    svg.append(S('line', { x1: PAD_L, y1: yy, x2: W - PAD_R, y2: yy, stroke: GRID, 'stroke-width': 1 }));
    svg.append(S('text', { x: PAD_L - 8, y: yy + 3, 'text-anchor': 'end', fill: '#7d8aa0', 'font-size': 9 }, fmtNum(v)));
  }
  svg.append(S('line', { x1: PAD_L, y1: y(0), x2: W - PAD_R, y2: y(0), stroke: AXIS, 'stroke-width': 1.4 }));

  // Bars + connectors.
  for (let i = 0; i < n; i++) {
    const s = steps[i];
    const isAnchor = s.kind !== 'delta';
    const x0 = cx(i) - barW / 2;
    let barTop, barBottom, fill, labelVal;

    if (isAnchor) {
      barTop = y(s.running);
      barBottom = y(0);
      fill = ANCHOR;
      labelVal = fmtUnit(s.running);
    } else {
      const prev = s.running - s.delta; // level before this step
      const hi = Math.max(prev, s.running);
      const lo = Math.min(prev, s.running);
      barTop = y(hi);
      barBottom = y(lo);
      fill = s.delta > 0 ? POS : s.delta < 0 ? NEG : NEUTRAL;
      labelVal = fmtUnit(s.delta, { sign: true });
    }
    const h = Math.max(2, barBottom - barTop);
    // Bar.
    svg.append(S('rect', { x: x0, y: barTop, width: barW, height: h, rx: 3, fill, opacity: isAnchor ? 0.95 : 0.9 }));
    // Value label above the bar (or above the baseline for tiny bars).
    const labelY = Math.max(PAD_T + 9, barTop - 5);
    svg.append(S('text', { x: cx(i), y: labelY, 'text-anchor': 'middle', fill: isAnchor ? '#cdd8ea' : fill, 'font-size': 11, 'font-weight': 700 }, labelVal));
    // Step name(s) under the axis (wrapped to two short lines).
    const nameLines = wrapLabel(s.label, 14);
    nameLines.slice(0, 2).forEach((ln, li) => {
      svg.append(S('text', { x: cx(i), y: H - PAD_B + 16 + li * 11, 'text-anchor': 'middle', fill: '#8a97ad', 'font-size': 9 }, ln));
    });

    // Floating connector from this bar's ending level to the next bar's starting level.
    if (i < n - 1) {
      const yEnd = y(s.running);
      const xRight = cx(i) + barW / 2;
      const xNext = cx(i + 1) - barW / 2;
      svg.append(S('line', { x1: xRight, y1: yEnd, x2: xNext, y2: yEnd, stroke: '#5b6b82', 'stroke-width': 1, 'stroke-dasharray': '3 3' }));
    }
  }

  container.replaceChildren(svg);
  return svg;
}

// Greedy word-wrap for short SVG labels (no DOM measurement — deterministic).
function wrapLabel(text, maxChars) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur) { cur = w; continue; }
    if ((cur + ' ' + w).length <= maxChars) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

// ── 3. Revenue by segment — donut + share legend ──────────────────────────────
function renderSegments(rep) {
  const seg = rep.segments;
  const donutWrap = el('div', { class: 'fin-donut', role: 'img', 'aria-label':
    `Revenue by segment for ${rep.quarter}: ` + seg.rows.map((r) => `${r.label} ${fmtPct(r.sharePct)}`).join(', ') + '.',
    style: { display: 'flex', justifyContent: 'center' } });
  // donut() expects segments as [{value, color}] and opts {height, label}.
  donut(donutWrap, seg.rows.map((r) => ({ value: r.revenue, color: r.color })), { height: 170, label: rep.company.unitLabel });

  // Legend with each segment's share %.
  const legend = el('div', { style: { marginTop: '8px' } },
    ...seg.rows.map((r) => el('div', { class: 'row', style: { gap: '8px', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--border)' } },
      el('span', { style: { flex: '0 0 auto', width: '11px', height: '11px', borderRadius: '3px', background: r.color, display: 'inline-block' } }),
      el('span', { class: 'small', style: { flex: '1 1 auto', color: 'var(--text)' } }, r.label),
      el('span', { class: 'tabular small muted', style: { flex: '0 0 auto' } }, fmtUnit(r.revenue)),
      el('span', { class: 'tabular', style: { flex: '0 0 54px', textAlign: 'right', fontWeight: '700', color: 'var(--text)' } }, fmtPct(r.sharePct)))),
    el('div', { class: 'row', style: { gap: '8px', alignItems: 'center', padding: '6px 0 0', fontWeight: '700' } },
      el('span', { style: { flex: '0 0 auto', width: '11px' } }),
      el('span', { class: 'small', style: { flex: '1 1 auto', color: 'var(--text)' } }, 'Total revenue'),
      el('span', { class: 'tabular small', style: { flex: '0 0 auto', color: 'var(--text)' } }, fmtUnit(seg.total)),
      el('span', { class: 'tabular', style: { flex: '0 0 54px', textAlign: 'right', color: 'var(--text)' } }, fmtPct(seg.shareSum))));

  return card('Revenue by segment', { sub: `${seg.rows.length} segments · shares sum to ${fmtPct(seg.shareSum)}`, actions: el('span', { class: 'badge sq neutral' }, rep.company.unitLabel) },
    donutWrap, legend);
}

// ── 4. YoY comparison — this quarter vs same quarter prior year ───────────────
function renderYoY(rep) {
  const yoy = rep.yoy;
  if (!yoy || !yoy.available) {
    return card('Year-on-year comparison', { sub: 'This quarter vs the same quarter a year earlier' },
      emptyState('No prior-year quarter', yoy && yoy.note ? yoy.note : 'The earliest four quarters have no prior-year comparison.'));
  }

  const fmtMetric = (m, which) => {
    const v = m[which];
    if (m.unit === 'pct') return fmtPct(v);
    if (m.unit === 'count') return fmtNum(v);
    return fmtUnit(v);
  };
  const rows = yoy.metrics.map((m) => {
    const up = m.direction === 'up';
    const down = m.direction === 'down';
    const dColor = up ? POS : down ? NEG : NEUTRAL;
    const arrow = up ? '▲' : down ? '▼' : '→';
    const deltaText = m.unit === 'pct'
      ? fmtSignedPct(m.deltaAbs) + ' pts'
      : (fmtUnit(m.deltaAbs, { sign: true }) + (m.deltaPct == null ? '' : '  (' + fmtSignedPct(m.deltaPct) + ')'));
    return el('tr', {},
      el('th', { scope: 'row', style: { textAlign: 'left', color: 'var(--text-2)' } }, m.label),
      el('td', { class: 'tabular', style: { textAlign: 'right', color: 'var(--text)' } }, fmtMetric(m, 'current')),
      el('td', { class: 'tabular small muted', style: { textAlign: 'right' } }, fmtMetric(m, 'prior')),
      el('td', { class: 'tabular', style: { textAlign: 'right', color: dColor, fontWeight: '700', whiteSpace: 'nowrap' } }, arrow + ' ' + deltaText));
  });

  const table = el('div', { style: { overflowX: 'auto' } },
    el('table', { class: 'tbl fin-yoy-table', style: { width: '100%' } },
      el('thead', {}, el('tr', {},
        el('th', { scope: 'col', style: { textAlign: 'left' } }, 'Metric'),
        el('th', { scope: 'col', style: { textAlign: 'right' } }, rep.quarter),
        el('th', { scope: 'col', style: { textAlign: 'right' } }, yoy.priorQuarter),
        el('th', { scope: 'col', style: { textAlign: 'right' } }, 'Change'))),
      el('tbody', {}, ...rows)));

  return card('Year-on-year comparison', { sub: yoy.note, actions: el('span', { class: 'badge low' }, el('span', { class: 'dot' }), 'vs ' + yoy.priorQuarter) },
    table);
}

// ── 5. Expense breakdown — bar chart + table (each category, % of revenue) ─────
function renderExpenses(rep) {
  const ex = rep.expenses;

  // Bar chart: each cost category by amount. barChart() expects [{value,label,color}].
  const chartWrap = el('div', { class: 'fin-expense-chart', role: 'img', 'aria-label':
    `Expense breakdown for ${rep.quarter}: ` + ex.rows.map((r) => `${r.label} ${fmtUnit(r.amount)} (${fmtPct(r.pctOfRevenue)} of revenue)`).join(', ') + '.',
    style: { overflowX: 'auto' } });
  barChart(chartWrap, ex.rows.map((r) => ({ value: r.amount, label: r.label, color: r.color })), { height: 200 });

  // Table with each category and % of revenue + a total row.
  const rows = ex.rows.map((r) => el('tr', {},
    el('th', { scope: 'row', style: { textAlign: 'left' } },
      el('span', { style: { display: 'inline-block', width: '10px', height: '10px', borderRadius: '2px', background: r.color, marginRight: '7px', verticalAlign: 'middle' } }),
      el('span', { style: { color: 'var(--text-2)' } }, r.label),
      el('span', { class: 'badge sq neutral', style: { marginLeft: '7px' }, title: 'Cost group' }, groupLabel(r.group))),
    el('td', { class: 'tabular', style: { textAlign: 'right', color: 'var(--text)' } }, fmtUnit(r.amount)),
    el('td', { class: 'tabular small muted', style: { textAlign: 'right' } }, fmtPct(r.pctOfRevenue))));
  // Totals.
  rows.push(el('tr', { style: { fontWeight: '700', background: 'var(--surface-2, rgba(255,255,255,0.02))' } },
    el('th', { scope: 'row', style: { textAlign: 'left', color: 'var(--text)' } }, 'Total operating expenses'),
    el('td', { class: 'tabular', style: { textAlign: 'right', color: 'var(--text)' } }, fmtUnit(ex.totalOpex)),
    el('td', { class: 'tabular small muted', style: { textAlign: 'right' } }, fmtPct(ex.opexPctOfRevenue))));
  rows.push(el('tr', { style: { fontWeight: '700' } },
    el('th', { scope: 'row', style: { textAlign: 'left', color: 'var(--text)' } }, 'Total cost (COGS + opex + D&A)'),
    el('td', { class: 'tabular', style: { textAlign: 'right', color: NEG } }, fmtUnit(ex.totalCost)),
    el('td', { class: 'tabular small muted', style: { textAlign: 'right' } }, fmtPct(ex.totalCostPctOfRevenue))));

  const table = el('div', { style: { overflowX: 'auto', marginTop: '6px' } },
    el('table', { class: 'tbl fin-expense-table', style: { width: '100%' } },
      el('thead', {}, el('tr', {},
        el('th', { scope: 'col', style: { textAlign: 'left' } }, 'Cost category'),
        el('th', { scope: 'col', style: { textAlign: 'right' } }, 'Amount'),
        el('th', { scope: 'col', style: { textAlign: 'right' } }, '% of revenue'))),
      el('tbody', {}, ...rows)));

  return card('Expense breakdown', { sub: `COGS, operating expenses and D&A · ${fmtPct(ex.totalCostPctOfRevenue)} of revenue`, actions: el('span', { class: 'badge sq neutral' }, rep.company.unitLabel) },
    chartWrap, table);
}

function groupLabel(g) { return g === 'cogs' ? 'COGS' : g === 'dna' ? 'D&A' : g === 'opex' ? 'Opex' : g; }

// ── Small shared helpers ──────────────────────────────────────────────────────
function legendDot(color, label) {
  return el('span', { class: 'row', style: { gap: '6px', alignItems: 'center' } },
    el('span', { style: { width: '11px', height: '11px', borderRadius: '3px', background: color, display: 'inline-block' } }),
    el('span', { class: 'small muted' }, label));
}

// Print / save the current report as a PDF via a print-laid-out window. Guarded
// for the e2e / non-browser shim (no window.open).
function printReport() {
  if (typeof window === 'undefined' || typeof window.open !== 'function') { toast('Printing unavailable here', { type: 'warn' }); return; }
  const w = window.open('', '_blank');
  if (!w) { toast('Pop-up blocked — allow pop-ups to print', { type: 'warn' }); return; }
  // Fetch the selected quarter's report and lay it out for print.
  const sel = (typeof document !== 'undefined' && document.getElementById && document.getElementById('fin-quarter-select'));
  const quarter = sel && sel.value ? sel.value : '';
  fetch('/api/financials/report' + (quarter ? '?quarter=' + encodeURIComponent(quarter) : ''))
    .then((r) => r.json())
    .then((rep) => { writePrintDoc(w, rep); })
    .catch(() => { try { w.document.write('<p>Could not load the report.</p>'); w.document.close(); } catch { /* ignore */ } });
}

function writePrintDoc(w, rep) {
  const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const p = rep.pnl, wf = rep.cashflowWaterfall, seg = rep.segments, yoy = rep.yoy, ex = rep.expenses;
  const pnlRows = p.lines.map((ln) => `<tr class="${ln.emphasis ? 'emph' : ''}"><td>${esc(ln.label)}</td><td class="r">${esc(fmtUnit(ln.amount, { paren: true }))}</td><td class="r">${ln.margin == null ? '' : esc(fmtPct(ln.margin))}</td></tr>`).join('');
  const cfRows = wf.steps.map((s) => `<tr class="${s.kind === 'total' ? 'emph' : ''}"><td>${esc(s.label)}</td><td class="r">${esc(s.kind === 'delta' ? fmtUnit(s.delta, { sign: true }) : fmtUnit(s.delta))}</td><td class="r">${esc(fmtUnit(s.running))}</td></tr>`).join('');
  const segRows = seg.rows.map((r) => `<tr><td>${esc(r.label)}</td><td class="r">${esc(fmtUnit(r.revenue))}</td><td class="r">${esc(fmtPct(r.sharePct))}</td></tr>`).join('') + `<tr class="emph"><td>Total revenue</td><td class="r">${esc(fmtUnit(seg.total))}</td><td class="r">${esc(fmtPct(seg.shareSum))}</td></tr>`;
  const yoyRows = yoy && yoy.available ? yoy.metrics.map((m) => {
    const cur = m.unit === 'pct' ? fmtPct(m.current) : m.unit === 'count' ? fmtNum(m.current) : fmtUnit(m.current);
    const pri = m.unit === 'pct' ? fmtPct(m.prior) : m.unit === 'count' ? fmtNum(m.prior) : fmtUnit(m.prior);
    const d = m.unit === 'pct' ? fmtSignedPct(m.deltaAbs) + ' pts' : fmtUnit(m.deltaAbs, { sign: true }) + (m.deltaPct == null ? '' : ' (' + fmtSignedPct(m.deltaPct) + ')');
    return `<tr><td>${esc(m.label)}</td><td class="r">${esc(cur)}</td><td class="r">${esc(pri)}</td><td class="r">${esc(d)}</td></tr>`;
  }).join('') : '';
  const exRows = ex.rows.map((r) => `<tr><td>${esc(r.label)}</td><td class="r">${esc(fmtUnit(r.amount))}</td><td class="r">${esc(fmtPct(r.pctOfRevenue))}</td></tr>`).join('') + `<tr class="emph"><td>Total cost</td><td class="r">${esc(fmtUnit(ex.totalCost))}</td><td class="r">${esc(fmtPct(ex.totalCostPctOfRevenue))}</td></tr>`;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(rep.company.name)} — ${esc(rep.quarter)}</title>
<style>body{font-family:Georgia,'Times New Roman',serif;color:#111;max-width:820px;margin:28px auto;padding:0 24px;line-height:1.45}
h1{font-size:20px;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:4px}h2{font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#444;margin:20px 0 6px}
.meta{color:#555;font-size:12px;margin-bottom:8px}
table{width:100%;border-collapse:collapse;font-size:12px;margin:4px 0 8px}td{padding:3px 6px;border-bottom:1px solid #ddd}.r{text-align:right;font-variant-numeric:tabular-nums}
tr.emph td{font-weight:700;border-bottom:1px solid #999}
.warn{background:#fff3f3;border:1px solid #f0616d;padding:10px 12px;border-radius:6px;color:#7a1620;margin:12px 0;font-size:12px}
.disc{margin-top:22px;font-size:10.5px;color:#666;border-top:1px solid #ccc;padding-top:10px}</style></head>
<body><h1>${esc(rep.company.name)} — Quarterly Financial Report</h1>
<div class="meta">${esc(rep.quarter)} · ${esc(rep.company.ticker)} · ${esc(rep.company.sector)} · figures in ${esc(rep.company.unitLabel)}</div>
<div class="warn"><b>SYNTHETIC — NOT A SET OF ACCOUNTS.</b> Every figure is fictional and generated deterministically for demonstration. This is not an audited statement or a financial system of record.</div>
<h2>P&amp;L summary</h2><table><thead><tr><td>Line item</td><td class="r">Amount</td><td class="r">% rev</td></tr></thead><tbody>${pnlRows}</tbody></table>
<h2>Cash-flow waterfall (opening → closing)</h2><table><thead><tr><td>Step</td><td class="r">Change</td><td class="r">Running cash</td></tr></thead><tbody>${cfRows}</tbody></table>
<h2>Revenue by segment</h2><table><thead><tr><td>Segment</td><td class="r">Revenue</td><td class="r">Share</td></tr></thead><tbody>${segRows}</tbody></table>
${yoy && yoy.available ? `<h2>Year-on-year vs ${esc(yoy.priorQuarter)}</h2><table><thead><tr><td>Metric</td><td class="r">${esc(rep.quarter)}</td><td class="r">${esc(yoy.priorQuarter)}</td><td class="r">Change</td></tr></thead><tbody>${yoyRows}</tbody></table>` : ''}
<h2>Expense breakdown</h2><table><thead><tr><td>Category</td><td class="r">Amount</td><td class="r">% of revenue</td></tr></thead><tbody>${exRows}</tbody></table>
<div class="disc">${esc(rep.disclaimer)}</div></body></html>`);
  w.document.close();
  try { w.focus(); w.print(); } catch { /* non-fatal */ }
}
