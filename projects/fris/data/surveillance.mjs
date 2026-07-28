// @ts-check
/**
 * Market-Abuse / Trade Surveillance — the SYNTHETIC data layer the surveillance
 * engine (`engines/surveillance.mjs`) reads. Built in the exact idiom of the other
 * FRIS data modules (`vendors.mjs` / `enforcement.mjs` / `countryRisk.mjs`): a
 * pure, framework-free, deterministic module importable by BOTH the Node server
 * and the browser build, with ZERO DB dependency (no seed, no schema, no
 * data.json regeneration risk).
 *
 * ── DATA-HONESTY POSTURE (read this) ─────────────────────────────────────────
 * EVERYTHING here is 100% SYNTHETIC and deterministic — a FICTIONAL order book on
 * a fictional venue, FICTIONAL trader/desk IDs, FICTIONAL instruments/issuers, a
 * FICTIONAL insider list and FICTIONAL price-sensitive announcements. No real
 * person and no real listed company is a subject of any (fictional) market-abuse
 * scenario — that would be defamation. The issuers reuse FRIS's existing fictional
 * "Nexus" naming family so the suite cross-links, but they are invented.
 *
 * The DETECTOR LOGIC in the engine mirrors real, public MAR / Dodd-Frank / CEA
 * typologies (insider dealing, spoofing/layering, wash trading) — that methodology
 * is legitimate and public. But every DATUM below is fabricated. This is a
 * demonstration order book with planted, labelled abuse scenarios so the detectors
 * have real signal to find; it is NOT a real trade-surveillance feed.
 *
 * ── Determinism ──────────────────────────────────────────────────────────────
 * Every timestamp, price, quantity and id is generated from a fixed PRNG seed via
 * the shared `Rng` (engines/prng.mjs). Same module → same book, byte-for-byte. No
 * Date.now(), no Math.random, no network, no dependencies beyond the PRNG.
 *
 * The exported book is FROZEN and pre-computed once at module load, so importing
 * it many times never re-runs the generator or diverges.
 */

import { Rng } from '../engines/prng.mjs';

/* eslint-disable max-len */

// ── Fixed generation constants (the "seed of everything") ─────────────────────
export const SURV_SEED = 'FRIS-SURVEILLANCE-2026';   // the single fixed PRNG seed
export const SURV_VENUE = 'NEXUS-MTF';                // fictional multilateral trading facility
const BASE_DAY = '2026-05-18';                        // the fictional trading day (a Monday)

// A fictional venue clock. All order timestamps are on BASE_DAY between 08:00 and
// 16:30 (a stylised continuous-trading session). We work in whole seconds from
// 08:00:00 so ordering is exact and integer-stable, then format to ISO on demand.
const SESSION_OPEN_SEC = 8 * 3600;      // 08:00:00
const SESSION_CLOSE_SEC = 16 * 3600 + 30 * 60; // 16:30:00
function isoAt(secFromMidnight) {
  const h = Math.floor(secFromMidnight / 3600);
  const m = Math.floor((secFromMidnight % 3600) / 60);
  const s = secFromMidnight % 60;
  return `${BASE_DAY}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}Z`;
}

// ── Fictional instruments / issuers (invented tickers + Nexus-family names) ────
// `refPrice` is the fictional reference (mid) price the day opens around, in the
// instrument's minor currency unit is avoided — we keep plain decimal prices to
// keep the micro-viz legible. All fictional.
export const INSTRUMENTS = Object.freeze([
  { symbol: 'NXH', issuer: 'Nexus Holdings AG', sector: 'Diversified holdings', currency: 'CHF', refPrice: 42.00, tick: 0.01 },
  { symbol: 'MRDN', issuer: 'Meridian Freight Corp', sector: 'Logistics', currency: 'EUR', refPrice: 18.50, tick: 0.01 },
  { symbol: 'ORP', issuer: 'Orpheus Biotine PLC', sector: 'Biotech', currency: 'GBP', refPrice: 7.30, tick: 0.01 },
  { symbol: 'HLX', issuer: 'Helix Data Systems SA', sector: 'Technology', currency: 'EUR', refPrice: 55.20, tick: 0.01 },
  { symbol: 'CAST', issuer: 'Castellan Energy Ltd', sector: 'Energy', currency: 'USD', refPrice: 12.80, tick: 0.01 },
  { symbol: 'VNT', issuer: 'Ventar Minerals NV', sector: 'Mining', currency: 'USD', refPrice: 3.95, tick: 0.005 },
]);
export const INSTRUMENT_BY_SYMBOL = Object.freeze(Object.fromEntries(INSTRUMENTS.map((i) => [i.symbol, i])));

