// View: KYC / Onboarding & Identity-Risk Workflow — a Customer Due Diligence (CDD)
// intake that produces an automatic, EXPLAINABLE customer-risk rating (Low / Medium
// / High / Prohibited) and a periodic-review cadence, by CONSUMING the modules
// already built: Screening & Watchlist, Adverse-Media / OSINT, and the Country &
// Sector Risk Index. The dashboard shows pipeline KPIs (by stage + by rating) and an
// onboarding queue table (applicant, type, country, rating, DD level, review due);
// clicking a row opens the CDD assessment detail — the applicant intake summary, a
// hand-built risk-factor breakdown (each factor + weight + contribution as a bar,
// colour + label), the CONSUMED signals shown explicitly (screening match band,
// adverse-media hits, country + sector risk bands — each linking back to its module),
// and the final rating + rationale + required DD level (CDD / EDD) + next review date.
//
// Honest posture: 100% SYNTHETIC applicants (some reuse seeded Nexus entity ids so
// their screening / adverse lines up). The rating is an illustrative application of a
// REAL, publicly-documented CDD/EDD risk-factor weighting methodology to synthetic
// inputs (disclaimer shown). Renders in-page within the shell (never a viewport
// takeover), accessible (colour ALWAYS paired with a text label, scope headers on
// tables), DOM-light (a handful of KPIs, a ~18-row table and one detail with a few
// bars). No SVG geometry; no getBBox / getBoundingClientRect / matchMedia dependence.
import { el, api, fmt, icon, card, emptyState, errorState, skeleton, infoDot } from './core.js';
import { pageHead, intro } from './views1.js';

const ACCENT = '#38bda0'; // a teal accent — distinct from every other module

// Rating band → colour (ALWAYS paired with the text label). Mirrors the engine's
// RATING_BANDS palette; text colour keeps the coloured chips legible.
const RATING_COLOR = { Low: '#2f9e63', Medium: '#c9a227', High: '#e07b39', Prohibited: '#d5303e' };
const RATING_TEXT = { Low: '#0b1f14', Medium: '#1f1804', High: '#1f0f04', Prohibited: '#20060a' };
const RATING_BADGE = { Low: 'low', Medium: 'med', High: 'high', Prohibited: 'high' };
// Country / sector band → colour (matches the Country & Sector Risk Index palette).
const CR_COLOR = { Low: '#2f9e63', Moderate: '#c9a227', High: '#e07b39', 'Very-high': '#d5303e' };
// Adverse-media band → colour (matches the Adverse-Media module palette).
const AM_COLOR = { None: '#46b877', Low: '#4d8df0', Elevated: '#e5a53b', High: '#f0616d', Severe: '#c1121f' };
// Screening band → colour (matches the Screening module dispositions).
const SCR_COLOR = { strong: '#d5303e', possible: '#e07b39', weak: '#c9a227' };

