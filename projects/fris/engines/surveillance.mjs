// @ts-check
/**
 * Market-Abuse / Trade Surveillance — deterministic, EXPLAINABLE detectors over
 * the SYNTHETIC order book in `data/surveillance.mjs`. This is the suite's
 * "detector DNA": the detector LOGIC mirrors real, public MAR / Dodd-Frank / CEA
 * market-abuse typologies, while every datum it runs on is fabricated.
 *
 * Detectors (each pure, deterministic, and self-explaining):
 *   · detectInsiderDealing() — a trader on the insider list dealing an issuer
 *       inside the need-to-know window, ahead of a favourable announcement.
 *   · detectSpoofing()       — large orders placed then cancelled (unfilled) that
 *       skew one side of the book, with a genuine fill captured on the other side.
 *   · detectWashTrades()     — self-matching / circular trades between related
 *       accounts (same beneficial cluster) creating volume with no economic change.
 *
 * Aggregation / detail / reference readers:
 *   · alerts({type,severity}) — the filterable alert queue (all detectors, ranked).
 *   · alert(id)               — one alert + its ORDERED evidence timeline and the
 *       insider-list cross-check hit.
 *   · orderBook({instrument}) — the order/execution slice for the micro-viz.
 *   · insiderList()           — the fictional insider list (with derived windows).
 *
 * Every alert carries: id, type, severity (High/Med/Low — colour + label + the
 * reasons that set it), subjects (fictional trader/account/desk), instrument,
 * window, a plain-English explanation, an ORDERED evidence array (timestamped
 * events) and an insider-list cross-check result.
 *
 * ── Honesty ──────────────────────────────────────────────────────────────────
 * All subjects are fictional; the alerts are illustrative demonstration output,
 * NOT factual accusations. See SURVEILLANCE_DISCLAIMER. The detectors read ONLY
 * the observable order/execution fields (never the ground-truth `tag`), so a
 * detector firing is genuine signal, not a lookup of the planted label.
 *
 * ── Determinism ──────────────────────────────────────────────────────────────
 * Pure functions over the frozen synthetic book. Same book → same alerts,
 * byte-for-byte, with a stable id tiebreak on every ordering. No Date.now(), no
 * randomness, no network, no dependencies.
 */

import {
  ORDERS, EXECUTIONS, INSTRUMENTS, INSTRUMENT_BY_SYMBOL, TRADER_BY_ID, ACCOUNT_BY_ID,
  DESKS, ANNOUNCEMENTS, ANNOUNCEMENT_BY_ID, INSIDER_LIST,
  SURV_VENUE, SURVEILLANCE_DISCLAIMER, SURVEILLANCE_VERSION,
} from '../data/surveillance.mjs';

const DESK_BY_ID = Object.fromEntries(DESKS.map((d) => [d.id, d]));

// ── Severity vocabulary (colour ALWAYS paired with a label; mirrors the UI) ────
export const SEVERITIES = Object.freeze([
  { code: 'High', label: 'High', color: '#d5303e', rank: 3 },
  { code: 'Medium', label: 'Medium', color: '#e0a52b', rank: 2 },
  { code: 'Low', label: 'Low', color: '#4d8df0', rank: 1 },
]);
export const SEVERITY_BY_CODE = Object.freeze(Object.fromEntries(SEVERITIES.map((s) => [s.code, s])));
const SEV_RANK = { High: 3, Medium: 2, Low: 1 };

// ── Detector-type vocabulary (the three typologies) ───────────────────────────
export const ALERT_TYPES = Object.freeze([
  { code: 'insider-dealing', label: 'Insider dealing', color: '#a97bf0', blurb: 'Dealing an issuer while on the insider list, inside the need-to-know window, ahead of a price-sensitive announcement.', typology: 'MAR Art. 8 / 14 · insider dealing' },
  { code: 'spoofing', label: 'Spoofing / layering', color: '#e0a52b', blurb: 'Entering large non-bona-fide orders then cancelling them to move the price, while trading genuinely on the opposite side.', typology: 'MAR Art. 12 · Dodd-Frank §747 (CEA) · spoofing' },
  { code: 'wash-trading', label: 'Wash trading', color: '#4d8df0', blurb: 'Self-matching / circular trades between related accounts that create volume with no change in beneficial ownership.', typology: 'MAR Art. 12 · CEA · wash trading' },
]);
export const ALERT_TYPE_BY_CODE = Object.freeze(Object.fromEntries(ALERT_TYPES.map((t) => [t.code, t])));

