// ============================================================================
// forecast-engine.js
// Dependency-free time-series forecasting engine (ES module).
//
// Design goals:
//   - Real, inspectable statistics — no fake "AI" numbers.
//   - Series are plain arrays of numbers, OLDEST FIRST. Monthly => season = 12.
//   - Model families: seasonal-naive, moving-average, SES, Holt, Holt-Winters,
//     Croston (intermittent), and OLS regression (trend + seasonal dummies +
//     optional exogenous drivers such as temperature / promotions / price).
//   - Rolling-origin backtesting -> MAE, RMSE, MAPE, sMAPE, WAPE, bias.
//   - Champion / challenger selection by backtest error.
//   - Prediction intervals from champion residual dispersion.
//   - Recalibration: append a new actual, classify it (normal / anomalous /
//     structural break vs prior interval) and measure how the forecast moved.
//
// The engine is industry-agnostic. Industry data + business language live in the
// per-industry data modules and the dashboards that consume this file.
// ============================================================================

export const Z = { 80: 1.2815515594, 90: 1.6448536270, 95: 1.9599639845 };

// ---------- small numeric helpers ----------
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const sum  = a => a.reduce((s, x) => s + x, 0);
function std(a) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1));
}
const round = (x, d = 0) => { const f = 10 ** d; return Math.round(x * f) / f; };
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

function erf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}
export function normCdf(x) { return 0.5 * (1 + erf(x / Math.SQRT2)); }

// ============================================================================
// Error metrics — computed over aligned actual/pred arrays.
// ============================================================================
export function metrics(actual, pred) {
  const n = Math.min(actual.length, pred.length);
  let ae = 0, se = 0, apeSum = 0, apeN = 0, smapeSum = 0, wapeNum = 0, wapeDen = 0, biasSum = 0;
  for (let i = 0; i < n; i++) {
    const a = actual[i], p = pred[i], e = p - a, abse = Math.abs(e);
    ae += abse; se += e * e; biasSum += e;
    wapeNum += abse; wapeDen += Math.abs(a);
    if (a !== 0) { apeSum += Math.abs(e / a); apeN++; }
    const den = Math.abs(a) + Math.abs(p);
    if (den > 0) smapeSum += (2 * abse) / den;
  }
  return {
    n,
    mae: ae / n,
    rmse: Math.sqrt(se / n),
    mape: apeN ? (apeSum / apeN) * 100 : null,
    smape: (smapeSum / n) * 100,
    wape: wapeDen ? (wapeNum / wapeDen) * 100 : null,
    bias: biasSum / n,
    biasPct: wapeDen ? (biasSum / wapeDen) * 100 : null,
  };
}

// ============================================================================
// Optimisation + linear algebra helpers
// ============================================================================
function sse(actual, fitted) {
  let s = 0;
  for (let i = 0; i < actual.length; i++) if (!isNaN(fitted[i])) { const e = actual[i] - fitted[i]; s += e * e; }
  return s;
}
function grid1(f, lo, hi, step) { let best = lo, bv = Infinity; for (let a = lo; a <= hi + 1e-9; a += step) { const v = f(a); if (v < bv) { bv = v; best = a; } } return best; }
function grid2(f) { let best = [0.3, 0.1], bv = Infinity; for (let a = 0.1; a <= 0.9; a += 0.1) for (let b = 0.02; b <= 0.5; b += 0.06) { const v = f(a, b); if (v < bv) { bv = v; best = [a, b]; } } return best; }
function grid3(f) { let best = [0.3, 0.08, 0.1], bv = Infinity; for (let a = 0.1; a <= 0.8; a += 0.1) for (let b = 0.02; b <= 0.34; b += 0.08) for (let g = 0.05; g <= 0.6; g += 0.11) { const v = f(a, b, g); if (v < bv) { bv = v; best = [a, b, g]; } } return best; }

