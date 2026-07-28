// @ts-check
/**
 * Quarterly Financial Report — deterministic, dependency-free reporting engine.
 *
 * Consumes the synthetic quarterly dataset in `../data/financials.mjs` and
 * derives, for a chosen quarter, the five report components a corporate
 * quarterly-financials dashboard needs:
 *
 *   1. P&L summary        — revenue → gross profit → EBITDA → EBIT → pre-tax →
 *                            net income, each with its margin %.
 *   2. Cash-flow waterfall — a signed bridge: opening cash → +operating →
 *                            −investing → ±financing → ±FX → closing cash. Each
 *                            step is a {label, delta, running, kind} record, and
 *                            the last running total EQUALS the reported closing.
 *   3. Revenue by segment  — every business segment with its revenue and % share
 *                            (shares sum to 100.0 after a largest-remainder tidy).
 *   4. YoY comparison      — this quarter vs the SAME quarter one year earlier
 *                            (revenue, gross margin, EBIT, net income, headcount),
 *                            with absolute + percentage deltas. Null when there is
 *                            no prior-year quarter (the first four quarters).
 *   5. Expense breakdown   — COGS + each operating-expense category + D&A, each
 *                            with its % of revenue, plus the totals.
 *
 * ── Determinism ──────────────────────────────────────────────────────────────
 * Same quarter → same report, byte-for-byte. Pure integer arithmetic over the
 * data module (which holds whole-thousand integers), stable ordering everywhere,
 * no Date.now(), no randomness, no network, no dependencies.
 *
 * ── Currency-exactness ───────────────────────────────────────────────────────
 * Money is carried as INTEGER thousands (the data module's reporting unit), so
 * additions/subtractions are exact. Margin/share PERCENTAGES are the only
 * derived floats; they are rounded to one decimal for display but the underlying
 * bridge and sums use integers only, so the waterfall ties out to the penny.
 *
 * ── Honesty ──────────────────────────────────────────────────────────────────
 * The company and every figure are SYNTHETIC (see financials.mjs). This engine
 * demonstrates financial-reporting mechanics; it is NOT a set of accounts.
 */

import {
  COMPANY, SEGMENTS, OPEX_CATEGORIES, QUARTERS, getFinancials,
  FINANCIALS_DISCLAIMER, FINANCIALS_VERSION, UNIT_MINOR_PER_MAJOR,
} from '../data/financials.mjs';

// ── Small pure helpers ───────────────────────────────────────────────────────

/** Margin % of `part` over `whole` in [−∞,∞], one decimal, null when whole==0. */
function marginPct(part, whole) {
  if (!whole) return null;
  return round1((part / whole) * 100);
}
/** Round to one decimal deterministically. */
function round1(n) { return Math.round(n * 10) / 10; }
/** Percentage change of `cur` vs `prev`, one decimal, null when prev==0. */
function pctChange(cur, prev) {
  if (prev === 0 || prev == null) return null;
  return round1(((cur - prev) / Math.abs(prev)) * 100);
}

/**
 * Distribute a set of raw percentages to sum to EXACTLY 100.0 (one decimal)
 * using the largest-remainder method on tenths — so segment shares always add
 * up on screen. Deterministic. Input/output are arrays of numbers aligned by
 * index. `values` are the underlying integer magnitudes used for the shares.
 * @param {number[]} values @returns {number[]} shares in whole tenths of a %
 */
function sharesToTenths(values) {
  const total = values.reduce((a, v) => a + v, 0);
  if (total <= 0) return values.map(() => 0);
  const exact = values.map((v) => (v / total) * 1000); // tenths of a percent
  const floor = exact.map((x) => Math.floor(x));
  let remainder = 1000 - floor.reduce((a, x) => a + x, 0);
  // Rank indices by largest fractional part; break ties by larger value then
  // lower index for a fully stable distribution.
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x), val: values[i] }))
    .sort((a, b) => (b.frac - a.frac) || (b.val - a.val) || (a.i - b.i));
  const out = floor.slice();
  for (let k = 0; k < order.length && remainder > 0; k++) { out[order[k].i] += 1; remainder--; }
  return out; // tenths of a percent, summing to exactly 1000
}

// ── Public: list the available quarters (newest first) ───────────────────────
/**
 * @returns {{ company:object, quarters:Array<{quarter:string,index:number,hasYoY:boolean}>, latest:string, disclaimer:string, version:object }}
 */
