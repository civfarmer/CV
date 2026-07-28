// View: Obligation → Control Register (GRC system-of-record) — a governance-risk-
// compliance dashboard that turns the Regulatory-Horizon triage into a persistent
// obligation→control→owner→evidence→test mapping. The main dashboard shows overall
// compliance-posture KPIs (coverage %, open gaps, overdue tests), a POSTURE MATRIX
// (real frameworks as rows × control-status as columns, colour-graded AND labelled
// with the count — never colour-only), a filterable OBLIGATION→CONTROL REGISTER
// table (by framework / status / owner) that opens an OBLIGATION DETAIL (the real
// requirement + its real citation, its synthetic controls with owner / status /
// last-tested / evidence / test history, and the linked real framework with its
// official source), and a GAPS / REMEDIATION panel (ranked open gaps with owners).
//
// Honest posture: the OBLIGATIONS + citations are REAL (factual, paraphrased public
// knowledge, joined to the real complianceKB frameworks); the CONTROL POSTURE
// (owners as fictional org roles, status, dates, results, evidence refs) is 100%
// SYNTHETIC illustrative demo data (disclaimer shown). Renders in-page within the
// shell (never a viewport takeover), accessible (table headers carry scope, colour
// is ALWAYS paired with a text label, scope headers on the matrix), DOM-light (a
// handful of frameworks × four status columns — no thousands of cells). No SVG
// geometry; no getBBox / matchMedia dependence.
import { el, api, fmt, icon, card, emptyState, errorState, skeleton, infoDot } from './core.js';
import { pageHead, intro } from './views1.js';

// Control-status → colour (ALWAYS paired with the text label). Mirrors the engine's
// CONTROL_STATUSES palette. A dark, legible text colour per status for filled cells.
const STATUS_COLOR = { Implemented: '#2f9e63', Partial: '#c9a227', Gap: '#e07b39', 'Not-started': '#d5303e' };
const STATUS_TEXT = { Implemented: '#0b1f14', Partial: '#1f1804', Gap: '#1f0f04', 'Not-started': '#20060a' };
const STATUS_BADGE = { Implemented: 'low', Partial: 'med', Gap: 'high', 'Not-started': 'high' };
const RESULT_COLOR = { Pass: '#2f9e63', Fail: '#d5303e', Overdue: '#e07b39' };
const ACCENT = '#7c9cf5'; // an indigo accent, distinct from the other modules

