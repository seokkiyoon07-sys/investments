create or replace function public.report_analytics_from_rollups(
  p_from date default null,
  p_to date default null
)
returns jsonb
language plpgsql
stable
as $$
declare
  start_month text;
  end_month text;
  result jsonb;
begin
  start_month := to_char(date_trunc('month', p_from), 'YYYY-MM');
  end_month := to_char(date_trunc('month', p_to), 'YYYY-MM');

  with
  months_in_range as (
    select month, count
    from public.report_rollup_months
    where (start_month is null or month >= start_month)
      and (end_month is null or month <= end_month)
  ),
  stock_rank as (
    select name, min(gicode) as gicode, sum(count)::int as count
    from public.report_rollup_stocks
    where (start_month is null or month >= start_month)
      and (end_month is null or month <= end_month)
    group by name
    order by sum(count) desc, name
    limit 50
  ),
  provider_rank as (
    select name, null::text as gicode, sum(count)::int as count
    from public.report_rollup_providers
    where (start_month is null or month >= start_month)
      and (end_month is null or month <= end_month)
    group by name
    order by sum(count) desc, name
    limit 50
  ),
  author_rank as (
    select name, null::text as gicode, sum(count)::int as count
    from public.report_rollup_authors
    where (start_month is null or month >= start_month)
      and (end_month is null or month <= end_month)
    group by name
    order by sum(count) desc, name
    limit 50
  ),
  target_change_dist as (
    select name, sum(count)::int as count
    from public.report_rollup_target_changes
    where (start_month is null or month >= start_month)
      and (end_month is null or month <= end_month)
    group by name
    order by sum(count) desc, name
    limit 10
  ),
  opinion_dist as (
    select name, sum(count)::int as count
    from public.report_rollup_opinions
    where (start_month is null or month >= start_month)
      and (end_month is null or month <= end_month)
    group by name
    order by sum(count) desc, name
    limit 12
  ),
  target_rank_base as (
    select
      name,
      min(gicode) as gicode,
      sum(up)::int as up,
      sum(hold)::int as hold,
      sum(down)::int as down,
      sum(neu)::int as neu,
      sum(total)::int as total,
      case when sum(total) > 0 then sum(up)::numeric / sum(total) * 100 else 0 end as up_pct,
      case when sum(total) > 0 then sum(down)::numeric / sum(total) * 100 else 0 end as down_pct
    from public.report_rollup_target_rank
    where (start_month is null or month >= start_month)
      and (end_month is null or month <= end_month)
    group by name
    having sum(total) >= 3
  ),
  opinion_rank_base as (
    select
      name,
      min(gicode) as gicode,
      sum(up)::int as up,
      sum(hold)::int as hold,
      sum(down)::int as down,
      sum(neu)::int as neu,
      sum(total)::int as total,
      case when sum(total) > 0 then sum(up)::numeric / sum(total) * 100 else 0 end as up_pct,
      case when sum(total) > 0 then sum(down)::numeric / sum(total) * 100 else 0 end as down_pct
    from public.report_rollup_opinion_rank
    where (start_month is null or month >= start_month)
      and (end_month is null or month <= end_month)
    group by name
    having sum(total) >= 3
  ),
  target_up as (
    select * from target_rank_base
    order by up_pct desc, up desc, total desc
    limit 20
  ),
  target_down as (
    select * from target_rank_base
    order by down_pct desc, down desc, total desc
    limit 20
  ),
  opinion_up as (
    select * from opinion_rank_base
    order by up_pct desc, up desc, total desc
    limit 20
  ),
  opinion_down as (
    select * from opinion_rank_base
    order by down_pct desc, down desc, total desc
    limit 20
  )
  select jsonb_build_object(
    'total', coalesce((select sum(count)::int from months_in_range), 0),
    'stocks', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', count, 'gicode', gicode)) from stock_rank), '[]'::jsonb),
    'providers', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', count, 'gicode', gicode)) from provider_rank), '[]'::jsonb),
    'authors', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', count, 'gicode', gicode)) from author_rank), '[]'::jsonb),
    'months', coalesce((select jsonb_agg(jsonb_build_object('name', month, 'count', count) order by month) from months_in_range), '[]'::jsonb),
    'targetPriceChanges', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', count)) from target_change_dist), '[]'::jsonb),
    'opinions', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', count)) from opinion_dist), '[]'::jsonb),
    'rank', jsonb_build_object(
      'targetUp', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'gicode', gicode, 'up', up, 'hold', hold, 'down', down, 'neu', neu, 'total', total, 'upPct', up_pct, 'downPct', down_pct)) from target_up), '[]'::jsonb),
      'targetDown', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'gicode', gicode, 'up', up, 'hold', hold, 'down', down, 'neu', neu, 'total', total, 'upPct', up_pct, 'downPct', down_pct)) from target_down), '[]'::jsonb),
      'opinionUp', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'gicode', gicode, 'up', up, 'hold', hold, 'down', down, 'neu', neu, 'total', total, 'upPct', up_pct, 'downPct', down_pct)) from opinion_up), '[]'::jsonb),
      'opinionDown', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'gicode', gicode, 'up', up, 'hold', hold, 'down', down, 'neu', neu, 'total', total, 'upPct', up_pct, 'downPct', down_pct)) from opinion_down), '[]'::jsonb)
    )
  )
  into result;

  return result;
end;
$$;

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
  effective_from date;
  effective_to date;
  start_month date;
  end_month date;
  date_range_is_month_aligned boolean;
begin
  select min(report_date), max(report_date)
  into min_date, max_date
  from public.reports;

  effective_from := coalesce(p_from, min_date);
  effective_to := coalesce(p_to, max_date);
  start_month := date_trunc('month', effective_from)::date;
  end_month := date_trunc('month', effective_to)::date;

  date_range_is_month_aligned :=
    (p_from is null or p_from = min_date or p_from = start_month)
    and (p_to is null or p_to = max_date or p_to = (end_month + interval '1 month - 1 day')::date);

  if p_keyword is null
    and p_stock is null
    and p_provider is null
    and p_author is null
    and p_opinions is null
    and p_tp_changes is null
    and not coalesce(p_best_only, false)
    and not coalesce(p_has_tp, false)
  then
    if (p_from is null or p_from = min_date)
      and (p_to is null or p_to = max_date)
    then
      select data
      into cached
      from public.report_analytics_cache
      where cache_key = 'default';

      if cached is not null then
        return cached;
      end if;
    end if;

    if date_range_is_month_aligned then
      return public.report_analytics_from_rollups(effective_from, effective_to);
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
