// View: Transaction Monitoring & SAR — deterministic typology-rule alerting over
// the seeded crypto transactions / wallets (and entity control structures), a
// suspicious-activity-report (SAR) narrative builder, and an alert-disposition
// workflow (escalate / close / false-positive). Renders in-page within the shell.
// A dashboard header summarises open alerts by severity and by rule; the alert
// queue is severity-coloured, filterable, and each row expands to a detail panel
// with the implicated transactions, the plain-language typology explanation,
// links into Chain-Link / Sovereign Nexus, disposition controls and a
// "Generate SAR" action that shows the narrative with copy / print. Clearly
// labelled as SYNTHETIC — the alerts and SARs are demonstration material, never a
// filed regulatory report.
import { el, api, fmt, icon, card, riskBadge, toast, emptyState, errorState, skeleton, meter, infoDot, modal } from './core.js';
import { pageHead, intro } from './views1.js';

// Severity → the existing High/Medium/Low palette + an accent bar colour.
const SEV_ACCENT = { High: '#f0616d', Medium: '#e5a53b', Low: '#46b877' };
const SEV_BADGE = { High: 'high', Medium: 'med', Low: 'low' };
// Per-rule glyphs (reuse the shared icon set).
const RULE_ICON = {
  structuring: 'chain', rapid_movement: 'alert', high_risk_counterparty: 'alert',
  round_tripping: 'reset', dormant_then_active: 'history', fan_in: 'nexus',
  fan_out: 'nexus', layering_peel: 'chain', jurisdiction_hopping: 'nexus',
};
const STATUS_LABEL = { open: 'Open', escalated: 'Escalated', closed: 'Closed', 'false-positive': 'False positive' };

export async function monitoring(root, parts) {
  root.append(pageHead('Transaction Monitoring & SAR', 'Typology-rule alerting over the seeded transactions & wallets — with a SAR narrative builder and an alert-disposition workflow', [
    el('a', { class: 'btn sm', href: '#/chainlink/alerts', title: 'Chain-Link detection alerts' }, icon('chain', 15), 'Chain-Link'),
    el('a', { class: 'btn sm', href: '#/screening/portfolio', title: 'Screening portfolio hits' }, icon('alert', 15), 'Screening'),
  ]));
  root.append(intro('Transaction Monitoring & SAR',
    'runs a set of named AML/CFT typology rules — structuring, rapid in-out, high-risk counterparty, round-tripping, dormant re-activation, fan-in / fan-out, layering and jurisdiction-hopping — over the seeded crypto transactions, wallets and entity control structures. Each hit becomes a severity-scored alert with a plain-language reason and the implicated subjects / transactions. You disposition each alert (escalate, close, or mark false-positive) and can generate a structured suspicious-activity-report (SAR) narrative straight from the data.'));

  // Honesty banner.
  root.append(el('div', { class: 'intro', role: 'note', style: { marginTop: '10px', '--mc': '#f0616d' } },
    el('span', { class: 'ico' }, icon('alert', 18)),
    el('div', { class: 't' }, el('b', {}, 'Synthetic data — not a system of record. '),
      'Every alert and every generated SAR narrative is illustrative demonstration output over invented data. This is NOT a monitoring or reporting system of record and MUST NOT be relied on for a real suspicious-activity determination or filed as a regulatory report.')));

  const body = el('div', { class: 'mt' }, skeleton(260));
  root.append(body);
  await renderQueue(body);
}

