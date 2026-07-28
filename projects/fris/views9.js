// View: Country & Sector Risk Index — a sourced, CATEGORICAL jurisdiction ×
// risk-dimension heat-map / index. The main sub-view is a colour-graded HEAT-MAP
// MATRIX (jurisdictions as rows, risk dimensions as columns, each cell coloured by
// band AND labelled with the band name — never colour-only), with an overall band
// per jurisdiction, clickable into a JURISDICTION RISK PROFILE (per-dimension bands
// + explanations, the entities and vendors registered there, and the applicable
// REAL regulations with source links). A SECTOR-RISK panel lists the inherent risk
// per line of business, and a COMBINED jurisdiction × sector lookup blends the two.
//
// Honest posture: the bands are illustrative + categorical (with a disclaimer);
// where a real FRIS fact exists (a jurisdiction's seeded secrecy score + offshore
// flag) the financial-secrecy band is DERIVED from it and cited. Renders in-page
// within the shell (never a viewport takeover), accessible (table headers carry
// scope, colour is always paired with a text label), and the DOM is kept light
// (the matrix is ~20 rows × 6 columns — no thousands of cells) so it stays fast and
// e2e-safe. No SVG geometry, no getBBox / matchMedia dependence.
import { el, api, fmt, icon, card, toast, emptyState, errorState, skeleton, meter, infoDot } from './core.js';
import { pageHead, intro } from './views1.js';

// Band → heat-map cell styling. Colour is ALWAYS shown with the text label; the
// mapping is fixed and mirrors the engine's RISK_BANDS palette.
const BAND_COLOR = { Low: '#2f9e63', Moderate: '#c9a227', High: '#e07b39', 'Very-high': '#d5303e' };
const BAND_BADGE = { Low: 'low', Moderate: 'med', High: 'high', 'Very-high': 'high' };
const BAND_TEXT = { Low: '#0b1f14', Moderate: '#1f1804', High: '#1f0f04', 'Very-high': '#20060a' };

