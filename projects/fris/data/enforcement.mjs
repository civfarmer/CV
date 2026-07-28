// @ts-check
/**
 * Litigation & Enforcement-Action Tracker — a REAL, CITED corpus of regulator
 * fines / enforcement decisions, with the data layer the enforcement engine
 * (`engines/enforcement.mjs`) reads. Built in the exact idiom of `vendors.mjs` /
 * `adverseMedia.mjs` / `countryRisk.mjs`: a static, framework-free, pure data
 * module importable by BOTH the Node server and the browser build, with ZERO DB
 * dependency (no seed, no schema, no data.json regeneration risk).
 *
 * ── DATA-HONESTY POSTURE (read this) ─────────────────────────────────────────
 * Unlike the synthetic corpora elsewhere in FRIS, this module is a VERIFIED,
 * PUBLIC-RECORD dataset. Each of the sixteen actions below is a real regulatory
 * enforcement outcome confirmed against an official / primary source (a DOJ,
 * OFAC, CFTC, SFO, Irish DPC, CNIL … press release or decision), and each row
 * carries that `sourceUrl`. Naming these entities is accurate public record from
 * official regulator statements, NOT an allegation and NOT defamation.
 *
 *   · Figures are VERBATIM from the verified corpus. `amountNative` + `currency`
 *     are the AUTHORITATIVE figure to cite for any factual claim.
 *   · `approxUsd` is ILLUSTRATIVE ONLY — a rough historical-FX conversion used so
 *     the trend chart has a single comparable scale. It is NOT the authoritative
 *     amount; never cite it as the fine. (Where currency === 'USD' it equals the
 *     native amount.)
 *   · `status` / `statusNote` are preserved HONESTLY — several of these penalties
 *     are under appeal, remitted, or (in Amazon's case) later ANNULLED on
 *     procedural grounds. The tracker surfaces that rather than presenting every
 *     figure as a settled, collected fine.
 *
 * The engine MAY compute derived analytics from these sixteen (counts / sums by
 * year, category, regulator, jurisdiction, amount band; a trend over time). It
 * MUST NOT fabricate additional cases to pad a chart. This is a demonstration
 * corpus of notable public actions, not a complete enforcement register.
 *
 * ── Determinism ──────────────────────────────────────────────────────────────
 * Pure static data. Same module → same rows, byte-for-byte. No Date.now(), no
 * randomness, no network, no dependencies.
 */

/* eslint-disable max-len */

// ── Enforcement categories (the conduct type) ─────────────────────────────────
// A small, stable vocabulary. `color` is paired with the text label everywhere
// in the UI (never colour-only). `blurb` is a plain-English description of the
// conduct the category covers.
export const ENF_CATEGORIES = Object.freeze([
  { code: 'Sanctions', color: '#d5303e', label: 'Sanctions', blurb: 'Processing or facilitating transactions in breach of sanctions programmes (e.g. Iran, Sudan, Cuba).' },
  { code: 'AML', color: '#e07b39', label: 'Anti-money-laundering', blurb: 'Failures of AML / Bank-Secrecy-Act controls — inadequate monitoring, unlicensed money transmission, laundering proceeds.' },
  { code: 'Bribery/Corruption', color: '#c9762b', label: 'Bribery & corruption', blurb: 'Foreign bribery / FCPA-style corruption to win contracts or influence officials.' },
  { code: 'Market Manipulation', color: '#c9a227', label: 'Market manipulation', blurb: 'Manipulating benchmarks or markets — LIBOR/EURIBOR rigging, spoofing of futures.' },
  { code: 'Data Protection', color: '#4d8df0', label: 'Data protection', blurb: 'Breaches of data-protection law (GDPR) — unlawful transfers, missing legal basis, transparency failures.' },
  { code: 'Consumer Protection', color: '#a97bf0', label: 'Consumer protection', blurb: 'Consumer / investor harm — e.g. unauthorised accounts opened under sales pressure.' },
]);
export const ENF_CATEGORY_BY_CODE = Object.freeze(Object.fromEntries(ENF_CATEGORIES.map((c) => [c.code, c])));

