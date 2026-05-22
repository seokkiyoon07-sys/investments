import type { ReportAnalyticsResponse } from './report-types';
import { parseReportQuery } from './report-query';
import { getSupabaseServerClient } from './supabase-server';

type ReportAnalyticsRpcResponse = Omit<ReportAnalyticsResponse, 'source' | 'warning'>;

export async function queryReportAnalyticsFromSupabase(searchParams: URLSearchParams): Promise<ReportAnalyticsResponse> {
  const query = parseReportQuery(searchParams);
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase.rpc('report_analytics', {
    p_from: query.from || null,
    p_to: query.to || null,
    p_keyword: query.keyword || null,
    p_stock: query.stock || null,
    p_provider: query.provider || null,
    p_author: query.author || null,
    p_opinions: query.opinions?.length ? query.opinions : null,
    p_tp_changes: query.tpChanges?.length ? query.tpChanges : null,
    p_best_only: query.bestOnly || false,
    p_has_tp: query.hasTp || false
  });

  if (error) {
    throw new Error(`Supabase report_analytics failed: ${error.message}`);
  }

  return {
    ...(data as ReportAnalyticsRpcResponse),
    source: 'supabase'
  };
}
