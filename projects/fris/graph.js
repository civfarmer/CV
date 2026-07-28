// FRIS flow-graph — the WINNING "Variant B" renderer ("Tiered ownership & flow"),
// adapted from _design/graph-variant-B.js into a proper ES module for the live app.
//
// THESIS (unchanged from Variant B): replace the force-directed "hairball" with a
// STRUCTURED, DIRECTIONAL layout so the answer is obvious at a glance.
//   - nexus     : Sugiyama-style LAYERED ownership hierarchy. Ultimate beneficial
//                 owners on the TOP tier; holdings/nominees in the middle; operating
//                 companies at the bottom. Control flows strictly DOWNWARD.
//   - chainlink : LEFT-TO-RIGHT money-flow by HOP. Source at left, one column per
//                 hop, the mixers as loud mid-stream HAZARD GATES, cash-out (exchanges)
//                 toward the right. Edge thickness = amount (log-binned).
//
// Preserved Variant-B strengths:
//   * ONE master encoding config draws BOTH nodes and legend swatches via the same
//     drawGlyph()/edgeSample() code — a legend collision is structurally impossible.
//   * deterministic layout (no Math.random), bounded pan/zoom, Fit + Reset, minimap.
//   * focus+context filtering that DIMS (never deletes) so no orphan dots float.
//
// Differences from the classic script:
//   * a real ES module: `export function flowGraph(container, opts)`.
//   * data comes from ARGUMENTS ({nodes, edges}), never window.__GRAPHDATA__.
//   * no in-canvas mode toggle (the app's own tabs pick nexus vs chainlink).
//   * onNodeClick(id) opens the app's entity/wallet drawer.
//   * Chain-Link product-owner fixes: risk shown as an added SQUARE badge (red = High,
//     amber = Medium) on a separate channel from type; a fully-labelled legend incl.
//     Low/Medium/High; and clean play / pause / replay / setSpeed playback whose speed
//     changes take effect immediately and whose Replay always restarts from hop 0.
//
// e2e-safe: getBoundingClientRect is guarded with numeric fallbacks; there are no
// getBBox calls; ResizeObserver is feature-detected; playback becomes a no-op when
// timer APIs are unavailable, and never auto-runs at mount.

const SVGNS = 'http://www.w3.org/2000/svg';

/* -------- tiny DOM helpers (SVG + HTML) -------- */
function S(tag, attrs, kids) {
  const e = document.createElementNS(SVGNS, tag);
  if (attrs) { for (const k in attrs) { if (!has(attrs, k)) continue; const v = attrs[k]; if (v == null) continue; e.setAttribute(k, v); } }
  appendKids(e, kids);
  return e;
}
function H(tag, attrs, kids) {
  const e = document.createElement(tag);
  if (attrs) {
    for (const k in attrs) {
      if (!has(attrs, k)) continue; const v = attrs[k]; if (v == null) continue;
      if (k === 'class') e.className = v;
      else if (k === 'style') e.setAttribute('style', v);
      else if (k === 'html') e.innerHTML = v;
      else if (k.indexOf('on') === 0 && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
      else e.setAttribute(k, v);
    }
  }
  appendKids(e, kids);
  return e;
}
function appendKids(e, kids) {
  if (kids == null) return;
  if (!Array.isArray(kids)) kids = [kids];
  for (let i = 0; i < kids.length; i++) {
    const kid = kids[i]; if (kid == null) continue;
    if (typeof kid === 'string' || typeof kid === 'number') e.appendChild(document.createTextNode(String(kid)));
    else e.appendChild(kid);
  }
}
function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
function clear(el) { while (el && el.firstChild) el.removeChild(el.firstChild); }
function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
// e2e-safe measurement: FakeNode returns a rect, but guard everything numerically.
function rectOf(node, fw, fh) {
  let r = null;
  try { r = node && node.getBoundingClientRect ? node.getBoundingClientRect() : null; } catch (_e) { r = null; }
  const w = r && isFinite(r.width) && r.width > 0 ? r.width : fw;
  const h = r && isFinite(r.height) && r.height > 0 ? r.height : fh;
  const left = r && isFinite(r.left) ? r.left : 0;
  const top = r && isFinite(r.top) ? r.top : 0;
  return { width: w, height: h, left: left, top: top };
}
// e2e-safe reduced-motion probe. The DOM shim exposes window.matchMedia returning
// {matches:false}; a real browser reports the OS preference. Read once per graph.
function prefersReducedMotion() {
  try {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      return !!window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
  } catch (_e) { /* ignore */ }
  return false;
}

/* ---------------- palette (dark theme from the brief) ---------------- */
const C = {
  bg: '#0a0d13', surface: '#12161f', surface2: '#171c26', border: '#232a36',
  text: '#e7edf5', muted: '#8aa0bd', accent: '#4d8df0', teal: '#37c2b4',
  high: '#f0616d', med: '#e5a53b', low: '#46b877',
};
/* Okabe-Ito colour-blind-safe hues, one per NODE TYPE. Colour is NEVER the sole
 * channel: shape + label + icon always reinforce it. */
const OK = {
  blue: '#0072B2', orange: '#E69F00', green: '#009E73', purple: '#CC79A7',
  grey: '#9aa4b0', vermillion: '#D55E00', sky: '#56B4E9', yellow: '#F0E442',
};
const GOLD = '#f2c14e', MAGENTA = '#e05fd6';

/* ================================================================
 * MASTER ENCODING — single source of truth (fixes "two red squares").
 * Every node TYPE -> {shape, fill, icon}; unique on shape+fill+icon.
 * Chain-Link product-owner requirements are baked in here:
 *   - each wallet type a UNIQUE shape+colour; the exchange is a blue "bank"
 *     rounded-square, never an ambiguous plain green square.
 *   - ALL personal wallets are ONE single shade (orange #E69F00) — not several
 *     shades of blue.
 *   - the two mixers are an unmistakable red hazard octagon.
 * ================================================================ */
const NODE_TYPES = {
  /* --- Sovereign Nexus (ownership) --- */
  company:    { shape: 'rrect',    fill: OK.blue,       icon: 'building', label: 'Company' },
  person:     { shape: 'circle',   fill: OK.orange,     icon: 'person',   label: 'Person' },
  trust:      { shape: 'diamond',  fill: OK.green,      icon: 'seal',     label: 'Trust' },
  foundation: { shape: 'hexagon',  fill: OK.purple,     icon: 'pillars',  label: 'Foundation' },
  agent:      { shape: 'triangle', fill: OK.grey,       icon: 'ring',     label: 'Agent / nominee co.' },
  /* --- Chain-Link (crypto flow) --- */
  mixer:      { shape: 'octagon',  fill: OK.vermillion, icon: 'blades',   label: 'Mixer (hazard gate)', hazard: true },
  exchange:   { shape: 'rrect',    fill: OK.blue,       icon: 'bank',     label: 'Exchange (cash-out)' },
  bridge:     { shape: 'hexagon',  fill: OK.purple,     icon: 'span',     label: 'Bridge (cross-chain)' },
  merchant:   { shape: 'diamond',  fill: OK.green,      icon: 'cart',     label: 'Merchant' },
  deposit:    { shape: 'scircle',  fill: OK.sky,        icon: 'down',     label: 'Deposit address' },
  wallet:     { shape: 'circle',   fill: OK.orange,     icon: 'wallet',   label: 'Wallet (personal)' },
};
const NEXUS_TYPES = ['company', 'person', 'trust', 'foundation', 'agent'];
const CHAIN_TYPES = ['exchange', 'mixer', 'bridge', 'merchant', 'deposit', 'wallet'];

/* Node FLAGS = additive overlays. Each is a distinct decoration; none reuses a base
 * node shape, so no collision with types or with each other. */
const NODE_FLAGS = {
  ubo:      { label: 'UBO — ultimate owner', deco: 'crown',   tint: GOLD },
  offshore: { label: 'Offshore secrecy',     deco: 'dash',    tint: C.med },
  nominee:  { label: 'Nominee (front)',      deco: 'mask',    tint: C.muted },
  dormant:  { label: 'Dormant',              deco: 'hatch',   tint: C.muted },
  highrisk: { label: 'High risk',            deco: 'sq-hi',   tint: C.high },
  medrisk:  { label: 'Medium risk',          deco: 'sq-md',   tint: C.med },
};

/* EDGE types = unique colour + line-style + midpoint word. Arrowhead always =
 * source -> target ("owns/controls" for Nexus, "funds flow to" for Chain-Link). */
const EDGE_TYPES = {
  /* Nexus */
  owns:          { color: OK.blue,       dash: null,      word: 'owns',      head: 'solid',   weighted: true },
  controls:      { color: OK.purple,     dash: null,      word: 'controls',  head: 'double' },
  director_of:   { color: C.teal,        dash: '7 5',     word: 'director',  head: 'open',    context: true },
  agent_for:     { color: OK.grey,       dash: '2 4',     word: 'agent',     head: 'open',    context: true },
  beneficiary_of:{ color: OK.green,      dash: null,      word: 'benefits',  head: 'diamond' },
  nominee_for:   { color: '#e8663d',     dash: '8 3 2 3', word: 'nominee',   head: 'hollow' },
  /* Chain-Link (single meaning: funds move to target; styled by amount + risk + pattern) */
  flow:          { color: C.teal,        dash: null,      word: 'sends',     head: 'solid',   weighted: true },
  flow_peel:     { color: '#6fd0c6',     dash: '9 4',     word: 'peel',      head: 'solid' },
  flow_hot:      { color: C.high,        dash: null,      word: 'HIGH-RISK', head: 'solid' },
};
const CIRC_COLOR = MAGENTA; /* circular-ownership loop highlight (Nexus) */

/* ================================================================
 * GLYPH DRAWING — used for BOTH nodes and legend swatches (1:1 guarantee).
 * ================================================================ */
function shapePath(shape, r) {
  switch (shape) {
    case 'rrect':    { const s = r * 1.5, rad = r * 0.28; const x = -s / 2, y = -s / 2; return roundRectPath(x, y, s, s, rad); }
    case 'circle':   return null; /* drawn as <circle> */
    case 'scircle':  return null;
    case 'diamond':  return poly([[0, -r], [r, 0], [0, r], [-r, 0]]);
    case 'hexagon':  return regPoly(6, r, -Math.PI / 2);
    case 'triangle': return poly([[0, -r], [r * 0.92, r * 0.72], [-r * 0.92, r * 0.72]]);
    case 'octagon':  return regPoly(8, r, Math.PI / 8);
    default:         return null;
  }
}
function roundRectPath(x, y, w, h, r) {
  return 'M' + (x + r) + ',' + y + ' h' + (w - 2 * r) + ' a' + r + ',' + r + ' 0 0 1 ' + r + ',' + r +
    ' v' + (h - 2 * r) + ' a' + r + ',' + r + ' 0 0 1 ' + (-r) + ',' + r + ' h' + (-(w - 2 * r)) +
    ' a' + r + ',' + r + ' 0 0 1 ' + (-r) + ',' + (-r) + ' v' + (-(h - 2 * r)) +
    ' a' + r + ',' + r + ' 0 0 1 ' + r + ',' + (-r) + ' z';
}
function poly(pts) { return 'M' + pts.map((p) => p[0].toFixed(2) + ',' + p[1].toFixed(2)).join(' L') + ' Z'; }
function regPoly(n, r, off) {
  const pts = []; for (let i = 0; i < n; i++) { const a = off + i * 2 * Math.PI / n; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
  return poly(pts);
}

/* Minimal, legible line icons drawn INSIDE the shape (white strokes). */
function drawIcon(icon, r) {
  const g = S('g', { stroke: '#ffffff', 'stroke-width': 1.5, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0.95 });
  const u = r * 0.5;
  switch (icon) {
    case 'building':
      g.appendChild(S('rect', { x: -u * 0.8, y: -u * 0.9, width: u * 1.6, height: u * 1.9, rx: 1, fill: 'rgba(255,255,255,.14)' }));
      g.appendChild(S('line', { x1: -u * 0.3, y1: -u * 0.5, x2: -u * 0.3, y2: u * 0.7 }));
      g.appendChild(S('line', { x1: u * 0.3, y1: -u * 0.5, x2: u * 0.3, y2: u * 0.7 }));
      break;
    case 'person':
      g.appendChild(S('circle', { cx: 0, cy: -u * 0.5, r: u * 0.5 }));
      g.appendChild(S('path', { d: 'M' + (-u * 0.9) + ',' + (u * 0.9) + ' a' + (u * 0.9) + ',' + (u * 0.9) + ' 0 0 1 ' + (u * 1.8) + ',0' }));
      break;
    case 'seal':
      g.appendChild(S('circle', { cx: 0, cy: 0, r: u * 0.7 }));
      g.appendChild(S('path', { d: 'M0,' + (u * 0.7) + ' l' + (-u * 0.35) + ',' + (u * 0.6) + ' M0,' + (u * 0.7) + ' l' + (u * 0.35) + ',' + (u * 0.6) }));
      break;
    case 'pillars':
      g.appendChild(S('line', { x1: -u * 0.9, y1: -u * 0.7, x2: u * 0.9, y2: -u * 0.7 }));
      g.appendChild(S('line', { x1: -u * 0.6, y1: -u * 0.5, x2: -u * 0.6, y2: u * 0.8 }));
      g.appendChild(S('line', { x1: 0, y1: -u * 0.5, x2: 0, y2: u * 0.8 }));
      g.appendChild(S('line', { x1: u * 0.6, y1: -u * 0.5, x2: u * 0.6, y2: u * 0.8 }));
      break;
    case 'ring':
      g.appendChild(S('circle', { cx: 0, cy: 0, r: u * 0.7 }));
      break;
    case 'blades': /* mixer: rotor blades */
      g.appendChild(S('circle', { cx: 0, cy: 0, r: u * 0.28, fill: '#ffffff' }));
      for (let b = 0; b < 3; b++) { const a = b * 2 * Math.PI / 3 - Math.PI / 2; g.appendChild(S('line', { x1: 0, y1: 0, x2: Math.cos(a) * u * 0.95, y2: Math.sin(a) * u * 0.95, 'stroke-width': 2 })); }
      break;
    case 'bank':
      g.appendChild(S('path', { d: 'M' + (-u * 0.95) + ',' + (-u * 0.2) + ' L0,' + (-u * 0.85) + ' L' + (u * 0.95) + ',' + (-u * 0.2) + ' Z', fill: 'rgba(255,255,255,.14)' }));
      g.appendChild(S('line', { x1: -u * 0.7, y1: -u * 0.2, x2: -u * 0.7, y2: u * 0.7 }));
      g.appendChild(S('line', { x1: 0, y1: -u * 0.2, x2: 0, y2: u * 0.7 }));
      g.appendChild(S('line', { x1: u * 0.7, y1: -u * 0.2, x2: u * 0.7, y2: u * 0.7 }));
      g.appendChild(S('line', { x1: -u * 0.95, y1: u * 0.85, x2: u * 0.95, y2: u * 0.85 }));
      break;
    case 'span': /* bridge: arch span with an arrow */
      g.appendChild(S('path', { d: 'M' + (-u * 0.95) + ',' + (u * 0.4) + ' q' + (u * 0.95) + ',' + (-u * 1.3) + ' ' + (u * 1.9) + ',0' }));
      g.appendChild(S('path', { d: 'M' + (u * 0.5) + ',' + (-u * 0.55) + ' l' + (u * 0.4) + ',' + (u * 0.2) + ' l' + (-u * 0.4) + ',' + (u * 0.2) }));
      break;
    case 'cart':
      g.appendChild(S('path', { d: 'M' + (-u * 0.9) + ',' + (-u * 0.6) + ' h' + (u * 0.35) + ' l' + (u * 0.3) + ',' + (u * 1.1) + ' h' + (u * 0.9) }));
      g.appendChild(S('line', { x1: -u * 0.3, y1: -u * 0.25, x2: u * 0.9, y2: -u * 0.25 }));
      g.appendChild(S('circle', { cx: u * 0.1, cy: u * 0.85, r: u * 0.16, fill: '#ffffff' }));
      g.appendChild(S('circle', { cx: u * 0.7, cy: u * 0.85, r: u * 0.16, fill: '#ffffff' }));
      break;
    case 'down':
      g.appendChild(S('line', { x1: 0, y1: -u * 0.8, x2: 0, y2: u * 0.6 }));
      g.appendChild(S('path', { d: 'M' + (-u * 0.5) + ',' + (u * 0.1) + ' L0,' + (u * 0.7) + ' L' + (u * 0.5) + ',' + (u * 0.1) }));
      break;
    case 'wallet':
      g.appendChild(S('rect', { x: -u * 0.9, y: -u * 0.6, width: u * 1.8, height: u * 1.2, rx: 2, fill: 'rgba(255,255,255,.12)' }));
      g.appendChild(S('circle', { cx: u * 0.45, cy: 0, r: u * 0.16, fill: '#ffffff' }));
      break;
  }
  return g;
}

/* Draw a full node/legend glyph: base shape + fill + icon + flag overlays.
 * `opts.flags` is a set-like object {ubo:1, ...}. `opts.risk` = 'High'|'Medium'|'Low'. */
function drawGlyph(type, r, opts) {
  opts = opts || {};
  const spec = NODE_TYPES[type] || NODE_TYPES.company;
  const g = S('g', {});
  const dormant = opts.flags && opts.flags.dormant;
  const fill = spec.fill;
  const strokeCol = shade(fill, 0.55);
  const dashOutline = (opts.flags && opts.flags.offshore) ? '4 3' : null; /* offshore = dashed outline */

  /* hazard aura for mixer (unmistakable) */
  if (spec.hazard) {
    g.appendChild(S('circle', { cx: 0, cy: 0, r: r * 1.42, fill: 'none', stroke: OK.vermillion, 'stroke-width': 2, 'stroke-dasharray': '3 3', opacity: 0.9 }));
    g.appendChild(S('circle', { cx: 0, cy: 0, r: r * 1.18, fill: 'none', stroke: '#ffce6b', 'stroke-width': 1, opacity: 0.6 }));
  }

  /* risk ring (Chain-Link) — a RING so it stacks on any shape without fighting the type
   * colour. The added SQUARE badge below is the primary at-a-glance risk marker the
   * product owner asked for; the ring is a supporting redundant channel. */
  if (opts.risk === 'High') g.appendChild(S('circle', { cx: 0, cy: 0, r: r * 1.3, fill: 'none', stroke: C.high, 'stroke-width': 3 }));
  else if (opts.risk === 'Medium') g.appendChild(S('circle', { cx: 0, cy: 0, r: r * 1.3, fill: 'none', stroke: C.med, 'stroke-width': 2, 'stroke-dasharray': '5 4' }));

  /* UBO gold outline ring (backs the crown) */
  if (opts.flags && opts.flags.ubo) g.appendChild(S('circle', { cx: 0, cy: 0, r: r * 1.34, fill: 'none', stroke: GOLD, 'stroke-width': 2.5 }));

  /* base shape */
  let body;
  if (spec.shape === 'circle' || spec.shape === 'scircle') {
    const rr = spec.shape === 'scircle' ? r * 0.82 : r;
    body = S('circle', { cx: 0, cy: 0, r: rr, fill: fill, stroke: strokeCol, 'stroke-width': 2 });
    if (dashOutline) body.setAttribute('stroke-dasharray', dashOutline);
    g.appendChild(body);
  } else {
    const d = shapePath(spec.shape, r);
    body = S('path', { d: d, fill: fill, stroke: strokeCol, 'stroke-width': 2 });
    if (dashOutline) body.setAttribute('stroke-dasharray', dashOutline);
    g.appendChild(body);
  }

  /* dormant = desaturated + hatch overlay (looks asleep) */
  if (dormant) {
    body.setAttribute('fill', desat(fill));
    body.setAttribute('opacity', 0.85);
    const hid = ensureHatch();
    let hatch;
    if (spec.shape === 'circle' || spec.shape === 'scircle') hatch = S('circle', { cx: 0, cy: 0, r: (spec.shape === 'scircle' ? r * 0.82 : r), fill: 'url(#' + hid + ')' });
    else hatch = S('path', { d: shapePath(spec.shape, r), fill: 'url(#' + hid + ')' });
    g.appendChild(hatch);
  }

  /* icon */
  if (spec.icon) g.appendChild(drawIcon(spec.icon, r));

  /* --- additive flag decorations --- */
  if (opts.flags && opts.flags.ubo) g.appendChild(crownBadge(r));                 /* crown top-right */
  if (opts.flags && opts.flags.nominee) g.appendChild(maskBadge(r));              /* mask bottom-left */
  if (opts.risk === 'High') g.appendChild(riskSquareBadge(r, C.high));            /* RED SQUARE for High risk (product-owner mandate) */
  else if (opts.risk === 'Medium') g.appendChild(riskSquareBadge(r, C.med));      /* amber square for Medium risk */
  if (opts.flags && opts.flags.offshore) g.appendChild(offshoreBadge(r));         /* palm/island corner tag */

  return g;
}

function crownBadge(r) {
  const g = S('g', { transform: 'translate(' + (r * 0.95) + ',' + (-r * 0.98) + ')' });
  g.appendChild(S('circle', { cx: 0, cy: 0, r: r * 0.52, fill: '#1b1408', stroke: GOLD, 'stroke-width': 1 }));
  const w = r * 0.34;
  g.appendChild(S('path', { d: 'M' + (-w) + ',' + (w * 0.5) + ' L' + (-w) + ',' + (-w * 0.3) + ' L' + (-w * 0.5) + ',' + (w * 0.1) + ' L0,' + (-w * 0.6) + ' L' + (w * 0.5) + ',' + (w * 0.1) + ' L' + w + ',' + (-w * 0.3) + ' L' + w + ',' + (w * 0.5) + ' Z', fill: GOLD, stroke: 'none' }));
  return g;
}
function maskBadge(r) {
  const g = S('g', { transform: 'translate(' + (-r * 0.95) + ',' + (r * 0.95) + ')' });
  g.appendChild(S('circle', { cx: 0, cy: 0, r: r * 0.5, fill: '#0e1420', stroke: C.muted, 'stroke-width': 1 }));
  g.appendChild(S('path', { d: 'M' + (-r * 0.32) + ',' + (-r * 0.05) + ' q' + (r * 0.32) + ',' + (r * 0.28) + ' ' + (r * 0.64) + ',0', fill: 'none', stroke: '#cfe0f5', 'stroke-width': 1.4 }));
  g.appendChild(S('circle', { cx: -r * 0.14, cy: -r * 0.06, r: r * 0.06, fill: '#cfe0f5' }));
  g.appendChild(S('circle', { cx: r * 0.14, cy: -r * 0.06, r: r * 0.06, fill: '#cfe0f5' }));
  return g;
}
/* RISK SQUARE BADGE — the small square marker the product owner asked for:
 * a filled RED square (bottom-right) for High risk, an amber square for Medium.
 * Type = shape/colour; risk = this added square badge — two independent channels. */
function riskSquareBadge(r, col) {
  const g = S('g', { transform: 'translate(' + (r * 0.98) + ',' + (r * 0.9) + ')' });
  const s = r * 0.62;
  g.appendChild(S('rect', { x: -s / 2, y: -s / 2, width: s, height: s, rx: r * 0.06, fill: col, stroke: shade(col, 0.45), 'stroke-width': 1 }));
  return g;
}
function offshoreBadge(r) {
  const g = S('g', { transform: 'translate(' + (-r * 0.95) + ',' + (-r * 0.98) + ')' });
  g.appendChild(S('circle', { cx: 0, cy: 0, r: r * 0.5, fill: '#0e1a14', stroke: C.med, 'stroke-width': 1 }));
  /* palm-island motif */
  g.appendChild(S('path', { d: 'M' + (-r * 0.26) + ',' + (r * 0.18) + ' q' + (r * 0.26) + ',' + (r * 0.12) + ' ' + (r * 0.52) + ',0', fill: 'none', stroke: C.med, 'stroke-width': 1.3 }));
  g.appendChild(S('line', { x1: 0, y1: r * 0.2, x2: 0, y2: -r * 0.12, stroke: '#8fe6b0', 'stroke-width': 1.3 }));
  g.appendChild(S('path', { d: 'M0,' + (-r * 0.12) + ' q' + (-r * 0.22) + ',' + (-r * 0.02) + ' ' + (-r * 0.26) + ',' + (-r * 0.18) + ' M0,' + (-r * 0.12) + ' q' + (r * 0.22) + ',' + (-r * 0.02) + ' ' + (r * 0.26) + ',' + (-r * 0.18), fill: 'none', stroke: '#8fe6b0', 'stroke-width': 1.3 }));
  return g;
}

/* ---- colour utilities ---- */
function hexToRgb(h) { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) }; }
function rgbToHex(r, g, b) { function p(x) { x = Math.round(clamp(x, 0, 255)).toString(16); return x.length < 2 ? '0' + x : x; } return '#' + p(r) + p(g) + p(b); }
function shade(hex, f) { const c = hexToRgb(hex); return rgbToHex(c.r * f, c.g * f, c.b * f); }
function desat(hex) { const c = hexToRgb(hex); const l = 0.3 * c.r + 0.59 * c.g + 0.11 * c.b; const m = 0.55; return rgbToHex(c.r * (1 - m) + l * m, c.g * (1 - m) + l * m, c.b * (1 - m) + l * m); }

