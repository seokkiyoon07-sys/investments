import type { ReportAnalyticsResponse } from './report-types';
import { queryReportAnalytics } from './report-analytics';
import { queryReportAnalyticsFromSupabase } from './report-analytics-supabase';
import { hasSupabaseEnv, shouldUseLocalFallback } from './supabase-server';

export async function queryReportAnalyticsRouted(searchParams: URLSearchParams): Promise<ReportAnalyticsResponse> {
  if (hasSupabaseEnv()) {
    try {
      return await queryReportAnalyticsFromSupabase(searchParams);
    } catch (error) {
      if (!shouldUseLocalFallback()) throw error;

      console.warn(error);
      const fallback = await queryReportAnalytics(searchParams);
      return {
        ...fallback,
        warning: error instanceof Error ? error.message : 'Supabase analytics failed; using local fallback.'
      };
    }
  }

  if (!shouldUseLocalFallback()) {
    throw new Error('Supabase env is required in production.');
  }

  return queryReportAnalytics(searchParams);
}
