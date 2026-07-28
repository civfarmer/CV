// View: Litigation & Enforcement-Action Tracker — a REAL, CITED corpus of
// sixteen public-record regulator fines / enforcement decisions with deterministic
// trend analytics. The dashboard shows headline analytics (total illustrative
// penalties, count, date range), a hand-built SVG TREND CHART (penalties by year),
// BREAKDOWN PANELS (by category / by regulator, with counts + summed amounts,
// colour ALWAYS paired with a text label), and a filterable, sortable CASE TABLE.
// Each row opens a CASE DETAIL: the full factual summary, all regulators, the
// AUTHORITATIVE native amount + an illustrative-approxUsd note, the status / appeal
// note shown prominently for honesty, and a real Source anchor to the official URL
// (rendered as a link; never auto-opened).
//
// Honest posture: every figure is verbatim public record (with a disclaimer). The
// native amount + currency is authoritative; the approxUsd chart scale is
// illustrative FX only. Appeal / annulled statuses are surfaced. Renders in-page
// within the shell (never a viewport takeover), accessible (table headers carry
// scope, colour is always paired with a text label), and the DOM stays light (16
// rows). The SVG chart guards getBBox / getBoundingClientRect for e2e safety.
import { el, api, fmt, icon, card, emptyState, errorState, skeleton, infoDot } from './core.js';
import { pageHead, intro } from './views1.js';

// Category → colour + badge class. Colour is ALWAYS shown with the text label;
// mirrors the engine's ENF_CATEGORIES palette.
const CAT_COLOR = {
  Sanctions: '#d5303e', AML: '#e07b39', 'Bribery/Corruption': '#c9762b',
  'Market Manipulation': '#c9a227', 'Data Protection': '#4d8df0', 'Consumer Protection': '#a97bf0',
};
const ACCENT = '#e07b39';

