// @ts-check
/**
 * Third-Party / Vendor Risk — deterministic SYNTHETIC vendor / counterparty
 * register for a clearly-fictional demo organisation ("the buyer").
 *
 * The data layer the vendor-risk engine (`engines/vendorRisk.mjs`) scores. Built
 * in the exact idiom of `watchlists.mjs` / `financials.mjs`: a static,
 * framework-free, pure data module importable by BOTH the Node server and the
 * browser build, with ZERO DB dependency (no seed, no schema, no data.json
 * regeneration risk). The vendor rows carry an OPTIONAL `entityId` linking a
 * vendor to a seeded Sovereign Nexus entity (so its ownership / flight-risk and
 * screening signals can be pulled in), and a `homeJurisdiction` matching a
 * seeded jurisdiction code (so its secrecy risk can be looked up).
 *
 * ── DATA-HONESTY POSTURE (read this) ─────────────────────────────────────────
 * Every vendor below is FICTIONAL and defined deterministically for
 * demonstration. The names, categories, spend, criticality and contract status
 * are invented; nothing here refers to a real supplier, counterparty or client.
 * A handful of vendors are deliberately given names that MATCH synthetic
 * watchlist entries (see `watchlists.mjs`) so the cross-module screening signal
 * can be demonstrated end-to-end — those are still fictional and must NOT be read
 * as an allegation against any real party. This is NOT a third-party-risk system
 * of record; it is a deterministic demonstration of TPRM scoring mechanics.
 *
 * ── Determinism ──────────────────────────────────────────────────────────────
 * Pure static data + integer money (annual spend in whole USD thousands). Same
 * module → same rows, byte-for-byte. No Date.now(), no randomness, no network.
 *
 * All records carry `data_classification: 'synthetic-demo'`.
 */

/* eslint-disable max-len */

// ── Vendor categories (with a base inherent-risk weight in [0,1]) ─────────────
// The category contributes to inherent risk: a financial/payments counterparty
// or a crypto/VASP is inherently riskier than a facilities or logistics vendor.
export const VENDOR_CATEGORIES = Object.freeze([
  { code: 'it_saas', label: 'IT / SaaS', blurb: 'Software, cloud hosting and managed IT services.', inherent: 0.55, color: '#4d8df0' },
  { code: 'financial', label: 'Financial services', blurb: 'Payments, banking, custody and financial intermediation.', inherent: 0.80, color: '#f0616d' },
  { code: 'logistics', label: 'Logistics & freight', blurb: 'Shipping, freight forwarding, warehousing and customs.', inherent: 0.50, color: '#37c2b4' },
  { code: 'professional', label: 'Professional services', blurb: 'Legal, audit, advisory and corporate services.', inherent: 0.45, color: '#a97bf0' },
  { code: 'manufacturing', label: 'Manufacturing & supply', blurb: 'Component manufacture, contract assembly and raw materials.', inherent: 0.48, color: '#e5a53b' },
  { code: 'commodities', label: 'Commodities & energy', blurb: 'Commodity trading, energy and resource intermediation.', inherent: 0.72, color: '#d98c4a' },
  { code: 'marketing', label: 'Marketing & data', blurb: 'Marketing, data brokerage and customer analytics.', inherent: 0.52, color: '#7d8aa0' },
  { code: 'facilities', label: 'Facilities & travel', blurb: 'Facilities management, catering and corporate travel.', inherent: 0.30, color: '#5b6b82' },
]);
export const CATEGORY_BY_CODE = Object.freeze(Object.fromEntries(VENDOR_CATEGORIES.map((c) => [c.code, c])));

