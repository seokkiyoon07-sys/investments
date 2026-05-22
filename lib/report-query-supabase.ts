import type { ReportListResponse } from './report-types';
import { parseReportQuery } from './report-query';
import { getSupabaseServerClient } from './supabase-server';

type SearchReportsRpcResponse = Omit<ReportListResponse, 'source'>;

export async function queryReportsFromSupabase(searchParams: URLSearchParams): Promise<ReportListResponse> {
  const query = parseReportQuery(searchParams);
  const supabase = getSupabaseServerClient();

  const rpcParams = {
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
    p_dir: query.dir
  };

  const { data, error } = await supabase.rpc('search_reports', {
    ...rpcParams,
    p_price_basis: query.priceBasis
  });

  if (error) {
    if (query.priceBasis === 'after' && isMissingPriceBasisRpc(error.message)) {
      const fallback = await supabase.rpc('search_reports', rpcParams);
      if (!fallback.error) {
        return {
          ...(fallback.data as SearchReportsRpcResponse),
          source: 'supabase',
          warning: 'Supabase search_reports RPC is using the legacy signature; apply migration 0010 for price basis switching.'
        };
      }
    }

    throw new Error(`Supabase search_reports failed: ${error.message}`);
  }

  return {
    ...(data as SearchReportsRpcResponse),
    source: 'supabase'
  };
}

function isMissingPriceBasisRpc(message: string) {
  return message.includes('search_reports') && (
    message.includes('p_price_basis') ||
    message.includes('schema cache') ||
    message.includes('Could not find the function')
  );
}
