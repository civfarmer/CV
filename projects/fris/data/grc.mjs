// @ts-check
/**
 * Obligation → Control Register — the data layer for a GRC system-of-record over
 * REAL regulatory obligations mapped to a SYNTHETIC, deterministic compliance
 * posture (controls, owners, evidence, test history). Built in the exact idiom of
 * `enforcement.mjs` / `surveillance.mjs` / `countryRisk.mjs`: a static, framework-
 * free, pure data module importable by BOTH the Node server and the browser build,
 * with ZERO DB dependency (no seed, no schema, no data.json regeneration risk).
 *
 * ── DATA-HONESTY POSTURE (read this) ─────────────────────────────────────────
 * TWO layers, honestly separated:
 *
 *   1. OBLIGATIONS are REAL. Each row describes a genuine, high-level requirement
 *      of a real regulatory framework already tracked in FRIS (GDPR, UK GDPR, the
 *      Swiss revFADP, ISO/IEC 27001 (ISMS), ISO/IEC 27701 (PIMS), DORA, NIS2, the
 *      EU AMLR, the Swiss AMLA/GwG, and the EU–US Data Privacy Framework). The
 *      framework names, the citation/article references (e.g. "GDPR Art.30",
 *      "ISO/IEC 27001 Cl.6.1.3") and the plain-English requirement text are
 *      factual, paraphrased public knowledge — NOT copyrighted text and NOT legal
 *      advice. `frameworkId` / obligation-source ids join to the real
 *      complianceKB catalogue so the register reuses, rather than re-invents, the
 *      real frameworks.
 *
 *   2. The CONTROL POSTURE is 100% SYNTHETIC and clearly labelled. The control
 *      titles, control OWNERS (fictional org roles like "Data Protection Office"),
 *      the implementation STATUS (Implemented / Partial / Gap / Not-started), the
 *      last-tested DATES, the test RESULTS (Pass / Fail / Overdue) and the
 *      EVIDENCE references (fictional document ids like "EV-GDPR-3012") are an
 *      ILLUSTRATIVE demonstration compliance posture. They are seeded from a fixed
 *      PRNG for reproducibility and are NOT an assertion about any real
 *      organisation's actual controls. No synthetic datum refers to a real person
 *      or company.
 *
 * The engine MAY compute derived analytics from this register (coverage %, a
 * framework × status posture matrix, ranked gaps, per-owner workload). It MUST NOT
 * present the synthetic posture as a factual compliance state of any real entity.
 *
 * ── Determinism ──────────────────────────────────────────────────────────────
 * The obligation catalogue is static. The synthetic posture is generated ONCE at
 * module load from a fixed-seed PRNG walking the obligations in a stable order, so
 * the whole register is byte-for-byte reproducible. No Date.now(), no ambient
 * randomness, no network, no dependencies beyond the shared PRNG.
 */

/* eslint-disable max-len */

import { Rng } from '../engines/prng.mjs';

// ── Control-status vocabulary (colour ALWAYS paired with a text label in the UI) ─
// A small, stable, ordered set. `rank` orders "worst first" for gap ranking and
// for the posture-matrix column order. `coverageWeight` is the fractional credit a
// control in this status contributes to a coverage %: Implemented = full credit,
// Partial = half, Gap / Not-started = none. This makes the coverage math explicit
// and testable.
export const CONTROL_STATUSES = Object.freeze([
  { code: 'Implemented', label: 'Implemented', color: '#2f9e63', rank: 0, coverageWeight: 1, blurb: 'The control is designed, operating and evidenced.' },
  { code: 'Partial', label: 'Partial', color: '#c9a227', rank: 1, coverageWeight: 0.5, blurb: 'The control is partially in place — design or operation has known gaps.' },
  { code: 'Gap', label: 'Gap', color: '#e07b39', rank: 2, coverageWeight: 0, blurb: 'A control gap: the requirement is not adequately met.' },
  { code: 'Not-started', label: 'Not started', color: '#d5303e', rank: 3, coverageWeight: 0, blurb: 'No control has been implemented against this requirement yet.' },
]);
export const CONTROL_STATUS_BY_CODE = Object.freeze(Object.fromEntries(CONTROL_STATUSES.map((s) => [s.code, s])));