// ── Fictional trader / desk / account IDs ─────────────────────────────────────
// Traders sit on desks and route via accounts. A few accounts are deliberately
// "related" (same beneficial cluster) so the wash-trade detector has circular
// self-matching to find. All fictional.
export const DESKS = Object.freeze([
  { id: 'DESK-EQ', label: 'Cash Equities' },
  { id: 'DESK-PT', label: 'Program Trading' },
  { id: 'DESK-PROP', label: 'Principal / Prop' },
]);
export const TRADERS = Object.freeze([
  { id: 'TR-01', name: 'A. Vos', desk: 'DESK-EQ' },
  { id: 'TR-02', name: 'B. Ranj', desk: 'DESK-EQ' },
  { id: 'TR-03', name: 'C. Halden', desk: 'DESK-PT' },
  { id: 'TR-04', name: 'D. Iyer', desk: 'DESK-PT' },
  { id: 'TR-05', name: 'E. Sorak', desk: 'DESK-PROP' },
  { id: 'TR-06', name: 'F. Nunez', desk: 'DESK-PROP' },
  { id: 'TR-07', name: 'G. Petrov', desk: 'DESK-EQ' },
  { id: 'TR-08', name: 'H. Okonkwo', desk: 'DESK-PROP' },
]);
export const TRADER_BY_ID = Object.freeze(Object.fromEntries(TRADERS.map((t) => [t.id, t])));

// Accounts. `cluster` groups accounts that share a beneficial owner (the "related
// accounts" a wash trade circulates between). Fictional.
export const ACCOUNTS = Object.freeze([
  { id: 'ACC-100', label: 'Vos Personal', trader: 'TR-01', cluster: 'CL-A' },
  { id: 'ACC-101', label: 'Vos Nominee', trader: 'TR-01', cluster: 'CL-A' },   // same cluster as ACC-100 → wash pair
  { id: 'ACC-200', label: 'Ranj Book', trader: 'TR-02', cluster: 'CL-B' },
  { id: 'ACC-300', label: 'Halden Book', trader: 'TR-03', cluster: 'CL-C' },
  { id: 'ACC-400', label: 'Iyer Book', trader: 'TR-04', cluster: 'CL-D' },
  { id: 'ACC-500', label: 'Sorak Prop', trader: 'TR-05', cluster: 'CL-E' },
  { id: 'ACC-600', label: 'Nunez Prop', trader: 'TR-06', cluster: 'CL-F' },
  { id: 'ACC-700', label: 'Petrov Book', trader: 'TR-07', cluster: 'CL-G' },
  { id: 'ACC-800', label: 'Okonkwo Prop A', trader: 'TR-08', cluster: 'CL-H' },
  { id: 'ACC-801', label: 'Okonkwo Prop B', trader: 'TR-08', cluster: 'CL-H' }, // same cluster as ACC-800 → wash pair
]);
export const ACCOUNT_BY_ID = Object.freeze(Object.fromEntries(ACCOUNTS.map((a) => [a.id, a])));

// ── Fictional price-sensitive announcements (with need-to-know windows) ────────
// Each announcement is scheduled at a session-second and moves the issuer's price.
// `direction` is the post-announcement move (up = favourable). The insider list
// ties named insiders to these with a need-to-know window that OPENS before the
// announcement (when the information exists internally) and CLOSES at publication.
// All fictional.
export const ANNOUNCEMENTS = Object.freeze([
  { id: 'ANN-ORP-01', symbol: 'ORP', label: 'Positive Phase-II trial result', direction: 'up', magnitudePct: 0.18, announceSec: 14 * 3600 }, // 14:00
  { id: 'ANN-MRDN-01', symbol: 'MRDN', label: 'Profit warning / guidance cut', direction: 'down', magnitudePct: 0.11, announceSec: 13 * 3600 }, // 13:00
  { id: 'ANN-HLX-01', symbol: 'HLX', label: 'Unsolicited takeover approach', direction: 'up', magnitudePct: 0.14, announceSec: 15 * 3600 }, // 15:00
]);
export const ANNOUNCEMENT_BY_ID = Object.freeze(Object.fromEntries(ANNOUNCEMENTS.map((a) => [a.id, a])));

