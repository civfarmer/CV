// @ts-check
/**
 * Country & Sector Risk Index — CATEGORICAL reference data for a sourced,
 * jurisdiction × risk-dimension heat-map / index.
 *
 * The data layer the country-risk engine (`engines/countryRisk.mjs`) reads. Built
 * in the exact idiom of `watchlists.mjs` / `vendors.mjs` / `financials.mjs`: a
 * static, framework-free, pure data module importable by BOTH the Node server and
 * the browser build, with ZERO DB dependency (no seed, no schema, no data.json
 * regeneration risk).
 *
 * ── DATA-HONESTY POSTURE (read this) ─────────────────────────────────────────
 * This module is deliberately CATEGORICAL and ILLUSTRATIVE. It uses risk *BANDS*
 * and neutral *LABELS* (Low / Moderate / High / Very-high), NOT copyrighted
 * numeric indices. Specifically:
 *   · It does NOT reproduce, embed or approximate any copyrighted scored index
 *     (e.g. no Corruption Perceptions Index score, no Financial Secrecy Index
 *     numeric value, no Basel AML score). Where a real, publicly-embeddable FRIS
 *     fact exists — a jurisdiction's own secrecy score and offshore flag from the
 *     seeded `jurisdictions`/`pools.mjs` data — the ENGINE reuses THAT and cites
 *     it; this module only supplies the categorical bands the engine cannot
 *     derive from a single secrecy number.
 *   · AML/CFT posture is described GENERICALLY as a monitoring *category*
 *     ("standard" / "enhanced-monitoring" / "call-for-action" in a FATF-STYLE
 *     sense). It is NOT a copy of any real greylist/blacklist and does NOT assert
 *     that a named place is on any real list as a matter of fact; the bands here
 *     are an illustrative modelling posture for a demonstration heat-map.
 *   · The bands below reflect broad, publicly-known-STYLE reputational
 *     characteristics (an offshore secrecy centre carries higher financial-
 *     secrecy risk than an onshore EU canton) expressed as coarse categories, so
 *     the heat-map is directionally sensible without asserting a precise score.
 *
 * In short: real, embeddable neutral facts (secrecy score, offshore status) come
 * from the seeded data and are cited; everything categorical here is an
 * illustrative demonstration posture and is labelled as such. This is NOT a
 * country-risk system of record.
 *
 * ── Determinism ──────────────────────────────────────────────────────────────
 * Pure static data. Same module → same rows, byte-for-byte. No Date.now(), no
 * randomness, no network, no dependencies.
 *
 * All records carry `data_classification: 'illustrative-categorical'`.
 */

/* eslint-disable max-len */

// ── Ordinal risk bands (the shared vocabulary for every dimension) ────────────
// A small, ordered set of categorical bands. `level` gives a stable ordinal
// (0..3) the engine uses to compose an overall band WITHOUT inventing a
// copyrighted numeric score; `color` is the heat-map cell colour (colour is
// ALWAYS paired with the text label in the UI — never colour-only).
export const RISK_BANDS = Object.freeze([
  { code: 'Low', level: 0, color: '#2f9e63', label: 'Low', blurb: 'Limited inherent risk on this dimension; standard controls typically suffice.' },
  { code: 'Moderate', level: 1, color: '#c9a227', label: 'Moderate', blurb: 'Elevated inherent risk; document rationale and apply proportionate controls.' },
  { code: 'High', level: 2, color: '#e07b39', label: 'High', blurb: 'High inherent risk; enhanced due diligence and senior oversight expected.' },
  { code: 'Very-high', level: 3, color: '#d5303e', label: 'Very high', blurb: 'Severe inherent risk; treat as a red flag and escalate before proceeding.' },
]);
export const BAND_BY_CODE = Object.freeze(Object.fromEntries(RISK_BANDS.map((b) => [b.code, b])));
export const MAX_BAND_LEVEL = RISK_BANDS.reduce((m, b) => Math.max(m, b.level), 0);