// Solve A x = b via Gaussian elimination with partial pivoting.
function solve(A, b) {
  const n = A.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    [M[col], M[piv]] = [M[piv], M[col]];
    const d = M[col][col] || 1e-9;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / d;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((r, i) => r[n] / (r[i] || 1e-9));
}
// Ridge-regularised OLS (normal equations).
function ols(X, y, lambda = 1e-4) {
  const p = X[0].length;
  const XtX = Array.from({ length: p }, () => Array(p).fill(0));
  const Xty = Array(p).fill(0);
  for (let i = 0; i < X.length; i++) {
    for (let a = 0; a < p; a++) {
      Xty[a] += X[i][a] * y[i];
      for (let b = 0; b < p; b++) XtX[a][b] += X[i][a] * X[i][b];
    }
  }
  for (let a = 1; a < p; a++) XtX[a][a] += lambda; // don't penalise intercept
  return solve(XtX, Xty);
}

// ============================================================================
// Model families. Each factory returns { name, params, fitted, forecast(h) }.
// `fitted` holds one-step in-sample predictions (NaN where undefined) so we can
// estimate residual dispersion for prediction intervals.
// ============================================================================
export function seasonalNaive(train, { season = 12 } = {}) {
  const n = train.length, s = Math.min(season, n);
  const fitted = train.map((_, i) => (i >= s ? train[i - s] : NaN));
  return { name: 'Seasonal naive', params: {}, fitted, forecast: (h) => Array.from({ length: h }, (_, k) => train[n - s + (k % s)]) };
}

export function movingAverage(train, { window = 3 } = {}) {
  const n = train.length, w = Math.min(window, n);
  const fitted = train.map((_, i) => (i >= w ? mean(train.slice(i - w, i)) : NaN));
  const last = mean(train.slice(n - w));
  return { name: `Moving average (${w})`, params: { window: w }, fitted, forecast: (h) => Array(h).fill(last) };
}

function sesRun(train, alpha) {
  let l = train[0];
  const fitted = [NaN];
  for (let i = 1; i < train.length; i++) { fitted.push(l); l = alpha * train[i] + (1 - alpha) * l; }
  return { fitted, level: l };
}
export function ses(train, { alpha } = {}) {
  if (alpha == null) alpha = grid1((a) => sse(train, sesRun(train, a).fitted), 0.05, 0.95, 0.05);
  const { fitted, level } = sesRun(train, alpha);
  return { name: 'Exp. smoothing (SES)', params: { alpha: round(alpha, 2) }, fitted, forecast: (h) => Array(h).fill(level) };
}

function holtRun(train, alpha, beta) {
  let l = train[0], b = train.length > 1 ? train[1] - train[0] : 0;
  const fitted = [NaN];
  for (let i = 1; i < train.length; i++) {
    fitted.push(l + b);
    const lPrev = l;
    l = alpha * train[i] + (1 - alpha) * (l + b);
    b = beta * (l - lPrev) + (1 - beta) * b;
  }
  return { fitted, level: l, trend: b };
}
export function holt(train, { alpha, beta } = {}) {
  if (alpha == null) { const best = grid2((a, bt) => sse(train, holtRun(train, a, bt).fitted)); alpha = best[0]; beta = best[1]; }
  const { fitted, level, trend } = holtRun(train, alpha, beta);
  return { name: 'Holt (linear trend)', params: { alpha: round(alpha, 2), beta: round(beta, 2) }, fitted, forecast: (h) => Array.from({ length: h }, (_, k) => level + (k + 1) * trend) };
}

