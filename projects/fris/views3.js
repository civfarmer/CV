// View: Compliance Sandbox — the jurisdiction-aware Compliance-Query Sandbox.
// A non-lawyer flags a possible problem, pastes a policy, or asks a free-text
// question; picks where they are based / trade / employ (multi-select), their
// size and controller/processor role; and gets back a colour-coded TRIAGE verdict
// (raise-with-legal / defined-process / handle-simply), "what applies" grouped BY
// JURISDICTION, a concrete next-steps checklist, the closest real instruments
// (linked into Regulatory Horizon), an optional policy-gap read, and the standing
// "not legal advice" disclaimer. Deterministic; renders in-page within the shell.
import { el, api, fmt, icon, card, riskBadge, statusBadge, openDrawer, toast, emptyState, errorState, skeleton, meter, infoDot } from './core.js';
import { pageHead, intro } from './views1.js';

// Colour the triage banner by the verdict's severity mapping (reuses the existing
// High/Medium/Low palette): escalate=High(red), defined=Medium(amber), simple=Low(green).
const VERDICT_ACCENT = { 'escalate-legal': '#f0616d', 'defined-process': '#e5a53b', 'handle-simply': '#46b877' };
const RISK_BAND_ACCENT = { High: '#f0616d', Elevated: '#e5a53b' };
const VERDICT_ICON = { 'escalate-legal': 'alert', 'defined-process': 'regulatory', 'handle-simply': 'check' };
const KIND_LABEL = { 'data-protection': 'Data protection', infosec: 'Information security', 'privacy-mgmt': 'Privacy management', aml: 'AML', financial: 'Financial', 'ict-resilience': 'ICT resilience', cyber: 'Cybersecurity', transparency: 'Transparency', ai: 'AI' };

