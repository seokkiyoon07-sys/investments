import { makeSourceKey } from './lib-dashboard-payload.mjs';

const SUMMARY_URL = 'https://comp.fnguide.com/SVO2/ASP/SVD_Report_Summary_Data.asp';

export async function fetchFnguideReportSummary(options = {}) {
  const from = compactDate(options.from);
  const to = compactDate(options.to);
  const keyword = options.keyword || '';

  const url = new URL(SUMMARY_URL);
  url.searchParams.set('fr_dt', from);
  url.searchParams.set('to_dt', to);
  url.searchParams.set('stext', keyword);
  url.searchParams.set('check', options.check || 'all');
  url.searchParams.set('sortOrd', options.sortOrd || '5');
  url.searchParams.set('sortAD', options.sortAD || 'A');

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 fnguide-dashboard-sync/1.0',
      Referer: 'https://comp.fnguide.com/SVO2/ASP/SVD_Report_Summary.asp?pGB=1'
    }
  });

  if (!response.ok) {
    throw new Error(`FnGuide summary request failed: ${response.status}`);
  }

  const html = await response.text();
  return parseFnguideReportSummary(html);
}

export function parseFnguideReportSummary(html) {
  return matchAll(html, /<tr\b[\s\S]*?<\/tr>/gi)
    .map(parseReportRow)
    .filter(Boolean);
}

function parseReportRow(rowHtml) {
  const cells = matchAll(rowHtml, /<td\b[^>]*>([\s\S]*?)<\/td>/gi);
  if (cells.length < 6) return null;

  const dateText = textContent(cells[0]);
  const reportDate = normalizeReportDate(dateText);
  const linkMatch = cells[1].match(/ViewReport\('([^']+)'\)/);
  const gicode = linkMatch?.[1] || null;
  const stockName = textContent(firstMatch(cells[1], /<a\b[^>]*>([\s\S]*?)<span\b/i));
  const title = textContent(firstMatch(cells[1], /<span class="txt2">\s*-?([\s\S]*?)<\/span>/i));
  const summary = matchAll(cells[1], /<dd\b[^>]*>([\s\S]*?)<\/dd>/gi)
    .map(textContent)
    .filter(Boolean);

  const opinionChange = firstMatch(cells[2], /<img\b[^>]*alt=['"]([^'"]+)['"]/i);
  const opinion = cleanMetricText(cells[2]);
  const targetPriceChange = firstMatch(cells[3], /<img\b[^>]*alt=['"]([^'"]+)['"]/i);
  const targetPrice = numberOrNull(cleanMetricText(cells[3]));
  const prevClose = numberOrNull(textContent(cells[4]));
  const providerAuthor = parseProviderAuthor(cells[5]);

  if (!reportDate || !stockName || !title) return null;

  const report = {
    report_date: reportDate,
    gicode,
    stock_name: stockName,
    title,
    summary,
    opinion,
    opinion_change: opinionChange || null,
    target_price: targetPrice,
    target_price_change: targetPriceChange || null,
    prev_close: prevClose,
    provider: providerAuthor.provider,
    author: providerAuthor.author,
    is_best: /alt=['"]베스트['"]/i.test(cells[5]),
    actual_6m: null,
    actual_1y: null,
    naver_url: null,
    hankyung_url: null,
    newspim_url: null
  };

  report.source_key = makeSourceKey(report);
  return report;
}

function parseProviderAuthor(html) {
  const withoutImage = html.replace(/<img\b[^>]*>/gi, '');
  const parts = withoutImage
    .replace(/<br\s*\/?>/gi, '\n')
    .split('\n')
    .map(textContent)
    .filter(Boolean);

  return {
    provider: parts[0] || null,
    author: parts.slice(1).join(',') || null
  };
}

function cleanMetricText(html) {
  const withoutImage = html.replace(/<img\b[^>]*>/gi, '');
  return textContent(withoutImage) || null;
}

function normalizeReportDate(value) {
  const compact = value.replace(/[^\d]/g, '');
  if (compact.length !== 8) return null;
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

function compactDate(value) {
  if (!value) throw new Error('Missing date.');
  const text = String(value).trim();
  if (/^\d{8}$/.test(text)) return text;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text.replaceAll('-', '');
  throw new Error(`Invalid date: ${value}. Use YYYY-MM-DD or YYYYMMDD.`);
}

function numberOrNull(value) {
  const normalized = String(value || '').replace(/,/g, '').trim();
  return normalized && !Number.isNaN(Number(normalized)) ? Number(normalized) : null;
}

function firstMatch(value, pattern) {
  return value.match(pattern)?.[1] || '';
}

function matchAll(value, pattern) {
  return [...value.matchAll(pattern)].map((match) => match[1] || match[0]);
}

function textContent(value) {
  return String(value || '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}