// ── Contract status (with a governance-risk weight in [0,1]) ──────────────────
// An expired/terminating contract or one in onboarding carries more residual
// governance risk than a current, in-force agreement.
export const CONTRACT_STATUSES = Object.freeze([
  { code: 'active', label: 'Active', risk: 0.10, color: '#46b877' },
  { code: 'renewal_due', label: 'Renewal due', risk: 0.45, color: '#e5a53b' },
  { code: 'onboarding', label: 'Onboarding', risk: 0.55, color: '#4d8df0' },
  { code: 'expired', label: 'Expired', risk: 0.85, color: '#f0616d' },
  { code: 'terminating', label: 'Terminating', risk: 0.70, color: '#d98c4a' },
]);
export const CONTRACT_STATUS_BY_CODE = Object.freeze(Object.fromEntries(CONTRACT_STATUSES.map((s) => [s.code, s])));

// ── Criticality tiers (business dependence / blast radius) ────────────────────
// 1 = tier-1 critical (a failure halts the business), 4 = low criticality.
export const CRITICALITY_TIERS = Object.freeze([
  { tier: 1, label: 'Tier 1 — Critical', weight: 1.00, blurb: 'A failure or compromise would halt a core business process.' },
  { tier: 2, label: 'Tier 2 — Important', weight: 0.70, blurb: 'A failure would materially disrupt operations.' },
  { tier: 3, label: 'Tier 3 — Moderate', weight: 0.45, blurb: 'A failure would be a manageable inconvenience.' },
  { tier: 4, label: 'Tier 4 — Low', weight: 0.22, blurb: 'A failure would have limited operational impact.' },
]);
export const CRITICALITY_BY_TIER = Object.freeze(Object.fromEntries(CRITICALITY_TIERS.map((t) => [t.tier, t])));

// ── Data-access sensitivity (does the vendor touch sensitive data?) ───────────
export const DATA_ACCESS_LEVELS = Object.freeze([
  { code: 'none', label: 'No data access', weight: 0.05 },
  { code: 'internal', label: 'Internal data', weight: 0.35 },
  { code: 'confidential', label: 'Confidential data', weight: 0.65 },
  { code: 'restricted', label: 'Restricted / personal data', weight: 1.00 },
]);
export const DATA_ACCESS_BY_CODE = Object.freeze(Object.fromEntries(DATA_ACCESS_LEVELS.map((d) => [d.code, d])));

