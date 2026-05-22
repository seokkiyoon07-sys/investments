import { NextResponse } from 'next/server';
import { getSupabaseServerClient, hasSupabaseEnv } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!hasSupabaseEnv()) {
    return NextResponse.json(
      {
        ok: false,
        supabaseConfigured: false,
        nodeEnv: process.env.NODE_ENV
      },
      { status: 503 }
    );
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.rpc('dashboard_health_check');

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        supabaseConfigured: true,
        nodeEnv: process.env.NODE_ENV,
        error: error.message
      },
      { status: 500 }
    );
  }

  const health = data as {
    reportsCount?: number;
    searchReportsRpcReady?: boolean;
    reportAnalyticsRpcReady?: boolean;
  } | null;
  const reportsCount = health?.reportsCount ?? 0;
  const searchReportsRpcReady = Boolean(health?.searchReportsRpcReady);
  const reportAnalyticsRpcReady = Boolean(health?.reportAnalyticsRpcReady);
  const ok = reportsCount > 0 && searchReportsRpcReady && reportAnalyticsRpcReady;

  return NextResponse.json({
    ok,
    supabaseConfigured: true,
    nodeEnv: process.env.NODE_ENV,
    reportsCount,
    searchReportsRpcReady,
    reportAnalyticsRpcReady
  }, { status: ok ? 200 : 503 });
}
