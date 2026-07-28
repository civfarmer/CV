// @ts-check
/**
 * Regulatory feed ingestion parsers (Module 4 — Regulatory Horizon).
 *
 * A modular, dependency-free, DEFENSIVE ingestion pipeline supporting
 * JSON / CSV / RSS / Atom / Markdown / plain text. Malformed records are
 * rejected safely (never throw the whole batch), records are normalised to a
 * canonical shape, deduplicated, sector/jurisdiction tagged, and returned with
 * an import summary. No network access; operates on strings/fixtures only.
 */

const MAX_FIELD = 20000;

function decodeEntities(s) {
  return String(s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Strip control chars, collapse whitespace, cap length. @param {any} s */
export function sanitizeText(s) {
  if (s == null) return '';
  return String(s)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_FIELD);
}

/**
 * @param {string} input
 * @param {string} [hint]
 * @returns {'json'|'csv'|'rss'|'atom'|'markdown'|'text'}
 */
export function detectFormat(input, hint) {
  if (hint) {
    const h = hint.toLowerCase();
    if (['json', 'csv', 'rss', 'atom', 'markdown', 'md', 'text', 'txt', 'html'].includes(h)) {
      return /** @type {any} */ (h === 'md' ? 'markdown' : h === 'txt' ? 'text' : h === 'html' ? 'text' : h);
    }
  }
  const t = input.trim();
  if (t.startsWith('{') || t.startsWith('[')) return 'json';
  if (/<feed[\s>]/i.test(t) || (/<entry[\s>]/i.test(t) && /atom/i.test(t))) return 'atom';
  if (/<rss[\s>]/i.test(t) || /<channel[\s>]/i.test(t) || /<item[\s>]/i.test(t)) return 'rss';
  if (/^#{1,6}\s/m.test(t) || /^\s*[-*]\s+/m.test(t)) return 'markdown';
  const firstLine = t.split(/\r?\n/)[0] || '';
  if (firstLine.includes(',') && firstLine.split(',').length >= 2 && !t.includes('<')) return 'csv';
  return 'text';
}

/** @param {string} input */
export function parseJSON(input) {
  const data = JSON.parse(input);
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.records)) return data.records;
  if (data && Array.isArray(data.items)) return data.items;
  return [data];
}

/**
 * RFC-4180-ish CSV parser with quoted-field support.
 * @param {string} input
 * @returns {Record<string,string>[]}
 */
export function parseCSV(input) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const s = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const nonEmpty = rows.filter((r) => r.some((x) => x.trim() !== ''));
  if (nonEmpty.length === 0) return [];
  const headers = nonEmpty[0].map((h) => h.trim());
  return nonEmpty.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => (obj[h] = (r[idx] ?? '').trim()));
    return obj;
  });
}

