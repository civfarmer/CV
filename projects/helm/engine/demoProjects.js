// ─────────────────────────────────────────────────────────────────────────────
// Demo projects A–D — four interweaving projects under the program header.
// Compact but real: dependencies, partial gates, approvals, guards, scenarios.
// Cross-project prerequisite links live in engine/portfolio.js.
// ─────────────────────────────────────────────────────────────────────────────

const T = (o) => ({ risk: 'medium', priority: 'P2', ...o });

// ── PROJECT A · Marketing Launch ─────────────────────────────────────────────
export const pa = {
  id: 'pa', name: 'Marketing Launch', client: 'Project A', demo: true,
  tagline: 'Campaign, creative and website for the spring release',
  start: '2026-01-12', days: 85, today: 16, mcSeed: 11,
  outcomes: ['Launch campaign live in step with product readiness', 'Website launched with approved brand', 'No budget spent ahead of a releasable product'],
  stages: [
    { id: 'a1', name: 'Foundations', from: 1, to: 20, gate: 'a_g1' },
    { id: 'a2', name: 'Production', from: 21, to: 45, gate: 'a_g2' },
    { id: 'a3', name: 'Launch window', from: 46, to: 85, gate: 'a_g3' },
  ],
  resources: [
    { id: 'mk', name: 'Marketing team', role: 'Campaign & channels', fte: 1 },
    { id: 'cr', name: 'Creative studio', role: 'Brand & assets', fte: 1 },
    { id: 'wb', name: 'Web team', role: 'Site build', fte: 1 },
    { id: 'ho', name: 'Head office', role: 'Brand approvals', fte: 0.2, external: true, approver: true },
  ],
  workstreams: [
    { id: 'mkt', name: 'Marketing', objective: 'Audience, channels, campaign sequencing — spend only when the product is ready.', lead: 'mk' },
    { id: 'cre', name: 'Creative', objective: 'Brand refresh, logo approval, asset production.', lead: 'cr' },
    { id: 'web', name: 'Website', objective: 'New site live for launch — gated on approved brand.', lead: 'wb' },
    { id: 'app', name: 'Stakeholder approval', objective: 'Head-office signoffs tracked and chased automatically.', lead: 'ho' },
  ],
  tasks: [
    T({ id: 'a01', ws: 'mkt', title: 'Audience research & segmentation', dur: 4, assignee: 'mk', deps: [], status: 'done', actualStart: 1, actualEnd: 5, desc: 'Who we sell to and why.', dod: 'Segments agreed.' }),
    T({ id: 'a02', ws: 'mkt', title: 'Campaign structure & channel plan', dur: 3, assignee: 'mk', deps: ['a01'], status: 'done', actualStart: 8, actualEnd: 10, desc: 'Channels, budget split, sequencing.', dod: 'Plan approved by lead.' }),
    T({ id: 'a03', ws: 'cre', title: 'Brand refresh concepts', dur: 4, assignee: 'cr', deps: [], status: 'done', actualStart: 1, actualEnd: 5, desc: 'Three routes including logo options.', dod: 'Route chosen.' }),
    T({ id: 'a04', ws: 'app', title: 'Logo approval — head office', dur: 1, assignee: 'ho', deps: ['a03'], priority: 'P1', approval: { wait: 4, by: 'Head office' }, desc: 'The gate everything brand-touching waits on.', dod: 'Written approval.' }),
    T({ id: 'a_g1', ws: 'mkt', title: 'GATE — Foundations approved', dur: 0.5, assignee: 'mk', deps: ['a02', 'a04'], priority: 'P1', milestone: true, desc: 'Plan + brand approved.', dod: 'Minuted.' }),
    T({ id: 'a05', ws: 'mkt', title: 'Copy platform & messaging house', dur: 3, assignee: 'mk', deps: ['a02'], canEarly: true, desc: 'Message hierarchy per segment.', dod: 'Copy deck signed.' }),
    T({ id: 'a06', ws: 'mkt', title: 'Press & partner list, outreach drafts', dur: 3, assignee: 'mk', deps: ['a05'], canEarly: true, risk: 'low', desc: 'Cheap, dependency-free, needed at launch.', dod: 'List + drafts ready.' }),
    T({ id: 'a07', ws: 'mkt', title: 'Ad account setup & tracking plan', dur: 2, assignee: 'mk', deps: ['a02'], canEarly: true, risk: 'low', desc: 'Accounts, pixels, UTM scheme.', dod: 'Test events firing.' }),
    T({ id: 'a08', ws: 'cre', title: 'Asset production — wave 1 (brand-dependent)', dur: 5, assignee: 'cr', deps: ['a04'], priority: 'P1', desc: 'Everything carrying the new logo.', dod: 'Asset pack v1.' }),
    T({ id: 'a09', ws: 'cre', title: 'Content drafts — wave 0 (brand-independent)', dur: 4, assignee: 'cr', deps: ['a03'], canEarly: true, risk: 'low', desc: 'Long-form drafts that need no final logo.', dod: 'Drafts in review.' }),
    T({ id: 'a10', ws: 'web', title: 'Site IA & wireframes', dur: 3, assignee: 'wb', deps: ['a02'], status: 'done', actualStart: 11, actualEnd: 15, desc: 'Structure before skin.', dod: 'IA signed off.' }),
    T({ id: 'a11', ws: 'web', title: 'Site build — templates & CMS', dur: 6, assignee: 'wb', deps: ['a10'], desc: 'Build with placeholder brand.', dod: 'Staging complete.' }),
    T({ id: 'a12', ws: 'web', title: 'Apply approved brand to site', dur: 2, assignee: 'wb', deps: ['a11', 'a04'], priority: 'P1', desc: 'Logo-dependent skinning.', dod: 'Brand QA passed.' }),
    T({ id: 'a13', ws: 'web', title: 'Site QA, analytics & privacy checks', dur: 2, assignee: 'wb', deps: ['a12'], priority: 'P1', desc: 'Auto-added when launch was detected in the brief.', autoGen: true, genReason: 'Added by the system — a website launch implies QA, analytics and privacy checks; none were in the brief.', dod: 'Checklist green.' }),
    T({ id: 'a_g2', ws: 'web', title: 'GATE — Launch-ready site & assets', dur: 0.5, assignee: 'wb', deps: ['a13', 'a08'], priority: 'P1', milestone: true, desc: 'Everything staged.', dod: 'Minuted.' }),
    T({ id: 'a14', ws: 'mkt', title: 'Paid campaign — flight 1 (spend)', dur: 5, assignee: 'mk', deps: ['a_g2', 'a07'], priority: 'P1', guard: { until: 'a_g2', reason: 'budget guard — no paid spend before a releasable product and launch-ready site' }, budgetCost: 24000, desc: 'First paid burst.', dod: 'Flight live, pacing on plan.' }),
    T({ id: 'a15', ws: 'web', title: 'Website launch', dur: 1, assignee: 'wb', deps: ['a_g2'], priority: 'P1', desc: 'DNS flip + monitoring window.', dod: 'Live and stable 48h.' }),
    T({ id: 'a16', ws: 'mkt', title: 'Press & partner outreach', dur: 2, assignee: 'mk', deps: ['a15', 'a06'], desc: 'Embargo lifts with the site.', dod: 'Coverage tracker running.' }),
    T({ id: 'a17', ws: 'mkt', title: 'Paid campaign — flight 2', dur: 4, assignee: 'mk', deps: ['a14'], budgetCost: 30000, desc: 'Scale what worked.', dod: 'CPA within target.' }),
    T({ id: 'a18', ws: 'mkt', title: 'Launch retro & handover to BAU', dur: 1, assignee: 'mk', deps: ['a16', 'a17'], desc: 'What worked, what to keep running.', dod: 'Retro written.' }),
    T({ id: 'a_g3', ws: 'mkt', title: 'GATE — Campaign complete', dur: 0.5, assignee: 'mk', deps: ['a18'], priority: 'P1', milestone: true, desc: 'Programme closes.', dod: 'Minuted.' }),
  ],
  decisions: [
    { id: 'ad1', title: 'Logo route sign-off scope', due: 14, grace: 2, what: 'Head office wants a second review round on the logo. That adds ~4 days to every brand-dependent task.', tried: 'Brand-independent work (copy, drafts, ad setup, IA) pulled forward so no one idles.', recommend: 'Accept one extra round; hold the launch window.', impact: 'Launch window holds if approval lands by Day 22.', blocks: [], options: [{ id: 'ok', label: 'Accept one extra review round', recommended: true }, { id: 'push', label: 'Escalate to CMO for same-week signoff' }] },
  ],
  risks: [
    { id: 'ar1', title: 'Logo approval slips past Day 22', prob: 40, impact: 'Website launch and asset wave 1 slip day-for-day', owner: 'ho', mitigation: 'Auto-chase + brand-independent work pulled forward', trend: 'up', linked: 'a04' },
    { id: 'ar2', title: 'Budget spent ahead of product readiness', prob: 20, impact: 'Paid flights land before there is anything to sell', owner: 'mk', mitigation: 'Spend guard on a14/a17 until launch-ready gate', trend: 'down', linked: 'a14' },
    { id: 'ar3', title: 'Web build underestimates CMS work', prob: 25, impact: 'Launch window compresses', owner: 'wb', mitigation: 'Placeholder-brand build de-risks the logo wait', trend: 'flat', linked: 'a11' },
  ],
  assumptions: [
    { id: 'aa1', text: 'Head-office approval turns around in ≤ 4 working days', status: 'at-risk', owner: 'ho' },
    { id: 'aa2', text: 'Campaign budget (€54k paid) releases only after the launch-ready gate', status: 'confirmed', owner: 'mk' },
    { id: 'aa3', text: 'Product release date holds (see Project B link)', status: 'holding', owner: 'mk' },
  ],
  approvals: [
    { id: 'aap1', title: 'Logo — head office', approver: 'Head office', due: 14, status: 'pending' },
    { id: 'aap2', title: 'Launch-ready gate', approver: 'Programme lead', due: 40, status: 'pending' },
  ],
  budget: [
    { id: 'ab1', label: 'Paid media — flight 1', amount: 24000, when: 41, status: 'held', guard: 'a_g2', guardNote: 'Spend guard: releases only at the launch-ready gate' },
    { id: 'ab2', label: 'Paid media — flight 2', amount: 30000, when: 48, status: 'held', guard: 'a14', guardNote: 'Sequenced behind flight-1 results' },
    { id: 'ab3', label: 'Creative production', amount: 18000, when: 20, status: 'committed', guard: null },
  ],
  liveEvents: [
    { t: 'blocker', task: 'a04', days: 5, at: 12, note: 'Logo approval delayed — head office requests a second review round', source: 'Head office', logged: 12 },
  ],
  scenarios: [
    { id: 'a-logo', title: 'Logo approval delay worsens', icon: 'HO', desc: 'Head office adds ANOTHER review round. Watch marketing stay productive while brand-dependent work resequences — and see when it finally escalates.', events: [{ t: 'blocker', task: 'a04', days: 6, at: 16, note: 'Third review round requested', source: 'Head office' }] },
    { id: 'a-burn', title: 'Budget burn pressure', icon: '€', desc: 'The team wants to start paid flights early. The spend guard holds — see the warning it raises instead.', events: [{ t: 'flag', task: 'a14', note: 'Team requests early spend release ahead of the readiness gate' }] },
  ],
};

