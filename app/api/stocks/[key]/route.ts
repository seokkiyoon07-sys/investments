import { NextResponse } from 'next/server';
import { queryStockDetailRouted } from '@/lib/stock-detail-router';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const result = await queryStockDetailRouted(key);

  if (!result) {
    return NextResponse.json({ error: 'Stock not found' }, { status: 404 });
  }

  return NextResponse.json(result);
}
