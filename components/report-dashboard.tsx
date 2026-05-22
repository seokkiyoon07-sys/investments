'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { ChangeRankRow, CountRankRow, DistributionRow, Report, ReportAnalyticsResponse, ReportListResponse } from '@/lib/report-types';

type Filters = {
  from: string;
  to: string;
  keyword: string;
  stock: string;
  provider: string;
  author: string;
  opinions: string[];
  tpChanges: string[];
  bestOnly: boolean;
  hasTp: boolean;
  page: number;
  pageSize: number;
  sort: string;
  dir: 'asc' | 'desc';
};

const INITIAL_FILTERS: Filters = {
  from: '',
  to: '',
  keyword: '',
  stock: '',
  provider: '',
  author: '',
  opinions: [],
  tpChanges: [],
  bestOnly: false,
  hasTp: false,
  page: 1,
  pageSize: 100,
  sort: 'report_date',
  dir: 'desc'
};

const TP_CHANGE_LABELS = ['상향', '유지', '하향', '신규'];
const VIEWS = [
  ['list', '보고서 목록'],
  ['stocks', '종목별'],
  ['providers', '제공처별'],
  ['authors', '작성자별'],
  ['trend', '월별 추세'],
  ['rank', '상하향 랭킹']
] as const;

type ViewId = (typeof VIEWS)[number][0];

