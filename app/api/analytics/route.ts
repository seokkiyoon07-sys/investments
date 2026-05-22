import { NextResponse } from 'next/server';
import { queryReportAnalyticsRouted } from '@/lib/report-analytics-router';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const result = await queryReportAnalyticsRouted(url.searchParams);
  return NextResponse.json(result);
}
