// View: Third-Party / Vendor Risk — a continuously-scored counterparty / vendor
// due-diligence console over a SYNTHETIC register. It AGGREGATES signals from the
// other FRIS modules into one composite 0–100 risk score per vendor: ownership /
// flight-risk from Sovereign Nexus, sanctions / PEP / adverse hits from the
// Screening engine, jurisdiction secrecy, financial / criticality, adverse
// signals and governance. Three sub-views: a sortable / filterable vendor
// REGISTER with rating badges, a portfolio DASHBOARD (vendors by rating, top
// risks, concentration), and a per-vendor RISK-FILE detail (the per-dimension
// breakdown with contributions, the linked Nexus entity, any Screening hits,
// jurisdiction context, recommended actions + a review disposition). Renders
// in-page within the shell (never a viewport takeover), accessible, and clearly
// labelled as synthetic — NOT a TPRM system of record. The DOM is kept light
// (the register caps/paginates) so the view stays fast and e2e-safe.
import { el, api, fmt, icon, card, riskBadge, toast, emptyState, errorState, skeleton, meter, infoDot } from './core.js';
import { pageHead, intro } from './views1.js';

// Rating → colour/severity mapping (reuses the existing High/Medium/Low palette,
// plus a deeper red for Critical).
const RATING_ACCENT = { Low: '#46b877', Medium: '#e5a53b', High: '#f0616d', Critical: '#c1121f' };
const RATING_BADGE = { Low: 'low', Medium: 'med', High: 'high', Critical: 'high' };
const CAT_COLOUR = { it_saas: '#4d8df0', financial: '#f0616d', logistics: '#37c2b4', professional: '#a97bf0', manufacturing: '#e5a53b', commodities: '#d98c4a', marketing: '#7d8aa0', facilities: '#5b6b82' };
const PRIORITY_BADGE = { Critical: 'high', High: 'high', Medium: 'med', Low: 'low' };
const PAGE_SIZE = 12; // keep the register DOM light — paginate at a dozen rows.