// ── Fictional insider list ────────────────────────────────────────────────────
// Persons with need-to-know access to a specific announcement, with the window in
// which they were "inside" (window opens when the info existed, closes at publish).
// A trader who trades the issuer INSIDE this window, ahead of a favourable move, is
// what the insider-dealing detector cross-checks against. `windowOpenSec` is the
// hour the person came onto the insider list for that announcement. Fictional.
export const INSIDER_LIST = Object.freeze([
  // ORP positive trial — TR-07 (G. Petrov) is on the list and WILL trade ahead (planted).
  { id: 'IN-01', traderId: 'TR-07', person: 'G. Petrov', role: 'Advisory', symbol: 'ORP', announcementId: 'ANN-ORP-01', windowOpenSec: 9 * 3600, windowCloseSec: 14 * 3600, note: 'Named on deal team for Orpheus trial read-out.' },
  // ORP — a second, INNOCENT insider who does NOT trade (control: on the list, no dealing).
  { id: 'IN-02', traderId: 'TR-02', person: 'B. Ranj', role: 'Compliance', symbol: 'ORP', announcementId: 'ANN-ORP-01', windowOpenSec: 9 * 3600, windowCloseSec: 14 * 3600, note: 'Compliance oversight of the read-out; no dealing expected.' },
  // MRDN profit warning — TR-03 (C. Halden) on the list (control: this detector should NOT fire spuriously for HLX/ORP).
  { id: 'IN-03', traderId: 'TR-03', person: 'C. Halden', role: 'Finance', symbol: 'MRDN', announcementId: 'ANN-MRDN-01', windowOpenSec: 9 * 3600, windowCloseSec: 13 * 3600, note: 'Prepared the guidance revision.' },
  // HLX takeover — TR-04 (D. Iyer) on the list (control: does not trade HLX inside window).
  { id: 'IN-04', traderId: 'TR-04', person: 'D. Iyer', role: 'Corporate', symbol: 'HLX', announcementId: 'ANN-HLX-01', windowOpenSec: 10 * 3600, windowCloseSec: 15 * 3600, note: 'Received the approach letter.' },
]);
export const INSIDER_BY_ID = Object.freeze(Object.fromEntries(INSIDER_LIST.map((i) => [i.id, i])));

// ── Order / execution schema ──────────────────────────────────────────────────
// order:
//   id           — stable id (ORD-<n>).
//   ts           — ISO timestamp (BASE_DAY session).
//   sec          — session-second (integer, for exact ordering).
//   symbol       — instrument.
//   side         — 'buy' | 'sell'.
//   price        — limit price (decimal).
//   qty          — order quantity (integer shares).
//   traderId     — the trader who entered it.
//   accountId    — the routing account.
//   state        — 'filled' | 'partial' | 'cancelled' | 'open'.
//   filledQty    — quantity executed (<= qty).
//   cancelSec    — session-second of cancellation (only for cancelled orders).
//   tag          — internal label for the planted scenario an order belongs to
//                  (null for ordinary background flow). Used by tests + the engine
//                  ground-truth; NOT a detector input.
// execution (trade):
//   id           — stable id (TRD-<n>).
//   ts / sec     — timestamp / session-second.
//   symbol, price, qty.
//   buyOrderId / sellOrderId  — the two orders that matched.
//   buyAccountId / sellAccountId, buyTraderId / sellTraderId.
//   tag          — planted-scenario label (or null).