// ── Risk dimensions (the heat-map columns) ────────────────────────────────────
// Each dimension: a stable key, a short column label, a longer description, and a
// weight used when the engine composes the overall jurisdiction band. Weights are
// relative importance only (they normalise); they are NOT a score.
export const RISK_DIMENSIONS = Object.freeze([
  { key: 'financial_secrecy', label: 'Financial secrecy', weight: 20, short: 'Secrecy', description: 'Opacity of company ownership, banking secrecy and the ease of hiding beneficial ownership. Anchored to the jurisdiction’s own secrecy score / offshore status from the seeded data where available.' },
  { key: 'aml_cft', label: 'AML/CFT posture', weight: 22, short: 'AML/CFT', description: 'Anti-money-laundering / counter-terrorist-financing supervisory posture, described GENERICALLY in a FATF-style category (standard / enhanced-monitoring / call-for-action). Illustrative — not an assertion of real list membership.' },
  { key: 'corruption', label: 'Corruption perception', weight: 16, short: 'Corruption', description: 'Perceived public-sector corruption expressed as a coarse BAND (Low / Moderate / High). Categorical only — NOT a copyrighted corruption-perception score.' },
  { key: 'sanctions_exposure', label: 'Sanctions exposure', weight: 18, short: 'Sanctions', description: 'Illustrative exposure to sanctions programmes and sanctions-evasion typologies routed through the jurisdiction (as a modelling posture, not a legal determination).' },
  { key: 'rule_of_law', label: 'Rule of law / political', weight: 14, short: 'Rule of law', description: 'Rule-of-law strength, political stability and the reliability of legal remedies, as a coarse band.' },
  { key: 'tax_transparency', label: 'Tax transparency', weight: 10, short: 'Tax', description: 'Participation in tax-transparency / information-exchange norms and the risk of the jurisdiction being used for tax-driven structuring, as a coarse band.' },
]);
export const DIMENSION_BY_KEY = Object.freeze(Object.fromEntries(RISK_DIMENSIONS.map((d) => [d.key, d])));

