// @ts-check
/**
 * Quarterly Financial Report — deterministic SYNTHETIC quarterly financials for
 * a clearly-fictional demo company ("Aethergrid Systems plc").
 *
 * The data layer the financials engine (`engines/financials.mjs`) derives the
 * P&L summary, cash-flow waterfall, revenue-by-segment, YoY comparison and
 * expense breakdown from. Deliberately structured like `watchlists.mjs` /
 * `complianceKB.mjs`: a static, framework-free, pure data module importable by
 * both the Node server and the browser build, with ZERO DB dependency (no seed,
 * no schema, no data.json regeneration risk).
 *
 * ── DATA-HONESTY POSTURE (read this) ─────────────────────────────────────────
 * Every figure below is FICTIONAL and generated deterministically for
 * demonstration. "Aethergrid Systems plc", its segments, customers and results
 * are invented; nothing here refers to a real company, a real financial period
 * or a real filed statement. Currency is a notional USD (thousands). This is NOT
 * a set of accounts, an audited statement, or any kind of financial system of
 * record — it is a deterministic demonstration of financial-reporting mechanics
 * (a P&L that reconciles, a cash-flow bridge that ties out, a YoY comparison)
 * over invented numbers.
 *
 * ── Determinism & internal consistency ───────────────────────────────────────
 * All figures are integers in MINOR units (USD thousands are the reporting unit;
 * we hold them as whole thousands, so every amount is an exact integer — no
 * floating-point drift). The eight quarters are built from a base quarter grown
 * by fixed per-quarter/per-segment factors, so:
 *   • segment revenues SUM EXACTLY to total revenue,
 *   • operating-expense categories SUM EXACTLY to total operating expenses,
 *   • the cash-flow bridge (opening + operating − investing ± financing ± FX)
 *     EQUALS the closing cash of that quarter AND the opening cash of the next.
 * The engine re-checks these reconciliations; the unit tests assert them.
 *
 * All records carry `data_classification: 'synthetic-demo'`.
 */

/* eslint-disable max-len */

// ── Company identity (fictional) ─────────────────────────────────────────────
export const COMPANY = Object.freeze({
  name: 'Aethergrid Systems plc',
  ticker: 'AEGS',
  sector: 'Enterprise infrastructure software',
  currency: 'USD',
  unit: 'thousands',
  unitLabel: 'USD 000s',
  fiscalNote: 'Fiscal year ends 31 December. Figures are unaudited management accounts.',
  data_classification: 'synthetic-demo',
});

// ── Reporting unit ────────────────────────────────────────────────────────────
// The whole module works in USD thousands held as integers. A helper the engine
// and UI share turns a thousands-integer into a display string.
export const UNIT_MINOR_PER_MAJOR = 1000; // 1 reported unit (000s) = 1000 USD

// ── Business segments (3–5) ──────────────────────────────────────────────────
// Each segment has a base quarterly revenue (in USD 000s) for the earliest
// quarter and a fixed compounding growth factor applied each subsequent quarter.
// Growth factors differ so the revenue MIX shifts over time (realistic).
export const SEGMENTS = Object.freeze([
  { id: 'platform', label: 'Cloud Platform', blurb: 'Core multi-tenant infrastructure subscriptions.', base: 41200, growth: 1.052, color: '#4d8df0' },
  { id: 'data', label: 'Data & Analytics', blurb: 'Managed analytics, warehousing and streaming add-ons.', base: 22800, growth: 1.074, color: '#37c2b4' },
  { id: 'security', label: 'Security Suite', blurb: 'Zero-trust access, posture management and threat monitoring.', base: 15600, growth: 1.061, color: '#a97bf0' },
  { id: 'services', label: 'Professional Services', blurb: 'Implementation, migration and success engineering.', base: 9400, growth: 1.028, color: '#e5a53b' },
  { id: 'hardware', label: 'Edge Appliances', blurb: 'On-premise edge gateways and support contracts.', base: 6100, growth: 1.014, color: '#7d8aa0' },
]);

