'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { StockDetailView } from './stock-detail-view';
import type { StockDetailResponse } from '@/lib/report-types';

export function StockDetailClient({ stockKey }: { stockKey: string }) {
  const [detail, setDetail] = useState<StockDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch(`/api/stocks/${encodeURIComponent(stockKey)}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(response.status === 404 ? '종목을 찾을 수 없습니다.' : `Request failed: ${response.status}`);
        return response.json() as Promise<StockDetailResponse>;
      })
      .then(setDetail)
      .catch((err: Error) => {
        if (err.name !== 'AbortError') setError(err.message);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [stockKey]);

  if (loading) {
    return (
      <main className="stock-page">
        <Link className="back-link" href="/">목록으로</Link>
        <div className="panel empty-panel">종목 상세 데이터를 불러오는 중입니다.</div>
      </main>
    );
  }

  if (error || !detail) {
    return (
      <main className="stock-page">
        <Link className="back-link" href="/">목록으로</Link>
        <div className="error-box">{error || '종목 상세 데이터가 없습니다.'}</div>
      </main>
    );
  }

  return <StockDetailView detail={detail} />;
}
