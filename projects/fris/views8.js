// View: Adverse-Media / OSINT Monitoring — a deterministic negative-news
// monitoring console over a SYNTHETIC news corpus. Each mention is classified by
// risk category, severity and sentiment from keyword signals, graded by source
// credibility, and linked to seeded FRIS entities / vendors by id so mentions
// roll up per subject and line up with Screening and Vendor Risk. Two sub-views:
// a severity/category-coloured monitoring FEED (filterable, paginated) with
// click-through to an item DETAIL (classification explanation, linked subjects,
// relevance disposition), and a WATCH dashboard (mentions by category/severity,
// top flagged subjects). Renders in-page within the shell (never a viewport
// takeover), accessible, and clearly labelled as synthetic. The DOM is kept
// light (the feed caps/paginates) so the view stays fast and e2e-safe.
import { el, api, fmt, icon, card, toast, emptyState, errorState, skeleton, meter, infoDot } from './core.js';
import { pageHead, intro } from './views1.js';

// Severity → colour/badge mapping (reuses the High/Medium/Low palette, plus a
// deeper red for Critical and a muted tone for Info).
const SEV_ACCENT = { Critical: '#c1121f', High: '#f0616d', Medium: '#e5a53b', Low: '#4d8df0', Info: '#7d8aa0' };
const SEV_BADGE = { Critical: 'high', High: 'high', Medium: 'med', Low: 'low', Info: 'neutral' };
const CAT_COLOUR = { financial_crime: '#f0616d', fraud: '#e5548a', sanctions: '#c1121f', corruption: '#d98c4a', litigation: '#a97bf0', regulatory: '#4d8df0', esg: '#37c2b4', cyber: '#7d8aa0', insolvency: '#8a94a6', reputational: '#9aa4b2' };
const SENT_LABEL = { negative: 'Negative', neutral: 'Neutral', mixed: 'Mixed' };
const RISK_BADGE = { None: 'low', Low: 'low', Elevated: 'med', High: 'high', Severe: 'high' };
const PAGE_SIZE = 12; // keep the feed DOM light — paginate at a dozen cards.

