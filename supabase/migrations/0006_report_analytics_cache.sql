do $$
begin
  if to_regprocedure('public.report_analytics_uncached(date,date,text,text,text,text,text[],text[],boolean,boolean)') is null then
    alter function public.report_analytics(date,date,text,text,text,text,text[],text[],boolean,boolean)
      rename to report_analytics_uncached;
  end if;
end $$;

create table if not exists public.report_analytics_cache (
  cache_key text primary key,
  data jsonb not null,
  refreshed_at timestamptz not null default now()
);

create or replace function public.refresh_report_analytics_cache()
returns jsonb
language plpgsql
security definer
as $$
declare
  next_data jsonb;
begin
  next_data := public.report_analytics_uncached();

  insert into public.report_analytics_cache (cache_key, data, refreshed_at)
  values ('default', next_data, now())
  on conflict (cache_key)
  do update set data = excluded.data, refreshed_at = excluded.refreshed_at;

  return next_data;
end;
$$;

select public.refresh_report_analytics_cache();

create or replace function public.report_analytics(
  p_from date default null,
  p_to date default null,
  p_keyword text default null,
  p_stock text default null,
  p_provider text default null,
  p_author text default null,
  p_opinions text[] default null,
  p_tp_changes text[] default null,
  p_best_only boolean default false,
  p_has_tp boolean default false
)
returns jsonb
language plpgsql
stable
as $$
declare
  cached jsonb;
  min_date date;
  max_date date;
begin
  select min(report_date), max(report_date)
  into min_date, max_date
  from public.reports;

  if (p_from is null or p_from = min_date)
    and (p_to is null or p_to = max_date)
    and p_keyword is null
    and p_stock is null
    and p_provider is null
    and p_author is null
    and p_opinions is null
    and p_tp_changes is null
    and not coalesce(p_best_only, false)
    and not coalesce(p_has_tp, false)
  then
    select data
    into cached
    from public.report_analytics_cache
    where cache_key = 'default';

    if cached is not null then
      return cached;
    end if;
  end if;

  return public.report_analytics_uncached(
    p_from,
    p_to,
    p_keyword,
    p_stock,
    p_provider,
    p_author,
    p_opinions,
    p_tp_changes,
    p_best_only,
    p_has_tp
  );
end;
$$;
