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

export const fmtI = n => (n == null || isNaN(n)) ? '—' : Math.round(n).toLocaleString('en-GB');
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
export function computeAnalysis(E, D, props, overrides = {}) {
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
export function buildDetail(desc, A, D) {
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
export function buildReport(state, A, D, props) {
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
export function buildRenderVals(state, props, E, D, handlers) {
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