export async function riskIndex(root, parts) {
  root.append(pageHead('Country & Sector Risk Index', 'A sourced, categorical jurisdiction × risk-dimension heat-map — financial secrecy, AML/CFT posture, corruption, sanctions exposure, rule of law and tax transparency — with an overall band per jurisdiction and an inherent sector-risk view', [
    el('a', { class: 'btn sm', href: '#/vendors', title: 'Third-Party / Vendor Risk (consumes this jurisdiction signal)' }, icon('folder', 15), 'Vendor Risk'),
  ]));
  root.append(intro('Country & Sector Risk Index',
    'rates jurisdictions across six inherent-risk dimensions and lines of business by inherent sector risk, as coarse CATEGORICAL bands (Low / Moderate / High / Very-high). Read the heat-map matrix, click any jurisdiction to open its full risk profile — per-dimension bands with explanations, the entities and vendors registered there, and the real regulations that apply — review inherent sector risk, or combine a jurisdiction and a sector to see the inherent risk of operating that business there. Where FRIS already holds a real fact (a jurisdiction’s own secrecy score and offshore status), the financial-secrecy band is derived from it and cited.'));

  // Honesty banner.
  root.append(el('div', { class: 'intro', role: 'note', style: { marginTop: '10px', '--mc': '#d5303e' } },
    el('span', { class: 'ico' }, icon('info', 18)),
    el('div', { class: 't' }, el('b', {}, 'Illustrative & categorical — not a system of record. '),
      'The bands, the FATF-STYLE AML/CFT categories and the corruption-perception BANDS are an illustrative modelling posture for demonstration — they are NOT copyrighted numeric indices, NOT an assertion that any named jurisdiction sits on a real greylist / blacklist, and NOT legal, sanctions or compliance advice. Real, publicly-sourced FRIS facts (a jurisdiction’s secrecy score / offshore status) are reused and cited where they exist.')));

  // A jurisdiction route (#/risk-index/jurisdiction/BVI) opens the profile.
  if (parts[0] === 'jurisdiction' && parts[1]) {
    const body = el('div', { class: 'mt' });
    root.append(body);
    await renderJurisdictionProfile(body, parts[1].toUpperCase());
    return;
  }

  // ── Sub-tab router (matrix · sectors · combined) ────────────────────────────
  const TABS = [
    ['matrix', 'Heat-map matrix', 'overview'],
    ['sectors', 'Sector risk', 'waterfall'],
    ['combined', 'Combined lookup', 'scale'],
  ];
  const active = TABS.some((t) => t[0] === parts[0]) ? parts[0] : 'matrix';
  const tabBar = el('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Country-risk views', style: { margin: '14px 0 6px' } },
    ...TABS.map(([id, label, ic]) => el('a', {
      class: 'tab' + (id === active ? ' active' : ''), href: '#/risk-index/' + id, role: 'tab',
      'aria-selected': id === active ? 'true' : 'false',
    }, icon(ic, 15), label)));
  root.append(tabBar);

  const body = el('div', { class: 'mt' });
  root.append(body);

  if (active === 'sectors') await renderSectors(body);
  else if (active === 'combined') await renderCombined(body);
  else await renderMatrix(body);
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1 — Heat-map matrix (jurisdictions × dimensions, colour + label, clickable)
// ─────────────────────────────────────────────────────────────────────────────
async function renderMatrix(root) {
  const panel = el('div', {}, skeleton(320));
  root.append(panel);

  let data;
  try { data = await api.get('/api/risk-index/matrix'); }
  catch (e) { panel.replaceChildren(errorState(e.message)); return; }
  if (!data.rows.length) { panel.replaceChildren(emptyState('No jurisdictions in the index')); return; }

  const nodes = [];

  // KPI strip: totals by overall band.
  const bo = data.summary.byOverall || {};
  nodes.push(el('div', { class: 'row wrap', style: { gap: '10px', marginBottom: '12px' } },
    kpiChip('Jurisdictions', data.summary.total),
    kpiChip('Very high', bo['Very-high'] || 0, BAND_COLOR['Very-high']),
    kpiChip('High', bo.High || 0, BAND_COLOR.High),
    kpiChip('Moderate', bo.Moderate || 0, BAND_COLOR.Moderate),
    kpiChip('Anchored to real facts', data.summary.seededCount)));

  // The matrix table.
  const dims = data.dimensions;
  const headCells = [el('th', { scope: 'col', style: { textAlign: 'left', minWidth: '160px' } }, 'Jurisdiction')];
  for (const d of dims) headCells.push(el('th', { scope: 'col', title: d.description, style: { textAlign: 'center' } }, el('span', {}, d.short), infoDot(d.description)));
  headCells.push(el('th', { scope: 'col', style: { textAlign: 'center' } }, 'Overall'));
  const thead = el('thead', {}, el('tr', {}, ...headCells));

  const bodyRows = data.rows.map((r) => {
    // Row header = jurisdiction (a scope="row" <th>), clickable to the profile.
    const nameTh = el('th', { scope: 'row', style: { textAlign: 'left' } },
      el('a', { href: '#/risk-index/jurisdiction/' + r.code, style: { color: 'var(--text)', textDecoration: 'none', fontWeight: '600' }, title: 'Open ' + r.name + ' risk profile' },
        r.name,
        el('span', { class: 'small muted', style: { marginLeft: '6px' } }, r.code),
        r.seeded ? el('span', { class: 'badge sq neutral', style: { marginLeft: '6px', fontSize: '9px' }, title: 'Secrecy band anchored to a seeded FRIS fact' }, 'sourced') : null));
    const cells = r.cells.map((c) => heatCell(c));
    const overallTd = el('td', { style: { textAlign: 'center' } }, bandBadge(r.overall));
    return el('tr', { class: 'clickable' }, nameTh, ...cells, overallTd);
  });
  const tbody = el('tbody', {}, ...bodyRows);

  const table = el('table', { class: 'tbl risk-matrix', style: { width: '100%', borderCollapse: 'collapse' } }, thead, tbody);

  nodes.push(card('Jurisdiction × risk-dimension heat-map', {
    sub: `${data.summary.total} jurisdictions · ${dims.length} dimensions · v${data.version.version} — ranked highest inherent risk first`,
    actions: el('span', { class: 'badge sq neutral' }, 'Categorical'),
  },
    el('div', { class: 'small muted', style: { marginBottom: '8px' } }, 'Each cell shows a categorical band (colour + label). Click a jurisdiction name to open its full profile.'),
    el('div', { class: 'tbl-wrap', style: { overflowX: 'auto' } }, table),
    bandLegend(data.bands)));

  nodes.push(disclaimerNote(data.disclaimer));
  panel.replaceChildren(...nodes);
}