// ── Operating-expense categories ─────────────────────────────────────────────
// Each is modelled as a fixed fraction of that quarter's TOTAL REVENUE, rounded
// to whole thousands. A rounding residual is absorbed into G&A so the categories
// sum EXACTLY to total operating expenses (which is itself the sum of the parts).
export const OPEX_CATEGORIES = Object.freeze([
  { id: 'sales_marketing', label: 'Sales & Marketing', pctOfRevenue: 0.187, color: '#4d8df0' },
  { id: 'research_dev', label: 'Research & Development', pctOfRevenue: 0.152, color: '#37c2b4' },
  { id: 'general_admin', label: 'General & Administrative', pctOfRevenue: 0.061, color: '#a97bf0' },
  { id: 'facilities', label: 'Facilities', pctOfRevenue: 0.028, color: '#e5a53b' },
  { id: 'it_ops', label: 'IT & Operations', pctOfRevenue: 0.037, color: '#f0616d' },
]);

// COGS as a fraction of revenue (gives ~72% gross margin, plausible for infra
// software with a hardware/services drag).
const COGS_PCT_OF_REVENUE = 0.281;
// Below-the-line, modelled as fractions of revenue.
const DEPRECIATION_PCT = 0.043; // D&A (added back for EBITDA)
const INTEREST_PCT = 0.011;     // net interest expense
const TAX_RATE = 0.21;          // applied to pre-tax income (floored at 0)

// ── Quarter labels (8 quarters, oldest→newest) ───────────────────────────────
// Two fiscal years so a YoY comparison (same quarter, prior year) is available
// for the four most-recent quarters.
export const QUARTERS = Object.freeze([
  'FY2024 Q1', 'FY2024 Q2', 'FY2024 Q3', 'FY2024 Q4',
  'FY2025 Q1', 'FY2025 Q2', 'FY2025 Q3', 'FY2025 Q4',
]);

// Headcount at quarter end (modelled; grows with the business). Deterministic.
const HEADCOUNT_BASE = 1180;
const HEADCOUNT_STEP = [0, 34, 41, 29, 52, 47, 55, 38]; // net adds per quarter

// ── FX & financing scripting (deterministic per-quarter cash-flow inputs) ─────
// These drive the cash-flow bridge. Capex and financing are modelled directly
// (not as % of revenue) to read like a real cash-flow statement; FX is a small
// translation swing that alternates sign.
const CAPEX_BASE = 7300;        // investing outflow (property, equipment, capitalised dev)
const CAPEX_STEP = 260;         // grows modestly each quarter
const FINANCING = [ -1800, -1800, -1800, 9200, -2100, -2100, -2100, -2100 ]; // debt draw in FY24 Q4, otherwise dividends/repayments (outflow)
const FX = [ 210, -140, 90, -260, 180, -110, 70, -190 ]; // translation swing (thousands)
const OPENING_CASH_Q1 = 58400; // opening cash for the very first modelled quarter

/**
 * Round to a whole thousand (integer reporting unit). Deterministic and total.
 * @param {number} n @returns {number}
 */
function r0(n) { return Math.round(n); }

/**
 * Build the full, internally-consistent synthetic dataset once (memoised). Every
 * quarter is an object with segment revenues, a reconciled P&L, and the raw
 * cash-flow bridge inputs + a reconciled closing cash that chains to the next
 * quarter's opening. Pure; deterministic; no Date.now / randomness.
 *
 * @returns {{ company: typeof COMPANY, quarters: Array<object> }}
 */