// Holt-Winters, additive seasonality.
function hwRun(train, alpha, beta, gamma, s) {
  const n = train.length;
  if (n < 2 * s) return null;
  let l = mean(train.slice(0, s));
  const m2 = mean(train.slice(s, 2 * s));
  let b = (m2 - l) / s;
  const S = [];
  for (let i = 0; i < s; i++) S.push(train[i] - l);
  const fitted = Array(s).fill(NaN);
  for (let i = s; i < n; i++) {
    const si = i % s;
    fitted.push(l + b + S[si]);
    const lPrev = l;
    l = alpha * (train[i] - S[si]) + (1 - alpha) * (l + b);
    b = beta * (l - lPrev) + (1 - beta) * b;
    S[si] = gamma * (train[i] - l) + (1 - gamma) * S[si];
  }
  return { fitted, level: l, trend: b, seas: S, s };
}
export function holtWinters(train, { alpha, beta, gamma, season = 12 } = {}) {
  const s = season;
  if (train.length < 2 * s) return null;
  if (alpha == null) {
    const best = grid3((a, bt, g) => { const r = hwRun(train, a, bt, g, s); return r ? sse(train, r.fitted) : Infinity; });
    alpha = best[0]; beta = best[1]; gamma = best[2];
  }
  const r = hwRun(train, alpha, beta, gamma, s);
  const n = train.length;
  return {
    name: 'Holt-Winters (seasonal)',
    params: { alpha: round(alpha, 2), beta: round(beta, 2), gamma: round(gamma, 2) },
    fitted: r.fitted,
    forecast: (h) => Array.from({ length: h }, (_, k) => r.level + (k + 1) * r.trend + r.seas[(n + k) % s]),
  };
}

// Croston's method for intermittent demand.
export function croston(train, { alpha = 0.1 } = {}) {
  let z = null, x = null, q = 1, rate = 0;
  const fitted = Array(train.length).fill(NaN);
  for (let i = 0; i < train.length; i++) {
    if (train[i] > 0) {
      if (z == null) { z = train[i]; x = q; }
      else { z = alpha * train[i] + (1 - alpha) * z; x = alpha * q + (1 - alpha) * x; }
      q = 1; rate = z / x;
    } else { q++; }
    fitted[i] = rate;
  }
  return { name: 'Croston (intermittent)', params: { alpha }, fitted, forecast: (h) => Array(h).fill(rate || 0) };
}

// OLS regression: intercept + linear trend + (s-1) seasonal dummies + drivers.
function regRow(t, s, exog, k) {
  const row = [1, t];
  const m = ((t % s) + s) % s;
  for (let j = 1; j < s; j++) row.push(m === j ? 1 : 0);
  if (exog) for (const key in exog) row.push(exog[key][k]);
  return row;
}
export function linreg(train, { season = 12, exog = null, exogFuture = null } = {}) {
  const n = train.length, s = season;
  const X = train.map((_, i) => regRow(i, s, exog, i));
  const beta = ols(X, train);
  const fitted = X.map((r) => dot(r, beta));
  const label = exog ? 'Regression (trend+season+drivers)' : 'Regression (trend+season)';
  return {
    name: label, params: {}, fitted,
    forecast: (h) => {
      const rows = [];
      for (let k = 0; k < h; k++) {
        const t = n + k;
        const ex = exog ? Object.fromEntries(Object.keys(exog).map((key) => [key, [(exogFuture && exogFuture[key] && exogFuture[key][k] != null) ? exogFuture[key][k] : mean(exog[key])]])) : null;
        rows.push(regRow(t, s, ex, 0));
      }
      return rows.map((r) => dot(r, beta));
    },
  };
}

// ============================================================================
// Backtesting — rolling-origin evaluation.
// ============================================================================
export function backtest(train, factory, { H = 3, folds = 4, step = 1, minTrain = null } = {}) {
  const n = train.length;
  minTrain = minTrain || Math.max(H + 1, Math.floor(n * 0.5));
  const origins = [];
  for (let i = 0; i < folds; i++) {
    const cut = n - H - i * step;
    if (cut < minTrain) break;
    origins.push(cut);
  }
  origins.reverse();
  const preds = [], acts = [];
  for (const cut of origins) {
    const model = factory(train.slice(0, cut));
    if (!model) return null;
    const fc = model.forecast(H);
    for (let k = 0; k < H; k++) { preds.push(fc[k]); acts.push(train[cut + k]); }
  }
  if (!preds.length) return null;
  return { ...metrics(acts, preds), folds: origins.length, H };
}