let _hatchId = null;
function ensureHatch() { return _hatchId || 'frisg-hatch'; }

/* ================================================================
 * LAYOUT ENGINES (deterministic — no Math.random anywhere).
 * ================================================================ */
const TIER_REL = { owns: 1, controls: 1, beneficiary_of: 1, nominee_for: 1 }; /* structural = tier drivers */

/* ---- Nexus: Sugiyama-style layered ownership hierarchy ---- */
function layoutNexus(nodes, edges, cfg) {
  const idmap = {}; nodes.forEach((n) => { idmap[n.id] = n; });
  const out = {}, inn = {};
  nodes.forEach((n) => { out[n.id] = []; inn[n.id] = []; });
  const tierEdges = edges.filter((e) => TIER_REL[e.rel_type] && !e.is_circular && idmap[e.source] && idmap[e.target]);
  tierEdges.forEach((e) => { out[e.source].push(e.target); inn[e.target].push(e.source); });

  /* longest-path layering via Kahn topo on tier edges */
  const indeg = {}; nodes.forEach((n) => { indeg[n.id] = 0; });
  tierEdges.forEach((e) => { indeg[e.target]++; });
  const layer = {}; const q = [];
  nodes.forEach((n) => { if (indeg[n.id] === 0) { layer[n.id] = 0; q.push(n.id); } });
  const ind = {}; for (const k in indeg) ind[k] = indeg[k];
  q.sort();
  while (q.length) {
    const u = q.shift();
    out[u].forEach((v) => {
      const cand = (layer[u] || 0) + 1;
      if (layer[v] == null || cand > layer[v]) layer[v] = cand;
      if (--ind[v] === 0) q.push(v);
    });
  }
  nodes.forEach((n) => { if (layer[n.id] == null) layer[n.id] = 0; });

  /* backbone membership -> off-backbone nodes go to the tray */
  const inBackbone = {}; tierEdges.forEach((e) => { inBackbone[e.source] = 1; inBackbone[e.target] = 1; });
  const tray = nodes.filter((n) => !inBackbone[n.id]);
  const placed = nodes.filter((n) => inBackbone[n.id]);

  let maxL = 0; placed.forEach((n) => { maxL = Math.max(maxL, layer[n.id]); });
  const tiers = []; for (let L = 0; L <= maxL; L++) tiers.push([]);
  placed.forEach((n) => { tiers[layer[n.id]].push(n); });

  /* initial within-tier order: by type priority then label (deterministic) */
  const typeRank = { person: 0, trust: 1, foundation: 2, agent: 3, company: 4 };
  tiers.forEach((t) => {
    t.sort((a, b) => {
      const ra = typeRank[a.type] == null ? 9 : typeRank[a.type], rb = typeRank[b.type] == null ? 9 : typeRank[b.type];
      if (!!a.is_ubo !== !!b.is_ubo) return (b.is_ubo ? 1 : 0) - (a.is_ubo ? 1 : 0);
      if (ra !== rb) return ra - rb;
      return a.label < b.label ? -1 : (a.label > b.label ? 1 : 0);
    });
  });

  /* barycentre crossing reduction: a few down/up sweeps */
  function orderMap(t) { const m = {}; t.forEach((n, i) => { m[n.id] = i; }); return m; }
  for (let pass = 0; pass < 6; pass++) {
    const downward = pass % 2 === 0;
    for (let li = 1; li < tiers.length; li++) {
      const ref = downward ? tiers[li - 1] : tiers[tiers.length - li];
      const cur = downward ? tiers[li] : tiers[tiers.length - li - 1];
      const refPos = orderMap(ref);
      cur.forEach((n) => {
        const nb = downward ? inn[n.id] : out[n.id];
        const vals = [];
        nb.forEach((m) => { if (refPos[m] != null) vals.push(refPos[m]); });
        n.__bary = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 1e9;
      });
      cur.sort((a, b) => {
        if (a.__bary !== b.__bary) return a.__bary - b.__bary;
        return a.label < b.label ? -1 : 1;
      });
    }
  }

  /* assign coordinates: tiers stack vertically, nodes spread horizontally & centred */
  const gapX = cfg.gapX, gapY = cfg.gapY, padTop = cfg.padTop;
  let widest = 0; tiers.forEach((t) => { widest = Math.max(widest, t.length); });
  const tierW = Math.max(1, widest) * gapX;
  tiers.forEach((t, li) => {
    const w = t.length * gapX;
    const x0 = (tierW - w) / 2 + gapX / 2;
    const y = padTop + li * gapY;
    t.forEach((n, i) => { n.__x = x0 + i * gapX; n.__y = y; n.__layer = li; });
  });

  /* park tray nodes in a labelled strip at the bottom (never floating) */
  const trayY = padTop + tiers.length * gapY + gapY * 0.6;
  const perRow = Math.max(6, Math.floor(tierW / gapX));
  tray.sort((a, b) => (a.label < b.label ? -1 : 1));
  tray.forEach((n, i) => {
    const col = i % perRow, row = Math.floor(i / perRow);
    n.__x = (tierW - Math.min(tray.length, perRow) * gapX) / 2 + gapX / 2 + col * gapX;
    n.__y = trayY + row * (gapY * 0.62);
    n.__tray = true; n.__layer = -1;
  });
  const trayRows = Math.ceil(tray.length / perRow);

  return {
    width: tierW, tiers: tiers, tray: tray, layer: layer,
    contentH: trayY + trayRows * (gapY * 0.62),
    trayY: trayY - gapY * 0.36, trayW: tierW,
    tierLabels: ['Ultimate owners & principals', 'Intermediate holdings', 'Sub-holdings', 'Operating companies', 'Tier 5', 'Tier 6'],
  };
}

/* ---- Chain-Link: left-to-right money-flow by HOP ---- */
function layoutChain(nodes, edges, cfg) {
  const idmap = {}; nodes.forEach((n) => { idmap[n.id] = n; });
  const hasIn = {}; edges.forEach((e) => { hasIn[e.target] = 1; });
  const hopOf = {};
  nodes.forEach((n) => { hopOf[n.id] = hasIn[n.id] ? null : 0; });
  /* min incoming hop => column */
  edges.forEach((e) => {
    const h = e.hop;
    if (hopOf[e.target] == null || h < hopOf[e.target]) hopOf[e.target] = h;
  });
  nodes.forEach((n) => { if (hopOf[n.id] == null) hopOf[n.id] = 0; });

  let maxHop = 0; nodes.forEach((n) => { maxHop = Math.max(maxHop, hopOf[n.id]); });
  const cols = []; for (let h = 0; h <= maxHop; h++) cols.push([]);
  nodes.forEach((n) => { cols[hopOf[n.id]].push(n); });

  /* order within a column: keep parent's y neighbourhood; seed by label */
  const colX = cfg.colX, padLeft = cfg.padLeft, laneH = cfg.laneH, padTopC = cfg.padTopC;
  let maxRows = 0; cols.forEach((c) => { maxRows = Math.max(maxRows, c.length); });
  cols.forEach((c) => { c.sort((a, b) => (a.label < b.label ? -1 : 1)); });
  /* barycentre by incoming edges to smooth the flow vertically */
  const inAdj = {}; nodes.forEach((n) => { inAdj[n.id] = []; });
  edges.forEach((e) => { if (idmap[e.source]) inAdj[e.target].push(e.source); });
  const yIndex = {};
  for (let ci = 0; ci < cols.length; ci++) {
    const c = cols[ci];
    if (ci > 0) {
      c.forEach((n) => {
        const vals = []; inAdj[n.id].forEach((p) => { if (yIndex[p] != null) vals.push(yIndex[p]); });
        n.__bary = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 1e9;
      });
      c.sort((a, b) => { if (a.__bary !== b.__bary) return a.__bary - b.__bary; return a.label < b.label ? -1 : 1; });
    }
    c.forEach((n, i) => { yIndex[n.id] = i; });
  }

  const totalH = Math.max(maxRows, 3) * laneH;
  cols.forEach((c, ci) => {
    const h = c.length * laneH;
    const y0 = padTopC + (totalH - h) / 2 + laneH / 2;
    c.forEach((n, i) => { n.__x = padLeft + ci * colX; n.__y = y0 + i * laneH; n.__hop = ci; });
  });

  return {
    width: padLeft + maxHop * colX + colX, contentH: padTopC + totalH + laneH,
    cols: cols, maxHop: maxHop, hopOf: hopOf,
  };
}

