// FRIS application shell, router and boot.
import { el, api, icon, toast, store, openDrawer, closeDrawer, errorState, skeleton, statusBadge, fmt, modal, confirmDialog, commandPalette, openHelp, LOGO_SVG } from './core.js';
import { home, about } from './views0.js';
import { overview, nexus, chainlink, openEntityDrawer, openWalletDrawer, exportData } from './views1.js';
import { waterfall, regulatory, data, cases, audit, settings } from './views2.js';
import { compliance } from './views3.js';
import { screening } from './views4.js';
import { monitoring } from './views5.js';
import { financials } from './views6.js';
import { vendors } from './views7.js';
import { adverseMedia } from './views8.js';
import { riskIndex } from './views9.js';
import { enforcement } from './views10.js';
import { surveillance } from './views11.js';
import { register } from './views12.js';
import { recovery } from './views13.js';
import { onboarding } from './views14.js';
import { typology } from './views15.js';

const ROUTES = { home, overview, nexus, chainlink, waterfall, regulatory, compliance, screening, monitoring, financials, vendors, 'adverse-media': adverseMedia, 'risk-index': riskIndex, enforcement, surveillance, register, recovery, onboarding, typology, data, cases, audit, settings, about };
const NAV = [
  { group: 'Overview', items: [
    { r: 'home', label: 'Home', icon: 'home', hint: 'Start here — suite landing page' },
    { r: 'overview', label: 'Executive Overview', icon: 'overview', hint: 'Headline KPIs across the whole suite' },
  ] },
  { group: 'Investigations & Forensics', items: [
    { r: 'nexus', label: 'Sovereign Nexus', icon: 'nexus', hint: 'Corporate ownership & control network' },
    { r: 'chainlink', label: 'Chain-Link Engine', icon: 'chain', hint: 'Cryptocurrency transaction tracing' },
  ] },
  { group: 'Recovery & Insolvency', items: [
    { r: 'recovery', label: 'Asset Tracing & Recovery', icon: 'search', hint: 'Follow the asset: where is the recoverable value' },
    { r: 'waterfall', label: 'Liquidation Waterfall', icon: 'waterfall', hint: 'Insolvency payout-priority modelling' },
  ] },
  { group: 'Financial Crime & AML', items: [
    { r: 'screening', label: 'Screening & Watchlist', icon: 'alert', hint: 'Sanctions / PEP / watchlist name matching' },
    { r: 'monitoring', label: 'Transaction Monitoring & SAR', icon: 'bell', hint: 'Transaction alerting & suspicious-activity reports' },
    { r: 'adverse-media', label: 'Adverse-Media / OSINT', icon: 'regulatory', hint: 'Negative-news / open-source intelligence' },
    { r: 'vendors', label: 'Third-Party / Vendor Risk', icon: 'nexus', hint: 'Counterparty due-diligence & continuous scoring' },
    { r: 'onboarding', label: 'KYC & Onboarding', icon: 'folder', hint: 'Customer due-diligence & risk rating' },
    { r: 'surveillance', label: 'Trade Surveillance', icon: 'eye', hint: 'Market-abuse detection (insider, spoofing, wash)' },
    { r: 'typology', label: 'Financial-Crime Typology Lab', icon: 'chain', hint: 'Build laundering scenarios & validate detectors' },
  ] },
  { group: 'Regulatory & Compliance', items: [
    { r: 'regulatory', label: 'Regulatory Horizon', icon: 'regulatory', hint: 'Upcoming regulation & horizon scanning' },
    { r: 'compliance', label: 'Compliance Sandbox', icon: 'scale', hint: 'Check a problem against law, regulation & policy' },
    { r: 'register', label: 'Control Register (GRC)', icon: 'check', hint: 'Obligations mapped to controls & posture' },
    { r: 'enforcement', label: 'Enforcement Tracker', icon: 'alert', hint: 'Real regulator fines & enforcement actions' },
    { r: 'risk-index', label: 'Country & Sector Risk Index', icon: 'overview', hint: 'Jurisdiction & sector risk heat-map' },
  ] },
  { group: 'Workspace', items: [
    { r: 'financials', label: 'Financial Report', icon: 'overview', hint: 'Quarterly financial report dashboard' },
    { r: 'data', label: 'Data Management', icon: 'database', hint: 'Browse & export the underlying data' },
    { r: 'cases', label: 'Saved Cases', icon: 'folder', hint: 'Your saved investigation case files' },
    { r: 'audit', label: 'Audit Log', icon: 'history', hint: 'Activity log of actions taken' },
    { r: 'settings', label: 'System Settings', icon: 'settings', hint: 'Preferences & demo-data reset' },
    { r: 'about', label: 'About', icon: 'info', hint: 'What FRIS is & who it helps' },
  ] },
];
const LABELS = Object.fromEntries(NAV.flatMap((g) => g.items).map((i) => [i.r, i.label]));

