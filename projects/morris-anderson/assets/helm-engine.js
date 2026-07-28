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

  // ── split events restructure the task list itself ──
  let defs = seed.tasks;
  const splits = events.filter((e) => e.t === 'split');
  if (splits.length) {
    defs = seed.tasks.map((t) => ({ ...t, deps: (t.deps || []).slice() }));
    for (const sp of splits) {
      const i = defs.findIndex((t) => t.id === sp.task);
      if (i === -1) continue;
      const o = defs[i];
      const ratio = sp.ratio || 0.5;
      const partB = { ...o, id: o.id + '_b', title: o.title + ' · part 2', dur: Math.max(0.5, (o.dur || 1) * (1 - ratio)), deps: [o.id], autoGen: o.autoGen, status: undefined, progress: 0, actualStart: undefined, actualEnd: undefined };
      defs[i] = { ...o, title: o.title + ' · part 1', dur: Math.max(0.5, (o.dur || 1) * ratio) };
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


// ── Construction demonstration seed (sample project for the interface demo) ──