// ── The synthetic vendor register ────────────────────────────────────────────
// Each row:
//   id                stable VEN-#### id
//   name              fictional vendor legal name (some deliberately match a
//                     synthetic watchlist entry to demo the screening signal)
//   category          a VENDOR_CATEGORIES code
//   homeJurisdiction  a seeded jurisdiction CODE (jurisdictions table) or null
//   jurisdictionLabel a human label for the jurisdiction
//   annualSpend       annual contract value in whole USD thousands (integer)
//   criticality       a CRITICALITY_TIERS tier (1..4)
//   dataAccess        a DATA_ACCESS_LEVELS code
//   contractStatus    a CONTRACT_STATUSES code
//   onboardedAt       ISO date the vendor was first onboarded (deterministic)
//   lastReviewedAt    ISO date of the last due-diligence review (deterministic)
//   entityId          OPTIONAL seeded Sovereign Nexus entity id to pull ownership
//                     / flight-risk / screening from (null if not linked)
//   adverse           a small deterministic set of synthetic adverse-signal flags
//                     (each { code, label, severity } — sourced-fact style)
//   note              a one-line synthetic due-diligence note
export const VENDORS = Object.freeze([
  {
    id: 'VEN-0001', name: 'Northwind Cloud Services LLC', category: 'it_saas',
    homeJurisdiction: 'DE-US', jurisdictionLabel: 'Delaware, USA',
    annualSpend: 4200, criticality: 1, dataAccess: 'restricted', contractStatus: 'active',
    onboardedAt: '2021-03-14', lastReviewedAt: '2025-11-02', entityId: 'ENT-0063',
    adverse: [], note: 'Primary cloud hosting provider; processes customer personal data under a DPA.',
    data_classification: 'synthetic-demo',
  },
  {
    id: 'VEN-0002', name: 'Sovcomflot', category: 'commodities',
    homeJurisdiction: 'BVI', jurisdictionLabel: 'British Virgin Islands',
    annualSpend: 9800, criticality: 2, dataAccess: 'confidential', contractStatus: 'renewal_due',
    onboardedAt: '2022-06-01', lastReviewedAt: '2024-09-18', entityId: 'ENT-0065',
    adverse: [{ code: 'sanctions-nexus', label: 'Name matches a real public sanctions listing (OFAC SDN)', severity: 'High' }, { code: 'opaque-ownership', label: 'Beneficial ownership not fully attributable', severity: 'High' }],
    note: 'Commodity intermediary in an offshore jurisdiction; name matches a real public sanctions listing (OFAC SDN) — screen before renewal.',
    data_classification: 'synthetic-demo',
  },
  {
    id: 'VEN-0003', name: 'Blackwater Commodities Ltd', category: 'commodities',
    homeJurisdiction: 'BVI', jurisdictionLabel: 'British Virgin Islands',
    annualSpend: 6100, criticality: 3, dataAccess: 'internal', contractStatus: 'terminating',
    onboardedAt: '2020-01-20', lastReviewedAt: '2024-02-11', entityId: 'ENT-0048',
    adverse: [{ code: 'sanctions-nexus', label: 'Name matches a real public sanctions listing (OFAC SDN)', severity: 'High' }, { code: 'adverse-media', label: 'Synthetic adverse-media: alleged sanctions-evasion reporting', severity: 'High' }],
    note: 'Legacy commodities counterparty being off-boarded; flagged for a synthetic sanctions-list name match.',
    data_classification: 'synthetic-demo',
  },
  {
    id: 'VEN-0004', name: 'Meridian Global Payments SA', category: 'financial',
    homeJurisdiction: 'GE', jurisdictionLabel: 'Geneva, Switzerland',
    annualSpend: 3300, criticality: 1, dataAccess: 'restricted', contractStatus: 'active',
    onboardedAt: '2019-11-05', lastReviewedAt: '2026-01-14', entityId: 'ENT-0064',
    adverse: [], note: 'Cross-border payments processor; PCI-DSS attested; handles settlement flows.',
    data_classification: 'synthetic-demo',
  },
  {
    id: 'VEN-0005', name: 'Aurelia Custody & Trust AG', category: 'financial',
    homeJurisdiction: 'LI', jurisdictionLabel: 'Liechtenstein',
    annualSpend: 5400, criticality: 2, dataAccess: 'confidential', contractStatus: 'active',
    onboardedAt: '2021-09-30', lastReviewedAt: '2025-06-22', entityId: 'ENT-0095',
    adverse: [{ code: 'secrecy-jurisdiction', label: 'Home jurisdiction is a high-secrecy centre', severity: 'Medium' }],
    note: 'Custody / trust services out of a high-secrecy jurisdiction; enhanced due diligence applied.',
    data_classification: 'synthetic-demo',
  },
  {
    id: 'VEN-0006', name: 'Léman Freight & Logistics AG', category: 'logistics',
    homeJurisdiction: 'ZG', jurisdictionLabel: 'Zug, Switzerland',
    annualSpend: 2700, criticality: 2, dataAccess: 'internal', contractStatus: 'active',
    onboardedAt: '2020-07-12', lastReviewedAt: '2025-10-03', entityId: 'ENT-0069',
    adverse: [], note: 'Freight forwarder and customs broker for EU / Swiss corridors.',
    data_classification: 'synthetic-demo',
  },
  {
    id: 'VEN-0007', name: 'Castellan Advisory Partners Ltd', category: 'professional',
    homeJurisdiction: 'JE', jurisdictionLabel: 'Jersey',
    annualSpend: 1900, criticality: 3, dataAccess: 'confidential', contractStatus: 'renewal_due',
    onboardedAt: '2022-02-28', lastReviewedAt: '2024-05-16', entityId: 'ENT-0091',
    adverse: [{ code: 'opaque-ownership', label: 'Multi-layer ownership across secrecy jurisdictions', severity: 'Medium' }],
    note: 'Corporate-services and advisory firm; complex ownership chain flagged in Nexus.',
    data_classification: 'synthetic-demo',
  },
  {
    id: 'VEN-0008', name: 'Helvetia Precision Manufacturing SA', category: 'manufacturing',
    homeJurisdiction: 'VD', jurisdictionLabel: 'Vaud, Switzerland',
    annualSpend: 7600, criticality: 1, dataAccess: 'internal', contractStatus: 'active',
    onboardedAt: '2018-04-09', lastReviewedAt: '2025-12-01', entityId: null,
    adverse: [], note: 'Sole-source manufacturer of a critical hardware component; single-supplier concentration.',
    data_classification: 'synthetic-demo',
  },
  {
    id: 'VEN-0009', name: 'Obsidian Maritime SA', category: 'logistics',
    homeJurisdiction: 'CY', jurisdictionLabel: 'Cyprus',
    annualSpend: 3100, criticality: 3, dataAccess: 'none', contractStatus: 'expired',
    onboardedAt: '2019-08-22', lastReviewedAt: '2023-08-30', entityId: null,
    adverse: [{ code: 'sanctions-nexus', label: 'Name matches a real public sanctions listing (OFAC SDN)', severity: 'High' }, { code: 'contract-lapsed', label: 'Contract expired without formal re-assessment', severity: 'Medium' }],
    note: 'Shipping counterparty with a lapsed contract and a synthetic sanctions-list name match — do not re-engage without review.',
    data_classification: 'synthetic-demo',
  },
  {
    id: 'VEN-0010', name: 'Cornavin Data Analytics Ltd', category: 'marketing',
    homeJurisdiction: 'HK', jurisdictionLabel: 'Hong Kong',
    annualSpend: 1400, criticality: 3, dataAccess: 'restricted', contractStatus: 'active',
    onboardedAt: '2023-01-10', lastReviewedAt: '2025-07-19', entityId: 'ENT-0050',
    adverse: [{ code: 'data-transfer', label: 'Cross-border personal-data transfer to a non-adequacy region', severity: 'Medium' }],
    note: 'Customer-analytics vendor processing personal data; cross-border transfer risk.',
    data_classification: 'synthetic-demo',
  },
  {
    id: 'VEN-0011', name: 'Alpine Secure Audit AG', category: 'professional',
    homeJurisdiction: 'ZH', jurisdictionLabel: 'Zürich, Switzerland',
    annualSpend: 1200, criticality: 2, dataAccess: 'confidential', contractStatus: 'active',
    onboardedAt: '2020-10-01', lastReviewedAt: '2026-02-28', entityId: null,
    adverse: [], note: 'External audit and assurance provider; well-established, low residual risk.',
    data_classification: 'synthetic-demo',
  },
  {
    id: 'VEN-0012', name: 'Concord Resources Trading AG', category: 'commodities',
    homeJurisdiction: 'ZG', jurisdictionLabel: 'Zug, Switzerland',
    annualSpend: 8300, criticality: 2, dataAccess: 'internal', contractStatus: 'renewal_due',
    onboardedAt: '2021-05-18', lastReviewedAt: '2024-11-27', entityId: 'ENT-0083',
    adverse: [{ code: 'opaque-ownership', label: 'Beneficial ownership routed through offshore layers', severity: 'Medium' }],
    note: 'Resource-trading counterparty with a layered ownership structure in Nexus.',
    data_classification: 'synthetic-demo',
  },
  {
    id: 'VEN-0013', name: 'Riverside Facilities Group Ltd', category: 'facilities',
    homeJurisdiction: 'DE-US', jurisdictionLabel: 'Delaware, USA',
    annualSpend: 900, criticality: 4, dataAccess: 'none', contractStatus: 'active',
    onboardedAt: '2022-11-14', lastReviewedAt: '2025-09-08', entityId: null,
    adverse: [], note: 'Facilities management and catering; minimal data access, low criticality.',
    data_classification: 'synthetic-demo',
  },
  {
    id: 'VEN-0014', name: 'Cologny Property Holdings Ltd', category: 'financial',
    homeJurisdiction: 'KY', jurisdictionLabel: 'Cayman Islands',
    annualSpend: 2100, criticality: 3, dataAccess: 'internal', contractStatus: 'onboarding',
    onboardedAt: '2026-03-02', lastReviewedAt: '2026-03-02', entityId: 'ENT-0054',
    adverse: [{ code: 'secrecy-jurisdiction', label: 'Home jurisdiction is a high-secrecy centre', severity: 'High' }],
    note: 'Property-holding counterparty mid-onboarding from a high-secrecy jurisdiction; EDD in progress.',
    data_classification: 'synthetic-demo',
  },
  {
    id: 'VEN-0015', name: 'Solenne Payroll Solutions SA', category: 'it_saas',
    homeJurisdiction: 'GE', jurisdictionLabel: 'Geneva, Switzerland',
    annualSpend: 1600, criticality: 2, dataAccess: 'restricted', contractStatus: 'active',
    onboardedAt: '2021-12-06', lastReviewedAt: '2025-08-15', entityId: null,
    adverse: [], note: 'Payroll SaaS processing employee personal data; restricted-data processor.',
    data_classification: 'synthetic-demo',
  },
  {
    id: 'VEN-0016', name: 'Peregrine Freight Partners LLC', category: 'logistics',
    homeJurisdiction: 'DE-US', jurisdictionLabel: 'Delaware, USA',
    annualSpend: 1300, criticality: 3, dataAccess: 'none', contractStatus: 'active',
    onboardedAt: '2020-03-25', lastReviewedAt: '2025-05-30', entityId: 'ENT-0061',
    adverse: [], note: 'Secondary freight partner; commoditised service, readily substitutable.',
    data_classification: 'synthetic-demo',
  },
  {
    id: 'VEN-0017', name: 'Meridian Legal & Corporate Services SA', category: 'professional',
    homeJurisdiction: 'LU', jurisdictionLabel: 'Luxembourg',
    annualSpend: 2400, criticality: 3, dataAccess: 'confidential', contractStatus: 'active',
    onboardedAt: '2019-06-17', lastReviewedAt: '2026-04-11', entityId: 'ENT-0045',
    adverse: [], note: 'Outside counsel and corporate-services provider; long-standing relationship.',
    data_classification: 'synthetic-demo',
  },
  {
    id: 'VEN-0018', name: 'Nyon Marketing Collective Ltd', category: 'marketing',
    homeJurisdiction: 'GG', jurisdictionLabel: 'Guernsey',
    annualSpend: 700, criticality: 4, dataAccess: 'internal', contractStatus: 'expired',
    onboardedAt: '2022-08-08', lastReviewedAt: '2023-09-12', entityId: null,
    adverse: [{ code: 'contract-lapsed', label: 'Contract expired without formal re-assessment', severity: 'Low' }],
    note: 'Marketing agency with a lapsed low-value contract; candidate for closure.',
    data_classification: 'synthetic-demo',
  },
]);

export const VENDOR_BY_ID = Object.freeze(Object.fromEntries(VENDORS.map((v) => [v.id, v])));

// ── Review cadence policy (drives due/overdue re-assessment) ──────────────────
// Higher-criticality vendors are reviewed more frequently. Days between reviews.
export const REVIEW_CADENCE_DAYS = Object.freeze({ 1: 180, 2: 270, 3: 365, 4: 545 });

// The disclaimer every vendor-risk API response / view carries.
export const VENDOR_DISCLAIMER =
  'Synthetic demonstration third-party / vendor register. Every vendor, category, spend figure and risk score is FICTIONAL and generated deterministically for demonstration; nothing here refers to a real supplier, counterparty or client. A composite risk score is an illustrative aggregation, NOT a factual allegation against any party. This is NOT a third-party-risk-management system of record.';

// A stable version stamp (bump if the register changes) so the UI can display it.
export const VENDOR_VERSION = Object.freeze({
  version: '1.0.0',
  vendors: VENDORS.length,
  categories: VENDOR_CATEGORIES.length,
  contractStatuses: CONTRACT_STATUSES.length,
});
