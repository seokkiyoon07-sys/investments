import type { ChangeRankRow, CountRankRow, DistributionRow, Report, ReportAnalyticsResponse } from './report-types';
import { applyReportFilters, loadReportCache, parseReportQuery } from './report-query';

export async function queryReportAnalytics(searchParams: URLSearchParams): Promise<ReportAnalyticsResponse> {
  const cache = await loadReportCache();
  const query = parseReportQuery(searchParams);
  const rows = applyReportFilters(cache.rows, query);

  return {
    source: 'local',
    total: rows.length,
    stocks: topCounts(rows, (row) => row.stock_name, (row) => row.gicode),
    providers: topCounts(rows, (row) => row.provider),
    authors: topCounts(rows, (row) => row.author),
    months: monthCounts(rows),
    targetPriceChanges: distribution(rows, (row) => row.target_price_change || '(없음)', 10),
    opinions: distribution(rows, (row) => row.opinion || '(없음)', 12),
    rank: buildChangeRanks(rows)
  };
}

function topCounts(
  rows: Report[],
  getName: (row: Report) => string | null,
  getGicode?: (row: Report) => string | null
): CountRankRow[] {
  const counts = new Map<string, CountRankRow>();

  for (const row of rows) {
    const name = getName(row);
    if (!name) continue;
    const current = counts.get(name) || { name, count: 0, gicode: getGicode?.(row) || null };
    current.count += 1;
    if (!current.gicode && getGicode) current.gicode = getGicode(row);
    counts.set(name, current);
  }

  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko')).slice(0, 50);
}

function distribution(rows: Report[], getName: (row: Report) => string, limit: number): DistributionRow[] {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const name = getName(row);
    counts.set(name, (counts.get(name) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

function monthCounts(rows: Report[]): DistributionRow[] {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const name = row.report_date.slice(0, 7);
    counts.set(name, (counts.get(name) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, count }));
}

function buildChangeRanks(rows: Report[]) {
  return {
    targetUp: rankRowsByPct(aggregateChanges(rows, 'target_price_change'), 'up'),
    targetDown: rankRowsByPct(aggregateChanges(rows, 'target_price_change'), 'down'),
    opinionUp: rankRowsByPct(aggregateChanges(rows, 'opinion_change'), 'up'),
    opinionDown: rankRowsByPct(aggregateChanges(rows, 'opinion_change'), 'down')
  };
}

function aggregateChanges(rows: Report[], key: 'target_price_change' | 'opinion_change') {
  const acc = new Map<string, ChangeRankRow>();

  for (const row of rows) {
    const name = row.stock_name || '(미상)';
    const current = acc.get(name) || {
      name,
      gicode: row.gicode || null,
      up: 0,
      hold: 0,
      down: 0,
      neu: 0,
      total: 0,
      upPct: 0,
      downPct: 0
    };
    const value = row[key];
    if (value === '상향') current.up += 1;
    else if (value === '하향') current.down += 1;
    else if (value === '유지') current.hold += 1;
    else if (value === '신규') current.neu += 1;
    else continue;

    current.total += 1;
    if (!current.gicode) current.gicode = row.gicode || null;
    acc.set(name, current);
  }

  for (const row of acc.values()) {
    row.upPct = row.total ? (row.up / row.total) * 100 : 0;
    row.downPct = row.total ? (row.down / row.total) * 100 : 0;
  }

  return acc;
}

function rankRowsByPct(acc: Map<string, ChangeRankRow>, direction: 'up' | 'down') {
  const pctKey = direction === 'up' ? 'upPct' : 'downPct';
  const countKey = direction === 'up' ? 'up' : 'down';

  return [...acc.values()]
    .filter((row) => row.total >= 3)
    .sort((a, b) => b[pctKey] - a[pctKey] || b[countKey] - a[countKey] || b.total - a.total)
    .slice(0, 20);
}
