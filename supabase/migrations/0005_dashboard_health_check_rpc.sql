create or replace function public.dashboard_health_check()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'reportsCount', (select count(*)::int from public.reports),
    'searchReportsRpcReady', to_regprocedure('public.search_reports(date,date,text,text,text,text,text[],text[],boolean,boolean,integer,integer,text,text)') is not null,
    'reportAnalyticsRpcReady', to_regprocedure('public.report_analytics(date,date,text,text,text,text,text[],text[],boolean,boolean)') is not null
  );
$$;
