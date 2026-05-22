import type { ReportListResponse } from './report-types';
import { parseReportQuery } from './report-query';
import { getSupabaseServerClient } from './supabase-server';

type SearchReportsRpcResponse = Omit<ReportListResponse, 'source'>;

export async function queryReportsFromSupabase(searchParams: URLSearchParams): Promise<ReportListResponse> {
  const query = parseReportQuery(searchParams);
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase.rpc('search_reports', {
    p_from: query.from || null,
    p_to: query.to || null,
    p_keyword: query.keyword || null,
    p_stock: query.stock || null,
    p_provider: query.provider || null,
    p_author: query.author || null,
    p_opinions: query.opinions?.length ? query.opinions : null,
    p_tp_changes: query.tpChanges?.length ? query.tpChanges : null,
    p_best_only: query.bestOnly || false,
    p_has_tp: query.hasTp || false,
    p_page: query.page,
    p_page_size: query.pageSize,
    p_sort: query.sort,
    p_dir: query.dir,
    p_price_basis: query.priceBasis
  });

  if (error) {
    throw new Error(`Supabase search_reports failed: ${error.message}`);
  }

  return {
    ...(data as SearchReportsRpcResponse),
    source: 'supabase'
  };
}
