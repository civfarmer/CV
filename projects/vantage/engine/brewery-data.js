// ============================================================================
// brewery-data.js  —  Demo dataset for the Brewery / Alcohol Distribution demo
//
// GRANULARITY: WEEKLY. Breweries plan stock and place supplier orders on a weekly
// cycle (kegging/canning runs, wholesale drops), and supplier lead times are quoted
// in weeks (4–8). So the operational planning horizon here is a QUARTER of weekly
// buckets (13 weeks), not months. The engine is granularity-agnostic; META.season=52
// (annual seasonality at weekly resolution) and META.horizon=13 drive it.
//
// PROVENANCE (enforced honestly throughout the UI):
//   • Seasonal SHAPE is anchored to REAL public data:
//       - FRED "Retail Sales: Beer, Wine & Liquor Stores" (MRTSSM4453USN),
//         U.S. Census Bureau, public domain — December + summer seasonality.
//       - Boston Beer Company (NYSE: SAM) public filings — summer-peak demand
//         and a wholesaler inventory target of ~4–5 weeks on hand.
//       - British Beer & Pub Association (BBPA) — on-trade seasonality of beer.
//     The monthly seasonal curves are interpolated to a smooth weekly profile.
//   • SKU-level WEEKLY VOLUMES, customers, inventory and constraints are SIMULATED
//     operational data (breweries do not publish this). They are generated from the
//     seasonal shapes above + documented trend/event assumptions, and are labelled
//     "simulated" everywhere they appear.
//   • Current inventory levels are labelled "user-entered" (from the brewery's stock
//     system); the pub-group contract is "contracted"; the autumn order is "pipeline".
// ============================================================================

export const META = {
  industry: 'brewery', mode: 'inventory',
  company: 'Hopmarket Brewing Co.', subtitle: 'Demand & stock forecast · next 13 weeks (Q3 2025)', industryTag: 'BREWERY',
  currency: '£', unit: 'cases', entityLabel: 'Lines',
  granularity: 'week', startDate: '2022-06-27', startLabel: '27 Jun 2022', weeks: 156, season: 52, horizon: 13,
  capacity: { label: 'Fermentation load', value: 1500, unit: 'cases/wk' },
  theme: {
    light: '--bg:#f0ebe2;--card:#faf8f4;--cardBorder:#e2d8c6;--cardShadow:0 4px 18px -8px rgba(40,30,15,0.12);--text:#163544;--textStrong:#0e2530;--textMuted:#5f7a88;--textSubtle:#93a0a8;--accent:#c5993e;--accentBg:rgba(197,153,62,0.10);--watneys:#8B2332;--watneysLight:rgba(139,35,50,0.10);--red:#a62b3a;--redBg:#f9e6e8;--amber:#a07520;--amberBg:#f8f0dd;--blue:#2a6090;--blueBg:#e6eef6;--green:#2d7a46;--greenBg:#e4f0e8;--topbar:#163544;--topbarText:#e8dcc8;--topbarSubtext:#8da4ae;--pillBg:rgba(255,255,255,0.12);--pillText:#c0b49e;--border:#e2d8c6;--inputBg:#fff;--inputBorder:#d4c8b2;--kpiValue:#0e2530;--sectionLabel:#c5993e;--watermarkOpacity:0.04;--watermarkBlend:multiply',
    dark: '--bg:#0c1f2a;--card:#132e3c;--cardBorder:#1e4050;--cardShadow:0 4px 18px -8px rgba(0,0,0,0.5);--text:#c8c0b0;--textStrong:#f0e8d8;--textMuted:#8da4ae;--textSubtle:#5f7a86;--accent:#d4a844;--accentBg:rgba(212,168,68,0.12);--watneys:#C4384C;--watneysLight:rgba(196,56,76,0.14);--red:#e05565;--redBg:rgba(224,85,101,0.12);--amber:#d4a844;--amberBg:rgba(212,168,68,0.10);--blue:#68a0cc;--blueBg:rgba(104,160,204,0.12);--green:#5cc07a;--greenBg:rgba(92,192,122,0.10);--topbar:#0a1820;--topbarText:#d4c8b4;--topbarSubtext:#6a8a95;--pillBg:rgba(255,255,255,0.08);--pillText:#8da4ae;--border:#1e4050;--inputBg:#0e2530;--inputBorder:#264555;--kpiValue:#f0e8d8;--sectionLabel:#d4a844;--watermarkOpacity:0.05;--watermarkBlend:screen',
    chartLight: { bg:'#faf8f4',grid:'#e8ddc9',axis:'#8a9ba5',hist:'#163544',fc:'#c5993e',band80:'rgba(197,153,62,0.18)',band95:'rgba(197,153,62,0.07)',alt:'#7a9aa8',now:'#c9b78f',mono:"'IBM Plex Mono',monospace",opt:'#2d7a46',con:'#a62b3a' },
    chartDark: { bg:'#132e3c',grid:'rgba(255,255,255,0.06)',axis:'#6a8490',hist:'#d8d0c0',fc:'#d4a844',band80:'rgba(212,168,68,0.18)',band95:'rgba(212,168,68,0.07)',alt:'#4a9a7a',now:'rgba(212,168,68,0.4)',mono:"'IBM Plex Mono',monospace",opt:'#5cc07a',con:'#e05565' },
  },
};

