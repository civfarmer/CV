// @ts-check
/**
 * Liquidation Waterfall calculation engine (Module 3).
 *
 * Pure, deterministic, currency-aware distribution model built entirely on the
 * BigInt money primitives in ./decimal.mjs. No monetary value is ever a float,
 * and no final figure is hard-coded -- every output is derived from the asset
 * register, creditor register and assumption set.
 *
 * Ladder (default; fully configurable via assumptions.priorityOrder):
 *   Secured (fixed-charge & mortgage) are paid FIRST from their specific
 *   collateral. Their unmet balance ranks alongside the ordinary unsecured pool.
 *   The free estate (unpledged assets + leftover collateral + expected clawback)
 *   is then distributed strictly down the priority ladder -- a lower tier is only
 *   reached once every higher tier is paid in full. Within a class, insufficient
 *   funds are shared pro-rata by admitted claim using the largest-remainder
 *   method so the class distribution reconciles to the penny.
 */
import { applyPercent, applyFx, proRata, sumMinor, nonNeg, formatMinor, fromMinor } from './decimal.mjs';

export const SECURED_COLLATERAL_CLASSES = ['fixed_charge_secured', 'mortgage_secured'];

// Standard insolvency priority. Fixed-charge/mortgage secured are satisfied from
// their collateral BEFORE anything below (handled separately); their shortfall
// then ranks with the unsecured pool. Floating-charge holders rank AFTER the
// preferential creditors (the usual statutory position), i.e. just above ordinary
// unsecured. Everything below unsecured is subordinated / equity.
export const DEFAULT_PRIORITY_ORDER = [
  'insolvency_expenses',
  'administrator_expenses',
  'employee_preferential',
  'pension_preferential',
  'tax_preferential',
  'general_preferential',
  'floating_charge_secured',
  'unsecured',
  'intercompany',
  'subordinated',
  'shareholder',
  'residual',
];

export const CLASS_LABELS = {
  fixed_charge_secured: 'Fixed-charge secured',
  mortgage_secured: 'Mortgage secured',
  floating_charge_secured: 'Floating-charge secured',
  insolvency_expenses: 'Insolvency expenses',
  administrator_expenses: 'Administrator expenses',
  employee_preferential: 'Employee preferential',
  pension_preferential: 'Pension preferential',
  tax_preferential: 'Tax preferential',
  general_preferential: 'General preferential',
  unsecured: 'Unsecured',
  intercompany: 'Intercompany',
  subordinated: 'Subordinated',
  shareholder: 'Shareholder',
  residual: 'Residual (equity)',
};

const CLASS_GROUP = {
  fixed_charge_secured: 'secured',
  mortgage_secured: 'secured',
  floating_charge_secured: 'secured',
  insolvency_expenses: 'expenses',
  administrator_expenses: 'expenses',
  employee_preferential: 'preferential',
  pension_preferential: 'preferential',
  tax_preferential: 'preferential',
  general_preferential: 'preferential',
  unsecured: 'unsecured',
  intercompany: 'subordinated',
  subordinated: 'subordinated',
  shareholder: 'shareholder',
  residual: 'shareholder',
};

/**
 * @param {Object} assumptions
 */
export function normaliseAssumptions(assumptions = {}) {
  return {
    recoveryDelta: numOr(assumptions.recoveryDelta, 0), // +/- pct points on every asset
    enforcementDelta: numOr(assumptions.enforcementDelta, 0),
    admissionDelta: numOr(assumptions.admissionDelta, 0),
    administratorCostPct: clamp(numOr(assumptions.administratorCostPct, 0), 0, 100),
    legalCostMinor: intOr(assumptions.legalCostMinor, 0),
    litigationCostMinor: intOr(assumptions.litigationCostMinor, 0),
    discountRatePct: clamp(numOr(assumptions.discountRatePct, 0), 0, 100),
    disputedTreatment: assumptions.disputedTreatment || 'include', // include | exclude | haircut
    clawback: {
      amountMinor: intOr(assumptions.clawback && assumptions.clawback.amountMinor, 0),
      probabilityPct: clamp(numOr(assumptions.clawback && assumptions.clawback.probabilityPct, 0), 0, 100),
    },
    fxRates: assumptions.fxRates || {}, // { EUR: 0.96, USD: 0.88 } -> case currency
    priorityOrder: Array.isArray(assumptions.priorityOrder) && assumptions.priorityOrder.length ? assumptions.priorityOrder : DEFAULT_PRIORITY_ORDER,
  };
}

