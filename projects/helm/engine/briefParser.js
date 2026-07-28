// ─────────────────────────────────────────────────────────────────────────────
// Brief parser — turns anything from a one-line idea to a full documented brief
// into a schedulable project seed, with interrogation (implied tasks, missing
// info → assumptions). Heuristic stand-in for the production LLM pipeline;
// same output contract as the hand-built seeds.
// ─────────────────────────────────────────────────────────────────────────────

const TEAM_HINTS = [
  ['marketing', 'Marketing', ['campaign', 'brand', 'audience', 'launch comms', 'press', 'ads', 'seo', 'social']],
  ['product', 'Product', ['product', 'feature', 'prd', 'roadmap', 'spec']],
  ['design', 'Design', ['design', 'ux', 'ui', 'wireframe', 'prototype', 'figma']],
  ['engineering', 'Engineering', ['backend', 'frontend', 'api', 'develop', 'build', 'code', 'integrat', 'database', 'deploy', 'infra']],
  ['data', 'Data', ['data', 'migration', 'analytics', 'reporting', 'warehouse']],
  ['legal', 'Legal & Compliance', ['legal', 'compliance', 'privacy', 'gdpr', 'contract', 'policy', 'audit']],
  ['ops', 'Operations', ['operations', 'support', 'training', 'onboarding', 'documentation', 'rollout', 'handover', 'client']],
  ['security', 'Security', ['security', 'penetration', 'signoff', 'threat']],
];

const DUR_HINTS = [
  [/(review|approve|sign\s?-?off|confirm|agree|kick\s?-?off|decide)/i, 1],
  [/(draft|plan|design|map|define|scope|spec|research|audit|assess)/i, 2],
  [/(build|implement|develop|configure|create|produce|write|set\s?up|integrat)/i, 4],
  [/(migrate|test|pilot|train|roll\s?out|deploy|launch)/i, 3],
];

const clean = (s) => s.replace(/^[\s•·\-\*\d\.\)]+/, '').replace(/\s+/g, ' ').trim();

