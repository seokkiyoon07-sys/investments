import { NextResponse } from 'next/server';
import { queryReportsRouted } from '@/lib/report-query-router';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const result = await queryReportsRouted(url.searchParams);
  return NextResponse.json(result);
}