export async function register(root, parts) {
  root.append(pageHead('Obligation → Control Register', 'A GRC system-of-record: real regulatory OBLIGATIONS mapped to controls, owners, evidence and test results, with a live compliance-posture matrix. The obligations and their citations are real; the control status, owners, dates and evidence are synthetic, illustrative demonstration posture', [
    el('a', { class: 'btn sm', href: '#/register/gaps', title: 'The ranked open-gap / remediation queue' }, icon('alert', 15), 'Gaps'),
    el('a', { class: 'btn sm ghost', href: '#/compliance', title: 'Compliance-Query Sandbox (the real framework catalogue)' }, icon('scale', 15), 'Compliance Sandbox'),
  ]));
  root.append(intro('Obligation → Control Register',
    'is a governance-risk-compliance system-of-record. It takes real, high-level regulatory obligations — drawn from frameworks FRIS already tracks (GDPR, UK GDPR, the Swiss revFADP, ISO/IEC 27001, ISO/IEC 27701, DORA, NIS2, the EU AMLR, the Swiss AMLA/GwG and the EU–US Data Privacy Framework), each with its real article/clause citation — and maps each one to the controls that satisfy it, an accountable owner, the evidence held, and the latest control-test result. Read the overall posture KPIs and the framework × status posture matrix, filter the obligation→control register by framework, status or owner, open any obligation to see its exact requirement and citation alongside its controls, evidence and test history, and work the ranked gaps / remediation queue. The obligations are real; the control status, owners, dates and evidence are synthetic illustrative posture.'));

  // Honesty banner.
  root.append(el('div', { class: 'intro', role: 'note', style: { marginTop: '10px', '--mc': ACCENT } },
    el('span', { class: 'ico' }, icon('info', 18)),
    el('div', { class: 't' }, el('b', {}, 'Real obligations, synthetic posture — illustrative, not a real control state. '),
      'The OBLIGATIONS and their citations (e.g. “GDPR Art. 30”, “ISO/IEC 27001 Cl. 6.1.3”) are REAL — genuine, high-level requirements of real frameworks, described factually from public knowledge and joined to the real FRIS framework catalogue. The CONTROL POSTURE mapped to them — the control owners (fictional org roles such as “Data Protection Office”), the implementation status, the last-tested dates, the test results and the evidence references — is 100% SYNTHETIC illustrative demonstration data, seeded from a fixed PRNG for reproducibility. It is NOT an assertion about any real organisation’s actual controls, NOT an audit or certification, and NOT legal advice.')));

  // Gaps / remediation sub-view.
  if (parts[0] === 'gaps') {
    const body = el('div', { class: 'mt' });
    root.append(body);
    await renderGaps(body);
    return;
  }

  // An obligation route (#/register/obligation/OBL-GDPR-30) opens the detail.
  if (parts[0] === 'obligation' && parts[1]) {
    const body = el('div', { class: 'mt' });
    root.append(body);
    await renderObligationDetail(body, parts[1]);
    return;
  }

  // Framework / status routes pre-filter the register table.
  const initialFilter = {};
  if (parts[0] === 'framework' && parts[1]) initialFilter.framework = decodeURIComponent(parts[1]);
  else if (parts[0] === 'status' && parts[1]) initialFilter.status = decodeURIComponent(parts[1]);

  const body = el('div', { class: 'mt' });
  root.append(body);
  await renderDashboard(body, initialFilter);
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD — posture KPIs, posture matrix, filterable obligation→control register
// ─────────────────────────────────────────────────────────────────────────────
async function renderDashboard(root, initialFilter) {
  const panel = el('div', {}, skeleton(380));
  root.append(panel);

  let posture, reg, sum, owners;
  try {
    [posture, reg, sum, owners] = await Promise.all([
      api.get('/api/grc/posture'),
      api.get('/api/grc/register'),
      api.get('/api/grc/summary'),
      api.get('/api/grc/owners'),
    ]);
  } catch (e) { panel.replaceChildren(errorState(e.message)); return; }
  if (!reg.obligations.length) { panel.replaceChildren(emptyState('No obligations in the register')); return; }

  const nodes = [];

  // KPI strip: overall coverage %, obligations, controls, open gaps, overdue.
  nodes.push(el('div', { class: 'row wrap', style: { gap: '10px', marginBottom: '12px' } },
    kpiChip('Compliance coverage', sum.coveragePct + '%', coverageColor(sum.coveragePct), 'Weighted coverage: Implemented = full, Partial = half, Gap / Not-started = none, across all controls'),
    kpiChip('Obligations', sum.obligations, ACCENT, 'Real regulatory obligations tracked in the register'),
    kpiChip('Controls', sum.controls, '#4d8df0', 'Synthetic controls mapped to the obligations'),
    kpiChip('Open gaps', sum.openGaps, STATUS_COLOR.Gap, 'Controls in a Gap or Not-started status'),
    kpiChip('Overdue tests', sum.overdue, RESULT_COLOR.Overdue, 'Controls whose test is overdue (outside its cycle)')));

  // The posture matrix (framework × control-status).
  nodes.push(postureMatrixCard(posture));

  // The obligation → control register table (optionally pre-filtered).
  nodes.push(registerTableCard(reg, owners, initialFilter));

  nodes.push(disclaimerNote(reg.disclaimer));
  panel.replaceChildren(...nodes);
}

// ── Posture matrix card: real frameworks (rows) × control-status (columns) ─────
// Each cell is colour-graded by status AND shows the count (never colour-only);
// a per-framework coverage % + a total row. Scope headers on every axis.
function postureMatrixCard(posture) {
  const statuses = posture.statuses;
  // Head: framework, one column per status, coverage.
  const headCells = [el('th', { scope: 'col', style: { textAlign: 'left', minWidth: '150px' } }, 'Framework')];
  for (const s of statuses) headCells.push(el('th', { scope: 'col', title: s.label + ' controls', style: { textAlign: 'center' } }, statusHeaderChip(s)));
  headCells.push(el('th', { scope: 'col', style: { textAlign: 'center', minWidth: '120px' } }, 'Coverage', infoDot('Weighted: Implemented full, Partial half, Gap / Not-started none.')));
  const thead = el('thead', {}, el('tr', {}, ...headCells));

  const bodyRows = posture.rows.map((r) => {
    const nameTh = el('th', { scope: 'row', style: { textAlign: 'left' } },
      el('a', { href: '#/register/framework/' + encodeURIComponent(r.framework), style: { color: 'var(--text)', textDecoration: 'none', fontWeight: '600' }, title: 'Filter the register to ' + r.name },
        r.short,
        el('div', { class: 'small muted', style: { fontWeight: '400' } }, `${r.obligationCount} obligation${r.obligationCount === 1 ? '' : 's'} · ${r.controlCount} control${r.controlCount === 1 ? '' : 's'}`)));
    const cells = r.cells.map((c) => matrixCell(c, r.framework));
    const covTd = el('td', { style: { textAlign: 'center' } }, coverageBar(r.coveragePct));
    return el('tr', {}, nameTh, ...cells, covTd);
  });

  // Total row (column totals + overall coverage).
  const totalCells = [el('th', { scope: 'row', style: { textAlign: 'left' } }, el('span', { style: { fontWeight: '700' } }, 'All frameworks'))];
  for (const ct of posture.colTotals) totalCells.push(el('td', { style: { textAlign: 'center' } }, el('span', { class: 'tabular', style: { fontWeight: '700', color: 'var(--text)' } }, String(ct.count))));
  totalCells.push(el('td', { style: { textAlign: 'center' } }, coverageBar(posture.totals.coveragePct)));
  const tfoot = el('tfoot', {}, el('tr', { style: { borderTop: '2px solid var(--border)' } }, ...totalCells));

  const table = el('table', { class: 'tbl', style: { width: '100%', borderCollapse: 'collapse' } }, thead, el('tbody', {}, ...bodyRows), tfoot);

  return card('Compliance-posture matrix', {
    sub: `${posture.rows.length} real frameworks × ${statuses.length} control statuses · overall coverage ${posture.totals.coveragePct}% (${posture.totals.controls} controls) · as of ${posture.asOf}`,
    actions: el('span', { class: 'badge sq neutral' }, 'Synthetic posture'),
  },
    el('div', { class: 'small muted', style: { marginBottom: '8px' } }, 'Each cell is the count of controls in that status (colour + number). Click a framework to filter the register. The obligations are real; the control status is synthetic illustrative posture.'),
    el('div', { class: 'tbl-wrap', style: { overflowX: 'auto' } }, table),
    statusLegend(statuses));
}

// One posture-matrix cell: a status-coloured block that ALWAYS shows the count
// (never colour-only). Zero counts render faint so the eye tracks the populated
// cells. Legible to colour-blind + screen-reader users (aria-label carries both).
function matrixCell(c, framework) {
  const color = STATUS_COLOR[c.status] || '#5b6b82';
  const text = STATUS_TEXT[c.status] || '#fff';
  if (!c.count) {
    return el('td', { style: { textAlign: 'center', padding: '4px' } },
      el('span', { class: 'small muted', 'aria-label': '0 ' + c.status + ' controls', title: '0 ' + c.status }, '·'));
  }
  return el('td', { style: { textAlign: 'center', padding: '4px' } },
    el('span', {
      title: `${c.count} ${c.status} control${c.count === 1 ? '' : 's'}`,
      'aria-label': `${c.count} ${c.status} controls`,
      style: { display: 'inline-block', minWidth: '30px', padding: '4px 9px', borderRadius: '6px', background: color, color: text, fontWeight: '700', fontSize: '12px', border: '1px solid rgba(0,0,0,0.15)' },
    }, String(c.count)));
}

// ── The filterable obligation → control register table ────────────────────────
function registerTableCard(reg, ownersData, initial) {
  const state = { q: '', framework: (initial && initial.framework) || '', status: (initial && initial.status) || '', owner: '' };
  const wrap = el('div');

  const fwSelect = el('select', { class: 'fin-select', 'aria-label': 'Filter by framework', style: selectStyle(), onchange: (e) => { state.framework = e.target.value; render(); } },
    el('option', { value: '' }, 'All frameworks'),
    ...reg.frameworks.map((f) => el('option', { value: f.code }, `${f.short} — ${f.authority}`)));
  const stSelect = el('select', { class: 'fin-select', 'aria-label': 'Filter by control status', style: selectStyle(), onchange: (e) => { state.status = e.target.value; render(); } },
    el('option', { value: '' }, 'All statuses'),
    ...reg.statuses.map((s) => el('option', { value: s.code }, s.label)));
  const ownerSelect = el('select', { class: 'fin-select', 'aria-label': 'Filter by control owner', style: selectStyle(), onchange: (e) => { state.owner = e.target.value; render(); } },
    el('option', { value: '' }, 'All owners'),
    ...reg.owners.map((o) => el('option', { value: o }, o)));
  const search = el('input', { type: 'text', placeholder: 'Filter by requirement, citation, owner…', 'aria-label': 'Filter obligations', style: { ...selectStyle(), minWidth: '220px' }, oninput: (e) => { state.q = e.target.value.toLowerCase(); render(); } });
  if (state.framework) fwSelect.value = state.framework;
  if (state.status) stSelect.value = state.status;

  const controls = el('div', { class: 'row wrap', style: { gap: '10px', marginBottom: '10px', alignItems: 'center' } },
    search, fwSelect, stSelect, ownerSelect);

  function filtered() {
    let rows = reg.obligations.slice();
    if (state.framework) rows = rows.filter((o) => o.frameworkCode === state.framework);
    if (state.status) rows = rows.filter((o) => o.headlineStatus === state.status);
    if (state.owner) rows = rows.filter((o) => o.controls.some((c) => c.owner === state.owner));
    if (state.q) rows = rows.filter((o) => `${o.title} ${o.requirement} ${o.citation} ${o.frameworkName} ${o.category} ${o.controls.map((c) => c.owner).join(' ')}`.toLowerCase().includes(state.q));
    return rows;
  }

  function render() {
    const rows = filtered();
    const thead = el('thead', {}, el('tr', {},
      el('th', { scope: 'col', style: { textAlign: 'left' } }, 'Framework'),
      el('th', { scope: 'col', style: { textAlign: 'left' } }, 'Citation'),
      el('th', { scope: 'col', style: { textAlign: 'left' } }, 'Obligation (real requirement)'),
      el('th', { scope: 'col', style: { textAlign: 'left' } }, 'Owner(s)', infoDot('Synthetic control owner — a fictional org role.')),
      el('th', { scope: 'col', style: { textAlign: 'center' } }, 'Status', infoDot('The obligation’s worst control status.')),
      el('th', { scope: 'col', style: { textAlign: 'center' } }, 'Coverage')));
    const body = rows.length ? rows.map((o) => obligationRow(o)) : [el('tr', {}, el('td', { colspan: 6 }, emptyState('No obligations match these filters')))];
    const table = el('table', { class: 'tbl', style: { width: '100%', borderCollapse: 'collapse' } }, thead, el('tbody', {}, ...body));
    wrap.replaceChildren(controls,
      el('div', { class: 'small muted', style: { marginBottom: '8px' } }, `${rows.length} of ${reg.obligations.length} obligation${reg.obligations.length === 1 ? '' : 's'} — click any row to open its requirement, controls, evidence and test history.`),
      el('div', { class: 'tbl-wrap', style: { overflowX: 'auto' } }, table));
  }
  render();

  return card('Obligation → control register', { sub: `${reg.obligations.length} real regulatory obligations mapped to synthetic controls, owners and evidence`, actions: el('span', { class: 'badge sq neutral' }, 'Real obligations') }, wrap);
}

// One register row: framework, citation, obligation title, owners, status, coverage.
function obligationRow(o) {
  const owners = [...new Set(o.controls.map((c) => c.owner))];
  const fwTd = el('td', {}, el('span', { class: 'badge sq neutral', title: o.frameworkName }, o.frameworkShort));
  const citeTd = el('td', {}, el('span', { class: 'small tabular muted' }, o.citation));
  const titleTh = el('th', { scope: 'row', style: { textAlign: 'left' } },
    el('a', { href: '#/register/obligation/' + encodeURIComponent(o.id), style: { color: 'var(--text)', textDecoration: 'none', fontWeight: '600' }, title: 'Open ' + o.id }, o.title),
    el('div', { class: 'small muted', style: { maxWidth: '360px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, o.category));
  const ownerTd = el('td', {}, el('span', { class: 'small' }, owners.slice(0, 2).join(', ') + (owners.length > 2 ? ` +${owners.length - 2}` : '')));
  const statusTd = el('td', { style: { textAlign: 'center' } }, statusBadge(o.headlineStatus), o.anyOverdue ? el('span', { class: 'badge sq', style: { marginLeft: '4px', background: hexToRgba(RESULT_COLOR.Overdue, 0.16), color: RESULT_COLOR.Overdue, borderColor: hexToRgba(RESULT_COLOR.Overdue, 0.5) }, title: 'A control test is overdue' }, 'Overdue') : null);
  const covTd = el('td', { style: { textAlign: 'center', minWidth: '110px' } }, coverageBar(o.coveragePct));
  return el('tr', { class: 'clickable' }, fwTd, citeTd, titleTh, ownerTd, statusTd, covTd);
}

// ─────────────────────────────────────────────────────────────────────────────
// OBLIGATION DETAIL — the real requirement + citation, its controls, evidence,
// test history, and the linked real framework with its official source.
// ─────────────────────────────────────────────────────────────────────────────
async function renderObligationDetail(root, id) {
  const panel = el('div', {}, skeleton(360));
  root.append(panel);
  let data;
  try { data = await api.get('/api/grc/obligation/' + encodeURIComponent(id)); }
  catch (e) { panel.replaceChildren(errorState(e.message)); return; }

  const o = data.obligation;
  const color = STATUS_COLOR[o.headlineStatus] || ACCENT;
  const nodes = [];

  // Back link.
  nodes.push(el('div', { style: { marginBottom: '10px' } },
    el('a', { class: 'btn sm ghost', href: '#/register' }, icon('chevron', 14), 'Back to register')));

  // Header card: the real obligation + citation + headline status.
  nodes.push(el('div', { class: 'card', style: { '--mc': color, borderLeft: '4px solid ' + color } },
    el('div', { class: 'card-body' },
      el('div', { class: 'row wrap', style: { gap: '12px', alignItems: 'flex-start' } },
        el('div', { style: { flex: '1 1 340px', minWidth: '0' } },
          el('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center', marginBottom: '4px' } },
            el('span', { style: { fontWeight: '800', color: 'var(--text)', fontSize: '19px' } }, o.title),
            el('span', { class: 'badge sq neutral', title: o.frameworkName }, o.frameworkShort),
            el('span', { class: 'badge sq neutral', title: 'Real regulatory citation' }, o.citation)),
          el('div', { class: 'small muted' }, `${o.id} · ${o.category} · ${o.authority} · applies in ${o.jurisdictions.join(', ')}`),
          el('div', { class: 'small', style: { color: 'var(--text-2)', marginTop: '10px', lineHeight: '1.65' } }, el('span', { style: { fontWeight: '600', color: 'var(--text)' } }, 'Requirement: '), o.requirement)),
        el('div', { style: { flex: '0 0 auto', textAlign: 'center', minWidth: '150px' } },
          el('div', { class: 'small muted', style: { marginBottom: '4px' } }, 'Obligation status'),
          el('div', {}, statusBadge(o.headlineStatus, true)),
          el('div', { style: { marginTop: '8px' } }, coverageBar(o.coveragePct)),
          el('div', { class: 'small muted', style: { marginTop: '4px' } }, o.controlCount + ' control' + (o.controlCount === 1 ? '' : 's')))))));

  // The controls mapped to this obligation (owner / status / last-tested / evidence / history).
  nodes.push(controlsCard(o));

  // The linked real framework with its official source.
  nodes.push(frameworkCard(data.framework));

  nodes.push(disclaimerNote(data.disclaimer));
  panel.replaceChildren(...nodes);
}

// Controls card: one block per synthetic control with its owner, type, status,
// last-tested date, test result, evidence refs and the derived test history.
function controlsCard(o) {
  const blocks = o.controls.map((c) => {
    const color = STATUS_COLOR[c.status] || ACCENT;
    return el('div', { class: 'card', style: { '--mc': color, borderLeft: '4px solid ' + color, marginBottom: '10px' } },
      el('div', { class: 'card-body' },
        el('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center', marginBottom: '6px' } },
          el('span', { style: { fontWeight: '700', color: 'var(--text)', flex: '1 1 auto', minWidth: '0' } }, c.title),
          el('span', { class: 'badge sq neutral', title: 'Control id' }, c.id),
          statusBadge(c.status)),
        el('div', { class: 'row wrap', style: { gap: '16px', marginBottom: '8px' } },
          metaItem('Owner', c.owner, 'Synthetic — a fictional org role'),
          metaItem('Type', c.typeLabel, 'Preventive / detective / corrective'),
          metaItem('Last tested', c.lastTested ? fmt.date(c.lastTested) : 'Never', c.lastTested ? `${c.testAgeDays} days ago (as of the register date)` : 'No test has been run'),
          testResultMeta(c.testResult),
          c.nextDue ? metaItem('Next test due', fmt.date(c.nextDue), c.overdueAgainstAsOf ? 'Overdue against the register date' : 'Within cycle') : null),
        // Evidence refs.
        el('div', { class: 'row wrap', style: { gap: '6px', alignItems: 'center', marginBottom: c.history.length ? '8px' : '0' } },
          el('span', { class: 'small muted', style: { alignSelf: 'center' } }, `Evidence (${c.evidenceCount}):`),
          c.evidence.length ? c.evidence.map((e) => el('span', { class: 'badge sq neutral', title: e.label + ' (synthetic evidence reference)' }, icon('folder', 11), ' ', e.ref)) : el('span', { class: 'small muted' }, 'No evidence held')),
        // Test history (the latest test as an ordered entry).
        c.history.length ? el('div', {},
          el('div', { class: 'small muted', style: { fontWeight: '600', color: 'var(--text)', marginBottom: '4px' } }, 'Test history'),
          ...c.history.map((h) => el('div', { class: 'row wrap', style: { gap: '8px', alignItems: 'center', padding: '4px 0', borderTop: '1px solid var(--border)' } },
            el('span', { class: 'small tabular', style: { fontWeight: '700', color: 'var(--text)' } }, fmt.date(h.date)),
            resultBadge(h.result),
            el('span', { class: 'small muted' }, h.note)))) : null));
  });
  return card('Mapped controls', { sub: `${o.controlCount} synthetic control${o.controlCount === 1 ? '' : 's'} against this real requirement — owner, status, evidence and test result`, actions: el('span', { class: 'badge sq neutral' }, 'Synthetic') }, ...blocks);
}

// The linked real framework card with its official source URL.
function frameworkCard(fw) {
  if (!fw) return el('div');
  return card('Linked framework', { sub: 'The real regulatory instrument / standard this obligation belongs to', actions: el('span', { class: 'badge sq neutral' }, 'Real & cited') },
    el('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center' } },
      el('span', { class: 'mc-icon', style: { color: ACCENT, flex: '0 0 auto' } }, icon('regulatory', 18)),
      el('div', { style: { flex: '1 1 auto', minWidth: '0' } },
        el('div', { style: { fontWeight: '600', color: 'var(--text)' } }, fw.name),
        el('div', { class: 'small muted' }, fw.authority)),
      el('span', { class: 'spacer' }),
      fw.source ? el('a', { class: 'btn sm ghost', href: fw.source, target: '_blank', rel: 'noopener noreferrer', title: 'Open the official source' }, icon('ext', 12), 'Source') : null,
      el('a', { class: 'btn sm ghost', href: '#/compliance', title: 'Open the Compliance-Query Sandbox' }, icon('scale', 12), 'Sandbox')));
}