export async function onboarding(root, parts) {
  root.append(pageHead('KYC / Onboarding & Identity-Risk', 'A Customer Due Diligence (CDD) intake that produces an automatic, explainable customer-risk rating and a periodic-review cadence — by consuming the Screening, Adverse-Media and Country & Sector Risk modules already built. Read the pipeline, work the onboarding queue, and open any applicant for the full CDD assessment: the risk-factor breakdown, the consumed signals, and the final rating, required due-diligence level and next review date', [
    el('a', { class: 'btn sm ghost', href: '#/screening', title: 'The Screening & Watchlist module consumed here' }, icon('alert', 15), 'Screening'),
    el('a', { class: 'btn sm ghost', href: '#/adverse-media', title: 'The Adverse-Media / OSINT module consumed here' }, icon('bell', 15), 'Adverse-Media'),
    el('a', { class: 'btn sm ghost', href: '#/risk-index', title: 'The Country & Sector Risk Index consumed here' }, icon('database', 15), 'Risk Index'),
  ]));
  root.append(intro('KYC / Onboarding & Identity-Risk',
    'is a Customer Due Diligence (CDD) intake that turns an applicant into an automatic, EXPLAINABLE customer-risk rating. For each applicant it composes the modules FRIS already has: it screens the name against the Screening & Watchlist engine, pulls the Adverse-Media / OSINT composite for the applicant’s linked Sovereign Nexus entity, and reads the composed jurisdiction band and inherent sector band from the Country & Sector Risk Index — then weights seven CDD risk factors (customer type × geography × industry × product × channel × screening × adverse-media) into a Low / Medium / High / Prohibited rating, decides whether standard CDD or Enhanced Due Diligence (EDD) applies, and sets a periodic-review cadence. Read the pipeline KPIs, work the onboarding queue, and open any applicant to see the full breakdown — each factor’s contribution, the consumed signals (each linking back to its module), and the final rating, required DD level and next review date.'));

  // Honesty banner.
  root.append(el('div', { class: 'intro', role: 'note', style: { marginTop: '10px', '--mc': ACCENT } },
    el('span', { class: 'ico' }, icon('info', 18)),
    el('div', { class: 't' }, el('b', {}, 'Synthetic applicants, real methodology. '),
      'Every applicant, its ownership, declared activity, product and channel is FICTIONAL and generated deterministically for demonstration; nothing here refers to a real customer or person. A handful of applicants reuse synthetic Sovereign Nexus entity ids (and thus their synthetic watchlist / adverse-media matches) so the cross-module CDD signal can be shown end-to-end. The customer-risk rating applies a REAL, publicly-documented CDD/EDD risk-factor weighting methodology to those synthetic inputs — the methodology is legitimate, the data is not, and a rating is NOT a factual allegation against any party. This is NOT a KYC / onboarding system of record and NOT compliance advice.')));

  const body = el('div', { class: 'mt' });
  root.append(body);

  // A #/onboarding/APP-xxxx route deep-links straight to the CDD assessment.
  if (parts[0]) {
    await renderAssessment(body, decodeURIComponent(parts[0]));
    return;
  }
  await renderDashboard(body);
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD — pipeline KPIs (by stage + by rating), onboarding queue table.
// ─────────────────────────────────────────────────────────────────────────────
async function renderDashboard(root) {
  const panel = el('div', {}, skeleton(360));
  root.append(panel);

  let data;
  try { data = await api.get('/api/onboarding/applicants'); }
  catch (e) { panel.replaceChildren(errorState(e.message)); return; }
  if (!data.applicants.length) { panel.replaceChildren(emptyState('No applicants in the register')); return; }

  const s = data.summary;
  const nodes = [];

  // KPI strip: register size + rating counts + EDD / PEP / screening KPIs.
  nodes.push(el('div', { class: 'row wrap', style: { gap: '10px', marginBottom: '12px' } },
    kpiChip('Applicants', s.total, ACCENT, 'Total CDD intakes in the synthetic register'),
    kpiChip('In pipeline', s.inPipeline, '#4d8df0', 'Applicants not yet approved / rejected'),
    kpiChip('EDD required', s.eddCount, RATING_COLOR.High, 'Applicants that trigger Enhanced Due Diligence'),
    kpiChip('Prohibited', s.prohibited, RATING_COLOR.Prohibited, 'Applicants floored to a Prohibited / hard-stop posture'),
    kpiChip('Screening hits', s.screeningHits, '#f0616d', 'Applicants with a synthetic watchlist match'),
    kpiChip('PEP declared', s.pepCount, '#a97bf0', 'Applicants that self-declare as politically-exposed')));

  // Two distribution bars: by rating, by stage (hand-built, colour + label).
  nodes.push(el('div', { class: 'row wrap', style: { gap: '12px', marginBottom: '4px' } },
    el('div', { style: { flex: '1 1 320px', minWidth: '0' } }, ratingDistributionCard(data)),
    el('div', { style: { flex: '1 1 320px', minWidth: '0' } }, stageDistributionCard(data))));

  // The onboarding queue table.
  nodes.push(queueTableCard(data));

  nodes.push(disclaimerNote(data.disclaimer));
  panel.replaceChildren(...nodes);
}

// Rating distribution: one labelled, coloured proportional bar per rating band.
function ratingDistributionCard(data) {
  const by = data.summary.byRating || {};
  const total = data.summary.total || 1;
  const bands = data.ratingBands || [];
  const rows = bands.map((b) => {
    const n = by[b.code] || 0;
    const pct = Math.round((n / total) * 100);
    return el('a', { class: 'row wrap', href: '#/onboarding', style: { gap: '10px', alignItems: 'center', padding: '6px 0', textDecoration: 'none' }, title: `${n} applicant(s) rated ${b.code} — ${b.blurb || ''}` },
      ratingBadge(b.code),
      el('div', { style: { flex: '1 1 auto', minWidth: '80px' } }, hbar(pct, RATING_COLOR[b.code])),
      el('span', { class: 'small muted tabular', style: { minWidth: '58px', textAlign: 'right' } }, `${n} · ${pct}%`));
  });
  return card('Customer-risk rating mix', { sub: `${data.summary.total} applicants across four rating bands`, actions: el('span', { class: 'badge sq neutral' }, 'Explainable') }, ...rows);
}

// Stage distribution: one labelled, coloured proportional bar per pipeline stage.
function stageDistributionCard(data) {
  const by = data.summary.byStage || {};
  const total = data.summary.total || 1;
  const stages = data.stages || [];
  const rows = stages.map((st) => {
    const n = by[st.code] || 0;
    const pct = Math.round((n / total) * 100);
    return el('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center', padding: '6px 0' }, title: st.blurb || '' },
      el('span', { class: 'badge sq neutral', style: { minWidth: '92px', justifyContent: 'flex-start' } },
        el('span', { class: 'dot', style: { background: st.color } }), st.label),
      el('div', { style: { flex: '1 1 auto', minWidth: '80px' } }, hbar(pct, st.color)),
      el('span', { class: 'small muted tabular', style: { minWidth: '58px', textAlign: 'right' } }, `${n} · ${pct}%`));
  });
  return card('Onboarding pipeline', { sub: 'Applicants by CDD workflow stage', actions: el('a', { class: 'badge sq neutral', href: '#/onboarding', title: 'The pipeline stages', style: { textDecoration: 'none' } }, 'Pipeline') }, ...rows);
}