/**
 * @param {{currency?:string, assets:any[], creditors:any[]}} caseData
 * @param {Object} [assumptions]
 */
export function computeWaterfall(caseData, assumptions = {}) {
  const A = normaliseAssumptions(assumptions);
  const ccy = caseData.currency || 'CHF';
  const assets = caseData.assets || [];
  const creditors = (caseData.creditors || []).slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const fx = (minor, cur) => (cur && cur !== ccy ? applyFx(BigInt(Math.round(Number(minor))), num(A.fxRates[cur], 1)) : BigInt(Math.round(Number(minor))));
  const admittedOf = (c) => applyPercent(fx(c.claim_minor, c.currency), clamp(num(c.admitted_pct, 100) + A.admissionDelta, 0, 100));

  // 1) Asset realisation ------------------------------------------------------
  let gross = 0n, realisation = 0n, enforcement = 0n, timingWeighted = 0n, timingBase = 0n;
  /** @type {Map<string,bigint>} */
  const assetNet = new Map();
  const assetRows = [];
  for (const a of assets) {
    const g = fx(a.gross_minor, a.currency);
    const recPct = clamp(num(a.recovery_pct, 100) + A.recoveryDelta, 0, 100);
    const r = applyPercent(g, recPct);
    const enfPct = clamp(num(a.enforcement_pct, 0) + A.enforcementDelta, 0, 100);
    const e = applyPercent(r, enfPct);
    let net = nonNeg(r - e);
    if (a.dispute_status === 'Disputed') {
      if (A.disputedTreatment === 'exclude') net = 0n;
      else if (A.disputedTreatment === 'haircut') net = applyPercent(net, 50);
    }
    gross += g;
    realisation += r;
    enforcement += e;
    assetNet.set(a.id, net);
    const months = BigInt(Math.max(0, Math.round(num(a.timing_months, 6))));
    timingWeighted += months * net;
    timingBase += net;
    assetRows.push({ id: a.id, label: a.label, type: a.asset_type, gross: g, realisation: r, enforcement: e, net, recoveryPct: recPct });
  }
  const realisationLosses = nonNeg(gross - realisation);
  // Net realisable value of the WHOLE estate (pledged + unpledged assets).
  const netRealisable = sumMinor([...assetNet.values()]);

  // 2) Secured creditors paid from their specific collateral ------------------
  const pledged = new Set();
  let freeEstate = 0n; // unpledged assets + collateral left over after secured pay-down
  /** @type {Map<string, {admitted:bigint, paid:bigint}>} */
  const creditorPay = new Map();
  const securedRows = [];
  // Residual (post-collateral) claims that cascade into the unsecured pool.
  /** @type {{id:string,name:string,class:string,residual:bigint}[]} */
  const securedShortfallClaims = [];
  for (const c of creditors) {
    if (SECURED_COLLATERAL_CLASSES.includes(c.class) && c.collateral_asset_id) {
      pledged.add(c.collateral_asset_id);
      const assetnet = assetNet.get(c.collateral_asset_id) ?? 0n;
      const cap = c.collateral_minor != null ? fx(c.collateral_minor, c.currency) : assetnet;
      const collateralAvail = min(assetnet, cap);
      const admitted = admittedOf(c);
      const pay = min(admitted, collateralAvail);
      freeEstate += nonNeg(assetnet - pay); // leftover collateral cascades to the free estate
      const residual = nonNeg(admitted - pay); // unmet secured balance -> ranks with unsecured
      creditorPay.set(c.id, { admitted, paid: pay });
      securedRows.push({ id: c.id, name: c.name, class: c.class, admitted, paid: pay, shortfall: residual });
      if (residual > 0n) securedShortfallClaims.push({ id: c.id, name: c.name, class: c.class, residual });
    }
  }
  for (const [id, net] of assetNet) if (!pledged.has(id)) freeEstate += net;

  // 3) Clawback + distributable free estate -----------------------------------
  const expectedClawback = applyPercent(BigInt(A.clawback.amountMinor), A.clawback.probabilityPct);
  const distributable = freeEstate + expectedClawback; // the pool shared down the ladder

  // Injected global costs become demand in administrator_expenses
  const injectedAdmin = applyPercent(realisation, A.administratorCostPct) + BigInt(A.legalCostMinor) + BigInt(A.litigationCostMinor);

  // Group the ladder creditors by class (collateral-secured already handled above).
  // A collateral-secured creditor's UNMET balance re-enters here as an unsecured
  // member so its unsecured dividend is attributed back to that same creditor.
  /** @type {Map<string, any[]>} */
  const byClass = new Map();
  const pushMember = (cls, m) => { if (!byClass.has(cls)) byClass.set(cls, []); byClass.get(cls).push(m); };
  for (const c of creditors) {
    if (SECURED_COLLATERAL_CLASSES.includes(c.class) && c.collateral_asset_id) continue;
    pushMember(c.class, { id: c.id, _admitted: admittedOf(c) });
  }
  for (const s of securedShortfallClaims) pushMember('unsecured', { id: s.id, _admitted: s.residual, _securedResidual: true });

  // 4) Distribute strictly down the ladder ------------------------------------
  // Each tier is only funded once every tier above it is satisfied in full.
  let pool = distributable;
  const ladder = [];
  for (const cls of A.priorityOrder) {
    if (cls === 'residual') continue; // residual = leftover equity, handled after
    const members = byClass.get(cls) || [];
    const memberDemand = sumMinor(members.map((m) => m._admitted));
    let demand = memberDemand;
    if (cls === 'administrator_expenses') demand += injectedAdmin; // injected costs are a class-level demand
    const paid = min(pool, demand);
    pool -= paid;
    // Allocate the itemised part pro-rata by admitted claim (largest-remainder).
    if (members.length && memberDemand > 0n) {
      const memberPaid = demand === 0n ? 0n : (paid * memberDemand) / demand; // itemised share of this tier
      const alloc = proRata(memberPaid, members.map((m) => m._admitted));
      members.forEach((m, i) => {
        const prev = creditorPay.get(m.id) || { admitted: 0n, paid: 0n };
        // A collateral-secured creditor keeps its collateral payment AND its unsecured dividend.
        creditorPay.set(m.id, { admitted: m._securedResidual ? prev.admitted : m._admitted, paid: prev.paid + alloc[i] });
      });
    }
    ladder.push({
      class: cls,
      label: CLASS_LABELS[cls] || cls,
      group: CLASS_GROUP[cls] || 'other',
      demand,
      paid,
      recoveryPct: demand > 0n ? pctOf(paid, demand) : null,
    });
  }
  const surplus = pool; // residual equity returned to shareholders
  ladder.push({ class: 'residual', label: CLASS_LABELS.residual, group: 'shareholder', demand: surplus, paid: surplus, recoveryPct: surplus > 0n ? 100 : null });

  // 5) Per-creditor recovery is the GROUND TRUTH for creditor distributions ----
  const recoveryByCreditor = creditors.map((c) => {
    const p = creditorPay.get(c.id) || { admitted: admittedOf(c), paid: 0n };
    const short = nonNeg(p.admitted - p.paid);
    return {
      id: c.id,
      name: c.name,
      class: c.class,
      classLabel: CLASS_LABELS[c.class] || c.class,
      admitted: fromMinor(p.admitted),
      paid: fromMinor(p.paid),
      shortfall: fromMinor(short),
      admittedMinor: p.admitted.toString(),
      paidMinor: p.paid.toString(),
      shortfallMinor: short.toString(),
      recoveryPct: p.admitted > 0n ? pctOf(p.paid, p.admitted) : 0,
    };
  });

  // 6) Aggregations, derived from the ground truth (every creditor counted once)
  const groupTotal = (g) => sumMinor(ladder.filter((l) => l.group === g).map((l) => l.paid));
  const securedFromCollateralPaid = sumMinor(securedRows.map((r) => r.paid));
  const expensesPaid = groupTotal('expenses');
  const totalClaims = sumMinor(creditors.map((c) => admittedOf(c)));
  const totalDistributedToCreditors = sumMinor(recoveryByCreditor.map((c) => BigInt(c.paidMinor)));
  // Everything that left the estate = collateral pay-downs + the whole free-estate
  // pool consumed (which includes any injected, non-creditor administrator cost).
  const totalDistributed = securedFromCollateralPaid + (distributable - surplus);
  const shortfall = nonNeg(totalClaims - totalDistributedToCreditors);
  const overallRecoveryPct = totalClaims > 0n ? pctOf(totalDistributedToCreditors, totalClaims) : 0;

  const expectedTimingMonths = timingBase > 0n ? Number((timingWeighted * 100n) / timingBase) / 100 : 0;
  const discountFactor = 1 / (1 + (A.discountRatePct / 100) * (expectedTimingMonths / 12));
  const presentValue = BigInt(Math.round(Number(distributable) * discountFactor));

  const flows = buildFlows({ gross, realisationLosses, enforcement, expectedClawback, distributable, securedFromCollateralPaid, ladder, surplus, groupTotal });

  // 7) Invariant assertions (fail fast on any drift) --------------------------
  assertInvariants({ netRealisable, expectedClawback, totalDistributed, surplus, securedRows, ladder, recoveryByCreditor, totalDistributedToCreditors });

  return {
    currency: ccy,
    assumptions: A,
    // headline monetary figures (minor units as strings + formatted)
    grossBookValue: money(gross),
    expectedRealisation: money(realisation),
    realisationLosses: money(realisationLosses),
    enforcementCosts: money(enforcement),
    netRealisableEstate: money(netRealisable + expectedClawback),
    insolvencyCosts: money(expensesPaid),
    administratorInjectedCosts: money(injectedAdmin),
    expectedClawbackRecovery: money(expectedClawback),
    distributableEstate: money(distributable),
    securedDistributions: money(securedFromCollateralPaid),
    preferentialDistributions: money(groupTotal('preferential')),
    unsecuredDistributions: money(groupTotal('unsecured')),
    subordinatedDistributions: money(groupTotal('subordinated')),
    shareholderResidual: money(surplus + sumMinor(ladder.filter((l) => l.class === 'shareholder').map((l) => l.paid))),
    totalClaims: money(totalClaims),
    totalDistributed: money(totalDistributed),
    totalDistributedToCreditors: money(totalDistributedToCreditors),
    shortfall: money(shortfall),
    surplus: money(surplus),
    overallRecoveryPct,
    expectedRecoveryTimingMonths: expectedTimingMonths,
    presentValueOfEstate: money(presentValue),
    recoveryByClass: ladder.map((l) => ({ class: l.class, label: l.label, group: l.group, demand: fromMinor(l.demand), demandMinor: l.demand.toString(), paid: fromMinor(l.paid), paidMinor: l.paid.toString(), shortfall: fromMinor(nonNeg(l.demand - l.paid)), recoveryPct: l.recoveryPct })),
    recoveryByCreditor,
    securedFromCollateral: securedRows.map((r) => ({ id: r.id, name: r.name, class: r.class, admitted: fromMinor(r.admitted), paid: fromMinor(r.paid), shortfall: fromMinor(r.shortfall) })),
    assetRealisation: assetRows.map((r) => ({ id: r.id, label: r.label, type: r.type, gross: fromMinor(r.gross), realisation: fromMinor(r.realisation), enforcement: fromMinor(r.enforcement), net: fromMinor(r.net), recoveryPct: r.recoveryPct })),
    flows,
    // exact BigInt-as-string for tests/audit
    _distributableMinor: distributable.toString(),
    _grossMinor: gross.toString(),
    _netRealisableMinor: (netRealisable + expectedClawback).toString(),
    _totalDistributedMinor: totalDistributed.toString(),
  };
}

