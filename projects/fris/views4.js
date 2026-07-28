// View: Screening & Watchlist — deterministic name / entity / wallet screening
// against a DATED, ILLUSTRATIVE SUBSET of REAL public sanctions lists (OFAC SDN /
// UN Security Council / EU consolidated lists), with an explainable match score, a
// suggested band (strong / possible / weak), a confirm / false-positive disposition
// workflow, a watchlist browser, and a portfolio-screening view of pre-computed
// hits across the seeded entities and wallets. Deterministic; renders in-page
// within the shell; clearly labelled as a dated subset — NOT a live feed and NOT a
// sanctions-compliance system of record (screen against the official sources).
import { el, api, fmt, icon, card, riskBadge, statusBadge, toast, emptyState, errorState, skeleton, meter, infoDot } from './core.js';
import { pageHead, intro } from './views1.js';

// Band → colour/severity mapping (reuses the existing High/Medium/Low palette):
// strong = High (red), possible = Medium (amber), weak = Low (green/neutral).
const BAND_COLOUR = { strong: 'High', possible: 'Medium', weak: 'Low' };
const BAND_ACCENT = { strong: '#f0616d', possible: '#e5a53b', weak: '#46b877' };
const LIST_ACCENT = { sanctions: '#f0616d', pep: '#e5a53b', 'adverse-media': '#a97bf0', internal: '#4d8df0' };
const LIST_ICON = { sanctions: 'alert', pep: 'nexus', 'adverse-media': 'regulatory', internal: 'folder' };
const KIND_LABEL = { person: 'Person', organisation: 'Organisation', wallet: 'Wallet', vessel: 'Vessel' };
const LIST_LABEL = { sanctions: 'Sanctions', pep: 'PEP', 'adverse-media': 'Adverse media', internal: 'Internal' };