// ── Small pure helpers ────────────────────────────────────────────────────────
const secToHms = (sec) => {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};
const traderRef = (id) => { const t = TRADER_BY_ID[id]; return t ? { id, name: t.name, desk: t.desk, deskLabel: (DESK_BY_ID[t.desk] || {}).label || t.desk } : { id, name: id, desk: null, deskLabel: null }; };
const accountRef = (id) => { const a = ACCOUNT_BY_ID[id]; return a ? { id, label: a.label, trader: a.trader, cluster: a.cluster } : { id, label: id, trader: null, cluster: null }; };
function instrumentRef(symbol) { const i = INSTRUMENT_BY_SYMBOL[symbol]; return i ? { symbol, issuer: i.issuer, sector: i.sector, currency: i.currency } : { symbol, issuer: symbol, sector: null, currency: null }; }
const ordersFor = (symbol) => ORDERS.filter((o) => o.symbol === symbol);
const execsFor = (symbol) => EXECUTIONS.filter((e) => e.symbol === symbol);
// Median (deterministic, integer-stable on numbers).
function median(nums) {
  if (!nums.length) return 0;
  const s = nums.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function round(n, dp = 2) { const f = 10 ** dp; return Math.round(n * f) / f; }

// Build one evidence event. `sec` drives the ordering; kind is a small vocabulary
// the UI renders with an icon/colour; text is the plain-English line.
function ev(sec, kind, text, ref) { return { sec, time: secToHms(sec), kind, text, ref: ref || null }; }

// ─────────────────────────────────────────────────────────────────────────────
// DETECTOR 1 — Insider dealing
// ─────────────────────────────────────────────────────────────────────────────
// Logic (mirrors MAR insider-dealing typology): for each insider-list entry, look
// at that trader's dealing in that issuer DURING the need-to-know window and BEFORE
// the announcement. If they took a directional position CONSISTENT with the
// announcement's favourable direction (net buying ahead of an up-move; net selling
// ahead of a down-move), with size that is unusual versus the instrument's typical
// order size, raise an alert. Reads only observable fields; the insider list is a
// legitimate surveillance input (it exists precisely to run this cross-check).
export function detectInsiderDealing() {
  const alerts = [];
  for (const entry of INSIDER_LIST) {
    const ann = ANNOUNCEMENT_BY_ID[entry.announcementId];
    if (!ann) continue;
    const inst = INSTRUMENT_BY_SYMBOL[entry.symbol];
    // Trader's own executions in this issuer, inside the window, pre-announcement.
    const preExecs = execsFor(entry.symbol).filter((e) => e.sec >= entry.windowOpenSec && e.sec < ann.announceSec && (e.buyTraderId === entry.traderId || e.sellTraderId === entry.traderId));
    if (!preExecs.length) continue; // on the list but didn't deal → correctly no alert
    // Net signed position the trader took (buys +, sells −).
    let netQty = 0; let grossQty = 0;
    for (const e of preExecs) {
      const signedBuy = e.buyTraderId === entry.traderId ? e.qty : 0;
      const signedSell = e.sellTraderId === entry.traderId ? e.qty : 0;
      netQty += signedBuy - signedSell;
      grossQty += signedBuy + signedSell;
    }
    const directionConsistent = (ann.direction === 'up' && netQty > 0) || (ann.direction === 'down' && netQty < 0);
    if (!directionConsistent) continue; // positioned against the news → not the pattern
    // Size unusualness: compare the trader's largest pre-announcement print to the
    // instrument's typical (median) executed size across the day.
    const typical = Math.max(1, median(execsFor(entry.symbol).map((e) => e.qty)));
    const biggest = Math.max(...preExecs.map((e) => e.qty));
    const sizeRatio = biggest / typical;
    // Timing proximity: minutes from the LAST pre-announcement fill to publication.
    const lastSec = Math.max(...preExecs.map((e) => e.sec));
    const minsBefore = Math.round((ann.announceSec - lastSec) / 60);

    // Severity banding (deterministic thresholds, with the reasons that set it).
    const reasons = [];
    reasons.push(`Trader is on the insider list for "${ann.label}" (window ${secToHms(entry.windowOpenSec)}–${secToHms(entry.windowCloseSec)}).`);
    reasons.push(`Dealt ${directionLabel(ann.direction, netQty)} inside the window, consistent with the favourable move.`);
    if (sizeRatio >= 2) reasons.push(`Position size is ${round(sizeRatio, 1)}× the instrument's typical trade size — conspicuous.`);
    if (minsBefore <= 60) reasons.push(`Last accumulation was ${minsBefore} min before publication.`);
    let severity = 'Low';
    if (sizeRatio >= 3 && minsBefore <= 120) severity = 'High';
    else if (sizeRatio >= 2 || minsBefore <= 60) severity = 'Medium';

    // Evidence timeline (ordered): window opens → each pre-announcement fill →
    // announcement → the price move.
    const evidence = [];
    evidence.push(ev(entry.windowOpenSec, 'window', `Insider-list window opens for ${entry.person} (${entry.role}) on ${entry.symbol}.`, { insiderId: entry.id }));
    for (const e of preExecs.slice().sort((a, b) => a.sec - b.sec)) {
      const side = e.buyTraderId === entry.traderId ? 'BUY' : 'SELL';
      evidence.push(ev(e.sec, 'trade', `${side} ${e.qty.toLocaleString()} ${e.symbol} @ ${e.price} (${e.id}) via ${e.buyTraderId === entry.traderId ? e.buyAccountId : e.sellAccountId}.`, { tradeId: e.id }));
    }
    evidence.push(ev(ann.announceSec, 'announcement', `Price-sensitive announcement published: "${ann.label}" (${ann.direction === 'up' ? 'favourable' : 'adverse'}, ~${Math.round(ann.magnitudePct * 100)}%).`, { announcementId: ann.id }));
    const postPx = round(inst.refPrice * (1 + (ann.direction === 'up' ? ann.magnitudePct : -ann.magnitudePct)), 2);
    evidence.push(ev(ann.announceSec + 30, 'price', `${entry.symbol} ${ann.direction === 'up' ? 'gaps up' : 'gaps down'} to ~${postPx} after publication.`, null));
    evidence.sort((a, b) => a.sec - b.sec);

    const subjects = [traderRefWithKind(entry.traderId, 'trader')];
    const window = { openSec: entry.windowOpenSec, closeSec: ann.announceSec, open: secToHms(entry.windowOpenSec), close: secToHms(ann.announceSec), label: `Need-to-know window (pre-announcement)` };
    alerts.push({
      id: `SURV-ID-${entry.id}`,
      type: 'insider-dealing',
      severity,
      subjects,
      instrument: instrumentRef(entry.symbol),
      window,
      explanation: `${entry.person} (${entry.traderId}, ${(DESK_BY_ID[(TRADER_BY_ID[entry.traderId] || {}).desk] || {}).label || 'desk'}) is on the insider list for the ${entry.symbol} announcement "${ann.label}" and dealt ${directionLabel(ann.direction, netQty)} inside the need-to-know window, ${minsBefore} minutes before publication and before the price moved ~${Math.round(ann.magnitudePct * 100)}% in their favour. The accumulation (largest fill ${biggest.toLocaleString()} shares, ${round(sizeRatio, 1)}× the instrument's typical size) is consistent with trading on inside information.`,
      reasons,
      metrics: { netQty, grossQty, biggest, typical, sizeRatio: round(sizeRatio, 2), minutesBeforeAnnouncement: minsBefore },
      insiderCrossCheck: {
        hit: true,
        insiderId: entry.id,
        person: entry.person,
        role: entry.role,
        announcementId: ann.id,
        announcement: ann.label,
        windowOpen: secToHms(entry.windowOpenSec),
        windowClose: secToHms(entry.windowCloseSec),
        note: entry.note,
        summary: `${entry.person} appears on the insider list for "${ann.label}" with a need-to-know window of ${secToHms(entry.windowOpenSec)}–${secToHms(entry.windowCloseSec)}; the flagged dealing falls inside it.`,
      },
      evidence,
    });
  }
  return sortAlerts(alerts);
}

// ─────────────────────────────────────────────────────────────────────────────
// DETECTOR 2 — Spoofing / layering
// ─────────────────────────────────────────────────────────────────────────────
// Logic (mirrors MAR Art. 12 / Dodd-Frank §747): find bursts where one trader/
// account entered SEVERAL large orders on the SAME side that were CANCELLED without
// filling within a short lifetime, skewing that side of the book, AND obtained a
// GENUINE fill on the OPPOSITE side during the same burst. Non-bona-fide layering
// to move price + a real trade on the other side = spoofing. Reads only observable
// order state / lifetimes / sizes.
export function detectSpoofing() {
  const alerts = [];
  for (const inst of INSTRUMENTS) {
    const symbol = inst.symbol;
    const orders = ordersFor(symbol);
    if (!orders.length) continue;
    const typicalQty = Math.max(1, median(orders.map((o) => o.qty)));
    // Candidate layer orders: cancelled, unfilled, large (>= 2× typical), short-lived.
    const layers = orders.filter((o) => o.state === 'cancelled' && o.filledQty === 0 && o.cancelSec != null && o.qty >= 2 * typicalQty && (o.cancelSec - o.sec) <= 60);
    if (layers.length < 3) continue; // layering implies several stacked orders
    // Group by account + side (a layering campaign is one account stacking one side).
    const groups = new Map();
    for (const o of layers) {
      const key = `${o.accountId}|${o.side}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(o);
    }
    for (const [key, grp] of groups) {
      if (grp.length < 3) continue;
      const [accountId, layerSide] = key.split('|');
      const oppSide = layerSide === 'sell' ? 'buy' : 'sell';
      const startSec = Math.min(...grp.map((o) => o.sec));
      const endSec = Math.max(...grp.map((o) => o.cancelSec));
      // Genuine opposite-side fill by the SAME account within the burst window.
      const genuine = execsFor(symbol).filter((e) => {
        const acct = oppSide === 'buy' ? e.buyAccountId : e.sellAccountId;
        return acct === accountId && e.sec >= startSec - 5 && e.sec <= endSec + 5;
      });
      if (!genuine.length) continue; // layers alone, no benefitting fill → don't flag
      const layeredQty = grp.reduce((a, o) => a + o.qty, 0);
      const filledQty = genuine.reduce((a, e) => a + e.qty, 0);
      const avgLifetime = Math.round(grp.reduce((a, o) => a + (o.cancelSec - o.sec), 0) / grp.length);
      const sizeRatio = Math.max(...grp.map((o) => o.qty)) / typicalQty;
      const imbalance = round(layeredQty / Math.max(1, filledQty), 2); // how much phantom size vs the real fill

      const reasons = [];
      reasons.push(`${grp.length} large ${layerSide.toUpperCase()} orders (${layeredQty.toLocaleString()} shares) entered and cancelled unfilled within ~${avgLifetime}s.`);
      reasons.push(`Largest layer is ${round(sizeRatio, 1)}× the instrument's typical order size.`);
      reasons.push(`A genuine ${oppSide.toUpperCase()} fill (${filledQty.toLocaleString()} shares) landed on the opposite side during the burst.`);
      reasons.push(`Phantom-to-real size ratio ~${imbalance}× — the cancelled side dwarfs the executed side.`);
      let severity = 'Low';
      if (grp.length >= 5 && sizeRatio >= 3 && avgLifetime <= 20) severity = 'High';
      else if (grp.length >= 4 || sizeRatio >= 2.5) severity = 'Medium';

      // Evidence (ordered): each layer placement, the genuine fill, each cancellation.
      const evidence = [];
      for (const o of grp.slice().sort((a, b) => a.sec - b.sec)) {
        evidence.push(ev(o.sec, 'order-place', `Place ${layerSide.toUpperCase()} ${o.qty.toLocaleString()} ${symbol} @ ${o.price} (${o.id}) — large, non-bona-fide.`, { orderId: o.id }));
      }
      for (const e of genuine.slice().sort((a, b) => a.sec - b.sec)) {
        evidence.push(ev(e.sec, 'trade', `Genuine ${oppSide.toUpperCase()} fill ${e.qty.toLocaleString()} ${symbol} @ ${e.price} (${e.id}) on the opposite side.`, { tradeId: e.id }));
      }
      for (const o of grp.slice().sort((a, b) => a.cancelSec - b.cancelSec)) {
        evidence.push(ev(o.cancelSec, 'order-cancel', `Cancel ${o.id} (${layerSide.toUpperCase()} ${o.qty.toLocaleString()} @ ${o.price}) unfilled after ${o.cancelSec - o.sec}s.`, { orderId: o.id }));
      }
      evidence.sort((a, b) => a.sec - b.sec || cancelKindOrder(a.kind) - cancelKindOrder(b.kind));

      const acct = accountRef(accountId);
      const subjects = [traderRefWithKind(acct.trader, 'trader'), { kind: 'account', id: accountId, label: acct.label, cluster: acct.cluster }];
      const window = { openSec: startSec, closeSec: endSec, open: secToHms(startSec), close: secToHms(endSec), label: 'Layering burst' };
      alerts.push({
        id: `SURV-SP-${symbol}-${accountId}`,
        type: 'spoofing',
        severity,
        subjects,
        instrument: instrumentRef(symbol),
        window,
        explanation: `Account ${acct.label} (${accountId}${acct.trader ? ', trader ' + (TRADER_BY_ID[acct.trader] ? TRADER_BY_ID[acct.trader].name : acct.trader) : ''}) stacked ${grp.length} large ${layerSide} orders totalling ${layeredQty.toLocaleString()} shares just off the touch in ${symbol}, then cancelled all of them unfilled within ~${avgLifetime}s — while taking a genuine ${oppSide} fill of ${filledQty.toLocaleString()} shares on the opposite side. Entering non-bona-fide orders to create false pressure and benefiting on the other side is the spoofing / layering pattern.`,
        reasons,
        metrics: { layerCount: grp.length, layeredQty, filledQty, avgLifetimeSec: avgLifetime, sizeRatio: round(sizeRatio, 2), phantomToRealRatio: imbalance, layerSide, genuineSide: oppSide },
        insiderCrossCheck: { hit: false, note: 'Spoofing is an order-book manipulation typology; no insider-list cross-check applies.' },
        evidence,
      });
    }
  }
  return sortAlerts(alerts);
}
// Within the same second, order placements sort before fills before cancels.
function cancelKindOrder(kind) { return kind === 'order-place' ? 0 : kind === 'trade' ? 1 : kind === 'order-cancel' ? 2 : 1; }

// ─────────────────────────────────────────────────────────────────────────────
// DETECTOR 3 — Wash trading
// ─────────────────────────────────────────────────────────────────────────────
// Logic (mirrors MAR / CEA wash-trade typology): find executions that are
// SELF-MATCHES — the buy and sell sides resolve to the SAME beneficial owner (same
// account cluster, or the same trader across their own accounts). A repeated series
// of such prints at a stable price creates volume with no change in beneficial
// ownership. Reads only observable account/cluster linkage on the executed trades.
export function detectWashTrades() {
  const alerts = [];
  // Group self-matching executions by (symbol, beneficial cluster).
  const groups = new Map();
  for (const e of EXECUTIONS) {
    const buyA = ACCOUNT_BY_ID[e.buyAccountId];
    const sellA = ACCOUNT_BY_ID[e.sellAccountId];
    if (!buyA || !sellA) continue;
    // Self-match if both accounts share a beneficial cluster (or the same trader).
    const sameCluster = buyA.cluster && sellA.cluster && buyA.cluster === sellA.cluster;
    const sameTrader = e.buyTraderId && e.sellTraderId && e.buyTraderId === e.sellTraderId;
    if (!(sameCluster || sameTrader)) continue;
    const cluster = buyA.cluster || sellA.cluster || `T:${e.buyTraderId}`;
    const key = `${e.symbol}|${cluster}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  for (const [key, grp] of groups) {
    if (grp.length < 3) continue; // a one-off could be incidental; a series is wash
    const [symbol, cluster] = key.split('|');
    const accounts = [...new Set(grp.flatMap((e) => [e.buyAccountId, e.sellAccountId]))].sort();
    const traders = [...new Set(grp.flatMap((e) => [e.buyTraderId, e.sellTraderId]))].sort();
    const totalQty = grp.reduce((a, e) => a + e.qty, 0);
    const startSec = Math.min(...grp.map((e) => e.sec));
    const endSec = Math.max(...grp.map((e) => e.sec));
    const spanMin = Math.round((endSec - startSec) / 60);
    const prices = grp.map((e) => e.price);
    const priceStable = Math.max(...prices) - Math.min(...prices) <= (INSTRUMENT_BY_SYMBOL[symbol] ? INSTRUMENT_BY_SYMBOL[symbol].tick * 2 : 0.02);
    // Circularity: prints alternate direction between the same two accounts.
    const circular = accounts.length >= 2;

    const reasons = [];
    reasons.push(`${grp.length} self-matching prints (${totalQty.toLocaleString()} shares) between related accounts ${accounts.join(' ↔ ')} in the same beneficial cluster (${cluster}).`);
    reasons.push(`Buy and sell sides resolve to the same beneficial owner — no change in ownership.`);
    if (priceStable) reasons.push(`Executed at a stable price (~${prices[0]}) — volume without price discovery.`);
    if (circular) reasons.push(`Trades circulate between the same two accounts.`);
    let severity = 'Low';
    if (grp.length >= 5 && priceStable && circular) severity = 'High';
    else if (grp.length >= 4 || (priceStable && circular)) severity = 'Medium';

    const evidence = grp.slice().sort((a, b) => a.sec - b.sec).map((e) => ev(e.sec, 'wash-trade', `Self-match: ${e.buyAccountId} BUY ↔ ${e.sellAccountId} SELL ${e.qty.toLocaleString()} ${symbol} @ ${e.price} (${e.id}).`, { tradeId: e.id }));

    const subjectAccounts = accounts.map((a) => { const ar = accountRef(a); return { kind: 'account', id: a, label: ar.label, cluster: ar.cluster }; });
    const subjectTraders = traders.map((t) => traderRefWithKind(t, 'trader'));
    const window = { openSec: startSec, closeSec: endSec, open: secToHms(startSec), close: secToHms(endSec), label: 'Self-matching series' };
    alerts.push({
      id: `SURV-WT-${symbol}-${cluster}`,
      type: 'wash-trading',
      severity,
      subjects: [...subjectTraders, ...subjectAccounts],
      instrument: instrumentRef(symbol),
      window,
      explanation: `${grp.length} trades in ${symbol} matched buy-side against sell-side within the SAME beneficial cluster (${cluster}: accounts ${accounts.join(', ')}), moving ${totalQty.toLocaleString()} shares round-trip over ~${spanMin} min at a ${priceStable ? 'stable' : 'moving'} price. Because both sides share a beneficial owner, ownership never changes — the activity manufactures volume, the hallmark of wash trading.`,
      reasons,
      metrics: { tradeCount: grp.length, totalQty, spanMinutes: spanMin, priceStable, circular, accounts, traders, cluster },
      insiderCrossCheck: { hit: false, note: 'Wash trading is a volume-manipulation typology; no insider-list cross-check applies.' },
      evidence,
    });
  }
  return sortAlerts(alerts);
}

// ── Ordering: High→Low severity, then type, then id (byte-stable) ─────────────
function sortAlerts(alerts) {
  return alerts.slice().sort((a, b) => (SEV_RANK[b.severity] - SEV_RANK[a.severity]) || String(a.type).localeCompare(String(b.type)) || String(a.id).localeCompare(String(b.id)));
}
function directionLabel(dir, netQty) {
  const q = Math.abs(netQty).toLocaleString();
  return dir === 'up' ? `net long ${q} shares (buying)` : `net short ${q} shares (selling)`;
}
function traderRefWithKind(id, kind) { const r = traderRef(id); return { kind, id: r.id, name: r.name, desk: r.desk, deskLabel: r.deskLabel }; }

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: aggregation, detail, order book, insider list
// ─────────────────────────────────────────────────────────────────────────────

// Run all detectors once and cache within a call scope. (Pure; no module state.)
function allAlertsRaw() {
  return sortAlerts([...detectInsiderDealing(), ...detectSpoofing(), ...detectWashTrades()]);
}

/**
 * The filterable alert queue across all three detectors, ranked High→Low.
 * @param {{ type?:string, severity?:string, instrument?:string, q?:string }} [opts]
 */
export function alerts(opts = {}) {
  const f = opts || {};
  let rows = allAlertsRaw();
  if (f.type && ALERT_TYPE_BY_CODE[f.type]) rows = rows.filter((a) => a.type === f.type);
  if (f.severity && SEVERITY_BY_CODE[f.severity]) rows = rows.filter((a) => a.severity === f.severity);
  if (f.instrument) rows = rows.filter((a) => a.instrument.symbol === f.instrument);
  if (f.q) {
    const q = String(f.q).toLowerCase();
    rows = rows.filter((a) => `${a.id} ${a.type} ${a.instrument.symbol} ${a.instrument.issuer} ${a.explanation} ${a.subjects.map((s) => `${s.id} ${s.name || s.label || ''}`).join(' ')}`.toLowerCase().includes(q));
  }
  // Compact list rows (the detail carries the full evidence timeline).
  const list = rows.map((a) => ({
    id: a.id,
    type: a.type,
    typeLabel: ALERT_TYPE_BY_CODE[a.type].label,
    typeColor: ALERT_TYPE_BY_CODE[a.type].color,
    severity: a.severity,
    severityColor: SEVERITY_BY_CODE[a.severity].color,
    instrument: a.instrument,
    window: a.window,
    subjects: a.subjects,
    subjectSummary: subjectSummary(a.subjects),
    insiderHit: !!(a.insiderCrossCheck && a.insiderCrossCheck.hit),
    headline: a.explanation.length > 180 ? a.explanation.slice(0, 177) + '…' : a.explanation,
    evidenceCount: a.evidence.length,
  }));
  return {
    alerts: list,
    total: allAlertsRaw().length,
    count: list.length,
    filter: { type: f.type || null, severity: f.severity || null, instrument: f.instrument || null, q: f.q || null },
    types: ALERT_TYPES.map((t) => ({ code: t.code, label: t.label, color: t.color, blurb: t.blurb, typology: t.typology })),
    severities: SEVERITIES.map((s) => ({ code: s.code, label: s.label, color: s.color })),
    instruments: INSTRUMENTS.map((i) => ({ symbol: i.symbol, issuer: i.issuer, sector: i.sector, currency: i.currency })),
    summary: summarise(allAlertsRaw()),
    venue: SURV_VENUE,
    disclaimer: SURVEILLANCE_DISCLAIMER,
    version: SURVEILLANCE_VERSION,
  };
}

function subjectSummary(subjects) {
  const names = subjects.filter((s) => s.kind === 'trader').map((s) => s.name || s.id);
  const accts = subjects.filter((s) => s.kind === 'account').map((s) => s.id);
  const parts = [];
  if (names.length) parts.push(names.join(', '));
  if (accts.length) parts.push(accts.join(' ↔ '));
  return parts.join(' · ') || subjects.map((s) => s.id).join(', ');
}

// KPI rollup: counts by type + by severity + insider-cross-check hits.
function summarise(rows) {
  const byType = ALERT_TYPES.map((t) => ({ code: t.code, label: t.label, color: t.color, count: rows.filter((a) => a.type === t.code).length }));
  const bySeverity = SEVERITIES.map((s) => ({ code: s.code, label: s.label, color: s.color, count: rows.filter((a) => a.severity === s.code).length }));
  const instrumentsFlagged = [...new Set(rows.map((a) => a.instrument.symbol))].sort();
  return {
    total: rows.length,
    byType,
    bySeverity,
    high: rows.filter((a) => a.severity === 'High').length,
    insiderHits: rows.filter((a) => a.insiderCrossCheck && a.insiderCrossCheck.hit).length,
    instrumentsFlagged,
  };
}

/**
 * One alert by id, with its full ORDERED evidence timeline and the insider-list
 * cross-check. Returns null when the id is unknown.
 * @param {string} id
 */
export function alert(id) {
  const found = allAlertsRaw().find((a) => a.id === id);
  if (!found) return null;
  const t = ALERT_TYPE_BY_CODE[found.type];
  const sev = SEVERITY_BY_CODE[found.severity];
  // Return a copy with derived labels the UI reads; evidence is already ordered.
  return {
    alert: {
      ...found,
      typeLabel: t.label,
      typeColor: t.color,
      typology: t.typology,
      severityLabel: sev.label,
      severityColor: sev.color,
      subjectSummary: subjectSummary(found.subjects),
      // guarantee ordering (defensive; already sorted in each detector)
      evidence: found.evidence.slice().sort((a, b) => a.sec - b.sec),
    },
    disclaimer: SURVEILLANCE_DISCLAIMER,
    version: SURVEILLANCE_VERSION,
  };
}

/**
 * The order-book / execution slice for an instrument (for the micro-viz). Returns
 * the raw orders (incl. placed-then-cancelled ones for the spoofing view) and the
 * executions, plus the reference price and a compact per-side aggregate.
 * @param {{ instrument?:string }} [opts]
 */
export function orderBook(opts = {}) {
  const symbol = opts && opts.instrument ? opts.instrument : INSTRUMENTS[0].symbol;
  const inst = INSTRUMENT_BY_SYMBOL[symbol];
  if (!inst) return null;
  const orders = ordersFor(symbol).map((o) => ({ id: o.id, sec: o.sec, time: secToHms(o.sec), side: o.side, price: o.price, qty: o.qty, state: o.state, filledQty: o.filledQty, cancelSec: o.cancelSec, cancelTime: o.cancelSec != null ? secToHms(o.cancelSec) : null, traderId: o.traderId, accountId: o.accountId }));
  const executions = execsFor(symbol).map((e) => ({ id: e.id, sec: e.sec, time: secToHms(e.sec), price: e.price, qty: e.qty, buyAccountId: e.buyAccountId, sellAccountId: e.sellAccountId, buyTraderId: e.buyTraderId, sellTraderId: e.sellTraderId }));
  const cancelled = orders.filter((o) => o.state === 'cancelled');
  const filled = orders.filter((o) => o.state === 'filled');
  return {
    instrument: instrumentRef(symbol),
    refPrice: inst.refPrice,
    tick: inst.tick,
    orders,
    executions,
    aggregate: {
      orderCount: orders.length,
      executionCount: executions.length,
      cancelledCount: cancelled.length,
      filledCount: filled.length,
      cancelledQty: cancelled.reduce((a, o) => a + o.qty, 0),
      executedQty: executions.reduce((a, e) => a + e.qty, 0),
      priceMin: Math.min(...orders.map((o) => o.price), inst.refPrice),
      priceMax: Math.max(...orders.map((o) => o.price), inst.refPrice),
      secMin: Math.min(...orders.map((o) => o.sec)),
      secMax: Math.max(...orders.map((o) => o.cancelSec != null ? o.cancelSec : o.sec)),
    },
    venue: SURV_VENUE,
    disclaimer: SURVEILLANCE_DISCLAIMER,
    version: SURVEILLANCE_VERSION,
  };
}

/**
 * The fictional insider list, each entry with its derived need-to-know window and
 * a flag for whether that person's dealing raised an insider-dealing alert (so the
 * cross-check is legible from the list side too).
 */
export function insiderList() {
  const idAlerts = detectInsiderDealing();
  const flaggedInsiderIds = new Set(idAlerts.map((a) => a.insiderCrossCheck && a.insiderCrossCheck.insiderId).filter(Boolean));
  const rows = INSIDER_LIST.map((e) => {
    const ann = ANNOUNCEMENT_BY_ID[e.announcementId];
    return {
      id: e.id,
      traderId: e.traderId,
      person: e.person,
      trader: TRADER_BY_ID[e.traderId] ? { id: e.traderId, name: TRADER_BY_ID[e.traderId].name, desk: TRADER_BY_ID[e.traderId].desk } : { id: e.traderId, name: e.traderId },
      role: e.role,
      symbol: e.symbol,
      instrument: instrumentRef(e.symbol),
      announcementId: e.announcementId,
      announcement: ann ? ann.label : e.announcementId,
      direction: ann ? ann.direction : null,
      windowOpen: secToHms(e.windowOpenSec),
      windowClose: secToHms(e.windowCloseSec),
      note: e.note,
      raisedAlert: flaggedInsiderIds.has(e.id),
      alertId: flaggedInsiderIds.has(e.id) ? `SURV-ID-${e.id}` : null,
    };
  });
  return {
    insiders: rows,
    announcements: ANNOUNCEMENTS.map((a) => ({ id: a.id, symbol: a.symbol, label: a.label, direction: a.direction, magnitudePct: a.magnitudePct, announceTime: secToHms(a.announceSec) })),
    total: rows.length,
    flagged: rows.filter((r) => r.raisedAlert).length,
    venue: SURV_VENUE,
    disclaimer: SURVEILLANCE_DISCLAIMER,
    version: SURVEILLANCE_VERSION,
  };
}

// ── Meta re-exports the routes / UI consume ───────────────────────────────────
export {
  INSTRUMENTS, INSTRUMENT_BY_SYMBOL, ANNOUNCEMENTS, INSIDER_LIST,
  SURV_VENUE, SURVEILLANCE_DISCLAIMER, SURVEILLANCE_VERSION,
};
