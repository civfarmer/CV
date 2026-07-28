// @ts-check
/**
 * KYC / Onboarding & Identity-Risk — deterministic SYNTHETIC applicant / customer
 * intake register for Customer Due Diligence (CDD) demonstration.
 *
 * The data layer the onboarding engine (`engines/onboarding.mjs`) scores. Built in
 * the exact idiom of `vendors.mjs` / `watchlists.mjs`: a static, framework-free,
 * pure data module importable by BOTH the Node server and the browser build, with
 * ZERO DB dependency (no seed, no schema, no data.json regeneration risk).
 *
 * Each applicant carries a full CDD intake record: legal name, customer type
 * (individual / corporate), country of residence / incorporation, industry / sector,
 * the product requested, expected activity, delivery channel, a PEP self-declaration,
 * and — for corporates — a beneficial-ownership (UBO) declaration. Many applicants
 * carry an OPTIONAL `entityId` linking them to a seeded Sovereign Nexus entity, so
 * the engine can pull that entity's REAL screening + adverse-media + jurisdiction
 * signals and the onboarding rating lines up with the rest of FRIS. The `country`
 * codes match seeded jurisdiction codes so the Country & Sector Risk Index applies.
 *
 * ── DATA-HONESTY POSTURE (read this) ─────────────────────────────────────────
 * Every applicant below is FICTIONAL and defined deterministically for demonstration.
 * The names, ownership, declared activity, product and channel are invented; nothing
 * here refers to a real customer, applicant or person. A handful of applicants reuse
 * synthetic Sovereign Nexus entity ids (and thus their synthetic watchlist / adverse-
 * media matches) so the cross-module CDD signal can be demonstrated end-to-end — those
 * are still fictional and must NOT be read as an allegation against any real party. The
 * risk-factor WEIGHTING model itself is a legitimate, publicly-documented CDD/EDD
 * practice (customer-type × geography × industry × product × channel × screening ×
 * adverse-media) applied to the synthetic inputs — the methodology is real, the data
 * is not. This is NOT a KYC / onboarding system of record and NOT compliance advice.
 *
 * ── Determinism ──────────────────────────────────────────────────────────────
 * Pure static data + a fixed-seed PRNG only for the illustrative "expected monthly
 * activity" figures. Same module → same rows, byte-for-byte. No Date.now(), no
 * network. All records carry `data_classification: 'synthetic-demo'`.
 */

/* eslint-disable max-len */

// ── Customer types (with an inherent-risk weight in [0,1]) ────────────────────
// A legal-entity / trust customer is inherently harder to look through than a
// salaried individual; a trust or complex corporate carries the most inherent
// opacity. The weight feeds the "customer type" risk factor.
export const CUSTOMER_TYPES = Object.freeze([
  { code: 'individual', label: 'Individual', kind: 'individual', inherent: 0.20, color: '#4d8df0', blurb: 'A natural person applying in their own name.' },
  { code: 'sole_trader', label: 'Sole trader', kind: 'individual', inherent: 0.35, color: '#5b9bd5', blurb: 'A natural person trading as an unincorporated business.' },
  { code: 'private_company', label: 'Private company', kind: 'corporate', inherent: 0.55, color: '#e5a53b', blurb: 'A privately held limited company / corporation.' },
  { code: 'holding_company', label: 'Holding / SPV', kind: 'corporate', inherent: 0.72, color: '#d98c4a', blurb: 'A holding company or special-purpose vehicle — a look-through structure.' },
  { code: 'trust', label: 'Trust / foundation', kind: 'corporate', inherent: 0.78, color: '#f0616d', blurb: 'A trust or private foundation — inherently opaque beneficial ownership.' },
  { code: 'partnership', label: 'Partnership', kind: 'corporate', inherent: 0.50, color: '#a97bf0', blurb: 'A general or limited partnership.' },
]);
export const CUSTOMER_TYPE_BY_CODE = Object.freeze(Object.fromEntries(CUSTOMER_TYPES.map((t) => [t.code, t])));