// ─────────────────────────────────────────────────────────────────────────────
// GAPS / REMEDIATION — ranked open gaps with the owner to chase
// ─────────────────────────────────────────────────────────────────────────────
async function renderGaps(root) {
  const panel = el('div', {}, skeleton(340));
  root.append(panel);
  let data, owners;
  try { [data, owners] = await Promise.all([api.get('/api/grc/gaps'), api.get('/api/grc/owners')]); }
  catch (e) { panel.replaceChildren(errorState(e.message)); return; }

  const nodes = [];
  nodes.push(el('div', { style: { marginBottom: '10px' } },
    el('a', { class: 'btn sm ghost', href: '#/register' }, icon('chevron', 14), 'Back to dashboard')));

  nodes.push(el('div', { class: 'row wrap', style: { gap: '10px', marginBottom: '12px' } },
    kpiChip('Open gaps', data.count, STATUS_COLOR.Gap, 'Obligations carrying a Gap / Not-started control or an overdue / failing test'),
    kpiChip('Of obligations', data.totalObligations, ACCENT, 'Total obligations in the register'),
    kpiChip('Owners with gaps', owners.owners.filter((o) => o.openGaps > 0 || o.overdue > 0).length, RESULT_COLOR.Overdue, 'Distinct owners carrying at least one open gap or overdue test')));

  if (!data.gaps.length) { nodes.push(card('Remediation queue', {}, emptyState('No open gaps — every obligation has an adequate control'))); panel.replaceChildren(...nodes); return; }

  // Per-owner workload panel.
  nodes.push(ownersCard(owners));

  // The ranked gap queue.
  const rows = data.gaps.map((g) => {
    const color = STATUS_COLOR[g.headlineStatus] || ACCENT;
    return el('div', { class: 'card', style: { '--mc': color, borderLeft: '4px solid ' + color, marginBottom: '10px' } },
      el('div', { class: 'card-body' },
        el('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center', marginBottom: '6px' } },
          el('a', { href: '#/register/obligation/' + encodeURIComponent(g.id), style: { fontWeight: '700', color: 'var(--text)', flex: '1 1 auto', minWidth: '0', textDecoration: 'none' }, title: 'Open ' + g.id }, g.title),
          el('span', { class: 'badge sq neutral', title: g.frameworkShort + ' · ' + g.citation }, g.frameworkShort),
          statusBadge(g.headlineStatus)),
        el('div', { class: 'small muted', style: { marginBottom: '6px' } }, `${g.citation} · ${g.category} · coverage ${g.coveragePct}%`),
        el('div', { class: 'row wrap', style: { gap: '6px', alignItems: 'center', marginBottom: '6px' } },
          el('span', { class: 'small muted', style: { alignSelf: 'center' } }, 'Reasons:'),
          ...g.reasons.map((r) => el('span', { class: 'badge sq', style: reasonStyle(r) }, r))),
        el('div', { class: 'row wrap', style: { gap: '6px', alignItems: 'center' } },
          el('span', { class: 'small muted', style: { alignSelf: 'center' } }, 'Owner(s) to chase:'),
          ...g.owners.map((ow) => el('span', { class: 'badge', style: { background: hexToRgba(ACCENT, 0.16), color: ACCENT, borderColor: hexToRgba(ACCENT, 0.5) }, title: 'Synthetic control owner' }, el('span', { class: 'dot', style: { background: ACCENT } }), ow)))));
  });
  nodes.push(card('Remediation queue', { sub: `${data.gaps.length} open gap${data.gaps.length === 1 ? '' : 's'} ranked worst-first (Not-started > Gap > overdue / failing)`, actions: el('span', { class: 'badge sq neutral' }, 'Ranked') },
    el('div', { class: 'small muted', style: { marginBottom: '10px' } }, 'The obligations whose control posture needs attention, most severe first. Each links to its obligation detail and names the synthetic owner to chase.'),
    ...rows));

  nodes.push(disclaimerNote(data.disclaimer));
  panel.replaceChildren(...nodes);
}