export async function vendors(root, parts) {
  root.append(pageHead('Third-Party / Vendor Risk', 'A continuously-scored counterparty / vendor due-diligence file — one composite risk score that aggregates ownership, screening, jurisdiction and governance signals from across FRIS', [
    el('a', { class: 'btn sm', href: '#/screening/portfolio', title: 'Portfolio screening (the sanctions/PEP signal feeding these scores)' }, icon('alert', 15), 'Screening'),
  ]));
  root.append(intro('Third-Party / Vendor Risk',
    'maintains a register of fictional vendors and counterparties, each with a due-diligence risk file. For every vendor it aggregates signals from the rest of the suite — ownership opacity and flight-risk from Sovereign Nexus, sanctions / PEP / adverse-media hits from Screening & Watchlist, jurisdiction secrecy, financial exposure and criticality, adverse markers and contract governance — into one composite 0–100 score with a Low / Medium / High / Critical rating. Sort and filter the register, read the portfolio dashboard, then open any vendor to see the per-dimension breakdown, the linked Nexus entity, its screening hits, and the recommended due-diligence actions.'));

  // Honesty banner.
  root.append(el('div', { class: 'intro', role: 'note', style: { marginTop: '10px', '--mc': '#c1121f' } },
    el('span', { class: 'ico' }, icon('info', 18)),
    el('div', { class: 't' }, el('b', {}, 'Synthetic data — not a system of record. '),
      'Every vendor, spend figure and risk score is FICTIONAL and generated deterministically. A composite score is an illustrative aggregation, NOT a factual allegation against any real supplier or counterparty. Some vendor names deliberately match synthetic watchlist entries to demonstrate the cross-module screening signal — they are still fictional. This is NOT a third-party-risk-management system of record.')));

  // A detail route (#/vendors/VEN-0002) opens the risk file; otherwise the tabs.
  if (parts[0] && /^VEN-/i.test(parts[0])) {
    const body = el('div', { class: 'mt' });
    root.append(body);
    await renderRiskFile(body, parts[0].toUpperCase());
    return;
  }

  // ── Sub-tab router (register · dashboard) ────────────────────────────────────
  const TABS = [
    ['register', 'Vendor register', 'database'],
    ['dashboard', 'Portfolio dashboard', 'overview'],
  ];
  const active = TABS.some((t) => t[0] === parts[0]) ? parts[0] : 'register';
  const tabBar = el('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Vendor risk views', style: { margin: '14px 0 6px' } },
    ...TABS.map(([id, label, ic]) => el('a', {
      class: 'tab' + (id === active ? ' active' : ''), href: '#/vendors/' + id, role: 'tab',
      'aria-selected': id === active ? 'true' : 'false',
    }, icon(ic, 15), label)));
  root.append(tabBar);

  const body = el('div', { class: 'mt' });
  root.append(body);

  if (active === 'dashboard') await renderDashboard(body);
  else await renderRegister(body);
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1 — Vendor register (sortable / filterable, paginated, rating badges)
// ─────────────────────────────────────────────────────────────────────────────
async function renderRegister(root) {
  const panel = el('div', {}, skeleton(220));
  root.append(panel);

  let data;
  try { data = await api.get('/api/vendors'); }
  catch (e) { panel.replaceChildren(errorState(e.message)); return; }
  if (!data.vendors.length) { panel.replaceChildren(emptyState('No vendors in the register')); return; }

  const state = { rating: '', category: '', jurisdiction: '', q: '', sort: 'composite', dir: 'desc', page: 0 };

  // Filter chips: rating.
  const ratingChips = [['', 'All ratings'], ...data.ratingBands.map((b) => [b.code, b.code])].map(([code, label]) => filterChip(code, label, () => { state.rating = code; state.page = 0; syncChips(ratingChips, code); refresh(); }));
  // Category select (compact — eight categories).
  const catSelect = el('select', { class: 'fin-select', 'aria-label': 'Filter by category', style: selectStyle(), onchange: (e) => { state.category = e.target.value; state.page = 0; refresh(); } },
    el('option', { value: '' }, 'All categories'),
    ...data.categories.map((c) => el('option', { value: c.code }, c.label)));
  // Jurisdiction select (built from the register's distinct jurisdictions).
  const jset = [...new Set(data.vendors.map((v) => v.homeJurisdiction).filter(Boolean))].sort();
  const jLabel = {}; for (const v of data.vendors) if (v.homeJurisdiction) jLabel[v.homeJurisdiction] = v.jurisdictionLabel || v.homeJurisdiction;
  const jurSelect = el('select', { class: 'fin-select', 'aria-label': 'Filter by jurisdiction', style: selectStyle(), onchange: (e) => { state.jurisdiction = e.target.value; state.page = 0; refresh(); } },
    el('option', { value: '' }, 'All jurisdictions'),
    ...jset.map((code) => el('option', { value: code }, jLabel[code] || code)));
  // Search.
  const searchInput = el('input', { type: 'text', 'aria-label': 'Search vendors', placeholder: 'Search vendor names…', style: { width: '100%' }, oninput: (e) => { state.q = e.target.value; state.page = 0; refresh(); } });

  const tableWrap = el('div', {});

  panel.replaceChildren(
    card('Vendor register', { sub: `${data.vendors.length} synthetic vendors · v${data.version.version} · scored ${data.summary.asOf}`, actions: el('span', { class: 'badge sq neutral' }, 'Synthetic') },
      el('div', { class: 'row wrap', style: { gap: '6px', marginBottom: '8px' } }, el('span', { class: 'small muted', style: { alignSelf: 'center', marginRight: '4px' } }, 'Rating:'), ...ratingChips),
      el('div', { class: 'row wrap', style: { gap: '10px', marginBottom: '8px', alignItems: 'flex-end' } },
        fieldWrap('Category', catSelect),
        fieldWrap('Jurisdiction', jurSelect),
        el('div', { class: 'field', style: { flex: '2 1 220px' } }, el('label', {}, 'Search'), searchInput)),
      el('div', { class: 'small muted', style: { marginBottom: '2px' } }, 'Click a column header to sort · click a row to open its risk file.')),
    tableWrap);

  const SORTS = [
    ['name', 'Vendor', 'left'],
    ['category', 'Category', 'left'],
    ['homeJurisdiction', 'Jurisdiction', 'left'],
    ['annualSpend', 'Spend (000s)', 'right'],
    ['criticality', 'Criticality', 'right'],
    ['composite', 'Risk score', 'right'],
  ];

  function currentRows() {
    const q = state.q.trim().toLowerCase();
    let rows = data.vendors.filter((v) =>
      (!state.rating || v.rating === state.rating) &&
      (!state.category || v.category === state.category) &&
      (!state.jurisdiction || v.homeJurisdiction === state.jurisdiction) &&
      (!q || v.name.toLowerCase().includes(q)));
    const key = state.sort, dir = state.dir === 'asc' ? 1 : -1;
    rows = rows.slice().sort((a, b) => {
      let av = a[key], bv = b[key];
      if (key === 'name' || key === 'category' || key === 'homeJurisdiction') { av = String(av || ''); bv = String(bv || ''); return dir * av.localeCompare(bv); }
      // criticality: tier 1 is the MOST critical, so invert for an intuitive sort.
      if (key === 'criticality') { return dir * ((5 - Number(av || 4)) - (5 - Number(bv || 4))) || String(a.vendorId).localeCompare(String(b.vendorId)); }
      return dir * ((Number(av) || 0) - (Number(bv) || 0)) || String(a.vendorId).localeCompare(String(b.vendorId));
    });
    return rows;
  }

  function setSort(key) {
    if (state.sort === key) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
    else { state.sort = key; state.dir = (key === 'name' || key === 'category' || key === 'homeJurisdiction') ? 'asc' : 'desc'; }
    state.page = 0; refresh();
  }

  function refresh() {
    const rows = currentRows();
    if (!rows.length) { tableWrap.replaceChildren(emptyState('No vendors match these filters', 'Loosen a filter, clear the search, or reset the rating.')); return; }
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (state.page >= pages) state.page = pages - 1;
    const slice = rows.slice(state.page * PAGE_SIZE, state.page * PAGE_SIZE + PAGE_SIZE);

    const headCells = SORTS.map(([key, label, align]) => {
      const isSorted = state.sort === key;
      const arrow = isSorted ? (state.dir === 'asc' ? ' ▲' : ' ▼') : '';
      return el('th', { scope: 'col', role: 'columnheader', 'aria-sort': isSorted ? (state.dir === 'asc' ? 'ascending' : 'descending') : 'none', style: { textAlign: align, cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' }, title: 'Sort by ' + label, onclick: () => setSort(key) }, label + arrow);
    });

    const bodyRows = slice.map((v) => {
      const accent = RATING_ACCENT[v.rating] || 'var(--accent)';
      return el('tr', { class: 'vendor-row', style: { cursor: 'pointer' }, title: 'Open risk file', tabindex: '0', role: 'button', 'aria-label': `${v.name}, ${v.rating} risk, score ${v.composite}`, onclick: () => { location.hash = '#/vendors/' + v.vendorId; } },
        el('td', {},
          el('div', { style: { fontWeight: '600', color: 'var(--text)' } }, v.name),
          el('div', { class: 'small muted tabular' }, v.vendorId + (v.entityId ? ' · ⇄ ' + v.entityId : '') + (v.review && v.review.status !== 'open' ? ' · reviewed' : ''))),
        el('td', {}, el('span', { class: 'badge sq neutral', style: { borderLeft: '3px solid ' + (CAT_COLOUR[v.category] || 'var(--accent)') } }, v.categoryLabel)),
        el('td', { class: 'small' }, v.jurisdictionLabel || v.homeJurisdiction || '—'),
        el('td', { class: 'tabular', style: { textAlign: 'right' } }, fmtThousands(v.annualSpend)),
        el('td', { class: 'tabular small', style: { textAlign: 'right' } }, 'T' + v.criticality),
        el('td', { style: { textAlign: 'right', whiteSpace: 'nowrap' } },
          el('span', { class: 'tabular', style: { color: accent, fontWeight: '800', fontSize: '15px', marginRight: '8px' } }, String(v.composite)),
          ratingBadgeEl(v.rating)));
    });

    const table = el('div', { style: { overflowX: 'auto' } },
      el('table', { class: 'tbl vendor-table', style: { width: '100%' } },
        el('caption', { class: 'small muted', style: { captionSide: 'top', textAlign: 'left', paddingBottom: '6px' } }, `${rows.length} vendor${rows.length === 1 ? '' : 's'} · sorted by ${labelFor(SORTS, state.sort)} ${state.dir === 'asc' ? 'ascending' : 'descending'}`),
        el('thead', {}, el('tr', {}, ...headCells)),
        el('tbody', {}, ...bodyRows)));

    // Pager (only when more than one page — keeps DOM minimal otherwise).
    const pager = pages > 1 ? el('div', { class: 'row wrap', style: { gap: '8px', alignItems: 'center', justifyContent: 'center', marginTop: '10px' } },
      el('button', { class: 'btn sm ghost', 'aria-label': 'Previous page', disabled: state.page <= 0 ? true : null, onclick: () => { if (state.page > 0) { state.page--; refresh(); } } }, icon('chevron', 14), 'Prev'),
      el('span', { class: 'small muted' }, `Page ${state.page + 1} of ${pages}`),
      el('button', { class: 'btn sm ghost', 'aria-label': 'Next page', disabled: state.page >= pages - 1 ? true : null, onclick: () => { if (state.page < pages - 1) { state.page++; refresh(); } } }, 'Next', icon('chevron', 14))) : null;

    tableWrap.replaceChildren(table, ...(pager ? [pager] : []));
  }
  refresh();
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2 — Portfolio dashboard (vendors by rating, top risks, concentration)
// ─────────────────────────────────────────────────────────────────────────────
async function renderDashboard(root) {
  const panel = el('div', {}, skeleton(240));
  root.append(panel);
  let data;
  try { data = await api.get('/api/vendors'); }
  catch (e) { panel.replaceChildren(errorState(e.message)); return; }

  const s = data.summary;
  const nodes = [];

  // KPI strip.
  const criticalCount = s.byRating.Critical || 0;
  const highCount = s.byRating.High || 0;
  nodes.push(el('div', { class: 'row wrap', style: { gap: '10px', marginBottom: '12px' } },
    kpiChip('Vendors', s.total),
    kpiChip('Critical', criticalCount, RATING_ACCENT.Critical),
    kpiChip('High', highCount, RATING_ACCENT.High),
    kpiChip('Annual spend', 'USD ' + fmtThousands(s.totalSpendThousands) + 'k'),
    kpiChip('Overdue reviews', s.overdueReviews.length, s.overdueReviews.length ? '#e5a53b' : undefined)));

  // Vendors by rating — a horizontal stacked bar + a legend (pure geometry, no
  // layout reads → e2e-safe).
  nodes.push(ratingDistributionCard(s, data.ratingBands));

  // Two-up: top risks + concentration.
  nodes.push(el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px' } },
    topRisksCard(s),
    concentrationCard(s, data)));

  // Vendors by category.
  nodes.push(categoryCard(s, data));

  // Overdue reviews (if any).
  if (s.overdueReviews.length) nodes.push(overdueCard(s));

  nodes.push(disclaimerNote(data.disclaimer));
  panel.replaceChildren(...nodes);
}

function ratingDistributionCard(s, bands) {
  const total = s.total || 1;
  const order = ['Critical', 'High', 'Medium', 'Low']; // worst-first for the bar
  const seg = (rating) => ({ rating, n: s.byRating[rating] || 0, color: RATING_ACCENT[rating] });
  const segs = order.map(seg).filter((x) => x.n > 0);
  // Stacked bar via flex widths (percentage) — no measurement needed.
  const bar = el('div', { class: 'vendor-ratingbar', role: 'img', 'aria-label': 'Vendors by rating: ' + order.map((r) => `${s.byRating[r] || 0} ${r}`).join(', '), style: { display: 'flex', width: '100%', height: '26px', borderRadius: '7px', overflow: 'hidden', border: '1px solid var(--border)' } },
    ...segs.map((x) => el('div', { title: `${x.rating}: ${x.n}`, style: { width: (x.n / total * 100) + '%', background: x.color, minWidth: '2px' } })));
  const legend = el('div', { class: 'row wrap', style: { gap: '14px', marginTop: '10px' } },
    ...order.map((r) => el('span', { class: 'row', style: { gap: '6px', alignItems: 'center' } },
      el('span', { style: { width: '11px', height: '11px', borderRadius: '3px', background: RATING_ACCENT[r], display: 'inline-block' } }),
      el('span', { class: 'small' }, `${r}: `),
      el('span', { class: 'small tabular', style: { fontWeight: '700', color: 'var(--text)' } }, String(s.byRating[r] || 0)))));
  const band = bands.find((b) => b.code === 'Critical');
  return card('Vendors by rating', { sub: `Composite-risk distribution across ${s.total} vendors`, actions: el('span', { class: 'badge sq neutral' }, 'As of ' + s.asOf) },
    bar, legend);
}

function topRisksCard(s) {
  if (!s.topRisks.length) return card('Top risks', {}, emptyState('No scored vendors'));
  const rows = s.topRisks.map((r) => {
    const accent = RATING_ACCENT[r.rating] || 'var(--accent)';
    return el('a', { class: 'row wrap', href: '#/vendors/' + r.vendorId, style: { gap: '10px', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)', textDecoration: 'none' }, title: 'Open risk file' },
      el('span', { class: 'tabular', style: { color: accent, fontWeight: '800', fontSize: '17px', minWidth: '34px', textAlign: 'right' } }, String(r.composite)),
      el('span', { style: { flex: '1 1 auto', minWidth: '0' } },
        el('div', { style: { fontWeight: '600', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, r.name),
        el('div', { class: 'small muted' }, (r.topDimension || '') + ' · ' + fmt.title(String(r.category).replace(/_/g, ' ')))),
      ratingBadgeEl(r.rating));
  });
  return card('Top risks', { sub: 'The five highest composite scores', actions: el('span', { class: 'badge sq neutral' }, 'Ranked') }, ...rows);
}

function concentrationCard(s, data) {
  const c = s.concentration;
  const rows = [
    ['Top vendor spend share', c.topVendorSharePct + '%', c.topVendorSharePct >= 20 ? '#e5a53b' : 'var(--text)'],
    ['Top-3 spend share', c.top3SharePct + '%', c.top3SharePct >= 50 ? '#f0616d' : 'var(--text)'],
    ['Tier-1 critical vendors', String(c.criticalTier1), c.criticalTier1 >= 3 ? '#e5a53b' : 'var(--text)'],
    ['Total annual spend', 'USD ' + fmtThousands(s.totalSpendThousands) + 'k', 'var(--text)'],
  ];
  return card('Concentration & criticality', { sub: 'Spend concentration and Tier-1 dependence', actions: infoDot('High spend concentration or many Tier-1 vendors raises third-party concentration risk.') },
    el('div', {}, ...rows.map(([k, v, color]) => el('div', { class: 'row', style: { gap: '8px', alignItems: 'baseline', padding: '8px 0', borderBottom: '1px solid var(--border)' } },
      el('span', { class: 'small', style: { flex: '1 1 auto', color: 'var(--text-2)' } }, k),
      el('span', { class: 'tabular', style: { fontWeight: '700', color } }, v)))));
}

function categoryCard(s, data) {
  const total = s.total || 1;
  const entries = Object.entries(s.byCategory).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const labelOf = Object.fromEntries(data.categories.map((c) => [c.code, c.label]));
  const rows = entries.map(([code, n]) => el('div', { class: 'row', style: { gap: '8px', alignItems: 'center', padding: '6px 0' } },
    el('span', { style: { flex: '0 0 auto', width: '11px', height: '11px', borderRadius: '3px', background: CAT_COLOUR[code] || 'var(--accent)', display: 'inline-block' } }),
    el('span', { class: 'small', style: { flex: '1 1 auto', color: 'var(--text)' } }, labelOf[code] || code),
    el('div', { style: { flex: '0 0 120px' } }, meter(n / total * 100, CAT_COLOUR[code] || 'var(--accent)')),
    el('span', { class: 'tabular small', style: { flex: '0 0 28px', textAlign: 'right', fontWeight: '700', color: 'var(--text)' } }, String(n))));
  return card('Vendors by category', { sub: `${entries.length} categories represented`, actions: el('span', { class: 'badge sq neutral' }, 'Register' ) }, ...rows);
}

function overdueCard(s) {
  const rows = s.overdueReviews.slice(0, 8).map((o) => el('a', { class: 'row wrap', href: '#/vendors/' + o.vendorId, style: { gap: '10px', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)', textDecoration: 'none' }, title: 'Open risk file' },
    el('span', { class: 'badge med' }, el('span', { class: 'dot' }), `${o.overdueDays}d overdue`),
    el('span', { style: { flex: '1 1 auto', fontWeight: '600', color: 'var(--text)' } }, o.name),
    ratingBadgeEl(o.rating)));
  return card('Overdue re-assessments', { sub: `${s.overdueReviews.length} vendor${s.overdueReviews.length === 1 ? '' : 's'} past the review cadence`, actions: el('span', { class: 'badge med' }, el('span', { class: 'dot' }), 'Action needed') }, ...rows);
}

// ─────────────────────────────────────────────────────────────────────────────
// DETAIL — the vendor risk file
// ─────────────────────────────────────────────────────────────────────────────
async function renderRiskFile(root, vendorId) {
  const panel = el('div', {}, skeleton(300));
  root.append(panel);
  let data;
  try { data = await api.get('/api/vendors/' + encodeURIComponent(vendorId)); }
  catch (e) { panel.replaceChildren(errorState(e.message)); return; }

  const v = data.vendor;
  const accent = RATING_ACCENT[v.rating] || 'var(--accent)';
  const nodes = [];

  // Back link.
  nodes.push(el('div', { style: { marginBottom: '10px' } },
    el('a', { class: 'btn sm ghost', href: '#/vendors/register' }, icon('chevron', 14), 'Back to register')));

  // Header card: identity + composite score + rating.
  nodes.push(el('div', { class: 'card', style: { '--mc': accent, borderLeft: '4px solid ' + accent } },
    el('div', { class: 'card-body' },
      el('div', { class: 'row wrap', style: { gap: '12px', alignItems: 'flex-start' } },
        el('div', { style: { flex: '1 1 320px', minWidth: '0' } },
          el('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center', marginBottom: '4px' } },
            el('span', { style: { fontWeight: '800', color: 'var(--text)', fontSize: '18px' } }, v.name),
            el('span', { class: 'badge sq neutral', style: { borderLeft: '3px solid ' + (CAT_COLOUR[v.category] || 'var(--accent)') } }, v.categoryLabel)),
          el('div', { class: 'small muted' }, `${v.vendorId} · ${v.jurisdictionLabel || v.homeJurisdiction || '—'} · ${v.criticalityLabel} · USD ${fmtThousands(v.annualSpend)}k / yr · ${fmt.title(String(v.contractStatus).replace(/_/g, ' '))} contract`)),
        el('div', { style: { flex: '0 0 auto', textAlign: 'right' } },
          el('div', { class: 'tabular', style: { color: accent, fontWeight: '800', fontSize: '34px', lineHeight: '1' } }, String(v.composite)),
          el('div', { style: { marginTop: '4px' } }, ratingBadgeEl(v.rating)),
          el('div', { class: 'small muted', style: { marginTop: '2px' } }, 'composite / 100'))),
      el('div', { style: { marginTop: '10px' } }, meter(v.composite, accent)),
      el('div', { class: 'small muted', style: { marginTop: '6px' } }, v.ratingBlurb),
      // Sanctions override banner, if applied.
      v.override && v.override.applied ? el('div', { class: 'intro', role: 'note', style: { marginTop: '10px', '--mc': '#c1121f' } },
        el('span', { class: 'ico' }, icon('alert', 18)),
        el('div', { class: 't' }, el('b', {}, 'Sanctions override. '), v.override.reason)) : null)));

  // Dimension breakdown — the per-dimension contributions with a meter each.
  nodes.push(dimensionCard(v));

  // Two-up: linked Nexus entity + jurisdiction context.
  nodes.push(el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '14px' } },
    linkedEntityCard(data),
    jurisdictionCard(data)));

  // Screening hits.
  nodes.push(screeningCard(data));

  // Recommended actions.
  nodes.push(actionsCard(v));

  // Review disposition.
  nodes.push(reviewCard(v, vendorId));

  nodes.push(disclaimerNote(data.disclaimer));
  panel.replaceChildren(...nodes);
}

function dimensionCard(v) {
  const rows = v.dimensions.map((d) => {
    const frac = d.weight / v.totalWeight;
    return el('div', { style: { padding: '9px 0', borderBottom: '1px solid var(--border)' } },
      el('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center' } },
        el('span', { style: { flex: '1 1 200px', fontWeight: '600', color: 'var(--text)' } }, d.label),
        el('span', { class: 'small muted', title: 'Dimension weight in the composite' }, 'weight ' + Math.round(frac * 100) + '%'),
        el('span', { class: 'tabular', style: { fontWeight: '800', color: 'var(--text)', minWidth: '46px', textAlign: 'right' }, title: 'Points contributed to the composite (out of 100)' }, d.points.toFixed(1)),
        el('span', { class: 'small muted tabular', style: { minWidth: '52px', textAlign: 'right' }, title: 'Share of the final composite score' }, d.contributionPct + '%')),
      el('div', { style: { marginTop: '5px' } }, meter(d.normalised * 100, dimColour(d.key))),
      el('div', { class: 'small muted', style: { marginTop: '4px' } }, d.explanation));
  });
  return card('Risk breakdown', { sub: `Composite ${v.composite}/100 from ${v.dimensions.length} weighted dimensions · every point is attributable`, actions: el('span', { class: 'badge sq neutral' }, 'Explainable') },
    ...rows,
    el('div', { class: 'small muted', style: { marginTop: '8px', fontStyle: 'italic' } }, v.override && v.override.applied ? 'Note: a sanctions override floored this composite — see the banner above.' : 'The composite is the weighted average of the dimension bars, scaled to 0–100.'));
}