// One heat-map cell: a band-coloured block that ALWAYS shows the band label text
// (never colour-only), so it is legible to colour-blind and screen-reader users.
function heatCell(c) {
  const color = BAND_COLOR[c.band] || '#5b6b82';
  const text = BAND_TEXT[c.band] || '#fff';
  return el('td', { style: { textAlign: 'center', padding: '4px' } },
    el('span', {
      class: 'heat-cell',
      title: c.label + (c.provenance === 'derived-from-seeded-fact' ? ' (derived from a seeded FRIS fact)' : ' (illustrative)'),
      'aria-label': c.label + ' risk',
      style: { display: 'inline-block', minWidth: '78px', padding: '4px 8px', borderRadius: '6px', background: color, color: text, fontWeight: '700', fontSize: '11px', border: c.provenance === 'derived-from-seeded-fact' ? '1px solid rgba(255,255,255,0.55)' : '1px solid rgba(0,0,0,0.15)' },
    }, c.label));
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2 — Sector risk (inherent risk per line of business)
// ─────────────────────────────────────────────────────────────────────────────
async function renderSectors(root) {
  const panel = el('div', {}, skeleton(260));
  root.append(panel);
  let data;
  try { data = await api.get('/api/risk-index/sectors'); }
  catch (e) { panel.replaceChildren(errorState(e.message)); return; }
  if (!data.sectors.length) { panel.replaceChildren(emptyState('No sectors in the table')); return; }

  const nodes = [];
  const bb = data.summary.byBand || {};
  nodes.push(el('div', { class: 'row wrap', style: { gap: '10px', marginBottom: '12px' } },
    kpiChip('Sectors', data.summary.total),
    kpiChip('Very high', bb['Very-high'] || 0, BAND_COLOR['Very-high']),
    kpiChip('High', bb.High || 0, BAND_COLOR.High),
    kpiChip('Moderate', bb.Moderate || 0, BAND_COLOR.Moderate)));

  const rows = data.sectors.map((s) => {
    const color = BAND_COLOR[s.band] || 'var(--accent)';
    return el('div', { class: 'card', style: { '--mc': color, borderLeft: '4px solid ' + color, marginBottom: '10px' } },
      el('div', { class: 'card-body' },
        el('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center', marginBottom: '6px' } },
          el('span', { style: { fontWeight: '700', color: 'var(--text)', fontSize: '15px' } }, s.label),
          el('span', { class: 'spacer' }),
          bandBadge(s.band)),
        el('div', { class: 'small muted', style: { marginBottom: '6px' } }, s.note),
        el('div', { class: 'row wrap', style: { gap: '6px' } },
          el('span', { class: 'small muted', style: { alignSelf: 'center' } }, 'Drivers:'),
          ...s.drivers.map((d) => el('span', { class: 'badge sq neutral' }, d)))));
  });
  nodes.push(card('Inherent sector risk', {
    sub: `${data.summary.total} lines of business — ranked highest inherent risk first`,
    actions: el('span', { class: 'badge sq neutral' }, 'Categorical'),
  }, el('div', { class: 'small muted', style: { marginBottom: '10px' } }, 'The inherent AML / financial-crime risk of a line of business, before any counterparty-specific factors. Combine one with a jurisdiction in the Combined lookup tab.'), ...rows));

  nodes.push(disclaimerNote(data.disclaimer));
  panel.replaceChildren(...nodes);
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 3 — Combined jurisdiction × sector lookup
// ─────────────────────────────────────────────────────────────────────────────
async function renderCombined(root) {
  const panel = el('div', {}, skeleton(220));
  root.append(panel);
  // Load the matrix (for the jurisdiction list) and the sectors in parallel.
  let mx, sec;
  try { [mx, sec] = await Promise.all([api.get('/api/risk-index/matrix'), api.get('/api/risk-index/sectors')]); }
  catch (e) { panel.replaceChildren(errorState(e.message)); return; }

  const state = { jurisdiction: (mx.rows[0] && mx.rows[0].code) || '', sector: (sec.sectors[0] && sec.sectors[0].code) || '' };

  const jurSelect = el('select', { class: 'fin-select', 'aria-label': 'Jurisdiction', style: selectStyle(), onchange: (e) => { state.jurisdiction = e.target.value; refresh(); } },
    ...mx.rows.slice().sort((a, b) => String(a.name).localeCompare(String(b.name))).map((r) => el('option', { value: r.code }, `${r.name} (${r.code})`)));
  const secSelect = el('select', { class: 'fin-select', 'aria-label': 'Sector', style: selectStyle(), onchange: (e) => { state.sector = e.target.value; refresh(); } },
    ...sec.sectors.slice().sort((a, b) => String(a.label).localeCompare(String(b.label))).map((s) => el('option', { value: s.code }, s.label)));
  // Preselect the first option's value in the shim/browser.
  jurSelect.value = state.jurisdiction; secSelect.value = state.sector;

  const resultWrap = el('div', { class: 'mt' });

  panel.replaceChildren(
    card('Combined jurisdiction × sector risk', {
      sub: 'The inherent risk of operating a line of business inside a jurisdiction — a categorical blend of the two',
      actions: el('span', { class: 'badge sq neutral' }, 'Categorical'),
    },
      el('div', { class: 'row wrap', style: { gap: '12px', alignItems: 'flex-end' } },
        fieldWrap('Jurisdiction', jurSelect),
        fieldWrap('Sector', secSelect)),
      el('div', { class: 'small muted', style: { marginTop: '6px' } }, 'The blend is biased toward the higher of the two inputs, so a high-risk business in a high-risk place is treated as the worst case.')),
    resultWrap);

  async function refresh() {
    resultWrap.replaceChildren(skeleton(160));
    if (!state.jurisdiction || !state.sector) { resultWrap.replaceChildren(emptyState('Pick a jurisdiction and a sector')); return; }
    let r;
    try { r = await api.get(`/api/risk-index/combined?jurisdiction=${encodeURIComponent(state.jurisdiction)}&sector=${encodeURIComponent(state.sector)}`); }
    catch (e) { resultWrap.replaceChildren(errorState(e.message)); return; }
    resultWrap.replaceChildren(combinedResultCard(r));
  }
  refresh();
}