export async function adverseMedia(root, parts) {
  root.append(pageHead('Adverse-Media / OSINT Monitoring', 'Open-source intelligence (OSINT): a deterministic negative-news monitoring feed — mentions classified by risk category, severity and sentiment, graded by source credibility, and rolled up per linked entity / vendor', [
    el('a', { class: 'btn sm', href: '#/screening/portfolio', title: 'Portfolio screening (the sanctions/PEP signal these mentions corroborate)' }, icon('alert', 15), 'Screening'),
  ]));
  root.append(intro('Adverse-Media / OSINT Monitoring',
    'scans a fictional corpus of news-style mentions and classifies each one deterministically — a risk category (financial crime, fraud, sanctions, corruption, litigation, regulatory, ESG, cyber, insolvency or reputational), a severity, a sentiment, and a source-credibility grade — then links it to the seeded FRIS entities and vendors it concerns so mentions roll up into a per-subject adverse-media profile. Read the monitoring feed, filter by category or severity, open any mention to see exactly why it was classified and which subjects it touches, disposition it as relevant or not, or open the watch dashboard for mentions by category / severity and the top flagged subjects.'));

  // Honesty banner.
  root.append(el('div', { class: 'intro', role: 'note', style: { marginTop: '10px', '--mc': '#c1121f' } },
    el('span', { class: 'ico' }, icon('info', 18)),
    el('div', { class: 't' }, el('b', {}, 'Synthetic data — not a system of record. '),
      'Every mention, headline, outlet, date and classification is FICTIONAL and generated deterministically; NOTHING here refers to a real person, company, publication or event, and no item may be read as a factual allegation against any real party. Source-credibility grades and severities are illustrative. This is NOT an adverse-media / OSINT system of record.')));

  // A detail route (#/adverse-media/AM-0001) opens the item; otherwise the tabs.
  if (parts[0] && /^AM-/i.test(parts[0])) {
    const body = el('div', { class: 'mt' });
    root.append(body);
    await renderItemDetail(body, parts[0].toUpperCase());
    return;
  }
  // A subject route (#/adverse-media/subject/VEN-0003) opens a subject profile.
  if (parts[0] === 'subject' && parts[1]) {
    const body = el('div', { class: 'mt' });
    root.append(body);
    await renderSubjectProfile(body, parts[1].toUpperCase());
    return;
  }

  // ── Sub-tab router (feed · dashboard) ────────────────────────────────────────
  const TABS = [
    ['feed', 'Monitoring feed', 'bell'],
    ['dashboard', 'Watch dashboard', 'overview'],
  ];
  const active = TABS.some((t) => t[0] === parts[0]) ? parts[0] : 'feed';
  const tabBar = el('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Adverse-media views', style: { margin: '14px 0 6px' } },
    ...TABS.map(([id, label, ic]) => el('a', {
      class: 'tab' + (id === active ? ' active' : ''), href: '#/adverse-media/' + id, role: 'tab',
      'aria-selected': id === active ? 'true' : 'false',
    }, icon(ic, 15), label)));
  root.append(tabBar);

  const body = el('div', { class: 'mt' });
  root.append(body);

  if (active === 'dashboard') await renderDashboard(body);
  else await renderFeed(body);
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1 — Monitoring feed (severity/category-coloured cards, filters, paginated)
// ─────────────────────────────────────────────────────────────────────────────
async function renderFeed(root) {
  const panel = el('div', {}, skeleton(220));
  root.append(panel);

  let data;
  try { data = await api.get('/api/adverse-media/feed'); }
  catch (e) { panel.replaceChildren(errorState(e.message)); return; }
  if (!data.items.length) { panel.replaceChildren(emptyState('No adverse-media mentions in the corpus')); return; }

  const state = { category: '', severity: '', sentiment: '', q: '', page: 0 };

  // Severity filter chips (worst-first).
  const sevOrder = ['Critical', 'High', 'Medium', 'Low', 'Info'];
  const sevChips = [['', 'All severities'], ...sevOrder.map((c) => [c, c])].map(([code, label]) => filterChip(code, label, () => { state.severity = code; state.page = 0; syncChips(sevChips, code); refresh(); }));
  // Category select (ten categories).
  const catSelect = el('select', { class: 'fin-select', 'aria-label': 'Filter by category', style: selectStyle(), onchange: (e) => { state.category = e.target.value; state.page = 0; refresh(); } },
    el('option', { value: '' }, 'All categories'),
    ...data.categories.map((c) => el('option', { value: c.code }, c.label)));
  // Sentiment select.
  const sentSelect = el('select', { class: 'fin-select', 'aria-label': 'Filter by sentiment', style: selectStyle(), onchange: (e) => { state.sentiment = e.target.value; state.page = 0; refresh(); } },
    el('option', { value: '' }, 'All sentiment'),
    ...data.sentiments.map((s) => el('option', { value: s.code }, s.label)));
  // Search.
  const searchInput = el('input', { type: 'text', 'aria-label': 'Search mentions', placeholder: 'Search headlines, subjects…', style: { width: '100%' }, oninput: (e) => { state.q = e.target.value; state.page = 0; refresh(); } });

  const listWrap = el('div', {});

  panel.replaceChildren(
    card('Monitoring feed', { sub: `${data.grandTotal} synthetic mentions · v${data.version.version} · as of ${data.asOf}`, actions: el('span', { class: 'badge sq neutral' }, 'Synthetic') },
      el('div', { class: 'row wrap', style: { gap: '6px', marginBottom: '8px' } }, el('span', { class: 'small muted', style: { alignSelf: 'center', marginRight: '4px' } }, 'Severity:'), ...sevChips),
      el('div', { class: 'row wrap', style: { gap: '10px', marginBottom: '8px', alignItems: 'flex-end' } },
        fieldWrap('Category', catSelect),
        fieldWrap('Sentiment', sentSelect),
        el('div', { class: 'field', style: { flex: '2 1 220px' } }, el('label', {}, 'Search'), searchInput)),
      el('div', { class: 'small muted', style: { marginBottom: '2px' } }, 'Click a mention to open its classification and linked subjects.')),
    listWrap);

  function currentRows() {
    const q = state.q.trim().toLowerCase();
    return data.items.filter((m) =>
      (!state.category || m.category === state.category) &&
      (!state.severity || m.severity === state.severity) &&
      (!state.sentiment || m.sentiment === state.sentiment) &&
      (!q || (`${m.headline} ${m.snippet} ${(m.subjects || []).map((s) => s.name).join(' ')}`).toLowerCase().includes(q)));
  }

  function refresh() {
    const rows = currentRows();
    if (!rows.length) { listWrap.replaceChildren(emptyState('No mentions match these filters', 'Loosen a filter, clear the search, or reset the severity.')); return; }
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (state.page >= pages) state.page = pages - 1;
    const slice = rows.slice(state.page * PAGE_SIZE, state.page * PAGE_SIZE + PAGE_SIZE);

    const caption = el('div', { class: 'small muted', style: { margin: '2px 0 8px' } }, `${rows.length} mention${rows.length === 1 ? '' : 's'} · ranked by severity then recency`);
    const cards = slice.map((m) => feedCard(m));

    // Pager (only when more than one page — keeps DOM minimal otherwise).
    const pager = pages > 1 ? el('div', { class: 'row wrap', style: { gap: '8px', alignItems: 'center', justifyContent: 'center', marginTop: '10px' } },
      el('button', { class: 'btn sm ghost', 'aria-label': 'Previous page', disabled: state.page <= 0 ? true : null, onclick: () => { if (state.page > 0) { state.page--; refresh(); } } }, icon('chevron', 14), 'Prev'),
      el('span', { class: 'small muted' }, `Page ${state.page + 1} of ${pages}`),
      el('button', { class: 'btn sm ghost', 'aria-label': 'Next page', disabled: state.page >= pages - 1 ? true : null, onclick: () => { if (state.page < pages - 1) { state.page++; refresh(); } } }, 'Next', icon('chevron', 14))) : null;

    listWrap.replaceChildren(caption, el('div', { style: { display: 'grid', gap: '10px' } }, ...cards), ...(pager ? [pager] : []));
  }
  refresh();
}