function linkedEntityCard(data) {
  const le = data.linkedEntity;
  if (!le) {
    return card('Linked Sovereign Nexus entity', { sub: 'Ownership / flight-risk source' },
      emptyState('No Nexus link on file', 'This vendor is not linked to a seeded entity, so ownership and flight-risk could not be pulled — perform primary UBO due diligence.'));
  }
  const fr = le.flightRisk;
  const frColor = fr ? (fr.score >= 66 ? '#f0616d' : fr.score >= 33 ? '#e5a53b' : '#46b877') : 'var(--text)';
  return card('Linked Sovereign Nexus entity', { sub: 'Ownership / flight-risk pulled from the entity graph', actions: el('a', { class: 'btn sm ghost', href: '#/nexus/directory', title: 'Open the Nexus entity directory' }, icon('nexus', 14), 'Nexus') },
    el('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center', marginBottom: '8px' } },
      el('span', { class: 'mc-icon', style: { color: '#4d8df0' } }, icon('nexus', 18)),
      el('span', { style: { fontWeight: '700', color: 'var(--text)' } }, le.legal_name),
      el('span', { class: 'badge sq neutral' }, le.jurisdiction || '—'),
      le.risk_flag ? riskBadge(le.risk_flag) : null,
      el('span', { class: 'small muted tabular' }, le.id)),
    fr ? el('div', {},
      el('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center', marginBottom: '6px' } },
        el('span', { class: 'small muted' }, 'Flight-risk score:'),
        el('span', { class: 'tabular', style: { color: frColor, fontWeight: '800', fontSize: '16px' } }, String(fr.score)),
        el('span', { class: 'badge ' + (fr.band === 'High' ? 'high' : fr.band === 'Medium' ? 'med' : 'low') }, el('span', { class: 'dot' }), fr.band),
        el('div', { style: { flex: '1 1 120px' } }, meter(fr.score, frColor))),
      fr.factors && fr.factors.length ? el('div', { class: 'small muted' }, 'Top factors: ' + fr.factors.slice(0, 3).map((f) => f.label).join(', ')) : null)
      : el('div', { class: 'small muted' }, 'No flight-risk factors returned for this entity.'));
}

