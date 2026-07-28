// @ts-check
/**
 * Graph algorithms for the Sovereign Nexus entity/ownership network.
 * Pure functions over {nodes, edges}; no I/O, fully deterministic.
 *
 * Edge convention: an ownership/control edge points from OWNER -> OWNED,
 * i.e. edge.source owns/controls edge.target.
 */

/**
 * @typedef {{id:string, [k:string]:any}} GNode
 * @typedef {{source:string, target:string, rel_type?:string, ownership_pct?:number, [k:string]:any}} GEdge
 */

/**
 * Build undirected + directed adjacency maps.
 * @param {readonly GEdge[]} edges
 */
export function buildIndex(edges) {
  /** @type {Map<string, GEdge[]>} */
  const out = new Map(); // source -> edges
  /** @type {Map<string, GEdge[]>} */
  const inn = new Map(); // target -> edges
  /** @type {Map<string, Set<string>>} */
  const undirected = new Map();
  const add = (m, k, v) => {
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(v);
  };
  const link = (a, b) => {
    if (!undirected.has(a)) undirected.set(a, new Set());
    undirected.get(a).add(b);
  };
  for (const e of edges) {
    add(out, e.source, e);
    add(inn, e.target, e);
    link(e.source, e.target);
    link(e.target, e.source);
  }
  return { out, inn, undirected };
}

/**
 * Shortest connection path between two nodes (undirected BFS).
 * @param {readonly GEdge[]} edges
 * @param {string} from
 * @param {string} to
 * @returns {string[]|null} node ids from -> to, or null if unreachable
 */
export function shortestPath(edges, from, to) {
  if (from === to) return [from];
  const { undirected } = buildIndex(edges);
  const queue = [from];
  const prev = new Map([[from, null]]);
  while (queue.length) {
    const cur = queue.shift();
    const neigh = undirected.get(cur);
    if (!neigh) continue;
    for (const nx of neigh) {
      if (prev.has(nx)) continue;
      prev.set(nx, cur);
      if (nx === to) {
        const path = [nx];
        let p = cur;
        while (p != null) {
          path.unshift(p);
          p = prev.get(p);
        }
        return path;
      }
      queue.push(nx);
    }
  }
  return null;
}

/**
 * All node ids within k hops of a node (undirected).
 * @param {readonly GEdge[]} edges
 * @param {string} id
 * @param {number} [depth=1]
 * @returns {Set<string>}
 */
export function neighbourhood(edges, id, depth = 1) {
  const { undirected } = buildIndex(edges);
  const seen = new Set([id]);
  let frontier = [id];
  for (let d = 0; d < depth; d++) {
    /** @type {string[]} */
    const next = [];
    for (const n of frontier) {
      for (const nx of undirected.get(n) || []) {
        if (!seen.has(nx)) {
          seen.add(nx);
          next.push(nx);
        }
      }
    }
    frontier = next;
  }
  return seen;
}

/**
 * Immediate owners of a node (incoming ownership edges).
 * @param {readonly GEdge[]} edges
 * @param {string} id
 */
export function ownersOf(edges, id) {
  return edges.filter((e) => e.target === id && isOwnership(e)).map((e) => ({ id: e.source, pct: e.ownership_pct ?? null }));
}

/**
 * Trace ownership chains upward to ultimate beneficial owners, multiplying
 * ownership percentages along the way. Cycle-safe.
 * @param {readonly GNode[]} nodes
 * @param {readonly GEdge[]} edges
 * @param {string} startId
 * @returns {Array<{path:string[], effectivePct:number|null, ultimate:string}>}
 */
export function ownershipChains(nodes, edges, startId) {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  /** @type {Array<{path:string[], effectivePct:number|null, ultimate:string}>} */
  const chains = [];
  /**
   * @param {string} id
   * @param {string[]} path
   * @param {number|null} pct
   */
  function walk(id, path, pct) {
    const owners = ownersOf(edges, id).filter((o) => !path.includes(o.id));
    if (owners.length === 0) {
      chains.push({ path: [...path], effectivePct: pct, ultimate: id });
      return;
    }
    for (const o of owners) {
      const nextPct = pct == null || o.pct == null ? null : round2((pct * o.pct) / 100);
      const node = nodeById.get(o.id);
      const stop = node && (node.entity_type === 'person' || node.is_ubo);
      const newPath = [o.id, ...path];
      if (stop) chains.push({ path: newPath, effectivePct: nextPct, ultimate: o.id });
      else walk(o.id, newPath, nextPct);
    }
  }
  walk(startId, [startId], 100);
  return chains;
}

/**
 * Trace the control structure upward from a company to its ultimate beneficial
 * owner(s), returning both the chain summaries and the flat sets of node ids and
 * edge ids that lie on those chains — ready for the Network Explorer to highlight
 * the "trace to UBO" path. Cycle-safe (a circular ownership loop is reported but
 * not walked forever).
 * @param {readonly GNode[]} nodes
 * @param {readonly GEdge[]} edges
 * @param {string} startId
 * @returns {{ubos:string[], nodeIds:string[], edgeIds:string[], chains:Array<{path:string[], effectivePct:number|null, ultimate:string}>, circular:boolean}}
 */
