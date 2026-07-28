// saas-data.js — SaaS startup demo (SUBSCRIPTION mode: MRR / churn / runway / NRR)
// Benchmarks anchored to REAL public sources: public SaaS filings (monday.com NASDAQ: MNDY;
// HubSpot NYSE: HUBS; Asana NYSE: ASAN) for churn/NRR ranges, and KeyBanc/OpenView SaaS
// benchmarks. Segment-level MRR is SIMULATED operational data, clearly labelled.

function mulberry32(s){return function(){s|=0;s=(s+0x6D2B79F5)|0;let t=Math.imul(s^(s>>>15),1|s);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
const N=30, CAL=m=>m%12;
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export const DATE_LABELS=Array.from({length:N},(_,m)=>`${MON[CAL(m)]} ${String(23+Math.floor(m/12)).padStart(2,'0')}`);

// pipeline-weighted new bookings index (exogenous driver)
const pipeline=Array.from({length:N},(_,m)=>1+0.15*Math.sin(m/6)+m*0.01);
export const DRIVERS={pipeline,exogKeys:['pipeline']};

const rng=mulberry32(90211);
function mrr(base,g,ev){let v=base;const o=[];for(let m=0;m<N;m++){if(m>0)v=v*(1+g+(rng()-0.5)*0.018);let x=v;if(ev)x=ev(x,m);o.push(Math.round(x));}return o;}
const churnSpike=(v,m)=>((m>=15&&m<=17)?v*0.955:v);         // a rough quarter for self-serve
const bigContract=(v,m)=>(m>=22?v+28000:v);                  // enterprise logo lands
const selfserve=mrr(42000,0.052,(v,m)=>churnSpike(v,m));
const midmarket=mrr(76000,0.034,null);
const enterprise=mrr(104000,0.021,(v,m)=>bigContract(v,m));
const partners=mrr(23000,0.075,null);
const legacy=mrr(31000,-0.018,null);

export const SKUS=[
  {id:'ent',name:'Enterprise',subtitle:'>250 seats',category:'Segment',series:enterprise,churnPct:0.8,grossMargin:0.86,note:'Low churn, lumpy growth — a major logo landed in month 22. Expansion-led.'},
  {id:'mid',name:'Mid-market',subtitle:'50–250 seats',category:'Segment',series:midmarket,churnPct:2.2,grossMargin:0.82,note:'Steady compounding core; healthiest blend of growth and retention.'},
  {id:'smb',name:'Self-serve (SMB)',subtitle:'<50 seats',category:'Segment',series:selfserve,churnPct:4.6,grossMargin:0.78,useDrivers:true,note:'Fast top-of-funnel but churny (4.6%/mo). A rough quarter mid-2024 shows in the line.'},
  {id:'partners',name:'Partners / API',subtitle:'Platform revenue',category:'Segment',series:partners,churnPct:1.8,grossMargin:0.9,note:'Fastest grower (+~7.5%/mo) — usage-based, high margin.'},
  {id:'legacy',name:'Legacy plan',subtitle:'Grandfathered',category:'Segment',series:legacy,churnPct:3.4,grossMargin:0.8,note:'Slowly declining grandfathered plan — migrate or sunset.'},
];
export const ENTITIES=SKUS;

export const FUTURE={months:6,labels:['Jul 25','Aug 25','Sep 25','Oct 25','Nov 25','Dec 25'],pipeline:[1.3,1.32,1.35,1.4,1.42,1.45]};

export const MODEL_POLICY={
  label:'Cohort retention + trend (recurring revenue)',
  modelKeys:['snaive','ma','ses','holt','hw','reg'],
  headline:'Cohort retention · Holt trend · regression · conservative baselines',
  rationale:'Recurring revenue compounds, so trend models (Holt) and regression on pipeline lead; churn is modelled per segment as a monthly drag. There is no "stock" — the constraint is cash runway and onboarding capacity. Early-stage segments with short histories fall back to conservative baselines rather than over-fitting. Champion chosen per segment by rolling-origin back-test.',
};
export const GAPS=[
  'Cohort-level retention curves (currently blended monthly churn).',
  'Pipeline stage + close-probability data to weight new bookings.',
  'Usage/activation signals to predict churn before it happens.',
  'Contracted (signed) vs pipeline (probable) revenue split.',
  'Seat-level expansion history to model NRR precisely.',
];
export const PROVENANCE=[
  {key:'actual',label:'Actual historical',color:'#4a55c8',desc:'Billed MRR in the period.'},
  {key:'simulated',label:'Simulated operational',color:'#8a5bd0',desc:'Segment MRR generated from real SaaS churn/growth benchmarks.'},
  {key:'public',label:'Publicly sourced',color:'#3a7a9f',desc:'Benchmarks from public SaaS filings.'},
  {key:'user-entered',label:'User-entered',color:'#6b6f80',desc:'Cash, burn, churn entered by finance.'},
  {key:'contracted',label:'Contracted ARR',color:'#2f7a52',desc:'Signed, committed contracts.'},
  {key:'pipeline',label:'Pipeline (probable)',color:'#c98a2a',desc:'Weighted pipeline, not yet closed.'},
];
export const REFERENCES=[
  {name:'monday.com (NASDAQ: MNDY)',org:'SEC filings',kind:'Public SaaS financials',use:'NRR + churn benchmarks',license:'Public'},
  {name:'HubSpot (NYSE: HUBS)',org:'SEC filings',kind:'Public SaaS financials',use:'Segment retention benchmarks',license:'Public'},
  {name:'KeyBanc / OpenView SaaS benchmarks',org:'Industry surveys',kind:'Public benchmarks',use:'Churn & runway norms by stage',license:'Public'},
];

export const META={
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