function combinedResultCard(r) {
  const color = BAND_COLOR[r.combined] || 'var(--accent)';
  return el('div', { class: 'card', style: { '--mc': color, borderLeft: '4px solid ' + color } },
    el('div', { class: 'card-body' },
      el('div', { class: 'row wrap', style: { gap: '12px', alignItems: 'flex-start' } },
        el('div', { style: { flex: '1 1 300px', minWidth: '0' } },
          el('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center', marginBottom: '8px' } },
            el('a', { href: '#/risk-index/jurisdiction/' + r.jurisdiction.code, style: { color: 'var(--text)', textDecoration: 'none', fontWeight: '700' }, title: 'Open jurisdiction profile' }, r.jurisdiction.name),
            bandBadge(r.jurisdiction.overall, 'jurisdiction'),
            el('span', { class: 'small muted' }, '×'),
            el('span', { style: { fontWeight: '700', color: 'var(--text)' } }, r.sector.label),
            bandBadge(r.sector.band, 'sector')),
          el('div', { class: 'small', style: { color: 'var(--text-2)', lineHeight: '1.6' } }, r.explanation),
          el('div', { class: 'row wrap', style: { gap: '6px', marginTop: '8px' } },
            el('span', { class: 'small muted', style: { alignSelf: 'center' } }, 'Sector drivers:'),
            ...r.sector.drivers.slice(0, 4).map((d) => el('span', { class: 'badge sq neutral' }, d)))),
        el('div', { style: { flex: '0 0 auto', textAlign: 'center', minWidth: '140px' } },
          el('div', { class: 'small muted', style: { marginBottom: '4px' } }, 'Combined inherent risk'),
          el('div', {}, bandBadge(r.combined, null, true)),
          el('div', { class: 'small muted', style: { marginTop: '6px' } }, r.combinedBlurb)))));
}

