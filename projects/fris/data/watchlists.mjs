// @ts-check
/**
 * Screening & Watchlist -- a DATED, ILLUSTRATIVE SUBSET of REAL public sanctions data.
 *
 * The data layer the screening engine (`engines/screening.mjs`) matches names,
 * aliases, wallet addresses and entities against. Static, framework-free,
 * importable by both the Node server and the browser build, with zero DB dependency.
 *
 * -- DATA PROVENANCE & HONESTY (read this) -----------------------------------
 * Every SANCTIONS entry below is a REAL, PUBLIC designation reproduced from an
 * official consolidated list -- OFAC's Specially Designated Nationals (SDN) List
 * (US Treasury), the UN Security Council Consolidated List, the EU Consolidated
 * List, and the UK OFSI consolidated list. Consolidated sanctions lists are
 * published by governments precisely so that firms can screen against them;
 * reproducing a sourced, dated subset with attribution is their intended use.
 * Each entry carries its sanctioning `authority` (and, where a party is listed by
 * more than one body, an `authorities` array), the `program`/regime, a real
 * `listingDate`, the `country`/nationality where public, the official
 * reason-for-listing (paraphrased) in `description`/`note`, and a `sourceUrl`.
 *
 * This is a DATED SUBSET captured for demonstration, NOT a complete or live feed.
 * Sanctions lists change frequently (additions, amendments, delistings). For any
 * operational screening decision you MUST consult the live official sources. This
 * is not legal advice and is NOT a sanctions-compliance system of record.
 *
 * -- LIST MEMBERSHIP (multi-list) --------------------------------------------
 * A KYC/AML programme runs FOUR screening lists (sanctions / PEP / adverse-media /
 * internal). An entry can belong to MORE THAN ONE, so each carries a `lists`
 * ARRAY rather than a single value:
 *   - Every entry is on `sanctions` (they are all real sanctions designations).
 *   - `pep` is added to PERSONS who hold or held a prominent public function
 *     (heads of state/government, ministers, senior officials, central-bank
 *     governors, senior military/security) and close family/associates the
 *     designation names as such -- derived from the real facts in each entry.
 *   - `adverse-media` is added, conservatively, where the designation is
 *     inherently about widely-reported criminality (narcotics kingpins, terrorism
 *     leaders, major cyber-crime / laundering).
 *   - `internal` (the firm's own watchlist) is populated by the firm in a real
 *     deployment -- 0 here by design.
 * No PEP / adverse-media / internal NAMES are fabricated: every tag sits on a real
 * sanctions designation.
 *
 * All entries carry `data_classification: 'real-public-source'`.
 * Snapshot date: 2026-07-06.
 */

/* eslint-disable max-len */

// ------------------------------------------------------------------
// LIST TYPES -- the four screening list categories every KYC/AML programme runs.
// ------------------------------------------------------------------

/** @typedef {{ code:'sanctions'|'pep'|'adverse-media'|'internal', label:string, blurb:string, severity:'High'|'Medium'|'Low' }} ListType */

/** @type {ListType[]} */
export const LIST_TYPES = [
  { code: 'sanctions', label: 'Sanctions', severity: 'High',
    blurb: 'A DATED, illustrative subset of REAL public consolidated sanctions / asset-freeze lists (OFAC SDN, UN Security Council, EU, UK OFSI). A confirmed sanctions hit blocks onboarding and freezes assets. Lists change frequently -- always screen against the live official sources for operational use.' },
  { code: 'pep', label: 'PEP (politically-exposed person)', severity: 'Medium',
    blurb: 'Politically-exposed persons -- heads of state/government, ministers, senior officials, central-bank governors, senior military/security, and their close family/associates. A PEP match triggers enhanced due diligence, not a block. Here the tag sits on real sanctioned persons who hold or held a prominent public function (no PEP names are fabricated).' },
  { code: 'adverse-media', label: 'Adverse media', severity: 'Medium',
    blurb: 'Negative-news hits (narcotics, terrorism, major cyber-crime, fraud, laundering). Here the tag is applied conservatively to real designations that are inherently about widely-reported criminality (no adverse-media names are fabricated).' },
  { code: 'internal', label: 'Internal watchlist', severity: 'Low',
    blurb: 'The organisation\'s own watchlist -- declined counterparties, exited relationships, elevated-risk flags. Illustrative list type -- populated by the firm in a real deployment (0 entries here by design).' },
];

/** @type {Record<string, ListType>} */
export const LIST_TYPE_BY_CODE = Object.fromEntries(LIST_TYPES.map((l) => [l.code, l]));

// ------------------------------------------------------------------
// MATCH BANDS -- how a numeric 0-100 score is bucketed into a disposition band.
// ------------------------------------------------------------------

/** @typedef {{ code:'strong'|'possible'|'weak', label:string, min:number, colour:'High'|'Medium'|'Low', meaning:string }} Band */

/** @type {Band[]} */
export const BANDS = [
  { code: 'strong', label: 'Strong match', min: 82, colour: 'High',
    meaning: 'High name/identifier similarity with corroboration. Treat as a likely true hit and disposition it (confirm or clear with a reason).' },
  { code: 'possible', label: 'Possible match', min: 60, colour: 'Medium',
    meaning: 'Meaningful similarity but not conclusive. Review the "why matched" breakdown and any date-of-birth / country corroboration before deciding.' },
  { code: 'weak', label: 'Weak match', min: 40, colour: 'Low',
    meaning: 'Low similarity -- most often a false positive (common tokens, partial overlap). Usually cleared, but recorded so the decision is auditable.' },
];

/** Bucket a 0-100 score into a band code. Scores below the weakest floor return null (not a candidate). */
export function bandFor(score) {
  for (const b of BANDS) if (score >= b.min) return b.code;
  return null;
}
export const BAND_FLOOR = BANDS[BANDS.length - 1].min; // the minimum score to be a candidate at all
export const BAND_BY_CODE = Object.fromEntries(BANDS.map((b) => [b.code, b]));

// ------------------------------------------------------------------
// WATCHLIST ENTRIES -- REAL public sanctions designations (see provenance note).
//
// Field notes:
//   id            stable WL-* identifier.
//   lists         string[] of LIST_TYPES codes the entry belongs to (>=1; always
//                 includes 'sanctions'). An entry counts toward EACH list it is in.
//   kind          'person' | 'organisation' | 'wallet' | 'vessel'.
//   name          the primary listed name (or wallet address for kind:wallet).
//   aliases       officially-listed aka's / transliterations (subset).
//   dob           YYYY-MM-DD (persons; where a public date of birth exists).
//   country       ISO-ish nationality / jurisdiction.
//   authority     'OFAC' | 'UN' | 'EU' | 'OFSI' -- the primary sanctioning body.
//   authorities   string[] when the SAME party is listed by more than one body.
//   program       the sanctions programme / regime under which listed.
//   listingDate   the real designation / listing date (YYYY-MM-DD).
//   description   the official reason-for-listing, paraphrased (1-2 sentences).
//   note          mirror of `description` (the engine reads `note`).
//   address       wallet address (kind:wallet).
//   imo           IMO number (kind:vessel), where public.
//   sourceUrl     link to the official list or designation announcement.
//   additionalSources  extra official links when a party is multiply-listed.
// ------------------------------------------------------------------

/** @typedef {{ id:string, lists:Array<'sanctions'|'pep'|'adverse-media'|'internal'>, kind:'person'|'organisation'|'wallet'|'vessel', name:string, aliases?:string[], dob?:string, country?:string, authority:string, authorities?:string[], program:string, listingDate:string, description:string, note:string, address?:string, imo?:string, sourceUrl:string, additionalSources?:string[], data_classification:'real-public-source' }} WatchlistEntry */