function jurisdictionCard(data) {
  const j = data.jurisdiction;
  if (!j) return card('Jurisdiction context', {}, emptyState('No jurisdiction on file'));
  const color = j.secrecy >= 75 ? '#f0616d' : j.secrecy >= 60 ? '#e5a53b' : '#46b877';
  return card('Jurisdiction context', { sub: 'Home-jurisdiction secrecy risk', actions: j.offshore ? el('span', { class: 'badge high' }, el('span', { class: 'dot' }), 'Offshore') : el('span', { class: 'badge low' }, el('span', { class: 'dot' }), 'Onshore') },
    el('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center', marginBottom: '8px' } },
      el('span', { style: { fontWeight: '700', color: 'var(--text)' } }, j.name),
      el('span', { class: 'badge sq neutral' }, j.code)),
    el('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center' } },
      el('span', { class: 'small muted' }, 'Secrecy score:'),
      el('span', { class: 'tabular', style: { color, fontWeight: '800', fontSize: '16px' } }, String(j.secrecy)),
      el('span', { class: 'small muted' }, '/ 100'),
      el('div', { style: { flex: '1 1 120px' } }, meter(j.secrecy, color))),
    el('div', { class: 'small muted', style: { marginTop: '6px' } }, j.secrecy >= 75 ? 'A high-secrecy jurisdiction — enhanced due diligence is warranted.' : j.secrecy >= 60 ? 'Elevated secrecy — document the engagement rationale.' : 'A lower-secrecy jurisdiction.'));
}