export async function screening(root, parts) {
  root.append(pageHead('Screening & Watchlist', 'Screen a name, entity or wallet against a dated subset of real public sanctions lists (OFAC · UN · EU) — with an explainable score and a disposition workflow', [
    el('a', { class: 'btn sm', href: '#/chainlink/wallets', title: 'Wallet directory (screening flags surface in each wallet drawer)' }, icon('chain', 15), 'Chain-Link'),
  ]));
  root.append(intro('Screening & Watchlist',
    'takes a name, an entity, or a wallet address and fuzzy-matches it against a dated, illustrative SUBSET of REAL public sanctions lists — designations drawn from OFAC’s SDN List, the UN Security Council Consolidated List and the EU Consolidated List — returning ranked candidate matches, each with a 0–100 score, a why-it-matched breakdown, the sanctioning authority, programme and listing date, and a suggested band. You then disposition each hit (confirm or mark false-positive). It also screens the whole seeded directory at once, and supplies the sanctions signal that Chain-Link and Sovereign Nexus consume. The PEP / adverse-media / internal list types are illustrative (no such names are fabricated).'));

  // Honesty / provenance banner — the sharpest test of the product's data posture.
  root.append(el('div', { class: 'intro', role: 'note', style: { marginTop: '10px', '--mc': '#e5a53b' } },
    el('span', { class: 'ico' }, icon('alert', 18)),
    el('div', { class: 't' }, el('b', {}, 'Real public sanctions data — dated subset, not a live feed. '),
      'Every sanctions entry is a genuine, sourced public designation from an official consolidated list (OFAC SDN, UN Security Council, EU), reproduced with its authority, programme, listing date and a link to the source. It is a DATED SUBSET captured for demonstration — sanctions lists change frequently (additions, amendments, delistings). This is NOT a complete or live feed and NOT a sanctions-compliance system of record: for any operational decision, screen against the live official sources. Not legal advice.')));

  // ── Sub-tab router (search · watchlists · portfolio) ─────────────────────────
  const TABS = [
    ['search', 'Search & screen', 'search'],
    ['watchlists', 'Watchlist browser', 'database'],
    ['portfolio', 'Portfolio screening', 'nexus'],
  ];
  const active = TABS.some((t) => t[0] === parts[0]) ? parts[0] : 'search';
  const tabBar = el('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Screening views', style: { margin: '14px 0 6px' } },
    ...TABS.map(([id, label, ic]) => el('a', {
      class: 'tab' + (id === active ? ' active' : ''), href: '#/screening/' + id, role: 'tab',
      'aria-selected': id === active ? 'true' : 'false',
    }, icon(ic, 15), label)));
  root.append(tabBar);

  const body = el('div', { class: 'mt' });
  root.append(body);

  if (active === 'watchlists') await renderWatchlists(body);
  else if (active === 'portfolio') await renderPortfolio(body);
  else await renderSearch(body);
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1 — Search & screen
// ─────────────────────────────────────────────────────────────────────────────
async function renderSearch(root) {
  const panel = el('div', {}, skeleton(140));
  root.append(panel);

  let kb;
  try { kb = await api.get('/api/screening/watchlists'); }
  catch (e) { panel.replaceChildren(errorState(e.message)); return; }

  const state = { name: '', country: '', dob: '', types: new Set() };

  const nameInput = el('input', { type: 'text', 'aria-label': 'Name, entity or wallet address to screen', placeholder: 'e.g. Vladimir Putin · Lazarus Group · Bank Melli · 0x…', style: { width: '100%' }, oninput: (e) => { state.name = e.target.value; } });
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
  const countryInput = el('input', { type: 'text', 'aria-label': 'Country (optional, for corroboration)', placeholder: 'e.g. RU', style: { width: '100%' }, oninput: (e) => { state.country = e.target.value; } });
  const dobInput = el('input', { type: 'text', 'aria-label': 'Date of birth (optional, persons)', placeholder: 'YYYY-MM-DD', style: { width: '100%' }, oninput: (e) => { state.dob = e.target.value; } });

  // List-type filter chips.
  const typeChips = kb.listTypes.map((lt) => el('button', {
    type: 'button', class: 'chip', 'aria-pressed': 'false', title: lt.blurb,
    onclick: () => { if (state.types.has(lt.code)) state.types.delete(lt.code); else state.types.add(lt.code); const on = state.types.has(lt.code); typeChips.find((c) => c._code === lt.code).classList.toggle('on', on); typeChips.find((c) => c._code === lt.code).setAttribute('aria-pressed', on ? 'true' : 'false'); },
  }, lt.label));
  typeChips.forEach((c, i) => { c._code = kb.listTypes[i].code; });

  const runBtn = el('button', { class: 'btn primary', onclick: () => run() }, icon('search', 15), 'Screen');
  const exampleBtn = el('button', { class: 'btn ghost', title: 'Load a worked example (a real listed name)', onclick: () => { state.name = 'Vladimir Putin'; nameInput.value = state.name; state.country = 'RU'; countryInput.value = 'RU'; state.dob = '1952-10-07'; dobInput.value = state.dob; run(); } }, icon('play', 14), 'Load example');

  const field = (label, ctrl, hint) => el('div', { class: 'field', style: { flex: '1 1 150px' } }, el('label', {}, label), ctrl, hint ? el('div', { class: 'small muted', style: { marginTop: '3px' } }, hint) : null);

  const results = el('div', { class: 'mt2' });

  panel.replaceChildren(
    card('Screen a subject', { sub: 'A name, an entity, or a wallet address — optionally add country / date of birth to corroborate' },
      el('div', { class: 'field' }, el('label', {}, 'Name / entity / wallet address'), nameInput),
      el('div', { class: 'row wrap', style: { gap: '10px', marginTop: '10px' } },
        field('Country (optional)', countryInput, 'Corroborates a name match.'),
        field('Date of birth (optional)', dobInput, 'Persons only.')),
      el('div', { class: 'field', style: { marginTop: '10px' } }, el('label', {}, el('span', {}, 'Limit to list types (optional) '), infoDot('Leave all off to screen against every list.')), el('div', { class: 'row wrap', style: { gap: '6px' } }, ...typeChips)),
      el('div', { class: 'row wrap', style: { gap: '8px', marginTop: '12px' } }, runBtn, exampleBtn)),
    results);

  async function run() {
    if (!state.name.trim()) { toast('Enter a name, entity or wallet address to screen.', { type: 'warn' }); return; }
    results.replaceChildren(skeleton(220));
    try {
      const res = await api.post('/api/screening/search', { name: state.name, country: state.country || undefined, dob: state.dob || undefined, types: [...state.types] });
      renderSearchResults(results, res);
    } catch (e) { results.replaceChildren(errorState(e.message)); }
  }
}