// ── PROJECT B · Product Development ──────────────────────────────────────────
export const pb = {
  id: 'pb', name: 'Product Development', client: 'Project B', demo: true,
  tagline: 'Spring release — feature build on the new platform APIs',
  start: '2026-01-05', days: 80, today: 23, mcSeed: 12,
  outcomes: ['Releasable product by the launch window', 'Feature work gated on platform readiness, not guesses', 'Quality protected by an independent test lane'],
  stages: [
    { id: 'b1', name: 'Definition', from: 1, to: 15, gate: 'b_g1' },
    { id: 'b2', name: 'Build', from: 16, to: 55, gate: 'b_g2' },
    { id: 'b3', name: 'Harden & release', from: 56, to: 80, gate: 'b_g3' },
  ],
  resources: [
    { id: 'pm', name: 'Product team', role: 'Specs & delivery', fte: 1 },
    { id: 'ux', name: 'UX/UI', role: 'Design lane', fte: 1 },
    { id: 'fe', name: 'Feature engineers', role: 'Build lane', fte: 1 },
    { id: 'qa', name: 'Test team', role: 'Independent QA', fte: 0.8 },
  ],
  workstreams: [
    { id: 'prod', name: 'Product', objective: 'Specs, priorities, release plan.', lead: 'pm' },
    { id: 'uxui', name: 'UX / UI', objective: 'Flows and UI ready ahead of build.', lead: 'ux' },
    { id: 'feat', name: 'Feature build', objective: 'Platform-dependent work waits for the 50% API gate; independent work never idles.', lead: 'fe' },
    { id: 'test', name: 'Testing', objective: 'Independent verification; quality is a gate, not a hope.', lead: 'qa' },
  ],
  tasks: [
    T({ id: 'b01', ws: 'prod', title: 'Release scope & PRD', dur: 4, assignee: 'pm', deps: [], status: 'done', actualStart: 1, actualEnd: 5, desc: 'What ships in spring.', dod: 'PRD signed.' }),
    T({ id: 'b02', ws: 'uxui', title: 'Core flows & prototypes', dur: 5, assignee: 'ux', deps: ['b01'], status: 'done', actualStart: 8, actualEnd: 12, desc: 'Clickable flows for the two key journeys.', dod: 'Flows tested with 5 users.' }),
    T({ id: 'b_g1', ws: 'prod', title: 'GATE — Scope locked', dur: 0.5, assignee: 'pm', deps: ['b01', 'b02'], priority: 'P1', milestone: true, status: 'done', actualStart: 15, actualEnd: 15, desc: 'Definition done.', dod: 'Minuted.' }),
    T({ id: 'b03', ws: 'uxui', title: 'UI kit & screen specs', dur: 5, assignee: 'ux', deps: ['b_g1'], desc: 'Buildable specs.', dod: 'Specs accepted by engineers.', progress: 0.6, actualStart: 16 }),
    T({ id: 'b04', ws: 'feat', title: 'Feature build — platform-independent set', dur: 6, assignee: 'fe', deps: ['b_g1'], canEarly: true, desc: 'Everything that does not touch the new APIs.', dod: 'Merged behind flags.', progress: 0.4, actualStart: 16 }),
    T({ id: 'b05', ws: 'feat', title: 'Feature build — platform-dependent set', dur: 7, assignee: 'fe', deps: ['b04'], priority: 'P1', risk: 'high', desc: 'Needs the platform APIs at 50% (Project C link).', dod: 'End-to-end on staging APIs.', reqIn: 'Platform APIs ≥ 50% (Project C)' }),
    T({ id: 'b06', ws: 'prod', title: 'Instrumentation & metrics spec', dur: 2, assignee: 'pm', deps: ['b_g1'], canEarly: true, risk: 'low', desc: 'What we measure at release.', dod: 'Events listed.' }),
    T({ id: 'b07', ws: 'test', title: 'Test plan & environments', dur: 3, assignee: 'qa', deps: ['b_g1'], canEarly: true, desc: 'Coverage plan; envs stood up.', dod: 'Envs green.' }),
    T({ id: 'b08', ws: 'test', title: 'Test pass 1 — independent features', dur: 4, assignee: 'qa', deps: ['b04', 'b07'], desc: 'Early coverage while platform work lands.', dod: 'P1 defects zero.' }),
    T({ id: 'b09', ws: 'uxui', title: 'Design QA & polish backlog', dur: 3, assignee: 'ux', deps: ['b03', { id: 'b04', pct: 0.7 }], desc: 'Pixel pass on built screens.', dod: 'Polish list burned down.' }),
    T({ id: 'b10', ws: 'feat', title: 'Integration with platform APIs — full', dur: 5, assignee: 'fe', deps: ['b05'], priority: 'P1', risk: 'high', desc: 'The join to Project C, end to end.', dod: 'Contract tests pass.' }),
    T({ id: 'b11', ws: 'test', title: 'Test pass 2 — platform-dependent + regression', dur: 4, assignee: 'qa', deps: ['b10', 'b08'], priority: 'P1', desc: 'The quality gate for release.', dod: 'Regression suite green.' }),
    T({ id: 'b12', ws: 'prod', title: 'Release candidate & notes', dur: 2, assignee: 'pm', deps: [{ id: 'b11', pct: 0.6 }], priority: 'P1', desc: 'RC cut when pass 2 is 60% through.', dod: 'RC tagged.' }),
    T({ id: 'b_g2', ws: 'prod', title: 'GATE — Feature-complete RC', dur: 0.5, assignee: 'pm', deps: ['b12'], priority: 'P1', milestone: true, desc: 'RC exists; hardening starts.', dod: 'Minuted.' }),
    T({ id: 'b13', ws: 'feat', title: 'Hardening & performance fixes', dur: 4, assignee: 'fe', deps: ['b_g2'], risk: 'high', desc: 'Stability window.', dod: 'No open P1/P2.' }),
    T({ id: 'b14', ws: 'test', title: 'Release verification & signoff', dur: 2, assignee: 'qa', deps: ['b13'], priority: 'P1', approval: { wait: 2, by: 'QA lead' }, desc: 'Final quality signoff.', dod: 'Signed.' }),
    T({ id: 'b_g3', ws: 'prod', title: 'GATE — Releasable product', dur: 0.5, assignee: 'pm', deps: ['b14'], priority: 'P1', milestone: true, desc: 'Project A campaign + Project D training key off this.', dod: 'Minuted.' }),
  ],
  decisions: [
    { id: 'bd1', title: 'Ship without the secondary journey?', due: 50, grace: 2, what: 'If platform APIs slip further, the secondary journey may not harden in time.', tried: 'Journey isolated behind a flag so it can drop cleanly.', recommend: 'Decide at Day 50 based on pass-2 results.', impact: 'Dropping it saves 6 build days; costs a roadmap promise.', blocks: [], options: [{ id: 'keep', label: 'Keep full scope', recommended: true }, { id: 'drop', label: 'Drop secondary journey (phase two)', dropTasks: [] }] },
  ],
  risks: [
    { id: 'br1', title: 'Platform APIs late past 50% (Project C)', prob: 35, impact: 'Dependent build queue slips day-for-day', owner: 'fe', mitigation: 'Independent set pulled forward; cross-link monitored', trend: 'flat', linked: 'b05' },
    { id: 'br2', title: 'Pass-2 finds structural defects', prob: 25, impact: 'Hardening window blows out', owner: 'qa', mitigation: 'Pass-1 early coverage; contract tests on the join', trend: 'flat', linked: 'b11' },
  ],
  assumptions: [
    { id: 'ba1', text: 'Platform APIs (Project C) hit 50% by Day 30 of B', status: 'holding', owner: 'fe' },
    { id: 'ba2', text: 'QA lane stays independent of build pressure', status: 'confirmed', owner: 'qa' },
  ],
  approvals: [
    { id: 'bap1', title: 'Release verification', approver: 'QA lead', due: 72, status: 'pending' },
  ],
  budget: [],
  liveEvents: [],
  scenarios: [
    { id: 'b-backend', title: 'Backend slips below threshold', icon: 'API', desc: 'Project C APIs slow down — the 50% gate moves. Dependent build waits; independent build and QA prep pull forward.', events: [{ t: 'notbefore', task: 'b05', day: 34, note: 'Platform APIs (Project C) now forecast to reach 50% on B-Day 34' }] },
    { id: 'b-quality', title: 'Pass-2 defect spike', icon: 'QA', desc: 'Structural defects in the platform join — hardening stretches and the release gate is threatened.', events: [{ t: 'delay', task: 'b11', days: 4, note: 'Defect spike on the platform join' }, { t: 'delay', task: 'b13', days: 3, note: 'Structural fixes' }] },
  ],
};