// ── Test-result vocabulary (the outcome of the most recent control test) ──────
export const TEST_RESULTS = Object.freeze([
  { code: 'Pass', label: 'Pass', color: '#2f9e63', blurb: 'The most recent control test passed.' },
  { code: 'Fail', label: 'Fail', color: '#d5303e', blurb: 'The most recent control test failed — remediation required.' },
  { code: 'Overdue', label: 'Overdue', color: '#e07b39', blurb: 'The control test is overdue — it has not been tested within its cycle.' },
]);
export const TEST_RESULT_BY_CODE = Object.freeze(Object.fromEntries(TEST_RESULTS.map((r) => [r.code, r])));

// ── Control types (the classic preventive / detective / corrective taxonomy) ──
export const CONTROL_TYPES = Object.freeze([
  { code: 'preventive', label: 'Preventive', blurb: 'Stops a compliance failure from occurring (e.g. access control, contract clauses).' },
  { code: 'detective', label: 'Detective', blurb: 'Detects a failure after it occurs (e.g. monitoring, logging, breach detection).' },
  { code: 'corrective', label: 'Corrective', blurb: 'Corrects / remediates after detection (e.g. incident response, remediation plans).' },
]);
export const CONTROL_TYPE_BY_CODE = Object.freeze(Object.fromEntries(CONTROL_TYPES.map((t) => [t.code, t])));

// ── Frameworks in the register (join to the real complianceKB catalogue) ──────
// `kbId` matches a FRAMEWORKS[].id in data/complianceKB.mjs; `source` is the same
// official URL the KB carries. These are REAL frameworks. `short` is a compact
// label for the posture-matrix row header.
export const GRC_FRAMEWORKS = Object.freeze([
  { code: 'gdpr', kbId: 'gdpr', short: 'GDPR', name: 'General Data Protection Regulation (GDPR)', authority: 'European Union', kind: 'data-protection', source: 'https://eur-lex.europa.eu/eli/reg/2016/679/oj' },
  { code: 'uk-gdpr', kbId: 'uk-gdpr', short: 'UK GDPR', name: 'UK GDPR + Data Protection Act 2018', authority: 'United Kingdom (ICO)', kind: 'data-protection', source: 'https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/' },
  { code: 'fadp', kbId: 'fadp', short: 'revFADP', name: 'Revised Federal Act on Data Protection (revFADP / nFADP)', authority: 'Switzerland (FDPIC)', kind: 'data-protection', source: 'https://www.fedlex.admin.ch/eli/cc/2022/491/en' },
  { code: 'iso27001', kbId: 'iso27001', short: 'ISO 27001', name: 'ISO/IEC 27001 — Information Security Management System (ISMS)', authority: 'ISO/IEC', kind: 'infosec', source: 'https://www.iso.org/standard/27001' },
  { code: 'iso27701', kbId: 'iso27701', short: 'ISO 27701', name: 'ISO/IEC 27701 — Privacy Information Management System (PIMS)', authority: 'ISO/IEC', kind: 'privacy-mgmt', source: 'https://www.iso.org/standard/71670.html' },
  { code: 'dora', kbId: 'dora', short: 'DORA', name: 'Digital Operational Resilience Act (DORA)', authority: 'European Union', kind: 'ict-resilience', source: 'https://eur-lex.europa.eu/eli/reg/2022/2554/oj' },
  { code: 'nis2', kbId: 'nis2', short: 'NIS2', name: 'NIS2 Directive (cybersecurity)', authority: 'European Union', kind: 'cyber', source: 'https://eur-lex.europa.eu/eli/dir/2022/2555/oj' },
  { code: 'amlr', kbId: 'amlr', short: 'EU AMLR', name: 'EU Anti-Money-Laundering Regulation (AMLR)', authority: 'European Union', kind: 'aml', source: 'https://eur-lex.europa.eu/eli/reg/2024/1624/oj' },
  { code: 'amla-ch', kbId: 'amla-ch', short: 'CH AMLA', name: 'Swiss Anti-Money-Laundering Act (AMLA / GwG)', authority: 'Switzerland (FINMA/MROS)', kind: 'aml', source: 'https://www.fedlex.admin.ch/eli/cc/1998/892_892_892/en' },
  { code: 'eu-us-dpf', kbId: 'eu-us-dpf', short: 'EU–US DPF', name: 'EU–US Data Privacy Framework (DPF)', authority: 'US Dept. of Commerce / EU', kind: 'data-protection', source: 'https://www.dataprivacyframework.gov/' },
]);
export const GRC_FRAMEWORK_BY_CODE = Object.freeze(Object.fromEntries(GRC_FRAMEWORKS.map((f) => [f.code, f])));

// ── The obligation catalogue (REAL requirements) ──────────────────────────────
// Each obligation is a genuine, high-level requirement of the named real framework.
// Schema:
//   id            — stable id (OBL-<FWK>-<n>).
//   frameworkCode — the GRC_FRAMEWORKS code it belongs to.
//   citation      — the real article / clause reference (factual public knowledge).
//   kbObligationId?— optional join to a complianceKB OBLIGATIONS[].id (the real KB obligation).
//   category      — a grouping theme (Governance / Data subject rights / Security / …).
//   title         — short requirement name.
//   requirement   — a factual, paraphrased description of what the framework requires.
//   jurisdictions — applicable jurisdictions (descriptive).
// The synthetic control posture is attached to each obligation at load (see below).
const OBLIGATION_SEED = Object.freeze([
  // ── GDPR (EU) ──────────────────────────────────────────────────────────────
  { id: 'OBL-GDPR-01', frameworkCode: 'gdpr', citation: 'GDPR Art. 6', kbObligationId: 'lawful-basis', category: 'Lawful processing', title: 'Establish a lawful basis for processing', requirement: 'Identify and document a valid legal ground (consent, contract, legal obligation, vital interests, public task or legitimate interests) before processing personal data; special-category data needs an additional Art.9 condition.', jurisdictions: ['European Union'] },
  { id: 'OBL-GDPR-02', frameworkCode: 'gdpr', citation: 'GDPR Art. 30', kbObligationId: 'ropa', category: 'Records & governance', title: 'Records of Processing Activities (RoPA)', requirement: 'Maintain a written inventory of processing activities — purposes, categories of data and data subjects, recipients, transfers, retention periods and security measures. Controllers and processors keep different records.', jurisdictions: ['European Union'] },
  { id: 'OBL-GDPR-03', frameworkCode: 'gdpr', citation: 'GDPR Art. 35', kbObligationId: 'dpia', category: 'Risk assessment', title: 'Data Protection Impact Assessment (DPIA)', requirement: 'Carry out a documented DPIA before processing that is likely to result in a high risk to individuals (large-scale special-category data, systematic monitoring, new technologies, profiling with legal effects).', jurisdictions: ['European Union'] },
  { id: 'OBL-GDPR-04', frameworkCode: 'gdpr', citation: 'GDPR Art. 33/34', kbObligationId: 'breach-notification', category: 'Incident management', title: 'Personal-data breach notification', requirement: 'Notify the supervisory authority of a qualifying personal-data breach without undue delay and, where feasible, within 72 hours; notify affected individuals where the breach is likely to result in a high risk. Keep an internal breach register.', jurisdictions: ['European Union'] },
  { id: 'OBL-GDPR-05', frameworkCode: 'gdpr', citation: 'GDPR Ch. III (Arts. 12–23)', kbObligationId: 'dsr-handling', category: 'Data subject rights', title: 'Handle data-subject rights requests', requirement: 'Operate a process to receive, verify and answer individuals’ requests to access, rectify, erase, port, restrict or object to processing, generally within one month.', jurisdictions: ['European Union'] },
  { id: 'OBL-GDPR-06', frameworkCode: 'gdpr', citation: 'GDPR Art. 28', kbObligationId: 'dpa-contract', category: 'Third-party management', title: 'Processor (Art. 28) contracts', requirement: 'Put a binding data-processing agreement in place whenever a processor handles personal data on the controller’s behalf, setting out subject-matter, purpose, security, sub-processing, assistance and deletion/return duties.', jurisdictions: ['European Union'] },
  { id: 'OBL-GDPR-07', frameworkCode: 'gdpr', citation: 'GDPR Ch. V (Arts. 44–49)', kbObligationId: 'transfer-safeguard', category: 'International transfers', title: 'International-transfer safeguards', requirement: 'Rely on a lawful transfer mechanism (adequacy decision, Standard Contractual Clauses, Binding Corporate Rules or a narrow derogation) plus a transfer impact assessment when exporting personal data outside the EEA.', jurisdictions: ['European Union'] },
  { id: 'OBL-GDPR-08', frameworkCode: 'gdpr', citation: 'GDPR Art. 37', kbObligationId: 'dpo', category: 'Records & governance', title: 'Designate a Data Protection Officer', requirement: 'Designate an independent DPO where core activities involve large-scale systematic monitoring or large-scale special-category data, and publish/notify their contact details.', jurisdictions: ['European Union'] },
  { id: 'OBL-GDPR-09', frameworkCode: 'gdpr', citation: 'GDPR Art. 32', kbObligationId: 'security-measures', category: 'Security', title: 'Security of processing', requirement: 'Implement risk-appropriate technical and organisational measures (access control, encryption/pseudonymisation where apt, resilience and regular testing) to protect personal data.', jurisdictions: ['European Union'] },

  // ── UK GDPR + DPA 2018 (UK) ──────────────────────────────────────────────────
  { id: 'OBL-UKGDPR-01', frameworkCode: 'uk-gdpr', citation: 'UK GDPR Arts. 13–14', kbObligationId: 'privacy-notice', category: 'Transparency', title: 'Transparency / privacy notice', requirement: 'Give individuals clear information about who processes their data, why, on what basis, with whom it is shared, for how long, and how to exercise their rights, at or before the point of collection.', jurisdictions: ['United Kingdom'] },
  { id: 'OBL-UKGDPR-02', frameworkCode: 'uk-gdpr', citation: 'UK GDPR Ch. V + IDTA', kbObligationId: 'transfer-safeguard', category: 'International transfers', title: 'UK international-transfer mechanism', requirement: 'Use the UK International Data Transfer Agreement (IDTA) or the UK Addendum to the EU SCCs (with a Transfer Risk Assessment), or a UK "data bridge" adequacy finding, for restricted transfers of personal data out of the UK.', jurisdictions: ['United Kingdom'] },
  { id: 'OBL-UKGDPR-03', frameworkCode: 'uk-gdpr', citation: 'PECR reg. 6 / UK GDPR Art. 7', kbObligationId: 'consent-mgmt', category: 'Consent & marketing', title: 'Cookie & marketing consent (PECR)', requirement: 'Obtain freely-given, specific, informed opt-in consent for non-essential cookies and certain electronic marketing under PECR, keep it withdrawable, and evidence it.', jurisdictions: ['United Kingdom'] },

  // ── Swiss revFADP (CH) ───────────────────────────────────────────────────────
  { id: 'OBL-FADP-01', frameworkCode: 'fadp', citation: 'revFADP Art. 12', kbObligationId: 'ropa', category: 'Records & governance', title: 'Register of processing activities', requirement: 'Maintain a register of processing activities, subject to the exemption for companies under 250 employees whose processing is low-risk and excludes large-scale sensitive-data or high-risk profiling.', jurisdictions: ['Switzerland'] },
  { id: 'OBL-FADP-02', frameworkCode: 'fadp', citation: 'revFADP Art. 24', kbObligationId: 'breach-notification', category: 'Incident management', title: 'Breach notification to the FDPIC', requirement: 'Notify the Federal Data Protection and Information Commissioner (FDPIC) of a data-security breach likely to result in a high risk to data subjects as soon as possible.', jurisdictions: ['Switzerland'] },
  { id: 'OBL-FADP-03', frameworkCode: 'fadp', citation: 'revFADP Art. 16–17', kbObligationId: 'transfer-safeguard', category: 'International transfers', title: 'Cross-border disclosure safeguards', requirement: 'Ensure adequate protection (adequacy list, contractual clauses or other safeguards) before disclosing personal data abroad to a country without an adequate level of protection.', jurisdictions: ['Switzerland'] },

  // ── ISO/IEC 27001 — ISMS (voluntary standard) ────────────────────────────────
  { id: 'OBL-ISO27001-01', frameworkCode: 'iso27001', citation: 'ISO/IEC 27001 Cl. 6.1.2', kbObligationId: 'isms-management-system', category: 'Risk assessment', title: 'Information security risk assessment', requirement: 'Define and apply an information security risk-assessment process that establishes risk criteria, identifies risks to the confidentiality, integrity and availability of information, and analyses and evaluates them.', jurisdictions: ['Cross-jurisdiction (voluntary)'] },
  { id: 'OBL-ISO27001-02', frameworkCode: 'iso27001', citation: 'ISO/IEC 27001 Cl. 6.1.3 / SoA', kbObligationId: 'isms-management-system', category: 'Records & governance', title: 'Risk treatment & Statement of Applicability', requirement: 'Produce a risk-treatment plan and a Statement of Applicability that justifies the inclusion or exclusion of the Annex A controls relative to the risk-assessment results.', jurisdictions: ['Cross-jurisdiction (voluntary)'] },
  { id: 'OBL-ISO27001-03', frameworkCode: 'iso27001', citation: 'ISO/IEC 27001 Cl. 9.2', kbObligationId: 'isms-management-system', category: 'Assurance & audit', title: 'Internal ISMS audit', requirement: 'Conduct internal audits at planned intervals to confirm the ISMS conforms to the organisation’s own requirements and to ISO/IEC 27001, and is effectively implemented and maintained.', jurisdictions: ['Cross-jurisdiction (voluntary)'] },
  { id: 'OBL-ISO27001-04', frameworkCode: 'iso27001', citation: 'ISO/IEC 27001 Cl. 9.3', kbObligationId: 'isms-management-system', category: 'Governance', title: 'Management review', requirement: 'Top management reviews the ISMS at planned intervals to ensure its continuing suitability, adequacy and effectiveness, including the status of actions, changes and opportunities for improvement.', jurisdictions: ['Cross-jurisdiction (voluntary)'] },

  // ── ISO/IEC 27701 — PIMS (voluntary standard) ─────────────────────────────────
  { id: 'OBL-ISO27701-01', frameworkCode: 'iso27701', citation: 'ISO/IEC 27701 Cl. 5 / PIMS', kbObligationId: 'pims-management-system', category: 'Governance', title: 'Operate a PIMS extension', requirement: 'Extend the ISMS into a Privacy Information Management System by adopting the PIMS-specific requirements and refining the ISMS scope, roles and risk assessment to cover the processing of personally identifiable information (PII).', jurisdictions: ['Cross-jurisdiction (voluntary)'] },
  { id: 'OBL-ISO27701-02', frameworkCode: 'iso27701', citation: 'ISO/IEC 27701 Cl. 7 (controller)', kbObligationId: 'pims-management-system', category: 'Data subject rights', title: 'PII controller privacy controls', requirement: 'Implement the controller-specific privacy controls — lawful basis, purpose limitation, records, obligations to PII principals, privacy-by-design and transfer records — mapped to the PIMS.', jurisdictions: ['Cross-jurisdiction (voluntary)'] },

  // ── DORA (EU — financial sector ICT resilience) ──────────────────────────────
  { id: 'OBL-DORA-01', frameworkCode: 'dora', citation: 'DORA Art. 5–15', kbObligationId: 'security-measures', category: 'ICT resilience', title: 'ICT risk-management framework', requirement: 'Maintain a sound, comprehensive and well-documented ICT risk-management framework as part of the overall risk-management system, with strategies, policies, tools and procedures to protect ICT assets.', jurisdictions: ['European Union'] },
  { id: 'OBL-DORA-02', frameworkCode: 'dora', citation: 'DORA Art. 17–23', kbObligationId: 'breach-notification', category: 'Incident management', title: 'Major ICT-incident reporting', requirement: 'Classify ICT-related incidents and report major incidents to the competent authority within the regulatory timelines using the harmonised templates.', jurisdictions: ['European Union'] },
  { id: 'OBL-DORA-03', frameworkCode: 'dora', citation: 'DORA Art. 28', kbObligationId: 'ropa-transfers-register', category: 'Third-party management', title: 'Register of ICT third-party arrangements', requirement: 'Maintain and keep up to date a register of information on all contractual arrangements for the use of ICT services provided by ICT third-party service providers.', jurisdictions: ['European Union'] },

  // ── NIS2 (EU — cybersecurity of essential/important entities) ─────────────────
  { id: 'OBL-NIS2-01', frameworkCode: 'nis2', citation: 'NIS2 Art. 21', kbObligationId: 'security-measures', category: 'Security', title: 'Cyber risk-management measures', requirement: 'Take appropriate and proportionate technical, operational and organisational measures to manage the risks posed to network and information systems, on an all-hazards basis.', jurisdictions: ['European Union'] },
  { id: 'OBL-NIS2-02', frameworkCode: 'nis2', citation: 'NIS2 Art. 23', kbObligationId: 'breach-notification', category: 'Incident management', title: 'Significant-incident reporting', requirement: 'Submit an early warning of a significant incident to the CSIRT or competent authority without undue delay (within 24 hours), followed by an incident notification and a final report.', jurisdictions: ['European Union'] },

  // ── EU AMLR (EU — obliged entities) ───────────────────────────────────────────
  { id: 'OBL-AMLR-01', frameworkCode: 'amlr', citation: 'AMLR Arts. 16–33 (CDD)', category: 'Customer due diligence', title: 'Customer due diligence (CDD)', requirement: 'Apply customer due diligence measures — identify and verify the customer and beneficial owner, understand the purpose of the relationship and conduct ongoing monitoring — on a risk-sensitive basis.', jurisdictions: ['European Union'] },
  { id: 'OBL-AMLR-02', frameworkCode: 'amlr', citation: 'AMLR (beneficial ownership)', category: 'Transparency', title: 'Beneficial-ownership identification', requirement: 'Identify the beneficial owner(s) of a customer and obtain adequate, accurate and up-to-date information on the ownership and control structure.', jurisdictions: ['European Union'] },
  { id: 'OBL-AMLR-03', frameworkCode: 'amlr', citation: 'AMLR (record-keeping)', kbObligationId: 'retention-schedule', category: 'Records & governance', title: 'AML record retention', requirement: 'Retain the records of customer due diligence and transactions for the statutory period so they are available for the authorities and the Financial Intelligence Unit.', jurisdictions: ['European Union'] },

  // ── Swiss AMLA / GwG (CH — financial intermediaries) ──────────────────────────
  { id: 'OBL-AMLA-01', frameworkCode: 'amla-ch', citation: 'AMLA Art. 3–5', category: 'Customer due diligence', title: 'Client & beneficial-owner identification', requirement: 'Verify the identity of the contracting party and establish the identity of the beneficial owner when entering into a business relationship as a financial intermediary.', jurisdictions: ['Switzerland'] },
  { id: 'OBL-AMLA-02', frameworkCode: 'amla-ch', citation: 'AMLA Art. 9', category: 'Reporting', title: 'Suspicious-activity reporting to MROS', requirement: 'Report to the Money Laundering Reporting Office Switzerland (MROS) when there is reasonable suspicion that assets are connected to money laundering, terrorist financing or a predicate offence.', jurisdictions: ['Switzerland'] },
  { id: 'OBL-AMLA-03', frameworkCode: 'amla-ch', citation: 'AMLA Art. 7', kbObligationId: 'retention-schedule', category: 'Records & governance', title: 'Ten-year record retention', requirement: 'Keep records and documents of transactions and identity verifications so that qualified third parties can form a reliable judgement, retained for at least ten years.', jurisdictions: ['Switzerland'] },

  // ── EU–US Data Privacy Framework (voluntary self-certification) ───────────────
  { id: 'OBL-DPF-01', frameworkCode: 'eu-us-dpf', citation: 'DPF Principles (self-certification)', kbObligationId: 'transfer-safeguard', category: 'International transfers', title: 'DPF self-certification & principles', requirement: 'A US importer self-certifies adherence to the Data Privacy Framework Principles (notice, choice, accountability for onward transfer, security, data integrity, access, recourse) to receive EU/UK/Swiss personal data under adequacy.', jurisdictions: ['United States', 'European Union'] },
  { id: 'OBL-DPF-02', frameworkCode: 'eu-us-dpf', citation: 'DPF (recourse & fallback)', kbObligationId: 'transfer-safeguard', category: 'Governance', title: 'DPF recourse & SCC fallback', requirement: 'Provide an independent recourse mechanism for individuals and keep Standard Contractual Clauses / IDTA fallbacks documented given the DPF adequacy decision remains under legal challenge.', jurisdictions: ['United States', 'European Union'] },
]);

// ── Synthetic control-posture generation (deterministic, fixed-seed PRNG) ─────
// For each obligation we generate one or two SYNTHETIC controls. Everything below
// (status, owner, type, dates, results, evidence) is fabricated demonstration
// posture — never a claim about a real organisation. The generation walks the
// obligations in their fixed order with one shared Rng, so the whole register is
// byte-for-byte reproducible.

// Fictional owner org-roles (NOT real people). Chosen per framework kind so the
// mapping reads plausibly (a Data Protection Office owns GDPR controls, etc.).
const OWNERS_BY_KIND = {
  'data-protection': ['Data Protection Office', 'Privacy Operations', 'Legal & Compliance'],
  'privacy-mgmt': ['Data Protection Office', 'Privacy Operations'],
  infosec: ['Information Security', 'IT Risk & Controls', 'Security Operations Centre'],
  cyber: ['Information Security', 'Security Operations Centre'],
  'ict-resilience': ['IT Risk & Controls', 'Operational Resilience Office', 'Information Security'],
  aml: ['Financial Crime Compliance', 'AML Operations', 'MLRO Office'],
};
// A generic pool if a kind is missing.
const OWNERS_GENERIC = ['Compliance Operations', 'Risk & Controls', 'Second Line of Defence'];

// A deterministic "as-of" reference date the whole register is dated against.
// Fixed (not Date.now) so test dates and overdue logic are reproducible.
export const GRC_AS_OF = '2026-06-30';

// Status weighting — biased toward a realistic-looking mixed posture (mostly
// implemented, a meaningful minority partial, some gaps, a few not-started).
const STATUS_WEIGHTS = [['Implemented', 0.5], ['Partial', 0.27], ['Gap', 0.16], ['Not-started', 0.07]];

// Control title templates keyed by category so the synthetic control reads as a
// plausible control for the obligation (still clearly synthetic).
const CONTROL_TITLE_BY_CATEGORY = {
  'Lawful processing': 'Lawful-basis register & assessment control',
  'Records & governance': 'Governance record maintenance control',
  'Risk assessment': 'Documented risk-assessment control',
  'Incident management': 'Incident detection & notification control',
  'Data subject rights': 'Rights-request intake & fulfilment control',
  'Third-party management': 'Third-party contract & oversight control',
  'International transfers': 'Cross-border transfer safeguard control',
  Transparency: 'Notice & transparency control',
  Security: 'Technical & organisational security control',
  'Consent & marketing': 'Consent capture & withdrawal control',
  'Assurance & audit': 'Internal audit assurance control',
  Governance: 'Governance & oversight control',
  'ICT resilience': 'ICT resilience & continuity control',
  'Customer due diligence': 'CDD onboarding & monitoring control',
  Reporting: 'Suspicious-activity reporting control',
};
const CONTROL_TYPE_BY_CATEGORY = {
  'Lawful processing': 'preventive', 'Records & governance': 'detective', 'Risk assessment': 'preventive',
  'Incident management': 'detective', 'Data subject rights': 'corrective', 'Third-party management': 'preventive',
  'International transfers': 'preventive', Transparency: 'preventive', Security: 'preventive',
  'Consent & marketing': 'preventive', 'Assurance & audit': 'detective', Governance: 'detective',
  'ICT resilience': 'preventive', 'Customer due diligence': 'preventive', Reporting: 'detective',
};

// Subtract `days` from an ISO yyyy-mm-dd date, returning ISO. Pure UTC arithmetic
// (no timezone drift), used to place synthetic last-tested dates before GRC_AS_OF.
function isoMinusDays(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const base = Date.UTC(y, m - 1, d);
  const dt = new Date(base - days * 86400000);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}
// Whole-day difference a - b (both ISO). Positive when a is after b.
export function daysBetween(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86400000);
}

// Build the synthetic controls for one obligation with the shared Rng. Returns an
// array of 1–2 control objects. The FIRST control carries the obligation's headline
// status; a SECOND control (added ~40% of the time) is a supporting control.
function synthControls(ob, rng, fw) {
  const ownerPool = OWNERS_BY_KIND[fw.kind] || OWNERS_GENERIC;
  const n = rng.bool(0.4) ? 2 : 1;
  const controls = [];
  for (let i = 0; i < n; i++) {
    const status = rng.weighted(STATUS_WEIGHTS);
    const owner = rng.pick(ownerPool);
    const type = i === 0 ? (CONTROL_TYPE_BY_CATEGORY[ob.category] || 'preventive') : rng.pick(['preventive', 'detective', 'corrective']);
    // Test cadence: implemented controls tested recently; partial a bit staler;
    // gaps/not-started tested long ago or never. Deterministic from the Rng.
    let lastTested, testResult;
    if (status === 'Not-started') {
      lastTested = null;               // never tested
      testResult = 'Overdue';
    } else {
      const ageDays = status === 'Implemented' ? rng.int(20, 150) : status === 'Partial' ? rng.int(120, 300) : rng.int(280, 520);
      lastTested = isoMinusDays(GRC_AS_OF, ageDays);
      // A control tested more than ~365 days ago is Overdue regardless of design;
      // otherwise Implemented passes, Partial usually passes, Gap usually fails.
      if (ageDays > 365) testResult = 'Overdue';
      else if (status === 'Implemented') testResult = rng.bool(0.92) ? 'Pass' : 'Fail';
      else if (status === 'Partial') testResult = rng.bool(0.6) ? 'Pass' : 'Fail';
      else testResult = rng.bool(0.75) ? 'Fail' : 'Pass'; // Gap
    }
    // Fictional evidence refs — 0 for not-started, else 1–3 synthetic doc ids.
    const evCount = status === 'Not-started' ? 0 : status === 'Gap' ? rng.int(0, 1) : rng.int(1, 3);
    const evidence = [];
    for (let e = 0; e < evCount; e++) {
      evidence.push({ ref: `EV-${fw.short.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6)}-${rng.int(1000, 9999)}`, label: rng.pick(['Policy document', 'Test worksheet', 'Screenshot pack', 'Sign-off record', 'Control narrative', 'Audit workpaper']) });
    }
    const cid = `${ob.id.replace('OBL-', 'CTL-')}-${String.fromCharCode(65 + i)}`;
    controls.push({
      id: cid,
      title: (i === 0 ? '' : 'Supporting: ') + (CONTROL_TITLE_BY_CATEGORY[ob.category] || 'Compliance control'),
      owner,
      type,
      status,
      lastTested,
      testResult,
      evidence,
    });
  }
  return controls;
}