export function listQuarters() {
  const { quarters } = getFinancials();
  const rows = quarters
    .map((q) => ({ quarter: q.quarter, index: q.index, hasYoY: q.index >= 4, revenue: q.revenue, netIncome: q.netIncome }))
    .slice()
    .sort((a, b) => b.index - a.index); // newest first
  return {
    company: publicCompany(),
    quarters: rows,
    latest: rows.length ? rows[0].quarter : null,
    disclaimer: FINANCIALS_DISCLAIMER,
    version: FINANCIALS_VERSION,
  };
}

/** A safe, public projection of the company identity. */
function publicCompany() {
  return {
    name: COMPANY.name, ticker: COMPANY.ticker, sector: COMPANY.sector,
    currency: COMPANY.currency, unit: COMPANY.unit, unitLabel: COMPANY.unitLabel,
    fiscalNote: COMPANY.fiscalNote, data_classification: COMPANY.data_classification,
  };
}

// ── Public: the full computed report for one quarter ─────────────────────────
/**
 * Compute the full quarterly report for `quarter` (defaults to the latest).
 * Throws if the quarter is unknown.
 * @param {string} [quarter]
 * @returns {object}
 */
export function computeReport(quarter) {
  const { quarters } = getFinancials();
  const q = quarter
    ? quarters.find((x) => x.quarter === quarter)
    : quarters[quarters.length - 1];
  if (!q) throw new Error(`unknown quarter: ${quarter}`);
  const prior = quarters.find((x) => x.index === q.index - 4) || null; // same quarter, prior year

  return {
    company: publicCompany(),
    quarter: q.quarter,
    index: q.index,
    pnl: buildPnl(q),
    cashflowWaterfall: buildWaterfall(q),
    segments: buildSegments(q),
    yoy: buildYoY(q, prior),
    expenses: buildExpenses(q),
    reconciliation: buildReconciliation(q),
    disclaimer: FINANCIALS_DISCLAIMER,
    version: FINANCIALS_VERSION,
  };
}

// ── 1. P&L summary ────────────────────────────────────────────────────────────
/**
 * A clean statement ladder with margins. All amounts are integer thousands.
 * @param {object} q
 */
function buildPnl(q) {
  const lines = [
    { id: 'revenue', label: 'Revenue', amount: q.revenue, margin: marginPct(q.revenue, q.revenue), kind: 'total', emphasis: true },
    { id: 'cogs', label: 'Cost of goods sold', amount: -q.cogs, margin: marginPct(-q.cogs, q.revenue), kind: 'cost' },
    { id: 'gross_profit', label: 'Gross profit', amount: q.grossProfit, margin: marginPct(q.grossProfit, q.revenue), kind: 'subtotal', emphasis: true },
    { id: 'opex', label: 'Operating expenses', amount: -q.totalOpex, margin: marginPct(-q.totalOpex, q.revenue), kind: 'cost' },
    { id: 'ebitda', label: 'EBITDA', amount: q.ebitda, margin: marginPct(q.ebitda, q.revenue), kind: 'subtotal', emphasis: true },
    { id: 'depreciation', label: 'Depreciation & amortisation', amount: -q.depreciation, margin: marginPct(-q.depreciation, q.revenue), kind: 'cost' },
    { id: 'ebit', label: 'EBIT (operating income)', amount: q.ebit, margin: marginPct(q.ebit, q.revenue), kind: 'subtotal', emphasis: true },
    { id: 'interest', label: 'Net interest expense', amount: -q.interest, margin: marginPct(-q.interest, q.revenue), kind: 'cost' },
    { id: 'pretax', label: 'Pre-tax income', amount: q.pretaxIncome, margin: marginPct(q.pretaxIncome, q.revenue), kind: 'subtotal' },
    { id: 'tax', label: `Income tax (${round1(q.taxRate * 100)}%)`, amount: -q.tax, margin: marginPct(-q.tax, q.revenue), kind: 'cost' },
    { id: 'net_income', label: 'Net income', amount: q.netIncome, margin: marginPct(q.netIncome, q.revenue), kind: 'total', emphasis: true },
  ];
  const kpis = [
    { id: 'revenue', label: 'Revenue', amount: q.revenue, margin: null },
    { id: 'gross_margin', label: 'Gross margin', amount: q.grossProfit, margin: marginPct(q.grossProfit, q.revenue) },
    { id: 'ebitda_margin', label: 'EBITDA margin', amount: q.ebitda, margin: marginPct(q.ebitda, q.revenue) },
    { id: 'net_margin', label: 'Net margin', amount: q.netIncome, margin: marginPct(q.netIncome, q.revenue) },
  ];
  return {
    lines,
    kpis,
    totals: {
      revenue: q.revenue, grossProfit: q.grossProfit, ebitda: q.ebitda,
      ebit: q.ebit, pretaxIncome: q.pretaxIncome, netIncome: q.netIncome,
      grossMargin: marginPct(q.grossProfit, q.revenue),
      ebitdaMargin: marginPct(q.ebitda, q.revenue),
      ebitMargin: marginPct(q.ebit, q.revenue),
      netMargin: marginPct(q.netIncome, q.revenue),
    },
  };
}