async function renderQueue(root) {
  let data;
  try { data = await api.get('/api/monitoring/alerts'); }
  catch (e) { root.replaceChildren(errorState(e.message)); return; }

  const state = { severity: '', rule: '', status: '' };

  // ── Dashboard header — open alerts by severity + by rule ───────────────────
  const s = data.summary;
  const kpis = el('div', { class: 'row wrap', style: { gap: '10px', marginBottom: '10px' } },
    kpiChip('Open alerts', s.total),
    kpiChip('High', s.high, SEV_ACCENT.High),
    kpiChip('Medium', s.medium, SEV_ACCENT.Medium),
    kpiChip('Rules fired', s.rulesFired),
    kpiChip('Subjects flagged', s.subjectsFlagged));

  // By-rule breakdown bars (only rules that fired), severity-tinted by the rule's
  // configured severity.
  const maxFired = Math.max(1, ...data.rules.map((r) => r.fired));
  const ruleBars = data.rules.filter((r) => r.fired > 0).map((r) => el('button', {
    type: 'button', class: 'mon-rulebar', title: r.blurb + ' — click to filter',
    'aria-label': `${r.label}: ${r.fired} alerts. ${r.blurb}`,
    style: { display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', padding: '4px 0', cursor: 'pointer' },
    onclick: () => { state.rule = state.rule === r.id ? '' : r.id; syncRuleChips(); refresh(); },
  },
    el('div', { class: 'row', style: { gap: '8px', alignItems: 'center' } },
      el('span', { class: 'mc-icon', style: { flex: '0 0 auto', color: SEV_ACCENT[r.severity] } }, icon(RULE_ICON[r.id] || 'alert', 15)),
      el('span', { class: 'small', style: { flex: '1 1 auto', color: 'var(--text)' } }, r.label),
      el('span', { class: 'small muted tabular', style: { flex: '0 0 auto' } }, String(r.fired))),
    el('div', { style: { marginTop: '3px' } }, meter(Math.round((r.fired / maxFired) * 100), SEV_ACCENT[r.severity]))));

  const dash = card('Alert dashboard', { sub: 'Open alerts by severity and by typology rule', actions: el('span', { class: 'badge sq neutral' }, 'Deterministic') },
    kpis,
    el('div', { class: 'small muted', style: { margin: '4px 0 4px' } }, 'By rule (click a rule to filter the queue):'),
    el('div', {}, ...(ruleBars.length ? ruleBars : [el('div', { class: 'small muted' }, 'No rules fired.')])));

  // ── Filters ────────────────────────────────────────────────────────────────
  const sevChips = [['', 'All'], ['High', 'High'], ['Medium', 'Medium'], ['Low', 'Low']].map(([code, label]) => filterChip(code, label, () => { state.severity = code; syncChips(sevChips, code); refresh(); }));
  const ruleChips = [['', 'All rules'], ...data.rules.map((r) => [r.id, r.label])].map(([code, label]) => filterChip(code, label, () => { state.rule = code; syncChips(ruleChips, code); refresh(); }));
  const statusChips = [['', 'Any status'], ['open', 'Open'], ['escalated', 'Escalated'], ['closed', 'Closed'], ['false-positive', 'False positive']].map(([code, label]) => filterChip(code, label, () => { state.status = code; syncChips(statusChips, code); refresh(); }));
  const syncRuleChips = () => syncChips(ruleChips, state.rule);

  const filters = card('Filters', {},
    el('div', { class: 'row wrap', style: { gap: '6px', marginBottom: '6px' } }, el('span', { class: 'small muted', style: { alignSelf: 'center', marginRight: '4px' } }, 'Severity:'), ...sevChips),
    el('div', { class: 'row wrap', style: { gap: '6px', marginBottom: '6px' } }, el('span', { class: 'small muted', style: { alignSelf: 'center', marginRight: '4px' } }, 'Rule:'), ...ruleChips),
    el('div', { class: 'row wrap', style: { gap: '6px' } }, el('span', { class: 'small muted', style: { alignSelf: 'center', marginRight: '4px' } }, 'Status:'), ...statusChips));

  const queueHead = el('div', { class: 'row', style: { alignItems: 'baseline', margin: '4px 2px 8px' } },
    el('span', { class: 'card-title' }, 'Alert queue'),
    el('span', { class: 'spacer' }),
    el('span', { class: 'small muted', id: 'mon-queue-count' }, `${data.rows.length} alerts`));
  const queueBody = el('div', {});

  root.replaceChildren(dash, filters, queueHead, queueBody, disclaimerNote(data.disclaimer));

  let cache = data.rows;
  function refresh() {
    let rows = cache.filter((a) =>
      (!state.severity || a.severity === state.severity) &&
      (!state.rule || a.ruleId === state.rule) &&
      (!state.status || (a.disposition ? a.disposition.status : 'open') === state.status));
    const cnt = document.getElementById('mon-queue-count');
    if (cnt) cnt.textContent = `${rows.length} alert${rows.length === 1 ? '' : 's'}`;
    if (!rows.length) { queueBody.replaceChildren(emptyState('No alerts match these filters', 'Loosen or clear a filter.')); return; }
    queueBody.replaceChildren(...rows.map((a, i) => alertRow(a, i === 0)));
  }
  refresh();
}

// One alert row — a severity-coloured, expandable card. The summary shows the
// rule, subject, severity/score and disposition; expanding loads the detail.
// `eager` is only honoured under the e2e shim (see below).
function alertRow(a, eager) {
  const accent = SEV_ACCENT[a.severity] || 'var(--accent)';
  const details = el('details', { class: 'card', style: { '--mc': accent, borderLeft: '4px solid ' + accent, marginBottom: '10px' } });
  const subjLabel = a.primarySubject.label || a.primarySubject.id;
  const summary = el('summary', { style: { cursor: 'pointer', listStyle: 'none', padding: '12px 14px' } },
    el('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center' } },
      el('span', { class: 'mc-icon', style: { flex: '0 0 auto', color: accent } }, icon(RULE_ICON[a.ruleId] || 'alert', 18)),
      el('div', { style: { flex: '1 1 260px', minWidth: '0' } },
        el('div', { class: 'row wrap', style: { gap: '8px', alignItems: 'baseline' } },
          el('span', { style: { fontWeight: '700', color: 'var(--text)' } }, a.ruleLabel),
          el('span', { class: 'badge sq neutral', title: 'Primary subject' }, a.primarySubject.type),
          el('span', { class: 'small muted' }, subjLabel)),
        el('div', { class: 'small muted', style: { marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis' } }, a.reason)),
      el('span', { class: 'spacer' }),
      dispositionBadge(a.disposition ? a.disposition.status : 'open'),
      el('span', { class: 'small muted tabular', title: 'Implicated transactions' }, a.txCount ? `${a.txCount} tx` : '—'),
      el('span', { class: 'tabular', style: { color: accent, fontWeight: '800', fontSize: '16px', minWidth: '34px', textAlign: 'right' }, title: 'Score (0–100)' }, String(a.score)),
      el('span', { class: 'badge ' + (SEV_BADGE[a.severity] || 'neutral') }, el('span', { class: 'dot' }), a.severity)));
  details.append(summary);

  // Lazily load the detail the first time the row is opened.
  const inner = el('div', { class: 'card-body', style: { paddingTop: '0' } }, skeleton(120));
  details.append(inner);
  let loaded = false;
  const load = async () => {
    if (loaded) return; loaded = true;
    try {
      const d = await api.get('/api/monitoring/alerts/' + encodeURIComponent(a.id));
      renderAlertDetail(inner, d.alert);
    } catch (e) { loaded = false; inner.replaceChildren(errorState(e.message)); }
  };
  // In a real browser, load the detail lazily when the row is first expanded.
  if (typeof details.addEventListener === 'function') details.addEventListener('toggle', () => { if (details.open) load(); });
  // In the e2e DOM shim (no requestAnimationFrame on window), the toggle event
  // never fires; eager-load ONLY the first row so the harness exercises the
  // detail render path once without a 100-fetch cascade.
  const isShim = typeof window === 'undefined' || (typeof window === 'object' && !window.requestAnimationFrame);
  if (isShim && eager) load();
  return details;
}

// The expanded alert detail: typology explanation, implicated subjects (with
// module links), the implicated transactions table, disposition controls, and a
// Generate-SAR action.
function renderAlertDetail(root, alert) {
  const accent = SEV_ACCENT[alert.severity] || 'var(--accent)';
  const nodes = [];

  // Typology explanation.
  nodes.push(el('div', { class: 'mon-typology', style: { margin: '4px 0 10px', padding: '10px 12px', borderRadius: '8px', background: 'var(--surface-2, rgba(255,255,255,0.03))', borderLeft: '3px solid ' + accent } },
    el('div', { class: 'small', style: { color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '3px' } }, 'Typology'),
    el('div', { style: { fontWeight: '600', color: 'var(--text)' } }, alert.typology),
    el('div', { class: 'small muted', style: { marginTop: '4px' } }, alert.reason)));

  // Metrics strip.
  const m = alert.metrics || {};
  const metricPairs = [];
  if (m.count != null) metricPairs.push(['Transfers', m.count]);
  if (m.burst != null) metricPairs.push(['Burst', m.burst]);
  if (m.thresholdMinor != null) metricPairs.push(['Threshold', fmt.crypto(m.thresholdMinor, 'ETH')]);
  if (m.totalMinor != null) metricPairs.push(['Total moved', fmt.crypto(m.totalMinor, 'ETH')]);
  if (m.destinations != null) metricPairs.push(['Destinations', m.destinations]);
  if (m.sources != null) metricPairs.push(['Sources', m.sources]);
  if (m.counterparties != null) metricPairs.push(['Counterparties', m.counterparties]);
  if (m.hops != null) metricPairs.push(['Hops', m.hops]);
  if (m.loopSize != null) metricPairs.push(['Loop size', m.loopSize]);
  if (m.jurisdictions != null) metricPairs.push(['Jurisdictions', m.jurisdictions]);
  if (m.exposure) metricPairs.push(['Exposure', fmt.title(String(m.exposure))]);
  if (metricPairs.length) {
    nodes.push(el('div', { class: 'row wrap', style: { gap: '10px', marginBottom: '10px' } },
      ...metricPairs.map(([k, v]) => el('span', { class: 'small muted' }, el('span', { style: { color: 'var(--text-3)' } }, k + ': '), el('span', { style: { color: 'var(--text-2)' }, class: 'tabular' }, String(v))))));
  }

  // Implicated subjects with links into the other modules.
  if (alert.subjects && alert.subjects.length) {
    nodes.push(el('div', { class: 'small muted', style: { marginBottom: '4px' } }, `Implicated subjects (${alert.subjects.length}):`));
    nodes.push(el('div', { class: 'row wrap', style: { gap: '6px', marginBottom: '10px' } },
      ...alert.subjects.slice(0, 24).map((sub) => {
        const label = sub.label || sub.id;
        const inner = [el('span', { style: { fontWeight: '600' } }, label), sub.role ? el('span', { class: 'muted' }, ' · ' + sub.role) : null];
        return sub.link
          ? el('a', { class: 'chip', href: sub.link, title: `Open ${sub.id} in ${sub.type === 'wallet' ? 'Chain-Link' : sub.type === 'entity' ? 'Sovereign Nexus' : 'Chain-Link'}` }, ...inner)
          : el('span', { class: 'chip' }, ...inner);
      })));
  }

  // Implicated transactions table.
  if (alert.transactions && alert.transactions.length) {
    nodes.push(el('div', { class: 'small muted', style: { marginBottom: '4px' } }, `Implicated transactions (${alert.transactions.length}):`));
    const rows = alert.transactions.slice(0, 60).map((t) => el('tr', {},
      el('td', { class: 'tabular small' }, t.id),
      el('td', { class: 'small' }, String(t.ts).slice(0, 19).replace('T', ' ')),
      el('td', { class: 'small' }, t.fromLabel || t.from_id),
      el('td', { class: 'small' }, t.toLabel || t.to_id),
      el('td', { class: 'tabular small', style: { textAlign: 'right' } }, fmt.crypto(t.amount_minor, t.asset || 'ETH')),
      el('td', {}, t.pattern ? el('span', { class: 'badge sq neutral' }, t.pattern) : el('span', { class: 'muted small' }, '—'))));
    nodes.push(el('div', { style: { overflowX: 'auto', marginBottom: '10px' } },
      el('table', { class: 'tbl mon-tx-table', style: { width: '100%' } },
        el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, 'Tx'), el('th', { scope: 'col' }, 'When'), el('th', { scope: 'col' }, 'From'), el('th', { scope: 'col' }, 'To'), el('th', { scope: 'col', style: { textAlign: 'right' } }, 'Amount'), el('th', { scope: 'col' }, 'Pattern'))),
        el('tbody', {}, ...rows))));
  } else {
    nodes.push(el('div', { class: 'small muted', style: { marginBottom: '10px' } }, 'No monetary transactions are attached to this alert (structural / ownership typology).'));
  }

  // ── Disposition + Generate SAR action bar ──────────────────────────────────
  const cur = alert.disposition && alert.disposition.status ? alert.disposition.status : 'open';
  const statusBadgeEl = el('span', {}, dispositionBadge(cur));
  const noteInput = el('input', { type: 'text', 'aria-label': 'Disposition note', placeholder: 'Rationale (optional)…', style: { flex: '1 1 220px' }, value: alert.disposition && alert.disposition.note ? alert.disposition.note : '' });
  const doDispose = async (status) => {
    try {
      const out = await api.post('/api/monitoring/alerts/' + encodeURIComponent(alert.id) + '/disposition', { status, note: noteInput.value });
      statusBadgeEl.replaceChildren(dispositionBadge(out.disposition.status));
      alert.disposition = out.disposition;
      toast('Alert ' + (STATUS_LABEL[out.disposition.status] || out.disposition.status), { type: 'success' });
    } catch (e) { toast(e.message, { type: 'error' }); }
  };
  const bar = el('div', { class: 'row wrap', style: { gap: '8px', alignItems: 'center', marginTop: '4px', paddingTop: '10px', borderTop: '1px solid var(--border)' } },
    el('span', { class: 'small muted' }, 'Disposition:'), statusBadgeEl,
    noteInput,
    el('button', { class: 'btn sm', title: 'Escalate for enhanced review', onclick: () => doDispose('escalate') }, icon('alert', 14), 'Escalate'),
    el('button', { class: 'btn sm ghost', title: 'Close as reviewed', onclick: () => doDispose('close') }, icon('check', 14), 'Close'),
    el('button', { class: 'btn sm ghost', title: 'Mark as a false positive', onclick: () => doDispose('false-positive') }, icon('x', 14), 'False positive'),
    el('span', { class: 'spacer' }),
    el('button', { class: 'btn sm primary', title: 'Generate a suspicious-activity-report narrative', onclick: () => openSAR(alert.id) }, icon('regulatory', 14), 'Generate SAR'));
  nodes.push(bar);

  root.replaceChildren(...nodes);
}