export function traceToUBO(nodes, edges, startId) {
  const chains = ownershipChains(nodes, edges, startId);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const nodeSet = new Set([startId]);
  const ubos = new Set();
  for (const c of chains) {
    for (const id of c.path) nodeSet.add(id);
    const term = nodeById.get(c.ultimate);
    // a chain terminates at a UBO if it stops on a flagged UBO or a person
    if (term && (term.is_ubo || term.entity_type === 'person')) ubos.add(c.ultimate);
  }
  // collect the ownership edges whose endpoints are both on a traced chain
  const edgeIds = [];
  const onChainPair = new Set();
  for (const c of chains) for (let i = 0; i < c.path.length - 1; i++) { onChainPair.add(c.path[i] + '>' + c.path[i + 1]); }
  for (const e of edges) {
    if (!isOwnership(e)) continue;
    if (onChainPair.has(e.source + '>' + e.target)) edgeIds.push(e.id ?? (e.source + '>' + e.target));
  }
  const circular = detectCycles(edges.filter((e) => nodeSet.has(e.source) && nodeSet.has(e.target))).length > 0;
  return { ubos: [...ubos], nodeIds: [...nodeSet], edgeIds, chains, circular };
}

/**
 * All nodes that (directly or indirectly) control a node — the transitive set of
 * upstream owners following ownership/control edges. Cycle-safe.
 * @param {readonly GEdge[]} edges
 * @param {string} id
 * @returns {Set<string>}
 */
export function controllersOf(edges, id) {
  const inn = new Map();
  for (const e of edges) { if (!isOwnership(e)) continue; if (!inn.has(e.target)) inn.set(e.target, []); inn.get(e.target).push(e.source); }
  const seen = new Set();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop();
    for (const src of inn.get(cur) || []) if (!seen.has(src)) { seen.add(src); stack.push(src); }
  }
  return seen;
}

/**
 * All nodes (directly or indirectly) held/controlled by a node — the transitive
 * downstream set following ownership/control edges. Cycle-safe.
 * @param {readonly GEdge[]} edges
 * @param {string} id
 * @returns {Set<string>}
 */
export function holdingsOf(edges, id) {
  const out = new Map();
  for (const e of edges) { if (!isOwnership(e)) continue; if (!out.has(e.source)) out.set(e.source, []); out.get(e.source).push(e.target); }
  const seen = new Set();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop();
    for (const tgt of out.get(cur) || []) if (!seen.has(tgt)) { seen.add(tgt); stack.push(tgt); }
  }
  return seen;
}

/**
 * Detect directed ownership cycles (circular ownership).
 * @param {readonly GEdge[]} edges
 * @returns {string[][]} list of cycles (each a list of node ids)
 */
export function detectCycles(edges) {
  const { out } = buildIndex(edges.filter(isOwnership));
  const WHITE = 0, GRAY = 1, BLACK = 2;
  /** @type {Map<string, number>} */
  const color = new Map();
  const nodes = new Set();
  for (const e of edges) {
    if (isOwnership(e)) {
      nodes.add(e.source);
      nodes.add(e.target);
    }
  }
  for (const n of nodes) color.set(n, WHITE);
  /** @type {string[][]} */
  const cycles = [];
  /** @param {string} u @param {string[]} stack */
  function dfs(u, stack) {
    color.set(u, GRAY);
    stack.push(u);
    for (const e of out.get(u) || []) {
      const v = e.target;
      if (color.get(v) === GRAY) {
        const idx = stack.indexOf(v);
        if (idx >= 0) cycles.push(stack.slice(idx));
      } else if (color.get(v) === WHITE) {
        dfs(v, stack);
      }
    }
    stack.pop();
    color.set(u, BLACK);
  }
  for (const n of nodes) if (color.get(n) === WHITE) dfs(n, []);
  return dedupeCycles(cycles);
}

/**
 * Summarise a structure around a root entity for the flight-risk engine.
 * @param {readonly GNode[]} nodes
 * @param {readonly GEdge[]} edges
 * @param {string} rootId
 */
export function structureSummary(nodes, edges, rootId) {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const chains = ownershipChains(nodes, edges, rootId);
  const depth = chains.reduce((m, c) => Math.max(m, c.path.length - 1), 0);
  const memberIds = new Set();
  for (const c of chains) for (const id of c.path) memberIds.add(id);
  const members = [...memberIds].map((id) => nodeById.get(id)).filter(Boolean);
  const jurisdictions = new Set(members.map((m) => m.jurisdiction).filter(Boolean));
  const offshoreCount = members.filter((m) => m.is_offshore || m._offshore).length;
  const cycles = detectCycles(edges.filter((e) => memberIds.has(e.source) && memberIds.has(e.target)));
  const nominee = members.some((m) => m.is_nominee);
  const circular = cycles.length > 0;
  // Beneficial ownership is NOT fully attributable when any traced chain has an
  // unknown cumulative % (a link with a null ownership_pct), when a nominee is
  // interposed (the real owner is masked behind the nominee), or when a circular
  // loop breaks clean attribution. This turns the previously-dead
  // `incompleteOwnershipData` flight-risk factor into a real, derived signal.
  const unknownChainPct = chains.some((c) => c.effectivePct == null);
  const incomplete = unknownChainPct || nominee || circular;
  return {
    depth,
    jurisdictions: jurisdictions.size,
    maxSecrecy: Math.max(0, ...members.map((m) => m._secrecy ?? 0)),
    nominee,
    dormant: members.filter((m) => m.is_dormant).length,
    circular,
    offshore: members.length ? offshoreCount / members.length : 0,
    memberCount: members.length,
    incomplete,
    unknownChainPct,
  };
}

function isOwnership(e) {
  const t = e.rel_type || 'owns';
  return t === 'owns' || t === 'controls';
}
function dedupeCycles(cycles) {
  const seen = new Set();
  /** @type {string[][]} */
  const out = [];
  for (const c of cycles) {
    const key = [...c].sort().join('|');
    if (!seen.has(key)) {
      seen.add(key);
      out.push(c);
    }
  }
  return out;
}
function round2(x) {
  return Math.round(x * 100) / 100;
}