// ── 2. Cash-flow waterfall ───────────────────────────────────────────────────
/**
 * The signed bridge from opening to closing cash. Each step carries a running
 * total; the FINAL running total equals the reported closing cash exactly
 * (integer arithmetic). Anchors (opening/closing) are `kind:'total'`.
 * @param {object} q
 */
function buildWaterfall(q) {
  const cf = q.cashflow;
  const steps = [];
  let running = cf.openingCash;
  steps.push({ id: 'opening', label: 'Opening cash', delta: cf.openingCash, running, kind: 'total', sign: 0 });

  const bridge = [
    { id: 'operating', label: 'Operating cash flow', delta: cf.operatingCF },
    { id: 'investing', label: 'Investing (capex)', delta: cf.investingCF },
    { id: 'financing', label: 'Financing', delta: cf.financingCF },
    { id: 'fx', label: 'FX translation', delta: cf.fx },
  ];
  for (const b of bridge) {
    running += b.delta;
    steps.push({ id: b.id, label: b.label, delta: b.delta, running, kind: 'delta', sign: Math.sign(b.delta) });
  }
  steps.push({ id: 'closing', label: 'Closing cash', delta: cf.closingCash, running, kind: 'total', sign: 0 });

  // The bridge must tie out exactly — surface it so the UI/tests can assert.
  const bridges = running === cf.closingCash;
  return {
    steps,
    openingCash: cf.openingCash,
    closingCash: cf.closingCash,
    netChange: cf.closingCash - cf.openingCash,
    components: {
      operatingCF: cf.operatingCF, investingCF: cf.investingCF,
      financingCF: cf.financingCF, fx: cf.fx,
      workingCapitalSwing: cf.workingCapitalSwing,
    },
    bridges, // true when opening + Σdeltas === closing
  };
}

// ── 3. Revenue by segment ────────────────────────────────────────────────────
/**
 * Every business segment with revenue and % share (shares sum to exactly 100.0).
 * Sorted by revenue desc, then id asc (stable). Includes the total.
 * @param {object} q
 */
function buildSegments(q) {
  const ordered = q.segments.slice().sort((a, b) => (b.revenue - a.revenue) || String(a.id).localeCompare(String(b.id)));
  const tenths = sharesToTenths(ordered.map((s) => s.revenue));
  const rows = ordered.map((s, i) => ({
    id: s.id, label: s.label, blurb: s.blurb, color: s.color,
    revenue: s.revenue,
    sharePct: tenths[i] / 10, // one decimal, aligned so Σ === 100.0
  }));
  return {
    rows,
    total: q.revenue,
    // Sanity value the tests assert: shares must sum to exactly 100.0.
    shareSum: round1(rows.reduce((a, r) => a + r.sharePct, 0)),
  };
}

// ── 4. YoY comparison ─────────────────────────────────────────────────────────
/**
 * This quarter vs the same quarter one year earlier. Null metrics when there is
 * no prior-year quarter. Deltas are absolute (integer thousands) and %.
 * @param {object} cur @param {object|null} prior
 */