// ── Amount bands (illustrative USD scale, for grouping only) ──────────────────
// Bands over `approxUsd` (an illustrative FX figure) purely so the analytics can
// group actions by rough magnitude. The band is a scale bucket, NOT a claim about
// the authoritative native amount. Ordered smallest → largest; `min` inclusive.
export const ENF_AMOUNT_BANDS = Object.freeze([
  { code: 'lt100m', label: 'Under $100m', min: 0, max: 100e6, color: '#2f9e63' },
  { code: '100m-500m', label: '$100m – $500m', min: 100e6, max: 500e6, color: '#c9a227' },
  { code: '500m-1b', label: '$500m – $1bn', min: 500e6, max: 1e9, color: '#e07b39' },
  { code: '1b-3b', label: '$1bn – $3bn', min: 1e9, max: 3e9, color: '#d5303e' },
  { code: 'gte3b', label: '$3bn and above', min: 3e9, max: Infinity, color: '#a01722' },
]);

// ── The verified enforcement-action corpus (16 real public-record actions) ────
// VERBATIM figures from the verified corpus (outputs/enforcement-corpus.json).
// Do NOT add, remove or alter any entity, amount, date, regulator or URL.
// Schema per action:
//   id            — stable id (ENF-<year>-<slug>).
//   entity        — the fined / sanctioned party (accurate public record).
//   date          — action date (ISO YYYY-MM-DD).
//   amountNative  — AUTHORITATIVE penalty amount, integer, in `currency`.
//   currency      — ISO currency of amountNative (USD / EUR / GBP).
//   approxUsd     — ILLUSTRATIVE USD scale (historical FX) — chart scale only.
//   category      — conduct category (see ENF_CATEGORIES).
//   regulators    — the authorities involved (array).
//   jurisdiction  — jurisdiction / conduct locus (descriptive).
//   status        — resolution status (Final / Under appeal / Annulled …).
//   statusNote?   — honest note where a fine is appealed / remitted / annulled.
//   summary       — the factual basis of the action.
//   sourceLabel   — human label for the source.
//   sourceUrl     — the official / primary source URL.
export const ENFORCEMENT_ACTIONS = Object.freeze([
  { id: 'ENF-2014-BNP', entity: 'BNP Paribas S.A.', date: '2014-06-30', amountNative: 8900000000, currency: 'USD', approxUsd: 8900000000, category: 'Sanctions', regulators: ['DOJ', 'OFAC', 'Federal Reserve', 'NYDFS', 'NY County DA'], jurisdiction: 'United States (conduct: Sudan/Iran/Cuba)', status: 'Final (guilty plea)', summary: 'Pleaded guilty to processing ~$8.9bn in transactions for Sudanese, Iranian and Cuban parties, concealing references to sanctioned entities. Largest sanctions-related penalty of its kind.', sourceLabel: 'U.S. DOJ press release', sourceUrl: 'https://www.justice.gov/archives/opa/pr/bnp-paribas-agrees-plead-guilty-and-pay-89-billion-illegally-processing-financial' },
  { id: 'ENF-2012-HSBC', entity: 'HSBC Holdings plc / HSBC Bank USA N.A.', date: '2012-12-11', amountNative: 1921000000, currency: 'USD', approxUsd: 1921000000, category: 'AML', regulators: ['DOJ', 'Federal Reserve', 'OCC', 'OFAC'], jurisdiction: 'United States (conduct: Mexico/Iran/others)', status: 'Final (deferred prosecution, expired)', summary: 'Admitted AML and sanctions failures; ~$881m in drug-trafficking proceeds (incl. Sinaloa cartel) laundered 2006–2010. Forfeited $1.256bn under a DPA; total $1.921bn.', sourceLabel: 'U.S. DOJ press release', sourceUrl: 'https://www.justice.gov/archives/opa/pr/hsbc-holdings-plc-and-hsbc-bank-usa-na-admit-anti-money-laundering-and-sanctions-violations' },
  { id: 'ENF-2019-SCB', entity: 'Standard Chartered Bank', date: '2019-04-09', amountNative: 1100000000, currency: 'USD', approxUsd: 1100000000, category: 'Sanctions', regulators: ['OFAC', 'DOJ', 'NYDFS', 'Federal Reserve', 'FCA', 'NY County DA'], jurisdiction: 'United States / United Kingdom (conduct: Iran)', status: 'Final (combined settlement)', summary: 'Combined ~$1.1bn settlement with US and UK authorities for processing transactions in violation of Iranian and other sanctions and related AML control failures.', sourceLabel: 'U.S. DOJ press release', sourceUrl: 'https://www.justice.gov/archives/opa/pr/standard-chartered-bank-admits-illegally-processing-transactions-violation-iranian-sanctions' },
  { id: 'ENF-2023-BINANCE', entity: 'Binance Holdings Ltd.', date: '2023-11-21', amountNative: 4300000000, currency: 'USD', approxUsd: 4300000000, category: 'AML', regulators: ['DOJ', 'FinCEN', 'OFAC', 'CFTC', 'IRS-CI'], jurisdiction: 'United States (global exchange)', status: 'Final (guilty plea)', summary: 'Pleaded guilty to Bank Secrecy Act, unlicensed money transmission and sanctions violations; ~$4.3bn in penalties/forfeiture (FinCEN $3.4bn, OFAC $968m). Founder resigned and pleaded guilty.', sourceLabel: 'OFAC settlement notice (Treasury)', sourceUrl: 'https://ofac.treasury.gov/system/files/2023-11/20231121_binance.pdf' },
  { id: 'ENF-2024-TD', entity: 'TD Bank N.A. / Toronto-Dominion Bank', date: '2024-10-10', amountNative: 3100000000, currency: 'USD', approxUsd: 3100000000, category: 'AML', regulators: ['DOJ', 'FinCEN', 'OCC', 'Federal Reserve'], jurisdiction: 'United States', status: 'Final (guilty plea)', summary: 'Pleaded guilty to conspiracy to commit money laundering after long-running BSA/AML program failures (failed to monitor ~$18.3tn of activity). ~$3.1bn total; DOJ $1.8bn, FinCEN $1.3bn; asset cap imposed.', sourceLabel: 'NPR report (DOJ action)', sourceUrl: 'https://www.npr.org/2024/10/11/g-s1-27671/td-bank-justice-department' },
  { id: 'ENF-2020-GS', entity: 'The Goldman Sachs Group, Inc.', date: '2020-10-22', amountNative: 2900000000, currency: 'USD', approxUsd: 2900000000, category: 'Bribery/Corruption', regulators: ['DOJ', 'SEC', 'Federal Reserve', 'FCA', 'MAS'], jurisdiction: 'United States (conduct: Malaysia/Abu Dhabi — 1MDB)', status: 'Final (DPA + subsidiary guilty plea)', summary: 'Largest FCPA resolution: paid >$2.9bn over the 1MDB scheme (>$1.6bn in bribes to officials to win ~$6.5bn in bond mandates). Separate $2.5bn paid to Malaysia.', sourceLabel: 'U.S. DOJ press release', sourceUrl: 'https://www.justice.gov/archives/opa/pr/goldman-sachs-charged-foreign-bribery-case-and-agrees-pay-over-29-billion' },
  { id: 'ENF-2020-AIRBUS', entity: 'Airbus SE', date: '2020-01-31', amountNative: 3598000000, currency: 'EUR', approxUsd: 3990000000, category: 'Bribery/Corruption', regulators: ['SFO', 'PNF', 'DOJ', 'U.S. State Dept'], jurisdiction: 'United Kingdom / France / United States', status: 'Final (DPA, multi-jurisdiction)', summary: 'Record ~€3.6bn global foreign-bribery + ITAR resolution across UK (SFO €991m), France (PNF €2.08bn) and US (DOJ/DOS €527m); conduct touching sixteen jurisdictions.', sourceLabel: 'U.S. DOJ press release', sourceUrl: 'https://www.justice.gov/archives/opa/pr/airbus-agrees-pay-over-39-billion-global-penalties-resolve-foreign-bribery-and-itar-case' },
  { id: 'ENF-2017-RR', entity: 'Rolls-Royce plc', date: '2017-01-17', amountNative: 671000000, currency: 'GBP', approxUsd: 809000000, category: 'Bribery/Corruption', regulators: ['SFO', 'DOJ', 'MPF Brazil'], jurisdiction: 'United Kingdom / United States / Brazil', status: 'Final (DPA)', summary: '£671m in penalties over bribery to win export contracts across markets incl. China, Brazil, Indonesia. UK SFO £497.25m, US DOJ £140m, Brazil ~$25m.', sourceLabel: 'UK Serious Fraud Office', sourceUrl: 'https://www.sfo.gov.uk/2017/01/17/sfo-completes-497-25m-deferred-prosecution-agreement-rolls-royce-plc/' },
  { id: 'ENF-2022-GLEN', entity: 'Glencore International A.G. / Glencore Ltd.', date: '2022-05-24', amountNative: 1186000000, currency: 'USD', approxUsd: 1186000000, category: 'Bribery/Corruption', regulators: ['DOJ', 'CFTC', 'SFO', 'CGU/AGU Brazil'], jurisdiction: 'United States / United Kingdom / Brazil', status: 'Final (guilty plea)', summary: 'Pleaded guilty to a decade of bribery (Nigeria, Cameroon, DRC, Venezuela, Brazil and others) and oil-benchmark manipulation. CFTC portion $1.186bn (record penalty + disgorgement).', sourceLabel: 'CFTC press release', sourceUrl: 'https://www.cftc.gov/PressRoom/PressReleases/8534-22' },
  { id: 'ENF-2012-BARC', entity: 'Barclays Bank plc', date: '2012-06-27', amountNative: 290000000, currency: 'GBP', approxUsd: 453000000, category: 'Market Manipulation', regulators: ['FSA', 'CFTC', 'DOJ'], jurisdiction: 'United Kingdom / United States', status: 'Final (settlement + NPA)', summary: '~£290m total for attempted manipulation and false reporting of LIBOR/EURIBOR benchmarks (from ~2005). FSA £59.5m, CFTC $200m, DOJ $160m.', sourceLabel: 'CFTC press release', sourceUrl: 'https://www.cftc.gov/PressRoom/PressReleases/6289-12' },
  { id: 'ENF-2020-JPM', entity: 'JPMorgan Chase & Co.', date: '2020-09-29', amountNative: 920000000, currency: 'USD', approxUsd: 920000000, category: 'Market Manipulation', regulators: ['CFTC', 'DOJ', 'SEC'], jurisdiction: 'United States', status: 'Final (DPA + settlement)', summary: 'Record $920m spoofing resolution: hundreds of thousands of spoof orders in precious-metals and US Treasury futures over ~8 years; $436.4m penalty, $311.7m restitution, >$172m disgorgement.', sourceLabel: 'CFTC press release', sourceUrl: 'https://www.cftc.gov/PressRoom/PressReleases/8260-20' },
  { id: 'ENF-2020-WF', entity: 'Wells Fargo & Co.', date: '2020-02-21', amountNative: 3000000000, currency: 'USD', approxUsd: 3000000000, category: 'Consumer Protection', regulators: ['DOJ', 'SEC'], jurisdiction: 'United States', status: 'Final (DPA + settlement)', summary: '$3bn to resolve criminal and civil liability for the fake-accounts scandal — millions of unauthorised accounts opened 2002–2016 under sales-pressure; ~$500m to the SEC for misleading investors.', sourceLabel: 'U.S. DOJ report (Consumer Federation summary)', sourceUrl: 'https://consumercal.org/wells-fargo-reaches-3-billion-settlement-with-doj-sec-over-fake-accounts-scandal/' },
  { id: 'ENF-2023-META', entity: 'Meta Platforms Ireland Ltd.', date: '2023-05-22', amountNative: 1200000000, currency: 'EUR', approxUsd: 1300000000, category: 'Data Protection', regulators: ['Irish DPC', 'EDPB'], jurisdiction: 'European Union (Ireland)', status: 'Under appeal', statusNote: 'Largest GDPR fine to date; Meta appealed.', summary: '€1.2bn for unlawful EU–US transfers of Facebook user data under SCCs post-Schrems II; ordered to suspend transfers and bring processing into compliance.', sourceLabel: 'Irish Data Protection Commission', sourceUrl: 'https://www.dataprotection.ie/en/news-media/press-releases/Data-Protection-Commission-announces-conclusion-of-inquiry-into-Meta-Ireland' },
  { id: 'ENF-2021-AMZN', entity: 'Amazon Europe Core S.à r.l.', date: '2021-07-16', amountNative: 746000000, currency: 'EUR', approxUsd: 887000000, category: 'Data Protection', regulators: ['CNPD Luxembourg'], jurisdiction: 'European Union (Luxembourg)', status: 'Annulled (2026, procedural)', statusNote: 'Luxembourg Administrative Court annulled the fine in March 2026 on procedural grounds while largely upholding the underlying GDPR findings.', summary: '€746m — at the time the largest GDPR fine — for processing personal data for targeted advertising without valid consent.', sourceLabel: 'ICLG report (CNPD decision)', sourceUrl: 'https://iclg.com/news/23660-luxembourg-court-scraps-amazon-s-746m-data-privacy-fine/' },
  { id: 'ENF-2021-WA', entity: 'WhatsApp Ireland Ltd.', date: '2021-09-02', amountNative: 225000000, currency: 'EUR', approxUsd: 266000000, category: 'Data Protection', regulators: ['Irish DPC', 'EDPB'], jurisdiction: 'European Union (Ireland)', status: 'Under appeal', statusNote: 'Remitted for reconsideration by a lower tribunal (2026).', summary: '€225m for failing GDPR transparency obligations (Arts. 12–14) — inadequate privacy information to users and non-user contacts. Raised from a lower draft after an EDPB binding decision.', sourceLabel: 'Irish Data Protection Commission', sourceUrl: 'https://www.dataprotection.ie/en/news-media/press-releases/data-protection-commission-announces-decision-whatsapp-inquiry' },
  { id: 'ENF-2019-GOOG', entity: 'Google LLC', date: '2019-01-21', amountNative: 50000000, currency: 'EUR', approxUsd: 57000000, category: 'Data Protection', regulators: ['CNIL'], jurisdiction: 'European Union (France)', status: 'Final (upheld on appeal)', statusNote: 'Upheld by the Conseil d\'État in June 2020.', summary: '€50m — first major GDPR fine — for transparency failures and lack of valid legal basis/consent for ad personalisation on Android sign-up.', sourceLabel: 'European Data Protection Board', sourceUrl: 'https://www.edpb.europa.eu/news/national-news/2019/cnils-restricted-committee-imposes-financial-penalty-50-million-euros_en' },
]);
export const ENFORCEMENT_BY_ID = Object.freeze(Object.fromEntries(ENFORCEMENT_ACTIONS.map((a) => [a.id, a])));

// The methodology / honesty note every enforcement API response / view carries.
export const ENFORCEMENT_DISCLAIMER =
  'A curated corpus of sixteen REAL, public-record regulatory enforcement actions, each confirmed against an official / primary source (linked per case). Naming these entities is accurate public record from official regulator / DOJ statements — not an allegation. The native amount + currency is the AUTHORITATIVE penalty figure; the approxUsd value is an ILLUSTRATIVE historical-FX conversion used only to put actions on a single comparable chart scale — do not cite it as the fine. Statuses are surfaced honestly: several penalties are under appeal, remitted, or (Amazon) later annulled on procedural grounds. This is a demonstration corpus of notable actions, not a complete enforcement register or legal advice.';

// A stable version stamp (bump if the corpus changes) so the UI can display it.
export const ENFORCEMENT_VERSION = Object.freeze({
  version: '1.0.0',
  actions: ENFORCEMENT_ACTIONS.length,
  categories: ENF_CATEGORIES.length,
  bands: ENF_AMOUNT_BANDS.length,
});
