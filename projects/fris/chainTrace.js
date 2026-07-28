// FRIS Chain-Link Transaction Graph — IN-PAGE entity/cluster flow renderer.
//
// COMPLETE REWRITE. The previous renderer styled `.clv-root{position:absolute;inset:0}`
// and was mounted into an UNPOSITIONED div, so it escaped to the viewport and hid the
// FRIS sidebar / top-bar / breadcrumb — an inescapable closed system. This version is a
// NORMAL in-page component: it lives inside a BOUNDED, relatively-positioned card in the
// `.page` content area (like every other FRIS view). The sidebar, top-bar and breadcrumb
// stay visible, the page scrolls normally, and the user can navigate away at any time.
//   - NO position:fixed. NO position:absolute;inset:0 escaping to the viewport.
//   - NO 100vw / 100vh. The graph host is `position:relative; overflow:hidden` with a
//     bounded, responsive height (~600px). Overlays are absolute *relative to that host*,
//     never to the viewport — exactly the pattern the working `flowGraph` (graph.js) uses.
//
// VISUAL DESIGN (grounded in Chainalysis Reactor, TRM Labs, Elliptic Investigator,
// MetaSleuth and Breadcrumbs — see _design/reviews/chainlink-research.md):
//   Reactor + MetaSleuth trace "first deposit -> final cash-out" over an ENTITY graph
//   (addresses clustered into meaningful nodes), not a 58-hop hairball. So we AGGREGATE
//   the raw hops into a handful of meaningful nodes laid out left->right in tiers:
//     Source  ->  peel-relay group(s)  ->  the 2 Mixers + 3 Bridges (landmark gates)
//             ->  Exchanges / Merchants / Deposits (cash-out clusters).
//   Directed edges are labelled with amounts (width = log amount). The high-risk (risk 95)
//   path is emphasised in red and pre-lit — TRM-style risk-on-node. A findings header
//   states the story in words; a side detail panel shows the clicked node; the underlying
//   transactions render in a NORMAL table below (built by the caller).
//
// SCOPE: drives ONLY the Chain-Link Transaction Graph. The Sovereign Nexus `flowGraph`
// and the jurisdiction map are untouched.
//
// e2e-SAFE: the strict DOM shim (scripts/e2e.mjs) has no real getBBox / matchMedia /
// style.setProperty and a bare-object `style`. This module never calls getBBox, never
// calls style.setProperty, guards getBoundingClientRect with numeric fallbacks, and sets
// every style property individually so assignment onto the shim's plain object is safe.
//
// Entry:  chainTrace(container, { nodes, edges, onNodeClick, traceId, findings })
// Returns: { model, focus, clearFocus, reset, fit, destroy }
'use strict';

const SVGNS = 'http://www.w3.org/2000/svg';

/* ---- tiny DOM helpers (SVG + HTML), e2e-shim tolerant ------------------ */
function S(tag, attrs, kids) {
  const e = document.createElementNS(SVGNS, tag);
  if (attrs) { for (const k in attrs) { if (!has(attrs, k)) continue; const v = attrs[k]; if (v == null) continue; e.setAttribute(k, v); } }
  appendKids(e, kids); return e;
}
function H(tag, attrs, kids) {
  const e = document.createElement(tag);
  if (attrs) {
    for (const k in attrs) {
      if (!has(attrs, k)) continue; const v = attrs[k]; if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') setText(e, v);
      else if (k === 'style' && typeof v === 'object') setStyle(e, v);
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
  }
  appendKids(e, kids); return e;
}
function appendKids(e, kids) {
  if (kids == null) return;
  if (!Array.isArray(kids)) kids = [kids];
  for (let i = 0; i < kids.length; i++) {
    const kid = kids[i]; if (kid == null || kid === false) continue;
    e.appendChild(typeof kid === 'string' || typeof kid === 'number' ? document.createTextNode(String(kid)) : kid);
  }
}
function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
function clear(el) { while (el && el.firstChild) el.removeChild(el.firstChild); }
function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
function on(el, ev, fn, opts) { if (el && el.addEventListener) el.addEventListener(ev, fn, opts); }
function setText(el, t) { if (!el) return; try { el.textContent = String(t); } catch (_e) { /* shim */ } }
/* Set styles one property at a time — the e2e shim's `style` is a bare object with no
 * setProperty, so per-key assignment is the only universally safe form. */
function setStyle(el, obj) { if (!el || !el.style) return; for (const s in obj) { if (!has(obj, s)) continue; try { el.style[s] = obj[s]; } catch (_e) { /* shim */ } } }
/* getBoundingClientRect guarded: numeric fallback if absent or zero-size. */
function safeRect(el, fallbackW, fallbackH) {
  let r = null;
  try { if (el && typeof el.getBoundingClientRect === 'function') r = el.getBoundingClientRect(); } catch (_e) { r = null; }
  const w = r && r.width ? r.width : fallbackW;
  const h = r && r.height ? r.height : fallbackH;
  return { width: w, height: h };
}

/* ---- palette (the app's dark-theme CSS variables, mirrored) ------------ */
const C = {
  bg: '#0a0d13', surface: '#12161f', surface2: '#171c26', border: '#232a36',
  text: '#e7edf5', muted: '#8aa0bd', accent: '#4d8df0', teal: '#37c2b4',
  high: '#f0616d', med: '#e5a53b', low: '#46b877',
};
/* Okabe-Ito colour-blind-safe hues; colour is NEVER the only channel. */
const OK = {
  blue: '#0072B2', orange: '#E69F00', green: '#009E73', purple: '#CC79A7',
  grey: '#9aa4b0', vermillion: '#D55E00', sky: '#56B4E9',
};

/* ============================================================
 * MASTER ENCODING — single source of truth for node glyphs AND legend swatches, so a
 * symbol collision is structurally impossible. Every entity type is unique on
 * shape + colour + icon (three redundant channels).
 * ============================================================ */
const NODE_TYPES = {
  source:   { shape: 'circle',  fill: OK.orange,     icon: 'wallet', label: 'Source of funds' },
  peel:     { shape: 'rrect',   fill: '#3aa79c',     icon: 'peel',   label: 'Peel relay (grouped hops)' },
  mixer:    { shape: 'octagon', fill: OK.vermillion, icon: 'blades', label: 'Mixer (hazard gate)', hazard: true },
  bridge:   { shape: 'hexagon', fill: OK.purple,     icon: 'span',   label: 'Bridge (cross-chain)' },
  exchange: { shape: 'rrect',   fill: OK.blue,       icon: 'bank',   label: 'Exchange cash-out' },
  merchant: { shape: 'diamond', fill: OK.green,      icon: 'cart',   label: 'Merchant cash-out' },
  deposit:  { shape: 'scircle', fill: OK.sky,        icon: 'down',   label: 'Deposit cluster' },
  wallet:   { shape: 'circle',  fill: OK.grey,       icon: 'wallet', label: 'Wallet' },
};
/* RISK bands: ring style + square badge + colour (redundant channels). */
const RISK = {
  High:   { col: C.high, ring: 'solid',  label: 'High risk' },
  Medium: { col: C.med,  ring: 'dashed', label: 'Medium risk' },
  Low:    { col: C.low,  ring: 'solid',  label: 'Low risk' },
};

/* ---- shapes / glyphs (shared by nodes AND legend) --------------------- */
function shapePath(shape, r) {
  switch (shape) {
    case 'rrect':   return roundRectPath(-r * 0.92, -r * 0.72, r * 1.84, r * 1.44, r * 0.26);
    case 'diamond': return poly([[0, -r], [r, 0], [0, r], [-r, 0]]);
    case 'hexagon': return regPoly(6, r, -Math.PI / 2);
    case 'octagon': return regPoly(8, r, Math.PI / 8);
    default:        return null; /* circle / scircle drawn as <circle> */
  }
}
function roundRectPath(x, y, w, h, r) {
  return 'M' + (x + r) + ',' + y + ' h' + (w - 2 * r) + ' a' + r + ',' + r + ' 0 0 1 ' + r + ',' + r +
    ' v' + (h - 2 * r) + ' a' + r + ',' + r + ' 0 0 1 ' + (-r) + ',' + r + ' h' + (-(w - 2 * r)) +
    ' a' + r + ',' + r + ' 0 0 1 ' + (-r) + ',' + (-r) + ' v' + (-(h - 2 * r)) +
    ' a' + r + ',' + r + ' 0 0 1 ' + r + ',' + (-r) + ' z';
}
function poly(pts) { return 'M' + pts.map(function (p) { return p[0].toFixed(2) + ',' + p[1].toFixed(2); }).join(' L') + ' Z'; }
function regPoly(n, r, off) { const pts = []; for (let i = 0; i < n; i++) { const a = off + i * 2 * Math.PI / n; pts.push([Math.cos(a) * r, Math.sin(a) * r]); } return poly(pts); }

function drawIcon(icon, r) {
  const g = S('g', { stroke: '#ffffff', 'stroke-width': 1.4, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0.95 });
  const u = r * 0.5;
  switch (icon) {
    case 'blades':
      g.appendChild(S('circle', { cx: 0, cy: 0, r: u * 0.26, fill: '#ffffff' }));
      for (let b = 0; b < 3; b++) { const a = b * 2 * Math.PI / 3 - Math.PI / 2; g.appendChild(S('line', { x1: 0, y1: 0, x2: Math.cos(a) * u * 0.9, y2: Math.sin(a) * u * 0.9, 'stroke-width': 2 })); }
      break;
    case 'bank':
      g.appendChild(S('path', { d: 'M' + (-u * 0.9) + ',' + (-u * 0.15) + ' L0,' + (-u * 0.8) + ' L' + (u * 0.9) + ',' + (-u * 0.15) + ' Z', fill: 'rgba(255,255,255,.16)' }));
      g.appendChild(S('line', { x1: -u * 0.6, y1: -u * 0.15, x2: -u * 0.6, y2: u * 0.65 }));
      g.appendChild(S('line', { x1: 0, y1: -u * 0.15, x2: 0, y2: u * 0.65 }));
      g.appendChild(S('line', { x1: u * 0.6, y1: -u * 0.15, x2: u * 0.6, y2: u * 0.65 }));
      g.appendChild(S('line', { x1: -u * 0.9, y1: u * 0.75, x2: u * 0.9, y2: u * 0.75 }));
      break;
    case 'span':
      g.appendChild(S('path', { d: 'M' + (-u * 0.9) + ',' + (u * 0.35) + ' q' + (u * 0.9) + ',' + (-u * 1.2) + ' ' + (u * 1.8) + ',0' }));
      g.appendChild(S('path', { d: 'M' + (u * 0.45) + ',' + (-u * 0.5) + ' l' + (u * 0.4) + ',' + (u * 0.18) + ' l' + (-u * 0.4) + ',' + (u * 0.2) }));
      break;
    case 'cart':
      g.appendChild(S('path', { d: 'M' + (-u * 0.85) + ',' + (-u * 0.55) + ' h' + (u * 0.32) + ' l' + (u * 0.28) + ',' + (u * 1.0) + ' h' + (u * 0.85) }));
      g.appendChild(S('circle', { cx: u * 0.05, cy: u * 0.8, r: u * 0.14, fill: '#ffffff' }));
      g.appendChild(S('circle', { cx: u * 0.65, cy: u * 0.8, r: u * 0.14, fill: '#ffffff' }));
      break;
    case 'down':
      g.appendChild(S('line', { x1: 0, y1: -u * 0.75, x2: 0, y2: u * 0.55 }));
      g.appendChild(S('path', { d: 'M' + (-u * 0.45) + ',' + (u * 0.1) + ' L0,' + (u * 0.65) + ' L' + (u * 0.45) + ',' + (u * 0.1) }));
      break;
    case 'peel':
      g.appendChild(S('line', { x1: -u * 0.85, y1: -u * 0.25, x2: u * 0.85, y2: -u * 0.25, 'stroke-width': 2 }));
      g.appendChild(S('line', { x1: -u * 0.4, y1: u * 0.35, x2: -u * 0.4, y2: u * 0.75 }));
      g.appendChild(S('line', { x1: u * 0.15, y1: u * 0.35, x2: u * 0.15, y2: u * 0.75 }));
      break;
    case 'wallet':
      g.appendChild(S('rect', { x: -u * 0.85, y: -u * 0.55, width: u * 1.7, height: u * 1.1, rx: 2, fill: 'rgba(255,255,255,.14)' }));
      g.appendChild(S('circle', { cx: u * 0.4, cy: 0, r: u * 0.14, fill: '#ffffff' }));
      break;
  }
  return g;
}

/* colour maths */
function hexToRgb(h) { h = String(h).replace('#', ''); if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join(''); return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) }; }
function rgbToHex(r, g, b) { function p(x) { x = Math.round(clamp(x, 0, 255)).toString(16); return x.length < 2 ? '0' + x : x; } return '#' + p(r) + p(g) + p(b); }
function shade(hex, f) { const c = hexToRgb(hex); return rgbToHex(c.r * f, c.g * f, c.b * f); }