// ── The categorical jurisdiction risk table ───────────────────────────────────
// Keyed by the SAME jurisdiction code used across FRIS (jurisdictions/pools.mjs)
// plus a few extra major jurisdictions so the index is not purely offshore.
// Each row carries ONLY categorical band codes per dimension (see RISK_BANDS).
// `name`/`country`/`region` mirror the seeded facts where the code overlaps; for
// the extra codes they are plain descriptive labels. `note` is a one-line,
// clearly-illustrative rationale.
//
// IMPORTANT: `financial_secrecy` here is a categorical fallback. When the code
// overlaps a seeded jurisdiction, the ENGINE overrides this with a band derived
// from that jurisdiction's REAL secrecy score + offshore flag, and says so.
export const COUNTRY_RISK = Object.freeze([
  // — Switzerland (onshore cantons; seeded) —
  { code: 'GE', name: 'Geneva', country: 'Switzerland', region: 'Switzerland', bands: { financial_secrecy: 'Moderate', aml_cft: 'Low', corruption: 'Low', sanctions_exposure: 'Low', rule_of_law: 'Low', tax_transparency: 'Low' }, note: 'Onshore Swiss canton with strong supervision; residual secrecy risk from private-banking heritage.' },
  { code: 'VD', name: 'Vaud', country: 'Switzerland', region: 'Switzerland', bands: { financial_secrecy: 'Moderate', aml_cft: 'Low', corruption: 'Low', sanctions_exposure: 'Low', rule_of_law: 'Low', tax_transparency: 'Low' }, note: 'Onshore Swiss canton; well-supervised, low illustrative risk across most dimensions.' },
  { code: 'ZG', name: 'Zug', country: 'Switzerland', region: 'Switzerland', bands: { financial_secrecy: 'High', aml_cft: 'Moderate', corruption: 'Low', sanctions_exposure: 'Moderate', rule_of_law: 'Low', tax_transparency: 'Moderate' }, note: 'Commodity-trading and crypto hub; elevated secrecy and sector-linked exposure despite strong rule of law.' },
  { code: 'ZH', name: 'Zürich', country: 'Switzerland', region: 'Switzerland', bands: { financial_secrecy: 'Moderate', aml_cft: 'Low', corruption: 'Low', sanctions_exposure: 'Low', rule_of_law: 'Low', tax_transparency: 'Low' }, note: 'Major onshore financial centre; strong supervision, residual secrecy from banking scale.' },
  // — European Union (seeded + extra) —
  { code: 'LU', name: 'Luxembourg', country: 'Luxembourg', region: 'European Union', bands: { financial_secrecy: 'High', aml_cft: 'Moderate', corruption: 'Low', sanctions_exposure: 'Moderate', rule_of_law: 'Low', tax_transparency: 'Moderate' }, note: 'Large EU fund / holding-company centre; elevated secrecy and structuring exposure inside a strong-rule-of-law EU frame.' },
  { code: 'CY', name: 'Cyprus', country: 'Cyprus', region: 'European Union', bands: { financial_secrecy: 'High', aml_cft: 'High', corruption: 'Moderate', sanctions_exposure: 'High', rule_of_law: 'Moderate', tax_transparency: 'Moderate' }, note: 'EU member historically associated with corporate-services flows and sanctions-evasion typologies; enhanced-monitoring posture illustratively applied.' },
  { code: 'MT', name: 'Malta', country: 'Malta', region: 'European Union', bands: { financial_secrecy: 'High', aml_cft: 'High', corruption: 'Moderate', sanctions_exposure: 'Moderate', rule_of_law: 'Moderate', tax_transparency: 'Moderate' }, note: 'EU member with gaming / e-money concentration; enhanced-monitoring posture illustratively applied.' },
  { code: 'EU', name: 'European Union (general)', country: 'European Union', region: 'European Union', bands: { financial_secrecy: 'Moderate', aml_cft: 'Low', corruption: 'Low', sanctions_exposure: 'Moderate', rule_of_law: 'Low', tax_transparency: 'Low' }, note: 'Illustrative EU-wide baseline (a generic reference row) for entities booked "EU" without a specific member state.' },
  // — Offshore secrecy centres (seeded) —
  { code: 'BVI', name: 'British Virgin Islands', country: 'British Virgin Islands', region: 'Offshore', bands: { financial_secrecy: 'Very-high', aml_cft: 'High', corruption: 'Moderate', sanctions_exposure: 'High', rule_of_law: 'Moderate', tax_transparency: 'High' }, note: 'Classic offshore incorporation centre; very-high secrecy and tax-structuring exposure in a demonstration posture.' },
  { code: 'KY', name: 'Cayman Islands', country: 'Cayman Islands', region: 'Offshore', bands: { financial_secrecy: 'Very-high', aml_cft: 'High', corruption: 'Moderate', sanctions_exposure: 'Moderate', rule_of_law: 'Moderate', tax_transparency: 'High' }, note: 'Major offshore funds / SPV domicile; very-high secrecy and tax-transparency exposure illustratively.' },
  { code: 'JE', name: 'Jersey', country: 'Jersey', region: 'Offshore', bands: { financial_secrecy: 'High', aml_cft: 'Moderate', corruption: 'Low', sanctions_exposure: 'Moderate', rule_of_law: 'Low', tax_transparency: 'High' }, note: 'Crown-dependency finance centre; high secrecy and tax exposure with comparatively strong governance.' },
  { code: 'GG', name: 'Guernsey', country: 'Guernsey', region: 'Offshore', bands: { financial_secrecy: 'High', aml_cft: 'Moderate', corruption: 'Low', sanctions_exposure: 'Moderate', rule_of_law: 'Low', tax_transparency: 'High' }, note: 'Crown-dependency finance centre; high secrecy and tax exposure with comparatively strong governance.' },
  { code: 'LI', name: 'Liechtenstein', country: 'Liechtenstein', region: 'Europe', bands: { financial_secrecy: 'High', aml_cft: 'Moderate', corruption: 'Low', sanctions_exposure: 'Moderate', rule_of_law: 'Low', tax_transparency: 'Moderate' }, note: 'Small European wealth / foundation centre; high secrecy exposure with strong rule of law.' },
  // — Asia (seeded) —
  { code: 'SG', name: 'Singapore', country: 'Singapore', region: 'Asia', bands: { financial_secrecy: 'Moderate', aml_cft: 'Low', corruption: 'Low', sanctions_exposure: 'Moderate', rule_of_law: 'Low', tax_transparency: 'Low' }, note: 'Well-regulated Asian hub; low corruption and strong supervision, residual secrecy from wealth-centre scale.' },
  { code: 'HK', name: 'Hong Kong', country: 'Hong Kong SAR', region: 'Asia', bands: { financial_secrecy: 'High', aml_cft: 'Moderate', corruption: 'Low', sanctions_exposure: 'High', rule_of_law: 'Moderate', tax_transparency: 'Moderate' }, note: 'Major Asian financial centre; elevated secrecy and cross-border sanctions-corridor exposure illustratively.' },
  // — Americas (seeded) —
  { code: 'DE-US', name: 'Delaware', country: 'United States', region: 'Americas', bands: { financial_secrecy: 'High', aml_cft: 'Low', corruption: 'Low', sanctions_exposure: 'Low', rule_of_law: 'Low', tax_transparency: 'Moderate' }, note: 'US incorporation state noted for entity-formation opacity; high secrecy despite low corruption and strong rule of law.' },
  // — A few extra MAJOR jurisdictions (not seeded) for breadth —
  { code: 'US', name: 'United States (general)', country: 'United States', region: 'Americas', bands: { financial_secrecy: 'Moderate', aml_cft: 'Low', corruption: 'Low', sanctions_exposure: 'Low', rule_of_law: 'Low', tax_transparency: 'Low' }, note: 'Illustrative US-wide baseline; strong enforcement, residual secrecy from state-level formation regimes.' },
  { code: 'GB', name: 'United Kingdom', country: 'United Kingdom', region: 'Europe', bands: { financial_secrecy: 'Moderate', aml_cft: 'Low', corruption: 'Low', sanctions_exposure: 'Moderate', rule_of_law: 'Low', tax_transparency: 'Low' }, note: 'Major onshore financial centre; strong supervision with residual secrecy from company-formation volume.' },
  { code: 'AE', name: 'United Arab Emirates', country: 'United Arab Emirates', region: 'Middle East', bands: { financial_secrecy: 'High', aml_cft: 'High', corruption: 'Moderate', sanctions_exposure: 'High', rule_of_law: 'Moderate', tax_transparency: 'High' }, note: 'Fast-growing trade / precious-metals hub; enhanced-monitoring posture and elevated corridor exposure illustratively applied.' },
  { code: 'PA', name: 'Panama', country: 'Panama', region: 'Americas', bands: { financial_secrecy: 'Very-high', aml_cft: 'High', corruption: 'High', sanctions_exposure: 'Moderate', rule_of_law: 'High', tax_transparency: 'High' }, note: 'Offshore incorporation and flag-of-convenience centre; very-high secrecy and tax exposure in a demonstration posture.' },
]);
export const COUNTRY_BY_CODE = Object.freeze(Object.fromEntries(COUNTRY_RISK.map((c) => [c.code, c])));

