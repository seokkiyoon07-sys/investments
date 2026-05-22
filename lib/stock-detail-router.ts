import type { StockDetailResponse } from './report-types';
import { queryStockDetailLocal } from './stock-detail';
import { queryStockDetailSupabase } from './stock-detail-supabase';
import { hasSupabaseEnv, shouldUseLocalFallback } from './supabase-server';

export async function queryStockDetailRouted(stockKey: string): Promise<StockDetailResponse | null> {
  if (hasSupabaseEnv()) {
    try {
      return await queryStockDetailSupabase(stockKey);
    } catch (error) {
      if (!shouldUseLocalFallback()) throw error;

      const fallback = await queryStockDetailLocal(stockKey);
      return fallback
        ? {
            ...fallback,
            warning: error instanceof Error ? error.message : 'Supabase stock detail failed; using local fallback.'
          }
        : null;
    }
  }

  if (!shouldUseLocalFallback()) {
    throw new Error('Supabase env is required in production.');
  }

  return queryStockDetailLocal(stockKey);
}