function renderSearchResults(root, res) {
  const nodes = [];
  const q = res.query;
  // Summary line.
  const summary = el('div', { class: 'row wrap', style: { gap: '8px', alignItems: 'center', marginBottom: '4px' } },
    el('span', { style: { fontWeight: '700', color: 'var(--text)' } }, `“${q.name}”`),
    q.isAddress ? el('span', { class: 'badge sq neutral' }, 'address') : null,
    el('span', { class: 'small muted' }, `${res.counts.candidates} candidate${res.counts.candidates === 1 ? '' : 's'}`),
    ...Object.entries(res.counts.byBand || {}).map(([b, n]) => el('span', { class: 'badge ' + (BAND_COLOUR[b] === 'High' ? 'high' : BAND_COLOUR[b] === 'Medium' ? 'med' : 'low').toLowerCase(), title: b }, el('span', { class: 'dot' }), `${n} ${b}`)));
  nodes.push(summary);

  if (!res.matches.length) {
    nodes.push(emptyState('No watchlist candidates', 'No entry in this dated public-sanctions subset is similar enough to this query to surface. A clean screen is recorded for audit. (Screen against the live official lists for operational use.)'));
  } else {
    for (const m of res.matches) nodes.push(matchCard(m, null));
  }
  nodes.push(disclaimerNote(res.disclaimer));
  root.replaceChildren(...nodes);
}