// ─────────────────────────────────────────────────────────────────────────────
// PROFILE — one jurisdiction: dimensions + explanations + entities/vendors + regs
// ─────────────────────────────────────────────────────────────────────────────
async function renderJurisdictionProfile(root, code) {
  const panel = el('div', {}, skeleton(320));
  root.append(panel);
  let data;
  try { data = await api.get('/api/risk-index/jurisdiction/' + encodeURIComponent(code)); }
  catch (e) { panel.replaceChildren(errorState(e.message)); return; }

  const p = data.profile;
  const color = BAND_COLOR[p.overall] || 'var(--accent)';
  const nodes = [];

  // Back link.
  nodes.push(el('div', { style: { marginBottom: '10px' } },
    el('a', { class: 'btn sm ghost', href: '#/risk-index/matrix' }, icon('chevron', 14), 'Back to heat-map')));

  // Header card: jurisdiction + overall band.
  nodes.push(el('div', { class: 'card', style: { '--mc': color, borderLeft: '4px solid ' + color } },
    el('div', { class: 'card-body' },
      el('div', { class: 'row wrap', style: { gap: '12px', alignItems: 'flex-start' } },
        el('div', { style: { flex: '1 1 320px', minWidth: '0' } },
          el('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center', marginBottom: '4px' } },
            el('span', { style: { fontWeight: '800', color: 'var(--text)', fontSize: '20px' } }, p.name),
            el('span', { class: 'badge sq neutral' }, p.code),
            p.seeded ? el('span', { class: 'badge sq neutral', title: 'Secrecy band anchored to a seeded FRIS fact' }, 'sourced fact') : null),
          el('div', { class: 'small muted' }, `${p.country} · ${p.region}`),
          el('div', { class: 'small', style: { color: 'var(--text-2)', marginTop: '8px', lineHeight: '1.6' } }, p.explanation)),
        el('div', { style: { flex: '0 0 auto', textAlign: 'center', minWidth: '140px' } },
          el('div', { class: 'small muted', style: { marginBottom: '4px' } }, 'Overall inherent risk'),
          el('div', {}, bandBadge(p.overall, null, true)),
          el('div', { class: 'small muted', style: { marginTop: '6px' } }, p.overallBlurb))))));

  // Per-dimension breakdown.
  nodes.push(dimensionsCard(p));

  // Registered entities + vendors (cross-module).
  nodes.push(registeredCard(data));

  // Applicable REAL regulations.
  nodes.push(regulationsCard(data.regulations));

  nodes.push(disclaimerNote(data.disclaimer));
  panel.replaceChildren(...nodes);
}