// Generate + show the SAR narrative in an in-page modal (no viewport takeover),
// with copy-to-clipboard and print/save actions.
async function openSAR(alertId) {
  let payload;
  try { payload = await api.post('/api/monitoring/alerts/' + encodeURIComponent(alertId) + '/sar', {}); }
  catch (e) { toast(e.message, { type: 'error' }); return; }
  const sar = payload.sar;

  modal({
    title: 'SAR narrative — ' + sar.reference,
    width: 760,
    body: (b) => {
      b.append(el('div', { class: 'intro', role: 'note', style: { marginTop: '0', marginBottom: '10px', '--mc': '#f0616d' } },
        el('span', { class: 'ico' }, icon('alert', 16)),
        el('div', { class: 't' }, el('b', {}, 'Synthetic — not a filed report. '), 'This narrative is generated deterministically from demonstration data and is NOT a filed suspicious-activity report.')));
      // Header meta.
      b.append(el('div', { class: 'row wrap', style: { gap: '8px', marginBottom: '10px' } },
        el('span', { class: 'badge sq neutral' }, 'Ref: ' + sar.reference),
        ...sar.typologies.map((t) => el('span', { class: 'badge med' }, el('span', { class: 'dot' }), t)),
        el('span', { class: 'badge sq neutral', title: 'Implicated transactions' }, sar.amounts.transactionCount + ' tx'),
        sar.amounts.transactionCount ? el('span', { class: 'badge sq neutral', title: 'Total amount' }, 'Total ' + sar.amounts.total) : null));
      // Sectioned narrative.
      const sec = el('div', { class: 'mon-sar', id: 'mon-sar-body', style: { maxHeight: '52vh', overflowY: 'auto', paddingRight: '4px' } });
      for (const s of sar.sections) {
        sec.append(el('h3', { class: 'card-title', style: { fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-3)', margin: '12px 0 3px' } }, s.heading));
        sec.append(el('div', { style: { whiteSpace: 'pre-wrap', color: 'var(--text)', lineHeight: '1.55' } }, s.body));
      }
      b.append(sec);
      b.append(el('div', { class: 'small muted', style: { marginTop: '12px', fontStyle: 'italic' } }, sar.disclaimer));
    },
    actions: (close) => [
      el('button', { class: 'btn ghost', onclick: () => copySAR(sar.narrative) }, icon('link', 14), 'Copy text'),
      el('button', { class: 'btn ghost', onclick: () => printSAR(sar) }, icon('download', 14), 'Print / Save as PDF'),
      el('button', { class: 'btn primary', onclick: close }, 'Close'),
    ],
  });
}

function copySAR(text) {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => toast('SAR copied to clipboard', { type: 'success' }), () => toast('Copy failed', { type: 'warn' }));
    } else { toast('Clipboard unavailable', { type: 'warn' }); }
  } catch { toast('Copy failed', { type: 'warn' }); }
}