// A single explainable match card (used by search and portfolio detail). If
// `onDisposition` is provided, renders confirm / false-positive controls that
// call it with the chosen status + note.
function matchCard(m, disposition, onDisposition) {
  const accent = BAND_ACCENT[m.band] || 'var(--accent)';
  const listAccent = LIST_ACCENT[m.list] || 'var(--accent)';
  const header = el('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center' } },
    el('span', { class: 'mc-icon', style: { flex: '0 0 auto', color: listAccent } }, icon(LIST_ICON[m.list] || 'info', 18)),
    el('span', { style: { fontWeight: '700', color: 'var(--text)', fontSize: '15px' } }, m.matchedName),
    m.matchedName !== m.listedName ? el('span', { class: 'small muted', title: 'Primary listed name' }, '↳ ' + m.listedName) : null,
    el('span', { class: 'spacer' }),
    // Every list the matched entry belongs to (membership), colour-coded.
    ...(Array.isArray(m.lists) && m.lists.length ? m.lists : [m.list]).map((c) =>
      el('span', { class: 'badge sq', style: { color: LIST_ACCENT[c] || 'var(--text-2)', borderColor: (LIST_ACCENT[c] || 'var(--border)') + '66' }, title: 'On the ' + (LIST_LABEL[c] || c) + ' list' }, LIST_LABEL[c] || c)),
    riskBadge(m.listSeverity));

  const scoreRow = el('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center', margin: '8px 0' } },
    el('span', { class: 'tabular', style: { color: accent, fontWeight: '800', fontSize: '18px', minWidth: '52px' } }, String(m.score)),
    el('span', { class: 'badge ' + (BAND_COLOUR[m.band] === 'High' ? 'high' : BAND_COLOUR[m.band] === 'Medium' ? 'med' : 'low'), title: 'Suggested band' }, el('span', { class: 'dot' }), fmt.title(m.band) + ' match'),
    el('div', { style: { flex: '1 1 160px' } }, meter(m.score, accent)));

  // Why-matched breakdown.
  const why = el('div', { style: { marginTop: '6px' } },
    el('div', { class: 'small muted', style: { marginBottom: '4px' } }, 'Why matched:'),
    el('ul', { style: { margin: '0', paddingLeft: '18px', lineHeight: '1.6' } }, ...m.why.map((w) => el('li', { class: 'small' }, el('span', { class: 'badge sq neutral', style: { marginRight: '6px' } }, fmt.title(String(w.kind).replace(/-/g, ' '))), w.detail))));

  // Provenance strip — authority · programme · listing date · source (real data).
  const provRow = el('div', { class: 'row wrap', style: { gap: '8px', alignItems: 'center', margin: '8px 0 2px' } },
    ...(m.authorities && m.authorities.length ? m.authorities : (m.authority ? [m.authority] : [])).map((a) =>
      el('span', { class: 'badge sq neutral', title: 'Sanctioning authority' }, el('span', { class: 'dot' }), a)),
    m.program ? el('span', { class: 'small', style: { color: 'var(--text-2)' } }, m.program) : null,
    m.listingDate ? el('span', { class: 'small muted', title: 'Official listing / designation date' }, 'Listed ' + m.listingDate) : null,
    m.sourceUrl ? el('a', { class: 'small', href: m.sourceUrl, target: '_blank', rel: 'noopener noreferrer', title: 'Open the official source / designation announcement', style: { marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '3px' } }, icon('link', 13), 'Source') : null);

  // Identifiers strip.
  const ids = [];
  if (m.dob) ids.push(['DoB', m.dob]);
  if (m.country) ids.push(['Country', m.country]);
  if (m.address) ids.push(['Address', m.address]);
  if (m.imo) ids.push(['IMO', m.imo]);
  if (m.aliases && m.aliases.length) ids.push(['Aliases', m.aliases.join(', ')]);
  ids.push(['Kind', KIND_LABEL[m.kind] || m.kind]);
  const idStrip = el('div', { class: 'row wrap', style: { gap: '10px', marginTop: '6px' } },
    ...ids.map(([k, v]) => el('span', { class: 'small muted' }, el('span', { style: { color: 'var(--text-3)' } }, k + ': '), el('span', { style: { color: 'var(--text-2)' } }, v))));

  // Reason for listing (official narrative, paraphrased).
  const reason = m.description || m.note || '';
  const noteLine = el('div', { class: 'small', style: { marginTop: '6px', color: 'var(--text-2)' } },
    el('span', { style: { color: 'var(--text-3)' } }, 'Reason for listing: '), reason);

  const children = [header, scoreRow, why, provRow, idStrip, noteLine];

  // Disposition controls (portfolio hits) — confirm / false-positive + note.
  if (onDisposition) {
    const cur = disposition && disposition.status ? disposition.status : 'open';
    const statusBadgeEl = el('span', {}, dispositionBadge(cur));
    const noteInput = el('input', { type: 'text', 'aria-label': 'Disposition note', placeholder: 'Reason (optional)…', style: { flex: '1 1 200px' }, value: disposition && disposition.note ? disposition.note : '' });
    const doDispose = async (status) => {
      try { const out = await onDisposition(status, noteInput.value); statusBadgeEl.replaceChildren(dispositionBadge(out.disposition.status)); toast('Disposition recorded: ' + out.disposition.status, { type: 'success' }); }
      catch (e) { toast(e.message, { type: 'error' }); }
    };
    children.push(el('div', { class: 'row wrap', style: { gap: '8px', alignItems: 'center', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border)' } },
      el('span', { class: 'small muted' }, 'Disposition:'), statusBadgeEl,
      noteInput,
      el('button', { class: 'btn sm', title: 'Confirm this as a true hit', onclick: () => doDispose('confirmed') }, icon('check', 14), 'Confirm'),
      el('button', { class: 'btn sm ghost', title: 'Mark as a false positive', onclick: () => doDispose('false-positive') }, icon('close', 14), 'False positive')));
  }

  return el('div', { class: 'card', style: { '--mc': accent, borderLeft: '4px solid ' + accent, marginBottom: '10px' } }, el('div', { class: 'card-body' }, ...children));
}