/**
 * Runtime guards for the standard-waterfall invariants. These are cheap and
 * deterministic; they catch any arithmetic drift before results are returned.
 */
function assertInvariants({ netRealisable, expectedClawback, totalDistributed, surplus, securedRows, ladder, recoveryByCreditor, totalDistributedToCreditors }) {
  const realised = netRealisable + expectedClawback;
  if (totalDistributed > realised) throw new Error(`waterfall: distributed ${totalDistributed} exceeds realised estate ${realised}`);
  if (surplus < 0n) throw new Error('waterfall: negative surplus');
  // Per collateral-secured row: 0 <= paid <= admitted, shortfall = admitted - paid.
  for (const r of securedRows) {
    if (r.paid < 0n || r.paid > r.admitted) throw new Error(`waterfall: secured ${r.id} paid out of [0,admitted]`);
    if (r.shortfall !== nonNeg(r.admitted - r.paid)) throw new Error(`waterfall: secured ${r.id} shortfall mismatch`);
  }
  // Per ladder tier: 0 <= paid <= demand.
  for (const l of ladder) {
    if (l.class === 'residual') continue;
    if (l.paid < 0n || l.paid > l.demand) throw new Error(`waterfall: tier ${l.class} paid out of [0,demand]`);
  }
  // Strict priority: a tier may only pay if every tier above it is fully satisfied.
  let capReached = false;
  for (const l of ladder) {
    if (l.class === 'residual') continue;
    if (capReached && l.paid > 0n) throw new Error(`waterfall: priority violation at ${l.class} (higher tier unsatisfied)`);
    if (l.demand > 0n && l.paid < l.demand) capReached = true;
  }
  // Sum of per-creditor recoveries reconciles to total distributed to creditors.
  const credSum = recoveryByCreditor.reduce((a, c) => a + BigInt(c.paidMinor), 0n);
  if (credSum !== totalDistributedToCreditors) throw new Error(`waterfall: creditor recoveries ${credSum} != distributed-to-creditors ${totalDistributedToCreditors}`);
  for (const c of recoveryByCreditor) {
    const adm = BigInt(c.admittedMinor), paid = BigInt(c.paidMinor);
    if (paid < 0n || paid > adm) throw new Error(`waterfall: creditor ${c.id} paid out of [0,admitted]`);
  }
}