export function ReportDashboard() {
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [view, setView] = useState<ViewId>('list');
  const [data, setData] = useState<ReportListResponse | null>(null);
  const [analytics, setAnalytics] = useState<ReportAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => buildQuery(filters), [filters]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch(`/api/reports?${query}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Request failed: ${response.status}`);
        return response.json() as Promise<ReportListResponse>;
      })
      .then((nextData) => {
        setData(nextData);
        if (!filters.from && !filters.to && nextData.options.minDate && nextData.options.maxDate) {
          setFilters((current) => ({
            ...current,
            from: nextData.options.minDate || '',
            to: nextData.options.maxDate || ''
          }));
        }
      })
      .catch((err: Error) => {
        if (err.name !== 'AbortError') setError(err.message);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [query]);

  useEffect(() => {
    if (view === 'list') return;
    const controller = new AbortController();
    setAnalyticsLoading(true);

    fetch(`/api/analytics?${query}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Analytics request failed: ${response.status}`);
        return response.json() as Promise<ReportAnalyticsResponse>;
      })
      .then(setAnalytics)
      .catch((err: Error) => {
        if (err.name !== 'AbortError') setError(err.message);
      })
      .finally(() => setAnalyticsLoading(false));

    return () => controller.abort();
  }, [query, view]);

  const update = (patch: Partial<Filters>) => {
    setFilters((current) => ({ ...current, ...patch, page: patch.page ?? 1 }));
  };

  const toggleList = (key: 'opinions' | 'tpChanges', value: string) => {
    setFilters((current) => {
      const exists = current[key].includes(value);
      return {
        ...current,
        [key]: exists ? current[key].filter((item) => item !== value) : [...current[key], value],
        page: 1
      };
    });
  };

  const sortBy = (sort: string) => {
    setFilters((current) => ({
      ...current,
      sort,
      dir: current.sort === sort && current.dir === 'desc' ? 'asc' : 'desc',
      page: 1
    }));
  };

  const resetFilters = () => {
    setFilters({
      ...INITIAL_FILTERS,
      from: data?.options.minDate || '',
      to: data?.options.maxDate || ''
    });
  };

  return (
    <main className="dashboard-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Next.js MVP</p>
          <h1>FnGuide 요약 리포트 대시보드</h1>
        </div>
        <div className="header-meta">
          <span>{data?.source === 'supabase' ? 'Supabase' : '로컬 NDJSON'}</span>
          <strong>{data ? formatNumber(data.total) : '-'}</strong>
          <span>건</span>
        </div>
      </header>

      <div className="dashboard-grid">
        <aside className="filters">
          <SectionTitle>기간</SectionTitle>
          <div className="two-col">
            <Field label="시작">
              <input type="date" value={filters.from} onChange={(e) => update({ from: e.target.value })} />
            </Field>
            <Field label="종료">
              <input type="date" value={filters.to} onChange={(e) => update({ to: e.target.value })} />
            </Field>
          </div>

          <SectionTitle>검색</SectionTitle>
          <Field label="키워드">
            <input value={filters.keyword} onChange={(e) => update({ keyword: e.target.value })} placeholder="HBM, AI, 실적" />
          </Field>
          <Field label="종목명/코드">
            <input value={filters.stock} onChange={(e) => update({ stock: e.target.value })} placeholder="삼성전자 / A005930" />
          </Field>

          <SectionTitle>분류</SectionTitle>
          <Field label="제공처">
            <select value={filters.provider} onChange={(e) => update({ provider: e.target.value })}>
              <option value="">전체</option>
              {data?.options.providers.map((provider) => (
                <option key={provider} value={provider}>{provider}</option>
              ))}
            </select>
          </Field>
          <Field label="작성자">
            <input value={filters.author} onChange={(e) => update({ author: e.target.value })} placeholder="작성자명" />
          </Field>

          <SectionTitle>투자의견</SectionTitle>
          <div className="chip-list">
            {data?.options.opinions.slice(0, 18).map((item) => (
              <button
                key={item.value}
                className={filters.opinions.includes(item.value) ? 'chip active' : 'chip'}
                type="button"
                onClick={() => toggleList('opinions', item.value)}
              >
                {item.value} <span>{formatNumber(item.count)}</span>
              </button>
            ))}
          </div>

          <SectionTitle>목표주가 변동</SectionTitle>
          <div className="chip-list">
            {TP_CHANGE_LABELS.map((value) => (
              <button
                key={value}
                className={filters.tpChanges.includes(value) ? 'chip active' : 'chip'}
                type="button"
                onClick={() => toggleList('tpChanges', value)}
              >
                {value}
              </button>
            ))}
          </div>

          <SectionTitle>기타</SectionTitle>
          <label className="check-row">
            <input type="checkbox" checked={filters.bestOnly} onChange={(e) => update({ bestOnly: e.target.checked })} />
            베스트 애널리스트만
          </label>
          <label className="check-row">
            <input type="checkbox" checked={filters.hasTp} onChange={(e) => update({ hasTp: e.target.checked })} />
            목표주가 있는 보고서만
          </label>

          <button className="reset-button" type="button" onClick={resetFilters}>필터 초기화</button>
        </aside>

        <section className="content">
          {error ? <div className="error-box">{error}</div> : null}
          {data?.warning ? <div className="warning-box">{data.warning}</div> : null}

          <div className="stats-grid">
            <StatCard label="필터 결과" value={formatNumber(data?.stats.count)} />
            <StatCard label="종목 수" value={formatNumber(data?.stats.stocks)} />
            <StatCard label="제공처 수" value={formatNumber(data?.stats.providers)} />
            <StatCard label="작성자 수" value={formatNumber(data?.stats.authors)} />
            <StatCard label="TP 평균 적중률" value={formatPct(data?.stats.targetHitRate.pct)} sub={hitRateSub(data)} />
            <StatCard label="평균 6m 수익률" value={formatPct(data?.stats.avgReturn6m, true)} />
          </div>

          <div className="tabs">
            {VIEWS.map(([id, label]) => (
              <button key={id} className={view === id ? 'tab active' : 'tab'} type="button" onClick={() => setView(id)}>
                {label}
              </button>
            ))}
          </div>

          {view === 'list' ? <ReportTable
            data={data}
            loading={loading}
            filters={filters}
            update={update}
            sortBy={sortBy}
          /> : <AnalyticsView view={view} data={analytics} loading={analyticsLoading} />}
        </section>
      </div>
    </main>
  );
}