function dimensionsCard(p) {
  const rows = p.dimensions.map((d) => {
    const color = BAND_COLOR[d.band] || 'var(--accent)';
    return el('div', { style: { padding: '10px 0', borderBottom: '1px solid var(--border)' } },
      el('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center', marginBottom: '4px' } },
        el('span', { style: { fontWeight: '700', color: 'var(--text)', flex: '1 1 auto' } }, d.label),
        d.provenance === 'derived-from-seeded-fact' ? el('span', { class: 'badge sq neutral', title: 'Derived from a real seeded FRIS fact' }, 'sourced') : el('span', { class: 'badge sq neutral', title: 'Illustrative categorical band' }, 'illustrative'),
        bandBadge(d.band)),
      el('div', { class: 'small muted', style: { marginBottom: d.provenanceDetail ? '4px' : '0' } }, d.description),
      d.provenanceDetail ? el('div', { class: 'small', style: { color: 'var(--accent)' } }, icon('link', 12), ' ', d.provenanceDetail) : null);
  });
  return card('Risk dimensions', {
    sub: `Six inherent-risk dimensions · overall composes to ${p.overallLabel}`,
    actions: el('span', { class: 'badge sq neutral' }, 'Explainable'),
  }, ...rows);
}

function registeredCard(data) {
  const ent = data.entities || { rows: [], total: 0 };
  const vendors = data.vendors || [];
  const nodes = [];

  nodes.push(el('div', { class: 'small muted', style: { fontWeight: '600', color: 'var(--text)', marginBottom: '6px' } }, `Entities registered here (${ent.total})`));
  if (ent.rows.length) {
    nodes.push(el('div', { style: { display: 'grid', gap: '4px', marginBottom: '12px' } },
      ...ent.rows.map((e) => el('a', { class: 'row wrap', href: '#/nexus/directory', style: { gap: '8px', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--border)', textDecoration: 'none' }, title: 'Open in Sovereign Nexus' },
        el('span', { class: 'mc-icon', style: { color: 'var(--accent)', flex: '0 0 auto' } }, icon('nexus', 14)),
        el('span', { style: { flex: '1 1 auto', minWidth: '0', color: 'var(--text)', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, e.name),
        el('span', { class: 'small muted tabular' }, e.id),
        e.risk ? riskDot(e.risk) : null))));
  } else nodes.push(el('div', { class: 'small muted', style: { marginBottom: '12px' } }, 'No seeded entities registered in this jurisdiction.'));

  nodes.push(el('div', { class: 'small muted', style: { fontWeight: '600', color: 'var(--text)', marginBottom: '6px' } }, `Vendors based here (${vendors.length})`));
  if (vendors.length) {
    nodes.push(el('div', { style: { display: 'grid', gap: '4px' } },
      ...vendors.map((v) => el('a', { class: 'row wrap', href: '#/vendors/' + v.id, style: { gap: '8px', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--border)', textDecoration: 'none' }, title: 'Open the vendor risk file' },
        el('span', { class: 'mc-icon', style: { color: 'var(--accent)', flex: '0 0 auto' } }, icon('folder', 14)),
        el('span', { style: { flex: '1 1 auto', minWidth: '0', color: 'var(--text)', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, v.name),
        el('span', { class: 'small muted tabular' }, v.id)))));
  } else nodes.push(el('div', { class: 'small muted' }, 'No vendors from the synthetic register are based here.'));

  return card('Registered here', { sub: 'Cross-module: the entities and vendors FRIS holds in this jurisdiction', actions: el('span', { class: 'badge sq neutral' }, 'Cross-module') }, ...nodes);
}

function regulationsCard(regs) {
  if (!regs || !regs.length) return card('Applicable regulations', { sub: 'Real, publicly-sourced instruments that apply to this jurisdiction' }, emptyState('No mapped real instruments for this jurisdiction', 'The seeded Regulatory Horizon register does not carry an instrument scoped to this jurisdiction.'));
  const rows = regs.map((r) => el('div', { style: { padding: '8px 0', borderBottom: '1px solid var(--border)' } },
    el('div', { class: 'row wrap', style: { gap: '8px', alignItems: 'center', marginBottom: '2px' } },
      el('span', { style: { fontWeight: '600', color: 'var(--text)', flex: '1 1 auto', minWidth: '0' } }, r.title),
      el('span', { class: 'badge sq neutral' }, r.jurisdiction)),
    el('div', { class: 'row wrap', style: { gap: '8px', alignItems: 'center' } },
      el('span', { class: 'small muted' }, r.authority),
      el('span', { class: 'spacer' }),
      r.sourceUrl ? el('a', { class: 'btn sm ghost', href: r.sourceUrl, target: '_blank', rel: 'noopener noreferrer', title: 'Open the official source' }, icon('ext', 12), 'Source') : null,
      el('a', { class: 'btn sm ghost', href: '#/regulatory/feed', title: 'Open in Regulatory Horizon' }, icon('regulatory', 12), 'Horizon'))));
  return card('Applicable regulations', {
    sub: `${regs.length} real, publicly-sourced instrument${regs.length === 1 ? '' : 's'} scoped to this jurisdiction — each links to its official source`,
    actions: el('span', { class: 'badge sq neutral' }, 'Real & cited'),
  }, ...rows);
}

// ── Shared small helpers ─────────────────────────────────────────────────────
function bandBadge(band, kindTitle, large) {
  const cls = BAND_BADGE[band] || 'neutral';
  const color = BAND_COLOR[band];
  const title = (kindTitle ? kindTitle + ' band: ' : '') + (band || '');
  const style = { background: color ? hexToRgba(color, 0.18) : undefined, color: color || undefined, borderColor: color ? hexToRgba(color, 0.5) : undefined };
  if (large) { style.fontSize = '15px'; style.padding = '5px 12px'; style.fontWeight = '800'; }
  return el('span', { class: 'badge ' + cls, title, style }, el('span', { class: 'dot' }), band || '—');
}
function riskDot(level) {
  const l = String(level || '').toLowerCase();
  const cls = l.startsWith('high') ? 'high' : l.startsWith('med') ? 'med' : l.startsWith('low') ? 'low' : 'neutral';
  return el('span', { class: `badge ${cls}`, title: 'Nexus risk flag: ' + level }, el('span', { class: 'dot' }), level);
}
function bandLegend(bands) {
  return el('div', { class: 'row wrap', style: { gap: '14px', marginTop: '12px' }, role: 'img', 'aria-label': 'Band legend: ' + (bands || []).map((b) => b.label).join(', ') },
    el('span', { class: 'small muted', style: { alignSelf: 'center' } }, 'Bands:'),
    ...(bands || []).map((b) => el('span', { class: 'row', style: { gap: '6px', alignItems: 'center' } },
      el('span', { style: { width: '13px', height: '13px', borderRadius: '3px', background: BAND_COLOR[b.code] || '#5b6b82', display: 'inline-block', border: '1px solid rgba(0,0,0,0.2)' } }),
      el('span', { class: 'small', title: b.blurb }, b.label))));
}
function kpiChip(label, value, colour) {
  return el('div', { class: 'card', style: { flex: '1 1 120px', padding: '10px 12px' } },
    el('div', { class: 'small muted' }, label),
    el('div', { class: 'tabular', style: { fontWeight: '800', fontSize: '20px', color: colour || 'var(--text)' } }, String(value)));
}
function fieldWrap(label, ctrl) { return el('div', { class: 'field', style: { flex: '1 1 200px' } }, el('label', {}, label), ctrl); }
function selectStyle() { return { padding: '7px 10px', background: 'var(--surface-2, #131924)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '14px', width: '100%' }; }
function disclaimerNote(text) {
  return el('div', { class: 'intro', style: { marginTop: '18px' } }, el('span', { class: 'ico' }, icon('info', 18)), el('div', { class: 't' }, el('b', {}, 'Not a system of record. '), text));
}
// Small pure hex→rgba (guarded; no DOM/canvas dependency, e2e-safe).
function hexToRgba(hex, alpha) {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6) return `rgba(90,107,130,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
