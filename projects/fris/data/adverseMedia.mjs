// @ts-check
/**
 * Adverse-Media / OSINT Monitoring — deterministic SYNTHETIC negative-news corpus
 * for a clearly-fictional demonstration. This is the data layer the adverse-media
 * classification engine (`engines/adverseMedia.mjs`) reads. Built in the exact
 * idiom of `watchlists.mjs` / `vendors.mjs` / `financials.mjs`: a static,
 * framework-free, pure data module importable by BOTH the Node server and the
 * browser build, with ZERO DB dependency (no seed, no schema, no data.json
 * regeneration risk).
 *
 * Each item is a news-style MENTION (headline + outlet + date + snippet) about a
 * SUBJECT that links to a seeded FRIS entity (Sovereign Nexus `entities.id`,
 * ENT-####) and/or a synthetic vendor (`data/vendors.mjs`, VEN-####), so items
 * roll up per subject and line up with the other modules. Some subjects are the
 * SAME parties that are already sanctioned / high-risk elsewhere in the suite
 * (Blackwater Commodities, Kestrel, Obsidian, Cornavin, Verbier, Silverpeak …)
 * so an adverse-media profile corroborates a screening hit or a flight-risk
 * score. Others are quieter subjects with a single low-severity item.
 *
 * ── DATA-HONESTY POSTURE (read this) ─────────────────────────────────────────
 * Every item below is FICTIONAL and defined deterministically for demonstration.
 * The headlines, outlet names, dates, snippets, risk categories, severities and
 * sentiments are ALL invented; NOTHING here refers to a real person, company,
 * publication or event, and no item may be read as a factual allegation against
 * any real party. The outlet names are fictional stand-ins for a news source.
 * This is NOT an adverse-media / OSINT system of record and must never be relied
 * on for a real negative-news determination.
 *
 * ── Determinism ──────────────────────────────────────────────────────────────
 * Pure static data. Same module → same items, byte-for-byte. No Date.now(), no
 * randomness, no network. IDs are stable AM-#### strings.
 *
 * All records carry `data_classification: 'synthetic-demo'`.
 */

/* eslint-disable max-len */

// ── Risk categories (negative-news themes) ────────────────────────────────────
// Each category carries a base severity weight in [0,1] used by the engine when
// a keyword signal is ambiguous, plus a display colour and a keyword-signal set
// the classifier scores against. Categories mirror the risk themes a real
// adverse-media programme grades (financial crime, fraud, sanctions, corruption,
// litigation, regulatory action, ESG, cyber, insolvency, reputational).
export const AM_CATEGORIES = Object.freeze([
  { code: 'financial_crime', label: 'Financial crime / ML', base: 0.85, color: '#f0616d',
    signals: ['money laundering', 'launder', 'laundered', 'illicit', 'proceeds of crime', 'shell company', 'layering', 'placement', 'suspicious transaction', 'financial crime'] },
  { code: 'fraud', label: 'Fraud & deception', base: 0.80, color: '#e5548a',
    signals: ['fraud', 'fraudulent', 'ponzi', 'embezzle', 'embezzlement', 'misappropriation', 'forged', 'falsified', 'deceived investors', 'misrepresentation', 'accounting irregular'] },
  { code: 'sanctions', label: 'Sanctions & evasion', base: 0.90, color: '#c1121f',
    signals: ['sanction', 'sanctioned', 'sanctions evasion', 'asset freeze', 'export control', 'circumvent', 'circumvention', 'designated', 'embargo', 'dual-use'] },
  { code: 'corruption', label: 'Corruption / bribery', base: 0.82, color: '#d98c4a',
    signals: ['bribe', 'bribery', 'kickback', 'corruption', 'corrupt', 'facilitation payment', 'undue advantage', 'graft', 'improper payment'] },
  { code: 'litigation', label: 'Litigation & disputes', base: 0.45, color: '#a97bf0',
    signals: ['lawsuit', 'sued', 'litigation', 'court', 'claim filed', 'arbitration', 'judgment', 'class action', 'legal action', 'breach of contract'] },
  { code: 'regulatory', label: 'Regulatory action', base: 0.62, color: '#4d8df0',
    signals: ['regulator', 'fined', 'penalty', 'enforcement', 'censure', 'licence', 'license revoked', 'compliance failing', 'reprimand', 'cease and desist', 'consent order'] },
  { code: 'esg', label: 'ESG / environmental', base: 0.50, color: '#37c2b4',
    signals: ['pollution', 'environmental', 'emissions', 'spill', 'toxic', 'labour', 'human rights', 'greenwashing', 'deforestation', 'contamination', 'workplace safety'] },
  { code: 'cyber', label: 'Cyber / data breach', base: 0.58, color: '#7d8aa0',
    signals: ['data breach', 'hacked', 'ransomware', 'cyberattack', 'leaked', 'exposed records', 'security incident', 'compromised', 'malware', 'exfiltrated'] },
  { code: 'insolvency', label: 'Insolvency / distress', base: 0.55, color: '#8a94a6',
    signals: ['insolvent', 'insolvency', 'bankrupt', 'bankruptcy', 'administration', 'liquidation', 'default', 'wind-up', 'creditors', 'restructuring', 'missed payment'] },
  { code: 'reputational', label: 'Reputational / adverse', base: 0.35, color: '#9aa4b2',
    signals: ['allegation', 'alleged', 'scandal', 'controversy', 'probe', 'investigation', 'scrutiny', 'accused', 'questioned', 'concerns raised'] },
]);
export const AM_CATEGORY_BY_CODE = Object.freeze(Object.fromEntries(AM_CATEGORIES.map((c) => [c.code, c])));