// ── PROJECT C · Backend / Technical Infrastructure ───────────────────────────
export const pc = {
  id: 'pc', name: 'Backend Infrastructure', client: 'Project C', demo: true,
  tagline: 'Platform APIs, data layer and deployment for the spring release',
  start: '2025-12-29', days: 70, today: 30, mcSeed: 13,
  outcomes: ['Platform APIs live for Project B', 'Security signoff before anything ships', 'One-command deployment with rollback'],
  stages: [
    { id: 'c1', name: 'Foundations', from: 1, to: 20, gate: 'c_g1' },
    { id: 'c2', name: 'API build', from: 21, to: 50, gate: 'c_g2' },
    { id: 'c3', name: 'Deploy readiness', from: 51, to: 70, gate: 'c_g3' },
  ],
  resources: [
    { id: 'be', name: 'Backend team', role: 'API build', fte: 1 },
    { id: 'da', name: 'Dana Whitfield', role: 'Data engineer (SHARED with Project D)', fte: 0.8, shared: true },
    { id: 'se', name: 'Security', role: 'Review & signoff', fte: 0.3, external: true, approver: true },
    { id: 'dv', name: 'DevOps', role: 'Pipeline & deploy', fte: 0.8 },
  ],
  workstreams: [
    { id: 'bck', name: 'Backend', objective: 'The platform APIs Project B builds on.', lead: 'be' },
    { id: 'dat', name: 'Data', objective: 'Schema, migrations, reporting feeds.', lead: 'da' },
    { id: 'sec', name: 'Security', objective: 'Signoff is a gate; evidence exportable.', lead: 'se' },
    { id: 'dvp', name: 'DevOps', objective: 'Deploy with rollback; boring on purpose.', lead: 'dv' },
  ],
  tasks: [
    T({ id: 'c01', ws: 'bck', title: 'Architecture & API contracts', dur: 5, assignee: 'be', deps: [], status: 'done', actualStart: 1, actualEnd: 5, desc: 'Contracts Project B codes against.', dod: 'Contracts published.' }),
    T({ id: 'c02', ws: 'dat', title: 'Schema design & migration plan', dur: 4, assignee: 'da', deps: ['c01'], status: 'done', actualStart: 8, actualEnd: 12, desc: 'Data layer under the APIs.', dod: 'Schema reviewed.' }),
    T({ id: 'c03', ws: 'dvp', title: 'CI pipeline & environments', dur: 4, assignee: 'dv', deps: [], status: 'done', actualStart: 1, actualEnd: 8, desc: 'Build, test, deploy lanes.', dod: 'Green pipeline.' }),
    T({ id: 'c_g1', ws: 'bck', title: 'GATE — Foundations ready', dur: 0.5, assignee: 'be', deps: ['c01', 'c02', 'c03'], priority: 'P1', milestone: true, status: 'done', actualStart: 15, actualEnd: 15, desc: 'Build can start.', dod: 'Minuted.' }),
    T({ id: 'c04', ws: 'bck', title: 'API build — core services', dur: 10, assignee: 'be', deps: ['c_g1'], priority: 'P1', risk: 'high', desc: 'The 50% Project B waits for lands mid-way through this.', dod: 'Core endpoints on staging.', progress: 0.55, actualStart: 16 }),
    T({ id: 'c05', ws: 'dat', title: 'Migrations & seed data', dur: 5, assignee: 'da', deps: ['c02', { id: 'c04', pct: 0.3 }], desc: 'Runs against real schema.', dod: 'Migration dry-run clean.', progress: 0.4, actualStart: 22 }),
    T({ id: 'c06', ws: 'bck', title: 'API build — extended services', dur: 6, assignee: 'be', deps: ['c04'], priority: 'P1', desc: 'Remaining endpoints.', dod: 'Full surface on staging.' }),
    T({ id: 'c07', ws: 'dat', title: 'Reporting feeds & warehouse sync', dur: 5, assignee: 'da', deps: ['c05'], desc: 'Exec dashboards read from this.', dod: 'Feeds reconciling.' }),
    T({ id: 'c08', ws: 'sec', title: 'Threat model & security review', dur: 2, assignee: 'se', deps: [{ id: 'c04', pct: 0.6 }], priority: 'P1', approval: { wait: 3, by: 'Security' }, desc: 'Review starts once core is 60% real.', dod: 'Findings logged.' }),
    T({ id: 'c09', ws: 'bck', title: 'Fix security findings', dur: 3, assignee: 'be', deps: ['c08'], priority: 'P1', risk: 'high', desc: 'Findings are a gate, not advice.', dod: 'All highs closed.' }),
    T({ id: 'c10', ws: 'dvp', title: 'Load & failure testing', dur: 3, assignee: 'dv', deps: [{ id: 'c06', pct: 0.5 }], desc: 'Break it before users do.', dod: 'SLOs met under load.' }),
    T({ id: 'c_g2', ws: 'bck', title: 'GATE — API surface complete', dur: 0.5, assignee: 'be', deps: ['c06', 'c09'], priority: 'P1', milestone: true, desc: 'Project B full integration keys off this.', dod: 'Minuted.' }),
    T({ id: 'c11', ws: 'dvp', title: 'Deployment runbooks & rollback drill', dur: 3, assignee: 'dv', deps: ['c10'], priority: 'P1', desc: 'Practised, not written.', dod: 'Drill executed clean.' }),
    T({ id: 'c12', ws: 'sec', title: 'Security signoff — production', dur: 1, assignee: 'se', deps: ['c09', 'c11'], priority: 'P1', approval: { wait: 3, by: 'Security' }, desc: 'Production go-ahead.', dod: 'Signed.' }),
    T({ id: 'c13', ws: 'dvp', title: 'Production deploy & observe window', dur: 2, assignee: 'dv', deps: ['c12'], risk: 'high', desc: 'Staged rollout with rollback armed.', dod: '72h stable.' }),
    T({ id: 'c_g3', ws: 'dvp', title: 'GATE — Deployment readiness proven', dur: 0.5, assignee: 'dv', deps: ['c13'], priority: 'P1', milestone: true, desc: 'Platform is boring. Good.', dod: 'Minuted.' }),
  ],
  decisions: [],
  risks: [
    { id: 'cr1', title: 'Core API build overruns', prob: 30, impact: 'Project B 50% gate slips — cross-project cascade', owner: 'be', mitigation: 'Cross-link monitored; B independent work pulled forward automatically', trend: 'flat', linked: 'c04' },
    { id: 'cr2', title: 'Security findings require rework', prob: 30, impact: 'Gate 2 slips; deploy window compresses', owner: 'se', mitigation: 'Early threat model at 60% build', trend: 'flat', linked: 'c09' },
    { id: 'cr3', title: 'Shared data engineer pulled to Project D', prob: 35, impact: 'Migrations and feeds stall', owner: 'da', mitigation: 'Portfolio-level shared-resource watch', trend: 'up', linked: 'c07' },
  ],
  assumptions: [
    { id: 'ca1', text: 'Dana (data engineer) is 0.8 FTE here — Project D draws the rest', status: 'at-risk', owner: 'da' },
    { id: 'ca2', text: 'Security review slots available within 3 days of request', status: 'holding', owner: 'se' },
  ],
  approvals: [
    { id: 'cap1', title: 'Security review', approver: 'Security', due: 40, status: 'booked' },
    { id: 'cap2', title: 'Production signoff', approver: 'Security', due: 60, status: 'pending' },
  ],
  budget: [],
  liveEvents: [],
  scenarios: [
    { id: 'c-testing', title: 'Load-test failure', icon: 'LT', desc: 'Failure testing finds a scaling wall — extended build re-opens and the deploy window compresses.', events: [{ t: 'delay', task: 'c10', days: 3, note: 'Scaling wall under load' }, { t: 'delay', task: 'c06', days: 3, note: 'Connection-pool rework' }] },
    { id: 'c-security', title: 'Security signoff delayed', icon: 'SE', desc: 'Security cannot review until next week — watch the deploy chain resequence and the escalation logic weigh the deadline.', events: [{ t: 'blocker', task: 'c12', days: 5, at: 30, note: 'Security review slot moved a week', source: 'Security' }] },
  ],
};