function dispositionBadge(status) {
  if (status === 'confirmed') return el('span', { class: 'badge high' }, el('span', { class: 'dot' }), 'Confirmed hit');
  if (status === 'false-positive') return el('span', { class: 'badge low' }, el('span', { class: 'dot' }), 'False positive');
  return el('span', { class: 'badge sq neutral' }, 'Open');
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2 — Watchlist browser
// ─────────────────────────────────────────────────────────────────────────────
async function renderWatchlists(root) {
  const panel = el('div', {}, skeleton(160));
  root.append(panel);
  let data;
  try { data = await api.get('/api/screening/watchlists'); }
  catch (e) { panel.replaceChildren(errorState(e.message)); return; }

  const state = { type: '', kind: '', q: '' };
  const listChips = [['', 'All lists'], ...data.listTypes.map((l) => [l.code, l.label])].map(([code, label]) => el('button', {
    type: 'button', class: 'chip' + (code === '' ? ' on' : ''), 'aria-pressed': code === '' ? 'true' : 'false',
    onclick: () => { state.type = code; for (const c of listChips) { const on = c._code === code; c.classList.toggle('on', on); c.setAttribute('aria-pressed', on ? 'true' : 'false'); } refresh(); },
  }, label));
  listChips.forEach((c, i) => { c._code = i === 0 ? '' : data.listTypes[i - 1].code; });

  // Person / company / vessel / wallet filter — a SEPARATE axis from the list type.
  const KINDS = [['', 'All kinds'], ['person', 'People'], ['organisation', 'Companies'], ['vessel', 'Vessels'], ['wallet', 'Wallets']];
  const kindChips = KINDS.map(([code, label]) => el('button', {
    type: 'button', class: 'chip' + (code === '' ? ' on' : ''), 'aria-pressed': code === '' ? 'true' : 'false',
    title: code ? ('Show only ' + label.toLowerCase()) : 'Show all kinds',
    onclick: () => { state.kind = code; for (const c of kindChips) { const on = c._code === code; c.classList.toggle('on', on); c.setAttribute('aria-pressed', on ? 'true' : 'false'); } refresh(); },
  }, label));
  kindChips.forEach((c, i) => { c._code = KINDS[i][0]; });

  const searchInput = el('input', { type: 'text', 'aria-label': 'Search the watchlist', placeholder: 'Search names, aliases, programmes…', style: { width: '100%' }, oninput: (e) => { state.q = e.target.value; refresh(); } });

  const countsLine = el('div', { class: 'row wrap', style: { gap: '8px', alignItems: 'center', margin: '2px 0 8px' } },
    ...data.listTypes.map((l) => el('span', { class: 'badge sq neutral', title: l.blurb }, `${l.label}: ${data.version.byList[l.code] || 0}`)));

  const listBody = el('div', {});

  const snap = (data.version && data.version.snapshotDate) || null;
  const sources = (data.version && data.version.sources) || [];
  const sourcesLine = sources.length ? el('div', { class: 'small muted', style: { margin: '4px 0 8px' } },
    'Sources: ', ...sources.flatMap((s, i) => [
      i ? el('span', {}, ' · ') : null,
      el('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', title: s.label }, s.authority),
    ].filter(Boolean))) : null;

  panel.replaceChildren(
    card('Public sanctions watchlist (dated subset)', { sub: `${data.version.entries} real public designations · snapshot ${snap || 'n/a'} · v${data.version.version}`, actions: el('span', { class: 'badge sq neutral', title: 'Real designations reproduced from official consolidated lists' }, 'Real · public source') },
      el('div', { class: 'small muted', style: { marginBottom: '6px' } }, 'A dated, illustrative subset of real designations from OFAC (SDN), the UN Security Council and the EU consolidated lists. Sanctions lists change frequently — screen against the live official sources for operational use.'),
      sourcesLine,
      countsLine,
      el('div', { class: 'small muted', style: { margin: '2px 0 3px' } }, 'Filter by list'),
      el('div', { class: 'row wrap', style: { gap: '6px', marginBottom: '8px' } }, ...listChips),
      el('div', { class: 'small muted', style: { margin: '2px 0 3px' } }, 'Filter by kind'),
      el('div', { class: 'row wrap', style: { gap: '6px', marginBottom: '10px' } }, ...kindChips),
      el('div', { class: 'field' }, el('label', {}, 'Search'), searchInput)),
    listBody);

  let cache = data.rows;
  function refresh() {
    const q = state.q.trim().toLowerCase();
    const listsOf = (r) => (Array.isArray(r.lists) && r.lists.length ? r.lists : (r.list ? [r.list] : ['sanctions']));
    // list-type filter is by MEMBERSHIP; kind filter is a separate axis.
    let rows = cache.filter((r) => (!state.type || listsOf(r).includes(state.type)) && (!state.kind || r.kind === state.kind));
    if (q) rows = rows.filter((r) => (r.name + ' ' + (r.aliases || []).join(' ') + ' ' + r.program).toLowerCase().includes(q));
    renderRows(rows);
  }
  function renderRows(rows) {
    if (!rows.length) { listBody.replaceChildren(emptyState('No entries match')); return; }
    const byList = {};
    const primaryOf = (r) => { const ls = Array.isArray(r.lists) && r.lists.length ? r.lists : (r.list ? [r.list] : ['sanctions']); for (const c of ['sanctions', 'pep', 'adverse-media', 'internal']) if (ls.includes(c)) return c; return ls[0]; };
    // An entry can be on several lists; group it under its primary (highest-severity)
    // list for display, but its membership chips show every list it belongs to.
    for (const r of rows) (byList[primaryOf(r)] = byList[primaryOf(r)] || []).push(r);
    const groups = [];
    for (const lt of data.listTypes) {
      const rs = byList[lt.code];
      if (!rs || !rs.length) continue;
      groups.push(card(lt.label, { sub: `${rs.length} entr${rs.length === 1 ? 'y' : 'ies'} · ${lt.blurb}`, actions: riskBadge(lt.severity) },
        el('div', {}, ...rs.map(watchlistRow))));
    }
    listBody.replaceChildren(...groups);
  }
  refresh();
}