function ReportTable({
  data,
  loading,
  filters,
  update,
  sortBy
}: {
  data: ReportListResponse | null;
  loading: boolean;
  filters: Filters;
  update: (patch: Partial<Filters>) => void;
  sortBy: (sort: string) => void;
}) {
  return (
    <div className="table-card">
            <div className="table-toolbar">
              <span>{loading ? '불러오는 중' : pageLabel(data)}</span>
              <div className="pager">
                <select value={filters.pageSize} onChange={(e) => update({ pageSize: Number(e.target.value) })}>
                  {[50, 100, 200, 500].map((size) => (
                    <option key={size} value={size}>{size}개</option>
                  ))}
                </select>
                <button disabled={!data || data.page <= 1} onClick={() => update({ page: 1 })}>처음</button>
                <button disabled={!data || data.page <= 1} onClick={() => update({ page: Math.max(1, filters.page - 1) })}>이전</button>
                <span>{data ? `${data.page} / ${data.totalPages}` : '1 / 1'}</span>
                <button disabled={!data || data.page >= data.totalPages} onClick={() => update({ page: filters.page + 1 })}>다음</button>
              </div>
            </div>

            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <SortableTh label="일자" id="report_date" filters={filters} onSort={sortBy} />
                    <SortableTh label="종목 - 리포트 요약" id="stock_name" filters={filters} onSort={sortBy} />
                    <SortableTh label="의견" id="opinion" filters={filters} onSort={sortBy} />
                    <SortableTh label="목표주가" id="target_price" filters={filters} onSort={sortBy} />
                    <SortableTh label="전일종가" id="prev_close" filters={filters} onSort={sortBy} />
                    <SortableTh label="+6m" id="actual_6m" filters={filters} onSort={sortBy} />
                    <SortableTh label="+1y" id="actual_1y" filters={filters} onSort={sortBy} />
                    <SortableTh label="제공처/작성자" id="provider" filters={filters} onSort={sortBy} />
                  </tr>
                </thead>
                <tbody>
                  {data?.rows.map((report) => (
                    <ReportRow key={report.source_key} report={report} />
                  ))}
                  {!loading && data?.rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="empty-cell">조건에 맞는 보고서가 없습니다.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
  );
}

function AnalyticsView({ view, data, loading }: { view: ViewId; data: ReportAnalyticsResponse | null; loading: boolean }) {
  if (loading && !data) return <div className="panel empty-panel">집계 데이터를 불러오는 중입니다.</div>;
  if (!data) return <div className="panel empty-panel">집계 데이터가 없습니다.</div>;

  if (view === 'stocks') {
    return <RankPanel title="종목별 보고서 카운트 Top 50" rows={data.stocks} />;
  }

  if (view === 'providers') {
    return <RankPanel title="제공처별 보고서 카운트 Top 50" rows={data.providers} />;
  }

  if (view === 'authors') {
    return <RankPanel title="작성자별 보고서 카운트 Top 50" rows={data.authors} />;
  }

  if (view === 'trend') {
    return (
      <>
        <MonthChart rows={data.months} />
        <div className="analytics-grid">
          <DistributionPanel title="목표주가 변동 분포" rows={data.targetPriceChanges} />
          <DistributionPanel title="투자의견 분포" rows={data.opinions} />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="analytics-grid">
        <ChangeRankPanel title="목표주가 상향 비율 Top 20" rows={data.rank.targetUp} direction="up" />
        <ChangeRankPanel title="목표주가 하향 비율 Top 20" rows={data.rank.targetDown} direction="down" />
      </div>
      <div className="analytics-grid">
        <ChangeRankPanel title="투자의견 상향 비율 Top 20" rows={data.rank.opinionUp} direction="up" />
        <ChangeRankPanel title="투자의견 하향 비율 Top 20" rows={data.rank.opinionDown} direction="down" />
      </div>
    </>
  );
}

function RankPanel({ title, rows }: { title: string; rows: CountRankRow[] }) {
  return (
    <div className="panel">
      <h2>{title}</h2>
      <BarRows rows={rows.map((row) => ({ name: row.name, count: row.count, meta: row.gicode || undefined }))} />
    </div>
  );
}

function DistributionPanel({ title, rows }: { title: string; rows: DistributionRow[] }) {
  return (
    <div className="panel">
      <h2>{title}</h2>
      <BarRows rows={rows} />
    </div>
  );
}

function MonthChart({ rows }: { rows: DistributionRow[] }) {
  const max = Math.max(1, ...rows.map((row) => row.count));

  return (
    <div className="panel">
      <h2>월별 보고서 발행량</h2>
      <div className="month-chart">
        {rows.map((row) => (
          <div key={row.name} className="month-col" style={{ height: `${Math.max(3, (row.count / max) * 100)}%` }} title={`${row.name}: ${formatNumber(row.count)}건`} />
        ))}
      </div>
      <div className="month-labels">
        {rows.map((row) => <span key={row.name}>{row.name.slice(2)}</span>)}
      </div>
    </div>
  );
}

function BarRows({ rows }: { rows: Array<{ name: string; count: number; meta?: string }> }) {
  const max = Math.max(1, ...rows.map((row) => row.count));

  return (
    <div className="bar-list">
      {rows.map((row) => (
        <div className="bar-row" key={`${row.name}-${row.meta || ''}`}>
          <div className="bar-name" title={row.name}>
            {row.meta ? <Link href={`/stocks/${encodeURIComponent(row.meta)}`}>{row.name}</Link> : row.name}
            {row.meta ? <small>{row.meta}</small> : null}
          </div>
          <div className="bar-track"><div className="bar-fill" style={{ width: `${(row.count / max) * 100}%` }} /></div>
          <div className="bar-count">{formatNumber(row.count)}</div>
        </div>
      ))}
    </div>
  );
}

function ChangeRankPanel({ title, rows, direction }: { title: string; rows: ChangeRankRow[]; direction: 'up' | 'down' }) {
  const pctKey = direction === 'up' ? 'upPct' : 'downPct';

  return (
    <div className="panel">
      <h2>{title}</h2>
      <div className="rank-table-wrap">
        <table className="rank-table">
          <thead>
            <tr>
              <th>#</th>
              <th>종목</th>
              <th>상향</th>
              <th>유지</th>
              <th>하향</th>
              <th>신규</th>
              <th>전체</th>
              <th>비율</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${title}-${row.name}`}>
                <td>{index + 1}</td>
                <td>
                  {row.gicode ? <Link href={`/stocks/${encodeURIComponent(row.gicode)}`}><strong>{row.name}</strong></Link> : <strong>{row.name}</strong>}
                  {row.gicode ? <small>{row.gicode}</small> : null}
                </td>
                <td className="num good">{row.up}</td>
                <td className="num muted">{row.hold}</td>
                <td className="num bad">{row.down}</td>
                <td className="num new-tone">{row.neu}</td>
                <td className="num">{row.total}</td>
                <td className={direction === 'up' ? 'num good' : 'num bad'}>{row[pctKey].toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReportRow({ report }: { report: Report }) {
  const ret6m = calcReturn(report.actual_6m, report.prev_close);
  const ret1y = calcReturn(report.actual_1y, report.prev_close);

  return (
    <tr>
      <td className="nowrap muted">{report.report_date}</td>
      <td>
        <div className="stock-line">
          {report.gicode ? <Link href={`/stocks/${encodeURIComponent(report.gicode)}`}><strong>{report.stock_name}</strong></Link> : <strong>{report.stock_name}</strong>}
          {report.gicode ? <span>{report.gicode}</span> : null}
        </div>
        <div className="report-title">{report.title}<OriginalLink report={report} /></div>
        <ul className="summary-list">
          {report.summary.slice(0, 3).map((item, index) => (
            <li key={`${report.source_key}-${index}`}>{item}</li>
          ))}
        </ul>
      </td>
      <td>{changeMark(report.opinion_change)}<OpinionBadge value={report.opinion} /></td>
      <td className="num">{changeMark(report.target_price_change)}{formatNumber(report.target_price)}</td>
      <td className="num muted">{formatNumber(report.prev_close)}</td>
      <td className="num">{formatNumber(report.actual_6m)}<br /><small>{formatPct(ret6m, true)}</small></td>
      <td className="num">{formatNumber(report.actual_1y)}<br /><small>{formatPct(ret1y, true)}</small></td>
      <td>
        <div>{report.is_best ? <span className="best-badge">BEST</span> : null}{report.provider || '-'}</div>
        <small className="accent">{report.author || '-'}</small>
      </td>
    </tr>
  );
}

function OriginalLink({ report }: { report: Report }) {
  const url = report.naver_url || report.hankyung_url || report.newspim_url;
  if (!url) return null;
  return <a className="source-link" href={url} target="_blank" rel="noreferrer">원문</a>;
}

function OpinionBadge({ value }: { value: string | null }) {
  const text = value || '-';
  const upper = text.toUpperCase();
  let tone = 'neutral';
  if (upper.includes('BUY') || text.includes('매수') || upper.includes('OUTPERFORM')) tone = 'buy';
  if (upper.includes('SELL') || text.includes('매도') || upper.includes('REDUCE')) tone = 'sell';
  if (upper.includes('HOLD') || text.includes('중립') || upper.includes('MARKETPERFORM')) tone = 'hold';
  return <span className={`opinion ${tone}`}>{text}</span>;
}

function SortableTh({ label, id, filters, onSort }: { label: string; id: string; filters: Filters; onSort: (id: string) => void }) {
  const active = filters.sort === id;
  return (
    <th onClick={() => onSort(id)}>
      {label} <span className="sort-mark">{active ? (filters.dir === 'asc' ? '▲' : '▼') : ''}</span>
    </th>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {sub ? <small>{sub}</small> : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="section-title">{children}</h2>;
}

function buildQuery(filters: Filters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (Array.isArray(value)) {
      if (value.length) params.set(key, value.join(','));
    } else if (typeof value === 'boolean') {
      if (value) params.set(key, 'true');
    } else if (value !== '') {
      params.set(key, String(value));
    }
  }
  return params.toString();
}

function formatNumber(value: number | null | undefined) {
  return value == null ? '-' : value.toLocaleString();
}

function formatPct(value: number | null | undefined, sign = false) {
  if (value == null || Number.isNaN(value)) return '-';
  const prefix = sign && value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(1)}%`;
}

function calcReturn(actual: number | null, previous: number | null) {
  if (actual == null || previous == null) return null;
  return (actual / previous - 1) * 100;
}

function changeMark(value: string | null) {
  if (value === '상향') return <span className="change up">▲</span>;
  if (value === '하향') return <span className="change down">▼</span>;
  if (value === '신규') return <span className="change new">★</span>;
  if (value === '유지') return <span className="change keep">·</span>;
  return null;
}

function hitRateSub(data: ReportListResponse | null) {
  if (!data || data.stats.targetHitRate.total === 0) return undefined;
  return `${formatNumber(data.stats.targetHitRate.hit)} / ${formatNumber(data.stats.targetHitRate.total)}`;
}

function pageLabel(data: ReportListResponse | null) {
  if (!data || data.total === 0) return '0 - 0 / 0';
  const start = (data.page - 1) * data.pageSize + 1;
  const end = Math.min(data.page * data.pageSize, data.total);
  return `${formatNumber(start)} - ${formatNumber(end)} / ${formatNumber(data.total)}`;
}