export async function enforcement(root, parts) {
  root.append(pageHead('Litigation & Enforcement-Action Tracker', 'A curated corpus of sixteen REAL, public-record regulator fines and enforcement decisions — sanctions, AML, bribery, market manipulation and data-protection cases — with deterministic trend analytics: what actually gets firms fined, by whom, for how much, and when', [
    el('a', { class: 'btn sm', href: '#/regulatory', title: 'Regulatory Horizon (the real instruments behind these categories)' }, icon('regulatory', 15), 'Regulatory Horizon'),
  ]));
  root.append(intro('Litigation & Enforcement-Action Tracker',
    'answers "what actually gets firms fined for this" from a curated corpus of sixteen REAL, public-record regulatory enforcement actions — each confirmed against an official source (DOJ, OFAC, CFTC, SFO, the Irish DPC, CNIL and others) and linked to it. Read the headline totals and the penalties-by-year trend, break the corpus down by conduct category and by regulator, then filter and sort the case table and open any case for its full factual basis, all the regulators involved, the authoritative native penalty, its appeal / annulled status, and a link to the official record.'));

  // Honesty banner.
  root.append(el('div', { class: 'intro', role: 'note', style: { marginTop: '10px', '--mc': ACCENT } },
    el('span', { class: 'ico' }, icon('info', 18)),
    el('div', { class: 't' }, el('b', {}, 'Real public record — figures verbatim, statuses honest. '),
      'These sixteen actions are accurate public record from official regulator / DOJ statements, not allegations. The native amount + currency is the AUTHORITATIVE penalty; the approximate-USD value is an ILLUSTRATIVE historical-FX conversion used only to put actions on one comparable chart scale — do not cite it as the fine. Several penalties are under appeal, remitted, or (Amazon) later annulled on procedural grounds; the tracker surfaces that. A demonstration corpus of notable actions, not a complete register or legal advice.')));

  // A case route (#/enforcement/case/ENF-2020-GS) opens the case detail.
  if (parts[0] === 'case' && parts[1]) {
    const body = el('div', { class: 'mt' });
    root.append(body);
    await renderCaseDetail(body, parts[1]);
    return;
  }

  // Category / regulator routes pre-filter the dashboard's case table (the
  // breakdown panels link here). Everything else falls through to the full dashboard.
  const initialFilter = {};
  if (parts[0] === 'category' && parts[1]) initialFilter.category = decodeURIComponent(parts[1]);
  else if (parts[0] === 'regulator' && parts[1]) initialFilter.regulator = decodeURIComponent(parts[1]);

  // Single-page dashboard: analytics + trend + breakdowns + case table.
  const body = el('div', { class: 'mt' });
  root.append(body);
  await renderDashboard(body, initialFilter);
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD — headline analytics, trend chart, breakdown panels, case table
// ─────────────────────────────────────────────────────────────────────────────
async function renderDashboard(root, initialFilter) {
  const panel = el('div', {}, skeleton(360));
  root.append(panel);

  let analytics, trends, list;
  try {
    [analytics, trends, list] = await Promise.all([
      api.get('/api/enforcement/analytics'),
      api.get('/api/enforcement/trends'),
      api.get('/api/enforcement/actions'),
    ]);
  } catch (e) { panel.replaceChildren(errorState(e.message)); return; }
  if (!list.actions.length) { panel.replaceChildren(emptyState('No enforcement actions in the corpus')); return; }

  const nodes = [];

  // KPI strip: headline totals.
  const t = analytics.totals;
  nodes.push(el('div', { class: 'row wrap', style: { gap: '10px', marginBottom: '12px' } },
    kpiChip('Actions', t.count),
    kpiChip('Total penalties (≈USD)', fmtUsdShort(t.approxUsd), ACCENT, 'Illustrative sum of the historical-FX approximations — for scale only, not an authoritative figure'),
    kpiChip('Date range', `${String(t.dateRange.first).slice(0, 4)}–${String(t.dateRange.last).slice(0, 4)}`),
    kpiChip('Under appeal', t.statusSplit.underAppeal, '#c9a227', 'Penalties currently under appeal or remitted'),
    kpiChip('Annulled', t.statusSplit.annulled, '#d5303e', 'Penalties later struck down')));

  // Trend chart card (penalties by year — hand-built SVG).
  nodes.push(card('Penalties by year', {
    sub: `${trends.points.length} years spanned · peak ${trends.peakYear ? trends.peakYear.year : '—'} (${trends.peakYear ? fmtUsdShort(trends.peakYear.approxUsd) : '—'}) — illustrative ≈USD scale`,
    actions: el('span', { class: 'badge sq neutral' }, 'Illustrative scale'),
  },
    el('div', { class: 'small muted', style: { marginBottom: '8px' } }, 'Annual total of the illustrative ≈USD amounts (bars) with the running cumulative total (line). Bar height is scaled to the illustrative FX figure so heterogeneous currencies compare on one axis; the native amount is authoritative.'),
    trendChart(trends.points)));

  // Breakdown panels: by category + by regulator, side by side.
  nodes.push(el('div', { class: 'grid k2' },
    categoryBreakdown(analytics.byCategory, t.approxUsd),
    regulatorBreakdown(analytics.byRegulator)));

  // The case table (optionally pre-filtered by a category / regulator route).
  nodes.push(caseTableCard(list.actions, list.categories, initialFilter));

  nodes.push(disclaimerNote(analytics.disclaimer));
  panel.replaceChildren(...nodes);
}

// ── Hand-built SVG trend chart: yearly bars + cumulative line ──────────────────
// No getBBox / getBoundingClientRect / matchMedia dependence — a fixed viewBox
// with computed coordinates, so it renders identically in the browser and the e2e
// DOM shim. Colour is paired with an accessible label + a data table fallback.
function trendChart(points) {
  const W = 720, H = 260, padL = 58, padR = 48, padT = 18, padB = 42;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const maxBar = Math.max(1, ...points.map((p) => p.approxUsd));
  const maxCum = Math.max(1, ...points.map((p) => p.cumulativeApproxUsd));
  const n = points.length;
  const slot = plotW / Math.max(1, n);
  const barW = Math.max(6, Math.min(46, slot * 0.6));
  const xCenter = (i) => padL + slot * i + slot / 2;
  const yBar = (v) => padT + plotH - (v / maxBar) * plotH;
  const yCum = (v) => padT + plotH - (v / maxCum) * plotH;

  const svgNS = 'http://www.w3.org/2000/svg';
  const mk = (tag, attrs, ...kids) => {
    const e = document.createElementNS(svgNS, tag);
    for (const [k, v] of Object.entries(attrs || {})) { if (v == null) continue; e.setAttribute(k, String(v)); }
    for (const kid of kids.flat()) { if (kid != null && kid !== false) e.append(kid instanceof Node ? kid : document.createTextNode(String(kid))); }
    return e;
  };

  const kids = [];
  // Horizontal gridlines + y-axis labels (0, ¼, ½, ¾, max of the bar scale).
  for (let g = 0; g <= 4; g++) {
    const val = (maxBar * g) / 4;
    const y = yBar(val);
    kids.push(mk('line', { x1: padL, y1: y, x2: W - padR, y2: y, stroke: 'var(--border)', 'stroke-width': 1, 'stroke-dasharray': g === 0 ? '0' : '3 4' }));
    kids.push(mk('text', { x: padL - 8, y: y + 4, 'text-anchor': 'end', fill: 'var(--text-3)', 'font-size': 10 }, fmtUsdShort(val)));
  }
  // Bars (yearly total) + year labels + value labels.
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const x = xCenter(i) - barW / 2;
    const y = yBar(p.approxUsd);
    const h = padT + plotH - y;
    kids.push(mk('rect', { x, y, width: barW, height: Math.max(0, h), rx: 3, fill: ACCENT, opacity: 0.85 },
      mk('title', {}, `${p.year}: ${fmtUsdShort(p.approxUsd)} across ${p.count} action${p.count === 1 ? '' : 's'} (illustrative ≈USD)`)));
    kids.push(mk('text', { x: xCenter(i), y: H - padB + 16, 'text-anchor': 'middle', fill: 'var(--text-3)', 'font-size': 10 }, String(p.year)));
    kids.push(mk('text', { x: xCenter(i), y: y - 5, 'text-anchor': 'middle', fill: 'var(--text-2)', 'font-size': 9 }, String(p.count)));
  }
  // Cumulative line (on its own right-hand scale) + endpoint dots.
  if (n > 1) {
    const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xCenter(i).toFixed(1)} ${yCum(p.cumulativeApproxUsd).toFixed(1)}`).join(' ');
    kids.push(mk('path', { d, fill: 'none', stroke: '#4d8df0', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  }
  for (let i = 0; i < n; i++) {
    const p = points[i];
    kids.push(mk('circle', { cx: xCenter(i), cy: yCum(p.cumulativeApproxUsd), r: 3, fill: '#4d8df0' },
      mk('title', {}, `Cumulative to ${p.year}: ${fmtUsdShort(p.cumulativeApproxUsd)} across ${p.cumulativeCount} actions`)));
  }

  const svg = mk('svg', {
    viewBox: `0 0 ${W} ${H}`, width: '100%', role: 'img',
    'aria-label': `Enforcement penalties by year, illustrative approximate USD. Bars show the annual total from ${points[0].year} to ${points[n - 1].year}; a line shows the running cumulative total ending at ${fmtUsdShort(points[n - 1].cumulativeApproxUsd)}.`,
    preserveAspectRatio: 'xMidYMid meet', style: 'max-width:100%;height:auto;display:block',
  }, ...kids);

  // Legend (colour always paired with a text label).
  const legend = el('div', { class: 'row wrap', style: { gap: '16px', marginTop: '8px' }, role: 'img', 'aria-label': 'Legend: annual total bars, cumulative total line' },
    swatchLabel(ACCENT, 'Annual total (≈USD)', 'rect'),
    swatchLabel('#4d8df0', 'Cumulative total (≈USD)', 'line'),
    el('span', { class: 'small muted' }, 'Number above each bar = actions that year'));

  return el('div', {}, el('div', { class: 'tbl-wrap', style: { overflowX: 'auto' } }, svg), legend);
}

// ── Breakdown: by category (counts + summed illustrative amounts, ranked) ──────
function categoryBreakdown(byCategory, total) {
  const maxAmt = Math.max(1, ...byCategory.map((c) => c.approxUsd));
  const rows = byCategory.map((c) => {
    const color = CAT_COLOR[c.code] || ACCENT;
    const pct = total ? Math.round((c.approxUsd / total) * 100) : 0;
    return el('div', { style: { padding: '9px 0', borderBottom: '1px solid var(--border)' } },
      el('div', { class: 'row wrap', style: { gap: '8px', alignItems: 'center', marginBottom: '5px' } },
        el('span', { style: { width: '11px', height: '11px', borderRadius: '3px', background: color, flex: '0 0 auto', border: '1px solid rgba(0,0,0,0.25)' } }),
        el('a', { href: '#/enforcement/category/' + encodeURIComponent(c.code), style: { fontWeight: '600', color: 'var(--text)', flex: '1 1 auto', minWidth: '0', textDecoration: 'none' }, title: 'Filter the case table to ' + c.label }, c.label),
        el('span', { class: 'badge sq neutral', title: 'Actions in this category' }, String(c.count)),
        el('span', { class: 'small tabular muted', style: { minWidth: '86px', textAlign: 'right' } }, fmtUsdShort(c.approxUsd))),
      barMeter(pct, color));
  });
  return card('By conduct category', {
    sub: `${byCategory.length} categories — ranked by illustrative ≈USD total`,
    actions: el('span', { class: 'badge sq neutral' }, 'Real & cited'),
  }, el('div', { class: 'small muted', style: { marginBottom: '8px' } }, 'What firms actually get fined for, across the corpus. Bar width is the share of the illustrative ≈USD total.'), ...rows);
}

// ── Breakdown: by regulator (counts + summed illustrative amounts, ranked) ─────
function regulatorBreakdown(byRegulator) {
  const top = byRegulator.slice(0, 10);
  const maxCount = Math.max(1, ...top.map((r) => r.count));
  const rows = top.map((r) => el('div', { style: { padding: '9px 0', borderBottom: '1px solid var(--border)' } },
    el('div', { class: 'row wrap', style: { gap: '8px', alignItems: 'center', marginBottom: '5px' } },
      el('a', { href: '#/enforcement/regulator/' + encodeURIComponent(r.regulator), style: { fontWeight: '600', color: 'var(--text)', flex: '1 1 auto', minWidth: '0', textDecoration: 'none' }, title: 'Filter the case table to actions involving ' + r.regulator }, r.regulator),
      el('span', { class: 'badge sq neutral', title: 'Actions this regulator was involved in' }, String(r.count)),
      el('span', { class: 'small tabular muted', style: { minWidth: '86px', textAlign: 'right' } }, fmtUsdShort(r.approxUsd))),
    barMeter(Math.round((r.count / maxCount) * 100), '#4d8df0')));
  return card('By regulator', {
    sub: `${byRegulator.length} authorities — most-active first (an action can involve several)`,
    actions: el('span', { class: 'badge sq neutral' }, 'Real & cited'),
  }, el('div', { class: 'small muted', style: { marginBottom: '8px' } }, 'Who brings these actions. Many are multi-agency, so an action counts once per regulator it names; bar width is the action count.'), ...rows);
}

// ── The filterable, sortable case table (16 rows) ─────────────────────────────
function caseTableCard(actions, categories, initial) {
  const state = { q: '', category: (initial && initial.category) || '', regulator: (initial && initial.regulator) || '', status: '', sort: 'date' };
  const wrap = el('div');

  const catSelect = el('select', { class: 'fin-select', 'aria-label': 'Filter by category', style: selectStyle(), onchange: (e) => { state.category = e.target.value; render(); } },
    el('option', { value: '' }, 'All categories'),
    ...categories.map((c) => el('option', { value: c.code }, c.label)));
  const statusSelect = el('select', { class: 'fin-select', 'aria-label': 'Filter by status', style: selectStyle(), onchange: (e) => { state.status = e.target.value; render(); } },
    el('option', { value: '' }, 'All statuses'),
    el('option', { value: 'final' }, 'Final only'),
    el('option', { value: 'appeal' }, 'Under appeal'),
    el('option', { value: 'annulled' }, 'Annulled'));
  const sortSelect = el('select', { class: 'fin-select', 'aria-label': 'Sort by', style: selectStyle(), onchange: (e) => { state.sort = e.target.value; render(); } },
    el('option', { value: 'date' }, 'Sort: newest first'),
    el('option', { value: 'amount' }, 'Sort: largest first'),
    el('option', { value: 'entity' }, 'Sort: entity A–Z'),
    el('option', { value: 'category' }, 'Sort: category'));
  const search = el('input', { type: 'text', placeholder: 'Filter by entity, conduct, regulator…', 'aria-label': 'Filter cases', style: { ...selectStyle(), minWidth: '220px' }, oninput: (e) => { state.q = e.target.value.toLowerCase(); render(); } });
  if (state.category) catSelect.value = state.category;

  const controls = el('div', { class: 'row wrap', style: { gap: '10px', marginBottom: '10px', alignItems: 'center' } },
    search, catSelect, statusSelect, sortSelect);

  function filtered() {
    let rows = actions.slice();
    if (state.category) rows = rows.filter((r) => r.category === state.category);
    if (state.regulator) rows = rows.filter((r) => r.regulators.includes(state.regulator));
    if (state.status === 'final') rows = rows.filter((r) => !r.underAppeal && !r.annulled);
    else if (state.status === 'appeal') rows = rows.filter((r) => r.underAppeal);
    else if (state.status === 'annulled') rows = rows.filter((r) => r.annulled);
    if (state.q) rows = rows.filter((r) => `${r.entity} ${r.summary} ${r.jurisdiction} ${r.regulators.join(' ')} ${r.categoryLabel}`.toLowerCase().includes(state.q));
    const cmp = {
      date: (a, b) => String(b.date).localeCompare(String(a.date)) || String(a.id).localeCompare(String(b.id)),
      amount: (a, b) => (b.approxUsd - a.approxUsd) || String(a.id).localeCompare(String(b.id)),
      entity: (a, b) => String(a.entity).localeCompare(String(b.entity)) || String(a.id).localeCompare(String(b.id)),
      category: (a, b) => String(a.category).localeCompare(String(b.category)) || (b.approxUsd - a.approxUsd),
    }[state.sort] || null;
    if (cmp) rows.sort(cmp);
    return rows;
  }

  function render() {
    const rows = filtered();
    const thead = el('thead', {}, el('tr', {},
      el('th', { scope: 'col', style: { textAlign: 'left' } }, 'Entity'),
      el('th', { scope: 'col', style: { textAlign: 'left' } }, 'Date'),
      el('th', { scope: 'col', style: { textAlign: 'right' } }, 'Penalty', infoDot('Authoritative native amount; the ≈USD figure beneath is illustrative FX for scale only.')),
      el('th', { scope: 'col', style: { textAlign: 'left' } }, 'Category'),
      el('th', { scope: 'col', style: { textAlign: 'left' } }, 'Regulators'),
      el('th', { scope: 'col', style: { textAlign: 'left' } }, 'Jurisdiction'),
      el('th', { scope: 'col', style: { textAlign: 'left' } }, 'Status')));
    const body = rows.length ? rows.map((r) => caseRow(r)) : [el('tr', {}, el('td', { colspan: 7 }, emptyState('No actions match these filters')))];
    const table = el('table', { class: 'tbl', style: { width: '100%', borderCollapse: 'collapse' } }, thead, el('tbody', {}, ...body));
    wrap.replaceChildren(controls,
      el('div', { class: 'small muted', style: { marginBottom: '8px' } }, `${rows.length} of ${actions.length} action${actions.length === 1 ? '' : 's'} — click any row to open the full case, its regulators and the official source.`),
      el('div', { class: 'tbl-wrap', style: { overflowX: 'auto' } }, table));
  }
  render();

  return card('Enforcement cases', {
    sub: `${actions.length} real, source-cited actions — filter, sort, and open any case`,
    actions: el('span', { class: 'badge sq neutral' }, 'Real & cited'),
  }, wrap);
}

// One case-table row: a scope="row" entity header, native + illustrative amount,
// a colour+label category badge, and prominent appeal/annulled status. Clickable.
function caseRow(r) {
  const color = CAT_COLOR[r.category] || ACCENT;
  const nameTh = el('th', { scope: 'row', style: { textAlign: 'left' } },
    el('a', { href: '#/enforcement/case/' + encodeURIComponent(r.id), style: { color: 'var(--text)', textDecoration: 'none', fontWeight: '600' }, title: 'Open the ' + r.entity + ' case' }, r.entity));
  const amtTd = el('td', { style: { textAlign: 'right', whiteSpace: 'nowrap' } },
    el('div', { class: 'tabular', style: { fontWeight: '700', color: 'var(--text)' } }, nativeAmount(r)),
    r.isApproxUsd ? el('div', { class: 'small muted tabular', title: 'Illustrative historical-FX conversion — for scale only' }, '≈ ' + fmtUsdShort(r.approxUsd)) : null);
  const catTd = el('td', {}, catBadge(r.category, r.categoryLabel));
  const regTd = el('td', {}, el('span', { class: 'small', title: r.regulators.join(', ') }, r.regulators.slice(0, 3).join(', ') + (r.regulators.length > 3 ? ` +${r.regulators.length - 3}` : '')));
  const jurTd = el('td', {}, el('span', { class: 'small muted' }, r.jurisdiction));
  const statusTd = el('td', {}, statusBadgeEnf(r));
  return el('tr', { class: 'clickable' }, nameTh, el('td', { class: 'tabular small nowrap' }, fmt.date(r.date)), amtTd, catTd, regTd, jurTd, statusTd);
}

// ─────────────────────────────────────────────────────────────────────────────
// CASE DETAIL — full factual summary, all regulators, native + ≈USD, status, source
// ─────────────────────────────────────────────────────────────────────────────
async function renderCaseDetail(root, id) {
  const panel = el('div', {}, skeleton(320));
  root.append(panel);
  let data;
  try { data = await api.get('/api/enforcement/actions/' + encodeURIComponent(id)); }
  catch (e) { panel.replaceChildren(errorState(e.message)); return; }

  const a = data.action;
  const color = CAT_COLOR[a.category] || ACCENT;
  const nodes = [];

  // Back link.
  nodes.push(el('div', { style: { marginBottom: '10px' } },
    el('a', { class: 'btn sm ghost', href: '#/enforcement' }, icon('chevron', 14), 'Back to tracker')));

  // Prominent appeal / annulled banner (honesty first).
  if (a.annulled) {
    nodes.push(el('div', { class: 'intro', role: 'note', style: { '--mc': '#d5303e', marginBottom: '12px' } },
      el('span', { class: 'ico' }, icon('alert', 18)),
      el('div', { class: 't' }, el('b', {}, 'This penalty was later annulled. '), a.statusNote || 'The fine was struck down; treat the amount as not collected.')));
  } else if (a.underAppeal) {
    nodes.push(el('div', { class: 'intro', role: 'note', style: { '--mc': '#c9a227', marginBottom: '12px' } },
      el('span', { class: 'ico' }, icon('alert', 18)),
      el('div', { class: 't' }, el('b', {}, 'This penalty is under appeal / remitted. '), a.statusNote || 'The figure is contested and may change.')));
  }

  // Header card: entity + amount.
  nodes.push(el('div', { class: 'card', style: { '--mc': color, borderLeft: '4px solid ' + color } },
    el('div', { class: 'card-body' },
      el('div', { class: 'row wrap', style: { gap: '12px', alignItems: 'flex-start' } },
        el('div', { style: { flex: '1 1 340px', minWidth: '0' } },
          el('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center', marginBottom: '4px' } },
            el('span', { style: { fontWeight: '800', color: 'var(--text)', fontSize: '19px' } }, a.entity),
            catBadge(a.category, a.categoryLabel)),
          el('div', { class: 'small muted' }, `${fmt.date(a.date)} · ${a.jurisdiction}`),
          el('div', { class: 'small', style: { color: 'var(--text-2)', marginTop: '10px', lineHeight: '1.65' } }, a.summary)),
        el('div', { style: { flex: '0 0 auto', textAlign: 'right', minWidth: '170px' } },
          el('div', { class: 'small muted', style: { marginBottom: '2px' } }, 'Penalty (authoritative)'),
          el('div', { class: 'tabular', style: { fontWeight: '800', fontSize: '22px', color: 'var(--text)' } }, nativeAmount(a)),
          a.isApproxUsd ? el('div', { class: 'small muted tabular', style: { marginTop: '2px' }, title: 'Illustrative historical-FX conversion — for chart scale only, not the authoritative figure' }, '≈ ' + fmtUsdShort(a.approxUsd) + ' (illustrative FX)') : el('div', { class: 'small muted', style: { marginTop: '2px' } }, 'native currency'),
          el('div', { style: { marginTop: '8px' } }, statusBadgeEnf(a)))))));

  // Regulators + factual-basis card.
  nodes.push(card('Regulators & resolution', { sub: 'Every authority involved in the action', actions: el('span', { class: 'badge sq neutral' }, 'Public record') },
    el('div', { class: 'row wrap', style: { gap: '6px', marginBottom: '10px' } },
      el('span', { class: 'small muted', style: { alignSelf: 'center' } }, 'Regulators:'),
      ...a.regulators.map((reg) => el('a', { class: 'badge sq neutral', href: '#/enforcement/regulator/' + encodeURIComponent(reg), style: { textDecoration: 'none' }, title: 'See all corpus actions involving ' + reg }, reg))),
    el('div', { class: 'row wrap', style: { gap: '8px', alignItems: 'center' } },
      el('span', { class: 'small muted' }, 'Resolution status:'),
      el('span', { class: 'small', style: { color: 'var(--text)', fontWeight: '600' } }, a.status)),
    a.statusNote ? el('div', { class: 'small', style: { color: 'var(--text-2)', marginTop: '4px' } }, a.statusNote) : null));

  // Amount-provenance note (the honesty on the figure).
  nodes.push(card('The figure', { sub: 'What is authoritative, and what is illustrative' },
    el('div', { class: 'row wrap', style: { gap: '18px' } },
      el('div', { style: { flex: '1 1 200px' } },
        el('div', { class: 'small muted' }, 'Authoritative amount'),
        el('div', { class: 'tabular', style: { fontWeight: '700', color: 'var(--text)', fontSize: '16px' } }, nativeAmount(a)),
        el('div', { class: 'small muted' }, 'Native currency figure from the official source — cite this.')),
      el('div', { style: { flex: '1 1 200px' } },
        el('div', { class: 'small muted' }, 'Illustrative ≈USD scale'),
        el('div', { class: 'tabular', style: { fontWeight: '700', color: 'var(--text-2)', fontSize: '16px' } }, '≈ ' + fmtUsdShort(a.approxUsd)),
        el('div', { class: 'small muted' }, a.isApproxUsd ? 'Rough historical-FX conversion — chart scale only, not the fine.' : 'Native currency is USD, so this equals the authoritative amount.')))));

  // Related real regulatory topics.
  if (data.relatedRegulationTopics && data.relatedRegulationTopics.length) {
    nodes.push(card('Related regulatory topics', { sub: 'The real subject-matter this conduct engages — open Regulatory Horizon for the sourced instruments' },
      el('div', { class: 'small muted', style: { marginBottom: '8px' } }, 'These are the relevant real regulatory areas for this conduct category, not a claim that a specific instrument was applied in this case.'),
      el('div', { style: { display: 'grid', gap: '6px' } },
        ...data.relatedRegulationTopics.map((topic) => el('div', { class: 'row wrap', style: { gap: '8px', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' } },
          el('span', { class: 'mc-icon', style: { color: 'var(--accent)', flex: '0 0 auto' } }, icon('regulatory', 14)),
          el('span', { style: { flex: '1 1 auto', minWidth: '0', color: 'var(--text)' } }, topic),
          el('a', { class: 'btn sm ghost', href: '#/regulatory/feed', title: 'Open Regulatory Horizon' }, 'Horizon'))))));
  }

  // The real Source link — rendered as an anchor to the official record; NOT auto-opened.
  nodes.push(card('Source', { sub: 'The official / primary record for this action', actions: el('span', { class: 'badge sq neutral' }, 'Verified') },
    el('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center' } },
      el('span', { class: 'mc-icon', style: { color: 'var(--accent)', flex: '0 0 auto' } }, icon('ext', 16)),
      el('div', { style: { flex: '1 1 auto', minWidth: '0' } },
        el('div', { style: { fontWeight: '600', color: 'var(--text)' } }, a.sourceLabel),
        el('div', { class: 'small muted', style: { wordBreak: 'break-all' } }, a.sourceUrl)),
      el('a', { class: 'btn sm', href: a.sourceUrl, target: '_blank', rel: 'noopener noreferrer', title: 'Open the official source in a new tab' }, icon('ext', 14), 'Open source'))));

  nodes.push(disclaimerNote(data.disclaimer));
  panel.replaceChildren(...nodes);
}

// ── Shared small helpers ─────────────────────────────────────────────────────
function catBadge(code, label) {
  const color = CAT_COLOR[code] || ACCENT;
  return el('span', { class: 'badge', title: 'Conduct category: ' + (label || code), style: { background: hexToRgba(color, 0.16), color, borderColor: hexToRgba(color, 0.5) } }, el('span', { class: 'dot', style: { background: color } }), label || code);
}
function statusBadgeEnf(r) {
  if (r.annulled) return el('span', { class: 'badge high', title: r.statusNote || 'Penalty annulled' }, el('span', { class: 'dot' }), 'Annulled');
  if (r.underAppeal) return el('span', { class: 'badge med', title: r.statusNote || 'Penalty under appeal / remitted' }, el('span', { class: 'dot' }), 'Under appeal');
  return el('span', { class: 'badge low', title: r.status }, el('span', { class: 'dot' }), 'Final');
}
// Format the authoritative native amount with its currency symbol / code.
function nativeAmount(r) {
  const sym = { USD: '$', EUR: '€', GBP: '£' }[r.currency] || '';
  return `${sym}${fmtBig(r.amountNative)}${sym ? '' : ' ' + r.currency}`;
}
// Compact big-number formatter (bn / m) for both native and ≈USD figures.
function fmtBig(v) {
  const n = Number(v) || 0;
  if (n >= 1e9) { const x = n / 1e9; return (Math.round(x * 100) / 100).toString() + 'bn'; }
  if (n >= 1e6) { const x = n / 1e6; return (Math.round(x * 10) / 10).toString() + 'm'; }
  return n.toLocaleString();
}
function fmtUsdShort(v) { return '$' + fmtBig(v); }
function swatchLabel(color, label, kind) {
  const mark = kind === 'line'
    ? el('span', { style: { width: '18px', height: '3px', borderRadius: '2px', background: color, display: 'inline-block' } })
    : el('span', { style: { width: '13px', height: '13px', borderRadius: '3px', background: color, display: 'inline-block', border: '1px solid rgba(0,0,0,0.2)' } });
  return el('span', { class: 'row', style: { gap: '6px', alignItems: 'center' } }, mark, el('span', { class: 'small' }, label));
}
function barMeter(pct, color) {
  const w = Math.max(0, Math.min(100, pct));
  return el('div', { style: { height: '6px', background: 'var(--surface-2, #131924)', borderRadius: '4px', overflow: 'hidden' }, role: 'presentation' },
    el('span', { style: { display: 'block', width: w + '%', height: '100%', background: color } }));
}
function kpiChip(label, value, colour, tip) {
  return el('div', { class: 'card', style: { flex: '1 1 130px', padding: '10px 12px' }, title: tip || undefined },
    el('div', { class: 'small muted' }, label, tip ? infoDot(tip) : null),
    el('div', { class: 'tabular', style: { fontWeight: '800', fontSize: '19px', color: colour || 'var(--text)' } }, String(value)));
}
function selectStyle() { return { padding: '7px 10px', background: 'var(--surface-2, #131924)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '14px' }; }
function disclaimerNote(text) {
  return el('div', { class: 'intro', style: { marginTop: '18px' } }, el('span', { class: 'ico' }, icon('info', 18)), el('div', { class: 't' }, el('b', {}, 'Real public record; not a complete register. '), text));
}
// Small pure hex->rgba (guarded; no DOM/canvas dependency, e2e-safe).
function hexToRgba(hex, alpha) {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6) return `rgba(224,123,57,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