// ---- deterministic noise so the demo is stable across reloads ----
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- weekly calendar helpers (anchored to a real Monday, deterministic) ----
const WPY = 52, N = 156;                         // 3 years of weekly history
const DAYMS = 86400000, ANCHOR = Date.UTC(2022, 5, 27);   // Mon 27 Jun 2022
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const wdate = (w) => new Date(ANCHOR + w * 7 * DAYMS);
const wYear = (w) => wdate(w).getUTCFullYear();
const wMonth = (w) => wdate(w).getUTCMonth();
const wDom = (w) => wdate(w).getUTCDate();
const wlabel = (w) => `${wDom(w)} ${MON[wMonth(w)]}`;
const fracYear = (w) => { const d = wdate(w); const s = Date.UTC(d.getUTCFullYear(), 0, 1), e = Date.UTC(d.getUTCFullYear() + 1, 0, 1); return (d - s) / (e - s); };
// smooth periodic interpolation of a 12-value monthly curve to the week's position in the year
const seasW = (m12, w) => { const f = fracYear(w) * 12, lo = Math.floor(f) % 12, hi = (lo + 1) % 12, fr = f - Math.floor(f); return m12[lo] * (1 - fr) + m12[hi] * fr; };

export const DATE_LABELS = Array.from({ length: N }, (_, w) => wlabel(w));

// ---- exogenous drivers (aligned to the 156 weeks) ----
const TEMP_BASE = [4, 4, 6, 9, 13, 16, 18, 17, 14, 10, 7, 5]; // avg °C by calendar month (temperate NW-Europe)
const tempC = Array.from({ length: N }, (_, w) => Math.round(seasW(TEMP_BASE, w)));
for (let w = 0; w < N; w++) { const y = wYear(w), m = wMonth(w); if (y === 2023 && m === 6) tempC[w] += 6; if (y === 2024 && m === 1) tempC[w] -= 4; } // Jul-23 heatwave, Feb-24 cold snap
const promo = Array(N).fill(0);
for (let w = 0; w < N; w++) { const m = wMonth(w), d = wDom(w); if ((m === 4 || m === 6 || m === 9) && d <= 7) promo[w] = 1; } // early-May / early-Jul / early-Oct marketing pushes
const priceIdx = Array.from({ length: N }, (_, w) => { const y = wYear(w); return y <= 2022 ? 1.0 : y === 2023 ? 1.02 : y === 2024 ? 1.05 : 1.07; }); // annual list-price steps

export const DRIVERS = { tempC, promo, priceIdx, exogKeys: ['tempC', 'promo'] };

// ---- per-SKU seasonal profiles (multiplicative, indexed by calendar month) ----
const SEAS = {
  lager: [0.72, 0.74, 0.86, 0.98, 1.14, 1.30, 1.38, 1.32, 1.08, 0.92, 0.86, 1.06],
  stout: [1.28, 1.22, 1.05, 0.90, 0.78, 0.68, 0.64, 0.68, 0.86, 1.06, 1.30, 1.42],
  ipa:   [0.85, 0.86, 0.95, 1.02, 1.08, 1.14, 1.16, 1.12, 1.04, 0.97, 0.92, 1.05],
  pale:  [0.90, 0.90, 0.96, 1.02, 1.05, 1.06, 1.05, 1.04, 1.12, 1.14, 0.98, 0.96],
  saison:[0.00, 0.00, 0.00, 0.95, 1.10, 1.15, 0.00, 0.00, 0.00, 0.00, 1.05, 1.20], // limited release
  gin:   [0.78, 0.74, 0.80, 0.85, 0.92, 1.00, 0.98, 0.96, 1.02, 1.18, 1.55, 1.92], // spirit — Christmas gifting peak
  cider: [0.65, 0.68, 0.80, 0.95, 1.20, 1.40, 1.48, 1.40, 1.10, 0.85, 0.72, 0.77], // strong summer peak
  lowno: [1.35, 1.05, 0.95, 0.98, 1.05, 1.12, 1.14, 1.10, 1.02, 0.96, 0.92, 1.00], // Dry-January spike + summer bump
};

