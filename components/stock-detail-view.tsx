import Link from 'next/link';
import type { Report, StockDetailResponse, TargetPoint } from '@/lib/report-types';
import { DartDisclosures } from './dart-disclosures';

export function StockDetailView({ detail }: { detail: StockDetailResponse }) {
  return (
    <main className="stock-page">
      <header className="stock-page-header">
        <div>
          <Link className="back-link" href="/">목록으로</Link>
          <h1>{detail.stockName} <small>{detail.gicode || ''}</small></h1>
          <p>{detail.firstDate || '-'} ~ {detail.latestDate || '-'} · {detail.source === 'supabase' ? 'Supabase' : '로컬 NDJSON'}</p>
        </div>
      </header>

      {detail.warning ? <div className="warning-box">{detail.warning}</div> : null}

      <section className="stats-grid">
        <StockStat label="보고서 수" value={formatNumber(detail.totalReports)} />
        <StockStat label="작성자 수" value={formatNumber(detail.authors.length)} />
        <StockStat label="최근 종가" value={formatNumber(detail.latestClose)} />
        <StockStat label="목표주가 범위" value={`${formatNumber(detail.targetPriceMin)} ~ ${formatNumber(detail.targetPriceMax)}`} />
      </section>

      <DartDisclosures gicode={detail.gicode} />

      <section className="panel">
        <h2>작성자별 목표주가</h2>
        <TargetPriceChart points={detail.targetPoints} />
      </section>

      <section className="panel">
        <h2>작성자별 요약</h2>
        <div className="rank-table-wrap">
          <table className="rank-table stock-author-table">
            <thead>
              <tr>
                <th>작성자</th>
                <th>제공처</th>
                <th>보고서</th>
                <th>최근일</th>
                <th>최근 의견</th>
                <th>최근 TP</th>
                <th>평균 TP</th>
                <th>TP 범위</th>
              </tr>
            </thead>
            <tbody>
              {detail.authors.map((author) => (
                <tr key={`${author.author}-${author.provider || ''}`}>
                  <td><strong>{author.author}</strong></td>
                  <td>{author.provider || '-'}</td>
                  <td className="num">{formatNumber(author.count)}</td>
                  <td>{author.latestDate}</td>
                  <td>{author.latestOpinion || '-'}</td>
                  <td className="num">{formatNumber(author.latestTargetPrice)}</td>
                  <td className="num">{formatNumber(author.avgTargetPrice)}</td>
                  <td className="num">{formatNumber(author.minTargetPrice)} ~ {formatNumber(author.maxTargetPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>보고서 목록 <small>최근 40건</small></h2>
        <div className="report-card-list">
          {detail.reports.map((report) => <StockReportCard key={report.source_key} report={report} />)}
        </div>
      </section>
    </main>
  );
}

function TargetPriceChart({ points }: { points: TargetPoint[] }) {
  if (!points.length) {
    return <div className="empty-panel">목표주가 데이터가 없습니다.</div>;
  }

  const width = 1180;
  const height = 360;
  const pad = { left: 70, right: 22, top: 24, bottom: 42 };
  const dates = points.map((point) => Date.parse(point.report_date));
  const prices = points.map((point) => point.target_price);
  const minDate = Math.min(...dates);
  const maxDate = Math.max(...dates);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const pricePad = Math.max(1, (maxPrice - minPrice) * 0.12);
  const yMin = Math.max(0, minPrice - pricePad);
  const yMax = maxPrice + pricePad;
  const spanDate = Math.max(1, maxDate - minDate);
  const spanPrice = Math.max(1, yMax - yMin);
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const toX = (date: string) => pad.left + ((Date.parse(date) - minDate) / spanDate) * plotW;
  const toY = (price: number) => pad.top + (1 - (price - yMin) / spanPrice) * plotH;
  const sampled = samplePoints(points, 650);
  const byAuthor = new Map<string, TargetPoint[]>();

  for (const point of sampled) {
    const key = `${point.author || '(미상)'}|${point.provider || ''}`;
    const current = byAuthor.get(key) || [];
    current.push(point);
    byAuthor.set(key, current);
  }

  const colors = ['#38bdf8', '#f87171', '#34d399', '#fbbf24', '#a78bfa', '#fb7185', '#22d3ee', '#f59e0b'];
  const authorGroups = [...byAuthor.entries()].slice(0, 16);
  const yTicks = Array.from({ length: 5 }, (_, index) => {
    const price = yMin + (spanPrice * (4 - index)) / 4;
    const y = pad.top + (plotH * index) / 4;
    return { price, y };
  });

  return (
    <div className="stock-chart-scroll">
      <svg className="stock-chart" viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label="작성자별 목표주가 차트">
        {yTicks.map((tick) => (
          <g key={tick.y}>
            <line x1={pad.left} x2={width - pad.right} y1={tick.y} y2={tick.y} />
            <text x={pad.left - 8} y={tick.y + 4} textAnchor="end">{formatNumber(Math.round(tick.price))}</text>
          </g>
        ))}
        {authorGroups.map(([key, group], index) => {
          const color = colors[index % colors.length];
          const sorted = group.slice().sort((a, b) => a.report_date.localeCompare(b.report_date));
          const path = sorted
            .map((point, pointIndex) => `${pointIndex === 0 ? 'M' : 'L'}${toX(point.report_date).toFixed(1)},${toY(point.target_price).toFixed(1)}`)
            .join(' ');
          return (
            <g key={key}>
              <path d={path} fill="none" stroke={color} strokeWidth="1.5" opacity="0.75" />
              {sorted.map((point, pointIndex) => (
                <circle key={`${key}-${point.report_date}-${pointIndex}`} cx={toX(point.report_date)} cy={toY(point.target_price)} r="2.8" fill={color}>
                  <title>{point.report_date} · {point.author || '(미상)'} · TP {formatNumber(point.target_price)}</title>
                </circle>
              ))}
            </g>
          );
        })}
        <text x={pad.left} y={height - 14}>{points[0].report_date}</text>
        <text x={width - pad.right} y={height - 14} textAnchor="end">{points[points.length - 1].report_date}</text>
      </svg>
    </div>
  );
}

function StockReportCard({ report }: { report: Report }) {
  const url = report.naver_url || report.hankyung_url || report.newspim_url;

  return (
    <article className="stock-report-card">
      <div className="stock-report-meta">
        <span>{report.report_date}</span>
        <span>{report.provider || '-'}</span>
        <span>{report.author || '-'}</span>
      </div>
      <h3>{report.title}{url ? <a href={url} target="_blank" rel="noreferrer">원문</a> : null}</h3>
      <div className="stock-report-values">
        <span>의견 {report.opinion || '-'}</span>
        <span>TP {formatNumber(report.target_price)}</span>
        <span>전일종가 {formatNumber(report.prev_close)}</span>
      </div>
      <ul>
        {report.summary.slice(0, 3).map((item, index) => <li key={`${report.source_key}-${index}`}>{item}</li>)}
      </ul>
    </article>
  );
}

function StockStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function samplePoints(points: TargetPoint[], max: number) {
  if (points.length <= max) return points;
  const step = Math.ceil(points.length / max);
  return points.filter((_, index) => index % step === 0);
}

function formatNumber(value: number | null | undefined) {
  return value == null ? '-' : value.toLocaleString();
}
