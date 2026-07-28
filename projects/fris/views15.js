// View: Financial-Crime Typology Lab — illicit-finance scenario & detector validation.
// A build-your-own financial-crime scenario lab: the analyst COMPOSES a laundering /
// sanctions-evasion typology (placement → layering → integration) from stage blocks,
// runs it, then watches it PROPAGATE across the FRIS suite and sees WHICH real
// detectors and screening rules catch it — and where the gaps are. A detector-
// validation, red-team and training sandbox for financial-crime teams.
//
// The engine GENERATES the synthetic artefacts for the composed scenario (fictional
// shells, a crypto peel chain via the real simulatePeelChain, trade invoices, a
// real-estate / operating-business estate), then RUNS the REAL FRIS detectors
// (Transaction Monitoring typology rules, the Chain-Link crypto battery, sanctions
// screening, the ownership-graph opacity summary, the Liquidation Waterfall) over
// them and returns a step-by-step money-flow narrative + a detector-coverage report
// (per stage: caught ✓ by which detector / missed ✗ gap, plus an overall score).
//
// Honest posture: a TRAINING / SIMULATION SANDBOX. Everything generated is 100%
// SYNTHETIC and deterministic; the methods mirror real, publicly-documented FATF /
// public methodology; nothing names or implicates a real party. Renders in-page
// within the shell (never a viewport takeover), accessible (colour ALWAYS paired
// with a text label), DOM-light. No SVG geometry / getBBox / getBoundingClientRect
// dependence — the money-flow is hand-built stepped panels, not measured layout.
import { el, api, fmt, icon, card, emptyState, errorState, skeleton, infoDot } from './core.js';
import { pageHead, intro } from './views1.js';

const ACCENT = '#c77dff'; // a violet accent — marks the cross-suite capstone

// Phase → colour (ALWAYS paired with the text label). Mirrors the engine PHASES.
const PHASE_COLOR = { placement: '#4d8df0', layering: '#e5a53b', integration: '#38bda0' };
// Coverage band → colour.
const COV_COLOR = { Strong: '#2f9e63', Partial: '#c9a227', Weak: '#e07b39', Minimal: '#d5303e' };

// Module-scoped composer state (a single Studio instance at a time). Kept module-
// local (not global) so a re-entry re-initialises cleanly.
let STATE = null;

export async function typology(root, parts) {
  root.append(pageHead('Financial-Crime Typology Lab', 'Build an illicit-finance typology — placement → layering → integration — from stage blocks, run it, and see which of FRIS\u2019s real detectors catch it and where money slips through. A detector-validation, red-team and training sandbox for financial-crime teams.', [
    el('a', { class: 'btn sm ghost', href: '#/monitoring', title: 'Transaction Monitoring & SAR — the typology rules validated here' }, icon('bell', 15), 'Monitoring'),
    el('a', { class: 'btn sm ghost', href: '#/chainlink', title: 'Chain-Link Engine — the crypto peel-chain battery validated here' }, icon('chain', 15), 'Chain-Link'),
    el('a', { class: 'btn sm ghost', href: '#/screening', title: 'Screening & Watchlist — the sanctions screening validated here' }, icon('alert', 15), 'Screening'),
  ]));
  root.append(intro('The Financial-Crime Typology Lab',
    'is the crown-jewel synthesis of FRIS: a red-team / training / detector-validation sandbox that turns the whole suite into one explainable “how money is hidden — and how you would catch it” simulator. Pick a preset or compose your own typology from stage blocks across the three canonical laundering phases — placement (cash structuring, funnel accounts), layering (shell-company chains, a crypto peel chain, trade-based over/under-invoicing, mule networks) and integration (real-estate purchase, operating-business commingling). Run it, and the Studio deterministically GENERATES the synthetic artefacts, threads the money through with fees / shrinkage, then RUNS the REAL FRIS detectors — the Transaction-Monitoring typology rules, the Chain-Link crypto battery, sanctions screening, the ownership-graph opacity summary and the Liquidation Waterfall — over what it generated. It reports the money-flow across Nexus → Chain-Link → Waterfall and a detector-coverage report: for each stage, which detector caught it (✓) or where the typology slipped through undetected (✗), with an overall coverage score.'));

  // Honesty banner (prominent).
  root.append(el('div', { class: 'intro', role: 'note', style: { marginTop: '10px', '--mc': ACCENT } },
    el('span', { class: 'ico' }, icon('info', 18)),
    el('div', { class: 't' }, el('b', {}, 'Training / simulation sandbox — synthetic; not operational advice. '),
      'Every generated entity, shell, wallet, invoice, transaction and asset is 100% FICTIONAL and produced deterministically from a fixed seed. The typology METHODS mirror REAL, well-known, publicly-documented FATF / public methodology (placement / layering / integration, structuring & smurfing, shell-company layering, crypto peel chains, trade-based over/under-invoicing, mule networks, real-estate integration, loan-backs) — the methods are legitimate public knowledge, the data is invented. Nothing here names or implicates any real person, company or wallet. This is NOT operational advice, NOT a how-to and NOT a detection system of record; it is a detector-validation lab showing how money is hidden and how you would catch it.')));

  const body = el('div', { class: 'mt' });
  root.append(body);
  await renderStudio(body, parts);
}