// The onboarding queue table — applicant, type, country, rating, DD level, review due.
function queueTableCard(data) {
  const head = el('thead', {}, el('tr', {},
    el('th', { scope: 'col', style: { textAlign: 'left', minWidth: '180px' } }, 'Applicant'),
    el('th', { scope: 'col', style: { textAlign: 'left' } }, 'Type'),
    el('th', { scope: 'col', style: { textAlign: 'left' } }, 'Country'),
    el('th', { scope: 'col', style: { textAlign: 'left' } }, 'Sector'),
    el('th', { scope: 'col', style: { textAlign: 'center' } }, 'Stage'),
    el('th', { scope: 'col', style: { textAlign: 'center' } }, 'Signals'),
    el('th', { scope: 'col', style: { textAlign: 'center' } }, el('span', {}, 'Rating'), infoDot('The composed customer-risk rating — colour + label')),
    el('th', { scope: 'col', style: { textAlign: 'center' } }, 'DD level'),
    el('th', { scope: 'col', style: { textAlign: 'left' } }, 'Review due')));

  const rows = data.applicants.map((a) => {
    const nameTh = el('th', { scope: 'row', style: { textAlign: 'left' } },
      el('a', { href: '#/onboarding/' + encodeURIComponent(a.applicantId), style: { color: 'var(--text)', textDecoration: 'none', fontWeight: '600' }, title: 'Open the CDD assessment for ' + a.legalName },
        a.legalName,
        el('span', { class: 'small muted', style: { marginLeft: '6px' } }, a.applicantId)));
    return el('tr', { class: 'clickable' },
      nameTh,
      el('td', {}, el('span', { class: 'small' }, a.typeLabel), a.pep ? el('span', { class: 'badge sq high', style: { marginLeft: '6px', fontSize: '9px' }, title: 'Self-declared politically-exposed person' }, 'PEP') : null),
      el('td', {}, el('span', { class: 'small' }, a.countryName || a.country), a.countryBand ? el('span', { class: 'badge sq neutral', style: { marginLeft: '6px', fontSize: '9px', color: CR_COLOR[a.countryBand] }, title: 'Country-risk band' }, bandShort(a.countryBand)) : null),
      el('td', {}, el('span', { class: 'small muted' }, a.sectorLabel || a.sector || '—')),
      el('td', { style: { textAlign: 'center' } }, stageBadge(a.stage, data.stages)),
      el('td', { style: { textAlign: 'center' } }, signalDots(a)),
      el('td', { style: { textAlign: 'center' } }, ratingBadge(a.rating)),
      el('td', { style: { textAlign: 'center' } }, ddBadge(a.ddLevel, a.requiresEDD)),
      el('td', {}, el('span', { class: 'small muted tabular', title: `Every ${a.cadenceMonths} months` }, a.nextReviewDate)));
  });

  return card('Onboarding queue', {
    sub: `${data.applicants.length} applicants · ranked highest customer-risk first — click any row for the full CDD assessment`,
    actions: el('span', { class: 'badge sq neutral' }, `v${data.version.version}`),
  },
    el('div', { class: 'small muted', style: { marginBottom: '8px' } }, 'Each row shows the composed rating (colour + label), the required due-diligence level and the next periodic-review date. The Signals column shows which cross-module signals fired: S = screening, A = adverse-media, G = high-risk geography.'),
    el('div', { class: 'tbl-wrap', style: { overflowX: 'auto' } },
      el('table', { class: 'tbl', style: { width: '100%', borderCollapse: 'collapse' } }, head, el('tbody', {}, ...rows))));
}