// One feed card: a severity-accented, clickable mention summary.
function feedCard(m) {
  const accent = SEV_ACCENT[m.severity] || 'var(--accent)';
  const catColor = CAT_COLOUR[m.category] || 'var(--accent)';
  const dispositioned = m.disposition && m.disposition.status && m.disposition.status !== 'open';
  return el('a', {
    class: 'card am-card', href: '#/adverse-media/' + m.id,
    style: { '--mc': accent, borderLeft: '4px solid ' + accent, display: 'block', textDecoration: 'none', padding: '0' },
    title: 'Open classification detail', 'aria-label': `${m.headline} — ${m.severity} severity, ${m.categoryLabel}`,
  },
    el('div', { style: { padding: '12px 14px' } },
      el('div', { class: 'row wrap', style: { gap: '8px', alignItems: 'center', marginBottom: '4px' } },
        severityBadge(m.severity),
        el('span', { class: 'badge sq neutral', style: { borderLeft: '3px solid ' + catColor } }, m.categoryLabel),
        el('span', { class: 'badge sq neutral', title: 'Sentiment' }, SENT_LABEL[m.sentiment] || m.sentiment),
        el('span', { class: 'spacer' }),
        dispositioned ? dispositionBadge(m.disposition.status) : null,
        el('span', { class: 'small muted tabular', title: 'Adverse-media impact score' }, 'impact ' + m.impact)),
      el('div', { style: { fontWeight: '600', color: 'var(--text)', marginBottom: '3px' } }, m.headline),
      el('div', { class: 'small muted', style: { marginBottom: '6px' } }, m.snippet),
      el('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center' } },
        el('span', { class: 'small muted' }, m.outletName),
        el('span', { class: 'small muted', title: 'Source credibility grade' }, '· ' + Math.round((m.credibility || 0) * 100) + '% cred'),
        el('span', { class: 'small muted tabular' }, '· ' + m.date),
        el('span', { class: 'spacer' }),
        ...(m.subjects || []).slice(0, 3).map((s) => el('span', { class: 'badge sq neutral', title: s.type === 'vendor' ? 'Linked vendor' : 'Linked entity' }, icon(s.type === 'vendor' ? 'folder' : 'nexus', 12), ' ', s.name)))));
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2 — Watch dashboard (mentions by category/severity, top flagged subjects)
// ─────────────────────────────────────────────────────────────────────────────
async function renderDashboard(root) {
  const panel = el('div', {}, skeleton(240));
  root.append(panel);
  let data;
  try { data = await api.get('/api/adverse-media/feed'); }
  catch (e) { panel.replaceChildren(errorState(e.message)); return; }

  const nodes = [];
  const f = data.facets;

  // KPI strip.
  const criticalCount = (f.bySeverity.find((s) => s.code === 'Critical') || {}).count || 0;
  const highCount = (f.bySeverity.find((s) => s.code === 'High') || {}).count || 0;
  const negCount = (f.bySentiment.find((s) => s.code === 'negative') || {}).count || 0;
  const subjectCount = new Set(data.items.flatMap((m) => (m.subjects || []).map((s) => s.id))).size;
  nodes.push(el('div', { class: 'row wrap', style: { gap: '10px', marginBottom: '12px' } },
    kpiChip('Mentions', data.grandTotal),
    kpiChip('Critical', criticalCount, SEV_ACCENT.Critical),
    kpiChip('High', highCount, SEV_ACCENT.High),
    kpiChip('Negative', negCount, '#f0616d'),
    kpiChip('Flagged subjects', subjectCount)));

  // Mentions by severity — a horizontal stacked bar + legend (pure geometry).
  nodes.push(severityDistributionCard(f, data.grandTotal, data.asOf));

  // Two-up: mentions by category + top flagged subjects.
  nodes.push(el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px' } },
    categoryCard(f),
    await topSubjectsCard(data)));

  nodes.push(disclaimerNote(data.disclaimer));
  panel.replaceChildren(...nodes);
}