function screeningCard(data) {
  const sc = data.screening;
  if (!sc || !sc.matches.length) {
    return card('Screening & Watchlist', { sub: 'Sanctions / PEP / adverse-media / internal', actions: el('span', { class: 'badge low' }, el('span', { class: 'dot' }), 'Clean') },
      el('div', { class: 'row', style: { gap: '8px', alignItems: 'center' } }, icon('check', 16), el('span', { class: 'small muted' }, `No synthetic watchlist candidate matched "${sc ? sc.query : ''}". A clean screen is recorded.`)));
  }
  const listAccent = { sanctions: '#f0616d', pep: '#e5a53b', 'adverse-media': '#a97bf0', internal: '#4d8df0' };
  const rows = sc.matches.map((m) => {
    const a = listAccent[m.list] || 'var(--accent)';
    return el('div', { style: { padding: '9px 0', borderBottom: '1px solid var(--border)' } },
      el('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center' } },
        el('span', { class: 'mc-icon', style: { color: a } }, icon(m.list === 'sanctions' ? 'alert' : m.list === 'internal' ? 'folder' : 'nexus', 16)),
        el('span', { style: { fontWeight: '600', color: 'var(--text)' } }, m.matchedName),
        m.matchedName !== m.listedName ? el('span', { class: 'small muted' }, '↳ ' + m.listedName) : null,
        el('span', { class: 'spacer' }),
        el('span', { class: 'badge sq neutral' }, m.listLabel),
        el('span', { class: 'tabular', style: { color: a, fontWeight: '800' } }, String(m.score)),
        el('span', { class: 'badge ' + (m.band === 'strong' ? 'high' : m.band === 'possible' ? 'med' : 'low') }, fmt.title(m.band))),
      m.why && m.why.length ? el('div', { class: 'small muted', style: { marginTop: '3px' } }, m.why.map((w) => w.detail).join(' ')) : null);
  });
  return card('Screening & Watchlist', { sub: `${sc.matches.length} synthetic candidate${sc.matches.length === 1 ? '' : 's'} for "${sc.query}"`, actions: el('a', { class: 'btn sm ghost', href: '#/screening/search', title: 'Open Screening & Watchlist' }, icon('alert', 14), 'Screen') },
    ...rows,
    el('div', { class: 'small muted', style: { marginTop: '6px', fontStyle: 'italic' } }, 'Synthetic matches — not an allegation. Disposition in Screening & Watchlist.'));
}