let navEls = {};
let crumbEl, shellEl, scrimEl;

function closeMobile() { if (shellEl) shellEl.classList.remove('mobile-open'); }
function toggleSidebar() {
  if (window.innerWidth <= 900) shellEl.classList.toggle('mobile-open');
  else { store.collapsed = !store.collapsed; shellEl.classList.toggle('collapsed', store.collapsed); }
}
function onNavClick(e, r) {
  closeMobile();
  const cur = location.hash.replace(/^#\/?/, '').split('/')[0] || 'home';
  if (cur === r) { e.preventDefault(); const m = document.getElementById('main'); if (m) m.scrollTop = 0; navigate(); }
}

/* ---------- Day / night theme (dark remains the default) ---------- */
// The toggle lives in the topbar, next to the Home breadcrumb ("FRIS / …"),
// so it never overlaps the right-hand cluster (search / ⌘K / alerts / the
// Synthetic Demo Data pill). Preference persists under the same key the
// standalone build uses, so both variants share the choice on one origin.
const THEME_KEY = 'fris-theme';
function applyTheme(t) {
  if (t === 'light') document.documentElement.setAttribute('data-fris-theme', 'light');
  else document.documentElement.removeAttribute('data-fris-theme');
}
try { applyTheme(localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'); } catch { applyTheme('dark'); }
function themeToggleButton() {
  const b = el('button', { class: 'theme-toggle', id: 'fris-theme-toggle', type: 'button' });
  const label = () => {
    const light = document.documentElement.getAttribute('data-fris-theme') === 'light';
    b.replaceChildren(el('span', { class: 'ico', 'aria-hidden': 'true' }, light ? '☀' : '☾'), el('span', { class: 'theme-toggle-text' }, light ? 'Light' : 'Dark'));
    const t = light ? 'Switch to dark mode' : 'Switch to a warm light mode';
    b.title = t; b.setAttribute('aria-label', t);
  };
  label();
  b.addEventListener('click', () => {
    const light = document.documentElement.getAttribute('data-fris-theme') === 'light';
    applyTheme(light ? 'dark' : 'light');
    try { localStorage.setItem(THEME_KEY, light ? 'dark' : 'light'); } catch {}
    label();
  });
  return b;
}

function buildShell() {
  navEls = {};
  const sidebar = el('div', { class: 'sidebar' },
    el('a', { class: 'brand', href: '#/home', onclick: (e) => onNavClick(e, 'home') },
      el('div', { class: 'brand-crest', html: LOGO_SVG }),
      el('div', { class: 'brand-text' }, el('div', { class: 'brand-name' }, 'FRIS'), el('div', { class: 'brand-sub' }, 'Intelligence Suite'))),
    el('nav', { class: 'nav', 'aria-label': 'Primary' }, ...NAV.map((g) => el('div', {}, el('div', { class: 'nav-section-title' }, g.group), ...g.items.map((it) => {
      const badge = el('span', { class: 'nav-badge', style: { display: 'none' } });
      const node = el('a', { class: 'nav-item', href: '#/' + it.r, 'data-r': it.r, title: it.hint || it.label, onclick: (e) => onNavClick(e, it.r) }, icon(it.icon, 18), el('span', { class: 'nav-label' }, it.label), badge);
      navEls[it.r] = { node, badge };
      return node;
    })))),
    el('div', { class: 'sidebar-foot' }, el('div', { class: 'row small muted', style: { gap: '8px' } }, el('div', { class: 'brand-logo', style: { width: '26px', height: '26px' } }, el('span', { class: 'demo-user' }, 'DA')), el('div', { class: 'nav-label' }, el('div', {}, 'Demo Analyst'), el('div', { class: 'muted', style: { fontSize: '11px' } }, 'Local session')))));

  const results = el('div', { class: 'search-results', id: 'global-search-results', role: 'listbox', 'aria-label': 'Search results', style: { display: 'none' } });
  const search = el('input', { type: 'text', placeholder: 'Search entities, wallets, instruments…', 'aria-label': 'Global search', role: 'combobox', 'aria-expanded': 'false', 'aria-controls': 'global-search-results', 'aria-autocomplete': 'list', autocomplete: 'off' });
  const searchWrap = el('div', { class: 'search' }, icon('search', 16), search, results);
  wireSearch(search, results);

  crumbEl = el('div', { class: 'crumbs' });
  const topbar = el('div', { class: 'topbar' },
    el('button', { class: 'icon-btn', title: 'Show / hide navigation', 'aria-label': 'Toggle navigation', onclick: toggleSidebar }, icon('menu', 18)),
    crumbEl,
    themeToggleButton(),
    searchWrap,
    el('button', { class: 'btn sm ghost cmdk-btn', title: 'Command palette (Ctrl/⌘ + K)', 'aria-label': 'Open command palette', 'aria-keyshortcuts': 'Control+K Meta+K', onclick: openPalette }, icon('search', 15), el('span', { class: 'cmdk-hint', 'aria-hidden': 'true', style: { fontFamily: 'var(--mono)', fontSize: '11px', opacity: '0.85' } }, '⌘K')),
    el('button', { class: 'icon-btn', title: 'Alert centre', 'aria-label': 'Alert centre', onclick: openAlerts }, icon('bell', 18)),
    el('button', { class: 'demo-tag', title: 'Click to learn why this is here', 'aria-label': 'Synthetic demo data — why is this here?', onclick: showSyntheticInfo }, el('span', { class: 'dot', 'aria-hidden': 'true' }), el('span', { class: 'demo-tag-text' }, 'Synthetic Demo Data'), icon('info', 13)));

  const main = el('div', { class: 'main', id: 'main' });
  scrimEl = el('div', { class: 'sidebar-scrim', onclick: closeMobile });
  shellEl = el('div', { class: 'shell' }, sidebar, topbar, main, scrimEl);
  const app = document.getElementById('app');
  app.replaceChildren(shellEl);
  app.setAttribute('aria-busy', 'false');
}

function showSyntheticInfo() {
  modal({ title: 'Why "Synthetic Demo Data"?', body: (b) => b.append(
    el('p', { class: 'about-p' }, 'Most of FRIS is fabricated for demonstration — the companies, people, wallets, transactions and cases are all invented. Regulatory Horizon is the exception: its regulations are real and link to official sources; only the internal policies compared against them are synthetic.'),
    el('p', { class: 'about-p' }, 'No synthetic record refers to a real party, and the analytical scores are illustrative, not factual allegations — so the app can be shared and explored freely.')),
    actions: (close) => [el('button', { class: 'btn primary', onclick: close }, 'Got it')] });
}

function setActive(r) { for (const [key, { node }] of Object.entries(navEls)) node.classList.toggle('active', key === r); }
function updateCrumbs(r, parts) {
  const toTop = () => { const m = document.getElementById('main'); if (m) m.scrollTop = 0; };
  crumbEl.replaceChildren(
    el('a', { href: '#/home', class: 'crumb-link', onclick: (e) => onNavClick(e, 'home') }, 'FRIS'),
    el('span', { class: 'sep' }, '/'),
    el('a', { href: '#/' + r, class: 'cur crumb-link', title: 'Back to top', onclick: (e) => { if ((location.hash.replace(/^#\/?/, '').split('/')[0] || 'home') === r) { e.preventDefault(); toTop(); } } }, LABELS[r] || 'Home'),
    ...(parts.length ? [el('span', { class: 'sep' }, '/'), el('span', { class: 'cur' }, fmt.title(parts.join(' · ')))] : []));
}

function navigate() {
  const hash = location.hash.replace(/^#\/?/, '');
  const segs = hash.split('/').filter(Boolean);
  const r = segs[0] && ROUTES[segs[0]] ? segs[0] : 'home';
  const parts = segs.slice(1);
  setActive(r);
  updateCrumbs(r, parts);
  closeDrawer();
  closeMobile();
  const main = document.getElementById('main');
  const page = el('div', { class: 'page' });
  main.replaceChildren(page); main.scrollTop = 0;
  Promise.resolve().then(() => ROUTES[r](page, parts)).catch((e) => { console.error(e); page.append(errorState(e.message)); });
}

function wireSearch(input, results) {
  let t;
  let items = [];      // current option <div>s in visual order
  let active = -1;      // index of the highlighted option (-1 = none)
  let optionSeq = 0;

  const open = () => { results.style.display = 'block'; input.setAttribute('aria-expanded', 'true'); };
  const close = () => { results.style.display = 'none'; input.setAttribute('aria-expanded', 'false'); setActive(-1); };
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

  input.addEventListener('input', () => {
    clearTimeout(t);
    const q = input.value.trim();
    if (q.length < 2) { close(); return; }
    t = setTimeout(async () => {
      try {
        const [ents, wals, regs] = await Promise.all([
          api.get('/api/entities?limit=5&q=' + encodeURIComponent(q)),
          api.get('/api/wallets?limit=5&q=' + encodeURIComponent(q)),
          api.get('/api/regulatory/instruments?limit=5&q=' + encodeURIComponent(q)),
        ]);
        results.replaceChildren();
        items = []; active = -1; input.removeAttribute('aria-activedescendant');
        // Each result is a role="option" the input points at via aria-activedescendant.
        const opt = (onSelect, ...kids) => {
          const node = el('div', { class: 'sr-item', id: 'sr-opt-' + (++optionSeq), role: 'option', 'aria-selected': 'false', onclick: onSelect }, ...kids);
          items.push(node);
          return node;
        };
        const group = (title, rows, render) => { if (!rows.length) return; results.append(el('div', { class: 'sr-group', role: 'presentation' }, title)); rows.forEach((row) => results.append(render(row))); };
        group('Entities', ents.rows, (e) => opt(() => { close(); input.value = ''; openEntityDrawer(e.id); }, icon('nexus', 15), el('span', {}, e.legal_name), el('span', { class: 'spacer' }), el('span', { class: 'badge sq neutral' }, e.jurisdiction || '—')));
        group('Wallets', wals.rows, (w) => opt(() => { close(); input.value = ''; openWalletDrawer(w.id); }, icon('chain', 15), el('span', {}, w.label || w.id), el('span', { class: 'spacer' }), el('span', { class: 'badge sq neutral' }, w.node_type)));
        group('Regulatory', regs.rows, (r) => opt(() => { close(); input.value = ''; location.hash = '#/regulatory/feed'; }, icon('regulatory', 15), el('span', {}, r.title.slice(0, 46))));
        if (!items.length) results.append(el('div', { class: 'sr-item muted', role: 'presentation' }, 'No matches'));
        open();
      } catch { close(); }
    }, 220);
  });

  // Keyboard navigation of the results listbox.
  input.addEventListener('keydown', (e) => {
    const isOpen = results.style.display !== 'none' && items.length;
    if (e.key === 'ArrowDown') {
      if (!isOpen) return;
      e.preventDefault(); setActive(active + 1 >= items.length ? 0 : active + 1);
    } else if (e.key === 'ArrowUp') {
      if (!isOpen) return;
      e.preventDefault(); setActive(active <= 0 ? items.length - 1 : active - 1);
    } else if (e.key === 'Enter') {
      if (isOpen && items[active]) { e.preventDefault(); items[active].click(); }
    } else if (e.key === 'Escape') {
      if (results.style.display !== 'none') { e.preventDefault(); e.stopPropagation(); close(); }
    }
  });

  document.addEventListener('click', (e) => { if (!results.contains(e.target) && e.target !== input) close(); });
  document.addEventListener('keydown', (e) => {
    const ae = document.activeElement;
    if (e.key === '/' && ae !== input && !(ae && /input|textarea/i.test(ae.tagName || ''))) { e.preventDefault(); input.focus(); }
    if (e.key === 'Escape') closeMobile();
  });
}

async function openAlerts() {
  const body = openDrawer({ title: 'Alert Centre', subtitle: 'Detections & overdue items', body: (b) => b.append(skeleton(200)) });
  try {
    const [al, up] = await Promise.all([api.get('/api/crypto/alerts'), api.get('/api/regulatory/upcoming')]);
    body.replaceChildren(
      el('div', { class: 'card-title mb' }, `Chain-Link detections (${al.total})`),
      ...al.alerts.slice(0, 10).map((a) => el('div', { class: 'row', style: { padding: '7px 0', borderBottom: '1px solid var(--border)' } }, statusBadge(a.severity), el('span', { class: 'small' }, a.reason))),
      el('div', { class: 'card-title mb mt2' }, `Overdue implementation (${up.overdue.length})`),
      ...up.overdue.slice(0, 10).map((o) => el('div', { class: 'row', style: { padding: '7px 0', borderBottom: '1px solid var(--border)' } }, statusBadge('Overdue'), el('span', { class: 'small' }, o.title), el('span', { class: 'spacer small muted nowrap' }, fmt.date(o.effective_date)))),
    );
  } catch (e) { body.replaceChildren(errorState(e.message)); }
}

/* ---------- Command palette (⌘/Ctrl-K) ---------- */
// Navigating away is done by setting location.hash (mirrors NAV + the per-view
// sub-tab routes). Actions reuse existing shell/view helpers so the palette
// never duplicates business logic.
const goHash = (h) => { closeMobile(); location.hash = h; };

// New-case action: replicates the Saved Cases "New case" modal here in the shell
// (that modal lives in views2.js and is not exported). Same endpoint & result.
function paletteNewCase() {
  const title = el('input', { type: 'text', placeholder: 'e.g. Project Meridian — offshore layering', style: { width: '100%' } });
  const mod = el('select', { style: { width: '100%' } }, ...['nexus', 'chainlink', 'waterfall', 'regulatory'].map((m) => el('option', { value: m }, fmt.title(m))));
  const prio = el('select', { style: { width: '100%' } }, ...['High', 'Medium', 'Low'].map((p) => el('option', { value: p }, p)));
  const field = (label, ctrl) => el('div', { class: 'field', style: { display: 'flex', width: '100%' } }, el('label', {}, label), ctrl);
  modal({ title: 'New case', body: (b) => b.append(field('Title', title), el('div', { class: 'mt' }), field('Module', mod), el('div', { class: 'mt' }), field('Priority', prio)), actions: (close) => [
    el('button', { class: 'btn ghost', onclick: close }, 'Cancel'),
    el('button', { class: 'btn primary', onclick: async () => { if (!title.value.trim()) { toast('Title required', { type: 'warn' }); return; } close(); try { const nc = await api.post('/api/cases', { title: title.value, module: mod.value, priority: prio.value }); toast('Case created', { type: 'success' }); location.hash = '#/cases/' + nc.id; } catch (e) { toast(e.message, { type: 'error' }); } } }, 'Create case')] });
}

// Reset-demo action: mirrors the Data Management danger-zone flow exactly.
async function paletteResetData() {
  if (await confirmDialog({ title: 'Reset demonstration data', message: 'This restores the deterministic seed, replacing all local changes (notes, saved traces, scenarios, imports). This cannot be undone.', confirmLabel: 'Reset data', danger: true, requireText: 'RESET' })) {
    toast('Resetting…');
    try { await api.post('/api/data/reset', { confirm: 'RESET' }); toast('Data reset complete', { type: 'success' }); setTimeout(() => location.reload(), 600); }
    catch (e) { toast(e.message, { type: 'error' }); }
  }
}

// The static registry: Navigate (every page + sub-tab) and Actions (Commands).
function paletteCommands() {
  const nav = (title, hash, iconName) => ({ group: 'Navigate', title, hint: hash, iconName, keywords: ['go', 'open', 'navigate'], run: () => goHash(hash) });
  return [
    // ── Actions ──
    { group: 'Commands', title: 'New case', hint: 'Create', iconName: 'plus', keywords: ['add', 'dossier', 'investigation'], run: paletteNewCase },
    { group: 'Commands', title: 'Reset demo data', hint: 'Danger', iconName: 'reset', keywords: ['seed', 'restore', 'wipe'], run: paletteResetData },
    { group: 'Commands', title: 'Export entities CSV', hint: 'Export', iconName: 'download', keywords: ['csv', 'download', 'entities'], run: () => exportData('entities') },
    { group: 'Commands', title: 'Export instruments CSV', hint: 'Export', iconName: 'download', keywords: ['csv', 'download', 'regulatory', 'register'], run: () => exportData('instruments') },
    { group: 'Commands', title: 'Open Alert Centre', hint: 'Alerts', iconName: 'bell', keywords: ['notifications', 'detections', 'overdue'], run: openAlerts },
    { group: 'Commands', title: 'Toggle sidebar', hint: 'View', iconName: 'menu', keywords: ['collapse', 'expand', 'navigation'], run: () => { toggleSidebar(); return 'keep-open'; } },
    { group: 'Commands', title: 'Open Help for this page', hint: 'Help', iconName: 'info', keywords: ['docs', 'what is this', 'guide'], run: () => openHelp() },
    // ── Navigate: top-level ──
    nav('Home', '#/home', 'home'),
    nav('Executive Overview', '#/overview', 'overview'),
    // ── Navigate: Sovereign Nexus ──
    nav('Sovereign Nexus', '#/nexus', 'nexus'),
    nav('Nexus · Network Explorer', '#/nexus/network', 'nexus'),
    nav('Nexus · Entity Directory', '#/nexus/directory', 'nexus'),
    nav('Nexus · Jurisdiction Map', '#/nexus/map', 'nexus'),
    // ── Navigate: Chain-Link ──
    nav('Chain-Link Engine', '#/chainlink', 'chain'),
    nav('Chain-Link · Transaction Graph', '#/chainlink/graph', 'chain'),
    nav('Chain-Link · Peeling-Chain Simulator', '#/chainlink/simulator', 'chain'),
    nav('Chain-Link · Wallet Directory', '#/chainlink/wallets', 'chain'),
    nav('Chain-Link · Detection Alerts', '#/chainlink/alerts', 'chain'),
    // ── Navigate: Liquidation Waterfall ──
    nav('Liquidation Waterfall', '#/waterfall', 'waterfall'),
    // ── Navigate: Regulatory Horizon ──
    nav('Regulatory Horizon', '#/regulatory', 'regulatory'),
    nav('Regulatory · Alert Feed', '#/regulatory/feed', 'regulatory'),
    nav('Regulatory · Upcoming Dates', '#/regulatory/upcoming', 'regulatory'),
    nav('Regulatory · Policy Comparison', '#/regulatory/sandbox', 'regulatory'),
    nav('Regulatory · Policy Library', '#/regulatory/policies', 'regulatory'),
    nav('Regulatory · Feed & Imports', '#/regulatory/imports', 'regulatory'),
    // ── Navigate: Compliance Sandbox ──
    nav('Compliance Sandbox', '#/compliance', 'scale'),
    // -- Navigate: Screening & Watchlist --
    nav('Screening & Watchlist', '#/screening', 'alert'),
    nav('Screening - Search & screen', '#/screening/search', 'alert'),
    nav('Screening - Watchlist browser', '#/screening/watchlists', 'database'),
    nav('Screening - Portfolio screening', '#/screening/portfolio', 'nexus'),
    // -- Navigate: Transaction Monitoring & SAR --
    nav('Transaction Monitoring & SAR', '#/monitoring', 'bell'),
    nav('Monitoring - Alert queue', '#/monitoring', 'bell'),
    // -- Navigate: Quarterly Financial Report --
    nav('Financial Report', '#/financials', 'overview'),
    nav('Financial Report - Latest quarter', '#/financials', 'overview'),
    // -- Navigate: Third-Party / Vendor Risk --
    nav('Third-Party / Vendor Risk', '#/vendors', 'nexus'),
    nav('Vendor Risk - Register', '#/vendors/register', 'database'),
    nav('Vendor Risk - Portfolio dashboard', '#/vendors/dashboard', 'overview'),
    // -- Navigate: Adverse-Media / OSINT Monitoring --
    nav('Adverse-Media / OSINT', '#/adverse-media', 'bell'),
    nav('Adverse-Media - Monitoring feed', '#/adverse-media/feed', 'bell'),
    nav('Adverse-Media - Watch dashboard', '#/adverse-media/dashboard', 'overview'),
    // -- Navigate: Country & Sector Risk Index --
    nav('Country & Sector Risk Index', '#/risk-index', 'database'),
    nav('Risk Index - Heat-map matrix', '#/risk-index/matrix', 'overview'),
    nav('Risk Index - Sector risk', '#/risk-index/sectors', 'waterfall'),
    nav('Risk Index - Combined lookup', '#/risk-index/combined', 'scale'),
    // -- Navigate: Litigation & Enforcement-Action Tracker --
    nav('Enforcement Tracker', '#/enforcement', 'scale'),
    nav('Enforcement - Trend & analytics', '#/enforcement', 'overview'),
    nav('Enforcement - Data-protection cases', '#/enforcement/category/Data%20Protection', 'regulatory'),
    nav('Enforcement - Sanctions cases', '#/enforcement/category/Sanctions', 'alert'),
    // -- Navigate: Market-Abuse / Trade Surveillance --
    nav('Trade Surveillance', '#/surveillance', 'eye'),
    nav('Trade Surveillance - Alert queue', '#/surveillance', 'eye'),
    nav('Trade Surveillance - Insider list', '#/surveillance/insiders', 'eye'),
    nav('Trade Surveillance - Insider-dealing alerts', '#/surveillance/type/insider-dealing', 'alert'),
    nav('Trade Surveillance - Spoofing alerts', '#/surveillance/type/spoofing', 'alert'),
    nav('Trade Surveillance - Wash-trading alerts', '#/surveillance/type/wash-trading', 'alert'),
    // -- Navigate: Obligation -> Control Register (GRC) --
    nav('Control Register (GRC)', '#/register', 'scale'),
    nav('Control Register (GRC) - Posture matrix', '#/register', 'overview'),
    nav('Control Register (GRC) - Gaps & remediation', '#/register/gaps', 'alert'),
    nav('Control Register (GRC) - GDPR obligations', '#/register/framework/gdpr', 'regulatory'),
    nav('Control Register (GRC) - ISO 27001 obligations', '#/register/framework/iso27001', 'database'),
    // -- Navigate: Asset Tracing & Recovery (the cross-suite CAPSTONE) --
    nav('Asset Tracing & Recovery', '#/recovery', 'nexus'),
    nav('Asset Tracing & Recovery - Follow the asset', '#/recovery', 'nexus'),
    nav('Asset Tracing & Recovery - Trace Silverpeak (INS-003)', '#/recovery/INS-003', 'nexus'),
    nav('Asset Tracing & Recovery - Trace Concord (INS-005)', '#/recovery/INS-005', 'nexus'),
    nav('Asset Tracing & Recovery - Trace Aravis (INS-001)', '#/recovery/INS-001', 'nexus'),
    // -- Navigate: KYC / Onboarding & Identity-Risk --
    nav('KYC & Onboarding', '#/onboarding', 'folder'),
    nav('KYC & Onboarding - Queue & pipeline', '#/onboarding', 'folder'),
    nav('KYC & Onboarding - Assess Kestrel (APP-0008)', '#/onboarding/APP-0008', 'alert'),
    nav('KYC & Onboarding - Assess Blackwater (APP-0018, Prohibited)', '#/onboarding/APP-0018', 'alert'),
    // -- Navigate: Financial-Crime Typology Lab (illicit-finance scenario & detector validation) --
    nav('Financial-Crime Typology Lab', '#/typology', 'chain'),
    nav('Financial-Crime Typology Lab - Laundering / illicit-finance lab', '#/typology', 'chain'),
    nav('Financial-Crime Typology Lab - Classic three-stage laundering', '#/typology/classic_three_stage', 'chain'),
    nav('Financial-Crime Typology Lab - Sanctions-evasion via trade + crypto', '#/typology/sanctions_trade_crypto', 'chain'),
    nav('Financial-Crime Typology Lab - Kleptocrat real-estate integration', '#/typology/kleptocrat_real_estate', 'chain'),
    // ── Navigate: Workspace ──
    nav('Data Management', '#/data', 'database'),
    nav('Saved Cases', '#/cases', 'folder'),
    nav('Audit Log', '#/audit', 'history'),
    nav('System Settings', '#/settings', 'settings'),
    nav('About', '#/about', 'info'),
  ];
}

// Live record search: same endpoints the top-bar search uses; each result is a
// palette command that opens the matching record (drawer or route).
async function paletteSearchRecords(q) {
  const [ents, wals, regs] = await Promise.all([
    api.get('/api/entities?limit=6&q=' + encodeURIComponent(q)),
    api.get('/api/wallets?limit=6&q=' + encodeURIComponent(q)),
    api.get('/api/regulatory/instruments?limit=6&q=' + encodeURIComponent(q)),
  ]);
  const out = [];
  for (const e of ents.rows) out.push({ group: 'Records', title: e.legal_name, hint: e.jurisdiction || 'Entity', iconName: 'nexus', run: () => openEntityDrawer(e.id) });
  for (const w of wals.rows) out.push({ group: 'Records', title: w.label || w.id, hint: w.node_type || 'Wallet', iconName: 'chain', run: () => openWalletDrawer(w.id) });
  for (const r of regs.rows) out.push({ group: 'Records', title: r.title, hint: 'Instrument', iconName: 'regulatory', run: () => goHash('#/regulatory/feed') });
  return out;
}

function openPalette() {
  commandPalette({ commands: paletteCommands(), searchRecords: paletteSearchRecords, placeholder: 'Search commands, pages & records…' });
}

async function updateNavBadges() {
  try {
    const d = await api.get('/api/overview');
    const set = (r, v) => { const n = navEls[r]; if (n && v) { n.badge.textContent = v; n.badge.style.display = 'inline-block'; } };
    set('chainlink', d.modules.chainlink.alerts);
    set('regulatory', d.modules.regulatory.upcoming);
  } catch {}
}

function boot() {
  window.addEventListener('unhandledrejection', (e) => toast(String((e.reason && e.reason.message) || e.reason || 'Promise rejection'), { type: 'error', title: 'Error' }));
  buildShell();
  // Global Cmd/Ctrl-K opens the command palette. Guarded for non-browser hosts
  // (e2e DOM shim) - it never auto-opens; it only reacts to a real keypress.
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) {
        if (e.preventDefault) e.preventDefault();
        openPalette();
      }
    });
  }
  if (!location.hash) location.hash = '#/home';
  // Re-render whenever the URL hash changes. This is what makes every
  // <a href="#/..."> module card, the command palette, breadcrumbs and all
  // cross-module links actually navigate; the sidebar's own onclick only
  // handles same-route re-clicks (scroll-to-top). Without this listener the
  // app is stuck on whatever renders at boot.
  window.addEventListener('hashchange', navigate);
  navigate();
  updateNavBadges();
}

boot();
