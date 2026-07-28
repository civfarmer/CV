// FRIS UI core — DOM helpers, API client, formatting, reusable components.
// All user/data values are inserted as text nodes (never innerHTML), so no
// untrusted HTML is ever executed. `html:` is used only with trusted icon SVGs.

/* ---------- DOM helper ---------- */
export function el(tag, props = {}, ...kids) {
  if (tag instanceof Node) return tag;
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  for (const kid of kids.flat(3)) {
    if (kid == null || kid === false) continue;
    e.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return e;
}
export const clear = (n) => { while (n.firstChild) n.removeChild(n.firstChild); return n; };
export const mount = (n, ...kids) => { clear(n); for (const k of kids.flat(3)) if (k != null && k !== false) n.append(k instanceof Node ? k : document.createTextNode(String(k))); return n; };

/* ---------- Accessibility helpers ---------- */
// True when the user has asked the OS to reduce motion. Guarded so it is safe
// in non-browser environments (e.g. the e2e DOM shim, SSR).
export function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

// Selector for elements that can receive keyboard focus inside a dialog.
const FOCUSABLE = 'a[href],area[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
function focusables(container) {
  if (!container || typeof container.querySelectorAll !== 'function') return [];
  return Array.from(container.querySelectorAll(FOCUSABLE) || []).filter(Boolean);
}
// Trap Tab / Shift+Tab within `container`. Returns the keydown handler so the
// caller can remove it on teardown; call `.focusFirst()` on it to move focus in.
export function trapFocus(container, { onEscape } = {}) {
  const handler = (e) => {
    if (e.key === 'Escape') { if (onEscape) { if (e.preventDefault) e.preventDefault(); onEscape(); } return; }
    if (e.key !== 'Tab') return;
    const items = focusables(container);
    if (!items.length) { if (e.preventDefault) e.preventDefault(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    const inside = container.contains ? container.contains(active) : true;
    if (e.shiftKey) {
      if (active === first || !inside) { if (e.preventDefault) e.preventDefault(); if (last.focus) last.focus(); }
    } else if (active === last) { if (e.preventDefault) e.preventDefault(); if (first.focus) first.focus(); }
  };
  handler.focusFirst = () => {
    const items = focusables(container);
    const target = items[0] || container;
    if (target && typeof target.focus === 'function') { try { target.focus(); } catch { /* jsdom/shim */ } }
  };
  return handler;
}

// A keyboard-operable clickable row: applies role="button", tabindex and an
// Enter/Space -> click handler, so a plain <div> behaves like a control for
// keyboard and screen-reader users. Backward-compatible with el(): extra props
// are merged, and the activation handler may be passed as onClick or onclick.
export function clickableRow(props = {}, ...kids) {
  const { tag = 'div', role = 'button', onClick, ...rest } = props;
  const activate = onClick || rest.onclick;
  const node = el(tag, { role, tabindex: 0, ...rest, onclick: activate }, ...kids);
  if (activate) node.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { if (e.preventDefault) e.preventDefault(); activate(e); }
  });
  return node;
}

/* ---------- Icons (Lucide-style, trusted SVG) ---------- */
const P = {
  overview: '<path d="M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z"/>',
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/>',
  nexus: '<circle cx="5" cy="6" r="2.4"/><circle cx="19" cy="6" r="2.4"/><circle cx="12" cy="18" r="2.4"/><path d="M7 7l4 9M17 7l-4 9M6.5 6h11"/>',
  chain: '<path d="M9 12a3 3 0 0 1 3-3h3a3 3 0 0 1 0 6h-2"/><path d="M15 12a3 3 0 0 1-3 3H9a3 3 0 0 1 0-6h2"/>',
  waterfall: '<path d="M3 5h6v4H3zM9 10h6v4H9zM15 15h6v4h-6z"/>',
  scale: '<path d="M12 3v18M7 21h10M12 6l-6 2 3 6a3 3 0 0 0 6 0zM12 6l6 2-3 6"/>',
  regulatory: '<path d="M6 3h9l3 3v15H6z"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.6 3.6 3 8 3s8-1.4 8-3V5M4 12c0 1.6 3.6 3 8 3s8-1.4 8-3"/>',
  folder: '<path d="M3 6h6l2 2h10v11H3z"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 4v4h4M12 8v4l3 2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>',
  bell: '<path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  download: '<path d="M12 3v12M7 11l5 4 5-4M4 20h16"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4-2v-4z"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 9v5M12 18h.01"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>',
  pin: '<path d="M12 22s7-6 7-12a7 7 0 1 0-14 0c0 6 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  pause: '<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7M21 4v4h-4"/>',
  bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
  note: '<path d="M4 4h16v12l-4 4H4z"/><path d="M14 20v-4h4"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  reset: '<path d="M3 12a9 9 0 1 1 9 9M3 12V7M3 12h5"/>',
  link: '<path d="M9 15l6-6M10 6l1-1a4 4 0 0 1 6 6l-1 1M14 18l-1 1a4 4 0 0 1-6-6l1-1"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
};
export function icon(name, size = 18) {
  const inner = P[name] || P.overview;
  return el('span', { class: 'ic-wrap', html: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>` }).firstChild;
}

/* ---------- API client ---------- */
async function req(method, path, body) {
  const opt = { method, headers: {} };
  if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  const res = await fetch(path, opt);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error((data && data.error) || `HTTP ${res.status}`);
  return data;
}
export const api = {
  get: (p) => req('GET', p),
  post: (p, b) => req('POST', p, b || {}),
  patch: (p, b) => req('PATCH', p, b || {}),
};

/* ---------- Formatting ---------- */
export const fmt = {
  money(v, ccy) {
    // v may be {display}|{value}|minor string|number
    let s = typeof v === 'object' && v ? v.display || v.value : v;
    if (s == null) return '—';
    return (ccy ? ccy + ' ' : '') + s;
  },
  crypto(minor, asset) {
    const n = Number(minor) / 1e8;
    return n.toLocaleString(undefined, { maximumFractionDigits: 6 }) + (asset ? ' ' + asset : '');
  },
  num(n) { return Number(n || 0).toLocaleString(); },
  pct(n) { return (n == null ? '—' : Number(n).toFixed(n % 1 === 0 ? 0 : 1) + '%'); },
  date(d) { if (!d) return '—'; const s = String(d).slice(0, 10); return s; },
  short(s, n = 16) { s = String(s || ''); return s.length > n ? s.slice(0, 6) + '…' + s.slice(-4) : s; },
  title(s) { return String(s || '').replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()); },
};

export function riskBadge(level) {
  const l = String(level || '').toLowerCase();
  const cls = l.startsWith('high') ? 'high' : l.startsWith('med') ? 'med' : l.startsWith('low') ? 'low' : 'neutral';
  return el('span', { class: `badge ${cls}` }, el('span', { class: 'dot' }), level || '—');
}
export function statusBadge(s) {
  const map = { Verified: 'low', Complete: 'low', Compliant: 'low', Remediated: 'low', 'Non-Compliant': 'high', Overdue: 'high', High: 'high', 'Review Required': 'med', 'Requires Review': 'med', 'In Progress': 'info', 'Active Sweep': 'info', Watchlisted: 'violet', Draft: 'neutral', Synthetic: 'med', Unverified: 'neutral' };
  return el('span', { class: `badge ${map[s] || 'neutral'}` }, el('span', { class: 'dot' }), s || '—');
}
export function classBadge(c) {
  const map = { 'verified-public-source': 'Verified Public Source', 'synthetic-scenario': 'Synthetic Scenario', 'imported-user-material': 'Imported User Material', 'simulated-analysis': 'Simulated Analysis', 'unverified-fixture': 'Unverified Fixture', 'synthetic-demo': 'Synthetic Demo' };
  return el('span', { class: 'badge sq neutral', title: 'Data classification' }, map[c] || c || 'Synthetic');
}

/* ---------- KPI / card ---------- */
export function kpi({ label, value, delta, iconName }) {
  return el('div', { class: 'kpi' },
    el('div', { class: 'row' }, el('div', { class: 'label' }, label), el('div', { class: 'spacer' }), iconName ? el('div', { class: 'ic' }, icon(iconName, 16)) : null),
    el('div', { class: 'value tabular' }, value),
    delta ? el('div', { class: 'delta' }, delta) : null);
}
export function card(title, opts = {}, ...body) {
  const head = title ? el('div', { class: 'card-head' }, el('div', { class: 'card-title' }, title, opts.sub ? el('span', { class: 'sub' }, opts.sub) : null), opts.actions ? el('div', { class: 'card-actions' }, ...[].concat(opts.actions)) : null) : null;
  return el('div', { class: 'card' + (opts.class ? ' ' + opts.class : '') }, head, el('div', { class: 'card-body' + (opts.flush ? ' flush' : '') , style: opts.flush ? { padding: '0' } : null }, ...body));
}

/* ---------- States ---------- */
export const skeleton = (h = 120) => el('div', { class: 'skeleton', style: { height: h + 'px' } });
export const emptyState = (msg, sub) => el('div', { class: 'empty' }, icon('database', 34), el('div', {}, msg), sub ? el('div', { class: 'small' }, sub) : null);
export const errorState = (msg) => el('div', { class: 'errstate' }, icon('alert', 34), el('div', {}, 'Something went wrong'), el('div', { class: 'small' }, msg || ''));

/* ---------- Data table (sortable, searchable, paginated) ---------- */
export function dataTable(columns, rows, opts = {}) {
  const state = { sort: opts.sort || null, dir: opts.dir || 'asc', page: 0, q: '', size: opts.pageSize || 12 };
  const wrap = el('div');
  const search = opts.searchable ? el('input', { type: 'text', placeholder: opts.searchPlaceholder || 'Filter…', style: { marginBottom: '10px', width: '260px' }, oninput: (e) => { state.q = e.target.value.toLowerCase(); state.page = 0; render(); } }) : null;
  function filtered() {
    let r = rows.slice();
    if (state.q && opts.searchKeys) r = r.filter((row) => opts.searchKeys.some((k) => String(row[k] ?? '').toLowerCase().includes(state.q)));
    if (state.sort) { const c = columns.find((x) => x.key === state.sort); r.sort((a, b) => { const av = c.sortVal ? c.sortVal(a) : a[state.sort]; const bv = c.sortVal ? c.sortVal(b) : b[state.sort]; const n = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av ?? '').localeCompare(String(bv ?? '')); return state.dir === 'asc' ? n : -n; }); }
    return r;
  }
  function render() {
    const all = filtered();
    const pages = Math.max(1, Math.ceil(all.length / state.size));
    if (state.page >= pages) state.page = pages - 1;
    const slice = all.slice(state.page * state.size, state.page * state.size + state.size);
    const thead = el('thead', {}, el('tr', {}, ...columns.map((c) => el('th', { class: (c.sortable ? 'sortable ' : '') + (c.align === 'right' ? 'r' : ''), style: c.align === 'right' ? { textAlign: 'right' } : null, onclick: c.sortable ? () => { if (state.sort === c.key) state.dir = state.dir === 'asc' ? 'desc' : 'asc'; else { state.sort = c.key; state.dir = 'asc'; } render(); } : null }, c.label, c.sortable && state.sort === c.key ? el('span', { class: 'arr' }, state.dir === 'asc' ? '▲' : '▼') : null))));
    const tbody = el('tbody', {}, slice.length ? slice.map((row) => {
      const cells = columns.map((c) => el('td', { style: c.align === 'right' ? { textAlign: 'right' } : null }, c.render ? c.render(row) : (row[c.key] ?? '—')));
      return opts.onRowClick
        ? clickableRow({ tag: 'tr', class: 'clickable', onClick: () => opts.onRowClick(row) }, ...cells)
        : el('tr', {}, ...cells);
    }) : el('tr', {}, el('td', { colspan: columns.length }, emptyState(opts.empty || 'No records'))));
    const foot = el('div', { class: 'tbl-foot' }, el('span', {}, `${all.length} record${all.length === 1 ? '' : 's'}`), el('span', { class: 'spacer' }), pages > 1 ? el('div', { class: 'row' }, el('button', { class: 'btn sm ghost', onclick: () => { if (state.page > 0) { state.page--; render(); } } }, '‹ Prev'), el('span', { class: 'small' }, `Page ${state.page + 1} / ${pages}`), el('button', { class: 'btn sm ghost', onclick: () => { if (state.page < pages - 1) { state.page++; render(); } } }, 'Next ›')) : null);
    mount(wrap, search, el('div', { class: 'tbl-wrap' }, el('table', { class: 'tbl' }, thead, tbody)), foot);
  }
  render();
  return wrap;
}

/* ---------- Drawer ---------- */
let drawerEl, scrimEl;
let drawerTrap = null;        // active focus-trap keydown handler
let drawerPrevFocus = null;   // element focused before the drawer opened
let drawerOpen = false;
let drawerTitleId = 0;
function ensureDrawer() {
  if (drawerEl) return;
  scrimEl = el('div', { class: 'drawer-scrim', onclick: closeDrawer });
  drawerEl = el('div', { class: 'drawer', role: 'dialog', 'aria-modal': 'true' });
  document.body.append(scrimEl, drawerEl);
}
export function openDrawer({ title, subtitle, body, actions }) {
  ensureDrawer();
  // Remember what to return focus to when the drawer closes.
  drawerPrevFocus = (typeof document !== 'undefined' && document.activeElement) || null;
  const titleId = 'drawer-title-' + (++drawerTitleId);
  const titleEl = el('div', { class: 'title', id: titleId }, title);
  drawerEl.setAttribute('aria-labelledby', titleId);
  const head = el('div', { class: 'drawer-head' }, el('div', {}, titleEl, subtitle ? el('div', { class: 'small muted' }, subtitle) : null), el('div', { class: 'spacer' }), el('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: closeDrawer }, icon('x', 18)));
  const bodyEl = el('div', { class: 'drawer-body' });
  if (typeof body === 'function') body(bodyEl); else if (body) bodyEl.append(body);
  const foot = actions ? el('div', { class: 'drawer-foot' }, ...[].concat(actions)) : null;
  mount(drawerEl, head, bodyEl, foot);
  requestAnimationFrame(() => { scrimEl.classList.add('open'); drawerEl.classList.add('open'); });
  // Move focus into the drawer and trap Tab within it; Escape closes.
  if (drawerTrap && typeof document !== 'undefined') document.removeEventListener('keydown', drawerTrap);
  drawerTrap = trapFocus(drawerEl, { onEscape: closeDrawer });
  if (typeof document !== 'undefined') document.addEventListener('keydown', drawerTrap);
  drawerOpen = true;
  requestAnimationFrame(() => { if (drawerOpen && drawerTrap) drawerTrap.focusFirst(); });
  return bodyEl;
}
export function closeDrawer() {
  if (!drawerEl || !drawerOpen) return;
  drawerOpen = false;
  scrimEl.classList.remove('open'); drawerEl.classList.remove('open');
  if (drawerTrap && typeof document !== 'undefined') { document.removeEventListener('keydown', drawerTrap); drawerTrap = null; }
  // Restore focus to the element that opened the drawer.
  const prev = drawerPrevFocus; drawerPrevFocus = null;
  if (prev && typeof prev.focus === 'function') { try { prev.focus(); } catch { /* detached */ } }
}

/* ---------- Dialog ---------- */
let modalTitleId = 0;
// Wires focus management for a modal dialog: records the previously-focused
// element, moves focus inside, traps Tab, closes on Escape, and restores focus
// on teardown. Returns a teardown fn to call from the dialog's own close().
function wireDialogA11y(dialogEl, close) {
  const prevFocus = (typeof document !== 'undefined' && document.activeElement) || null;
  const trap = trapFocus(dialogEl, { onEscape: close });
  if (typeof document !== 'undefined') document.addEventListener('keydown', trap);
  requestAnimationFrame(() => trap.focusFirst());
  return () => {
    if (typeof document !== 'undefined') document.removeEventListener('keydown', trap);
    if (prevFocus && typeof prevFocus.focus === 'function') { try { prevFocus.focus(); } catch { /* detached */ } }
  };
}
export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false, requireText }) {
  return new Promise((resolve) => {
    const input = requireText ? el('input', { type: 'text', placeholder: `Type ${requireText} to confirm`, style: { width: '100%', marginTop: '10px' } }) : null;
    const scrim = el('div', { class: 'modal-scrim' });
    let teardown = () => {};
    const done = (v) => { teardown(); scrim.remove(); resolve(v); };
    const confirmBtn = el('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), onclick: () => { if (requireText && input.value !== requireText) return; done(true); } }, confirmLabel);
    const titleId = 'modal-title-' + (++modalTitleId);
    const dialog = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
      el('div', { class: 'modal-head', id: titleId }, title),
      el('div', { class: 'modal-body' }, message, input),
      el('div', { class: 'modal-foot' }, el('button', { class: 'btn ghost', onclick: () => done(false) }, 'Cancel'), confirmBtn));
    scrim.append(dialog);
    document.body.append(scrim);
    scrim.addEventListener('click', (e) => { if (e.target === scrim) done(false); });
    teardown = wireDialogA11y(dialog, () => done(false));
    if (input && input.focus) input.focus();
  });
}
export function modal({ title, body, actions, width }) {
  const scrim = el('div', { class: 'modal-scrim' });
  let teardown = () => {};
  const close = () => { teardown(); scrim.remove(); };
  const bodyEl = el('div', { class: 'modal-body' });
  if (typeof body === 'function') body(bodyEl, close); else bodyEl.append(body);
  const titleId = 'modal-title-' + (++modalTitleId);
  const dialog = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, style: width ? { width: width + 'px' } : null }, el('div', { class: 'modal-head row', id: titleId }, el('span', {}, title), el('span', { class: 'spacer' }), el('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close }, icon('x', 16))), bodyEl, actions ? el('div', { class: 'modal-foot' }, ...actions(close)) : null);
  scrim.append(dialog);
  scrim.addEventListener('click', (e) => { if (e.target === scrim) close(); });
  document.body.append(scrim);
  teardown = wireDialogA11y(dialog, close);
  return { close };
}

/* ---------- Command palette (⌘/Ctrl-K) ---------- */
// A keyboard-first overlay that fuzzy-matches static commands (navigation +
// actions) and, as the user types, live records fetched via `searchRecords`.
// Accessible: role="dialog"/aria-modal, a combobox input driving a listbox of
// role="option" rows with aria-activedescendant/aria-selected, focus trapped
// via trapFocus, Escape closes, focus restored on teardown. Deterministic and
// framework-free. Mirrors the accessible pattern used by the top-bar search.
//
// `commands`: array of { id?, title, group, hint?, keywords?, iconName?, run }.
//   group is one of 'Commands' | 'Navigate' (rendered in a fixed order; any
//   other value falls after these). `run(close)` performs the action; the
//   palette closes first unless `run` returns the string 'keep-open'.
// `searchRecords(query)`: optional async fn returning an array of the same
//   command shape (typically group 'Records'); called (debounced) on input.
//
// Substring/subsequence fuzzy match: a query matches when every query char
// appears in order within the command's haystack (title + keywords + hint).
export function fuzzyMatch(query, text) {
  const q = String(query || '').toLowerCase().replace(/\s+/g, '');
  const t = String(text || '').toLowerCase();
  if (!q) return true;
  if (t.includes(q)) return true; // fast path: contiguous substring
  let i = 0;
  for (let j = 0; j < t.length && i < q.length; j++) if (t[j] === q[i]) i++;
  return i === q.length;
}

let paletteOpen = false;
export function commandPalette({ commands = [], searchRecords, placeholder = 'Type a command or search…' } = {}) {
  if (paletteOpen) return { close: () => {} };
  paletteOpen = true;
  const GROUP_ORDER = { Commands: 0, Navigate: 1, Records: 2 };

  const scrim = el('div', { class: 'modal-scrim', style: { alignContent: 'start', paddingTop: '12vh' } });
  const input = el('input', {
    type: 'text', placeholder, 'aria-label': 'Command palette', role: 'combobox',
    'aria-expanded': 'true', 'aria-controls': 'cmdp-list', 'aria-autocomplete': 'list', autocomplete: 'off',
    style: { flex: '1', minWidth: '0', height: '30px', background: 'transparent', border: '0', color: 'var(--text)', fontSize: '15px', padding: '0' },
  });
  const list = el('div', { class: 'search-results', id: 'cmdp-list', role: 'listbox', 'aria-label': 'Commands and results', style: { position: 'static', border: '0', boxShadow: 'none', borderRadius: '0', maxHeight: '52vh', marginTop: '4px' } });
  const hintRow = el('div', { class: 'row small muted', style: { gap: '12px', padding: '8px 14px 2px', borderTop: '1px solid var(--border)' } },
    el('span', {}, 'Navigate & search'), el('span', { class: 'spacer' }),
    el('span', {}, '↑↓ to move'), el('span', {}, '↵ to run'), el('span', {}, 'Esc to close'));
  const dialog = el('div', {
    class: 'cmdp', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Command palette',
    style: { width: '560px', maxWidth: '94vw', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: '12px', boxShadow: 'var(--shadow)', overflow: 'hidden' },
  },
    el('div', { class: 'row', style: { gap: '10px', padding: '12px 14px', borderBottom: '1px solid var(--border)' } }, icon('search', 17), input),
    list, hintRow);
  scrim.append(dialog);

  let items = [];   // flat, visually-ordered option nodes
  let active = -1;
  let seq = 0;
  let debounce;
  let recordCache = [];  // records from the last searchRecords resolve
  let lastRecordQuery = null;

  const prevFocus = (typeof document !== 'undefined' && document.activeElement) || null;
  const trap = trapFocus(dialog, { onEscape: () => close() });
  function close() {
    if (!paletteOpen) return;
    paletteOpen = false;
    clearTimeout(debounce);
    if (typeof document !== 'undefined') document.removeEventListener('keydown', trap);
    scrim.remove();
    if (prevFocus && typeof prevFocus.focus === 'function') { try { prevFocus.focus(); } catch { /* detached */ } }
  }

  function setActive(i) {
    if (items[active]) { items[active].classList.remove('active'); items[active].setAttribute('aria-selected', 'false'); }
    active = i;
    if (items[active]) {
      items[active].classList.add('active');
      items[active].setAttribute('aria-selected', 'true');
      input.setAttribute('aria-activedescendant', items[active].id);
      if (items[active].scrollIntoView) items[active].scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  function optionNode(cmd) {
    const node = el('div', { class: 'sr-item', id: 'cmdp-opt-' + (++seq), role: 'option', 'aria-selected': 'false' },
      cmd.iconName ? icon(cmd.iconName, 15) : el('span', { class: 'ic-wrap', style: { width: '15px' } }),
      el('span', {}, cmd.title),
      el('span', { class: 'spacer' }),
      cmd.hint ? el('span', { class: 'badge sq neutral', style: { fontSize: '10px' } }, cmd.hint) : null);
    const activate = () => { const keep = cmd.run && cmd.run(close); if (keep !== 'keep-open') close(); };
    node.addEventListener('click', activate);
    node._run = activate;
    return node;
  }

  function render(q) {
    list.replaceChildren();
    items = []; active = -1; input.removeAttribute('aria-activedescendant');
    const matched = commands.filter((c) => fuzzyMatch(q, [c.title, c.hint, (c.keywords || []).join(' '), c.group].join(' ')));
    const pool = matched.concat(recordCache);
    const groups = new Map();
    for (const c of pool) { const g = c.group || 'Commands'; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(c); }
    const orderedGroups = [...groups.keys()].sort((a, b) => (GROUP_ORDER[a] ?? 9) - (GROUP_ORDER[b] ?? 9));
    for (const g of orderedGroups) {
      const rows = groups.get(g);
      if (!rows.length) continue;
      list.append(el('div', { class: 'sr-group', role: 'presentation' }, g));
      for (const c of rows) { const n = optionNode(c); items.push(n); list.append(n); }
    }
    if (!items.length) list.append(el('div', { class: 'sr-item muted', role: 'presentation' }, q ? 'No matches' : 'No commands'));
    else setActive(0);
  }

  input.addEventListener('input', () => {
    const q = input.value.trim();
    render(q);
    clearTimeout(debounce);
    if (!searchRecords || q.length < 2) { if (recordCache.length) { recordCache = []; lastRecordQuery = null; render(q); } return; }
    debounce = setTimeout(async () => {
      if (q === lastRecordQuery) return;
      try {
        const recs = await searchRecords(q);
        if (!paletteOpen) return;
        if (input.value.trim() !== q) return; // stale
        lastRecordQuery = q;
        recordCache = Array.isArray(recs) ? recs : [];
        render(input.value.trim());
      } catch { /* leave command results; ignore search failure */ }
    }, 200);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { if (!items.length) return; if (e.preventDefault) e.preventDefault(); setActive(active + 1 >= items.length ? 0 : active + 1); }
    else if (e.key === 'ArrowUp') { if (!items.length) return; if (e.preventDefault) e.preventDefault(); setActive(active <= 0 ? items.length - 1 : active - 1); }
    else if (e.key === 'Enter') { if (items[active] && items[active]._run) { if (e.preventDefault) e.preventDefault(); items[active]._run(); } }
    // Escape is handled by the focus trap (onEscape -> close).
  });

  scrim.addEventListener('click', (e) => { if (e.target === scrim) close(); });
  document.body.append(scrim);
  if (typeof document !== 'undefined') document.addEventListener('keydown', trap);
  render('');
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => { if (input.focus) try { input.focus(); } catch { /* shim */ } });
  else if (input.focus) try { input.focus(); } catch { /* shim */ }
  return { close };
}

/* ---------- Toast ---------- */
// Two live-region hosts so screen readers announce transient feedback:
//  · polite (role="status", aria-live="polite") for info/success/warn
//  · assertive (role="alert", aria-live="assertive") for errors, which
//    interrupt so the user is not left unaware of a failure.
let toastHostPolite, toastHostAssertive;
function toastHostFor(assertive) {
  if (assertive) {
    if (!toastHostAssertive) { toastHostAssertive = el('div', { class: 'toasts', role: 'alert', 'aria-live': 'assertive', 'aria-atomic': 'true' }); document.body.append(toastHostAssertive); }
    return toastHostAssertive;
  }
  if (!toastHostPolite) { toastHostPolite = el('div', { class: 'toasts', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' }); document.body.append(toastHostPolite); }
  return toastHostPolite;
}
export function toast(msg, { type = 'info', title, timeout = 4000 } = {}) {
  const host = toastHostFor(type === 'error');
  const t = el('div', { class: `toast ${type}` }, icon(type === 'success' ? 'check' : type === 'error' ? 'alert' : type === 'warn' ? 'alert' : 'bell', 16), el('div', {}, title ? el('div', { class: 't-title' }, title) : null, el('div', { class: 't-msg' }, msg)));
  host.append(t);
  setTimeout(() => t.remove(), timeout);
}

/* ---------- misc ---------- */
export function meter(pct, cls) { return el('div', { class: 'meter' }, el('span', { style: { width: Math.max(0, Math.min(100, pct)) + '%', background: cls } })); }
export const store = { collapsed: false, counts: {} };


/* ---------- Shared module metadata (Home / About / nav) ---------- */
export const MODULES = [
  { key: 'nexus', route: '#/nexus', name: 'Sovereign Nexus', icon: 'nexus', color: '#4d8df0',
    tagline: 'Corporate ownership & beneficial-owner forensics',
    what: 'Maps who really owns and controls companies — tracing shell companies, parents, trusts and ultimate beneficial owners across jurisdictions such as Geneva, the BVI and the Cayman Islands.',
    does: 'An interactive ownership network, a jurisdiction map, and a transparent "Jurisdictional Asset Flight Risk" score for every entity.',
    who: 'Investigators, KYC/AML analysts, journalists and due-diligence teams.' },
  { key: 'chainlink', route: '#/chainlink', name: 'Chain-Link Engine', icon: 'chain', color: '#37c2b4',
    tagline: 'Crypto transaction tracing',
    what: 'Follows the money across blockchain wallets to expose laundering patterns.',
    does: 'A deterministic "peel-chain" laundering simulator (50+ hops), a transaction graph with playback, and detectors for velocity spikes, fan-in/out, mixers, bridges and exchange convergence.',
    who: 'Blockchain-forensics analysts, financial-crime investigators and exchanges.' },
  { key: 'waterfall', route: '#/waterfall', name: 'Liquidation Waterfall', icon: 'waterfall', color: '#a97bf0',
    tagline: 'Insolvency recovery modelling',
    what: 'Models who gets paid, and how much, when a company is wound down.',
    does: 'A currency-exact distribution engine across secured, preferential and unsecured creditor classes, with live assumptions, a Sankey recovery flow and clawback probabilities.',
    who: 'Insolvency practitioners, restructuring advisors, creditors and litigation funders.' },
  { key: 'regulatory', route: '#/regulatory', name: 'Regulatory Horizon', icon: 'regulatory', color: '#e5a53b',
    tagline: 'Compliance monitoring & policy comparison',
    what: 'Tracks regulatory change and checks your internal policies against it.',
    does: 'An operational-impact alert feed built on real, publicly-sourced instruments (GDPR, MiCA, DORA, FINMA circulars, the Swiss FADP, Geneva LIPAD and more) across finance, education and healthcare, plus a sandbox that checks an internal policy against a regulation to flag gaps and contradictions.',
    who: 'Compliance officers, legal and regulatory teams, and risk managers.' },
];

export const LOGO_SVG = '<img src="data:image/png;base64,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" alt="FRIS" style="width:100%;height:100%;object-fit:contain;display:block" />';

/** A small info affordance: an "i" that reveals an explanation on hover/focus. */
export function infoDot(text) {
  return el('span', { class: 'infodot', tabindex: 0, role: 'note', 'aria-label': text, title: text }, 'i');
}

/* ---------- Per-page Help ("what am I seeing & why") ---------- */
// Keyed by the first route segment (e.g. #/nexus/map -> 'nexus'). Any page
// rendered through pageHead() gets a Help button automatically; pages without
// an entry simply show no button.
export const PAGE_HELP = {
  home: {
    title: 'Home',
    what: 'The landing page for FRIS. It introduces the four investigation modules and lets you jump straight into any of them.',
    why: 'This is your starting point. Pick a module card to open it, or use the left sidebar to navigate at any time.',
  },
  overview: {
    title: 'Executive Overview',
    what: 'A single dashboard that rolls up the headline numbers from across the suite — entities under review, traced transactions, insolvency cases and regulatory instruments — alongside the latest alerts and a recent-activity log.',
    why: 'It is the at-a-glance health check across the whole suite. Use the KPI cards and the “Open” links on each panel to drill into whichever module needs attention.',
    tips: ['Click a highest-risk entity to open its full profile.', 'The activity log records everything done in this session.'],
  },
  nexus: {
    title: 'Sovereign Nexus',
    what: 'Sovereign Nexus maps who really owns and controls companies — tracing shell companies, parents, trusts and ultimate beneficial owners across jurisdictions. It has three tabs: the Network Explorer (an interactive ownership graph), the Entity Directory (a searchable list) and the Jurisdiction Map.',
    why: 'Use it to follow beneficial ownership and spot offshore layering that hides control. Switch tabs to change the lens; click any entity to see its owners and a transparent “Jurisdictional Asset Flight Risk” score.',
    tips: ['Network Explorer: drag to pan, pinch or Ctrl+scroll to zoom, click a node to focus its connections.', 'Every entity’s flight-risk score can be opened and inspected factor by factor.'],
  },
  chainlink: {
    title: 'Chain-Link Engine',
    what: 'The Chain-Link Engine follows crypto funds across wallets — exchanges, mixers, bridges, merchants and personal wallets — to expose laundering patterns, and includes a peel-chain simulator that models layering across many hops.',
    why: 'Use it to trace where money goes and to test laundering scenarios. The graph shows how funds move between wallet types; the simulator shows how a sum is broken up and where risk concentrates.',
    tips: ['Node shape and colour show the wallet type; a mixer is flagged in red.', 'Not every wallet is high-risk — risk reflects the wallet’s behaviour and links.'],
  },
  waterfall: {
    title: 'Liquidation Waterfall',
    what: 'The Liquidation Waterfall models who gets paid, and how much, when an insolvent company is wound down — distributing the estate across secured, preferential and unsecured creditor classes in legal priority order.',
    why: 'Use it to see recovery rates and shortfalls per creditor class. Adjust the assumptions to see distributions change; the Sankey flow shows money moving from realised assets to creditors.',
    tips: ['Pick a case to load its creditors and asset base.', 'Shortfall = the part of a class’s claim that is not recovered once the estate is exhausted.'],
  },
  regulatory: {
    title: 'Regulatory Horizon',
    what: 'Regulatory Horizon tracks real, publicly-sourced regulations (GDPR, MiCA, DORA, FINMA circulars, the Swiss FADP, Geneva LIPAD and more) and scores each one for operational impact and effective date.',
    why: 'Use it to stay ahead of regulatory change and to check internal policies against the rules. Open any instrument for its obligations and a link to the official source.',
    tips: ['The register is real — each instrument links to its authority’s source document.', 'The sandbox compares an internal policy against a regulation to flag gaps and contradictions.'],
  },
  data: {
    title: 'Data Management',
    what: 'A view of every table in the underlying dataset with row counts, plus tools to import, export or reset the demonstration data.',
    why: 'This is the raw data layer that powers the modules. Use it to export a CSV, load your own material, or reset back to the seeded demo dataset.',
  },
  cases: {
    title: 'Saved Cases',
    what: 'Cross-module dossiers. A case can link an entity, a wallet trace, an insolvency scenario and a regulation into one investigation file.',
    why: 'Use it to gather related findings from different modules into a single place you can return to.',
  },
  about: {
    title: 'About FRIS',
    what: 'Background on the suite: what it is, who it is for, how the modules fit together, and an honest note on which data is real and which is synthetic.',
    why: 'You are here to understand the bigger picture and judge whether the tool fits your work.',
  },
  audit: {
    title: 'Audit Trail',
    what: 'A local, chronological record of every action taken in this session — flags raised, notes added, simulations run and exports made.',
    why: 'Use it to review what has been done and when. Everything is stored locally for transparency.',
  },
  settings: {
    title: 'Settings',
    what: 'Application preferences for FRIS.',
    why: 'Adjust display and data options here.',
  },
};
function helpKey() {
  const h = (typeof location !== 'undefined' ? location.hash : '') || '';
  const seg = h.replace(/^#\/?/, '').split('/')[0];
  return seg || 'home';
}
export function openHelp(key) {
  const k = key || helpKey();
  const h = PAGE_HELP[k];
  if (!h) return;
  const blk = (heading, text) => el('div', { style: { marginBottom: '16px' } },
    el('div', { style: { fontWeight: 600, color: 'var(--text)', marginBottom: '5px', fontSize: '13px' } }, heading),
    el('p', { style: { margin: 0, lineHeight: '1.6', color: 'var(--text-2)' } }, text));
  modal({
    title: 'About this page — ' + h.title,
    width: 580,
    body: (b) => {
      b.append(blk('What you’re looking at', h.what));
      b.append(blk('Why you’re seeing it & how to use it', h.why));
      if (h.tips && h.tips.length) {
        b.append(el('div', {},
          el('div', { style: { fontWeight: 600, color: 'var(--text)', marginBottom: '5px', fontSize: '13px' } }, 'Tips'),
          el('ul', { style: { margin: 0, paddingLeft: '18px', lineHeight: '1.7', color: 'var(--text-2)' } }, ...h.tips.map((t) => el('li', {}, t)))));
      }
    },
  });
}
/** Help button for the current route; returns null when the route has no help entry. */
export function helpButton() {
  const k = helpKey();
  if (!PAGE_HELP[k]) return null;
  return el('button', { class: 'btn sm ghost', title: 'What am I looking at, and why?', 'aria-label': 'Help for this page', onclick: () => openHelp(k) }, icon('info', 15), 'Help');
}