// monthly base volume -> weekly level (~4.33 weeks/month)
function buildSeries(monthlyBase, annualGrowth, seas, eventFn, rng, amp = 0.14) {
  const base = monthlyBase / 4.33;
  const out = [];
  for (let w = 0; w < N; w++) {
    const trend = base * (1 + annualGrowth * (w / WPY));
    let v = trend * seasW(seas, w);
    if (eventFn) v = eventFn(v, w);
    if (v > 0) v *= 1 + (rng() - 0.5) * 2 * amp; // ±amp weekly operational noise
    out.push(Math.max(0, Math.round(v)));
  }
  return out;
}
// limited/seasonal release — genuinely intermittent at weekly resolution (Croston territory)
function buildIntermittent(monthlyBase, seas, rng) {
  const base = monthlyBase / 4.33;
  const out = [];
  for (let w = 0; w < N; w++) {
    const s = seas[wMonth(w)];
    let v = 0;
    if (s > 0 && rng() < 0.5) v = base * s * (1 + (rng() - 0.5) * 0.6); // a batch drops ~every other week in-season
    out.push(Math.max(0, Math.round(v)));
  }
  return out;
}

// Event overlays (documented, forecast-changing) --------------------------------
const inApr2025 = (w) => (wYear(w) > 2025 || (wYear(w) === 2025 && wMonth(w) >= 3));
const heat = (v, w) => (wYear(w) === 2023 && wMonth(w) === 6 ? v * 1.22 : v);                        // Jul 2023 heatwave
const festival = (v, w) => (wYear(w) === 2024 && wMonth(w) === 7 && wDom(w) >= 10 && wDom(w) <= 24 ? v * 1.15 : v); // Aug 2024 city festival (2 wks)
const quiet = (v, w) => (wYear(w) === 2024 && wMonth(w) === 1 ? v * 0.86 : v);                        // Feb 2024 washout
const contractLager = (v, w) => (inApr2025(w) ? v + 180 / 4.33 : v);                                  // Apr 2025 pub-group contract (+180/mo)
const contractIpa = (v, w) => (inApr2025(w) ? v + 90 / 4.33 : v);

const rng = mulberry32(20240607);

const lagerSeries = buildSeries(1150, 0.14, SEAS.lager, (v, w) => contractLager(quiet(festival(heat(v, w), w), w), w), rng, 0.13);
const stoutSeries = buildSeries(560, 0.04, SEAS.stout, (v, w) => quiet(v, w), rng, 0.15);
const ipaSeries   = buildSeries(720, 0.30, SEAS.ipa, (v, w) => contractIpa(quiet(heat(v, w), w), w), rng, 0.14);
const paleSeries  = buildSeries(700, 0.02, SEAS.pale, (v, w) => festival(quiet(v, w), w), rng, 0.15);
const saisonSeries = buildIntermittent(300, SEAS.saison, rng);
const ginSeries = buildSeries(165, 0.12, SEAS.gin, null, rng, 0.16);
const ciderSeries = buildSeries(620, 0.08, SEAS.cider, (v, w) => festival(quiet(heat(v, w), w), w), rng, 0.14);
const lownoSeries = buildSeries(300, 0.38, SEAS.lowno, (v, w) => quiet(v, w), rng, 0.15);