function actionsCard(v) {
  const rows = v.recommendedActions.map((a) => el('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid var(--border)' } },
    el('span', { class: 'badge ' + (PRIORITY_BADGE[a.priority] || 'neutral'), style: { flex: '0 0 auto' } }, el('span', { class: 'dot' }), a.priority),
    el('span', { style: { flex: '1 1 auto' } },
      el('div', { style: { fontWeight: '600', color: 'var(--text)' } }, a.action),
      el('div', { class: 'small muted', style: { marginTop: '2px' } }, a.rationale))));
  return card('Recommended due-diligence actions', { sub: `${v.recommendedActions.length} prioritised action${v.recommendedActions.length === 1 ? '' : 's'}`, actions: el('span', { class: 'badge sq neutral' }, 'Deterministic') }, ...rows);
}

function reviewCard(v, vendorId) {
  const cur = v.review && v.review.status ? v.review.status : 'open';
  const statusEl = el('span', {}, reviewBadge(cur));
  const noteInput = el('input', { type: 'text', 'aria-label': 'Review note', placeholder: 'Disposition note (optional)…', style: { width: '100%' }, value: v.review && v.review.note ? v.review.note : '' });
  const doReview = async (status) => {
    try {
      const out = await api.post('/api/vendors/' + encodeURIComponent(vendorId) + '/review', { status, note: noteInput.value });
      statusEl.replaceChildren(reviewBadge(out.review.status));
      toast('Review recorded: ' + out.review.status, { type: 'success' });
    } catch (e) { toast(e.message, { type: 'error' }); }
  };
  return card('Review disposition', { sub: 'Record an audited due-diligence decision for this vendor', actions: statusEl },
    el('div', { class: 'field' }, el('label', {}, 'Note'), noteInput),
    el('div', { class: 'row wrap', style: { gap: '8px', marginTop: '10px' } },
      el('button', { class: 'btn sm', title: 'Approve this vendor', onclick: () => doReview('approved') }, icon('check', 14), 'Approve'),
      el('button', { class: 'btn sm ghost', title: 'Approve subject to conditions', onclick: () => doReview('approved-with-conditions') }, icon('check', 14), 'Approve w/ conditions'),
      el('button', { class: 'btn sm ghost', title: 'Escalate for senior review', onclick: () => doReview('escalated') }, icon('alert', 14), 'Escalate'),
      el('button', { class: 'btn sm ghost', title: 'Reject this vendor', onclick: () => doReview('rejected') }, icon('close', 14), 'Reject')),
    v.review && v.review.ts ? el('div', { class: 'small muted', style: { marginTop: '8px' } }, `Last disposition ${fmt.date(v.review.ts)} by ${v.review.reviewer || 'analyst'}.`) : null);
}