export async function compliance(root, parts) {
  root.append(pageHead('Compliance Sandbox', 'Jurisdiction-aware triage — what applies to you, do you need a lawyer, and what to do next', [
    el('a', { class: 'btn sm', href: '#/regulatory/sandbox', title: 'The policy-vs-regulation gap analysis' }, icon('scale', 15), 'Policy Comparison'),
  ]));
  root.append(intro('The Compliance Sandbox',
    'takes your situation — a problem you want to flag, a policy to check, or a plain-language question — plus where your business is based, trades and employs, and tells you which law and internal-policy artefact applies (grouped by jurisdiction), whether to raise it with legal or handle it via a defined process, and the concrete next steps. It is regionally specific and reuses FRIS’s real regulatory register. Leave the location questions blank to see every compiled framework, grouped by jurisdiction.'));

  const panel = el('div', {}, skeleton(160));
  root.append(panel);

  let kb;
  try { kb = await api.get('/api/compliance/kb'); }
  catch (e) { panel.replaceChildren(errorState(e.message)); return; }
  let policies = { rows: [] };
  try { policies = await api.get('/api/policies'); } catch { /* optional */ }

  // ── Query state ────────────────────────────────────────────────────────────
  const state = {
    mode: 'flag',
    queryText: '',
    businessBase: new Set(),
    tradesInternationally: false, tradesWhere: new Set(),
    employsInternationally: false, employsWhere: new Set(),
    sizeBand: 'small', employees: '',
    role: 'unknown',
    sector: '',
    policyIds: new Set(),
  };

  // ── Left panel: query + profile ─────────────────────────────────────────────
  // Mode toggle — relabels the single textarea + its hint (one field underneath).
  const MODES = [
    ['flag', 'Flag a problem', 'Describe the situation or possible dispute — e.g. “we lost a laptop with customer records”.'],
    ['policy', 'Paste a policy', 'Paste an internal policy to check what it needs to cover (and, if you pick policies below, where it falls short).'],
    ['freetext', 'Free-text question', 'Ask a plain-language question — e.g. “a customer asked us to delete their data, what do we do?”.'],
  ];
  const textarea = el('textarea', { 'aria-label': 'Your situation, policy, or question', style: { minHeight: '150px', width: '100%' }, oninput: (e) => { state.queryText = e.target.value; } });
  const modeHint = el('div', { class: 'small muted', style: { marginBottom: '8px' } });
  const modeChips = MODES.map(([code, label]) => el('button', {
    type: 'button', class: 'chip' + (state.mode === code ? ' on' : ''), 'aria-pressed': state.mode === code ? 'true' : 'false',
    onclick: () => { state.mode = code; for (const c of modeChips) { const on = c._code === code; c.classList.toggle('on', on); c.setAttribute('aria-pressed', on ? 'true' : 'false'); } applyMode(); },
  }, label));
  modeChips.forEach((c, i) => { c._code = MODES[i][0]; });
  function applyMode() { const m = MODES.find((x) => x[0] === state.mode); modeHint.textContent = m[2]; textarea.setAttribute('placeholder', m[2]); }
  applyMode();

  // Multi-select chip group builder. `set` is the backing Set; toggling a chip
  // adds/removes the jurisdiction code and reruns the "regions we'll use" summary.
  function chipGroup(options, set, onToggle) {
    const wrap = el('div', { class: 'row wrap', role: 'group', style: { gap: '6px' } });
    for (const o of options) {
      const chip = el('button', {
        type: 'button', class: 'chip' + (set.has(o.code) ? ' on' : ''), 'aria-pressed': set.has(o.code) ? 'true' : 'false', title: o.note || o.label,
        onclick: () => { if (set.has(o.code)) set.delete(o.code); else set.add(o.code); chip.classList.toggle('on', set.has(o.code)); chip.setAttribute('aria-pressed', set.has(o.code) ? 'true' : 'false'); onToggle && onToggle(); },
      }, o.label);
      wrap.append(chip);
    }
    return wrap;
  }

  const jurisdictions = kb.jurisdictions.filter((j) => j.kind !== 'canton' && j.kind !== 'us-state');
  const regionsSummary = el('div', { class: 'small muted', style: { marginTop: '8px' } });
  function updateRegionsSummary() {
    const picked = new Set([...state.businessBase, ...(state.tradesInternationally ? state.tradesWhere : []), ...(state.employsInternationally ? state.employsWhere : [])]);
    if (!picked.size) { regionsSummary.replaceChildren(icon('info', 13), el('span', {}, ' No location chosen — you’ll get every compiled framework, grouped by jurisdiction.')); regionsSummary.style.color = 'var(--accent)'; return; }
    const labels = jurisdictions.filter((j) => picked.has(j.code)).map((j) => j.label);
    regionsSummary.style.color = 'var(--text-3)';
    regionsSummary.replaceChildren(el('span', {}, 'Jurisdictions in scope: ' + labels.join(', ')));
  }

  // Conditional "…and where?" reveals, gated by a Yes/No.
  const tradesWhereWrap = el('div', { style: { display: 'none', marginTop: '8px' } }, el('div', { class: 'small muted', style: { marginBottom: '4px' } }, 'Where do you trade / offer goods or services?'), chipGroup(jurisdictions, state.tradesWhere, updateRegionsSummary));
  const employsWhereWrap = el('div', { style: { display: 'none', marginTop: '8px' } }, el('div', { class: 'small muted', style: { marginBottom: '4px' } }, 'Where do you employ people?'), chipGroup(jurisdictions, state.employsWhere, updateRegionsSummary));
  const yesNo = (label, onChange) => {
    const sel = el('select', { 'aria-label': label, onchange: (e) => onChange(e.target.value === 'yes') }, el('option', { value: 'no' }, 'No'), el('option', { value: 'yes' }, 'Yes'));
    return el('div', { class: 'field', style: { flex: '1 1 160px' } }, el('label', {}, label), sel);
  };

  const sizeSel = el('select', { 'aria-label': 'Company size band', onchange: (e) => { state.sizeBand = e.target.value; } }, ...kb.sizeBands.map((b) => el('option', { value: b.code, selected: b.code === state.sizeBand }, b.label)));
  const empInput = el('input', { type: 'number', min: '0', step: '1', placeholder: 'e.g. 40', 'aria-label': 'Exact employee count (optional)', style: { width: '100%' }, oninput: (e) => { state.employees = e.target.value; } });
  const roleSel = el('select', { 'aria-label': 'Your data-protection role', onchange: (e) => { state.role = e.target.value; } }, ...kb.roles.map((r) => el('option', { value: r.code, selected: r.code === state.role }, r.label)));
  const sectorSel = el('select', { 'aria-label': 'Sector (optional)', onchange: (e) => { state.sector = e.target.value; } }, el('option', { value: '' }, 'Any / not sector-specific'), ...['finance', 'healthcare', 'health', 'education', 'public', 'crypto', 'insurance', 'ict-provider', 'manufacturing', 'real-estate'].map((s) => el('option', { value: s }, fmt.title(s))));

  const policyPicker = policies.rows.length
    ? el('div', { class: 'row wrap', style: { gap: '6px' } }, ...policies.rows.map((p) => {
      const chip = el('button', { type: 'button', class: 'chip' + (state.policyIds.has(p.id) ? ' on' : ''), 'aria-pressed': 'false', title: 'Check the applicable frameworks against ' + p.title, onclick: () => { if (state.policyIds.has(p.id)) state.policyIds.delete(p.id); else state.policyIds.add(p.id); chip.classList.toggle('on', state.policyIds.has(p.id)); chip.setAttribute('aria-pressed', state.policyIds.has(p.id) ? 'true' : 'false'); } }, p.title);
      return chip;
    }))
    : el('div', { class: 'small muted' }, 'No internal policies available to check against.');

  const field = (label, ctrl, hint) => el('div', { class: 'field', style: { flex: '1 1 200px' } }, el('label', {}, label), ctrl, hint ? el('div', { class: 'small muted', style: { marginTop: '3px' } }, hint) : null);

  // The based-where chip group is held in a slot so "Load example" can rebuild it
  // to reflect a programmatic selection (chips are stateful DOM, not data-bound).
  let basedGroup = chipGroup(jurisdictions, state.businessBase, updateRegionsSummary);
  const basedField = el('div', { class: 'field' }, el('label', {}, 'Where is your business based?'), basedGroup);
  function rebuildBased() { const fresh = chipGroup(jurisdictions, state.businessBase, updateRegionsSummary); basedGroup.replaceWith ? basedGroup.replaceWith(fresh) : basedField.replaceChildren(basedField.children[0], fresh); basedGroup = fresh; }

  const runBtn = el('button', { class: 'btn primary', onclick: () => run(false) }, icon('scale', 15), 'Analyse my situation');
  const showAllBtn = el('button', { class: 'btn', title: 'Ignore location and show every compiled framework, grouped by jurisdiction', onclick: () => run(true) }, icon('regulatory', 15), 'Show everything, grouped by jurisdiction');
  const exampleBtn = el('button', { class: 'btn ghost', title: 'Load a worked example: an EU + UK company that lost a laptop', onclick: loadExample }, icon('play', 14), 'Load example');

  const results = el('div', { class: 'mt2' });

  const queryCard = card('Your situation', { sub: 'Flag a problem · paste a policy · ask a question' },
    el('div', { class: 'row wrap', style: { gap: '6px', marginBottom: '8px' } }, ...modeChips),
    modeHint, textarea);

  const profileCard = card('Where you operate & who you are', { sub: 'Location questions are multi-select — pick every jurisdiction that applies' },
    basedField,
    el('div', { class: 'row wrap', style: { gap: '10px', marginTop: '10px' } },
      yesNo('Do you trade internationally?', (v) => { state.tradesInternationally = v; tradesWhereWrap.style.display = v ? 'block' : 'none'; updateRegionsSummary(); }),
      yesNo('Do you employ people internationally?', (v) => { state.employsInternationally = v; employsWhereWrap.style.display = v ? 'block' : 'none'; updateRegionsSummary(); })),
    tradesWhereWrap, employsWhereWrap,
    regionsSummary,
    el('div', { class: 'row wrap', style: { gap: '10px', marginTop: '12px' } },
      field('Company size', sizeSel),
      field('Exact employees (optional)', empInput, 'Overrides the band for size-gated rules.')),
    el('div', { class: 'row wrap', style: { gap: '10px', marginTop: '10px' } },
      field('Your data-protection role', roleSel),
      field('Sector (optional)', sectorSel, 'Gates DORA / NIS2 / AML.')),
    el('div', { class: 'field', style: { marginTop: '10px' } }, el('label', {}, el('span', {}, 'Check against internal policies (optional) '), infoDot('Runs the same deterministic gap analysis as the Comparison Sandbox against your chosen policies.')), policyPicker));

  panel.replaceChildren(
    el('div', { class: 'small muted', style: { marginBottom: '10px' } }, 'Deterministic, rule-based triage aid built on paraphrased public sources — not an AI legal opinion, and not legal advice.'),
    el('div', { class: 'split' }, queryCard, profileCard),
    el('div', { class: 'row wrap', style: { gap: '8px', alignItems: 'center', marginTop: '14px' } }, runBtn, showAllBtn, exampleBtn),
    results);
  updateRegionsSummary();

  function loadExample() {
    state.mode = 'flag'; for (const c of modeChips) { const on = c._code === 'flag'; c.classList.toggle('on', on); c.setAttribute('aria-pressed', on ? 'true' : 'false'); } applyMode();
    textarea.value = 'We lost a laptop that had a spreadsheet of customer records on it — is this a data breach we have to report, and to whom?'; state.queryText = textarea.value;
    state.businessBase = new Set(['EU', 'UK']); state.role = 'controller'; roleSel.value = 'controller'; state.sizeBand = 'small'; sizeSel.value = 'small';
    rebuildBased();
    updateRegionsSummary();
    run(false);
  }

  // Build the profile payload and call the engine; `forceAll` clears location.
  async function run(forceAll) {
    const profile = {
      mode: state.mode,
      queryText: state.queryText,
      businessBase: forceAll ? [] : [...state.businessBase],
      tradesInternationally: forceAll ? false : state.tradesInternationally,
      tradesWhere: forceAll ? [] : [...state.tradesWhere],
      employsInternationally: forceAll ? false : state.employsInternationally,
      employsWhere: forceAll ? [] : [...state.employsWhere],
      companySize: state.employees ? { employees: Number(state.employees) } : state.sizeBand,
      role: state.role,
      sector: state.sector,
      policyIds: [...state.policyIds],
    };
    if (!profile.queryText.trim() && !forceAll && !profile.businessBase.length) { toast('Describe your situation, or choose a location (or use “Show everything”).', { type: 'warn' }); return; }
    results.replaceChildren(skeleton(260));
    try {
      const res = await api.post('/api/compliance/analyze', { profile });
      renderResults(res);
    } catch (e) { results.replaceChildren(errorState(e.message)); }
  }

  function renderResults(res) {
    const nodes = [];
    nodes.push(triageBanner(res.triage));

    // Counterparty & jurisdiction ("sovereign nexus") risk read straight from the
    // brief — shown high up so a High/Elevated flag can't be missed.
    const cr = res.counterpartyRisk;
    if (cr && (cr.band || (cr.jurisdictions && cr.jurisdictions.length) || (cr.signals && cr.signals.length))) nodes.push(counterpartyRiskCard(cr));

    // Matched topics + omitted-location note.
    const meta = el('div', { class: 'row wrap', style: { gap: '8px', alignItems: 'center', margin: '2px 0 4px' } });
    if (res.showAllGrouped) meta.append(el('span', { class: 'badge sq neutral', title: 'No location was specified' }, 'Showing everything, grouped by jurisdiction'));
    if (res.matchedTopics.length) meta.append(el('span', { class: 'small muted' }, 'Recognised topics: '), ...res.matchedTopics.map((t) => el('span', { class: 'badge sq neutral' }, t.label)));
    if (meta.children && meta.children.length) nodes.push(meta);

    // Next steps — prioritised checklist. Each step may carry a deterministic
    // importance rating derived by the engine from KB semantics (high / med /
    // low; when no rating can honestly be derived there is no chip). The engine
    // sends steps sorted high-first; long lists collapse behind an accessible
    // "Show all" toggle so the highest-priority items stay above the fold.
    const RATING_LABEL = { high: 'HIGH', med: 'MED', low: 'LOW' };
    const stepLis = res.nextSteps.map((s) => {
      const o = typeof s === 'string' ? { text: s, rating: null, why: null } : s;
      return el('li', { style: { marginBottom: '4px' } },
        o.rating && RATING_LABEL[o.rating] ? el('span', { class: 'badge sq ' + o.rating, title: o.why || null, style: { marginRight: '7px', verticalAlign: '1px' } }, RATING_LABEL[o.rating]) : null,
        o.text);
    });
    const VISIBLE_STEPS = 8;
    const stepsList = el('ol', { class: 'checklist', id: 'next-steps-list', style: { margin: '0', paddingLeft: '20px', lineHeight: '1.7' } }, ...stepLis);
    let stepsToggle = null;
    if (stepLis.length > VISIBLE_STEPS) {
      const tail = stepLis.slice(VISIBLE_STEPS);
      for (const li of tail) li.style.display = 'none';
      stepsToggle = el('button', { class: 'btn sm ghost', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'next-steps-list', style: { marginTop: '8px' } }, 'Show all (' + stepLis.length + ')');
      stepsToggle.addEventListener('click', () => {
        const open = stepsToggle.getAttribute('aria-expanded') === 'true';
        for (const li of tail) li.style.display = open ? 'none' : '';
        stepsToggle.setAttribute('aria-expanded', open ? 'false' : 'true');
        stepsToggle.replaceChildren(open ? 'Show all (' + stepLis.length + ')' : 'Show fewer');
      });
    }
    nodes.push(card('Concrete next steps', { sub: res.triage.verdict === 'escalate-legal' ? 'Lead with raising it with your legal / privacy team' : 'A prioritised, actionable checklist' },
      stepsList, stepsToggle));

    // Clear-cut process runbooks (illustrative).
    if (res.processes.length) {
      nodes.push(card('Suggested runbooks', { sub: 'Illustrative good-practice procedures — replace with your organisation’s approved SOPs', actions: el('span', { class: 'badge sq neutral' }, 'Illustrative') },
        el('div', { style: { display: 'grid', gap: '10px' } }, ...res.processes.map(processCard))));
    }

    // What applies, grouped by jurisdiction.
    nodes.push(el('div', { class: 'card-title', style: { margin: '18px 0 8px', fontSize: '15px' } }, 'What applies to you', el('span', { class: 'small muted', style: { fontWeight: '400', marginLeft: '8px' } }, 'grouped by jurisdiction')));
    if (!res.byJurisdiction.length) nodes.push(emptyState('No frameworks resolved for this profile', 'Try adding a location, or use “Show everything, grouped by jurisdiction”.'));
    else for (const g of res.byJurisdiction) nodes.push(jurisdictionCard(g, res.showAllGrouped));

    // Mentioned-but-out-of-region.
    if (res.mentionedOutOfRegion && res.mentionedOutOfRegion.length) {
      nodes.push(card('Mentioned, but outside your selected jurisdictions', { sub: 'Surfaced so nothing is silently dropped' },
        el('div', { class: 'row wrap', style: { gap: '6px' } }, ...res.mentionedOutOfRegion.map((m) => el('span', { class: 'badge sq med', title: m.reason }, m.name)))));
    }

    // Closest real instruments (link into Regulatory Horizon).
    if (res.suggestedRealInstruments && res.suggestedRealInstruments.length) {
      const max = Math.max(1, ...res.suggestedRealInstruments.map((s) => s.score));
      nodes.push(card('Closest real instruments', { sub: 'From FRIS’s real regulatory register — deterministic textual match', actions: el('a', { class: 'btn sm ghost', href: '#/regulatory/feed' }, 'Open register', icon('chevron', 14)) },
        el('div', { style: { display: 'grid', gap: '8px' } }, ...res.suggestedRealInstruments.map((s, i) => instrumentRow(s, i, max)))));
    }

    // Policy gap (optional) — reuses the Comparison Sandbox finding shape.
    if (res.policyGap && res.policyGap.length) {
      for (const pg of res.policyGap) nodes.push(policyGapCard(pg));
    }

    // Standing disclaimer.
    nodes.push(el('div', { class: 'intro', style: { marginTop: '18px' } }, el('span', { class: 'ico' }, icon('info', 18)), el('div', { class: 't' }, el('b', {}, 'Not legal advice. '), res.disclaimer)));

    results.replaceChildren(...nodes);
  }

  // Counterparty & jurisdiction ("sovereign nexus") risk card. Each row states a
  // band (High / Elevated) and a SHORT, plain reason WHY, read from the brief text.
  function counterpartyRiskCard(cr) {
    const accent = RISK_BAND_ACCENT[cr.band] || 'var(--accent)';
    const rows = [];
    if (cr.jurisdictions && cr.jurisdictions.length) {
      rows.push(el('div', { class: 'card-title', style: { fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-3)', margin: '4px 0 6px' } }, 'Jurisdiction / sovereign nexus'));
      for (const j of cr.jurisdictions) rows.push(riskLine(j.band, j.name, j.why));
    }
    if (cr.signals && cr.signals.length) {
      rows.push(el('div', { class: 'card-title', style: { fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-3)', margin: '12px 0 6px' } }, 'Structural / typology signals'));
      for (const s of cr.signals) rows.push(riskLine(s.band, s.label, s.why));
    }
    return el('div', { class: 'card', role: 'status', style: { '--mc': accent, borderLeft: '4px solid ' + accent, background: 'color-mix(in srgb, ' + accent + ' 7%, var(--surface))' } },
      el('div', { class: 'card-body' },
        el('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center' } },
          el('span', { class: 'mc-icon', style: { flex: '0 0 auto', color: accent } }, icon('alert', 18)),
          cr.band ? riskBadge(cr.band === 'High' ? 'High' : 'Medium') : null,
          el('div', { style: { fontSize: '15px', fontWeight: '700', color: 'var(--text)' } }, 'Counterparty & jurisdiction risk')),
        el('div', { style: { marginTop: '8px' } }, ...rows),
        el('div', { class: 'small muted', style: { marginTop: '10px' } }, cr.note)));
  }
  function riskLine(band, name, why) {
    const accent = RISK_BAND_ACCENT[band] || 'var(--text-3)';
    return el('div', { style: { padding: '6px 0', borderBottom: '1px solid var(--border)' } },
      el('div', { class: 'row wrap', style: { gap: '8px', alignItems: 'baseline' } },
        el('span', { class: 'badge sq', style: { color: '#fff', background: accent, fontWeight: '700' }, title: band + ' risk' }, band),
        el('span', { style: { fontWeight: '600', color: 'var(--text)' } }, name)),
      el('div', { class: 'small', style: { color: 'var(--text-2)', marginTop: '2px' } }, why));
  }

  function triageBanner(t) {
    const accent = VERDICT_ACCENT[t.verdict] || 'var(--accent)';
    return el('div', { class: 'card', role: 'status', style: { '--mc': accent, borderLeft: '4px solid ' + accent, background: 'color-mix(in srgb, ' + accent + ' 8%, var(--surface))' } },
      el('div', { class: 'card-body' },
        el('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center' } },
          el('span', { class: 'mc-icon', style: { flex: '0 0 auto', color: accent } }, icon(VERDICT_ICON[t.verdict] || 'info', 20)),
          riskBadge(t.colour),
          el('div', { style: { fontSize: '16px', fontWeight: '700', color: 'var(--text)' } }, t.label)),
        el('p', { class: 'small', style: { color: 'var(--text-2)', margin: '8px 0 0' } }, t.meaning),
        t.reasons && t.reasons.length ? el('div', { style: { marginTop: '10px' } }, el('div', { class: 'small muted', style: { marginBottom: '4px' } }, 'Why:'), el('ul', { style: { margin: '0', paddingLeft: '18px', lineHeight: '1.6' } }, ...t.reasons.map((r) => el('li', { class: 'small' }, r)))) : null));
  }

  function processCard(p) {
    return el('details', { class: 'module-card', style: { '--mc': '#4d8df0', padding: '12px 14px' } },
      el('summary', { style: { cursor: 'pointer', fontWeight: '600', color: 'var(--text)' } }, p.title),
      el('ol', { style: { margin: '10px 0 0', paddingLeft: '20px', lineHeight: '1.7' } }, ...p.steps.map((s) => el('li', { class: 'small', style: { marginBottom: '3px' } }, s))));
  }

  function jurisdictionCard(g, expanded) {
    const j = g.jurisdiction;
    const details = el('details', { class: 'card', style: { marginBottom: '10px' } });
    if (expanded !== true) details.setAttribute('open', '');
    else if (g.frameworks.length) details.setAttribute('open', ''); // keep populated groups open
    const summary = el('summary', { style: { cursor: 'pointer', listStyle: 'none', padding: '12px 14px' } },
      el('div', { class: 'row wrap', style: { gap: '8px', alignItems: 'center' } },
        el('span', { style: { fontWeight: '700', color: 'var(--text)', fontSize: '14px' } }, j.label),
        el('span', { class: 'badge sq neutral' }, g.frameworks.length + (g.frameworks.length === 1 ? ' framework' : ' frameworks')),
        el('span', { class: 'badge sq neutral' }, g.obligations.length + ' obligations')));
    details.append(summary);
    const body = el('div', { class: 'card-body', style: { paddingTop: '0' } });
    if (j.note) body.append(el('div', { class: 'small muted', style: { marginBottom: '10px' } }, j.note));
    // Frameworks.
    body.append(el('div', { class: 'card-title', style: { fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-3)', marginBottom: '6px' } }, 'Frameworks that apply'));
    for (const f of g.frameworks) body.append(frameworkRow(f));
    // Obligations.
    body.append(el('div', { class: 'card-title', style: { fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-3)', margin: '14px 0 6px' } }, 'Obligations & artefacts'));
    for (const o of g.obligations) body.append(obligationRow(o));
    details.append(body);
    return details;
  }

  function frameworkRow(f) {
    const kind = KIND_LABEL[f.kind] || fmt.title(f.kind);
    return el('div', { style: { padding: '9px 0', borderBottom: '1px solid var(--border)' } },
      el('div', { class: 'row wrap', style: { gap: '8px', alignItems: 'center' } },
        el('span', { style: { fontWeight: '600', color: 'var(--text)' } }, f.name),
        el('span', { class: 'badge sq neutral', title: 'Framework type' }, kind),
        f.mandatory ? el('span', { class: 'badge high', title: 'A legal obligation where it applies' }, el('span', { class: 'dot' }), 'Mandatory') : el('span', { class: 'badge low', title: 'A voluntary standard' }, el('span', { class: 'dot' }), 'Voluntary'),
        el('span', { class: 'spacer' }),
        f.source ? el('a', { class: 'small', href: f.source, target: '_blank', rel: 'noreferrer', title: 'Official / authoritative source' }, 'Source', ' ', icon('ext', 12)) : null,
        f.linkedInstrumentId ? el('a', { class: 'btn sm ghost', href: '#/regulatory/feed', title: 'Open the linked real instrument (' + (f.linkedInstrumentTitle || f.linkedInstrumentId) + ') in Regulatory Horizon' }, icon('regulatory', 13), 'In register') : null),
      f.why && f.why.length ? el('div', { class: 'small muted', style: { marginTop: '4px' } }, 'Why it applies: ' + f.why.join(' ')) : null);
  }

  function obligationRow(o) {
    return el('div', { style: { padding: '8px 0', borderBottom: '1px solid var(--border)' } },
      el('div', { class: 'row wrap', style: { gap: '8px', alignItems: 'baseline' } },
        el('span', { style: { fontWeight: '600', color: 'var(--text)' } }, o.name),
        o.artefact ? el('span', { class: 'badge sq neutral', title: 'A document/record you produce' }, 'Artefact') : null),
      el('div', { class: 'small', style: { color: 'var(--text-2)', marginTop: '3px' } }, o.what),
      o.roleNote ? el('div', { class: 'small', style: { color: 'var(--accent)', marginTop: '3px' } }, 'Your role: ' + o.roleNote) : null,
      o.sizeNote ? el('div', { class: 'small muted', style: { marginTop: '3px' } }, o.sizeNote) : null);
  }

  function instrumentRow(s, i, max) {
    const barColor = i === 0 ? 'var(--accent)' : s.score >= max * 0.6 ? '#4d8df0' : 'var(--text-3)';
    return el('a', { class: 'module-card', href: '#/regulatory/feed', style: { '--mc': barColor, padding: '11px 13px', display: 'block', textDecoration: 'none' }, title: 'Open the regulatory register' },
      el('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'baseline' } },
        el('span', { class: 'tabular', style: { color: 'var(--text-3)', fontWeight: '700', fontSize: '12px' } }, '#' + (i + 1)),
        el('span', { style: { fontWeight: '600', color: 'var(--text)', flex: '1 1 auto' } }, s.title),
        el('span', { class: 'tabular', style: { color: barColor, fontWeight: '700' } }, fmt.pct(s.score))),
      el('div', { style: { marginTop: '6px' } }, meter(s.score / max * 100, barColor)),
      (s.overlap && s.overlap.length) ? el('div', { class: 'small muted', style: { marginTop: '6px' } }, 'shared terms: ' + s.overlap.slice(0, 5).join(', ')) : null);
  }

  function policyGapCard(pg) {
    const findings = pg.findings || [];
    return card('Policy gap — ' + (pg.policyTitle || pg.policyId), { sub: `Coverage ${pg.overallScore}% · ${pg.obligationCount} obligations · ${pg.matchedCount} matched`, actions: statusBadge(pg.verdict) },
      findings.length ? el('div', {}, ...findings.slice(0, 12).map((f) => el('div', { style: { padding: '9px 0', borderBottom: '1px solid var(--border)' } },
        el('div', { class: 'row wrap', style: { gap: '8px' } }, statusBadge(f.severity), el('span', { class: 'badge sq neutral' }, fmt.title(f.finding_type)), el('span', { class: 'small muted' }, 'confidence ' + f.confidence + '%')),
        el('div', { class: 'small', style: { marginTop: '4px' } }, f.explanation),
        f.reg_fragment ? el('div', { class: 'fragment reg' }, '“' + f.reg_fragment + '”') : null,
        f.policy_fragment ? el('div', { class: 'fragment pol' }, '“' + f.policy_fragment + '”') : null,
        el('div', { class: 'small muted', style: { marginTop: '4px' } }, 'Recommended: ' + f.recommendation))))
        : emptyState('No gaps raised against this policy'));
  }
}