function buildYoY(cur, prior) {
  if (!prior) {
    return { available: false, priorQuarter: null, metrics: [], note: 'No prior-year quarter is modelled for this period.' };
  }
  const grossMarginCur = marginPct(cur.grossProfit, cur.revenue);
  const grossMarginPrev = marginPct(prior.grossProfit, prior.revenue);
  const mk = (id, label, curV, prevV, unit) => ({
    id, label, unit,
    current: curV,
    prior: prevV,
    deltaAbs: unit === 'pct' ? round1(curV - prevV) : (curV - prevV),
    deltaPct: unit === 'pct' ? null : pctChange(curV, prevV),
    direction: (curV - prevV) > 0 ? 'up' : (curV - prevV) < 0 ? 'down' : 'flat',
  });
  const metrics = [
    mk('revenue', 'Revenue', cur.revenue, prior.revenue, 'money'),
    mk('gross_margin', 'Gross margin', grossMarginCur, grossMarginPrev, 'pct'),
    mk('ebit', 'EBIT', cur.ebit, prior.ebit, 'money'),
    mk('net_income', 'Net income', cur.netIncome, prior.netIncome, 'money'),
    mk('headcount', 'Headcount', cur.headcount, prior.headcount, 'count'),
  ];
  return { available: true, priorQuarter: prior.quarter, metrics, note: `Compared with ${prior.quarter} (same quarter, prior year).` };
}

// ── 5. Expense breakdown ─────────────────────────────────────────────────────
/**
 * COGS + each operating-expense category + D&A, each with % of revenue. Rows are
 * ordered by amount desc (stable). Totals expose total operating expenses and
 * total cost (COGS + opex + D&A).
 * @param {object} q
 */
function buildExpenses(q) {
  const opexRows = q.opex.map((c) => ({ id: c.id, label: c.label, color: c.color, amount: c.amount, group: 'opex', pctOfRevenue: marginPct(c.amount, q.revenue) }));
  const rows = [
    { id: 'cogs', label: 'Cost of goods sold', color: '#5b6b82', amount: q.cogs, group: 'cogs', pctOfRevenue: marginPct(q.cogs, q.revenue) },
    ...opexRows,
    { id: 'depreciation', label: 'Depreciation & amortisation', color: '#8a97ad', amount: q.depreciation, group: 'dna', pctOfRevenue: marginPct(q.depreciation, q.revenue) },
  ].sort((a, b) => (b.amount - a.amount) || String(a.id).localeCompare(String(b.id)));
  const totalCost = q.cogs + q.totalOpex + q.depreciation;
  return {
    rows,
    totalOpex: q.totalOpex,
    totalCost,
    revenue: q.revenue,
    opexPctOfRevenue: marginPct(q.totalOpex, q.revenue),
    totalCostPctOfRevenue: marginPct(totalCost, q.revenue),
  };
}

// ── Reconciliation summary (surfaced for the UI + asserted by tests) ─────────
/**
 * A machine-checkable set of reconciliation facts for the quarter. Every flag
 * must be true for a well-formed report.
 * @param {object} q
 */
function buildReconciliation(q) {
  const segSum = q.segments.reduce((a, s) => a + s.revenue, 0);
  const opexSum = q.opex.reduce((a, c) => a + c.amount, 0);
  const cf = q.cashflow;
  return {
    segmentsSumToRevenue: segSum === q.revenue,
    opexCategoriesSumToTotal: opexSum === q.totalOpex,
    grossProfitTiesOut: q.grossProfit === q.revenue - q.cogs,
    ebitdaEqualsOperatingIncome: q.ebitda === q.operatingIncome,
    ebitTiesOut: q.ebit === q.ebitda - q.depreciation,
    netIncomeTiesOut: q.netIncome === q.pretaxIncome - q.tax,
    cashBridgeTiesOut: cf.openingCash + cf.operatingCF + cf.investingCF + cf.financingCF + cf.fx === cf.closingCash,
  };
}

// ── Display helper shared with the UI (thousands-integer → string) ───────────
/**
 * Format an integer thousands amount as a compact accounting string in the
 * reporting unit. Negatives render in parentheses. Deterministic, no locale
 * surprises (fixed grouping). e.g. 41200 → "41,200", -1800 → "(1,800)".
 * @param {number} amountThousands @param {{ paren?:boolean, sign?:boolean }} [opts]
 */
export function formatUnit(amountThousands, opts = {}) {
  const n = Math.round(Number(amountThousands) || 0);
  const abs = Math.abs(n);
  const grouped = String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (n < 0 && opts.paren) return `(${grouped})`;
  if (opts.sign) return (n < 0 ? '−' : n > 0 ? '+' : '') + grouped;
  return (n < 0 ? '−' : '') + grouped;
}

// ── Meta re-exports the routes/UI consume ────────────────────────────────────
export { COMPANY, SEGMENTS, OPEX_CATEGORIES, QUARTERS, FINANCIALS_DISCLAIMER, FINANCIALS_VERSION, UNIT_MINOR_PER_MAJOR };
