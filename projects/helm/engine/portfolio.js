// ─────────────────────────────────────────────────────────────────────────────
// Portfolio orchestration — runs all projects, enforces cross-project
// prerequisite links, detects shared-resource conflicts, computes program stats.
// A link means: <from project>'s task must finish before <to project>'s task
// can start. Enforced by injecting a computed `notbefore` event into the target
// project and re-scheduling, so the target's own scheduler resequences around it.
// ─────────────────────────────────────────────────────────────────────────────
import { schedule, makeCalendar, planDelta, chartSeries, capacity } from './engine.js';
export { chartSeries, capacity, schedule };
import { windrose } from './windrose.js';
import { pa, pb, pc, pd } from './demoProjects.js';

export const SEEDS = { windrose, pa, pb, pc, pd };
export const PROJECT_ORDER = ['windrose', 'pa', 'pb', 'pc', 'pd'];

// Cross-project prerequisite links (the program's connective tissue)
export const CROSS_LINKS = [
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
export function computeProgram(eventsByProj, extraSeeds = {}) {
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