function severityDistributionCard(f, total, asOf) {
  const order = ['Critical', 'High', 'Medium', 'Low', 'Info'];
  const t = total || 1;
  const segs = order.map((code) => ({ code, n: (f.bySeverity.find((s) => s.code === code) || {}).count || 0, color: SEV_ACCENT[code] })).filter((x) => x.n > 0);
  const bar = el('div', { class: 'am-sevbar', role: 'img', 'aria-label': 'Mentions by severity: ' + order.map((c) => `${(f.bySeverity.find((s) => s.code === c) || {}).count || 0} ${c}`).join(', '), style: { display: 'flex', width: '100%', height: '26px', borderRadius: '7px', overflow: 'hidden', border: '1px solid var(--border)' } },
    ...segs.map((x) => el('div', { title: `${x.code}: ${x.n}`, style: { width: (x.n / t * 100) + '%', background: x.color, minWidth: '2px' } })));
  const legend = el('div', { class: 'row wrap', style: { gap: '14px', marginTop: '10px' } },
    ...order.map((c) => el('span', { class: 'row', style: { gap: '6px', alignItems: 'center' } },
      el('span', { style: { width: '11px', height: '11px', borderRadius: '3px', background: SEV_ACCENT[c], display: 'inline-block' } }),
      el('span', { class: 'small' }, `${c}: `),
      el('span', { class: 'small tabular', style: { fontWeight: '700', color: 'var(--text)' } }, String((f.bySeverity.find((s) => s.code === c) || {}).count || 0)))));
  return card('Mentions by severity', { sub: `Severity distribution across ${total} mentions`, actions: el('span', { class: 'badge sq neutral' }, 'As of ' + asOf) }, bar, legend);
}

function categoryCard(f) {
  const entries = f.byCategory.filter((c) => c.count > 0).slice().sort((a, b) => (b.count - a.count) || a.code.localeCompare(b.code));
  const total = f.byCategory.reduce((a, c) => a + c.count, 0) || 1;
  const rows = entries.map((c) => el('div', { class: 'row', style: { gap: '8px', alignItems: 'center', padding: '6px 0' } },
    el('span', { style: { flex: '0 0 auto', width: '11px', height: '11px', borderRadius: '3px', background: CAT_COLOUR[c.code] || 'var(--accent)', display: 'inline-block' } }),
    el('span', { class: 'small', style: { flex: '1 1 auto', color: 'var(--text)' } }, c.label),
    el('div', { style: { flex: '0 0 120px' } }, meter(c.count / total * 100, CAT_COLOUR[c.code] || 'var(--accent)')),
    el('span', { class: 'tabular small', style: { flex: '0 0 28px', textAlign: 'right', fontWeight: '700', color: 'var(--text)' } }, String(c.count))));
  return card('Mentions by category', { sub: `${entries.length} categories represented`, actions: el('span', { class: 'badge sq neutral' }, 'Corpus') }, ...rows);
}