// ---- SKUs (current inventory state labelled "user-entered"; onHand/onOrder in cases) ----
export const SKUS = [
  {
    id: 'lager', name: 'Helios Lager', style: 'Helles Lager', abv: '4.6%', hue: 42,
    price: 28, unitMargin: 9.4, series: lagerSeries, dryHopped: false, useDrivers: true,
    onHand: 1180, onOrder: 600, leadTimeWeeks: 4, shelfLifeMonths: 6,
    note: 'Flagship. Summer-peaking; heatwave-sensitive. New pub-group contract from Apr 2025.',
  },
  {
    id: 'ipa', name: 'Tropic IPA', style: 'Hazy IPA', abv: '6.2%', hue: 88,
    price: 30, unitMargin: 10.2, series: ipaSeries, dryHopped: true, useDrivers: true,
    onHand: 640, onOrder: 300, leadTimeWeeks: 5, shelfLifeMonths: 5,
    note: 'Fastest-growing line (+30%/yr). Dry-hopped — exposed to the hop lead-time increase.',
  },
  {
    id: 'stout', name: 'Midnight Stout', style: 'Oatmeal Stout', abv: '5.4%', hue: 24,
    price: 32, unitMargin: 11.0, series: stoutSeries, dryHopped: false,
    onHand: 1500, onOrder: 0, leadTimeWeeks: 4, shelfLifeMonths: 8,
    note: 'Winter line. Currently in seasonal trough — overstock risk into summer.',
  },
  {
    id: 'pale', name: 'Harvest Pale Ale', style: 'American Pale', abv: '5.0%', hue: 56,
    price: 27, unitMargin: 8.6, series: paleSeries, dryHopped: true,
    onHand: 900, onOrder: 200, leadTimeWeeks: 4, shelfLifeMonths: 6,
    note: 'Steady seller with an autumn bump. Dry-hopped.',
  },
  {
    id: 'saison', name: 'Solstice Saison', style: 'Farmhouse Saison', abv: '5.8%', hue: 48,
    price: 34, unitMargin: 12.0, series: saisonSeries, dryHopped: false,
    onHand: 210, onOrder: 0, leadTimeWeeks: 6, shelfLifeMonths: 4, intermittent: true,
    note: 'Limited seasonal release — intermittent demand (Croston territory).',
  },
  {
    id: 'gin', name: 'Aurora Gin', style: 'Small-batch Gin (70cl)', abv: '42%', hue: 60,
    price: 46, unitMargin: 26.0, series: ginSeries, dryHopped: false, category: 'Spirit', brewed: false,
    onHand: 500, onOrder: 0, leadTimeWeeks: 8, shelfLifeMonths: 36,
    note: 'Distributed spirit (not brewed). Strong Christmas gifting peak; long 8-week sourcing lead time and 36-month shelf life.',
  },
  {
    id: 'cider', name: 'Orchard Cider', style: 'Dry Craft Cider', abv: '5.2%', hue: 50,
    price: 26, unitMargin: 9.0, series: ciderSeries, dryHopped: false, category: 'Cider', brewed: true,
    onHand: 380, onOrder: 200, leadTimeWeeks: 4, shelfLifeMonths: 9,
    note: 'Strong summer-peaking cider — heatwave-sensitive, like lager but more extreme.',
  },
  {
    id: 'lowno', name: 'Clear Skies 0.5%', style: 'Low/No Pale', abv: '0.5%', hue: 72,
    price: 25, unitMargin: 8.5, series: lownoSeries, dryHopped: false, category: 'Low/No', brewed: true,
    onHand: 720, onOrder: 200, leadTimeWeeks: 4, shelfLifeMonths: 7,
    note: 'Fastest-growing category (+38%/yr) with a Dry-January spike. Likely under-stocked for its trend.',
  },
];

// ---- industry model policy (baked-in: the maths is linked to the business) ----
export const MODEL_POLICY = {
  label: 'Seasonal demand + intermittent (beer & spirits distribution)',
  modelKeys: ['snaive', 'ma', 'ses', 'holt', 'hw', 'reg'],
  headline: 'Holt-Winters · ETS · weather-regression · Croston',
  rationale: 'Weekly drinks demand is strongly seasonal with weather, holiday and event drivers — so Holt-Winters (annual season = 52 weeks), exponential smoothing and weather-aware regression lead. Limited and seasonal releases behave intermittently at weekly resolution, so Croston is included and tested. Seasonal-naive and moving-average baselines always run as honesty checks; the champion is whichever wins the rolling-origin back-test per line.',
};

// ---- future scenario drivers (next 13 weeks, the quarter horizon) ----
export const FUTURE = {
  weeks: 13,
  labels: Array.from({ length: 13 }, (_, k) => wlabel(N + k)),
  tempC: Array.from({ length: 13 }, (_, k) => Math.round(seasW(TEMP_BASE, N + k))),
  promo: Array.from({ length: 13 }, (_, k) => { const w = N + k; return (wMonth(w) === 6 || wMonth(w) === 9) && wDom(w) <= 7 ? 1 : 0; }),
};

