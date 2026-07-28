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
export const DATE_LABELS=Array.from({length:N},(_,w)=>wlabel(w));

// exogenous drivers: paid ad-spend index, promo flag, site-traffic index (weekly)
const adSpend=Array.from({length:N},(_,w)=>1+0.35*Math.sin((fracYear(w)*12-2)/12*2*Math.PI)+(w>=52?0.15:0)+(w>=104?0.15:0));
const promo=Array(N).fill(0);
for(let w=0;w<N;w++){const m=wMonth(w),d=wDom(w); if(m===10||(m===6&&d<=14)||(m===4&&d<=7)) promo[w]=1;} // Black Friday (all Nov) + summer + spring pushes
const traffic=adSpend.map((a,w)=>a*(1+((wMonth(w)===10||wMonth(w)===11)?0.4:0)));
export const DRIVERS={adSpend,promo,traffic,exogKeys:['adSpend','promo']};

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

export const SKUS=[
  {id:'serum',name:'Aurora Serum',subtitle:'Skincare · hero SKU',category:'Skincare',series:serum,price:38,unitMargin:24,onHand:2600,onOrder:1500,leadTimeWeeks:6,shelfLifeMonths:18,useDrivers:true,note:'Hero product. Holiday-gifting peak; long 6-week overseas lead time — the classic DTC stockout trap.'},
  {id:'candle',name:'Lumen Candle',subtitle:'Home · new launch',category:'Home',series:candle,price:29,unitMargin:17,onHand:760,onOrder:300,leadTimeWeeks:5,shelfLifeMonths:24,note:'Fastest-growing line (+55%/yr). Likely under-stocked for its trajectory.'},
  {id:'tote',name:'Everyday Tote',subtitle:'Accessories · bestseller',category:'Accessories',series:tote,price:45,unitMargin:27,onHand:4200,onOrder:1200,leadTimeWeeks:6,shelfLifeMonths:36,note:'Steady bestseller with a strong Q4 gifting spike.'},
  {id:'bottle',name:'Trail Bottle',subtitle:'Accessories · summer',category:'Accessories',series:bottle,price:26,unitMargin:15,onHand:7500,onOrder:0,leadTimeWeeks:5,shelfLifeMonths:36,note:'Summer-peaking; heading into the off-season now — overstock risk.'},
  {id:'jacket',name:'Summit Jacket',subtitle:'Apparel · winter',category:'Apparel',series:jacket,price:120,unitMargin:62,onHand:2200,onOrder:400,leadTimeWeeks:8,shelfLifeMonths:36,note:'High-value winter apparel; Q4 buys landed — 8-week lead means the winter build is already committed.'},
  {id:'giftset',name:'Holiday Gift Set',subtitle:'Bundle · seasonal',category:'Bundle',series:giftset,price:65,unitMargin:34,onHand:120,onOrder:0,leadTimeWeeks:6,shelfLifeMonths:12,intermittent:true,note:'Limited seasonal bundle — intermittent (Croston territory).'},
];
export const ENTITIES=SKUS;

export const FUTURE={weeks:13,labels:Array.from({length:13},(_,k)=>wlabel(N+k)),adSpend:Array.from({length:13},(_,k)=>1+0.35*Math.sin((fracYear(N+k)*12-2)/12*2*Math.PI)+0.3),promo:Array.from({length:13},(_,k)=>{const w=N+k;return (wMonth(w)===6&&wDom(w)<=14)?1:0;})};

export const CONSTRAINTS={fulfilmentCapacity:3200,provenance:'user-entered'};

export const MODEL_POLICY={
  label:'Seasonal + promo-driven retail demand',
  modelKeys:['snaive','ma','ses','holt','hw','reg'],
  headline:'Holt-Winters · ETS · promo-regression · Croston',
  rationale:'Weekly e-commerce demand is seasonal (Q4/holiday peak, season = 52 weeks) and highly campaign-sensitive, so Holt-Winters and regression on ad-spend/promotions lead. New launches with short histories fall back to trend + conservative baselines; seasonal bundles are intermittent at weekly resolution, so Croston is tested. Champion is chosen per SKU by rolling-origin back-test.',
};

export const GAPS=[
  'Daily order + sessions data (currently weekly) to model campaign spikes precisely.',
  'Locked promotional calendar for the forecast window.',
  'Returns data by SKU to forecast net demand, not gross.',
  'Cohort/repeat-purchase rates to separate new vs returning demand.',
  'Confirmed supplier lead times for the Q4 buy.',
];

export const PROVENANCE=[
  {key:'actual',label:'Actual historical',color:'#c2503f',desc:'Recorded orders in the week.'},
  {key:'simulated',label:'Simulated operational',color:'#d98a3a',desc:'SKU volumes generated from real e-commerce seasonality + documented assumptions.'},
  {key:'public',label:'Publicly sourced',color:'#3a7a9f',desc:'From public retail / company data.'},
  {key:'user-entered',label:'User-entered',color:'#6b6459',desc:'Entered by the operator (stock, POs).'},
  {key:'contracted',label:'Committed',color:'#5a4bb3',desc:'Placed purchase orders / confirmed campaigns.'},
  {key:'pipeline',label:'Planned',color:'#9a5b9c',desc:'Planned but unconfirmed campaigns/buys.'},
];

export const REFERENCES=[
  {name:'FRED — E-Commerce Retail Sales (ECOMNSA)',org:'U.S. Census Bureau',kind:'Public economic series',use:'Q4/holiday seasonal shape, interpolated to weekly',license:'Public domain'},
  {name:'Warby Parker (NYSE: WRBY)',org:'SEC filings',kind:'Public DTC financials',use:'DTC revenue seasonality + gross margins',license:'Public'},
  {name:'FIGS, Inc. (NYSE: FIGS)',org:'SEC filings / investor decks',kind:'Public DTC financials',use:'Repeat-purchase & inventory dynamics',license:'Public'},
];

export const META={
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