// Top flagged subjects — roll every mention up per subject and show the highest
// adverse-media scores. Built client-side from the feed so it needs no extra
// endpoint and stays deterministic with the feed data.
async function topSubjectsCard(data) {
  // Aggregate a compact per-subject summary from the classified feed.
  const bySubj = new Map();
  for (const m of data.items) {
    for (const s of (m.subjects || [])) {
      if (!bySubj.has(s.id)) bySubj.set(s.id, { id: s.id, name: s.name, type: s.type, count: 0, peakRank: -1, peakSeverity: 'Info', topImpact: 0 });
      const e = bySubj.get(s.id);
      e.count++;
      const rank = { Critical: 4, High: 3, Medium: 2, Low: 1, Info: 0 }[m.severity] ?? 0;
      if (rank > e.peakRank) { e.peakRank = rank; e.peakSeverity = m.severity; }
      if (m.impact > e.topImpact) e.topImpact = m.impact;
    }
  }
  const rows = [...bySubj.values()]
    .sort((a, b) => (b.peakRank - a.peakRank) || (b.topImpact - a.topImpact) || (b.count - a.count) || a.id.localeCompare(b.id))
    .slice(0, 8)
    .map((s) => {
      const accent = SEV_ACCENT[s.peakSeverity] || 'var(--accent)';
      return el('a', { class: 'row wrap', href: '#/adverse-media/subject/' + s.id, style: { gap: '10px', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)', textDecoration: 'none' }, title: 'Open adverse-media profile' },
        el('span', { class: 'mc-icon', style: { color: accent, flex: '0 0 auto' } }, icon(s.type === 'vendor' ? 'folder' : 'nexus', 16)),
        el('span', { style: { flex: '1 1 auto', minWidth: '0' } },
          el('div', { style: { fontWeight: '600', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, s.name),
          el('div', { class: 'small muted' }, `${s.count} mention${s.count === 1 ? '' : 's'} · peak ${s.peakSeverity}`)),
        severityBadge(s.peakSeverity));
    });
  return card('Top flagged subjects', { sub: 'Subjects ranked by peak severity across their mentions', actions: el('span', { class: 'badge sq neutral' }, 'Rolled up') }, ...(rows.length ? rows : [emptyState('No flagged subjects')]));
}

// ─────────────────────────────────────────────────────────────────────────────
// DETAIL — a single mention: classification explanation, subjects, disposition
// ─────────────────────────────────────────────────────────────────────────────
async function renderItemDetail(root, itemId) {
  const panel = el('div', {}, skeleton(300));
  root.append(panel);
  let data;
  try { data = await api.get('/api/adverse-media/' + encodeURIComponent(itemId)); }
  catch (e) { panel.replaceChildren(errorState(e.message)); return; }

  const m = data.item;
  const accent = SEV_ACCENT[m.severity] || 'var(--accent)';
  const catColor = CAT_COLOUR[m.category] || 'var(--accent)';
  const nodes = [];

  // Back link.
  nodes.push(el('div', { style: { marginBottom: '10px' } },
    el('a', { class: 'btn sm ghost', href: '#/adverse-media/feed' }, icon('chevron', 14), 'Back to feed')));

  // Header card: the mention + its classification chips.
  nodes.push(el('div', { class: 'card', style: { '--mc': accent, borderLeft: '4px solid ' + accent } },
    el('div', { class: 'card-body' },
      el('div', { class: 'row wrap', style: { gap: '8px', alignItems: 'center', marginBottom: '6px' } },
        severityBadge(m.severity),
        el('span', { class: 'badge sq neutral', style: { borderLeft: '3px solid ' + catColor } }, m.categoryLabel),
        el('span', { class: 'badge sq neutral', title: 'Sentiment' }, SENT_LABEL[m.sentiment] || m.sentiment),
        el('span', { class: 'spacer' }),
        el('span', { class: 'small muted tabular', title: 'Adverse-media impact score' }, 'impact ' + m.impact + '/100')),
      el('div', { style: { fontWeight: '800', color: 'var(--text)', fontSize: '18px', marginBottom: '6px' } }, m.headline),
      el('div', { class: 'small', style: { color: 'var(--text-2)', marginBottom: '8px' } }, m.snippet),
      el('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center' } },
        el('span', { class: 'small muted' }, m.outletName),
        el('span', { class: 'badge sq neutral', title: 'Source tier' }, m.outletTier || 'source'),
        el('div', { class: 'row', style: { gap: '6px', alignItems: 'center' } }, el('span', { class: 'small muted' }, 'credibility'), el('div', { style: { width: '90px' } }, meter((m.credibility || 0) * 100, m.credibility >= 0.8 ? '#46b877' : m.credibility >= 0.6 ? '#e5a53b' : '#f0616d')), el('span', { class: 'small tabular' }, Math.round((m.credibility || 0) * 100) + '%')),
        el('span', { class: 'small muted tabular', style: { marginLeft: 'auto' } }, m.date)))));

  // Classification explanation — the why-trail.
  nodes.push(classificationCard(m));

  // Linked subjects — each with its adverse-media roll-up + cross-links.
  nodes.push(subjectsCard(data.subjects));

  // Relevance disposition.
  nodes.push(dispositionCard(m, itemId));

  nodes.push(disclaimerNote(data.disclaimer));
  panel.replaceChildren(...nodes);
}

function classificationCard(m) {
  const catRows = (m.categoryScores || []).map((c) => el('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' } },
    el('span', { style: { flex: '0 0 auto', width: '11px', height: '11px', borderRadius: '3px', background: CAT_COLOUR[c.code] || 'var(--accent)', display: 'inline-block' } }),
    el('span', { style: { flex: '1 1 auto', fontWeight: c.code === m.category ? '700' : '500', color: 'var(--text)' } }, c.label, c.code === m.category ? el('span', { class: 'badge sq neutral', style: { marginLeft: '8px' } }, 'assigned') : null),
    el('span', { class: 'small muted' }, `${c.score} signal${c.score === 1 ? '' : 's'}`),
    el('span', { class: 'small muted', style: { flex: '2 1 160px', textAlign: 'right' } }, (c.hits || []).slice(0, 4).join(', '))));
  const whyRows = (m.why || []).map((w) => el('div', { class: 'row wrap', style: { gap: '8px', alignItems: 'flex-start', padding: '6px 0' } },
    el('span', { class: 'badge sq neutral', style: { flex: '0 0 auto' } }, w.kind),
    el('span', { class: 'small', style: { flex: '1 1 auto', color: 'var(--text-2)' } }, w.detail)));
  return card('Why this classification', { sub: `Category ${m.categoryLabel} · ${m.severity} severity · intensity ${Math.round((m.intensity || 0) * 100)}/100 — every step is deterministic`, actions: el('span', { class: 'badge sq neutral' }, 'Explainable') },
    el('div', { class: 'small muted', style: { marginBottom: '4px', fontWeight: '600', color: 'var(--text)' } }, 'Category signals matched'),
    ...(catRows.length ? catRows : [el('div', { class: 'small muted' }, 'No strong category signal — classified from context.')]),
    el('div', { class: 'small muted', style: { margin: '10px 0 4px', fontWeight: '600', color: 'var(--text)' } }, 'Severity & sentiment reasoning'),
    ...whyRows);
}

