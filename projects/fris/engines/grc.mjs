// @ts-check
/**
 * Obligation → Control Register engine — deterministic analytics over the GRC
 * register in `data/grc.mjs`. Turns the real obligation catalogue + its synthetic
 * control posture into a compliance system-of-record view:
 *
 *   · register({framework,status,owner}) — the filterable obligation→control list.
 *   · obligation(id)                     — one obligation's full mapping (the real
 *                                          requirement + citation, its controls with
 *                                          owner / status / last-tested / evidence,
 *                                          the linked real framework, and a small
 *                                          test-history reconstruction).
 *   · postureMatrix()                    — framework (rows) × control-status
 *                                          (columns) grid of control counts, with a
 *                                          coverage % per framework and overall.
 *   · gaps()                             — obligations carrying a Gap / Not-started
 *                                          control or an Overdue test, ranked by
 *                                          severity, with the owner to chase.
 *   · owners()                           — per-owner control workload + open gaps.
 *   · summary()                          — overall coverage %, counts by status.
 *
 * ── Honesty / provenance ─────────────────────────────────────────────────────
 * The obligations + citations are REAL (factual, paraphrased public knowledge). The
 * control posture (status, owner, dates, results, evidence) is SYNTHETIC and every
 * response carries GRC_DISCLAIMER saying so. The engine derives nothing beyond
 * counts / coverage / groupings of the register; it never fabricates an obligation
 * or asserts the synthetic posture is a real organisation's state.
 *
 * ── Determinism ──────────────────────────────────────────────────────────────
 * The register is generated once (fixed-seed PRNG) in the data module; this engine
 * is pure arithmetic over it with stable ordering (a final id tiebreak on every
 * sort). Same register → same output, byte-for-byte. No Date.now(), no randomness,
 * no network, no dependencies.
 */

import {
  OBLIGATIONS, OBLIGATION_BY_ID, GRC_FRAMEWORKS, GRC_FRAMEWORK_BY_CODE,
  CONTROL_STATUSES, CONTROL_STATUS_BY_CODE, TEST_RESULTS, TEST_RESULT_BY_CODE,
  CONTROL_TYPES, CONTROL_TYPE_BY_CODE, GRC_AS_OF, GRC_DISCLAIMER, GRC_VERSION,
  daysBetween,
} from '../data/grc.mjs';

// ── Small pure helpers ────────────────────────────────────────────────────────
const statusRecord = (code) => CONTROL_STATUS_BY_CODE[code] || { code, label: code, color: '#5b6b82', rank: 9, coverageWeight: 0, blurb: '' };
const resultRecord = (code) => TEST_RESULT_BY_CODE[code] || { code, label: code, color: '#5b6b82', blurb: '' };
const typeRecord = (code) => CONTROL_TYPE_BY_CODE[code] || { code, label: code, blurb: '' };

// The list of every distinct owner across the register (stable, sorted).
function allOwners() {
  const set = new Set();
  for (const o of OBLIGATIONS) for (const c of o.controls) set.add(c.owner);
  return [...set].sort((a, b) => a.localeCompare(b));
}

// Shape one control into the API/UI row (copies arrays; adds derived labels + the
// age of the last test in days relative to GRC_AS_OF). Pure; never mutates source.
function shapeControl(c) {
  const st = statusRecord(c.status);
  const tr = resultRecord(c.testResult);
  const ty = typeRecord(c.type);
  return {
    id: c.id,
    title: c.title,
    owner: c.owner,
    type: c.type,
    typeLabel: ty.label,
    status: c.status,
    statusLabel: st.label,
    statusColor: st.color,
    statusRank: st.rank,
    coverageWeight: st.coverageWeight,
    lastTested: c.lastTested,
    testAgeDays: c.lastTested ? daysBetween(GRC_AS_OF, c.lastTested) : null,
    testResult: c.testResult,
    testResultLabel: tr.label,
    testResultColor: tr.color,
    evidence: c.evidence.map((e) => ({ ref: e.ref, label: e.label })),
    evidenceCount: c.evidence.length,
    // Honest flags the UI/gap logic use.
    isOpenGap: c.status === 'Gap' || c.status === 'Not-started',
    isOverdue: c.testResult === 'Overdue',
    isFail: c.testResult === 'Fail',
  };
}