// Generate the whole book deterministically. Returns { orders, executions }.
function generateBook() {
  const rng = new Rng(SURV_SEED);
  const orders = [];
  const executions = [];
  let ordSeq = 0;
  let trdSeq = 0;
  const nextOrderId = () => `ORD-${String(++ordSeq).padStart(4, '0')}`;
  const nextTradeId = () => `TRD-${String(++trdSeq).padStart(4, '0')}`;

  // Helper: push an order with sensible defaults.
  function pushOrder(o) {
    const order = {
      id: nextOrderId(),
      ts: isoAt(o.sec),
      sec: o.sec,
      symbol: o.symbol,
      side: o.side,
      price: round2(o.price, INSTRUMENT_BY_SYMBOL[o.symbol]),
      qty: o.qty,
      traderId: o.traderId,
      accountId: o.accountId,
      state: o.state || 'open',
      filledQty: o.filledQty != null ? o.filledQty : 0,
      cancelSec: o.cancelSec != null ? o.cancelSec : null,
      cancelTs: o.cancelSec != null ? isoAt(o.cancelSec) : null,
      tag: o.tag || null,
    };
    orders.push(order);
    return order;
  }
  function pushTrade(t) {
    const trade = {
      id: nextTradeId(),
      ts: isoAt(t.sec),
      sec: t.sec,
      symbol: t.symbol,
      price: round2(t.price, INSTRUMENT_BY_SYMBOL[t.symbol]),
      qty: t.qty,
      buyOrderId: t.buyOrderId,
      sellOrderId: t.sellOrderId,
      buyAccountId: t.buyAccountId,
      sellAccountId: t.sellAccountId,
      buyTraderId: t.buyTraderId,
      sellTraderId: t.sellTraderId,
      tag: t.tag || null,
    };
    executions.push(trade);
    return trade;
  }

  // ── Background flow: ordinary two-sided trading per instrument ───────────────
  // For each instrument we lay down a modest stream of buy/sell orders around the
  // reference price, most of which fill, a minority of which cancel (normal churn).
  // This is the "noise" the detectors must NOT flag — it gives precision teeth.
  //
  // Two constraints keep the background genuinely NEGATIVE (so precision holds):
  //   (1) a filled trade's two sides are drawn from DIFFERENT beneficial clusters,
  //       so background flow can never look like a wash (self-cluster) trade; and
  //   (2) for an instrument with a pending announcement, background orders avoid
  //       the accounts of traders on that issuer's insider list — so ordinary
  //       flow can never hand an insider a coincidental directional position ahead
  //       of the news. Only the PLANTED scenarios below create genuine signal.
  for (const inst of INSTRUMENTS) {
    // Traders barred from this instrument's background flow (its insiders).
    const barredTraders = new Set(INSIDER_LIST.filter((e) => e.symbol === inst.symbol).map((e) => e.traderId));
    const bgAccounts = ACCOUNTS.filter((a) => !barredTraders.has(a.trader));
    const nOrders = rng.int(24, 34); // modest per-instrument volume
    let sec = SESSION_OPEN_SEC + rng.int(0, 300);
    let mid = inst.refPrice;
    for (let k = 0; k < nOrders; k++) {
      sec += rng.int(120, 520); // space orders through the day
      if (sec > SESSION_CLOSE_SEC - 600) break;
      // gentle random walk of the mid
      mid = clampPrice(mid * (1 + rng.range(-0.004, 0.004)), inst);
      const side = rng.bool(0.5) ? 'buy' : 'sell';
      const drift = side === 'buy' ? rng.range(-1.2, 0.4) : rng.range(-0.4, 1.2);
      const price = clampPrice(mid + drift * inst.tick * 6, inst);
      const qty = rng.int(2, 40) * 25; // 50..1000 shares in lots of 25
      // most background orders fill; some cancel; some stay open
      const roll = rng.float();
      if (roll < 0.68) {
        // filled — pick an aggressor account and a counterparty in a DIFFERENT
        // beneficial cluster (never a self-cross), both outside the insider set.
        const aggAcc = pickFrom(rng, bgAccounts);
        const cpAcc = pickFrom(rng, bgAccounts.filter((a) => a.cluster !== aggAcc.cluster));
        const o = pushOrder({ sec, symbol: inst.symbol, side, price, qty, traderId: aggAcc.trader, accountId: aggAcc.id, state: 'filled', filledQty: qty });
        const cp = pushOrder({ sec: sec - rng.int(1, 20), symbol: inst.symbol, side: side === 'buy' ? 'sell' : 'buy', price, qty, traderId: cpAcc.trader, accountId: cpAcc.id, state: 'filled', filledQty: qty });
        const buyO = side === 'buy' ? o : cp;
        const sellO = side === 'buy' ? cp : o;
        pushTrade({ sec, symbol: inst.symbol, price, qty, buyOrderId: buyO.id, sellOrderId: sellO.id, buyAccountId: buyO.accountId, sellAccountId: sellO.accountId, buyTraderId: buyO.traderId, sellTraderId: sellO.traderId });
      } else if (roll < 0.86) {
        // cancelled a short while later (ordinary churn, small size, non-insider acct)
        const cancelSec = sec + rng.int(30, 240);
        const acc = pickFrom(rng, bgAccounts);
        pushOrder({ sec, symbol: inst.symbol, side, price, qty, traderId: acc.trader, accountId: acc.id, state: 'cancelled', filledQty: 0, cancelSec });
      } else {
        // left open (non-insider acct)
        const acc = pickFrom(rng, bgAccounts);
        pushOrder({ sec, symbol: inst.symbol, side, price, qty, traderId: acc.trader, accountId: acc.id, state: 'open', filledQty: 0 });
      }
    }
  }

  // ── PLANTED SCENARIO A — Insider dealing (ORP, ahead of positive trial) ──────
  // TR-07 (G. Petrov), who is on the insider list for ANN-ORP-01 (window 09:00–
  // 14:00), accumulates ORP via ACC-700 in the two hours BEFORE the 14:00 positive
  // announcement, then the price gaps up. Unusual, one-directional buying inside
  // the need-to-know window ahead of a favourable move = the classic pattern.
  {
    const ann = ANNOUNCEMENT_BY_ID['ANN-ORP-01'];
    const inst = INSTRUMENT_BY_SYMBOL['ORP'];
    // three build-up buys between 12:05 and 13:50 (inside window, pre-announcement)
    const buyTimes = [12 * 3600 + 5 * 60, 12 * 3600 + 55 * 60, 13 * 3600 + 50 * 60];
    let px = inst.refPrice; // ~7.30 pre-news
    for (const t of buyTimes) {
      px = round2(px + inst.tick * 2, inst);
      const qty = 3000; // conspicuously large vs background (max background ~1000)
      const buyO = pushOrder({ sec: t, symbol: 'ORP', side: 'buy', price: px, qty, traderId: 'TR-07', accountId: 'ACC-700', state: 'filled', filledQty: qty, tag: 'insider-ORP' });
      // resting seller (ordinary counterparty)
      const sellO = pushOrder({ sec: t - 8, symbol: 'ORP', side: 'sell', price: px, qty, traderId: 'TR-05', accountId: 'ACC-500', state: 'filled', filledQty: qty });
      pushTrade({ sec: t, symbol: 'ORP', price: px, qty, buyOrderId: buyO.id, sellOrderId: sellO.id, buyAccountId: 'ACC-700', sellAccountId: 'ACC-500', buyTraderId: 'TR-07', sellTraderId: 'TR-05', tag: 'insider-ORP' });
    }
    // The favourable move at 14:00: a print materially above the pre-announcement level.
    const postPx = round2(inst.refPrice * (1 + ann.magnitudePct), inst);
    const buyO = pushOrder({ sec: ann.announceSec + 30, symbol: 'ORP', side: 'buy', price: postPx, qty: 800, traderId: 'TR-02', accountId: 'ACC-200', state: 'filled', filledQty: 800, tag: 'announce-ORP' });
    const sellO = pushOrder({ sec: ann.announceSec + 22, symbol: 'ORP', side: 'sell', price: postPx, qty: 800, traderId: 'TR-06', accountId: 'ACC-600', state: 'filled', filledQty: 800, tag: 'announce-ORP' });
    pushTrade({ sec: ann.announceSec + 30, symbol: 'ORP', price: postPx, qty: 800, buyOrderId: buyO.id, sellOrderId: sellO.id, buyAccountId: 'ACC-200', sellAccountId: 'ACC-600', buyTraderId: 'TR-02', sellTraderId: 'TR-06', tag: 'announce-ORP' });
  }

  // ── PLANTED SCENARIO B — Spoofing / layering (NXH) ──────────────────────────
  // TR-08 (H. Okonkwo) wants to BUY NXH cheaply. He layers several large SELL
  // orders just above the touch to create false downward pressure, gets a genuine
  // BUY fill on the other side at a better price, then cancels all the sell layers
  // within seconds — none of them fill. Large placed-then-cancelled one side +
  // genuine fill the other side = spoofing/layering.
  {
    const inst = INSTRUMENT_BY_SYMBOL['NXH'];
    const t0 = 10 * 3600 + 30 * 60; // 10:30
    const touch = inst.refPrice;    // ~42.00
    const layerOrders = [];
    // five layered SELL orders stacked just above the touch, big size
    for (let i = 0; i < 5; i++) {
      const price = round2(touch + inst.tick * (2 + i * 2), inst); // 42.02, 42.04, ...
      const qty = 2500 + i * 500; // 2500..4500 — large, dwarfing background
      const o = pushOrder({ sec: t0 + i, symbol: 'NXH', side: 'sell', price, qty, traderId: 'TR-08', accountId: 'ACC-800', state: 'cancelled', filledQty: 0, cancelSec: t0 + 9 + i, tag: 'spoof-NXH' });
      layerOrders.push(o);
    }
    // the genuine BUY that the spoofer actually wanted, filled on the bid a moment later
    const px = round2(touch - inst.tick, inst); // buys a touch cheaper (41.99)
    const buyO = pushOrder({ sec: t0 + 6, symbol: 'NXH', side: 'buy', price: px, qty: 1200, traderId: 'TR-08', accountId: 'ACC-800', state: 'filled', filledQty: 1200, tag: 'spoof-NXH' });
    const sellO = pushOrder({ sec: t0 + 4, symbol: 'NXH', side: 'sell', price: px, qty: 1200, traderId: 'TR-01', accountId: 'ACC-200', state: 'filled', filledQty: 1200 });
    pushTrade({ sec: t0 + 6, symbol: 'NXH', price: px, qty: 1200, buyOrderId: buyO.id, sellOrderId: sellO.id, buyAccountId: 'ACC-800', sellAccountId: 'ACC-200', buyTraderId: 'TR-08', sellTraderId: 'TR-02', tag: 'spoof-NXH' });
  }

  // ── PLANTED SCENARIO C — Wash trading (VNT, circular self-matching) ─────────
  // TR-01 self-matches VNT between two accounts in the SAME beneficial cluster
  // (ACC-100 ↔ ACC-101, cluster CL-A). A rapid series of buy/sell prints between
  // related accounts at a stable price creates volume with no change in beneficial
  // ownership — textbook wash trading. Also a second wash pair for TR-08's
  // CL-H accounts to prove the detector generalises (and to give a 2nd alert).
  {
    const inst = INSTRUMENT_BY_SYMBOL['VNT'];
    const t0 = 11 * 3600 + 15 * 60; // 11:15
    const px = round2(inst.refPrice, inst); // ~3.95, stable
    for (let i = 0; i < 5; i++) {
      const sec = t0 + i * 40;
      const qty = 5000;
      // ACC-100 buys from ACC-101 (both cluster CL-A, both trader TR-01) — circular
      const buyO = pushOrder({ sec, symbol: 'VNT', side: 'buy', price: px, qty, traderId: 'TR-01', accountId: 'ACC-100', state: 'filled', filledQty: qty, tag: 'wash-VNT' });
      const sellO = pushOrder({ sec: sec - 2, symbol: 'VNT', side: 'sell', price: px, qty, traderId: 'TR-01', accountId: 'ACC-101', state: 'filled', filledQty: qty, tag: 'wash-VNT' });
      pushTrade({ sec, symbol: 'VNT', price: px, qty, buyOrderId: buyO.id, sellOrderId: sellO.id, buyAccountId: 'ACC-100', sellAccountId: 'ACC-101', buyTraderId: 'TR-01', sellTraderId: 'TR-01', tag: 'wash-VNT' });
    }
  }
  {
    const inst = INSTRUMENT_BY_SYMBOL['CAST'];
    const t0 = 9 * 3600 + 40 * 60; // 09:40
    const px = round2(inst.refPrice, inst); // ~12.80
    for (let i = 0; i < 4; i++) {
      const sec = t0 + i * 55;
      const qty = 3500;
      // ACC-800 ↔ ACC-801 (cluster CL-H, trader TR-08) — circular self-match
      const buyO = pushOrder({ sec, symbol: 'CAST', side: 'buy', price: px, qty, traderId: 'TR-08', accountId: 'ACC-800', state: 'filled', filledQty: qty, tag: 'wash-CAST' });
      const sellO = pushOrder({ sec: sec - 3, symbol: 'CAST', side: 'sell', price: px, qty, traderId: 'TR-08', accountId: 'ACC-801', state: 'filled', filledQty: qty, tag: 'wash-CAST' });
      pushTrade({ sec, symbol: 'CAST', price: px, qty, buyOrderId: buyO.id, sellOrderId: sellO.id, buyAccountId: 'ACC-800', sellAccountId: 'ACC-801', buyTraderId: 'TR-08', sellTraderId: 'TR-08', tag: 'wash-CAST' });
    }
  }

  // Stable, deterministic ordering: by session-second then id. (Ids already encode
  // insertion order, so this is a total, byte-stable order.)
  orders.sort((a, b) => a.sec - b.sec || a.id.localeCompare(b.id));
  executions.sort((a, b) => a.sec - b.sec || a.id.localeCompare(b.id));
  return { orders, executions };
}