function subjectsCard(subjects) {
  if (!subjects || !subjects.length) return card('Linked subjects', {}, emptyState('No linked subjects'));
  const rows = subjects.map((s) => {
    const accent = s.riskColor || '#7d8aa0';
    const nexusId = s.entityId || (s.entity ? s.entity.id : null);
    const links = [];
    if (nexusId) links.push(el('a', { class: 'btn sm ghost', href: '#/nexus/directory', title: 'Open in Sovereign Nexus' }, icon('nexus', 13), 'Nexus'));
    if (s.vendorId) links.push(el('a', { class: 'btn sm ghost', href: '#/vendors/' + s.vendorId, title: 'Open the vendor risk file' }, icon('folder', 13), 'Vendor'));
    links.push(el('a', { class: 'btn sm ghost', href: '#/adverse-media/subject/' + s.id, title: 'Open adverse-media profile' }, icon('bell', 13), 'Profile'));
    return el('div', { style: { padding: '10px 0', borderBottom: '1px solid var(--border)' } },
      el('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center', marginBottom: '6px' } },
        el('span', { class: 'mc-icon', style: { color: accent, flex: '0 0 auto' } }, icon(s.type === 'vendor' ? 'folder' : 'nexus', 16)),
        el('span', { style: { fontWeight: '700', color: 'var(--text)' } }, s.name),
        s.entity && s.entity.jurisdiction ? el('span', { class: 'badge sq neutral' }, s.entity.jurisdiction) : null,
        el('span', { class: 'small muted tabular' }, s.id),
        el('span', { class: 'spacer' }),
        el('span', { class: 'badge ' + (RISK_BADGE[s.riskBand] || 'neutral'), title: 'Adverse-media risk band' }, el('span', { class: 'dot' }), s.riskBand)),
      el('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center' } },
        el('span', { class: 'small muted' }, 'Adverse-media score:'),
        el('span', { class: 'tabular', style: { color: accent, fontWeight: '800', fontSize: '15px' } }, String(s.adverseMediaScore)),
        el('span', { class: 'small muted' }, `· ${s.itemCount} mention${s.itemCount === 1 ? '' : 's'} · peak ${s.peakSeverity}`),
        el('span', { class: 'spacer' }),
        ...links));
  });
  return card('Linked subjects', { sub: `${subjects.length} subject${subjects.length === 1 ? '' : 's'} this mention concerns — with their rolled-up adverse-media profile`, actions: el('span', { class: 'badge sq neutral' }, 'Cross-module') }, ...rows);
}