// Per-owner workload card (open gaps + overdue per fictional owner).
function ownersCard(owners) {
  const thead = el('thead', {}, el('tr', {},
    el('th', { scope: 'col', style: { textAlign: 'left' } }, 'Owner (synthetic)'),
    el('th', { scope: 'col', style: { textAlign: 'center' } }, 'Controls'),
    el('th', { scope: 'col', style: { textAlign: 'center' } }, 'Open gaps'),
    el('th', { scope: 'col', style: { textAlign: 'center' } }, 'Overdue'),
    el('th', { scope: 'col', style: { textAlign: 'center' } }, 'Coverage')));
  const rows = owners.owners.map((o) => el('tr', {},
    el('th', { scope: 'row', style: { textAlign: 'left' } }, el('span', { style: { fontWeight: '600', color: 'var(--text)' } }, o.owner)),
    el('td', { style: { textAlign: 'center' } }, el('span', { class: 'tabular' }, String(o.controlCount))),
    el('td', { style: { textAlign: 'center' } }, o.openGaps ? el('span', { class: 'badge high', title: o.gap + ' gap, ' + o.notStarted + ' not-started' }, el('span', { class: 'dot' }), String(o.openGaps)) : el('span', { class: 'small muted' }, '0')),
    el('td', { style: { textAlign: 'center' } }, o.overdue ? el('span', { class: 'badge med' }, el('span', { class: 'dot' }), String(o.overdue)) : el('span', { class: 'small muted' }, '0')),
    el('td', { style: { textAlign: 'center', minWidth: '110px' } }, coverageBar(o.coveragePct))));
  const table = el('table', { class: 'tbl', style: { width: '100%', borderCollapse: 'collapse' } }, thead, el('tbody', {}, ...rows));
  return card('Per-owner workload', { sub: `${owners.count} synthetic control owners — ranked by open gaps`, actions: el('span', { class: 'badge sq neutral' }, 'Synthetic') },
    el('div', { class: 'tbl-wrap', style: { overflowX: 'auto' } }, table));
}

