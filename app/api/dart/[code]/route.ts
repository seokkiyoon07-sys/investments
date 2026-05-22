import { NextResponse } from 'next/server';
import { getDartDisclosures } from '@/lib/dart';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const countParam = Number(new URL(request.url).searchParams.get('count'));
  const count = Number.isFinite(countParam) && countParam > 0 ? countParam : 15;

  const result = await getDartDisclosures(code, { count });
  return NextResponse.json(result);
}
