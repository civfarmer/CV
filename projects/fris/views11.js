// View: Market-Abuse / Trade Surveillance — a surveillance dashboard over a 100%
// SYNTHETIC order book with EXPLAINABLE MAR-style detectors. The dashboard shows
// alert KPIs (by type / by severity), a filterable ALERT QUEUE (type, severity,
// instrument, subjects/free-text) and, on any alert, an ALERT DETAIL with a
// plain-English rationale, a hand-built vertical EVIDENCE TIMELINE (the ordered
// sequence of events that triggered it), the INSIDER-LIST cross-check result and a
// hand-built SVG ORDER-BOOK / price MICRO-VIZ for the instrument (for spoofing it
// draws the placed-then-cancelled layers vs the genuine fill). A separate insider-
// list view surfaces the fictional insider list and which entries raised an alert.
//
// Honest posture: every subject/instrument/announcement is FICTIONAL and every
// alert is illustrative demonstration output, not a factual accusation (disclaimer
// shown). The detector LOGIC mirrors real MAR / Dodd-Frank / CEA typologies. Renders
// in-page within the shell (never a viewport takeover), accessible (table headers
// carry scope, colour is ALWAYS paired with a text label), DOM-light (a handful of
// alerts). The SVG micro-viz uses a fixed viewBox with computed coordinates and
// guards getBBox / getBoundingClientRect for e2e safety.
import { el, api, fmt, icon, card, emptyState, errorState, skeleton, infoDot } from './core.js';
import { pageHead, intro } from './views1.js';

// Typology + severity → colour (ALWAYS paired with the text label). Mirrors the
// engine's ALERT_TYPES / SEVERITIES palettes.
const TYPE_COLOR = { 'insider-dealing': '#a97bf0', spoofing: '#e0a52b', 'wash-trading': '#4d8df0' };
const SEV_COLOR = { High: '#d5303e', Medium: '#e0a52b', Low: '#4d8df0' };
const ACCENT = '#5bbfb5'; // a teal accent, distinct from the other modules

