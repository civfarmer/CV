// @ts-check
/**
 * Laundering / Illicit-Finance Typology Studio — the composable TYPOLOGY CATALOGUE.
 *
 * The data layer the Typology-Studio engine (`engines/typologyStudio.mjs`) composes
 * and simulates. Built in the exact idiom of `vendors.mjs` / `onboarding.mjs`: a
 * static, framework-free, pure data module importable by BOTH the Node server and the
 * browser build, with ZERO DB dependency (no seed, no schema, no data.json regen).
 *
 * A laundering typology is composed from ordered STAGE BLOCKS across the three
 * canonical, publicly-documented laundering phases:
 *   • PLACEMENT   — getting illicit cash into the financial system
 *   • LAYERING    — moving it through complexity to break the audit trail
 *   • INTEGRATION — bringing the now-"clean" value back into the legitimate economy
 * Each block declares its parameters (amount, #hops, #shells, jurisdictions, over-
 * invoice %, …) and, crucially, the REAL FRIS DETECTOR(S) that *should* catch it —
 * so the engine can generate the artefacts, run those real detectors, and score
 * coverage (which red-flags were caught vs which typology slipped through as a gap).
 *
 * ── DATA-HONESTY POSTURE (read this) ─────────────────────────────────────────
 * This is a TRAINING / SIMULATION SANDBOX. Every generated entity, shell, wallet,
 * invoice, transaction and asset is 100% FICTIONAL and produced deterministically
 * from a fixed seed. The typology METHODS mirror REAL, well-known, publicly-
 * documented FATF / public methodology (structuring / smurfing, funnel accounts,
 * shell-company layering, crypto peel chains, trade-based over/under-invoicing, mule
 * networks, real-estate integration, loan-backs) — the METHODS are legitimate public
 * knowledge, the DATA is invented. Nothing here names or implicates any real person,
 * company or wallet. This is NOT operational advice, NOT a detection system of record,
 * and NOT a how-to: it is a red-team / detector-validation lab that shows how money is
 * hidden AND how you would catch it. Do not rely on it for any real determination.
 *
 * ── Determinism ──────────────────────────────────────────────────────────────
 * Pure static data + a fixed-seed PRNG (in the engine) only. Same spec → same result,
 * byte-for-byte. No Date.now(), no network. Everything carries data_classification.
 */

/* eslint-disable max-len */

export const TYPOLOGY_STUDIO_VERSION = Object.freeze({ version: '1.0', asOf: '2026-07-01', schema: 'typology-studio/1' });

export const TYPOLOGY_STUDIO_DISCLAIMER =
  'The Laundering / Illicit-Finance Typology Studio is a TRAINING / SIMULATION SANDBOX. Every generated entity, shell, wallet, invoice, transaction and asset is 100% SYNTHETIC and deterministic. The typology methods mirror REAL, publicly-documented laundering methodology (placement / layering / integration, structuring & smurfing, shell-company layering, crypto peel chains, trade-based over/under-invoicing, mule networks, real-estate integration, loan-backs) — the methods are legitimate public knowledge, the data is invented. Nothing here names or implicates any real person, company or wallet. This is NOT operational advice, NOT a how-to and NOT a detection system of record; it is a red-team / detector-validation lab showing how money is hidden and how you would catch it.';

// ── The three canonical laundering phases ────────────────────────────────────
// The universally-taught money-laundering model. Each phase carries an accent so
// the money-flow narrative can colour the stages consistently.
export const PHASES = Object.freeze([
  { code: 'placement', label: 'Placement', order: 1, color: '#4d8df0', blurb: 'Getting illicit cash into the financial system — the riskiest phase for the launderer, where cash first touches a regulated institution.' },
  { code: 'layering', label: 'Layering', order: 2, color: '#e5a53b', blurb: 'Moving the funds through layers of complexity — shells, hops, cross-border transfers — to sever the link between the money and its illicit origin.' },
  { code: 'integration', label: 'Integration', order: 3, color: '#38bda0', blurb: 'Returning the now apparently-legitimate value to the economy through real assets, businesses or loans, ready to be spent openly.' },
]);
export const PHASE_BY_CODE = Object.freeze(Object.fromEntries(PHASES.map((p) => [p.code, p])));