function watchlistRow(r) {
  return el('div', { style: { padding: '9px 0', borderBottom: '1px solid var(--border)' } },
    el('div', { class: 'row wrap', style: { gap: '8px', alignItems: 'baseline' } },
      el('span', { style: { fontWeight: '600', color: 'var(--text)' } }, r.name),
      el('span', { class: 'badge sq neutral' }, KIND_LABEL[r.kind] || r.kind),
      // Every list this entry belongs to (sanctions / pep / adverse-media), colour-coded.
      ...(Array.isArray(r.lists) && r.lists.length ? r.lists : [r.list || 'sanctions']).map((c) =>
        el('span', { class: 'badge sq', style: { color: LIST_ACCENT[c] || 'var(--text-2)', borderColor: (LIST_ACCENT[c] || 'var(--border)') + '66' }, title: 'On the ' + (LIST_LABEL[c] || c) + ' list' }, LIST_LABEL[c] || c)),
      // Sanctioning authorities (may be more than one when multiply-listed).
      ...(r.authorities && r.authorities.length ? r.authorities : (r.authority ? [r.authority] : [])).map((a) =>
        el('span', { class: 'badge sq neutral', title: 'Sanctioning authority' }, a)),
      el('span', { class: 'spacer' }),
      el('span', { class: 'small muted tabular' }, r.id)),
    el('div', { class: 'row wrap', style: { gap: '10px', marginTop: '3px' } },
      r.dob ? el('span', { class: 'small muted' }, 'DoB: ' + r.dob) : null,
      r.country ? el('span', { class: 'small muted' }, 'Country: ' + r.country) : null,
      r.address ? el('span', { class: 'small muted tabular' }, r.address) : null,
      r.imo ? el('span', { class: 'small muted' }, 'IMO: ' + r.imo) : null,
      el('span', { class: 'small muted' }, 'Programme: ' + r.program),
      r.listingDate ? el('span', { class: 'small muted' }, 'Listed: ' + r.listingDate) : null),
    r.aliases && r.aliases.length ? el('div', { class: 'small muted', style: { marginTop: '3px' } }, 'aka: ' + r.aliases.join(', ')) : null,
    el('div', { class: 'small', style: { color: 'var(--text-2)', marginTop: '3px' } }, r.description || r.note),
    r.sourceUrl ? el('div', { class: 'small', style: { marginTop: '2px' } }, el('a', { href: r.sourceUrl, target: '_blank', rel: 'noopener noreferrer', style: { display: 'inline-flex', alignItems: 'center', gap: '3px' } }, icon('link', 12), 'Official source')) : null);
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 3 — Portfolio screening (pre-computed hits over seeded entities + wallets)
// ─────────────────────────────────────────────────────────────────────────────
async function renderPortfolio(root) {
  const panel = el('div', {}, skeleton(200));
  root.append(panel);
  let data;
  try { data = await api.get('/api/screening/hits'); }
  catch (e) { panel.replaceChildren(errorState(e.message)); return; }

  const state = { band: '', list: '', subjectType: '' };

  const s = data.summary;
  const kpis = el('div', { class: 'row wrap', style: { gap: '10px', marginBottom: '10px' } },
    kpiChip('Subjects screened', s.subjectsScreened),
    kpiChip('Hits', s.hitCount, '#e5a53b'),
    kpiChip('Strong', s.strongHits, '#f0616d'),
    kpiChip('Entities', s.entitiesScreened),
    kpiChip('Wallets', s.walletsScreened));

  // Filters.
  const bandChips = [['', 'All bands'], ['strong', 'Strong'], ['possible', 'Possible'], ['weak', 'Weak']].map(([code, label]) => filterChip(code, label, () => { state.band = code; syncChips(bandChips, code); refresh(); }));
  const listChips = [['', 'All lists'], ['sanctions', 'Sanctions'], ['pep', 'PEP'], ['adverse-media', 'Adverse media'], ['internal', 'Internal']].map(([code, label]) => filterChip(code, label, () => { state.list = code; syncChips(listChips, code); refresh(); }));
  const subjChips = [['', 'All'], ['entity', 'Entities'], ['wallet', 'Wallets']].map(([code, label]) => filterChip(code, label, () => { state.subjectType = code; syncChips(subjChips, code); refresh(); }));

  const hitsBody = el('div', {});

  const realHits = (data.hits || []).filter((h) => h.subjectMeta && h.subjectMeta.source_type === 'real-public-sanctions-demo');
  const realNote = el('div', { class: 'intro', role: 'note', style: { marginTop: '2px', marginBottom: '10px', '--mc': '#f0616d' } },
    el('span', { class: 'ico' }, icon('alert', 18)),
    el('div', { class: 't' }, el('b', {}, `${realHits.length} REAL sanctioned ${realHits.length === 1 ? 'party is' : 'parties are'} deliberately seeded into this otherwise-fictional directory. `),
      'To make the screen→investigate demo produce genuine hits, FRIS inserts a small set of entities whose names ARE real public sanctions listings (e.g. Bank Melli Iran, Gazprombank, Wagner Group, Sovcomflot). They are flagged ',
      el('span', { class: 'badge sq', style: { color: '#f0616d', borderColor: '#f0616d66' } }, 'Real sanctioned party (inserted)'),
      ' below and screen as STRONG sanctions hits. Every OTHER entity and wallet in FRIS is synthetic — any hits on those are incidental name overlaps for demonstration.'));

  panel.replaceChildren(
    card('Portfolio screening', { sub: 'Every seeded entity and wallet screened against the real public-sanctions subset — ranked by top match score. A small set of REAL sanctioned parties is deliberately seeded (clearly flagged); all other subjects are synthetic.', actions: el('span', { class: 'badge sq neutral' }, 'Deterministic') },
      realNote,
      kpis,
      el('div', { class: 'row wrap', style: { gap: '6px', marginBottom: '6px' } }, el('span', { class: 'small muted', style: { alignSelf: 'center', marginRight: '4px' } }, 'Band:'), ...bandChips),
      el('div', { class: 'row wrap', style: { gap: '6px', marginBottom: '6px' } }, el('span', { class: 'small muted', style: { alignSelf: 'center', marginRight: '4px' } }, 'List:'), ...listChips),
      el('div', { class: 'row wrap', style: { gap: '6px' } }, el('span', { class: 'small muted', style: { alignSelf: 'center', marginRight: '4px' } }, 'Type:'), ...subjChips)),
    hitsBody,
    disclaimerNote(data.disclaimer));

  let cache = data.hits;
  function refresh() {
    let rows = cache.filter((h) => (!state.band || h.topBand === state.band) && (!state.list || h.topList === state.list) && (!state.subjectType || h.subjectType === state.subjectType));
    if (!rows.length) { hitsBody.replaceChildren(emptyState('No hits match these filters', 'Loosen a filter, or clear them all.')); return; }
    hitsBody.replaceChildren(...rows.map(hitCard));
  }
  refresh();
}

function hitCard(h) {
  const accent = BAND_ACCENT[h.topBand] || 'var(--accent)';
  const details = el('details', { class: 'card', style: { '--mc': accent, borderLeft: '4px solid ' + accent, marginBottom: '10px' } });
  const summary = el('summary', { style: { cursor: 'pointer', listStyle: 'none', padding: '12px 14px' } },
    el('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center' } },
      el('span', { class: 'mc-icon', style: { flex: '0 0 auto', color: LIST_ACCENT[h.topList] || accent } }, icon(h.subjectType === 'wallet' ? 'chain' : 'nexus', 18)),
      el('span', { style: { fontWeight: '700', color: 'var(--text)' } }, h.subjectName),
      el('span', { class: 'badge sq neutral' }, h.subjectType),
      // Flag hits whose subject is a REAL sanctioned party deliberately inserted
      // into the otherwise-synthetic seed (so the demo produces genuine hits).
      (h.subjectMeta && h.subjectMeta.source_type === 'real-public-sanctions-demo')
        ? el('span', { class: 'badge sq', style: { color: '#f0616d', borderColor: '#f0616d66' }, title: 'This seeded entity is a REAL sanctioned party, deliberately inserted into FRIS\'s otherwise-fictional directory to demonstrate screening. Everything else in FRIS is synthetic.' }, el('span', { class: 'dot' }), 'Real sanctioned party (inserted)')
        : null,
      el('span', { class: 'spacer' }),
      dispositionBadge(h.disposition ? h.disposition.status : 'open'),
      el('span', { class: 'badge sq neutral', title: 'Matched list' }, h.topListLabel),
      el('span', { class: 'tabular', style: { color: accent, fontWeight: '800', fontSize: '16px', minWidth: '38px', textAlign: 'right' } }, String(h.topScore)),
      el('span', { class: 'badge ' + (BAND_COLOUR[h.topBand] === 'High' ? 'high' : BAND_COLOUR[h.topBand] === 'Medium' ? 'med' : 'low') }, fmt.title(h.topBand))));
  details.append(summary);
  const inner = el('div', { class: 'card-body', style: { paddingTop: '0' } });
  const meta = h.subjectMeta || {};
  inner.append(el('div', { class: 'small muted', style: { marginBottom: '8px' } },
    (h.subjectType === 'wallet' ? `Wallet ${h.subjectId}` : `Entity ${h.subjectId}`) +
    (meta.jurisdiction ? ` · ${meta.jurisdiction}` : '') + (meta.entity_type ? ` · ${meta.entity_type}` : '') + (meta.node_type ? ` · ${meta.node_type}` : '') +
    ` · ${h.matchCount} candidate${h.matchCount === 1 ? '' : 's'}`));
  // Each candidate match with an inline disposition action bound to this hit.
  h.matches.forEach((m, i) => {
    // Only the first (top) match carries the disposition controls (it drives the hit).
    inner.append(matchCard(m, i === 0 ? h.disposition : null, i === 0 ? (status, note) => api.post('/api/screening/hits/' + encodeURIComponent(h.hitId) + '/disposition', { status, note }) : null));
  });
  details.append(inner);
  return details;
}

// ── Shared small helpers ─────────────────────────────────────────────────────
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
function disclaimerNote(text) {
  return el('div', { class: 'intro', style: { marginTop: '18px' } }, el('span', { class: 'ico' }, icon('info', 18)), el('div', { class: 't' }, el('b', {}, 'Dated public-sanctions subset — not a live feed or a system of record. '), text));
}
