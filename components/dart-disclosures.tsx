'use client';

import { useEffect, useState } from 'react';

type Disclosure = {
  rceptNo: string;
  reportName: string;
  filerName: string;
  receivedDate: string;
  remark: string;
  viewerUrl: string;
};

type DartResult = {
  status: 'ok' | 'no-key' | 'no-mapping' | 'not-found' | 'no-data' | 'error';
  message?: string;
  stockCode: string | null;
  corpCode: string | null;
  searchUrl: string;
  disclosures: Disclosure[];
};

function dartSearchUrl(gicode: string) {
  const code = gicode.replace(/^A/i, '');
  return `https://dart.fss.or.kr/dsab007/main.do?option=corp&textCrpNm=${encodeURIComponent(code)}`;
}

const STATUS_NOTE: Record<Exclude<DartResult['status'], 'ok'>, string> = {
  'no-key': 'DART_API_KEY가 설정되지 않았습니다. .env.local에 키를 넣고 서버를 재시작하면 공시가 표시됩니다.',
  'no-mapping': 'corp_code 매핑 파일이 없습니다. 터미널에서 npm run sync:dart 를 실행한 뒤 새로고침하세요.',
  'not-found': 'DART에서 이 종목코드를 찾지 못했습니다 (비상장·합병·코드 변경 등).',
  'no-data': '최근 3년간 등록된 공시가 없습니다.',
  error: 'DART 조회 중 오류가 발생했습니다.'
};

export function DartDisclosures({ gicode }: { gicode: string | null }) {
  const [result, setResult] = useState<DartResult | null>(null);
  const [loading, setLoading] = useState(Boolean(gicode));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!gicode) return;
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    setResult(null);

    fetch(`/api/dart/${encodeURIComponent(gicode)}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<DartResult>;
      })
      .then(setResult)
      .catch((error: Error) => {
        if (error.name !== 'AbortError') setFailed(true);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [gicode]);

  return (
    <section className="panel" id="dart">
      <h2>
        DART 공시
        {gicode ? (
          <a className="dart-search-link" href={dartSearchUrl(gicode)} target="_blank" rel="noreferrer">
            DART 조회 화면 열기 ↗
          </a>
        ) : null}
      </h2>
      <DartBody gicode={gicode} loading={loading} failed={failed} result={result} />
    </section>
  );
}

function DartBody({
  gicode,
  loading,
  failed,
  result
}: {
  gicode: string | null;
  loading: boolean;
  failed: boolean;
  result: DartResult | null;
}) {
  if (!gicode) {
    return <div className="dart-note">종목코드가 없어 DART 공시를 조회할 수 없습니다.</div>;
  }
  if (loading) {
    return <div className="empty-panel">DART 공시를 불러오는 중입니다.</div>;
  }
  if (failed) {
    return <div className="dart-note">DART 조회에 실패했습니다. 잠시 후 다시 시도해 주세요.</div>;
  }
  if (!result) {
    return null;
  }
  if (result.status !== 'ok') {
    return <div className="dart-note">{result.message || STATUS_NOTE[result.status]}</div>;
  }
  if (!result.disclosures.length) {
    return <div className="dart-note">표시할 공시가 없습니다.</div>;
  }

  return (
    <ul className="dart-list">
      {result.disclosures.map((item) => (
        <li key={item.rceptNo} className="dart-row">
          <span className="dart-date">{item.receivedDate}</span>
          <a className="dart-title" href={item.viewerUrl} target="_blank" rel="noreferrer">
            {item.reportName}
          </a>
          <span className="dart-filer">
            {item.filerName}
            {item.remark ? ` · ${item.remark}` : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}