// Map a champion name back to a factory (with the right season/exog wiring).
export function factoryFor(name, { season = 12, exog = null, exogFuture = null } = {}) {
  switch (name) {
    case 'Seasonal naive': return (tr) => seasonalNaive(tr, { season });
    case 'Exp. smoothing (SES)': return (tr) => ses(tr, {});
    case 'Holt (linear trend)': return (tr) => holt(tr, {});
    case 'Holt-Winters (seasonal)': return (tr) => holtWinters(tr, { season });
    case 'Croston (intermittent)': return (tr) => croston(tr, {});
    case 'Regression (trend+season+drivers)':
    case 'Regression (trend+season)': return (tr) => linreg(tr, { season, exog, exogFuture });
    default:
      if (name && name.startsWith('Moving average')) return (tr) => movingAverage(tr, { window: 3 });
      return (tr) => seasonalNaive(tr, { season });
  }
}

// ============================================================================
// Champion / challenger selection.
// ============================================================================
export function autoSelect(train, { season = 12, exog = null, horizon = 3, folds = 4, intermittent = null, models = null } = {}) {
  const s = season;
  const zeroFrac = train.filter((x) => x === 0).length / train.length;
  const isInt = intermittent != null ? intermittent : zeroFrac > 0.3;

  // The industry's model policy decides which families are eligible. Defaults to all.
  const bank = {
    snaive: { name: 'Seasonal naive', factory: (tr) => seasonalNaive(tr, { season: s }) },
    ma: { name: 'Moving average (3)', factory: (tr) => movingAverage(tr, { window: 3 }) },
    ses: { name: 'Exp. smoothing (SES)', factory: (tr) => ses(tr, {}) },
    holt: { name: 'Holt (linear trend)', factory: (tr) => holt(tr, {}) },
    hw: { name: 'Holt-Winters (seasonal)', factory: (tr) => holtWinters(tr, { season: s }), min: 2 * s },
    reg: { name: exog ? 'Regression (trend+season+drivers)' : 'Regression (trend+season)', factory: (tr) => linreg(tr, { season: s, exog }), min: s + 3 },
    croston: { name: 'Croston (intermittent)', factory: (tr) => croston(tr, {}) },
  };
  let keys = models && models.length ? models.slice() : ['snaive', 'ma', 'ses', 'holt', 'hw', 'reg'];
  if (isInt && !keys.includes('croston')) keys.push('croston'); // always test Croston on intermittent lines
  const candidates = keys.filter((k) => bank[k]).map((k) => bank[k]).filter((c) => !c.min || train.length >= c.min);

  const ranking = [];
  for (const c of candidates) {
    const bt = backtest(train, c.factory, { H: horizon, folds });
    if (bt) ranking.push({ name: c.name, metrics: bt });
  }
  // Rank by WAPE (falls back to sMAPE) — robust to scale + zeros.
  ranking.sort((a, b) => (a.metrics.wape ?? a.metrics.smape) - (b.metrics.wape ?? b.metrics.smape));
  const champion = ranking[0];
  const runnerUp = ranking[1];
  let reason = '';
  if (champion) {
    const cw = champion.metrics.wape ?? champion.metrics.smape;
    reason = `Lowest back-tested error over ${champion.metrics.folds} rolling origins (WAPE ${cw.toFixed(1)}%).`;
    if (runnerUp) {
      const rw = runnerUp.metrics.wape ?? runnerUp.metrics.smape;
      const gap = rw - cw;
      reason += gap < 1.2
        ? ` Narrow lead over ${runnerUp.name} (+${gap.toFixed(1)} pts) — kept as challenger.`
        : ` Clear of ${runnerUp.name} by ${gap.toFixed(1)} pts.`;
    }
  }
  return { champion, ranking, isIntermittent: isInt, reason };
}

