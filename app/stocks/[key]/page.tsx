import { StockDetailClient } from '@/components/stock-detail-client';

export const dynamic = 'force-dynamic';

export default async function StockDetailPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return <StockDetailClient stockKey={key} />;
}