/* Cubic bezier for a downward (Nexus) or rightward (Chain) edge, offset for bundling. */
function edgePath(x1, y1, x2, y2, vertical, bundleOff) {
  bundleOff = bundleOff || 0;
  if (vertical) {
    const my = (y1 + y2) / 2;
    const cx = bundleOff;
    return 'M' + x1 + ',' + y1 + ' C' + (x1 + cx) + ',' + my + ' ' + (x2 + cx) + ',' + my + ' ' + x2 + ',' + y2;
  } else {
    const mx = (x1 + x2) / 2;
    const cy = bundleOff;
    return 'M' + x1 + ',' + y1 + ' C' + mx + ',' + (y1 + cy) + ' ' + mx + ',' + (y2 + cy) + ' ' + x2 + ',' + y2;
  }
}

/* Log-binned thickness for Chain-Link amounts. */
function amountWidth(amount, minA, maxA) {
  const la = Math.log10(Math.max(amount, 1)), lo = Math.log10(Math.max(minA, 1)), hi = Math.log10(Math.max(maxA, 1));
  const t = hi > lo ? (la - lo) / (hi - lo) : 0.5;
  return 1.4 + t * 6.2; /* 1.4 .. 7.6 px */
}
/* Binned thickness for ownership % (<25 thin, 25-50 med, >50 thick). */
function pctWidth(p) { if (p == null) return 1.6; if (p > 50) return 4.2; if (p >= 25) return 2.8; return 1.6; }

/* ================================================================
 * MAIN CONTROLLER — flowGraph(container, {mode, nodes, edges, onNodeClick})
 * ================================================================ */