// ── Severity levels (ordered) ─────────────────────────────────────────────────
// A mention's severity is derived from its category base + intensity cues. Rank
// is used for ordering (Critical worst → Info least).
export const AM_SEVERITIES = Object.freeze([
  { code: 'Critical', rank: 4, min: 0.82, weight: 1.00, color: '#c1121f', blurb: 'Confirmed serious wrongdoing or an enforcement/asset-freeze event; treat as a hard escalation.' },
  { code: 'High', rank: 3, min: 0.62, weight: 0.80, color: '#f0616d', blurb: 'Serious allegation from a credible report; escalate and corroborate.' },
  { code: 'Medium', rank: 2, min: 0.38, weight: 0.55, color: '#e5a53b', blurb: 'Material negative signal; assess and document.' },
  { code: 'Low', rank: 1, min: 0.18, weight: 0.32, color: '#4d8df0', blurb: 'Minor or peripheral mention; note and monitor.' },
  { code: 'Info', rank: 0, min: 0.00, weight: 0.15, color: '#7d8aa0', blurb: 'Neutral / contextual mention with little risk import.' },
]);
export const AM_SEVERITY_BY_CODE = Object.freeze(Object.fromEntries(AM_SEVERITIES.map((s) => [s.code, s])));
export const AM_SEVERITY_RANK = Object.freeze(Object.fromEntries(AM_SEVERITIES.map((s) => [s.code, s.rank])));

// ── Sentiment (a mention's tone toward the subject) ──────────────────────────
export const AM_SENTIMENTS = Object.freeze([
  { code: 'negative', label: 'Negative', score: -1, color: '#f0616d' },
  { code: 'neutral', label: 'Neutral', score: 0, color: '#7d8aa0' },
  { code: 'mixed', label: 'Mixed', score: -0.4, color: '#e5a53b' },
]);
export const AM_SENTIMENT_BY_CODE = Object.freeze(Object.fromEntries(AM_SENTIMENTS.map((s) => [s.code, s])));

// Positive/exculpatory cues that soften sentiment (cleared, dropped, dismissed…)
export const AM_POSITIVE_CUES = Object.freeze(['cleared', 'acquitted', 'dismissed', 'dropped', 'exonerated', 'no wrongdoing', 'settled without admission', 'denied the allegations', 'resolved', 'reinstated', 'withdrawn']);
// Intensity cues that push severity up (confirmed, guilty, raid, freeze…)
export const AM_INTENSITY_CUES = Object.freeze(['convicted', 'guilty', 'raid', 'raided', 'arrested', 'frozen', 'freeze', 'seized', 'indicted', 'charged', 'confirmed', 'proven', 'record fine', 'largest', 'criminal']);