// ─────────────────────────────────────────────────────────────────────────────
// STUDIO — load the catalogue, build the composer, and auto-run a default preset.
// ─────────────────────────────────────────────────────────────────────────────
async function renderStudio(root, parts) {
  const panel = el('div', {}, skeleton(360));
  root.append(panel);

  let cat;
  try { cat = await api.get('/api/typology/catalogue'); }
  catch (e) { panel.replaceChildren(errorState(e.message)); return; }

  // Choose the initial preset: a #/typology/<presetId> deep-link, else the first.
  const presetId = (parts && parts[0]) ? decodeURIComponent(parts[0]) : (cat.presets[0] && cat.presets[0].id);
  let spec = null;
  try {
    const p = await api.get('/api/typology/preset/' + encodeURIComponent(presetId));
    spec = p && p.spec ? p.spec : (p && p.stages ? p : null);
  } catch (_e) { spec = null; }
  if (!spec && cat.presets[0]) {
    try { const p2 = await api.get('/api/typology/preset/' + encodeURIComponent(cat.presets[0].id)); spec = p2.spec || p2; } catch (_e) { /* ignore */ }
  }
  // Fallback minimal spec so the composer is always usable.
  if (!spec) spec = { id: 'custom', name: 'Custom scenario', seed: 71011, stages: [] };

  STATE = { cat, spec, result: null, running: false, mount: panel };

  // Run the initial simulate synchronously so the first paint has results (this is
  // what makes the headless e2e render meaningful — a default simulate populates the
  // money-flow + coverage without any interaction).
  await runSimulation(true);
}

// Build + POST the current spec, then re-render. `initial` swallows the button state.
async function runSimulation(initial) {
  if (!STATE) return;
  STATE.running = true;
  if (!initial) renderComposerAndResults(); // reflect the running state
  let result = null;
  try {
    result = await api.post('/api/typology/simulate', specPayload(STATE.spec));
  } catch (e) {
    STATE.running = false;
    STATE.mount.replaceChildren(errorState('Simulation failed: ' + e.message));
    return;
  }
  STATE.result = result;
  STATE.running = false;
  renderComposerAndResults();
}