function build() {
  const quarters = [];
  let openingCash = OPENING_CASH_Q1;

  for (let qi = 0; qi < QUARTERS.length; qi++) {
    // ── Revenue by segment (base × growth^qi), whole thousands ───────────────
    const segments = SEGMENTS.map((s) => ({
      id: s.id,
      label: s.label,
      blurb: s.blurb,
      color: s.color,
      revenue: r0(s.base * Math.pow(s.growth, qi)),
    }));
    const revenue = segments.reduce((a, s) => a + s.revenue, 0); // EXACT sum

    // ── COGS → gross profit ──────────────────────────────────────────────────
    const cogs = r0(revenue * COGS_PCT_OF_REVENUE);
    const grossProfit = revenue - cogs;

    // ── Operating expenses by category (fraction of revenue) ─────────────────
    // Compute every category, then force them to sum EXACTLY to their own total
    // by absorbing the rounding residual into General & Administrative.
    const opexRaw = OPEX_CATEGORIES.map((c) => ({ id: c.id, label: c.label, color: c.color, amount: r0(revenue * c.pctOfRevenue) }));
    const opexSum = opexRaw.reduce((a, c) => a + c.amount, 0);
    // (No external target to hit — total opex IS the sum of parts, so it is exact
    // by construction. We keep the residual-absorb pattern anyway for clarity and
    // to guarantee category-sum === reported total even if a target is added.)
    const totalOpex = opexSum;
    const opex = opexRaw; // already exact

    // ── D&A, EBITDA, EBIT ────────────────────────────────────────────────────
    const depreciation = r0(revenue * DEPRECIATION_PCT);
    const operatingIncome = grossProfit - totalOpex; // EBIT-before-D&A-adjustment view
    // EBIT = operating income after D&A is already embedded in opex? We model D&A
    // as a SEPARATE line below operating expenses so EBITDA = EBIT + D&A cleanly.
    const ebit = operatingIncome - depreciation;
    const ebitda = ebit + depreciation; // === operatingIncome, by construction

    // ── Interest, pre-tax, tax, net income ───────────────────────────────────
    const interest = r0(revenue * INTEREST_PCT);
    const pretaxIncome = ebit - interest;
    const tax = r0(Math.max(0, pretaxIncome) * TAX_RATE);
    const netIncome = pretaxIncome - tax;

    // ── Headcount (cumulative net adds) ──────────────────────────────────────
    let headcount = HEADCOUNT_BASE;
    for (let k = 0; k <= qi; k++) headcount += HEADCOUNT_STEP[k] || 0;

    // ── Cash-flow bridge inputs ──────────────────────────────────────────────
    // Operating cash flow is modelled as net income + D&A (non-cash add-back)
    // plus a small deterministic working-capital swing, so it reads like a real
    // indirect-method OCF and stays internally tied to the P&L.
    const workingCapitalSwing = qi % 2 === 0 ? r0(revenue * 0.012) : -r0(revenue * 0.008);
    const operatingCF = netIncome + depreciation + workingCapitalSwing;
    const investingCF = -(CAPEX_BASE + CAPEX_STEP * qi); // outflow (negative)
    const financingCF = FINANCING[qi];
    const fx = FX[qi];
    const closingCash = openingCash + operatingCF + investingCF + financingCF + fx; // EXACT bridge

    quarters.push({
      quarter: QUARTERS[qi],
      index: qi,
      revenue,
      segments,
      cogs,
      grossProfit,
      opex,
      totalOpex,
      depreciation,
      operatingIncome,
      ebitda,
      ebit,
      interest,
      pretaxIncome,
      taxRate: TAX_RATE,
      tax,
      netIncome,
      headcount,
      cashflow: {
        openingCash,
        operatingCF,
        investingCF,
        financingCF,
        fx,
        closingCash,
        // Expose the working-capital component for transparency in the UI.
        workingCapitalSwing,
        capex: investingCF, // alias (all investing here is capex)
      },
      data_classification: 'synthetic-demo',
    });

    openingCash = closingCash; // chain to next quarter's opening
  }

  return { company: COMPANY, quarters };
}

let _cache = null;
/** Memoised accessor for the full dataset (deterministic, built once). */
export function getFinancials() {
  if (!_cache) _cache = build();
  return _cache;
}

/** The disclaimer every financials API response / view carries. */
export const FINANCIALS_DISCLAIMER =
  'Synthetic demonstration financials for the fictional "Aethergrid Systems plc". Every figure is invented and generated deterministically; nothing here refers to a real company, period or filed statement. This is NOT a set of accounts, an audited statement, or a financial system of record.';

// A stable version stamp (bump if the model changes) so the UI can display it.
export const FINANCIALS_VERSION = Object.freeze({
  version: '1.0.0',
  quarters: QUARTERS.length,
  segments: SEGMENTS.length,
  opexCategories: OPEX_CATEGORIES.length,
});
