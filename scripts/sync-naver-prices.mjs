import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createReadStream } from 'node:fs';
import { resolve } from 'node:path';
import { createSupabaseAdmin, upsertInChunks } from './lib-supabase-admin.mjs';
import { parseArgs } from './lib-dashboard-payload.mjs';

const NAVER_SISE_URL = 'https://api.finance.naver.com/siseJson.naver';

const args = parseArgs(process.argv.slice(2));
const supabase = createSupabaseAdmin();
const from = normalizeDateArg(args.from) || daysAgo(Number(args.days || 30));
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
  if (args.symbols) {
    return uniqueSymbols(String(args.symbols).split(','));
  }

  if (args.file) {
    const text = readFileSync(resolve(args.file), 'utf8');
    return uniqueSymbols(text.split(/\r?\n|,/));
  }

  if (source === 'local') return symbolsFromLocalReports();
  if (source === 'supabase') return symbolsFromSupabase();

  const remote = await symbolsFromSupabase();
  return remote.length ? remote : symbolsFromLocalReports();
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

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function numberOrNull(value) {
  return value == null || value === '' || Number.isNaN(Number(value)) ? null : Number(value);
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}