/** @type {WatchlistEntry[]} */
export const WATCHLIST_ENTRIES = [
  {
    "id": "WL-0001",
    "lists": [
      "sanctions",
      "pep"
    ],
    "kind": "person",
    "name": "Vladimir Vladimirovich Putin",
    "aliases": [
      "Vladimir Putin",
      "Vladimir Poutine"
    ],
    "dob": "1952-10-07",
    "country": "RU",
    "authority": "OFAC",
    "authorities": [
      "OFAC",
      "EU"
    ],
    "program": "Russian Harmful Foreign Activities (E.O. 14024)",
    "listingDate": "2022-02-25",
    "description": "President of the Russian Federation; designated in connection with Russia’s unprovoked full-scale invasion of Ukraine. Sanctioned by both the US (OFAC, E.O. 14024) and the EU on 25 Feb 2022.",
    "note": "President of the Russian Federation; designated in connection with Russia’s unprovoked full-scale invasion of Ukraine. Sanctioned by both the US (OFAC, E.O. 14024) and the EU on 25 Feb 2022.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/jy0612",
    "additionalSources": [
      "https://www.consilium.europa.eu/en/press/press-releases/2022/02/25/russia-s-military-aggression-against-ukraine-eu-imposes-sanctions-against-president-putin-and-foreign-minister-lavrov-and-adopts-wide-ranging-individual-and-economic-sanctions/"
    ],
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0002",
    "lists": [
      "sanctions",
      "pep"
    ],
    "kind": "person",
    "name": "Sergei Viktorovich Lavrov",
    "aliases": [
      "Sergey Lavrov",
      "Sergei Lavrov",
      "Sergey Viktorovich Lavrov"
    ],
    "dob": "1950-03-21",
    "country": "RU",
    "authority": "OFAC",
    "authorities": [
      "OFAC",
      "EU"
    ],
    "program": "Russian Harmful Foreign Activities (E.O. 14024)",
    "listingDate": "2022-02-25",
    "description": "Minister of Foreign Affairs of the Russian Federation; designated over Russia’s military aggression against Ukraine. Sanctioned by both the US (OFAC, E.O. 14024) and the EU on 25 Feb 2022.",
    "note": "Minister of Foreign Affairs of the Russian Federation; designated over Russia’s military aggression against Ukraine. Sanctioned by both the US (OFAC, E.O. 14024) and the EU on 25 Feb 2022.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/jy0612",
    "additionalSources": [
      "https://www.consilium.europa.eu/en/press/press-releases/2022/02/25/russia-s-military-aggression-against-ukraine-eu-imposes-sanctions-against-president-putin-and-foreign-minister-lavrov-and-adopts-wide-ranging-individual-and-economic-sanctions/"
    ],
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0003",
    "lists": [
      "sanctions",
      "pep"
    ],
    "kind": "person",
    "name": "Dmitry Anatolyevich Medvedev",
    "aliases": [
      "Dmitry Medvedev",
      "Dmitri Medvedev"
    ],
    "dob": "1965-09-14",
    "country": "RU",
    "authority": "OFAC",
    "program": "Russian Harmful Foreign Activities (E.O. 14024)",
    "listingDate": "2022-04-06",
    "description": "Deputy Chairman of the Russian Security Council and former President/Prime Minister of Russia; designated as a leader of the Government of Russia.",
    "note": "Deputy Chairman of the Russian Security Council and former President/Prime Minister of Russia; designated as a leader of the Government of Russia.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/jy0650",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0004",
    "lists": [
      "sanctions",
      "pep"
    ],
    "kind": "person",
    "name": "Igor Ivanovich Sechin",
    "aliases": [
      "Igor Sechin"
    ],
    "dob": "1960-09-07",
    "country": "RU",
    "authority": "OFAC",
    "program": "Russian Harmful Foreign Activities (E.O. 14024)",
    "listingDate": "2022-02-24",
    "description": "Executive Chairman of Rosneft and a close Putin associate; designated as a leader/official of the Government of Russia.",
    "note": "Executive Chairman of Rosneft and a close Putin associate; designated as a leader/official of the Government of Russia.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/jy0608",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0005",
    "lists": [
      "sanctions"
    ],
    "kind": "person",
    "name": "Gennady Nikolayevich Timchenko",
    "aliases": [
      "Gennady Timchenko"
    ],
    "dob": "1952-11-09",
    "country": "RU",
    "authority": "OFAC",
    "program": "Russian Harmful Foreign Activities (E.O. 14024)",
    "listingDate": "2022-02-24",
    "description": "Billionaire owner of the Volga Group and close Putin associate; re-designated as a member of the Russian elite enabling the war against Ukraine.",
    "note": "Billionaire owner of the Volga Group and close Putin associate; re-designated as a member of the Russian elite enabling the war against Ukraine.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/jy0608",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0006",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "person",
    "name": "Oleg Vladimirovich Deripaska",
    "aliases": [
      "Oleg Deripaska"
    ],
    "dob": "1968-01-02",
    "country": "RU",
    "authority": "OFAC",
    "program": "Ukraine-/Russia-Related Sanctions (CAATSA / E.O. 13661)",
    "listingDate": "2018-04-06",
    "description": "Russian oligarch controlling EN+ and RUSAL; designated for acting on behalf of the Government of Russia amid allegations of extortion, racketeering and bribery.",
    "note": "Russian oligarch controlling EN+ and RUSAL; designated for acting on behalf of the Government of Russia amid allegations of extortion, racketeering and bribery.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/sm0338",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0007",
    "lists": [
      "sanctions"
    ],
    "kind": "person",
    "name": "Alisher Burhanovich Usmanov",
    "aliases": [
      "Alisher Usmanov"
    ],
    "dob": "1953-09-09",
    "country": "RU",
    "authority": "OFAC",
    "program": "Russian Harmful Foreign Activities (E.O. 14024)",
    "listingDate": "2022-03-03",
    "description": "One of Russia’s wealthiest oligarchs with metals, mining and media holdings; designated over close ties to the Russian regime.",
    "note": "One of Russia’s wealthiest oligarchs with metals, mining and media holdings; designated over close ties to the Russian regime.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/jy0628",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0008",
    "lists": [
      "sanctions",
      "pep"
    ],
    "kind": "person",
    "name": "Alina Maratovna Kabaeva",
    "aliases": [
      "Alina Kabaeva",
      "Alina Kabayeva"
    ],
    "dob": "1983-05-12",
    "country": "RU",
    "authority": "OFAC",
    "program": "Russian Harmful Foreign Activities (E.O. 14024)",
    "listingDate": "2022-08-02",
    "description": "Former State Duma deputy and head of a pro-Kremlin media group; designated as a member of the Russian elite close to Putin.",
    "note": "Former State Duma deputy and head of a pro-Kremlin media group; designated as a member of the Russian elite close to Putin.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/jy0905",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0009",
    "lists": [
      "sanctions"
    ],
    "kind": "person",
    "name": "Roman Arkadyevich Abramovich",
    "aliases": [
      "Roman Abramovich"
    ],
    "dob": "1966-10-24",
    "country": "RU",
    "authority": "OFAC",
    "authorities": [
      "OFAC",
      "OFSI"
    ],
    "program": "Russian Harmful Foreign Activities (E.O. 14024)",
    "listingDate": "2023-06-30",
    "description": "Russian billionaire with steel and investment holdings (former Chelsea FC owner, ~29% of Evraz); designated by OFAC in connection with Russia’s war against Ukraine and separately added to the UK asset-freeze list (OFSI, 10 Mar 2022).",
    "note": "Russian billionaire with steel and investment holdings (former Chelsea FC owner, ~29% of Evraz); designated by OFAC in connection with Russia’s war against Ukraine and separately added to the UK asset-freeze list (OFSI, 10 Mar 2022).",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/jy0650",
    "additionalSources": [
      "https://www.gov.uk/government/news/uk-sanctions-oligarchs-worth-15bn-following-russias-invasion-of-ukraine"
    ],
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0010",
    "lists": [
      "sanctions"
    ],
    "kind": "person",
    "name": "Konstantin Valeryevich Malofeyev",
    "aliases": [
      "Konstantin Malofeev",
      "Konstantin Malofeyev"
    ],
    "dob": "1974-07-03",
    "country": "RU",
    "authority": "OFAC",
    "program": "Russian Harmful Foreign Activities (E.O. 14024)",
    "listingDate": "2022-04-20",
    "description": "Russian oligarch and financier of pro-Russian separatists; designated for a network funding malign influence and destabilisation of Ukraine.",
    "note": "Russian oligarch and financier of pro-Russian separatists; designated for a network funding malign influence and destabilisation of Ukraine.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/jy0731",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0011",
    "lists": [
      "sanctions",
      "pep"
    ],
    "kind": "person",
    "name": "Ramzan Akhmadovich Kadyrov",
    "aliases": [
      "Ramzan Kadyrov"
    ],
    "dob": "1976-10-05",
    "country": "RU",
    "authority": "OFAC",
    "program": "Global Magnitsky (E.O. 13818)",
    "listingDate": "2017-12-20",
    "description": "Head of the Chechen Republic; designated for responsibility for extrajudicial killing, torture and other gross human-rights abuses.",
    "note": "Head of the Chechen Republic; designated for responsibility for extrajudicial killing, torture and other gross human-rights abuses.",
    "sourceUrl": "https://ofac.treasury.gov/recent-actions/20171220_33",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0012",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "person",
    "name": "Yevgeniy Viktorovich Prigozhin",
    "aliases": [
      "Yevgeny Prigozhin",
      "Evgeny Prigozhin"
    ],
    "dob": "1961-06-01",
    "country": "RU",
    "authority": "OFAC",
    "authorities": [
      "OFAC",
      "EU"
    ],
    "program": "Ukraine-/Russia-Related Sanctions (E.O. 13661)",
    "listingDate": "2016-12-20",
    "description": "Financier of the Wagner Group and the Internet Research Agency; OFAC-designated (2016) for materially assisting senior Russian officials and election-interference operations, and separately EU-listed (15 Oct 2020) over Wagner’s activities. (Historical designation; died 2023.)",
    "note": "Financier of the Wagner Group and the Internet Research Agency; OFAC-designated (2016) for materially assisting senior Russian officials and election-interference operations, and separately EU-listed (15 Oct 2020) over Wagner’s activities. (Historical designation; died 2023.)",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/sm787",
    "additionalSources": [
      "https://www.consilium.europa.eu/en/press/press-releases/2020/10/15/"
    ],
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0013",
    "lists": [
      "sanctions"
    ],
    "kind": "person",
    "name": "Dmitriy Valeryevich Utkin",
    "aliases": [
      "Dmitry Utkin",
      "Dmitriy Utkin"
    ],
    "dob": "1970-06-11",
    "country": "RU",
    "authority": "OFAC",
    "program": "Ukraine-/Russia-Related Sanctions",
    "listingDate": "2017-06-20",
    "description": "Founder and field commander of the Wagner Group; designated for his role in Russia’s activities in eastern Ukraine.",
    "note": "Founder and field commander of the Wagner Group; designated for his role in Russia’s activities in eastern Ukraine.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/sm0114",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0014",
    "lists": [
      "sanctions"
    ],
    "kind": "organisation",
    "name": "Public Joint Stock Company Sberbank of Russia",
    "aliases": [
      "Sberbank",
      "PJSC Sberbank"
    ],
    "country": "RU",
    "authority": "OFAC",
    "program": "Russian Harmful Foreign Activities (E.O. 14024)",
    "listingDate": "2022-02-24",
    "description": "Russia’s largest financial institution; subjected to correspondent-account and later full blocking measures over Russia’s invasion of Ukraine.",
    "note": "Russia’s largest financial institution; subjected to correspondent-account and later full blocking measures over Russia’s invasion of Ukraine.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/jy0608",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0015",
    "lists": [
      "sanctions"
    ],
    "kind": "organisation",
    "name": "VTB Bank Public Joint Stock Company",
    "aliases": [
      "VTB Bank",
      "Bank VTB"
    ],
    "country": "RU",
    "authority": "OFAC",
    "program": "Russian Harmful Foreign Activities (E.O. 14024)",
    "listingDate": "2022-02-24",
    "description": "Russia’s second-largest bank; fully blocked as being owned/controlled by, and operating in the financial-services sector of, the Government of Russia.",
    "note": "Russia’s second-largest bank; fully blocked as being owned/controlled by, and operating in the financial-services sector of, the Government of Russia.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/jy0608",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0016",
    "lists": [
      "sanctions"
    ],
    "kind": "organisation",
    "name": "Gazprombank Joint Stock Company",
    "aliases": [
      "Gazprombank",
      "GPB"
    ],
    "country": "RU",
    "authority": "OFAC",
    "program": "Russian Harmful Foreign Activities (E.O. 14024)",
    "listingDate": "2024-11-21",
    "description": "Major Russian bank; designated for operating in the financial-services sector and serving as a conduit for Russia to purchase military materiel.",
    "note": "Major Russian bank; designated for operating in the financial-services sector and serving as a conduit for Russia to purchase military materiel.",
    "sourceUrl": "https://ofac.treasury.gov/recent-actions/20241121",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0017",
    "lists": [
      "sanctions"
    ],
    "kind": "organisation",
    "name": "Internet Research Agency LLC",
    "aliases": [
      "IRA",
      "Glavset"
    ],
    "country": "RU",
    "authority": "OFAC",
    "program": "Malicious Cyber-Enabled Activities (E.O. 13694)",
    "listingDate": "2018-03-15",
    "description": "Russian troll farm; designated for interfering with and undermining U.S. election processes through coordinated online disinformation.",
    "note": "Russian troll farm; designated for interfering with and undermining U.S. election processes through coordinated online disinformation.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/sm0312",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0018",
    "lists": [
      "sanctions"
    ],
    "kind": "organisation",
    "name": "National Settlement Depository",
    "aliases": [
      "NSD",
      "Natsionalny Raschetny Depozitary"
    ],
    "country": "RU",
    "authority": "OFAC",
    "program": "Russian Harmful Foreign Activities (E.O. 14024)",
    "listingDate": "2024-06-12",
    "description": "Russia’s central securities depository; designated for operating in the financial-services sector of the Russian economy.",
    "note": "Russia’s central securities depository; designated for operating in the financial-services sector of the Russian economy.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/jy2394",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0019",
    "lists": [
      "sanctions"
    ],
    "kind": "organisation",
    "name": "Public Joint Stock Company Sovcomflot",
    "aliases": [
      "Sovcomflot",
      "SCF Group"
    ],
    "country": "RU",
    "authority": "OFAC",
    "program": "Russian Harmful Foreign Activities (E.O. 14024)",
    "listingDate": "2024-02-23",
    "description": "Russia’s state-owned shipping company; designated for operating in the marine sector and carrying Russian oil in connection with price-cap evasion.",
    "note": "Russia’s state-owned shipping company; designated for operating in the marine sector and carrying Russian oil in connection with price-cap evasion.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/jy2121",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0020",
    "lists": [
      "sanctions"
    ],
    "kind": "vessel",
    "name": "NS Antarctic",
    "aliases": [
      "M/T NS Antarctic"
    ],
    "country": "RU",
    "authority": "OFAC",
    "program": "Russian Harmful Foreign Activities (E.O. 14024)",
    "listingDate": "2024-02-23",
    "description": "Crude-oil tanker identified as blocked property of Sovcomflot in the February 2024 action targeting Russia’s oil-transport fleet.",
    "note": "Crude-oil tanker identified as blocked property of Sovcomflot in the February 2024 action targeting Russia’s oil-transport fleet.",
    "imo": "9413559",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/jy2121",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0021",
    "lists": [
      "sanctions"
    ],
    "kind": "vessel",
    "name": "NS Bravo",
    "aliases": [
      "M/T NS Bravo"
    ],
    "country": "RU",
    "authority": "OFAC",
    "program": "Russian Harmful Foreign Activities (E.O. 14024)",
    "listingDate": "2024-02-23",
    "description": "Oil tanker identified as blocked property of Sovcomflot in the February 2024 shadow-fleet / price-cap action.",
    "note": "Oil tanker identified as blocked property of Sovcomflot in the February 2024 shadow-fleet / price-cap action.",
    "imo": "9412359",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/jy2121",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0022",
    "lists": [
      "sanctions"
    ],
    "kind": "vessel",
    "name": "NS Burgas",
    "aliases": [
      "M/T NS Burgas"
    ],
    "country": "RU",
    "authority": "OFAC",
    "program": "Russian Harmful Foreign Activities (E.O. 14024)",
    "listingDate": "2024-02-23",
    "description": "Oil tanker identified as blocked property of Sovcomflot in the February 2024 action against Russia’s oil exports.",
    "note": "Oil tanker identified as blocked property of Sovcomflot in the February 2024 action against Russia’s oil exports.",
    "imo": "9411020",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/jy2121",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0023",
    "lists": [
      "sanctions"
    ],
    "kind": "organisation",
    "name": "RIA FAN",
    "aliases": [
      "Federal News Agency",
      "Federalnoye Agentstvo Novostey"
    ],
    "country": "RU",
    "authority": "EU",
    "program": "EU restrictive measures — Russia (Ukraine)",
    "listingDate": "2023-04-13",
    "description": "Russian news agency in the Prigozhin media network; EU-listed for propaganda supporting Russia’s aggression against Ukraine.",
    "note": "Russian news agency in the Prigozhin media network; EU-listed for propaganda supporting Russia’s aggression against Ukraine.",
    "sourceUrl": "https://www.consilium.europa.eu/en/press/press-releases/2023/04/13/russia-s-war-of-aggression-against-ukraine-wagner-group-and-ria-fan-added-to-the-eu-s-sanctions-list/",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0024",
    "lists": [
      "sanctions",
      "pep"
    ],
    "kind": "person",
    "name": "Alexander Grigoryevich Lukashenko",
    "aliases": [
      "Alyaksandr Lukashenka",
      "Alexander Lukashenko"
    ],
    "dob": "1954-08-30",
    "country": "BY",
    "authority": "EU",
    "authorities": [
      "EU",
      "OFAC"
    ],
    "program": "EU restrictive measures — Belarus",
    "listingDate": "2020-11-06",
    "description": "President of Belarus; EU-listed (6 Nov 2020) for the violent repression following the fraudulent August 2020 election, and separately US-designated by OFAC (9 Aug 2021, E.O. 14038) over the regime’s repression and the forced diversion of Ryanair flight 4978.",
    "note": "President of Belarus; EU-listed (6 Nov 2020) for the violent repression following the fraudulent August 2020 election, and separately US-designated by OFAC (9 Aug 2021, E.O. 14038) over the regime’s repression and the forced diversion of Ryanair flight 4978.",
    "sourceUrl": "https://www.consilium.europa.eu/en/policies/sanctions-against-belarus/timeline-eu-sanctions-against-belarus/",
    "additionalSources": [
      "https://home.treasury.gov/news/press-releases/jy0329"
    ],
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0025",
    "lists": [
      "sanctions"
    ],
    "kind": "organisation",
    "name": "Bank Melli Iran",
    "aliases": [
      "Bank Melli",
      "National Bank of Iran"
    ],
    "country": "IR",
    "authority": "OFAC",
    "program": "Counter-Proliferation (E.O. 13382)",
    "listingDate": "2007-10-25",
    "description": "Iran’s largest state-owned bank; designated for providing financial services to entities involved in Iran’s nuclear and ballistic-missile programmes and the IRGC.",
    "note": "Iran’s largest state-owned bank; designated for providing financial services to entities involved in Iran’s nuclear and ballistic-missile programmes and the IRGC.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/hp644",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0026",
    "lists": [
      "sanctions"
    ],
    "kind": "organisation",
    "name": "Bank Sepah",
    "aliases": [
      "Bank Sepah International"
    ],
    "country": "IR",
    "authority": "OFAC",
    "program": "Counter-Proliferation (E.O. 13382)",
    "listingDate": "2007-01-09",
    "description": "Iranian state-owned bank; designated for providing financial services to entities responsible for Iran’s ballistic-missile and WMD programmes.",
    "note": "Iranian state-owned bank; designated for providing financial services to entities responsible for Iran’s ballistic-missile and WMD programmes.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/hp219",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0027",
    "lists": [
      "sanctions"
    ],
    "kind": "organisation",
    "name": "Islamic Revolutionary Guard Corps – Qods Force",
    "aliases": [
      "IRGC-QF",
      "Qods Force",
      "Quds Force"
    ],
    "country": "IR",
    "authority": "OFAC",
    "program": "Counter-Terrorism (E.O. 13224, SDGT)",
    "listingDate": "2007-10-25",
    "description": "External-operations arm of Iran’s IRGC; designated as a Specially Designated Global Terrorist for material support to Hizballah, Hamas, the Taliban and others.",
    "note": "External-operations arm of Iran’s IRGC; designated as a Specially Designated Global Terrorist for material support to Hizballah, Hamas, the Taliban and others.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/sm0177",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0028",
    "lists": [
      "sanctions",
      "pep"
    ],
    "kind": "person",
    "name": "Qasem Soleimani",
    "aliases": [
      "Qassem Soleimani",
      "Qasem Solaimani",
      "Haj Qasem"
    ],
    "dob": "1957-03-11",
    "country": "IR",
    "authority": "OFAC",
    "program": "Counter-Proliferation (E.O. 13382)",
    "listingDate": "2007-10-25",
    "description": "Commander of the IRGC-Qods Force; designated in connection with Iran’s proliferation activities and the IRGC’s external operations.",
    "note": "Commander of the IRGC-Qods Force; designated in connection with Iran’s proliferation activities and the IRGC’s external operations.",
    "sourceUrl": "https://sanctionssearch.ofac.treas.gov/Details.aspx?id=10481",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0029",
    "lists": [
      "sanctions"
    ],
    "kind": "organisation",
    "name": "Islamic Republic of Iran Shipping Lines",
    "aliases": [
      "IRISL",
      "Iran Shipping Lines"
    ],
    "country": "IR",
    "authority": "OFAC",
    "program": "Counter-Proliferation (E.O. 13382)",
    "listingDate": "2008-09-10",
    "description": "Iran’s national shipping carrier; designated for providing logistical services to Iran’s Ministry of Defense (MODAFL), which oversees the ballistic-missile programme.",
    "note": "Iran’s national shipping carrier; designated for providing logistical services to Iran’s Ministry of Defense (MODAFL), which oversees the ballistic-missile programme.",
    "sourceUrl": "https://2001-2009.state.gov/r/pa/prs/ps/2008/sept/109485.htm",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0030",
    "lists": [
      "sanctions"
    ],
    "kind": "organisation",
    "name": "National Iranian Tanker Company",
    "aliases": [
      "NITC"
    ],
    "country": "IR",
    "authority": "OFAC",
    "program": "Counter-Terrorism (E.O. 13224, SDGT)",
    "listingDate": "2020-10-26",
    "description": "Iran’s main oil-tanker operator; designated for providing financial support to the IRGC-Qods Force through oil sales.",
    "note": "Iran’s main oil-tanker operator; designated for providing financial support to the IRGC-Qods Force through oil sales.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/sm1165",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0031",
    "lists": [
      "sanctions"
    ],
    "kind": "organisation",
    "name": "Mahan Air",
    "aliases": [
      "Mahan Airlines"
    ],
    "country": "IR",
    "authority": "OFAC",
    "program": "Counter-Terrorism (E.O. 13224, SDGT)",
    "listingDate": "2011-10-12",
    "description": "Iranian airline; designated for providing financial, material and technological support to the IRGC-Qods Force, including transporting weapons and personnel.",
    "note": "Iranian airline; designated for providing financial, material and technological support to the IRGC-Qods Force, including transporting weapons and personnel.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/sm423",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0032",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "organisation",
    "name": "Lazarus Group",
    "aliases": [
      "APT38",
      "Hidden Cobra",
      "Guardians of Peace"
    ],
    "country": "KP",
    "authority": "OFAC",
    "program": "DPRK / North Korea (E.O. 13722)",
    "listingDate": "2019-09-13",
    "description": "North Korean state-sponsored hacking group controlled by the Reconnaissance General Bureau; designated for malicious cyber activity and cryptocurrency theft funding the regime.",
    "note": "North Korean state-sponsored hacking group controlled by the Reconnaissance General Bureau; designated for malicious cyber activity and cryptocurrency theft funding the regime.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/sm774",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0033",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "organisation",
    "name": "Bluenoroff",
    "aliases": [
      "APT38 (Bluenoroff)"
    ],
    "country": "KP",
    "authority": "OFAC",
    "program": "DPRK / North Korea (E.O. 13722)",
    "listingDate": "2019-09-13",
    "description": "DPRK cyber sub-group under the Lazarus Group / RGB; designated for financially-motivated hacking of banks and virtual-currency exchanges.",
    "note": "DPRK cyber sub-group under the Lazarus Group / RGB; designated for financially-motivated hacking of banks and virtual-currency exchanges.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/sm774",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0034",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "organisation",
    "name": "Andariel",
    "aliases": [
      "Silent Chollima"
    ],
    "country": "KP",
    "authority": "OFAC",
    "program": "DPRK / North Korea (E.O. 13722)",
    "listingDate": "2019-09-13",
    "description": "DPRK cyber sub-group under the RGB; designated for malicious cyber operations targeting financial and defence institutions.",
    "note": "DPRK cyber sub-group under the RGB; designated for malicious cyber operations targeting financial and defence institutions.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/sm774",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0035",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "wallet",
    "name": "Tornado Cash (Ethereum mixer)",
    "aliases": [
      "Tornado Cash"
    ],
    "country": "XX",
    "authority": "OFAC",
    "program": "Malicious Cyber-Enabled Activities (E.O. 13694)",
    "listingDate": "2022-08-08",
    "description": "Virtual-currency mixer designated for laundering more than USD 7 billion, including hundreds of millions stolen by the DPRK Lazarus Group. (Address is one of the SDN-listed donation contracts.)",
    "note": "Virtual-currency mixer designated for laundering more than USD 7 billion, including hundreds of millions stolen by the DPRK Lazarus Group. (Address is one of the SDN-listed donation contracts.)",
    "address": "0x8589427373D6D84E98730D7795D8f6f8731FDA16",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/jy0916",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0036",
    "lists": [
      "sanctions"
    ],
    "kind": "organisation",
    "name": "Korea Mining Development Trading Corporation",
    "aliases": [
      "KOMID",
      "Changgwang Sinyong Corporation"
    ],
    "country": "KP",
    "authority": "UN",
    "program": "UN 1718 (DPRK) Sanctions List",
    "listingDate": "2009-04-24",
    "description": "DPRK’s primary arms dealer and main exporter of goods and equipment related to ballistic missiles and conventional weapons.",
    "note": "DPRK’s primary arms dealer and main exporter of goods and equipment related to ballistic missiles and conventional weapons.",
    "sourceUrl": "https://main.un.org/securitycouncil/en/sanctions/1718/materials/summaries/entity/korea-mining-development-trading-corporation",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0037",
    "lists": [
      "sanctions"
    ],
    "kind": "organisation",
    "name": "Tanchon Commercial Bank",
    "aliases": [
      "Changgwang Credit Bank",
      "Korea Changgwang Credit Bank"
    ],
    "country": "KP",
    "authority": "UN",
    "program": "UN 1718 (DPRK) Sanctions List",
    "listingDate": "2009-04-24",
    "description": "Main DPRK financial entity for sales of conventional arms and ballistic missiles; supports the country’s WMD and missile programmes.",
    "note": "Main DPRK financial entity for sales of conventional arms and ballistic missiles; supports the country’s WMD and missile programmes.",
    "sourceUrl": "https://main.un.org/securitycouncil/en/sanctions/1718/materials/summaries/entity/tanchon-commerical-bank",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0038",
    "lists": [
      "sanctions"
    ],
    "kind": "organisation",
    "name": "Korea Ryonbong General Corporation",
    "aliases": [
      "Korea Yonbong General Corporation",
      "Lyongaksan General Trading Corporation"
    ],
    "country": "KP",
    "authority": "UN",
    "program": "UN 1718 (DPRK) Sanctions List",
    "listingDate": "2009-04-24",
    "description": "DPRK defence conglomerate; listed for supporting the country’s military-related purchases and its WMD and ballistic-missile programmes.",
    "note": "DPRK defence conglomerate; listed for supporting the country’s military-related purchases and its WMD and ballistic-missile programmes.",
    "sourceUrl": "https://main.un.org/securitycouncil/en/sanctions/1718/materials/summaries/entity/korea-ryonbong-general-corporation",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0039",
    "lists": [
      "sanctions"
    ],
    "kind": "organisation",
    "name": "Green Pine Associated Corporation",
    "aliases": [
      "Chongsong Yonhap",
      "Cho’ngsong United Trading Company"
    ],
    "country": "KP",
    "authority": "UN",
    "program": "UN 1718 (DPRK) Sanctions List",
    "listingDate": "2012-05-02",
    "description": "DPRK arms exporter that took over much of KOMID’s trade; listed for supporting the country’s WMD and ballistic-missile programmes.",
    "note": "DPRK arms exporter that took over much of KOMID’s trade; listed for supporting the country’s WMD and ballistic-missile programmes.",
    "sourceUrl": "https://main.un.org/securitycouncil/en/sanctions/1718/materials/summaries/entity/green-pine-associated-corporation",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0040",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "organisation",
    "name": "Al-Qaida",
    "aliases": [
      "Al Qaeda",
      "The Base",
      "Qa’idat al-Jihad"
    ],
    "country": "AF",
    "authority": "UN",
    "program": "UN 1267 ISIL (Da’esh) & Al-Qaida Sanctions List",
    "listingDate": "2001-10-06",
    "description": "International terrorist network founded by Usama bin Laden; listed for planning and perpetrating attacks including those of 11 September 2001.",
    "note": "International terrorist network founded by Usama bin Laden; listed for planning and perpetrating attacks including those of 11 September 2001.",
    "sourceUrl": "https://main.un.org/securitycouncil/en/sanctions/1267/aq_sanctions_list",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0041",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "person",
    "name": "Aiman Muhammed Rabi al-Zawahiri",
    "aliases": [
      "Ayman al-Zawahiri",
      "Aiman al-Zawahiri",
      "Abu Muhammad"
    ],
    "dob": "1951-06-19",
    "country": "EG",
    "authority": "UN",
    "program": "UN 1267 ISIL (Da’esh) & Al-Qaida Sanctions List",
    "listingDate": "2001-01-25",
    "description": "Long-time deputy and later leader of Al-Qaida; listed for participating in the financing, planning and perpetrating of terrorist acts.",
    "note": "Long-time deputy and later leader of Al-Qaida; listed for participating in the financing, planning and perpetrating of terrorist acts.",
    "sourceUrl": "https://main.un.org/securitycouncil/en/sanctions/1267/aq_sanctions_list/summaries/individual/aiman-muhammed-rabi-al-zawahiri",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0042",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "person",
    "name": "Ibrahim Awwad Ibrahim Ali al-Badri al-Samarrai",
    "aliases": [
      "Abu Bakr al-Baghdadi",
      "Abu Du’a",
      "Dr Ibrahim"
    ],
    "dob": "1971-01-01",
    "country": "IQ",
    "authority": "UN",
    "program": "UN 1267 ISIL (Da’esh) & Al-Qaida Sanctions List",
    "listingDate": "2011-10-05",
    "description": "Leader of ISIL (Da’esh); listed as associated with Al-Qaida for participating in the financing, planning and perpetrating of terrorist acts.",
    "note": "Leader of ISIL (Da’esh); listed as associated with Al-Qaida for participating in the financing, planning and perpetrating of terrorist acts.",
    "sourceUrl": "https://main.un.org/securitycouncil/en/sanctions/1267/aq_sanctions_list/summaries/individual/ibrahim-awwad-ibrahim-ali-al-badri-al-samarrai",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0043",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "person",
    "name": "Abdul Rahman Yasin",
    "aliases": [
      "Abdul Rahman Said Yasin",
      "Aboud Yasin"
    ],
    "dob": "1960-04-10",
    "country": "IQ",
    "authority": "UN",
    "program": "UN 1267 ISIL (Da’esh) & Al-Qaida Sanctions List",
    "listingDate": "2001-10-17",
    "description": "Listed as associated with Al-Qaida; indicted in the United States for his role in the February 1993 World Trade Center bombing.",
    "note": "Listed as associated with Al-Qaida; indicted in the United States for his role in the February 1993 World Trade Center bombing.",
    "sourceUrl": "https://main.un.org/securitycouncil/en/sanctions/1267/aq_sanctions_list",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0044",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "person",
    "name": "Hamza Usama Muhammad bin Laden",
    "aliases": [
      "Hamza bin Laden",
      "Hamzah Bin Laden"
    ],
    "dob": "1989-05-09",
    "country": "SA",
    "authority": "UN",
    "program": "UN 1267 ISIL (Da’esh) & Al-Qaida Sanctions List",
    "listingDate": "2019-02-28",
    "description": "Son of Usama bin Laden and an official Al-Qaida member; listed for recruiting for and inciting attacks on behalf of Al-Qaida.",
    "note": "Son of Usama bin Laden and an official Al-Qaida member; listed for recruiting for and inciting attacks on behalf of Al-Qaida.",
    "sourceUrl": "https://main.un.org/securitycouncil/en/sanctions/1267/aq_sanctions_list",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0045",
    "lists": [
      "sanctions"
    ],
    "kind": "person",
    "name": "Mahmood Sultan Bashir-ud-Din",
    "aliases": [
      "Mahmood Sultan Bashiruddin",
      "Sultan Bashiruddin Mahmood"
    ],
    "dob": "1937-01-01",
    "country": "PK",
    "authority": "UN",
    "program": "UN 1267 ISIL (Da’esh) & Al-Qaida Sanctions List",
    "listingDate": "2001-12-24",
    "description": "Pakistani nuclear scientist listed as associated with Al-Qaida, Usama bin Laden or the Taliban for supporting their activities.",
    "note": "Pakistani nuclear scientist listed as associated with Al-Qaida, Usama bin Laden or the Taliban for supporting their activities.",
    "sourceUrl": "https://main.un.org/securitycouncil/en/sanctions/1267/aq_sanctions_list",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0046",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "person",
    "name": "Hafiz Muhammad Saeed",
    "aliases": [
      "Hafez Mohammad Saeed",
      "Hafiz Saeed"
    ],
    "dob": "1950-06-05",
    "country": "PK",
    "authority": "UN",
    "program": "UN 1267 ISIL (Da’esh) & Al-Qaida Sanctions List",
    "listingDate": "2008-12-10",
    "description": "Founder and leader of Lashkar-e-Tayyiba; listed as associated with Al-Qaida in connection with the November 2008 Mumbai attacks and related terrorism.",
    "note": "Founder and leader of Lashkar-e-Tayyiba; listed as associated with Al-Qaida in connection with the November 2008 Mumbai attacks and related terrorism.",
    "sourceUrl": "https://main.un.org/securitycouncil/en/sanctions/1267/aq_sanctions_list/summaries/individual/hafiz-muhammad-saeed",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0047",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "person",
    "name": "Zaki-ur-Rehman Lakhvi",
    "aliases": [
      "Zakir Rehman Lakvi",
      "Zaki ur Rehman Lakhvi"
    ],
    "dob": "1960-12-30",
    "country": "PK",
    "authority": "UN",
    "program": "UN 1267 ISIL (Da’esh) & Al-Qaida Sanctions List",
    "listingDate": "2008-12-10",
    "description": "Senior Lashkar-e-Tayyiba commander; listed as associated with Al-Qaida for planning and directing terrorist attacks, including in Mumbai in November 2008.",
    "note": "Senior Lashkar-e-Tayyiba commander; listed as associated with Al-Qaida for planning and directing terrorist attacks, including in Mumbai in November 2008.",
    "sourceUrl": "https://main.un.org/securitycouncil/en/sanctions/1267/aq_sanctions_list/summaries/individual/zaki-ur-rehman-lakhvi",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0048",
    "lists": [
      "sanctions",
      "pep"
    ],
    "kind": "person",
    "name": "Sirajuddin Jallaloudine Haqqani",
    "aliases": [
      "Siraj Haqqani",
      "Sirajuddin Haqqani"
    ],
    "dob": "1978-01-01",
    "country": "AF",
    "authority": "UN",
    "program": "UN 1988 (Taliban) Sanctions List",
    "listingDate": "2007-09-13",
    "description": "Leader of the Haqqani Network; listed for association with the Taliban and involvement in cross-border attacks in Afghanistan.",
    "note": "Leader of the Haqqani Network; listed for association with the Taliban and involvement in cross-border attacks in Afghanistan.",
    "sourceUrl": "https://main.un.org/securitycouncil/en/sanctions/1988/materials/summaries/individual/sirajuddin-jallaloudine-haqqani",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0049",
    "lists": [
      "sanctions",
      "pep"
    ],
    "kind": "person",
    "name": "Jalaluddin Haqqani",
    "aliases": [
      "Jalaluddin Haqani"
    ],
    "dob": "1942-01-01",
    "country": "AF",
    "authority": "UN",
    "program": "UN 1988 (Taliban) Sanctions List",
    "listingDate": "2001-01-31",
    "description": "Founder of the Haqqani Network and former Taliban Minister of Frontier Affairs; listed for association with the Taliban.",
    "note": "Founder of the Haqqani Network and former Taliban Minister of Frontier Affairs; listed for association with the Taliban.",
    "sourceUrl": "https://main.un.org/securitycouncil/en/sanctions/1988/materials/summaries/individual/jalaluddin-haqqani",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0050",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "person",
    "name": "Viktor Anatolyevich Bout",
    "aliases": [
      "Viktor But",
      "Victor Bout",
      "Vadim Markovich Aminov"
    ],
    "dob": "1967-01-13",
    "country": "RU",
    "authority": "OFAC",
    "program": "Former Liberian Regime of Charles Taylor (E.O. 13348)",
    "listingDate": "2004-07-22",
    "description": "International arms dealer who ran a network of air-cargo companies; designated as an associate of former Liberian President Charles Taylor and for illicit arms trafficking.",
    "note": "International arms dealer who ran a network of air-cargo companies; designated as an associate of former Liberian President Charles Taylor and for illicit arms trafficking.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/js2406",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0051",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "person",
    "name": "Ismail Haniyeh",
    "aliases": [
      "Ismail Haniya",
      "Ismail Abdel Salam Ahmed Haniyeh"
    ],
    "dob": "1962-05-29",
    "country": "PS",
    "authority": "OFAC",
    "program": "Counter-Terrorism (E.O. 13224, SDGT)",
    "listingDate": "2018-02-06",
    "description": "Head of the Hamas Political Bureau; designated as a Specially Designated Global Terrorist for leading a group that has carried out terrorist attacks.",
    "note": "Head of the Hamas Political Bureau; designated as a Specially Designated Global Terrorist for leading a group that has carried out terrorist attacks.",
    "sourceUrl": "https://www.federalregister.gov/documents/2018/02/06/2018-02291/eo-13224-designation-of-ismail-haniyeh-aka-ismail-abdel-salam-ahmed-haniyeh-aka-ismail-haniya-aka",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0052",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "organisation",
    "name": "Lashkar-e-Tayyiba",
    "aliases": [
      "LeT",
      "Lashkar-e-Taiba",
      "Jamaat-ud-Dawa"
    ],
    "country": "PK",
    "authority": "UN",
    "program": "UN 1267 ISIL (Da’esh) & Al-Qaida Sanctions List",
    "listingDate": "2005-05-02",
    "description": "Pakistan-based militant group; listed as associated with Al-Qaida and responsible for numerous attacks, including the November 2008 Mumbai attacks.",
    "note": "Pakistan-based militant group; listed as associated with Al-Qaida and responsible for numerous attacks, including the November 2008 Mumbai attacks.",
    "sourceUrl": "https://main.un.org/securitycouncil/en/sanctions/1267/aq_sanctions_list/summaries/entity/lashkar-e-tayyiba",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0053",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "organisation",
    "name": "Jaish-i-Mohammed",
    "aliases": [
      "Jaish-e-Mohammed",
      "JeM",
      "Army of Mohammed"
    ],
    "country": "PK",
    "authority": "UN",
    "program": "UN 1267 ISIL (Da’esh) & Al-Qaida Sanctions List",
    "listingDate": "2001-10-17",
    "description": "Pakistan-based militant group; listed as associated with Al-Qaida for terrorist attacks in South Asia.",
    "note": "Pakistan-based militant group; listed as associated with Al-Qaida for terrorist attacks in South Asia.",
    "sourceUrl": "https://main.un.org/securitycouncil/en/sanctions/1267/aq_sanctions_list/summaries/entity/jaish-i-mohammed",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0054",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "organisation",
    "name": "Al-Qaida in the Arabian Peninsula",
    "aliases": [
      "AQAP",
      "Ansar al-Sharia"
    ],
    "country": "YE",
    "authority": "UN",
    "program": "UN 1267 ISIL (Da’esh) & Al-Qaida Sanctions List",
    "listingDate": "2010-01-19",
    "description": "Yemen-based Al-Qaida affiliate; listed for planning and perpetrating terrorist attacks, including against aviation and Western targets.",
    "note": "Yemen-based Al-Qaida affiliate; listed for planning and perpetrating terrorist attacks, including against aviation and Western targets.",
    "sourceUrl": "https://main.un.org/securitycouncil/en/sanctions/1267/aq_sanctions_list/summaries/entity/al-qaida-in-the-arabian-peninsula-(aqap)",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0055",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "organisation",
    "name": "Al-Nusrah Front for the People of the Levant",
    "aliases": [
      "Jabhat al-Nusrah",
      "Al-Nusra Front",
      "Jabhat Fatah al-Sham"
    ],
    "country": "SY",
    "authority": "UN",
    "program": "UN 1267 ISIL (Da’esh) & Al-Qaida Sanctions List",
    "listingDate": "2014-05-14",
    "description": "Syria-based Al-Qaida-linked armed group; listed as associated with Al-Qaida for terrorist acts in Syria. (Historical designation as at the snapshot date.)",
    "note": "Syria-based Al-Qaida-linked armed group; listed as associated with Al-Qaida for terrorist acts in Syria. (Historical designation as at the snapshot date.)",
    "sourceUrl": "https://main.un.org/securitycouncil/en/sanctions/1267/aq_sanctions_list/summaries/entity/al-nusrah-front-for-the-people-of-the-levant",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0056",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "organisation",
    "name": "Boko Haram",
    "aliases": [
      "Jama’atu Ahlis Sunna Lidda’awati wal-Jihad",
      "Boko Haram"
    ],
    "country": "NG",
    "authority": "UN",
    "program": "UN 1267 ISIL (Da’esh) & Al-Qaida Sanctions List",
    "listingDate": "2014-05-22",
    "description": "Nigeria-based militant group; listed as associated with Al-Qaida for attacks, abductions and atrocities in the Lake Chad region.",
    "note": "Nigeria-based militant group; listed as associated with Al-Qaida for attacks, abductions and atrocities in the Lake Chad region.",
    "sourceUrl": "https://main.un.org/securitycouncil/en/sanctions/1267/aq_sanctions_list/summaries/entity/boko-haram",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0057",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "organisation",
    "name": "Al-Shabaab",
    "aliases": [
      "Harakat Shabaab al-Mujahidin",
      "al-Shabab",
      "HSM"
    ],
    "country": "SO",
    "authority": "UN",
    "program": "UN 751 (Somalia) Sanctions List",
    "listingDate": "2010-04-12",
    "description": "Somalia-based militant group; listed under the Somalia sanctions regime for engaging in acts that threaten the peace and security of Somalia.",
    "note": "Somalia-based militant group; listed under the Somalia sanctions regime for engaging in acts that threaten the peace and security of Somalia.",
    "sourceUrl": "https://main.un.org/securitycouncil/en/sanctions/751/materials/summaries/entity/al-shabaab",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0058",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "person",
    "name": "Joaquin Guzman Loera",
    "aliases": [
      "El Chapo",
      "Joaquin Archivaldo Guzman Loera",
      "Chapo Guzman"
    ],
    "dob": "1957-04-04",
    "country": "MX",
    "authority": "OFAC",
    "program": "Foreign Narcotics Kingpin Designation Act",
    "listingDate": "2001-06-01",
    "description": "Leader of the Sinaloa Cartel; named a Tier I drug kingpin for large-scale trafficking of narcotics into the United States.",
    "note": "Leader of the Sinaloa Cartel; named a Tier I drug kingpin for large-scale trafficking of narcotics into the United States.",
    "sourceUrl": "https://ofac.treasury.gov/media/6791/download?inline=",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0059",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "person",
    "name": "Ismael Zambada Garcia",
    "aliases": [
      "El Mayo",
      "Ismael Mario Zambada Garcia"
    ],
    "dob": "1948-01-01",
    "country": "MX",
    "authority": "OFAC",
    "program": "Foreign Narcotics Kingpin Designation Act",
    "listingDate": "2002-05-31",
    "description": "Co-leader of the Sinaloa Cartel; named a Tier I drug kingpin for narcotics trafficking and money laundering.",
    "note": "Co-leader of the Sinaloa Cartel; named a Tier I drug kingpin for narcotics trafficking and money laundering.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/tg784",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0060",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "organisation",
    "name": "Sinaloa Cartel",
    "aliases": [
      "Cartel de Sinaloa",
      "Guzman-Loera Organization"
    ],
    "country": "MX",
    "authority": "OFAC",
    "program": "Foreign Narcotics Kingpin Designation Act",
    "listingDate": "2009-04-15",
    "description": "One of the world’s largest drug-trafficking organisations; identified as a significant foreign narcotics trafficker under the Kingpin Act.",
    "note": "One of the world’s largest drug-trafficking organisations; identified as a significant foreign narcotics trafficker under the Kingpin Act.",
    "sourceUrl": "https://ofac.treasury.gov/media/6791/download?inline=",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0061",
    "lists": [
      "sanctions",
      "pep"
    ],
    "kind": "person",
    "name": "Bashar al-Assad",
    "aliases": [
      "Bashar Hafez al-Assad",
      "Bashar al-Asad"
    ],
    "dob": "1965-09-11",
    "country": "SY",
    "authority": "OFAC",
    "program": "Syria Sanctions (E.O. 13573)",
    "listingDate": "2011-05-18",
    "description": "President of Syria; designated as a senior official of the Syrian Government responsible for the violent repression of the Syrian people.",
    "note": "President of Syria; designated as a senior official of the Syrian Government responsible for the violent repression of the Syrian people.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/tg1181",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0062",
    "lists": [
      "sanctions",
      "pep"
    ],
    "kind": "person",
    "name": "Rami Makhlouf",
    "aliases": [
      "Rami Makhluf"
    ],
    "dob": "1969-07-10",
    "country": "SY",
    "authority": "OFAC",
    "program": "Syria Sanctions (E.O. 13460)",
    "listingDate": "2008-02-21",
    "description": "Syrian businessman and cousin of Bashar al-Assad; designated for improperly benefiting from and aiding public corruption of Syrian regime officials.",
    "note": "Syrian businessman and cousin of Bashar al-Assad; designated for improperly benefiting from and aiding public corruption of Syrian regime officials.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/hp834",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0063",
    "lists": [
      "sanctions",
      "pep"
    ],
    "kind": "person",
    "name": "Nicolas Maduro Moros",
    "aliases": [
      "Nicolas Maduro"
    ],
    "dob": "1962-11-23",
    "country": "VE",
    "authority": "OFAC",
    "program": "Venezuela Sanctions (E.O. 13692)",
    "listingDate": "2017-07-31",
    "description": "President of Venezuela; designated following the illegitimate Constituent Assembly and for undermining democracy and human rights.",
    "note": "President of Venezuela; designated following the illegitimate Constituent Assembly and for undermining democracy and human rights.",
    "sourceUrl": "https://home.treasury.gov/news/press-release/sm0145",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0064",
    "lists": [
      "sanctions",
      "pep"
    ],
    "kind": "person",
    "name": "Min Aung Hlaing",
    "aliases": [
      "Min Aung Hlaing"
    ],
    "dob": "1956-07-03",
    "country": "MM",
    "authority": "OFAC",
    "program": "Burma (Myanmar) Sanctions (E.O. 14014)",
    "listingDate": "2021-02-11",
    "description": "Commander-in-Chief of the Myanmar military; designated for the February 2021 coup that overthrew the democratically-elected government.",
    "note": "Commander-in-Chief of the Myanmar military; designated for the February 2021 coup that overthrew the democratically-elected government.",
    "sourceUrl": "https://ofac.treasury.gov/recent-actions/20210211",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0065",
    "lists": [
      "sanctions",
      "pep"
    ],
    "kind": "person",
    "name": "Sergei Kuzhugetovich Shoigu",
    "aliases": [
      "Sergei Shoigu",
      "Sergey Shoigu"
    ],
    "dob": "1955-05-21",
    "country": "RU",
    "authority": "OFAC",
    "program": "Russian Harmful Foreign Activities (E.O. 14024)",
    "listingDate": "2022-02-25",
    "description": "Russian Defence Minister at the time of the invasion; designated for operating in the defence sector of the Russian economy in connection with the war against Ukraine.",
    "note": "Russian Defence Minister at the time of the invasion; designated for operating in the defence sector of the Russian economy in connection with the war against Ukraine.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/jy0610",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0066",
    "lists": [
      "sanctions",
      "pep"
    ],
    "kind": "person",
    "name": "Valery Vasilyevich Gerasimov",
    "aliases": [
      "Valery Gerasimov",
      "Valeriy Gerasimov"
    ],
    "dob": "1955-09-08",
    "country": "RU",
    "authority": "OFAC",
    "program": "Russian Harmful Foreign Activities (E.O. 14024)",
    "listingDate": "2022-02-25",
    "description": "Chief of the General Staff of the Russian Armed Forces; designated for his role in the military aggression against Ukraine.",
    "note": "Chief of the General Staff of the Russian Armed Forces; designated for his role in the military aggression against Ukraine.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/jy0610",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0067",
    "lists": [
      "sanctions",
      "pep"
    ],
    "kind": "person",
    "name": "Anton Eduardovich Vaino",
    "aliases": [
      "Anton Vaino"
    ],
    "dob": "1972-02-17",
    "country": "RU",
    "authority": "OFAC",
    "program": "Russian Harmful Foreign Activities (E.O. 14024)",
    "listingDate": "2022-04-06",
    "description": "Chief of Staff of the Presidential Executive Office; designated as a leader/official of the Government of Russia.",
    "note": "Chief of Staff of the Presidential Executive Office; designated as a leader/official of the Government of Russia.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/jy0677",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0068",
    "lists": [
      "sanctions",
      "pep"
    ],
    "kind": "person",
    "name": "Elvira Sakhipzadovna Nabiullina",
    "aliases": [
      "Elvira Nabiullina"
    ],
    "dob": "1963-10-29",
    "country": "RU",
    "authority": "OFAC",
    "program": "Russian Harmful Foreign Activities (E.O. 14024)",
    "listingDate": "2022-09-30",
    "description": "Governor of the Central Bank of the Russian Federation; designated as a leader/official of the Government of Russia.",
    "note": "Governor of the Central Bank of the Russian Federation; designated as a leader/official of the Government of Russia.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/jy0981",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0069",
    "lists": [
      "sanctions"
    ],
    "kind": "organisation",
    "name": "Promsvyazbank Public Joint Stock Company",
    "aliases": [
      "Promsvyazbank",
      "PSB",
      "PSB Bank"
    ],
    "country": "RU",
    "authority": "OFAC",
    "authorities": [
      "OFAC",
      "EU"
    ],
    "program": "Russian Harmful Foreign Activities (E.O. 14024)",
    "listingDate": "2022-02-22",
    "description": "Russian bank central to financing the defence sector; OFAC-designated (22 Feb 2022) as a critical participant in the Russian financial and defence sectors, and separately EU-listed (23 Feb 2022).",
    "note": "Russian bank central to financing the defence sector; OFAC-designated (22 Feb 2022) as a critical participant in the Russian financial and defence sectors, and separately EU-listed (23 Feb 2022).",
    "sourceUrl": "https://ofac.treasury.gov/recent-actions/20220222",
    "additionalSources": [
      "https://www.consilium.europa.eu/en/press/press-releases/2022/02/23/"
    ],
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0070",
    "lists": [
      "sanctions"
    ],
    "kind": "organisation",
    "name": "Public Joint Stock Company Alrosa",
    "aliases": [
      "Alrosa"
    ],
    "country": "RU",
    "authority": "OFAC",
    "program": "Russian Harmful Foreign Activities (E.O. 14024)",
    "listingDate": "2022-04-07",
    "description": "State-owned Russian diamond-mining company and the world’s largest diamond producer; designated as owned/controlled by the Government of Russia.",
    "note": "State-owned Russian diamond-mining company and the world’s largest diamond producer; designated as owned/controlled by the Government of Russia.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/jy0677",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0071",
    "lists": [
      "sanctions"
    ],
    "kind": "organisation",
    "name": "Kalashnikov Concern",
    "aliases": [
      "JSC Kalashnikov Concern",
      "Izhmash"
    ],
    "country": "RU",
    "authority": "OFAC",
    "program": "Ukraine-/Russia-Related Sanctions (E.O. 13661)",
    "listingDate": "2014-07-16",
    "description": "Russian state arms manufacturer; designated in the 2014 Ukraine-related actions as operating in the arms/defence sector of the Russian economy.",
    "note": "Russian state arms manufacturer; designated in the 2014 Ukraine-related actions as operating in the arms/defence sector of the Russian economy.",
    "sourceUrl": "https://www.federalregister.gov/documents/2014/07/16/",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0072",
    "lists": [
      "sanctions"
    ],
    "kind": "organisation",
    "name": "Almaz-Antey Air and Space Defence Corporation",
    "aliases": [
      "Almaz-Antey",
      "Concern Almaz-Antey"
    ],
    "country": "RU",
    "authority": "OFAC",
    "program": "Ukraine-/Russia-Related Sanctions (E.O. 13661)",
    "listingDate": "2014-09-12",
    "description": "Russian state defence corporation producing air-defence systems; designated in the 2014 Ukraine-related actions.",
    "note": "Russian state defence corporation producing air-defence systems; designated in the 2014 Ukraine-related actions.",
    "sourceUrl": "https://www.federalregister.gov/documents/2014/09/12/",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0073",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "person",
    "name": "Nurjaman Riduan Isamuddin",
    "aliases": [
      "Hambali",
      "Riduan Isamuddin",
      "Encep Nurjaman"
    ],
    "dob": "1964-04-04",
    "country": "ID",
    "authority": "UN",
    "program": "UN 1267 ISIL (Da’esh) & Al-Qaida Sanctions List",
    "listingDate": "2003-01-28",
    "description": "Jemaah Islamiyah operations chief and Al-Qaida member; listed for association with Al-Qaida and for a role in the 2002 Bali bombings.",
    "note": "Jemaah Islamiyah operations chief and Al-Qaida member; listed for association with Al-Qaida and for a role in the 2002 Bali bombings.",
    "sourceUrl": "https://main.un.org/securitycouncil/en/sanctions/1267/aq_sanctions_list/summaries/individual/nurjaman-riduan-isamuddin",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0074",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "organisation",
    "name": "Jemaah Islamiyah",
    "aliases": [
      "Jemaah Islamiah",
      "JI"
    ],
    "country": "ID",
    "authority": "UN",
    "program": "UN 1267 ISIL (Da’esh) & Al-Qaida Sanctions List",
    "listingDate": "2002-10-25",
    "description": "Southeast Asian militant network; listed as associated with Al-Qaida and responsible for the 2002 Bali bombings and other attacks.",
    "note": "Southeast Asian militant network; listed as associated with Al-Qaida and responsible for the 2002 Bali bombings and other attacks.",
    "sourceUrl": "https://main.un.org/securitycouncil/en/sanctions/1267/aq_sanctions_list/summaries/entity/jemaah-islamiyah",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0075",
    "lists": [
      "sanctions",
      "pep"
    ],
    "kind": "person",
    "name": "Hasan Nasrallah",
    "aliases": [
      "Hassan Nasrallah",
      "Hasan Nasrhallah"
    ],
    "dob": "1960-08-31",
    "country": "LB",
    "authority": "OFAC",
    "program": "Counter-Terrorism (E.O. 12947 / E.O. 13224, SDGT)",
    "listingDate": "1995-01-23",
    "description": "Secretary-General of Hizballah; designated as a Specially Designated Terrorist for leading a group responsible for terrorist attacks.",
    "note": "Secretary-General of Hizballah; designated as a Specially Designated Terrorist for leading a group responsible for terrorist attacks.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/sm0387",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0076",
    "lists": [
      "sanctions",
      "pep"
    ],
    "kind": "person",
    "name": "Naim Qasim",
    "aliases": [
      "Naim Qassem",
      "Naim Kassem"
    ],
    "dob": "1953-01-01",
    "country": "LB",
    "authority": "OFAC",
    "program": "Counter-Terrorism (E.O. 13224, SDGT)",
    "listingDate": "2018-05-16",
    "description": "Deputy Secretary-General (later Secretary-General) of Hizballah; designated for acting for or on behalf of Hizballah.",
    "note": "Deputy Secretary-General (later Secretary-General) of Hizballah; designated for acting for or on behalf of Hizballah.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/sm0387",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0077",
    "lists": [
      "sanctions"
    ],
    "kind": "organisation",
    "name": "Bank Saderat Iran",
    "aliases": [
      "Bank Saderat",
      "Saderat Bank"
    ],
    "country": "IR",
    "authority": "OFAC",
    "program": "Counter-Terrorism (E.O. 13224, SDGT)",
    "listingDate": "2007-10-25",
    "description": "Iranian state-owned bank; designated for acting as a conduit to transfer funds to Hizballah and other terrorist organisations.",
    "note": "Iranian state-owned bank; designated for acting as a conduit to transfer funds to Hizballah and other terrorist organisations.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/hp644",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0078",
    "lists": [
      "sanctions"
    ],
    "kind": "organisation",
    "name": "Ministry of Defense and Armed Forces Logistics",
    "aliases": [
      "MODAFL"
    ],
    "country": "IR",
    "authority": "OFAC",
    "program": "Counter-Proliferation (E.O. 13382)",
    "listingDate": "2007-10-25",
    "description": "Iranian defence ministry overseeing the ballistic-missile programme; designated for its control of Iran’s missile and defence-industrial base.",
    "note": "Iranian defence ministry overseeing the ballistic-missile programme; designated for its control of Iran’s missile and defence-industrial base.",
    "sourceUrl": "https://2001-2009.state.gov/r/pa/prs/ps/2007/oct/94193.htm",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0079",
    "lists": [
      "sanctions"
    ],
    "kind": "organisation",
    "name": "Defense Industries Organization",
    "aliases": [
      "DIO",
      "Sazman-e Sanaye Defa"
    ],
    "country": "IR",
    "authority": "OFAC",
    "program": "Counter-Proliferation (E.O. 13382)",
    "listingDate": "2007-03-30",
    "description": "Iranian state defence-manufacturing conglomerate; designated for its role in Iran’s missile and weapons programmes.",
    "note": "Iranian state defence-manufacturing conglomerate; designated for its role in Iran’s missile and weapons programmes.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/hp219",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0080",
    "lists": [
      "sanctions"
    ],
    "kind": "organisation",
    "name": "Korea Kwangson Banking Corporation",
    "aliases": [
      "KKBC"
    ],
    "country": "KP",
    "authority": "OFAC",
    "program": "Counter-Proliferation (E.O. 13382)",
    "listingDate": "2009-08-11",
    "description": "DPRK bank; designated for providing financial services in support of North Korean WMD proliferators, including Tanchon Commercial Bank and KOMID.",
    "note": "DPRK bank; designated for providing financial services in support of North Korean WMD proliferators, including Tanchon Commercial Bank and KOMID.",
    "sourceUrl": "https://ofac.treasury.gov/recent-actions/20090811",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0081",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "organisation",
    "name": "Ansar al-Islam",
    "aliases": [
      "Ansar al-Sunna",
      "Devotees of Islam"
    ],
    "country": "IQ",
    "authority": "UN",
    "program": "UN 1267 ISIL (Da’esh) & Al-Qaida Sanctions List",
    "listingDate": "2003-02-24",
    "description": "Iraq-based militant group; listed as associated with Al-Qaida for terrorist activities in northern Iraq.",
    "note": "Iraq-based militant group; listed as associated with Al-Qaida for terrorist activities in northern Iraq.",
    "sourceUrl": "https://main.un.org/securitycouncil/en/sanctions/1267/aq_sanctions_list/summaries/entity/ansar-al-islam",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0082",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "organisation",
    "name": "Organization of Al-Qaida in the Islamic Maghreb",
    "aliases": [
      "AQIM",
      "GSPC",
      "Al-Qaida in the Lands of the Islamic Maghreb"
    ],
    "country": "DZ",
    "authority": "UN",
    "program": "UN 1267 ISIL (Da’esh) & Al-Qaida Sanctions List",
    "listingDate": "2007-04-26",
    "description": "North Africa–based Al-Qaida affiliate (formerly GSPC); listed for terrorist attacks, kidnappings and cross-border operations in the Sahel and Maghreb.",
    "note": "North Africa–based Al-Qaida affiliate (formerly GSPC); listed for terrorist attacks, kidnappings and cross-border operations in the Sahel and Maghreb.",
    "sourceUrl": "https://main.un.org/securitycouncil/en/sanctions/1267/aq_sanctions_list/summaries/entity/the-organization-of-al-qaida-in-the-islamic",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0083",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "organisation",
    "name": "Islamic State West Africa Province",
    "aliases": [
      "ISWAP",
      "ISIS-West Africa"
    ],
    "country": "NG",
    "authority": "UN",
    "program": "UN 1267 ISIL (Da’esh) & Al-Qaida Sanctions List",
    "listingDate": "2020-02-23",
    "description": "ISIL affiliate in the Lake Chad Basin; listed for terrorist attacks, abductions and control of territory in West Africa.",
    "note": "ISIL affiliate in the Lake Chad Basin; listed for terrorist attacks, abductions and control of territory in West Africa.",
    "sourceUrl": "https://main.un.org/securitycouncil/en/content/islamic-state-west-africa-province-iswap-0",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0084",
    "lists": [
      "sanctions"
    ],
    "kind": "organisation",
    "name": "Bank Rossiya",
    "aliases": [
      "Bank Rossiya",
      "AB Rossiya"
    ],
    "country": "RU",
    "authority": "OFAC",
    "program": "Ukraine-/Russia-Related Sanctions (E.O. 13661)",
    "listingDate": "2014-03-20",
    "description": "Bank described as the personal bank for senior Russian officials; designated for providing material support to a senior official and being controlled by Yuri Kovalchuk.",
    "note": "Bank described as the personal bank for senior Russian officials; designated for providing material support to a senior official and being controlled by Yuri Kovalchuk.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/jl23331",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0085",
    "lists": [
      "sanctions",
      "pep"
    ],
    "kind": "person",
    "name": "Yuri Valentinovich Kovalchuk",
    "aliases": [
      "Yury Kovalchuk",
      "Yuri Kovalchuk"
    ],
    "dob": "1951-07-25",
    "country": "RU",
    "authority": "OFAC",
    "program": "Ukraine-/Russia-Related Sanctions (E.O. 13661)",
    "listingDate": "2014-03-20",
    "description": "Member of Putin’s inner circle and largest shareholder of Bank Rossiya; designated for his role in Russia’s actions in Ukraine.",
    "note": "Member of Putin’s inner circle and largest shareholder of Bank Rossiya; designated for his role in Russia’s actions in Ukraine.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/jl23331",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0086",
    "lists": [
      "sanctions"
    ],
    "kind": "person",
    "name": "Mohsen Fakhrizadeh-Mahabadi",
    "aliases": [
      "Mohsen Fakhrizadeh"
    ],
    "dob": "1958-01-01",
    "country": "IR",
    "authority": "UN",
    "program": "UN 1747 (Iran non-proliferation) List",
    "listingDate": "2007-03-24",
    "description": "Senior Iranian defence scientist; listed as an individual involved in Iran’s nuclear or ballistic-missile activities.",
    "note": "Senior Iranian defence scientist; listed as an individual involved in Iran’s nuclear or ballistic-missile activities.",
    "sourceUrl": "https://main.un.org/securitycouncil/en/content/mohsen-fakhrizadeh-mahabadi",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0087",
    "lists": [
      "sanctions"
    ],
    "kind": "organisation",
    "name": "Shahid Hemmat Industrial Group",
    "aliases": [
      "SHIG"
    ],
    "country": "IR",
    "authority": "OFAC",
    "program": "Counter-Proliferation (E.O. 13382)",
    "listingDate": "2005-06-28",
    "description": "Iranian entity responsible for liquid-fuelled ballistic missiles; designated as a proliferator of weapons of mass destruction and delivery systems.",
    "note": "Iranian entity responsible for liquid-fuelled ballistic missiles; designated as a proliferator of weapons of mass destruction and delivery systems.",
    "sourceUrl": "https://www.iranwatch.org/iranian-entities/shahid-hemat-industrial-group-shig",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0088",
    "lists": [
      "sanctions"
    ],
    "kind": "organisation",
    "name": "Atomic Energy Organization of Iran",
    "aliases": [
      "AEOI",
      "Sazman-e Energy Atomi Iran"
    ],
    "country": "IR",
    "authority": "OFAC",
    "program": "Counter-Proliferation (E.O. 13382)",
    "listingDate": "2020-01-30",
    "description": "Iran’s principal nuclear body; designated for its management of and involvement in Iran’s nuclear programme.",
    "note": "Iran’s principal nuclear body; designated for its management of and involvement in Iran’s nuclear programme.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/sm1130",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0089",
    "lists": [
      "sanctions",
      "pep"
    ],
    "kind": "person",
    "name": "Mohammed Omar",
    "aliases": [
      "Mullah Mohammad Omar",
      "Mullah Omar"
    ],
    "dob": "1960-01-01",
    "country": "AF",
    "authority": "UN",
    "program": "UN 1988 (Taliban) Sanctions List",
    "listingDate": "2001-01-31",
    "description": "Founder and supreme leader of the Taliban; listed for association with the Taliban regime that sheltered Al-Qaida.",
    "note": "Founder and supreme leader of the Taliban; listed for association with the Taliban regime that sheltered Al-Qaida.",
    "sourceUrl": "https://main.un.org/securitycouncil/en/sanctions/1988/materials/summaries/individual/mohammed-omar",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0090",
    "lists": [
      "sanctions"
    ],
    "kind": "vessel",
    "name": "Chon Ma San",
    "aliases": [
      "Chon Ma San"
    ],
    "country": "KP",
    "authority": "OFAC",
    "program": "DPRK / North Korea (E.O. 13810)",
    "listingDate": "2018-02-23",
    "description": "DPRK-flagged vessel; designated for involvement in illicit ship-to-ship transfers used to evade North Korea sanctions.",
    "note": "DPRK-flagged vessel; designated for involvement in illicit ship-to-ship transfers used to evade North Korea sanctions.",
    "imo": "8660313",
    "sourceUrl": "https://ofac.treasury.gov/recent-actions/20180223",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0091",
    "lists": [
      "sanctions"
    ],
    "kind": "organisation",
    "name": "Bank Mellat",
    "aliases": [
      "Bank Mellat"
    ],
    "country": "IR",
    "authority": "OFAC",
    "program": "Counter-Proliferation (E.O. 13382)",
    "listingDate": "2007-10-25",
    "description": "Iranian bank; designated for providing banking services to entities involved in Iran’s nuclear and ballistic-missile programmes.",
    "note": "Iranian bank; designated for providing banking services to entities involved in Iran’s nuclear and ballistic-missile programmes.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/hp1130",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0092",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "organisation",
    "name": "Al-Qaida in Iraq",
    "aliases": [
      "AQI",
      "Tanzim Qa’idat al-Jihad fi Bilad al-Rafidayn"
    ],
    "country": "IQ",
    "authority": "UN",
    "program": "UN 1267 ISIL (Da’esh) & Al-Qaida Sanctions List",
    "listingDate": "2004-10-18",
    "description": "Iraqi Al-Qaida affiliate led by Abu Musab al-Zarqawi (predecessor of ISIL); listed for terrorist attacks and insurgency in Iraq.",
    "note": "Iraqi Al-Qaida affiliate led by Abu Musab al-Zarqawi (predecessor of ISIL); listed for terrorist attacks and insurgency in Iraq.",
    "sourceUrl": "https://main.un.org/securitycouncil/en/sanctions/1267/aq_sanctions_list/summaries/entity/al-qaida-in-iraq",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0093",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "organisation",
    "name": "Wagner Group",
    "aliases": [
      "PMC Wagner",
      "ChVK Wagner",
      "Vagner Group"
    ],
    "country": "RU",
    "authority": "OFAC",
    "authorities": [
      "OFAC",
      "EU"
    ],
    "program": "Transnational Criminal Organizations (E.O. 13581)",
    "listingDate": "2023-01-26",
    "description": "Russia-based private military company; designated by OFAC as a significant transnational criminal organisation (26 Jan 2023) for operations in Ukraine, the Central African Republic and Mali, and separately listed by the EU (13 Apr 2023) for supporting Russia’s war of aggression. (Merged US + EU designation.)",
    "note": "Russia-based private military company; designated by OFAC as a significant transnational criminal organisation (26 Jan 2023) for operations in Ukraine, the Central African Republic and Mali, and separately listed by the EU (13 Apr 2023) for supporting Russia’s war of aggression. (Merged US + EU designation.)",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/jy1220",
    "additionalSources": [
      "https://www.consilium.europa.eu/en/press/press-releases/2023/04/13/russia-s-war-of-aggression-against-ukraine-wagner-group-and-ria-fan-added-to-the-eu-s-sanctions-list/"
    ],
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0094",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "organisation",
    "name": "Hizballah",
    "aliases": [
      "Hezbollah",
      "Hizbullah",
      "Party of God"
    ],
    "country": "LB",
    "authority": "OFAC",
    "program": "Counter-Terrorism (E.O. 13224, SDGT)",
    "listingDate": "2001-10-31",
    "description": "Lebanon-based Iran-backed militant and political organisation; designated as a Specially Designated Global Terrorist for terrorist attacks worldwide.",
    "note": "Lebanon-based Iran-backed militant and political organisation; designated as a Specially Designated Global Terrorist for terrorist attacks worldwide.",
    "sourceUrl": "https://www.state.gov/executive-order-13224/",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0095",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "organisation",
    "name": "Hamas",
    "aliases": [
      "Harakat al-Muqawamah al-Islamiyyah",
      "Islamic Resistance Movement"
    ],
    "country": "PS",
    "authority": "OFAC",
    "program": "Counter-Terrorism (E.O. 13224, SDGT)",
    "listingDate": "2001-10-31",
    "description": "Palestinian militant and political organisation; designated as a Specially Designated Global Terrorist for terrorist attacks against Israel.",
    "note": "Palestinian militant and political organisation; designated as a Specially Designated Global Terrorist for terrorist attacks against Israel.",
    "sourceUrl": "https://www.state.gov/executive-order-13224/",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0096",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "organisation",
    "name": "Palestinian Islamic Jihad",
    "aliases": [
      "PIJ",
      "Harakat al-Jihad al-Islami al-Filastini"
    ],
    "country": "PS",
    "authority": "OFAC",
    "program": "Counter-Terrorism (E.O. 13224, SDGT)",
    "listingDate": "2001-10-31",
    "description": "Palestinian militant organisation; designated as a Specially Designated Global Terrorist for suicide bombings and other terrorist attacks.",
    "note": "Palestinian militant organisation; designated as a Specially Designated Global Terrorist for suicide bombings and other terrorist attacks.",
    "sourceUrl": "https://www.state.gov/executive-order-13224/",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0097",
    "lists": [
      "sanctions",
      "pep"
    ],
    "kind": "person",
    "name": "Charles Ghankay Taylor",
    "aliases": [
      "Charles Taylor",
      "Charles MacArthur Ghankay Taylor"
    ],
    "dob": "1948-01-28",
    "country": "LR",
    "authority": "OFAC",
    "program": "Former Liberian Regime of Charles Taylor (E.O. 13348)",
    "listingDate": "2004-07-22",
    "description": "Former President of Liberia later convicted of war crimes; designated for undermining Liberia’s transition and for links to illicit arms and diamond trafficking.",
    "note": "Former President of Liberia later convicted of war crimes; designated for undermining Liberia’s transition and for links to illicit arms and diamond trafficking.",
    "sourceUrl": "https://ofac.treasury.gov/sanctions-programs-and-country-information/liberia-related-sanctions",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0098",
    "lists": [
      "sanctions"
    ],
    "kind": "person",
    "name": "Mikhail Maratovich Fridman",
    "aliases": [
      "Mikhail Fridman"
    ],
    "dob": "1964-04-21",
    "country": "RU",
    "authority": "OFAC",
    "program": "Russian Harmful Foreign Activities (E.O. 14024)",
    "listingDate": "2022-03-15",
    "description": "Russian billionaire and co-founder of Alfa Group; designated as a member of the Russian elite benefiting from the Government of Russia.",
    "note": "Russian billionaire and co-founder of Alfa Group; designated as a member of the Russian elite benefiting from the Government of Russia.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/jy0668",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0099",
    "lists": [
      "sanctions"
    ],
    "kind": "person",
    "name": "Petr Olegovich Aven",
    "aliases": [
      "Pyotr Aven",
      "Petr Aven"
    ],
    "dob": "1955-03-16",
    "country": "RU",
    "authority": "OFAC",
    "program": "Russian Harmful Foreign Activities (E.O. 14024)",
    "listingDate": "2022-03-15",
    "description": "Russian billionaire and Alfa Group shareholder; designated as a member of the close circle of Russian elites around Putin.",
    "note": "Russian billionaire and Alfa Group shareholder; designated as a member of the close circle of Russian elites around Putin.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/jy0668",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0100",
    "lists": [
      "sanctions"
    ],
    "kind": "organisation",
    "name": "Public Joint Stock Company Moscow Exchange MICEX-RTS",
    "aliases": [
      "Moscow Exchange",
      "MOEX"
    ],
    "country": "RU",
    "authority": "OFAC",
    "program": "Russian Harmful Foreign Activities (E.O. 14024)",
    "listingDate": "2024-06-12",
    "description": "Russia’s largest securities exchange; designated for operating in the financial-services sector of the Russian economy.",
    "note": "Russia’s largest securities exchange; designated for operating in the financial-services sector of the Russian economy.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/jy2394",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0101",
    "lists": [
      "sanctions"
    ],
    "kind": "organisation",
    "name": "National Clearing Center",
    "aliases": [
      "NCC",
      "Natsionalny Klaringovy Tsentr"
    ],
    "country": "RU",
    "authority": "OFAC",
    "program": "Russian Harmful Foreign Activities (E.O. 14024)",
    "listingDate": "2024-06-12",
    "description": "Central counterparty and clearing arm of the Moscow Exchange; designated for operating in the financial-services sector of the Russian economy.",
    "note": "Central counterparty and clearing arm of the Moscow Exchange; designated for operating in the financial-services sector of the Russian economy.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/jy2394",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0102",
    "lists": [
      "sanctions",
      "pep"
    ],
    "kind": "person",
    "name": "Kim Jong Un",
    "aliases": [
      "Kim Jong-un",
      "Kim Jong Woon"
    ],
    "dob": "1984-01-08",
    "country": "KP",
    "authority": "OFAC",
    "program": "North Korea Sanctions (E.O. 13687 / E.O. 13722)",
    "listingDate": "2016-07-06",
    "description": "Supreme Leader of North Korea (Chairman of the Workers’ Party of Korea); designated as the head of the DPRK government in connection with the regime’s serious human-rights abuses and censorship.",
    "note": "Supreme Leader of North Korea (Chairman of the Workers’ Party of Korea); designated as the head of the DPRK government in connection with the regime’s serious human-rights abuses and censorship.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/jl0506",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0103",
    "lists": [
      "sanctions",
      "pep"
    ],
    "kind": "person",
    "name": "Ali Hosseini Khamenei",
    "aliases": [
      "Ali Khamenei",
      "Sayyid Ali Hosseini Khamenei",
      "Ayatollah Khamenei"
    ],
    "dob": "1939-04-19",
    "country": "IR",
    "authority": "OFAC",
    "program": "Iran Sanctions (E.O. 13876)",
    "listingDate": "2019-06-24",
    "description": "Supreme Leader of Iran; designated together with his office under E.O. 13876 as the ultimate authority responsible for the regime’s malign conduct.",
    "note": "Supreme Leader of Iran; designated together with his office under E.O. 13876 as the ultimate authority responsible for the regime’s malign conduct.",
    "sourceUrl": "https://sanctionssearch.ofac.treas.gov/Details.aspx?id=13107",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0104",
    "lists": [
      "sanctions",
      "pep"
    ],
    "kind": "person",
    "name": "Ebrahim Raisi",
    "aliases": [
      "Ebrahim Raeisi",
      "Seyyed Ebrahim Raisi"
    ],
    "dob": "1960-12-14",
    "country": "IR",
    "authority": "OFAC",
    "program": "Iran Human Rights (E.O. 13876 / E.O. 13553)",
    "listingDate": "2019-11-04",
    "description": "Iranian judiciary chief and later President of Iran; designated for his role in the administration of the Iranian judiciary and human-rights abuses. (Historical designation; died 2024.)",
    "note": "Iranian judiciary chief and later President of Iran; designated for his role in the administration of the Iranian judiciary and human-rights abuses. (Historical designation; died 2024.)",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/sm817",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0105",
    "lists": [
      "sanctions",
      "pep"
    ],
    "kind": "person",
    "name": "Esmail Qaani",
    "aliases": [
      "Esmail Ghaani",
      "Ismail Qaani"
    ],
    "dob": "1957-08-08",
    "country": "IR",
    "authority": "OFAC",
    "program": "Counter-Terrorism (E.O. 13224, SDGT)",
    "listingDate": "2012-03-27",
    "description": "Commander of the IRGC-Qods Force (successor to Qasem Soleimani); designated in connection with the IRGC-QF’s support for terrorism and human-rights abuses.",
    "note": "Commander of the IRGC-Qods Force (successor to Qasem Soleimani); designated in connection with the IRGC-QF’s support for terrorism and human-rights abuses.",
    "sourceUrl": "https://sanctionssearch.ofac.treas.gov/Details.aspx?id=13115",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0106",
    "lists": [
      "sanctions",
      "pep"
    ],
    "kind": "person",
    "name": "Amir Ali Hajizadeh",
    "aliases": [
      "Amirali Hajizadeh"
    ],
    "dob": "1962-01-01",
    "country": "IR",
    "authority": "OFAC",
    "program": "Counter-Proliferation / IRGC (E.O. 13382)",
    "listingDate": "2019-09-04",
    "description": "Commander of the IRGC Aerospace Force, which controls Iran’s ballistic-missile programme; designated as an IRGC official under the counter-proliferation authority.",
    "note": "Commander of the IRGC Aerospace Force, which controls Iran’s ballistic-missile programme; designated as an IRGC official under the counter-proliferation authority.",
    "sourceUrl": "https://sanctionssearch.ofac.treas.gov/Details.aspx?id=26942",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0107",
    "lists": [
      "sanctions"
    ],
    "kind": "organisation",
    "name": "Petroleos de Venezuela, S.A.",
    "aliases": [
      "PDVSA",
      "Petroleos de Venezuela SA"
    ],
    "country": "VE",
    "authority": "OFAC",
    "program": "Venezuela Sanctions (E.O. 13850)",
    "listingDate": "2019-01-28",
    "description": "Venezuela’s state-owned oil company; designated for operating in the oil sector of the Venezuelan economy, blocking its US-jurisdiction property and majority-owned subsidiaries.",
    "note": "Venezuela’s state-owned oil company; designated for operating in the oil sector of the Venezuelan economy, blocking its US-jurisdiction property and majority-owned subsidiaries.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/sm594",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0108",
    "lists": [
      "sanctions",
      "pep"
    ],
    "kind": "person",
    "name": "Delcy Eloina Rodriguez Gomez",
    "aliases": [
      "Delcy Rodriguez"
    ],
    "dob": "1969-05-18",
    "country": "VE",
    "authority": "OFAC",
    "program": "Venezuela Sanctions (E.O. 13692)",
    "listingDate": "2018-09-25",
    "description": "Venezuelan Vice-President (later acting President); designated as a current or former official of the Government of Venezuela.",
    "note": "Venezuelan Vice-President (later acting President); designated as a current or former official of the Government of Venezuela.",
    "sourceUrl": "https://ofac.treasury.gov/recent-actions/20180925",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0109",
    "lists": [
      "sanctions",
      "pep",
      "adverse-media"
    ],
    "kind": "person",
    "name": "Tareck Zaidan El Aissami Maddah",
    "aliases": [
      "Tareck El Aissami"
    ],
    "dob": "1974-11-12",
    "country": "VE",
    "authority": "OFAC",
    "program": "Foreign Narcotics Kingpin Designation Act",
    "listingDate": "2017-02-13",
    "description": "Venezuelan Vice-President and later Oil Minister; named a Kingpin-Act narcotics trafficker for a prominent role in international drug trafficking.",
    "note": "Venezuelan Vice-President and later Oil Minister; named a Kingpin-Act narcotics trafficker for a prominent role in international drug trafficking.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/as0005",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0110",
    "lists": [
      "sanctions",
      "pep"
    ],
    "kind": "person",
    "name": "Maher al-Assad",
    "aliases": [
      "Maher Al Assad"
    ],
    "dob": "1967-12-08",
    "country": "SY",
    "authority": "OFAC",
    "program": "Syria Sanctions (E.O. 13573)",
    "listingDate": "2011-05-18",
    "description": "Brother of Bashar al-Assad and commander of the Syrian Army’s Republican Guard and 4th Armoured Division; designated as a senior Syrian regime official responsible for the repression of the Syrian people.",
    "note": "Brother of Bashar al-Assad and commander of the Syrian Army’s Republican Guard and 4th Armoured Division; designated as a senior Syrian regime official responsible for the repression of the Syrian people.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/tg1181",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0111",
    "lists": [
      "sanctions",
      "pep"
    ],
    "kind": "person",
    "name": "Asma al-Assad",
    "aliases": [
      "Asma Al Assad",
      "Asma Akhras"
    ],
    "dob": "1975-08-11",
    "country": "SY",
    "authority": "OFSI",
    "program": "UK Syria (Human Rights) sanctions",
    "listingDate": "2020-03-30",
    "description": "Wife of Bashar al-Assad; UK-listed as a prominent supporter of and closely associated with the Syrian regime responsible for repression of the civilian population.",
    "note": "Wife of Bashar al-Assad; UK-listed as a prominent supporter of and closely associated with the Syrian regime responsible for repression of the civilian population.",
    "sourceUrl": "https://www.gov.uk/government/publications/financial-sanctions-consolidated-list-of-targets/consolidated-list-of-targets",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0112",
    "lists": [
      "sanctions",
      "pep"
    ],
    "kind": "person",
    "name": "Nikolai Platonovich Patrushev",
    "aliases": [
      "Nikolai Patrushev"
    ],
    "dob": "1951-07-11",
    "country": "RU",
    "authority": "OFAC",
    "program": "Russian Harmful Foreign Activities (E.O. 14024)",
    "listingDate": "2021-03-02",
    "description": "Secretary of the Russian Security Council and former FSB Director; designated as a senior official of the Government of the Russian Federation.",
    "note": "Secretary of the Russian Security Council and former FSB Director; designated as a senior official of the Government of the Russian Federation.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/jy0045",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0113",
    "lists": [
      "sanctions",
      "pep"
    ],
    "kind": "person",
    "name": "Sergei Vladilenovich Kiriyenko",
    "aliases": [
      "Sergei Kiriyenko"
    ],
    "dob": "1962-07-26",
    "country": "RU",
    "authority": "OFAC",
    "program": "Russian Harmful Foreign Activities (E.O. 14024)",
    "listingDate": "2022-03-24",
    "description": "First Deputy Chief of Staff of the Russian Presidential Executive Office; designated as a leader/official of the Government of Russia.",
    "note": "First Deputy Chief of Staff of the Russian Presidential Executive Office; designated as a leader/official of the Government of Russia.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/jy0677",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0114",
    "lists": [
      "sanctions",
      "pep"
    ],
    "kind": "person",
    "name": "Petr Mikhailovich Fradkov",
    "aliases": [
      "Petr Fradkov",
      "Pyotr Fradkov"
    ],
    "dob": "1978-02-07",
    "country": "RU",
    "authority": "OFAC",
    "program": "Russian Harmful Foreign Activities (E.O. 14024)",
    "listingDate": "2022-02-24",
    "description": "Chairman and CEO of Promsvyazbank; designated in connection with the bank’s central role in financing the Russian defence sector.",
    "note": "Chairman and CEO of Promsvyazbank; designated in connection with the bank’s central role in financing the Russian defence sector.",
    "sourceUrl": "https://ofac.treasury.gov/recent-actions/20220224",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0115",
    "lists": [
      "sanctions",
      "pep"
    ],
    "kind": "person",
    "name": "Maria Vladimirovna Zakharova",
    "aliases": [
      "Maria Zakharova",
      "Mariya Zakharova"
    ],
    "dob": "1975-12-24",
    "country": "RU",
    "authority": "OFAC",
    "program": "Russian Harmful Foreign Activities (E.O. 14024)",
    "listingDate": "2022-03-24",
    "description": "Spokesperson and Director of Information and Press for the Russian Ministry of Foreign Affairs; designated as an official of the Government of Russia.",
    "note": "Spokesperson and Director of Information and Press for the Russian Ministry of Foreign Affairs; designated as an official of the Government of Russia.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/jy0677",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0116",
    "lists": [
      "sanctions"
    ],
    "kind": "organisation",
    "name": "Gazprom Neft",
    "aliases": [
      "Gazprom Neft PJSC",
      "JSC Gazprom Neft"
    ],
    "country": "RU",
    "authority": "OFAC",
    "program": "Russian Harmful Foreign Activities (E.O. 14024)",
    "listingDate": "2025-01-10",
    "description": "Major Russian oil producer (the oil arm of Gazprom); blocked in the January 2025 action targeting Russia’s oil production and exports (E.O. 14024 energy-sector determination).",
    "note": "Major Russian oil producer (the oil arm of Gazprom); blocked in the January 2025 action targeting Russia’s oil production and exports (E.O. 14024 energy-sector determination).",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/jy2777",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0117",
    "lists": [
      "sanctions"
    ],
    "kind": "organisation",
    "name": "Surgutneftegas",
    "aliases": [
      "Surgutneftegaz",
      "PJSC Surgutneftegas"
    ],
    "country": "RU",
    "authority": "OFAC",
    "program": "Russian Harmful Foreign Activities (E.O. 14024)",
    "listingDate": "2025-01-10",
    "description": "Large independent Russian oil producer; blocked in the January 2025 action targeting Russia’s oil production and exports (E.O. 14024 energy-sector determination).",
    "note": "Large independent Russian oil producer; blocked in the January 2025 action targeting Russia’s oil production and exports (E.O. 14024 energy-sector determination).",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/jy2777",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0118",
    "lists": [
      "sanctions"
    ],
    "kind": "organisation",
    "name": "Evraz plc",
    "aliases": [
      "Evraz",
      "Evraz PLC"
    ],
    "country": "GB",
    "authority": "OFSI",
    "program": "UK Russia (Sanctions) (EU Exit) Regulations 2019",
    "listingDate": "2022-05-05",
    "description": "London-listed steel and mining group operating extensively in Russia (rail-track and railway-wheel production); added to the UK consolidated list and made subject to an asset freeze.",
    "note": "London-listed steel and mining group operating extensively in Russia (rail-track and railway-wheel production); added to the UK consolidated list and made subject to an asset freeze.",
    "sourceUrl": "https://www.gov.uk/government/news/uk-hits-putins-inner-circle-and-russian-economy-with-punishing-new-sanctions",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0119",
    "lists": [
      "sanctions"
    ],
    "kind": "person",
    "name": "Andrey Igorevich Melnichenko",
    "aliases": [
      "Andrey Melnichenko"
    ],
    "dob": "1972-03-08",
    "country": "RU",
    "authority": "OFSI",
    "program": "UK Russia (Sanctions) (EU Exit) Regulations 2019",
    "listingDate": "2022-03-15",
    "description": "Russian billionaire founder of EuroChem and SUEK; added to the UK asset-freeze list as a prominent businessman involved in sectors of strategic significance to the Russian government.",
    "note": "Russian billionaire founder of EuroChem and SUEK; added to the UK asset-freeze list as a prominent businessman involved in sectors of strategic significance to the Russian government.",
    "sourceUrl": "https://www.gov.uk/government/news/uk-sanctions-more-of-putins-inner-circle",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0120",
    "lists": [
      "sanctions"
    ],
    "kind": "organisation",
    "name": "Rossiya Segodnya",
    "aliases": [
      "Rossiya Segodnya",
      "RIA Novosti (Rossiya Segodnya)"
    ],
    "country": "RU",
    "authority": "EU",
    "program": "EU restrictive measures — Russia (Ukraine)",
    "listingDate": "2022-06-03",
    "description": "Russian state media group; EU-listed as an outlet under the permanent control of the Russian leadership disseminating propaganda supporting the war against Ukraine.",
    "note": "Russian state media group; EU-listed as an outlet under the permanent control of the Russian leadership disseminating propaganda supporting the war against Ukraine.",
    "sourceUrl": "https://www.consilium.europa.eu/en/press/press-releases/2022/06/03/",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0121",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "organisation",
    "name": "Evil Corp",
    "aliases": [
      "Dridex operators",
      "Indrik Spider"
    ],
    "country": "RU",
    "authority": "OFAC",
    "program": "Malicious Cyber-Enabled Activities (E.O. 13694)",
    "listingDate": "2019-12-05",
    "description": "Russia-based cybercriminal organisation behind the Dridex banking trojan; designated for cyber-enabled theft of more than USD 100 million from banks in over 40 countries.",
    "note": "Russia-based cybercriminal organisation behind the Dridex banking trojan; designated for cyber-enabled theft of more than USD 100 million from banks in over 40 countries.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/sm845",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0122",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "person",
    "name": "Maksim Viktorovich Yakubets",
    "aliases": [
      "Maksim Yakubets",
      "aqua"
    ],
    "dob": "1987-05-20",
    "country": "RU",
    "authority": "OFAC",
    "program": "Malicious Cyber-Enabled Activities (E.O. 13694)",
    "listingDate": "2019-12-05",
    "description": "Leader and founder of Evil Corp; designated for managing and supervising the group’s malicious cyber activity and for assisting Russian state cyber efforts.",
    "note": "Leader and founder of Evil Corp; designated for managing and supervising the group’s malicious cyber activity and for assisting Russian state cyber efforts.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/sm845",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0123",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "organisation",
    "name": "Chatex",
    "aliases": [
      "Chatex OU"
    ],
    "country": "XX",
    "authority": "OFAC",
    "program": "Malicious Cyber-Enabled Activities (E.O. 13694)",
    "listingDate": "2021-11-08",
    "description": "Virtual-currency exchange designated for facilitating financial transactions for ransomware actors; a large share of its transactions were traced to illicit or high-risk sources.",
    "note": "Virtual-currency exchange designated for facilitating financial transactions for ransomware actors; a large share of its transactions were traced to illicit or high-risk sources.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/jy0471",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0124",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "organisation",
    "name": "Cartel de Jalisco Nueva Generacion",
    "aliases": [
      "CJNG",
      "Jalisco New Generation Cartel",
      "Los Mata Zetas"
    ],
    "country": "MX",
    "authority": "OFAC",
    "program": "Foreign Narcotics Kingpin Designation Act",
    "listingDate": "2015-04-08",
    "description": "One of Mexico’s most powerful and violent drug-trafficking organisations; identified as a significant foreign narcotics trafficker under the Kingpin Act.",
    "note": "One of Mexico’s most powerful and violent drug-trafficking organisations; identified as a significant foreign narcotics trafficker under the Kingpin Act.",
    "sourceUrl": "https://ofac.treasury.gov/recent-actions/20150408",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0125",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "person",
    "name": "Nemesio Oseguera Cervantes",
    "aliases": [
      "El Mencho",
      "Ruben Oseguera Cervantes"
    ],
    "dob": "1966-07-17",
    "country": "MX",
    "authority": "OFAC",
    "program": "Foreign Narcotics Kingpin Designation Act",
    "listingDate": "2015-04-08",
    "description": "Leader of the Cartel de Jalisco Nueva Generacion (CJNG); named a Kingpin-Act narcotics trafficker for leading one of the world’s most prolific trafficking organisations.",
    "note": "Leader of the Cartel de Jalisco Nueva Generacion (CJNG); named a Kingpin-Act narcotics trafficker for leading one of the world’s most prolific trafficking organisations.",
    "sourceUrl": "https://ofac.treasury.gov/recent-actions/20150408",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0126",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "organisation",
    "name": "Los Cuinis",
    "aliases": [
      "Los Cuinis Drug Trafficking Organization"
    ],
    "country": "MX",
    "authority": "OFAC",
    "program": "Foreign Narcotics Kingpin Designation Act",
    "listingDate": "2015-04-08",
    "description": "Money-laundering and trafficking organisation closely allied with the CJNG; identified as a significant foreign narcotics trafficker under the Kingpin Act.",
    "note": "Money-laundering and trafficking organisation closely allied with the CJNG; identified as a significant foreign narcotics trafficker under the Kingpin Act.",
    "sourceUrl": "https://ofac.treasury.gov/recent-actions/20150408",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0127",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "organisation",
    "name": "Cartel de los Soles",
    "aliases": [
      "Cartel of the Suns"
    ],
    "country": "VE",
    "authority": "OFAC",
    "program": "Counter-Terrorism / SDGT",
    "listingDate": "2025-07-25",
    "description": "Venezuela-linked narco-trafficking network of corrupt military and government officials; designated in connection with cocaine trafficking and support to other criminal groups.",
    "note": "Venezuela-linked narco-trafficking network of corrupt military and government officials; designated in connection with cocaine trafficking and support to other criminal groups.",
    "sourceUrl": "https://ofac.treasury.gov/recent-actions/20250725",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0128",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "person",
    "name": "Anwar al-Awlaki",
    "aliases": [
      "Anwar al-Aulaqi",
      "Anwar Nasser Aulaqi"
    ],
    "dob": "1971-04-21",
    "country": "YE",
    "authority": "OFAC",
    "program": "Counter-Terrorism (E.O. 13224, SDGT)",
    "listingDate": "2010-07-16",
    "description": "US-born Al-Qaida in the Arabian Peninsula (AQAP) leader and propagandist; designated for supporting acts of terrorism and acting for or on behalf of AQAP. (Historical designation.)",
    "note": "US-born Al-Qaida in the Arabian Peninsula (AQAP) leader and propagandist; designated for supporting acts of terrorism and acting for or on behalf of AQAP. (Historical designation.)",
    "sourceUrl": "https://www.treasury.gov/press-center/press-releases/pages/tg779.aspx",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0129",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "person",
    "name": "Abu Mohammed al-Julani",
    "aliases": [
      "Abu Muhammad al-Jawlani",
      "Ahmed Hussein al-Shara",
      "Muhammad al-Jawlani"
    ],
    "dob": "1982-01-01",
    "country": "SY",
    "authority": "OFAC",
    "program": "Counter-Terrorism (E.O. 13224, SDGT)",
    "listingDate": "2013-05-16",
    "description": "Leader of al-Nusrah Front (later Hay’at Tahrir al-Sham); designated as a Specially Designated Global Terrorist for leading an Al-Qaida-linked group in Syria. (Designation as at the snapshot date.)",
    "note": "Leader of al-Nusrah Front (later Hay’at Tahrir al-Sham); designated as a Specially Designated Global Terrorist for leading an Al-Qaida-linked group in Syria. (Designation as at the snapshot date.)",
    "sourceUrl": "https://www.state.gov/rewards-for-justice-2/",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0130",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "organisation",
    "name": "Islamic State of Iraq and the Levant",
    "aliases": [
      "ISIL",
      "ISIS",
      "Daesh",
      "Islamic State"
    ],
    "country": "IQ",
    "authority": "UN",
    "program": "UN 1267 ISIL (Da’esh) & Al-Qaida Sanctions List",
    "listingDate": "2013-05-30",
    "description": "Transnational terrorist organisation that seized territory in Iraq and Syria; listed for terrorist attacks, atrocities and the financing of terrorism (formerly listed as Al-Qaida in Iraq).",
    "note": "Transnational terrorist organisation that seized territory in Iraq and Syria; listed for terrorist attacks, atrocities and the financing of terrorism (formerly listed as Al-Qaida in Iraq).",
    "sourceUrl": "https://main.un.org/securitycouncil/en/sanctions/1267/aq_sanctions_list/summaries/entity/islamic-state-in-iraq-and-the-levant",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0131",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "person",
    "name": "Abu Bakr Shekau",
    "aliases": [
      "Abubakar Shekau",
      "Abu Bakr Shekau"
    ],
    "dob": "1969-01-01",
    "country": "NG",
    "authority": "UN",
    "program": "UN 1267 ISIL (Da’esh) & Al-Qaida Sanctions List",
    "listingDate": "2014-06-26",
    "description": "Leader of Boko Haram; listed as associated with Al-Qaida for leading a group responsible for attacks, mass abductions and atrocities in the Lake Chad region. (Historical designation.)",
    "note": "Leader of Boko Haram; listed as associated with Al-Qaida for leading a group responsible for attacks, mass abductions and atrocities in the Lake Chad region. (Historical designation.)",
    "sourceUrl": "https://main.un.org/securitycouncil/en/sanctions/1267/aq_sanctions_list/summaries/individual/abubakar-shekau",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0132",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "organisation",
    "name": "Kata’ib Hizballah",
    "aliases": [
      "Kataib Hezbollah",
      "Hizballah Brigades",
      "KH"
    ],
    "country": "IQ",
    "authority": "OFAC",
    "program": "Counter-Terrorism (E.O. 13224, SDGT)",
    "listingDate": "2009-07-02",
    "description": "Iran-backed Iraqi Shia militia; designated as a Specially Designated Global Terrorist for attacks against coalition forces and links to the IRGC-Qods Force.",
    "note": "Iran-backed Iraqi Shia militia; designated as a Specially Designated Global Terrorist for attacks against coalition forces and links to the IRGC-Qods Force.",
    "sourceUrl": "https://2009-2017.state.gov/j/ct/rls/other/des/143578.htm",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0133",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "person",
    "name": "Abu Mahdi al-Muhandis",
    "aliases": [
      "Jamal Jafaar Mohammed Ali al Ibrahimi",
      "Abu Mahdi al Muhandis"
    ],
    "dob": "1954-01-01",
    "country": "IQ",
    "authority": "OFAC",
    "program": "Counter-Terrorism (E.O. 13224, SDGT)",
    "listingDate": "2009-07-02",
    "description": "Founder and de-facto leader of Kata’ib Hizballah and deputy head of Iraq’s Popular Mobilization Forces; designated as an SDGT for advising and directing the militia. (Historical designation.)",
    "note": "Founder and de-facto leader of Kata’ib Hizballah and deputy head of Iraq’s Popular Mobilization Forces; designated as an SDGT for advising and directing the militia. (Historical designation.)",
    "sourceUrl": "https://sanctionssearch.ofac.treas.gov/Details.aspx?id=10525",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0134",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "organisation",
    "name": "Houthis (Ansarallah)",
    "aliases": [
      "Ansar Allah",
      "Ansarallah",
      "Houthi movement"
    ],
    "country": "YE",
    "authority": "OFAC",
    "program": "Counter-Terrorism (E.O. 13224, SDGT)",
    "listingDate": "2024-02-16",
    "description": "Yemen-based Iran-aligned armed movement; designated as a Specially Designated Global Terrorist in connection with attacks on commercial shipping in the Red Sea.",
    "note": "Yemen-based Iran-aligned armed movement; designated as a Specially Designated Global Terrorist in connection with attacks on commercial shipping in the Red Sea.",
    "sourceUrl": "https://ofac.treasury.gov/recent-actions/20240216",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0135",
    "lists": [
      "sanctions"
    ],
    "kind": "organisation",
    "name": "Islamic Revolutionary Guard Corps",
    "aliases": [
      "IRGC",
      "Army of the Guardians of the Islamic Revolution",
      "Pasdaran"
    ],
    "country": "IR",
    "authority": "OFAC",
    "program": "Counter-Terrorism (FTO / E.O. 13224 SDGT)",
    "listingDate": "2019-04-15",
    "description": "Iran’s Islamic Revolutionary Guard Corps in its entirety; designated as a Foreign Terrorist Organization (the first time the US so designated part of another government) for directing and supporting terrorism.",
    "note": "Iran’s Islamic Revolutionary Guard Corps in its entirety; designated as a Foreign Terrorist Organization (the first time the US so designated part of another government) for directing and supporting terrorism.",
    "sourceUrl": "https://ofac.treasury.gov/recent-actions/20190415_33",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0136",
    "lists": [
      "sanctions"
    ],
    "kind": "organisation",
    "name": "Shahid Bakeri Industrial Group",
    "aliases": [
      "SBIG"
    ],
    "country": "IR",
    "authority": "UN",
    "program": "UN 1737 (Iran non-proliferation) List",
    "listingDate": "2006-12-23",
    "description": "Iranian entity responsible for solid-fuelled ballistic missiles; listed by the UN as involved in Iran’s ballistic-missile programme.",
    "note": "Iranian entity responsible for solid-fuelled ballistic missiles; listed by the UN as involved in Iran’s ballistic-missile programme.",
    "sourceUrl": "https://main.un.org/securitycouncil/en/content/shahid-bakeri-industrial-group-sbig",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0137",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "person",
    "name": "Abdul Qadeer Khan",
    "aliases": [
      "A. Q. Khan",
      "Abdul Qadeer Khan"
    ],
    "dob": "1936-04-01",
    "country": "PK",
    "authority": "OFAC",
    "program": "Counter-Proliferation (E.O. 13382)",
    "listingDate": "2009-01-12",
    "description": "Pakistani nuclear scientist who ran a global proliferation network; designated for supplying nuclear-weapons technology to Iran, Libya and North Korea. (Historical designation.)",
    "note": "Pakistani nuclear scientist who ran a global proliferation network; designated for supplying nuclear-weapons technology to Iran, Libya and North Korea. (Historical designation.)",
    "sourceUrl": "https://sanctionssearch.ofac.treas.gov/Details.aspx?id=9639",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0138",
    "lists": [
      "sanctions"
    ],
    "kind": "organisation",
    "name": "Reconnaissance General Bureau",
    "aliases": [
      "RGB",
      "Chongch’al Ch’ongguk"
    ],
    "country": "KP",
    "authority": "OFAC",
    "program": "North Korea Sanctions (E.O. 13687)",
    "listingDate": "2015-01-02",
    "description": "DPRK’s primary intelligence organisation and the entity that controls the Lazarus Group; designated as an agency of the Government of North Korea.",
    "note": "DPRK’s primary intelligence organisation and the entity that controls the Lazarus Group; designated as an agency of the Government of North Korea.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/jl9733",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0139",
    "lists": [
      "sanctions"
    ],
    "kind": "organisation",
    "name": "Korea Kumsan Trading Corporation",
    "aliases": [
      "Korea Kumsan Trading Corp"
    ],
    "country": "KP",
    "authority": "UN",
    "program": "UN 1718 (DPRK) Sanctions List",
    "listingDate": "2016-11-30",
    "description": "DPRK trading company subordinate to the General Bureau of Atomic Energy; listed for procurement supporting North Korea’s nuclear programme.",
    "note": "DPRK trading company subordinate to the General Bureau of Atomic Energy; listed for procurement supporting North Korea’s nuclear programme.",
    "sourceUrl": "https://main.un.org/securitycouncil/en/sanctions/1718/materials/summaries/entity/korea-kumsan-trading-corporation",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0140",
    "lists": [
      "sanctions"
    ],
    "kind": "vessel",
    "name": "Wise Honest",
    "aliases": [
      "M/V Wise Honest"
    ],
    "country": "KP",
    "authority": "OFAC",
    "program": "North Korea Sanctions (E.O. 13810)",
    "listingDate": "2019-05-09",
    "description": "DPRK bulk carrier seized by the United States; used to export coal and import machinery in violation of North Korea sanctions.",
    "note": "DPRK bulk carrier seized by the United States; used to export coal and import machinery in violation of North Korea sanctions.",
    "imo": "8905490",
    "sourceUrl": "https://www.justice.gov/opa/pr/united-states-files-forfeiture-complaint-against-north-korean-cargo-vessel",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0141",
    "lists": [
      "sanctions"
    ],
    "kind": "organisation",
    "name": "Bank Otkritie Financial Corporation",
    "aliases": [
      "Otkritie",
      "Otkritie Bank",
      "FC Otkritie"
    ],
    "country": "RU",
    "authority": "OFAC",
    "program": "Russian Harmful Foreign Activities (E.O. 14024)",
    "listingDate": "2022-02-24",
    "description": "Major Russian bank; fully blocked in the February 2022 action against Russia’s largest financial institutions following the invasion of Ukraine.",
    "note": "Major Russian bank; fully blocked in the February 2022 action against Russia’s largest financial institutions following the invasion of Ukraine.",
    "sourceUrl": "https://ofac.treasury.gov/recent-actions/20220224",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0142",
    "lists": [
      "sanctions"
    ],
    "kind": "organisation",
    "name": "Sovcombank Public Joint Stock Company",
    "aliases": [
      "Sovcombank",
      "PJSC Sovcombank"
    ],
    "country": "RU",
    "authority": "OFAC",
    "program": "Russian Harmful Foreign Activities (E.O. 14024)",
    "listingDate": "2022-02-24",
    "description": "One of Russia’s largest privately-owned banks; fully blocked in the February 2022 financial-sector action over the invasion of Ukraine.",
    "note": "One of Russia’s largest privately-owned banks; fully blocked in the February 2022 financial-sector action over the invasion of Ukraine.",
    "sourceUrl": "https://ofac.treasury.gov/recent-actions/20220224",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0143",
    "lists": [
      "sanctions"
    ],
    "kind": "organisation",
    "name": "United Shipbuilding Corporation",
    "aliases": [
      "USC",
      "Obedinennaya Sudostroitelnaya Korporatsiya"
    ],
    "country": "RU",
    "authority": "OFAC",
    "program": "Ukraine-/Russia-Related Sanctions (E.O. 13661)",
    "listingDate": "2014-07-16",
    "description": "Russian state shipbuilding conglomerate; designated in the 2014 Ukraine-related actions as operating in the defence sector of the Russian economy.",
    "note": "Russian state shipbuilding conglomerate; designated in the 2014 Ukraine-related actions as operating in the defence sector of the Russian economy.",
    "sourceUrl": "https://ofac.treasury.gov/recent-actions/20140716",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0144",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "person",
    "name": "Rafael Caro Quintero",
    "aliases": [
      "Rafael Caro-Quintero",
      "Narco de Narcos"
    ],
    "dob": "1952-10-03",
    "country": "MX",
    "authority": "OFAC",
    "program": "Foreign Narcotics Kingpin Designation Act",
    "listingDate": "2013-06-27",
    "description": "Founding member of the Guadalajara Cartel; named a Kingpin-Act narcotics trafficker, wanted in connection with the 1985 murder of a US DEA agent.",
    "note": "Founding member of the Guadalajara Cartel; named a Kingpin-Act narcotics trafficker, wanted in connection with the 1985 murder of a US DEA agent.",
    "sourceUrl": "https://sanctionssearch.ofac.treas.gov/Details.aspx?id=13748",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0145",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "person",
    "name": "Ovidio Guzman Lopez",
    "aliases": [
      "Ovidio Guzman",
      "El Raton"
    ],
    "dob": "1990-03-29",
    "country": "MX",
    "authority": "OFAC",
    "program": "Foreign Narcotics Kingpin Designation Act",
    "listingDate": "2018-05-16",
    "description": "Son of Joaquin “El Chapo” Guzman and a leader of a Sinaloa Cartel faction (“Los Chapitos”); designated as a significant foreign narcotics trafficker.",
    "note": "Son of Joaquin “El Chapo” Guzman and a leader of a Sinaloa Cartel faction (“Los Chapitos”); designated as a significant foreign narcotics trafficker.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/sm0392",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0146",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "person",
    "name": "Dawood Ibrahim Kaskar",
    "aliases": [
      "Dawood Ibrahim",
      "Dawood Ebrahim"
    ],
    "dob": "1955-12-26",
    "country": "IN",
    "authority": "UN",
    "program": "UN 1267 ISIL (Da’esh) & Al-Qaida Sanctions List",
    "listingDate": "2003-11-03",
    "description": "Indian organised-crime boss (D-Company); listed as associated with Al-Qaida and linked to the 1993 Mumbai bombings and cross-border trafficking.",
    "note": "Indian organised-crime boss (D-Company); listed as associated with Al-Qaida and linked to the 1993 Mumbai bombings and cross-border trafficking.",
    "sourceUrl": "https://main.un.org/securitycouncil/en/sanctions/1267/aq_sanctions_list/summaries/individual/dawood-ibrahim-kaskar",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0147",
    "lists": [
      "sanctions"
    ],
    "kind": "person",
    "name": "Suleiman Abusaidovich Kerimov",
    "aliases": [
      "Suleiman Kerimov"
    ],
    "dob": "1966-03-12",
    "country": "RU",
    "authority": "OFAC",
    "program": "Ukraine-/Russia-Related Sanctions (E.O. 13661)",
    "listingDate": "2018-04-06",
    "description": "Russian billionaire and member of the Federation Council; designated as an official of the Government of Russia and for links to Russian elite wealth.",
    "note": "Russian billionaire and member of the Federation Council; designated as an official of the Government of Russia and for links to Russian elite wealth.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/sm0338",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0148",
    "lists": [
      "sanctions"
    ],
    "kind": "person",
    "name": "Viktor Feliksovich Vekselberg",
    "aliases": [
      "Viktor Vekselberg"
    ],
    "dob": "1957-04-14",
    "country": "RU",
    "authority": "OFAC",
    "program": "Ukraine-/Russia-Related Sanctions (E.O. 13661)",
    "listingDate": "2018-04-06",
    "description": "Russian billionaire and founder/chairman of the Renova Group; designated for operating in the energy sector and as a member of the Russian elite.",
    "note": "Russian billionaire and founder/chairman of the Renova Group; designated for operating in the energy sector and as a member of the Russian elite.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/sm0338",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0149",
    "lists": [
      "sanctions",
      "pep"
    ],
    "kind": "person",
    "name": "Kirill Alexandrovich Dmitriev",
    "aliases": [
      "Kirill Dmitriev"
    ],
    "dob": "1975-06-12",
    "country": "RU",
    "authority": "OFAC",
    "program": "Russian Harmful Foreign Activities (E.O. 14024)",
    "listingDate": "2022-02-28",
    "description": "CEO of the Russian Direct Investment Fund (RDIF), Russia’s sovereign wealth fund; designated as a known Putin ally and a symbol of Russia’s kleptocracy.",
    "note": "CEO of the Russian Direct Investment Fund (RDIF), Russia’s sovereign wealth fund; designated as a known Putin ally and a symbol of Russia’s kleptocracy.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/jy0002",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0150",
    "lists": [
      "sanctions"
    ],
    "kind": "organisation",
    "name": "Belaruskali AAT",
    "aliases": [
      "Belaruskali",
      "Belarusian Potash Company"
    ],
    "country": "BY",
    "authority": "EU",
    "program": "EU restrictive measures — Belarus",
    "listingDate": "2021-06-21",
    "description": "Belarusian state-owned potash producer and major source of regime revenue; EU-listed in connection with the Lukashenko regime’s repression and the 2021 migration crisis.",
    "note": "Belarusian state-owned potash producer and major source of regime revenue; EU-listed in connection with the Lukashenko regime’s repression and the 2021 migration crisis.",
    "sourceUrl": "https://www.consilium.europa.eu/en/policies/sanctions-against-belarus/timeline-eu-sanctions-against-belarus/",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0151",
    "lists": [
      "sanctions"
    ],
    "kind": "organisation",
    "name": "Namchongang Trading Corporation",
    "aliases": [
      "NCG",
      "Namchongang Trading",
      "Korea Daeryonggang Trading Corporation"
    ],
    "country": "KP",
    "authority": "UN",
    "program": "UN 1718 (DPRK) Sanctions List",
    "listingDate": "2009-07-16",
    "description": "DPRK trading company subordinate to the General Bureau of Atomic Energy; listed for procurement supporting North Korea’s nuclear programme, including vacuum pumps found at a DPRK nuclear facility.",
    "note": "DPRK trading company subordinate to the General Bureau of Atomic Energy; listed for procurement supporting North Korea’s nuclear programme, including vacuum pumps found at a DPRK nuclear facility.",
    "sourceUrl": "https://main.un.org/securitycouncil/en/sanctions/1718/materials/summaries/entity/namchongang-trading-corporation",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0152",
    "lists": [
      "sanctions"
    ],
    "kind": "organisation",
    "name": "Ocean Maritime Management Company, Limited",
    "aliases": [
      "OMM",
      "Ocean Maritime Management"
    ],
    "country": "KP",
    "authority": "UN",
    "program": "UN 1718 (DPRK) Sanctions List",
    "listingDate": "2014-07-28",
    "description": "Operator/manager of the vessel Chong Chon Gang; listed for arranging a concealed shipment of arms and materiel from Cuba to the DPRK in July 2013.",
    "note": "Operator/manager of the vessel Chong Chon Gang; listed for arranging a concealed shipment of arms and materiel from Cuba to the DPRK in July 2013.",
    "sourceUrl": "https://main.un.org/securitycouncil/en/sanctions/1718/materials/summaries/entity/ocean-maritime-management-company,-limited-(omm)",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0153",
    "lists": [
      "sanctions",
      "pep"
    ],
    "kind": "person",
    "name": "Aleksandr Vasilyevich Bortnikov",
    "aliases": [
      "Alexander Bortnikov",
      "Aleksandr Bortnikov"
    ],
    "dob": "1951-11-15",
    "country": "RU",
    "authority": "OFAC",
    "program": "Russian Harmful Foreign Activities (E.O. 13661 / E.O. 13382)",
    "listingDate": "2021-03-02",
    "description": "Director of Russia’s Federal Security Service (FSB); designated as a senior Russian government official following the Novichok poisoning of Aleksey Navalny.",
    "note": "Director of Russia’s Federal Security Service (FSB); designated as a senior Russian government official following the Novichok poisoning of Aleksey Navalny.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/jy0045",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0154",
    "lists": [
      "sanctions"
    ],
    "kind": "vessel",
    "name": "NS Captain",
    "aliases": [
      "M/T NS Captain"
    ],
    "country": "RU",
    "authority": "OFAC",
    "program": "Russian Harmful Foreign Activities (E.O. 14024)",
    "listingDate": "2024-02-23",
    "description": "Crude-oil tanker identified as blocked property of Sovcomflot in the 23 February 2024 action against Russia’s state shipping fleet and oil-price-cap evasion.",
    "note": "Crude-oil tanker identified as blocked property of Sovcomflot in the 23 February 2024 action against Russia’s state shipping fleet and oil-price-cap evasion.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/jy2121",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0155",
    "lists": [
      "sanctions"
    ],
    "kind": "vessel",
    "name": "Chong Chon Gang",
    "aliases": [
      "Chong Chon Gang"
    ],
    "country": "KP",
    "authority": "OFAC",
    "program": "North Korea Sanctions (E.O. 13551)",
    "listingDate": "2016-03-02",
    "description": "DPRK cargo vessel operated by Ocean Maritime Management; interdicted in 2013 carrying concealed Cuban arms, and later blocked under the North Korea sanctions programme.",
    "note": "DPRK cargo vessel operated by Ocean Maritime Management; interdicted in 2013 carrying concealed Cuban arms, and later blocked under the North Korea sanctions programme.",
    "imo": "7937317",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/jl0364",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0156",
    "lists": [
      "sanctions",
      "pep"
    ],
    "kind": "person",
    "name": "Sergei Yevgenyevich Naryshkin",
    "aliases": [
      "Sergei Naryshkin",
      "Sergey Naryshkin"
    ],
    "dob": "1954-10-27",
    "country": "RU",
    "authority": "EU",
    "program": "EU restrictive measures — Russia (Ukraine territorial integrity)",
    "listingDate": "2014-03-17",
    "description": "Director of Russia’s Foreign Intelligence Service (SVR) and former State Duma chairman; EU-listed for actions undermining the territorial integrity of Ukraine.",
    "note": "Director of Russia’s Foreign Intelligence Service (SVR) and former State Duma chairman; EU-listed for actions undermining the territorial integrity of Ukraine.",
    "sourceUrl": "https://www.consilium.europa.eu/en/policies/sanctions/restrictive-measures-against-russia-over-ukraine/",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0157",
    "lists": [
      "sanctions",
      "pep"
    ],
    "kind": "person",
    "name": "Viktor Vasilyevich Zolotov",
    "aliases": [
      "Viktor Zolotov"
    ],
    "dob": "1954-01-27",
    "country": "RU",
    "authority": "OFAC",
    "program": "CAATSA / Russia-Related Sanctions",
    "listingDate": "2018-04-06",
    "description": "Director of the Russian National Guard (Rosgvardiya) and a close Putin associate; designated as a senior official of the Government of the Russian Federation.",
    "note": "Director of the Russian National Guard (Rosgvardiya) and a close Putin associate; designated as a senior official of the Government of the Russian Federation.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/sm0338",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0158",
    "lists": [
      "sanctions"
    ],
    "kind": "organisation",
    "name": "Aeroflot",
    "aliases": [
      "PJSC Aeroflot",
      "Aeroflot Russian Airlines"
    ],
    "country": "RU",
    "authority": "OFSI",
    "program": "UK Russia (Sanctions) (EU Exit) Regulations 2019",
    "listingDate": "2022-12-08",
    "description": "Russia’s flag carrier airline; added to the UK consolidated list and made subject to an asset freeze in connection with Russia’s invasion of Ukraine.",
    "note": "Russia’s flag carrier airline; added to the UK consolidated list and made subject to an asset freeze in connection with Russia’s invasion of Ukraine.",
    "sourceUrl": "https://www.gov.uk/government/publications/financial-sanctions-consolidated-list-of-targets/consolidated-list-of-targets",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0159",
    "lists": [
      "sanctions"
    ],
    "kind": "person",
    "name": "Arkady Romanovich Rotenberg",
    "aliases": [
      "Arkady Rotenberg"
    ],
    "dob": "1951-12-15",
    "country": "RU",
    "authority": "OFAC",
    "program": "Ukraine-/Russia-Related Sanctions (E.O. 13661)",
    "listingDate": "2014-03-20",
    "description": "Russian billionaire and close Putin associate who profited from large state contracts (Gazprom, Sochi Olympics); designated for materially assisting a senior Russian government official.",
    "note": "Russian billionaire and close Putin associate who profited from large state contracts (Gazprom, Sochi Olympics); designated for materially assisting a senior Russian government official.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/jl2369",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0160",
    "lists": [
      "sanctions"
    ],
    "kind": "person",
    "name": "Boris Romanovich Rotenberg",
    "aliases": [
      "Boris Rotenberg"
    ],
    "dob": "1957-01-03",
    "country": "RU",
    "authority": "OFAC",
    "program": "Ukraine-/Russia-Related Sanctions (E.O. 13661)",
    "listingDate": "2014-03-20",
    "description": "Russian billionaire and close Putin associate (co-owner of the SGM Group); designated for materially assisting a senior official of the Government of the Russian Federation.",
    "note": "Russian billionaire and close Putin associate (co-owner of the SGM Group); designated for materially assisting a senior official of the Government of the Russian Federation.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/jl2369",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0161",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "organisation",
    "name": "Los Zetas",
    "aliases": [
      "Cartel del Noreste",
      "Z",
      "The Zetas"
    ],
    "country": "MX",
    "authority": "OFAC",
    "program": "Foreign Narcotics Kingpin Designation Act",
    "listingDate": "2009-04-15",
    "description": "Extremely violent Mexican drug-trafficking organisation (later Cartel del Noreste); identified as a significant foreign narcotics trafficker under the Kingpin Act.",
    "note": "Extremely violent Mexican drug-trafficking organisation (later Cartel del Noreste); identified as a significant foreign narcotics trafficker under the Kingpin Act.",
    "sourceUrl": "https://ofac.treasury.gov/recent-actions/20150408",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0162",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "organisation",
    "name": "Gulf Cartel",
    "aliases": [
      "Cartel del Golfo",
      "CDG"
    ],
    "country": "MX",
    "authority": "OFAC",
    "program": "Counter-Narcotics (E.O. 14059)",
    "listingDate": "2021-12-15",
    "description": "Long-established Mexican drug-trafficking organisation; designated under E.O. 14059 for materially contributing to the international proliferation of illicit drugs.",
    "note": "Long-established Mexican drug-trafficking organisation; designated under E.O. 14059 for materially contributing to the international proliferation of illicit drugs.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/jy0535",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0163",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "person",
    "name": "Abu Musab al-Zarqawi",
    "aliases": [
      "Ahmad Fadil Nazzal al-Khalayleh",
      "Abu Musab al Zarqawi"
    ],
    "dob": "1966-10-30",
    "country": "JO",
    "authority": "UN",
    "program": "UN 1267 ISIL (Da’esh) & Al-Qaida Sanctions List",
    "listingDate": "2004-10-18",
    "description": "Jordanian militant who founded and led Jama’at al-Tawhid wal-Jihad / Al-Qaida in Iraq; listed as associated with Al-Qaida for terrorist attacks and beheadings in Iraq. (Historical designation; died 2006.)",
    "note": "Jordanian militant who founded and led Jama’at al-Tawhid wal-Jihad / Al-Qaida in Iraq; listed as associated with Al-Qaida for terrorist attacks and beheadings in Iraq. (Historical designation; died 2006.)",
    "sourceUrl": "https://main.un.org/securitycouncil/en/sanctions/1267/aq_sanctions_list/summaries/individual/abu-musab-al-zarqawi",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0164",
    "lists": [
      "sanctions"
    ],
    "kind": "organisation",
    "name": "al-Manar",
    "aliases": [
      "Al-Manar Television",
      "Al Manar"
    ],
    "country": "LB",
    "authority": "OFAC",
    "program": "Counter-Terrorism (E.O. 13224, SDGT)",
    "listingDate": "2006-03-23",
    "description": "Satellite television station owned and operated by Hizballah; designated as a Specially Designated Global Terrorist entity for supporting Hizballah’s activities and fundraising.",
    "note": "Satellite television station owned and operated by Hizballah; designated as a Specially Designated Global Terrorist entity for supporting Hizballah’s activities and fundraising.",
    "sourceUrl": "https://home.treasury.gov/news/press-releases/hp7",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0165",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "organisation",
    "name": "Islamic Jihad Union",
    "aliases": [
      "IJU",
      "Islamic Jihad Group"
    ],
    "country": "UZ",
    "authority": "UN",
    "program": "UN 1267 ISIL (Da’esh) & Al-Qaida Sanctions List",
    "listingDate": "2005-06-01",
    "description": "Central Asian militant group that split from the Islamic Movement of Uzbekistan; listed as associated with Al-Qaida for terrorist attacks, including bombings in Uzbekistan.",
    "note": "Central Asian militant group that split from the Islamic Movement of Uzbekistan; listed as associated with Al-Qaida for terrorist attacks, including bombings in Uzbekistan.",
    "sourceUrl": "https://main.un.org/securitycouncil/en/sanctions/1267/aq_sanctions_list/summaries/entity/islamic-jihad-group",
    "data_classification": "real-public-source"
  },
  {
    "id": "WL-0166",
    "lists": [
      "sanctions",
      "adverse-media"
    ],
    "kind": "organisation",
    "name": "Islamic Movement of Uzbekistan",
    "aliases": [
      "IMU"
    ],
    "country": "UZ",
    "authority": "UN",
    "program": "UN 1267 ISIL (Da’esh) & Al-Qaida Sanctions List",
    "listingDate": "2001-10-06",
    "description": "Uzbek militant group aligned with Al-Qaida and the Taliban; listed for terrorist activity across Central Asia and Afghanistan.",
    "note": "Uzbek militant group aligned with Al-Qaida and the Taliban; listed for terrorist activity across Central Asia and Afghanistan.",
    "sourceUrl": "https://main.un.org/securitycouncil/en/sanctions/1267/aq_sanctions_list/summaries/entity/islamic-movement-of-uzbekistan",
    "data_classification": "real-public-source"
  }
];