// ── Shared small helpers ─────────────────────────────────────────────────────
function ratingBadgeEl(rating) {
  const cls = RATING_BADGE[rating] || 'neutral';
  return el('span', { class: 'badge ' + cls, title: rating + ' risk', style: rating === 'Critical' ? { background: 'rgba(193,18,31,0.18)', color: '#ff8a94', borderColor: 'rgba(193,18,31,0.5)' } : null }, el('span', { class: 'dot' }), rating);
}
function reviewBadge(status) {
  if (status === 'approved') return el('span', { class: 'badge low' }, el('span', { class: 'dot' }), 'Approved');
  if (status === 'approved-with-conditions') return el('span', { class: 'badge med' }, el('span', { class: 'dot' }), 'Approved w/ conditions');
  if (status === 'escalated') return el('span', { class: 'badge high' }, el('span', { class: 'dot' }), 'Escalated');
  if (status === 'rejected') return el('span', { class: 'badge high' }, el('span', { class: 'dot' }), 'Rejected');
  return el('span', { class: 'badge sq neutral' }, 'Open');
}
function kpiChip(label, value, colour) {
  return el('div', { class: 'card', style: { flex: '1 1 120px', padding: '10px 12px' } },
    el('div', { class: 'small muted' }, label),
    el('div', { class: 'tabular', style: { fontWeight: '800', fontSize: '20px', color: colour || 'var(--text)' } }, String(value)));
}
function filterChip(code, label, onclick) {
  const c = el('button', { type: 'button', class: 'chip' + (code === '' ? ' on' : ''), 'aria-pressed': code === '' ? 'true' : 'false', onclick }, label);
  c._code = code;
  return c;
}
function syncChips(chips, code) { for (const c of chips) { const on = c._code === code; c.classList.toggle('on', on); c.setAttribute('aria-pressed', on ? 'true' : 'false'); } }
function fieldWrap(label, ctrl) { return el('div', { class: 'field', style: { flex: '1 1 150px' } }, el('label', {}, label), ctrl); }
function selectStyle() { return { padding: '7px 10px', background: 'var(--surface-2, #131924)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '14px', width: '100%' }; }
function labelFor(sorts, key) { const s = sorts.find((x) => x[0] === key); return s ? s[1] : key; }
function dimColour(key) { return { ownership: '#4d8df0', sanctions: '#f0616d', jurisdiction: '#a97bf0', financial: '#37c2b4', adverse: '#e5a53b', governance: '#7d8aa0' }[key] || 'var(--accent)'; }
function fmtThousands(n) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function disclaimerNote(text) {
  return el('div', { class: 'intro', style: { marginTop: '18px' } }, el('span', { class: 'ico' }, icon('info', 18)), el('div', { class: 't' }, el('b', {}, 'Not a system of record. '), text));
}