export function flowGraph(container, options) {
  if (!container) throw new Error('flowGraph: container required');
  options = options || {};
  const onNodeClick = typeof options.onNodeClick === 'function' ? options.onNodeClick : null;
  // "View as table" affordance: the host passes a callback that jumps to the tabular
  // equivalent (Nexus Entity Directory / Chain-Link wallet+transaction tables).
  const onViewTable = typeof options.onViewTable === 'function' ? options.onViewTable : null;

  clear(container);
  injectStyle();

  /* ----- root shell (no in-canvas mode toggle — the app's tabs pick the mode) ----- */
  const root = H('div', { class: 'frisg-root' });
  container.appendChild(root);

  const body = H('div', { class: 'frisg-body' });
  root.appendChild(body);

  const stageWrap = H('div', { class: 'frisg-stagewrap' });
  body.appendChild(stageWrap);

  const side = H('div', { class: 'frisg-side' });
  body.appendChild(side);

  const reduceMotion = prefersReducedMotion();

  /* SVG stage — role="img" + a generated aria-label make the whole viz legible to
   * assistive tech (the label is composed from the data in renderA11y()). */
  const svg = S('svg', { class: 'frisg-svg', width: '100%', height: '100%', role: 'img', 'aria-label': 'Network graph', tabindex: '-1' });
  if (reduceMotion) svg.classList.add('frisg-reduce-motion');
  stageWrap.appendChild(svg);
  const defs = S('defs', {});
  svg.appendChild(defs);
  // markers registry — declared here (before buildDefs runs) to avoid a let/TDZ error.
  let _builtMarkers = {};
  buildDefs(defs);

  const viewport = S('g', { class: 'frisg-viewport' });
  svg.appendChild(viewport);
  const gEdges = S('g', { class: 'frisg-edges' });
  const gTierBg = S('g', { class: 'frisg-tierbg' });
  const gNodes = S('g', { class: 'frisg-nodes' });
  const gLabels = S('g', { class: 'frisg-labels' });
  viewport.appendChild(gTierBg); viewport.appendChild(gEdges); viewport.appendChild(gNodes); viewport.appendChild(gLabels);

  /* on-canvas title/how-to-read overlay (HTML, top-left, always visible) */
  const overlay = H('div', { class: 'frisg-overlay' });
  stageWrap.appendChild(overlay);

  /* nav controls (top-right of stage) */
  const nav = H('div', { class: 'frisg-nav' });
  stageWrap.appendChild(nav);
  const btnZoomIn = H('button', { class: 'frisg-navbtn', title: 'Zoom in (+)', type: 'button' }, '+');
  const btnZoomOut = H('button', { class: 'frisg-navbtn', title: 'Zoom out (-)', type: 'button' }, '−');
  const btnFit = H('button', { class: 'frisg-navbtn wide', title: 'Fit whole graph to view (F)', type: 'button' }, 'Fit');
  const btnReset = H('button', { class: 'frisg-navbtn wide', title: 'Reset layout, filters & zoom (R)', type: 'button' }, 'Reset');
  nav.appendChild(btnZoomIn); nav.appendChild(btnZoomOut); nav.appendChild(btnFit); nav.appendChild(btnReset);

  /* playback controls (Chain-Link only; created for both, shown for chainlink) */
  const playbar = H('div', { class: 'frisg-playbar' });
  stageWrap.appendChild(playbar);
  const btnPlay = H('button', { class: 'frisg-playbtn', title: 'Play the money advancing hop-by-hop', type: 'button' }, '▶ Play');
  const btnReplay = H('button', { class: 'frisg-playbtn', title: 'Restart the flow from the beginning (hop 0)', type: 'button' }, '↺ Replay');
  const btnSpeed = H('button', { class: 'frisg-playbtn', title: 'Cycle playback speed — takes effect immediately', type: 'button' }, '1×');
  // Scrubber: a range slider + "hop N / M" readout wired to the play pointer. Dragging
  // scrubs the flow (pausing the timer while the user drags).
  const scrub = H('input', { class: 'frisg-scrub', type: 'range', min: '0', max: '1', step: '1', value: '0', title: 'Scrub through the hops', 'aria-label': 'Playback hop' });
  const hopReadout = H('span', { class: 'frisg-hopread' }, 'hop 0 / 0');
  playbar.appendChild(btnPlay); playbar.appendChild(btnReplay); playbar.appendChild(btnSpeed);
  playbar.appendChild(scrub); playbar.appendChild(hopReadout);
  // While the user drags the scrubber, pause auto-advance and render the chosen hop.
  scrub.addEventListener('input', () => {
    const v = parseInt(scrub.value, 10);
    stopTimer();
    state.play.ptr = isFinite(v) ? v : 0;
    renderPlayFrame();
    updatePlayUI();
  });

  /* minimap (bottom-right of stage) */
  const mini = H('div', { class: 'frisg-mini' });
  stageWrap.appendChild(mini);
  const miniSvg = S('svg', { class: 'frisg-minisvg', width: '100%', height: '100%' });
  mini.appendChild(miniSvg);
  const miniG = S('g', {}); miniSvg.appendChild(miniG);
  const miniView = S('rect', { class: 'frisg-miniview', fill: 'rgba(77,141,240,.14)', stroke: C.accent, 'stroke-width': 2 });
  miniSvg.appendChild(miniView);

  /* zoom hint — names the cooperative gesture (see the wheel/touch handlers) */
  const hint = H('div', { class: 'frisg-hint' }, 'Ctrl/⌘ + scroll (or pinch) to zoom · drag to pan');
  stageWrap.appendChild(hint);

  /* "View as table" affordance (top-left) — a keyboard/SR path to the tabular data. */
  const viewTableWrap = H('div', { class: 'frisg-viewtable' });
  if (onViewTable) {
    const btnTable = H('button', { type: 'button', title: 'Open this data as a sortable table' }, 'View as table');
    btnTable.addEventListener('click', () => { try { onViewTable(); } catch (_e) {} });
    viewTableWrap.appendChild(btnTable);
    stageWrap.appendChild(viewTableWrap);
  }
  /* Offscreen SR-only summary + node table — the screen-reader text equivalent of the
   * graph. Populated in renderA11y() from the live data. */
  const srSummary = H('div', { class: 'frisg-srtable', role: 'region', 'aria-label': 'Graph data (text alternative)' });
  stageWrap.appendChild(srSummary);

  /* side panels */
  const legendPanel = H('div', { class: 'frisg-panel' });
  const filterPanel = H('div', { class: 'frisg-panel' });
  const detailPanel = H('div', { class: 'frisg-panel frisg-detail' });
  side.appendChild(filterPanel); side.appendChild(legendPanel); side.appendChild(detailPanel);

  /* ---- state ---- */
  const state = {
    mode: options.mode === 'chainlink' || options.mode === 'chain' ? 'chain' : 'nexus',
    srcNodes: Array.isArray(options.nodes) ? options.nodes : [],
    srcEdges: Array.isArray(options.edges) ? options.edges : [],
    nodes: [], edges: [], layout: null, vertical: true,
    scale: 1, tx: 0, ty: 0, minScale: 0.3, maxScale: 4,
    nodeEls: {}, edgeEls: [], adjDown: {}, adjUp: {}, adjDownAll: {}, adjUpAll: {},
    idmap: {}, selected: null,
    // camera saved before a node selection moves it, so closing the info box
    // (detail close / Escape / empty-background click) can snap the user back.
    savedCam: null,
    typeOn: {}, flagOn: {}, edgeOn: {}, contextEdges: true,
    minA: 0, maxA: 1, W: 900, Hh: 560,
    reduceMotion: reduceMotion,
    // keyboard roving-tabindex over the node set (layout order)
    navOrder: [], navIdx: -1, kbFocus: null,
    // external highlight (Trace-to-UBO / Path-between / Red-flags spotlight). When
    // set, applyFilter() re-applies it so re-renders don't wipe the emphasis.
    spotlight: null,
    // on-canvas "how to read" key: open by default, dismissible while mounted.
    overlayOpen: true,
    // which finding chip (category) is currently spotlighted, if any.
    chipCat: null,
    // playback
    play: { timer: null, ptr: 0, speeds: [400, 200, 80], speedIdx: 0 },
  };

  /* geometry */
  function stageSize() {
    const r = rectOf(stageWrap, 900, 560);
    state.W = Math.max(320, r.width || 900);
    state.Hh = Math.max(320, r.height || 560);
    svg.setAttribute('viewBox', '0 0 ' + state.W + ' ' + state.Hh);
  }

  /* ---- transforms with hard clamp so the graph can never be lost ---- */
  function applyTransform() {
    viewport.setAttribute('transform', 'translate(' + state.tx + ',' + state.ty + ') scale(' + state.scale + ')');
    updateMiniView();
    const showAll = state.scale >= 1.15;
    gLabels.setAttribute('opacity', state.scale < 0.7 ? 0 : 1);
    hint.style.opacity = state.scale < 1.0 ? 1 : 0;
    Object.keys(state.nodeEls).forEach((id) => {
      const rec = state.nodeEls[id];
      if (!rec.labelEl) return;
      const keep = showAll || rec.node.__key;
      rec.labelEl.setAttribute('opacity', keep ? 1 : 0);
    });
  }
  function contentBounds() {
    const L = state.layout;
    return { w: L ? L.width : state.W, h: L ? L.contentH : state.Hh };
  }
  function clampTransform() {
    const b = contentBounds();
    const cw = b.w * state.scale, ch = b.h * state.scale;
    const margin = 80;
    if (cw <= state.W) {
      state.tx = (state.W - cw) / 2;
    } else {
      state.tx = clamp(state.tx, state.W - cw - margin, margin);
    }
    if (ch <= state.Hh) {
      state.ty = (state.Hh - ch) / 2;
    } else {
      state.ty = clamp(state.ty, state.Hh - ch - margin, margin);
    }
  }
  function setZoom(ns, cx, cy) {
    ns = clamp(ns, state.minScale, state.maxScale);
    if (cx == null) { cx = state.W / 2; cy = state.Hh / 2; }
    const wx = (cx - state.tx) / state.scale, wy = (cy - state.ty) / state.scale;
    state.scale = ns;
    state.tx = cx - wx * state.scale; state.ty = cy - wy * state.scale;
    clampTransform(); applyTransform();
  }
  function fit() {
    stageSize();
    const b = contentBounds();
    const pad = 46;
    const sx = (state.W - pad * 2) / b.w, sy = (state.Hh - pad * 2) / b.h;
    const s = clamp(Math.min(sx, sy), state.minScale, state.maxScale);
    state.scale = s;
    state.tx = (state.W - b.w * s) / 2;
    state.ty = (state.Hh - b.h * s) / 2;
    clampTransform(); applyTransform();
  }

  /* ---- pan + click (pointer), with click-vs-drag disambiguation ----
   * Panning must work from ANYWHERE on the canvas, including on top of a node
   * (after the old buggy zoom-in, nodes covered most of the stage and drags
   * rarely started on empty space). So we DON'T early-return on a node press.
   * Instead we track pointer travel from the press point: if it moves past
   * DRAG_THRESH pixels it's a PAN (we move the camera and mark `moved`, which
   * suppresses the would-be node click); if it stays put it's a CLICK (on a
   * node -> select + open the drawer; on empty background -> deselect).
   * Selection is resolved here on pointerup rather than via a separate DOM
   * `click` listener so a drag can never also fire a select. */
  const DRAG_THRESH = 4; // px of travel that turns a press into a pan (not a click)
  let dragging = false, lastX = 0, lastY = 0, downX = 0, downY = 0, moved = false, pressNodeId = null;
  function nodeIdFromEvent(ev) {
    const t = ev.target;
    let hit = null;
    if (t && t.closest) { try { hit = t.closest('.frisg-nodehit'); } catch (_e) { hit = null; } }
    if (!hit && t && t.getAttribute && (t.getAttribute('class') || '').indexOf('frisg-nodehit') >= 0) hit = t;
    if (!hit) return null;
    return (hit.getAttribute && hit.getAttribute('data-id')) || (hit.dataset && hit.dataset.id) || null;
  }
  svg.addEventListener('pointerdown', (ev) => {
    dragging = true; moved = false;
    lastX = downX = ev.clientX; lastY = downY = ev.clientY;
    pressNodeId = nodeIdFromEvent(ev);
    if (svg.setPointerCapture) { try { svg.setPointerCapture(ev.pointerId); } catch (_e) {} }
    if (svg.style) svg.style.cursor = 'grabbing';
  });
  svg.addEventListener('pointermove', (ev) => {
    if (!dragging) return;
    const dx = ev.clientX - lastX, dy = ev.clientY - lastY;
    lastX = ev.clientX; lastY = ev.clientY;
    // Promote to a pan once total travel from the press point exceeds the
    // threshold; a pan that started on a node keeps panning (no node select).
    if (!moved && Math.hypot(ev.clientX - downX, ev.clientY - downY) > DRAG_THRESH) moved = true;
    if (!moved) return; // below threshold: don't nudge the camera yet (keeps a click a click)
    state.tx += dx; state.ty += dy; clampTransform(); applyTransform();
  });
  function endDrag(ev) {
    if (!dragging) return;
    dragging = false;
    if (svg.style) svg.style.cursor = 'grab';
    if (moved) { pressNodeId = null; return; } // it was a pan: no click side effect
    // A genuine click (no travel): on a node -> select + open drawer; on empty
    // background -> deselect (which also restores the pre-selection camera).
    const id = pressNodeId; pressNodeId = null;
    if (id != null && state.nodeEls[id]) {
      selectNode(id); if (onNodeClick) onNodeClick(id);
    } else if (state.selected) {
      clearSelection();
    }
  }
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', () => { dragging = false; moved = false; pressNodeId = null; if (svg.style) svg.style.cursor = 'grab'; });
  svg.addEventListener('pointerleave', (ev) => { if (dragging && moved) endDrag(ev); });

  /* -- Cooperative gestures — the anti-scroll-trap rule (mirrors the jurisdiction
   * map in viz.js). A plain wheel / one-finger swipe lets the PAGE scroll (we do NOT
   * preventDefault). Only Ctrl/\u2318 + wheel or a two-finger pinch zooms the map; a
   * transient hint tells the user how to zoom when they plain-scroll over the graph. */
  let hintTimer = null;
  function showZoomHint() {
    if (!hint) return;
    hint.style.opacity = 1;
    if (hintTimer) { try { clearTimeout(hintTimer); } catch (_e) {} }
    // fade only if we're zoomed in (when zoomed out, applyTransform keeps it visible)
    if (typeof setTimeout === 'function') hintTimer = setTimeout(() => { if (state.scale >= 1.0) hint.style.opacity = 0; }, 1400);
  }
  svg.addEventListener('wheel', (ev) => {
    if (ev.ctrlKey || ev.metaKey) {
      ev.preventDefault();
      const r = rectOf(svg, state.W, state.Hh);
      const cx = ev.clientX - r.left, cy = ev.clientY - r.top;
      const factor = ev.deltaY < 0 ? 1.12 : 1 / 1.12;
      setZoom(state.scale * factor, cx, cy);
    } else {
      showZoomHint(); // let the page scroll normally (no preventDefault)
    }
  }, { passive: false });

  /* Touch: pinch => zoom, one-finger drag => pan ONLY when zoomed in (so a plain
   * swipe over a graph at rest scrolls the page); a plain swipe otherwise flashes
   * the hint. */
  function touchGap(ev) { const a = ev.touches[0], b = ev.touches[1]; return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); }
  let pinchDist = 0, touchPan = null;
  svg.addEventListener('touchstart', (ev) => {
    if (ev.touches && ev.touches.length === 2) { pinchDist = touchGap(ev); touchPan = null; }
    else if (ev.touches && ev.touches.length === 1) { touchPan = { x: ev.touches[0].clientX, y: ev.touches[0].clientY }; }
  }, { passive: true });
  svg.addEventListener('touchmove', (ev) => {
    if (ev.touches && ev.touches.length === 2) {
      ev.preventDefault();
      const d = touchGap(ev);
      if (pinchDist) {
        const r = rectOf(svg, state.W, state.Hh);
        const a = ev.touches[0], b = ev.touches[1];
        const cx = (a.clientX + b.clientX) / 2 - r.left, cy = (a.clientY + b.clientY) / 2 - r.top;
        setZoom(state.scale * (d / pinchDist), cx, cy);
      }
      pinchDist = d;
    } else if (ev.touches && ev.touches.length === 1 && touchPan) {
      const t = ev.touches[0];
      if (state.scale > state.minScale + 0.01) {
        // zoomed in: one finger pans the graph
        ev.preventDefault();
        state.tx += (t.clientX - touchPan.x); state.ty += (t.clientY - touchPan.y);
        touchPan = { x: t.clientX, y: t.clientY };
        clampTransform(); applyTransform();
      } else {
        // at rest: let the page scroll and hint how to zoom
        showZoomHint();
      }
    }
  }, { passive: false });

  /* minimap click-to-jump */
  miniSvg.addEventListener('pointerdown', (ev) => {
    const r = rectOf(miniSvg, 150, 110);
    const b = contentBounds();
    const mscale = Math.min(r.width / b.w, r.height / b.h);
    const mx = (ev.clientX - r.left) / mscale, my = (ev.clientY - r.top) / mscale;
    state.tx = state.W / 2 - mx * state.scale;
    state.ty = state.Hh / 2 - my * state.scale;
    clampTransform(); applyTransform();
  });

  /* keyboard — zoom/fit/reset PLUS arrow-key roving navigation over the node set.
   * Arrow keys move a visible focus ring node-to-node (deterministic layout order);
   * Enter/Space opens the same drawer as a click. This gives keyboard users a path
   * to every node without 100 tab stops. */
  container.setAttribute('tabindex', '0');
  container.setAttribute('role', 'application');
  container.setAttribute('aria-label', 'Interactive network graph. Use arrow keys to move between nodes, Enter to open a node.');
  container.addEventListener('keydown', (ev) => {
    if (ev.key === '+' || ev.key === '=') { setZoom(state.scale * 1.15); }
    else if (ev.key === '-' || ev.key === '_') { setZoom(state.scale / 1.15); }
    else if (ev.key === 'f' || ev.key === 'F') { fit(); }
    else if (ev.key === 'r' || ev.key === 'R') { doReset(); }
    else if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') { ev.preventDefault(); moveKbFocus(1); }
    else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') { ev.preventDefault(); moveKbFocus(-1); }
    else if ((ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') && state.kbFocus) {
      ev.preventDefault(); selectNode(state.kbFocus); if (onNodeClick) onNodeClick(state.kbFocus);
    }
    else if (ev.key === 'Escape' && state.selected) { clearSelection(); }
  });

  /* nav buttons */
  btnZoomIn.addEventListener('click', () => { setZoom(state.scale * 1.2); });
  btnZoomOut.addEventListener('click', () => { setZoom(state.scale / 1.2); });
  btnFit.addEventListener('click', fit);
  btnReset.addEventListener('click', doReset);

  /* playback buttons (Chain-Link) */
  btnPlay.addEventListener('click', () => { if (state.play.timer) pause(); else play(); });
  btnReplay.addEventListener('click', replay);
  btnSpeed.addEventListener('click', cycleSpeed);

  /* ---- data prep ---- */
  function loadData() {
    const m = state.mode;
    state.nodes = state.srcNodes.map((n) => shallow(n));
    state.edges = state.srcEdges.map((e) => shallow(e));
    state.idmap = {}; state.nodes.forEach((n) => { state.idmap[n.id] = n; });
    state.vertical = (m === 'nexus');
    state.nodes.forEach((n) => {
      n.__flags = {};
      if (n.is_ubo) n.__flags.ubo = 1;
      if (n.is_offshore) n.__flags.offshore = 1;
      if (n.is_nominee) n.__flags.nominee = 1;
      if (n.is_dormant || n.dormant) n.__flags.dormant = 1;
      n.__risk = (m === 'chain') ? n.risk : null; // nexus risk is null in data
    });
    const deg = {}; state.nodes.forEach((n) => { deg[n.id] = 0; });
    state.edges.forEach((e) => { if (deg[e.source] != null) deg[e.source]++; if (deg[e.target] != null) deg[e.target]++; });
    state.nodes.forEach((n) => {
      n.__deg = deg[n.id] || 0;
      n.__key = !!(n.__flags.ubo || n.type === 'mixer' || n.type === 'exchange' || n.__risk === 'High' || n.__deg >= 8);
    });
    buildAdjacency();
    if (m === 'chain') {
      const amts = state.edges.map((e) => e.amount).filter((a) => isFinite(a));
      state.minA = amts.length ? Math.min.apply(null, amts) : 1;
      state.maxA = amts.length ? Math.max.apply(null, amts) : 1;
    }
    state.typeOn = {}; (m === 'nexus' ? NEXUS_TYPES : CHAIN_TYPES).forEach((t) => { state.typeOn[t] = true; });
    state.flagOn = {}; Object.keys(NODE_FLAGS).forEach((f) => { state.flagOn[f] = true; });
    state.edgeOn = {}; edgeTypesFor(m).forEach((et) => { state.edgeOn[et] = true; });
    state.contextEdges = true; state.selected = null;
    resetPlayState();
  }
  function shallow(o) { const r = {}; for (const k in o) if (has(o, k)) r[k] = o[k]; return r; }

  function buildAdjacency() {
    state.adjDown = {}; state.adjUp = {}; state.adjDownAll = {}; state.adjUpAll = {};
    state.nodes.forEach((n) => { state.adjDown[n.id] = []; state.adjUp[n.id] = []; state.adjDownAll[n.id] = []; state.adjUpAll[n.id] = []; });
    state.edges.forEach((e) => {
      if (!state.idmap[e.source] || !state.idmap[e.target]) return;
      state.adjDownAll[e.source].push(e.target); state.adjUpAll[e.target].push(e.source);
      const structural = state.mode === 'chain' || TIER_REL[e.rel_type];
      if (structural) { state.adjDown[e.source].push(e.target); state.adjUp[e.target].push(e.source); }
    });
  }
  function edgeClassOf(e) {
    if (state.mode === 'nexus') return e.rel_type;
    if (e.risk >= 95) return 'flow_hot';
    if (e.pattern === 'peel') return 'flow_peel';
    return 'flow';
  }
  function edgeTypesFor(m) {
    if (m === 'nexus') return ['owns', 'controls', 'director_of', 'agent_for', 'beneficiary_of', 'nominee_for'];
    return ['flow', 'flow_peel', 'flow_hot'];
  }

  /* ---- reachable chain (up & down) from a node ---- */
  function chainFrom(id) {
    const down = {}, up = {};
    (function dfs(n, m) { (m[n] || []).forEach((v) => { if (!down[v]) { down[v] = 1; dfs(v, m); } }); })(id, state.adjDown);
    (function dfs(n, m) { (m[n] || []).forEach((v) => { if (!up[v]) { up[v] = 1; dfs(v, m); } }); })(id, state.adjUp);
    return { down: down, up: up };
  }

  /* =================== RENDER =================== */
  function render() {
    stageSize();
    if (state.mode === 'nexus') {
      state.layout = layoutNexus(state.nodes, state.edges, { r: 15, gapX: 92, gapY: 132, padTop: 40 });
    } else {
      state.layout = layoutChain(state.nodes, state.edges, { colX: 118, padLeft: 70, laneH: 70, padTopC: 60 });
    }

    clear(gEdges); clear(gNodes); clear(gLabels); clear(gTierBg);
    state.nodeEls = {}; state.edgeEls = [];

    drawTierBackground();
    drawEdges();
    drawNodes();
    drawMinimap();
    renderOverlay();
    renderA11y();
    fit();
    applyFilter();
  }

  /* Compose the SVG aria-label + the offscreen node table (the text alternative that
   * makes the whole viz legible to screen readers). Deterministic from the data. */
  function renderA11y() {
    let label, headline;
    if (state.mode === 'nexus') {
      const nUbo = state.nodes.filter((n) => n.is_ubo).length;
      const nCirc = state.edges.filter((e) => e.is_circular).length;
      const nOff = state.nodes.filter((n) => n.is_offshore).length;
      const nNom = state.nodes.filter((n) => n.is_nominee).length;
      label = 'Ownership network — ' + state.nodes.length + ' entities, ' + nUbo + ' ultimate owners, ' + nOff + ' offshore, ' + nNom + ' nominee fronts, ' + nCirc + ' circular structures.';
      headline = label;
    } else {
      const wallets = state.nodes.length;
      const mixers = state.nodes.filter((n) => n.type === 'mixer').length;
      const hi = state.nodes.filter((n) => n.__risk === 'High').length;
      let maxHop = 0; state.edges.forEach((e) => { if (isFinite(e.hop) && e.hop > maxHop) maxHop = e.hop; });
      label = 'Crypto flow — ' + wallets + ' wallets over ' + maxHop + ' hops, ' + mixers + ' mixers, ' + hi + ' high-risk.';
      headline = label;
    }
    if (svg && svg.setAttribute) svg.setAttribute('aria-label', label);
    // offscreen data table (capped so the DOM stays reasonable for very large graphs)
    clear(srSummary);
    srSummary.appendChild(H('p', {}, headline + ' The following table lists each node.'));
    const table = H('table', {});
    const thead = H('tr', {});
    const cols = state.mode === 'nexus'
      ? ['Name', 'Type', 'Jurisdiction', 'Flags']
      : ['Name', 'Type', 'Risk', 'Hop'];
    cols.forEach((c) => thead.appendChild(H('th', {}, c)));
    table.appendChild(thead);
    const cap = 400;
    state.nodes.slice(0, cap).forEach((n) => {
      const tr = H('tr', {});
      const typeLabel = (NODE_TYPES[n.type] && NODE_TYPES[n.type].label) || n.type || '';
      let c3, c4;
      if (state.mode === 'nexus') {
        const fl = []; if (n.is_ubo) fl.push('UBO'); if (n.is_offshore) fl.push('offshore'); if (n.is_nominee) fl.push('nominee'); if (n.is_dormant || n.dormant) fl.push('dormant');
        c3 = n.jurisdiction || '—'; c4 = fl.join(', ') || 'none';
      } else {
        c3 = n.__risk || '—'; c4 = (n.__hop != null ? String(n.__hop) : '—');
      }
      [n.label || n.id, typeLabel, c3, c4].forEach((v) => tr.appendChild(H('td', {}, String(v))));
      table.appendChild(tr);
    });
    srSummary.appendChild(table);
    if (state.nodes.length > cap) srSummary.appendChild(H('p', {}, '…and ' + (state.nodes.length - cap) + ' more nodes. Use “View as table” for the full sortable list.'));
  }

  /* tier/column bands + labels */
  function drawTierBackground() {
    const L = state.layout;
    if (state.mode === 'nexus') {
      const gapY = 132, padTop = 40;
      L.tiers.forEach((t, li) => {
        const y = padTop + li * gapY;
        gTierBg.appendChild(S('rect', { x: -40, y: y - gapY / 2 + 8, width: L.width + 80, height: gapY - 16, rx: 10,
          fill: li % 2 === 0 ? 'rgba(255,255,255,.018)' : 'rgba(255,255,255,.045)' }));
        gTierBg.appendChild(S('text', { x: -30, y: y - gapY / 2 + 30, fill: C.muted, 'font-size': 12, 'font-weight': 600,
          'letter-spacing': '.04em', 'text-anchor': 'start', class: 'frisg-tierlabel' }, (L.tierLabels[li] || ('Tier ' + (li + 1))).toUpperCase()));
        if (li < L.tiers.length - 1) gTierBg.appendChild(S('path', { d: 'M-18,' + (y + gapY / 2 - 18) + ' l6,10 l-12,0 z', fill: 'rgba(138,160,189,.4)', transform: 'rotate(180 -18 ' + (y + gapY / 2 - 13) + ')' }));
      });
      if (L.tray.length) {
        gTierBg.appendChild(S('rect', { x: -40, y: L.trayY, width: L.trayW + 80, height: L.contentH - L.trayY + 10, rx: 10,
          fill: 'rgba(240,97,109,.05)', stroke: 'rgba(240,97,109,.25)', 'stroke-dasharray': '5 4' }));
        gTierBg.appendChild(S('text', { x: -30, y: L.trayY + 18, fill: C.muted, 'font-size': 11, 'font-weight': 600, 'text-anchor': 'start' },
          'UNCONNECTED TO OWNERSHIP BACKBONE (' + L.tray.length + ') — parked, not floating'));
      }
      gTierBg.appendChild(S('text', { x: L.width + 34, y: padTop - 6, fill: C.muted, 'font-size': 11, 'text-anchor': 'end', opacity: 0.8 }, 'CONTROL FLOWS DOWN ↓'));
    } else {
      const colX = 118, padLeft = 70;
      for (let h = 0; h <= L.maxHop; h++) {
        const x = padLeft + h * colX;
        if (h % 2 === 0) gTierBg.appendChild(S('rect', { x: x - colX / 2, y: 24, width: colX, height: L.contentH - 24, fill: 'rgba(255,255,255,.02)' }));
        if (h === 0 || h % 4 === 0 || h === L.maxHop) gTierBg.appendChild(S('text', { x: x, y: 18, fill: C.muted, 'font-size': 11, 'text-anchor': 'middle' }, 'hop ' + h));
      }
      gTierBg.appendChild(S('text', { x: padLeft, y: L.contentH + 6, fill: OK.orange, 'font-size': 12, 'font-weight': 600, 'text-anchor': 'middle' }, '◀ SOURCE'));
      gTierBg.appendChild(S('text', { x: padLeft + L.maxHop * colX, y: L.contentH + 6, fill: OK.blue, 'font-size': 12, 'font-weight': 600, 'text-anchor': 'middle' }, 'CASH-OUT ▶'));
      gTierBg.appendChild(S('text', { x: (padLeft + L.maxHop * colX) / 2, y: 42, fill: C.muted, 'font-size': 11, 'text-anchor': 'middle', opacity: 0.85 }, 'FOLLOW THE MONEY, LEFT → RIGHT →'));
    }
  }

  function drawEdges() {
    const pairSeen = {};
    state.edges.forEach((e) => {
      const s = state.idmap[e.source], t = state.idmap[e.target];
      if (!s || !t || s.__x == null || t.__x == null) return;
      const cls = edgeClassOf(e);
      const spec = EDGE_TYPES[cls] || EDGE_TYPES.owns;
      const key = e.source + '>' + e.target;
      let totalPair = 0; state.edges.forEach((o) => { if (o.source === e.source && o.target === e.target) totalPair++; });
      const seen = (pairSeen[key] = (pairSeen[key] || 0) + 1);
      const bundleOff = (totalPair > 1) ? (seen - (totalPair + 1) / 2) * 16 : 0;

      let w;
      if (state.mode === 'chain') w = amountWidth(e.amount, state.minA, state.maxA);
      else w = spec.weighted ? pctWidth(e.ownership_pct) : 2;

      const col = e.is_circular ? CIRC_COLOR : spec.color;
      const path = S('path', {
        d: edgePath(s.__x, s.__y, t.__x, t.__y, state.vertical, bundleOff),
        fill: 'none', stroke: col, 'stroke-width': w, opacity: spec.context ? 0.32 : 0.72,
        'stroke-linecap': 'round', class: 'frisg-edge',
        'marker-end': 'url(#' + markerId(spec.head, e.is_circular ? 'circ' : cls) + ')',
      });
      if (spec.dash) path.setAttribute('stroke-dasharray', spec.dash);
      if (e.is_circular) path.setAttribute('stroke-dasharray', '2 4');
      gEdges.appendChild(path);

      const mx = (s.__x + t.__x) / 2 + (state.vertical ? bundleOff : 0);
      const my = (s.__y + t.__y) / 2 + (state.vertical ? 0 : bundleOff);
      const valTxt = state.mode === 'chain' ? fmtAmount(e.amount) : (e.ownership_pct != null && cls === 'owns' ? e.ownership_pct + '%' : spec.word);
      const lbl = S('text', { x: mx, y: my - 3, fill: col, 'font-size': 10, 'text-anchor': 'middle', opacity: 0, class: 'frisg-edgelabel', 'paint-order': 'stroke', stroke: C.bg, 'stroke-width': 3 }, valTxt);
      gLabels.appendChild(lbl);

      state.edgeEls.push({ e: e, el: path, lbl: lbl, cls: cls, src: e.source, tgt: e.target, hop: (e.hop != null ? e.hop : 0) });
    });
  }

  function drawNodes() {
    const baseR = 15;
    // build a deterministic navigation order (top->bottom tiers / left->right hops,
    // then by x) so arrow-key movement follows the visible layout.
    const ordered = state.nodes.filter((n) => n.__x != null).slice().sort((a, b) => {
      const la = state.mode === 'nexus' ? (a.__layer == null ? 99 : a.__layer) : (a.__hop || 0);
      const lb = state.mode === 'nexus' ? (b.__layer == null ? 99 : b.__layer) : (b.__hop || 0);
      if (la !== lb) return la - lb;
      if (a.__y !== b.__y) return a.__y - b.__y;
      return a.__x - b.__x;
    });
    state.navOrder = ordered.map((n) => n.id);
    state.navIdx = -1; state.kbFocus = null;
    state.nodes.forEach((n) => {
      if (n.__x == null) return;
      let r = baseR;
      if (n.type === 'mixer') r = baseR * 1.7;                              // mixers biggest (mandate)
      else if (n.type === 'exchange' || n.__flags.ubo) r = baseR * 1.28;
      else if (state.mode === 'chain' && n.__hop === 0) r = baseR * 1.3;    // source prominent

      const g = S('g', { class: 'frisg-node', transform: 'translate(' + n.__x + ',' + n.__y + ')' });
      const glyph = drawGlyph(n.type, r, { flags: n.__flags, risk: n.__risk });
      g.appendChild(glyph);
      // visible keyboard-focus ring (shown only when this node holds roving focus)
      const focusRing = S('circle', { cx: 0, cy: 0, r: r * 1.62, fill: 'none', stroke: C.accent, 'stroke-width': 2.5, 'stroke-dasharray': '4 3', opacity: 0, class: 'frisg-focusring' });
      g.appendChild(focusRing);
      // hit target is keyboard-operable: role=button + per-node aria-label; roving
      // tabindex (only the focused node is 0) keeps the tab order from exploding.
      const hit = S('circle', { cx: 0, cy: 0, r: r * 1.5, fill: 'transparent', class: 'frisg-nodehit', 'data-id': n.id, cursor: 'pointer', role: 'button', tabindex: '-1', 'aria-label': nodeAriaLabel(n) });
      g.appendChild(hit);
      gNodes.appendChild(g);

      const lbl = S('text', { x: 0, y: r + 13, fill: C.text, 'font-size': 10.5, 'text-anchor': 'middle', class: 'frisg-nodelabel',
        'paint-order': 'stroke', stroke: C.bg, 'stroke-width': 3.2 }, truncate(n.label, 16));
      const lg = S('g', { transform: 'translate(' + n.__x + ',' + n.__y + ')' });
      lg.appendChild(lbl);
      gLabels.appendChild(lg);

      state.nodeEls[n.id] = { node: n, g: g, glyph: glyph, r: r, labelEl: lg, hit: hit, focusRing: focusRing };

      // NOTE: node selection is handled centrally on the svg pointerup (see the pan
      // handler) so a drag that starts on a node pans instead of selecting. We do NOT
      // attach a per-node click listener here (it would double-fire / fire after a drag).
      hit.addEventListener('mouseenter', () => { hoverNode(n.id, true); });
      hit.addEventListener('mouseleave', () => { hoverNode(n.id, false); });
      hit.addEventListener('focus', () => { setKbFocus(n.id, false); });
      hit.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') {
          ev.preventDefault(); ev.stopPropagation();
          selectNode(n.id); if (onNodeClick) onNodeClick(n.id);
        }
      });
    });
  }

  // Compose a screen-reader label for a node from its type + key facts.
  function nodeAriaLabel(n) {
    const typeLabel = (NODE_TYPES[n.type] && NODE_TYPES[n.type].label) || n.type || 'node';
    const parts = [n.label || n.id, typeLabel];
    if (state.mode === 'nexus') {
      if (n.jurisdiction) parts.push(n.jurisdiction);
      const fl = [];
      if (n.is_ubo) fl.push('ultimate owner'); if (n.is_offshore) fl.push('offshore');
      if (n.is_nominee) fl.push('nominee'); if (n.is_dormant || n.dormant) fl.push('dormant');
      if (fl.length) parts.push(fl.join(', '));
    } else {
      if (n.__risk) parts.push(n.__risk + ' risk');
      if (n.__hop != null) parts.push('hop ' + n.__hop);
    }
    return parts.join(', ') + '. Activate to open details.';
  }

  // Roving keyboard focus: show the focus ring on `id`, set its tabindex to 0 and the
  // previous one back to -1, and optionally move DOM focus to it.
  function setKbFocus(id, moveDomFocus) {
    const prev = state.kbFocus;
    if (prev && prev !== id && state.nodeEls[prev]) {
      const pr = state.nodeEls[prev];
      if (pr.focusRing) pr.focusRing.setAttribute('opacity', 0);
      if (pr.hit && pr.hit.setAttribute) pr.hit.setAttribute('tabindex', '-1');
    }
    state.kbFocus = id;
    const idx = state.navOrder.indexOf(id);
    if (idx >= 0) state.navIdx = idx;
    const rec = state.nodeEls[id];
    if (!rec) return;
    if (rec.focusRing) rec.focusRing.setAttribute('opacity', 1);
    if (rec.hit && rec.hit.setAttribute) rec.hit.setAttribute('tabindex', '0');
    if (moveDomFocus && rec.hit && typeof rec.hit.focus === 'function') { try { rec.hit.focus(); } catch (_e) {} }
  }

  // Move the roving focus by `delta` through the visible nodes and scroll it into view.
  function moveKbFocus(delta) {
    if (!state.navOrder.length) return;
    // restrict to nodes currently visible under the active filter/spotlight
    const visible = state.navOrder.filter((id) => {
      const rec = state.nodeEls[id];
      return rec && parseFloat(rec.g.getAttribute('opacity') || '1') > 0.3;
    });
    const pool = visible.length ? visible : state.navOrder;
    let curPos = state.kbFocus ? pool.indexOf(state.kbFocus) : -1;
    if (curPos < 0) curPos = delta > 0 ? -1 : 0;
    let next = curPos + delta;
    next = ((next % pool.length) + pool.length) % pool.length;
    const id = pool[next];
    setKbFocus(id, true);
    revealNodes([id]); // gentle pan-into-view, no balloon (keeps keyboard nav usable)
  }

  function hoverNode(id, on) {
    const rec = state.nodeEls[id]; if (!rec) return;
    rec.g.setAttribute('filter', on ? 'url(#frisg-glow)' : '');
    state.edgeEls.forEach((er) => {
      if (er.src === id || er.tgt === id) er.lbl.setAttribute('opacity', on ? 1 : 0);
    });
  }

  /* ---- selection: highlight up/down-stream chain + detail panel ---- */
  function selectNode(id, opts) {
    // opts.reveal (default true): move the camera to gently reveal the chain and
    // save the pre-selection camera. applyFilter() re-selects with reveal:false
    // so re-applying the highlight (e.g. after a filter toggle) never re-zooms.
    const reveal = !opts || opts.reveal !== false;
    state.selected = id;
    state.spotlight = null; // a direct node selection supersedes any external spotlight
    const chain = chainFrom(id);
    const keep = {}; keep[id] = 1;
    Object.keys(chain.up).forEach((k) => { keep[k] = 1; });
    Object.keys(chain.down).forEach((k) => { keep[k] = 1; });
    Object.keys(state.nodeEls).forEach((nid) => {
      const rec = state.nodeEls[nid];
      const vis = passesFilter(rec.node);
      const inChain = keep[nid];
      rec.g.setAttribute('opacity', !vis ? 0.06 : (inChain ? 1 : 0.14));
      rec.labelEl.setAttribute('opacity', inChain && (state.scale >= 1.15 || rec.node.__key || nid === id) ? 1 : (state.scale >= 1.15 && vis ? 0.25 : 0));
      rec.g.setAttribute('filter', nid === id ? 'url(#frisg-glow)' : '');
    });
    state.edgeEls.forEach((er) => {
      const onChain = keep[er.src] && keep[er.tgt];
      er.el.setAttribute('opacity', onChain ? 0.95 : 0.05);
      if (onChain) er.el.setAttribute('stroke-width', Math.max(2.4, parseFloat(er.el.getAttribute('stroke-width'))));
      er.lbl.setAttribute('opacity', onChain && (er.cls === 'owns' || er.cls === 'flow_hot' || state.mode === 'chain') ? 1 : 0);
    });
    renderDetail(id, chain);
    // Gentle reveal (NOT a fit-to-chain slam). On a FRESH selection we first
    // remember the current camera so closing the info box can snap the user
    // straight back; then we pan the chain into view WITHOUT zooming in past a
    // small, readable cap (see revealNodes). A re-entrant call from applyFilter
    // passes {reveal:false} so re-applying the highlight never moves the camera.
    if (reveal) {
      if (!state.savedCam) state.savedCam = { scale: state.scale, tx: state.tx, ty: state.ty };
      revealNodes(Object.keys(keep));
    }
  }
  function clearSelection() {
    state.selected = null;
    applyFilter();
    renderDetail(null);
    restoreCam(); // closing the info box returns the camera to where it was pre-select
  }

  // Restore (snap back) the camera saved before the current selection, if any.
  // Called from every close path: the detail-panel close/Clear button, the
  // Escape handler, and a click on empty background -- all route through
  // clearSelection(), so this single call covers all three.
  function restoreCam() {
    const c = state.savedCam;
    state.savedCam = null;
    if (!c) return;
    state.scale = c.scale; state.tx = c.tx; state.ty = c.ty;
    clampTransform(); applyTransform();
  }

  // GENTLE reveal used by node selection + keyboard roving: pan the given nodes
  // comfortably into view while keeping the CURRENT zoom. We only ever zoom OUT
  // (never in) and only if the set genuinely doesn't fit at the current scale --
  // and even then never below the cap of min(currentScale * 1.4, READABLE_CAP).
  // This is the fix for "when I click something it goes very big": a click is a
  // highlight + focus, not a slam to max zoom.
  function revealNodes(ids) {
    const READABLE_CAP = 1.6; // never zoom IN past this on a reveal
    const xs = [], ys = [];
    ids.forEach((id) => { const n = state.idmap[id]; if (n && n.__x != null) { xs.push(n.__x); ys.push(n.__y); } });
    if (!xs.length) return;
    const minx = Math.min.apply(null, xs), maxx = Math.max.apply(null, xs);
    const miny = Math.min.apply(null, ys), maxy = Math.max.apply(null, ys);
    const pad = 90;
    const bw = (maxx - minx) + pad * 2, bh = (maxy - miny) + pad * 2;
    const fitS = Math.min(state.W / bw, state.Hh / bh); // scale that would fit the set
    // Keep the current zoom when the set already fits; otherwise zoom OUT to fit.
    // Never increase scale beyond a small factor of the current (belt & braces).
    const cap = Math.min(state.scale * 1.4, READABLE_CAP);
    let s = Math.min(state.scale, fitS);
    s = clamp(s, state.minScale, Math.min(state.maxScale, cap));
    state.scale = s;
    state.tx = state.W / 2 - ((minx + maxx) / 2) * s;
    state.ty = state.Hh / 2 - ((miny + maxy) / 2) * s;
    clampTransform(); applyTransform();
  }

  function zoomToNodes(ids) {
    const xs = [], ys = [];
    ids.forEach((id) => { const n = state.idmap[id]; if (n && n.__x != null) { xs.push(n.__x); ys.push(n.__y); } });
    if (!xs.length) return;
    const minx = Math.min.apply(null, xs), maxx = Math.max.apply(null, xs);
    const miny = Math.min.apply(null, ys), maxy = Math.max.apply(null, ys);
    const pad = 90;
    const bw = (maxx - minx) + pad * 2, bh = (maxy - miny) + pad * 2;
    const s = clamp(Math.min(state.W / bw, state.Hh / bh), state.minScale, state.maxScale);
    state.scale = s;
    state.tx = state.W / 2 - ((minx + maxx) / 2) * s;
    state.ty = state.Hh / 2 - ((miny + maxy) / 2) * s;
    clampTransform(); applyTransform();
  }

  /* ---- filtering: focus+context dimming; NEVER delete, park isolates ---- */
  function passesFilter(n) {
    if (!state.typeOn[n.type]) return false;
    return true;
  }

  function applyFilter() {
    if (state.selected) { selectNode(state.selected, { reveal: false }); return; }
    if (state.spotlight) { applySpotlight(); return; }
    const soloFlags = Object.keys(NODE_FLAGS).filter((f) => state.flagOn[f] === 'solo');
    Object.keys(state.nodeEls).forEach((id) => {
      const rec = state.nodeEls[id], n = rec.node;
      const typeOk = state.typeOn[n.type];
      let flagOk = true;
      if (soloFlags.length) flagOk = soloFlags.some((f) => n.__flags[f] || (f === 'highrisk' && n.__risk === 'High') || (f === 'medrisk' && n.__risk === 'Medium'));
      const visible = typeOk && flagOk;
      rec.__visible = visible;
      rec.g.setAttribute('opacity', visible ? 1 : 0.12);
      rec.g.setAttribute('filter', '');
    });
    state.edgeEls.forEach((er) => {
      const sVis = state.nodeEls[er.src] && state.nodeEls[er.src].__visible;
      const tVis = state.nodeEls[er.tgt] && state.nodeEls[er.tgt].__visible;
      const typeOk = state.edgeOn[er.cls] !== false;
      const spec = EDGE_TYPES[er.cls] || {};
      const ctxOk = !spec.context || state.contextEdges;
      const vis = sVis && tVis && typeOk && ctxOk;
      er.el.setAttribute('opacity', vis ? (spec.context ? 0.3 : 0.72) : 0.05);
      er.lbl.setAttribute('opacity', 0);
      er.__visible = vis;
    });
    Object.keys(state.nodeEls).forEach((id) => {
      const rec = state.nodeEls[id]; if (!rec.__visible) return;
      const hasVisEdge = state.edgeEls.some((er) => er.__visible && (er.src === id || er.tgt === id));
      rec.g.setAttribute('opacity', hasVisEdge ? 1 : (rec.node.__tray ? 0.9 : 0.5));
    });
    applyTransform();
  }

  /* =================== EXTERNAL HIGHLIGHTS (spotlight) ===================
   * A spotlight dims everything, then re-emphasises a chosen set of nodes and the
   * edges that connect them. Three drivers, all recorded on state.spotlight so a
   * re-render (applyFilter) re-applies the emphasis instead of wiping it:
   *   - highlightPath(ids, colour): the Trace-to-UBO chain / Path-between result.
   *   - spotlightFlagged(true):     the Red-flags toggle (nexus red flags, chain risk).
   * clearSpotlight() restores the normal filter view. */
  function nodeMatchesFlagged(n) {
    if (state.mode === 'nexus') {
      return !!(n.__flags.nominee || n.__flags.offshore || n.__flags.dormant || n.__circ);
    }
    return !!(n.type === 'mixer' || n.__risk === 'High');
  }
  function computeCircularNodes() {
    // mark nodes that sit on a circular-ownership edge (nexus)
    state.nodes.forEach((n) => { n.__circ = false; });
    state.edges.forEach((e) => {
      if (e.is_circular) { if (state.idmap[e.source]) state.idmap[e.source].__circ = true; if (state.idmap[e.target]) state.idmap[e.target].__circ = true; }
    });
  }
  function applySpotlight() {
    const sp = state.spotlight;
    if (!sp) { applyFilter(); return; }
    const nodeSet = sp.nodeSet || {};
    const edgeIsOn = sp.edgeIsOn || (() => false);
    const col = sp.color || null;
    Object.keys(state.nodeEls).forEach((id) => {
      const rec = state.nodeEls[id];
      const on = sp.predicate ? sp.predicate(rec.node) : !!nodeSet[id];
      rec.g.setAttribute('opacity', on ? 1 : 0.1);
      rec.g.setAttribute('filter', '');
      rec.__visible = on;
    });
    state.edgeEls.forEach((er) => {
      const on = edgeIsOn(er);
      const spec = EDGE_TYPES[er.cls] || {};
      er.el.setAttribute('opacity', on ? 0.98 : 0.05);
      if (on) {
        er.el.setAttribute('stroke-width', Math.max(2.6, parseFloat(er.el.getAttribute('stroke-width')) || 2.6));
        if (col) er.el.setAttribute('stroke', col);
      }
      er.lbl.setAttribute('opacity', on && (state.mode === 'chain' || er.cls === 'owns') ? 1 : 0);
      er.__visible = on;
    });
    applyTransform();
  }
  // Highlight the FULL chain/path: the given node ids + every edge between consecutive
  // ids (undirected), with the rest dimmed. Drives Trace-to-UBO and Path-between.
  function highlightPath(ids, color) {
    if (!Array.isArray(ids) || !ids.length) return;
    state.selected = null;
    const nodeSet = {};
    ids.forEach((id) => { nodeSet[id] = 1; });
    // pair set for consecutive ids (path order) AND any edge fully inside the node set
    const pairSet = {};
    for (let i = 0; i < ids.length - 1; i++) { pairSet[ids[i] + '>' + ids[i + 1]] = 1; pairSet[ids[i + 1] + '>' + ids[i]] = 1; }
    const edgeIsOn = (er) => {
      if (pairSet[er.src + '>' + er.tgt]) return true;
      // for UBO (unordered node set), also light edges wholly within the set
      return !!(nodeSet[er.src] && nodeSet[er.tgt]);
    };
    state.spotlight = { nodeSet: nodeSet, edgeIsOn: edgeIsOn, color: color || null };
    applySpotlight();
    zoomToNodes(ids);
  }
  // Spotlight flagged nodes (red flags) and the edges among them; dim the rest.
  function spotlightFlagged(on) {
    if (!on) { clearSpotlight(); return; }
    computeCircularNodes();
    state.selected = null;
    const predicate = (n) => nodeMatchesFlagged(n);
    const edgeIsOn = (er) => {
      if (state.mode === 'nexus' && er.e.is_circular) return true;
      if (state.mode === 'nexus' && er.cls === 'nominee_for') return true;
      if (state.mode === 'chain' && er.e.risk >= 95) return true;
      const sN = state.idmap[er.src], tN = state.idmap[er.tgt];
      return !!(sN && tN && nodeMatchesFlagged(sN) && nodeMatchesFlagged(tN));
    };
    state.spotlight = { predicate: predicate, edgeIsOn: edgeIsOn, color: null, kind: 'flagged' };
    applySpotlight();
  }
  function clearSpotlight() {
    if (!state.spotlight) return;
    state.spotlight = null;
    // edges may have had their stroke recoloured/thickened — cheapest correct restore
    // is a full re-render, which is deterministic.
    render();
  }

  /* Spotlight a single finding CATEGORY (driven by the bottom "finding" chips).
   * Reuses the same state.spotlight/applySpotlight machinery as red-flags: build a
   * node predicate + an edgeIsOn, dim the rest. Categories:
   *   nexus  -> 'ubo' | 'offshore' | 'nominee' | 'circ'
   *   chain  -> 'mixer' | 'highrisk'
   * Returns true if it lit something, false if the category matched nothing (caller
   * then leaves the view untouched). */
  function categoryPredicate(cat) {
    switch (cat) {
      case 'ubo': return (n) => !!n.is_ubo;
      case 'offshore': return (n) => !!n.is_offshore;
      case 'nominee': return (n) => !!n.is_nominee;
      case 'circ': return (n) => !!n.__circ;
      case 'mixer': return (n) => n.type === 'mixer';
      case 'highrisk': return (n) => n.__risk === 'High';
      default: return null;
    }
  }
  function spotlightCategory(cat) {
    const pred = categoryPredicate(cat);
    if (!pred) { clearSpotlight(); return false; }
    if (cat === 'circ') computeCircularNodes();
    state.selected = null;
    const edgeIsOn = (er) => {
      if (cat === 'circ') return !!er.e.is_circular;
      const sN = state.idmap[er.src], tN = state.idmap[er.tgt];
      // for a node category, light an edge only when BOTH endpoints are in the set,
      // plus (nominee) the nominee_for relation itself so fronts read as fronts.
      if (cat === 'nominee' && er.cls === 'nominee_for') return true;
      return !!(sN && tN && pred(sN) && pred(tN));
    };
    state.spotlight = { predicate: pred, edgeIsOn: edgeIsOn, color: null, kind: 'category', cat: cat };
    applySpotlight();
    return true;
  }
  /* Toggle a chip category from the overlay: same category again clears; a different
   * one switches. The pure-total chip passes cat === 'all' -> clear + fit ("show all"). */
  function toggleChipCategory(cat) {
    if (cat === 'all') {
      state.chipCat = null;
      if (state.spotlight) clearSpotlight();
      fit();
      renderOverlay();
      return;
    }
    if (state.chipCat === cat) {
      state.chipCat = null;
      clearSpotlight();
      renderOverlay();
      return;
    }
    const lit = spotlightCategory(cat);
    state.chipCat = lit ? cat : null;
    renderOverlay();
  }

  /* =================== OVERLAY (title/question/how-to-read/chips) =================== */
  function renderOverlay() {
    clear(overlay);
    let title, question, how, chips;
    if (state.mode === 'nexus') {
      const nUbo = state.nodes.filter((n) => n.is_ubo).length;
      const nOff = state.nodes.filter((n) => n.is_offshore).length;
      const nCirc = state.edges.filter((e) => e.is_circular).length;
      const nNom = state.nodes.filter((n) => n.is_nominee).length;
      title = 'Beneficial ownership — who ultimately controls these entities?';
      question = 'Follow the ownership arrows UP to the crowned nodes on the top tier. Those are the ultimate beneficial owners.';
      how = [
        ['crown', 'Crown = ultimate owner (top tier)'],
        ['owns', 'Arrow = owns / controls (points down)'],
        ['tier', 'Top → bottom = owners → operating companies'],
        ['circ', 'Magenta dashes = circular ownership loop'],
      ];
      chips = [
        { label: nUbo + ' ultimate owners', cat: 'ubo', on: nUbo > 0 },
        { label: nOff + ' offshore', cat: 'offshore', on: nOff > 0 },
        { label: nNom + ' nominee fronts', cat: 'nominee', on: nNom > 0 },
        { label: nCirc + ' circular loops', cat: 'circ', on: nCirc > 0 },
        { label: state.nodes.length + ' entities · ' + state.edges.length + ' links', cat: 'all', on: true },
      ];
    } else {
      const mixers = state.nodes.filter((n) => n.type === 'mixer');
      const amts = state.edges.map((e) => e.amount).filter((a) => isFinite(a));
      const maxAmt = amts.length ? Math.max.apply(null, amts) : 0;
      const hops = state.edges.map((e) => e.hop).filter((h) => isFinite(h));
      const maxHop = hops.length ? Math.max.apply(null, hops) : 0;
      const hot = state.edges.filter((e) => e.risk >= 95).length;
      const hi = state.nodes.filter((n) => n.__risk === 'High').length;
      title = 'Fund-flow trace — where did the money go, and through which mixer?';
      question = 'Read the money LEFT → RIGHT, hop by hop. It funnels through the red hazard MIXERS mid-stream on its way to cash-out. Press Play to watch it advance.';
      how = [
        ['flow', 'Arrow = funds move to (left → right)'],
        ['mixer', 'Red hazard octagon = mixer (laundering gate)'],
        ['thick', 'Thicker line = bigger amount (log scale)'],
        ['risk', 'Red square = High risk · amber = Medium'],
      ];
      chips = [
        { label: mixers.length + ' mixers: ' + mixers.map((m) => m.label).join(' + '), cat: 'mixer', on: mixers.length > 0 },
        { label: hi + ' high-risk wallets', cat: 'highrisk', on: hi > 0 },
        { label: fmtAmount(maxAmt) + ' peeled', cat: 'all', on: true },
        { label: maxHop + ' hops traced', cat: 'all', on: true },
      ];
    }
    /* The title/question/how-to-read block is the dismissible "key". When closed it
     * collapses to a compact "Key" pill in the corner; state persists while mounted. */
    if (state.overlayOpen) {
      const t = H('div', { class: 'frisg-ov-title' }, title);
      const qq = H('div', { class: 'frisg-ov-q' }, question);
      overlay.appendChild(t); overlay.appendChild(qq);
      const howBox = H('div', { class: 'frisg-ov-how' });
      const howHead = H('div', { class: 'frisg-ov-howhead' });
      howHead.appendChild(H('span', { class: 'frisg-ov-howtitle' }, 'How to read this graph'));
      const closeBtn = H('span', {
        class: 'frisg-ov-close', role: 'button', tabindex: '0',
        'aria-label': 'Hide the key', 'aria-expanded': 'true', title: 'Hide the key'
      }, '\u00d7');
      const hideKey = () => { state.overlayOpen = false; renderOverlay(); };
      closeBtn.addEventListener('click', hideKey);
      closeBtn.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') { ev.preventDefault(); hideKey(); }
      });
      howHead.appendChild(closeBtn);
      howBox.appendChild(howHead);
      how.forEach((row) => {
        const item = H('div', { class: 'frisg-ov-howrow' });
        const sw = S('svg', { width: 26, height: 22, viewBox: '-13 -11 26 22', class: 'frisg-ov-sw' });
        sw.appendChild(howGlyph(row[0]));
        item.appendChild(sw);
        item.appendChild(H('span', {}, row[1]));
        howBox.appendChild(item);
      });
      overlay.appendChild(howBox);
    } else {
      const pill = H('div', {
        class: 'frisg-ov-keypill', role: 'button', tabindex: '0',
        'aria-label': 'Show the key', 'aria-expanded': 'false', title: 'Show the key (how to read this graph)'
      });
      pill.appendChild(H('span', { class: 'frisg-ov-keyico', 'aria-hidden': 'true' }, '\u2315'));
      pill.appendChild(H('span', {}, 'Key'));
      const showKey = () => { state.overlayOpen = true; renderOverlay(); };
      pill.addEventListener('click', showKey);
      pill.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') { ev.preventDefault(); showKey(); }
      });
      overlay.appendChild(pill);
    }
    /* Finding chips - all share ONE visual treatment; each is a real button that
     * spotlights its category (or, for the totals chip, clears + fits). */
    const chipBox = H('div', { class: 'frisg-ov-chips' });
    chips.forEach((c) => {
      const active = c.cat !== 'all' && state.chipCat === c.cat;
      const attrs = {
        class: 'frisg-chip' + (active ? ' active' : '') + (c.on ? '' : ' empty'),
        role: 'button', tabindex: '0',
        'aria-pressed': active ? 'true' : 'false',
        'aria-label': (c.cat === 'all' ? 'Show all - clear spotlight and fit the view' : (active ? 'Clear spotlight: ' : 'Spotlight: ') + c.label),
        title: c.cat === 'all' ? 'Show everything - clear any spotlight and fit the view' : (active ? 'Click to clear this spotlight' : 'Click to spotlight these on the graph'),
      };
      const chip = H('span', attrs, c.label);
      const activate = () => { try { toggleChipCategory(c.cat); } catch (_e) {} };
      chip.addEventListener('click', activate);
      chip.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') { ev.preventDefault(); activate(); }
      });
      chipBox.appendChild(chip);
    });
    overlay.appendChild(chipBox);
  }
  function howGlyph(kind) {
    if (kind === 'crown') return drawGlyph('person', 8, { flags: { ubo: 1 } });
    if (kind === 'mixer') return drawGlyph('mixer', 7, {});
    if (kind === 'risk') { const g = S('g', {}); g.appendChild(S('rect', { x: -5, y: -5, width: 10, height: 10, rx: 1, fill: C.high, stroke: shade(C.high, 0.45), 'stroke-width': 1 })); return g; }
    if (kind === 'tier' || kind === 'thick' || kind === 'flow' || kind === 'owns') {
      const g = S('g', {});
      const col = kind === 'flow' ? C.teal : OK.blue;
      g.appendChild(S('line', { x1: -10, y1: 0, x2: 6, y2: 0, stroke: col, 'stroke-width': kind === 'thick' ? 5 : 3, 'marker-end': 'url(#' + markerId('solid', kind) + ')' }));
      return g;
    }
    if (kind === 'circ') { const g2 = S('g', {}); g2.appendChild(S('path', { d: 'M-8,-4 a6,6 0 1 1 0,8', fill: 'none', stroke: CIRC_COLOR, 'stroke-width': 2.4, 'stroke-dasharray': '2 3' })); g2.appendChild(S('path', { d: 'M-8,4 l-2,-3 l4,0 z', fill: CIRC_COLOR })); return g2; }
    return S('g', {});
  }

  /* =================== LEGEND (built from the SAME encoding + draw code) =================== */
  function renderLegend() {
    clear(legendPanel);
    legendPanel.appendChild(H('div', { class: 'frisg-panel-h' }, 'Legend & filters — click to focus'));
    legendPanel.appendChild(H('div', { class: 'frisg-panel-sub' }, 'Every symbol is drawn by the same code as the nodes, so the key can never disagree with the canvas.'));

    const types = state.mode === 'nexus' ? NEXUS_TYPES : CHAIN_TYPES;
    legendPanel.appendChild(sectionHead('Node types'));
    types.forEach((t) => {
      const spec = NODE_TYPES[t];
      const row = legendRow(() => miniGlyph(t, {}), spec.label, () => {
        state.typeOn[t] = !state.typeOn[t]; row.classList.toggle('off', !state.typeOn[t]); clearSelection(); applyFilter();
      }, (on) => highlightType(t, on));
      row.__present = state.nodes.some((n) => n.type === t);
      if (!row.__present) row.classList.add('absent');
      legendPanel.appendChild(row);
    });

    /* --- flags (additive overlays) — for chainlink this is where EVERY risk level is
     *     spelled out (Low / Medium / High), each with the exact node glyph. --- */
    legendPanel.appendChild(sectionHead(state.mode === 'nexus' ? 'Flags (additive overlays)' : 'Risk & flags (additive overlays)'));
    const flagList = state.mode === 'nexus'
      ? [['ubo', { ubo: 1 }], ['offshore', { offshore: 1 }], ['nominee', { nominee: 1 }], ['dormant', { dormant: 1 }], ['circ', null]]
      : [['highrisk', null], ['medrisk', null], ['lowrisk', null], ['dormant', { dormant: 1 }]];
    flagList.forEach((pair) => {
      const key = pair[0];
      let makeSw, label;
      if (key === 'circ') { makeSw = () => { const g = S('g', {}); g.appendChild(S('path', { d: 'M-9,-5 a7,7 0 1 1 0,10', fill: 'none', stroke: CIRC_COLOR, 'stroke-width': 2.4, 'stroke-dasharray': '2 3' })); g.appendChild(S('path', { d: 'M-9,5 l-2,-3 l4,0 z', fill: CIRC_COLOR })); return g; }; label = 'Circular ownership loop'; }
      else if (key === 'highrisk') { makeSw = () => miniGlyph('wallet', { risk: 'High' }); label = 'High risk (red square badge)'; }
      else if (key === 'medrisk') { makeSw = () => miniGlyph('wallet', { risk: 'Medium' }); label = 'Medium risk (amber square badge)'; }
      else if (key === 'lowrisk') { makeSw = () => miniGlyph('wallet', {}); label = 'Low risk (no badge)'; }
      else { makeSw = ((fl) => () => miniGlyph(state.mode === 'nexus' ? 'company' : 'wallet', { flags: fl }))(pair[1]); label = NODE_FLAGS[key] ? NODE_FLAGS[key].label : key; }
      const toggleable = (key === 'ubo' || key === 'offshore' || key === 'nominee' || key === 'dormant' || key === 'highrisk' || key === 'medrisk');
      const row = legendRow(makeSw, label, toggleable ? () => {
        state.flagOn[key] = state.flagOn[key] === 'solo' ? true : 'solo';
        Array.prototype.forEach.call(legendPanel.querySelectorAll('.frisg-lrow.solo'), (r) => { if (r !== row) r.classList.remove('solo'); });
        Object.keys(NODE_FLAGS).forEach((f) => { if (f !== key && state.flagOn[f] === 'solo') state.flagOn[f] = true; });
        row.classList.toggle('solo', state.flagOn[key] === 'solo');
        clearSelection(); applyFilter();
      } : null, (on) => highlightFlag(key, on));
      const present = key === 'circ' ? state.edges.some((e) => e.is_circular)
        : key === 'highrisk' ? state.nodes.some((n) => n.__risk === 'High')
        : key === 'medrisk' ? state.nodes.some((n) => n.__risk === 'Medium')
        : key === 'lowrisk' ? state.nodes.some((n) => n.__risk === 'Low')
        : state.nodes.some((n) => n.__flags[key]);
      if (!present) row.classList.add('absent');
      legendPanel.appendChild(row);
    });

    legendPanel.appendChild(sectionHead(state.mode === 'nexus' ? 'Relationships (arrows point down)' : 'Money flow (left → right)'));
    edgeTypesFor(state.mode).forEach((et) => {
      const present = state.edges.some((e) => edgeClassOf(e) === et);
      const row = legendRow(() => edgeSample(et), edgeLabelText(et), () => {
        state.edgeOn[et] = state.edgeOn[et] === false ? true : false; row.classList.toggle('off', state.edgeOn[et] === false); clearSelection(); applyFilter();
      }, (on) => highlightEdge(et, on));
      if (!present) row.classList.add('absent');
      legendPanel.appendChild(row);
    });
  }
  function edgeLabelText(et) {
    const spec = EDGE_TYPES[et];
    if (state.mode === 'nexus') return spec.word + (spec.weighted ? ' (thickness = %)' : '') + (spec.context ? ' · context' : '');
    if (et === 'flow') return 'sends funds (thickness = amount)';
    if (et === 'flow_peel') return 'peel-chain hop';
    if (et === 'flow_hot') return 'critical-risk hop (95)';
    return spec.word;
  }

  function sectionHead(txt) { return H('div', { class: 'frisg-lsec' }, txt); }
  function legendRow(makeSw, label, onClick, onHover) {
    const sw = S('svg', { width: 34, height: 30, viewBox: '-17 -15 34 30', class: 'frisg-lsw' });
    sw.appendChild(makeSw());
    const row = H('div', { class: 'frisg-lrow' + (onClick ? ' clickable' : '') }, [sw, H('span', { class: 'frisg-ltext' }, label)]);
    if (onClick) row.addEventListener('click', onClick);
    if (onHover) { row.addEventListener('mouseenter', () => onHover(true)); row.addEventListener('mouseleave', () => onHover(false)); }
    return row;
  }
  function miniGlyph(type, opts) { return drawGlyph(type, 9, opts); }
  function edgeSample(et) {
    const spec = EDGE_TYPES[et];
    const g = S('g', {});
    const col = spec.color;
    const w = spec.weighted ? 4 : 2.4;
    const ln = S('line', { x1: -13, y1: 0, x2: 9, y2: 0, stroke: col, 'stroke-width': w, 'stroke-linecap': 'round', 'marker-end': 'url(#' + markerId(spec.head, et) + ')' });
    if (spec.dash) ln.setAttribute('stroke-dasharray', spec.dash);
    g.appendChild(ln);
    return g;
  }

  function highlightType(t, on) {
    Object.keys(state.nodeEls).forEach((id) => {
      const rec = state.nodeEls[id];
      if (rec.node.type === t) rec.g.setAttribute('filter', on ? 'url(#frisg-glow)' : (state.selected === id ? 'url(#frisg-glow)' : ''));
      else if (on) rec.g.setAttribute('opacity', 0.15);
    });
    if (!on && !state.selected) applyFilter();
  }
  function highlightFlag(key, on) {
    Object.keys(state.nodeEls).forEach((id) => {
      const rec = state.nodeEls[id], n = rec.node;
      const match = key === 'circ' ? false : key === 'highrisk' ? n.__risk === 'High' : key === 'medrisk' ? n.__risk === 'Medium' : key === 'lowrisk' ? n.__risk === 'Low' : n.__flags[key];
      if (on) rec.g.setAttribute('opacity', match ? 1 : 0.14);
    });
    if (key === 'circ') state.edgeEls.forEach((er) => { if (er.e.is_circular) er.el.setAttribute('opacity', on ? 1 : 0.72); });
    if (!on && !state.selected) applyFilter();
  }
  function highlightEdge(et, on) {
    state.edgeEls.forEach((er) => {
      if (er.cls === et) { er.el.setAttribute('opacity', on ? 0.95 : (EDGE_TYPES[et].context ? 0.3 : 0.72)); er.lbl.setAttribute('opacity', on ? 1 : 0); }
      else if (on) er.el.setAttribute('opacity', 0.05);
    });
    if (!on && !state.selected) applyFilter();
  }

  /* =================== FILTER PANEL (presets that answer the question) =================== */
  function renderFilterPanel() {
    clear(filterPanel);
    filterPanel.appendChild(H('div', { class: 'frisg-panel-h' }, 'Presets — one click to the answer'));
    const presets = state.mode === 'nexus'
      ? [['Show ultimate owners', () => soloFlag('ubo')],
         ['Offshore & nominee fronts', () => multiSolo(['offshore', 'nominee'])],
         ['Circular ownership loops', () => showCircular()],
         ['Everything', () => doReset()]]
      : [['Path through mixer', () => focusMixers()],
         ['Critical-risk hops', () => showHotEdges()],
         ['Exchanges (cash-out)', () => soloType('exchange')],
         ['Full trace', () => doReset()]];
    const wrap = H('div', { class: 'frisg-presets' });
    presets.forEach((p) => { wrap.appendChild(H('button', { class: 'frisg-preset', type: 'button', onclick: p[1] }, p[0])); });
    filterPanel.appendChild(wrap);
    if (state.mode === 'nexus') {
      const lbl = H('label', { class: 'frisg-check' });
      const cb = H('input', { type: 'checkbox' }); cb.checked = state.contextEdges;
      cb.addEventListener('change', () => { state.contextEdges = cb.checked; applyFilter(); });
      lbl.appendChild(cb); lbl.appendChild(H('span', {}, 'Show governance context (directors / agents)'));
      filterPanel.appendChild(lbl);
    }
  }
  function soloFlag(f) { clearSelection(); Object.keys(NODE_FLAGS).forEach((k) => { state.flagOn[k] = k === f ? 'solo' : true; }); applyFilter(); fit(); }
  function multiSolo(fs) { clearSelection(); Object.keys(NODE_FLAGS).forEach((k) => { state.flagOn[k] = fs.indexOf(k) >= 0 ? 'solo' : true; }); applyFilter(); fit(); }
  function soloType(t) { clearSelection(); (state.mode === 'nexus' ? NEXUS_TYPES : CHAIN_TYPES).forEach((x) => { state.typeOn[x] = x === t; }); applyFilter(); fit(); }
  function showCircular() {
    clearSelection(); applyFilter();
    const involved = {}; state.edges.forEach((e) => { if (e.is_circular) { involved[e.source] = 1; involved[e.target] = 1; } });
    Object.keys(state.nodeEls).forEach((id) => { state.nodeEls[id].g.setAttribute('opacity', involved[id] ? 1 : 0.1); });
    state.edgeEls.forEach((er) => { er.el.setAttribute('opacity', er.e.is_circular ? 1 : 0.05); if (er.e.is_circular) er.el.setAttribute('stroke-width', 3); });
    zoomToNodes(Object.keys(involved));
  }
  function focusMixers() {
    const ids = state.nodes.filter((n) => n.type === 'mixer').map((n) => n.id);
    const keep = {};
    ids.forEach((id) => { keep[id] = 1; const c = chainFrom(id); Object.keys(c.up).forEach((k) => { keep[k] = 1; }); Object.keys(c.down).forEach((k) => { keep[k] = 1; }); });
    clearSelection();
    Object.keys(state.nodeEls).forEach((nid) => { state.nodeEls[nid].g.setAttribute('opacity', keep[nid] ? 1 : 0.1); });
    state.edgeEls.forEach((er) => { er.el.setAttribute('opacity', keep[er.src] && keep[er.tgt] ? 0.95 : 0.05); });
    zoomToNodes(Object.keys(keep));
  }
  function showHotEdges() {
    clearSelection(); applyFilter();
    const keep = {};
    state.edgeEls.forEach((er) => { if (er.e.risk >= 95) { keep[er.src] = 1; keep[er.tgt] = 1; } });
    Object.keys(state.nodeEls).forEach((id) => { state.nodeEls[id].g.setAttribute('opacity', keep[id] ? 1 : 0.12); });
    state.edgeEls.forEach((er) => { const hot = er.e.risk >= 95; er.el.setAttribute('opacity', hot ? 1 : 0.05); er.lbl.setAttribute('opacity', hot ? 1 : 0); });
    zoomToNodes(Object.keys(keep));
  }

  /* =================== DETAIL PANEL =================== */
  function renderDetail(id, chain) {
    clear(detailPanel);
    if (!id) {
      detailPanel.appendChild(H('div', { class: 'frisg-panel-h' }, 'Details'));
      detailPanel.appendChild(H('div', { class: 'frisg-panel-sub' }, 'Click any node to trace its up/downstream chain, open its full record, and see its stats.'));
      return;
    }
    const n = state.idmap[id];
    const head = H('div', { class: 'frisg-dhead' });
    const sw = S('svg', { width: 40, height: 36, viewBox: '-20 -18 40 36' }); sw.appendChild(drawGlyph(n.type, 11, { flags: n.__flags, risk: n.__risk }));
    head.appendChild(sw);
    head.appendChild(H('div', {}, [H('div', { class: 'frisg-dtitle' }, n.label), H('div', { class: 'frisg-dsub' }, (NODE_TYPES[n.type] ? NODE_TYPES[n.type].label : n.type))]));
    detailPanel.appendChild(head);

    const rows = [];
    if (state.mode === 'nexus') {
      rows.push(['ID', n.id]);
      rows.push(['Jurisdiction', n.jurisdiction || '—']);
      rows.push(['Status', n.status || '—']);
      rows.push(['Secrecy score', n.secrecy != null ? n.secrecy + ' / 100' : '—']);
      const flags = []; if (n.is_ubo) flags.push('UBO'); if (n.is_offshore) flags.push('Offshore'); if (n.is_nominee) flags.push('Nominee'); if (n.is_dormant) flags.push('Dormant');
      rows.push(['Flags', flags.length ? flags.join(', ') : 'none']);
      rows.push(['Owned/controlled by', (state.adjUp[id] || []).length]);
      rows.push(['Owns/controls', (state.adjDown[id] || []).length]);
    } else {
      rows.push(['ID', n.id]);
      rows.push(['Risk', n.risk || '—']);
      rows.push(['Cluster', n.cluster || '—']);
      const inc = state.edges.filter((e) => e.target === id);
      const out = state.edges.filter((e) => e.source === id);
      rows.push(['Received', fmtAmount(inc.reduce((a, e) => a + (e.amount || 0), 0))]);
      rows.push(['Sent', fmtAmount(out.reduce((a, e) => a + (e.amount || 0), 0))]);
      rows.push(['First seen at hop', inc.length ? Math.min.apply(null, inc.map((e) => e.hop)) : 0]);
    }
    const tbl = H('div', { class: 'frisg-drows' });
    rows.forEach((r) => { tbl.appendChild(H('div', { class: 'frisg-drow' }, [H('span', { class: 'frisg-dk' }, r[0]), H('span', { class: 'frisg-dv' }, String(r[1]))])); });
    detailPanel.appendChild(tbl);

    if (chain) {
      const up = Object.keys(chain.up).length, down = Object.keys(chain.down).length;
      const note = state.mode === 'nexus'
        ? 'Highlighted: ' + up + ' owner(s) upstream, ' + down + ' entity(ies) downstream.'
        : 'Highlighted: ' + up + ' source(s) upstream, ' + down + ' destination(s) downstream in the flow.';
      detailPanel.appendChild(H('div', { class: 'frisg-dnote' }, note));
    }
    detailPanel.appendChild(H('button', { class: 'frisg-preset', type: 'button', onclick: () => { clearSelection(); fit(); } }, 'Clear selection'));
  }

  /* =================== MINIMAP =================== */
  function drawMinimap() {
    clear(miniG);
    const b = contentBounds();
    const r = rectOf(mini, 168, 118);
    const mw = r.width || 150, mh = r.height || 110;
    const s = Math.min(mw / b.w, mh / b.h);
    miniSvg.setAttribute('viewBox', '0 0 ' + mw + ' ' + mh);
    const g = S('g', { transform: 'translate(' + ((mw - b.w * s) / 2) + ',' + ((mh - b.h * s) / 2) + ') scale(' + s + ')' });
    state.edgeEls.forEach((er) => {
      const sN = state.idmap[er.src], tN = state.idmap[er.tgt];
      if (!sN || !tN) return;
      g.appendChild(S('line', { x1: sN.__x, y1: sN.__y, x2: tN.__x, y2: tN.__y, stroke: 'rgba(138,160,189,.3)', 'stroke-width': 1 / s }));
    });
    state.nodes.forEach((n) => {
      if (n.__x == null) return;
      const col = (NODE_TYPES[n.type] || {}).fill || C.muted;
      g.appendChild(S('circle', { cx: n.__x, cy: n.__y, r: (n.type === 'mixer' ? 8 : 5) / s, fill: col }));
    });
    miniG.appendChild(g);
    miniG.__s = s; miniG.__ox = (mw - b.w * s) / 2; miniG.__oy = (mh - b.h * s) / 2;
    updateMiniView();
  }
  function updateMiniView() {
    if (!miniG.__s) return;
    const s = miniG.__s;
    const vx = -state.tx / state.scale, vy = -state.ty / state.scale;
    const vw = state.W / state.scale, vh = state.Hh / state.scale;
    miniView.setAttribute('x', miniG.__ox + vx * s);
    miniView.setAttribute('y', miniG.__oy + vy * s);
    miniView.setAttribute('width', Math.max(6, vw * s));
    miniView.setAttribute('height', Math.max(6, vh * s));
  }

  /* =================== PLAYBACK (Chain-Link money advancing hop-by-hop) ===================
   * Clean state machine. Requirements:
   *   (a) clicking the speed button changes speed IMMEDIATELY during playback;
   *   (b) Replay ALWAYS restarts the cycle from hop 0.
   * Playback is a no-op when timer APIs are unavailable (e2e / non-browser), and it
   * never auto-runs at mount — only user button clicks start it. */
  function timersAvailable() { return typeof setInterval === 'function' && typeof clearInterval === 'function'; }
  function maxHopIndex() {
    let m = 0; state.edgeEls.forEach((er) => { if (isFinite(er.hop) && er.hop > m) m = er.hop; }); return m;
  }
  function stopTimer() { if (state.play.timer != null) { try { clearInterval(state.play.timer); } catch (_e) {} state.play.timer = null; } }
  function resetPlayState() { stopTimer(); state.play.ptr = 0; }
  function currentDelay() { const sp = state.play.speeds; return sp[state.play.speedIdx % sp.length]; }

  // Reveal the flow up to `hop`: edges with hop<=ptr full, later edges faint; nodes
  // touched by a revealed edge (plus true sources) at full strength, the rest dimmed.
  function renderPlayFrame() {
    if (state.mode !== 'chain') return;
    const ptr = state.play.ptr;
    const shown = {};
    state.nodes.forEach((n) => { if (n.__hop === 0) shown[n.id] = 1; });
    state.edgeEls.forEach((er) => {
      const on = er.hop <= ptr;
      if (on) { shown[er.src] = 1; shown[er.tgt] = 1; }
      const spec = EDGE_TYPES[er.cls] || {};
      er.el.setAttribute('opacity', on ? (spec.context ? 0.34 : 0.9) : 0.05);
      er.lbl.setAttribute('opacity', 0);
    });
    Object.keys(state.nodeEls).forEach((id) => {
      const rec = state.nodeEls[id];
      rec.g.setAttribute('opacity', shown[id] ? 1 : 0.12);
      rec.g.setAttribute('filter', '');
    });
    updatePlayUI();
  }
  function updatePlayUI() {
    const playing = state.play.timer != null;
    btnPlay.replaceChildren(document.createTextNode(playing ? '❙❙ Pause' : '▶ Play'));
    btnPlay.classList.toggle('on', playing);
    btnSpeed.replaceChildren(document.createTextNode(['1×', '2×', '5×'][state.play.speedIdx % 3]));
    const maxH = maxHopIndex();
    if (scrub && scrub.setAttribute) {
      scrub.setAttribute('max', String(Math.max(1, maxH)));
      scrub.value = String(clamp(state.play.ptr, 0, maxH));
    }
    if (hopReadout) hopReadout.replaceChildren(document.createTextNode('hop ' + clamp(state.play.ptr, 0, maxH) + ' / ' + maxH));
  }
  function tick() {
    const maxH = maxHopIndex();
    state.play.ptr++;
    renderPlayFrame();
    if (state.play.ptr >= maxH) { stopTimer(); updatePlayUI(); }
  }
  function play() {
    if (state.mode !== 'chain') return;
    state.selected = null;
    // reduced-motion or no timer APIs: reveal the final frame instantly, no animation.
    if (state.reduceMotion || !timersAvailable()) {
      state.play.ptr = maxHopIndex(); renderPlayFrame(); return;
    }
    // if we're already at/after the end, a fresh Play should restart from the beginning
    if (state.play.ptr >= maxHopIndex()) state.play.ptr = 0;
    stopTimer();
    renderPlayFrame();
    state.play.timer = setInterval(tick, currentDelay());
    updatePlayUI();
  }
  function pause() { stopTimer(); updatePlayUI(); }
  // REPLAY: always reset to hop 0 and play through from the start.
  function replay() {
    if (state.mode !== 'chain') return;
    stopTimer();
    state.selected = null;
    state.play.ptr = 0;
    renderPlayFrame();
    // reduced-motion or no timers: step straight to the fully-revealed final frame.
    if (state.reduceMotion || !timersAvailable()) { state.play.ptr = maxHopIndex(); renderPlayFrame(); return; }
    state.play.timer = setInterval(tick, currentDelay());
    updatePlayUI();
  }
  // SPEED: cycle 1x -> 2x -> 5x; if currently playing, restart the interval at the new
  // delay IMMEDIATELY (preserving ptr) so the change is felt without waiting.
  function cycleSpeed() {
    state.play.speedIdx = (state.play.speedIdx + 1) % state.play.speeds.length;
    if (state.play.timer != null && timersAvailable()) {
      stopTimer();
      state.play.timer = setInterval(tick, currentDelay());
    }
    updatePlayUI();
  }
  function setSpeed(mult) {
    // mult may be a multiplier (1/2/5) or a delay in ms; map to nearest speed index.
    const speeds = state.play.speeds;
    let idx = 0;
    if (mult === 1 || mult === 2 || mult === 5) idx = mult === 1 ? 0 : mult === 2 ? 1 : 2;
    else { // treat as delay ms: pick closest
      let best = Infinity;
      speeds.forEach((d, i) => { const diff = Math.abs(d - Number(mult)); if (diff < best) { best = diff; idx = i; } });
    }
    state.play.speedIdx = idx;
    if (state.play.timer != null && timersAvailable()) { stopTimer(); state.play.timer = setInterval(tick, currentDelay()); }
    updatePlayUI();
  }

  /* =================== DEFS / MARKERS =================== */
  function markerId(head, cls) { return 'frisg-mk-' + head + '-' + String(cls).replace(/[^a-z0-9]/gi, ''); }
  function buildDefs(defs) {
    _hatchId = 'frisg-hatch';
    const pat = S('pattern', { id: _hatchId, width: 5, height: 5, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
    pat.appendChild(S('rect', { width: 5, height: 5, fill: 'transparent' }));
    pat.appendChild(S('line', { x1: 0, y1: 0, x2: 0, y2: 5, stroke: 'rgba(10,13,19,.55)', 'stroke-width': 2 }));
    defs.appendChild(pat);
    const f = S('filter', { id: 'frisg-glow', x: '-60%', y: '-60%', width: '220%', height: '220%' });
    f.appendChild(S('feDropShadow', { dx: 0, dy: 0, stdDeviation: 3.4, 'flood-color': C.accent, 'flood-opacity': 0.95 }));
    defs.appendChild(f);
    _builtMarkers = {};
    const specs = EDGE_TYPES;
    Object.keys(specs).forEach((cls) => { makeMarker(defs, specs[cls].head, cls, specs[cls].color); });
    makeMarker(defs, 'solid', 'circ', CIRC_COLOR);
  }
  function makeMarker(defs, head, cls, color) {
    const id = markerId(head, cls);
    if (_builtMarkers[id]) return; _builtMarkers[id] = 1;
    const m = S('marker', { id: id, viewBox: '0 0 12 12', refX: 10, refY: 6, markerWidth: 8, markerHeight: 8, orient: 'auto-start-reverse' });
    if (head === 'open') m.appendChild(S('path', { d: 'M2,2 L10,6 L2,10', fill: 'none', stroke: color, 'stroke-width': 1.6 }));
    else if (head === 'double') { m.setAttribute('refX', 11); m.appendChild(S('path', { d: 'M1,2 L6,6 L1,10 M5,2 L10,6 L5,10', fill: color })); }
    else if (head === 'diamond') m.appendChild(S('path', { d: 'M2,6 L6,2 L10,6 L6,10 Z', fill: color }));
    else if (head === 'hollow') m.appendChild(S('path', { d: 'M2,2 L10,6 L2,10 Z', fill: C.bg, stroke: color, 'stroke-width': 1.4 }));
    else m.appendChild(S('path', { d: 'M2,2 L10,6 L2,10 Z', fill: color }));
    defs.appendChild(m);
  }

  /* =================== formatting =================== */
  function fmtAmount(v) {
    if (v == null || !isFinite(v)) return '—';
    if (v >= 1e9) return (v / 1e9).toFixed(v >= 1e10 ? 0 : 1) + 'B';
    if (v >= 1e6) return (v / 1e6).toFixed(0) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(0) + 'K';
    return String(v);
  }
  function truncate(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  /* =================== reset / init =================== */
  function doReset() {
    state.spotlight = null; // Reset also clears any finding-chip / red-flag spotlight
    state.chipCat = null;
    loadData();
    render();
    renderLegend();
    renderFilterPanel();
    renderDetail(null);
    updatePlayUI();
  }

  // Background deselect (a click on empty canvas) is resolved on pointerup in the
  // pan handler's endDrag(), alongside node selection -- one code path for both,
  // so a drag never triggers either.

  /* playbar only makes sense for the flow (chainlink) mode */
  if (state.mode !== 'chain') playbar.style.display = 'none';

  /* resize handling */
  let ro = null;
  if (typeof ResizeObserver !== 'undefined') {
    try { ro = new ResizeObserver(() => { stageSize(); clampTransform(); applyTransform(); drawMinimap(); }); ro.observe(stageWrap); } catch (_e) { ro = null; }
  } else if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('resize', () => { stageSize(); clampTransform(); applyTransform(); drawMinimap(); });
  }

  /* boot */
  loadData();
  render();
  renderLegend();
  renderFilterPanel();
  renderDetail(null);
  updatePlayUI();

  /* ---- public handle ---- */
  return {
    setData(next) {
      next = next || {};
      if (Array.isArray(next.nodes)) state.srcNodes = next.nodes;
      if (Array.isArray(next.edges)) state.srcEdges = next.edges;
      if (next.mode) state.mode = (next.mode === 'chainlink' || next.mode === 'chain') ? 'chain' : 'nexus';
      playbar.style.display = state.mode === 'chain' ? '' : 'none';
      doReset();
    },
    fit: fit,
    reset: doReset,
    play: play,
    pause: pause,
    replay: replay,
    setSpeed: setSpeed,
    select: (id) => { selectNode(id); },
    highlightPath: (ids, color) => { try { highlightPath(ids, color); } catch (_e) {} },
    spotlightFlagged: (on) => { try { spotlightFlagged(on); } catch (_e) {} },
    clearSpotlight: () => { try { clearSpotlight(); } catch (_e) {} },
    destroy() { stopTimer(); if (ro) { try { ro.disconnect(); } catch (_e) {} } clear(container); },
  };
}

/* =================== STYLE =================== */
let _styled = false;
function injectStyle() {
  if (_styled) return; _styled = true;
  const css = [
    '.frisg-root{display:flex;flex-direction:column;width:100%;height:100%;min-height:560px;background:' + C.bg + ';color:' + C.text + ';font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:13px;box-sizing:border-box;overflow:hidden;border:1px solid ' + C.border + ';border-radius:12px}',
    '.frisg-root *{box-sizing:border-box}',
    '.frisg-body{display:flex;flex:1 1 auto;min-height:0}',
    '.frisg-stagewrap{position:relative;flex:1 1 auto;min-width:0;overflow:hidden;background:radial-gradient(1200px 700px at 40% 0%,#0d1119 0%,' + C.bg + ' 70%)}',
    '.frisg-svg{display:block;width:100%;height:100%;cursor:grab;touch-action:pan-y}',
    '.frisg-side{flex:0 0 306px;width:306px;border-left:1px solid ' + C.border + ';background:' + C.surface + ';overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:10px}',
    '@media(max-width:900px){.frisg-side{flex-basis:250px;width:250px}}',
    '.frisg-panel{background:' + C.surface2 + ';border:1px solid ' + C.border + ';border-radius:10px;padding:10px}',
    '.frisg-panel-h{font-weight:700;font-size:12.5px;margin-bottom:3px;letter-spacing:.01em}',
    '.frisg-panel-sub{color:' + C.muted + ';font-size:11px;line-height:1.4;margin-bottom:6px}',
    '.frisg-lsec{color:' + C.muted + ';font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin:9px 0 3px}',
    '.frisg-lrow{display:flex;align-items:center;gap:7px;padding:3px 5px;border-radius:6px}',
    '.frisg-lrow.clickable{cursor:pointer}',
    '.frisg-lrow.clickable:hover{background:' + C.surface + '}',
    '.frisg-lsw{flex:0 0 auto}',
    '.frisg-ltext{font-size:12px;line-height:1.25}',
    '.frisg-lrow.off{opacity:.4}',
    '.frisg-lrow.off .frisg-ltext{text-decoration:line-through}',
    '.frisg-lrow.solo{background:rgba(77,141,240,.14);outline:1px solid ' + C.accent + '}',
    '.frisg-lrow.absent{opacity:.32;filter:grayscale(1)}',
    '.frisg-lrow.absent .frisg-ltext::after{content:" (none here)";color:' + C.muted + ';font-size:10px}',
    '.frisg-presets{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}',
    '.frisg-preset{appearance:none;border:1px solid ' + C.border + ';background:' + C.surface + ';color:' + C.text + ';padding:6px 10px;border-radius:7px;font-size:11.5px;cursor:pointer;font-weight:600}',
    '.frisg-preset:hover{border-color:' + C.accent + ';color:' + C.accent + '}',
    '.frisg-check{display:flex;align-items:center;gap:7px;font-size:11.5px;color:' + C.muted + ';margin-top:6px;cursor:pointer}',
    '.frisg-overlay{position:absolute;top:12px;left:12px;max-width:min(52%,430px);pointer-events:none;z-index:5}',
    '.frisg-ov-title{font-size:15px;font-weight:800;line-height:1.25;color:' + C.text + ';text-shadow:0 1px 8px ' + C.bg + '}',
    '.frisg-ov-q{font-size:12px;color:' + C.muted + ';margin-top:4px;line-height:1.4;text-shadow:0 1px 6px ' + C.bg + '}',
    '.frisg-ov-how{margin-top:8px;background:rgba(18,22,31,.82);border:1px solid ' + C.border + ';border-radius:9px;padding:7px 9px;display:flex;flex-direction:column;gap:3px;backdrop-filter:blur(2px)}',
    '.frisg-ov-howhead{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:2px}',
    '.frisg-ov-howtitle{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:' + C.muted + '}',
    '.frisg-ov-close{pointer-events:auto;cursor:pointer;flex:0 0 auto;width:20px;height:20px;display:flex;align-items:center;justify-content:center;border:1px solid ' + C.border + ';border-radius:6px;background:' + C.surface + ';color:' + C.muted + ';font-size:15px;line-height:1;font-weight:700}',
    '.frisg-ov-close:hover{border-color:' + C.high + ';color:' + C.high + '}',
    '.frisg-ov-close:focus-visible{outline:2px solid ' + C.accent + ';outline-offset:1px}',
    '.frisg-ov-howrow{display:flex;align-items:center;gap:8px;font-size:11.5px;color:' + C.text + '}',
    '.frisg-ov-sw{flex:0 0 auto}',
    '.frisg-ov-keypill{pointer-events:auto;cursor:pointer;display:inline-flex;align-items:center;gap:6px;margin-top:8px;background:rgba(18,22,31,.9);border:1px solid ' + C.border + ';border-radius:999px;padding:5px 12px;font-size:11.5px;font-weight:700;color:' + C.text + '}',
    '.frisg-ov-keypill:hover{border-color:' + C.accent + ';color:' + C.accent + '}',
    '.frisg-ov-keypill:focus-visible{outline:2px solid ' + C.accent + ';outline-offset:1px}',
    '.frisg-ov-keyico{font-size:13px;line-height:1}',
    '.frisg-ov-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;pointer-events:auto}',
    '.frisg-chip{background:' + C.surface2 + ';border:1px solid ' + C.border + ';border-radius:999px;padding:4px 10px;font-size:11.5px;font-weight:700;color:' + C.text + ';cursor:pointer;user-select:none}',
    '.frisg-chip:hover{border-color:' + C.accent + ';color:' + C.accent + '}',
    '.frisg-chip:focus-visible{outline:2px solid ' + C.accent + ';outline-offset:1px}',
    '.frisg-chip.active{background:' + C.accent + ';border-color:' + C.accent + ';color:#fff}',
    '.frisg-chip.active:hover{color:#fff}',
    '.frisg-chip.empty{opacity:.5}',
    '.frisg-nav{position:absolute;top:12px;right:12px;display:flex;flex-direction:column;gap:5px;z-index:6}',
    '.frisg-navbtn{appearance:none;width:34px;height:34px;border:1px solid ' + C.border + ';background:' + C.surface + ';color:' + C.text + ';border-radius:8px;font-size:17px;cursor:pointer;line-height:1;display:flex;align-items:center;justify-content:center;font-weight:700}',
    '.frisg-navbtn.wide{width:auto;padding:0 12px;font-size:12px}',
    '.frisg-navbtn:hover{border-color:' + C.accent + ';color:' + C.accent + '}',
    '.frisg-playbar{position:absolute;bottom:12px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:6px;z-index:6;background:rgba(10,13,19,.72);border:1px solid ' + C.border + ';border-radius:10px;padding:5px;max-width:min(92%,560px)}',
    '.frisg-scrub{flex:1 1 120px;min-width:90px;accent-color:' + C.accent + ';cursor:pointer;height:4px}',
    '.frisg-hopread{font-size:11.5px;font-weight:700;color:' + C.muted + ';white-space:nowrap;font-variant-numeric:tabular-nums;min-width:64px;text-align:right}',
    '.frisg-viewtable{position:absolute;top:12px;right:64px;z-index:7}',
    '.frisg-viewtable button{appearance:none;border:1px solid ' + C.border + ';background:rgba(18,22,31,.9);color:' + C.text + ';font-size:11.5px;font-weight:700;padding:5px 10px;border-radius:7px;cursor:pointer}',
    '.frisg-viewtable button:hover{border-color:' + C.accent + ';color:' + C.accent + '}',
    '.frisg-playbtn{appearance:none;border:1px solid ' + C.border + ';background:' + C.surface + ';color:' + C.text + ';padding:6px 12px;border-radius:7px;font-size:12px;cursor:pointer;font-weight:700;line-height:1}',
    '.frisg-playbtn:hover{border-color:' + C.accent + ';color:' + C.accent + '}',
    '.frisg-playbtn.on{background:' + C.accent + ';color:#fff;border-color:' + C.accent + '}',
    '.frisg-mini{position:absolute;bottom:12px;right:12px;width:168px;height:118px;background:rgba(10,13,19,.82);border:1px solid ' + C.border + ';border-radius:9px;overflow:hidden;z-index:6}',
    '.frisg-minisvg{display:block;width:100%;height:100%;cursor:pointer}',
    '.frisg-hint{position:absolute;bottom:14px;left:14px;font-size:11px;color:' + C.muted + ';background:rgba(18,22,31,.7);border:1px solid ' + C.border + ';padding:4px 9px;border-radius:7px;transition:opacity .2s;z-index:5}',
    '.frisg-tierlabel{pointer-events:none;text-transform:uppercase}',
    '.frisg-dhead{display:flex;align-items:center;gap:10px;margin-bottom:8px}',
    '.frisg-dtitle{font-weight:700;font-size:13.5px}',
    '.frisg-dsub{color:' + C.muted + ';font-size:11px}',
    '.frisg-drows{display:flex;flex-direction:column;gap:2px}',
    '.frisg-drow{display:flex;justify-content:space-between;gap:10px;font-size:12px;padding:3px 0;border-bottom:1px solid rgba(35,42,54,.5)}',
    '.frisg-dk{color:' + C.muted + '}',
    '.frisg-dv{font-weight:600;text-align:right}',
    '.frisg-dnote{margin-top:8px;font-size:11.5px;color:' + C.teal + ';background:rgba(55,194,180,.08);border:1px solid rgba(55,194,180,.3);border-radius:7px;padding:6px 8px;line-height:1.4}',
    '.frisg-detail .frisg-preset{margin-top:9px;width:100%}',
    '.frisg-node{transition:opacity .15s}',
    '.frisg-edge{transition:opacity .15s}',
    /* the roving focus ring is toggled programmatically (setKbFocus); also surface it
     * for native :focus-visible so a real Tab landing on a node is visible too. */
    '.frisg-nodehit:focus{outline:none}',
    '.frisg-node:focus-within .frisg-focusring{opacity:1}',
    /* reduced-motion: drop the opacity transitions so nothing animates */
    '.frisg-reduce-motion .frisg-node,.frisg-reduce-motion .frisg-edge{transition:none}',
    '.frisg-srtable{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}',
    /* responsive: stack the side panel below the stage on narrow screens (mirrors the map) */
    '@media(max-width:820px){.frisg-body{flex-direction:column}.frisg-side{flex:1 1 auto;width:auto;border-left:none;border-top:1px solid ' + C.border + ';max-height:none}.frisg-stagewrap{min-height:420px}}',
  ].join('\n');
  const st = document.createElement('style');
  st.setAttribute('data-frisg', '1');
  st.appendChild(document.createTextNode(css));
  (document.head || document.documentElement).appendChild(st);
}