// The wire payload: seed + ordered { block, params }.
function specPayload(spec) {
  return { seed: spec.seed, name: spec.name || null, stages: (spec.stages || []).map((s) => ({ block: s.block, params: { ...s.params } })) };
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPOSER + RESULTS — re-rendered whenever the spec or result changes.
// ─────────────────────────────────────────────────────────────────────────────
function renderComposerAndResults() {
  if (!STATE) return;
  const nodes = [];
  nodes.push(composerCard());
  if (STATE.result) {
    nodes.push(coverageSummaryCard(STATE.result));
    nodes.push(moneyFlowCard(STATE.result));
    nodes.push(coverageReportCard(STATE.result));
    nodes.push(detectorDirectoryCard(STATE.result));
    nodes.push(disclaimerNote(STATE.result.disclaimer));
  } else {
    nodes.push(card('Run the scenario', {}, el('div', { class: 'small muted' }, 'Compose a typology above and press Run simulation to see the money-flow and the detector-coverage report.')));
  }
  STATE.mount.replaceChildren(...nodes);
}

// The scenario composer: preset picker + the ordered stage list + Run button.
function composerCard() {
  const cat = STATE.cat, spec = STATE.spec;
  // Preset picker row.
  const presetChips = cat.presets.map((p) => {
    const active = spec.id === p.id;
    return el('button', {
      class: 'btn sm' + (active ? ' primary' : ' ghost'),
      title: p.blurb, onclick: () => loadPreset(p.id),
    }, icon('folder', 13), p.name);
  });

  // Add-a-stage controls, grouped by phase.
  const addControls = cat.phases.map((ph) => {
    const blocks = cat.blocks.filter((b) => b.phase === ph.code);
    return el('div', { class: 'row wrap', style: { gap: '6px', alignItems: 'center', marginBottom: '6px' } },
      el('span', { class: 'badge sq neutral', style: { minWidth: '96px', justifyContent: 'flex-start', color: PHASE_COLOR[ph.code] }, title: ph.blurb },
        el('span', { class: 'dot', style: { background: PHASE_COLOR[ph.code] } }), ph.label),
      ...blocks.map((b) => el('button', { class: 'btn sm ghost', title: b.summary, onclick: () => addStage(b.id) }, icon('plus', 12), b.label)));
  });

  // The ordered stage list (each editable).
  const stageRows = (spec.stages || []).length
    ? spec.stages.map((st, idx) => stageEditor(st, idx))
    : [el('div', { class: 'small muted', style: { padding: '10px 0' } }, 'No stages yet — add a placement, layering and integration stage, or load a preset above.')];

  const runBtn = el('button', {
    class: 'btn primary', disabled: STATE.running ? 'disabled' : null,
    onclick: () => runSimulation(false),
  }, icon(STATE.running ? 'history' : 'chain', 15), STATE.running ? 'Running…' : 'Run simulation');

  const seedInput = el('input', {
    type: 'number', value: String(spec.seed), title: 'Deterministic seed — same seed + same stages → identical result',
    style: { width: '110px' },
    onchange: (e) => { const v = parseInt(e.target.value, 10); STATE.spec.seed = Number.isFinite(v) ? v : STATE.spec.seed; },
  });

  return card('Scenario composer', {
    sub: 'Pick a preset or compose your own typology across placement → layering → integration',
    actions: el('span', { class: 'badge sq', style: { background: 'rgba(199,125,255,0.16)', color: ACCENT, borderColor: 'rgba(199,125,255,0.5)' } }, 'Capstone'),
  },
    el('div', { class: 'small muted', style: { marginBottom: '6px', fontWeight: '600', color: 'var(--text)' } }, 'Presets'),
    el('div', { class: 'row wrap', style: { gap: '6px', marginBottom: '12px' } }, ...presetChips,
      el('button', { class: 'btn sm ghost', title: 'Clear all stages and compose from scratch', onclick: () => clearStages() }, icon('reset', 12), 'Clear')),
    el('div', { class: 'small muted', style: { marginBottom: '6px', fontWeight: '600', color: 'var(--text)' } }, 'Add a stage'),
    el('div', { style: { marginBottom: '12px' } }, ...addControls),
    el('div', { class: 'small muted', style: { marginBottom: '6px', fontWeight: '600', color: 'var(--text)' } }, `Composed typology (${(spec.stages || []).length} stage${(spec.stages || []).length === 1 ? '' : 's'})`),
    el('div', { style: { marginBottom: '12px' } }, ...stageRows),
    el('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center' } },
      runBtn,
      el('span', { class: 'small muted' }, 'Seed'), seedInput,
      spec.tagline ? el('span', { class: 'small muted', style: { flex: '1 1 auto', minWidth: '0' } }, spec.tagline) : null));
}

// One editable stage row: phase badge, label, its parameter inputs, remove + reorder.
function stageEditor(st, idx) {
  const block = STATE.cat.blocks.find((b) => b.id === st.block) || { label: st.block, phase: 'layering', params: [], summary: '' };
  const params = (block.params || []).map((p) => paramInput(st, p, idx));
  return el('div', { class: 'card', style: { '--mc': PHASE_COLOR[block.phase], borderLeft: '3px solid ' + PHASE_COLOR[block.phase], padding: '0', marginBottom: '8px' } },
    el('div', { class: 'card-body', style: { padding: '10px 12px' } },
      el('div', { class: 'row wrap', style: { gap: '8px', alignItems: 'center', marginBottom: params.length ? '8px' : '0' } },
        el('span', { class: 'badge sq neutral', style: { color: PHASE_COLOR[block.phase] }, title: (STATE.cat.phases.find((x) => x.code === block.phase) || {}).blurb || '' },
          el('span', { class: 'dot', style: { background: PHASE_COLOR[block.phase] } }), `${idx + 1}`),
        el('span', { style: { fontWeight: '700', color: 'var(--text)', flex: '1 1 auto', minWidth: '120px' }, title: block.summary }, block.label),
        el('button', { class: 'btn xs ghost', title: 'Move up', disabled: idx === 0 ? 'disabled' : null, onclick: () => moveStage(idx, -1) }, '↑'),
        el('button', { class: 'btn xs ghost', title: 'Move down', disabled: idx === (STATE.spec.stages.length - 1) ? 'disabled' : null, onclick: () => moveStage(idx, 1) }, '↓'),
        el('button', { class: 'btn xs ghost', title: 'Remove this stage', onclick: () => removeStage(idx) }, icon('x', 12))),
      params.length ? el('div', { class: 'row wrap', style: { gap: '10px 16px' } }, ...params) : null));
}