// ── Small pure helpers (deterministic; no ambient state) ──────────────────────
function round2(v, inst) {
  const tick = inst ? inst.tick : 0.01;
  const n = Math.round(v / tick) * tick;
  // avoid FP dust
  return Math.round(n * 1000) / 1000;
}
function clampPrice(v, inst) {
  const lo = inst.refPrice * 0.85, hi = inst.refPrice * 1.15;
  return round2(Math.min(hi, Math.max(lo, v)), inst);
}
// Pick a random element from an account list (deterministic via the shared Rng).
// Falls back to the full ACCOUNTS list if the caller passed an empty subset.
function pickFrom(rng, list) {
  const arr = (list && list.length) ? list : ACCOUNTS;
  return arr[rng.int(0, arr.length - 1)];
}

// Pre-compute the frozen book ONCE at module load so importers share one instance
// and never re-run the generator. Deep-frozen for safety.
const BOOK = generateBook();
export const ORDERS = Object.freeze(BOOK.orders.map((o) => Object.freeze(o)));
export const EXECUTIONS = Object.freeze(BOOK.executions.map((e) => Object.freeze(e)));

// Convenience lookups the engine reuses.
export const ORDER_BY_ID = Object.freeze(Object.fromEntries(ORDERS.map((o) => [o.id, o])));