/* Draw a full node/legend glyph: base shape + fill + icon + risk ring + risk badge. */
function drawGlyph(type, r, opts) {
  opts = opts || {};
  const spec = NODE_TYPES[type] || NODE_TYPES.wallet;
  const g = S('g', {});
  const fill = spec.fill, strokeCol = shade(fill, 0.55);
  if (spec.hazard) {
    g.appendChild(S('circle', { cx: 0, cy: 0, r: r * 1.4, fill: 'none', stroke: OK.vermillion, 'stroke-width': 2, 'stroke-dasharray': '3 3', opacity: 0.85 }));
  }
  if (opts.risk && RISK[opts.risk]) {
    const rk = RISK[opts.risk];
    g.appendChild(S('circle', { cx: 0, cy: 0, r: r * 1.22, fill: 'none', stroke: rk.col, 'stroke-width': opts.risk === 'High' ? 2.4 : 1.8, 'stroke-dasharray': rk.ring === 'dashed' ? '3 3' : null, opacity: opts.risk === 'High' ? 0.95 : 0.7 }));
  }
  const d = shapePath(spec.shape, r);
  if (d) g.appendChild(S('path', { d: d, fill: fill, stroke: strokeCol, 'stroke-width': 1.5 }));
  else {
    const rr = spec.shape === 'scircle' ? r * 0.82 : r;
    g.appendChild(S('circle', { cx: 0, cy: 0, r: rr, fill: fill, stroke: strokeCol, 'stroke-width': 1.5 }));
  }
  g.appendChild(drawIcon(spec.icon, r));
  if (opts.risk && RISK[opts.risk]) g.appendChild(riskBadgeGlyph(r, RISK[opts.risk].col));
  return g;
}
function riskBadgeGlyph(r, col) {
  const g = S('g', { transform: 'translate(' + (r * 0.96) + ',' + (r * 0.88) + ')' });
  const s = r * 0.58;
  g.appendChild(S('rect', { x: -s / 2, y: -s / 2, width: s, height: s, rx: s * 0.18, fill: col, stroke: '#0a0d13', 'stroke-width': 1 }));
  return g;
}

/* ---- number formatting ------------------------------------------------ */
function fmtAmt(n) {
  if (n == null) return '';
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(a >= 1e10 ? 1 : 2).replace(/\.0$/, '') + 'B';
  if (a >= 1e6) return (n / 1e6).toFixed(0) + 'M';
  if (a >= 1e3) return (n / 1e3).toFixed(0) + 'K';
  return String(Math.round(n));
}

/* ============================================================
 * MODEL BUILD — turn the raw trace into a small ENTITY graph.
 *
 * The 58 raw peel hops collapse into a handful of meaningful nodes:
 *   - SOURCE (the peel origin)
 *   - PEEL-RELAY groups: runs of consecutive spine hops between landmarks, each
 *     rendered as ONE node carrying the count + volume moved (Reactor/MetaSleuth
 *     entity aggregation — the boring middle, summarised).
 *   - LANDMARK gates: the 2 mixers + 3 bridges that the flow funnels through.
 *   - CASH-OUT clusters: exchanges, merchants and deposit addresses grouped by type,
 *     each with the total volume received and the member count.
 * Edges between these nodes are directed and labelled with aggregate amounts.
 * ============================================================ */
