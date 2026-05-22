import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const DEFAULT_INPUT = '../dashboard (1).html';

export const KEY_MAP = {
  d: 'report_date',
  g: 'gicode',
  n: 'stock_name',
  t: 'title',
  s: 'summary',
  o: 'opinion',
  oc: 'opinion_change',
  tp: 'target_price',
  tc: 'target_price_change',
  pc: 'prev_close',
  p: 'provider',
  a: 'author',
  b: 'is_best',
  a6: 'actual_6m',
  a1: 'actual_1y',
  nu: 'naver_url',
  hu: 'hankyung_url',
  pu: 'newspim_url'
};

export const REPORT_FIELDS = [
  'source_key',
  'report_date',
  'gicode',
  'stock_name',
  'title',
  'summary',
  'opinion',
  'opinion_change',
  'target_price',
  'target_price_change',
  'prev_close',
  'provider',
  'author',
  'is_best',
  'actual_6m',
  'actual_1y',
  'naver_url',
  'hankyung_url',
  'newspim_url'
];

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

export function readPayloadFromHtml(inputPath) {
  const html = readFileSync(inputPath, 'utf8');
  const match = html.match(/<script id="payload" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) {
    throw new Error(`Could not find <script id="payload"> in ${inputPath}`);
  }
  return JSON.parse(match[1]);
}

export function normalizeReport(row) {
  const out = {};
  for (const key of Object.keys(row)) {
    out[KEY_MAP[key] || key] = row[key];
  }

  out.summary = Array.isArray(out.summary) ? out.summary : [];
  out.is_best = Boolean(out.is_best);
  out.target_price = numberOrNull(out.target_price);
  out.prev_close = numberOrNull(out.prev_close);
  out.actual_6m = numberOrNull(out.actual_6m);
  out.actual_1y = numberOrNull(out.actual_1y);

  for (const key of [
    'report_date',
    'gicode',
    'stock_name',
    'title',
    'opinion',
    'opinion_change',
    'target_price_change',
    'provider',
    'author',
    'naver_url',
    'hankyung_url',
    'newspim_url'
  ]) {
    out[key] = stringOrNull(out[key]);
  }

  out.source_key = makeSourceKey(out);
  return out;
}

export function normalizeReports(payload) {
  return payload.rows.map(normalizeReport);
}

export function profileReports(reports, payload = {}) {
  const dates = reports.map((row) => row.report_date).filter(Boolean).sort();
  return {
    generated_at: payload.generated_at ?? null,
    payload_count: payload.count ?? null,
    row_count: reports.length,
    min_date: dates[0] ?? null,
    max_date: dates[dates.length - 1] ?? null,
    stocks: new Set(reports.map((row) => row.gicode || row.stock_name).filter(Boolean)).size,
    providers: new Set(reports.map((row) => row.provider).filter(Boolean)).size,
    authors: new Set(reports.map((row) => row.author).filter(Boolean)).size,
    with_target_price: reports.filter((row) => row.target_price != null).length,
    best: reports.filter((row) => row.is_best).length,
    meta: payload.meta ?? {}
  };
}

export function toCsvValue(value) {
  if (value == null) return '';
  const raw = Array.isArray(value) || typeof value === 'object'
    ? JSON.stringify(value)
    : String(value);
  const text = raw.replace(/\r?\n/g, '\\n');
  return `"${text.replaceAll('"', '""')}"`;
}

function numberOrNull(value) {
  return value == null || value === '' || Number.isNaN(Number(value)) ? null : Number(value);
}

function stringOrNull(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

export function makeSourceKey(row) {
  const basis = [
    row.report_date,
    row.gicode,
    row.stock_name,
    row.title,
    row.provider,
    row.author,
    row.target_price,
    row.opinion
  ].map((value) => value ?? '').join('|');
  return createHash('sha256').update(basis).digest('hex');
}