// ---- events (forecast-changing, for the timeline + explanations) ----
export const EVENTS = [
  { when: 'Jul 2023', label: 'Jul 2023 heatwave', kind: 'spike', provenance: 'public', detail: '+22% lager, +12% IPA vs seasonal norm.' },
  { when: 'Feb 2024', label: 'Feb 2024 washout', kind: 'weak', provenance: 'simulated', detail: 'Wet, cold weeks; on-trade footfall down ~14%.' },
  { when: 'Aug 2024', label: 'Aug 2024 city festival', kind: 'spike', provenance: 'simulated', detail: 'Local event; +15% lager, +10% pale for two weeks.' },
  { when: 'Apr 2025', label: 'Apr 2025 pub-group contract', kind: 'contract', provenance: 'contracted', detail: 'The Ferryman group (14 sites): +180 lager, +90 IPA / month (≈ +42 / +21 per week).' },
];

// ---- constraints (production / supply / logistics) ----
export const CONSTRAINTS = {
  fermentationCapacity: 1500,   // cases/week across all brewed SKUs
  deliveryCapacity: 1300,       // cases/week
  hopLeadTimeWeeks: { was: 4, now: 7, since: 'May 2025', affects: ['ipa', 'pale'] },
  provenance: 'user-entered',
};

// ---- commercial context ----
export const CONTRACT = {
  customer: 'The Ferryman pub group (14 sites)',
  fromLabel: 'Apr 2025', lagerPerWeek: 42, ipaPerWeek: 21,
  provenance: 'contracted',
};
export const PIPELINE = {
  customer: 'Regional wholesaler — autumn programme', sku: 'ipa',
  perWeek: 55, weeks: 12, probability: 0.6, provenance: 'pipeline',
};

// ---- customers / channels (for customer-level demand view) ----
export const CHANNELS = [
  { id: 'taproom', name: 'Taproom', share: 0.22, trend: +0.06 },
  { id: 'wholesale', name: 'Wholesale', share: 0.41, trend: +0.11 },
  { id: 'distributor', name: 'Distributor', share: 0.27, trend: +0.03 },
  { id: 'export', name: 'Export', share: 0.10, trend: +0.18 },
];

// ---- public reference sources (shown in the Data Confidence panel) ----
export const REFERENCES = [
  { name: 'FRED — Retail Sales: Beer, Wine & Liquor Stores (MRTSSM4453USN)', org: 'U.S. Census Bureau', kind: 'Public economic time series', use: 'Seasonal shape (Dec peak + summer lift), interpolated to weekly', license: 'Public domain' },
  { name: 'Boston Beer Company (NYSE: SAM)', org: 'SEC filings / investor reports', kind: 'Public company financials', use: 'Summer-peak seasonality; 4–5 weeks-on-hand inventory target', license: 'Public' },
  { name: 'British Beer & Pub Association (BBPA)', org: 'BBPA Statistical Handbook', kind: 'Industry statistics', use: 'On-trade beer seasonality', license: 'Public' },
];

// ---- generic aliases for the shared engine ----
export const ENTITIES = SKUS;
export const GAPS = [
  'Daily point-of-sale granularity — the model currently runs on weekly aggregates.',
  'Weather actuals for the forecast weeks (using seasonal normals now).',
  'Confirmed event calendar for the next quarter.',
  'Point-of-sale data from pub/restaurant partners.',
  'Customer-level order history (currently aggregated).',
];

// ---- provenance legend for the Data Confidence panel ----
export const PROVENANCE = [
  { key: 'actual', label: 'Actual historical', color: '#3f7d4e', desc: 'Recorded sales in the week.' },
  { key: 'simulated', label: 'Simulated operational', color: '#b5761f', desc: 'SKU volumes generated from real seasonal shapes + documented assumptions.' },
  { key: 'public', label: 'Publicly sourced', color: '#2f6f9f', desc: 'From public economic / company data.' },
  { key: 'user-entered', label: 'User-entered', color: '#6b6f76', desc: 'Entered by the operator (e.g. current stock).' },
  { key: 'contracted', label: 'Contracted future', color: '#5a4bb3', desc: 'Signed, committed future orders.' },
  { key: 'pipeline', label: 'Probable pipeline', color: '#9a5b9c', desc: 'Likely but unsigned future revenue.' },
];