// ── Products requested (with an inherent-risk weight in [0,1]) ────────────────
// The product/service a customer is onboarding for. Cross-border, cash-like or
// crypto-adjacent products carry more inherent AML risk than a savings account.
export const PRODUCTS = Object.freeze([
  { code: 'current_account', label: 'Current / transaction account', inherent: 0.35, color: '#4d8df0', blurb: 'Everyday payment account.' },
  { code: 'savings', label: 'Savings / deposit', inherent: 0.20, color: '#46b877', blurb: 'Low-velocity deposit product.' },
  { code: 'wealth_mgmt', label: 'Wealth / private banking', inherent: 0.62, color: '#e5a53b', blurb: 'Discretionary wealth management for higher-net-worth clients.' },
  { code: 'trade_finance', label: 'Trade finance', inherent: 0.75, color: '#d98c4a', blurb: 'Letters of credit, guarantees and cross-border trade instruments.' },
  { code: 'correspondent', label: 'Correspondent / nested', inherent: 0.85, color: '#f0616d', blurb: 'Correspondent-banking / nested-relationship product — high inherent risk.' },
  { code: 'fx_payments', label: 'FX & cross-border payments', inherent: 0.68, color: '#d98c4a', blurb: 'Foreign-exchange and cross-border payment services.' },
  { code: 'custody', label: 'Custody / safekeeping', inherent: 0.50, color: '#a97bf0', blurb: 'Asset custody and safekeeping.' },
  { code: 'crypto_gateway', label: 'Crypto / virtual-asset gateway', inherent: 0.90, color: '#c1121f', blurb: 'On/off-ramp to virtual assets — highest inherent product risk.' },
]);
export const PRODUCT_BY_CODE = Object.freeze(Object.fromEntries(PRODUCTS.map((p) => [p.code, p])));

// ── Delivery channels (with an inherent-risk weight in [0,1]) ─────────────────
// How the relationship is established. Non-face-to-face / introduced-by-third-party
// channels are a classic higher-risk factor in CDD guidance.
export const CHANNELS = Object.freeze([
  { code: 'branch', label: 'In-branch (face-to-face)', inherent: 0.15, color: '#46b877', blurb: 'Applicant verified in person.' },
  { code: 'remote_verified', label: 'Remote — verified eID', inherent: 0.40, color: '#4d8df0', blurb: 'Non-face-to-face with a verified electronic identity.' },
  { code: 'remote_unverified', label: 'Remote — document-only', inherent: 0.65, color: '#e5a53b', blurb: 'Non-face-to-face, document-only onboarding.' },
  { code: 'introduced', label: 'Introduced by intermediary', inherent: 0.70, color: '#d98c4a', blurb: 'Introduced by a third-party intermediary / TCSP.' },
  { code: 'correspondent_ref', label: 'Correspondent referral', inherent: 0.75, color: '#f0616d', blurb: 'Referred through a correspondent relationship.' },
]);
export const CHANNEL_BY_CODE = Object.freeze(Object.fromEntries(CHANNELS.map((c) => [c.code, c])));

// ── Onboarding pipeline stages ────────────────────────────────────────────────
// The CDD workflow stage an applicant currently sits at. `terminal` marks a stage
// that ends the pipeline (approved / rejected). Order is the pipeline order.
export const STAGES = Object.freeze([
  { code: 'intake', label: 'Intake', order: 1, terminal: false, color: '#4d8df0', blurb: 'Application received; data captured.' },
  { code: 'screening', label: 'Screening', order: 2, terminal: false, color: '#5b9bd5', blurb: 'Sanctions / PEP / adverse-media screening in progress.' },
  { code: 'edd_review', label: 'EDD review', order: 3, terminal: false, color: '#e5a53b', blurb: 'Enhanced due diligence / senior review.' },
  { code: 'approved', label: 'Approved', order: 4, terminal: true, color: '#46b877', blurb: 'Onboarded; on periodic-review cadence.' },
  { code: 'rejected', label: 'Rejected', order: 5, terminal: true, color: '#f0616d', blurb: 'Declined / off-boarded.' },
]);
export const STAGE_BY_CODE = Object.freeze(Object.fromEntries(STAGES.map((s) => [s.code, s])));