// ── Fictional source outlets (with a synthetic credibility grade) ─────────────
// Credibility feeds nothing that fabricates a real publication — these are pure
// stand-ins. Grade in [0,1]: established wire > trade press > blog/rumour.
export const AM_OUTLETS = Object.freeze([
  { code: 'meridian-wire', name: 'Meridian Financial Wire', credibility: 0.92, tier: 'Established wire' },
  { code: 'harbour-review', name: 'Harbour Business Review', credibility: 0.86, tier: 'Business press' },
  { code: 'ledger-report', name: 'The Ledger Report', credibility: 0.82, tier: 'Trade press' },
  { code: 'compliance-monitor', name: 'Global Compliance Monitor', credibility: 0.88, tier: 'Specialist press' },
  { code: 'coastal-herald', name: 'Coastal Herald', credibility: 0.70, tier: 'Regional press' },
  { code: 'trade-desk-daily', name: 'Trade Desk Daily', credibility: 0.66, tier: 'Trade press' },
  { code: 'watchpost', name: 'WatchPost', credibility: 0.48, tier: 'Aggregator / blog' },
  { code: 'street-signal', name: 'Street Signal', credibility: 0.40, tier: 'Rumour / forum' },
]);
export const AM_OUTLET_BY_CODE = Object.freeze(Object.fromEntries(AM_OUTLETS.map((o) => [o.code, o])));