// ============================================================================
// Forecast with prediction intervals (from champion residual dispersion).
// ============================================================================
export function buildForecast(train, championName, { season = 12, horizon = 6, exog = null, exogFuture = null } = {}) {
  const model = factoryFor(championName, { season, exog, exogFuture })(train);
  const point = model.forecast(horizon, exogFuture).map((v) => Math.max(0, v));
  const resid = [];
  for (let i = 0; i < train.length; i++) if (!isNaN(model.fitted[i])) resid.push(train[i] - model.fitted[i]);
  const sigma = std(resid);
  // Interval widens with horizon (√ growth) — standard for smoothing models.
  const band = (z) => point.map((p, k) => {
    const w = z * sigma * Math.sqrt(1 + k * 0.4);
    return { lo: Math.max(0, p - w), hi: p + w };
  });
  return { point, sigma, pi80: band(Z[80]), pi95: band(Z[95]), model, name: championName };
}

// ============================================================================
// Recalibration — append a new actual and explain what changed.
// ============================================================================
export function recalibrate(train, newValue, { season = 12, championName, horizon = 6, exog = null, exogFuture = null } = {}) {
  const before = buildForecast(train, championName, { season, horizon, exog, exogFuture });
  const priorNext = before.point[0];
  const priorLo = before.pi95[0].lo, priorHi = before.pi95[0].hi;
  const deltaPct = priorNext ? ((newValue - priorNext) / priorNext) * 100 : 0;
  const outside = newValue < priorLo || newValue > priorHi;
  const z = before.sigma ? Math.abs(newValue - priorNext) / before.sigma : 0;
  const classification = outside ? 'structural' : (z > 1.5 ? 'anomalous' : 'normal');

  const newTrain = [...train, newValue];
  const sel = autoSelect(newTrain, { season, exog, horizon: Math.min(horizon, 3) });
  const after = buildForecast(newTrain, championName, { season, horizon, exog, exogFuture });

  // Same-calendar-month comparison: before.point[1] and after.point[0] are the
  // same future month (n+2), so their ratio is a clean "how the forecast moved".
  const anchorBefore = before.point[1] ?? before.point[0];
  const anchorAfter = after.point[0];
  const forecastShiftPct = anchorBefore ? ((anchorAfter - anchorBefore) / anchorBefore) * 100 : 0;

  return {
    classification, deltaPct, outside, z: round(z, 2),
    priorNext, newValue,
    forecastShiftPct,
    championStillBest: sel.champion ? sel.champion.name === championName : true,
    suggestedChampion: sel.champion ? sel.champion.name : championName,
    before, after,
  };
}

// ============================================================================
// Inventory / constraint helpers (shared across product-based industries).
// ============================================================================
export function stockoutRisk(available, demandMean, demandSigma) {
  if (demandSigma <= 0) return demandMean > available ? 1 : 0;
  return 1 - normCdf((available - demandMean) / demandSigma);
}
// Months of cover given on-hand + upcoming monthly forecast path.
export function monthsOfCover(onHand, forecastPath) {
  let remaining = onHand, m = 0;
  for (const d of forecastPath) {
    if (remaining <= 0) break;
    if (remaining >= d) { remaining -= d; m += 1; }
    else { m += d > 0 ? remaining / d : 0; remaining = 0; break; }
  }
  return m;
}
// Order-up-to reorder quantity with safety stock for a target service level.
export function reorderQty({ onHand, onOrder, forecast, leadTimeMonths, reviewMonths = 1, sigma, serviceZ = Z[95] }) {
  const horizon = leadTimeMonths + reviewMonths;
  const whole = Math.floor(horizon);
  const frac = horizon - whole;
  let demand = sum(forecast.slice(0, whole));
  if (frac > 0 && forecast[whole] != null) demand += frac * forecast[whole];
  const safety = serviceZ * sigma * Math.sqrt(horizon);
  const target = demand + safety;
  return { qty: Math.max(0, Math.round(target - (onHand + onOrder))), safety: Math.round(safety), demand: Math.round(demand) };
}

export { mean, sum, std, round };