function buildFlows({ gross, realisationLosses, enforcement, expectedClawback, distributable, securedFromCollateralPaid, ladder, surplus, groupTotal }) {
  /** @type {{from:string,to:string,value:string,valueMinor:string}[]} */
  const links = [];
  const push = (from, to, v) => { if (v > 0n) links.push({ from, to, value: fromMinor(v), valueMinor: v.toString() }); };
  push('Gross Assets', 'Realisation Losses', realisationLosses);
  push('Gross Assets', 'Enforcement Costs', enforcement);
  // Collateral realised is paid straight to secured creditors.
  push('Gross Assets', 'Secured (collateral)', securedFromCollateralPaid);
  const netToEstate = distributable - expectedClawback;
  push('Gross Assets', 'Distributable Estate', nonNeg(netToEstate));
  push('Expected Clawback', 'Distributable Estate', expectedClawback);
  push('Distributable Estate', 'Expenses', groupTotal('expenses'));
  // Floating-charge secured are paid from the free estate (they hold no fixed collateral here).
  push('Distributable Estate', 'Secured (floating)', groupTotal('secured'));
  push('Distributable Estate', 'Preferential', groupTotal('preferential'));
  push('Distributable Estate', 'Unsecured', groupTotal('unsecured'));
  push('Distributable Estate', 'Subordinated', groupTotal('subordinated'));
  push('Distributable Estate', 'Shareholder Residual', surplus + sumMinor(ladder.filter((l) => l.class === 'shareholder').map((l) => l.paid)));
  return links;
}

function money(minor) {
  return { minor: minor.toString(), value: fromMinor(minor), display: formatMinor(minor) };
}
function pctOf(a, b) {
  if (b === 0n) return 0;
  return Math.round(Number((a * 10000n) / b)) / 100;
}
function min(a, b) { return a < b ? a : b; }
function num(x, d = 0) { const n = Number(x); return Number.isFinite(n) ? n : d; }
function numOr(x, d) { return x === undefined || x === null ? d : num(x, d); }
function intOr(x, d) { const n = Math.round(num(x, d)); return Number.isFinite(n) ? n : d; }
function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }
