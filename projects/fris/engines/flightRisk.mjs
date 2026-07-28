// @ts-check
/**
 * Jurisdictional Asset Flight Risk Score (Sovereign Nexus).
 *
 * A transparent, deterministic 0–100 score built from independently weighted
 * factors. Each factor maps its raw input to a normalised [0,1] contribution;
 * the score is the weighted average scaled to 100. There are NO hidden or
 * arbitrary components — every point is attributable to a named factor and is
 * reproducible from the same input.
 *
 * score = round( Σ(weightᵢ · normᵢ) / Σ(weightᵢ) · 100 )
 */

/**
 * @typedef {Object} FlightRiskInput
 * @property {number} [ownershipLayerDepth]     Depth of the ownership chain (layers).
 * @property {number} [jurisdictionCount]       Distinct jurisdictions in the structure.
 * @property {number} [maxSecrecyScore]          Highest jurisdiction secrecy score (0..100).
 * @property {boolean} [nomineeInvolved]         Nominee shareholder/director present.
 * @property {number} [recentControlChanges]     Control changes in the last 12 months.
 * @property {number} [dormantIntermediaries]    Dormant intermediary entities in the chain.
 * @property {boolean} [circularOwnership]        Circular ownership detected.
 * @property {number} [unexplainedTransfers]     Count of unexplained asset transfers.
 * @property {boolean} [highRiskLegalForm]        Bearer/foundation/complex legal form.
 * @property {boolean} [incompleteOwnershipData]  Ownership below 100% attributable.
 * @property {boolean} [rapidAssetRelocation]     Assets relocated across borders rapidly.
 * @property {number} [offshoreConcentration]     Fraction of structure that is offshore (0..1).
 */

/** @type {Array<{key:string,label:string,weight:number,norm:(i:FlightRiskInput)=>number,describe:(i:FlightRiskInput)=>string}>} */
export const FLIGHT_RISK_FACTORS = [
  {
    key: 'ownershipDepth',
    label: 'Ownership-layer depth',
    weight: 12,
    norm: (i) => clamp01((num(i.ownershipLayerDepth) - 1) / 6),
    describe: (i) => `${num(i.ownershipLayerDepth)} ownership layer(s) between the asset and its ultimate owner.`,
  },
  {
    key: 'jurisdictions',
    label: 'Jurisdictional spread',
    weight: 10,
    norm: (i) => clamp01((num(i.jurisdictionCount) - 1) / 5),
    describe: (i) => `Structure spans ${num(i.jurisdictionCount)} distinct jurisdiction(s).`,
  },
  {
    key: 'secrecy',
    label: 'Secrecy-risk weighting',
    weight: 14,
    norm: (i) => clamp01(num(i.maxSecrecyScore) / 100),
    describe: (i) => `Highest jurisdiction secrecy score in the chain is ${num(i.maxSecrecyScore)}/100.`,
  },
  {
    key: 'nominee',
    label: 'Nominee involvement',
    weight: 11,
    norm: (i) => (i.nomineeInvolved ? 1 : 0),
    describe: (i) => (i.nomineeInvolved ? 'Nominee shareholder or director interposed.' : 'No nominee interposition detected.'),
  },
  {
    key: 'controlChanges',
    label: 'Recent control changes',
    weight: 8,
    norm: (i) => clamp01(num(i.recentControlChanges) / 4),
    describe: (i) => `${num(i.recentControlChanges)} change(s) of control in the trailing 12 months.`,
  },
  {
    key: 'dormant',
    label: 'Dormant intermediaries',
    weight: 7,
    norm: (i) => clamp01(num(i.dormantIntermediaries) / 3),
    describe: (i) => `${num(i.dormantIntermediaries)} dormant intermediary entit(y/ies) in the chain.`,
  },
  {
    key: 'circular',
    label: 'Circular ownership',
    weight: 9,
    norm: (i) => (i.circularOwnership ? 1 : 0),
    describe: (i) => (i.circularOwnership ? 'Circular ownership loop present.' : 'No circular ownership loop.'),
  },
  {
    key: 'transfers',
    label: 'Unexplained transfers',
    weight: 8,
    norm: (i) => clamp01(num(i.unexplainedTransfers) / 5),
    describe: (i) => `${num(i.unexplainedTransfers)} unexplained asset transfer(s) on record.`,
  },
  {
    key: 'legalForm',
    label: 'High-risk legal form',
    weight: 6,
    norm: (i) => (i.highRiskLegalForm ? 1 : 0),
    describe: (i) => (i.highRiskLegalForm ? 'High-risk legal form (e.g. bearer/foundation).' : 'Standard legal form.'),
  },
  {
    key: 'incomplete',
    label: 'Incomplete ownership data',
    weight: 7,
    norm: (i) => (i.incompleteOwnershipData ? 1 : 0),
    describe: (i) => (i.incompleteOwnershipData ? 'Beneficial ownership not fully attributable.' : 'Ownership fully attributable.'),
  },
  {
    key: 'relocation',
    label: 'Rapid asset relocation',
    weight: 6,
    norm: (i) => (i.rapidAssetRelocation ? 1 : 0),
    describe: (i) => (i.rapidAssetRelocation ? 'Rapid cross-border asset relocation observed.' : 'No rapid relocation observed.'),
  },
  {
    key: 'offshore',
    label: 'Offshore concentration',
    weight: 12,
    norm: (i) => clamp01(num(i.offshoreConcentration)),
    describe: (i) => `${Math.round(clamp01(num(i.offshoreConcentration)) * 100)}% of the structure sits in offshore vehicles.`,
  },
];

const TOTAL_WEIGHT = FLIGHT_RISK_FACTORS.reduce((a, f) => a + f.weight, 0);

/**
 * Compute the flight-risk score and full explanation.
 * @param {FlightRiskInput} input
 * @returns {{score:number, band:'High'|'Medium'|'Low', totalWeight:number, factors:Array<{key:string,label:string,weight:number,normalised:number,points:number,contributionPct:number,explanation:string}>}}
 */
export function computeFlightRisk(input) {
  let weighted = 0;
  const factors = FLIGHT_RISK_FACTORS.map((f) => {
    const n = clamp01(f.norm(input));
    const contribution = f.weight * n; // raw weighted contribution
    weighted += contribution;
    return {
      key: f.key,
      label: f.label,
      weight: f.weight,
      normalised: round2(n),
      points: round2((contribution / TOTAL_WEIGHT) * 100),
      contributionPct: 0, // filled below
      explanation: f.describe(input),
    };
  });
  const score = Math.round((weighted / TOTAL_WEIGHT) * 100);
  // contributionPct = share of the final score attributable to this factor
  for (const f of factors) {
    f.contributionPct = score > 0 ? round2((f.points / score) * 100) : 0;
  }
  factors.sort((a, b) => b.points - a.points);
  return { score, band: band(score), totalWeight: TOTAL_WEIGHT, factors };
}

/** @param {number} score */
export function band(score) {
  if (score >= 66) return 'High';
  if (score >= 33) return 'Medium';
  return 'Low';
}

/**
 * Derive a FlightRiskInput from a structure summary produced by the graph layer.
 * @param {Object} s
 * @returns {FlightRiskInput}
 */
export function deriveInput(s) {
  return {
    ownershipLayerDepth: s.depth ?? 1,
    jurisdictionCount: s.jurisdictions ?? 1,
    maxSecrecyScore: s.maxSecrecy ?? 0,
    nomineeInvolved: !!s.nominee,
    recentControlChanges: s.controlChanges ?? 0,
    dormantIntermediaries: s.dormant ?? 0,
    circularOwnership: !!s.circular,
    unexplainedTransfers: s.transfers ?? 0,
    highRiskLegalForm: !!s.highRiskForm,
    incompleteOwnershipData: !!s.incomplete,
    rapidAssetRelocation: !!s.relocation,
    offshoreConcentration: s.offshore ?? 0,
  };
}

function clamp01(x) {
  if (Number.isNaN(x) || x < 0) return 0;
  return x > 1 ? 1 : x;
}
function num(x) {
  return typeof x === 'number' && !Number.isNaN(x) ? x : 0;
}
function round2(x) {
  return Math.round(x * 100) / 100;
}
