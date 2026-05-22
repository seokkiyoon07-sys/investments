import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createReadStream } from 'node:fs';
import { resolve } from 'node:path';
import { createSupabaseAdmin, upsertInChunks } from './lib-supabase-admin.mjs';
import { parseArgs } from './lib-dashboard-payload.mjs';

const NAVER_SISE_URL = 'https://api.finance.naver.com/siseJson.naver';

const args = parseArgs(process.argv.slice(2));
const supabase = createSupabaseAdmin();
const from = normalizeDateArg(args.from) || defaultFromDate();
const to = normalizeDateArg(args.to) || today();
const dryRun = Boolean(args['dry-run']);
const source = args.source || 'auto';
const symbols = await resolveSymbols();

if (!symbols.length) {
  throw new Error('No symbols found. Pass --symbols A005930,005930 or import reports first.');
}

console.log(`Fetching Naver prices for ${symbols.length} symbols from ${from} to ${to}`);

let allRows = [];
for (let index = 0; index < symbols.length; index += 1) {
  const symbol = symbols[index];
  if (args['only-missing'] && await hasPriceCoverage(symbol, from, to)) {
    if ((index + 1) % 25 === 0 || index + 1 === symbols.length) {
      console.log(`Checked ${index + 1}/${symbols.length} symbols, ${allRows.length} price rows`);
    }
    continue;
  }

  const rows = await fetchNaverPrices(symbol, from, to);
  allRows = allRows.concat(rows);

  if ((index + 1) % 25 === 0 || index + 1 === symbols.length) {
    console.log(`Fetched ${index + 1}/${symbols.length} symbols, ${allRows.length} price rows`);
  }

  await delay(Number(args.delay || 150));
}

if (dryRun) {
  console.log(JSON.stringify(allRows.slice(0, 5), null, 2));
  console.log(`Dry run: ${allRows.length} rows ready.`);
} else if (allRows.length) {
  await upsertInChunks(supabase, 'stock_prices', allRows, {
    onConflict: 'gicode,price_date',
    chunkSize: Number(args.chunk || 1000)
  });
}

console.log(`Done. ${allRows.length} Naver price rows ${dryRun ? 'prepared' : 'upserted'}.`);

async function resolveSymbols() {
  const offset = Number(args.offset || 0);
  const maxSymbols = args['max-symbols'] ? Number(args['max-symbols']) : null;
  const sliceSymbols = (items) => items.slice(offset, maxSymbols ? offset + maxSymbols : undefined);

  if (args.symbols) {
    return sliceSymbols(uniqueSymbols(String(args.symbols).split(',')));
  }

  if (args.file) {
    const text = readFileSync(resolve(args.file), 'utf8');
    return sliceSymbols(uniqueSymbols(text.split(/\r?\n|,/)));
  }

  if (source === 'local') return sliceSymbols(await symbolsFromLocalReports());
  if (source === 'supabase') return sliceSymbols(await symbolsFromSupabase());

  const remote = await symbolsFromSupabase();
  return sliceSymbols(remote.length ? remote : await symbolsFromLocalReports());
}

async function symbolsFromSupabase() {
  const symbols = new Set();
  const pageSize = 1000;

  for (let fromIndex = 0; ; fromIndex += pageSize) {
    const { data, error } = await supabase
      .from('reports')
      .select('gicode')
      .not('gicode', 'is', null)
      .range(fromIndex, fromIndex + pageSize - 1);

    if (error) {
      console.warn(`Could not read Supabase reports: ${error.message}`);
      return [];
    }

    for (const row of data || []) symbols.add(row.gicode);
    if (!data || data.length < pageSize) break;
  }

  return uniqueSymbols([...symbols]);
}