// ── The FRIS detectors a stage can be validated against ──────────────────────
// Each entry maps a stable detector key to the REAL FRIS engine that implements it,
// so the coverage report can name the exact detector that fired (or is the gap).
// `engine` is documentation only; the engine wires the actual function calls.
export const DETECTORS = Object.freeze([
  { key: 'structuring', label: 'Structuring / smurfing rule', engine: 'monitoring.detectStructuring', module: 'monitoring', route: '#/monitoring', blurb: 'Flags several transfers from one originator each kept just below a reporting threshold within a short window.' },
  { key: 'funnel_fan_in', label: 'Fan-in / funnel-account rule', engine: 'monitoring.detectFunnels', module: 'monitoring', route: '#/monitoring', blurb: 'Flags many distinct sources funnelling value into one non-service collection wallet.' },
  { key: 'rapid_movement', label: 'Rapid in-out (velocity) rule', engine: 'monitoring.detectRapidMovement', module: 'monitoring', route: '#/monitoring', blurb: 'Flags a wallet firing many outgoing transfers inside a short window — pass-through with no economic hold.' },
  { key: 'layering_peel', label: 'Layering (peel-chain) rule', engine: 'monitoring.detectLayering', module: 'monitoring', route: '#/monitoring', blurb: 'Flags a long sequence of peel hops, each peeling a small cash-out and forwarding the remainder.' },
  { key: 'peel_chain_crypto', label: 'Chain-Link peel-chain analytics', engine: 'cryptoDetect.runDetections', module: 'chainlink', route: '#/chainlink', blurb: 'The transaction-forensics battery: peel topology, velocity, exchange convergence, mixer / bridge proximity.' },
  { key: 'mixer_proximity', label: 'Mixer / bridge proximity', engine: 'cryptoDetect.detectServiceProximity', module: 'chainlink', route: '#/chainlink', blurb: 'Flags transactions adjacent to a mixing service or crossing a cross-chain bridge.' },
  { key: 'high_risk_counterparty', label: 'High-risk counterparty rule', engine: 'monitoring.detectHighRiskCounterparty', module: 'monitoring', route: '#/monitoring', blurb: 'Flags value moving directly to / from a mixer, a sanctioned address or a bridge.' },
  { key: 'screening', label: 'Sanctions / watchlist screening', engine: 'screening.screen', module: 'screening', route: '#/screening', blurb: 'Fuzzy-matches a name / address / entity against the synthetic sanctions, PEP and adverse-media watchlists.' },
  { key: 'jurisdiction_hopping', label: 'Jurisdiction-hopping rule', engine: 'monitoring.detectJurisdictionHopping', module: 'monitoring', route: '#/monitoring', blurb: 'Flags a control structure threading through several jurisdictions, weighted up for offshore / secrecy havens.' },
  { key: 'ownership_opacity', label: 'Ownership-structure opacity', engine: 'graph.structureSummary', module: 'nexus', route: '#/nexus', blurb: 'Derives layering depth, jurisdiction spread, nominee interposition and circular ownership from the ownership graph.' },
  { key: 'trade_mispricing', label: 'Trade over/under-invoicing analytic', engine: 'typologyStudio.invoicePricing', module: 'typology', route: '#/typology', blurb: 'Compares a trade invoice against a fair-market reference band and flags the pricing deviation used to move value across a border.' },
  { key: 'estate_integration', label: 'Estate / waterfall recoverability', engine: 'waterfall.computeWaterfall', module: 'waterfall', route: '#/waterfall', blurb: 'Runs the real liquidation-waterfall over a purchased asset to show what is recoverable once integration is unwound.' },
]);
export const DETECTOR_BY_KEY = Object.freeze(Object.fromEntries(DETECTORS.map((d) => [d.key, d])));