export async function surveillance(root, parts) {
  root.append(pageHead('Market-Abuse / Trade Surveillance', 'Market Abuse Regulation (MAR)-style market-abuse detection over a fully SYNTHETIC order book — insider dealing, spoofing / layering and wash trading — each alert explained, with an evidence timeline and an insider-list cross-check. The detector logic mirrors real regulatory typologies; every datum is fictional', [
    el('a', { class: 'btn sm', href: '#/surveillance/insiders', title: 'The fictional insider list + which entries raised an alert' }, icon('eye', 15), 'Insider list'),
    el('a', { class: 'btn sm ghost', href: '#/enforcement', title: 'Litigation & Enforcement-Action Tracker (real market-abuse fines)' }, icon('scale', 15), 'Enforcement'),
  ]));
  root.append(intro('Market-Abuse / Trade Surveillance',
    'runs deterministic, EXPLAINABLE market-abuse detectors over a fictional order book on a fictional venue (NEXUS-MTF). It flags three real typologies — insider dealing (a trader on the insider list dealing an issuer inside the need-to-know window, ahead of a favourable announcement), spoofing / layering (large orders placed then cancelled to move the price, while trading genuinely on the other side), and wash trading (self-matching trades between related accounts that manufacture volume with no change in ownership). Read the alert KPIs, filter the alert queue by typology, severity, instrument or subject, then open any alert for its plain-English rationale, an ordered evidence timeline, the insider-list cross-check and a small order-book micro-viz. Every subject, instrument and announcement is invented; the alerts are illustrative, not accusations.'));

  // Honesty banner.
  root.append(el('div', { class: 'intro', role: 'note', style: { marginTop: '10px', '--mc': ACCENT } },
    el('span', { class: 'ico' }, icon('info', 18)),
    el('div', { class: 't' }, el('b', {}, 'Fully synthetic — detector logic real, data fabricated. '),
      'The order book, trader / desk / account IDs, issuers, insider list and announcements are all FICTIONAL. No real person and no real listed company is the subject of any alert. The detectors mirror real MAR / Dodd-Frank / CEA market-abuse typologies (legitimate public methodology), but every datum is invented and every alert is illustrative demonstration output, not a factual accusation. Not a trade-surveillance system of record and not legal advice.')));

  // Insider-list sub-view.
  if (parts[0] === 'insiders') {
    const body = el('div', { class: 'mt' });
    root.append(body);
    await renderInsiderList(body);
    return;
  }

  // An alert route (#/surveillance/alert/SURV-ID-IN-01) opens the alert detail.
  if (parts[0] === 'alert' && parts[1]) {
    const body = el('div', { class: 'mt' });
    root.append(body);
    await renderAlertDetail(body, parts[1]);
    return;
  }

  // Type / severity routes pre-filter the dashboard's alert queue.
  const initialFilter = {};
  if (parts[0] === 'type' && parts[1]) initialFilter.type = decodeURIComponent(parts[1]);
  else if (parts[0] === 'severity' && parts[1]) initialFilter.severity = decodeURIComponent(parts[1]);

  const body = el('div', { class: 'mt' });
  root.append(body);
  await renderDashboard(body, initialFilter);
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD — KPIs, by-type / by-severity breakdown, filterable alert queue
// ─────────────────────────────────────────────────────────────────────────────
async function renderDashboard(root, initialFilter) {
  const panel = el('div', {}, skeleton(360));
  root.append(panel);

  let queue;
  try { queue = await api.get('/api/surveillance/alerts'); }
  catch (e) { panel.replaceChildren(errorState(e.message)); return; }
  if (!queue.alerts.length) { panel.replaceChildren(emptyState('No surveillance alerts in the synthetic book')); return; }

  const nodes = [];
  const s = queue.summary;

  // KPI strip.
  nodes.push(el('div', { class: 'row wrap', style: { gap: '10px', marginBottom: '12px' } },
    kpiChip('Open alerts', s.total, ACCENT, 'Total market-abuse alerts raised across the three detectors'),
    kpiChip('High severity', s.high, SEV_COLOR.High, 'Alerts banded High severity'),
    kpiChip('Insider-list hits', s.insiderHits, TYPE_COLOR['insider-dealing'], 'Alerts corroborated by an insider-list cross-check'),
    kpiChip('Instruments flagged', s.instrumentsFlagged.length, '#4d8df0', 'Distinct instruments with at least one alert'),
    kpiChip('Venue', queue.venue || 'NEXUS-MTF', 'var(--text-2)', 'The fictional trading venue')));

  // Breakdown panels: by typology + by severity.
  nodes.push(el('div', { class: 'grid k2' },
    typeBreakdown(s.byType, s.total, queue.types),
    severityBreakdown(s.bySeverity, s.total)));

  // The alert queue (optionally pre-filtered).
  nodes.push(alertQueueCard(queue, initialFilter));

  nodes.push(disclaimerNote(queue.disclaimer));
  panel.replaceChildren(...nodes);
}

// ── Breakdown: by typology (counts, ranked, colour+label) ─────────────────────
function typeBreakdown(byType, total, types) {
  const typeBlurb = Object.fromEntries((types || []).map((t) => [t.code, t]));
  const rows = byType.slice().sort((a, b) => b.count - a.count).map((t) => {
    const color = TYPE_COLOR[t.code] || ACCENT;
    const pct = total ? Math.round((t.count / total) * 100) : 0;
    const meta = typeBlurb[t.code] || {};
    return el('div', { style: { padding: '9px 0', borderBottom: '1px solid var(--border)' } },
      el('div', { class: 'row wrap', style: { gap: '8px', alignItems: 'center', marginBottom: '5px' } },
        el('span', { style: { width: '11px', height: '11px', borderRadius: '3px', background: color, flex: '0 0 auto', border: '1px solid rgba(0,0,0,0.25)' } }),
        el('a', { href: '#/surveillance/type/' + encodeURIComponent(t.code), style: { fontWeight: '600', color: 'var(--text)', flex: '1 1 auto', minWidth: '0', textDecoration: 'none' }, title: 'Filter the alert queue to ' + t.label }, t.label),
        el('span', { class: 'badge sq neutral', title: 'Alerts of this type' }, String(t.count))),
      meta.typology ? el('div', { class: 'small muted', style: { marginBottom: '4px' } }, meta.typology) : null,
      barMeter(pct, color));
  });
  return card('By typology', { sub: 'The three market-abuse patterns detected', actions: el('span', { class: 'badge sq neutral' }, 'Synthetic') },
    el('div', { class: 'small muted', style: { marginBottom: '8px' } }, 'Bar width is the share of all alerts. Each typology mirrors a real MAR / Dodd-Frank / CEA pattern.'), ...rows);
}

// ── Breakdown: by severity (counts, fixed order High→Low, colour+label) ───────
function severityBreakdown(bySeverity, total) {
  const order = { High: 0, Medium: 1, Low: 2 };
  const rows = bySeverity.slice().sort((a, b) => order[a.code] - order[b.code]).map((sv) => {
    const color = SEV_COLOR[sv.code] || ACCENT;
    const pct = total ? Math.round((sv.count / total) * 100) : 0;
    return el('div', { style: { padding: '9px 0', borderBottom: '1px solid var(--border)' } },
      el('div', { class: 'row wrap', style: { gap: '8px', alignItems: 'center', marginBottom: '5px' } },
        severityBadge(sv.code),
        el('a', { href: '#/surveillance/severity/' + encodeURIComponent(sv.code), style: { flex: '1 1 auto', minWidth: '0', textDecoration: 'none', color: 'var(--text-2)' }, title: 'Filter the alert queue to ' + sv.label + ' severity' }, sv.label + ' severity'),
        el('span', { class: 'badge sq neutral' }, String(sv.count))),
      barMeter(pct, color));
  });
  return card('By severity', { sub: 'Banding is deterministic, from the alert’s own signals', actions: el('span', { class: 'badge sq neutral' }, 'Deterministic') },
    el('div', { class: 'small muted', style: { marginBottom: '8px' } }, 'Severity is set from size, timing and repetition — each alert lists the reasons that banded it.'), ...rows);
}

// ── The filterable alert queue ────────────────────────────────────────────────
function alertQueueCard(queue, initial) {
  const state = { q: '', type: (initial && initial.type) || '', severity: (initial && initial.severity) || '', instrument: '' };
  const wrap = el('div');

  const typeSelect = el('select', { class: 'fin-select', 'aria-label': 'Filter by typology', style: selectStyle(), onchange: (e) => { state.type = e.target.value; render(); } },
    el('option', { value: '' }, 'All typologies'),
    ...queue.types.map((t) => el('option', { value: t.code }, t.label)));
  const sevSelect = el('select', { class: 'fin-select', 'aria-label': 'Filter by severity', style: selectStyle(), onchange: (e) => { state.severity = e.target.value; render(); } },
    el('option', { value: '' }, 'All severities'),
    ...queue.severities.map((sv) => el('option', { value: sv.code }, sv.label)));
  const instSelect = el('select', { class: 'fin-select', 'aria-label': 'Filter by instrument', style: selectStyle(), onchange: (e) => { state.instrument = e.target.value; render(); } },
    el('option', { value: '' }, 'All instruments'),
    ...queue.instruments.map((i) => el('option', { value: i.symbol }, `${i.symbol} — ${i.issuer}`)));
  const search = el('input', { type: 'text', placeholder: 'Filter by subject, instrument, text…', 'aria-label': 'Filter alerts', style: { ...selectStyle(), minWidth: '220px' }, oninput: (e) => { state.q = e.target.value.toLowerCase(); render(); } });
  if (state.type) typeSelect.value = state.type;
  if (state.severity) sevSelect.value = state.severity;

  const controls = el('div', { class: 'row wrap', style: { gap: '10px', marginBottom: '10px', alignItems: 'center' } },
    search, typeSelect, sevSelect, instSelect);

  function filtered() {
    let rows = queue.alerts.slice();
    if (state.type) rows = rows.filter((a) => a.type === state.type);
    if (state.severity) rows = rows.filter((a) => a.severity === state.severity);
    if (state.instrument) rows = rows.filter((a) => a.instrument.symbol === state.instrument);
    if (state.q) rows = rows.filter((a) => `${a.id} ${a.type} ${a.typeLabel} ${a.instrument.symbol} ${a.instrument.issuer} ${a.subjectSummary} ${a.headline}`.toLowerCase().includes(state.q));
    return rows;
  }

  function render() {
    const rows = filtered();
    const thead = el('thead', {}, el('tr', {},
      el('th', { scope: 'col', style: { textAlign: 'left' } }, 'Severity'),
      el('th', { scope: 'col', style: { textAlign: 'left' } }, 'Typology'),
      el('th', { scope: 'col', style: { textAlign: 'left' } }, 'Instrument'),
      el('th', { scope: 'col', style: { textAlign: 'left' } }, 'Subjects'),
      el('th', { scope: 'col', style: { textAlign: 'left' } }, 'Rationale', infoDot('A plain-English summary; open the alert for the full evidence timeline.')),
      el('th', { scope: 'col', style: { textAlign: 'left' } }, 'Cross-check')));
    const body = rows.length ? rows.map((a) => alertRow(a)) : [el('tr', {}, el('td', { colspan: 6 }, emptyState('No alerts match these filters')))];
    const table = el('table', { class: 'tbl', style: { width: '100%', borderCollapse: 'collapse' } }, thead, el('tbody', {}, ...body));
    wrap.replaceChildren(controls,
      el('div', { class: 'small muted', style: { marginBottom: '8px' } }, `${rows.length} of ${queue.alerts.length} alert${queue.alerts.length === 1 ? '' : 's'} — click any row to open its rationale, evidence timeline and order-book micro-viz.`),
      el('div', { class: 'tbl-wrap', style: { overflowX: 'auto' } }, table));
  }
  render();

  return card('Alert queue', { sub: `${queue.alerts.length} synthetic market-abuse alert${queue.alerts.length === 1 ? '' : 's'} — filter, then open any alert`, actions: el('span', { class: 'badge sq neutral' }, 'Synthetic') }, wrap);
}

// One alert-queue row: severity badge, typology badge, instrument, subjects,
// truncated rationale, and the insider cross-check flag. Clickable.
function alertRow(a) {
  const sevTd = el('td', {}, severityBadge(a.severity));
  const typeTd = el('td', {}, typeBadge(a.type, a.typeLabel));
  const instTd = el('th', { scope: 'row', style: { textAlign: 'left' } },
    el('a', { href: '#/surveillance/alert/' + encodeURIComponent(a.id), style: { color: 'var(--text)', textDecoration: 'none', fontWeight: '600' }, title: 'Open ' + a.id }, a.instrument.symbol),
    el('div', { class: 'small muted' }, a.instrument.issuer));
  const subjTd = el('td', {}, el('span', { class: 'small', title: a.subjectSummary }, a.subjectSummary));
  const rationaleTd = el('td', {}, el('span', { class: 'small muted', title: a.headline }, a.headline.length > 96 ? a.headline.slice(0, 93) + '…' : a.headline));
  const xTd = el('td', {}, a.insiderHit ? el('span', { class: 'badge', style: { background: hexToRgba(TYPE_COLOR['insider-dealing'], 0.16), color: TYPE_COLOR['insider-dealing'], borderColor: hexToRgba(TYPE_COLOR['insider-dealing'], 0.5) }, title: 'Corroborated by an insider-list cross-check' }, el('span', { class: 'dot', style: { background: TYPE_COLOR['insider-dealing'] } }), 'Insider list') : el('span', { class: 'small muted' }, '—'));
  return el('tr', { class: 'clickable' }, sevTd, typeTd, instTd, subjTd, rationaleTd, xTd);
}

// ─────────────────────────────────────────────────────────────────────────────
// ALERT DETAIL — rationale, evidence timeline, insider cross-check, micro-viz
// ─────────────────────────────────────────────────────────────────────────────
async function renderAlertDetail(root, id) {
  const panel = el('div', {}, skeleton(360));
  root.append(panel);
  let data;
  try { data = await api.get('/api/surveillance/alerts/' + encodeURIComponent(id)); }
  catch (e) { panel.replaceChildren(errorState(e.message)); return; }

  const a = data.alert;
  const color = TYPE_COLOR[a.type] || ACCENT;
  const nodes = [];

  // Back link.
  nodes.push(el('div', { style: { marginBottom: '10px' } },
    el('a', { class: 'btn sm ghost', href: '#/surveillance' }, icon('chevron', 14), 'Back to alert queue')));

  // Header card: instrument + typology + severity.
  nodes.push(el('div', { class: 'card', style: { '--mc': color, borderLeft: '4px solid ' + color } },
    el('div', { class: 'card-body' },
      el('div', { class: 'row wrap', style: { gap: '12px', alignItems: 'flex-start' } },
        el('div', { style: { flex: '1 1 340px', minWidth: '0' } },
          el('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center', marginBottom: '4px' } },
            el('span', { style: { fontWeight: '800', color: 'var(--text)', fontSize: '19px' } }, a.instrument.symbol + ' — ' + a.instrument.issuer),
            typeBadge(a.type, a.typeLabel), severityBadge(a.severity)),
          el('div', { class: 'small muted' }, `${a.id} · ${a.instrument.sector || ''} · window ${a.window.open}–${a.window.close} (${a.window.label})`),
          el('div', { class: 'small', style: { color: 'var(--text-2)', marginTop: '10px', lineHeight: '1.65' } }, a.explanation)),
        el('div', { style: { flex: '0 0 auto', textAlign: 'right', minWidth: '150px' } },
          el('div', { class: 'small muted', style: { marginBottom: '2px' } }, 'Typology'),
          el('div', { class: 'small', style: { color: 'var(--text)', fontWeight: '600' } }, a.typology),
          el('div', { style: { marginTop: '8px' } }, subjectChips(a.subjects)))))));

  // Two-column: rationale (reasons) + insider cross-check.
  nodes.push(el('div', { class: 'grid k2' },
    reasonsCard(a),
    crossCheckCard(a)));

  // Evidence timeline (hand-built vertical timeline).
  nodes.push(card('Evidence timeline', { sub: `${a.evidence.length} ordered events on the fictional ${SURV_DAY()} session`, actions: el('span', { class: 'badge sq neutral' }, 'Ordered' ) },
    el('div', { class: 'small muted', style: { marginBottom: '10px' } }, 'The exact sequence of order-book events that triggered this alert, in time order.'),
    evidenceTimeline(a.evidence)));

  // Order-book micro-viz for the instrument.
  nodes.push(card('Order-book micro-viz', { sub: `${a.instrument.symbol} — placed, cancelled and executed orders around the alert window`, actions: el('span', { class: 'badge sq neutral' }, 'Synthetic') },
    el('div', { class: 'small muted', style: { marginBottom: '8px' } }, a.type === 'spoofing' ? 'Cancelled layer orders are drawn hollow; the genuine fill on the opposite side is solid. Time runs left→right, price bottom→top.' : 'Executions are solid dots, resting/cancelled orders are hollow. Time runs left→right, price bottom→top.'),
    el('div', { id: 'surv-microviz' }, skeleton(220))));

  nodes.push(disclaimerNote(data.disclaimer));
  panel.replaceChildren(...nodes);

  // Lazily load + render the micro-viz (keeps the first paint light).
  try {
    const ob = await api.get('/api/surveillance/orderbook?instrument=' + encodeURIComponent(a.instrument.symbol));
    const holder = panel.querySelector ? null : null; // guard: query below via id lookup
    const target = findByIdSafe(panel, 'surv-microviz');
    if (target) target.replaceChildren(orderBookViz(ob, a));
  } catch (e) {
    const target = findByIdSafe(panel, 'surv-microviz');
    if (target) target.replaceChildren(el('div', { class: 'small muted' }, 'Micro-viz unavailable: ' + e.message));
  }
}

// A small, safe id finder that walks the built node tree (works in the e2e shim,
// which returns a fresh FakeNode from querySelector rather than the real element).
function findByIdSafe(node, id) {
  if (!node || typeof node !== 'object') return null;
  if (node.attributes && node.attributes.id === id) return node;
  for (const c of node.children || []) { const r = findByIdSafe(c, id); if (r) return r; }
  return null;
}
function SURV_DAY() { return '2026-05-18'; }

// ── Rationale card: the ordered reasons that raised + banded the alert ─────────
function reasonsCard(a) {
  return card('Why this fired', { sub: 'The signals that raised and banded this alert' },
    el('ul', { style: { margin: '0', paddingLeft: '18px', display: 'grid', gap: '6px' } },
      ...a.reasons.map((r) => el('li', { class: 'small', style: { color: 'var(--text-2)', lineHeight: '1.55' } }, r))),
    el('div', { class: 'row wrap', style: { gap: '8px', marginTop: '10px', alignItems: 'center' } },
      el('span', { class: 'small muted' }, 'Severity:'), severityBadge(a.severity),
      el('span', { class: 'small muted', style: { marginLeft: '6px' } }, 'Typology:'), typeBadge(a.type, a.typeLabel)));
}

// ── Insider-list cross-check card ─────────────────────────────────────────────
function crossCheckCard(a) {
  const x = a.insiderCrossCheck || { hit: false };
  if (x.hit) {
    const color = TYPE_COLOR['insider-dealing'];
    return card('Insider-list cross-check', { sub: 'Corroborating need-to-know access', actions: el('span', { class: 'badge', style: { background: hexToRgba(color, 0.16), color, borderColor: hexToRgba(color, 0.5) } }, el('span', { class: 'dot', style: { background: color } }), 'Hit') },
      el('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'flex-start' } },
        el('span', { class: 'mc-icon', style: { color, flex: '0 0 auto' } }, icon('link', 18)),
        el('div', { style: { flex: '1 1 auto', minWidth: '0' } },
          el('div', { style: { fontWeight: '600', color: 'var(--text)' } }, `${x.person} — ${x.role}`),
          el('div', { class: 'small muted', style: { marginTop: '2px' } }, `On the insider list for "${x.announcement}"`),
          el('div', { class: 'small', style: { color: 'var(--text-2)', marginTop: '6px' } }, `Need-to-know window ${x.windowOpen}–${x.windowClose}. The flagged dealing falls inside it.`),
          x.note ? el('div', { class: 'small muted', style: { marginTop: '6px', fontStyle: 'italic' } }, '“' + x.note + '”') : null)),
      el('div', { style: { marginTop: '8px' } }, el('a', { class: 'btn sm ghost', href: '#/surveillance/insiders', title: 'Open the full insider list' }, icon('eye', 14), 'View insider list')));
  }
  return card('Insider-list cross-check', { sub: 'Not applicable to this typology' },
    el('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center' } },
      el('span', { class: 'mc-icon', style: { color: 'var(--text-3)', flex: '0 0 auto' } }, icon('link', 18)),
      el('div', { class: 'small muted', style: { flex: '1 1 auto' } }, x.note || 'This is an order-book manipulation typology; no insider-list cross-check applies.')));
}

// ── Hand-built vertical evidence timeline (dark theme, no layout measurement) ──
function evidenceTimeline(events) {
  const kindMeta = {
    window: { icon: 'eye', color: '#a97bf0', label: 'Insider window' },
    trade: { icon: 'chain', color: '#4d8df0', label: 'Trade' },
    'wash-trade': { icon: 'refresh', color: '#4d8df0', label: 'Self-match' },
    'order-place': { icon: 'plus', color: '#e0a52b', label: 'Order placed' },
    'order-cancel': { icon: 'x', color: '#d5303e', label: 'Order cancelled' },
    announcement: { icon: 'bell', color: '#5bbfb5', label: 'Announcement' },
    price: { icon: 'alert', color: '#e07b39', label: 'Price move' },
  };
  const rows = events.map((e, i) => {
    const meta = kindMeta[e.kind] || { icon: 'note', color: 'var(--text-3)', label: e.kind };
    const isLast = i === events.length - 1;
    // Rail + node + content. The connecting line is a bordered box (no measurement).
    return el('div', { class: 'row', style: { gap: '12px', alignItems: 'stretch' } },
      // left rail: dot + connector
      el('div', { style: { flex: '0 0 auto', width: '26px', display: 'flex', flexDirection: 'column', alignItems: 'center' } },
        el('span', { style: { width: '22px', height: '22px', borderRadius: '50%', background: hexToRgba(meta.color, 0.16), border: '2px solid ' + meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: meta.color, flex: '0 0 auto' }, 'aria-hidden': 'true' }, icon(meta.icon, 12)),
        isLast ? null : el('span', { style: { width: '2px', flex: '1 1 auto', minHeight: '14px', background: 'var(--border)', marginTop: '2px' }, 'aria-hidden': 'true' })),
      // content
      el('div', { style: { flex: '1 1 auto', minWidth: '0', paddingBottom: isLast ? '0' : '14px' } },
        el('div', { class: 'row wrap', style: { gap: '8px', alignItems: 'center', marginBottom: '2px' } },
          el('span', { class: 'tabular small', style: { fontWeight: '700', color: 'var(--text)' } }, e.time),
          el('span', { class: 'badge sq', style: { background: hexToRgba(meta.color, 0.14), color: meta.color, borderColor: hexToRgba(meta.color, 0.4) } }, meta.label)),
        el('div', { class: 'small', style: { color: 'var(--text-2)', lineHeight: '1.5' } }, e.text)));
  });
  return el('div', { role: 'list', 'aria-label': 'Evidence timeline, ordered by time', style: { display: 'grid', gap: '0' } }, ...rows);
}