// ─────────────────────────────────────────────────────────────────────────────
// ASSESSMENT DETAIL — one applicant's full CDD assessment.
// ─────────────────────────────────────────────────────────────────────────────
async function renderAssessment(root, id) {
  const panel = el('div', {}, skeleton(400));
  root.append(panel);
  let d;
  try { d = await api.get('/api/onboarding/assess/' + encodeURIComponent(id)); }
  catch (e) { panel.replaceChildren(errorState(e.message)); return; }

  const color = RATING_COLOR[d.rating] || ACCENT;
  const nodes = [];

  // Back link.
  nodes.push(el('div', { style: { marginBottom: '10px' } },
    el('a', { class: 'btn sm ghost', href: '#/onboarding' }, icon('chevron', 14), 'Back to onboarding queue')));

  // Header card: applicant + final rating.
  nodes.push(el('div', { class: 'card', style: { '--mc': color, borderLeft: '4px solid ' + color } },
    el('div', { class: 'card-body' },
      el('div', { class: 'row wrap', style: { gap: '12px', alignItems: 'flex-start' } },
        el('div', { style: { flex: '1 1 340px', minWidth: '0' } },
          el('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center', marginBottom: '4px' } },
            el('span', { style: { fontWeight: '800', color: 'var(--text)', fontSize: '20px' } }, d.legalName),
            el('span', { class: 'badge sq neutral' }, d.applicantId),
            d.pep ? el('span', { class: 'badge sq high', title: 'Self-declared politically-exposed person' }, 'PEP') : null),
          el('div', { class: 'small muted' }, `${d.typeLabel} · ${d.countryName || d.country} · ${d.sectorLabel || d.sector}`),
          el('div', { class: 'small', style: { color: 'var(--text-2)', marginTop: '8px', lineHeight: '1.6' } }, d.rationale)),
        el('div', { style: { flex: '0 0 auto', textAlign: 'center', minWidth: '150px' } },
          el('div', { class: 'small muted', style: { marginBottom: '4px' } }, 'Customer-risk rating'),
          el('div', {}, ratingBadge(d.rating, true)),
          el('div', { class: 'tabular', style: { fontWeight: '800', fontSize: '22px', color, marginTop: '4px' } }, d.score + '/100'),
          el('div', { class: 'small muted', style: { marginTop: '4px' } }, d.ratingBlurb))))));

  // Decision strip: DD level + review cadence + next review date + override.
  nodes.push(decisionCard(d));

  // Applicant intake summary.
  nodes.push(intakeCard(d));

  // Risk-factor breakdown (hand-built bars).
  nodes.push(factorBreakdownCard(d));

  // Consumed cross-module signals (each linking back to its module).
  nodes.push(consumedSignalsCard(d));

  nodes.push(disclaimerNote(d.disclaimer));
  panel.replaceChildren(...nodes);
}