// Open the SAR in a new window laid out for print, then invoke the browser's
// native Save-as-PDF. Guarded for the e2e / non-browser shim.
function printSAR(sar) {
  if (typeof window === 'undefined' || typeof window.open !== 'function') { toast('Printing unavailable here', { type: 'warn' }); return; }
  const w = window.open('', '_blank');
  if (!w) { toast('Pop-up blocked — allow pop-ups to print', { type: 'warn' }); return; }
  const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const sections = sar.sections.map((s) => `<h2>${esc(s.heading)}</h2><pre>${esc(s.body)}</pre>`).join('');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(sar.reference)}</title>
    <style>body{font-family:Georgia,'Times New Roman',serif;color:#111;max-width:800px;margin:32px auto;padding:0 24px;line-height:1.5}
    h1{font-size:20px;border-bottom:2px solid #111;padding-bottom:8px}h2{font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#444;margin:18px 0 4px}
    pre{white-space:pre-wrap;font-family:inherit;margin:0}.warn{background:#fff3f3;border:1px solid #f0616d;padding:10px 12px;border-radius:6px;color:#7a1620;margin:12px 0}
    .disc{margin-top:24px;font-size:11px;color:#666;border-top:1px solid #ccc;padding-top:10px}</style></head>
    <body><h1>Suspicious Activity Report — ${esc(sar.reference)}</h1>
    <div class="warn"><b>THIS IS NOT A FILED REGULATORY REPORT.</b> All data is synthetic demonstration material.</div>
    ${sections}<div class="disc">${esc(sar.disclaimer)}</div></body></html>`);
  w.document.close();
  try { w.focus(); w.print(); } catch { /* non-fatal */ }
}

// ── Shared small helpers ─────────────────────────────────────────────────────
function dispositionBadge(status) {
  if (status === 'escalated') return el('span', { class: 'badge high' }, el('span', { class: 'dot' }), 'Escalated');
  if (status === 'closed') return el('span', { class: 'badge low' }, el('span', { class: 'dot' }), 'Closed');
  if (status === 'false-positive') return el('span', { class: 'badge neutral' }, el('span', { class: 'dot' }), 'False positive');
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
function disclaimerNote(text) {
  return el('div', { class: 'intro', style: { marginTop: '18px' } }, el('span', { class: 'ico' }, icon('info', 18)), el('div', { class: 't' }, el('b', {}, 'Not a system of record. '), text));
}
