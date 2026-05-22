import { NextResponse } from 'next/server';
import { getDartDisclosures } from '@/lib/dart';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const countParam = Number(new URL(request.url).searchParams.get('count'));
    const count = Number.isFinite(countParam) && countParam > 0 ? countParam : 15;

    const result = await getDartDisclosures(code, { count });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      message: error instanceof Error ? error.message : 'DART 조회 중 오류가 발생했습니다.',
      stockCode: null,
      corpCode: null,
      searchUrl: 'https://dart.fss.or.kr/dsab007/main.do',
      disclosures: []
    });
  }
}