function buildModel(data) {
  const rawNodes = data.nodes, rawEdges = data.edges;
  const nodeById = {}; rawNodes.forEach(function (n) { nodeById[n.id] = n; });
  const outE = {}, inE = {};
  rawEdges.forEach(function (e) { (outE[e.source] = outE[e.source] || []).push(e); (inE[e.target] = inE[e.target] || []).push(e); });

  /* source = a node with out-edges and no in-edges (peel origin) */
  let source = null;
  for (let i = 0; i < rawNodes.length; i++) { const n = rawNodes[i]; if (outE[n.id] && !inE[n.id]) { source = n; break; } }
  if (!source) source = rawNodes[0];

  /* Walk the MAIN FLOW: highest-amount out-edge each hop = the bulk that continues. */
  const spine = [];               /* [{id,node,mainEdge,peelEdge,hop}] */
  const seen = {}; let cur = source.id;
  while (cur && !seen[cur]) {
    seen[cur] = 1;
    const outs = (outE[cur] || []).slice().sort(function (a, b) { return b.amount - a.amount; });
    const mainEdge = outs[0] || null, peelEdge = outs[1] || null;
    spine.push({ id: cur, node: nodeById[cur], mainEdge: mainEdge, peelEdge: peelEdge, hop: mainEdge ? mainEdge.hop : null });
    cur = mainEdge ? mainEdge.target : null;
  }
  const spineSet = {}; spine.forEach(function (s) { spineSet[s.id] = 1; });

  const amts = rawEdges.map(function (e) { return e.amount; });
  const minA = amts.length ? Math.min.apply(null, amts) : 1;
  const maxA = amts.length ? Math.max.apply(null, amts) : 1;

  /* A spine node is a LANDMARK if its bulk continues into a mixer/bridge, or it feeds
   * one via its peel-off, or any of its out-edges is a risk-95 hot hop. */
  function landmarkType(s) {
    const outs = outE[s.id] || [];
    for (let i = 0; i < outs.length; i++) {
      const t = nodeById[outs[i].target];
      if (t && (t.type === 'mixer' || t.type === 'bridge')) return { type: t.type, target: t, edge: outs[i] };
    }
    return null;
  }

  /* Build the ordered ENTITY node list by scanning the spine, folding plain peel runs
   * into relay groups and emitting a landmark node whenever the flow touches a gate. */
  const flow = [];                /* ordered entity nodes */
  let uid = 0;
  const idOf = function (p) { return p + '#' + (uid++); };

  const srcEnt = { key: idOf('src'), kind: 'source', label: source.label, node: source, risk: source.risk,
    inAmt: 0, outAmt: spine[0] && spine[0].mainEdge ? spine[0].mainEdge.amount : 0, members: [source.id] };
  flow.push(srcEnt);

  let run = [];                   /* accumulating relay members (spine indices) */
  function flushRun() {
    if (!run.length) return;
    const members = run.slice(); run = [];
    const first = spine[members[0]], last = spine[members[members.length - 1]];
    const mainIn = first.mainEdge ? first.mainEdge.amount : 0;
    const mainOut = last.mainEdge ? last.mainEdge.amount : 0;
    let peelTot = 0, peelCount = 0, worstRisk = 'Medium';
    const memberIds = [];
    members.forEach(function (mi) {
      const s = spine[mi]; memberIds.push(s.id);
      if (s.node && s.node.risk === 'High') worstRisk = 'High';
      if (s.peelEdge) { peelTot += s.peelEdge.amount; peelCount++; }
    });
    flow.push({
      key: idOf('peel'), kind: 'peel',
      label: 'Peel relay ×' + members.length,
      hopFrom: first.hop, hopTo: last.mainEdge ? last.mainEdge.hop : last.hop,
      inAmt: mainIn, outAmt: mainOut || mainIn, peelTot: peelTot, peelCount: peelCount,
      count: members.length, risk: worstRisk, members: memberIds,
      node: first.node,
    });
  }

  for (let si = 1; si < spine.length; si++) {
    const s = spine[si];
    const lm = landmarkType(s);
    if (lm) {
      flushRun();
      const hot = (outE[s.id] || []).some(function (e) { return e.risk === 95; });
      const ins = inE[lm.target.id] || [];
      const inTot = ins.reduce(function (a, e) { return a + e.amount; }, 0);
      flow.push({
        key: idOf(lm.type), kind: lm.type,
        label: lm.target.label, node: lm.target, risk: lm.target.risk,
        inAmt: inTot || lm.edge.amount, outAmt: lm.edge.amount, hop: lm.edge.hop, hot: hot,
        members: [lm.target.id],
      });
      /* the spine node itself still forwarded bulk — keep counting from next hop */
    } else {
      run.push(si);
    }
  }
  flushRun();

  /* CASH-OUT clusters: group exchanges / merchants / deposits (the peel terminals). */
  function cluster(kind, typeName) {
    const members = rawNodes.filter(function (n) { return n.type === typeName; });
    if (!members.length) return null;
    let tot = 0, cnt = 0, worst = 'Medium', high = 0;
    members.forEach(function (m) {
      const ins = inE[m.id] || [];
      ins.forEach(function (e) { tot += e.amount; cnt++; });
      if (m.risk === 'High') { worst = 'High'; high++; }
    });
    return {
      key: idOf(kind), kind: kind, label: typeName === 'exchange' ? 'Exchanges' : typeName === 'merchant' ? 'Merchants' : 'Deposit addrs',
      typeName: typeName, count: members.length, highCount: high, txCount: cnt, inAmt: tot, outAmt: 0,
      risk: worst, members: members.map(function (m) { return m.id; }),
      node: members.slice().sort(function (a, b) {
        const ai = (inE[a.id] || []).reduce(function (x, e) { return x + e.amount; }, 0);
        const bi = (inE[b.id] || []).reduce(function (x, e) { return x + e.amount; }, 0);
        return bi - ai;
      })[0],
    };
  }
  const sinkEnts = [];
  const exCl = cluster('exchange', 'exchange'); if (exCl) sinkEnts.push(exCl);
  const meCl = cluster('merchant', 'merchant'); if (meCl) sinkEnts.push(meCl);
  const deCl = cluster('deposit', 'deposit'); if (deCl) sinkEnts.push(deCl);

  /* Assign TIER (column) to every entity. Spine entities get sequential tiers; the
   * cash-out clusters occupy the final tier. */
  const spineChain = flow.slice(); /* source + peel + gates, in flow order */
  spineChain.forEach(function (ent, i) { ent.tier = i; });
  const lastTier = spineChain.length; /* clusters live one column past the spine end */
  sinkEnts.forEach(function (ent) { ent.tier = lastTier; });

  const entities = spineChain.concat(sinkEnts);
  const entByKey = {}; entities.forEach(function (e) { entByKey[e.key] = e; });

  /* EDGES between entities. Main spine edges connect consecutive spineChain entities.
   * Peel/cash-out edges connect each spine entity that peels to the relevant cluster. */
  const edges = [];
  for (let i = 0; i < spineChain.length - 1; i++) {
    const a = spineChain[i], b = spineChain[i + 1];
    const hot = !!(a.hot || b.hot);
    edges.push({ from: a.key, to: b.key, amount: b.inAmt || a.outAmt, kind: 'main', hot: hot,
      label: fmtAmt(b.inAmt || a.outAmt) });
  }
  /* peel-off tributaries: each peel-relay sends its peeled total to the cash-out lane.
   * Attribute peel-offs to the sink type they actually landed on (deposit-heavy). */
  const sinkByType = {}; sinkEnts.forEach(function (s) { sinkByType[s.typeName] = s; });
  spineChain.forEach(function (ent) {
    if (ent.kind !== 'peel' || !ent.peelTot) return;
    /* find which sink types the members peeled to */
    const split = {};
    ent.members.forEach(function (mid) {
      const outs = outE[mid] || [];
      outs.forEach(function (e) {
        const t = nodeById[e.target];
        if (t && (t.type === 'exchange' || t.type === 'merchant' || t.type === 'deposit') && e !== (spine.find(function (s) { return s.id === mid; }) || {}).mainEdge) {
          split[t.type] = (split[t.type] || 0) + e.amount;
        }
      });
    });
    const keys = Object.keys(split);
    if (!keys.length && sinkByType.deposit) { edges.push({ from: ent.key, to: sinkByType.deposit.key, amount: ent.peelTot, kind: 'peel', label: fmtAmt(ent.peelTot) }); return; }
    keys.forEach(function (tp) { if (sinkByType[tp]) edges.push({ from: ent.key, to: sinkByType[tp].key, amount: split[tp], kind: 'peel', label: fmtAmt(split[tp]) }); });
  });
  /* the spine terminus / last gate also cashes out into exchanges (bulk landing). */
  const lastSpine = spineChain[spineChain.length - 1];
  if (lastSpine && sinkByType.exchange && lastSpine.kind !== 'exchange') {
    edges.push({ from: lastSpine.key, to: sinkByType.exchange.key, amount: lastSpine.outAmt || lastSpine.inAmt, kind: 'main', label: fmtAmt(lastSpine.outAmt || lastSpine.inAmt) });
  }

  /* headline aggregates for the findings header + stats. */
  const totalOriginated = (spine[0] && spine[0].mainEdge ? spine[0].mainEdge.amount : 0) + (spine[0] && spine[0].peelEdge ? spine[0].peelEdge.amount : 0);
  const totalTraced = spine[0] && spine[0].mainEdge ? spine[0].mainEdge.amount : 0;
  let toMixers = 0, toBridges = 0;
  spineChain.forEach(function (e) { if (e.kind === 'mixer') toMixers += e.inAmt; else if (e.kind === 'bridge') toBridges += e.inAmt; });
  const toExch = exCl ? exCl.inAmt : 0, toMerch = meCl ? meCl.inAmt : 0, toDep = deCl ? deCl.inAmt : 0;
  const highRiskNodes = rawNodes.filter(function (n) { return n.risk === 'High'; });
  const hotEdges = rawEdges.filter(function (e) { return e.risk === 95; });
  const hopMax = rawEdges.reduce(function (m, e) { return e.hop > m ? e.hop : m; }, 0);
  const mixerCount = rawNodes.filter(function (n) { return n.type === 'mixer'; }).length;
  const bridgeCount = rawNodes.filter(function (n) { return n.type === 'bridge'; }).length;

  /* nodes on the pre-lit HOT PATH (touched by a risk-95 edge). */
  const hotNodeIds = {}; hotEdges.forEach(function (e) { hotNodeIds[e.source] = 1; hotNodeIds[e.target] = 1; });
  entities.forEach(function (ent) { ent.onHotPath = ent.members.some(function (m) { return hotNodeIds[m]; }); });

  return {
    data: data, nodeById: nodeById, outE: outE, inE: inE, source: source, spine: spine,
    entities: entities, entByKey: entByKey, spineChain: spineChain, sinkEnts: sinkEnts,
    edges: edges, minA: minA, maxA: maxA,
    totalOriginated: totalOriginated, totalTraced: totalTraced,
    toMixers: toMixers, toBridges: toBridges, toExch: toExch, toMerch: toMerch, toDep: toDep,
    highRiskNodes: highRiskNodes, hotEdges: hotEdges, hopMax: hopMax,
    mixerCount: mixerCount, bridgeCount: bridgeCount, hotNodeIds: hotNodeIds,
    lastTier: lastTier, tierCount: lastTier + 1,
    exCl: exCl, meCl: meCl, deCl: deCl,
  };
}

/* log-binned edge width for an amount, clamped into a SANE band so a big-number
 * ribbon can never become a wall. `lo`/`hi` are the target band (px); the result is
 * additionally hard-clamped to that band. Width reads as "thicker = more value"
 * without any single ribbon dominating the canvas. */
function edgeWidth(amt, minA, maxA, lo, hi) {
  lo = lo == null ? 2 : lo; hi = hi == null ? 14 : hi;
  const la = Math.log10(Math.max(amt, 1)), l = Math.log10(Math.max(minA, 1)), h = Math.log10(Math.max(maxA, 1));
  const t = h > l ? (la - l) / (h - l) : 1;
  const w = lo + clamp(t, 0, 1) * (hi - lo);
  return clamp(w, lo, hi);
}

/* ============================================================
 * MAIN ENTRY
 * ============================================================ */