// ── The sector-risk table ─────────────────────────────────────────────────────
// Inherent risk BAND per business sector (the "how risky is this line of business,
// before you even look at the counterparty" view). Categorical only. `drivers`
// lists the plain-English reasons; `weight` positions the sector's inherent level
// on the 0..3 ordinal so `combined()` can blend it with the jurisdiction band.
export const SECTOR_RISK = Object.freeze([
  { code: 'crypto', label: 'Crypto / virtual assets', band: 'Very-high', drivers: ['Pseudonymous value transfer', 'Cross-border speed', 'Uneven VASP supervision', 'Mixer / bridge laundering typologies'], note: 'Virtual-asset activity is treated as inherently very-high risk in most AML frameworks.' },
  { code: 'cash_intensive', label: 'Cash-intensive businesses', band: 'High', drivers: ['High volume of untraceable cash', 'Easy commingling of illicit funds', 'Weak audit trail'], note: 'Cash-intensive operations (e.g. money-services, hospitality, retail FX) are a classic placement channel.' },
  { code: 'real_estate', label: 'Real estate', band: 'High', drivers: ['Large-value stores of value', 'Opaque ownership vehicles', 'Cross-border buyers'], note: 'Real estate is a well-documented laundering integration channel, often via offshore holding structures.' },
  { code: 'arms_dual_use', label: 'Arms / dual-use goods', band: 'Very-high', drivers: ['Export-control and sanctions exposure', 'Diversion / end-user risk', 'Proliferation-finance typologies'], note: 'Arms and dual-use trade carries severe sanctions, export-control and proliferation-finance risk.' },
  { code: 'gambling', label: 'Gambling / gaming', band: 'High', drivers: ['Cash and chip conversion', 'Anonymous play', 'Online cross-border flows'], note: 'Casinos and online gaming are high-risk for placement and layering.' },
  { code: 'precious_metals', label: 'Precious metals & stones', band: 'High', drivers: ['Portable high-value store of wealth', 'Weak provenance', 'Cash settlement'], note: 'Gold, diamonds and gems are high-value, portable and hard to trace — a favoured value-transfer channel.' },
  { code: 'commodities', label: 'Commodities & energy trading', band: 'High', drivers: ['Complex trade-finance chains', 'Offshore intermediaries', 'Sanctions-corridor exposure'], note: 'Commodity trading combines large flows, offshore intermediation and sanctions-corridor exposure.' },
  { code: 'money_services', label: 'Money services / remittance', band: 'High', drivers: ['Cash in / out', 'Cross-border corridors', 'Agent-network oversight gaps'], note: 'Money-services businesses handle cross-border cash flows with well-known layering exposure.' },
  { code: 'professional_services', label: 'Corporate / professional services', band: 'Moderate', drivers: ['Entity-formation gatekeeping', 'Nominee and trustee provision', 'Client-confidentiality tension'], note: 'Trust-and-company-service providers are gatekeepers that can be misused to create opacity.' },
  { code: 'banking', label: 'Banking & payments', band: 'Moderate', drivers: ['Correspondent-banking exposure', 'Volume and speed', 'Nested relationships'], note: 'Banking is heavily supervised but sits at the centre of most laundering typologies.' },
  { code: 'general_trade', label: 'General trade / manufacturing', band: 'Moderate', drivers: ['Trade-based laundering (over/under-invoicing)', 'Supply-chain complexity'], note: 'General trade carries moderate trade-based-money-laundering exposure.' },
  { code: 'technology', label: 'Technology / SaaS', band: 'Low', drivers: ['Limited direct value transfer', 'Lower cash exposure'], note: 'Most technology / SaaS activity is comparatively low inherent risk absent a payments or crypto angle.' },
]);
export const SECTOR_BY_CODE = Object.freeze(Object.fromEntries(SECTOR_RISK.map((s) => [s.code, s])));

// The disclaimer every country-risk API response / view carries.
export const COUNTRY_RISK_DISCLAIMER =
  'Illustrative, CATEGORICAL country & sector risk index. The per-dimension bands (Low / Moderate / High / Very-high), the FATF-STYLE AML/CFT categories and the corruption-perception BANDS are an illustrative modelling posture for demonstration — they are NOT copyrighted numeric indices, NOT an assertion that any named jurisdiction is on a real greylist / blacklist, and NOT legal, sanctions or compliance advice. Where a real, publicly-sourced FRIS fact exists (a jurisdiction’s own secrecy score and offshore status from the seeded data), it is reused and cited. This is NOT a country-risk system of record.';

// A stable version stamp (bump if the tables change) so the UI can display it.
export const COUNTRY_RISK_VERSION = Object.freeze({
  version: '1.0.0',
  jurisdictions: COUNTRY_RISK.length,
  dimensions: RISK_DIMENSIONS.length,
  sectors: SECTOR_RISK.length,
  bands: RISK_BANDS.length,
});
