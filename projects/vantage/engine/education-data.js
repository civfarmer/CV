// education-data.js — Education / training provider demo (CAPACITY mode)
// enrolment / tutor capacity / cohort completion. Seasonal shape anchored to REAL public
// data: HESA (UK Higher Education Statistics Agency) intake seasonality (Sep peak, Jan
// secondary) and public sector enrolment patterns. Course-level volumes are SIMULATED
// operational data, clearly labelled.

function mulberry32(s){return function(){s|=0;s=(s+0x6D2B79F5)|0;let t=Math.imul(s^(s>>>15),1|s);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
const N=30, CAL=m=>m%12;
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export const DATE_LABELS=Array.from({length:N},(_,m)=>`${MON[CAL(m)]} ${String(23+Math.floor(m/12)).padStart(2,'0')}`);

// marketing spend index + lead-enquiry index (exogenous drivers)
const marketing=Array.from({length:N},(_,m)=>1+0.4*(CAL(m)===7||CAL(m)===8?1:0)+(CAL(m)===11||CAL(m)===0?0.3:0));
const leads=marketing.map((x,m)=>x*(1+0.1*Math.sin(m/4)));
export const DRIVERS={marketing,leads,exogKeys:['marketing']};

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

export const SKUS=[
  {id:'bootcamp',name:'Data Analytics Bootcamp',subtitle:'12-week · flagship',category:'Bootcamp',series:bootcamp,capacityPerIntake:110,studentsPerTutor:16,fee:5400,completion:0.86,useDrivers:true,note:'Flagship, +26%/yr — forecast to oversubscribe the Sep intake.'},
  {id:'cloud',name:'Cloud Engineering Cert',subtitle:'10-week',category:'Certificate',series:cloud,capacityPerIntake:80,studentsPerTutor:18,fee:3900,completion:0.82,note:'Fastest grower (+30%/yr) — tutor supply is the binding constraint.'},
  {id:'intro',name:'Intro to Coding',subtitle:'6-week · high volume',category:'Short course',series:intro,capacityPerIntake:160,studentsPerTutor:22,fee:1200,completion:0.74,note:'High-volume feeder course; strong Sep/Jan intake seasonality.'},
  {id:'ux',name:'UX Design Diploma',subtitle:'16-week',category:'Diploma',series:ux,capacityPerIntake:90,studentsPerTutor:16,fee:6200,completion:0.88,note:'Steady, high-completion diploma.'},
  {id:'biz',name:'Business Foundations',subtitle:'8-week',category:'Certificate',series:biz,capacityPerIntake:90,studentsPerTutor:20,fee:2400,completion:0.79,note:'Declining demand (−6%/yr) — under-enrolled; review or reposition.'},
  {id:'lead',name:'Leadership (Corporate)',subtitle:'Bespoke cohorts',category:'Corporate',series:lead,capacityPerIntake:60,studentsPerTutor:14,fee:8800,completion:0.92,note:'Corporate-contract driven — a new framework agreement lifts 2025 intakes.'},
];
export const ENTITIES=SKUS;

export const FUTURE={months:6,labels:['Jul 25','Aug 25','Sep 25','Oct 25','Nov 25','Dec 25'],marketing:[1.4,1.5,1.4,1.1,1.0,1.2]};

export const MODEL_POLICY={
  label:'Seasonal enrolment + capacity-constrained',
  modelKeys:['snaive','ma','ses','holt','hw','reg'],
  headline:'Holt-Winters · regression on leads/marketing · capacity-constrained',
  rationale:'Enrolment is strongly seasonal (Sep intake, Jan secondary) and responsive to marketing spend and lead volume — so Holt-Winters and regression on leads/marketing lead. Forecasts are then capped by tutor capacity to expose oversubscription. Newer courses with thin history fall back to conservative seasonal baselines. Champion chosen per course by rolling-origin back-test.',
};
export const GAPS=[
  'Lead-to-enrolment conversion by source (currently blended).',
  'Confirmed tutor availability and contracts for the Sep intake.',
  'Cohort-level dropout curves to forecast completion, not just enrolment.',
  'Corporate pipeline (signed vs probable) for bespoke cohorts.',
  'Scholarship/discount mix to forecast net fee revenue.',
];
export const PROVENANCE=[
  {key:'actual',label:'Actual historical',color:'#2f7d5b',desc:'Recorded enrolments in the period.'},
  {key:'simulated',label:'Simulated operational',color:'#c98a2a',desc:'Course volumes generated from real intake seasonality + assumptions.'},
  {key:'public',label:'Publicly sourced',color:'#3a7a9f',desc:'From HESA / public education data.'},
  {key:'user-entered',label:'User-entered',color:'#6b7268',desc:'Capacity, tutors, fees entered by ops.'},
  {key:'contracted',label:'Contracted',color:'#5a4bb3',desc:'Signed corporate training contracts.'},
  {key:'pipeline',label:'Probable pipeline',color:'#9a5b9c',desc:'Likely but unsigned enquiries/contracts.'},
];
export const REFERENCES=[
  {name:'HESA — Higher Education Student Statistics',org:'Higher Education Statistics Agency (UK)',kind:'Public education statistics',use:'Intake seasonality (Sep peak)',license:'Public'},
  {name:'UK Dept. for Education — participation data',org:'gov.uk',kind:'Public sector data',use:'Enrolment trends by subject',license:'Public'},
  {name:'OfS / provider financial returns',org:'Office for Students',kind:'Public regulatory data',use:'Course capacity & completion norms',license:'Public'},
];

export const META={
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