/** @type {Record<string, WatchlistEntry>} */
export const WATCHLIST_BY_ID = Object.fromEntries(WATCHLIST_ENTRIES.map((e) => [e.id, e]));

// ------------------------------------------------------------------
// META -- the standing disclaimer (shown on every screening result), the dataset
// snapshot date, the official sources, and a version stamp for provenance.
// ------------------------------------------------------------------

export const SCREENING_SNAPSHOT_DATE = "2026-07-06";

export const SCREENING_SOURCES = [
  {
    "authority": "OFAC",
    "label": "US Treasury OFAC -- Specially Designated Nationals (SDN) List",
    "url": "https://sanctionssearch.ofac.treas.gov/"
  },
  {
    "authority": "UN",
    "label": "UN Security Council Consolidated List",
    "url": "https://main.un.org/securitycouncil/en/content/un-sc-consolidated-list"
  },
  {
    "authority": "EU",
    "label": "EU Consolidated List of sanctions (EU Sanctions Map)",
    "url": "https://www.sanctionsmap.eu/"
  },
  {
    "authority": "OFSI",
    "label": "UK OFSI Consolidated List of Financial Sanctions Targets",
    "url": "https://www.gov.uk/government/publications/financial-sanctions-consolidated-list-of-targets"
  }
];