// ── Hand-built SVG order-book / price micro-viz (fixed viewBox; e2e-safe) ──────
// Time on X (session-seconds), price on Y. Executions are solid dots; resting/open
// orders are hollow; cancelled orders are hollow with a red stroke (the spoof
// layers). A dashed line marks the reference price. No getBBox / measurement.
function orderBookViz(ob, alert) {
  const W = 720, H = 240, padL = 54, padR = 16, padT = 16, padB = 34;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const ag = ob.aggregate;
  const secMin = ag.secMin, secMax = Math.max(ag.secMax, ag.secMin + 1);
  const priceMin = Math.min(ag.priceMin, ob.refPrice), priceMax = Math.max(ag.priceMax, ob.refPrice);
  const pSpan = Math.max(0.01, priceMax - priceMin);
  const x = (sec) => padL + ((sec - secMin) / (secMax - secMin)) * plotW;
  const y = (p) => padT + plotH - ((p - priceMin) / pSpan) * plotH;

  const svgNS = 'http://www.w3.org/2000/svg';
  const mk = (tag, attrs, ...kids) => {
    const e = document.createElementNS(svgNS, tag);
    for (const [k, v] of Object.entries(attrs || {})) { if (v == null) continue; e.setAttribute(k, String(v)); }
    for (const kid of kids.flat()) { if (kid != null && kid !== false) e.append(kid instanceof Node ? kid : document.createTextNode(String(kid))); }
    return e;
  };
  const kids = [];
  // Y gridlines + price labels (min, mid, max) and the reference-price dashed line.
  for (let g = 0; g <= 2; g++) {
    const p = priceMin + (pSpan * g) / 2;
    const yy = y(p);
    kids.push(mk('line', { x1: padL, y1: yy, x2: W - padR, y2: yy, stroke: 'var(--border)', 'stroke-width': 1, 'stroke-dasharray': g === 0 ? '0' : '3 4' }));
    kids.push(mk('text', { x: padL - 8, y: yy + 4, 'text-anchor': 'end', fill: 'var(--text-3)', 'font-size': 10 }, p.toFixed(2)));
  }
  // Reference-price marker.
  const yRef = y(ob.refPrice);
  kids.push(mk('line', { x1: padL, y1: yRef, x2: W - padR, y2: yRef, stroke: ACCENT, 'stroke-width': 1.4, 'stroke-dasharray': '6 4', opacity: 0.8 }));
  kids.push(mk('text', { x: W - padR, y: yRef - 4, 'text-anchor': 'end', fill: ACCENT, 'font-size': 10 }, 'ref ' + ob.refPrice.toFixed(2)));
  // X endpoints (open / close of the plotted span).
  kids.push(mk('text', { x: padL, y: H - padB + 16, 'text-anchor': 'start', fill: 'var(--text-3)', 'font-size': 10 }, secToHms(secMin)));
  kids.push(mk('text', { x: W - padR, y: H - padB + 16, 'text-anchor': 'end', fill: 'var(--text-3)', 'font-size': 10 }, secToHms(secMax)));

  // Orders: hollow circles; cancelled orders (spoof layers) get a red stroke and a
  // little "×"; a segment from entry→cancel time shows the order's short life.
  for (const o of ob.orders) {
    const cx = x(o.sec), cy = y(o.price);
    if (o.state === 'cancelled') {
      const cxEnd = x(o.cancelSec != null ? o.cancelSec : o.sec);
      kids.push(mk('line', { x1: cx, y1: cy, x2: cxEnd, y2: cy, stroke: '#d5303e', 'stroke-width': 1, opacity: 0.5 }));
      const r = 3 + Math.min(4, o.qty / 1500);
      kids.push(mk('circle', { cx, cy, r, fill: 'none', stroke: '#d5303e', 'stroke-width': 1.6 },
        mk('title', {}, `CANCELLED ${o.side} ${o.qty} @ ${o.price} (${o.id}) — placed ${o.time}, cancelled ${o.cancelTime}`)));
    } else if (o.state === 'filled') {
      // filled resting order — faint hollow marker (the trade dot is drawn below)
      kids.push(mk('circle', { cx, cy, r: 2, fill: 'none', stroke: 'var(--text-3)', 'stroke-width': 1, opacity: 0.5 }));
    } else {
      kids.push(mk('circle', { cx, cy, r: 2.5, fill: 'none', stroke: '#4d8df0', 'stroke-width': 1.2, opacity: 0.7 },
        mk('title', {}, `${o.state.toUpperCase()} ${o.side} ${o.qty} @ ${o.price} (${o.id})`)));
    }
  }
  // Executions: solid dots, sized by qty.
  for (const e of ob.executions) {
    const cx = x(e.sec), cy = y(e.price);
    const r = 3 + Math.min(5, e.qty / 1200);
    kids.push(mk('circle', { cx, cy, r, fill: ACCENT, opacity: 0.9 },
      mk('title', {}, `EXECUTED ${e.qty} @ ${e.price} (${e.id}) — ${e.buyAccountId} bought / ${e.sellAccountId} sold at ${e.time}`)));
  }

  const svg = mk('svg', {
    viewBox: `0 0 ${W} ${H}`, width: '100%', role: 'img',
    'aria-label': `Order-book micro-viz for ${ob.instrument.symbol}: ${ob.executions.length} executions and ${ob.aggregate.cancelledCount} cancelled orders around a reference price of ${ob.refPrice}. Time on the horizontal axis, price on the vertical.`,
    preserveAspectRatio: 'xMidYMid meet', style: 'max-width:100%;height:auto;display:block',
  }, ...kids);

  // Legend (colour always paired with a text label).
  const legend = el('div', { class: 'row wrap', style: { gap: '16px', marginTop: '8px' }, role: 'img', 'aria-label': 'Legend' },
    swatchLabel(ACCENT, 'Executed trade', 'dot'),
    swatchLabel('#d5303e', 'Cancelled order (layer)', 'ring'),
    swatchLabel('#4d8df0', 'Resting / open order', 'ring'),
    el('span', { class: 'row', style: { gap: '6px', alignItems: 'center' } }, el('span', { style: { width: '18px', height: '0', borderTop: '2px dashed ' + ACCENT, display: 'inline-block' } }), el('span', { class: 'small' }, 'Reference price')));

  return el('div', {}, el('div', { class: 'tbl-wrap', style: { overflowX: 'auto' } }, svg), legend);
}

