import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type DartDisclosure = {
  rceptNo: string;
  reportName: string;
  filerName: string;
  receivedDate: string;
  remark: string;
  viewerUrl: string;
};

export type DartStatus = 'ok' | 'no-key' | 'no-mapping' | 'not-found' | 'no-data' | 'error';

export type DartDisclosureResult = {
  status: DartStatus;
  message?: string;
  stockCode: string | null;
  corpCode: string | null;
  /** API가 막혀도 항상 동작하는 DART 웹 검색 링크 (폴백) */
  searchUrl: string;
  disclosures: DartDisclosure[];
};

const DART_LIST_ENDPOINT = 'https://opendart.fss.or.kr/api/list.json';
const DART_VIEWER_BASE = 'https://dart.fss.or.kr/dsaf001/main.do';
const DART_SEARCH_BASE = 'https://dart.fss.or.kr/dsab007/main.do';
const CORP_CODE_PATH = join(process.cwd(), 'data', 'dart-corp-codes.json');

/** "A005930" 또는 "005930" → "005930" (6자리 KRX 종목코드) */
export function normalizeStockCode(raw: string): string | null {
  if (!raw) return null;
  const digits = raw.trim().replace(/^A/i, '').replace(/\D/g, '');
  if (!digits) return null;
  return digits.padStart(6, '0').slice(-6);
}

/** 공시 원문 뷰어 URL */
export function dartViewerUrl(rceptNo: string): string {
  return `${DART_VIEWER_BASE}?rcpNo=${encodeURIComponent(rceptNo)}`;
}

/** DART 통합검색 링크 — 종목코드/회사명 모두 입력란에서 동작 */
export function dartSearchUrl(query: string): string {
  return `${DART_SEARCH_BASE}?option=corp&textCrpNm=${encodeURIComponent(query)}`;
}

let corpCodeCache: Record<string, string> | null = null;
let corpCodeLoaded = false;

/** data/dart-corp-codes.json (npm run sync:dart 로 생성)을 1회 로드 후 캐시 */
function loadCorpCodeMap(): Record<string, string> | null {
  if (corpCodeLoaded) return corpCodeCache;
  corpCodeLoaded = true;
  try {
    const parsed = JSON.parse(readFileSync(CORP_CODE_PATH, 'utf8'));
    const map = parsed && typeof parsed === 'object' ? (parsed.map ?? parsed) : null;
    corpCodeCache = map && typeof map === 'object' ? (map as Record<string, string>) : null;
  } catch {
    corpCodeCache = null;
  }
  return corpCodeCache;
}

function formatYmd(date: Date): string {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
}

function formatRceptDt(raw: unknown): string {
  const value = String(raw ?? '').trim();
  return /^\d{8}$/.test(value) ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` : value;
}

type DartListRow = {
  rcept_no?: string;
  report_nm?: string;
  flr_nm?: string;
  rcept_dt?: string;
  rm?: string;
};

async function fetchDartList(corpCode: string, apiKey: string, count: number) {
  const end = new Date();
  const begin = new Date();
  begin.setFullYear(begin.getFullYear() - 3);

  const params = new URLSearchParams({
    crtfc_key: apiKey,
    corp_code: corpCode,
    bgn_de: formatYmd(begin),
    end_de: formatYmd(end),
    page_no: '1',
    page_count: String(count),
    sort: 'date',
    sort_mth: 'desc'
  });

  const response = await fetch(`${DART_LIST_ENDPOINT}?${params.toString()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`DART API HTTP ${response.status}`);

  const json = (await response.json()) as { status?: string; message?: string; list?: DartListRow[] };
  return {
    status: String(json.status ?? ''),
    message: String(json.message ?? ''),
    list: Array.isArray(json.list) ? json.list : []
  };
}

/**
 * 종목코드(또는 gicode "A…")로 최근 DART 공시를 조회한다.
 * API 키·매핑이 없으면 status로 사유를 알리고, searchUrl(웹 링크)은 항상 채워서 반환한다.
 */
export async function getDartDisclosures(rawCode: string, opts?: { count?: number }): Promise<DartDisclosureResult> {
  const count = Math.min(Math.max(opts?.count ?? 15, 1), 100);
  const stockCode = normalizeStockCode(rawCode);
  const searchUrl = dartSearchUrl(stockCode ?? rawCode);
  const base = { stockCode, corpCode: null as string | null, searchUrl, disclosures: [] as DartDisclosure[] };

  if (!stockCode) {
    return { ...base, status: 'error', message: '유효한 종목코드가 아닙니다.' };
  }

  const apiKey = process.env.DART_API_KEY?.trim();
  if (!apiKey) {
    return { ...base, status: 'no-key', message: 'DART_API_KEY가 설정되지 않았습니다.' };
  }

  const corpMap = loadCorpCodeMap();
  if (!corpMap) {
    return { ...base, status: 'no-mapping', message: 'corp_code 매핑 파일이 없습니다. npm run sync:dart 를 실행하세요.' };
  }

  const corpCode = corpMap[stockCode] ?? null;
  if (!corpCode) {
    return { ...base, status: 'not-found', message: 'DART에서 해당 종목코드를 찾지 못했습니다.' };
  }

  try {
    const { status, message, list } = await fetchDartList(corpCode, apiKey, count);

    if (status === '013') {
      return { ...base, corpCode, status: 'no-data', message: '최근 공시가 없습니다.' };
    }
    if (status !== '000') {
      return { ...base, corpCode, status: 'error', message: `DART 응답 오류: ${message || status}` };
    }

    const disclosures: DartDisclosure[] = list
      .filter((row) => row.rcept_no)
      .map((row) => ({
        rceptNo: String(row.rcept_no),
        reportName: String(row.report_nm ?? '').trim(),
        filerName: String(row.flr_nm ?? '').trim(),
        receivedDate: formatRceptDt(row.rcept_dt),
        remark: String(row.rm ?? '').trim(),
        viewerUrl: dartViewerUrl(String(row.rcept_no))
      }));

    return { ...base, corpCode, status: 'ok', disclosures };
  } catch (error) {
    return {
      ...base,
      corpCode,
      status: 'error',
      message: error instanceof Error ? error.message : 'DART 요청에 실패했습니다.'
    };
  }
}
