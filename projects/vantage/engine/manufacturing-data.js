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
export const DATE_LABELS=Array.from({length:N},(_,w)=>wlabel(w));

const pmi=Array.from({length:N},(_,w)=>50+6*Math.sin((fracYear(w)*12-3)/12*2*Math.PI)+(w>=78?2:0)); // ISM-style cycle
const backlog=Array.from({length:N},(_,w)=>1+0.2*Math.sin((fracYear(w)*12-1)/12*2*Math.PI));
export const DRIVERS={pmi,backlog,exogKeys:['pmi']};

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

export const SKUS=[
  {id:'hub',name:'Nexus Hub',subtitle:'Smart hub · flagship',category:'Device',series:hub,price:180,unitMargin:70,onHand:1180,onOrder:600,leadTimeWeeks:6,shelfLifeMonths:60,useDrivers:true,note:'Flagship device. BOM includes a long-lead controller chip — component-constrained into Q4.'},
  {id:'edge',name:'Edge Cam',subtitle:'Camera · new launch',category:'Device',series:edge,price:140,unitMargin:52,onHand:420,onOrder:300,leadTimeWeeks:8,shelfLifeMonths:60,note:'New launch on pre-order (+48%/yr). 8-week assembly lead — commit builds now.'},
  {id:'sensor',name:'Aura Sensor',subtitle:'Sensor · volume line',category:'Component',series:sensor,price:42,unitMargin:16,onHand:5400,onOrder:1200,leadTimeWeeks:5,shelfLifeMonths:48,note:'High-volume line; steady demand, main draw on assembly capacity.'},
  {id:'pro',name:'Nexus Pro',subtitle:'Device · premium',category:'Device',series:pro,price:340,unitMargin:150,onHand:2050,onOrder:0,leadTimeWeeks:7,shelfLifeMonths:60,note:'Premium model — high margin, lower volume, Q4-weighted.'},
  {id:'legacy',name:'Hub v1 (legacy)',subtitle:'Device · end-of-life',category:'Device',series:legacy,price:120,unitMargin:38,onHand:3200,onOrder:0,leadTimeWeeks:6,shelfLifeMonths:60,note:'Declining EOL line (−12%/yr) — overstock risk; run down, do not rebuild.'},
  {id:'spares',name:'Service Spares',subtitle:'Parts · after-sales',category:'Spares',series:spares,price:24,unitMargin:12,onHand:90,onOrder:0,leadTimeWeeks:6,shelfLifeMonths:60,intermittent:true,note:'Intermittent after-sales demand — Croston territory.'},
];
export const ENTITIES=SKUS;

export const FUTURE={weeks:13,labels:Array.from({length:13},(_,k)=>wlabel(N+k)),pmi:Array.from({length:13},(_,k)=>50+6*Math.sin((fracYear(N+k)*12-3)/12*2*Math.PI)+2)};
export const CONSTRAINTS={productionCapacity:2100,provenance:'user-entered'};

export const MODEL_POLICY={
  label:'Demand + intermittent + capacity-constrained',
  modelKeys:['snaive','ma','ses','holt','hw','reg'],
  headline:'Holt-Winters · regression · Croston · capacity-constrained',
  rationale:'Weekly hardware demand is trend + moderate seasonality driven by orders/PMI, so Holt-Winters (season = 52 weeks) and regression lead on volume lines. After-sales spares are intermittent at weekly resolution, so Croston is tested and often wins. Everything is then checked against weekly production capacity and supplier lead times before a build plan is issued. Champion chosen per line by rolling-origin back-test.',
};
export const GAPS=[
  'Bill-of-materials linkage to forecast component-level demand, not just finished goods.',
  'Confirmed supplier lead times + yield/defect rates by line.',
  'Firm order book / pre-orders for the new launch.',
  'Daily build + WIP data (currently weekly).',
  'Warranty-return rates to net off refurb demand.',
];
export const PROVENANCE=[
  {key:'actual',label:'Actual historical',color:'#3f6f9c',desc:'Recorded shipments in the week.'},
  {key:'simulated',label:'Simulated operational',color:'#c98a2a',desc:'Unit volumes/BOM generated from real durable-goods seasonality + assumptions.'},
  {key:'public',label:'Publicly sourced',color:'#3a7a9f',desc:'From public manufacturing / company data.'},
  {key:'user-entered',label:'User-entered',color:'#6b7480',desc:'Entered by ops (stock, POs, capacity).'},
  {key:'contracted',label:'Firm orders',color:'#5a4bb3',desc:'Confirmed customer orders / pre-orders.'},
  {key:'pipeline',label:'Probable orders',color:'#9a5b9c',desc:'Likely but unconfirmed demand.'},
];
export const REFERENCES=[
  {name:"FRED — Manufacturers' New Orders: Durable Goods (DGORDER)",org:'U.S. Census Bureau',kind:'Public economic series',use:'Demand cycle + seasonality, interpolated to weekly',license:'Public domain'},
  {name:'ISM Manufacturing PMI',org:'Institute for Supply Management',kind:'Public leading indicator',use:'Exogenous demand driver',license:'Public'},
  {name:'Sonos, Inc. (NASDAQ: SONO)',org:'SEC filings',kind:'Public hardware financials',use:'Consumer-hardware Q4 seasonality',license:'Public'},
];

export const META={
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