async function symbolsFromLocalReports() {
  const path = resolve(args.input || 'data/reports.ndjson');
  const symbols = new Set();
  const input = createReadStream(path, 'utf8');
  const rl = createInterface({ input, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    if (row.gicode) symbols.add(row.gicode);
  }

  return uniqueSymbols([...symbols]);
}

async function fetchNaverPrices(gicode, startDate, endDate) {
  const symbol = normalizeSymbol(gicode);
  const url = new URL(NAVER_SISE_URL);
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('requestType', '1');
  url.searchParams.set('startTime', compactDate(startDate));
  url.searchParams.set('endTime', compactDate(endDate));
  url.searchParams.set('timeframe', args.timeframe || 'day');

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 fnguide-dashboard-sync/1.0',
      Referer: `https://finance.naver.com/item/sise_day.naver?code=${symbol}`
    }
  });

  if (!response.ok) {
    throw new Error(`Naver price request failed for ${symbol}: ${response.status}`);
  }

  const text = await response.text();
  return parseNaverSiseJson(text, `A${symbol}`);
}

async function hasPriceCoverage(gicode, startDate, endDate) {
  const [{ data: firstRows, error: firstError }, { data: lastRows, error: lastError }, { count, error: countError }] = await Promise.all([
    supabase
      .from('stock_prices')
      .select('price_date')
      .eq('gicode', gicode)
      .gte('price_date', startDate)
      .lte('price_date', endDate)
      .order('price_date', { ascending: true })
      .limit(1),
    supabase
      .from('stock_prices')
      .select('price_date')
      .eq('gicode', gicode)
      .gte('price_date', startDate)
      .lte('price_date', endDate)
      .order('price_date', { ascending: false })
      .limit(1),
    supabase
      .from('stock_prices')
      .select('price_date', { count: 'exact', head: true })
      .eq('gicode', gicode)
      .gte('price_date', startDate)
      .lte('price_date', endDate)
  ]);

  const error = firstError || lastError || countError;
  if (error) {
    console.warn(`Could not read existing prices for ${gicode}: ${error.message}`);
    return false;
  }

  const first = firstRows?.[0]?.price_date;
  const last = lastRows?.[0]?.price_date;
  if (!first || !last || !count) return false;

  const expectedTradingDays = Math.max(1, Math.floor(daysBetween(startDate, endDate) * (5 / 7) * 0.82));
  return first <= addDays(startDate, 7) && last >= addDays(endDate, -7) && count >= expectedTradingDays;
}

export function parseNaverSiseJson(text, gicode) {
  const jsonText = text
    .replace(/^\s+|\s+$/g, '')
    .replace(/,\s*\]/g, ']');

  const parsed = Function(`"use strict"; return (${jsonText});`)();
  const rows = Array.isArray(parsed) ? parsed.slice(1) : [];

  return rows
    .filter((row) => Array.isArray(row) && row.length >= 6)
    .map((row) => ({
      gicode,
      price_date: formatNaverDate(row[0]),
      open_price: numberOrNull(row[1]),
      high_price: numberOrNull(row[2]),
      low_price: numberOrNull(row[3]),
      close_price: numberOrNull(row[4]),
      volume: numberOrNull(row[5]),
      foreign_ownership_rate: numberOrNull(row[6]),
      source: 'naver',
      updated_at: new Date().toISOString()
    }))
    .filter((row) => row.close_price != null);
}

function uniqueSymbols(values) {
  return [...new Set(values.map(normalizeSymbol).filter(Boolean))]
    .sort()
    .map((symbol) => `A${symbol}`);
}

function normalizeSymbol(value) {
  return String(value || '').trim().replace(/^A/i, '').padStart(6, '0').slice(-6);
}

function normalizeDateArg(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (/^\d{8}$/.test(text)) return formatNaverDate(text);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  throw new Error(`Invalid date: ${value}. Use YYYY-MM-DD or YYYYMMDD.`);
}

function compactDate(value) {
  return value.replaceAll('-', '');
}

function formatNaverDate(value) {
  const text = String(value);
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function defaultFromDate() {
  if (args.years) return yearsAgo(Number(args.years));
  return daysAgo(Number(args.days || 30));
}

function yearsAgo(years) {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  return date.toISOString().slice(0, 10);
}

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000));
}

function addDays(value, days) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function numberOrNull(value) {
  return value == null || value === '' || Number.isNaN(Number(value)) ? null : Number(value);
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}