// ── Customer-risk rating bands (final Low / Medium / High / Prohibited) ────────
// The output band the engine assigns from the weighted 0–100 CDD score. Each band
// maps to a required due-diligence level and a review cadence (illustrative).
// Colour is ALWAYS paired with the label in the UI (never colour-only).
export const RATING_BANDS = Object.freeze([
  { code: 'Low', min: 0, color: '#2f9e63', dd: 'CDD', cadenceMonths: 36, blurb: 'Standard customer due diligence; review on the standard 36-month cadence.' },
  { code: 'Medium', min: 34, color: '#c9a227', dd: 'CDD+', cadenceMonths: 24, blurb: 'Standard CDD with enhanced monitoring; shorten the review cadence to 24 months.' },
  { code: 'High', min: 60, color: '#e07b39', dd: 'EDD', cadenceMonths: 12, blurb: 'Enhanced due diligence and senior sign-off; annual (12-month) review.' },
  { code: 'Prohibited', min: 85, color: '#d5303e', dd: 'EDD / decline', cadenceMonths: 6, blurb: 'Prohibited / hard-stop posture; escalate to decline or off-board — do not onboard without board-level exception.' },
]);
export const RATING_BY_CODE = Object.freeze(Object.fromEntries(RATING_BANDS.map((b) => [b.code, b])));

// ── The risk-factor weighting model (CDD/EDD factor weights) ──────────────────
// A transparent weighted-factor model in the exact idiom of vendorRisk.mjs: each
// factor maps its input to a normalised [0,1] contribution; the customer-risk score
// is the weighted average scaled to 0–100, so EVERY point is attributable to a named
// factor. The seven factors mirror standard CDD risk-rating practice.
export const RISK_FACTORS = Object.freeze([
  { key: 'customer_type', label: 'Customer type', weight: 14, short: 'Type', description: 'Inherent look-through risk of the customer type — an individual is easier to verify than a trust or holding-company / SPV structure.' },
  { key: 'geography', label: 'Geography (country risk)', weight: 20, short: 'Geo', description: 'The country of residence / incorporation, scored through the Country & Sector Risk Index (its composed jurisdiction band), anchored to the seeded jurisdiction secrecy score where one exists.' },
  { key: 'industry', label: 'Industry / sector', weight: 16, short: 'Sector', description: 'The inherent AML/financial-crime risk of the customer’s line of business, scored through the Country & Sector Risk Index sector-risk table.' },
  { key: 'product', label: 'Product / service', weight: 14, short: 'Product', description: 'The inherent risk of the product requested — a savings account is lower risk than a correspondent, trade-finance or virtual-asset product.' },
  { key: 'channel', label: 'Delivery channel', weight: 8, short: 'Channel', description: 'How the relationship is established — non-face-to-face, document-only or intermediary-introduced onboarding is higher risk.' },
  { key: 'screening', label: 'Screening result', weight: 16, short: 'Screening', description: 'The best sanctions / PEP / adverse-list match from the Screening & Watchlist engine against the applicant (or its linked Nexus entity). A strong sanctions match is an overriding hard stop.' },
  { key: 'adverse_media', label: 'Adverse-media result', weight: 12, short: 'Adverse', description: 'The Adverse-Media / OSINT composite for the applicant’s linked entity — recency-weighted negative-news exposure.' },
]);
export const FACTOR_BY_KEY = Object.freeze(Object.fromEntries(RISK_FACTORS.map((f) => [f.key, f])));
export const TOTAL_FACTOR_WEIGHT = RISK_FACTORS.reduce((a, f) => a + f.weight, 0);

