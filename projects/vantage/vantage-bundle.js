/* Vantage module bundle - GENERATED for offline file:// use. */
(function(){
  var __mods={};
  function require(name){ var k=name.replace(/^\.\//,''); if(__mods[k]) return __mods[k].exports; throw new Error('vantage bundle: not loaded '+name); }
  function define(name,factory){ var m={exports:{}}; __mods[name]=m; factory(m,m.exports,require); }

  define("forecast-engine.js", function(module, exports, require){
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
    
    const Z = { 80: 1.2815515594, 90: 1.6448536270, 95: 1.9599639845 };
    
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
    function normCdf(x) { return 0.5 * (1 + erf(x / Math.SQRT2)); }
    
    // ============================================================================
    // Error metrics — computed over aligned actual/pred arrays.
    // ============================================================================
    function metrics(actual, pred) {
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
    function seasonalNaive(train, { season = 12 } = {}) {
      const n = train.length, s = Math.min(season, n);
      const fitted = train.map((_, i) => (i >= s ? train[i - s] : NaN));
      return { name: 'Seasonal naive', params: {}, fitted, forecast: (h) => Array.from({ length: h }, (_, k) => train[n - s + (k % s)]) };
    }
    
    function movingAverage(train, { window = 3 } = {}) {
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
    function ses(train, { alpha } = {}) {
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
    function holt(train, { alpha, beta } = {}) {
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
    function holtWinters(train, { alpha, beta, gamma, season = 12 } = {}) {
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
    function croston(train, { alpha = 0.1 } = {}) {
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
    function linreg(train, { season = 12, exog = null, exogFuture = null } = {}) {
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
    function backtest(train, factory, { H = 3, folds = 4, step = 1, minTrain = null } = {}) {
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
    function factoryFor(name, { season = 12, exog = null, exogFuture = null } = {}) {
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
    function autoSelect(train, { season = 12, exog = null, horizon = 3, folds = 4, intermittent = null, models = null } = {}) {
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
    function buildForecast(train, championName, { season = 12, horizon = 6, exog = null, exogFuture = null } = {}) {
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
    function recalibrate(train, newValue, { season = 12, championName, horizon = 6, exog = null, exogFuture = null } = {}) {
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
    function stockoutRisk(available, demandMean, demandSigma) {
      if (demandSigma <= 0) return demandMean > available ? 1 : 0;
      return 1 - normCdf((available - demandMean) / demandSigma);
    }
    // Months of cover given on-hand + upcoming monthly forecast path.
    function monthsOfCover(onHand, forecastPath) {
      let remaining = onHand, m = 0;
      for (const d of forecastPath) {
        if (remaining <= 0) break;
        if (remaining >= d) { remaining -= d; m += 1; }
        else { m += d > 0 ? remaining / d : 0; remaining = 0; break; }
      }
      return m;
    }
    // Order-up-to reorder quantity with safety stock for a target service level.
    function reorderQty({ onHand, onOrder, forecast, leadTimeMonths, reviewMonths = 1, sigma, serviceZ = Z[95] }) {
      const horizon = leadTimeMonths + reviewMonths;
      const whole = Math.floor(horizon);
      const frac = horizon - whole;
      let demand = sum(forecast.slice(0, whole));
      if (frac > 0 && forecast[whole] != null) demand += frac * forecast[whole];
      const safety = serviceZ * sigma * Math.sqrt(horizon);
      const target = demand + safety;
      return { qty: Math.max(0, Math.round(target - (onHand + onOrder))), safety: Math.round(safety), demand: Math.round(demand) };
    }
    
    
    exports["Z"] = Z;
    exports["normCdf"] = normCdf;
    exports["metrics"] = metrics;
    exports["seasonalNaive"] = seasonalNaive;
    exports["movingAverage"] = movingAverage;
    exports["ses"] = ses;
    exports["holt"] = holt;
    exports["holtWinters"] = holtWinters;
    exports["croston"] = croston;
    exports["linreg"] = linreg;
    exports["backtest"] = backtest;
    exports["factoryFor"] = factoryFor;
    exports["autoSelect"] = autoSelect;
    exports["buildForecast"] = buildForecast;
    exports["recalibrate"] = recalibrate;
    exports["stockoutRisk"] = stockoutRisk;
    exports["monthsOfCover"] = monthsOfCover;
    exports["reorderQty"] = reorderQty;
    exports["mean"] = mean;
    exports["sum"] = sum;
    exports["std"] = std;
    exports["round"] = round;
  });

  define("vantage-ui.js", function(module, exports, require){
    // vantage-ui.js — generic, config-driven view-model builder for ALL Vantage industries.
    // The forecasting maths (forecast-engine.js) is shared. Each industry supplies a data
    // module with META (theme, mode, labels, capacity), ENTITIES (time series), MODEL_POLICY,
    // DRIVERS/FUTURE, PROVENANCE, REFERENCES. This module reads that config and branches on
    // META.mode: 'inventory' (brewery/DTC/manufacturing), 'subscription' (SaaS), 'capacity' (education).
    
    const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const monthLabelAt = (idx) => `${MON[((idx%12)+12)%12]} ${23 + Math.floor(idx/12)}`;
    
    // ---- Temporal granularity (config-driven) ------------------------------------
    // Each industry's META declares a granularity: 'week' (operational reorder cadence
    // for inventory businesses) or 'month' (default; subscription/capacity metrics).
    // periodInfo(D) yields the labels, units, cover/flag thresholds and report periods
    // for that granularity so the whole view-model reads correctly at either scale.
    const DAYMS = 86400000;
    function weekStart(D) {
      const s = D.META && D.META.startDate;
      if (!s) return Date.UTC(2022, 5, 27);
      const p = String(s).split('-').map(Number);
      return Date.UTC(p[0], (p[1] || 1) - 1, p[2] || 1);
    }
    function weeklyLabelAt(D, idx) { const dt = new Date(weekStart(D) + idx * 7 * DAYMS); return `${dt.getUTCDate()} ${MON[dt.getUTCMonth()]}`; }
    function periodInfo(D) {
      const wk = D && D.META && D.META.granularity === 'week';
      return {
        wk, unit: wk ? 'wk' : 'mo', noun: wk ? 'week' : 'month', plural: wk ? 'weeks' : 'months', per: wk ? '/wk' : '/mo',
        days: wk ? 7 : 30.4, seasonPerYear: wk ? 52 : 12, histWin: wk ? 26 : 18,
        reorderT: wk ? 6 : 1.4, overstockT: wk ? 12 : 3, stockSlack: wk ? 1 : 0.3, shortHist: wk ? 104 : 24,
        labelAt: (i) => wk ? weeklyLabelAt(D, i) : monthLabelAt(i),
        leadToPeriods: (weeks) => wk ? weeks : weeks / 4.33,
        reportPeriods: wk ? [['w4', '4 weeks', 4], ['w8', '8 weeks', 8], ['quarter', 'Quarter', 13]]
                          : [['month', 'Month', 1], ['quarter', 'Quarter', 3], ['half', '6 months', 6], ['year', '12 months', 12]],
        periodTitle: wk ? { w4: 'Next 4 weeks', w8: 'Next 8 weeks', quarter: 'Next quarter' }
                        : { month: 'Next month', quarter: 'Next quarter', half: 'Next 6 months', year: 'Next 12 months' },
      };
    }
    
    const fmtI = n => (n == null || isNaN(n)) ? '—' : Math.round(n).toLocaleString('en-GB');
    const short = m => (m || '').replace(/\s*\(.*\)/, '');
    
    function money(cur, n, d) {
      if (n == null || isNaN(n)) return '—';
      const s = n < 0 ? '-' : ''; n = Math.abs(n);
      if (n >= 1e6) return `${s}${cur}${(n/1e6).toFixed(n>=1e7?1:2)}m`;
      if (n >= 1e3) return `${s}${cur}${Math.round(n/1e3)}k`;
      return `${s}${cur}${Math.round(n)}`;
    }
    
    const FLAG_COLORS = {
      stockout:['var(--red)','var(--redBg)'], reorder:['var(--amber)','var(--amberBg)'], overstock:['var(--blue)','var(--blueBg)'],
      healthy:['var(--green)','var(--greenBg)'], dormant:['var(--textSubtle)','var(--border)'],
      growing:['var(--green)','var(--greenBg)'], watch:['var(--amber)','var(--amberBg)'], declining:['var(--red)','var(--redBg)'], flat:['var(--textSubtle)','var(--border)'],
      oversubscribed:['var(--amber)','var(--amberBg)'], under:['var(--red)','var(--redBg)'], scaling:['var(--blue)','var(--blueBg)'],
    };
    
    // ============================ ANALYSIS ============================
    function computeAnalysis(E, D, props, overrides = {}) {
      const mode = D.META.mode, season = D.META.season || 12, horizon = props.forecastHorizon ?? (D.META.horizon || 6);
      const cur = D.META.currency || '£';
      const useDrivers = !!(D.DRIVERS && D.DRIVERS.exogKeys);
    
      const ents = D.ENTITIES.map(en => {
        const ov = overrides[en.id] || {};
        const ap = ov.appended || [];
        const y = ap.length ? [...en.series, ...ap] : en.series;
        const wantExog = useDrivers && en.useDrivers && ap.length === 0;
        const exog = wantExog ? driverObj(D.DRIVERS, D.DRIVERS.exogKeys) : null;
        const exogF = wantExog ? driverObj(D.FUTURE, D.DRIVERS.exogKeys) : null;
        const sel = E.autoSelect(y, { season, exog, horizon: 3, folds: 4, models: D.MODEL_POLICY.modelKeys, intermittent: en.intermittent });
        const cn = sel.champion ? sel.champion.name : 'Seasonal naive';
        const fc = E.buildForecast(y, cn, { season, horizon, exog, exogFuture: exogF });
        const base = { id: en.id, name: en.name, subtitle: en.subtitle || en.style || '', category: en.category || '', series: y, baseLen: en.series.length, appended: ap.length,
          champ: cn, champWape: sel.champion ? sel.champion.metrics.wape : null, ranking: sel.ranking, fc, reason: sel.reason, nextForecast: fc.point[0], note: en.note || '', raw: en, ov };
        return deriveEntity(mode, base, en, ov, E, D, horizon);
      });
    
      const totals = deriveTotals(mode, ents, D, horizon);
      const alerts = deriveAlerts(mode, ents, totals, D);
      return { mode, horizon, cur, ents, skus: ents, totals, alerts, P: periodInfo(D), heroDefault: props.heroSku || D.ENTITIES[0].id };
    }
    
    function driverObj(src, keys) { const o = {}; keys.forEach(k => { o[k] = src[k].map ? src[k] : src[k]; }); return o; }
    
    function deriveEntity(mode, b, en, ov, E, D, horizon) {
      const P = periodInfo(D);
      if (mode === 'inventory') {
        const onHand = ov.onHand != null ? ov.onHand : en.onHand;
        const onOrder = ov.onOrder != null ? ov.onOrder : en.onOrder;
        const lm = P.leadToPeriods(en.leadTimeWeeks), av = onHand + onOrder;   // lead time expressed in forecast periods
        const cover = E.monthsOfCover(av, b.fc.point);                         // periods of cover (weeks when weekly, else months)
        const ro = E.reorderQty({ onHand, onOrder, forecast: b.fc.point, leadTimeMonths: lm, reviewMonths: 1, sigma: b.fc.sigma });
        const nm = Math.max(...b.fc.point), dormant = b.fc.point[0] < Math.max(25, 0.18 * nm);
        let flag; if (dormant) flag = 'dormant'; else if (cover < lm + P.stockSlack) flag = 'stockout'; else if (cover < P.reorderT) flag = 'reorder'; else if (cover > P.overstockT) flag = 'overstock'; else flag = 'healthy';
        const pd = b.fc.point[0] / P.days, dc = pd > 0 ? av / pd : 99;
        const yl = P.seasonPerYear;
        const yoY = b.series.length > yl+1 && b.series[b.series.length-1-yl] > 0 ? (b.series[b.series.length-1]/b.series[b.series.length-1-yl]-1)*100 : null;
        return { ...b, onHand, onOrder, baseOnHand: en.onHand, baseOnOrder: en.onOrder, leadTimeWeeks: en.leadTimeWeeks, shelfLifeMonths: en.shelfLifeMonths, price: en.price, unitMargin: en.unitMargin, contributor: en.brewed !== false, cover, ro, flag, leadM: lm, daysCover: dc, yoY, avail: av };
      }
      if (mode === 'subscription') {
        const churn = ov.churn != null ? ov.churn : en.churnPct;    // monthly logo churn %
        const nextMRR = b.fc.point[0];
        const yoY = b.series.length > 12 && b.series[b.series.length-13] > 0 ? (b.series[b.series.length-1]/b.series[b.series.length-13]-1)*100 : null;
        const mom = b.series.length > 1 && b.series[b.series.length-2] > 0 ? (b.series[b.series.length-1]/b.series[b.series.length-2]-1)*100 : 0;
        let flag; if (churn > 4) flag = 'declining'; else if (mom < 0.5) flag = 'watch'; else flag = 'growing';
        return { ...b, churn, nextMRR, yoY, mom, arr: nextMRR * 12, flag, price: 1, unitMargin: (en.grossMargin ?? 0.8) };
      }
      // capacity (education)
      const cap = ov.capacity != null ? ov.capacity : en.capacityPerIntake;
      const nextEnrol = b.fc.point[0];
      const util = cap > 0 ? nextEnrol / cap : 0;
      const tutors = Math.ceil(nextEnrol / (en.studentsPerTutor || 18));
      let flag; if (util > 1) flag = 'oversubscribed'; else if (util < 0.55) flag = 'under'; else flag = 'healthy';
      const yoY = b.series.length > 12 && b.series[b.series.length-13] > 0 ? (b.series[b.series.length-1]/b.series[b.series.length-13]-1)*100 : null;
      return { ...b, capacity: cap, baseCapacity: en.capacityPerIntake, nextEnrol, util, tutors, studentsPerTutor: en.studentsPerTutor || 18, fee: en.fee, completion: en.completion, flag, yoY };
    }
    
    function deriveTotals(mode, ents, D, horizon) {
      const sum = a => a.reduce((t,x)=>t+x,0);
      if (mode === 'inventory') {
        const rev6 = ents.reduce((t,x)=>t+sum(x.fc.point)*x.price,0);
        const mar6 = ents.reduce((t,x)=>t+sum(x.fc.point)*x.unitMargin,0);
        const p6 = ents.reduce((t,x)=>t+sum(x.series.slice(-horizon))*x.price,0);
        const load = ents.filter(x=>x.contributor).reduce((t,x)=>t+x.fc.point[0],0);
        const capVal = D.META.capacity ? D.META.capacity.value : 0;
        return { rev6, mar6, marPct: mar6/rev6, revD: p6?(rev6-p6)/p6*100:0, atRisk: ents.filter(x=>x.flag==='stockout').length, load, capUtil: capVal?load/capVal:0 };
      }
      if (mode === 'subscription') {
        const mrrNow = ents.reduce((t,x)=>t+x.series[x.series.length-1],0);
        const mrrNext = ents.reduce((t,x)=>t+x.nextMRR,0);
        const mrrEnd = ents.reduce((t,x)=>t+x.fc.point[x.fc.point.length-1],0);
        const blendedChurn = ents.reduce((t,x)=>t+x.churn*x.series[x.series.length-1],0)/(mrrNow||1);
        const burn = D.META.burn || 0, cash = D.META.cash || 0;
        const netNew = mrrNext - mrrNow;
        const runway = burn>0 ? cash / burn : 99;
        return { mrrNow, mrrNext, arr: mrrNext*12, mrrEnd, arrEnd: mrrEnd*12, blendedChurn, runway, burn, cash, netNew, nrr: 100 - blendedChurn*12 + (D.META.expansion||0) };
      }
      // capacity
      const enrolNext = ents.reduce((t,x)=>t+x.nextEnrol,0);
      const rev6 = ents.reduce((t,x)=>t+sum(x.fc.point)*x.fee,0);
      const tutors = ents.reduce((t,x)=>t+x.tutors,0);
      const tutorCap = D.META.capacity ? D.META.capacity.value : 0;
      const oversub = ents.filter(x=>x.flag==='oversubscribed').length;
      return { enrolNext, rev6, tutors, tutorCap, tutorUtil: tutorCap?tutors/tutorCap:0, oversub, atRisk: ents.filter(x=>x.flag==='under').length };
    }
    
    function deriveAlerts(mode, ents, totals, D) {
      const cur = D.META.currency || '£', out = [], P = periodInfo(D);
      if (mode === 'inventory') {
        const so = ents.filter(e=>e.flag==='stockout').sort((a,b)=>a.cover-b.cover)[0];
        if (so) { const sh = Math.max(0, Math.round(so.leadTimeWeeks*7 - so.daysCover)); out.push({ tone:'red', head:`Stock-out risk — ${so.name}`, body:`Cover is ${so.cover.toFixed(1)} ${P.plural}. At the forecast (${fmtI(so.nextForecast)} ${unitOf(so,D)} next ${P.noun}), on-hand + on-order of ${fmtI(so.avail)} runs out ~${sh} days before the next delivery. Order ${fmtI(so.ro.qty)} now.` }); }
        if (D.META.capacity && totals.capUtil > 0.98) out.push({ tone:'amber', head:`${D.META.capacity.label} exceeded`, body:`Next-${P.noun} load is ${fmtI(totals.load)} ${D.META.capacity.unit||'units'} against ${fmtI(D.META.capacity.value)} of capacity (${Math.round(totals.capUtil*100)}%). Prioritise the highest-margin lines; push slower ones back.` });
        const grow = ents.filter(e=>e.yoY!=null).sort((a,b)=>b.yoY-a.yoY)[0];
        if (grow && grow.yoY > 15) out.push({ tone:'amber', head:`Fast growth — ${grow.name}`, body:`Demand up ${grow.yoY.toFixed(0)}% YoY. Reorder ${fmtI(grow.ro.qty)} and make sure supply keeps pace with the trend.` });
        const over = ents.filter(e=>e.flag==='overstock').sort((a,b)=>b.cover-a.cover)[0];
        if (over) out.push({ tone:'blue', head:`Overstock — ${over.name}`, body:`Cover is ${over.cover.toFixed(1)} ${P.plural} at the seasonal low — about ${money(cur, over.onHand*(over.price-over.unitMargin))} of cash tied up. Hold or promote; don't reorder yet.` });
        out.push({ tone:'green', head:'Model check', body:`Each line's champion is chosen by rolling-origin back-test from the ${D.META.industry} model policy — not one global model. Baselines run every time as an honesty check.` });
      } else if (mode === 'subscription') {
        if (totals.runway < 12) out.push({ tone:'red', head:'Cash runway is tightening', body:`At the current burn of ${money(cur, totals.burn)}/mo, ${money(cur, totals.cash)} of cash lasts ~${totals.runway.toFixed(0)} months. Close pipeline or trim burn before then.` });
        if (totals.blendedChurn > 3.5) out.push({ tone:'amber', head:'Churn above target', body:`Blended monthly churn is ${totals.blendedChurn.toFixed(1)}%. At this rate net revenue retention is ~${totals.nrr.toFixed(0)}% — expansion is only just offsetting losses.` });
        const dec = ents.filter(e=>e.flag==='declining')[0];
        if (dec) out.push({ tone:'red', head:`Segment at risk — ${dec.name}`, body:`${dec.name} is churning at ${dec.churn.toFixed(1)}%/mo. Its MRR contribution is shrinking; investigate onboarding and activation for this segment.` });
        const gr = ents.slice().sort((a,b)=>b.mom-a.mom)[0];
        if (gr) out.push({ tone:'green', head:`Fastest grower — ${gr.name}`, body:`${gr.name} MRR is compounding ~${gr.mom.toFixed(1)}%/mo. Forecast ${money(cur, gr.nextMRR)} next month — worth concentrating acquisition spend here.` });
      } else {
        if (totals.tutorUtil > 1) out.push({ tone:'red', head:'Tutor capacity exceeded', body:`Forecast intake needs ~${totals.tutors} tutors against ${totals.tutorCap} available (${Math.round(totals.tutorUtil*100)}%). Hire or cap enrolment on the oversubscribed courses.` });
        const os = ents.filter(e=>e.flag==='oversubscribed')[0];
        if (os) out.push({ tone:'amber', head:`Oversubscribed — ${os.name}`, body:`Forecast enrolment ${fmtI(os.nextEnrol)} vs ${fmtI(os.capacity)} seats (${Math.round(os.util*100)}%). Open a second cohort or add a tutor.` });
        const un = ents.filter(e=>e.flag==='under').sort((a,b)=>a.util-b.util)[0];
        if (un) out.push({ tone:'blue', head:`Under-enrolled — ${un.name}`, body:`Forecast ${fmtI(un.nextEnrol)} vs ${fmtI(un.capacity)} seats (${Math.round(un.util*100)}%). Consider marketing spend or merging the intake to protect course profitability.` });
        out.push({ tone:'green', head:'Model check', body:`Enrolment is forecast per course with the education model policy (seasonal + regression on leads/marketing). Thin-history courses fall back to conservative baselines.` });
      }
      return out;
    }
    
    function unitOf(e, D) { return D.META.unit || 'units'; }
    
    // ============================ CHARTS ============================
    function chart(cfg, t) {
      const el = React.createElement;
      const W = cfg.width || 720, H = cfg.height || 260, pL = 48, pR = 14, pT = 14, pB = 26;
      const hist = cfg.history, fc = cfg.forecast, pi80 = cfg.pi80, pi95 = cfg.pi95, alt = cfg.alt;
      const n = hist.length + fc.length;
      let ymin, ymax;
      if (cfg.yDomain) { ymin = cfg.yDomain[0]; ymax = cfg.yDomain[1]; }
      else { const v=[...hist,...fc,...pi95.map(p=>p.hi),...pi95.map(p=>p.lo)]; if(alt)v.push(...alt); ymin=Math.min(...v); ymax=Math.max(...v); const pd=(ymax-ymin)*0.14||1; ymin=Math.max(0,ymin-pd); ymax+=pd; }
      const X = i => pL + (i/(n-1))*(W-pL-pR);
      const Y = v => pT + (1-(v-ymin)/(ymax-ymin))*(H-pT-pB);
      const hi = hist.length - 1;
      const fmt = cfg.fmtY || fmtI;
      const path = pts => pts.map((p,i)=>(i?'L':'M')+X(p[0]).toFixed(1)+' '+Y(p[1]).toFixed(1)).join(' ');
      const band = b => { const top=[[hi,hist[hi]],...b.map((p,k)=>[hi+1+k,p.hi])]; const bot=[...b.map((p,k)=>[hi+1+k,p.lo]).reverse(),[hi,hist[hi]]]; return path(top)+' '+bot.map(p=>'L'+X(p[0]).toFixed(1)+' '+Y(p[1]).toFixed(1)).join(' ')+' Z'; };
      const c = [];
      for (let g=0;g<=4;g++){const v=ymin+(ymax-ymin)*g/4,y=Y(v);c.push(el('line',{key:'g'+g,x1:pL,x2:W-pR,y1:y,y2:y,stroke:t.grid,strokeWidth:1}));c.push(el('text',{key:'gt'+g,x:pL-6,y:y+3,textAnchor:'end',fontSize:9,fill:t.axis,fontFamily:t.mono},fmt(v)));}
      c.push(el('path',{key:'b95',d:band(pi95),fill:t.band95}));
      c.push(el('path',{key:'b80',d:band(pi80),fill:t.band80}));
      c.push(el('line',{key:'now',x1:X(hi),x2:X(hi),y1:pT,y2:H-pB,stroke:t.now,strokeWidth:1.4,strokeDasharray:'3 3'}));
      c.push(el('text',{key:'nl',x:X(hi)-4,y:pT+9,textAnchor:'end',fontSize:8,fill:t.axis,fontFamily:t.mono},'actual'));
      c.push(el('text',{key:'fl',x:X(hi)+4,y:pT+9,textAnchor:'start',fontSize:8,fill:t.fc,fontFamily:t.mono},'forecast'));
      if (alt) c.push(el('path',{key:'alt',d:path([[hi,hist[hi]],...alt.map((v,k)=>[hi+1+k,v])]),fill:'none',stroke:t.alt,strokeWidth:1.4,strokeDasharray:'2 3',opacity:0.7}));
      c.push(el('path',{key:'h',d:path(hist.map((v,i)=>[i,v])),fill:'none',stroke:t.hist,strokeWidth:2}));
      c.push(el('path',{key:'f',d:path([[hi,hist[hi]],...fc.map((v,k)=>[hi+1+k,v])]),fill:'none',stroke:t.fc,strokeWidth:2.2,strokeDasharray:'5 4'}));
      c.push(el('circle',{key:'d',cx:X(hi),cy:Y(hist[hi]),r:cfg.entered?4.5:3.4,fill:cfg.entered?t.fc:t.hist,stroke:t.bg,strokeWidth:1.6}));
      const lbl=(i,x,a)=>el('text',{key:'x'+i,x:X(i),y:H-8,textAnchor:a,fontSize:9,fill:t.axis,fontFamily:t.mono},x);
      c.push(lbl(0,cfg.labels.first,'start'));c.push(lbl(hi,cfg.labels.now,'middle'));c.push(lbl(n-1,cfg.labels.last,'end'));
      return el('svg',{viewBox:`0 0 ${W} ${H}`,width:'100%',height:'100%',style:{display:'block'}},c);
    }
    
    function scenarioChart(hist, base, opt, con, labels, t, fmtY) {
      const el = React.createElement;
      const W=720,H=240,pL=48,pR=14,pT=14,pB=26,n=hist.length+base.length;
      const v=[...hist,...opt,...con]; let ymin=Math.min(...v),ymax=Math.max(...v); const pd=(ymax-ymin)*0.14||1; ymin=Math.max(0,ymin-pd); ymax+=pd;
      const X=i=>pL+(i/(n-1))*(W-pL-pR), Y=v=>pT+(1-(v-ymin)/(ymax-ymin))*(H-pT-pB), hi=hist.length-1;
      const path=pts=>pts.map((p,i)=>(i?'L':'M')+X(p[0]).toFixed(1)+' '+Y(p[1]).toFixed(1)).join(' ');
      const c=[]; const fmt=fmtY||fmtI;
      for(let g=0;g<=4;g++){const val=ymin+(ymax-ymin)*g/4,y=Y(val);c.push(el('line',{key:'g'+g,x1:pL,x2:W-pR,y1:y,y2:y,stroke:t.grid,strokeWidth:1}));c.push(el('text',{key:'t'+g,x:pL-6,y:y+3,textAnchor:'end',fontSize:9,fill:t.axis,fontFamily:t.mono},fmt(val)));}
      c.push(el('line',{key:'now',x1:X(hi),x2:X(hi),y1:pT,y2:H-pB,stroke:t.now,strokeWidth:1.4,strokeDasharray:'3 3'}));
      c.push(el('path',{key:'h',d:path(hist.map((v,i)=>[i,v])),fill:'none',stroke:t.hist,strokeWidth:2}));
      const mk=(arr,color,dash,key)=>c.push(el('path',{key,d:path([[hi,hist[hi]],...arr.map((v,k)=>[hi+1+k,v])]),fill:'none',stroke:color,strokeWidth:2,strokeDasharray:dash}));
      mk(base,t.fc,'5 4','fb');mk(opt,t.opt,'3 3','fo');mk(con,t.con,'3 3','fc2');
      const ly=pT+6, leg=(x,color,label,dash)=>[el('line',{key:'l'+label,x1:x,x2:x+16,y1:ly,y2:ly,stroke:color,strokeWidth:2,strokeDasharray:dash}),el('text',{key:'lt'+label,x:x+20,y:ly+3,fontSize:9,fill:t.axis,fontFamily:t.mono},label)];
      c.push(...leg(W-215,t.fc,'Base','5 4'));c.push(...leg(W-150,t.opt,'Optimistic','3 3'));c.push(...leg(W-62,t.con,'Consv','3 3'));
      const lbl=(i,x,a)=>el('text',{key:'x'+i,x:X(i),y:H-8,textAnchor:a,fontSize:9,fill:t.axis,fontFamily:t.mono},x);
      c.push(lbl(0,labels.first,'start'));c.push(lbl(hi,labels.now,'middle'));c.push(lbl(n-1,labels.last,'end'));
      return el('svg',{viewBox:`0 0 ${W} ${H}`,width:'100%',height:'100%',style:{display:'block'}},c);
    }
    
    // ============================ EXPLANATIONS ============================
    function defaultExpl(hero, entryMonth, mode, cur) {
      const w = hero.champWape != null ? hero.champWape.toFixed(1) : '—';
      const noun = mode === 'subscription' ? 'MRR' : mode === 'capacity' ? 'enrolment' : 'demand';
      const val = mode === 'subscription' ? money(cur, hero.nextForecast) : fmtI(hero.nextForecast);
      return { head: 'Base case forecast', tone: 'normal', body: `${hero.name} ${noun} is forecast at ${val} for ${entryMonth}, with a 95% band of ${mode==='subscription'?money(cur,hero.fc.pi95[0].lo)+'–'+money(cur,hero.fc.pi95[0].hi):fmtI(hero.fc.pi95[0].lo)+'–'+fmtI(hero.fc.pi95[0].hi)}. Champion is ${short(hero.champ)}, back-tested WAPE ${w}%. Enter an actual for ${entryMonth} above to watch the forecast recalibrate — and see exactly why it moved.` };
    }
    function explain(rc, V, hero, mode, cur) {
      const fmtv = mode === 'subscription' ? (x)=>money(cur,x) : fmtI;
      const base = Math.round(rc.priorNext), dir = rc.deltaPct >= 0 ? 'above' : 'below';
      const shift = `${rc.forecastShiftPct >= 0 ? '+' : ''}${rc.forecastShiftPct.toFixed(1)}%`;
      const champTxt = rc.championStillBest ? `still ${short(hero.champ)}` : `now ${short(rc.suggestedChampion)}`;
      if (rc.classification === 'normal') return { head:'Normal variation', tone:'normal', body:`${fmtv(V)} sits inside the expected range (base ${fmtv(base)}, 95% ${fmtv(hero.fc.pi95[0].lo)}–${fmtv(hero.fc.pi95[0].hi)}). The model reads it as ordinary noise — the forward path barely moves (${shift}) and the champion is ${champTxt}.` };
      if (rc.classification === 'anomalous') return { head:'Watch — outlier', tone:'anomalous', body:`${fmtv(V)} is ${Math.abs(rc.deltaPct).toFixed(0)}% ${dir} the base forecast of ${fmtv(base)} and near the edge of the 95% band (z=${rc.z}). The level shifts ${dir==='above'?'up':'down'} and the forecast moves ${shift}. One reading — wait for a second before calling a trend. Champion ${champTxt}.` };
      const verb = dir === 'above' ? 'raises' : 'lowers';
      return { head:'Structural shift', tone:'structural', body:`${fmtv(V)} is ${Math.abs(rc.deltaPct).toFixed(0)}% ${dir} the base forecast of ${fmtv(base)} and outside the 95% band. The model ${verb} the level and re-weights recent periods; the forward forecast moves ${shift}. Champion re-checked: ${champTxt}.` };
    }
    
    // ============================ DETAIL DRAWER ============================
    function buildDetail(desc, A, D) {
      const cur = A.cur, mode = A.mode, [type, key] = desc.split(':');
      if (type === 'capacity' && D.META.capacity) {
        const contribs = A.ents.filter(e => mode==='inventory' ? e.contributor : true);
        const load = mode==='inventory'?A.totals.load:mode==='capacity'?A.totals.tutors:A.totals.mrrNext;
        return { title: D.META.capacity.label, subtitle: 'Constraint', tagLabel: A.totals.capUtil>1||A.totals.tutorUtil>1?'Over capacity':'Within capacity', tagColor: (A.totals.capUtil>1||A.totals.tutorUtil>1)?'var(--red)':'var(--green)',
          lead: `${D.META.capacity.label} is running at ${Math.round((A.totals.capUtil||A.totals.tutorUtil)*100)}% of ${fmtI(D.META.capacity.value)} ${D.META.capacity.unit||''}.`,
          metrics: [ {label:'Required',value:fmtI(load),sub:D.META.capacity.unit||''},{label:'Capacity',value:fmtI(D.META.capacity.value),sub:D.META.capacity.unit||''},{label:'Utilisation',value:Math.round((A.totals.capUtil||A.totals.tutorUtil)*100)+'%',sub:''} ],
          stepsTitle:'By line', steps: contribs.map(e=>({label:e.name, value: fmtI(mode==='capacity'?e.tutors:e.fc.point[0])})), notes:['Prioritise the highest-value lines when demand exceeds what you can supply.'] };
      }
      if (type === 'kpi') return kpiDetail(key, A, D);
      const s = A.ents.find(e => e.id === key);
      if (!s) return null;
      if (mode === 'inventory') return invDetail(s, A, D);
      if (mode === 'subscription') return subDetail(s, A, D);
      return capDetail(s, A, D);
    }
    function kpiDetail(key, A, D) {
      const cur = A.cur, mode = A.mode, sum = a => a.reduce((t,x)=>t+x,0), P = A.P || periodInfo(D);
    
      // ---- inventory: revenue / margin build-up ----
      if (mode==='inventory' && (key==='rev'||key==='mar')) {
        const rev = key==='rev';
        const contrib = A.ents.map(s=>{const q=sum(s.fc.point);return {name:s.name, units:q, val:q*(rev?s.price:s.unitMargin)};}).sort((a,b)=>b.val-a.val);
        const total = contrib.reduce((t,c)=>t+c.val,0);
        return { title:(rev?'Forecast revenue':'Forecast margin')+' · next '+A.horizon+' '+P.plural, subtitle:'How it is built up', tagLabel:'Σ all lines', tagColor:'var(--accent)', lead:`${rev?'Revenue':'Margin'} = Σ (forecast demand × ${rev?'price':'unit margin'}) across ${A.horizon} ${P.plural} — each line on its own champion model.`, metrics:[{label:'Total '+(rev?'revenue':'margin'),value:money(cur,total),sub:A.horizon+' '+P.unit},{label:'Lines',value:String(A.ents.length),sub:''},{label:'Blended margin',value:A.totals.marPct?Math.round(A.totals.marPct*100)+'%':'—',sub:'of revenue'}], stepsTitle:'Contribution by line', steps:contrib.map(c=>({label:`${c.name} · ${fmtI(c.units)} ${D.META.unit||'units'}`,value:money(cur,c.val)})), notes:['Each line uses its own champion forecast — edit any line and this updates immediately.'] };
      }
    
      // ---- inventory: WHY these lines are at stock-out risk ----
      if (mode==='inventory' && key==='stockout') {
        const risky = A.ents.filter(e=>e.flag==='stockout'||e.flag==='reorder').sort((a,b)=>a.cover-b.cover);
        const exposure = A.ents.filter(e=>e.flag==='stockout').reduce((t,e)=>t+e.nextForecast*e.unitMargin,0);
        const w = risky[0];
        return { title:'Lines at stock-out risk', subtitle:'Why they are at risk', tagLabel:`${A.totals.atRisk} of ${A.ents.length}`, tagColor:A.totals.atRisk?'var(--red)':'var(--green)',
          lead:`A line is flagged when stock cover falls below its supplier lead time — it will run dry before the next delivery can land. ${money(cur,exposure)} of ${P.noun}ly gross margin is exposed across flagged lines.`,
          metrics:[{label:'At stock-out risk',value:String(A.totals.atRisk),sub:'below lead time'},{label:'Also low',value:String(risky.filter(e=>e.flag==='reorder').length),sub:'reorder soon'},{label:'Margin exposed',value:money(cur,exposure),sub:'per '+P.noun}],
          stepsTitle:'Flagged lines — cover vs lead time', steps: risky.length? risky.map(e=>({label:`${e.name} · cover ${e.cover.toFixed(1)} ${P.unit} vs ${P.leadToPeriods(e.leadTimeWeeks).toFixed(1)} ${P.unit} lead`, value:`order ${fmtI(e.ro.qty)}`})) : [{label:'No lines below lead time',value:'all healthy'}],
          notes: w? [`Worst: ${w.name} — stock covers ~${Math.round(w.daysCover)} days but the lead time is ${w.leadTimeWeeks*7} days, so it runs dry ~${Math.max(0,Math.round(w.leadTimeWeeks*7-w.daysCover))} days before a re-order lands.`, 'Click any line in the table below for its full reorder calculation.'] : ['Every line currently has cover above its lead time — nothing at risk.'] };
      }
    
      // ---- subscription ----
      if (mode==='subscription') {
        if (key==='mrr'||key==='rev'||key==='arr') {
          const seg = A.ents.map(s=>({name:s.name, mrr:s.nextMRR})).sort((a,b)=>b.mrr-a.mrr);
          return { title:(key==='arr'?'ARR run-rate':'MRR forecast')+' · next month', subtitle:'By segment', tagLabel:'Σ segments', tagColor:'var(--accent)',
            lead:`${key==='arr'?'ARR = next-month MRR × 12.':'MRR = Σ forecast recurring revenue across segments.'} Net new is next month minus the latest actual.`,
            metrics:[{label:'MRR next month',value:money(cur,A.totals.mrrNext),sub:`${A.totals.netNew>=0?'+':''}${money(cur,A.totals.netNew)} net new`},{label:'ARR run-rate',value:money(cur,A.totals.arr),sub:'×12'},{label:'End of horizon',value:money(cur,A.totals.arrEnd),sub:A.horizon+' mo ARR'}],
            stepsTitle:'MRR by segment', steps: seg.map(s=>({label:s.name,value:money(cur,s.mrr)})), notes:['Each segment forecast on its own champion; expansion and churn are embedded in each segment history.'] };
        }
        if (key==='churn') {
          const seg = A.ents.slice().sort((a,b)=>b.churn-a.churn);
          return { title:'Blended churn', subtitle:'By segment (MRR-weighted)', tagLabel:A.totals.blendedChurn>3.5?'Above target':'On target', tagColor:A.totals.blendedChurn>3.5?'var(--amber)':'var(--green)',
            lead:`Blended monthly logo churn, weighted by each segment's MRR. Net revenue retention is ~${A.totals.nrr.toFixed(0)}% after expansion.`,
            metrics:[{label:'Blended churn',value:A.totals.blendedChurn.toFixed(1)+'%',sub:'per month'},{label:'NRR',value:A.totals.nrr.toFixed(0)+'%',sub:'net revenue retention'},{label:'Segments',value:String(A.ents.length),sub:''}],
            stepsTitle:'Monthly churn by segment', steps: seg.map(s=>({label:s.name,value:s.churn.toFixed(1)+'%'})), notes:['Segments above ~4%/mo erode more than expansion adds — prioritise their onboarding and activation.'] };
        }
        if (key==='runway') {
          return { title:'Cash runway', subtitle:'Months of cash at current burn', tagLabel:A.totals.runway<12?'Tightening':'Comfortable', tagColor:A.totals.runway<12?'var(--red)':'var(--green)',
            lead:`Runway = cash ÷ net monthly burn. At ${money(cur,A.totals.burn)}/mo, ${money(cur,A.totals.cash)} lasts ~${A.totals.runway.toFixed(0)} months.`,
            metrics:[{label:'Cash',value:money(cur,A.totals.cash),sub:'on balance sheet'},{label:'Net burn',value:money(cur,A.totals.burn),sub:'per month'},{label:'Runway',value:A.totals.runway>90?'—':A.totals.runway.toFixed(0)+' mo',sub:'at current burn'}],
            stepsTitle:'What extends it', steps:[{label:'Net new MRR / mo',value:money(cur,A.totals.netNew)},{label:'MRR at end of horizon',value:money(cur,A.totals.mrrEnd)},{label:'Implied ARR then',value:money(cur,A.totals.arrEnd)}], notes:['Growing net-new MRR reduces burn over time; this figure holds burn flat as a conservative floor.'] };
        }
      }
    
      // ---- capacity (education) ----
      if (mode==='capacity') {
        if (key==='enrol'||key==='rev') {
          const seg = A.ents.map(s=>({name:s.name, enrol:s.nextEnrol, fee:s.fee})).sort((a,b)=>b.enrol-a.enrol);
          return { title:'Enrolment · next intake', subtitle:'By course', tagLabel:'Σ courses', tagColor:'var(--accent)',
            lead:`Total forecast enrolment across ${A.ents.length} courses. Fee revenue = enrolment × course fee.`,
            metrics:[{label:'Enrolment',value:fmtI(A.totals.enrolNext),sub:'next intake'},{label:'Fee revenue',value:money(cur,A.totals.rev6),sub:'horizon'},{label:'Courses',value:String(A.ents.length),sub:''}],
            stepsTitle:'Enrolment by course', steps: seg.map(s=>({label:`${s.name} · ${money(cur,s.fee)} fee`,value:fmtI(s.enrol)})), notes:['Each course forecast on its own champion; seasonality follows the academic calendar.'] };
        }
        if (key==='feerev') {
          const seg = A.ents.map(s=>({name:s.name, fee:sum(s.fc.point)*s.fee})).sort((a,b)=>b.fee-a.fee);
          const total = seg.reduce((t,s)=>t+s.fee,0);
          return { title:'Fee revenue · horizon', subtitle:'By course', tagLabel:'Σ courses', tagColor:'var(--accent)', lead:`Fee revenue = Σ (forecast enrolment × fee) across ${A.horizon} months.`, metrics:[{label:'Total fees',value:money(cur,total),sub:A.horizon+' mo'},{label:'Courses',value:String(A.ents.length),sub:''},{label:'Enrolment',value:fmtI(A.totals.enrolNext),sub:'next intake'}], stepsTitle:'Fee revenue by course', steps: seg.map(s=>({label:s.name,value:money(cur,s.fee)})), notes:['Edit any course capacity or add an actual to update this.'] };
        }
        if (key==='oversub') {
          const os=A.ents.filter(e=>e.flag==='oversubscribed'), un=A.ents.filter(e=>e.flag==='under');
          return { title:'Courses over / under', subtitle:'Utilisation extremes', tagLabel:`${os.length} over · ${un.length} under`, tagColor:os.length?'var(--amber)':'var(--green)', lead:'Courses forecast above 100% of seats are oversubscribed; below ~55% are under-enrolled and at risk on profitability.', metrics:[{label:'Oversubscribed',value:String(os.length),sub:'>100% seats'},{label:'Under-enrolled',value:String(un.length),sub:'<55% seats'},{label:'Tutor util',value:Math.round(A.totals.tutorUtil*100)+'%',sub:''}], stepsTitle:'Utilisation by course', steps:A.ents.slice().sort((a,b)=>b.util-a.util).map(e=>({label:e.name,value:Math.round(e.util*100)+'%'})), notes:['Open cohorts for oversubscribed courses; market or merge under-enrolled ones.'] };
        }
      }
    
      return { title:'Metric detail', subtitle:'', tagLabel:'', tagColor:'var(--accent)', lead:'Derived from the champion forecast across all lines.', metrics:[], stepsTitle:'', steps:[], notes:[] };
    }
    function invDetail(s, A, D) {
      const cur = A.cur, u = D.META.unit || 'units', P = periodInfo(D);
      const marginRisk = s.nextForecast * s.unitMargin, tied = s.onHand * (s.price - s.unitMargin);
      const FT={stockout:'Stock-out risk',reorder:'Reorder',overstock:'Overstock',healthy:'Healthy',dormant:'Off-season'};
      const FC={stockout:'var(--red)',reorder:'var(--amber)',overstock:'var(--blue)',healthy:'var(--green)',dormant:'var(--textSubtle)'};
      return { title:s.name, subtitle:`${s.subtitle} · ${s.category}`, tagLabel:FT[s.flag], tagColor:FC[s.flag], lead:'',
        metrics:[ {label:`Next-${P.noun} forecast`,value:fmtI(s.nextForecast),sub:`95%: ${fmtI(s.fc.pi95[0].lo)}–${fmtI(s.fc.pi95[0].hi)}`},{label:'Stock cover',value:s.flag==='dormant'?'—':s.cover.toFixed(1)+' '+P.unit,sub:`lead ${s.leadTimeWeeks}wk`},{label:'On-hand + on-order',value:fmtI(s.avail),sub:`${fmtI(s.onHand)} + ${fmtI(s.onOrder)}`},{label:s.flag==='overstock'?'Cash tied up':'Margin at risk',value:s.flag==='overstock'?money(cur,tied):money(cur,marginRisk),sub:s.flag==='overstock'?'working capital':'per '+P.noun} ],
        stepsTitle:'How the reorder is calculated', steps:[ {label:'Champion model',value:short(s.champ)+(s.champWape!=null?` · WAPE ${s.champWape.toFixed(1)}%`:'')},{label:'Demand over lead + review',value:fmtI(s.ro.demand)+' '+u},{label:'Safety stock (z·σ·√h, 95%)',value:'+ '+fmtI(s.ro.safety)},{label:'Target stock level',value:fmtI(s.ro.demand+s.ro.safety)},{label:'Less on-hand + on-order',value:'− '+fmtI(s.avail)},{label:'Recommended order',value:fmtI(s.ro.qty)+' '+u} ],
        notes:[ s.flag==='stockout'?`Why it's at risk: at the forecast, stock covers ~${Math.round(s.daysCover)} days but the lead time is ${s.leadTimeWeeks*7} days — so it runs dry ~${Math.max(0,Math.round(s.leadTimeWeeks*7-s.daysCover))} days before a re-order lands. The ${money(cur,marginRisk)} at risk is one ${P.noun} of gross margin exposed.`:'', s.flag==='overstock'?`Why it's tied up: cover is ${s.cover.toFixed(1)} ${P.plural} at the seasonal low, so ${money(cur,tied)} of working capital sits in stock. Shelf life ${s.shelfLifeMonths} mo — it won't spoil, but the cash is locked up.`:'', s.reason?'Model choice: '+s.reason:'', s.note ].filter(Boolean) };
    }
    function subDetail(s, A, D) {
      const cur = A.cur;
      const FT={growing:'Growing',watch:'Watch',declining:'At risk',flat:'Flat'}, FC={growing:'var(--green)',watch:'var(--amber)',declining:'var(--red)',flat:'var(--textSubtle)'};
      return { title:s.name, subtitle:`${s.subtitle} · segment`, tagLabel:FT[s.flag], tagColor:FC[s.flag], lead:'',
        metrics:[ {label:'Forecast MRR (next mo)',value:money(cur,s.nextMRR),sub:`95%: ${money(cur,s.fc.pi95[0].lo)}–${money(cur,s.fc.pi95[0].hi)}`},{label:'Implied ARR',value:money(cur,s.arr),sub:'×12'},{label:'Monthly churn',value:s.churn.toFixed(1)+'%',sub:'logo'},{label:'MoM growth',value:(s.mom>=0?'+':'')+s.mom.toFixed(1)+'%',sub:'last period'} ],
        stepsTitle:'How the forecast is built', steps:[ {label:'Champion model',value:short(s.champ)+(s.champWape!=null?` · WAPE ${s.champWape.toFixed(1)}%`:'')},{label:'Latest MRR',value:money(cur,s.series[s.series.length-1])},{label:'Forecast next month',value:money(cur,s.nextMRR)},{label:'Churn drag',value:'−'+s.churn.toFixed(1)+'%/mo'} ],
        notes:[ s.flag==='declining'?`At ${s.churn.toFixed(1)}% monthly churn this segment loses more than it adds — its MRR line is bending down. Fix activation/onboarding here first.`:`Growing ~${s.mom.toFixed(1)}%/mo. `, s.reason?'Model choice: '+s.reason:'', s.note ].filter(Boolean) };
    }
    function capDetail(s, A, D) {
      const cur = A.cur;
      const FT={oversubscribed:'Oversubscribed',healthy:'Healthy',under:'Under-enrolled'}, FC={oversubscribed:'var(--amber)',healthy:'var(--green)',under:'var(--red)'};
      return { title:s.name, subtitle:`${s.subtitle} · course`, tagLabel:FT[s.flag], tagColor:FC[s.flag], lead:'',
        metrics:[ {label:'Forecast enrolment',value:fmtI(s.nextEnrol),sub:`95%: ${fmtI(s.fc.pi95[0].lo)}–${fmtI(s.fc.pi95[0].hi)}`},{label:'Seat utilisation',value:Math.round(s.util*100)+'%',sub:`${fmtI(s.capacity)} seats`},{label:'Tutors needed',value:String(s.tutors),sub:`1:${s.studentsPerTutor}`},{label:'Fee revenue',value:money(cur,s.nextEnrol*s.fee),sub:'this intake'} ],
        stepsTitle:'How enrolment is forecast', steps:[ {label:'Champion model',value:short(s.champ)+(s.champWape!=null?` · WAPE ${s.champWape.toFixed(1)}%`:'')},{label:'Forecast enrolment',value:fmtI(s.nextEnrol)},{label:'Seat capacity',value:fmtI(s.capacity)},{label:'Tutors (1:'+s.studentsPerTutor+')',value:String(s.tutors)} ],
        notes:[ s.flag==='oversubscribed'?`Demand exceeds seats — open a second cohort or add a tutor, or you'll turn students away.`:s.flag==='under'?`Below break-even utilisation — a marketing push or merging intakes protects course profitability.`:`Healthy utilisation.`, s.reason?'Model choice: '+s.reason:'', s.note ].filter(Boolean) };
    }
    
    // ============================ REPORT ============================
    function devChart(actual, fitted, labels, t) {
      const el = React.createElement;
      const W=860,H=200,pL=50,pR=14,pT=16,pB=24,n=actual.length;
      const vals=actual.concat(fitted.filter(x=>!isNaN(x))); let ymin=Math.min(...vals),ymax=Math.max(...vals); const pd=(ymax-ymin)*0.14||1; ymin=Math.max(0,ymin-pd); ymax+=pd;
      const X=i=>pL+(i/(n-1))*(W-pL-pR), Y=v=>pT+(1-(v-ymin)/(ymax-ymin))*(H-pT-pB);
      const path=pts=>pts.map((p,i)=>(i?'L':'M')+X(p[0]).toFixed(1)+' '+Y(p[1]).toFixed(1)).join(' ');
      const c=[];
      for(let g=0;g<=3;g++){const v=ymin+(ymax-ymin)*g/3,y=Y(v);c.push(el('line',{key:'g'+g,x1:pL,x2:W-pR,y1:y,y2:y,stroke:t.grid,strokeWidth:1}));c.push(el('text',{key:'t'+g,x:pL-6,y:y+3,textAnchor:'end',fontSize:9,fill:t.axis,fontFamily:t.mono},fmtI(v)));}
      actual.forEach((a,i)=>{ if(!isNaN(fitted[i])) c.push(el('line',{key:'d'+i,x1:X(i),x2:X(i),y1:Y(a),y2:Y(fitted[i]),stroke:t.con,strokeWidth:1,opacity:0.3})); });
      c.push(el('path',{key:'fit',d:path(actual.map((_,i)=>[i,fitted[i]]).filter(p=>!isNaN(p[1]))),fill:'none',stroke:t.fc,strokeWidth:1.6,strokeDasharray:'4 3'}));
      c.push(el('path',{key:'act',d:path(actual.map((v,i)=>[i,v])),fill:'none',stroke:t.hist,strokeWidth:2}));
      c.push(el('text',{key:'la',x:pL,y:pT+7,fontSize:8,fill:t.hist,fontFamily:t.mono},'— actual'));
      c.push(el('text',{key:'lf',x:pL+52,y:pT+7,fontSize:8,fill:t.fc,fontFamily:t.mono},'-- model fit'));
      c.push(el('text',{key:'x0',x:X(0),y:H-7,textAnchor:'start',fontSize:9,fill:t.axis,fontFamily:t.mono},labels.first));
      c.push(el('text',{key:'x1',x:X(n-1),y:H-7,textAnchor:'end',fontSize:9,fill:t.axis,fontFamily:t.mono},labels.last));
      return el('svg',{viewBox:`0 0 ${W} ${H}`,width:'100%',height:'100%',style:{display:'block'}},c);
    }
    function buildReport(state, A, D, props) {
      const cur = A.cur, mode = A.mode, P = A.P || periodInfo(D);
      const periods = Object.fromEntries(P.reportPeriods.map(([k,,n])=>[k,n]));
      let pk = state.reportPeriod || 'quarter'; if (!(pk in periods)) pk = 'quarter';
      const h = Math.min(periods[pk], A.horizon);
      const periodLabel = P.periodTitle[pk] || 'Next quarter';
      const sum = a => a.slice(0,h).reduce((t,x)=>t+x,0);
      const rows = A.ents.map(e => {
        if (mode === 'subscription') return { name:e.name, expect: money(cur,e.fc.point[h-1])+' MRR', model: short(e.champ), note: e.flag==='declining'?'churn risk':'on trend' };
        if (mode === 'capacity') return { name:e.name, expect: fmtI(sum(e.fc.point))+' enrol', model: short(e.champ), note: e.flag==='oversubscribed'?'over capacity':e.flag==='under'?'under-enrolled':'on track' };
        return { name:e.name, expect: fmtI(sum(e.fc.point))+' '+(D.META.unit||'units'), model: short(e.champ), note: e.flag };
      });
      // recommendations = imperative actions
      const recs = [];
      if (mode === 'inventory') {
        A.ents.filter(e=>e.flag==='stockout'||e.flag==='reorder').sort((a,b)=>a.cover-b.cover).forEach(e=>recs.push(`Increase ${e.name} orders by ${fmtI(e.ro.qty)} ${D.META.unit||'units'} to stay above the ${e.leadTimeWeeks}-week lead time (cover ${e.cover.toFixed(1)} ${P.unit}).`));
        A.ents.filter(e=>e.flag==='overstock').forEach(e=>recs.push(`Hold or promote ${e.name} — ${money(cur,e.onHand*(e.price-e.unitMargin))} of cash is tied up; do not reorder this cycle.`));
        if (D.META.capacity && A.totals.capUtil>1) recs.push(`${D.META.capacity.label} is at ${Math.round(A.totals.capUtil*100)}% — prioritise the highest-margin lines and defer slower ones.`);
      } else if (mode === 'subscription') {
        if (A.totals.runway<12) recs.push(`Extend runway: at ${money(cur,A.totals.burn)}/mo burn, cash lasts ~${A.totals.runway.toFixed(0)} months — raise or cut burn before then.`);
        if (A.totals.blendedChurn>3.5) recs.push(`Reduce blended churn from ${A.totals.blendedChurn.toFixed(1)}%/mo; every point improves NRR by ~12 pts/yr.`);
        A.ents.filter(e=>e.flag==='declining').forEach(e=>recs.push(`Stabilise ${e.name} (churning ${e.churn.toFixed(1)}%/mo) before scaling acquisition into it.`));
        const g=A.ents.slice().sort((a,b)=>b.mom-a.mom)[0]; if(g)recs.push(`Concentrate acquisition on ${g.name} — fastest compounder at ~${g.mom.toFixed(1)}%/mo.`);
      } else {
        A.ents.filter(e=>e.flag==='oversubscribed').forEach(e=>recs.push(`Open a second cohort or add a tutor for ${e.name} (forecast ${fmtI(e.nextEnrol)} vs ${fmtI(e.capacity)} seats).`));
        A.ents.filter(e=>e.flag==='under').forEach(e=>recs.push(`Add marketing spend or merge intakes for ${e.name} (only ${Math.round(e.util*100)}% of seats forecast to fill).`));
        if (A.totals.tutorUtil>1) recs.push(`Hire ~${Math.max(0,A.totals.tutors-A.totals.tutorCap)} more tutors — forecast intake exceeds current teaching capacity.`);
      }
      // review — how the champion tracked actuals over the back-test (deviation)
      const hero = A.ents.reduce((a,b)=>((b.series[b.series.length-1]||0)>(a.series[a.series.length-1]||0)?b:a), A.ents[0]);
      const win = Math.min(P.histWin, hero.series.length);
      const act = hero.series.slice(-win);
      const fit = (hero.fc.model && hero.fc.model.fitted ? hero.fc.model.fitted : []).slice(-win);
      const dark = state.mode === 'dark'; const ct = dark ? D.META.theme.chartDark : D.META.theme.chartLight;
      const dl = { first: P.labelAt(hero.series.length - win), last: P.labelAt(hero.series.length - 1) };
      const reviewChart = devChart(act, fit, dl, ct);
      let worst = 0, worstI = -1, biasSum = 0, cnt = 0;
      act.forEach((a, i) => { if (!isNaN(fit[i]) && a) { const d = (fit[i] - a) / a; biasSum += d; cnt++; if (Math.abs(d) > Math.abs(worst)) { worst = d; worstI = i; } } });
      const bias = cnt ? biasSum / cnt * 100 : 0;
      const w = hero.champWape != null ? hero.champWape.toFixed(1) : '—';
      const reviewNote = `Back-tested on ${hero.name}, the champion (${short(hero.champ)}) tracked actuals to within WAPE ${w}% with a ${bias>=0?'slight over':'slight under'}-forecast bias of ${Math.abs(bias).toFixed(1)}%. ${worstI>=0?`Largest single-${P.noun} deviation was ${worst>=0?'+':''}${(worst*100).toFixed(0)}% in ${P.labelAt(hero.series.length-win+worstI)}.`:'Deviations stay within tolerance.'} Newer lines with short histories carry wider intervals and lower confidence.`;
      return { periodLabel, periodKey: pk, generated: 'as of ' + P.labelAt(A.ents[0].series.length - 1), rows, recs, headline: reportHeadline(mode, A, cur), reviewChart, reviewNote, reviewName: hero.name };
    }
    function reportHeadline(mode, A, cur) {
      if (mode === 'subscription') return `${money(cur,A.totals.mrrNext)} MRR forecast next month (${money(cur,A.totals.arr)} ARR), blended churn ${A.totals.blendedChurn.toFixed(1)}%, ~${A.totals.runway.toFixed(0)} months runway.`;
      if (mode === 'capacity') return `${fmtI(A.totals.enrolNext)} enrolments forecast next intake, ${money(cur,A.totals.rev6)} fee revenue over the horizon, tutor utilisation ${Math.round(A.totals.tutorUtil*100)}%.`;
      return `${money(cur,A.totals.rev6)} revenue / ${money(cur,A.totals.mar6)} margin forecast over the horizon, ${A.totals.atRisk} line(s) at stock-out risk.`;
    }
    
    // ============================ RENDER MODEL ============================
    function buildRenderVals(state, props, E, D, handlers) {
      const dark = state.mode === 'dark', TH = D.META.theme;
      const vars = dark ? TH.dark : TH.light;
      const ct = dark ? TH.chartDark : TH.chartLight;
      const cur = D.META.currency || '£', mode = D.META.mode;
      const ws = vars + ';min-height:100vh;background:var(--bg);color:var(--text);font-family:IBM Plex Sans,sans-serif;transition:background .3s,color .3s';
      const horizon = props.forecastHorizon ?? (D.META.horizon || 6);
      const spread = props.scenarioSpread ?? 10;
      const sbtn = 'padding:6px 12px;border-radius:5px;font:600 11.5px/1 IBM Plex Sans,sans-serif;cursor:pointer;transition:.15s;border:1px solid ';
      const sOn = sbtn+'var(--textStrong);background:var(--textStrong);color:var(--card);', sOff = sbtn+'var(--border);background:transparent;color:var(--textMuted);';
      const fmtY = mode === 'subscription' ? (x)=>money(cur,x) : fmtI;
    
      const _cols = ({ inventory:['Next fc','Cover','Reorder'], subscription:['MRR next','Churn','MoM'], capacity:['Enrolment','Seat util','Tutors'] })[mode] || ['Next','A','B'];
      const base = { wrapperStyle: ws, colNext: _cols[0], col1: _cols[1], col2: _cols[2], modeIcon: dark?'☀':'☾', modeLabel: dark?'Switch to light mode':'Switch to dark mode',
        company: D.META.company, subtitle: D.META.subtitle, industryTag: D.META.industryTag, entityLabel: D.META.entityLabel || 'Lines', engineLine: D.MODEL_POLICY.headline,
        toggleMode: handlers.toggleMode, setBase: handlers.setBase, setOpt: handlers.setOpt, setCon: handlers.setCon, onActualInput: handlers.onActualInput, addActual: handlers.addActual, resetData: handlers.resetData, onHandInput: handlers.onHandInput, onOrderInput: handlers.onOrderInput, closeDetail: handlers.closeDetail, openReport: handlers.openReport, closeReport: handlers.closeReport, printReport: handlers.printReport,
        actual: state.actual, sBase: state.scenario==='base'?sOn:sOff, sOpt: state.scenario==='optimistic'?sOn:sOff, sCon: state.scenario==='conservative'?sOn:sOff };
    
      if (!state.analysis) return { ...base, kpis:[], heroName:'—', horizonLabel:horizon+' '+periodInfo(D).unit, heroChart:null, scenDelta:'', explHead:'Loading…', explBody:'Back-testing model families…', explColor:'var(--green)', explBg:'var(--greenBg)', skuRows:[], alerts:[], champName:'—', champWape:'—', modelReason:'', modelRows:[], scenarioCards:[], scenChart:null, provenance:[], references:[], gaps:[], skuPills:[], entryMonth:'', onHandVal:'', onOrderVal:'', invLabel1:'', invLabel2:'', dataModified:false, addLabel:'Add', stockPlan:{}, planTitle:'', planQ:'', monthPills:[], actions:[], actionCount:0, policyHeadline:'', policyRationale:'', detail:null, detailOpen:false, report:null, reportOpen:false, reportPills:[] };
    
      const A = state.analysis, selId = state.selectedSku || A.heroDefault, hero = A.ents.find(e=>e.id===selId) || A.ents[0];
      const P = A.P || periodInfo(D);
      const nHist = hero.series.length, entryMonth = P.labelAt(nHist);
    
      const kpis = buildKpis(mode, A, D, cur, handlers);
    
      // hero chart (stable y-domain across scenarios)
      const scen = state.scenario, mult = scen==='optimistic'?1+spread/100:scen==='conservative'?1-spread/100:1;
      const histBase = hero.series.slice(-P.histWin), firstLbl = P.labelAt(nHist-histBase.length);
      const entered = !!(state.recal && state.actualNum != null);
      const refBand = (entered?state.recal.after.pi95:hero.fc.pi95).slice(0,horizon);
      const domVals=[...histBase]; if(entered)domVals.push(state.actualNum); refBand.forEach(p=>{domVals.push(p.hi*(1+spread/100));domVals.push(p.lo*(1-spread/100));});
      let dmin=Math.min(...domVals),dmax=Math.max(...domVals); const dp=(dmax-dmin)*0.12||1; dmin=Math.max(0,dmin-dp); dmax+=dp;
      let history,forecast,pi80,pi95,alt=null,labels;
      if (entered){ history=[...histBase,state.actualNum]; forecast=state.recal.after.point.slice(0,horizon).map(v=>v*mult); pi80=state.recal.after.pi80.slice(0,horizon).map(p=>({lo:p.lo*mult,hi:p.hi*mult})); pi95=state.recal.after.pi95.slice(0,horizon).map(p=>({lo:p.lo*mult,hi:p.hi*mult})); labels={first:firstLbl,now:P.labelAt(nHist),last:P.labelAt(nHist+horizon)}; }
      else { history=histBase; forecast=hero.fc.point.slice(0,horizon).map(v=>v*mult); pi80=hero.fc.pi80.slice(0,horizon).map(p=>({lo:p.lo*mult,hi:p.hi*mult})); pi95=hero.fc.pi95.slice(0,horizon).map(p=>({lo:p.lo*mult,hi:p.hi*mult})); if(mult!==1)alt=hero.fc.point.slice(0,horizon); labels={first:firstLbl,now:P.labelAt(nHist-1),last:P.labelAt(nHist-1+horizon)}; }
      const heroChart = chart({history,forecast,pi80,pi95,alt,entered,labels,yDomain:[dmin,dmax],fmtY}, ct);
    
      let scenDelta;
      if (entered) scenDelta = `Live · recalibrated on your ${entryMonth} entry · history unchanged`;
      else if (scen==='base') scenDelta = `Base case · champion ${short(hero.champ)} · forecast begins after ${P.labelAt(nHist-1)}`;
      else scenDelta = `${scen[0].toUpperCase()+scen.slice(1)} · ${mult>1?'+':'–'}${Math.round(Math.abs(mult-1)*100)}% → ${entryMonth} ${mode==='subscription'?money(cur,hero.fc.point[0]*mult):fmtI(hero.fc.point[0]*mult)}`;
    
      const ex = entered ? explain(state.recal, state.actualNum, hero, mode, cur) : defaultExpl(hero, entryMonth, mode, cur);
      const toneMap={normal:'var(--green)',anomalous:'var(--amber)',structural:'var(--red)'}, toneBg={normal:'var(--greenBg)',anomalous:'var(--amberBg)',structural:'var(--redBg)'};
    
      // entity pills + rows + actions + plan (mode-aware)
      const pillBase='padding:6px 11px;border-radius:6px;font:600 11px/1 IBM Plex Sans,sans-serif;cursor:pointer;transition:.15s;border:1px solid ';
      const skuPills = A.ents.map(s=>({id:s.id,name:s.name,style:pillBase+(s.id===selId?'var(--accent);background:var(--accentBg);color:var(--accent);':'var(--border);background:transparent;color:var(--textMuted);'),onClick:()=>handlers.selectSku(s.id)}));
      const skuRows = A.ents.map(s=>rowFor(mode, s, D, cur, handlers));
      const alertTones={red:'var(--red)',amber:'var(--amber)',blue:'var(--blue)',green:'var(--green)'};
      const alerts = A.alerts.map(al=>({head:al.head,body:al.body,toneColor:alertTones[al.tone]}));
    
      const champName=short(hero.champ), champWape=hero.champWape!=null?hero.champWape.toFixed(1)+'%':'—';
      const modelRows = hero.ranking.map(r=>{const isC=r.name===hero.champ;return {name:r.name,wape:r.metrics.wape!=null?r.metrics.wape.toFixed(1)+'%':'—',mae:fmtI(r.metrics.mae),rmse:fmtI(r.metrics.rmse),smape:r.metrics.smape.toFixed(1)+'%',bias:(r.metrics.bias>=0?'+':'')+fmtI(r.metrics.bias),biasColor:r.metrics.bias>0?'var(--amber)':r.metrics.bias<-10?'var(--blue)':'var(--textMuted)',statusLabel:isC?'Champion':'Challenger',statusBg:isC?'var(--accentBg)':'var(--border)',statusColor:isC?'var(--accent)':'var(--textSubtle)',rowBg:isC?'var(--accentBg)':'transparent'};});
    
      // scenario cards + overlay
      const scenarioCards = ['Base','Optimistic','Conservative'].map((label,i)=>{const m=i===1?1+spread/100:i===2?1-spread/100:1;return scenarioCard(mode,label,m,i,hero,A,cur,D);});
      const sHist=hero.series.slice(-P.histWin), sBase2=hero.fc.point.slice(0,horizon);
      const scenChart = scenarioChart(sHist,sBase2,sBase2.map(v=>v*(1+spread/100)),sBase2.map(v=>v*(1-spread/100)),labels,ct,fmtY);
    
      const provenance = D.PROVENANCE.map(p=>({label:p.label,color:p.color,desc:p.desc}));
      const references = D.REFERENCES.map(r=>({name:r.name,org:r.org,use:r.use}));
      const gaps = D.GAPS || ['Higher-frequency (daily/weekly) data.','Confirmed forward drivers for the forecast window.','More history on newer lines to lift confidence.'];
      const dataModified = A.ents.some(s=>s.appended>0 || (mode==='inventory'&&(s.onHand!==s.baseOnHand||s.onOrder!==s.baseOnOrder)));
    
      const plan = buildPlan(mode, state, hero, A, D, cur, handlers, nHist, horizon);
    
      const report = state.reportOpen ? buildReport(state, A, D, props) : null;
      const rpBase='padding:5px 11px;border-radius:6px;font:600 11px/1 IBM Plex Sans,sans-serif;cursor:pointer;border:1px solid ';
      const reportPills = P.reportPeriods.map(([k,l])=>({label:l,style:rpBase+((state.reportPeriod||'quarter')===k?'var(--accent);background:var(--accentBg);color:var(--accent);':'var(--border);background:transparent;color:var(--textMuted);'),onClick:()=>handlers.setReportPeriod(k)}));
    
      return { ...base, kpis, heroName:hero.name, horizonLabel:horizon+' '+P.unit, heroChart, scenDelta, explHead:ex.head, explBody:ex.body, explColor:toneMap[ex.tone], explBg:toneBg[ex.tone], skuRows, alerts, champName, champWape, modelReason:hero.reason||'', modelRows, scenarioCards, scenChart, provenance, references, gaps, skuPills, entryMonth, dataModified, addLabel:'Add to history', ...plan, actions: buildActions(mode,A,D,cur,handlers), actionCount: buildActions(mode,A,D,cur,handlers).length, policyHeadline: D.MODEL_POLICY.headline, policyRationale: D.MODEL_POLICY.rationale, detail: state.detail?buildDetail(state.detail,A,D):null, detailOpen:!!state.detail, report, reportOpen: state.reportOpen, reportPills, reviewChart: report ? report.reviewChart : null, reviewName: report ? report.reviewName : '', reviewNote: report ? report.reviewNote : '' };
    }
    
    function buildKpis(mode, A, D, cur, h) {
      const T = A.totals, P = A.P || periodInfo(D);
      if (mode === 'inventory') return [
        { l:'Forecast revenue · next '+A.horizon+' '+P.unit, v:money(cur,T.rev6), sub:`${T.revD>=0?'▲':'▼'} ${Math.abs(T.revD).toFixed(0)}% vs prior`, onClick:()=>h.openDetail('kpi:rev') },
        { l:'Forecast margin · next '+A.horizon+' '+P.unit, v:money(cur,T.mar6), sub:`${Math.round(T.marPct*100)}% blended`, onClick:()=>h.openDetail('kpi:mar') },
        { l:D.META.entityLabel+' at stock-out risk', v:String(T.atRisk), sub:`of ${A.ents.length}`, onClick:()=>h.openDetail('kpi:stockout') },
        { l:(D.META.capacity?D.META.capacity.label:'Load')+' · next '+P.noun, v:Math.round(T.capUtil*100)+'%', sub:D.META.capacity?`${fmtI(T.load)} / ${fmtI(D.META.capacity.value)}`:'', onClick:()=>h.openDetail('capacity') } ];
      if (mode === 'subscription') return [
        { l:'MRR · next month', v:money(cur,T.mrrNext), sub:`${T.netNew>=0?'▲':'▼'} ${money(cur,Math.abs(T.netNew))} net new`, onClick:()=>h.openDetail('kpi:mrr') },
        { l:'ARR (run-rate)', v:money(cur,T.arr), sub:`→ ${money(cur,T.arrEnd)} in ${A.horizon} mo`, onClick:()=>h.openDetail('kpi:arr') },
        { l:'Blended churn', v:T.blendedChurn.toFixed(1)+'%', sub:`NRR ~${T.nrr.toFixed(0)}%`, onClick:()=>h.openDetail('kpi:churn') },
        { l:'Cash runway', v:T.runway>90?'—':T.runway.toFixed(0)+' mo', sub:`${money(cur,T.cash)} @ ${money(cur,T.burn)}/mo`, onClick:()=>h.openDetail('kpi:runway') } ];
      return [
        { l:'Enrolment · next intake', v:fmtI(T.enrolNext), sub:`${A.ents.length} courses`, onClick:()=>h.openDetail('kpi:enrol') },
        { l:'Fee revenue · horizon', v:money(cur,T.rev6), sub:'forecast', onClick:()=>h.openDetail('kpi:feerev') },
        { l:'Tutor utilisation', v:Math.round(T.tutorUtil*100)+'%', sub:`${T.tutors} / ${T.tutorCap} tutors`, onClick:()=>h.openDetail('capacity') },
        { l:'Courses over/under', v:`${T.oversub}/${T.atRisk}`, sub:'oversub / under', onClick:()=>h.openDetail('kpi:oversub') } ];
    }
    
    function rowFor(mode, s, D, cur, h) {
      const click = ()=>h.openDetail('sku:'+s.id);
      if (mode === 'inventory') { const F=FLAG_COLORS[s.flag], P=periodInfo(D); return { name:s.name+(s.appended?' ·+'+s.appended:''), style:s.subtitle, champ:short(s.champ), next:fmtI(s.nextForecast), c1:s.flag==='dormant'?'—':s.cover.toFixed(1)+' '+P.unit, c2:s.ro.qty>0?fmtI(s.ro.qty):'—', flagLabel:capFlag(s.flag), flagColor:F[0], flagBg:F[1], onClick:click }; }
      if (mode === 'subscription') { const F=FLAG_COLORS[s.flag]; return { name:s.name, style:s.subtitle, champ:short(s.champ), next:money(cur,s.nextMRR), c1:s.churn.toFixed(1)+'%', c2:(s.mom>=0?'+':'')+s.mom.toFixed(1)+'%', flagLabel:capFlag(s.flag), flagColor:F[0], flagBg:F[1], onClick:click }; }
      const F=FLAG_COLORS[s.flag]; return { name:s.name, style:s.subtitle, champ:short(s.champ), next:fmtI(s.nextEnrol), c1:Math.round(s.util*100)+'%', c2:String(s.tutors), flagLabel:capFlag(s.flag), flagColor:F[0], flagBg:F[1], onClick:click };
    }
    function capFlag(f){return {stockout:'Stock-out',reorder:'Reorder',overstock:'Overstock',healthy:'Healthy',dormant:'Off-season',growing:'Growing',watch:'Watch',declining:'At risk',flat:'Flat',oversubscribed:'Oversub.',under:'Under',scaling:'Scaling'}[f]||f;}
    
    function buildActions(mode, A, D, cur, h) {
      const out = [];
      if (mode === 'inventory') {
        const P = A.P || periodInfo(D);
        A.ents.forEach(s=>{const u=D.META.unit||'units';
          if(s.flag==='stockout')out.push({prio:0,tone:'var(--red)',title:`Order ${fmtI(s.ro.qty)} ${u} · ${s.name}`,detail:`Cover ${s.cover.toFixed(1)} ${P.unit} — runs out ~${Math.round(s.daysCover)} days vs ${s.leadTimeWeeks}-wk lead.`,money:`${money(cur,s.nextForecast*s.unitMargin)} at risk`,moneyColor:'var(--red)',onClick:()=>h.openDetail('sku:'+s.id)});
          else if(s.flag==='reorder')out.push({prio:1,tone:'var(--amber)',title:`Reorder ${fmtI(s.ro.qty)} ${u} · ${s.name}`,detail:`Cover ${s.cover.toFixed(1)} ${P.unit} — schedule this cycle.`,money:'',moneyColor:'var(--amber)',onClick:()=>h.openDetail('sku:'+s.id)});
          else if(s.flag==='overstock')out.push({prio:3,tone:'var(--blue)',title:`Hold or promote · ${s.name}`,detail:`Cover ${s.cover.toFixed(1)} ${P.unit} at the low — don't reorder.`,money:`${money(cur,s.onHand*(s.price-s.unitMargin))} tied up`,moneyColor:'var(--blue)',onClick:()=>h.openDetail('sku:'+s.id)});});
        if(D.META.capacity&&A.totals.capUtil>1)out.push({prio:2,tone:'var(--red)',title:`Prioritise — ${D.META.capacity.label} exceeded`,detail:`Load ${fmtI(A.totals.load)} vs ${fmtI(D.META.capacity.value)} (${Math.round(A.totals.capUtil*100)}%). Highest-margin lines first.`,money:'',moneyColor:'var(--red)',onClick:()=>h.openDetail('capacity')});
      } else if (mode === 'subscription') {
        if(A.totals.runway<12)out.push({prio:0,tone:'var(--red)',title:`Extend runway — ~${A.totals.runway.toFixed(0)} months left`,detail:`${money(cur,A.totals.cash)} cash at ${money(cur,A.totals.burn)}/mo burn.`,money:`${money(cur,A.totals.burn)}/mo`,moneyColor:'var(--red)',onClick:()=>h.openDetail('kpi:rev')});
        A.ents.filter(e=>e.flag==='declining').forEach(e=>out.push({prio:1,tone:'var(--red)',title:`Fix churn · ${e.name}`,detail:`Churning ${e.churn.toFixed(1)}%/mo — stabilise before scaling spend.`,money:`${money(cur,e.nextMRR)} MRR`,moneyColor:'var(--red)',onClick:()=>h.openDetail('sku:'+e.id)}));
        const g=A.ents.slice().sort((a,b)=>b.mom-a.mom)[0]; if(g)out.push({prio:2,tone:'var(--green)',title:`Double down · ${g.name}`,detail:`Fastest grower at ~${g.mom.toFixed(1)}%/mo — concentrate acquisition here.`,money:`${money(cur,g.nextMRR)} MRR`,moneyColor:'var(--green)',onClick:()=>h.openDetail('sku:'+g.id)});
      } else {
        A.ents.filter(e=>e.flag==='oversubscribed').forEach(e=>out.push({prio:0,tone:'var(--amber)',title:`Open a cohort · ${e.name}`,detail:`Forecast ${fmtI(e.nextEnrol)} vs ${fmtI(e.capacity)} seats (${Math.round(e.util*100)}%).`,money:`+${e.tutors} tutors`,moneyColor:'var(--amber)',onClick:()=>h.openDetail('sku:'+e.id)}));
        A.ents.filter(e=>e.flag==='under').forEach(e=>out.push({prio:2,tone:'var(--red)',title:`Fill seats · ${e.name}`,detail:`Only ${Math.round(e.util*100)}% of seats forecast to fill.`,money:`${money(cur,e.nextEnrol*e.fee)} fees`,moneyColor:'var(--red)',onClick:()=>h.openDetail('sku:'+e.id)}));
        if(A.totals.tutorUtil>1)out.push({prio:1,tone:'var(--red)',title:`Hire ~${Math.max(0,A.totals.tutors-A.totals.tutorCap)} tutors`,detail:`Forecast intake exceeds teaching capacity (${Math.round(A.totals.tutorUtil*100)}%).`,money:'',moneyColor:'var(--red)',onClick:()=>h.openDetail('capacity')});
      }
      return out.sort((a,b)=>a.prio-b.prio);
    }
    
    function buildPlan(mode, state, hero, A, D, cur, h, nHist, horizon) {
      const P = A.P || periodInfo(D);
      const tmi = Math.min(state.targetMonth||0, horizon-1);
      const planMonth = P.labelAt(nHist+tmi);
      const mpBase='padding:5px 9px;border-radius:6px;font:600 10.5px/1 IBM Plex Mono,monospace;cursor:pointer;transition:.15s;border:1px solid ';
      const monthPills = hero.fc.point.map((_,i)=>({label:P.labelAt(nHist+i),style:mpBase+(i===tmi?'var(--accent);background:var(--accentBg);color:var(--accent);':'var(--border);background:transparent;color:var(--textMuted);'),onClick:()=>h.selectMonth(i)}));
      const conf = (()=>{const meanFc=hero.fc.point.reduce((a,b)=>a+b,0)/hero.fc.point.length;const cv=meanFc>0?hero.fc.sigma/meanFc:1;let c=cv<0.12?'High':cv<0.25?'Medium':'Low';if(hero.baseLen+hero.appended<P.shortHist)c=c==='High'?'Medium':'Low';return c;})();
      const confColor = conf==='High'?'var(--green)':conf==='Medium'?'var(--amber)':'var(--red)';
      const pDemand=hero.fc.point[tmi], pLo=hero.fc.pi95[tmi].lo, pHi=hero.fc.pi95[tmi].hi;
    
      if (mode === 'inventory') {
        // Weekly: cover demand cumulatively THROUGH the selected week (a single week's demand
        // is a fraction of on-hand, so a per-week comparison would contradict the cover flag).
        // Monthly: single-period (unchanged) — one month ≈ the reorder window.
        const idxs = P.wk ? hero.fc.point.map((_, i) => i).slice(0, tmi + 1) : [tmi];
        const through = idxs.reduce((a, i) => a + hero.fc.point[i], 0);
        const tLo = idxs.reduce((a, i) => a + hero.fc.pi95[i].lo, 0), tHi = idxs.reduce((a, i) => a + hero.fc.pi95[i].hi, 0);
        const safety = 1.6449 * hero.fc.sigma * Math.sqrt(idxs.length), recHold = through + safety, gap = recHold - hero.avail, unit = D.META.unit || 'units';
        const gapNote = P.wk
          ? (gap>5 ? `Cumulative demand through ${planMonth} is ${fmtI(through)} ${unit}; on-hand + on-order of ${fmtI(hero.avail)} falls short — order ${fmtI(gap)} to hold a 95% service level (${hero.leadTimeWeeks}-wk lead).`
            : gap<-5 ? `On-hand + on-order covers demand through ${planMonth} with ${fmtI(-gap)} ${unit} to spare (${hero.shelfLifeMonths}-mo shelf life).`
            : `On-hand + on-order covers demand through ${planMonth} at a 95% service level.`)
          : (gap>5 ? `${hero.leadTimeWeeks}-week lead time — order now to land before ${planMonth}.`
            : gap<-5 ? `More than ${planMonth} needs — hold (${hero.shelfLifeMonths}-mo shelf life) or promote.`
            : `Covers ${planMonth} at a 95% service level.`);
        return { planTitle:`Stock Plan · ${hero.name}`, planQ:P.wk?'How much to hold through':'How much should I hold for', invLabel1:'On-hand stock', invLabel2:'On-order', onHandVal:String(hero.onHand), onOrderVal:String(hero.onOrder), monthPills,
          stockPlan:{ month:planMonth, unit, recHold:fmtI(recHold), demand:fmtI(through), range:`${fmtI(tLo)}–${fmtI(tHi)}`, safety:fmtI(safety), avail:fmtI(hero.avail), onHand:fmtI(hero.onHand), onOrder:fmtI(hero.onOrder), gapLabel:gap>5?`Order ${fmtI(gap)} more`:gap<-5?`Surplus of ${fmtI(-gap)}`:'On plan', gapColor:gap>5?'var(--red)':gap<-5?'var(--blue)':'var(--green)', gapNote, formula:short(hero.champ), wape:hero.champWape!=null?hero.champWape.toFixed(1)+'%':'—', conf, confColor } };
      }
      if (mode === 'subscription') {
        return { planTitle:`MRR Plan · ${hero.name}`, planQ:'Forecast MRR for', invLabel1:'Monthly churn %', invLabel2:'', onHandVal:String(hero.churn), onOrderVal:'', monthPills,
          stockPlan:{ month:planMonth, unit:'MRR', recHold:money(cur,pDemand), demand:money(cur,pDemand), range:`${money(cur,pLo)}–${money(cur,pHi)}`, safety:money(cur,hero.arr), avail:hero.churn.toFixed(1)+'%', onHand:money(cur,hero.series[hero.series.length-1]), onOrder:hero.churn.toFixed(1)+'%', gapLabel:hero.flag==='declining'?'Churn risk':'On trend', gapColor:hero.flag==='declining'?'var(--red)':'var(--green)', gapNote:hero.flag==='declining'?`Churn of ${hero.churn.toFixed(1)}%/mo is bending this segment down — fix retention before scaling spend.`:`Compounding ~${hero.mom.toFixed(1)}%/mo; ${money(cur,hero.arr)} implied ARR.`, formula:short(hero.champ), wape:hero.champWape!=null?hero.champWape.toFixed(1)+'%':'—', conf, confColor } };
      }
      const tutors=Math.ceil(pDemand/(hero.studentsPerTutor||18));
      return { planTitle:`Enrolment Plan · ${hero.name}`, planQ:'Expected enrolment for', invLabel1:'Seat capacity', invLabel2:'', onHandVal:String(hero.capacity), onOrderVal:'', monthPills,
        stockPlan:{ month:planMonth, unit:'students', recHold:fmtI(pDemand), demand:fmtI(pDemand), range:`${fmtI(pLo)}–${fmtI(pHi)}`, safety:String(tutors)+' tutors', avail:fmtI(hero.capacity)+' seats', onHand:fmtI(hero.capacity), onOrder:String(tutors), gapLabel:hero.util>1?'Oversubscribed':hero.util<0.55?'Under-enrolled':'On plan', gapColor:hero.util>1?'var(--amber)':hero.util<0.55?'var(--red)':'var(--green)', gapNote:hero.util>1?`Forecast exceeds ${fmtI(hero.capacity)} seats — open a cohort or add a tutor.`:hero.util<0.55?`Below break-even — marketing spend or merged intake needed.`:`Fills ${Math.round(hero.util*100)}% of seats; needs ${tutors} tutors.`, formula:short(hero.champ), wape:hero.champWape!=null?hero.champWape.toFixed(1)+'%':'—', conf, confColor } };
    }
    
    function scenarioCard(mode, label, m, i, hero, A, cur, D) {
      const colors=['var(--accent)','var(--green)','var(--red)'], P = A.P || periodInfo(D);
      if (mode === 'inventory') { const adjC=hero.cover/m, risk=adjC<hero.leadM?'High':adjC<P.reorderT?'Moderate':'Low'; return { label, m1Label:`Next-${P.unit} forecast`, m1:fmtI(hero.fc.point[0]*m), m2Label:A.horizon+'-'+P.unit+' revenue', m2:money(cur,A.totals.rev6*m), m3Label:A.horizon+'-'+P.unit+' margin', m3:money(cur,A.totals.mar6*m), m4Label:'Stock-out risk', m4:risk, m4Color:risk==='High'?'var(--red)':risk==='Moderate'?'var(--amber)':'var(--green)', accentColor:colors[i] }; }
      if (mode === 'subscription') { return { label, m1Label:'MRR next mo', m1:money(cur,A.totals.mrrNext*m), m2Label:'ARR run-rate', m2:money(cur,A.totals.arr*m), m3Label:A.horizon+'-mo MRR', m3:money(cur,A.totals.mrrEnd*m), m4Label:'Runway', m4:A.totals.runway>90?'—':(A.totals.runway*(m<1?0.8:m>1?1.2:1)).toFixed(0)+' mo', m4Color:'var(--textMuted)', accentColor:colors[i] }; }
      return { label, m1Label:'Enrolment', m1:fmtI(A.totals.enrolNext*m), m2Label:'Fee revenue', m2:money(cur,A.totals.rev6*m), m3Label:'Tutors needed', m3:String(Math.ceil(A.totals.tutors*m)), m4Label:'Utilisation', m4:Math.round(A.totals.tutorUtil*m*100)+'%', m4Color:'var(--textMuted)', accentColor:colors[i] };
    }
    
    exports["fmtI"] = fmtI;
    exports["computeAnalysis"] = computeAnalysis;
    exports["buildDetail"] = buildDetail;
    exports["buildReport"] = buildReport;
    exports["buildRenderVals"] = buildRenderVals;
  });

  define("brewery-data.js", function(module, exports, require){
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
    
    const META = {
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
    
    const DATE_LABELS = Array.from({ length: N }, (_, w) => wlabel(w));
    
    // ---- exogenous drivers (aligned to the 156 weeks) ----
    const TEMP_BASE = [4, 4, 6, 9, 13, 16, 18, 17, 14, 10, 7, 5]; // avg °C by calendar month (temperate NW-Europe)
    const tempC = Array.from({ length: N }, (_, w) => Math.round(seasW(TEMP_BASE, w)));
    for (let w = 0; w < N; w++) { const y = wYear(w), m = wMonth(w); if (y === 2023 && m === 6) tempC[w] += 6; if (y === 2024 && m === 1) tempC[w] -= 4; } // Jul-23 heatwave, Feb-24 cold snap
    const promo = Array(N).fill(0);
    for (let w = 0; w < N; w++) { const m = wMonth(w), d = wDom(w); if ((m === 4 || m === 6 || m === 9) && d <= 7) promo[w] = 1; } // early-May / early-Jul / early-Oct marketing pushes
    const priceIdx = Array.from({ length: N }, (_, w) => { const y = wYear(w); return y <= 2022 ? 1.0 : y === 2023 ? 1.02 : y === 2024 ? 1.05 : 1.07; }); // annual list-price steps
    
    const DRIVERS = { tempC, promo, priceIdx, exogKeys: ['tempC', 'promo'] };
    
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
    const SKUS = [
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
    const MODEL_POLICY = {
      label: 'Seasonal demand + intermittent (beer & spirits distribution)',
      modelKeys: ['snaive', 'ma', 'ses', 'holt', 'hw', 'reg'],
      headline: 'Holt-Winters · ETS · weather-regression · Croston',
      rationale: 'Weekly drinks demand is strongly seasonal with weather, holiday and event drivers — so Holt-Winters (annual season = 52 weeks), exponential smoothing and weather-aware regression lead. Limited and seasonal releases behave intermittently at weekly resolution, so Croston is included and tested. Seasonal-naive and moving-average baselines always run as honesty checks; the champion is whichever wins the rolling-origin back-test per line.',
    };
    
    // ---- future scenario drivers (next 13 weeks, the quarter horizon) ----
    const FUTURE = {
      weeks: 13,
      labels: Array.from({ length: 13 }, (_, k) => wlabel(N + k)),
      tempC: Array.from({ length: 13 }, (_, k) => Math.round(seasW(TEMP_BASE, N + k))),
      promo: Array.from({ length: 13 }, (_, k) => { const w = N + k; return (wMonth(w) === 6 || wMonth(w) === 9) && wDom(w) <= 7 ? 1 : 0; }),
    };
    
    // ---- events (forecast-changing, for the timeline + explanations) ----
    const EVENTS = [
      { when: 'Jul 2023', label: 'Jul 2023 heatwave', kind: 'spike', provenance: 'public', detail: '+22% lager, +12% IPA vs seasonal norm.' },
      { when: 'Feb 2024', label: 'Feb 2024 washout', kind: 'weak', provenance: 'simulated', detail: 'Wet, cold weeks; on-trade footfall down ~14%.' },
      { when: 'Aug 2024', label: 'Aug 2024 city festival', kind: 'spike', provenance: 'simulated', detail: 'Local event; +15% lager, +10% pale for two weeks.' },
      { when: 'Apr 2025', label: 'Apr 2025 pub-group contract', kind: 'contract', provenance: 'contracted', detail: 'The Ferryman group (14 sites): +180 lager, +90 IPA / month (≈ +42 / +21 per week).' },
    ];
    
    // ---- constraints (production / supply / logistics) ----
    const CONSTRAINTS = {
      fermentationCapacity: 1500,   // cases/week across all brewed SKUs
      deliveryCapacity: 1300,       // cases/week
      hopLeadTimeWeeks: { was: 4, now: 7, since: 'May 2025', affects: ['ipa', 'pale'] },
      provenance: 'user-entered',
    };
    
    // ---- commercial context ----
    const CONTRACT = {
      customer: 'The Ferryman pub group (14 sites)',
      fromLabel: 'Apr 2025', lagerPerWeek: 42, ipaPerWeek: 21,
      provenance: 'contracted',
    };
    const PIPELINE = {
      customer: 'Regional wholesaler — autumn programme', sku: 'ipa',
      perWeek: 55, weeks: 12, probability: 0.6, provenance: 'pipeline',
    };
    
    // ---- customers / channels (for customer-level demand view) ----
    const CHANNELS = [
      { id: 'taproom', name: 'Taproom', share: 0.22, trend: +0.06 },
      { id: 'wholesale', name: 'Wholesale', share: 0.41, trend: +0.11 },
      { id: 'distributor', name: 'Distributor', share: 0.27, trend: +0.03 },
      { id: 'export', name: 'Export', share: 0.10, trend: +0.18 },
    ];
    
    // ---- public reference sources (shown in the Data Confidence panel) ----
    const REFERENCES = [
      { name: 'FRED — Retail Sales: Beer, Wine & Liquor Stores (MRTSSM4453USN)', org: 'U.S. Census Bureau', kind: 'Public economic time series', use: 'Seasonal shape (Dec peak + summer lift), interpolated to weekly', license: 'Public domain' },
      { name: 'Boston Beer Company (NYSE: SAM)', org: 'SEC filings / investor reports', kind: 'Public company financials', use: 'Summer-peak seasonality; 4–5 weeks-on-hand inventory target', license: 'Public' },
      { name: 'British Beer & Pub Association (BBPA)', org: 'BBPA Statistical Handbook', kind: 'Industry statistics', use: 'On-trade beer seasonality', license: 'Public' },
    ];
    
    // ---- generic aliases for the shared engine ----
    const ENTITIES = SKUS;
    const GAPS = [
      'Daily point-of-sale granularity — the model currently runs on weekly aggregates.',
      'Weather actuals for the forecast weeks (using seasonal normals now).',
      'Confirmed event calendar for the next quarter.',
      'Point-of-sale data from pub/restaurant partners.',
      'Customer-level order history (currently aggregated).',
    ];
    
    // ---- provenance legend for the Data Confidence panel ----
    const PROVENANCE = [
      { key: 'actual', label: 'Actual historical', color: '#3f7d4e', desc: 'Recorded sales in the week.' },
      { key: 'simulated', label: 'Simulated operational', color: '#b5761f', desc: 'SKU volumes generated from real seasonal shapes + documented assumptions.' },
      { key: 'public', label: 'Publicly sourced', color: '#2f6f9f', desc: 'From public economic / company data.' },
      { key: 'user-entered', label: 'User-entered', color: '#6b6f76', desc: 'Entered by the operator (e.g. current stock).' },
      { key: 'contracted', label: 'Contracted future', color: '#5a4bb3', desc: 'Signed, committed future orders.' },
      { key: 'pipeline', label: 'Probable pipeline', color: '#9a5b9c', desc: 'Likely but unsigned future revenue.' },
    ];
    
    exports["META"] = META;
    exports["DATE_LABELS"] = DATE_LABELS;
    exports["DRIVERS"] = DRIVERS;
    exports["SKUS"] = SKUS;
    exports["MODEL_POLICY"] = MODEL_POLICY;
    exports["FUTURE"] = FUTURE;
    exports["EVENTS"] = EVENTS;
    exports["CONSTRAINTS"] = CONSTRAINTS;
    exports["CONTRACT"] = CONTRACT;
    exports["PIPELINE"] = PIPELINE;
    exports["CHANNELS"] = CHANNELS;
    exports["REFERENCES"] = REFERENCES;
    exports["ENTITIES"] = ENTITIES;
    exports["GAPS"] = GAPS;
    exports["PROVENANCE"] = PROVENANCE;
  });

  define("dtc-data.js", function(module, exports, require){
    // dtc-data.js — Direct-to-Consumer / E-commerce demo (inventory mode)
    // GRANULARITY: WEEKLY. Online retailers replenish and plan promotions on a weekly cadence;
    // supplier lead times are 5–8 weeks. Planning horizon = one quarter of weekly buckets (13 wk).
    // Seasonal shape anchored to REAL public data: U.S. Census "E-Commerce Retail Sales"
    // (ECOMNSA) — strong Q4 (Nov–Dec) peak — interpolated to weekly — and public DTC filings
    // (Warby Parker NYSE: WRBY; FIGS NYSE: FIGS). SKU-level weekly volumes are SIMULATED, labelled.
    
    function mulberry32(s){return function(){s|=0;s=(s+0x6D2B79F5)|0;let t=Math.imul(s^(s>>>15),1|s);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
    const WPY=52, N=156;
    const DAYMS=86400000, ANCHOR=Date.UTC(2022,5,27);   // Mon 27 Jun 2022
    const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const wdate=w=>new Date(ANCHOR+w*7*DAYMS), wYear=w=>wdate(w).getUTCFullYear(), wMonth=w=>wdate(w).getUTCMonth(), wDom=w=>wdate(w).getUTCDate();
    const wlabel=w=>`${wDom(w)} ${MON[wMonth(w)]}`;
    const fracYear=w=>{const d=wdate(w);const s=Date.UTC(d.getUTCFullYear(),0,1),e=Date.UTC(d.getUTCFullYear()+1,0,1);return (d-s)/(e-s);};
    const seasW=(m12,w)=>{const f=fracYear(w)*12,lo=Math.floor(f)%12,hi=(lo+1)%12,fr=f-Math.floor(f);return m12[lo]*(1-fr)+m12[hi]*fr;};
    const DATE_LABELS=Array.from({length:N},(_,w)=>wlabel(w));
    
    // exogenous drivers: paid ad-spend index, promo flag, site-traffic index (weekly)
    const adSpend=Array.from({length:N},(_,w)=>1+0.35*Math.sin((fracYear(w)*12-2)/12*2*Math.PI)+(w>=52?0.15:0)+(w>=104?0.15:0));
    const promo=Array(N).fill(0);
    for(let w=0;w<N;w++){const m=wMonth(w),d=wDom(w); if(m===10||(m===6&&d<=14)||(m===4&&d<=7)) promo[w]=1;} // Black Friday (all Nov) + summer + spring pushes
    const traffic=adSpend.map((a,w)=>a*(1+((wMonth(w)===10||wMonth(w)===11)?0.4:0)));
    const DRIVERS={adSpend,promo,traffic,exogKeys:['adSpend','promo']};
    
    const SEAS={
      serum:[0.86,0.82,0.90,0.95,1.00,1.02,1.00,0.98,1.04,1.12,1.45,1.60], // holiday gifting
      tote: [0.80,0.78,0.86,0.92,0.98,1.02,1.00,0.98,1.02,1.15,1.55,1.70],
      jacket:[1.30,1.15,0.95,0.80,0.62,0.55,0.55,0.62,0.90,1.18,1.45,1.55], // winter apparel
      bottle:[0.70,0.72,0.85,1.00,1.25,1.45,1.55,1.42,1.05,0.82,0.72,0.75], // summer accessory
      giftset:[0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.30,1.30,1.85], // seasonal, intermittent
      candle:[0.85,0.82,0.88,0.92,0.95,0.98,0.96,0.98,1.05,1.20,1.55,1.75],
    };
    function build(monthlyBase,g,seas,ev,rng,amp=0.14){const base=monthlyBase/4.33,o=[];for(let w=0;w<N;w++){const tr=base*(1+g*(w/WPY));let v=tr*seasW(seas,w);if(ev)v=ev(v,w);if(v>0)v*=1+(rng()-0.5)*2*amp;o.push(Math.max(0,Math.round(v)));}return o;}
    function buildIntermittent(monthlyBase,seas,rng){const base=monthlyBase/4.33,o=[];for(let w=0;w<N;w++){const s=seas[wMonth(w)];let v=0;if(s>0&&rng()<0.6)v=base*s*(1+(rng()-0.5)*0.5);o.push(Math.max(0,Math.round(v)));}return o;}
    const bfriday=(v,w)=>((wMonth(w)===10)?v*1.35:v);                                   // Black Friday November lift
    const summer=(v,w)=>(wYear(w)===2024&&wMonth(w)===6&&wDom(w)>=8&&wDom(w)<=21?v*1.2:v); // Jul 2024 flash sale (2 wks)
    const dipMar24=(v,w)=>(wYear(w)===2024&&wMonth(w)===2?v*0.85:v);                     // Mar 2024 supply/ad pause
    const rng=mulberry32(77123);
    const serum=build(3200,0.18,SEAS.serum,(v,w)=>dipMar24(bfriday(v,w),w),rng,0.11);
    const tote=build(2400,0.10,SEAS.tote,(v,w)=>bfriday(v,w),rng,0.12);
    const jacket=build(1500,0.06,SEAS.jacket,(v,w)=>bfriday(v,w),rng,0.14);
    const bottle=build(1800,0.08,SEAS.bottle,(v,w)=>summer(v,w),rng,0.13);
    const giftset=buildIntermittent(900,SEAS.giftset,rng);
    const candle=build(700,0.55,SEAS.candle,(v,w)=>bfriday(v,w),rng,0.12);
    
    const SKUS=[
      {id:'serum',name:'Aurora Serum',subtitle:'Skincare · hero SKU',category:'Skincare',series:serum,price:38,unitMargin:24,onHand:2600,onOrder:1500,leadTimeWeeks:6,shelfLifeMonths:18,useDrivers:true,note:'Hero product. Holiday-gifting peak; long 6-week overseas lead time — the classic DTC stockout trap.'},
      {id:'candle',name:'Lumen Candle',subtitle:'Home · new launch',category:'Home',series:candle,price:29,unitMargin:17,onHand:760,onOrder:300,leadTimeWeeks:5,shelfLifeMonths:24,note:'Fastest-growing line (+55%/yr). Likely under-stocked for its trajectory.'},
      {id:'tote',name:'Everyday Tote',subtitle:'Accessories · bestseller',category:'Accessories',series:tote,price:45,unitMargin:27,onHand:4200,onOrder:1200,leadTimeWeeks:6,shelfLifeMonths:36,note:'Steady bestseller with a strong Q4 gifting spike.'},
      {id:'bottle',name:'Trail Bottle',subtitle:'Accessories · summer',category:'Accessories',series:bottle,price:26,unitMargin:15,onHand:7500,onOrder:0,leadTimeWeeks:5,shelfLifeMonths:36,note:'Summer-peaking; heading into the off-season now — overstock risk.'},
      {id:'jacket',name:'Summit Jacket',subtitle:'Apparel · winter',category:'Apparel',series:jacket,price:120,unitMargin:62,onHand:2200,onOrder:400,leadTimeWeeks:8,shelfLifeMonths:36,note:'High-value winter apparel; Q4 buys landed — 8-week lead means the winter build is already committed.'},
      {id:'giftset',name:'Holiday Gift Set',subtitle:'Bundle · seasonal',category:'Bundle',series:giftset,price:65,unitMargin:34,onHand:120,onOrder:0,leadTimeWeeks:6,shelfLifeMonths:12,intermittent:true,note:'Limited seasonal bundle — intermittent (Croston territory).'},
    ];
    const ENTITIES=SKUS;
    
    const FUTURE={weeks:13,labels:Array.from({length:13},(_,k)=>wlabel(N+k)),adSpend:Array.from({length:13},(_,k)=>1+0.35*Math.sin((fracYear(N+k)*12-2)/12*2*Math.PI)+0.3),promo:Array.from({length:13},(_,k)=>{const w=N+k;return (wMonth(w)===6&&wDom(w)<=14)?1:0;})};
    
    const CONSTRAINTS={fulfilmentCapacity:3200,provenance:'user-entered'};
    
    const MODEL_POLICY={
      label:'Seasonal + promo-driven retail demand',
      modelKeys:['snaive','ma','ses','holt','hw','reg'],
      headline:'Holt-Winters · ETS · promo-regression · Croston',
      rationale:'Weekly e-commerce demand is seasonal (Q4/holiday peak, season = 52 weeks) and highly campaign-sensitive, so Holt-Winters and regression on ad-spend/promotions lead. New launches with short histories fall back to trend + conservative baselines; seasonal bundles are intermittent at weekly resolution, so Croston is tested. Champion is chosen per SKU by rolling-origin back-test.',
    };
    
    const GAPS=[
      'Daily order + sessions data (currently weekly) to model campaign spikes precisely.',
      'Locked promotional calendar for the forecast window.',
      'Returns data by SKU to forecast net demand, not gross.',
      'Cohort/repeat-purchase rates to separate new vs returning demand.',
      'Confirmed supplier lead times for the Q4 buy.',
    ];
    
    const PROVENANCE=[
      {key:'actual',label:'Actual historical',color:'#c2503f',desc:'Recorded orders in the week.'},
      {key:'simulated',label:'Simulated operational',color:'#d98a3a',desc:'SKU volumes generated from real e-commerce seasonality + documented assumptions.'},
      {key:'public',label:'Publicly sourced',color:'#3a7a9f',desc:'From public retail / company data.'},
      {key:'user-entered',label:'User-entered',color:'#6b6459',desc:'Entered by the operator (stock, POs).'},
      {key:'contracted',label:'Committed',color:'#5a4bb3',desc:'Placed purchase orders / confirmed campaigns.'},
      {key:'pipeline',label:'Planned',color:'#9a5b9c',desc:'Planned but unconfirmed campaigns/buys.'},
    ];
    
    const REFERENCES=[
      {name:'FRED — E-Commerce Retail Sales (ECOMNSA)',org:'U.S. Census Bureau',kind:'Public economic series',use:'Q4/holiday seasonal shape, interpolated to weekly',license:'Public domain'},
      {name:'Warby Parker (NYSE: WRBY)',org:'SEC filings',kind:'Public DTC financials',use:'DTC revenue seasonality + gross margins',license:'Public'},
      {name:'FIGS, Inc. (NYSE: FIGS)',org:'SEC filings / investor decks',kind:'Public DTC financials',use:'Repeat-purchase & inventory dynamics',license:'Public'},
    ];
    
    const META={
      industry:'dtc', mode:'inventory',
      company:'Kindred Goods', subtitle:'DTC demand & inventory forecast · next 13 weeks (Q3 2025)', industryTag:'DTC RETAIL',
      currency:'£', unit:'units', entityLabel:'Products',
      granularity:'week', startDate:'2022-06-27', startLabel:'27 Jun 2022', weeks:156, season:52, horizon:13,
      capacity:{label:'Fulfilment load', value:3200, unit:'orders/wk'},
      theme:{
        light:'--bg:#f5f2ee;--card:#ffffff;--cardBorder:#e8e2d9;--cardShadow:0 4px 18px -8px rgba(40,25,20,0.12);--text:#2c2825;--textStrong:#181513;--textMuted:#6d655b;--textSubtle:#a89f93;--accent:#d8563f;--accentBg:rgba(216,86,63,0.10);--watneys:#b23a2a;--watneysLight:rgba(178,58,42,0.10);--red:#c23a2a;--redBg:#fae7e3;--amber:#b5701a;--amberBg:#f8efdc;--blue:#2f6f8f;--blueBg:#e6eff4;--green:#3a7a4e;--greenBg:#e6f1e9;--topbar:#241f1c;--topbarText:#f0e6da;--topbarSubtext:#a89a88;--pillBg:rgba(255,255,255,0.10);--pillText:#cbbfae;--border:#ece5db;--inputBg:#fff;--inputBorder:#ddd3c6;--kpiValue:#181513;--sectionLabel:#d8563f;--watermarkOpacity:0.035;--watermarkBlend:multiply',
        dark:'--bg:#1c1815;--card:#272220;--cardBorder:#3a332e;--cardShadow:0 4px 18px -8px rgba(0,0,0,0.5);--text:#d8cec2;--textStrong:#f4ece0;--textMuted:#a89a88;--textSubtle:#7a6f61;--accent:#f0714f;--accentBg:rgba(240,113,79,0.14);--watneys:#e05a45;--watneysLight:rgba(224,90,69,0.16);--red:#f07059;--redBg:rgba(240,112,89,0.14);--amber:#e0a24a;--amberBg:rgba(224,162,74,0.12);--blue:#68a6c8;--blueBg:rgba(104,166,200,0.14);--green:#5cbe79;--greenBg:rgba(92,190,121,0.12);--topbar:#151210;--topbarText:#f0e6da;--topbarSubtext:#8a7d6d;--pillBg:rgba(255,255,255,0.08);--pillText:#a89a88;--border:#3a332e;--inputBg:#151210;--inputBorder:#443c35;--kpiValue:#f4ece0;--sectionLabel:#f0714f;--watermarkOpacity:0.05;--watermarkBlend:screen',
        chartLight:{bg:'#ffffff',grid:'#efe8de',axis:'#a89f93',hist:'#2c2825',fc:'#d8563f',band80:'rgba(216,86,63,0.16)',band95:'rgba(216,86,63,0.06)',alt:'#8f9aa0',now:'#e0c9b0',mono:"'IBM Plex Mono',monospace",opt:'#3a7a4e',con:'#c23a2a'},
        chartDark:{bg:'#272220',grid:'rgba(255,255,255,0.06)',axis:'#7a6f61',hist:'#d8cec2',fc:'#f0714f',band80:'rgba(240,113,79,0.18)',band95:'rgba(240,113,79,0.07)',alt:'#5c9a8a',now:'rgba(240,113,79,0.4)',mono:"'IBM Plex Mono',monospace",opt:'#5cbe79',con:'#f07059'},
      },
    };
    
    exports["DATE_LABELS"] = DATE_LABELS;
    exports["DRIVERS"] = DRIVERS;
    exports["SKUS"] = SKUS;
    exports["ENTITIES"] = ENTITIES;
    exports["FUTURE"] = FUTURE;
    exports["CONSTRAINTS"] = CONSTRAINTS;
    exports["MODEL_POLICY"] = MODEL_POLICY;
    exports["GAPS"] = GAPS;
    exports["PROVENANCE"] = PROVENANCE;
    exports["REFERENCES"] = REFERENCES;
    exports["META"] = META;
  });

  define("education-data.js", function(module, exports, require){
    // education-data.js — Education / training provider demo (CAPACITY mode)
    // enrolment / tutor capacity / cohort completion. Seasonal shape anchored to REAL public
    // data: HESA (UK Higher Education Statistics Agency) intake seasonality (Sep peak, Jan
    // secondary) and public sector enrolment patterns. Course-level volumes are SIMULATED
    // operational data, clearly labelled.
    
    function mulberry32(s){return function(){s|=0;s=(s+0x6D2B79F5)|0;let t=Math.imul(s^(s>>>15),1|s);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
    const N=30, CAL=m=>m%12;
    const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const DATE_LABELS=Array.from({length:N},(_,m)=>`${MON[CAL(m)]} ${String(23+Math.floor(m/12)).padStart(2,'0')}`);
    
    // marketing spend index + lead-enquiry index (exogenous drivers)
    const marketing=Array.from({length:N},(_,m)=>1+0.4*(CAL(m)===7||CAL(m)===8?1:0)+(CAL(m)===11||CAL(m)===0?0.3:0));
    const leads=marketing.map((x,m)=>x*(1+0.1*Math.sin(m/4)));
    const DRIVERS={marketing,leads,exogKeys:['marketing']};
    
    const SEAS={
      bootcamp:[1.35,0.80,0.70,0.75,0.70,0.60,0.55,0.95,1.80,1.10,0.85,0.70],
      ux:      [1.25,0.85,0.75,0.80,0.72,0.62,0.58,0.92,1.70,1.12,0.88,0.72],
      cloud:   [1.30,0.82,0.72,0.78,0.72,0.64,0.60,0.96,1.72,1.10,0.86,0.74],
      biz:     [1.20,0.88,0.80,0.82,0.78,0.70,0.64,0.90,1.55,1.08,0.90,0.80],
      lead:    [0.90,0.85,1.00,1.05,1.00,0.85,0.70,0.80,1.20,1.15,1.05,0.95], // corporate, less seasonal
      intro:   [1.30,0.85,0.78,0.82,0.75,0.66,0.62,1.00,1.78,1.14,0.88,0.74],
    };
    function build(base,g,seas,ev,rng){const o=[];for(let m=0;m<N;m++){const tr=base*(1+g*(m/12));let v=tr*seas[CAL(m)];if(ev)v=ev(v,m);if(v>0)v*=1+(rng()-0.5)*0.08;o.push(Math.max(0,Math.round(v)));}return o;}
    const contract=(v,m)=>(m>=24?v+45:v);         // corporate training contract from 2025
    const rng=mulberry32(50813);
    const bootcamp=build(88,0.26,SEAS.bootcamp,null,rng);
    const ux=build(64,0.08,SEAS.ux,null,rng);
    const cloud=build(46,0.30,SEAS.cloud,null,rng);
    const biz=build(52,-0.06,SEAS.biz,null,rng);
    const lead=build(22,0.10,SEAS.lead,(v,m)=>contract(v,m),rng);
    const intro=build(120,0.12,SEAS.intro,null,rng);
    
    const SKUS=[
      {id:'bootcamp',name:'Data Analytics Bootcamp',subtitle:'12-week · flagship',category:'Bootcamp',series:bootcamp,capacityPerIntake:110,studentsPerTutor:16,fee:5400,completion:0.86,useDrivers:true,note:'Flagship, +26%/yr — forecast to oversubscribe the Sep intake.'},
      {id:'cloud',name:'Cloud Engineering Cert',subtitle:'10-week',category:'Certificate',series:cloud,capacityPerIntake:80,studentsPerTutor:18,fee:3900,completion:0.82,note:'Fastest grower (+30%/yr) — tutor supply is the binding constraint.'},
      {id:'intro',name:'Intro to Coding',subtitle:'6-week · high volume',category:'Short course',series:intro,capacityPerIntake:160,studentsPerTutor:22,fee:1200,completion:0.74,note:'High-volume feeder course; strong Sep/Jan intake seasonality.'},
      {id:'ux',name:'UX Design Diploma',subtitle:'16-week',category:'Diploma',series:ux,capacityPerIntake:90,studentsPerTutor:16,fee:6200,completion:0.88,note:'Steady, high-completion diploma.'},
      {id:'biz',name:'Business Foundations',subtitle:'8-week',category:'Certificate',series:biz,capacityPerIntake:90,studentsPerTutor:20,fee:2400,completion:0.79,note:'Declining demand (−6%/yr) — under-enrolled; review or reposition.'},
      {id:'lead',name:'Leadership (Corporate)',subtitle:'Bespoke cohorts',category:'Corporate',series:lead,capacityPerIntake:60,studentsPerTutor:14,fee:8800,completion:0.92,note:'Corporate-contract driven — a new framework agreement lifts 2025 intakes.'},
    ];
    const ENTITIES=SKUS;
    
    const FUTURE={months:6,labels:['Jul 25','Aug 25','Sep 25','Oct 25','Nov 25','Dec 25'],marketing:[1.4,1.5,1.4,1.1,1.0,1.2]};
    
    const MODEL_POLICY={
      label:'Seasonal enrolment + capacity-constrained',
      modelKeys:['snaive','ma','ses','holt','hw','reg'],
      headline:'Holt-Winters · regression on leads/marketing · capacity-constrained',
      rationale:'Enrolment is strongly seasonal (Sep intake, Jan secondary) and responsive to marketing spend and lead volume — so Holt-Winters and regression on leads/marketing lead. Forecasts are then capped by tutor capacity to expose oversubscription. Newer courses with thin history fall back to conservative seasonal baselines. Champion chosen per course by rolling-origin back-test.',
    };
    const GAPS=[
      'Lead-to-enrolment conversion by source (currently blended).',
      'Confirmed tutor availability and contracts for the Sep intake.',
      'Cohort-level dropout curves to forecast completion, not just enrolment.',
      'Corporate pipeline (signed vs probable) for bespoke cohorts.',
      'Scholarship/discount mix to forecast net fee revenue.',
    ];
    const PROVENANCE=[
      {key:'actual',label:'Actual historical',color:'#2f7d5b',desc:'Recorded enrolments in the period.'},
      {key:'simulated',label:'Simulated operational',color:'#c98a2a',desc:'Course volumes generated from real intake seasonality + assumptions.'},
      {key:'public',label:'Publicly sourced',color:'#3a7a9f',desc:'From HESA / public education data.'},
      {key:'user-entered',label:'User-entered',color:'#6b7268',desc:'Capacity, tutors, fees entered by ops.'},
      {key:'contracted',label:'Contracted',color:'#5a4bb3',desc:'Signed corporate training contracts.'},
      {key:'pipeline',label:'Probable pipeline',color:'#9a5b9c',desc:'Likely but unsigned enquiries/contracts.'},
    ];
    const REFERENCES=[
      {name:'HESA — Higher Education Student Statistics',org:'Higher Education Statistics Agency (UK)',kind:'Public education statistics',use:'Intake seasonality (Sep peak)',license:'Public'},
      {name:'UK Dept. for Education — participation data',org:'gov.uk',kind:'Public sector data',use:'Enrolment trends by subject',license:'Public'},
      {name:'OfS / provider financial returns',org:'Office for Students',kind:'Public regulatory data',use:'Course capacity & completion norms',license:'Public'},
    ];
    
    const META={
      industry:'education', mode:'capacity',
      company:'Northwind Academy', subtitle:'Enrolment & capacity forecast · next 12 months', industryTag:'EDUCATION',
      currency:'£', unit:'students', entityLabel:'Courses',
      // MONTHLY by design: enrolment is termly/monthly (Sep + Jan intakes) and tutor capacity is
      // planned per intake, not per week — so a monthly horizon is the operationally right scale.
      granularity:'month', startLabel:'Jan 2023', months:30, season:12, horizon:12,
      capacity:{label:'Tutor utilisation', value:26, unit:'tutors'},
      theme:{
        light:'--bg:#eef3f0;--card:#ffffff;--cardBorder:#dde7e1;--cardShadow:0 4px 18px -8px rgba(15,40,30,0.12);--text:#1e2e28;--textStrong:#0f201a;--textMuted:#5a6b63;--textSubtle:#96a49c;--accent:#2f8a5e;--accentBg:rgba(47,138,94,0.10);--watneys:#1f4d5c;--watneysLight:rgba(31,77,92,0.10);--red:#c0392b;--redBg:#fae7e4;--amber:#b5701a;--amberBg:#f8efdc;--blue:#2f6f9f;--blueBg:#e6eff5;--green:#2f8a5e;--greenBg:#e4f2ea;--topbar:#16302a;--topbarText:#e7f0ea;--topbarSubtext:#8aa79a;--pillBg:rgba(255,255,255,0.10);--pillText:#b4c8bd;--border:#e2ebe5;--inputBg:#fff;--inputBorder:#cfdcd4;--kpiValue:#0f201a;--sectionLabel:#2f8a5e;--watermarkOpacity:0.035;--watermarkBlend:multiply',
        dark:'--bg:#0e1a16;--card:#16261f;--cardBorder:#24352c;--cardShadow:0 4px 18px -8px rgba(0,0,0,0.5);--text:#c2d1c8;--textStrong:#e8f2ec;--textMuted:#8aa79a;--textSubtle:#5e7268;--accent:#4fbc82;--accentBg:rgba(79,188,130,0.14);--watneys:#3f9ab0;--watneysLight:rgba(63,154,176,0.16);--red:#ef6a5a;--redBg:rgba(239,106,90,0.14);--amber:#e0a24a;--amberBg:rgba(224,162,74,0.12);--blue:#5aa6d0;--blueBg:rgba(90,166,208,0.14);--green:#4fbc82;--greenBg:rgba(79,188,130,0.12);--topbar:#0a1512;--topbarText:#e7f0ea;--topbarSubtext:#74907f;--pillBg:rgba(255,255,255,0.08);--pillText:#8aa79a;--border:#24352c;--inputBg:#0a1512;--inputBorder:#2d4238;--kpiValue:#e8f2ec;--sectionLabel:#4fbc82;--watermarkOpacity:0.05;--watermarkBlend:screen',
        chartLight:{bg:'#ffffff',grid:'#e4ede8',axis:'#96a49c',hist:'#1e2e28',fc:'#2f8a5e',band80:'rgba(47,138,94,0.15)',band95:'rgba(47,138,94,0.06)',alt:'#7f9aa6',now:'#a9d0bb',mono:"'IBM Plex Mono',monospace",opt:'#2f8a5e',con:'#c0392b'},
        chartDark:{bg:'#16261f',grid:'rgba(255,255,255,0.06)',axis:'#5e7268',hist:'#c2d1c8',fc:'#4fbc82',band80:'rgba(79,188,130,0.18)',band95:'rgba(79,188,130,0.07)',alt:'#5aa6d0',now:'rgba(79,188,130,0.4)',mono:"'IBM Plex Mono',monospace",opt:'#4fbc82',con:'#ef6a5a'},
      },
    };
    
    exports["DATE_LABELS"] = DATE_LABELS;
    exports["DRIVERS"] = DRIVERS;
    exports["SKUS"] = SKUS;
    exports["ENTITIES"] = ENTITIES;
    exports["FUTURE"] = FUTURE;
    exports["MODEL_POLICY"] = MODEL_POLICY;
    exports["GAPS"] = GAPS;
    exports["PROVENANCE"] = PROVENANCE;
    exports["REFERENCES"] = REFERENCES;
    exports["META"] = META;
  });

  define("manufacturing-data.js", function(module, exports, require){
    // manufacturing-data.js — Manufacturing / Hardware demo (inventory mode, constraint-led)
    // GRANULARITY: WEEKLY. Production is scheduled and component POs are placed weekly against
    // 5–8-week supplier lead times, so the build/supply plan runs on a 13-week (one-quarter)
    // weekly horizon. Seasonal shape anchored to REAL public data: FRED "Manufacturers' New
    // Orders: Durable Goods" (DGORDER) and ISM Manufacturing PMI; hardware seasonality
    // cross-checked against public consumer-hardware filings (Sonos NASDAQ: SONO; GoPro
    // NASDAQ: GPRO). Unit volumes, BOM, supplier lead times and yields are SIMULATED, labelled.
    
    function mulberry32(s){return function(){s|=0;s=(s+0x6D2B79F5)|0;let t=Math.imul(s^(s>>>15),1|s);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
    const WPY=52, N=156;
    const DAYMS=86400000, ANCHOR=Date.UTC(2022,5,27);
    const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const wdate=w=>new Date(ANCHOR+w*7*DAYMS), wYear=w=>wdate(w).getUTCFullYear(), wMonth=w=>wdate(w).getUTCMonth(), wDom=w=>wdate(w).getUTCDate();
    const wlabel=w=>`${wDom(w)} ${MON[wMonth(w)]}`;
    const fracYear=w=>{const d=wdate(w);const s=Date.UTC(d.getUTCFullYear(),0,1),e=Date.UTC(d.getUTCFullYear()+1,0,1);return (d-s)/(e-s);};
    const seasW=(m12,w)=>{const f=fracYear(w)*12,lo=Math.floor(f)%12,hi=(lo+1)%12,fr=f-Math.floor(f);return m12[lo]*(1-fr)+m12[hi]*fr;};
    const DATE_LABELS=Array.from({length:N},(_,w)=>wlabel(w));
    
    const pmi=Array.from({length:N},(_,w)=>50+6*Math.sin((fracYear(w)*12-3)/12*2*Math.PI)+(w>=78?2:0)); // ISM-style cycle
    const backlog=Array.from({length:N},(_,w)=>1+0.2*Math.sin((fracYear(w)*12-1)/12*2*Math.PI));
    const DRIVERS={pmi,backlog,exogKeys:['pmi']};
    
    const SEAS={
      hub:  [0.82,0.80,0.92,0.98,1.02,1.05,1.02,1.00,1.08,1.15,1.30,1.28], // Q4 hardware peak
      sensor:[0.90,0.90,0.98,1.02,1.05,1.08,1.06,1.04,1.05,1.02,1.00,0.98],
      pro:  [0.88,0.86,0.95,1.00,1.04,1.06,1.02,1.00,1.06,1.12,1.24,1.20],
      legacy:[1.10,1.08,1.05,1.00,0.96,0.92,0.88,0.85,0.82,0.78,0.75,0.72], // declining
      spares:[0.30,1.00,0.30,0.30,1.00,0.30,1.00,0.30,0.30,1.00,0.30,1.00], // lumpy / intermittent
      edge: [0.80,0.82,0.90,0.95,1.00,1.05,1.05,1.05,1.10,1.15,1.25,1.22],
    };
    function build(monthlyBase,g,seas,ev,rng,amp=0.13){const base=monthlyBase/4.33,o=[];for(let w=0;w<N;w++){const tr=base*(1+g*(w/WPY));let v=tr*seasW(seas,w);if(ev)v=ev(v,w);if(v>0)v*=1+(rng()-0.5)*2*amp;o.push(Math.max(0,Math.round(v)));}return o;}
    // after-sales spares: low steady baseline + occasional service batches (lumpy, Croston-eligible)
    function buildIntermittent(monthlyBase,seas,rng){const base=monthlyBase/4.33,o=[];for(let w=0;w<N;w++){let v=base*0.35;if(rng()<0.45)v+=base*(0.7+rng()*0.9);o.push(Math.max(0,Math.round(v)));}return o;}
    const q4=(v,w)=>((wMonth(w)===10||wMonth(w)===11)?v*1.12:v);
    const supplyShock=(v,w)=>(wYear(w)===2024&&wMonth(w)===4?v*0.78:v);   // May 2024 component shortage cut output
    const preorder=(v,w)=>((wYear(w)>2025||(wYear(w)===2025&&wMonth(w)>=2))?v+400/4.33:v);  // new-product pre-order ramp from Mar 2025
    const rng=mulberry32(31771);
    const hub=build(1400,0.16,SEAS.hub,(v,w)=>supplyShock(q4(v,w),w),rng,0.12);
    const sensor=build(2600,0.10,SEAS.sensor,(v,w)=>supplyShock(v,w),rng,0.12);
    const pro=build(620,0.14,SEAS.pro,(v,w)=>q4(v,w),rng,0.14);
    const legacy=build(1100,-0.12,SEAS.legacy,null,rng,0.13);
    const spares=buildIntermittent(180,SEAS.spares,rng);
    const edge=build(500,0.48,SEAS.edge,(v,w)=>preorder(q4(v,w),w),rng,0.15);
    
    const SKUS=[
      {id:'hub',name:'Nexus Hub',subtitle:'Smart hub · flagship',category:'Device',series:hub,price:180,unitMargin:70,onHand:1180,onOrder:600,leadTimeWeeks:6,shelfLifeMonths:60,useDrivers:true,note:'Flagship device. BOM includes a long-lead controller chip — component-constrained into Q4.'},
      {id:'edge',name:'Edge Cam',subtitle:'Camera · new launch',category:'Device',series:edge,price:140,unitMargin:52,onHand:420,onOrder:300,leadTimeWeeks:8,shelfLifeMonths:60,note:'New launch on pre-order (+48%/yr). 8-week assembly lead — commit builds now.'},
      {id:'sensor',name:'Aura Sensor',subtitle:'Sensor · volume line',category:'Component',series:sensor,price:42,unitMargin:16,onHand:5400,onOrder:1200,leadTimeWeeks:5,shelfLifeMonths:48,note:'High-volume line; steady demand, main draw on assembly capacity.'},
      {id:'pro',name:'Nexus Pro',subtitle:'Device · premium',category:'Device',series:pro,price:340,unitMargin:150,onHand:2050,onOrder:0,leadTimeWeeks:7,shelfLifeMonths:60,note:'Premium model — high margin, lower volume, Q4-weighted.'},
      {id:'legacy',name:'Hub v1 (legacy)',subtitle:'Device · end-of-life',category:'Device',series:legacy,price:120,unitMargin:38,onHand:3200,onOrder:0,leadTimeWeeks:6,shelfLifeMonths:60,note:'Declining EOL line (−12%/yr) — overstock risk; run down, do not rebuild.'},
      {id:'spares',name:'Service Spares',subtitle:'Parts · after-sales',category:'Spares',series:spares,price:24,unitMargin:12,onHand:90,onOrder:0,leadTimeWeeks:6,shelfLifeMonths:60,intermittent:true,note:'Intermittent after-sales demand — Croston territory.'},
    ];
    const ENTITIES=SKUS;
    
    const FUTURE={weeks:13,labels:Array.from({length:13},(_,k)=>wlabel(N+k)),pmi:Array.from({length:13},(_,k)=>50+6*Math.sin((fracYear(N+k)*12-3)/12*2*Math.PI)+2)};
    const CONSTRAINTS={productionCapacity:2100,provenance:'user-entered'};
    
    const MODEL_POLICY={
      label:'Demand + intermittent + capacity-constrained',
      modelKeys:['snaive','ma','ses','holt','hw','reg'],
      headline:'Holt-Winters · regression · Croston · capacity-constrained',
      rationale:'Weekly hardware demand is trend + moderate seasonality driven by orders/PMI, so Holt-Winters (season = 52 weeks) and regression lead on volume lines. After-sales spares are intermittent at weekly resolution, so Croston is tested and often wins. Everything is then checked against weekly production capacity and supplier lead times before a build plan is issued. Champion chosen per line by rolling-origin back-test.',
    };
    const GAPS=[
      'Bill-of-materials linkage to forecast component-level demand, not just finished goods.',
      'Confirmed supplier lead times + yield/defect rates by line.',
      'Firm order book / pre-orders for the new launch.',
      'Daily build + WIP data (currently weekly).',
      'Warranty-return rates to net off refurb demand.',
    ];
    const PROVENANCE=[
      {key:'actual',label:'Actual historical',color:'#3f6f9c',desc:'Recorded shipments in the week.'},
      {key:'simulated',label:'Simulated operational',color:'#c98a2a',desc:'Unit volumes/BOM generated from real durable-goods seasonality + assumptions.'},
      {key:'public',label:'Publicly sourced',color:'#3a7a9f',desc:'From public manufacturing / company data.'},
      {key:'user-entered',label:'User-entered',color:'#6b7480',desc:'Entered by ops (stock, POs, capacity).'},
      {key:'contracted',label:'Firm orders',color:'#5a4bb3',desc:'Confirmed customer orders / pre-orders.'},
      {key:'pipeline',label:'Probable orders',color:'#9a5b9c',desc:'Likely but unconfirmed demand.'},
    ];
    const REFERENCES=[
      {name:"FRED — Manufacturers' New Orders: Durable Goods (DGORDER)",org:'U.S. Census Bureau',kind:'Public economic series',use:'Demand cycle + seasonality, interpolated to weekly',license:'Public domain'},
      {name:'ISM Manufacturing PMI',org:'Institute for Supply Management',kind:'Public leading indicator',use:'Exogenous demand driver',license:'Public'},
      {name:'Sonos, Inc. (NASDAQ: SONO)',org:'SEC filings',kind:'Public hardware financials',use:'Consumer-hardware Q4 seasonality',license:'Public'},
    ];
    
    const META={
      industry:'manufacturing', mode:'inventory',
      company:'Nexus Devices', subtitle:'Production & supply forecast · next 13 weeks (Q3 2025)', industryTag:'MANUFACTURING',
      currency:'£', unit:'units', entityLabel:'Product lines',
      granularity:'week', startDate:'2022-06-27', startLabel:'27 Jun 2022', weeks:156, season:52, horizon:13,
      capacity:{label:'Production load', value:2100, unit:'units/wk'},
      theme:{
        light:'--bg:#eef1f4;--card:#ffffff;--cardBorder:#dbe1e8;--cardShadow:0 4px 18px -8px rgba(20,35,50,0.14);--text:#1f2d3a;--textStrong:#111c27;--textMuted:#5c6a78;--textSubtle:#93a1b0;--accent:#e08a2b;--accentBg:rgba(224,138,43,0.12);--watneys:#2f5f8f;--watneysLight:rgba(47,95,143,0.10);--red:#c0392b;--redBg:#fae7e4;--amber:#b5701a;--amberBg:#f8efdc;--blue:#2f6f9f;--blueBg:#e6eff5;--green:#2f7a52;--greenBg:#e4f1ea;--topbar:#1b2836;--topbarText:#e7edf3;--topbarSubtext:#8a9aac;--pillBg:rgba(255,255,255,0.10);--pillText:#b4c2d0;--border:#e2e7ed;--inputBg:#fff;--inputBorder:#cfd7e0;--kpiValue:#111c27;--sectionLabel:#e08a2b;--watermarkOpacity:0.035;--watermarkBlend:multiply',
        dark:'--bg:#0f1720;--card:#182430;--cardBorder:#25333f;--cardShadow:0 4px 18px -8px rgba(0,0,0,0.5);--text:#c4cfd9;--textStrong:#eaf0f6;--textMuted:#8a9aac;--textSubtle:#5e6f7e;--accent:#f0a545;--accentBg:rgba(240,165,69,0.14);--watneys:#5a9ad6;--watneysLight:rgba(90,154,214,0.16);--red:#ef6a5a;--redBg:rgba(239,106,90,0.14);--amber:#e0a24a;--amberBg:rgba(224,162,74,0.12);--blue:#68a6d8;--blueBg:rgba(104,166,216,0.14);--green:#57bd7e;--greenBg:rgba(87,189,126,0.12);--topbar:#0b1219;--topbarText:#e7edf3;--topbarSubtext:#75879a;--pillBg:rgba(255,255,255,0.08);--pillText:#8a9aac;--border:#25333f;--inputBg:#0b1219;--inputBorder:#2e3e4c;--kpiValue:#eaf0f6;--sectionLabel:#f0a545;--watermarkOpacity:0.05;--watermarkBlend:screen',
        chartLight:{bg:'#ffffff',grid:'#e4e9ee',axis:'#93a1b0',hist:'#1f2d3a',fc:'#e08a2b',band80:'rgba(224,138,43,0.16)',band95:'rgba(224,138,43,0.06)',alt:'#7f93a6',now:'#e0c49a',mono:"'IBM Plex Mono',monospace",opt:'#2f7a52',con:'#c0392b'},
        chartDark:{bg:'#182430',grid:'rgba(255,255,255,0.06)',axis:'#5e6f7e',hist:'#c4cfd9',fc:'#f0a545',band80:'rgba(240,165,69,0.18)',band95:'rgba(240,165,69,0.07)',alt:'#5a9ad6',now:'rgba(240,165,69,0.4)',mono:"'IBM Plex Mono',monospace",opt:'#57bd7e',con:'#ef6a5a'},
      },
    };
    
    exports["DATE_LABELS"] = DATE_LABELS;
    exports["DRIVERS"] = DRIVERS;
    exports["SKUS"] = SKUS;
    exports["ENTITIES"] = ENTITIES;
    exports["FUTURE"] = FUTURE;
    exports["CONSTRAINTS"] = CONSTRAINTS;
    exports["MODEL_POLICY"] = MODEL_POLICY;
    exports["GAPS"] = GAPS;
    exports["PROVENANCE"] = PROVENANCE;
    exports["REFERENCES"] = REFERENCES;
    exports["META"] = META;
  });

  define("saas-data.js", function(module, exports, require){
    // saas-data.js — SaaS startup demo (SUBSCRIPTION mode: MRR / churn / runway / NRR)
    // Benchmarks anchored to REAL public sources: public SaaS filings (monday.com NASDAQ: MNDY;
    // HubSpot NYSE: HUBS; Asana NYSE: ASAN) for churn/NRR ranges, and KeyBanc/OpenView SaaS
    // benchmarks. Segment-level MRR is SIMULATED operational data, clearly labelled.
    
    function mulberry32(s){return function(){s|=0;s=(s+0x6D2B79F5)|0;let t=Math.imul(s^(s>>>15),1|s);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
    const N=30, CAL=m=>m%12;
    const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const DATE_LABELS=Array.from({length:N},(_,m)=>`${MON[CAL(m)]} ${String(23+Math.floor(m/12)).padStart(2,'0')}`);
    
    // pipeline-weighted new bookings index (exogenous driver)
    const pipeline=Array.from({length:N},(_,m)=>1+0.15*Math.sin(m/6)+m*0.01);
    const DRIVERS={pipeline,exogKeys:['pipeline']};
    
    const rng=mulberry32(90211);
    function mrr(base,g,ev){let v=base;const o=[];for(let m=0;m<N;m++){if(m>0)v=v*(1+g+(rng()-0.5)*0.018);let x=v;if(ev)x=ev(x,m);o.push(Math.round(x));}return o;}
    const churnSpike=(v,m)=>((m>=15&&m<=17)?v*0.955:v);         // a rough quarter for self-serve
    const bigContract=(v,m)=>(m>=22?v+28000:v);                  // enterprise logo lands
    const selfserve=mrr(42000,0.052,(v,m)=>churnSpike(v,m));
    const midmarket=mrr(76000,0.034,null);
    const enterprise=mrr(104000,0.021,(v,m)=>bigContract(v,m));
    const partners=mrr(23000,0.075,null);
    const legacy=mrr(31000,-0.018,null);
    
    const SKUS=[
      {id:'ent',name:'Enterprise',subtitle:'>250 seats',category:'Segment',series:enterprise,churnPct:0.8,grossMargin:0.86,note:'Low churn, lumpy growth — a major logo landed in month 22. Expansion-led.'},
      {id:'mid',name:'Mid-market',subtitle:'50–250 seats',category:'Segment',series:midmarket,churnPct:2.2,grossMargin:0.82,note:'Steady compounding core; healthiest blend of growth and retention.'},
      {id:'smb',name:'Self-serve (SMB)',subtitle:'<50 seats',category:'Segment',series:selfserve,churnPct:4.6,grossMargin:0.78,useDrivers:true,note:'Fast top-of-funnel but churny (4.6%/mo). A rough quarter mid-2024 shows in the line.'},
      {id:'partners',name:'Partners / API',subtitle:'Platform revenue',category:'Segment',series:partners,churnPct:1.8,grossMargin:0.9,note:'Fastest grower (+~7.5%/mo) — usage-based, high margin.'},
      {id:'legacy',name:'Legacy plan',subtitle:'Grandfathered',category:'Segment',series:legacy,churnPct:3.4,grossMargin:0.8,note:'Slowly declining grandfathered plan — migrate or sunset.'},
    ];
    const ENTITIES=SKUS;
    
    const FUTURE={months:6,labels:['Jul 25','Aug 25','Sep 25','Oct 25','Nov 25','Dec 25'],pipeline:[1.3,1.32,1.35,1.4,1.42,1.45]};
    
    const MODEL_POLICY={
      label:'Cohort retention + trend (recurring revenue)',
      modelKeys:['snaive','ma','ses','holt','hw','reg'],
      headline:'Cohort retention · Holt trend · regression · conservative baselines',
      rationale:'Recurring revenue compounds, so trend models (Holt) and regression on pipeline lead; churn is modelled per segment as a monthly drag. There is no "stock" — the constraint is cash runway and onboarding capacity. Early-stage segments with short histories fall back to conservative baselines rather than over-fitting. Champion chosen per segment by rolling-origin back-test.',
    };
    const GAPS=[
      'Cohort-level retention curves (currently blended monthly churn).',
      'Pipeline stage + close-probability data to weight new bookings.',
      'Usage/activation signals to predict churn before it happens.',
      'Contracted (signed) vs pipeline (probable) revenue split.',
      'Seat-level expansion history to model NRR precisely.',
    ];
    const PROVENANCE=[
      {key:'actual',label:'Actual historical',color:'#4a55c8',desc:'Billed MRR in the period.'},
      {key:'simulated',label:'Simulated operational',color:'#8a5bd0',desc:'Segment MRR generated from real SaaS churn/growth benchmarks.'},
      {key:'public',label:'Publicly sourced',color:'#3a7a9f',desc:'Benchmarks from public SaaS filings.'},
      {key:'user-entered',label:'User-entered',color:'#6b6f80',desc:'Cash, burn, churn entered by finance.'},
      {key:'contracted',label:'Contracted ARR',color:'#2f7a52',desc:'Signed, committed contracts.'},
      {key:'pipeline',label:'Pipeline (probable)',color:'#c98a2a',desc:'Weighted pipeline, not yet closed.'},
    ];
    const REFERENCES=[
      {name:'monday.com (NASDAQ: MNDY)',org:'SEC filings',kind:'Public SaaS financials',use:'NRR + churn benchmarks',license:'Public'},
      {name:'HubSpot (NYSE: HUBS)',org:'SEC filings',kind:'Public SaaS financials',use:'Segment retention benchmarks',license:'Public'},
      {name:'KeyBanc / OpenView SaaS benchmarks',org:'Industry surveys',kind:'Public benchmarks',use:'Churn & runway norms by stage',license:'Public'},
    ];
    
    const META={
      industry:'saas', mode:'subscription',
      company:'Cadence', subtitle:'Recurring-revenue forecast · next 12 months', industryTag:'SAAS',
      currency:'£', unit:'MRR', entityLabel:'Segments',
      // MONTHLY by design: MRR / ARR / churn / NRR / runway are month-native recurring-revenue
      // metrics — a weekly bucket has no operational meaning here. Horizon = 12 months.
      granularity:'month', startLabel:'Jan 2023', months:30, season:12, horizon:12,
      cash:4200000, burn:380000, expansion:40,
      capacity:null,
      theme:{
        light:'--bg:#f3f4fb;--card:#ffffff;--cardBorder:#e2e4f2;--cardShadow:0 4px 18px -8px rgba(30,30,70,0.12);--text:#2a2c44;--textStrong:#171933;--textMuted:#63668a;--textSubtle:#9a9db8;--accent:#5b5bd6;--accentBg:rgba(91,91,214,0.10);--watneys:#7c3aed;--watneysLight:rgba(124,58,237,0.10);--red:#d23a5a;--redBg:#fae7ec;--amber:#b5701a;--amberBg:#f8efdc;--blue:#3a63c8;--blueBg:#e8ecf8;--green:#2f8a5e;--greenBg:#e4f2ea;--topbar:#1e2044;--topbarText:#e9eafb;--topbarSubtext:#9498c4;--pillBg:rgba(255,255,255,0.10);--pillText:#c2c4e0;--border:#e6e8f4;--inputBg:#fff;--inputBorder:#d4d7ec;--kpiValue:#171933;--sectionLabel:#5b5bd6;--watermarkOpacity:0.03;--watermarkBlend:multiply',
        dark:'--bg:#12132a;--card:#1c1e3d;--cardBorder:#2b2e52;--cardShadow:0 4px 18px -8px rgba(0,0,0,0.5);--text:#c6c8e4;--textStrong:#edeefc;--textMuted:#9498c4;--textSubtle:#6a6e9a;--accent:#8b8bf5;--accentBg:rgba(139,139,245,0.16);--watneys:#a97cf0;--watneysLight:rgba(169,124,240,0.18);--red:#f0688a;--redBg:rgba(240,104,138,0.14);--amber:#e0a24a;--amberBg:rgba(224,162,74,0.12);--blue:#6a8cf0;--blueBg:rgba(106,140,240,0.14);--green:#54c288;--greenBg:rgba(84,194,136,0.12);--topbar:#0d0e22;--topbarText:#e9eafb;--topbarSubtext:#7a7ea8;--pillBg:rgba(255,255,255,0.08);--pillText:#9498c4;--border:#2b2e52;--inputBg:#0d0e22;--inputBorder:#343863;--kpiValue:#edeefc;--sectionLabel:#8b8bf5;--watermarkOpacity:0.05;--watermarkBlend:screen',
        chartLight:{bg:'#ffffff',grid:'#e8eaf5',axis:'#9a9db8',hist:'#2a2c44',fc:'#5b5bd6',band80:'rgba(91,91,214,0.15)',band95:'rgba(91,91,214,0.06)',alt:'#8f93b8',now:'#b9bce6',mono:"'IBM Plex Mono',monospace",opt:'#2f8a5e',con:'#d23a5a'},
        chartDark:{bg:'#1c1e3d',grid:'rgba(255,255,255,0.06)',axis:'#6a6e9a',hist:'#c6c8e4',fc:'#8b8bf5',band80:'rgba(139,139,245,0.18)',band95:'rgba(139,139,245,0.07)',alt:'#6a8cf0',now:'rgba(139,139,245,0.4)',mono:"'IBM Plex Mono',monospace",opt:'#54c288',con:'#f0688a'},
      },
    };
    
    exports["DATE_LABELS"] = DATE_LABELS;
    exports["DRIVERS"] = DRIVERS;
    exports["SKUS"] = SKUS;
    exports["ENTITIES"] = ENTITIES;
    exports["FUTURE"] = FUTURE;
    exports["MODEL_POLICY"] = MODEL_POLICY;
    exports["GAPS"] = GAPS;
    exports["PROVENANCE"] = PROVENANCE;
    exports["REFERENCES"] = REFERENCES;
    exports["META"] = META;
  });

  var reg={};
  for(var k in __mods){ reg['./'+k]=__mods[k].exports; reg[k]=__mods[k].exports; }
  window.__dcRegistry=reg;
  window.__dcImport=function(name){ if(reg[name]) return Promise.resolve(reg[name]); return Promise.reject(new Error('vantage: module not found '+name)); };
})();