// Decision strip: the CDD/EDD outcome, cadence, next review, and any override.
function decisionCard(d) {
  const eddColor = d.requiresEDD ? RATING_COLOR.High : RATING_COLOR.Low;
  const kids = [];
  kids.push(el('div', { class: 'row wrap', style: { gap: '10px' } },
    kpiChip('Due-diligence level', d.ddLevel, eddColor, d.requiresEDD ? 'Enhanced Due Diligence is required' : 'Standard Customer Due Diligence is sufficient'),
    kpiChip('Review cadence', `Every ${d.cadenceMonths} mo`, ACCENT, 'The periodic-review cadence set by the rating band'),
    kpiChip('Next review due', d.nextReviewDate, '#4d8df0', `Computed forward from the as-of date ${d.asOf}`),
    kpiChip('Expected activity', d.expectedMonthlyUsdK != null ? ('~USD ' + fmt.num(d.expectedMonthlyUsdK) + 'k / mo') : '—', '#a97bf0', 'Illustrative expected monthly activity (does not affect the rating)')));

  // Override banner (if a sanctions hard-stop applied).
  if (d.override && d.override.applied) {
    kids.push(el('div', { class: 'intro', role: 'note', style: { marginTop: '10px', '--mc': RATING_COLOR.Prohibited } },
      el('span', { class: 'ico' }, icon('alert', 18)),
      el('div', { class: 't' }, el('b', {}, 'Override applied — '), d.override.reason)));
  }

  // EDD triggers list.
  if (d.dueDiligenceTriggers && d.dueDiligenceTriggers.length) {
    kids.push(el('div', { style: { marginTop: '10px' } },
      el('div', { class: 'small muted', style: { fontWeight: '600', color: 'var(--text)', marginBottom: '6px' } }, `Enhanced-due-diligence triggers (${d.dueDiligenceTriggers.length})`),
      el('div', { class: 'row wrap', style: { gap: '6px' } },
        ...d.dueDiligenceTriggers.map((t) => el('span', { class: 'badge sq high', title: 'An EDD trigger' }, icon('alert', 11), ' ', t.label)))));
  } else {
    kids.push(el('div', { class: 'small muted', style: { marginTop: '10px' } }, 'No EDD trigger is present — standard CDD is sufficient.'));
  }

  return card('Decision & cadence', { sub: 'The required due-diligence level and periodic-review cadence set by the rating', actions: el('span', { class: 'badge ' + (d.requiresEDD ? 'high' : 'low') }, el('span', { class: 'dot' }), d.requiresEDD ? 'EDD' : 'CDD') }, ...kids);
}

// The applicant intake summary — the CDD fields captured at onboarding.
function intakeCard(d) {
  const field = (label, value, extra) => el('div', { style: { padding: '7px 0', borderBottom: '1px solid var(--border)' } },
    el('div', { class: 'small muted' }, label),
    el('div', { style: { color: 'var(--text)', fontWeight: '500' } }, value || '—', extra || null));
  const linked = d.linkedEntity
    ? el('a', { class: 'badge sq neutral', href: '#/nexus/directory', style: { marginLeft: '8px', textDecoration: 'none' }, title: 'Open the linked entity in Sovereign Nexus' }, icon('nexus', 11), ' ', d.linkedEntity.id + (d.linkedEntity.risk ? ' · ' + d.linkedEntity.risk : ''))
    : null;
  return card('Applicant intake', { sub: 'The CDD data captured at onboarding', actions: el('span', { class: 'badge sq neutral' }, d.kind === 'corporate' ? 'Legal entity' : 'Individual') },
    el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0 20px' } },
      field('Legal name', d.legalName, linked),
      field('Customer type', d.typeLabel),
      field('Country of residence / incorporation', (d.countryName || d.country)),
      field('Industry / sector', d.sectorLabel || d.sector),
      field('Product requested', d.productLabel),
      field('Delivery channel', d.channelLabel),
      field('PEP self-declaration', d.pep ? 'Yes — politically-exposed' : 'No'),
      field('Beneficial ownership (UBO)', d.ubo || (d.kind === 'corporate' ? 'Not resolved' : 'N/A — natural person')),
      field('Expected activity', d.expectedActivity)));
}