// ── The synthetic adverse-media corpus ────────────────────────────────────────
// Each item:
//   id           stable AM-#### id
//   headline     fictional news-style headline (drives classification signals)
//   snippet      a one/two-sentence fictional excerpt (adds classification signal)
//   outlet       an AM_OUTLETS code (source credibility)
//   date         ISO publication date (deterministic; ordered timeline per subject)
//   subjects     array of { type:'entity'|'vendor', id, name } links (roll-up keys)
//   category     the AUTHORED category (the engine also re-derives from signals; a
//                deterministic corpus keeps them aligned so tests are stable)
//   severity     the AUTHORED severity (Critical/High/Medium/Low/Info)
//   sentiment    the AUTHORED sentiment (negative/neutral/mixed)
// The engine's classify() re-derives category/severity/sentiment from the text;
// the authored fields are the ground truth the corpus was written to, and the
// classifier is validated against them in the unit tests.
const D = 'synthetic-demo';
export const ADVERSE_MEDIA = Object.freeze([
  // ── Blackwater Commodities (ENT-0048 Castellan Asset / VEN-0003) — sanctions cluster ──
  { id: 'AM-0001', headline: 'Blackwater Commodities named in synthetic sanctions-evasion probe over rerouted cargo', snippet: 'Investigators allege the commodities trader helped circumvent an asset freeze by rerouting shipments through a shell company; the firm denies the allegations. Fictional report.', outlet: 'compliance-monitor', date: '2026-05-18', subjects: [{ type: 'vendor', id: 'VEN-0003', name: 'Blackwater Commodities Ltd' }, { type: 'entity', id: 'ENT-0048', name: 'Castellan Asset Ltd' }], category: 'sanctions', severity: 'Critical', sentiment: 'negative', data_classification: D },
  { id: 'AM-0002', headline: 'Regulator opens enforcement file into Blackwater Commodities trade-finance controls', snippet: 'A supervisory authority is said to be reviewing whether the trader’s controls failed to detect sanctioned counterparties. No penalty has been issued. Fictional report.', outlet: 'ledger-report', date: '2026-06-02', subjects: [{ type: 'vendor', id: 'VEN-0003', name: 'Blackwater Commodities Ltd' }], category: 'regulatory', severity: 'High', sentiment: 'negative', data_classification: D },
  { id: 'AM-0003', headline: 'Blackwater Commodities disputes reporting, calls sanctions claims “baseless”', snippet: 'The company issued a statement rejecting the allegations and said no charges have been brought. Fictional report.', outlet: 'harbour-review', date: '2026-06-20', subjects: [{ type: 'vendor', id: 'VEN-0003', name: 'Blackwater Commodities Ltd' }], category: 'reputational', severity: 'Low', sentiment: 'negative', data_classification: D },

  // ── Kestrel Energy / Kestrel Holdings (ENT-0065 / VEN-0002) — energy sanctions + fraud ──
  { id: 'AM-0004', headline: 'Kestrel Energy Trading accused of sanctions-busting oil swaps in synthetic exposé', snippet: 'A cross-border investigation alleges the energy trader used intermediaries to move sanctioned crude; the group has not responded. Fictional report.', outlet: 'meridian-wire', date: '2026-04-27', subjects: [{ type: 'vendor', id: 'VEN-0002', name: 'Kestrel Energy Trading Ltd' }, { type: 'entity', id: 'ENT-0065', name: 'Kestrel Holdings AG' }], category: 'sanctions', severity: 'Critical', sentiment: 'negative', data_classification: D },
  { id: 'AM-0005', headline: 'Auditors flag accounting irregularities at Kestrel Holdings unit', snippet: 'A synthetic report says external auditors identified misstated revenue at a trading subsidiary; the parent says it is “reviewing the findings”. Fictional report.', outlet: 'trade-desk-daily', date: '2026-05-30', subjects: [{ type: 'entity', id: 'ENT-0065', name: 'Kestrel Holdings AG' }], category: 'fraud', severity: 'High', sentiment: 'negative', data_classification: D },
  { id: 'AM-0006', headline: 'Kestrel counterparty relationship under scrutiny in laundering allegations', snippet: 'Reporting links a Kestrel trading desk to suspicious transactions said to layer illicit proceeds through offshore shells. Fictional report.', outlet: 'watchpost', date: '2026-06-11', subjects: [{ type: 'vendor', id: 'VEN-0002', name: 'Kestrel Energy Trading Ltd' }], category: 'financial_crime', severity: 'High', sentiment: 'negative', data_classification: D },

  // ── Obsidian Maritime / Obsidian entities (ENT-0071 / VEN-0009) — shipping evasion ──
  { id: 'AM-0007', headline: 'Obsidian Maritime vessel linked to synthetic sanctions-evasion shipping scheme', snippet: 'A fictional investigation alleges the shipping company disabled tracking on a vessel to conceal a sanctioned-port call. Fictional report.', outlet: 'compliance-monitor', date: '2026-03-14', subjects: [{ type: 'vendor', id: 'VEN-0009', name: 'Obsidian Maritime SA' }, { type: 'entity', id: 'ENT-0071', name: 'Obsidian Resources Limited' }], category: 'reputational', severity: 'Low', sentiment: 'negative', data_classification: D },
  { id: 'AM-0008', headline: 'Environmental group alleges oil spill from Obsidian-operated tanker', snippet: 'Campaigners say a tanker operated by the group caused coastal contamination; the company disputes responsibility. Fictional report.', outlet: 'coastal-herald', date: '2026-04-08', subjects: [{ type: 'vendor', id: 'VEN-0009', name: 'Obsidian Maritime SA' }], category: 'esg', severity: 'Medium', sentiment: 'negative', data_classification: D },
  { id: 'AM-0009', headline: 'Obsidian Resources faces winding-up petition from creditors', snippet: 'A synthetic filing shows creditors seeking to place an Obsidian holding into liquidation over unpaid debts. Fictional report.', outlet: 'ledger-report', date: '2026-05-22', subjects: [{ type: 'entity', id: 'ENT-0071', name: 'Obsidian Resources Limited' }], category: 'insolvency', severity: 'Medium', sentiment: 'negative', data_classification: D },

  // ── Cornavin (ENT-0050 Cornavin Global / VEN-0010 Cornavin Data Analytics) — data + fraud ──
  { id: 'AM-0010', headline: 'Cornavin Data Analytics exposed millions of records in synthetic data breach', snippet: 'A fictional security incident is said to have leaked personal records held by the analytics vendor; regulators have been notified. Fictional report.', outlet: 'meridian-wire', date: '2026-06-05', subjects: [{ type: 'vendor', id: 'VEN-0010', name: 'Cornavin Data Analytics Ltd' }, { type: 'entity', id: 'ENT-0050', name: 'Cornavin Global Ltd' }], category: 'cyber', severity: 'High', sentiment: 'negative', data_classification: D },
  { id: 'AM-0011', headline: 'Cornavin Global probed over alleged mis-selling of data products', snippet: 'A consumer authority is reviewing complaints that the group misrepresented how customer data was used. Fictional report.', outlet: 'harbour-review', date: '2026-06-18', subjects: [{ type: 'entity', id: 'ENT-0050', name: 'Cornavin Global Ltd' }], category: 'reputational', severity: 'Low', sentiment: 'negative', data_classification: D },

  // ── Verbier (ENT-0044 Verbier Asset / ENT-0053 Verbier Partners) — fraud / laundering ──
  { id: 'AM-0012', headline: 'Verbier Asset accused of running a synthetic investment fraud', snippet: 'A fictional lawsuit alleges the fund vehicle deceived investors with fabricated returns; the manager denies the claims. Fictional report.', outlet: 'compliance-monitor', date: '2026-02-19', subjects: [{ type: 'entity', id: 'ENT-0044', name: 'Verbier Asset Pte Ltd' }], category: 'fraud', severity: 'Critical', sentiment: 'negative', data_classification: D },
  { id: 'AM-0013', headline: 'Money-laundering allegations widen to Verbier Partners structure', snippet: 'Reporting alleges proceeds were layered through a Verbier partnership before integration into real estate. Fictional report.', outlet: 'ledger-report', date: '2026-03-27', subjects: [{ type: 'entity', id: 'ENT-0053', name: 'Verbier Partners SA' }], category: 'financial_crime', severity: 'Critical', sentiment: 'negative', data_classification: D },
  { id: 'AM-0014', headline: 'Court freezes assets tied to Verbier investment vehicle', snippet: 'A synthetic court order is said to have frozen accounts linked to the vehicle pending a fraud claim. Fictional report.', outlet: 'meridian-wire', date: '2026-04-30', subjects: [{ type: 'entity', id: 'ENT-0044', name: 'Verbier Asset Pte Ltd' }], category: 'fraud', severity: 'Critical', sentiment: 'negative', data_classification: D },

  // ── Silverpeak (ENT-0051 / ENT-0039) — corruption / bribery ──
  { id: 'AM-0015', headline: 'Silverpeak Management accused of bribery to win offshore contracts', snippet: 'A fictional exposé alleges improper payments were made to secure contracts; the group says it is cooperating with inquiries. Fictional report.', outlet: 'harbour-review', date: '2026-01-30', subjects: [{ type: 'entity', id: 'ENT-0051', name: 'Silverpeak Management AG' }], category: 'corruption', severity: 'Critical', sentiment: 'negative', data_classification: D },
  { id: 'AM-0016', headline: 'Silverpeak faces kickback allegations in synthetic procurement scandal', snippet: 'Reporting alleges facilitation payments routed through an intermediary; the company has not commented. Fictional report.', outlet: 'watchpost', date: '2026-03-11', subjects: [{ type: 'entity', id: 'ENT-0039', name: 'Silverpeak Management (BVI) Ltd' }], category: 'corruption', severity: 'High', sentiment: 'negative', data_classification: D },

  // ── Cointrin (ENT-0046 / ENT-0066) — financial crime + regulatory ──
  { id: 'AM-0017', headline: 'Cointrin Trading fined in synthetic AML enforcement action', snippet: 'A supervisor issued a penalty over alleged transaction-monitoring failings; the firm accepted the finding without admission. Fictional report.', outlet: 'compliance-monitor', date: '2026-05-09', subjects: [{ type: 'entity', id: 'ENT-0046', name: 'Cointrin Trading LLC' }], category: 'regulatory', severity: 'High', sentiment: 'negative', data_classification: D },
  { id: 'AM-0018', headline: 'Cointrin Resources tied to suspicious cross-border flows', snippet: 'A fictional report alleges the group processed illicit proceeds through rapid in-out transfers. Fictional report.', outlet: 'trade-desk-daily', date: '2026-05-25', subjects: [{ type: 'entity', id: 'ENT-0066', name: 'Cointrin Resources AG' }], category: 'financial_crime', severity: 'Critical', sentiment: 'negative', data_classification: D },

  // ── Concord (ENT-0070 Concord Commodities / VEN-0012 Concord Resources) — corruption ──
  { id: 'AM-0019', headline: 'Concord Commodities under investigation for alleged corrupt payments', snippet: 'A fictional probe examines whether the trader made improper payments to obtain resource licences. Fictional report.', outlet: 'ledger-report', date: '2026-04-15', subjects: [{ type: 'entity', id: 'ENT-0070', name: 'Concord Commodities AG' }, { type: 'vendor', id: 'VEN-0012', name: 'Concord Resources Trading AG' }], category: 'corruption', severity: 'Critical', sentiment: 'negative', data_classification: D },
  { id: 'AM-0020', headline: 'Concord Resources sued in commodities delivery dispute', snippet: 'A counterparty filed a synthetic claim alleging breach of contract over undelivered cargo. Fictional report.', outlet: 'trade-desk-daily', date: '2026-05-28', subjects: [{ type: 'vendor', id: 'VEN-0012', name: 'Concord Resources Trading AG' }], category: 'litigation', severity: 'Medium', sentiment: 'negative', data_classification: D },

  // ── Meridian (ENT-0064 Meridian Invest / VEN-0004 Meridian Payments) — regulatory / cyber ──
  { id: 'AM-0021', headline: 'Meridian Global Payments reports synthetic security incident affecting settlement data', snippet: 'The processor disclosed a contained cyber incident; it says no customer funds were lost. Fictional report.', outlet: 'meridian-wire', date: '2026-06-08', subjects: [{ type: 'vendor', id: 'VEN-0004', name: 'Meridian Global Payments SA' }], category: 'cyber', severity: 'Medium', sentiment: 'negative', data_classification: D },
  { id: 'AM-0022', headline: 'Meridian Invest cleared after regulatory review finds no wrongdoing', snippet: 'A supervisor closed a synthetic inquiry into the group with no action; the company welcomed the outcome. Fictional report.', outlet: 'harbour-review', date: '2026-06-24', subjects: [{ type: 'entity', id: 'ENT-0064', name: 'Meridian Invest SA' }], category: 'regulatory', severity: 'Low', sentiment: 'mixed', data_classification: D },

  // ── Montreux cluster (ENT-0047 / ENT-0055 / ENT-0072) — mixed ──
  { id: 'AM-0023', headline: 'Montreux Ventures faces class action over alleged misrepresentation', snippet: 'A fictional class action accuses the group of misleading investors about asset quality. Fictional report.', outlet: 'ledger-report', date: '2026-03-19', subjects: [{ type: 'entity', id: 'ENT-0047', name: 'Montreux Ventures Limited' }], category: 'fraud', severity: 'High', sentiment: 'negative', data_classification: D },
  { id: 'AM-0024', headline: 'Montreux Management defaults on synthetic bond, restructuring talks begin', snippet: 'The group missed a payment and entered creditor discussions, a fictional filing shows. Fictional report.', outlet: 'trade-desk-daily', date: '2026-05-14', subjects: [{ type: 'entity', id: 'ENT-0055', name: 'Montreux Management AG' }], category: 'insolvency', severity: 'Medium', sentiment: 'negative', data_classification: D },
  { id: 'AM-0025', headline: 'Montreux Invest named in offshore-secrecy reporting bundle', snippet: 'A fictional data-leak report lists the BVI vehicle among structures used to obscure ownership. Fictional report.', outlet: 'watchpost', date: '2026-04-02', subjects: [{ type: 'entity', id: 'ENT-0072', name: 'Montreux Invest Ltd' }], category: 'reputational', severity: 'Low', sentiment: 'neutral', data_classification: D },

  // ── Aurelia (ENT-0077 / VEN-0005 Aurelia Custody) — regulatory / reputational ──
  { id: 'AM-0026', headline: 'Aurelia Custody & Trust reprimanded over synthetic client-onboarding failings', snippet: 'A supervisor issued a censure over alleged weak due-diligence controls; remediation is under way. Fictional report.', outlet: 'compliance-monitor', date: '2026-05-16', subjects: [{ type: 'vendor', id: 'VEN-0005', name: 'Aurelia Custody & Trust AG' }, { type: 'entity', id: 'ENT-0077', name: 'Aurelia Partners Ltd' }], category: 'regulatory', severity: 'High', sentiment: 'negative', data_classification: D },
  { id: 'AM-0027', headline: 'Aurelia Partners questioned in synthetic beneficial-ownership inquiry', snippet: 'Reporting says investigators asked the firm to identify the ultimate owners behind several trusts. Fictional report.', outlet: 'harbour-review', date: '2026-06-01', subjects: [{ type: 'entity', id: 'ENT-0077', name: 'Aurelia Partners Ltd' }], category: 'reputational', severity: 'Low', sentiment: 'negative', data_classification: D },

  // ── Castellan (ENT-0056 Cornavin Advisory / ENT-0058 Castellan Trading / VEN-0007) — advisory ──
  { id: 'AM-0028', headline: 'Castellan Trading accused of facilitating a synthetic laundering scheme', snippet: 'A fictional report alleges the firm’s structures were used to layer proceeds; it denies involvement. Fictional report.', outlet: 'ledger-report', date: '2026-04-21', subjects: [{ type: 'entity', id: 'ENT-0058', name: 'Castellan Trading AG' }], category: 'reputational', severity: 'Low', sentiment: 'negative', data_classification: D },
  { id: 'AM-0029', headline: 'Castellan Advisory Partners faces conflict-of-interest allegations', snippet: 'A synthetic exposé questions whether the advisory firm disclosed conflicts to clients. Fictional report.', outlet: 'watchpost', date: '2026-05-27', subjects: [{ type: 'vendor', id: 'VEN-0007', name: 'Castellan Advisory Partners Ltd' }], category: 'reputational', severity: 'Low', sentiment: 'negative', data_classification: D },

  // ── Cologny (ENT-0054 / ENT-0073 / VEN-0014) — property / secrecy ──
  { id: 'AM-0030', headline: 'Cologny Property Holdings tied to synthetic money-laundering-through-real-estate claims', snippet: 'A fictional investigation alleges property purchases were used to integrate illicit funds. Fictional report.', outlet: 'compliance-monitor', date: '2026-06-14', subjects: [{ type: 'vendor', id: 'VEN-0014', name: 'Cologny Property Holdings Ltd' }, { type: 'entity', id: 'ENT-0054', name: 'Cologny Property Ltd' }], category: 'financial_crime', severity: 'Critical', sentiment: 'negative', data_classification: D },
  { id: 'AM-0031', headline: 'Cologny Trust flagged in offshore-secrecy dataset', snippet: 'A synthetic leak lists a Cologny trust among opaque structures; no allegation of illegality was made. Fictional report.', outlet: 'street-signal', date: '2026-04-11', subjects: [{ type: 'entity', id: 'ENT-0073', name: 'Cologny Trust AG' }], category: 'reputational', severity: 'Low', sentiment: 'negative', data_classification: D },

  // ── Assorted single-item subjects (breadth of categories) ──
  { id: 'AM-0032', headline: 'Lémanic Logistics investigated over alleged customs-fraud scheme', snippet: 'A fictional probe examines whether the freight group falsified customs declarations. Fictional report.', outlet: 'ledger-report', date: '2026-05-04', subjects: [{ type: 'entity', id: 'ENT-0069', name: 'Lémanic Logistics AG' }, { type: 'vendor', id: 'VEN-0006', name: 'Léman Freight & Logistics AG' }], category: 'fraud', severity: 'High', sentiment: 'negative', data_classification: D },
  { id: 'AM-0033', headline: 'Alpine Invest faces synthetic environmental-compliance penalty', snippet: 'A regulator fined the group over alleged breaches of environmental permits at a facility. Fictional report.', outlet: 'coastal-herald', date: '2026-04-19', subjects: [{ type: 'entity', id: 'ENT-0067', name: 'Alpine Invest AG' }], category: 'regulatory', severity: 'High', sentiment: 'negative', data_classification: D },
  { id: 'AM-0034', headline: 'Nyon Property hit by ransomware in synthetic cyberattack', snippet: 'A fictional security incident encrypted the firm’s systems; it says operations have been restored. Fictional report.', outlet: 'trade-desk-daily', date: '2026-05-31', subjects: [{ type: 'entity', id: 'ENT-0074', name: 'Nyon Property Ltd' }], category: 'cyber', severity: 'High', sentiment: 'negative', data_classification: D },
  { id: 'AM-0035', headline: 'Lémanic Invest defaults on facility, enters synthetic administration', snippet: 'A fictional notice shows the group appointed administrators after missing repayments. Fictional report.', outlet: 'ledger-report', date: '2026-06-09', subjects: [{ type: 'entity', id: 'ENT-0068', name: 'Lémanic Invest AG' }], category: 'insolvency', severity: 'Medium', sentiment: 'negative', data_classification: D },
  { id: 'AM-0036', headline: 'Peregrine Commodities faces arbitration over disputed delivery', snippet: 'A counterparty commenced synthetic arbitration alleging non-performance. Fictional report.', outlet: 'trade-desk-daily', date: '2026-05-20', subjects: [{ type: 'entity', id: 'ENT-0061', name: 'Peregrine Commodities AG' }, { type: 'vendor', id: 'VEN-0016', name: 'Peregrine Freight Partners LLC' }], category: 'litigation', severity: 'Medium', sentiment: 'negative', data_classification: D },
  { id: 'AM-0037', headline: 'Morges Global accused in synthetic sanctions-circumvention reporting', snippet: 'A fictional exposé alleges the entity helped route dual-use goods around export controls. Fictional report.', outlet: 'compliance-monitor', date: '2026-03-29', subjects: [{ type: 'entity', id: 'ENT-0049', name: 'Morges Global Limited' }], category: 'sanctions', severity: 'Critical', sentiment: 'negative', data_classification: D },
  { id: 'AM-0038', headline: 'Helvetia Property named in synthetic greenwashing complaint', snippet: 'Campaigners allege the group overstated the environmental credentials of a development. Fictional report.', outlet: 'coastal-herald', date: '2026-05-12', subjects: [{ type: 'entity', id: 'ENT-0057', name: 'Helvetia Property SA' }], category: 'esg', severity: 'Medium', sentiment: 'negative', data_classification: D },
  { id: 'AM-0039', headline: 'Vanguard Management subsidiary probed over alleged embezzlement', snippet: 'A fictional inquiry examines whether funds were misappropriated by a former officer. Fictional report.', outlet: 'harbour-review', date: '2026-04-24', subjects: [{ type: 'entity', id: 'ENT-0062', name: 'Vanguard Management SA' }], category: 'fraud', severity: 'High', sentiment: 'negative', data_classification: D },
  { id: 'AM-0040', headline: 'Cornavin Corporate Services criticised in synthetic nominee-director reporting', snippet: 'A fictional report questions the firm’s use of nominee directors to obscure control. Fictional report.', outlet: 'street-signal', date: '2026-03-06', subjects: [{ type: 'entity', id: 'ENT-0034', name: 'Cornavin Corporate Services' }], category: 'reputational', severity: 'Low', sentiment: 'neutral', data_classification: D },
  { id: 'AM-0041', headline: 'Ardent Resources subsidiary settles synthetic pollution claim without admission', snippet: 'The group resolved a fictional environmental claim; it denied wrongdoing and admitted no liability. Fictional report.', outlet: 'ledger-report', date: '2026-06-16', subjects: [{ type: 'entity', id: 'ENT-0063', name: 'Ardent Resources LLC' }, { type: 'vendor', id: 'VEN-0001', name: 'Northwind Cloud Services LLC' }], category: 'esg', severity: 'Low', sentiment: 'mixed', data_classification: D },
  { id: 'AM-0042', headline: 'Rhône Trust Limited mentioned in routine synthetic industry survey', snippet: 'A neutral fictional survey listed the trust among fiduciary providers in the region; no concerns were raised. Fictional report.', outlet: 'harbour-review', date: '2026-02-28', subjects: [{ type: 'entity', id: 'ENT-0060', name: 'Rhône Trust Limited' }], category: 'reputational', severity: 'Low', sentiment: 'neutral', data_classification: D },
]);

export const ADVERSE_MEDIA_BY_ID = Object.freeze(Object.fromEntries(ADVERSE_MEDIA.map((m) => [m.id, m])));

// The disclaimer every adverse-media API response / view carries.
export const ADVERSE_MEDIA_DISCLAIMER =
  'Synthetic demonstration adverse-media / OSINT corpus. Every news item, headline, outlet, date, snippet, risk category, severity and sentiment is FICTIONAL and generated deterministically for demonstration; NOTHING here refers to a real person, company, publication or event, and no item may be read as a factual allegation against any real party. Source-credibility grades and classifications are illustrative. This is NOT an adverse-media / OSINT system of record; do not rely on it for a real negative-news determination.';

// A stable version stamp (bump if the corpus changes) so the UI can display it.
export const ADVERSE_MEDIA_VERSION = Object.freeze({
  version: '1.0.0',
  items: ADVERSE_MEDIA.length,
  categories: AM_CATEGORIES.length,
  outlets: AM_OUTLETS.length,
});
