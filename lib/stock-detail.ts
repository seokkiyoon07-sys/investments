import type { Report, StockAuthorSummary, StockDetailResponse, TargetPoint } from './report-types';
import { loadReportCache } from './report-query';

export async function queryStockDetailLocal(stockKey: string): Promise<StockDetailResponse | null> {
  const cache = await loadReportCache();
  const key = decodeURIComponent(stockKey).toLowerCase();
  const rows = cache.rows
    .filter((row) => (row.gicode || '').toLowerCase() === key || row.stock_name.toLowerCase() === key)
    .sort((a, b) => b.report_date.localeCompare(a.report_date));

  if (!rows.length) return null;

  return buildStockDetail(rows, 'local');
}

export function buildStockDetail(rows: Report[], source: 'local' | 'supabase'): StockDetailResponse {
  const sorted = rows.slice().sort((a, b) => b.report_date.localeCompare(a.report_date));
  const realName = sorted[0].stock_name;
  const realGicode = sorted.find((row) => row.gicode)?.gicode || null;
  const dates = sorted.map((row) => row.report_date).sort();
  const targetPrices = sorted.map((row) => row.target_price).filter((value): value is number => value != null);
  const latestClose = sorted.find((row) => row.prev_close != null)?.prev_close ?? null;

  return {
    source,
    gicode: realGicode,
    stockName: realName,
    totalReports: sorted.length,
    firstDate: dates[0] || null,
    latestDate: dates[dates.length - 1] || null,
    latestClose,
    targetPriceMin: targetPrices.length ? Math.min(...targetPrices) : null,
    targetPriceMax: targetPrices.length ? Math.max(...targetPrices) : null,
    authors: buildAuthorSummaries(sorted),
    targetPoints: buildTargetPoints(sorted),
    reports: sorted.slice(0, 40)
  };
}

function buildTargetPoints(rows: Report[]): TargetPoint[] {
  return rows
    .filter((row) => row.target_price != null)
    .map((row) => ({
      report_date: row.report_date,
      target_price: row.target_price as number,
      author: row.author,
      provider: row.provider,
      opinion: row.opinion
    }))
    .sort((a, b) => a.report_date.localeCompare(b.report_date))
    .slice(-300);
}

function buildAuthorSummaries(rows: Report[]): StockAuthorSummary[] {
  const groups = new Map<string, Report[]>();

  for (const row of rows) {
    const key = `${row.author || '(미상)'}|${row.provider || ''}`;
    const current = groups.get(key) || [];
    current.push(row);
    groups.set(key, current);
  }

  return [...groups.entries()]
    .map(([key, group]) => {
      const [author, provider] = key.split('|');
      const sorted = group.slice().sort((a, b) => b.report_date.localeCompare(a.report_date));
      const latest = sorted[0];
      const targetPrices = sorted.map((row) => row.target_price).filter((value): value is number => value != null);
      const avgTargetPrice = targetPrices.length
        ? Math.round(targetPrices.reduce((sum, value) => sum + value, 0) / targetPrices.length)
        : null;

      return {
        author,
        provider: provider || null,
        count: group.length,
        latestDate: latest.report_date,
        latestOpinion: latest.opinion,
        latestTargetPrice: latest.target_price,
        avgTargetPrice,
        minTargetPrice: targetPrices.length ? Math.min(...targetPrices) : null,
        maxTargetPrice: targetPrices.length ? Math.max(...targetPrices) : null
      };
    })
    .sort((a, b) => b.count - a.count || b.latestDate.localeCompare(a.latestDate))
    .slice(0, 20);
}