function dispositionCard(m, itemId) {
  const cur = m.disposition && m.disposition.status ? m.disposition.status : 'open';
  const statusEl = el('span', {}, dispositionBadge(cur));
  const noteInput = el('input', { type: 'text', 'aria-label': 'Disposition note', placeholder: 'Analyst note (optional)…', style: { width: '100%' }, value: m.disposition && m.disposition.note ? m.disposition.note : '' });
  const doDisposition = async (status) => {
    try {
      const out = await api.post('/api/adverse-media/' + encodeURIComponent(itemId) + '/disposition', { status, note: noteInput.value });
      statusEl.replaceChildren(dispositionBadge(out.disposition.status));
      toast('Disposition recorded: ' + out.disposition.status, { type: 'success' });
    } catch (e) { toast(e.message, { type: 'error' }); }
  };
  return card('Relevance disposition', { sub: 'Record an audited relevance decision for this mention', actions: statusEl },
    el('div', { class: 'field' }, el('label', {}, 'Note'), noteInput),
    el('div', { class: 'row wrap', style: { gap: '8px', marginTop: '10px' } },
      el('button', { class: 'btn sm', title: 'Mark this mention relevant to the subject', onclick: () => doDisposition('relevant') }, icon('check', 14), 'Relevant'),
      el('button', { class: 'btn sm ghost', title: 'Mark this mention not relevant (false positive)', onclick: () => doDisposition('not-relevant') }, icon('close', 14), 'Not relevant'),
      el('button', { class: 'btn sm ghost', title: 'Clear the disposition', onclick: () => doDisposition('open') }, icon('refresh', 14), 'Reset')),
    m.disposition && m.disposition.ts ? el('div', { class: 'small muted', style: { marginTop: '8px' } }, `Last disposition ${fmt.date(m.disposition.ts)}.`) : null);
}

// ─────────────────────────────────────────────────────────────────────────────
// SUBJECT PROFILE — the aggregated adverse-media roll-up for one entity/vendor
// ─────────────────────────────────────────────────────────────────────────────
async function renderSubjectProfile(root, subjectId) {
  const panel = el('div', {}, skeleton(300));
  root.append(panel);
  let data;
  try { data = await api.get('/api/adverse-media/subject/' + encodeURIComponent(subjectId)); }
  catch (e) { panel.replaceChildren(errorState(e.message)); return; }

  const p = data.profile;
  const nodes = [];
  nodes.push(el('div', { style: { marginBottom: '10px' } },
    el('a', { class: 'btn sm ghost', href: '#/adverse-media/feed' }, icon('chevron', 14), 'Back to feed')));

  if (!p.found) {
    nodes.push(card('Adverse-media profile', { sub: subjectId }, emptyState('No adverse-media mentions for this subject', 'A clean adverse-media profile is recorded for this subject.')));
    nodes.push(disclaimerNote(data.disclaimer));
    panel.replaceChildren(...nodes);
    return;
  }

  const accent = p.riskColor || '#7d8aa0';
  // Header: subject + composite adverse-media score.
  const links = [];
  if (data.vendor) links.push(el('a', { class: 'btn sm ghost', href: '#/vendors/' + data.vendor.id, title: 'Open the vendor risk file' }, icon('folder', 13), 'Vendor file'));
  if (data.entity || (data.vendor && data.vendor.entityId)) links.push(el('a', { class: 'btn sm ghost', href: '#/nexus/directory', title: 'Open in Sovereign Nexus' }, icon('nexus', 13), 'Nexus'));
  nodes.push(el('div', { class: 'card', style: { '--mc': accent, borderLeft: '4px solid ' + accent } },
    el('div', { class: 'card-body' },
      el('div', { class: 'row wrap', style: { gap: '12px', alignItems: 'flex-start' } },
        el('div', { style: { flex: '1 1 320px', minWidth: '0' } },
          el('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center', marginBottom: '4px' } },
            el('span', { class: 'mc-icon', style: { color: accent } }, icon(p.subjectType === 'vendor' ? 'folder' : 'nexus', 18)),
            el('span', { style: { fontWeight: '800', color: 'var(--text)', fontSize: '18px' } }, p.subjectName),
            el('span', { class: 'badge sq neutral' }, p.subjectId)),
          el('div', { class: 'small muted' }, `${p.itemCount} mention${p.itemCount === 1 ? '' : 's'} · peak ${p.peakSeverity} · ${p.byCategory.length} categor${p.byCategory.length === 1 ? 'y' : 'ies'}`),
          links.length ? el('div', { class: 'row wrap', style: { gap: '8px', marginTop: '8px' } }, ...links) : null),
        el('div', { style: { flex: '0 0 auto', textAlign: 'right' } },
          el('div', { class: 'tabular', style: { color: accent, fontWeight: '800', fontSize: '34px', lineHeight: '1' } }, String(p.adverseMediaScore)),
          el('div', { style: { marginTop: '4px' } }, el('span', { class: 'badge ' + (RISK_BADGE[p.riskBand] || 'neutral') }, el('span', { class: 'dot' }), p.riskBand)),
          el('div', { class: 'small muted', style: { marginTop: '2px' } }, 'adverse-media / 100'))),
      el('div', { style: { marginTop: '10px' } }, meter(p.adverseMediaScore, accent)))));

  // Category breakdown.
  if (p.byCategory.length) {
    const total = p.itemCount || 1;
    nodes.push(card('Mentions by category', { sub: `${p.byCategory.length} categor${p.byCategory.length === 1 ? 'y' : 'ies'} across ${p.itemCount} mention${p.itemCount === 1 ? '' : 's'}` },
      ...p.byCategory.map((c) => el('div', { class: 'row', style: { gap: '8px', alignItems: 'center', padding: '6px 0' } },
        el('span', { style: { flex: '0 0 auto', width: '11px', height: '11px', borderRadius: '3px', background: c.color || 'var(--accent)', display: 'inline-block' } }),
        el('span', { class: 'small', style: { flex: '1 1 auto', color: 'var(--text)' } }, c.label),
        el('div', { style: { flex: '0 0 120px' } }, meter(c.count / total * 100, c.color || 'var(--accent)')),
        el('span', { class: 'tabular small', style: { flex: '0 0 28px', textAlign: 'right', fontWeight: '700', color: 'var(--text)' } }, String(c.count))))));
  }

  // Timeline of mentions (chronological), each opening the mention.
  nodes.push(timelineCard(p.timeline));

  nodes.push(disclaimerNote(data.disclaimer));
  panel.replaceChildren(...nodes);
}