// The obligation's headline status = its WORST control status (highest rank), so a
// single gap is not hidden behind an implemented sibling control. Also derives the
// obligation's coverage fraction as the mean of its controls' coverage weights.
function obligationRollup(controls) {
  const worst = controls.reduce((m, c) => (c.statusRank > m.statusRank ? c : m), controls[0]);
  const coverage = controls.reduce((a, c) => a + c.coverageWeight, 0) / controls.length;
  const anyOverdue = controls.some((c) => c.isOverdue);
  const anyFail = controls.some((c) => c.isFail);
  const openGaps = controls.filter((c) => c.isOpenGap).length;
  return { headlineStatus: worst.status, coverage, anyOverdue, anyFail, openGaps };
}

// Shape one obligation (with its controls + rollup) into the register row.
function shapeObligation(o) {
  const controls = o.controls.map(shapeControl);
  const roll = obligationRollup(controls);
  return {
    id: o.id,
    frameworkCode: o.frameworkCode,
    frameworkShort: o.framework.short,
    frameworkName: o.framework.name,
    authority: o.framework.authority,
    citation: o.citation,
    category: o.category,
    title: o.title,
    requirement: o.requirement,
    jurisdictions: o.jurisdictions.slice(),
    kbObligationId: o.kbObligationId || null,
    source: o.framework.source,
    controls,
    controlCount: controls.length,
    headlineStatus: roll.headlineStatus,
    headlineStatusLabel: statusRecord(roll.headlineStatus).label,
    headlineStatusColor: statusRecord(roll.headlineStatus).color,
    coverage: roll.coverage,
    coveragePct: Math.round(roll.coverage * 100),
    openGaps: roll.openGaps,
    anyOverdue: roll.anyOverdue,
    anyFail: roll.anyFail,
  };
}

// The framework catalogue projection the UI renders (real frameworks).
function frameworkCatalogue() {
  return GRC_FRAMEWORKS.map((f) => ({ code: f.code, short: f.short, name: f.name, authority: f.authority, kind: f.kind, source: f.source }));
}
// The status + result + type vocabularies (colour always paired with a label).
function vocab() {
  return {
    statuses: CONTROL_STATUSES.map((s) => ({ code: s.code, label: s.label, color: s.color, rank: s.rank, coverageWeight: s.coverageWeight, blurb: s.blurb })),
    testResults: TEST_RESULTS.map((r) => ({ code: r.code, label: r.label, color: r.color, blurb: r.blurb })),
    controlTypes: CONTROL_TYPES.map((t) => ({ code: t.code, label: t.label, blurb: t.blurb })),
  };
}

// ── Public: the filterable obligation→control register ────────────────────────
/**
 * @param {{ framework?:string, status?:string, owner?:string, q?:string }} [opts]
 *   status filters on the obligation's HEADLINE (worst) status.
 * @returns {object}
 */
export function register(opts = {}) {
  const f = opts || {};
  let rows = OBLIGATIONS.map(shapeObligation);

  if (f.framework) rows = rows.filter((r) => r.frameworkCode === f.framework);
  if (f.status) rows = rows.filter((r) => r.headlineStatus === f.status);
  if (f.owner) rows = rows.filter((r) => r.controls.some((c) => c.owner === f.owner));
  if (f.q) {
    const q = String(f.q).toLowerCase();
    rows = rows.filter((r) => `${r.title} ${r.requirement} ${r.citation} ${r.frameworkName} ${r.category} ${r.controls.map((c) => c.owner).join(' ')}`.toLowerCase().includes(q));
  }

  // Stable order: framework catalogue order, then obligation id.
  const fwOrder = new Map(GRC_FRAMEWORKS.map((x, i) => [x.code, i]));
  rows.sort((a, b) => (fwOrder.get(a.frameworkCode) - fwOrder.get(b.frameworkCode)) || String(a.id).localeCompare(String(b.id)));

  const total = OBLIGATIONS.length;
  return {
    obligations: rows,
    total,
    count: rows.length,
    filter: { framework: f.framework || null, status: f.status || null, owner: f.owner || null, q: f.q || null },
    frameworks: frameworkCatalogue(),
    owners: allOwners(),
    ...vocab(),
    asOf: GRC_AS_OF,
    disclaimer: GRC_DISCLAIMER,
    version: GRC_VERSION,
  };
}

