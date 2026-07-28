// ─────────────────────────────────────────────────────────────────────────────
// Windrose — the primary 90-day showcase project (anonymised from the real brief)
// Client "Windrose" · Streamline→Relay, Juro→Accord, OneTrust→Sentinel,
// ServiceNow→CaseDesk, Close→Compass, Jira→Tracker, Airtable→GridWorks,
// Catylex→ClauseLens. Resourcing: Christopher Farmer 1.0 FTE (€90/h) + Crystal Morris
// (junior analyst) 0.6 FTE (€32/h) + external engineering / security / vendor lanes.
// Snapshot "today" = Day 23 (Stage 2 · Design).
// ─────────────────────────────────────────────────────────────────────────────

const T = (o) => ({ risk: 'medium', priority: 'P2', ...o });

export const windrose = {
  id: 'windrose',
  name: 'Legal Operations Implementation',
  client: 'Victory Finance',
  tagline: 'Delivery of the defined Relay and Accord operating model',
  start: '2026-01-05',
  days: 90,
  today: 23,
  mcSeed: 7,
  sourceDoc: 'Route A — Draft 90-Day Implementation Approach (client brief, PDF)',
  outcomes: [
    'One managed route for priority legal requests — named ownership, routing, approvals, SLA tracking',
    'Priority contract workflows configured in Accord (NDAs, MSAs & order forms, DPAs)',
    'Intake that identifies when a DPIA, LIA, transfer, security assessment or escalation is needed',
    'A controlled operational MVP: trained owners, dashboards, procedures, tested controls, phase-two backlog',
  ],
  stages: [
    { id: 's1', name: 'Implementation discovery', from: 1, to: 15, gate: 't111', intent: 'Validate and refine the defined implementation enough to build it safely.', outputs: 'validated implementation map; prioritised workflows; system and integration inventory; RACI; migration assessment; requirements and control register; confirmed MVP boundary.', gateText: 'Day-90 MVP, dependencies and provisional architecture approved.', note: 'Discovery here serves the defined plan rather than a wider architecture redesign.' },
    { id: 's2', name: 'Design', from: 16, to: 30, gate: 't212', intent: 'Agree the detailed configuration, data model and controls.', outputs: 'approved configuration workbook; source-of-truth model; data map; control matrix; integration design; migration and test plan.', gateText: 'Priority design and control model approved.' },
    { id: 's3', name: 'Build & pilot', from: 31, to: 60, gate: 't321', intent: 'Configure and test the agreed MVP.', outputs: 'working MVP; pilot results; defect log; UAT evidence; SOPs; trained pilot users.', gateText: 'Pilot accepted for controlled rollout.', note: 'Acceptance: correct routing and permissions; successful end-to-end processing; reliable reconciliation; no open priority-one defects; complete, exportable audit evidence; owner and user sign-off.' },
    { id: 's4', name: 'Roll out & stabilise', from: 61, to: 90, gate: 't411', intent: 'Release the agreed priority scope and move it into operation.', outputs: 'operational MVP; live priority workflows; trained owners; dashboards; documented controls; runbooks; phase-two backlog.', gateText: 'Operational handover and stabilisation plan agreed.' },
  ],
  boundary: {
    deps: ['Timely access to systems, licences, APIs and documentation.', 'Named Legal, Privacy, Security, business and technical owners.', 'An agreed review and decision timetable.', 'Vendor and internal engineering support.', 'Adequate migration and data-entry support.'],
    bold: 'Material changes to the target architecture would be handled through an agreed decision on scope, priority and timetable, not absorbed into the original commitment without a decision.',
    note: 'Historical migration would be prioritised by legal and operational value. Where substantial manual entry is needed and handled by one resource, lower-priority legacy backfill may continue after day 90.',
  },
  sot: [
    ['Commercial opportunity and customer context', 'Compass'],
    ['Legal request, matter, routing, risk status and SLA', 'Relay'],
    ['Contract, versions, metadata, signature and obligations', 'Accord'],
    ['Formal privacy records and assessments', 'Sentinel'],
    ['Enterprise compliance case, incident or remediation', 'CaseDesk'],
    ['Engineering or technical remediation', 'Tracker, when engineering work is actually involved'],
    ['Communication and notification', 'Chat and workspace docs'],
    ['Transitional or reference data', 'GridWorks, only where temporarily justified'],
    ['Contract intelligence', 'Accord initially; ClauseLens if a real extraction gap remains'],
  ],
  sotNote: 'Each relevant field has one authoritative home, with linked systems reading or referencing it rather than repeating manual entry.',
  resources: [
    { id: 'cf', name: 'Christopher Farmer', role: 'Implementation lead', fte: 1.0, dedicated: true, rate: 90 },
    { id: 'ma', name: 'Crystal Morris', role: 'Junior analyst (data entry: Accord & Relay)', fte: 0.6, dedicated: true, rate: 32 },
    { id: 'eng', name: 'Internal Engineering', role: 'Integration build lane', fte: 0.5, external: true },
    { id: 'sec', name: 'Security team', role: 'Assessments & signoff', fte: 0.2, external: true, approver: true },
    { id: 'ven', name: 'Accord vendor support', role: 'Config assistance', fte: 0.3, external: true },
  ],
  workstreams: [
    { id: 'disc', name: 'Discovery & current state', objective: 'Validate the defined implementation enough to build it safely — not an enterprise re-architecture.', lead: 'cf' },
    { id: 'design', name: 'Design & data model', objective: 'One authoritative home per record and field; intake, routing and control rules agreed.', lead: 'cf' },
    { id: 'config', name: 'Configuration — Relay & Accord', objective: 'Priority workflows and contract types configured and testable.', lead: 'cf' },
    { id: 'integ', name: 'Integrations & engineering', objective: 'Only the approved MVP integrations — authenticated, permissioned, reconciled.', lead: 'eng' },
    { id: 'priv', name: 'Privacy, security & compliance', objective: 'Assessments complete, triggers wired, evidence exportable.', lead: 'cf' },
    { id: 'migr', name: 'Migration & data entry', objective: 'Active matters first, by legal and operational value; legacy backfill may run past Day 90.', lead: 'ma' },
    { id: 'roll', name: 'Training & rollout', objective: 'Controlled staged release with trained owners and a stabilisation window.', lead: 'cf' },
  ],

  tasks: [
    // ── Stage 1 · Implementation discovery (Days 1–15) — complete ──
    T({ id: 'tkick', ws: 'disc', title: 'Stakeholder kick-off & decision timetable', dur: 0.5, assignee: 'cf', deps: [], priority: 'P1', risk: 'low', status: 'done', actualStart: 1, actualEnd: 1, autoGen: true, genReason: 'Added by the system — the brief requires an agreed review and decision timetable but had no task to establish it.', desc: 'Owners, review cadence and the decision route confirmed in one session.', dod: 'Decision timetable circulated and accepted.' }),
    T({ id: 't101', ws: 'disc', title: 'Review existing architecture & system maps', dur: 2, assignee: 'cf', deps: [], priority: 'P1', risk: 'low', status: 'done', actualStart: 1, actualEnd: 2, desc: 'Confirm which tools are live, part-configured, planned or waiting on other teams.', dod: 'Validated implementation map exists and is agreed.' }),
    T({ id: 't102', ws: 'disc', title: 'Confirm tool status & ownership', dur: 1, assignee: 'cf', deps: ['t101'], priority: 'P1', risk: 'low', status: 'done', actualStart: 3, actualEnd: 3, desc: 'Live / part-configured / planned / blocked, with a named technical owner per system.', dod: 'System & integration inventory columns complete.' }),
    T({ id: 't103', ws: 'disc', title: 'Map priority legal & contract workflows', dur: 3, assignee: 'cf', deps: ['t101'], priority: 'P1', status: 'done', actualStart: 4, actualEnd: 8, desc: 'Channels, owners, approvals, hand-offs, service levels, failure points.', dod: 'Prioritised workflow list with owners and failure points.' }),
    T({ id: 't104', ws: 'disc', title: 'Map privacy & compliance workflows', dur: 2, assignee: 'cf', deps: ['t103'], status: 'done', actualStart: 9, actualEnd: 10, desc: 'DPIA / LIA / transfer / security-assessment triggers and escalation routes.', dod: 'Trigger matrix drafted.' }),
    T({ id: 't105', ws: 'disc', title: 'Confirm licences, APIs, webhooks & vendor support', dur: 2, assignee: 'eng', deps: ['t102'], status: 'done', actualStart: 4, actualEnd: 8, desc: 'Technical feasibility of the integration set; sandbox availability.', dod: 'Access list confirmed in writing.' }),
    T({ id: 't106', ws: 'migr', title: 'Inventory active & legacy matters, contracts, data', dur: 4, assignee: 'ma', deps: [], status: 'done', actualStart: 1, actualEnd: 9, desc: 'Size the migration and manual-entry effort.', dod: 'Counted inventory with risk/renewal tags.' }),
    T({ id: 't107', ws: 'migr', title: 'Migration & manual-entry sizing', dur: 1, assignee: 'ma', deps: ['t106'], status: 'done', actualStart: 10, actualEnd: 11, desc: 'Effort model: records × minutes, by wave.', dod: 'Migration assessment signed by lead.' }),
    T({ id: 't108', ws: 'priv', title: 'Requirements, security, privacy & risk assessments', dur: 2, assignee: 'cf', deps: ['t103'], priority: 'P1', status: 'done', actualStart: 11, actualEnd: 12, desc: 'Including SRAs where the client requires them; retention, legal-hold and transfer needs.', dod: 'Requirements & control register populated.' }),
    T({ id: 't110', ws: 'disc', title: 'Agree day-90 MVP boundary & integration set (draft)', dur: 1, assignee: 'cf', deps: ['t108', 't105'], priority: 'P1', status: 'done', actualStart: 15, actualEnd: 15, desc: 'Log blockers to escalate; confirm what phase two will NOT include.', dod: 'MVP boundary document circulated.' }),
    T({ id: 't111', ws: 'disc', title: 'GATE 1 — MVP, dependencies & architecture approved', dur: 0.5, assignee: 'cf', deps: ['t110', 't104', 't107'], priority: 'P1', risk: 'low', status: 'done', actualStart: 15, actualEnd: 15, milestone: true, desc: 'Discovery serves the defined plan rather than a wider architecture redesign.', dod: 'Steering approval minuted.' }),

    // ── Stage 2 · Design (Days 16–30) — in progress ──
    T({ id: 't201', ws: 'design', title: 'Define work taxonomy & contract metadata', dur: 2, assignee: 'cf', deps: ['t111'], priority: 'P1', status: 'done', actualStart: 16, actualEnd: 17, desc: 'One shared language for matters and contract records.', dod: 'Taxonomy v1 approved by legal owners.' }),
    T({ id: 't202', ws: 'design', title: 'Confirm authoritative system per record & field', dur: 1, assignee: 'cf', deps: ['t201'], priority: 'P1', status: 'done', actualStart: 18, actualEnd: 18, desc: 'Source-of-truth model: linked systems read, never re-key.', dod: 'Source-of-truth table complete for all nine record types.' }),
    T({ id: 't203', ws: 'design', title: 'Establish shared matter / reference ID', dur: 1, assignee: 'cf', deps: ['t202'], priority: 'P1', status: 'done', actualStart: 19, actualEnd: 19, desc: 'The join key across Relay, Accord, Sentinel and CaseDesk.', dod: 'ID format and minting rules documented.' }),
    T({ id: 't204', ws: 'design', title: 'Set intake logic, routing, permissions, approvals & SLAs', dur: 2, assignee: 'cf', deps: ['t203'], priority: 'P1', actualStart: 22, desc: 'Who can raise what, where it goes, who approves, how fast.', dod: 'Routing rules table ready to configure.' }),
    T({ id: 't205', ws: 'design', title: 'Turn legal & regulatory requirements into system rules', dur: 1, assignee: 'cf', deps: ['t204'], priority: 'P1', desc: 'DPIA/LIA/transfer triggers as machine-readable conditions.', dod: 'Rule set peer-reviewed against the trigger matrix.' }),
    T({ id: 't206', ws: 'design', title: 'Define retention, deletion, legal-hold & evidence rules', dur: 1, assignee: 'cf', deps: ['t202'], canEarly: true, actualStart: 23, desc: 'What is kept, for how long, and what proves it.', dod: 'Retention schedule mapped to record types.' }),
    T({ id: 't207', ws: 'design', title: 'Field-level integration mappings', dur: 2, assignee: 'cf', deps: ['t202'], priority: 'P1', canSplit: true, desc: 'Field-by-field mapping for the MVP integration set.', dod: 'Mapping workbook complete for approved integrations.', reqIn: 'Engineering API sandbox' }),
    T({ id: 't208', ws: 'migr', title: 'Agree migration priorities & wave plan', dur: 1, assignee: 'ma', deps: ['t107', 't202'], desc: 'Higher-risk, renewing and operationally important records first.', dod: 'Wave plan approved by lead.' }),
    T({ id: 't209', ws: 'migr', title: 'UAT & release planning', dur: 1, assignee: 'ma', deps: ['t204'], desc: 'Test cases from real workflows; release calendar drafted.', dod: 'UAT plan reviewed.' }),
    T({ id: 't210', ws: 'design', title: 'Approved configuration workbook', dur: 1, assignee: 'cf', deps: ['t204', 't205', 't206'], priority: 'P1', desc: 'The single build reference for Stage 3.', dod: 'Workbook version-locked for build.' }),
    T({ id: 't211', ws: 'design', title: 'Integration design pack', dur: 1, assignee: 'cf', deps: ['t207'], priority: 'P1', desc: 'Auth model, retries, error handling, reconciliation design.', dod: 'Engineering accepts the pack as buildable.' }),
    T({ id: 't212', ws: 'design', title: 'GATE 2 — Priority design & control model approved', dur: 0.5, assignee: 'cf', deps: ['t210', 't211', 't208', 't209'], priority: 'P1', milestone: true, desc: 'Design gate: configuration workbook, source-of-truth model, data map, control matrix, integration design, migration & test plan.', dod: 'Steering approval minuted.' }),

    // ── Stage 3 · Build & pilot (Days 31–60) ──
    T({ id: 't301', ws: 'config', title: 'Configure priority Relay intake workflows', dur: 3, assignee: 'cf', deps: ['t212'], priority: 'P1', desc: 'The managed route for priority legal requests.', dod: 'End-to-end request flows in the sandbox.' }),
    T({ id: 't302', ws: 'config', title: 'Configure Relay routing, permissions & SLA tracking', dur: 2, assignee: 'cf', deps: ['t301'], priority: 'P1', desc: 'Named ownership and service-level clocks live.', dod: 'Routing matches the workbook, permission-tested.' }),
    T({ id: 't303', ws: 'config', title: 'Accord templates — NDAs', dur: 2, assignee: 'cf', deps: ['t212'], desc: 'First contract type end to end.', dod: 'NDA generated, approved, signed in sandbox.' }),
    T({ id: 't304', ws: 'config', title: 'Accord templates — MSAs & order forms', dur: 1, assignee: 'cf', deps: ['t303'], desc: 'Linked commercial paper with clause positions.', dod: 'MSA + order form pass playbook checks.' }),
    T({ id: 't305', ws: 'config', title: 'Accord templates — DPAs', dur: 1, assignee: 'cf', deps: ['t304'], desc: 'Privacy paper wired to Sentinel triggers.', dod: 'DPA flow raises the right assessments.' }),
    T({ id: 't306', ws: 'config', title: 'Accord playbooks, approval gates & post-signature tasks', dur: 2, assignee: 'cf', deps: ['t305'], priority: 'P1', desc: 'Fallback positions, escalation ladders, obligations capture.', dod: 'Playbook exercised on a real negotiation copy.' }),
    T({ id: 't307', ws: 'integ', title: 'Build integration — Compass → Relay (commercial context)', dur: 4, assignee: 'eng', deps: ['t211', 't212'], priority: 'P1', desc: 'Opportunity and customer context attached to intake.', dod: 'Round-trip verified with the shared reference ID.' }),
    T({ id: 't308', ws: 'integ', title: 'Build integration — Relay ↔ Accord (matter–contract link)', dur: 5, assignee: 'eng', deps: ['t307'], priority: 'P1', desc: 'The core join: matters and contracts stay in step.', dod: 'Create/update events reconcile both ways.' }),
    T({ id: 't309', ws: 'integ', title: 'Build integration — Accord → Sentinel (privacy triggers)', dur: 3, assignee: 'eng', deps: ['t308'], desc: 'Contract events raise the correct privacy records.', dod: 'DPIA/LIA/transfer triggers fire from test contracts.' }),
    T({ id: 't309b', ws: 'integ', title: 'Build integration — Tracker sync (engineering remediation)', dur: 4, assignee: 'eng', deps: ['t308'], priority: 'P3', desc: 'Fourth integration from the original scope — under decision.', dod: 'Tracker tickets mirror remediation tasks.' }),
    T({ id: 't310', ws: 'integ', title: 'Auth, access, API permissions & retries', dur: 2, assignee: 'eng', deps: ['t307'], desc: 'Least-privilege service accounts; retry and back-off policy.', dod: 'Security checklist items pass.' }),
    T({ id: 't311', ws: 'integ', title: 'Reconciliation & error handling', dur: 2, assignee: 'eng', deps: ['t308'], priority: 'P1', desc: 'Nightly reconciliation with alerting on drift.', dod: 'Induced-failure test recovers cleanly.' }),
    T({ id: 't312', ws: 'migr', title: 'Migration wave 1 — active matters into Relay', dur: 5, assignee: 'ma', deps: ['t208', { id: 't301', pct: 0.5 }], desc: 'Manual entry of in-flight matters, highest value first.', dod: 'Wave-1 records verified against inventory.' }),
    T({ id: 't313', ws: 'migr', title: 'Migration wave 2 — active contracts into Accord', dur: 5, assignee: 'ma', deps: ['t303', 't312'], desc: 'In-flight contracts with obligations captured.', dod: 'Wave-2 records pass spot-check (5% sample).' }),
    T({ id: 't314', ws: 'priv', title: 'Security review & signoff', dur: 1, assignee: 'sec', deps: ['t302', 't310'], priority: 'P1', approval: { wait: 3, by: 'Security team' }, desc: 'Access model and integration surface reviewed.', dod: 'Written signoff on record.' }),
    T({ id: 't315', ws: 'roll', title: 'Pilot preparation — scenarios & seeded data', dur: 1, assignee: 'cf', deps: ['t302', 't306'], desc: 'Standard, exception and higher-risk paths scripted.', dod: 'Pilot runbook agreed with champions.' }),
    T({ id: 't316', ws: 'roll', title: 'Run representative pilot (standard / exception / high-risk)', dur: 2, assignee: 'cf', deps: ['t315', 't309', 't311', { id: 't312', pct: 0.6 }], priority: 'P1', risk: 'high', desc: 'Routing, permissions, privacy triggers, approvals, audit evidence.', dod: 'All three paths complete end to end.' }),
    T({ id: 't317', ws: 'roll', title: 'Defect triage & fixes', dur: 2, assignee: 'cf', deps: ['t316'], priority: 'P1', risk: 'high', desc: 'No open priority-one defects is a gate condition.', dod: 'Defect log closed or accepted.' }),
    T({ id: 't318', ws: 'priv', title: 'UAT evidence pack (exportable audit evidence)', dur: 1, assignee: 'cf', deps: ['t316'], autoGen: true, genReason: 'Added by the system — the pilot acceptance criteria require complete, exportable audit evidence, and no task produced it.', desc: 'Screenshots, logs, approvals and reconciliations bundled.', dod: 'Evidence pack opens clean for an auditor.' }),
    T({ id: 't319', ws: 'roll', title: 'SOPs & administrator guidance', dur: 2, assignee: 'cf', deps: ['t306'], canEarly: true, desc: 'Concise procedures; admin runcards.', dod: 'A pilot champion completes a task using only the SOP.' }),
    T({ id: 't320', ws: 'roll', title: 'Train pilot champions & system owners', dur: 1, assignee: 'cf', deps: ['t319', 't315'], desc: 'Owners can run their own workflows.', dod: 'Champions signed off as ready.' }),
    T({ id: 't321', ws: 'roll', title: 'GATE 3 — Pilot accepted for controlled rollout', dur: 0.5, assignee: 'cf', deps: ['t317', 't318', 't320', 't314'], priority: 'P1', milestone: true, desc: 'Acceptance: correct routing & permissions; end-to-end processing; reliable reconciliation; no P1 defects; exportable evidence; owner & user sign-off.', dod: 'Acceptance minuted.' }),

    // ── Stage 4 · Roll out & stabilise (Days 61–90) ──
    T({ id: 'trollb', ws: 'roll', title: 'Rollback & issue-response plan for staged rollout', dur: 1, assignee: 'cf', deps: ['t321'], risk: 'low', canEarly: true, autoGen: true, genReason: 'Added by the system — launch tasks require rollback or issue-response time; the brief’s rollout stage had none.', desc: 'Rollback path per rollout stage; who acts, within what window.', dod: 'Rollback drill walked through with owners.' }),
    T({ id: 't401', ws: 'roll', title: 'Rollout stage 1 — legal request workflows live', dur: 2, assignee: 'cf', deps: ['t321'], priority: 'P1', desc: 'Controlled stage: priority intake routes only.', dod: 'Live traffic flowing; old route still available.' }),
    T({ id: 't402', ws: 'roll', title: 'Rollout stage 2 — contract workflows live', dur: 1, assignee: 'cf', deps: ['t401'], priority: 'P1', desc: 'NDAs first, then MSAs/order forms, then DPAs.', dod: 'New contracts start in Accord only.' }),
    T({ id: 't403', ws: 'roll', title: 'Redirect old intake routes', dur: 1, assignee: 'cf', deps: ['t402'], desc: 'Email/chat intake politely redirected with links.', dod: 'Old-route volume < 10% and falling.' }),
    T({ id: 't404', ws: 'roll', title: 'Operational & executive dashboards live', dur: 1, assignee: 'cf', deps: ['t401'], desc: 'SLA, volume, risk and budget views for owners and execs.', dod: 'Dashboards reviewed in a weekly meeting.' }),
    T({ id: 't405', ws: 'migr', title: 'Migration wave 3 — higher-risk & renewing records', dur: 5, assignee: 'ma', deps: ['t313', 't321'], desc: 'Precedence to higher-risk, renewing, operationally important.', dod: 'Wave-3 verified; renewals calendared.' }),
    T({ id: 't406', ws: 'roll', title: 'Hypercare & stabilisation window', dur: 2, assignee: 'cf', deps: ['t403'], risk: 'high', desc: 'Fast-response window with rollback path.', dod: 'No unresolved P1/P2 issues for five consecutive days.' }),
    T({ id: 't407', ws: 'priv', title: 'Runbooks, control evidence & governance pack', dur: 2, assignee: 'cf', deps: ['t404'], canEarly: true, desc: 'Documented controls; evidence generation is repeatable.', dod: 'Governance pack accepted by compliance owner.' }),
    T({ id: 't408', ws: 'roll', title: 'Confirm system & process owners', dur: 0.5, assignee: 'cf', deps: ['t407'], desc: 'Named, accepted, in the RACI.', dod: 'Owners listed and notified.' }),
    T({ id: 't409', ws: 'roll', title: 'Change control, review cadence & phase-two backlog', dur: 1, assignee: 'cf', deps: ['t408'], desc: 'How changes land after Day 90; prioritised backlog.', dod: 'Cadence booked; backlog ranked.' }),
    T({ id: 't410', ws: 'roll', title: 'Training rollout to all users', dur: 1, assignee: 'cf', deps: ['t402', 't320'], desc: 'Short, role-specific sessions; SOP links in-product.', dod: '90% of active users trained.' }),
    T({ id: 't411', ws: 'roll', title: 'GATE 4 — Operational handover & stabilisation agreed', dur: 0.5, assignee: 'cf', deps: ['t406', 't409', 't410', { id: 't405', pct: 0.8 }], priority: 'P1', milestone: true, desc: 'Operational MVP: live workflows, trained owners, dashboards, documented controls, runbooks, phase-two backlog.', dod: 'Handover minuted; stabilisation plan owned.' }),
    T({ id: 't412', ws: 'migr', title: 'Legacy backfill (lower-priority records)', dur: 8, assignee: 'ma', deps: ['t405'], priority: 'P3', phaseTwoOk: true, desc: 'Per the brief: lower-priority legacy backfill may continue after Day 90.', dod: 'Backfill burn-down tracked weekly.' }),
    T({ id: 'tref', ws: 'migr', title: 'Reference-data cleanup in GridWorks', dur: 2, assignee: 'ma', deps: [], priority: 'P3', risk: 'low', canEarly: true, notBefore: 20, desc: 'Transitional data tidied so migration waves land clean.', dod: 'Duplicate and orphan records resolved.' }),
    T({ id: 'tmac', ws: 'migr', title: 'Entry macros & matter templates for wave 1', dur: 2, assignee: 'ma', deps: ['t202'], priority: 'P3', risk: 'low', canEarly: true, desc: 'Prepared shortcuts so wave-1 entry runs faster.', dod: 'Macros tested on 10 sample records.' }),
    T({ id: 'tcomms', ws: 'roll', title: 'Champion comms & rollout notice drafts', dur: 2, assignee: 'ma', deps: ['t203'], priority: 'P3', risk: 'low', canEarly: true, desc: 'Drafted early — cheap, dependency-free, needed by Stage 4.', dod: 'Drafts reviewed by lead.' }),
  ],

  decisions: [
    {
      id: 'd1', title: 'Confirm the MVP integration set', due: 25, grace: 2,
      what: 'Internal engineering can commit to three integrations by Day 60 — Compass→Relay, Relay↔Accord, Accord→Sentinel. The fourth (Tracker sync) cannot be resourced this quarter.',
      tried: 'Re-sequenced field mapping to fit a three-integration design; held Tracker sync isolated so nothing downstream depends on it.',
      recommend: 'Approve the three-integration set and defer Tracker sync to phase two.',
      impact: 'Build starts on time with 3 integrations. Each day of delay past Day 26 pushes the pilot a day.',
      blocks: ['t307', 't309b'],
      options: [
        { id: 'a3', label: 'Approve the 3-integration set (defer Tracker sync)', dropTasks: ['t309b'], recommended: true },
        { id: 'all4', label: 'Insist on all four this quarter', delayTasks: [{ id: 't308', days: 3 }] },
      ],
    },
    {
      id: 'd2', title: 'Phase-two backlog sign-off', due: 86, grace: 0,
      what: 'The ranked phase-two backlog needs owner sign-off before handover.',
      tried: 'Backlog drafted and ranked from pilot findings and deferred scope.',
      recommend: 'Approve at the Day-86 review.',
      impact: 'Without sign-off, GATE 4 handover is incomplete.',
      blocks: [],
      options: [{ id: 'ok', label: 'Approve backlog', recommended: true }, { id: 'amend', label: 'Amend then approve' }],
    },
  ],

  risks: [
    { id: 'r1', title: 'Engineering API sandbox latency', prob: 45, impact: 'Field mapping & integration start slip', owner: 'eng', mitigation: 'Mapping split; unblocked half progressing from docs', trend: 'up', linked: 't207' },
    { id: 'r2', title: 'Design-gate approval wait exceeds 3 days', prob: 30, impact: 'Build start slips day-for-day', owner: 'cf', mitigation: 'Gate pack circulated early; pre-reads booked', trend: 'up', linked: 't212' },
    { id: 'r3', title: 'Accord vendor support latency', prob: 28, impact: 'Template build stretches', owner: 'ven', mitigation: 'Config windows pre-booked; vendor SLA invoked', trend: 'down', linked: 't303' },
    { id: 'r4', title: 'Migration sizing error > 20%', prob: 18, impact: 'Wave 2–3 overrun; backfill grows', owner: 'ma', mitigation: 'Re-size after wave 1 actuals', trend: 'flat', linked: 't312' },
    { id: 'r5', title: 'Single-resource dependency on implementation lead', prob: 15, impact: 'Any absence stops the critical chain', owner: 'cf', mitigation: 'SOPs early; analyst cross-trained on config basics', trend: 'flat', linked: null },
    { id: 'r6', title: 'Security review slot unavailable in window', prob: 35, impact: 'GATE 3 blocked by missing signoff', owner: 'sec', mitigation: 'Two chases sent; auto-escalates if unbooked by Day 27', trend: 'up', linked: 't314' },
    { id: 'r7', title: 'Scope creep — architecture change requests', prob: 22, impact: 'Original commitment absorbed without decision', owner: 'cf', mitigation: 'Delivery boundary: material changes go through a scope decision', trend: 'flat', linked: null },
    { id: 'r8', title: 'Legacy data quality worse than sampled', prob: 25, impact: 'Manual-entry effort grows; backfill extends past Day 90', owner: 'ma', mitigation: 'Brief allows post-90 backfill for low-priority records', trend: 'flat', linked: 't412' },
  ],

  assumptions: [
    { id: 'a1', text: 'Timely access to systems, licences, APIs and documentation', status: 'holding', owner: 'eng' },
    { id: 'a2', text: 'Named Legal, Privacy, Security, business and technical owners exist', status: 'confirmed', owner: 'cf' },
    { id: 'a3', text: 'An agreed review and decision timetable is honoured', status: 'at-risk', owner: 'cf' },
    { id: 'a4', text: 'Vendor and internal engineering support available as planned', status: 'holding', owner: 'ven' },
    { id: 'a5', text: 'Migration and data-entry support adequate (0.6 FTE analyst)', status: 'holding', owner: 'ma' },
    { id: 'a6', text: 'Three integrations are sufficient for the day-90 MVP', status: 'pending-decision', owner: 'cf' },
    { id: 'a7', text: 'Taxonomy stays stable after GATE 2', status: 'holding', owner: 'cf' },
    { id: 'a8', text: 'No enterprise-wide re-architecture inside this 90 days', status: 'confirmed', owner: 'cf' },
    { id: 'a9', text: 'Approvals turn around in ≤ 3 working days', status: 'at-risk', owner: 'cf' },
    { id: 'a10', text: 'Lower-priority legacy backfill may continue after Day 90', status: 'confirmed', owner: 'ma' },
  ],

  approvals: [
    { id: 'ap1', title: 'GATE 1 — MVP & architecture', approver: 'Legal & IT steering', due: 15, status: 'granted', day: 15 },
    { id: 'ap2', title: 'GATE 2 — Design & control model', approver: 'Legal & IT steering', due: 30, status: 'pending' },
    { id: 'ap3', title: 'Security review & signoff', approver: 'Security team', due: 48, status: 'unbooked' },
    { id: 'ap4', title: 'GATE 3 — Pilot acceptance', approver: 'Legal owners + champions', due: 60, status: 'pending' },
    { id: 'ap5', title: 'Accord vendor config change window', approver: 'Accord vendor', due: 40, status: 'booked' },
    { id: 'ap6', title: 'GATE 4 — Operational handover', approver: 'Ops steering', due: 90, status: 'pending' },
  ],

  // All figures in EUR. Illustrative, benchmarked to 2025–26 European category market rates
  // (not vendor quotes for any named product). Labour is real hourly rate × 7.5h/day × working
  // days, settled by monthly payroll in arrears (month-ends land on project Days 27/55/86/90 for
  // this 5 Jan start). Standard calendar: 5 working days/week, 7.5h/day.
  currency: 'EUR',
  budget: [
    { id: 'b1', label: 'Relay licences (year 1)', amount: 15000, when: 1, status: 'spent', guard: null, basis: 'Legal-request / matter-workflow SaaS for a small in-house team — European category benchmark ≈ €12k–€20k/yr.' },
    { id: 'b2', label: 'Accord licences (year 1)', amount: 21000, when: 1, status: 'spent', guard: null, basis: 'Mid-market CLM licence (contract lifecycle) — European category benchmark ≈ €14k–€45k/yr.' },
    { id: 'b3', label: 'Accord vendor configuration pack', amount: 10500, when: 34, status: 'committed', guard: 't212', guardNote: 'Not released until the design gate passes', basis: 'Vendor professional-services configuration — typically 30–70% of year-1 CLM licence (here ~50%).' },
    // Implementation lead — Christopher Farmer · €90/h × 7.5h = €675/day · 1.0 FTE · ~64 working days = €43,200.
    { id: 'b4', label: 'Implementation lead — Christopher Farmer (€90/h · 1.0 FTE)', amount: 43200, when: 1, status: 'payroll', guard: null,
      pay: [{ day: 27, amount: 12825 }, { day: 55, amount: 13500 }, { day: 86, amount: 14850 }, { day: 90, amount: 2025 }],
      basis: '€90/h × 7.5h/day = €675/day, full-time across ~64 working days. Settled by monthly payroll in arrears (Days 27/55/86/90).' },
    // Junior analyst — Crystal Morris · €32/h × 7.5h × 0.6 FTE = €144/day · ~64 working days = €9,216.
    { id: 'b5', label: 'Junior analyst — Crystal Morris (€32/h · 0.6 FTE)', amount: 9216, when: 1, status: 'payroll', guard: null,
      pay: [{ day: 27, amount: 2736 }, { day: 55, amount: 2880 }, { day: 86, amount: 3168 }, { day: 90, amount: 432 }],
      basis: 'Junior legal-ops analyst €32/h fully-loaded (EU market ≈ €30–€38/h) × 7.5h × 0.6 FTE = €144/day. Monthly payroll, same run dates.' },
    { id: 'b6', label: 'External security assessment & signoff', amount: 6000, when: 45, status: 'committed', guard: 't212', guardNote: 'Booked once the design is fixed; independent review before go-live', basis: 'Independent security assessment / light penetration test of the MVP integrations handling legal & contract data — scoped external review ≈ €4k–€8k.' },
    { id: 'b7', label: 'ClauseLens option (contract intelligence)', amount: 7000, when: 61, status: 'held', guard: 't321', guardNote: 'Only if a real extraction gap remains after pilot', basis: 'Optional contract-intelligence / AI add-on — premium module priced separately from the core CLM.' },
  ],

  // Pre-seeded live history (already part of "current" when the app loads)
  liveEvents: [
    { t: 'blocker', task: 't207', days: 4, at: 21, note: 'Engineering API sandbox access overdue', source: 'Internal Engineering', logged: 21 },
    { t: 'progress', task: 't204', pct: 0.5 },
    { t: 'progress', task: 't206', pct: 0.3 },
  ],

  scenarios: [
    {
      id: 'w-idle', title: 'Analyst blocked — idle risk', icon: 'CR',
      desc: 'Taxonomy sign-off stalls Accord data entry. Watch the system keep Crystal productive instead of idle.',
      events: [{ t: 'blocker', task: 't312', days: 5, at: 23, note: 'Accord entry paused pending taxonomy sign-off', source: 'Internal' }],
    },
    {
      id: 'w-approval', title: 'Design-gate approval slips', icon: 'G2',
      desc: 'Steering pushes the Day-30 review a week. The gate is on the critical path — see what absorbs and what escalates.',
      events: [{ t: 'delay', task: 't212', days: 5, note: 'Steering review moved a week later' }],
    },
    {
      id: 'w-vendor', title: 'Accord vendor latency', icon: 'VN',
      desc: 'Vendor config support responds slowly; template work stretches.',
      events: [{ t: 'delay', task: 't303', days: 2, note: 'Vendor support latency' }, { t: 'delay', task: 't306', days: 3, note: 'Vendor support latency' }],
    },
    {
      id: 'w-deadline', title: 'Cumulative slip — deadline threat', icon: '!',
      desc: 'Integration overruns + security reschedule + pilot defects stack up. The system exhausts internal options, then escalates with recovery choices.',
      events: [
        { t: 'delay', task: 't308', days: 8, note: 'Integration build overrun' },
        { t: 'blocker', task: 't314', days: 6, at: 40, note: 'Security review rescheduled', source: 'Security team' },
        { t: 'delay', task: 't316', days: 4, note: 'Pilot defects on the high-risk path' },
        { t: 'delay', task: 't306', days: 3, note: 'Vendor config window missed' },
      ],
    },
  ],
};
