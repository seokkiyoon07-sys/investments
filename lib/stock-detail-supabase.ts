import type { Report, StockDetailResponse } from './report-types';
import { buildStockDetail } from './stock-detail';
import { getSupabaseServerClient } from './supabase-server';

export async function queryStockDetailSupabase(stockKey: string): Promise<StockDetailResponse | null> {
  const key = decodeURIComponent(stockKey);
  const supabase = getSupabaseServerClient();
  const isCode = /^A?\d{6}$/i.test(key);
  const normalizedCode = key.startsWith('A') ? key.toUpperCase() : `A${key}`;

  let query = supabase
    .from('reports')
    .select('source_key,report_date,gicode,stock_name,title,summary,opinion,opinion_change,target_price,target_price_change,prev_close,provider,author,is_best,actual_6m,actual_1y,naver_url,hankyung_url,newspim_url')
    .order('report_date', { ascending: false })
    .limit(5000);

  query = isCode ? query.eq('gicode', normalizedCode) : query.eq('stock_name', key);

  const { data, error } = await query;

  if (error) {
    throw new Error(`Supabase stock detail failed: ${error.message}`);
  }
  if (!data?.length) return null;

  return buildStockDetail(data as Report[], 'supabase');
}