// A single parameter input (number / int / percent / bool), wired to the stage params.
function paramInput(st, p, idx) {
  const val = st.params[p.key];
  if (p.kind === 'bool') {
    const cb = el('input', { type: 'checkbox', checked: val ? 'checked' : null, onchange: (e) => { STATE.spec.stages[idx].params[p.key] = !!e.target.checked; } });
    return el('label', { class: 'small', style: { display: 'inline-flex', gap: '5px', alignItems: 'center', cursor: 'pointer' }, title: p.help || '' },
      cb, el('span', { class: 'muted' }, p.label));
  }
  const step = p.kind === 'int' ? '1' : String(p.step || (p.kind === 'percent' ? 1 : 0.01));
  const input = el('input', {
    type: 'number', value: String(val), step, min: p.min != null ? String(p.min) : null, max: p.max != null ? String(p.max) : null,
    style: { width: '84px' }, title: p.help || '',
    onchange: (e) => {
      let v = Number(e.target.value);
      if (!Number.isFinite(v)) v = Number(p.def);
      if (p.min != null) v = Math.max(p.min, v);
      if (p.max != null) v = Math.min(p.max, v);
      if (p.kind === 'int') v = Math.round(v);
      STATE.spec.stages[idx].params[p.key] = v;
      e.target.value = String(v);
    },
  });
  return el('label', { class: 'small', style: { display: 'inline-flex', gap: '5px', alignItems: 'center' }, title: p.help || '' },
    el('span', { class: 'muted' }, p.label + (p.unit ? ` (${p.unit})` : '')), input);
}

// ── Composer mutations (each re-renders; results are cleared until re-run) ─────
async function loadPreset(id) {
  try { const p = await api.get('/api/typology/preset/' + encodeURIComponent(id)); STATE.spec = p.spec || p; }
  catch (_e) { return; }
  await runSimulation(false);
}
function addStage(blockId) {
  const block = STATE.cat.blocks.find((b) => b.id === blockId);
  if (!block) return;
  const params = {};
  for (const p of block.params) params[p.key] = p.def;
  STATE.spec.stages = (STATE.spec.stages || []).concat([{ block: blockId, params }]);
  STATE.spec.id = 'custom'; STATE.spec.tagline = null;
  renderComposerAndResults();
}
function removeStage(idx) { STATE.spec.stages.splice(idx, 1); STATE.spec.id = 'custom'; renderComposerAndResults(); }
function moveStage(idx, dir) {
  const j = idx + dir; const s = STATE.spec.stages;
  if (j < 0 || j >= s.length) return;
  [s[idx], s[j]] = [s[j], s[idx]]; STATE.spec.id = 'custom'; renderComposerAndResults();
}
function clearStages() { STATE.spec = { id: 'custom', name: 'Custom scenario', seed: STATE.spec.seed, stages: [] }; STATE.result = null; renderComposerAndResults(); }

// ─────────────────────────────────────────────────────────────────────────────
// RESULTS — coverage summary, money-flow narrative, coverage report, directory.
// ─────────────────────────────────────────────────────────────────────────────