// Risk-factor breakdown — each factor as a hand-built proportional bar with its
// weight, normalised value and points contribution (colour + label; DOM-light).
function factorBreakdownCard(d) {
  const maxPoints = Math.max(1, ...d.factors.map((f) => f.points));
  const rows = d.factors.map((f) => {
    // Bar width is the factor's share of the LARGEST contributor (so the biggest
    // driver fills the bar) — the numeric points + weight are always shown too.
    const w = Math.round((f.points / maxPoints) * 100);
    const barColor = pointsColor(f.normalised);
    return el('div', { style: { padding: '9px 0', borderBottom: '1px solid var(--border)' } },
      el('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center', marginBottom: '4px' } },
        el('span', { style: { fontWeight: '700', color: 'var(--text)', flex: '1 1 auto', minWidth: '120px' } }, f.label),
        el('span', { class: 'badge sq neutral', title: 'The factor’s fixed weight in the model' }, 'weight ' + f.weight),
        el('span', { class: 'small tabular', style: { minWidth: '96px', textAlign: 'right', color: 'var(--text)', fontWeight: '600' } }, `+${f.points} pts`)),
      el('div', { class: 'row', style: { gap: '10px', alignItems: 'center' } },
        el('div', { style: { flex: '1 1 auto', minWidth: '80px' } }, hbar(w, barColor)),
        el('span', { class: 'small muted tabular', style: { minWidth: '112px', textAlign: 'right' }, title: 'The factor’s normalised [0,1] contribution and its share of the final score' }, `norm ${f.normalised} · ${f.contributionPct}%`)),
      el('div', { class: 'small muted', style: { marginTop: '4px' } }, f.explanation));
  });
  const sumPts = Math.round(d.factors.reduce((a, f) => a + f.points, 0));
  return card('Risk-factor breakdown', {
    sub: `Seven weighted CDD factors — every point is attributable to a named factor (they sum to ${sumPts}${d.override && d.override.applied ? `, before the override lifts the score to ${d.score}` : ` = the ${d.score}/100 score`})`,
    actions: el('span', { class: 'badge sq neutral' }, 'Auditable'),
  },
    el('div', { class: 'small muted', style: { marginBottom: '10px' } }, 'Each factor maps its input to a normalised value in [0,1]; the contribution (points) is that value × the factor’s weight, scaled to the 0–100 score. The bar shows each factor’s share of the largest contributor.'),
    ...rows);
}

