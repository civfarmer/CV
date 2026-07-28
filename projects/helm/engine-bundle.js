/* Helm engine bundle - GENERATED for offline file:// use. Do not edit by hand. */
(function(){
  var __mods = {};
  function require(name){
    if (__mods[name] && __mods[name].__loaded) return __mods[name].exports;
    throw new Error('helm engine bundle: module not loaded: ' + name);
  }
  function define(name, factory){
    var m = { exports: {}, __loaded: false };
    __mods[name] = m;
    factory(m, m.exports, require);
    m.__loaded = true;
  }

  define("./windrose.js", function(module, exports, require){
    // ─────────────────────────────────────────────────────────────────────────────
    // Windrose — the primary 90-day showcase project (anonymised from the real brief)
    // Client "Windrose" · Streamline→Relay, Juro→Accord, OneTrust→Sentinel,
    // ServiceNow→CaseDesk, Close→Compass, Jira→Tracker, Airtable→GridWorks,
    // Catylex→ClauseLens. Resourcing: Christopher Farmer 1.0 FTE (€90/h) + Crystal Morris
    // (junior analyst) 0.6 FTE (€32/h) + external engineering / security / vendor lanes.
    // Snapshot "today" = Day 23 (Stage 2 · Design).
    // ─────────────────────────────────────────────────────────────────────────────
    
    const T = (o) => ({ risk: 'medium', priority: 'P2', ...o });
    
    const windrose = {
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
    
    exports["windrose"] = windrose;
  });

  define("./demoProjects.js", function(module, exports, require){
    // ─────────────────────────────────────────────────────────────────────────────
    // Demo projects A–D — four interweaving projects under the program header.
    // Compact but real: dependencies, partial gates, approvals, guards, scenarios.
    // Cross-project prerequisite links live in engine/portfolio.js.
    // ─────────────────────────────────────────────────────────────────────────────
    
    const T = (o) => ({ risk: 'medium', priority: 'P2', ...o });
    
    // ── PROJECT A · Marketing Launch ─────────────────────────────────────────────
    const pa = {
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
    const pb = {
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
    const pc = {
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
    const pd = {
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
    
    exports["pa"] = pa;
    exports["pb"] = pb;
    exports["pc"] = pc;
    exports["pd"] = pd;
  });

  define("./engine.js", function(module, exports, require){
    // ─────────────────────────────────────────────────────────────────────────────
    // Helm — automated project-manager engine
    // Pure business logic, no DOM. Loaded by the DC logic class via dynamic import.
    // Event-sourced: plan = schedule(seed, events, asOfDay, opts).
    //   • baseline = schedule(seed, [], 0, {ignoreFacts:true})   — plan as approved Day 0
    //   • current  = schedule(seed, events, today)               — live plan
    // Provides: dependency resolution (full + partial), approval lags, per-resource
    // ready-day-aware leveling (pull-forwards happen naturally), premature-spend
    // guards, decision holds, CPM backward pass (slack/critical), Monte-Carlo
    // deadline confidence, rule-based escalation, plan-delta diffing, chart series.
    // ─────────────────────────────────────────────────────────────────────────────
    
    function makeCalendar(startISO) {
      const start = new Date(startISO + 'T12:00:00');
      const isWorkday = (d) => ((d - 1) % 7) < 5;            // Day1=Mon … 6/7 weekend
      const nextWorkday = (d) => { while (!isWorkday(d)) d++; return d; };
      const addWork = (d, n) => {                            // n workdays starting AT d
        d = nextWorkday(d);
        let left = Math.max(1, Math.ceil(n)) - 1;
        while (left > 0) { d++; if (isWorkday(d)) left--; }
        return d;
      };
      const workdaysBetween = (a, b) => { let n = 0; for (let d = a; d <= b; d++) if (isWorkday(d)) n++; return n; };
      const dayToDate = (d) => { const x = new Date(start); x.setDate(x.getDate() + (d - 1)); return x; };
      const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      const fmt = (d) => { const x = dayToDate(d); return DOW[x.getDay()] + ' ' + x.getDate() + ' ' + MONTHS[x.getMonth()]; };
      const fmtShort = (d) => { const x = dayToDate(d); return x.getDate() + ' ' + MONTHS[x.getMonth()]; };
      return { isWorkday, nextWorkday, addWork, workdaysBetween, dayToDate, fmt, fmtShort };
    }
    
    function mulberry32(a) {
      return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    
    const RISK_SPREAD = { low: [0.85, 1.15], medium: [0.75, 1.27], high: [0.62, 1.5] };
    const PRIO = { P1: 0, P2: 1, P3: 2 };
    
    function expandEvents(seed, events) {
      const out = [];
      for (const ev of events || []) {
        if (ev.t === 'scenario') {
          const sc = (seed.scenarios || []).find((s) => s.id === ev.id);
          if (sc) for (const sub of sc.events) out.push({ ...sub, scenario: sc.id });
        } else out.push(ev);
      }
      return out;
    }
    
    // ─────────────────────────────────────────────────────────────────────────────
    function schedule(seed, rawEvents, today, opts = {}) {
      const cal = makeCalendar(seed.start);
      const ignore = !!opts.ignoreFacts;
      const events = ignore ? [] : expandEvents(seed, rawEvents);
      const escalations = [];
      const notices = [];
    
      // ── structural events restructure the task list itself ──
      // add / edit / reorder / split all rewrite `defs` before scheduling, so every
      // downstream pass (leveling, CPM, Monte-Carlo, deltas) and every view that reads
      // the returned plan sees one coherent task list — a single source of truth.
      let defs = seed.tasks;
      const structural = events.filter((e) => e.t === 'addtask' || e.t === 'edittask' || e.t === 'reorder' || e.t === 'split');
      if (structural.length) {
        defs = seed.tasks.map((t) => ({ ...t, deps: (t.deps || []).slice() }));
        for (const ev of structural) {
          if (ev.t === 'addtask') {
            const src = ev.task || {};
            if (!src.id || defs.some((t) => t.id === src.id)) continue;   // ignore missing/duplicate ids
            const nt = {
              risk: 'medium', priority: 'P2', dur: 1,
              ws: (seed.workstreams[0] || {}).id, assignee: (seed.resources[0] || {}).id,
              ...src,
              deps: (src.deps || []).slice(), userAdded: true, autoGen: false,
              status: undefined, progress: 0, actualStart: undefined, actualEnd: undefined,
            };
            let idx = defs.length;
            if (ev.after != null) { const j = defs.findIndex((t) => t.id === ev.after); if (j >= 0) idx = j + 1; }
            else if (ev.before != null) { const j = defs.findIndex((t) => t.id === ev.before); if (j >= 0) idx = j; }
            defs.splice(idx, 0, nt);
          } else if (ev.t === 'edittask') {
            const i = defs.findIndex((t) => t.id === ev.task);
            if (i === -1) continue;
            const patch = { ...(ev.patch || {}) };
            if ('deps' in patch) patch.deps = (patch.deps || []).slice();  // caller passes plain-id or {id,pct} entries
            defs[i] = { ...defs[i], ...patch, userEdited: true };
          } else if (ev.t === 'reorder') {
            if (Array.isArray(ev.order)) {
              const pos = {}; ev.order.forEach((id, k) => { pos[id] = k; });
              const listed = defs.filter((t) => pos[t.id] != null).sort((a, b) => pos[a.id] - pos[b.id]);
              const rest = defs.filter((t) => pos[t.id] == null);          // e.g. split halves added after this reorder
              defs = [...listed, ...rest];
            } else if (ev.task && ev.before) {
              const from = defs.findIndex((t) => t.id === ev.task);
              if (from >= 0) { const [m] = defs.splice(from, 1); let to = defs.findIndex((t) => t.id === ev.before); if (to < 0) to = defs.length; defs.splice(to, 0, m); }
            }
          } else if (ev.t === 'split') {
            const i = defs.findIndex((t) => t.id === ev.task);
            if (i === -1) continue;
            const o = defs[i];
            const ratio = ev.ratio || 0.5;
            const partB = { ...o, id: o.id + '_b', title: ev.titleB || (o.title + ' · part 2'), dur: Math.max(0.5, (o.dur || 1) * (1 - ratio)), deps: [o.id], autoGen: o.autoGen, userAdded: o.userAdded, status: undefined, progress: 0, actualStart: undefined, actualEnd: undefined };
            defs[i] = { ...o, title: ev.titleA || (o.title + ' · part 1'), dur: Math.max(0.5, (o.dur || 1) * ratio) };
            // successors that depended on the original now depend on part 2
            for (const d of defs) {
              if (d === defs[i] || d === partB) continue;
              d.deps = (d.deps || []).map((dep) => {
                const id = typeof dep === 'string' ? dep : dep.id;
                if (id !== o.id) return dep;
                return typeof dep === 'string' ? partB.id : { ...dep, id: partB.id };
              });
            }
            defs.splice(i + 1, 0, partB);
          }
        }
      }
    
      const tasks = defs.map((t, i) => ({
        ...t, seq: i,
        deps: (t.deps || []).map((d) => (typeof d === 'string' ? { id: d } : { ...d })),
        status: ignore ? 'planned' : (t.status || 'planned'),
        progress: ignore ? 0 : (t.progress || 0),
        extraDays: 0, blockedUntil: 0, blockReason: null, blockSource: null,
        decisionHold: null, guardHold: null, dropped: false, waitingApproval: false,
        start: 0, end: 0, slack: 99, critical: false,
      }));
      const byId = {}; tasks.forEach((t) => { byId[t.id] = t; });
      // intrinsic work estimate (the "most likely" effort), captured before any effort/delay edits.
      // Effort edits change t.dur (the COMMITTED time); baseDur stays put so confidence can react
      // to how aggressive the committed time is versus the real work.
      tasks.forEach((t) => { t.baseDur = (t.dur || 1); });
    
      const decided = {};
      for (const ev of events) if (ev.t === 'decision') decided[ev.id] = ev;
    
      for (const ev of events) {
        const t = ev.task ? byId[ev.task] : null;
        if (!t) continue;
        if (ev.t === 'progress') { t.progress = ev.pct; if (ev.pct >= 1) { t.status = 'done'; t.actualEnd = ev.day || today; if (!t.actualStart) t.actualStart = Math.max(1, (ev.day || today) - Math.ceil(t.dur || 1)); } }
        if (ev.t === 'blocker') {
          t.blockedUntil = Math.max(t.blockedUntil, (ev.at || today) + (ev.days || 3));
          t.blockReason = ev.note || 'blocked'; t.blockSource = ev.source || 'reported';
        }
        if (ev.t === 'delay') { t.extraDays += ev.days; t.delayNote = ev.note; }
        if (ev.t === 'reassign' && !ignore) { t.assignee = ev.to; t.reassigned = true; }
        if (ev.t === 'duration' && !ignore) { t.dur = ev.dur; t.resized = true; }
        if (ev.t === 'flag' && !ignore) { t.helpFlag = ev.note || 'assistance requested'; }
        if (ev.t === 'notbefore' && !ignore) { t.notBefore = Math.max(t.notBefore || 0, ev.day); t.crossNote = ev.note; }
      }
    
      for (const dec of seed.decisions || []) {
        const resolved = decided[dec.id];
        if (!resolved && dec.blocks && !ignore) {
          for (const tid of dec.blocks) if (byId[tid]) byId[tid].decisionHold = dec;
        }
        if (resolved && dec.options) {
          const opt = dec.options.find((o) => o.id === resolved.choice);
          if (opt && opt.dropTasks) for (const tid of opt.dropTasks) if (byId[tid]) byId[tid].dropped = true;
          if (opt && opt.delayTasks) for (const dl of opt.delayTasks) if (byId[dl.id]) byId[dl.id].extraDays += dl.days;
        }
      }
    
      const res = {}; const rmeta = {};
      for (const r of seed.resources) { res[r.id] = 1; rmeta[r.id] = r; }
    
      const elapsedFor = (t) => {
        const r = rmeta[t.assignee] || { fte: 1 };
        const dur = Math.max(0.5, (t.dur || 1) + t.extraDays);
        // external lanes are teams/queues — duration is duration; FTE is capacity metadata
        return Math.max(1, Math.ceil(r.external ? dur : dur / (r.fte || 1)));
      };
    
      const readyDay = (t) => {
        let d = t.notBefore || 1;
        for (const dep of t.deps) {
          const p = byId[dep.id]; if (!p || p.dropped) continue;
          if (dep.pct) {
            const span = Math.max(1, p.end - p.start);
            d = Math.max(d, Math.round(p.start + span * dep.pct));
          } else d = Math.max(d, p.end + 1);
        }
        if (t.blockedUntil) d = Math.max(d, t.blockedUntil + 1);
        if (t.decisionHold) d = Math.max(d, (t.decisionHold.due || today) + 1 + (t.decisionHold.grace ?? 2));
        return d;
      };
    
      // ── forward pass: ready-day-aware topological leveling ──
      // At each step, among tasks whose deps are all scheduled, pick the one that
      // can start soonest (then priority, then seed order). This makes the system
      // naturally pull independent work forward around blocked/held tasks.
      const order = [];
      {
        const indeg = {}; tasks.forEach((t) => { indeg[t.id] = 0; });
        tasks.forEach((t) => t.deps.forEach((d) => { if (byId[d.id]) indeg[t.id]++; }));
        let q = tasks.filter((t) => indeg[t.id] === 0);
        const scheduledSet = new Set();
        while (q.length) {
          let best = null, bestKey = null;
          for (const t of q) {
            let d0;
            if (t.dropped) d0 = 0;
            else if (t.status === 'done' && !ignore) d0 = t.actualStart || 1;
            else {
              d0 = cal.nextWorkday(readyDay(t));
              if (t.guard) {
                const g = byId[t.guard.until];
                if (g && !g.dropped && !(g.status === 'done') ) {
                  const gEnd = scheduledSet.has(g.id) ? g.end : null;
                  if (gEnd && gEnd + 1 > d0) { d0 = gEnd + 1; }
                }
              }
              const r = rmeta[t.assignee];
              if (r && !r.external) d0 = Math.max(d0, res[t.assignee]);
              if (!ignore && t.status !== 'done' && t.progress > 0 && t.actualStart) d0 = Math.min(d0, Math.max(t.actualStart, 1));
              d0 = cal.nextWorkday(d0);
            }
            const key = [d0, t.phaseTwoOk ? 1 : 0, PRIO[t.priority] ?? 1, t.seq];
            if (!best || key[0] < bestKey[0] || (key[0] === bestKey[0] && (key[1] < bestKey[1] || (key[1] === bestKey[1] && (key[2] < bestKey[2] || (key[2] === bestKey[2] && key[3] < bestKey[3])))))) { best = t; bestKey = key; }
          }
          const t = best;
          q = q.filter((x) => x !== t);
          order.push(t); scheduledSet.add(t.id);
    
          if (t.dropped) { t.start = t.end = 0; }
          else if (t.status === 'done' && !ignore) {
            t.start = t.actualStart || 1;
            t.end = t.actualEnd || cal.addWork(t.start, elapsedFor(t));
            const r = rmeta[t.assignee];
            if (r && !r.external && res[t.assignee] !== undefined) res[t.assignee] = Math.max(res[t.assignee], t.end + 1);
          } else {
            let d = bestKey[0];
            if (t.guard) {
              const g = byId[t.guard.until];
              if (g && !g.dropped && g.status !== 'done' && g.end && g.end + 1 > d) { t.guardHold = t.guard.reason; d = cal.nextWorkday(g.end + 1); }
            }
            if (!ignore && t.progress > 0 && t.actualStart) d = t.actualStart;
            t.start = d;
            const remaining = t.progress > 0 ? elapsedFor(t) * (1 - t.progress) : elapsedFor(t);
            t.end = cal.addWork(Math.max(d, t.progress > 0 ? today : d), Math.max(1, Math.ceil(t.progress > 0 ? remaining : elapsedFor(t))));
            if (t.progress > 0) t.end = cal.addWork(today, Math.max(1, Math.ceil(remaining)));
            if (t.approval) { t.waitingApproval = true; t.end = cal.addWork(t.end + 1, t.approval.wait || 2); }
            const r = rmeta[t.assignee];
            if (r && !r.external) res[t.assignee] = t.end + 1;
          }
          tasks.forEach((u) => u.deps.forEach((dp) => { if (dp.id === t.id && --indeg[u.id] === 0) q.push(u); }));
        }
        tasks.forEach((t) => { if (!order.includes(t)) { order.push(t); t.start = t.start || today; t.end = t.end || today; } });
      }
    
      // ── backward pass (CPM) — partial-dep aware ──
      const deadline = seed.days;
      const succ = {}; tasks.forEach((t) => { succ[t.id] = []; });
      tasks.forEach((t) => t.deps.forEach((d) => { if (succ[d.id]) succ[d.id].push({ s: t, pct: d.pct }); }));
      for (const t of [...order].reverse()) {
        if (t.dropped) continue;
        if (t.phaseTwoOk) { // allowed past the deadline — never constrains upstream
          t.lfx = deadline + 60; t.lsx = t.lfx - (t.end - t.start); t.slack = 60; t.critical = false; continue;
        }
        const ss = succ[t.id].filter((e) => !e.s.dropped);
        // a pct edge only requires this task to be pct-complete when the successor starts
        const lf = ss.length ? Math.min(...ss.map((e) => ((e.s.lsx ?? deadline) - 1) + (e.pct ? Math.round((1 - e.pct) * (t.end - t.start)) : 0))) : deadline;
        t.lfx = lf; t.lsx = lf - (t.end - t.start);
        t.slack = Math.round(Math.max(-99, t.lsx - t.start));
        t.critical = t.slack <= 0 && t.status !== 'done';
      }
      // driving path: the minimum-slack chain (visible even when the plan is buffered)
      const liveSlacks = tasks.filter((t) => !t.dropped && !t.phaseTwoOk && t.status !== 'done').map((t) => t.slack);
      const minSlack = liveSlacks.length ? Math.min(...liveSlacks) : 0;
      for (const t of tasks) t.driving = !t.dropped && !t.phaseTwoOk && t.status !== 'done' && t.slack <= minSlack + 3;
      const countable = tasks.filter((t) => !t.dropped && !t.phaseTwoOk);
      const finishDay = Math.max(...countable.map((t) => t.end));
      const buffer = deadline - finishDay;
    
      // ── states as of today ──
      for (const t of tasks) {
        if (t.dropped) { t.state = 'dropped'; continue; }
        if (t.status === 'done') { t.state = 'done'; continue; }
        if (t.blockedUntil >= today && t.blockReason) { t.state = 'blocked'; continue; }
        if (t.decisionHold) { t.state = 'decision'; continue; }
        if (t.guardHold) { t.state = 'held'; continue; }
        if (t.waitingApproval && t.progress >= 0.99) { t.state = 'approval'; continue; }
        if (t.progress > 0 || (t.start <= today && t.end >= today && t.assignee && !rmeta[t.assignee]?.external)) { t.state = 'active'; continue; }
        t.state = 'scheduled';
      }
    
      // ── idle detection (dedicated resources only — teams have BAU elsewhere) ──
      if (!ignore) for (const r of seed.resources) {
        if (r.external || r.approver || !r.dedicated) continue;
        const mine = tasks.filter((t) => t.assignee === r.id && !t.dropped && t.state !== 'done').sort((a, b) => a.start - b.start);
        let cursor = Math.max(today, 1);
        for (const t of mine) {
          if (t.start > cursor) {
            const gap = cal.workdaysBetween(cursor, t.start - 1);
            if (gap >= 3 && cursor <= today + 10) {
              escalations.push({
                id: 'esc-idle-' + r.id + '-' + cursor, sev: 'red', kind: 'idle',
                title: r.name + ' has no available work for ' + gap + ' days',
                what: 'From ' + cal.fmt(cursor) + ', every remaining task for ' + r.name + ' is blocked, held or waiting on inputs.',
                tried: 'Searched all workstreams for pull-forward candidates with met dependencies; leveling found none that are safe to start.',
                options: ['Accept the idle window', 'Relax a start guard', 'Chase the blocking input', 'Lend capacity to another project'],
                impact: gap + ' workdays of capacity at risk · no direct deadline impact',
              });
            }
          }
          cursor = Math.max(cursor, t.end + 1);
        }
      }
    
      // ── Monte-Carlo deadline confidence ──
      const rand = mulberry32(seed.mcSeed || 42);
      const RUNS = 400;
      let hit = 0; const finishes = [];
      for (let i = 0; i < RUNS; i++) {
        const g = 0.93 + rand() * 0.19; // correlated per-run productivity factor (sick days, meeting load)
        const r2 = {}; for (const r of seed.resources) r2[r.id] = today;
        let worst = 0; const end2 = {};
        for (const t of order) {
          if (t.dropped || t.phaseTwoOk) continue;
          if (t.state === 'done') { end2[t.id] = t.end; continue; }
          let d = Math.max(t.notBefore || 1, today);
          for (const dep of t.deps) {
            const p = byId[dep.id]; if (!p || p.dropped) continue;
            const pe = end2[dep.id] ?? p.end;
            d = Math.max(d, dep.pct ? Math.round(pe - (1 - dep.pct) * (pe - p.start)) : pe + 1);
          }
          if (t.blockedUntil) d = Math.max(d, t.blockedUntil + 1);
          const rm = rmeta[t.assignee];
          if (rm && !rm.external) d = Math.max(d, r2[t.assignee]);
          const [lo, hi] = RISK_SPREAD[t.risk || 'medium'];
          let mult = (lo + (hi - lo) * rand()) * g;
          if (rand() < 0.035) mult *= 1.6; // rare blow-up tail
          let e = cal.addWork(d, Math.max(1, Math.round(elapsedFor(t) * mult)));
          if (t.approval) e += Math.round((t.approval.wait || 2) * (0.55 + rand() * 1.0));
          end2[t.id] = e;
          if (rm && !rm.external) r2[t.assignee] = e + 1;
          worst = Math.max(worst, e);
        }
        finishes.push(worst); if (worst <= deadline) hit++;
      }
      finishes.sort((a, b) => a - b);
      const confidence = Math.min(99, Math.round((hit / RUNS) * 100));
      const p80 = finishes[Math.floor(RUNS * 0.8)];
      // ── per-task on-time confidence — estimate-adequacy (schedule-forecasting / PERT style) ──
      // The question this answers: "is the effort we've committed enough for the work this task
      // actually needs?"  Modelled as P(intrinsic work ≤ committed time) via a logistic over a
      // risk-weighted PERT spread of the ratio r = committed / intrinsic.  Continuous, never binary:
      //   • cut effort below the estimate  → r < 1 → confidence falls
      //   • add effort above the estimate  → r > 1 → confidence rises (asymptotes, never hits 100%)
      //   • a logged delay grows the intrinsic work (realized slippage) → confidence falls
      //   • higher risk class widens the spread → the same committed time is less certain
      // Slack/critical/blocker/help-flag apply only a light secondary nudge, so effort stays the
      // dominant lever (a task with days of slack still loses confidence when you compress it).
      const RISK_MU = { low: 0.518, medium: 0.578, high: 0.678 };   // higher μ = less forgiving
      const CONF_S = 0.212;                                          // logistic width
      for (const t of tasks) {
        if (t.dropped || t.phaseTwoOk) { t.taskConf = null; continue; }
        if (t.state === 'done') { t.taskConf = 100; continue; }
        const intrinsic = Math.max(0.5, (t.baseDur || t.dur || 1) + t.extraDays); // work incl. realized slippage
        const committed = Math.max(0.5, t.dur || 1);                              // time the plan allots
        const r = committed / intrinsic;
        let p = 1 / (1 + Math.exp(-(r - (RISK_MU[t.risk || 'medium'])) / CONF_S));
        if (t.progress > 0 && t.progress < 1) p = p + (1 - p) * t.progress * 0.6; // work already banked de-risks
        if (t.critical || t.slack <= 0) p *= 0.90;                                 // no recovery room
        else if (t.slack <= 2) p *= 0.96;
        else if (t.slack >= 10) p = Math.min(0.985, p + 0.03);                     // ample slack, mild credit
        if (t.blockedUntil > today || t.decisionHold) p *= 0.85;                   // actively held up
        if (t.helpFlag) p *= 0.90;                                                 // flagged at-risk
        t.taskConf = Math.max(3, Math.min(99, Math.round(p * 100)));               // never binary, never 100 until done
      }
    
      const feasibility =
        confidence >= 85 ? { label: 'Viable', tone: 'green' } :
        confidence >= 60 ? { label: 'Viable but tight', tone: 'amber' } :
        confidence >= 42 ? { label: 'Viable only with reduced scope', tone: 'red' } :
        confidence >= 28 ? { label: 'Viable only with more resource', tone: 'red' } :
                           { label: 'Not viable under current constraints', tone: 'black' };
    
      // ── escalation rules ──
      if (!ignore) {
        for (const dec of seed.decisions || []) {
          if (!decided[dec.id] && dec.due <= today + 2) {
            escalations.push({
              id: 'esc-dec-' + dec.id, sev: dec.due < today ? 'red' : 'amber', kind: 'decision', decisionId: dec.id,
              title: 'Decision needed: ' + dec.title, what: dec.what, tried: dec.tried,
              options: dec.options.map((o) => o.label), recommend: dec.recommend, impact: dec.impact, due: dec.due,
            });
          }
        }
        for (const t of tasks) {
          if (t.state === 'blocked' && t.critical) {
            escalations.push({
              id: 'esc-blk-' + t.id, sev: 'red', kind: 'blocker', taskId: t.id,
              title: 'Critical-path task blocked: ' + t.title,
              what: (t.blockReason || 'Blocked') + '. The task is on the critical path — its slack is ' + t.slack + 'd.',
              tried: 'Re-levelled all resources and pulled every safe independent task forward; no route around this input.',
              options: ['Chase the blocking party', t.canSplit ? 'Split the task and start the unblocked half' : 'Re-scope the task', 'Accept slip and re-baseline'],
              impact: 'Each further blocked day moves delivery a day',
            });
          } else if (t.state === 'blocked') {
            notices.push({ kind: 'worked-around', task: t.id, text: '“' + t.title + '” is blocked (' + t.blockReason + ') — absorbed by ' + t.slack + 'd of slack; downstream tasks re-sequenced, no gate impact.' });
          }
          if (t.guardHold) notices.push({ kind: 'guard', task: t.id, text: '“' + t.title + '” held back: ' + t.guardHold });
          if (t.helpFlag) {
            if (t.driving || t.critical) escalations.push({ id: 'esc-help-' + t.id, sev: 'red', kind: 'help', taskId: t.id, title: 'Assistance requested on a driving-path task: ' + t.title, what: t.helpFlag + ' — the task drives the delivery date.', tried: 'Checked for re-assignment and splitting options; none free up the constraint without help.', options: ['Add resource', 'Pair the owner with support', 'Reduce the task scope'], impact: 'Slack ' + t.slack + 'd — slippage here moves delivery' });
            else notices.push({ kind: 'help', task: t.id, text: '“' + t.title + '” flagged for assistance (' + t.helpFlag + ') — ' + t.slack + 'd of slack available; watching.' });
          }
          if (t.state === 'approval') notices.push({ kind: 'approval', task: t.id, text: '“' + t.title + '” waiting on approval (' + (t.approval.by || 'approver') + ', ~' + (t.approval.wait || 2) + 'd).' });
        }
        if (buffer < 0) escalations.push({
          id: 'esc-deadline', sev: buffer < -5 ? 'black' : 'red', kind: 'deadline',
          title: 'Deadline no longer holds',
          what: 'The current plan finishes on Day ' + finishDay + ' — ' + (-buffer) + ' days past the Day-' + deadline + ' commitment.',
          tried: 'Re-levelled every resource, pulled all safe work forward, consumed the remaining buffer, re-sequenced around every blocker.',
          options: ['Reduce scope — move phase-two candidates out', 'Add resource to the critical chain', 'Negotiate the deadline', 'Authorise overtime (explicit, never assumed)'],
          impact: 'Confidence ' + confidence + '% · P80 finish Day ' + p80,
        });
        else if (confidence < 60) escalations.push({
          id: 'esc-conf', sev: 'red', kind: 'confidence',
          title: 'Delivery confidence below threshold',
          what: 'Monte-Carlo confidence is ' + confidence + '% against the 60% escalation threshold. P80 finish is Day ' + p80 + '.',
          tried: 'Buffer reallocated to the critical chain; approvals chased; independent work parallelised.',
          options: ['Reduce scope', 'Add resource', 'Re-baseline the deadline'],
          impact: 'P80 overruns the deadline by ' + Math.max(0, p80 - deadline) + ' days',
        });
      }
    
      const health =
        escalations.some((e) => e.sev === 'black') ? 'black' :
        escalations.some((e) => e.sev === 'red') ? 'red' :
        escalations.length || notices.length || confidence < 80 ? 'amber' : 'green';
    
      return { cal, tasks, byId, order, finishDay, buffer, deadline, confidence, p80, feasibility, escalations, notices, health, today, decided, events };
    }
    
    // ── diff two plans → human change entries ──
    function planDelta(base, cur) {
      const moves = [];
      for (const t of cur.tasks) {
        const b = base.byId[t.id];
        if (!b) { moves.push({ kind: 'added', id: t.id, title: t.title, why: t.genReason || 'added by the system', to: t.start, toEnd: t.end }); continue; }
        if (t.autoGen && t.genReason) { moves.push({ kind: 'added', id: t.id, title: t.title, why: t.genReason, to: t.start, toEnd: t.end }); }
        if (t.dropped && !b.dropped) { moves.push({ kind: 'removed', id: t.id, title: t.title, why: 'removed by an approved decision' }); continue; }
        const d = t.start - b.start;
        if (Math.abs(d) >= 1 && t.state !== 'done') {
          moves.push({
            kind: d > 0 ? 'later' : 'earlier', id: t.id, title: t.title, days: Math.abs(d),
            from: b.start, to: t.start, fromEnd: b.end, toEnd: t.end, critical: t.critical,
            why: t.blockReason ? 'blocked: ' + t.blockReason
              : t.guardHold ? t.guardHold
              : t.decisionHold ? 'awaiting decision: ' + t.decisionHold.title
              : t.delayNote ? t.delayNote
              : d < 0 ? 'pulled forward to fill freed capacity' : 're-sequenced behind a moved dependency',
          });
        }
      }
      return {
        moves,
        added: moves.filter((m) => m.kind === 'added'),
        earlier: moves.filter((m) => m.kind === 'earlier'),
        later: moves.filter((m) => m.kind === 'later'),
        removed: moves.filter((m) => m.kind === 'removed'),
        bufferBefore: base.buffer, bufferAfter: cur.buffer,
        confBefore: base.confidence, confAfter: cur.confidence,
        finishBefore: base.finishDay, finishAfter: cur.finishDay,
      };
    }
    
    // ── chart series: remaining work by day (for burndown with metric toggle) ──
    function chartSeries(plan, metric) {
      const pts = [];
      for (let d = 0; d <= plan.deadline; d += 1) {
        let v = 0;
        for (const t of plan.tasks) {
          if (t.dropped || t.milestone) continue;
          if (t.end > d) v += metric === 'effort' ? (t.dur || 1) : 1;
        }
        pts.push({ d, v });
      }
      return pts;
    }
    
    // ── capacity load per resource for a window of days ──
    function capacity(plan, seed, fromDay, days) {
      const cal = plan.cal;
      const out = [];
      for (const r of seed.resources) {
        if (r.external || r.approver) continue;
        const cells = [];
        for (let d = fromDay; d < fromDay + days; d++) {
          if (!cal.isWorkday(d)) continue;
          const on = plan.tasks.filter((t) => !t.dropped && t.assignee === r.id && t.start <= d && t.end >= d && t.state !== 'done');
          const doneOn = plan.tasks.filter((t) => t.assignee === r.id && t.state === 'done' && t.start <= d && t.end >= d);
          cells.push({ d, load: on.length ? 1 : (doneOn.length ? 0.9 : 0), task: on[0] ? on[0].title : (doneOn[0] ? doneOn[0].title : null), critical: on.some((t) => t.critical) });
        }
        out.push({ id: r.id, name: r.name, fte: r.fte, cells });
      }
      return out;
    }
    
    exports["makeCalendar"] = makeCalendar;
    exports["expandEvents"] = expandEvents;
    exports["schedule"] = schedule;
    exports["planDelta"] = planDelta;
    exports["chartSeries"] = chartSeries;
    exports["capacity"] = capacity;
  });

  define("./briefParser.js", function(module, exports, require){
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
    
    function parseBrief(raw, opts = {}) {
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
    
    exports["parseBrief"] = parseBrief;
  });

  define("./portfolio.js", function(module, exports, require){
    // ─────────────────────────────────────────────────────────────────────────────
    // Portfolio orchestration — runs all projects, enforces cross-project
    // prerequisite links, detects shared-resource conflicts, computes program stats.
    // A link means: <from project>'s task must finish before <to project>'s task
    // can start. Enforced by injecting a computed `notbefore` event into the target
    // project and re-scheduling, so the target's own scheduler resequences around it.
    // ─────────────────────────────────────────────────────────────────────────────
    const { schedule, makeCalendar, planDelta, chartSeries, capacity } = require('./engine.js');
    const { windrose } = require('./windrose.js');
    const { pa, pb, pc, pd } = require('./demoProjects.js');
    
    const SEEDS = { windrose, pa, pb, pc, pd };
    const PROJECT_ORDER = ['windrose', 'pa', 'pb', 'pc', 'pd'];
    
    // Cross-project prerequisite links (the program's connective tissue)
    const CROSS_LINKS = [
      { id: 'L1', from: { proj: 'pc', task: 'c04', pct: 0.5 }, to: { proj: 'pb', task: 'b05' }, label: 'Platform APIs ≥ 50% before B builds platform-dependent features' },
      { id: 'L2', from: { proj: 'pc', task: 'c_g2' }, to: { proj: 'pb', task: 'b10' }, label: 'Full API surface before B\u2019s full integration' },
      { id: 'L3', from: { proj: 'pb', task: 'b_g3' }, to: { proj: 'pa', task: 'a14' }, label: 'Releasable product before A spends paid-media budget' },
      { id: 'L4', from: { proj: 'pb', task: 'b_g3' }, to: { proj: 'pd', task: 'd09' }, label: 'Releasable product before D trains the client' },
    ];
    
    // convert a day in one project's calendar to the equivalent day in another's
    function dayAcross(fromSeed, toSeed, day) {
      const a = new Date(fromSeed.start + 'T12:00:00');
      const b = new Date(toSeed.start + 'T12:00:00');
      return day + Math.round((a - b) / 86400000);
    }
    
    // Compute every project plan with cross-links enforced.
    // eventsByProj: { projId: [events…] } · extraSeeds: user-created sandbox projects
    function computeProgram(eventsByProj, extraSeeds = {}) {
      const ALL = { ...SEEDS, ...extraSeeds };
      const plans = {};
      const linkInfo = [];
      const injected = {};
    
      const order = ['windrose', 'pc', 'pb', 'pa', 'pd', ...Object.keys(extraSeeds)];
      for (const pid of order) {
        const seed = ALL[pid];
        if (!seed) continue;
        const evs = [...(seed.liveEvents || []), ...(eventsByProj[pid] || []), ...(injected[pid] || [])];
        plans[pid] = schedule(seed, evs, seed.today);
        // resolve links whose source is this project
        for (const link of CROSS_LINKS) {
          if (link.from.proj !== pid) continue;
          const srcPlan = plans[pid];
          const srcTask = srcPlan.byId[link.from.task];
          if (!srcTask) continue;
          const span = Math.max(1, srcTask.end - srcTask.start);
          const readyDaySrc = link.from.pct ? Math.round(srcTask.start + span * link.from.pct) : srcTask.end + 1;
          const targetSeed = ALL[link.to.proj];
          const readyDayTgt = Math.max(1, dayAcross(ALL[pid], targetSeed, readyDaySrc));
          (injected[link.to.proj] = injected[link.to.proj] || []).push({ t: 'notbefore', task: link.to.task, day: readyDayTgt, note: 'cross-project link: ' + link.label });
          linkInfo.push({ ...link, readyDaySrc, readyDayTgt, srcState: srcTask.state, srcTitle: srcTask.title });
        }
      }
    
      // shared-resource conflict detection (same person named in 2+ projects, overlapping demand)
      const conflicts = [];
      const sharedNames = {};
      for (const pid of order) for (const r of (ALL[pid] ? ALL[pid].resources : [])) if (r.shared) (sharedNames[r.name] = sharedNames[r.name] || []).push({ pid, rid: r.id, fte: r.fte });
      for (const [name, uses] of Object.entries(sharedNames)) {
        if (uses.length < 2) continue;
        const totalFte = uses.reduce((s, u) => s + u.fte, 0);
        const windows = uses.map((u) => {
          const p = plans[u.pid];
          const ts = p.tasks.filter((t) => t.assignee === u.rid && !t.dropped && t.state !== 'done');
          if (!ts.length) return null;
          const from = Math.min(...ts.map((t) => t.start)), to = Math.max(...ts.map((t) => t.end));
          const cal = makeCalendar(ALL[u.pid].start);
          return { ...u, from, to, fromDate: cal.dayToDate(from), toDate: cal.dayToDate(to), tasks: ts.length };
        }).filter(Boolean);
        if (windows.length >= 2) {
          const overlap = windows.every((w) => w.fromDate <= windows[0].toDate) && windows.every((w) => w.toDate >= windows[0].fromDate);
          const blocked = uses.some((u) => plans[u.pid].tasks.some((t) => t.assignee === u.rid && t.state === 'blocked'));
          if (overlap || totalFte > 1 || blocked) conflicts.push({
            name, projects: uses.map((u) => u.pid.toUpperCase()).join(' + '),
            detail: name + ' is committed ' + uses.map((u) => u.fte + ' FTE to ' + ALL[u.pid].name).join(' and ') + (totalFte > 1 ? ' — over-allocated (' + totalFte + ' FTE total)' : ' with overlapping demand windows') + (blocked ? '; currently blocked in one project' : '') + '.',
            sev: blocked || totalFte > 1 ? 'red' : 'amber',
          });
        }
      }
    
      // program stats per project
      const stats = {};
      for (const pid of order) {
        if (!ALL[pid]) continue;
        const p = plans[pid];
        const base = schedule(ALL[pid], [], 0, { ignoreFacts: true });
        const doneTasks = p.tasks.filter((t) => t.state === 'done');
        const onTime = doneTasks.filter((t) => { const b = base.byId[t.id]; return !b || t.end <= b.end + 1; }).length;
        stats[pid] = {
          done: doneTasks.length, total: p.tasks.filter((t) => !t.dropped).length,
          onTime, late: doneTasks.length - onTime,
          needsHelp: p.tasks.filter((t) => t.helpFlag).length,
          escalations: p.escalations.length,
          delta: planDelta(base, p),
          base,
        };
      }
    
      return { plans, links: linkInfo, conflicts, stats, order };
    }
    
    exports["chartSeries"] = chartSeries;
    exports["capacity"] = capacity;
    exports["schedule"] = schedule;
    exports["SEEDS"] = SEEDS;
    exports["PROJECT_ORDER"] = PROJECT_ORDER;
    exports["CROSS_LINKS"] = CROSS_LINKS;
    exports["computeProgram"] = computeProgram;
  });

  var api = {};
  Object.assign(api, __mods['./portfolio.js'].exports, __mods['./briefParser.js'].exports);
  window.HelmEngine = api;
})();