// ── A tiny fixed-seed PRNG for the illustrative expected-activity figures only ─
// (Mulberry32.) Used ONLY to derive a plausible "expected monthly activity" USD
// figure per applicant so the intake feels complete — it never affects the rating.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seedFrom(str) { let h = 2166136261 >>> 0; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function expectedActivity(id, base) { const r = mulberry32(seedFrom(id)); return Math.round((base * (0.6 + r() * 1.2)) / 5) * 5; }

// ── The synthetic applicant / customer register ───────────────────────────────
// Each row is a CDD intake. `entityId` (optional) links to a seeded Sovereign Nexus
// entity so its screening + adverse-media + jurisdiction signals are pulled by the
// engine. `country` matches a seeded jurisdiction code. `sector` matches a Country
// & Sector Risk Index sector code. `pep` is a self-declaration; `ubo` is the declared
// beneficial-ownership (for corporates). `expectedMonthlyUsdK` is illustrative only.
//
// The set is deliberately varied so the demo shows every rating band and the EDD
// triggers (high-risk geography, PEP, screening hit). Applicants that reuse an entity
// with a synthetic sanctions/adverse hit will surface those signals in the assessment.
function A(row) {
  const t = CUSTOMER_TYPE_BY_CODE[row.type];
  return Object.freeze({
    ...row,
    kind: t ? t.kind : 'individual',
    expectedMonthlyUsdK: expectedActivity(row.id, row.activityBaseK || 50),
    data_classification: 'synthetic-demo',
  });
}