function tag(name, xml) {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  if (m) return decodeEntities(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')).trim();
  const self = xml.match(new RegExp(`<${name}[^>]*href=["']([^"']+)["']`, 'i'));
  return self ? self[1] : '';
}

/** @param {string} input */
export function parseRSS(input) {
  const items = input.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  return items.map((it) => ({
    title: tag('title', it),
    summary: tag('description', it),
    source_url: tag('link', it),
    publication_date: tag('pubDate', it),
    sector: tag('category', it),
    authority: tag('dc:creator', it) || tag('author', it),
  }));
}

/** @param {string} input */
export function parseAtom(input) {
  const entries = input.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  return entries.map((en) => ({
    title: tag('title', en),
    summary: tag('summary', en) || tag('content', en),
    source_url: tag('link', en),
    publication_date: tag('updated', en) || tag('published', en),
    authority: tag('name', en),
    sector: tag('category', en),
  }));
}

/** @param {string} input */
export function parseMarkdown(input) {
  const blocks = input.split(/\n(?=#{1,2}\s)/);
  const records = [];
  for (const b of blocks) {
    const hm = b.match(/^#{1,6}\s+(.+)$/m);
    if (!hm) continue;
    const title = hm[1].trim();
    const body = b.replace(/^#{1,6}\s+.+$/m, '').trim();
    const field = (label) => {
      const r = body.match(new RegExp(`\\*\\*${label}\\*\\*:?\\s*(.+)`, 'i')) || body.match(new RegExp(`${label}:\\s*(.+)`, 'i'));
      return r ? r[1].trim() : '';
    };
    records.push({
      title,
      authority: field('Authority'),
      jurisdiction: field('Jurisdiction'),
      sector: field('Sector'),
      effective_date: field('Effective'),
      publication_date: field('Published'),
      summary: body.split('\n').filter((l) => !/^\s*[-*]|\*\*/.test(l)).join(' ').trim() || body,
    });
  }
  if (records.length === 0 && input.trim()) records.push({ title: input.trim().split('\n')[0].slice(0, 120), summary: input.trim() });
  return records;
}

/** @param {string} input */
export function parseText(input) {
  const t = input.trim();
  if (!t) return [];
  return [{ title: t.split('\n')[0].slice(0, 160), summary: t }];
}

const SECTOR_KEYWORDS = {
  finance: ['bank', 'financial', 'aml', 'securities', 'finma', 'capital', 'fund', 'insurance', 'payment', 'crypto', 'markets'],
  healthcare: ['health', 'patient', 'medical', 'clinical', 'hospital', 'pharma', 'care'],
  education: ['education', 'school', 'university', 'student', 'academic', 'higher education'],
};

/** @param {string} text */
export function inferSector(text) {
  const t = (text || '').toLowerCase();
  let best = 'cross-sector';
  let bestScore = 0;
  for (const [sector, kws] of Object.entries(SECTOR_KEYWORDS)) {
    const score = kws.reduce((a, k) => a + (t.includes(k) ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; best = sector; }
  }
  return best;
}

/**
 * @param {any} raw
 * @param {{sourceType?:string, sourceName?:string}} [opts]
 * @returns {{ok:true, record:any} | {ok:false, reason:string}}
 */
export function normaliseRecord(raw, opts = {}) {
  if (raw == null || typeof raw !== 'object') return { ok: false, reason: 'record is not an object' };
  const title = sanitizeText(raw.title || raw.name || raw.headline);
  if (!title) return { ok: false, reason: 'missing required field: title' };
  const pub = normaliseDate(raw.publication_date || raw.published || raw.pubDate || raw.date);
  const eff = normaliseDate(raw.effective_date || raw.effective || raw.enforceFrom);
  if (!pub && !eff) return { ok: false, reason: 'missing both publication_date and effective_date' };
  const summary = sanitizeText(raw.summary || raw.description || raw.content || '');
  const record = {
    title,
    authority: sanitizeText(raw.authority || raw.creator || raw.issuer || 'Unattributed'),
    jurisdiction: sanitizeText(raw.jurisdiction || raw.region || 'Unspecified'),
    sector: sanitizeText(raw.sector || '').toLowerCase() || inferSector(`${title} ${summary}`),
    doc_type: sanitizeText(raw.doc_type || raw.type || 'notice').toLowerCase(),
    publication_date: pub,
    effective_date: eff,
    summary,
    source_url: sanitizeText(raw.source_url || raw.link || ''),
    source_type: opts.sourceType || sanitizeText(raw.source_type || 'unverified-fixture'),
    verification_status: sanitizeText(raw.verification_status || 'Unverified'),
    obligations_json: JSON.stringify(Array.isArray(raw.obligations) ? raw.obligations.map(sanitizeText) : []),
    data_classification: 'synthetic-demo',
  };
  return { ok: true, record };
}

/** @param {any} v */
export function normaliseDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (m) {
    const yr = m[3].length === 2 ? '20' + m[3] : m[3];
    const dd = new Date(`${yr}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}T00:00:00Z`);
    if (!Number.isNaN(dd.getTime())) return dd.toISOString().slice(0, 10);
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

/** @param {any[]} records */
export function dedupe(records) {
  const seen = new Set();
  const unique = [];
  let duplicates = 0;
  for (const r of records) {
    const key = `${r.title}|${r.effective_date || r.publication_date}|${r.authority}`.toLowerCase();
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key);
    unique.push(r);
  }
  return { unique, duplicates };
}

/**
 * @param {string} input
 * @param {{format?:string, sourceName?:string, sourceType?:string}} [opts]
 */
export function ingest(input, opts = {}) {
  const format = detectFormat(input, opts.format);
  let rawRecords = [];
  const rejected = [];
  try {
    if (format === 'json') rawRecords = parseJSON(input);
    else if (format === 'csv') rawRecords = parseCSV(input);
    else if (format === 'rss') rawRecords = parseRSS(input);
    else if (format === 'atom') rawRecords = parseAtom(input);
    else if (format === 'markdown') rawRecords = parseMarkdown(input);
    else rawRecords = parseText(input);
  } catch (err) {
    return { format, received: 0, accepted: [], rejected: [{ reason: `parse error: ${err.message}`, raw: String(input).slice(0, 500) }], duplicates: 0, summary: `${format}: parse error` };
  }
  const accepted = [];
  for (const raw of rawRecords) {
    const res = normaliseRecord(raw, { sourceType: opts.sourceType, sourceName: opts.sourceName });
    if (res.ok) accepted.push(res.record);
    else rejected.push({ reason: res.reason, raw: JSON.stringify(raw).slice(0, 500) });
  }
  const deduped = dedupe(accepted);
  return {
    format,
    sourceName: opts.sourceName || null,
    received: rawRecords.length,
    accepted: deduped.unique,
    rejected,
    duplicates: deduped.duplicates,
    summary: `${format.toUpperCase()}: ${rawRecords.length} received, ${deduped.unique.length} accepted, ${rejected.length} rejected, ${deduped.duplicates} duplicate(s).`,
  };
}