/**
 * A parameter descriptor for a stage block. `kind` drives the UI input type; the
 * engine clamps to [min,max] with `def` as the safe default (so a default simulate
 * runs headlessly with no inputs).
 * @typedef {{ key:string, label:string, kind:'number'|'int'|'percent'|'bool'|'select', def:number|boolean|string, min?:number, max?:number, step?:number, unit?:string, options?:string[], help?:string }} StageParam
 */

// ── STAGE BLOCKS — the composable typology building blocks ────────────────────
// Each block: an id, its phase, a real-methodology label + description, its tunable
// parameters, and the DETECTOR KEYS it plants a red-flag for (what SHOULD catch it).
// `redFlags` names, in plain language, the specific injected signals — the coverage
// report reconciles each red-flag to a detector catch or a gap.
export const STAGE_BLOCKS = Object.freeze([
  // ---- PLACEMENT ------------------------------------------------------------
  {
    id: 'cash_structuring', phase: 'placement', label: 'Cash structuring (smurfing)',
    icon: 'chain', color: '#4d8df0',
    summary: 'Break a lump of illicit cash into many deposits each kept just below the reporting threshold, made by several "smurfs" over a short span.',
    method: 'Structuring / smurfing — a hallmark placement method: deposits are deliberately sized under the currency-transaction-report line to avoid triggering a report.',
    params: [
      { key: 'amount', label: 'Total cash to place', kind: 'number', def: 90, min: 10, max: 5000, step: 10, unit: 'k units', help: 'The total illicit cash lump to be structured into sub-threshold deposits.' },
      { key: 'deposits', label: 'Number of sub-threshold deposits', kind: 'int', def: 12, min: 3, max: 60, help: 'How many separate "just under the line" deposits the lump is split into.' },
      { key: 'smurfs', label: 'Number of smurfs (depositors)', kind: 'int', def: 4, min: 1, max: 20, help: 'Distinct depositors used to spread the placement and defeat per-person limits.' },
      { key: 'thresholdK', label: 'Reporting threshold', kind: 'number', def: 10, min: 1, max: 50, step: 1, unit: 'k units', help: 'The synthetic currency-transaction-report threshold each deposit is kept just under.' },
    ],
    redFlags: ['sub_threshold_deposits', 'funnel_collection'],
    detectors: ['structuring', 'funnel_fan_in'],
  },
  {
    id: 'funnel_account', phase: 'placement', label: 'Funnel-account collection',
    icon: 'chain', color: '#4d8df0',
    summary: 'Route the many placement deposits into one collection ("funnel") account that aggregates the cash before it is layered.',
    method: 'Funnel account — a single account in one location receives structured deposits from many sources, then forwards the aggregate onward, concentrating the placement.',
    params: [
      { key: 'sources', label: 'Distinct feeder sources', kind: 'int', def: 8, min: 3, max: 40, help: 'How many distinct feeder wallets pour into the one collection account (drives the fan-in signal).' },
      { key: 'holdHours', label: 'Hold before onward transfer', kind: 'int', def: 6, min: 0, max: 168, unit: 'h', help: 'How long the funnel holds the aggregate before forwarding it (short holds look like pass-through).' },
    ],
    redFlags: ['funnel_collection', 'rapid_pass_through'],
    detectors: ['funnel_fan_in', 'rapid_movement'],
  },
  // ---- LAYERING -------------------------------------------------------------
  {
    id: 'shell_layering', phase: 'layering', label: 'Shell-company chain',
    icon: 'nexus', color: '#e5a53b',
    summary: 'Pass the funds through a chain of shell companies across several jurisdictions, interposing a nominee to mask the true owner.',
    method: 'Shell-company layering — the classic corporate-opacity method: value threads through nominee-owned shells incorporated in secrecy / offshore havens so beneficial ownership cannot be traced.',
    params: [
      { key: 'shells', label: 'Number of shell companies', kind: 'int', def: 4, min: 2, max: 12, help: 'How many shell entities the funds thread through (drives the ownership-layer depth).' },
      { key: 'jurisdictions', label: 'Distinct jurisdictions', kind: 'int', def: 3, min: 1, max: 6, help: 'How many jurisdictions the chain spans (≥3, with an offshore leg, trips jurisdiction-hopping).' },
      { key: 'nominee', label: 'Interpose a nominee owner', kind: 'bool', def: true, help: 'Whether a nominee director / shareholder masks the ultimate beneficial owner.' },
      { key: 'offshore', label: 'Include an offshore / secrecy haven', kind: 'bool', def: true, help: 'Whether at least one shell sits in an offshore secrecy jurisdiction (raises the opacity signal).' },
    ],
    redFlags: ['ownership_opacity', 'jurisdiction_hopping', 'nominee_masking'],
    detectors: ['jurisdiction_hopping', 'ownership_opacity'],
  },
  {
    id: 'crypto_peel', phase: 'layering', label: 'Crypto peel chain',
    icon: 'chain', color: '#e5a53b',
    summary: 'Convert to crypto and run a long peel chain — each hop peels a small cash-out and forwards the remainder — routed through a mixer and a cross-chain bridge.',
    method: 'Crypto peel chain — a long-layering topology on-chain: sequential hops disperse the trail across fresh addresses, a tumbler and a bridge break provenance, peels converge on exchange deposits for cash-out.',
    params: [
      { key: 'amountEth', label: 'Value moved on-chain', kind: 'number', def: 120, min: 1, max: 5000, step: 1, unit: 'ETH', help: 'The value converted to crypto and pushed through the peel chain.' },
      { key: 'hops', label: 'Peel-chain hops', kind: 'int', def: 55, min: 3, max: 300, help: 'Number of sequential peel hops (≥8 is a chain; ≥50 is a classic long-layering topology).' },
      { key: 'peelPercent', label: 'Peel per hop', kind: 'percent', def: 8, min: 1, max: 40, unit: '%', help: 'The fraction peeled to a cash-out at each hop; the remainder is forwarded.' },
      { key: 'mixer', label: 'Route through a mixer', kind: 'bool', def: true, help: 'Whether a mixing-service hop is inserted (the single strongest on-chain laundering signal).' },
      { key: 'bridge', label: 'Cross a cross-chain bridge', kind: 'bool', def: true, help: 'Whether a bridge hop moves value across chains to break on-chain provenance.' },
    ],
    redFlags: ['peel_chain', 'mixer_proximity', 'bridge_usage', 'exchange_convergence', 'velocity'],
    detectors: ['layering_peel', 'peel_chain_crypto', 'mixer_proximity', 'high_risk_counterparty'],
  },
  {
    id: 'trade_invoice', phase: 'layering', label: 'Trade-based over/under-invoicing',
    icon: 'scale', color: '#e5a53b',
    summary: 'Move value across a border inside apparently-legitimate trade by mis-pricing an invoice — over-invoicing an import (or under-invoicing an export) shifts value to the exporter.',
    method: 'Trade-based money laundering — value is transferred by mis-stating the price, quantity or quality of goods on a trade invoice, so a payment far above or below fair-market value moves clean-looking value across jurisdictions.',
    params: [
      { key: 'fairValueK', label: 'Fair-market value of goods', kind: 'number', def: 800, min: 10, max: 50000, step: 10, unit: 'k units', help: 'The true arm-length value of the shipped goods.' },
      { key: 'overInvoicePct', label: 'Over-invoice deviation', kind: 'percent', def: 60, min: -80, max: 300, unit: '%', help: 'How far the invoiced price deviates from fair value; positive = over-invoiced import, negative = under-invoiced export.' },
      { key: 'counterpartySanctioned', label: 'Counterparty is a sanctioned front', kind: 'bool', def: true, help: 'Whether the trade counterparty is a synthetic sanctioned front company (trips screening).' },
    ],
    redFlags: ['price_deviation', 'sanctioned_counterparty'],
    detectors: ['trade_mispricing', 'screening'],
  },
  {
    id: 'mule_network', phase: 'layering', label: 'Money-mule network',
    icon: 'nexus', color: '#e5a53b',
    summary: 'Disperse the funds across a network of money mules who each forward on quickly, scattering the trail across many fresh accounts.',
    method: 'Mule network — recruited or bought account-holders receive and rapidly forward funds, fanning the value out across many low-value hops so no single account looks material.',
    params: [
      { key: 'mules', label: 'Number of mules', kind: 'int', def: 9, min: 3, max: 50, help: 'How many mule accounts the funds are dispersed across (drives fan-out / dispersal).' },
      { key: 'holdMinutes', label: 'Mean hold time', kind: 'int', def: 20, min: 1, max: 1440, unit: 'min', help: 'How long each mule holds before forwarding (short holds trip the velocity rule).' },
    ],
    redFlags: ['fan_out_dispersal', 'rapid_pass_through'],
    detectors: ['peel_chain_crypto', 'rapid_movement'],
  },
  // ---- INTEGRATION ----------------------------------------------------------
  {
    id: 'real_estate', phase: 'integration', label: 'Real-estate purchase',
    icon: 'waterfall', color: '#38bda0',
    summary: 'Integrate the laundered value by buying real estate through a shell — the property looks like a clean investment and can later be sold for "legitimate" proceeds.',
    method: 'Real-estate integration — a favoured integration channel: high-value property absorbs large sums, is often bought through a corporate vehicle, and later re-sale produces apparently-legitimate proceeds.',
    params: [
      { key: 'priceK', label: 'Property purchase price', kind: 'number', def: 2400, min: 100, max: 200000, step: 50, unit: 'k units', help: 'The purchase price of the integrated real-estate asset.' },
      { key: 'mortgagePct', label: 'Loan-back mortgage share', kind: 'percent', def: 30, min: 0, max: 90, unit: '%', help: 'Share financed by a (possibly self-funded) loan-back, layering a lender into the structure.' },
      { key: 'recoveryPct', label: 'Realisable on later sale', kind: 'percent', def: 85, min: 10, max: 100, unit: '%', help: 'The recoverable fraction if the asset is later liquidated (feeds the waterfall).' },
    ],
    redFlags: ['integration_asset', 'loan_back'],
    detectors: ['estate_integration'],
  },
  {
    id: 'operating_business', phase: 'integration', label: 'Operating-business commingling',
    icon: 'nexus', color: '#38bda0',
    summary: 'Commingle the laundered funds with the takings of a cash-intensive operating business so illicit and legitimate revenue become indistinguishable.',
    method: 'Business commingling — a cash-intensive front (restaurant, car-wash, retail) blends illicit funds into real revenue; over-declared turnover justifies the extra cash on the books.',
    params: [
      { key: 'annualRevK', label: 'Declared annual revenue', kind: 'number', def: 1200, min: 50, max: 50000, step: 50, unit: 'k units', help: 'The business’s declared legitimate annual revenue.' },
      { key: 'commingledK', label: 'Illicit funds commingled', kind: 'number', def: 400, min: 10, max: 50000, step: 10, unit: 'k units', help: 'The illicit value blended into the revenue this cycle.' },
    ],
    redFlags: ['integration_asset', 'revenue_commingling'],
    detectors: ['estate_integration'],
  },
]);
export const STAGE_BLOCK_BY_ID = Object.freeze(Object.fromEntries(STAGE_BLOCKS.map((b) => [b.id, b])));