// ── Public: one obligation + its full mapping (incl. a test-history view) ─────
/**
 * @param {string} id
 * @returns {object|null}  null when the id is unknown.
 */
export function obligation(id) {
  const raw = OBLIGATION_BY_ID[id];
  if (!raw) return null;
  const shaped = shapeObligation(raw);
  // A small, honest "test history" per control: the register carries one authored
  // last-test result; we present it as the latest entry plus a derived "next due"
  // (12 months after the last test) so the detail view has a timeline without
  // fabricating extra fake test rows. Not-started controls have no history.
  const controls = shaped.controls.map((c) => {
    const history = [];
    if (c.lastTested) {
      history.push({ date: c.lastTested, result: c.testResult, note: c.testResult === 'Pass' ? 'Control test passed.' : c.testResult === 'Fail' ? 'Control test failed — remediation required.' : 'Control test overdue — outside its 12-month cycle.' });
    }
    const nextDue = c.lastTested ? isoPlusDays(c.lastTested, 365) : null;
    return { ...c, history, nextDue, overdueAgainstAsOf: nextDue ? daysBetween(GRC_AS_OF, nextDue) > 0 : true };
  });
  return {
    obligation: { ...shaped, controls },
    framework: GRC_FRAMEWORK_BY_CODE[raw.frameworkCode],
    ...vocab(),
    asOf: GRC_AS_OF,
    disclaimer: GRC_DISCLAIMER,
    version: GRC_VERSION,
  };
}
// Add `days` to an ISO date (pure UTC), used for the derived "next test due" date.
function isoPlusDays(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d) + days * 86400000);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

// ── Public: framework × control-status posture matrix + coverage % ────────────
// Rows = the real frameworks (that carry ≥1 obligation), columns = the fixed
// control-status vocabulary. Each cell is the COUNT of controls in that framework
// with that status. Coverage % per framework = sum(control coverageWeight) /
// control count. The overall coverage is the same over ALL controls. The counts in
// each row sum to that framework's control total (a testable invariant).
/**
 * @returns {object}
 */
export function postureMatrix() {
  const statusCodes = CONTROL_STATUSES.map((s) => s.code);
  const shaped = OBLIGATIONS.map(shapeObligation);

  const rows = GRC_FRAMEWORKS.map((fw) => {
    const obls = shaped.filter((o) => o.frameworkCode === fw.code);
    const controls = obls.flatMap((o) => o.controls);
    const cells = statusCodes.map((code) => ({ status: code, count: controls.filter((c) => c.status === code).length }));
    const controlCount = controls.length;
    const weightSum = controls.reduce((a, c) => a + c.coverageWeight, 0);
    const coverage = controlCount ? weightSum / controlCount : 0;
    return {
      framework: fw.code,
      short: fw.short,
      name: fw.name,
      authority: fw.authority,
      source: fw.source,
      obligationCount: obls.length,
      controlCount,
      cells,
      coverage,
      coveragePct: controlCount ? Math.round(coverage * 100) : 0,
      openGaps: controls.filter((c) => c.isOpenGap).length,
    };
  }).filter((r) => r.obligationCount > 0);

  // Column totals (per status, across all frameworks) + the grand control total.
  const colTotals = statusCodes.map((code) => ({ status: code, count: rows.reduce((a, r) => a + (r.cells.find((c) => c.status === code)?.count || 0), 0) }));
  const totalControls = rows.reduce((a, r) => a + r.controlCount, 0);
  const totalWeight = rows.reduce((a, r) => a + r.coverage * r.controlCount, 0);
  const overallCoverage = totalControls ? totalWeight / totalControls : 0;
  const maxCell = Math.max(0, ...rows.flatMap((r) => r.cells.map((c) => c.count)));

  return {
    statuses: CONTROL_STATUSES.map((s) => ({ code: s.code, label: s.label, color: s.color, coverageWeight: s.coverageWeight })),
    rows,
    colTotals,
    totals: {
      frameworks: rows.length,
      obligations: shaped.length,
      controls: totalControls,
      coverage: overallCoverage,
      coveragePct: Math.round(overallCoverage * 100),
      openGaps: rows.reduce((a, r) => a + r.openGaps, 0),
    },
    maxCell,
    asOf: GRC_AS_OF,
    disclaimer: GRC_DISCLAIMER,
    version: GRC_VERSION,
  };
}