// Consumed cross-module signals — screening, adverse-media, country, sector — each
// shown explicitly with its band (colour + label) and a link back to its module.
function consumedSignalsCard(d) {
  const sig = d.signals;
  const panels = [];

  // Screening (Screening & Watchlist).
  {
    const sc = sig.screening;
    const body = sc.matched
      ? el('div', {},
        el('div', { class: 'row wrap', style: { gap: '8px', alignItems: 'center', marginBottom: '4px' } },
          screeningBadge(sc.band),
          el('span', { class: 'small', style: { color: 'var(--text)', fontWeight: '600' } }, `${sc.listLabel || sc.list}`),
          el('span', { class: 'small muted' }, `score ${sc.score}/100`)),
        el('div', { class: 'small muted' }, `Matched synthetic entry: “${sc.matchedName}”.`))
      : el('div', { class: 'small muted' }, 'No synthetic watchlist match on the applicant name or its linked Nexus entity.');
    panels.push(signalPanel('Screening & Watchlist', 'alert', '#f0616d', '#/screening', 'Open Screening & Watchlist', body, sc.matched ? (sc.list === 'sanctions' ? 'Sanctions' : sc.list === 'pep' ? 'PEP' : 'Match') : 'Clear'));
  }

  // Adverse-media (Adverse-Media / OSINT).
  {
    const am = sig.adverseMedia;
    const body = am.found
      ? el('div', {},
        el('div', { class: 'row wrap', style: { gap: '8px', alignItems: 'center', marginBottom: '4px' } },
          amBadge(am.band),
          el('span', { class: 'small muted' }, `${am.itemCount} item(s) · composite ${am.score}/100${am.peakSeverity ? ' · peak ' + am.peakSeverity : ''}`)),
        am.timeline && am.timeline.length
          ? el('div', { style: { display: 'grid', gap: '2px', marginTop: '4px' } },
            ...am.timeline.slice(0, 3).map((t) => el('div', { class: 'small muted', style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, el('span', { class: 'tabular' }, t.date), ' — ', t.headline)))
          : null)
      : el('div', { class: 'small muted' }, 'No adverse-media items on file for the linked entity (or no Nexus link).');
    panels.push(signalPanel('Adverse-Media / OSINT', 'bell', '#e5a53b', d.entityId ? '#/adverse-media/subject/' + encodeURIComponent(d.entityId) : '#/adverse-media', 'Open Adverse-Media / OSINT', body, am.found ? am.band : 'None'));
  }

  // Country risk (Country & Sector Risk Index).
  {
    const cr = sig.country;
    const body = cr
      ? el('div', {},
        el('div', { class: 'row wrap', style: { gap: '8px', alignItems: 'center', marginBottom: '4px' } },
          crBadge(cr.band),
          el('span', { class: 'small muted' }, `${cr.name}${cr.seeded ? ' · anchored to a seeded secrecy fact' : ''}`)),
        cr.peakDimensions && cr.peakDimensions.length ? el('div', { class: 'small muted' }, 'Peak dimensions: ' + cr.peakDimensions.join(', ')) : null)
      : el('div', { class: 'small muted' }, 'No country on file.');
    panels.push(signalPanel('Country risk', 'database', '#4d8df0', cr ? '#/risk-index/jurisdiction/' + encodeURIComponent(cr.code) : '#/risk-index', 'Open the jurisdiction profile', body, cr ? bandShort(cr.band) : '—'));
  }

  // Sector risk (Country & Sector Risk Index).
  {
    const sr = sig.sector;
    const body = sr
      ? el('div', {},
        el('div', { class: 'row wrap', style: { gap: '8px', alignItems: 'center', marginBottom: '4px' } },
          crBadge(sr.band),
          el('span', { class: 'small', style: { color: 'var(--text)', fontWeight: '600' } }, sr.label)),
        sr.drivers && sr.drivers.length ? el('div', { class: 'row wrap', style: { gap: '4px', marginTop: '2px' } }, ...sr.drivers.slice(0, 3).map((x) => el('span', { class: 'badge sq neutral', style: { fontSize: '10px' } }, x))) : null)
      : el('div', { class: 'small muted' }, 'No sector on file.');
    panels.push(signalPanel('Sector risk', 'waterfall', '#d98c4a', '#/risk-index/sectors', 'Open the sector-risk table', body, sr ? bandShort(sr.band) : '—'));
  }

  return card('Consumed signals', {
    sub: 'The cross-module signals this assessment pulled — each links back to its source module',
    actions: el('span', { class: 'badge sq neutral' }, 'Cross-module'),
  },
    el('div', { class: 'small muted', style: { marginBottom: '10px' } }, 'The rating COMPOSES these four signals from the modules FRIS already has. Each panel shows the consumed band (colour + label) and links back to the module it came from.'),
    el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px' } }, ...panels));
}

// One consumed-signal panel: a compact card with an icon, a link back to the source
// module, and the signal body.
function signalPanel(title, iconName, accent, href, linkTitle, body, badgeText) {
  return el('div', { class: 'card', style: { '--mc': accent, borderLeft: '3px solid ' + accent, padding: '0' } },
    el('div', { class: 'card-body', style: { padding: '12px' } },
      el('div', { class: 'row wrap', style: { gap: '8px', alignItems: 'center', marginBottom: '8px' } },
        el('span', { class: 'mc-icon', style: { color: accent, flex: '0 0 auto' } }, icon(iconName, 15)),
        el('a', { href, title: linkTitle, style: { color: 'var(--text)', fontWeight: '700', textDecoration: 'none', flex: '1 1 auto', minWidth: '0' } }, title),
        badgeText ? el('span', { class: 'badge sq neutral', style: { fontSize: '10px' } }, badgeText) : null),
      body));
}

// ── Small shared UI helpers (guarded; no DOM geometry / matchMedia dependence) ─

// A hand-built horizontal proportional bar (colour + width). DOM-light, e2e-safe.
function hbar(pct, color) {
  const w = Math.max(0, Math.min(100, Number(pct) || 0));
  return el('div', { class: 'onb-bar', style: { position: 'relative', height: '9px', background: 'var(--surface-2, #131924)', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border)' } },
    el('span', { style: { position: 'absolute', left: '0', top: '0', bottom: '0', width: w + '%', background: color || ACCENT, borderRadius: '6px' } }));
}

// The customer-risk rating badge (colour ALWAYS paired with the label).
function ratingBadge(rating, large) {
  const cls = RATING_BADGE[rating] || 'neutral';
  const color = RATING_COLOR[rating];
  const style = { background: color ? hexToRgba(color, 0.18) : undefined, color: color || undefined, borderColor: color ? hexToRgba(color, 0.5) : undefined };
  if (large) { style.fontSize = '15px'; style.padding = '5px 12px'; style.fontWeight = '800'; }
  return el('span', { class: 'badge ' + cls, title: 'Customer-risk rating: ' + (rating || ''), style }, el('span', { class: 'dot' }), rating || '—');
}

// A country / sector band badge (Moderate / High / Very-high…).
function crBadge(band) {
  const color = CR_COLOR[band];
  return el('span', { class: 'badge', title: 'Risk band: ' + (band || ''), style: { background: color ? hexToRgba(color, 0.18) : undefined, color: color || undefined, borderColor: color ? hexToRgba(color, 0.5) : undefined } }, el('span', { class: 'dot' }), bandLabel(band));
}
// An adverse-media band badge.
function amBadge(band) {
  const color = AM_COLOR[band];
  return el('span', { class: 'badge', title: 'Adverse-media band: ' + (band || ''), style: { background: color ? hexToRgba(color, 0.18) : undefined, color: color || undefined, borderColor: color ? hexToRgba(color, 0.5) : undefined } }, el('span', { class: 'dot' }), band || '—');
}
// A screening match-band badge.
function screeningBadge(band) {
  const color = SCR_COLOR[band];
  return el('span', { class: 'badge', title: 'Screening match band: ' + (band || ''), style: { background: color ? hexToRgba(color, 0.18) : undefined, color: color || undefined, borderColor: color ? hexToRgba(color, 0.5) : undefined } }, el('span', { class: 'dot' }), band || '—');
}
// A pipeline-stage badge (colour + label).
function stageBadge(code, stages) {
  const st = (stages || []).find((s) => s.code === code) || { label: code, color: '#5b6b82' };
  return el('span', { class: 'badge sq neutral', title: 'Pipeline stage', style: { color: st.color } }, el('span', { class: 'dot', style: { background: st.color } }), st.label);
}
// A DD-level badge (EDD highlighted).
function ddBadge(ddLevel, requiresEDD) {
  const isEdd = requiresEDD || /EDD/.test(String(ddLevel));
  const color = isEdd ? (String(ddLevel).includes('decline') ? RATING_COLOR.Prohibited : RATING_COLOR.High) : RATING_COLOR.Low;
  return el('span', { class: 'badge ' + (isEdd ? 'high' : 'low'), title: 'Required due-diligence level', style: { color, borderColor: hexToRgba(color, 0.5), background: hexToRgba(color, 0.14) } }, el('span', { class: 'dot' }), ddLevel);
}
// Compact signal dots for the queue table (S = screening, A = adverse, G = geography).
function signalDots(a) {
  const dots = [];
  if (a.screeningHit) dots.push(el('span', { class: 'badge sq high', style: { fontSize: '9px' }, title: `Screening match (${a.screeningList || 'watchlist'})` }, 'S'));
  if (a.adverseHit) dots.push(el('span', { class: 'badge sq neutral', style: { fontSize: '9px', color: AM_COLOR[a.adverseBand] }, title: `Adverse-media (${a.adverseBand})` }, 'A'));
  if (a.countryBand === 'Very-high') dots.push(el('span', { class: 'badge sq neutral', style: { fontSize: '9px', color: CR_COLOR['Very-high'] }, title: 'High-risk geography' }, 'G'));
  return dots.length ? el('span', { class: 'row', style: { gap: '3px', justifyContent: 'center' } }, ...dots) : el('span', { class: 'small muted' }, '—');
}

function kpiChip(label, value, colour, title) {
  return el('div', { class: 'card', style: { flex: '1 1 120px', padding: '10px 12px' }, title: title || '' },
    el('div', { class: 'small muted' }, label),
    el('div', { class: 'tabular', style: { fontWeight: '800', fontSize: '20px', color: colour || 'var(--text)' } }, String(value)));
}
function disclaimerNote(text) {
  return el('div', { class: 'intro', style: { marginTop: '18px' } }, el('span', { class: 'ico' }, icon('info', 18)), el('div', { class: 't' }, el('b', {}, 'Synthetic demo — not a system of record. '), text));
}
function bandLabel(band) { return band === 'Very-high' ? 'Very high' : (band || '—'); }
function bandShort(band) { return band === 'Very-high' ? 'V-high' : (band || '—'); }
// Colour a factor bar by its normalised value (low→green, high→red).
function pointsColor(norm) {
  const n = Number(norm) || 0;
  if (n >= 0.72) return CR_COLOR['Very-high'];
  if (n >= 0.5) return CR_COLOR.High;
  if (n >= 0.3) return CR_COLOR.Moderate;
  return CR_COLOR.Low;
}
// Pure hex→rgba (guarded; no DOM/canvas dependency, e2e-safe).
function hexToRgba(hex, alpha) {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6) return `rgba(90,107,130,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