export function chainTrace(container, opts) {
  if (!container) throw new Error('chainTrace: container required');
  opts = opts || {};
  const data = { nodes: opts.nodes || [], edges: opts.edges || [], traceId: opts.traceId || 'TRC-001' };
  if (!data.nodes.length) throw new Error('chainTrace: no chain-trace nodes');
  const onNodeClick = typeof opts.onNodeClick === 'function' ? opts.onNodeClick : null;

  const M = buildModel(data);

  const state = { focusKey: null, legendOpen: true, tx: 0, ty: 0, scale: 1 };

  ensureStyleTag();

  /* ---------- IN-PAGE shell DOM ---------------------------------------
   * `.clg-host` is `position:relative; overflow:hidden` with a BOUNDED height. All
   * overlays below are absolute *within this host*, never the viewport. */
  clear(container);
  container.className = 'clg-host';
  if (container.setAttribute) { container.setAttribute('role', 'group'); container.setAttribute('aria-label', 'Chain-Link transaction flow graph'); container.setAttribute('tabindex', '0'); }

  const stage = H('div', { class: 'clg-stage' });
  const svg = S('svg', { class: 'clg-svg', width: '100%', height: '100%', preserveAspectRatio: 'xMidYMid meet' });
  const gRoot = S('g', {});
  svg.appendChild(gRoot);
  stage.appendChild(svg);

  const toolbar = H('div', { class: 'clg-toolbar' });
  const legendEl = H('div', { class: 'clg-legend' });
  const detail = H('div', { class: 'clg-detail' });
  const minimap = H('div', { class: 'clg-minimap' });
  // Cooperative-gesture hint (mirrors the jurisdiction map + network explorer):
  // a plain wheel scrolls the PAGE; Ctrl/Cmd+wheel (or +/- / pinch) zooms. The
  // hint flashes when the user plain-scrolls over the graph so the gesture is
  // discoverable rather than a scroll-trap.
  const hint = H('div', { class: 'clg-hint', text: 'Ctrl/⌘ + scroll (or pinch) to zoom · drag to pan' });

  stage.appendChild(toolbar);
  stage.appendChild(legendEl);
  stage.appendChild(detail);
  stage.appendChild(minimap);
  stage.appendChild(hint);
  container.appendChild(stage);

  /* ============================================================
   * LAYOUT — tiers (columns) left->right. Spine entities each occupy one tier at the
   * vertical mid-line; peel relays sit slightly high, cash-out clusters stack in the
   * final tier along the lower band. Deterministic, no measuring of text.
   * ============================================================ */
  // World is wider than the 620px card so the 16-tier spine gets a comfortable
  // column pitch; the card's "Fit" scales this whole world down uniformly, so the
  // (label-width : column-gap) ratio that prevents collisions is preserved at any
  // zoom. Vertical bands (flowY +/- spineAmp) spread nodes across height so labels
  // never share a horizontal row with their neighbours.
  const world = { w: 1560, h: 860 };
  const LAY = {
    padL: 70, padR: 120,       // left/right gutters inside the world
    flowY: 300,                // the main spine mid-line (the bulk that keeps moving)
    spineAmp: 120,             // peel relays sit this far above/below the flow line (was 80)
    sinkTop: 520, sinkGap: 132,// cash-out clusters stack down a lower-right band (gap was 92)
  };

  // Deterministic layout. Gates (source / mixer / bridge) ride the flow mid-line;
  // peel relays alternate ABOVE then BELOW it (a shallow zig-zag) so consecutive
  // relay labels are never on the same horizontal band. Cash-out clusters stack in
  // a lower-right band, so peel tributaries read as a quiet fan DOWN into them,
  // spatially separated from the bold spine above.
  function computeLayout() {
    const tiers = M.tierCount;
    const usableW = world.w - LAY.padL - LAY.padR;
    const colGap = tiers > 1 ? usableW / (tiers - 1) : usableW;
    const pos = {};
    let relayParity = 0; // 0 -> above, 1 -> below, toggled per peel relay
    M.spineChain.forEach(function (ent) {
      const x = LAY.padL + ent.tier * colGap;
      let y = LAY.flowY;
      let band = 'mid';
      if (ent.kind === 'peel') {
        const up = (relayParity % 2) === 0;
        y = LAY.flowY + (up ? -LAY.spineAmp : LAY.spineAmp);
        band = up ? 'above' : 'below';
        relayParity++;
      }
      pos[ent.key] = { x: x, y: y, ent: ent, band: band };
    });
    // cash-out clusters: stacked down the lower-right band, one column in from the
    // world edge so their (right-facing) detail never clips.
    const n = M.sinkEnts.length;
    M.sinkEnts.forEach(function (ent, i) {
      pos[ent.key] = { x: LAY.padL + (tiers - 1) * colGap, y: LAY.sinkTop + i * LAY.sinkGap, ent: ent, band: 'sink' };
    });
    return pos;
  }

  // Fan routing: several peel tributaries leave the SAME relay node heading to the
  // (stacked) cash-out clusters. Spread their exit points across the node's edge and
  // their arrival points across each sink's edge, so parallel tributaries separate
  // instead of stacking into one thick teal mass. Returns {out:{edgeKey->offset},
  // in:{edgeKey->offset}} in [-1..1] fractions. Deterministic (index / (count-1)).
  function fanOffsets() {
    const bySrc = {}, byDst = {};
    M.edges.forEach(function (e) {
      if (e.kind !== 'peel') return;
      (bySrc[e.from] = bySrc[e.from] || []).push(e);
      (byDst[e.to] = byDst[e.to] || []).push(e);
    });
    const outOff = {}, inOff = {};
    const ek = function (e) { return e.from + '>' + e.to; };
    Object.keys(bySrc).forEach(function (k) {
      const arr = bySrc[k]; const m = arr.length;
      arr.forEach(function (e, i) { outOff[ek(e)] = m > 1 ? (i / (m - 1)) * 2 - 1 : 0; });
    });
    Object.keys(byDst).forEach(function (k) {
      const arr = byDst[k]; const m = arr.length;
      // arrival order left->right by source x keeps crossings monotone (less tangle)
      arr.slice().sort(function (a, b) { return a.from.localeCompare(b.from); })
        .forEach(function (e, i) { inOff[ek(e)] = m > 1 ? (i / (m - 1)) * 2 - 1 : 0; });
    });
    return { out: outOff, in: inOff, key: ek };
  }

  function nodeRadius(ent) {
    if (ent.kind === 'source') return 19;
    if (ent.kind === 'mixer') return 18;
    if (ent.kind === 'bridge') return 17;
    if (ent.kind === 'peel') return 15;   // the boring middle — smaller
    return 18; /* cash-out clusters */
  }

  /* ============================================================
   * RENDER
   * ============================================================ */
  function render() {
    clear(gRoot);
    const pos = computeLayout();

    /* defs: arrow markers + hot marker */
    const defs = S('defs', {});
    defs.appendChild(marker('clg-arrow', shade(C.teal, 1.1)));
    defs.appendChild(marker('clg-arrow-peel', '#5bbdb2'));
    defs.appendChild(marker('clg-arrow-hot', C.high));
    defs.appendChild(marker('clg-arrow-dim', C.border));
    gRoot.appendChild(defs);

    /* phase guide: faint flow-lane strip + top-of-column phase headers -------- */
    const guide = S('g', {});
    gRoot.appendChild(guide);
    (function drawGuide() {
      const xs = M.spineChain.map(function (e) { return pos[e.key] ? pos[e.key].x : null; }).filter(function (x) { return x != null; });
      if (!xs.length) return;
      const minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
      // horizontal lane strip behind the flow mid-line (the bulk that keeps moving)
      guide.appendChild(S('rect', { x: minX - 40, y: LAY.flowY - 12, width: (maxX - minX) + 80, height: 24, rx: 12, fill: 'rgba(55,194,180,0.05)', stroke: 'rgba(55,194,180,0.16)', 'stroke-width': 1 }));
      // phase headers along the top
      const gate1 = M.spineChain.find(function (e) { return e.kind === 'mixer' || e.kind === 'bridge'; });
      const srcX = pos[M.spineChain[0].key] ? pos[M.spineChain[0].key].x : minX;
      const layMidX = (minX + maxX) / 2;
      const sinkX = M.sinkEnts.length && pos[M.sinkEnts[0].key] ? pos[M.sinkEnts[0].key].x : maxX;
      function hdr(x, txt, anchor) {
        guide.appendChild(S('text', { x: x, y: 30, 'text-anchor': anchor || 'middle', fill: C.muted, 'font-size': 10.5, 'font-weight': 700, 'letter-spacing': '0.4', 'text-transform': 'uppercase' }, txt));
      }
      hdr(srcX, 'Source', 'start');
      hdr(layMidX, 'Layering — relays · mixers · bridges', 'middle');
      hdr(sinkX, 'Cash-out', 'end');
      // faint dividers separating the three phases
      const d1 = gate1 && pos[gate1.key] ? pos[gate1.key].x - 40 : srcX + 60;
      guide.appendChild(S('line', { x1: d1, y1: 40, x2: d1, y2: world.h - 20, stroke: 'rgba(138,160,189,0.10)', 'stroke-width': 1, 'stroke-dasharray': '2 6' }));
      const d2 = sinkX - 46;
      guide.appendChild(S('line', { x1: d2, y1: 40, x2: d2, y2: world.h - 20, stroke: 'rgba(138,160,189,0.10)', 'stroke-width': 1, 'stroke-dasharray': '2 6' }));
    })();
    const focusEnt = state.focusKey ? M.entByKey[state.focusKey] : null;
    const litKeys = focusEnt ? neighbourKeys(state.focusKey) : null;

    /* ---- EDGES first (under nodes) ---- ---------------------------------------
     * Two visual registers, deliberately separated so neither drowns the other:
     *   MAIN flow  — the bulk that keeps moving. Bold, opaque, capped 2..13px.
     *   PEEL tribs — small cash-outs dropping to the clusters. Thin, translucent,
     *                capped 1.5..6px, FANNED at both ends so parallels don't stack.
     * Amount chips are drawn only on the MAIN spine + hot hops (labelling all 18
     * peel tributaries is what turned the canvas into noise). */
    const edgeLayer = S('g', {});
    gRoot.appendChild(edgeLayer);
    const fan = fanOffsets();
    // draw peel tributaries first (under), then the main spine (over)
    const ordered = M.edges.slice().sort(function (a, b) {
      const pa = a.kind === 'peel' ? 0 : 1, pb = b.kind === 'peel' ? 0 : 1; return pa - pb;
    });
    ordered.forEach(function (e) {
      const a = pos[e.from], b = pos[e.to];
      if (!a || !b) return;
      const isPeel = e.kind === 'peel';
      const dim = litKeys && !(litKeys[e.from] && litKeys[e.to]);
      const w = edgeWidth(e.amount, M.minA, M.maxA, isPeel ? 1.5 : 2, isPeel ? 6 : 13);
      const col = e.hot ? C.high : (isPeel ? '#57b6ac' : shade(C.teal, 1.05));
      const ra = nodeRadius(a.ent), rb = nodeRadius(b.ent);
      const oOff = isPeel ? (fan.out[fan.key(e)] || 0) : 0;
      const iOff = isPeel ? (fan.in[fan.key(e)] || 0) : 0;
      const path = edgePath(a.x, a.y, b.x, b.y, ra, rb, { peel: isPeel, oOff: oOff, iOff: iOff });
      const marker = e.hot ? 'clg-arrow-hot' : (dim ? 'clg-arrow-dim' : (isPeel ? 'clg-arrow-peel' : 'clg-arrow'));
      const baseOp = e.hot ? 0.95 : (isPeel ? 0.42 : 0.85);
      const line = S('path', { d: path, fill: 'none', stroke: dim ? C.border : col, 'stroke-width': dim ? 1 : Math.max(w, 1.2),
        'stroke-linecap': 'round', opacity: dim ? 0.2 : baseOp, 'marker-end': 'url(#' + marker + ')' });
      if (e.hot && !dim) line.setAttribute('class', 'clg-hot');
      edgeLayer.appendChild(line);
      // amount chip: main spine + hot hops only, at the edge mid-point
      if (!dim && (!isPeel || e.hot)) {
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - Math.min(24, Math.abs(b.x - a.x) * 0.12) - 7;
        edgeLayer.appendChild(edgeLabel(mx, my, e.label, e.hot));
      }
    });

    /* ---- NODES ---- */
    const nodeLayer = S('g', {});
    gRoot.appendChild(nodeLayer);
    M.entities.forEach(function (ent) {
      const p = pos[ent.key]; if (!p) return;
      const dim = litKeys && !litKeys[ent.key];
      const r = nodeRadius(ent);
      const g = S('g', { transform: 'translate(' + p.x + ',' + p.y + ')', class: 'clg-node', 'data-clgkey': ent.key });
      if (dim) g.setAttribute('opacity', '0.24');
      /* pre-lit hot ring for hot-path nodes */
      if (ent.onHotPath && !dim) g.appendChild(S('circle', { cx: 0, cy: 0, r: r * 1.55, fill: 'none', stroke: C.high, 'stroke-width': 1.4, 'stroke-dasharray': '2 3', opacity: 0.7 }));
      const glyphType = ent.kind === 'exchange' ? 'exchange' : ent.kind === 'merchant' ? 'merchant' : ent.kind === 'deposit' ? 'deposit' : ent.kind;
      g.appendChild(drawGlyph(glyphType, r, { risk: ent.risk }));

      // Labels are placed on the side that points AWAY from the flow line, so the
      // caption block for an above-relay goes up, a below-relay goes down, and a
      // mid/gate goes up — guaranteeing a relay's label never lands on top of the
      // neighbouring gate. Names are truncated hard; the full name lives in the
      // node <title> and the detail panel. (title/detail added by bindNode below.)
      const nm = captionOf(ent);
      const sub = subLabel(ent);
      const sub2 = subLabel2(ent);
      const below = p.band === 'below' || p.band === 'sink';
      if (below) {
        // name under the glyph, then the sub-lines under that
        g.appendChild(S('text', { x: 0, y: r + 14, 'text-anchor': 'middle', fill: C.text, 'font-size': 11.5, 'font-weight': 700 }, nm));
        if (sub) g.appendChild(S('text', { x: 0, y: r + 28, 'text-anchor': 'middle', fill: C.muted, 'font-size': 9.5 }, sub));
        if (sub2) g.appendChild(S('text', { x: 0, y: r + 40, 'text-anchor': 'middle', fill: ent.onHotPath ? C.high : C.muted, 'font-size': 9, 'font-weight': ent.onHotPath ? 700 : 400 }, sub2));
      } else {
        // read top->bottom: sub2 (highest), sub, name (nearest the glyph)
        g.appendChild(S('text', { x: 0, y: -r - 12, 'text-anchor': 'middle', fill: C.text, 'font-size': 11.5, 'font-weight': 700 }, nm));
        if (sub) g.appendChild(S('text', { x: 0, y: -r - 26, 'text-anchor': 'middle', fill: C.muted, 'font-size': 9.5 }, sub));
        if (sub2) g.appendChild(S('text', { x: 0, y: -r - (sub ? 39 : 26), 'text-anchor': 'middle', fill: ent.onHotPath ? C.high : C.muted, 'font-size': 9, 'font-weight': ent.onHotPath ? 700 : 400 }, sub2));
      }

      bindNode(g, ent);
      nodeLayer.appendChild(g);
    });

    applyTransform();
    drawMinimapSafe();
  }

  // Short primary caption drawn AT the node. Peel relays get a compact "Relay xN"
  // (hops live in the sub-line); named gates/clusters are truncated to ~13 chars.
  // The FULL label is always in the node <title> and the detail panel.
  function captionOf(ent) {
    if (ent.kind === 'peel') return 'Relay ×' + (ent.count != null ? ent.count : (ent.members ? ent.members.length : ''));
    const s = String(ent.label || '');
    return s.length > 12 ? s.slice(0, 11) + '…' : s;
  }
  function subLabel(ent) {
    if (ent.kind === 'source') return fmtAmt(ent.outAmt) + ' out';
    if (ent.kind === 'peel') return 'h' + ent.hopFrom + '–' + ent.hopTo + ' · ' + fmtAmt(ent.inAmt);
    if (ent.kind === 'mixer' || ent.kind === 'bridge') return fmtAmt(ent.inAmt) + ' in' + (ent.hop ? ' · h' + ent.hop : '');
    if (ent.kind === 'exchange' || ent.kind === 'merchant' || ent.kind === 'deposit') return fmtAmt(ent.inAmt) + ' · ' + ent.count + ' ' + (ent.count === 1 ? 'addr' : 'addrs');
    return '';
  }
  function subLabel2(ent) {
    if (ent.kind === 'peel' && ent.peelTot) return fmtAmt(ent.peelTot) + ' peeled';
    if (ent.onHotPath && (ent.kind === 'mixer' || ent.kind === 'bridge')) return 'RISK 95 hot';
    if ((ent.kind === 'exchange' || ent.kind === 'deposit' || ent.kind === 'merchant') && ent.highCount) return ent.highCount + ' high-risk';
    return '';
  }

  function marker(id, col) {
    const m = S('marker', { id: id, viewBox: '0 0 10 10', refX: '8', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' });
    m.appendChild(S('path', { d: 'M0,0 L10,5 L0,10 z', fill: col }));
    return m;
  }
  // Trim endpoints to the node edges and curve for readability. MAIN edges bow
  // gently UP (a calm arc along the flow line). PEEL tributaries get per-edge fan
  // offsets (spreading their exit/arrival points) and bow DOWN toward the cash-out
  // lane, so a fan of tributaries leaving one relay separates into distinct strands
  // instead of stacking. `opt = { peel, oOff, iOff }` (offsets in [-1..1]).
  function edgePath(ax, ay, bx, by, ra, rb, opt) {
    opt = opt || {};
    const dx0 = bx - ax, dy0 = by - ay, len0 = Math.sqrt(dx0 * dx0 + dy0 * dy0) || 1;
    let ux = dx0 / len0, uy = dy0 / len0;
    // fan: shift the endpoints tangentially (perpendicular to the run) by the offset
    const px = -uy, py = ux; // unit normal
    const spread = 11; // px of exit/arrival spread at full offset
    let sx = ax + ux * (ra + 3) + px * (opt.oOff || 0) * spread;
    let sy = ay + uy * (ra + 3) + py * (opt.oOff || 0) * spread;
    let ex = bx - ux * (rb + 9) + px * (opt.iOff || 0) * spread;
    let ey = by - uy * (rb + 9) + py * (opt.iOff || 0) * spread;
    const dx = ex - sx, dy = ey - sy, len = Math.sqrt(dx * dx + dy * dy) || 1;
    const mx = (sx + ex) / 2;
    // main flow bows up; peel tributaries bow down toward the lower cash-out band
    const bow = opt.peel ? Math.min(30, len * 0.13) : -Math.min(26, len * 0.12);
    const my = (sy + ey) / 2 + bow + (opt.peel ? (opt.oOff || 0) * 4 : 0);
    return 'M' + sx.toFixed(1) + ',' + sy.toFixed(1) + ' Q' + mx.toFixed(1) + ',' + my.toFixed(1) + ' ' + ex.toFixed(1) + ',' + ey.toFixed(1);
  }
  function edgeLabel(x, y, txt, hot) {
    const w = String(txt).length * 5.9 + 10;
    const g = S('g', { transform: 'translate(' + (x - w / 2) + ',' + (y - 8) + ')' });
    g.appendChild(S('rect', { x: 0, y: 0, width: w, height: 15, rx: 7.5, fill: 'rgba(10,13,19,0.88)', stroke: hot ? C.high : C.border, 'stroke-width': 1 }));
    g.appendChild(S('text', { x: w / 2, y: 10.8, 'text-anchor': 'middle', fill: hot ? C.high : C.text, 'font-size': 9, 'font-weight': 700 }, txt));
    return g;
  }

  /* keys lit when focusing an entity = itself + directly connected entities */
  function neighbourKeys(key) {
    const lit = {}; lit[key] = 1;
    M.edges.forEach(function (e) { if (e.from === key) lit[e.to] = 1; if (e.to === key) lit[e.from] = 1; });
    return lit;
  }

  function titleEl(txt) { const t = S('title', {}); setText(t, txt); return t; }

  /* bind click-for-detail + focus; fire host onNodeClick (opens wallet drawer). */
  function bindNode(g, ent) {
    if (g.style) g.style.cursor = 'pointer';
    if (g.setAttribute) { g.setAttribute('tabindex', '0'); g.setAttribute('role', 'button'); g.setAttribute('aria-label', ent.label + ' — ' + (NODE_TYPES[ent.kind] ? NODE_TYPES[ent.kind].label : ent.kind) + ', ' + ent.risk + ' risk. Enter to open.'); }
    function activate(ev) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      state.focusKey = ent.key; showDetail(ent); render();
      const wid = drawerNodeId(ent);
      if (wid && onNodeClick) { try { onNodeClick(wid); } catch (_e) { /* host drawer errors must not break the graph */ } }
    }
    // NB: mouse selection is resolved at the svg level (pointerup, no-drag) so a
    // pan that begins on a node never also selects it. Keyboard still activates here.
    g._clgActivate = activate;
    on(g, 'keydown', function (e) { const k = e && e.key; if (k === 'Enter' || k === ' ' || k === 'Spacebar') { if (e.preventDefault) e.preventDefault(); activate(e); } });
    g.appendChild(titleEl(ent.label + ' · ' + (NODE_TYPES[ent.kind] ? NODE_TYPES[ent.kind].label : ent.kind) + ' · risk ' + ent.risk));
  }
  /* which real wallet id a click opens: the entity's representative member. */
  function drawerNodeId(ent) {
    if (ent.node && ent.node.id) return ent.node.id;
    return ent.members && ent.members.length ? ent.members[0] : null;
  }

  /* ============================================================
   * TOOLBAR (in-page controls) — Fit / Reset / zoom / Key
   * ============================================================ */
  function renderToolbar() {
    clear(toolbar);
    function btn(label, fn, title, aria) { const b = H('button', { class: 'clg-btn', title: title || label, 'aria-label': aria || title || label, text: label }); on(b, 'click', fn); return b; }
    toolbar.appendChild(H('span', { class: 'clg-tb-label', text: 'View' }));
    toolbar.appendChild(btn('Fit', function () { fit(); }, 'Fit the whole flow into view'));
    toolbar.appendChild(btn('Reset', function () { state.focusKey = null; hideDetail(); render(); fit(); }, 'Clear focus and refit'));
    toolbar.appendChild(btn('+', function () { zoomBy(1.2); }, 'Zoom in'));
    toolbar.appendChild(btn('−', function () { zoomBy(1 / 1.2); }, 'Zoom out'));
    toolbar.appendChild(btn(state.legendOpen ? 'Hide key' : 'Key', function () { state.legendOpen = !state.legendOpen; renderLegend(); renderToolbar(); }, 'Show or hide the legend'));
  }

  /* ============================================================
   * LEGEND (in-page, closable, present-only)
   * ============================================================ */
  function renderLegend() {
    clear(legendEl);
    if (!state.legendOpen) { setStyle(legendEl, { display: 'none' }); return; }
    setStyle(legendEl, { display: 'block' });
    const head = H('div', { class: 'clg-legend-head' }, [
      H('span', { text: 'Legend' }),
      (function () { const b = H('button', { class: 'clg-legend-close', text: '×', title: 'Hide legend', 'aria-label': 'Hide legend' }); on(b, 'click', function () { state.legendOpen = false; renderLegend(); renderToolbar(); }); return b; })(),
    ]);
    legendEl.appendChild(head);
    const body = H('div', { class: 'clg-legend-body' });
    const present = {}; M.entities.forEach(function (e) { present[e.kind] = 1; });
    body.appendChild(H('div', { class: 'clg-legend-sec', text: 'Node types' }));
    ['source', 'peel', 'mixer', 'bridge', 'exchange', 'merchant', 'deposit'].forEach(function (t) {
      const spec = NODE_TYPES[t];
      body.appendChild(legendRow(swatchGlyph(t), spec.label, !present[t]));
    });
    body.appendChild(H('div', { class: 'clg-legend-sec', text: 'Risk (ring + badge)' }));
    ['High', 'Medium'].forEach(function (r) { body.appendChild(legendRow(riskSwatch(r), RISK[r].label, false)); });
    body.appendChild(H('div', { class: 'clg-legend-sec', text: 'Flow (edge width = log amount)' }));
    body.appendChild(legendRow(flowSwatch(16, shade(C.teal, 1.05)), 'Main flow (bulk continues)', false));
    body.appendChild(legendRow(flowSwatch(4, '#5bbdb2'), 'Peel-off tributary', false));
    body.appendChild(legendRow(flowSwatch(5, C.high), 'Hot path (risk 95) — pre-lit', false));
    legendEl.appendChild(body);
  }
  function legendRow(swatch, text, muted) {
    return H('div', { class: 'clg-legend-row' + (muted ? ' muted' : '') }, [swatch, H('span', { class: 'clg-legend-txt', text: text })]);
  }
  function swatchGlyph(type) { const s = S('svg', { width: 30, height: 30, viewBox: '-15 -15 30 30', class: 'clg-swatch' }); s.appendChild(drawGlyph(type, 10, {})); return s; }
  function riskSwatch(r) { const s = S('svg', { width: 30, height: 30, viewBox: '-15 -15 30 30', class: 'clg-swatch' }); s.appendChild(drawGlyph('wallet', 9, { risk: r })); return s; }
  function flowSwatch(w, col) { const s = S('svg', { width: 30, height: 30, viewBox: '0 0 30 30', class: 'clg-swatch' }); s.appendChild(S('line', { x1: 3, y1: 15, x2: 27, y2: 15, stroke: col, 'stroke-width': Math.min(w, 12), 'stroke-linecap': 'round' })); return s; }

  /* ============================================================
   * DETAIL PANEL (in-page side card)
   * ============================================================ */
  /* A concise, plain reason WHY this node/path is flagged higher-risk — shown in
   * the detail panel so the "why" is never a guess. Ordered strongest-first. */
  function entityRiskReason(ent) {
    if (ent.kind === 'mixer') return 'Higher risk: an anonymising mixer breaks the money trail — a classic layering step.';
    if (ent.kind === 'bridge') return 'Elevated: a cross-chain bridge hop makes the funds harder to follow across chains.';
    if (ent.onHotPath) return 'On the risk-95 hot path — rapid, high-value layering flows through here.';
    if (ent.kind === 'exchange') return ent.risk === 'High' ? 'Cash-out to fiat at a high-risk exchange — the off-ramp point.' : 'Cash-out to fiat — the off-ramp point (KYC / legal-process leverage).';
    if (ent.risk === 'High') return 'Scored High risk in Chain-Link’s heuristics.';
    if (ent.kind === 'source') return 'Origin of the traced funds — the start of the chain.';
    return null;
  }
  /* Short type noun for the "Open …" action so it reads "Open exchange →", never a
   * blanket "Open wallet →". */
  function openerNoun(kind) {
    return kind === 'exchange' ? 'exchange' : kind === 'mixer' ? 'mixer' : kind === 'bridge' ? 'bridge'
      : kind === 'merchant' ? 'merchant' : kind === 'deposit' ? 'deposit cluster'
      : kind === 'source' ? 'source wallet' : kind === 'peel' ? 'peel cluster' : 'wallet';
  }

  function showDetail(ent) {
    clear(detail);
    detail.classList.add('open');
    setStyle(detail, { display: 'block' });
    const glyphType = ent.kind === 'exchange' ? 'exchange' : ent.kind === 'merchant' ? 'merchant' : ent.kind === 'deposit' ? 'deposit' : ent.kind;
    const spec = NODE_TYPES[ent.kind] || NODE_TYPES.wallet;
    detail.appendChild(H('div', { class: 'clg-detail-head' }, [
      (function () { const s = S('svg', { width: 38, height: 38, viewBox: '-19 -19 38 38' }); s.appendChild(drawGlyph(glyphType, 13, { risk: ent.risk })); return s; })(),
      H('div', { class: 'clg-detail-hh' }, [
        H('div', { class: 'clg-detail-title', text: ent.label }),
        H('div', { class: 'clg-detail-type', text: spec.label }),
      ]),
      (function () { const b = H('button', { class: 'clg-detail-close', text: '×', title: 'Close', 'aria-label': 'Close detail panel' }); on(b, 'click', hideDetail); return b; })(),
    ]));
    const rows = [];
    if (ent.kind === 'source') { rows.push(['Sent onward', fmtAmt(ent.outAmt)]); rows.push(['Role', 'Origin of the peel chain']); }
    else if (ent.kind === 'peel') {
      rows.push(['Hops grouped', ent.count + ' (hops ' + ent.hopFrom + '–' + ent.hopTo + ')']);
      rows.push(['Bulk moved', fmtAmt(ent.inAmt)]);
      rows.push(['Peeled off', fmtAmt(ent.peelTot) + ' across ' + ent.peelCount + ' hops']);
    } else if (ent.kind === 'mixer' || ent.kind === 'bridge') {
      rows.push(['Received', fmtAmt(ent.inAmt)]);
      if (ent.hop) rows.push(['At hop', String(ent.hop)]);
      rows.push(['Function', ent.kind === 'mixer' ? 'Anonymising tumbler' : 'Cross-chain hop']);
    } else {
      rows.push(['Addresses', String(ent.count)]);
      rows.push(['Total received', fmtAmt(ent.inAmt)]);
      rows.push(['Transactions in', String(ent.txCount)]);
      if (ent.highCount) rows.push(['High-risk members', String(ent.highCount)]);
    }
    rows.push(['Risk', ent.risk]);
    const tbl = H('div', { class: 'clg-detail-tbl' });
    rows.forEach(function (r) { tbl.appendChild(H('div', { class: 'clg-detail-row' }, [H('span', { class: 'clg-detail-k', text: r[0] }), H('span', { class: 'clg-detail-val', text: String(r[1]) })])); });
    detail.appendChild(tbl);
    const why = entityRiskReason(ent);
    if (why) detail.appendChild(H('div', { class: 'clg-detail-why', text: why }));
    if (ent.onHotPath) detail.appendChild(H('div', { class: 'clg-detail-flag', text: '⚠ On the risk-95 hot path — pre-highlighted' }));
    const wid = drawerNodeId(ent);
    if (wid) {
      var noun = openerNoun(ent.kind);
      detail.appendChild(H('div', { class: 'clg-detail-foot' }, [
        (function () { const b = H('button', { class: 'clg-btn sm primary', text: 'Open ' + noun + ' →', title: 'Open the ' + noun + ' in the side drawer' }); on(b, 'click', function () { if (onNodeClick) { try { onNodeClick(wid); } catch (_e) {} } }); return b; })(),
      ]));
    }
  }
  function hideDetail() { detail.classList.remove('open'); clear(detail); setStyle(detail, { display: 'none' }); state.focusKey = null; render(); }

  /* ============================================================
   * MINIMAP (in-page, bottom-left of the host)
   * ============================================================ */
  function drawMinimap() {
    clear(minimap);
    const mw = 176, mh = 66;
    const pos = computeLayout();
    const s = S('svg', { width: mw, height: mh, viewBox: '0 0 ' + mw + ' ' + mh, class: 'clg-mini-svg' });
    s.appendChild(S('rect', { x: 0, y: 0, width: mw, height: mh, rx: 6, fill: 'rgba(10,13,19,0.7)', stroke: C.border }));
    const sx = (mw - 14) / world.w, sy = (mh - 14) / world.h; const sc = Math.min(sx, sy);
    const ox = 7, oy = 7;
    M.edges.forEach(function (e) { const a = pos[e.from], b = pos[e.to]; if (!a || !b) return; s.appendChild(S('line', { x1: ox + a.x * sc, y1: oy + a.y * sc, x2: ox + b.x * sc, y2: oy + b.y * sc, stroke: e.hot ? C.high : C.border, 'stroke-width': e.hot ? 1.3 : 0.8, opacity: 0.7 })); });
    M.entities.forEach(function (ent) { const p = pos[ent.key]; if (!p) return; const col = ent.kind === 'mixer' ? OK.vermillion : ent.kind === 'bridge' ? OK.purple : ent.kind === 'source' ? OK.orange : ent.kind === 'peel' ? '#3aa79c' : OK.blue; s.appendChild(S('circle', { cx: ox + p.x * sc, cy: oy + p.y * sc, r: ent.onHotPath ? 2.6 : 2, fill: col })); });
    const vp = viewportWorldRect();
    s.appendChild(S('rect', { x: ox + vp.x * sc, y: oy + vp.y * sc, width: vp.w * sc, height: vp.h * sc, fill: 'none', stroke: C.accent, 'stroke-width': 1.2 }));
    minimap.appendChild(H('div', { class: 'clg-mini-label', text: 'Overview' }));
    minimap.appendChild(s);
  }
  function drawMinimapSafe() { try { drawMinimap(); } catch (_e) { /* zero-size DOM (shim) — skip */ } }

  /* ============================================================
   * PAN / ZOOM (bounded, within the host) + FIT
   *
   * Navigation is modelled on the two sibling views the user already knows (the
   * jurisdiction map in viz.js and the Sovereign-Nexus network explorer in
   * graph.js), so the gestures are consistent across FRIS:
   *   - PAN works from ANYWHERE — background OR on a node — and is FREE even at the
   *     Fit scale: clampPan no longer snaps the content back to centre when it fits;
   *     it only stops you dragging it entirely off-screen (a generous margin keeps a
   *     slab of content visible from any position). This is the pan-lock fix.
   *   - ZOOM is COOPERATIVE: a plain wheel lets the PAGE scroll (no scroll-trap);
   *     only Ctrl/Cmd + wheel (or +/- buttons, keyboard, or a two-finger pinch)
   *     zooms, anchored at the cursor. A transient hint flashes on a plain scroll.
   *   - CLICK vs DRAG is disambiguated by travel: a press that moves past
   *     DRAG_THRESH px pans (and never selects); a press that stays put selects the
   *     node under it (opening its detail / firing onNodeClick), or clears focus on
   *     empty background.
   * ============================================================ */
  const VIEW = { w: 1240, h: 620 };
  function measure() { const r = safeRect(stage, 1240, 620); VIEW.w = r.width || 1240; VIEW.h = r.height || 620; }
  function applyTransform() { if (gRoot.setAttribute) gRoot.setAttribute('transform', 'translate(' + state.tx + ',' + state.ty + ') scale(' + state.scale + ')'); }
  // A generous pan margin: the user may drag the world until only PAN_KEEP px of it
  // remain on the nearest edge. Big enough to move freely at Fit, small enough that
  // the content can never be flung entirely out of view.
  const PAN_KEEP = 140;
  function clampPan() {
    measure();
    const scaledW = world.w * state.scale, scaledH = world.h * state.scale;
    // Allowed tx range: from "world's right edge sits PAN_KEEP inside the left" to
    // "world's left edge sits PAN_KEEP inside the right". When the world is smaller
    // than the viewport this range still spans a comfortable slack on both sides, so
    // the user can nudge it around instead of being locked to dead-centre.
    const minTx = Math.min(PAN_KEEP - scaledW + VIEW.w - PAN_KEEP, VIEW.w - PAN_KEEP);
    const loTx = VIEW.w - scaledW - PAN_KEEP, hiTx = PAN_KEEP;
    const loTy = VIEW.h - scaledH - PAN_KEEP, hiTy = PAN_KEEP;
    // Guard against inverted bounds (when scaled < viewport, lo > hi): widen to a
    // symmetric slack around the centred position so panning still works both ways.
    function bound(v, lo, hi, scaled, viewLen) {
      if (lo <= hi) return clamp(v, lo, hi);
      const c = (viewLen - scaled) / 2, slack = PAN_KEEP; // centred +/- slack
      return clamp(v, c - slack, c + slack);
    }
    state.tx = bound(state.tx, loTx, hiTx, scaledW, VIEW.w);
    state.ty = bound(state.ty, loTy, hiTy, scaledH, VIEW.h);
  }
  // FIT frames the WHOLE width of the flow (all tiers visible) and biases toward
  // FILLING the card rather than shrinking to contain the taller world: any vertical
  // overshoot is small and reachable by the now-free pan. This keeps the graph large
  // (a higher default zoom -> easier reading/exploration) while still showing the
  // entire left-to-right story at a glance. Result is clamped so a narrow card can't
  // blow it up absurdly.
  function fit() {
    measure();
    const pad = 16;
    const sx = (VIEW.w - pad * 2) / world.w;      // fill the width (all tiers in view)
    const sy = (VIEW.h - pad * 2) / world.h;
    // Prefer width; allow up to a little taller-than-card (panned) but never so tall
    // that the spine mid-line leaves the card, so bias between sx and the contain fit.
    const target = Math.max(Math.min(sx, sy) , Math.min(sx, sy * 1.28));
    state.scale = clamp(Math.min(target, sx), 0.2, 1.6);
    state.tx = (VIEW.w - world.w * state.scale) / 2;
    state.ty = (VIEW.h - world.h * state.scale) / 2;
    clampPan(); applyTransform(); drawMinimapSafe();
  }
  function zoomAt(f, cx, cy) {
    measure();
    if (cx == null) { cx = VIEW.w / 2; cy = VIEW.h / 2; }
    const wx = (cx - state.tx) / state.scale, wy = (cy - state.ty) / state.scale;
    state.scale = clamp(state.scale * f, 0.2, 3);
    state.tx = cx - wx * state.scale; state.ty = cy - wy * state.scale;
    clampPan(); applyTransform(); drawMinimapSafe();
  }
  function zoomBy(f) { zoomAt(f, null, null); }
  function viewportWorldRect() { measure(); return { x: -state.tx / state.scale, y: -state.ty / state.scale, w: VIEW.w / state.scale, h: VIEW.h / state.scale }; }
  function rectOf(node) { const r = safeRect(node, VIEW.w, VIEW.h); r.left = 0; r.top = 0; try { if (node && node.getBoundingClientRect) { const b = node.getBoundingClientRect(); r.left = b.left || 0; r.top = b.top || 0; } } catch (_e) {} return r; }

  /* ---------- pointer pan + click-vs-drag (mirrors graph.js) ----------
   * A press anywhere begins a potential pan; we track travel from the press point.
   * Once travel exceeds DRAG_THRESH it is a PAN (camera moves, `moved` set, node
   * click suppressed). If it never moves it is a CLICK, resolved on pointerup: on a
   * node -> select + open drawer; on empty background -> clear focus. Selection is
   * resolved HERE (not via a per-node DOM click) so a drag can never also select. */
  const DRAG_THRESH = 4;
  let dragging = false, downX = 0, downY = 0, lastX = 0, lastY = 0, moved = false, pressG = null;
  function nodeGFromEvent(e) {
    const t = e && e.target; if (!t) return null;
    let hit = null;
    if (t.closest) { try { hit = t.closest('.clg-node'); } catch (_x) { hit = null; } }
    return hit || null;
  }
  function pointerDown(e) {
    dragging = true; moved = false;
    lastX = downX = e.clientX; lastY = downY = e.clientY;
    pressG = nodeGFromEvent(e);
    if (svg.setPointerCapture && e.pointerId != null) { try { svg.setPointerCapture(e.pointerId); } catch (_x) {} }
    if (svg.style) svg.style.cursor = 'grabbing';
  }
  function pointerMove(e) {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY;
    if (!moved && Math.hypot(e.clientX - downX, e.clientY - downY) > DRAG_THRESH) moved = true;
    if (!moved) return;
    state.tx += dx; state.ty += dy; clampPan(); applyTransform(); drawMinimapSafe();
  }
  function pointerUp() {
    if (!dragging) return;
    dragging = false;
    if (svg.style) svg.style.cursor = 'grab';
    const g = pressG; pressG = null;
    if (moved) return; // it was a pan: no select
    if (g && g._clgActivate) { g._clgActivate(); return; } // no-move click on a node -> select
    if (state.focusKey) hideDetail();                       // click on empty background -> clear
  }
  on(svg, 'pointerdown', pointerDown);
  on(svg, 'pointermove', pointerMove);
  on(svg, 'pointerup', pointerUp);
  on(svg, 'pointercancel', function () { dragging = false; moved = false; pressG = null; if (svg.style) svg.style.cursor = 'grab'; });
  on(svg, 'pointerleave', function () { if (dragging && moved) pointerUp(); });
  // Fallback for environments without pointer events: mouse drag with the same
  // threshold logic (window-level move/up so a drag that leaves the svg still pans).
  if (typeof window === 'undefined' || !('onpointerdown' in (typeof window !== 'undefined' ? window : {}))) {
    on(svg, 'mousedown', function (e) { pointerDown({ clientX: e.clientX, clientY: e.clientY, target: e.target }); });
    on(typeof window !== 'undefined' ? window : null, 'mousemove', function (e) { pointerMove({ clientX: e.clientX, clientY: e.clientY }); });
    on(typeof window !== 'undefined' ? window : null, 'mouseup', function () { pointerUp(); });
  }

  /* ---------- cooperative wheel: Ctrl/Cmd zooms at cursor; plain scrolls page ---- */
  let hintTimer = null;
  function showZoomHint() {
    if (!hint || !hint.style) return;
    try { hint.style.opacity = '1'; } catch (_x) {}
    if (hintTimer) { try { clearTimeout(hintTimer); } catch (_x) {} }
    if (typeof setTimeout === 'function') hintTimer = setTimeout(function () { try { hint.style.opacity = '0'; } catch (_x) {} }, 1500);
  }
  on(svg, 'wheel', function (e) {
    if (e && (e.ctrlKey || e.metaKey)) {
      if (e.preventDefault) e.preventDefault();
      const r = rectOf(svg);
      const cx = (e.clientX || 0) - r.left, cy = (e.clientY || 0) - r.top;
      zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, cx, cy);
    } else {
      showZoomHint(); // let the page scroll normally (no preventDefault)
    }
  }, { passive: false });

  /* ---------- touch: pinch => zoom (at midpoint), one-finger => pan when zoomed ---- */
  function touchGap(e) { const a = e.touches[0], b = e.touches[1]; return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); }
  let pinchDist = 0, touchPan = null;
  on(svg, 'touchstart', function (e) {
    if (e.touches && e.touches.length === 2) { pinchDist = touchGap(e); touchPan = null; }
    else if (e.touches && e.touches.length === 1) { touchPan = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }
  }, { passive: true });
  on(svg, 'touchmove', function (e) {
    if (e.touches && e.touches.length === 2) {
      if (e.preventDefault) e.preventDefault();
      const d = touchGap(e);
      if (pinchDist) { const r = rectOf(svg); const a = e.touches[0], b = e.touches[1]; const cx = (a.clientX + b.clientX) / 2 - r.left, cy = (a.clientY + b.clientY) / 2 - r.top; zoomAt(d / pinchDist, cx, cy); }
      pinchDist = d;
    } else if (e.touches && e.touches.length === 1 && touchPan) {
      const t = e.touches[0];
      if (e.preventDefault) e.preventDefault();
      state.tx += (t.clientX - touchPan.x); state.ty += (t.clientY - touchPan.y);
      touchPan = { x: t.clientX, y: t.clientY }; clampPan(); applyTransform(); drawMinimapSafe();
    }
  }, { passive: false });

  /* keyboard zoom/fit on the host */
  on(container, 'keydown', function (e) {
    const k = e && e.key;
    if (k === '+' || k === '=') { zoomBy(1.2); if (e.preventDefault) e.preventDefault(); }
    else if (k === '-' || k === '_') { zoomBy(1 / 1.2); if (e.preventDefault) e.preventDefault(); }
    else if (k === '0') { fit(); if (e.preventDefault) e.preventDefault(); }
  });

  /* ---------- first paint ---------- */
  renderToolbar();
  renderLegend();
  setStyle(detail, { display: 'none' });
  render();
  fit();

  /* public handle */
  return {
    model: M, state: state,
    focus: function (key) { if (M.entByKey[key]) { state.focusKey = key; showDetail(M.entByKey[key]); render(); } },
    clearFocus: function () { hideDetail(); },
    fit: function () { fit(); },
    reset: function () { state.focusKey = null; hideDetail(); render(); fit(); },
    destroy: function () { clear(container); },
  };
}