export const APPLICANTS = Object.freeze([
  // ── Lower-risk individuals (onshore, simple products) ──
  A({ id: 'APP-0001', legalName: 'Ingrid Ferreira', type: 'individual', country: 'GE', sector: 'banking', product: 'savings', channel: 'branch', pep: false, entityId: 'ENT-0001', stage: 'approved', activityBaseK: 15, expectedActivity: 'Modest monthly salary credits and card spend from a Geneva-resident individual.', ubo: null }),
  A({ id: 'APP-0002', legalName: 'Gustav Brenner', type: 'individual', country: 'ZH', sector: 'technology', product: 'current_account', channel: 'remote_verified', pep: false, entityId: 'ENT-0008', stage: 'approved', activityBaseK: 25, expectedActivity: 'Regular Zürich-based salary and technology-consulting receipts.', ubo: null }),
  A({ id: 'APP-0003', legalName: 'Priya Schneider', type: 'individual', country: 'JE', sector: 'professional_services', product: 'wealth_mgmt', channel: 'introduced', pep: true, entityId: 'ENT-0021', stage: 'edd_review', activityBaseK: 120, expectedActivity: 'Private-banking mandate; self-declared politically-exposed (family member in public office).', ubo: null }),

  // ── Corporates onshore / EU (private companies) ──
  A({ id: 'APP-0004', legalName: 'Montreux Trading S.à r.l.', type: 'private_company', country: 'LU', sector: 'general_trade', product: 'trade_finance', channel: 'remote_verified', pep: false, entityId: 'ENT-0045', stage: 'approved', activityBaseK: 400, expectedActivity: 'Luxembourg trading company; routine EU trade-finance flows with documented counterparties.', ubo: 'Single disclosed UBO (Montreux family, 100%).' }),
  A({ id: 'APP-0005', legalName: 'Nyon Management AG', type: 'private_company', country: 'ZH', sector: 'professional_services', product: 'current_account', channel: 'branch', pep: false, entityId: 'ENT-0059', stage: 'approved', activityBaseK: 90, expectedActivity: 'Zürich management company; low-velocity operating account.', ubo: 'Two disclosed shareholders (60/40), both verified.' }),
  A({ id: 'APP-0006', legalName: 'Peregrine Commodities AG', type: 'private_company', country: 'ZG', sector: 'commodities', product: 'trade_finance', channel: 'introduced', pep: false, entityId: 'ENT-0061', stage: 'edd_review', activityBaseK: 850, expectedActivity: 'Zug commodity trader; cross-border trade-finance with offshore intermediaries — adverse-media flagged.', ubo: 'Disclosed UBO via a Zug holding; one layer of ownership.' }),

  // ── Higher-risk corporates: offshore holdings / SPVs / trusts ──
  A({ id: 'APP-0007', legalName: 'Castellan Asset Ltd', type: 'holding_company', country: 'BVI', sector: 'real_estate', product: 'custody', channel: 'introduced', pep: false, entityId: 'ENT-0048', stage: 'edd_review', activityBaseK: 1200, expectedActivity: 'BVI holding vehicle for cross-border real-estate assets; introduced by a corporate-services provider.', ubo: 'UBO declared behind a two-layer offshore structure; nominee director on record.' }),
  A({ id: 'APP-0008', legalName: 'Sberbank Europe Holding', type: 'holding_company', country: 'ZG', sector: 'commodities', product: 'fx_payments', channel: 'introduced', pep: false, entityId: 'ENT-0065', stage: 'screening', activityBaseK: 1500, expectedActivity: 'Zug commodities holding; large FX / cross-border payments — name matches a real public sanctions listing (OFAC SDN).', ubo: 'UBO declared; ownership chain crosses two jurisdictions.' }),
  A({ id: 'APP-0009', legalName: 'Wagner Group Logistics', type: 'trust', country: 'SG', sector: 'professional_services', product: 'wealth_mgmt', channel: 'introduced', pep: false, entityId: 'ENT-0075', stage: 'screening', activityBaseK: 2200, expectedActivity: 'Singapore private-trust vehicle; discretionary wealth mandate — name matches a real public sanctions listing.', ubo: 'Discretionary beneficiaries; settlor and protector disclosed under enhanced review.' }),
  A({ id: 'APP-0010', legalName: 'Silverpeak Maritime Ltd', type: 'private_company', country: 'MT', sector: 'commodities', product: 'trade_finance', channel: 'correspondent_ref', pep: false, entityId: 'ENT-0081', stage: 'edd_review', activityBaseK: 1800, expectedActivity: 'Malta maritime/commodities company; correspondent-referred trade finance — adverse-media flagged.', ubo: 'UBO disclosed; vessel-owning single-ship company structure.' }),

  // ── Very-high / prohibited-leaning: sanctions + offshore + crypto/correspondent ──
  A({ id: 'APP-0011', legalName: 'Gazprombank Trading Ltd', type: 'private_company', country: 'JE', sector: 'money_services', product: 'correspondent', channel: 'correspondent_ref', pep: false, entityId: 'ENT-0040', stage: 'screening', activityBaseK: 3000, expectedActivity: 'Jersey secretarial / money-services firm requesting a correspondent product — name matches a real public sanctions listing.', ubo: 'Corporate-services provider; UBO behind a nominee structure — not fully resolved.' }),
  A({ id: 'APP-0012', legalName: 'Montreux Invest Ltd', type: 'holding_company', country: 'BVI', sector: 'crypto', product: 'crypto_gateway', channel: 'remote_unverified', pep: false, entityId: 'ENT-0072', stage: 'edd_review', activityBaseK: 2600, expectedActivity: 'BVI SPV seeking a virtual-asset gateway; document-only remote onboarding — highest-risk product + geography combination.', ubo: 'UBO declared; two-layer offshore holding, one dormant intermediary.' }),

  // ── Mid-range corporates (varied jurisdictions) ──
  A({ id: 'APP-0013', legalName: 'Cornavin Global Ltd', type: 'private_company', country: 'HK', sector: 'commodities', product: 'fx_payments', channel: 'remote_verified', pep: false, entityId: 'ENT-0050', stage: 'approved', activityBaseK: 700, expectedActivity: 'Hong Kong commodities trader; cross-border FX — adverse-media flagged (two items).', ubo: 'UBO disclosed; single Hong Kong holding.' }),
  A({ id: 'APP-0014', legalName: 'Aurelia Partners Ltd', type: 'partnership', country: 'MT', sector: 'gambling', product: 'current_account', channel: 'remote_verified', pep: false, entityId: 'ENT-0077', stage: 'screening', activityBaseK: 500, expectedActivity: 'Malta gaming partnership; operating account — adverse-media flagged (two items).', ubo: 'Two general partners disclosed; source of funds under review.' }),
  A({ id: 'APP-0015', legalName: 'Meridian Invest SA', type: 'private_company', country: 'GE', sector: 'banking', product: 'custody', channel: 'branch', pep: false, entityId: 'ENT-0064', stage: 'approved', activityBaseK: 300, expectedActivity: 'Geneva investment company; custody mandate — a weak internal-list match only.', ubo: 'UBO disclosed; single Geneva holding, fully verified.' }),

  // ── A clean lower-risk corporate + a clean individual (no linked entity) ──
  A({ id: 'APP-0016', legalName: 'Helvetia Retail Individuals', type: 'sole_trader', country: 'VD', sector: 'general_trade', product: 'current_account', channel: 'branch', pep: false, entityId: null, stage: 'approved', activityBaseK: 40, expectedActivity: 'Vaud-based sole trader; small retail-goods operating account. No Sovereign Nexus link on file.', ubo: null }),
  // ── A deliberately Prohibited case: name matches a synthetic SANCTIONS entry ──
  A({ id: 'APP-0018', legalName: 'Bank Melli Iran', type: 'holding_company', country: 'BVI', sector: 'commodities', product: 'correspondent', channel: 'correspondent_ref', pep: false, entityId: null, stage: 'rejected', activityBaseK: 4000, expectedActivity: 'BVI commodities SPV requesting a correspondent product — the legal name is a STRONG match to a real public sanctions-list entry; a hard-stop / decline posture applies.', ubo: 'UBO not resolved; introduced through a correspondent referral. Name matches a real public sanctions listing.' }),
  A({ id: 'APP-0017', legalName: 'Lémanic Partners AG', type: 'private_company', country: 'ZG', sector: 'technology', product: 'savings', channel: 'remote_verified', pep: false, entityId: 'ENT-0076', stage: 'approved', activityBaseK: 60, expectedActivity: 'Zug technology company; low-risk savings product; clean screening.', ubo: 'Founder-owned; single disclosed UBO.' }),
]);
export const APPLICANT_BY_ID = Object.freeze(Object.fromEntries(APPLICANTS.map((a) => [a.id, a])));

// The disclaimer every onboarding API response / view carries.
export const ONBOARDING_DISCLAIMER =
  'Synthetic demonstration KYC / onboarding register. Every applicant, its ownership, declared activity, product and channel is FICTIONAL and generated deterministically for demonstration; nothing here refers to a real customer or person. The customer-risk rating is an illustrative application of a REAL, publicly-documented CDD/EDD risk-factor weighting methodology (customer-type × geography × industry × product × channel × screening × adverse-media) to synthetic inputs — the methodology is legitimate, the data is not, and a rating is NOT a factual allegation against any party. This is NOT a KYC / onboarding system of record and NOT compliance advice.';

// A stable version stamp (bump if the register changes) so the UI can display it.
export const ONBOARDING_VERSION = Object.freeze({
  version: '1.0.0',
  applicants: APPLICANTS.length,
  customerTypes: CUSTOMER_TYPES.length,
  products: PRODUCTS.length,
  channels: CHANNELS.length,
  factors: RISK_FACTORS.length,
});