// ── PROJECT D · Operations / Client Delivery ─────────────────────────────────
export const pd = {
  id: 'pd', name: 'Operations & Client Delivery', client: 'Project D', demo: true,
  tagline: 'Client onboarding, documentation, compliance and handover',
  start: '2026-01-19', days: 90, today: 9, mcSeed: 14,
  outcomes: ['Client accepts against written criteria', 'Support and docs ready before go-live', 'Compliance evidence exportable on demand'],
  stages: [
    { id: 'd1', name: 'Prepare', from: 1, to: 20, gate: 'd_g1' },
    { id: 'd2', name: 'Enable', from: 21, to: 60, gate: 'd_g2' },
    { id: 'd3', name: 'Accept & handover', from: 61, to: 90, gate: 'd_g3' },
  ],
  resources: [
    { id: 'op', name: 'Operations', role: 'Process & readiness', fte: 1 },
    { id: 'cs', name: 'Client success', role: 'Client-facing lane', fte: 0.8 },
    { id: 'cp', name: 'Compliance', role: 'Evidence & signoff', fte: 0.5 },
    { id: 'dw', name: 'Dana Whitfield', role: 'Data engineer (SHARED with Project C)', fte: 0.2, shared: true },
    { id: 'dc', name: 'Documentation', role: 'Docs & training material', fte: 0.8 },
  ],
  workstreams: [
    { id: 'ops', name: 'Operations', objective: 'Run-books, support model, readiness.', lead: 'op' },
    { id: 'cli', name: 'Client success', objective: 'Acceptance criteria agreed early; no surprise at signoff.', lead: 'cs' },
    { id: 'cmp', name: 'Compliance', objective: 'Evidence gathered as work happens, not after.', lead: 'cp' },
    { id: 'doc', name: 'Documentation', objective: 'Docs and training that track the product, not lag it.', lead: 'dc' },
  ],
  tasks: [
    T({ id: 'd01', ws: 'cli', title: 'Acceptance criteria — agreed with client', dur: 3, assignee: 'cs', deps: [], priority: 'P1', status: 'done', actualStart: 1, actualEnd: 3, desc: 'Auto-added: client-facing delivery implies written acceptance criteria.', autoGen: true, genReason: 'Added by the system — client delivery had no written acceptance criteria; signoff would have been contestable.', dod: 'Client counter-signed.' }),
    T({ id: 'd02', ws: 'ops', title: 'Support model & escalation routes', dur: 3, assignee: 'op', deps: [], status: 'done', actualStart: 1, actualEnd: 3, desc: 'Who answers what, how fast.', dod: 'Rota agreed.' }),
    T({ id: 'd03', ws: 'cmp', title: 'Compliance requirements map', dur: 3, assignee: 'cp', deps: [], desc: 'What evidence is needed, by when.', dod: 'Register populated.', progress: 0.7, actualStart: 4 }),
    T({ id: 'd04', ws: 'doc', title: 'Documentation architecture & templates', dur: 2, assignee: 'dc', deps: [], status: 'done', actualStart: 1, actualEnd: 2, desc: 'Structure before words.', dod: 'Templates approved.' }),
    T({ id: 'd_g1', ws: 'ops', title: 'GATE — Delivery framework agreed', dur: 0.5, assignee: 'op', deps: ['d01', 'd02', 'd03', 'd04'], priority: 'P1', milestone: true, desc: 'Everyone knows what done means.', dod: 'Minuted.' }),
    T({ id: 'd05', ws: 'doc', title: 'User & admin documentation — draft', dur: 6, assignee: 'dc', deps: ['d_g1'], desc: 'Tracks the product as B builds it.', dod: 'Draft covers shipped features.' }),
    T({ id: 'd06', ws: 'ops', title: 'Operational data feeds & reporting', dur: 4, assignee: 'dw', deps: ['d_g1'], desc: 'Needs Dana — shared with Project C.', dod: 'Feeds live in ops dashboard.', reqIn: 'Dana Whitfield (shared with Project C)' }),
    T({ id: 'd07', ws: 'cli', title: 'Client environment & access setup', dur: 3, assignee: 'cs', deps: ['d_g1'], desc: 'Client sandbox ready for training.', dod: 'Client logs in clean.' }),
    T({ id: 'd08', ws: 'cmp', title: 'Evidence pack — build as-you-go', dur: 5, assignee: 'cp', deps: ['d03'], canEarly: true, risk: 'low', desc: 'Collected during delivery, not after.', dod: 'Pack current at each gate.' }),
    T({ id: 'd09', ws: 'cli', title: 'Client training — needs releasable product', dur: 4, assignee: 'cs', deps: ['d07'], priority: 'P1', desc: 'Gated on Project B releasable RC (cross-link).', dod: 'Client team certified.', reqIn: 'Releasable product (Project B gate 3)' }),
    T({ id: 'd10', ws: 'doc', title: 'Documentation — final against RC', dur: 3, assignee: 'dc', deps: ['d05', 'd09'], desc: 'Docs match what ships.', dod: 'Docs reviewed against RC.' }),
    T({ id: 'd_g2', ws: 'cli', title: 'GATE — Client enabled', dur: 0.5, assignee: 'cs', deps: ['d09', 'd06'], priority: 'P1', milestone: true, desc: 'Client can run it.', dod: 'Minuted.' }),
    T({ id: 'd11', ws: 'ops', title: 'Go-live rehearsal with client', dur: 2, assignee: 'op', deps: ['d_g2'], priority: 'P1', desc: 'Dry run against acceptance criteria.', dod: 'Rehearsal passes all criteria.' }),
    T({ id: 'd12', ws: 'cmp', title: 'Compliance signoff', dur: 1, assignee: 'cp', deps: ['d08', 'd11'], priority: 'P1', approval: { wait: 3, by: 'Compliance officer' }, desc: 'Evidence pack accepted.', dod: 'Signed.' }),
    T({ id: 'd13', ws: 'cli', title: 'Final acceptance — client signoff', dur: 1, assignee: 'cs', deps: ['d11', 'd12'], priority: 'P1', approval: { wait: 3, by: 'Client sponsor' }, desc: 'Against the Day-1 criteria. No surprises.', dod: 'Countersigned.' }),
    T({ id: 'd14', ws: 'ops', title: 'Handover to BAU & support', dur: 2, assignee: 'op', deps: ['d13'], desc: 'Delivery team steps back.', dod: 'Support owns the queue.' }),
    T({ id: 'd_g3', ws: 'ops', title: 'GATE — Accepted & handed over', dur: 0.5, assignee: 'op', deps: ['d14'], priority: 'P1', milestone: true, desc: 'Programme obligation closes.', dod: 'Minuted.' }),
  ],
  decisions: [
    { id: 'dd1', title: 'Train on pre-release build?', due: 30, grace: 2, what: 'If Project B\u2019s RC slips, training could run on a pre-release build to hold the date — with re-certification risk.', tried: 'Training material staged; sandbox ready; cross-link watched.', recommend: 'Hold for the RC unless slip exceeds 5 days.', impact: 'Training on pre-release risks re-runs; waiting risks the acceptance date.', blocks: [], options: [{ id: 'wait', label: 'Hold for the releasable RC', recommended: true }, { id: 'pre', label: 'Train on pre-release, re-certify later' }] },
  ],
  risks: [
    { id: 'dr1', title: 'Releasable product (B) arrives late', prob: 35, impact: 'Training, docs-final and acceptance chain slips', owner: 'cs', mitigation: 'Cross-link monitored; decision dd1 pre-staged', trend: 'flat', linked: 'd09' },
    { id: 'dr2', title: 'Dana unavailable (shared with C)', prob: 35, impact: 'Ops feeds stall; enablement gate at risk', owner: 'dw', mitigation: 'Portfolio shared-resource watch; scope is 4 days total', trend: 'up', linked: 'd06' },
    { id: 'dr3', title: 'Client sponsor slow to sign', prob: 25, impact: 'Acceptance drifts past handover window', owner: 'cs', mitigation: 'Criteria agreed Day 1; rehearsal evidence attached', trend: 'flat', linked: 'd13' },
  ],
  assumptions: [
    { id: 'da1', text: 'Client sponsor available for rehearsal and signoff week', status: 'holding', owner: 'cs' },
    { id: 'da2', text: 'Dana\u2019s split holds at 0.8 C / 0.2 D', status: 'at-risk', owner: 'dw' },
  ],
  approvals: [
    { id: 'dap1', title: 'Compliance signoff', approver: 'Compliance officer', due: 72, status: 'pending' },
    { id: 'dap2', title: 'Client acceptance', approver: 'Client sponsor', due: 80, status: 'pending' },
  ],
  budget: [],
  liveEvents: [],
  scenarios: [
    { id: 'd-client', title: 'Client readiness slips', icon: 'CL', desc: 'The client team cannot attend training as planned — watch enablement resequence around their availability.', events: [{ t: 'blocker', task: 'd09', days: 5, at: 9, note: 'Client team unavailable for training week', source: 'Client' }] },
    { id: 'd-shared', title: 'Shared-resource conflict', icon: 'DW', desc: 'Project C pulls Dana full-time — D\u2019s ops feeds stall and the portfolio flags the cross-project conflict.', events: [{ t: 'blocker', task: 'd06', days: 6, at: 9, note: 'Dana pulled to Project C load-test rework', source: 'Project C' }] },
  ],
};