// ── Shared small helpers ──────────────────────────────────────────────────────
function statusBadge(code, large) {
  const cls = STATUS_BADGE[code] || 'neutral';
  const color = STATUS_COLOR[code];
  const style = { background: color ? hexToRgba(color, 0.18) : undefined, color: color || undefined, borderColor: color ? hexToRgba(color, 0.5) : undefined };
  if (large) { style.fontSize = '15px'; style.padding = '5px 12px'; style.fontWeight = '800'; }
  return el('span', { class: 'badge ' + cls, title: 'Control status: ' + (code || ''), style }, el('span', { class: 'dot' }), code || '—');
}
function resultBadge(code) {
  const color = RESULT_COLOR[code] || ACCENT;
  const cls = code === 'Pass' ? 'low' : code === 'Fail' ? 'high' : 'med';
  return el('span', { class: 'badge ' + cls, title: 'Test result: ' + code }, el('span', { class: 'dot' }), code);
}
function statusHeaderChip(s) {
  return el('span', { class: 'row', style: { gap: '6px', alignItems: 'center', justifyContent: 'center' } },
    el('span', { style: { width: '11px', height: '11px', borderRadius: '3px', background: STATUS_COLOR[s.code] || '#5b6b82', display: 'inline-block', border: '1px solid rgba(0,0,0,0.25)', flex: '0 0 auto' } }),
    el('span', { class: 'small' }, s.label));
}
function statusLegend(statuses) {
  return el('div', { class: 'row wrap', style: { gap: '14px', marginTop: '12px' }, role: 'img', 'aria-label': 'Status legend: ' + statuses.map((s) => s.label).join(', ') },
    el('span', { class: 'small muted', style: { alignSelf: 'center' } }, 'Statuses:'),
    ...statuses.map((s) => el('span', { class: 'row', style: { gap: '6px', alignItems: 'center' } },
      el('span', { style: { width: '13px', height: '13px', borderRadius: '3px', background: STATUS_COLOR[s.code] || '#5b6b82', display: 'inline-block', border: '1px solid rgba(0,0,0,0.2)' } }),
      el('span', { class: 'small', title: s.blurb }, s.label))));
}
// A coverage bar that ALWAYS shows the % as text (never colour-only).
function coverageBar(pct) {
  const w = Math.max(0, Math.min(100, pct));
  const color = coverageColor(pct);
  return el('div', { class: 'row', style: { gap: '6px', alignItems: 'center', justifyContent: 'center' }, title: pct + '% coverage', 'aria-label': pct + '% coverage' },
    el('div', { style: { flex: '0 0 56px', height: '6px', background: 'var(--surface-2, #131924)', borderRadius: '4px', overflow: 'hidden' }, role: 'presentation' },
      el('span', { style: { display: 'block', width: w + '%', height: '100%', background: color } })),
    el('span', { class: 'small tabular', style: { fontWeight: '700', color } }, pct + '%'));
}
function coverageColor(pct) {
  if (pct >= 80) return '#2f9e63';
  if (pct >= 55) return '#c9a227';
  if (pct >= 30) return '#e07b39';
  return '#d5303e';
}
function metaItem(label, value, tip) {
  return el('div', { style: { minWidth: '0' }, title: tip || undefined },
    el('div', { class: 'small muted' }, label, tip ? infoDot(tip) : null),
    el('div', { class: 'small', style: { fontWeight: '600', color: 'var(--text)' } }, value));
}
function testResultMeta(code) {
  const color = RESULT_COLOR[code] || ACCENT;
  return el('div', {},
    el('div', { class: 'small muted' }, 'Test result'),
    el('div', {}, resultBadge(code)));
}
function reasonStyle(reason) {
  const color = /No control/.test(reason) ? STATUS_COLOR['Not-started'] : /gap/i.test(reason) ? STATUS_COLOR.Gap : /overdue/i.test(reason) ? RESULT_COLOR.Overdue : RESULT_COLOR.Fail;
  return { background: hexToRgba(color, 0.16), color, borderColor: hexToRgba(color, 0.5) };
}
function kpiChip(label, value, colour, tip) {
  return el('div', { class: 'card', style: { flex: '1 1 130px', padding: '10px 12px' }, title: tip || undefined },
    el('div', { class: 'small muted' }, label, tip ? infoDot(tip) : null),
    el('div', { class: 'tabular', style: { fontWeight: '800', fontSize: '19px', color: colour || 'var(--text)' } }, String(value)));
}
function selectStyle() { return { padding: '7px 10px', background: 'var(--surface-2, #131924)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '14px' }; }
function disclaimerNote(text) {
  return el('div', { class: 'intro', style: { marginTop: '18px' } }, el('span', { class: 'ico' }, icon('info', 18)), el('div', { class: 't' }, el('b', {}, 'Real obligations; synthetic control posture. '), text));
}
// Small pure hex->rgba (guarded; no DOM/canvas dependency, e2e-safe).
function hexToRgba(hex, alpha) {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6) return `rgba(124,156,245,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