export function parseBrief(raw, opts = {}) {
  const text = (raw || '').trim();
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const notes = [];

  // ── name & horizon ──
  const first = lines[0] || 'Untitled project';
  const name = opts.name || clean(first.replace(/^#+\s*/, '')).slice(0, 60) || 'Untitled project';
  const dayMatch = text.match(/(\d{2,3})[\s-]*day/i);
  const weekMatch = text.match(/(\d{1,2})[\s-]*week/i);
  const monthMatch = text.match(/(\d{1,2})[\s-]*month/i);
  let days = dayMatch ? +dayMatch[1] : weekMatch ? +weekMatch[1] * 7 : monthMatch ? +monthMatch[1] * 30 : 0;
  if (!days) { days = 60; notes.push('No deadline stated — proposed a 60-day horizon (assumption, confirm).'); }
  days = Math.max(20, Math.min(180, days));

  // ── teams ──
  const lower = text.toLowerCase();
  const teams = TEAM_HINTS.filter(([, , kws]) => kws.some((k) => lower.includes(k)));
  if (!teams.length) teams.push(['delivery', 'Delivery', []]);
  if (teams.length > 4) teams.length = 4;

  // ── candidate tasks: bullets & meaningful lines ──
  const bulletish = lines.filter((l) => /^[\s]*[•·\-\*\d]/.test(l) || (l.length > 25 && l.length < 160 && !/^#+/.test(l)));
  let candidates = bulletish.map(clean).filter((l) => l.length > 12 && l.split(' ').length >= 3);
  const nameLower = name.toLowerCase();
  candidates = [...new Set(candidates)].filter((c) => c.toLowerCase() !== nameLower && !c.toLowerCase().startsWith(nameLower.slice(0, 24))).slice(0, 28);
  const explicitCount = candidates.length;
  if (!candidates.length) {
    // a bare idea — draft the canonical shape of any delivery
    candidates = ['Define scope, success criteria and constraints', 'Map stakeholders, owners and approvals', 'Draft the delivery plan and estimates', 'Produce the core deliverable', 'Review against success criteria', 'Prepare launch / handover', 'Close out and capture learnings'];
    notes.push('Brief was a short idea — drafted a canonical task set to refine (assumption).');
  }

  // ── implied tasks (interrogation) ──
  const implied = [];
  const add = (cond, title, why) => { if (cond && !candidates.some((c) => c.toLowerCase().includes(title.split(' ')[0].toLowerCase()))) implied.push({ title, why }); };
  add(/launch|go[\s-]?live|website|release/i.test(text), 'QA, analytics and rollback checks before launch', 'a launch implies QA, analytics, privacy and rollback preparation');
  add(/integrat|connect|sync|api/i.test(text), 'Integration approach: technology choice, field mapping, auth & error handling', 'connecting systems implies mapping, auth, retries and reconciliation work');
  add(/client|customer deliver/i.test(text), 'Agree written acceptance criteria with the client', 'client-facing delivery needs contestation-proof acceptance criteria');
  add(/complian|privacy|gdpr|audit/i.test(text), 'Evidence pack — build as you go', 'compliance deliverables imply exportable evidence and signoff');
  add(/migrat|data entry|import/i.test(text), 'Post-migration verification & reconciliation', 'migrations imply verification against source counts');
  add(/train|onboard/i.test(text), 'Training materials & session scheduling', 'training implies materials, scheduling and a competence check');
  add(true, 'Kick-off: confirm owners, decision route and review cadence', 'no named owner / approval route detected — placeholder until confirmed');

  // ── stages ──
  const nStages = days >= 75 ? 4 : 3;
  const cut = (i, n) => Math.round((days * i) / n);
  const stageNames = nStages === 4 ? ['Discovery', 'Design & plan', 'Build & test', 'Deliver & stabilise'] : ['Define', 'Build', 'Deliver'];
  const stages = stageNames.map((nm, i) => ({ id: 'st' + (i + 1), name: nm, from: cut(i, nStages) + 1, to: cut(i + 1, nStages), gate: 'g' + (i + 1) }));

  // ── resources & workstreams from teams ──
  const resources = teams.map(([id, label]) => ({ id, name: label + ' team', role: label, fte: 1 }));
  const workstreams = teams.map(([id, label]) => ({ id: 'ws_' + id, name: label, objective: label + ' scope for ' + name + '.', lead: id }));
  const wsFor = (title) => {
    const t = title.toLowerCase();
    for (const [id, , kws] of TEAM_HINTS) { if (teams.some(([tid]) => tid === id) && kws.some((k) => t.includes(k))) return 'ws_' + id; }
    return workstreams[0].id;
  };

  // ── build tasks: distribute across stages, sequential deps within a workstream ──
  const all = [...candidates.map((c) => ({ title: c, autoGen: false })), ...implied.map((i) => ({ title: i.title, autoGen: true, genReason: 'Added by the system — ' + i.why + '.' }))];
  const perStage = Math.ceil(all.length / nStages);
  const tasks = [];
  const lastInWs = {};
  all.forEach((c, i) => {
    const si = Math.min(nStages - 1, Math.floor(i / perStage));
    const ws = wsFor(c.title);
    const dur = (DUR_HINTS.find(([re]) => re.test(c.title)) || [null, 2])[1];
    const id = 'k' + String(i + 1).padStart(2, '0');
    const deps = [];
    if (lastInWs[ws]) deps.push(lastInWs[ws]);
    if (si > 0 && !deps.length) deps.push('g' + si);
    tasks.push({ id, ws, title: c.title.charAt(0).toUpperCase() + c.title.slice(1), dur, assignee: ws.replace('ws_', ''), deps, priority: i < 3 ? 'P1' : 'P2', risk: /launch|migrat|integrat|deploy/i.test(c.title) ? 'high' : 'medium', desc: c.autoGen ? c.genReason : 'From the brief.', dod: 'Output reviewed and accepted.', autoGen: c.autoGen, genReason: c.genReason, canEarly: dur <= 2 });
    lastInWs[ws] = id;
  });
  stages.forEach((st, i) => {
    const inStage = tasks.filter((t) => !t.milestone && Math.floor(tasks.indexOf(t) / perStage) === i);
    tasks.push({ id: st.gate, ws: workstreams[0].id, title: 'GATE ' + (i + 1) + ' — ' + st.name + ' accepted', dur: 0.5, assignee: resources[0].id, deps: inStage.slice(-Math.min(3, inStage.length)).map((t) => t.id), priority: 'P1', milestone: true, desc: 'Stage gate.', dod: 'Approval minuted.' });
  });

  // ── assumptions from missing info ──
  const assumptions = [];
  const miss = (cond, txt) => { if (cond) assumptions.push({ id: 'as' + (assumptions.length + 1), text: txt, status: 'pending-decision', owner: resources[0].id }); };
  miss(!/owner|responsib|lead/i.test(text), 'Owners are placeholders — no named owners in the brief');
  miss(!/budget|cost|£|\$|€/i.test(text), 'No budget stated — cost discipline rules default to "flag before spend"');
  miss(!/success|criteria|kpi|target/i.test(text), 'Success criteria drafted by the system — confirm with the sponsor');
  miss(!dayMatch && !weekMatch && !monthMatch, 'Deadline proposed by the system, not stated in the brief');
  miss(!/approv|sign\s?-?off/i.test(text), 'Approval route assumed to be a single sponsor sign-off per gate');

  const start = opts.start || (() => { const d = new Date(); const dow = d.getDay(); const add = dow === 1 ? 0 : (8 - dow) % 7; d.setDate(d.getDate() + add); return d.toISOString().slice(0, 10); })();

  const seed = {
    id: opts.id || 'custom_' + Date.now().toString(36),
    name, client: 'Sandbox', custom: true,
    tagline: (lines.find((l) => l !== first && l.length > 20 && l.length < 120) || 'Created from a brief by the system').slice(0, 110),
    start, days, today: 1, mcSeed: 5 + (name.length % 17),
    outcomes: candidates.slice(0, 4).map((c) => c.charAt(0).toUpperCase() + c.slice(1)),
    stages, resources, workstreams, tasks,
    decisions: [], risks: [
      { id: 'kr1', title: 'Estimates unvalidated (system-generated)', prob: 40, impact: 'Any task may be re-sized after review', owner: resources[0].id, mitigation: 'Review durations in week 1; the plan re-solves on every edit', trend: 'flat', linked: null },
    ],
    assumptions, approvals: [], budget: [], liveEvents: [], scenarios: [],
  };

  return {
    seed,
    analysis: {
      explicit: explicitCount, implied: implied.map((i) => i.title), impliedWhy: implied,
      assumptions: assumptions.map((a) => a.text),
      teams: teams.map(([, l]) => l), days, notes,
    },
  };
}
