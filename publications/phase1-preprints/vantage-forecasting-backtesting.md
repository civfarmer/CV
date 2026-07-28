# Comparative Efficacy of Holt-Winters, ETS and Croston Methods in Multi-Industry Rolling-Origin Backtesting

**Christopher I. V. Farmer, LL.M. (University of Worcester) · Independent Researcher · civfarmer@gmail.com**

*Preprint — submitted; pending peer review. Version 1.0, July 2026.*

---

## Abstract

Operational demand forecasting rarely fails because a single algorithm is weak; it fails because one algorithm is imposed on heterogeneous series whose statistical shapes differ. We study a dependency-free forecasting engine that implements the classical exponential-smoothing family (simple exponential smoothing, Holt's linear trend, and additive Holt-Winters — the point-forecast equivalents of the additive error-trend-seasonal, or ETS, models), ordinary-least-squares regression with trend, seasonal dummies and exogenous drivers, and Croston's method for intermittent demand, together with seasonal-naive and moving-average baselines. Rather than committing to one model, the engine performs per-series **rolling-origin (walk-forward) backtesting** and selects a champion by lowest held-out **Weighted Absolute Percentage Error (WAPE)**, retaining challengers for transparency. We apply the engine across five commercial domains with deliberately different operational cadences: brewery, direct-to-consumer (DTC) e-commerce and discrete manufacturing on **weekly** data with a 13-week (one-quarter) operational horizon; software-as-a-service (SaaS) recurring revenue and education enrolment on **monthly** data with a 12-month horizon. Running the reference engine over the 31 benchmark series produces an interpretable and consistent pattern: additive Holt-Winters wins where annual seasonality is strong and at least two seasonal cycles of history exist (8 of 31 series); Holt's linear trend wins for compounding recurring revenue where no genuine annual season exists (5 series, including every SaaS segment); regression captures clean trending series, including structurally declining lines (5 series); robust local-level models (moving average, simple exponential smoothing) win on high-volume, weakly seasonal, noisy lines (8 series); and — importantly — **seasonal-naive beats Croston on every intermittent line in the corpus**, because the intermittency present is *scheduled* (limited seasonal releases, cyclic service batches) rather than the memoryless random arrival process Croston assumes. We argue that the operational horizon and bucket must be matched to the domain's decision cadence and lead-time structure, not chosen for statistical convenience, and that backtest-driven per-series selection is the honest way to let each series declare its own model. All reported figures are computed by executing the reference engine on semi-synthetic benchmark datasets whose seasonal shapes are anchored to public sources and whose operational detail is clearly-labelled simulation; they should therefore be read as demonstrating *selection behaviour under known generating processes*, not as measured accuracy on proprietary operational data.

**Keywords:** demand forecasting; exponential smoothing; Holt-Winters; ETS; Croston's method; intermittent demand; rolling-origin evaluation; walk-forward backtesting; WAPE; model selection; inventory management; recurring revenue

---

## 1. Introduction

Applied forecasting practice contains a recurring category error. A team adopts one model family — often whatever a library defaults to, or whatever the most recent competition rewarded — and applies it uniformly to a portfolio of series that in reality have nothing statistically in common. A brewery's flagship lager, a fast-growing skincare hero SKU, a compounding enterprise SaaS segment, and a trickle of after-sales spare parts are not four instances of the same forecasting problem. They differ in the strength and existence of seasonality, in whether growth is compounding or linear, in the fraction of periods with zero demand, in the length of available history, and — crucially — in the *decision* the forecast must support and the *cadence* at which that decision is taken.

This paper takes the opposite stance: **the model should be a property of the series, discovered empirically, not a property of the vendor, imposed by default.** We examine a compact, dependency-free forecasting engine built around this principle. The engine implements a bank of transparent, classical methods — the exponential-smoothing family, OLS regression with calendar and exogenous features, and Croston's method for intermittent demand, plus honest baselines — and, for each series, decides among them by rolling-origin backtesting. The champion is whichever model forecasts held-out actuals most accurately, measured primarily by WAPE. Nothing is selected on the basis of in-sample fit, and nothing is selected by name or reputation.

We make four contributions. First, **a reproducible, inspectable engine**: because it has no external dependencies and computes real statistics, every claim here can be reproduced by executing the same code on the same data. Second, **a genuinely multi-industry evaluation** across five domains configured independently, each with its own model policy, seasonality assumption, metrics, constraints and — deliberately — its own granularity and horizon. Third, **an argument that horizon must match domain**: weekly buckets with a 13-week horizon are correct for brewery, DTC and manufacturing because supplier lead times are quoted in weeks, whereas monthly buckets with a 12-month horizon are correct for SaaS and education because recurring revenue and termly enrolment are month-native. Fourth, **a precise account of which method wins where, and why**, connecting champion selection to two measurable properties — seasonality strength and intermittency structure — and correcting a common misconception about Croston's method: it is the right model for *random* intermittent demand, and its defeat by seasonal-naive on *scheduled* intermittent demand is diagnostic, not a malfunction.

The remainder of the paper reviews related work (§2), specifies the engine and evaluation protocol (§3), describes the five domains and the experimental design (§4), reports results computed by running the engine (§5), discusses the drivers of model choice and the horizon-matching argument (§6), and states limitations (§7) before concluding (§8).

---

## 2. Related work

**Exponential smoothing and the ETS family.** The methods at the core of this study descend from the exponentially weighted moving average and its extensions to trend and seasonality by Holt (1957, reprinted 2004) and Winters (1960). For decades these recursions were treated as ad hoc; Ord, Koehler and Snyder (1997) and Hyndman, Koehler, Snyder and Grose (2002) placed them on a rigorous statistical footing by showing that each smoothing method corresponds to a state-space model with a single source of error, giving the now-standard error-trend-seasonal (ETS) taxonomy and an automatic selection procedure based on information criteria. Gardner (2006) surveys the state of the art. Our engine implements the *point-forecast recursions* of the additive ETS sub-family — ETS(A,N,N) as simple exponential smoothing, ETS(A,A,N) as Holt's linear trend, and ETS(A,A,A) as additive Holt-Winters — fitting smoothing parameters by grid-search minimisation of one-step in-sample squared error. It does not perform full likelihood-based ETS estimation with automatic error/trend/season-type selection; instead it competes the smoothers against other families and selects among them by out-of-sample backtest, a philosophy analogous to automatic ETS but driven by held-out error rather than in-sample penalised likelihood.

**Intermittent demand.** When demand occurs sporadically, with many zero periods, ordinary smoothing of the raw series is biased because it decays the estimate during runs of zeros. Croston (1972) proposed decoupling the problem into two separately smoothed processes — the size of non-zero demand and the interval between demands — and combining them into a demand-rate estimate. Syntetos and Boylan (2005) showed that Croston's estimator is itself biased and proposed the widely used Syntetos-Boylan Approximation (SBA) correction, and Syntetos, Boylan and Croston (2005) gave an operational classification of demand patterns (by average inter-demand interval and the squared coefficient of variation of demand sizes) that tells a practitioner *when* intermittent methods should be preferred. Our engine implements classical Croston and always competes it on series flagged or detected as intermittent; a production port would add the SBA bias correction. A central empirical finding below is that the presence of zeros is not sufficient justification for Croston: the *structure* of the intermittency matters.

**Rolling-origin evaluation.** The methodological backbone of this work is out-of-sample evaluation. Tashman (2000) reviews the design of out-of-sample accuracy tests and argues that rolling-origin evaluation — repeatedly advancing the forecast origin through the series and re-forecasting — yields more efficient and reliable accuracy estimates than a single fixed split. Bergmeir and Benítez (2012) examine cross-validation for time-series predictors and support the use of such forward-validation schemes for model selection. We adopt an expanding-window rolling-origin protocol as the sole basis for champion selection.

**Accuracy metrics.** Hyndman and Koehler (2006) showed that many popular accuracy measures degenerate in common situations — percentage errors explode near zero actuals, and symmetric variants have their own pathologies — and recommended scale-free measures such as the Mean Absolute Scaled Error (MASE). For portfolios reported to operators in units of demand and cash, we use WAPE (the sum of absolute errors divided by the sum of absolute actuals, also called weighted MAPE), which is robust to the scale of individual series and to occasional zeros, while retaining sMAPE and MASE-adjacent diagnostics. WAPE and closely related weighted errors are the reporting standard in large-scale retail forecasting; the M5 competition (Makridakis, Spiliotis and Assimakopoulos, 2022), run on Walmart hierarchical unit-sales data, evaluated on a weighted, scaled error and found that only a small minority of entries beat automatic exponential smoothing at the disaggregated series level — a reminder that the classical smoothers remain strong baselines precisely where our study focuses. The comprehensive treatment of all of these methods in Hyndman and Athanasopoulos (2021) is the standard reference and informs the engine's design.

**Positioning.** Relative to this literature, the present work is not a new algorithm but an *engineering-and-evaluation* study: it asks what happens when a disciplined per-series backtest-and-select procedure, built from well-understood classical components, is applied honestly across five operationally distinct domains, and reports the resulting champion assignments and their explanations.

---

## 3. Methods

### 3.1 The forecasting engine

The engine is a single dependency-free module. Series are plain arrays of numbers, oldest first; a series carries a seasonal period `s` (12 for monthly, 52 for weekly) supplied by the domain configuration. All models expose a common interface — a name, fitted parameters, one-step in-sample fitted values (used to estimate residual dispersion), and a `forecast(h)` function — so they can be competed uniformly.

**Model families.**

- **Seasonal-naive.** Forecast for period *t+h* equals the observed value one full season earlier. An honesty baseline; strong when a series simply repeats a fixed seasonal pattern.
- **Moving average.** Forecast equals the mean of the last *w* observations (default *w*=3). A robust local-level estimator for noisy series with weak structure.
- **Simple exponential smoothing (SES).** Level-only smoother; smoothing parameter α chosen by grid search over 0.05–0.95 minimising in-sample sum of squared one-step errors (SSE). Equivalent to the ETS(A,N,N) point forecast.
- **Holt's linear trend.** Level and additive trend, parameters (α, β) selected by two-dimensional grid search on SSE. Equivalent to ETS(A,A,N). Suited to compounding or steadily declining series.
- **Additive Holt-Winters.** Level, additive trend and additive seasonal components with parameters (α, β, γ) selected by three-dimensional grid search on SSE; requires at least two full seasonal cycles of history. Equivalent to ETS(A,A,A).
- **OLS regression (trend + season + drivers).** A linear model with intercept, a linear time trend, *s*−1 seasonal dummy variables, and optional exogenous drivers (temperature, promotions, price, ad-spend, PMI, marketing spend, pipeline). Coefficients are estimated by ridge-regularised normal equations (penalty 10⁻⁴, intercept unpenalised) for numerical stability. At weekly resolution the design matrix carries 53 calendar columns before drivers, which — as the results show — creates a real overfitting risk.
- **Croston's method (intermittent demand).** Separate exponential smoothing (α=0.1) of non-zero demand sizes and inter-arrival intervals, combined into a constant demand-rate forecast. Classical Croston is implemented; the SBA bias correction is noted as the production upgrade.

**Metrics.** For aligned held-out actual/prediction pairs the engine computes MAE, RMSE, MAPE, sMAPE, **WAPE** (headline), bias, and percentage bias. WAPE is defined as Σ|predictionᵢ − actualᵢ| ⁄ Σ|actualᵢ| × 100. When the held-out actuals sum to zero over a backtest window — possible for heavily intermittent series — WAPE is undefined and the engine falls back to sMAPE for ranking.

**Prediction intervals.** From the champion's in-sample residual standard deviation σ, the engine forms 80% and 95% bands using normal quantiles, widening the band with horizon as σ·√(1 + 0.4k) at step *k* — the standard growth of forecast uncertainty for smoothing models — and flooring lower bounds at zero for non-negative demand.

**Recalibration.** When a new actual arrives, the engine appends it, classifies it against the prior 95% interval and residual scale as *normal*, *anomalous* (beyond ~1.5σ) or *structural* (outside the interval), re-estimates the level and forecast, and re-runs selection, changing the champion only when drift or performance deterioration justifies it. Recalibration is part of the operational system but is not exercised in the static evaluation reported here.

### 3.2 Rolling-origin backtesting and champion selection

Model selection is performed exclusively out-of-sample by expanding-window rolling-origin evaluation. Given a series of length *n*, a backtest horizon *H*, and a fold count *F*, the engine defines fold origins at cut points *n − H − i* for *i* = 0,…,*F*−1 (subject to a minimum training length of max(*H*+1, ⌊*n*/2⌋)), and, at each origin, fits the model on all observations up to the cut and forecasts *H* steps ahead. The held-out predictions and actuals are pooled across folds and scored once. In the configuration used by the operational dashboards and reproduced here, *H* = 3 and *F* = 4, giving four contiguous, recent, expanding-window origins each evaluated three steps ahead — twelve held-out points per series.

Candidate models are restricted to the domain's **model policy** (a declared list of eligible families; see §4), with Croston additionally forced onto any series that is flagged intermittent or whose zero fraction exceeds 30%. Each eligible candidate is backtested; candidates are ranked by WAPE (with sMAPE as the fallback when WAPE is undefined); the lowest-error model becomes the champion and the runner-up is retained as a challenger with a human-readable selection reason. This makes model choice a transparent, auditable consequence of measured held-out error rather than an analyst's prior.

A deliberate design property deserves emphasis: **the selection horizon (H = 3) is shorter than the operational horizon** at which forecasts are actually issued (13 weeks or 12 months). Selection is therefore performed at a short, statistically reliable horizon and the champion is then extrapolated to the operational horizon. We return to the trade-offs of this choice in §6 and §7.

---

## 4. Experimental design

### 4.1 Five domains, five cadences

The engine is instantiated across five domains. Each was configured independently with its own company, metrics, constraints, seasonal assumptions, model policy, and — the design lever central to this paper — its own granularity and horizon. Table 1 summarises the configurations.

**Table 1. Domain configurations.**

| Domain (company) | Mode | Granularity | Season *s* | Op. horizon | History | Entities | Model-policy headline | Public seasonal anchors |
|---|---|---|---|---|---|---|---|---|
| Brewery (Hopmarket Brewing Co.) | inventory | weekly | 52 | 13 wk | 156 wk (3 yr) | 8 SKUs | Holt-Winters · ETS · weather-regression · Croston | FRED MRTSSM4453USN; Boston Beer (NYSE: SAM); BBPA |
| DTC e-commerce (Kindred Goods) | inventory | weekly | 52 | 13 wk | 156 wk | 6 SKUs | Holt-Winters · ETS · promo-regression · Croston | FRED ECOMNSA; Warby Parker (WRBY); FIGS |
| Manufacturing (Nexus Devices) | inventory | weekly | 52 | 13 wk | 156 wk | 6 lines | Holt-Winters · regression · Croston · capacity-constrained | FRED DGORDER; ISM PMI; Sonos (SONO) |
| SaaS (Cadence) | subscription | monthly | 12 | 12 mo | 30 mo | 5 segments | Cohort/trend · Holt · regression · conservative baselines | monday.com (MNDY); HubSpot (HUBS); KeyBanc/OpenView |
| Education (Northwind Academy) | capacity | monthly | 12 | 12 mo | 30 mo | 6 courses | Holt-Winters · regression on leads/marketing · capacity-constrained | HESA; UK DfE; Office for Students |

The three inventory domains run on **weekly** buckets with a **13-week** (one-quarter) operational horizon, because breweries, online retailers and hardware manufacturers place replenishment or component orders on a weekly cycle against supplier lead times quoted in weeks (typically 4–8). A monthly bucket cannot time a reorder against a five-week lead time; the weekly quarter horizon is the shortest window that spans the longest lead time plus a review period. The two non-inventory domains run on **monthly** buckets with a **12-month** horizon, because their governing quantities — MRR, ARR, churn, net revenue retention and cash runway for SaaS; termly intakes and tutor capacity for education — are month-native, and a weekly bucket has no operational meaning (MRR is billed monthly; tutors are not staffed per week). Section 6 develops this horizon-matching argument.

### 4.2 Data provenance and the honesty of the benchmark

The five datasets are **semi-synthetic** and are labelled as such throughout the source system. Their *seasonal shapes and scales* are anchored to real public data — for example, alcohol-retail seasonality from the U.S. Census/FRED series MRTSSM4453USN and Boston Beer public filings for the brewery; e-commerce seasonality from FRED ECOMNSA and public DTC filings; durable-goods demand and PMI for manufacturing; public SaaS churn/retention benchmarks for the SaaS segments; and HESA intake seasonality for education. The *operational detail* layered onto those shapes — per-SKU weekly volumes, inventory, lead times, per-segment MRR, per-course enrolment — is deterministically generated simulation, seeded for reproducibility, and is explicitly flagged as simulated wherever it appears. Documented, forecast-changing events are overlaid (a July-2023 heatwave, an August-2024 city festival, a pub-group contract from April 2025 for the brewery; a Black-Friday lift and a flash sale for DTC; a component-shortage output cut and a pre-order ramp for manufacturing; an enterprise-logo step and a self-serve churn quarter for SaaS; a corporate-training framework agreement for education).

The consequence for interpretation is important and we state it plainly. Because the data-generating process is synthetic, the WAPE figures in §5 are **not** empirical accuracy measurements on real proprietary operational series. They are, however, **not fabricated**: every number is produced by executing the actual reference engine on the actual benchmark series under the protocol of §3.2. They therefore faithfully demonstrate how the selection machinery behaves when the underlying structure — seasonality strength, trend, intermittency — is known by construction, which is exactly what a methodology study needs. Where a documented reference value from the project's own handoff notes exists, we report it and compare.

### 4.3 Protocol and reproducibility

For every entity in every domain, the engine was invoked exactly as the production dashboards invoke it: `autoSelect` with the domain's season, the domain's model-policy family list, exogenous drivers for entities configured to use them, a backtest horizon of 3, and four folds; followed by `buildForecast` at the full operational horizon (13 weeks or 12 months) for the point forecast and prediction interval. Champion, champion WAPE, the full challenger ranking, the next-period point forecast and its 95% interval were recorded. The evaluation is deterministic: re-running the engine reproduces every figure below exactly.

---

## 5. Results

### 5.1 Champion assignments and accuracy

Table 2 reports, for all 31 series, the selected champion, its backtested WAPE (three-step-ahead, four rolling origins), the next-period point forecast and its 95% prediction interval. Two heavily intermittent lines have WAPE undefined on their backtest window (all held-out actuals summed to zero); for these the engine ranked by sMAPE, shown in brackets.

**Table 2. Per-series champions and backtested error (engine output).**

| Domain | Entity | Champion | WAPE % | Next-period forecast (95% PI) |
|---|---|---|---|---|
| Brewery | Helios Lager (flagship, summer-peaking) | **Holt-Winters** | 7.5 | 566 cases (470–662) |
| Brewery | Tropic IPA (fast-growing, +30%/yr) | **Holt-Winters** | 3.6 | 332 (262–402) |
| Brewery | Midnight Stout (winter line) | Seasonal-naive | 5.6 | 83 (53–113) |
| Brewery | Harvest Pale Ale | **Holt-Winters** | 8.8 | 175 (137–213) |
| Brewery | Solstice Saison (limited release) | Seasonal-naive | n/a (sMAPE 50) | 60 (0–129) |
| Brewery | Aurora Gin (Christmas gifting) | Holt (trend) | 7.1 | 50 (35–64) |
| Brewery | Orchard Cider (strong summer peak) | **Holt-Winters** | 3.9 | 262 (215–309) |
| Brewery | Clear Skies 0.5% (+38%/yr, Dry-Jan) | Regression | 4.5 | 172 (157–187) |
| DTC | Aurora Serum (hero SKU) | Moving average | 7.5 | 1,128 units (730–1,525) |
| DTC | Lumen Candle (new launch, +55%/yr) | Regression | 6.4 | 437 (370–504) |
| DTC | Everyday Tote (bestseller) | Moving average | 6.5 | 764 (464–1,064) |
| DTC | Trail Bottle (summer accessory) | Seasonal-naive | 3.9 | 745 (622–868) |
| DTC | Summit Jacket (winter apparel) | Moving average | 7.3 | 229 (89–368) |
| DTC | Holiday Gift Set (seasonal bundle) | Seasonal-naive | n/a (sMAPE 0) | 0 (0–184) |
| Manufacturing | Nexus Hub (flagship device) | Moving average | 5.1 | 506 units (415–598) |
| Manufacturing | Edge Cam (new launch, +48%/yr) | **Holt-Winters** | 7.6 | 385 (321–449) |
| Manufacturing | Aura Sensor (volume line) | SES | 5.4 | 837 (718–956) |
| Manufacturing | Nexus Pro (premium, Q4-weighted) | Moving average | 6.0 | 213 (173–254) |
| Manufacturing | Hub v1 legacy (EOL, −12%/yr) | Regression | 4.5 | 142 (116–167) |
| Manufacturing | Service Spares (after-sales) | Seasonal-naive | 37.6 | 70 (0–143) |
| SaaS | Enterprise (lumpy, low churn) | SES | 2.7 | £215,095 (204,312–225,878) |
| SaaS | Mid-market (compounding core) | Holt (trend) | 1.2 | £209,143 (207,588–210,697) |
| SaaS | Self-serve SMB (churny) | Holt (trend) | 1.5 | £188,228 (185,347–191,110) |
| SaaS | Partners/API (+7.5%/mo) | Holt (trend) | 2.4 | £191,570 (190,097–193,044) |
| SaaS | Legacy plan (declining) | Holt (trend) | 1.4 | £17,412 (17,105–17,719) |
| Education | Data Analytics Bootcamp (+26%/yr) | **Holt-Winters** | 9.9 | 93 students (67–118) |
| Education | Cloud Engineering Cert (+30%/yr) | **Holt-Winters** | 8.2 | 53 (41–66) |
| Education | Intro to Coding (high volume) | **Holt-Winters** | 4.0 | 104 (84–125) |
| Education | UX Design Diploma (steady) | Regression | 2.3 | 47 (44–50) |
| Education | Business Foundations (−6%/yr) | Regression | 4.1 | 27 (25–29) |
| Education | Leadership (corporate, contract-led) | SES | 27.8 | 70 (53–88) |

### 5.2 Distribution of champions

Across the 31 series the champion distribution is:

**Table 3. Champion frequency across all domains.**

| Champion family | Wins | Where |
|---|---|---|
| Additive Holt-Winters | 8 | Brewery lager, IPA, pale, cider; Mfg Edge Cam; Edu bootcamp, cloud, intro |
| Seasonal-naive | 5 | Brewery stout, saison; DTC bottle, gift set; Mfg spares |
| Holt (linear trend) | 5 | Brewery gin; all four SaaS growth segments |
| OLS regression (trend+season) | 5 | Brewery low/no; DTC candle; Mfg legacy; Edu UX, business |
| Moving average | 5 | DTC serum, tote, jacket; Mfg hub, pro |
| Simple exponential smoothing | 3 | Mfg sensor; SaaS enterprise; Edu leadership |
| **Croston** | **0** | Tested on saison, gift set, spares — lost every time |

No single family dominates; the six winning families are spread almost evenly, which is the central point — a uniform-model deployment would have been wrong for roughly five-sixths of the portfolio. Croston, although eligible and forced onto every intermittent line, never wins; §6.3 explains why this is the correct outcome.

### 5.3 The model arena: three illustrative competitions

The value of backtesting is visible in the full challenger rankings. Three examples (WAPE %, best first) are instructive.

**Helios Lager (brewery flagship, strong annual season, weekly).** Holt-Winters **7.5** | Holt 10.1 | SES 10.7 | Moving average 11.2 | Seasonal-naive 21.9 | Regression+drivers 28.7. Holt-Winters wins cleanly by modelling the 52-week seasonal state; note that the *driver-augmented regression is the worst model here* — with 51 weekly seasonal dummies plus temperature and promotion columns it overfits the expanding training windows and generalises poorly.

**Service Spares (manufacturing after-sales, lumpy/intermittent).** Seasonal-naive **37.6** | Regression 38.8 | Holt-Winters 55.2 | Moving average 71.3 | SES 72.4 | **Croston 72.4** | Holt 74.6. Every model struggles (lumpy demand is genuinely hard), but the deterministic service cycle is best captured by seasonal-naive; Croston, which assumes random arrivals, is among the worst.

**Partners/API (SaaS, compounding growth, monthly).** Holt **2.4** | Holt-Winters 11.6 | SES 14.0 | Moving average 19.6 | Regression 20.3 | Seasonal-naive 57.7. Holt-Winters was eligible (30 months ≥ two seasonal cycles) and competed, but lost by roughly a factor of five to Holt's trend model — there is no genuine annual season in recurring revenue for Holt-Winters to exploit, so it fits and extrapolates seasonal noise.

### 5.4 Comparison with documented reference values

The project's backend-handoff notes record reference champions and errors from an earlier **monthly, horizon-6** brewery seed: Helios Lager → Holt-Winters, WAPE ≈ 10%; Tropic IPA → Regression (trend+season), WAPE ≈ 6.5%; Solstice Saison → seasonal-naive beats Croston. Running the *current* weekly (horizon-13) seed reproduces two of these three conclusions exactly — Helios Lager remains a Holt-Winters series (WAPE 7.5% at weekly resolution) and Solstice Saison remains a seasonal-naive-beats-Croston series — while the Tropic IPA champion shifts from regression to Holt-Winters (WAPE 3.6%). This shift is not an inconsistency but an illustration of the paper's thesis: the champion is a genuine property of the *data and its granularity*. At monthly resolution a trend-plus-season regression best described the IPA's rapid growth with mild seasonality; at weekly resolution, with a full 52-week seasonal state and three years of history, Holt-Winters captures the same series more accurately. The selection procedure adapts; the analyst does not have to.

---

## 6. Discussion

### 6.1 Seasonality strength selects Holt-Winters — when there is enough history

Every one of the eight Holt-Winters champions has strong, genuine annual seasonality *and* at least two full seasonal cycles of history: the brewery's weather-driven lager, IPA, pale ale and cider (156 weekly observations at *s*=52), the manufacturer's Q4-weighted new camera, and the academy's September-intake bootcamp, cloud certificate and intro course (30 monthly observations at *s*=12). Holt-Winters wins because it estimates and projects the seasonal component explicitly; competitors that ignore season (SES, Holt, moving average) systematically miss the peaks and troughs, and seasonal-naive, which captures the shape, cannot adapt its level or trend and so trails on series that are also growing. The two-cycle requirement is not incidental — it is why Holt-Winters is ineligible on very short series and why short-history growth segments fall back to trend or baseline models.

### 6.2 Compounding growth without a season selects trend models

The cleanest single result is the SaaS column: **all five recurring-revenue segments choose a trend model** (Holt for the four growth/decline segments, SES for the lumpy enterprise segment), and Holt-Winters — though eligible — loses every time, typically by a large margin. Recurring revenue compounds month over month and has no true annual seasonality; a seasonal model asked to explain it will fit spurious seasonal structure into what is really trend plus noise, and pay for it out of sample. Holt's linear trend, by contrast, is almost exactly the right generating assumption for a book of MRR growing or declining at a roughly constant rate, which is why its backtested WAPE for the mid-market, self-serve, partners and legacy segments falls between 1.2% and 2.4%. The brewery's Aurora Gin (a distributed spirit with a Christmas gifting peak but modelled at weekly resolution over a short effective seasonal signal) similarly chooses Holt. The operational lesson is blunt: **do not put a seasonal model on a series that has no season**, and let the backtest enforce it.

### 6.3 Intermittency structure, not the mere presence of zeros, decides Croston

The most easily misread result is that Croston never wins. It would be wrong to conclude that Croston is a poor method; the correct reading is that **none of the intermittent series in this corpus have the structure Croston is designed for.** Croston (1972) models demand that arrives at *random* intervals with *random* sizes — a memoryless arrival process — and estimates a smoothed rate. The three intermittent lines here are different in kind: the brewery's Solstice Saison and the DTC Holiday Gift Set are *limited seasonal releases* whose zeros are scheduled (they are simply out of season for most of the year), and the manufacturer's Service Spares follow a *deterministic service cycle*. For scheduled zeros, seasonal-naive is close to optimal — it predicts zero out of season and the release quantity in season — while Croston's constant-rate estimate smears demand across periods where it does not occur. This connects directly to the demand-categorization framework of Syntetos, Boylan and Croston (2005): the decision to use an intermittent method should follow from measured inter-demand interval and demand-size variability, not from the observation that a series contains zeros. Our engine encodes exactly this discipline — it *tests* Croston on every intermittent line but *selects* it only if it actually wins the backtest, and here the more structured seasonal-naive always does. Reporting Croston's defeat, rather than hiding it, is the honest and informative outcome.

### 6.4 Robust local-level models win on noisy, weakly-seasonal, high-volume lines

Eight series choose moving average or SES. These are high-volume lines whose seasonal signal is weak relative to their week-to-week operational noise: the DTC hero serum, bestseller tote and winter jacket; the manufacturer's flagship hub, premium Pro and volume sensor; and the lumpy SaaS enterprise segment. On such series the marginal seasonal information a Holt-Winters model tries to estimate is swamped by noise, and the more heavily parameterised model overfits; a three-period moving average or a well-tuned SES tracks the local level more reliably out of sample. This is the bias–variance trade-off made operational: when structure is weak, the parsimonious estimator wins.

### 6.5 Regression earns its place on structured trends, including decline

Five series choose OLS regression on trend and seasonal dummies, and the pattern is coherent: the brewery's fast-growing low/no line, the DTC candle launch, and — notably — two *declining* lines, the manufacturer's end-of-life Hub v1 (−12%/yr) and the academy's shrinking Business Foundations course (−6%/yr). A linear trend-plus-season regression extrapolates a clean, monotone trajectory more crisply than a smoother that must infer the trend from recent levels, and handles decline as naturally as growth. But §5.3 also shows regression's failure mode: at weekly resolution its 53-column seasonal design (plus drivers) is high-dimensional relative to the backtest folds, and on the strongly-seasonal lager and serum the driver-augmented regression is the *worst* candidate. Regression is powerful where trend is the dominant, clean signal and fragile where a parsimonious seasonal state would do better — precisely the discrimination a backtest can make and a default cannot.

### 6.6 Why the operational horizon must match the domain

The horizon and bucket are not free statistical parameters; they are dictated by the decision the forecast serves. The three inventory domains must answer *"how much do I order, and when, to avoid a stock-out before the next delivery?"* Supplier lead times are 4–8 weeks, review is weekly, and the binding planning window is therefore a quarter of weekly buckets — hence *s*=52 and a 13-week horizon. Aggregating these businesses to monthly buckets would destroy the resolution needed to time a reorder against a five-week lead time and would blur the very weekly promotional and weather spikes that drive stock-outs. The two non-inventory domains answer different questions — *"what will MRR and runway be next quarter?"* and *"will the September intake oversubscribe tutor capacity?"* — whose natural unit is the month; recurring revenue is billed monthly and enrolment is termly, so a weekly bucket would invent structure that has no operational referent and no data to support it. Matching granularity to cadence is thus simultaneously an accuracy decision (the model sees the right signal-to-noise) and an interpretability decision (the forecast lands in the operator's decision unit). A single engine can serve all five only because granularity and horizon are configuration, not hard-coded assumptions — the same code runs at *s*=52, *H*=13 and at *s*=12, *H*=12 without modification.

A subtler design point concerns the *selection* horizon: champions are chosen on a three-step-ahead backtest but deployed to 13- or 12-step forecasts. This favours near-term accuracy and reduces variance in the selection metric (short-horizon errors estimate reliably from few folds), but does not directly optimise the full operational horizon — a model best at three steps is not guaranteed best at thirteen. We flag this as both a defensible efficiency choice and a limitation (§7).

---

## 7. Limitations

Several limitations bound the claims above.

1. **Semi-synthetic data.** The benchmark series are simulation anchored to public seasonal shapes, not real proprietary operational data. The reported WAPE values are genuine engine outputs under known generating processes, but they demonstrate *selection behaviour*, not field accuracy. Absolute error levels (many single-digit WAPEs) are lower than one should expect on real, messier series and reflect the controlled noise of the generator. The champion *assignments*, which depend on structural properties the generator shares with real series, are the more transferable finding.

2. **Selection horizon shorter than operational horizon.** As noted, selection uses *H*=3 while forecasts are issued at 13 or 12 steps. A multi-horizon or operational-horizon backtest could change some borderline champions (for example, series where a trend model wins at short horizon but drifts at long horizon). The four-fold, recent-origin design also weights the most recent regime heavily, which is appropriate for drift-responsiveness but samples limited history.

3. **Classical Croston without SBA.** The engine implements classical Croston, not the Syntetos-Boylan bias-corrected estimator. On genuinely random intermittent demand — absent from this corpus — SBA would be the stronger comparator, and the "Croston never wins" result should not be generalised beyond scheduled-intermittency settings.

4. **Additive Holt-Winters only.** The seasonal smoother is additive; multiplicative seasonality (where seasonal amplitude scales with level) is not fitted, and the smoothers are not selected by likelihood/AIC as in a full ETS implementation. Some series with amplitude-scaling seasonality might be better served by multiplicative Holt-Winters or by log-transform-then-additive.

5. **Regression conditioning at weekly resolution.** The 53-column seasonal design is high-dimensional relative to the effective sample in each backtest fold; although ridge-regularised, it overfits on strongly seasonal weekly lines. Fourier-term seasonality or penalised seasonal splines would likely make regression more competitive and less fragile.

6. **No probabilistic or hierarchical evaluation.** Accuracy is assessed on point forecasts via WAPE/sMAPE; prediction-interval calibration and coverage are computed by the engine but not evaluated here, and no cross-series hierarchical reconciliation (as in M5) is attempted. Metrics also degenerate (WAPE undefined) on the most intermittent windows, where a scaled measure such as MASE would be more robust.

7. **Single reference implementation.** Results reflect one engine's parameter grids and defaults; a Python port to statsmodels/StatsForecast (planned in the project's handoff) should reproduce champions within tolerance, but library defaults can shift borderline cases, which is precisely why golden tests are specified.

---

## 8. Conclusion

Across five operationally distinct domains and 31 series, a disciplined procedure — build a bank of transparent classical models, backtest each on rolling origins, and select the per-series champion by held-out WAPE — produces an interpretable map from series structure to model choice. Strong annual seasonality with sufficient history selects additive Holt-Winters; compounding recurring revenue with no season selects Holt's trend; clean monotone trends, including decline, select regression; weak-signal high-volume noise selects robust local-level smoothers; and scheduled intermittency selects seasonal-naive over Croston, whose designed-for regime of random arrivals does not occur in this corpus. The champion genuinely changes with the data and even with its granularity, as the Tropic IPA monthly-to-weekly shift shows. The practical thesis is twofold: first, that no single method is best, and the honest way to exploit that is to let each series declare its model through out-of-sample backtesting rather than by analyst default; and second, that the forecasting horizon and bucket are operational commitments — they must match the domain's decision cadence and lead-time structure, so that the model sees the right signal and the forecast lands in the operator's decision unit. A single dependency-free engine can serve a brewery, an online retailer, a hardware manufacturer, a SaaS company and a training provider precisely because these choices are configuration, and because selection is evidence, not opinion.

---

## Reproducibility statement

All figures were produced by executing the reference engine (`forecast-engine.js`) on the five benchmark datasets (`brewery-data.js`, `dtc-data.js`, `manufacturing-data.js`, `saas-data.js`, `education-data.js`) under the protocol of §3.2 (rolling-origin backtest, *H*=3, four expanding-window folds, ranked by WAPE with sMAPE fallback) and the operational-horizon forecast of §3.1. Because the datasets are deterministically seeded, the evaluation is exactly reproducible. The datasets are semi-synthetic — seasonal shapes anchored to the public sources in Table 1, operational detail clearly-labelled simulation. Documented reference champion/WAPE values from the project's backend-handoff notes (an earlier monthly brewery seed) are cited in §5.4.

---

## References

Bergmeir, C., & Benítez, J. M. (2012). On the use of cross-validation for time series predictor evaluation. *Information Sciences*, 191, 192–213. https://doi.org/10.1016/j.ins.2011.12.028

Croston, J. D. (1972). Forecasting and stock control for intermittent demands. *Operational Research Quarterly*, 23(3), 289–303. https://doi.org/10.1057/jors.1972.50

Gardner, E. S., Jr. (2006). Exponential smoothing: The state of the art — Part II. *International Journal of Forecasting*, 22(4), 637–666. https://doi.org/10.1016/j.ijforecast.2006.03.005

Holt, C. C. (1957). Forecasting seasonals and trends by exponentially weighted moving averages. Office of Naval Research Memorandum 52. Reprinted in *International Journal of Forecasting* (2004), 20(1), 5–10. https://doi.org/10.1016/j.ijforecast.2003.09.015

Hyndman, R. J., & Athanasopoulos, G. (2021). *Forecasting: Principles and Practice* (3rd ed.). OTexts, Melbourne. https://otexts.com/fpp3/

Hyndman, R. J., & Koehler, A. B. (2006). Another look at measures of forecast accuracy. *International Journal of Forecasting*, 22(4), 679–688. https://doi.org/10.1016/j.ijforecast.2006.03.001

Hyndman, R. J., Koehler, A. B., Snyder, R. D., & Grose, S. (2002). A state space framework for automatic forecasting using exponential smoothing methods. *International Journal of Forecasting*, 18(3), 439–454. https://doi.org/10.1016/S0169-2070(01)00110-8

Makridakis, S., Spiliotis, E., & Assimakopoulos, V. (2022). M5 accuracy competition: Results, findings, and conclusions. *International Journal of Forecasting*, 38(4), 1346–1364. https://doi.org/10.1016/j.ijforecast.2021.11.013

Ord, J. K., Koehler, A. B., & Snyder, R. D. (1997). Estimation and prediction for a class of dynamic nonlinear statistical models. *Journal of the American Statistical Association*, 92(440), 1621–1629. https://doi.org/10.1080/01621459.1997.10473684

Syntetos, A. A., & Boylan, J. E. (2005). The accuracy of intermittent demand estimates. *International Journal of Forecasting*, 21(2), 303–314. https://doi.org/10.1016/j.ijforecast.2004.10.001

Syntetos, A. A., Boylan, J. E., & Croston, J. D. (2005). On the categorization of demand patterns. *Journal of the Operational Research Society*, 56(5), 495–503. https://doi.org/10.1057/palgrave.jors.2601841

Tashman, L. J. (2000). Out-of-sample tests of forecasting accuracy: An analysis and review. *International Journal of Forecasting*, 16(4), 437–450. https://doi.org/10.1016/S0169-2070(00)00065-0

Winters, P. R. (1960). Forecasting sales by exponentially weighted moving averages. *Management Science*, 6(3), 324–342. https://doi.org/10.1287/mnsc.6.3.324