// Generate the full register ONCE at module load, deterministically. The Rng is
// seeded with a fixed string; walking obligations in their fixed order guarantees
// reproducibility. The result is deep-frozen so callers cannot mutate it.
function buildRegister() {
  const rng = new Rng('fris-grc-register-v1');
  const rows = OBLIGATION_SEED.map((ob) => {
    const fw = GRC_FRAMEWORK_BY_CODE[ob.frameworkCode];
    const controls = synthControls(ob, rng, fw);
    return Object.freeze({ ...ob, framework: fw, controls: Object.freeze(controls.map((c) => Object.freeze({ ...c, evidence: Object.freeze(c.evidence) }))) });
  });
  return Object.freeze(rows);
}

export const OBLIGATIONS = buildRegister();
export const OBLIGATION_BY_ID = Object.freeze(Object.fromEntries(OBLIGATIONS.map((o) => [o.id, o])));

// The honesty disclaimer every GRC API response / view carries.
export const GRC_DISCLAIMER =
  'The OBLIGATIONS in this register are REAL: each describes a genuine, high-level requirement of a real regulatory framework already tracked in FRIS (GDPR, UK GDPR, the Swiss revFADP, ISO/IEC 27001, ISO/IEC 27701, DORA, NIS2, the EU AMLR, the Swiss AMLA/GwG and the EU–US Data Privacy Framework), with its real article/clause citation and a factual, paraphrased requirement summary. The COMPLIANCE POSTURE mapped to them — the control owners (fictional org roles such as “Data Protection Office”), the implementation status, the last-tested dates, the test results and the evidence references — is 100% SYNTHETIC, illustrative demonstration data seeded from a fixed PRNG for reproducibility. It is NOT an assertion about any real organisation’s actual controls, NOT an audit or certification, and NOT legal advice. Verify against the cited official sources and take qualified advice before acting.';

// A stable version stamp so the UI can display it (bump if the catalogue changes).
export const GRC_VERSION = Object.freeze({
  version: '1.0.0',
  asOf: GRC_AS_OF,
  frameworks: GRC_FRAMEWORKS.length,
  obligations: OBLIGATIONS.length,
  controls: OBLIGATIONS.reduce((n, o) => n + o.controls.length, 0),
  statuses: CONTROL_STATUSES.length,
});
