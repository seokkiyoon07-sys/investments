import type { ReportListResponse } from './report-types';
import { queryReports } from './report-query';
import { queryReportsFromSupabase } from './report-query-supabase';
import { hasSupabaseEnv, shouldUseLocalFallback } from './supabase-server';

export async function queryReportsRouted(searchParams: URLSearchParams): Promise<ReportListResponse> {
  if (hasSupabaseEnv()) {
    try {
      return await queryReportsFromSupabase(searchParams);
    } catch (error) {
      if (!shouldUseLocalFallback()) throw error;

      console.warn(error);
      const fallback = await queryReports(searchParams);
      return {
        ...fallback,
        warning: error instanceof Error ? error.message : 'Supabase query failed; using local fallback.'
      };
    }
  }

  if (!shouldUseLocalFallback()) {
    throw new Error('Supabase env is required in production.');
  }

  return queryReports(searchParams);
}
