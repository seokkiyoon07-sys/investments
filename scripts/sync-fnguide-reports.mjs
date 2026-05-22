import { resolve } from 'node:path';
import { createSupabaseAdmin, upsertInChunks } from './lib-supabase-admin.mjs';
import {
  DEFAULT_INPUT,
  normalizeReports,
  parseArgs,
  readPayloadFromHtml
} from './lib-dashboard-payload.mjs';
import { fetchFnguideReportSummary } from './lib-fnguide-report-summary.mjs';

const args = parseArgs(process.argv.slice(2));
const source = args.source || 'live';
const input = resolve(args.input || DEFAULT_INPUT);
const dryRun = Boolean(args['dry-run']);
const chunkSize = Number(args.chunk || 1000);
const to = normalizeDateArg(args.to) || today();
const from = normalizeDateArg(args.from) || daysAgo(Number(args.days || 7));

const reports = source === 'payload'
  ? loadPayloadReports(input)
  : await loadLiveReports();

console.log(`Loaded ${reports.length} reports from ${source === 'payload' ? input : 'FnGuide summary endpoint'}`);

if (dryRun) {
  console.log(JSON.stringify(reports.slice(0, 3), null, 2));
  console.log(`Dry run: ${reports.length} reports ready.`);
} else {
  const supabase = createSupabaseAdmin();
  await upsertInChunks(supabase, 'reports', reports, {
    onConflict: 'source_key',
    chunkSize
  });
  if (!args['skip-cache-refresh']) {
    console.log('Refreshing report analytics cache...');
    const { error } = await supabase.rpc('refresh_report_analytics_cache');
    if (error) throw new Error(`Analytics cache refresh failed: ${error.message}`);
    console.log('Report analytics cache refreshed.');
  }
  console.log(`Done. ${reports.length} reports upserted.`);
}

function loadPayloadReports(path) {
  const payload = readPayloadFromHtml(path);
  return normalizeReports(payload);
}

async function loadLiveReports() {
  const reportsByKey = new Map();
  const cursor = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);

  while (cursor <= end) {
    const day = cursor.toISOString().slice(0, 10);
    const dailyReports = await fetchFnguideReportSummary({
      from: day,
      to: day,
      keyword: args.keyword || ''
    });

    for (const report of dailyReports) reportsByKey.set(report.source_key, report);
    console.log(`${day}: fetched ${dailyReports.length} reports`);

    cursor.setUTCDate(cursor.getUTCDate() + 1);
    await delay(Number(args.delay || 150));
  }

  return [...reportsByKey.values()].sort((a, b) => (
    a.report_date.localeCompare(b.report_date) || a.stock_name.localeCompare(b.stock_name, 'ko')
  ));
}

function normalizeDateArg(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (/^\d{8}$/.test(text)) return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  throw new Error(`Invalid date: ${value}. Use YYYY-MM-DD or YYYYMMDD.`);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}