/* ============================================================
 * STYLES — single injected tag. e2e-safe injection (createTextNode + setAttribute),
 * never touches style.setProperty. CRITICALLY: the host is `position:relative` and
 * bounded; there is NO position:fixed, NO inset:0 escaping to the viewport, and NO
 * 100vw/100vh anywhere. Overlays are absolute *within the bounded host* only.
 * ============================================================ */
function ensureStyleTag() {
  try { if (document.getElementById && document.getElementById('clg-styles')) return; } catch (_e) { /* ignore */ }
  const css = [
    /* the bounded in-page host — fills its parent card, never the viewport */
    '.clg-host{position:relative;width:100%;height:100%;min-height:520px;border-radius:10px;overflow:hidden;background:radial-gradient(1100px 620px at 38% 0%,#0e1219,#0a0d13);border:1px solid #232a36;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#e7edf5}',
    '.clg-host *{box-sizing:border-box}',
    '.clg-host:focus-visible{outline:2px solid #4d8df0;outline-offset:-2px}',
    '.clg-stage{position:absolute;inset:0;overflow:hidden}',
    '.clg-svg{position:absolute;inset:0;width:100%;height:100%;cursor:grab;display:block}',
    '.clg-svg:active{cursor:grabbing}',
    /* cooperative-gesture hint: bottom-centre pill, fades in/out via opacity */
    '.clg-hint{position:absolute;bottom:12px;left:50%;transform:translateX(-50%);font-size:11px;color:#8aa0bd;background:rgba(18,22,31,.82);border:1px solid #232a36;padding:4px 10px;border-radius:7px;opacity:0;transition:opacity .2s;pointer-events:none;z-index:4;white-space:nowrap}',
    '.clg-hot{filter:drop-shadow(0 0 3px rgba(240,97,109,.7))}',
    '.clg-node{cursor:pointer}',
    '.clg-node:focus-visible{outline:none}',
    /* toolbar: top-left, inside the host */
    '.clg-toolbar{position:absolute;top:10px;left:12px;display:flex;flex-wrap:wrap;align-items:center;gap:6px;background:rgba(18,22,31,.86);border:1px solid #232a36;border-radius:9px;padding:6px 8px;z-index:6}',
    '.clg-tb-label{font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:#8aa0bd;margin-right:1px}',
    '.clg-btn{background:#171c26;border:1px solid #232a36;color:#e7edf5;border-radius:7px;padding:4px 9px;font:inherit;font-size:12px;cursor:pointer;transition:background .1s,border-color .1s}',
    '.clg-btn:hover{background:#1d2430;border-color:#4d8df0}',
    '.clg-btn:focus-visible{outline:2px solid #4d8df0;outline-offset:2px}',
    '.clg-btn.sm{padding:4px 9px;font-size:11px}',
    '.clg-btn.primary{background:#1b3a6b;border-color:#2f66b0}',
    /* legend: top-right, inside the host */
    '.clg-legend{position:absolute;top:10px;right:12px;width:236px;max-height:calc(100% - 92px);overflow:auto;background:rgba(18,22,31,.95);border:1px solid #232a36;border-radius:10px;box-shadow:0 6px 22px rgba(0,0,0,.4);z-index:5}',
    '.clg-legend-head{display:flex;justify-content:space-between;align-items:center;padding:8px 11px;border-bottom:1px solid #232a36;font-weight:800;font-size:12px;position:sticky;top:0;background:rgba(18,22,31,.98)}',
    '.clg-legend-close{background:none;border:none;color:#8aa0bd;font-size:17px;cursor:pointer;line-height:1}',
    '.clg-legend-body{padding:7px 9px}',
    '.clg-legend-sec{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#8aa0bd;margin:8px 2px 3px;font-weight:700}',
    '.clg-legend-row{display:flex;align-items:center;gap:8px;padding:2px}',
    '.clg-legend-row.muted{opacity:.34}',
    '.clg-swatch{flex:none}',
    '.clg-legend-txt{font-size:11px;color:#c7d2e0;line-height:1.25}',
    /* detail: bottom-right side card, inside the host */
    '.clg-detail{position:absolute;right:12px;bottom:12px;width:248px;background:rgba(18,22,31,.97);border:1px solid #232a36;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.5);z-index:7;display:none}',
    '.clg-detail.open{display:block}',
    '.clg-detail-head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #232a36}',
    '.clg-detail-hh{min-width:0}',
    '.clg-detail-title{font-size:13px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.clg-detail-type{font-size:10.5px;color:#8aa0bd}',
    '.clg-detail-close{margin-left:auto;background:none;border:none;color:#8aa0bd;font-size:17px;cursor:pointer;flex:none}',
    '.clg-detail-tbl{padding:8px 12px}',
    '.clg-detail-row{display:flex;justify-content:space-between;gap:10px;padding:2px 0;font-size:11.5px}',
    '.clg-detail-k{color:#8aa0bd}',
    '.clg-detail-val{color:#e7edf5;font-weight:600;text-align:right}',
    '.clg-detail-flag{margin:2px 12px 8px;padding:5px 8px;background:rgba(240,97,109,.14);border:1px solid #f0616d;border-radius:6px;color:#f0616d;font-size:10.5px;font-weight:700}',
    '.clg-detail-why{margin:2px 12px 8px;padding:6px 9px;background:#12151d;border:1px solid #232a36;border-left:3px solid #e5a53b;border-radius:6px;color:#c7d2e0;font-size:11px;line-height:1.45}',
    '.clg-detail-foot{padding:0 12px 12px}',
    /* minimap: bottom-left, inside the host */
    '.clg-minimap{position:absolute;left:12px;bottom:12px;background:rgba(18,22,31,.9);border:1px solid #232a36;border-radius:8px;padding:6px;z-index:5}',
    '.clg-mini-label{font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:#8aa0bd;margin-bottom:3px}',
    '@media(max-width:820px){.clg-legend{display:none}.clg-detail{width:200px}}',
  ].join('\n');
  const tag = document.createElement('style');
  tag.setAttribute('id', 'clg-styles');
  tag.appendChild(document.createTextNode(css));
  (document.head || document.documentElement).appendChild(tag);
}