function timelineCard(timeline) {
  if (!timeline || !timeline.length) return card('Timeline', {}, emptyState('No mentions'));
  const rows = timeline.map((t) => {
    const accent = SEV_ACCENT[t.severity] || 'var(--accent)';
    return el('a', { class: 'row wrap', href: '#/adverse-media/' + t.id, style: { gap: '10px', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--border)', textDecoration: 'none' }, title: 'Open mention' },
      el('span', { class: 'small muted tabular', style: { flex: '0 0 82px' } }, t.date),
      el('span', { style: { flex: '0 0 auto', width: '10px', height: '10px', borderRadius: '50%', background: accent, display: 'inline-block' } }),
      el('span', { style: { flex: '1 1 auto', minWidth: '0' } },
        el('div', { style: { fontWeight: '600', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, t.headline),
        el('div', { class: 'small muted' }, `${t.categoryLabel} · ${t.outlet} · ${Math.round((t.credibility || 0) * 100)}% cred`)),
      severityBadge(t.severity));
  });
  return card('Timeline', { sub: `${timeline.length} mention${timeline.length === 1 ? '' : 's'}, oldest first`, actions: el('span', { class: 'badge sq neutral' }, 'Chronological') }, ...rows);
}

// ── Shared small helpers ─────────────────────────────────────────────────────
function severityBadge(sev) {
  const cls = SEV_BADGE[sev] || 'neutral';
  return el('span', { class: 'badge ' + cls, title: sev + ' severity', style: sev === 'Critical' ? { background: 'rgba(193,18,31,0.18)', color: '#ff8a94', borderColor: 'rgba(193,18,31,0.5)' } : null }, el('span', { class: 'dot' }), sev);
}
function dispositionBadge(status) {
  if (status === 'relevant') return el('span', { class: 'badge high' }, el('span', { class: 'dot' }), 'Relevant');
  if (status === 'not-relevant') return el('span', { class: 'badge low' }, el('span', { class: 'dot' }), 'Not relevant');
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
function disclaimerNote(text) {
  return el('div', { class: 'intro', style: { marginTop: '18px' } }, el('span', { class: 'ico' }, icon('info', 18)), el('div', { class: 't' }, el('b', {}, 'Not a system of record. '), text));
}