export const SCREENING_DISCLAIMER = "Screening & Watchlist matches a typed name / entity / wallet against a DATED, ILLUSTRATIVE SUBSET of REAL public sanctions lists (OFAC SDN, UN Security Council Consolidated List, EU Consolidated List, UK OFSI), captured on 2026-07-06. Every entry is a genuine public designation; the PEP and adverse-media tags sit on those same real sanctioned parties (nothing is fabricated). Sanctions lists change frequently (additions, amendments, delistings); this subset is for demonstration and is NOT complete or live. For any operational sanctions / PEP / adverse-media decision you MUST screen against the live official sources. This is NOT a sanctions-compliance system of record and is not legal advice. Matches are surfaced for review; a human disposition (confirm / false-positive) with a reason is always required.";

/** Count entries that belong to a given list code (membership, not exclusive). */
function countByList(code) { return WATCHLIST_ENTRIES.filter((e) => Array.isArray(e.lists) && e.lists.includes(code)).length; }

export const WATCHLIST_VERSION = {
  version: '3.0.0',
  snapshotDate: SCREENING_SNAPSHOT_DATE,
  researchedOn: SCREENING_SNAPSHOT_DATE,
  sourceKind: 'real-public-source',
  sources: SCREENING_SOURCES,
  entries: WATCHLIST_ENTRIES.length,
  listTypes: LIST_TYPES.length,
  // by-list is MEMBERSHIP: an entry counts toward every list in its `lists` array.
  byList: LIST_TYPES.reduce((m, l) => { m[l.code] = countByList(l.code); return m; }, /** @type {Record<string, number>} */({})),
  byAuthority: WATCHLIST_ENTRIES.reduce((m, e) => { m[e.authority] = (m[e.authority] || 0) + 1; return m; }, /** @type {Record<string, number>} */({})),
  byKind: WATCHLIST_ENTRIES.reduce((m, e) => { m[e.kind] = (m[e.kind] || 0) + 1; return m; }, /** @type {Record<string, number>} */({})),
};