// ── Public: gaps / remediation queue (ranked by severity) ─────────────────────
// An obligation is a "gap" if it carries at least one open-gap control (Gap /
// Not-started) OR an Overdue / Failed control test. Ranked worst-first: by a
// severity score built from the headline-status rank, the count of open gaps, and
// whether a test is overdue or failing. Each row carries the owner(s) to chase.
/**
 * @returns {object}
 */
export function gaps() {
  const shaped = OBLIGATIONS.map(shapeObligation);
  const gapRows = shaped.filter((o) => o.openGaps > 0 || o.anyOverdue || o.anyFail).map((o) => {
    // Severity: headline rank dominates (Not-started 3 > Gap 2 > Partial 1),
    // then open-gap count, then overdue, then failing test. Stable, explainable.
    const rank = statusRecord(o.headlineStatus).rank;
    const severity = rank * 100 + o.openGaps * 10 + (o.anyOverdue ? 4 : 0) + (o.anyFail ? 2 : 0);
    // The controls actually driving the gap, and the distinct owners to chase.
    const gapControls = o.controls.filter((c) => c.isOpenGap || c.isOverdue || c.isFail);
    const owners = [...new Set(gapControls.map((c) => c.owner))].sort((a, b) => a.localeCompare(b));
    const reasons = [];
    if (o.controls.some((c) => c.status === 'Not-started')) reasons.push('No control implemented');
    if (o.controls.some((c) => c.status === 'Gap')) reasons.push('Control gap');
    if (o.anyOverdue) reasons.push('Control test overdue');
    if (o.anyFail) reasons.push('Control test failing');
    return {
      id: o.id,
      frameworkCode: o.frameworkCode,
      frameworkShort: o.frameworkShort,
      citation: o.citation,
      title: o.title,
      category: o.category,
      headlineStatus: o.headlineStatus,
      headlineStatusLabel: o.headlineStatusLabel,
      headlineStatusColor: o.headlineStatusColor,
      coveragePct: o.coveragePct,
      openGaps: o.openGaps,
      anyOverdue: o.anyOverdue,
      anyFail: o.anyFail,
      owners,
      reasons,
      severity,
      gapControls: gapControls.map((c) => ({ id: c.id, title: c.title, owner: c.owner, status: c.status, statusColor: c.statusColor, testResult: c.testResult, lastTested: c.lastTested })),
    };
  });
  gapRows.sort((a, b) => (b.severity - a.severity) || String(a.id).localeCompare(String(b.id)));

  const byStatus = CONTROL_STATUSES.map((s) => ({ status: s.code, label: s.label, color: s.color, count: gapRows.filter((g) => g.headlineStatus === s.code).length })).filter((x) => x.count > 0);
  return {
    gaps: gapRows,
    count: gapRows.length,
    totalObligations: shaped.length,
    byStatus,
    asOf: GRC_AS_OF,
    disclaimer: GRC_DISCLAIMER,
    version: GRC_VERSION,
  };
}