// Coverage summary: the headline score + caught/gap KPIs + per-phase bars + flow reconcile.
function coverageSummaryCard(r) {
  const cov = r.coverage;
  const color = COV_COLOR[cov.band] || ACCENT;
  const flow = r.flow;
  const kpis = el('div', { class: 'row wrap', style: { gap: '10px', marginBottom: '12px' } },
    scoreDial(cov.score, cov.band, color),
    kpiChip('Red-flags caught', `${cov.caughtFlags}/${cov.totalFlags}`, COV_COLOR.Strong, 'Planted red-flags a real FRIS detector fired on'),
    kpiChip('Detection gaps', String(cov.gapFlags), cov.gapFlags ? COV_COLOR.Weak : COV_COLOR.Strong, 'Planted red-flags that slipped through undetected'),
    kpiChip('Detectors fired', String(r.detectors.filter((d) => d.fired).length), '#4d8df0', 'Distinct real FRIS detectors that fired on this scenario'),
    kpiChip('Stages', String(r.stages.length), ACCENT, 'Stage blocks in the composed typology'));

  // Per-phase coverage bars (colour + label).
  const phaseBars = (cov.byPhase || []).map((p) => el('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center', padding: '5px 0' }, title: `${p.caught}/${p.total} planted red-flags caught in the ${p.label} phase` },
    el('span', { class: 'badge sq neutral', style: { minWidth: '104px', justifyContent: 'flex-start', color: p.color } }, el('span', { class: 'dot', style: { background: p.color } }), p.label),
    el('div', { style: { flex: '1 1 auto', minWidth: '80px' } }, hbar(p.pct, p.color)),
    el('span', { class: 'small muted tabular', style: { minWidth: '78px', textAlign: 'right' } }, `${p.caught}/${p.total} · ${p.pct}%`)));

  // Money-flow reconcile chip.
  const reconChip = el('div', { class: 'intro', role: 'note', style: { marginTop: '10px', '--mc': flow.reconciles ? COV_COLOR.Strong : COV_COLOR.Weak } },
    el('span', { class: 'ico' }, icon(flow.reconciles ? 'check' : 'alert', 18)),
    el('div', { class: 't' }, el('b', {}, flow.reconciles ? 'Money-flow reconciles. ' : 'Money-flow residual outside tolerance. '),
      `Injected ${fmt.num(flow.injected)} → survived ${fmt.num(flow.survived)} + shrinkage ${fmt.num(flow.shrinkage)} (fees, peels, mule commissions). Residual ${fmt.num(flow.residual)} within ±${fmt.num(flow.tolerance)}. Units are per-stage (${flow.unit}).`));

  return card('Detector-coverage summary', {
    sub: `${cov.band} coverage — ${cov.score}% of the planted red-flags were caught by a real FRIS detector`,
    actions: el('span', { class: 'badge', style: { background: hexToRgba(color, 0.18), color, borderColor: hexToRgba(color, 0.5) } }, el('span', { class: 'dot' }), cov.band),
  }, kpis,
    el('div', { class: 'small muted', style: { fontWeight: '600', color: 'var(--text)', marginBottom: '4px' } }, 'Coverage by laundering phase'),
    ...phaseBars, reconChip);
}

// The money-flow diagram: hand-built stepped panels (NO measured layout / getBBox).
// Each stage is a panel coloured by phase, showing the narrative + amount in/out +
// shrinkage, with an arrow between panels — a flow across placement → layering →
// integration (Nexus → Chain-Link → Waterfall).
function moneyFlowCard(r) {
  const steps = r.flow.steps || [];
  const panels = [];
  steps.forEach((s, i) => {
    const color = PHASE_COLOR[s.phase] || '#888';
    const stage = r.stages.find((x) => x.stageId === s.stageId);
    panels.push(el('div', { class: 'card', style: { '--mc': color, borderLeft: '4px solid ' + color, padding: '0' } },
      el('div', { class: 'card-body', style: { padding: '11px 13px' } },
        el('div', { class: 'row wrap', style: { gap: '8px', alignItems: 'center', marginBottom: '6px' } },
          el('span', { class: 'badge sq neutral', style: { color } }, el('span', { class: 'dot', style: { background: color } }), phaseLabel(s.phase)),
          el('span', { style: { fontWeight: '700', color: 'var(--text)', flex: '1 1 auto', minWidth: '120px' } }, s.label),
          stage ? coverageChip(stage.coveragePct) : null),
        el('div', { class: 'small', style: { color: 'var(--text-2)', lineHeight: '1.55', marginBottom: '6px' } }, s.narrative),
        el('div', { class: 'row wrap', style: { gap: '12px', alignItems: 'center' } },
          amountPill('In', s.amountIn), s.shrink ? amountPill('Shrinkage', s.shrink, COV_COLOR.Weak) : null, amountPill('Out', s.amountOut, color)))));
    if (i < steps.length - 1) panels.push(el('div', { style: { textAlign: 'center', color: 'var(--text-3, #667)', fontSize: '18px', lineHeight: '1', margin: '2px 0' }, 'aria-hidden': 'true' }, '↓'));
  });

  return card('Money-flow across the suite', {
    sub: 'The composed typology as a step-by-step flow — placement → layering → integration, threaded across Sovereign Nexus, the Chain-Link Engine and the Liquidation Waterfall',
    actions: el('span', { class: 'badge sq neutral' }, `${steps.length} steps`),
  },
    el('div', { class: 'small muted', style: { marginBottom: '10px' } }, 'Each panel is a generated stage: the amount flowing in, the shrinkage taken (fees, peel cash-outs, mule commissions) and the amount flowing out to the next stage. Amounts are per-stage synthetic units (k units for fiat legs, ETH for the crypto leg).'),
    el('div', { style: { display: 'grid', gap: '2px' } }, ...panels));
}

// The detector-coverage report: per stage, each planted red-flag as caught ✓ (by
// which detector) or missed ✗ (gap), with a colour + label and an explanation.
function coverageReportCard(r) {
  const stagePanels = r.stages.map((st) => {
    const color = PHASE_COLOR[st.phase] || '#888';
    const flagRows = st.redFlags.map((f) => {
      const ok = f.caught;
      const c = ok ? COV_COLOR.Strong : (f.inherentGap ? COV_COLOR.Weak : COV_COLOR.Minimal);
      return el('div', { style: { padding: '7px 0', borderBottom: '1px solid var(--border)' } },
        el('div', { class: 'row wrap', style: { gap: '8px', alignItems: 'center', marginBottom: '2px' } },
          el('span', { class: 'badge ' + (ok ? 'low' : 'high'), style: { color: c, borderColor: hexToRgba(c, 0.5), background: hexToRgba(c, 0.14) }, title: ok ? 'Caught by a real detector' : (f.inherentGap ? 'Inherent detection gap' : 'Detection gap') },
            el('span', { class: 'dot' }), ok ? 'Caught ✓' : (f.inherentGap ? 'Inherent gap' : 'Gap ✗')),
          el('span', { style: { fontWeight: '600', color: 'var(--text)', flex: '1 1 auto', minWidth: '120px' } }, f.title),
          f.detectorLabel ? (f.route ? el('a', { class: 'badge sq neutral', href: f.route, style: { textDecoration: 'none', fontSize: '10px' }, title: 'Open the detector’s module' }, f.detectorLabel) : el('span', { class: 'badge sq neutral', style: { fontSize: '10px' } }, f.detectorLabel)) : el('span', { class: 'badge sq neutral', style: { fontSize: '10px' } }, 'no real-time detector')),
        el('div', { class: 'small muted', style: { lineHeight: '1.5' } }, f.explanation));
    });
    return el('div', { class: 'card', style: { '--mc': color, borderLeft: '3px solid ' + color, padding: '0', marginBottom: '8px' } },
      el('div', { class: 'card-body', style: { padding: '10px 12px' } },
        el('div', { class: 'row wrap', style: { gap: '8px', alignItems: 'center', marginBottom: '6px' } },
          el('span', { class: 'badge sq neutral', style: { color } }, el('span', { class: 'dot', style: { background: color } }), phaseLabel(st.phase)),
          el('span', { style: { fontWeight: '700', color: 'var(--text)', flex: '1 1 auto', minWidth: '120px' } }, `${st.order}. ${st.label}`),
          coverageChip(st.coveragePct),
          el('span', { class: 'small muted tabular' }, `${st.caught}/${st.planted} caught`)),
        el('div', { class: 'small muted', style: { marginBottom: '4px' } }, st.method),
        ...flagRows));
  });

  return card('Detector-coverage report', {
    sub: 'For every planted red-flag: caught ✓ by which real FRIS detector, or the gap ✗ where the typology slipped through',
    actions: el('span', { class: 'badge sq neutral' }, 'Explainable'),
  },
    el('div', { class: 'small muted', style: { marginBottom: '10px' } }, 'Each stage plants specific red-flags. The Studio runs the REAL detectors over the generated artefacts and reconciles every red-flag to a catch (green) or a gap (amber = an inherent, well-documented blind spot such as integration; red = a detector that should have fired but did not for this configuration).'),
    ...stagePanels);
}

// The detector directory: every FRIS detector the Studio can validate + whether it
// fired here, with its firing detail and a link to its module.
function detectorDirectoryCard(r) {
  const rows = r.detectors.map((d) => el('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)' }, title: d.blurb },
    el('span', { class: 'badge ' + (d.fired ? 'low' : 'neutral'), style: d.fired ? { color: COV_COLOR.Strong, borderColor: hexToRgba(COV_COLOR.Strong, 0.5), background: hexToRgba(COV_COLOR.Strong, 0.14) } : null, title: d.fired ? 'Fired on this scenario' : 'Not exercised by this scenario' },
      el('span', { class: 'dot' }), d.fired ? `Fired ·${d.count}` : 'Idle'),
    d.route ? el('a', { href: d.route, style: { color: 'var(--text)', fontWeight: '600', textDecoration: 'none', flex: '1 1 220px', minWidth: '0' }, title: 'Open ' + d.module }, d.label) : el('span', { style: { fontWeight: '600', flex: '1 1 220px' } }, d.label),
    el('span', { class: 'small muted', style: { flex: '2 1 260px', minWidth: '0' } }, d.detail)));
  return card('Detectors exercised', {
    sub: 'Every real FRIS detector the Studio ran over the generated artefacts, and whether it fired',
    actions: el('span', { class: 'badge sq neutral' }, `${r.detectors.filter((d) => d.fired).length}/${r.detectors.length} fired`),
  }, ...rows);
}

// ── Small shared UI helpers (guarded; no DOM geometry / matchMedia dependence) ─

// A hand-built circular-ish score dial rendered as a labelled bar (no SVG geometry).
function scoreDial(score, band, color) {
  return el('div', { class: 'card', style: { flex: '1 1 200px', padding: '10px 12px' }, title: 'Overall detector-coverage score' },
    el('div', { class: 'small muted' }, 'Coverage score'),
    el('div', { class: 'row', style: { gap: '10px', alignItems: 'baseline' } },
      el('div', { class: 'tabular', style: { fontWeight: '800', fontSize: '28px', color } }, `${score}%`),
      el('div', { class: 'small', style: { color } }, band)),
    el('div', { style: { marginTop: '4px' } }, hbar(score, color)));
}
// A hand-built horizontal proportional bar (colour + width). DOM-light, e2e-safe.
function hbar(pct, color) {
  const w = Math.max(0, Math.min(100, Number(pct) || 0));
  return el('div', { style: { position: 'relative', height: '9px', background: 'var(--surface-2, #131924)', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border)' } },
    el('span', { style: { position: 'absolute', left: '0', top: '0', bottom: '0', width: w + '%', background: color || ACCENT, borderRadius: '6px' } }));
}
// A small per-stage coverage chip (colour + %).
function coverageChip(pct) {
  const c = pct >= 80 ? COV_COLOR.Strong : pct >= 50 ? COV_COLOR.Partial : pct >= 30 ? COV_COLOR.Weak : COV_COLOR.Minimal;
  return el('span', { class: 'badge sq neutral', style: { color: c, fontSize: '10px' }, title: 'Share of this stage’s red-flags that were caught' }, `${Number(pct) || 0}% caught`);
}
// An amount pill (label + value, optional colour).
function amountPill(label, value, color) {
  return el('span', { class: 'small', style: { display: 'inline-flex', gap: '5px', alignItems: 'baseline' } },
    el('span', { class: 'muted' }, label), el('span', { class: 'tabular', style: { fontWeight: '700', color: color || 'var(--text)' } }, value == null ? '—' : fmt.num(value)));
}
function kpiChip(label, value, colour, title) {
  return el('div', { class: 'card', style: { flex: '1 1 120px', padding: '10px 12px' }, title: title || '' },
    el('div', { class: 'small muted' }, label),
    el('div', { class: 'tabular', style: { fontWeight: '800', fontSize: '20px', color: colour || 'var(--text)' } }, String(value)));
}
function disclaimerNote(text) {
  return el('div', { class: 'intro', style: { marginTop: '18px' } }, el('span', { class: 'ico' }, icon('info', 18)), el('div', { class: 't' }, el('b', {}, 'Training / simulation sandbox — synthetic; not operational advice. '), text));
}
function phaseLabel(code) { return ({ placement: 'Placement', layering: 'Layering', integration: 'Integration' })[code] || code; }
// Pure hex→rgba (guarded; no DOM/canvas dependency, e2e-safe).
function hexToRgba(hex, alpha) {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6) return `rgba(199,125,255,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