// A friendly index of blocks grouped by phase (for the composer UI palette).
export const BLOCKS_BY_PHASE = Object.freeze(
  Object.fromEntries(PHASES.map((p) => [p.code, STAGE_BLOCKS.filter((b) => b.phase === p.code)]))
);

// ── PRESET SCENARIOS — ready-to-run composed typologies ──────────────────────
// Each preset is an ordered list of stage specs (block id + concrete params) that
// together form a coherent, realistic (but fictional) end-to-end laundering story.
// `seed` fixes the deterministic generation. These are what the "load a preset"
// action and the /api/typology/preset/:id route return.
export const PRESETS = Object.freeze([
  {
    id: 'classic_three_stage', name: 'Classic three-stage laundering',
    tagline: 'Cash structuring → shell chain + peel chain → real-estate integration',
    seed: 71011,
    blurb: 'The textbook end-to-end: dirty cash is structured into a funnel account (placement), threaded through a nominee-owned shell chain and a crypto peel chain (layering), then integrated into real estate. Exercises the widest spread of FRIS detectors.',
    stages: [
      { block: 'cash_structuring', params: { amount: 90, deposits: 12, smurfs: 4, thresholdK: 10 } },
      { block: 'funnel_account', params: { sources: 8, holdHours: 5 } },
      { block: 'shell_layering', params: { shells: 4, jurisdictions: 3, nominee: true, offshore: true } },
      { block: 'crypto_peel', params: { amountEth: 120, hops: 55, peelPercent: 8, mixer: true, bridge: true } },
      { block: 'real_estate', params: { priceK: 2400, mortgagePct: 30, recoveryPct: 85 } },
    ],
  },
  {
    id: 'sanctions_trade_crypto', name: 'Sanctions-evasion via trade + crypto',
    tagline: 'Funnel → trade over-invoicing to a sanctioned front + crypto peel → business commingling',
    seed: 90223,
    blurb: 'A sanctions-evasion pattern: value is moved to a synthetic sanctioned front through an over-invoiced trade leg and a crypto peel chain, then commingled into an operating business. Designed to trip the screening and high-risk-counterparty detectors alongside the on-chain battery.',
    stages: [
      { block: 'funnel_account', params: { sources: 6, holdHours: 3 } },
      { block: 'trade_invoice', params: { fairValueK: 800, overInvoicePct: 70, counterpartySanctioned: true } },
      { block: 'crypto_peel', params: { amountEth: 60, hops: 40, peelPercent: 10, mixer: true, bridge: true } },
      { block: 'operating_business', params: { annualRevK: 1200, commingledK: 500 } },
    ],
  },
  {
    id: 'kleptocrat_real_estate', name: 'Kleptocrat real-estate integration',
    tagline: 'Shell chain (deep, offshore, nominee) → mule dispersal → real-estate + loan-back',
    seed: 33071,
    blurb: 'A grand-corruption pattern: proceeds are buried under a deep nominee-owned offshore shell chain, dispersed through a mule network, and integrated into prestige real estate with a loan-back. Stresses the ownership-opacity and jurisdiction-hopping detectors, and shows an integration gap where no transaction-level rule fires.',
    stages: [
      { block: 'shell_layering', params: { shells: 6, jurisdictions: 4, nominee: true, offshore: true } },
      { block: 'mule_network', params: { mules: 10, holdMinutes: 12 } },
      { block: 'real_estate', params: { priceK: 8500, mortgagePct: 40, recoveryPct: 78 } },
    ],
  },
]);
export const PRESET_BY_ID = Object.freeze(Object.fromEntries(PRESETS.map((p) => [p.id, p])));

// The maximum number of stages a composed scenario may contain (input guard).
export const MAX_STAGES = 12;

export default {
  TYPOLOGY_STUDIO_VERSION, TYPOLOGY_STUDIO_DISCLAIMER, PHASES, PHASE_BY_CODE,
  DETECTORS, DETECTOR_BY_KEY, STAGE_BLOCKS, STAGE_BLOCK_BY_ID, BLOCKS_BY_PHASE,
  PRESETS, PRESET_BY_ID, MAX_STAGES,
};