// ── Public: per-owner workload + open gaps ────────────────────────────────────
/**
 * @returns {object}
 */
export function owners() {
  const shaped = OBLIGATIONS.map(shapeObligation);
  const map = new Map();
  for (const o of shaped) {
    for (const c of o.controls) {
      const g = map.get(c.owner) || { owner: c.owner, controlCount: 0, obligationIds: new Set(), implemented: 0, partial: 0, gap: 0, notStarted: 0, overdue: 0, failing: 0, weightSum: 0 };
      g.controlCount += 1;
      g.obligationIds.add(o.id);
      g.weightSum += c.coverageWeight;
      if (c.status === 'Implemented') g.implemented += 1;
      else if (c.status === 'Partial') g.partial += 1;
      else if (c.status === 'Gap') g.gap += 1;
      else if (c.status === 'Not-started') g.notStarted += 1;
      if (c.isOverdue) g.overdue += 1;
      if (c.isFail) g.failing += 1;
      map.set(c.owner, g);
    }
  }
  const rows = [...map.values()].map((g) => ({
    owner: g.owner,
    controlCount: g.controlCount,
    obligationCount: g.obligationIds.size,
    implemented: g.implemented,
    partial: g.partial,
    gap: g.gap,
    notStarted: g.notStarted,
    openGaps: g.gap + g.notStarted,
    overdue: g.overdue,
    failing: g.failing,
    coveragePct: g.controlCount ? Math.round((g.weightSum / g.controlCount) * 100) : 0,
  }));
  // Ranked by open gaps desc, then overdue, then control count, then name.
  rows.sort((a, b) => (b.openGaps - a.openGaps) || (b.overdue - a.overdue) || (b.controlCount - a.controlCount) || a.owner.localeCompare(b.owner));
  return {
    owners: rows,
    count: rows.length,
    asOf: GRC_AS_OF,
    disclaimer: GRC_DISCLAIMER,
    version: GRC_VERSION,
  };
}

// ── Public: overall summary (coverage %, counts by status) ────────────────────
/**
 * @returns {object}
 */
export function summary() {
  const shaped = OBLIGATIONS.map(shapeObligation);
  const controls = shaped.flatMap((o) => o.controls);
  const byStatus = CONTROL_STATUSES.map((s) => ({ status: s.code, label: s.label, color: s.color, count: controls.filter((c) => c.status === s.code).length }));
  const byObligationStatus = CONTROL_STATUSES.map((s) => ({ status: s.code, label: s.label, color: s.color, count: shaped.filter((o) => o.headlineStatus === s.code).length }));
  const weightSum = controls.reduce((a, c) => a + c.coverageWeight, 0);
  const coverage = controls.length ? weightSum / controls.length : 0;
  const overdue = controls.filter((c) => c.isOverdue).length;
  const failing = controls.filter((c) => c.isFail).length;
  const openGaps = controls.filter((c) => c.isOpenGap).length;
  const evidenceCount = controls.reduce((a, c) => a + c.evidenceCount, 0);
  return {
    coverage,
    coveragePct: Math.round(coverage * 100),
    obligations: shaped.length,
    controls: controls.length,
    frameworks: GRC_FRAMEWORKS.length,
    openGaps,
    overdue,
    failing,
    evidenceCount,
    byStatus,
    byObligationStatus,
    owners: allOwners().length,
    asOf: GRC_AS_OF,
    disclaimer: GRC_DISCLAIMER,
    version: GRC_VERSION,
  };
}

// ── Meta re-exports the routes / UI consume ───────────────────────────────
export {
  OBLIGATIONS, OBLIGATION_BY_ID, GRC_FRAMEWORKS, GRC_FRAMEWORK_BY_CODE,
  CONTROL_STATUSES, CONTROL_STATUS_BY_CODE, TEST_RESULTS, CONTROL_TYPES,
  GRC_AS_OF, GRC_DISCLAIMER, GRC_VERSION,
};