// ── The methodology / honesty note every surveillance API response / view carries.
export const SURVEILLANCE_DISCLAIMER =
  'A 100% SYNTHETIC, deterministic trade-surveillance demonstration over a FICTIONAL order book on a fictional venue (NEXUS-MTF), with fictional trader/desk/account IDs, fictional issuers/instruments, a fictional insider list and fictional price-sensitive announcements. No real person and no real listed company is the subject of any alert — every allegation here is fabricated. The DETECTOR LOGIC mirrors real, public market-abuse typologies (MAR / Dodd-Frank / CEA: insider dealing, spoofing/layering, wash trading), but the data is invented and the alerts are illustrative, not factual accusations. This is NOT a trade-surveillance system of record and NOT legal advice.';

// A stable version stamp so the UI can display it.
export const SURVEILLANCE_VERSION = Object.freeze({
  version: '1.0.0',
  venue: SURV_VENUE,
  seed: SURV_SEED,
  tradingDay: BASE_DAY,
  instruments: INSTRUMENTS.length,
  traders: TRADERS.length,
  accounts: ACCOUNTS.length,
  orders: ORDERS.length,
  executions: EXECUTIONS.length,
  announcements: ANNOUNCEMENTS.length,
  insiderListEntries: INSIDER_LIST.length,
});
