import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type { Report, ReportListResponse, ReportOptions, ReportStats } from './report-types';

type ReportCache = {
  rows: Report[];
  options: ReportOptions;
};

export type QueryParams = {
  from?: string;
  to?: string;
  keyword?: string;
  stock?: string;
  provider?: string;
  author?: string;
  opinions?: string[];
  tpChanges?: string[];
  bestOnly?: boolean;
  hasTp?: boolean;
  page: number;
  pageSize: number;
  sort: keyof Report;
  dir: 'asc' | 'desc';
};

const DATA_PATH = join(process.cwd(), 'data', 'reports.ndjson');
const SORTABLE = new Set<keyof Report>([
  'report_date',
  'stock_name',
  'opinion',
  'target_price',
  'prev_close',
  'actual_6m',
  'actual_1y',
  'provider',
  'author'
]);

export const REPORT_SORTABLE_FIELDS = SORTABLE;

let cachePromise: Promise<ReportCache> | null = null;

export async function queryReports(searchParams: URLSearchParams): Promise<ReportListResponse> {
  const cache = await loadReportCache();
  const query = parseReportQuery(searchParams);
  const filtered = applyReportFilters(cache.rows, query);
  const stats = buildStats(filtered);
  const sorted = applySort(filtered, query);
  const totalPages = Math.max(1, Math.ceil(sorted.length / query.pageSize));
  const page = Math.min(Math.max(1, query.page), totalPages);
  const start = (page - 1) * query.pageSize;

  return {
    rows: sorted.slice(start, start + query.pageSize),
    page,
    pageSize: query.pageSize,
    total: sorted.length,
    totalPages,
    stats,
    options: cache.options,
    source: 'local'
  };
}

export async function loadReportCache(): Promise<ReportCache> {
  cachePromise ??= readReports().then((rows) => ({
    rows,
    options: buildOptions(rows)
  }));
  return cachePromise;
}

async function readReports(): Promise<Report[]> {
  const rows: Report[] = [];
  const input = createReadStream(DATA_PATH, 'utf8');
  const rl = createInterface({ input, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    rows.push(JSON.parse(line) as Report);
  }

  return rows;
}

export function parseReportQuery(searchParams: URLSearchParams): QueryParams {
  const sort = searchParams.get('sort') as keyof Report | null;
  const dir = searchParams.get('dir') === 'asc' ? 'asc' : 'desc';
  const pageSize = clampNumber(Number(searchParams.get('pageSize') || 100), 25, 500);

  return {
    from: valueOrUndefined(searchParams.get('from')),
    to: valueOrUndefined(searchParams.get('to')),
    keyword: valueOrUndefined(searchParams.get('keyword'))?.toLowerCase(),
    stock: valueOrUndefined(searchParams.get('stock'))?.toLowerCase(),
    provider: valueOrUndefined(searchParams.get('provider')),
    author: valueOrUndefined(searchParams.get('author'))?.toLowerCase(),
    opinions: splitParam(searchParams.get('opinions')),
    tpChanges: splitParam(searchParams.get('tpChanges')),
    bestOnly: searchParams.get('bestOnly') === 'true',
    hasTp: searchParams.get('hasTp') === 'true',
    page: Math.max(1, Number(searchParams.get('page') || 1)),
    pageSize,
    sort: sort && SORTABLE.has(sort) ? sort : 'report_date',
    dir
  };
}

export function applyReportFilters(rows: Report[], query: QueryParams): Report[] {
  const opinionSet = new Set(query.opinions);
  const tpChangeSet = new Set(query.tpChanges);

  return rows.filter((row) => {
    if (query.from && row.report_date < query.from) return false;
    if (query.to && row.report_date > query.to) return false;
    if (query.provider && row.provider !== query.provider) return false;
    if (query.bestOnly && !row.is_best) return false;
    if (query.hasTp && row.target_price == null) return false;
    if (opinionSet.size && !opinionSet.has(row.opinion || '')) return false;
    if (tpChangeSet.size && !tpChangeSet.has(row.target_price_change || '')) return false;

    if (query.stock) {
      const stockName = row.stock_name.toLowerCase();
      const gicode = (row.gicode || '').toLowerCase();
      if (!stockName.includes(query.stock) && !gicode.includes(query.stock)) return false;
    }

    if (query.author && !(row.author || '').toLowerCase().includes(query.author)) return false;

    if (query.keyword) {
      const haystack = `${row.title} ${row.stock_name} ${row.summary.join(' ')}`.toLowerCase();
      if (!haystack.includes(query.keyword)) return false;
    }

    return true;
  });
}

function applySort(rows: Report[], query: QueryParams): Report[] {
  const direction = query.dir === 'asc' ? 1 : -1;
  return rows.slice().sort((a, b) => {
    const av = a[query.sort];
    const bv = b[query.sort];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'string' && typeof bv === 'string') {
      return av.localeCompare(bv, 'ko') * direction;
    }
    return (Number(av) - Number(bv)) * direction;
  });
}

function buildStats(rows: Report[]): ReportStats {
  let hit = 0;
  let targetTotal = 0;
  let returnSum = 0;
  let returnCount = 0;

  for (const row of rows) {
    if (row.target_price != null && row.actual_6m != null) {
      targetTotal += 1;
      if (row.actual_6m >= row.target_price * 0.9) hit += 1;
    }
    if (row.prev_close != null && row.actual_6m != null) {
      returnSum += (row.actual_6m / row.prev_close - 1) * 100;
      returnCount += 1;
    }
  }

  return {
    count: rows.length,
    stocks: new Set(rows.map((row) => row.gicode || row.stock_name)).size,
    providers: new Set(rows.map((row) => row.provider).filter(Boolean)).size,
    authors: new Set(rows.map((row) => row.author).filter(Boolean)).size,
    targetHitRate: {
      hit,
      total: targetTotal,
      pct: targetTotal ? (hit / targetTotal) * 100 : null
    },
    avgReturn6m: returnCount ? returnSum / returnCount : null
  };
}

function buildOptions(rows: Report[]): ReportOptions {
  const providers = new Set<string>();
  const opinionCounts = new Map<string, number>();
  const tpChanges = new Set<string>();
  let minDate: string | null = null;
  let maxDate: string | null = null;

  for (const row of rows) {
    if (row.provider) providers.add(row.provider);
    if (row.opinion) opinionCounts.set(row.opinion, (opinionCounts.get(row.opinion) || 0) + 1);
    if (row.target_price_change) tpChanges.add(row.target_price_change);
    if (!minDate || row.report_date < minDate) minDate = row.report_date;
    if (!maxDate || row.report_date > maxDate) maxDate = row.report_date;
  }

  return {
    providers: [...providers].sort((a, b) => a.localeCompare(b, 'ko')),
    opinions: [...opinionCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, count })),
    tpChanges: [...tpChanges].sort((a, b) => a.localeCompare(b, 'ko')),
    minDate,
    maxDate
  };
}

export function splitParam(value: string | null): string[] {
  return value ? value.split(',').map((item) => item.trim()).filter(Boolean) : [];
}

export function valueOrUndefined(value: string | null): string | undefined {
  return value && value.trim() ? value.trim() : undefined;
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
