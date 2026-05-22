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
  const { count, error } = await supabase
    .from('reports')
    .select('source_key', { count: 'exact', head: true });

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

  const { error: rpcError } = await supabase.rpc('search_reports', {
    p_from: null,
    p_to: null,
    p_keyword: null,
    p_stock: null,
    p_provider: null,
    p_author: null,
    p_opinions: null,
    p_tp_changes: null,
    p_best_only: false,
    p_has_tp: false,
    p_page: 1,
    p_page_size: 1,
    p_sort: 'report_date',
    p_dir: 'desc'
  });

  const reportsCount = count ?? 0;
  const ok = reportsCount > 0 && !rpcError;

  return NextResponse.json({
    ok,
    supabaseConfigured: true,
    nodeEnv: process.env.NODE_ENV,
    reportsCount,
    searchReportsRpcReady: !rpcError,
    error: rpcError?.message
  }, { status: ok ? 200 : 503 });
}