// ─────────────────────────────────────────────────────────────────────────────
// INSIDER-LIST VIEW — the fictional insider list + which entries raised an alert
// ─────────────────────────────────────────────────────────────────────────────
async function renderInsiderList(root) {
  const panel = el('div', {}, skeleton(300));
  root.append(panel);
  let data;
  try { data = await api.get('/api/surveillance/insiders'); }
  catch (e) { panel.replaceChildren(errorState(e.message)); return; }

  const nodes = [];
  nodes.push(el('div', { style: { marginBottom: '10px' } },
    el('a', { class: 'btn sm ghost', href: '#/surveillance' }, icon('chevron', 14), 'Back to dashboard')));

  nodes.push(el('div', { class: 'row wrap', style: { gap: '10px', marginBottom: '12px' } },
    kpiChip('Insider-list entries', data.total, ACCENT, 'People with fictional need-to-know access'),
    kpiChip('Raised an alert', data.flagged, TYPE_COLOR['insider-dealing'], 'Insiders whose dealing triggered an insider-dealing alert'),
    kpiChip('Announcements', data.announcements.length, '#4d8df0', 'Fictional price-sensitive announcements')));

  // Announcements reference.
  nodes.push(card('Price-sensitive announcements', { sub: 'The fictional catalysts the insider list is drawn around', actions: el('span', { class: 'badge sq neutral' }, 'Synthetic') },
    el('div', { style: { display: 'grid', gap: '6px' } },
      ...data.announcements.map((an) => el('div', { class: 'row wrap', style: { gap: '8px', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' } },
        el('span', { class: 'badge sq neutral' }, an.symbol),
        el('span', { style: { flex: '1 1 auto', minWidth: '0', color: 'var(--text)' } }, an.label),
        el('span', { class: 'badge', style: dirBadgeStyle(an.direction), title: an.direction === 'up' ? 'Favourable (up)' : 'Adverse (down)' }, el('span', { class: 'dot', style: { background: an.direction === 'up' ? '#2f9e63' : '#d5303e' } }), an.direction === 'up' ? 'Favourable' : 'Adverse'),
        el('span', { class: 'small tabular muted' }, an.announceTime))))));

  // The insider-list table.
  const thead = el('thead', {}, el('tr', {},
    el('th', { scope: 'col', style: { textAlign: 'left' } }, 'Person'),
    el('th', { scope: 'col', style: { textAlign: 'left' } }, 'Role'),
    el('th', { scope: 'col', style: { textAlign: 'left' } }, 'Instrument'),
    el('th', { scope: 'col', style: { textAlign: 'left' } }, 'Announcement'),
    el('th', { scope: 'col', style: { textAlign: 'left' } }, 'Need-to-know window'),
    el('th', { scope: 'col', style: { textAlign: 'left' } }, 'Status')));
  const rows = data.insiders.map((i) => el('tr', { class: i.raisedAlert ? 'clickable' : '' },
    el('th', { scope: 'row', style: { textAlign: 'left' } }, el('span', { style: { fontWeight: '600', color: 'var(--text)' } }, i.person), el('div', { class: 'small muted' }, i.traderId)),
    el('td', {}, el('span', { class: 'small' }, i.role)),
    el('td', {}, el('span', { class: 'badge sq neutral', title: i.instrument.issuer }, i.symbol)),
    el('td', {}, el('span', { class: 'small muted', title: i.announcement }, i.announcement)),
    el('td', {}, el('span', { class: 'small tabular' }, i.windowOpen + '–' + i.windowClose)),
    el('td', {}, i.raisedAlert
      ? el('a', { class: 'badge high', href: '#/surveillance/alert/' + encodeURIComponent(i.alertId), style: { textDecoration: 'none' }, title: 'Open the insider-dealing alert' }, el('span', { class: 'dot' }), 'Alert raised')
      : el('span', { class: 'badge low', title: 'On the list; no dealing flagged' }, el('span', { class: 'dot' }), 'No dealing'))));
  const table = el('table', { class: 'tbl', style: { width: '100%', borderCollapse: 'collapse' } }, thead, el('tbody', {}, ...rows));
  nodes.push(card('Insider list', { sub: `${data.total} fictional insiders — those who dealt inside their window link to the alert`, actions: el('span', { class: 'badge sq neutral' }, 'Synthetic') },
    el('div', { class: 'small muted', style: { marginBottom: '8px' } }, 'A fictional insider list. Where a person dealt the issuer inside their need-to-know window ahead of the announcement, the surveillance detector raised an alert (row links to it); the others are on the list but not flagged.'),
    el('div', { class: 'tbl-wrap', style: { overflowX: 'auto' } }, table)));

  nodes.push(disclaimerNote(data.disclaimer));
  panel.replaceChildren(...nodes);
}

// ── Shared small helpers ──────────────────────────────────────────────────────
function typeBadge(code, label) {
  const color = TYPE_COLOR[code] || ACCENT;
  return el('span', { class: 'badge', title: 'Typology: ' + (label || code), style: { background: hexToRgba(color, 0.16), color, borderColor: hexToRgba(color, 0.5) } }, el('span', { class: 'dot', style: { background: color } }), label || code);
}
function severityBadge(code) {
  const color = SEV_COLOR[code] || ACCENT;
  const cls = code === 'High' ? 'high' : code === 'Medium' ? 'med' : 'low';
  return el('span', { class: 'badge ' + cls, title: 'Severity: ' + code }, el('span', { class: 'dot' }), code);
}
function subjectChips(subjects) {
  return el('div', { class: 'row wrap', style: { gap: '4px', justifyContent: 'flex-end' } },
    ...subjects.slice(0, 4).map((s) => el('span', { class: 'badge sq neutral', title: (s.kind === 'trader' ? 'Trader' : s.kind === 'account' ? 'Account' : 'Subject') + (s.deskLabel ? ' · ' + s.deskLabel : '') }, s.name || s.label || s.id)));
}
function dirBadgeStyle(dir) {
  const color = dir === 'up' ? '#2f9e63' : '#d5303e';
  return { background: hexToRgba(color, 0.16), color, borderColor: hexToRgba(color, 0.5) };
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
function swatchLabel(color, label, kind) {
  const mark = kind === 'ring'
    ? el('span', { style: { width: '12px', height: '12px', borderRadius: '50%', border: '2px solid ' + color, display: 'inline-block' } })
    : el('span', { style: { width: '12px', height: '12px', borderRadius: '50%', background: color, display: 'inline-block' } });
  return el('span', { class: 'row', style: { gap: '6px', alignItems: 'center' } }, mark, el('span', { class: 'small' }, label));
}
function selectStyle() { return { padding: '7px 10px', background: 'var(--surface-2, #131924)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '14px' }; }
function disclaimerNote(text) {
  return el('div', { class: 'intro', style: { marginTop: '18px' } }, el('span', { class: 'ico' }, icon('info', 18)), el('div', { class: 't' }, el('b', {}, 'Fully synthetic; detector logic real, data fabricated. '), text));
}
// Seconds-from-midnight → HH:MM:SS (guarded pure helper; mirrors the engine).
function secToHms(sec) {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}
// Small pure hex->rgba (guarded; no DOM/canvas dependency, e2e-safe).
function hexToRgba(hex, alpha) {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6) return `rgba(91,191,181,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
