create table if not exists public.report_rollup_months (
  month text primary key,
  count integer not null
);

create table if not exists public.report_rollup_stocks (
  month text not null,
  name text not null,
  gicode text,
  count integer not null,
  primary key (month, name)
);

create table if not exists public.report_rollup_providers (
  month text not null,
  name text not null,
  count integer not null,
  primary key (month, name)
);

create table if not exists public.report_rollup_authors (
  month text not null,
  name text not null,
  count integer not null,
  primary key (month, name)
);

create table if not exists public.report_rollup_target_changes (
  month text not null,
  name text not null,
  count integer not null,
  primary key (month, name)
);

create table if not exists public.report_rollup_opinions (
  month text not null,
  name text not null,
  count integer not null,
  primary key (month, name)
);

create table if not exists public.report_rollup_target_rank (
  month text not null,
  name text not null,
  gicode text,
  up integer not null,
  hold integer not null,
  down integer not null,
  neu integer not null,
  total integer not null,
  primary key (month, name)
);

create table if not exists public.report_rollup_opinion_rank (
  month text not null,
  name text not null,
  gicode text,
  up integer not null,
  hold integer not null,
  down integer not null,
  neu integer not null,
  total integer not null,
  primary key (month, name)
);

create or replace function public.refresh_report_analytics_cache()
returns jsonb
language plpgsql
security definer
as $$
declare
  next_data jsonb;
begin
  with
  stock_rank as (
    select name, min(gicode) as gicode, sum(count)::int as count
    from public.report_rollup_stocks
    group by name
    order by sum(count) desc, name
    limit 50
  ),
  provider_rank as (
    select name, null::text as gicode, sum(count)::int as count
    from public.report_rollup_providers
    group by name
    order by sum(count) desc, name
    limit 50
  ),
  author_rank as (
    select name, null::text as gicode, sum(count)::int as count
    from public.report_rollup_authors
    group by name
    order by sum(count) desc, name
    limit 50
  ),
  target_change_dist as (
    select name, sum(count)::int as count
    from public.report_rollup_target_changes
    group by name
    order by sum(count) desc, name
    limit 10
  ),
  opinion_dist as (
    select name, sum(count)::int as count
    from public.report_rollup_opinions
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
    'total', coalesce((select sum(count)::int from public.report_rollup_months), 0),
    'stocks', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', count, 'gicode', gicode)) from stock_rank), '[]'::jsonb),
    'providers', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', count, 'gicode', gicode)) from provider_rank), '[]'::jsonb),
    'authors', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', count, 'gicode', gicode)) from author_rank), '[]'::jsonb),
    'months', coalesce((select jsonb_agg(jsonb_build_object('name', month, 'count', count) order by month) from public.report_rollup_months), '[]'::jsonb),
    'targetPriceChanges', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', count)) from target_change_dist), '[]'::jsonb),
    'opinions', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', count)) from opinion_dist), '[]'::jsonb),
    'rank', jsonb_build_object(
      'targetUp', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'gicode', gicode, 'up', up, 'hold', hold, 'down', down, 'neu', neu, 'total', total, 'upPct', up_pct, 'downPct', down_pct)) from target_up), '[]'::jsonb),
      'targetDown', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'gicode', gicode, 'up', up, 'hold', hold, 'down', down, 'neu', neu, 'total', total, 'upPct', up_pct, 'downPct', down_pct)) from target_down), '[]'::jsonb),
      'opinionUp', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'gicode', gicode, 'up', up, 'hold', hold, 'down', down, 'neu', neu, 'total', total, 'upPct', up_pct, 'downPct', down_pct)) from opinion_up), '[]'::jsonb),
      'opinionDown', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'gicode', gicode, 'up', up, 'hold', hold, 'down', down, 'neu', neu, 'total', total, 'upPct', up_pct, 'downPct', down_pct)) from opinion_down), '[]'::jsonb)
    )
  )
  into next_data;

  insert into public.report_analytics_cache (cache_key, data, refreshed_at)
  values ('default', next_data, now())
  on conflict (cache_key)
  do update set data = excluded.data, refreshed_at = excluded.refreshed_at;

  return next_data;
end;
$$;

create or replace function public.refresh_report_rollups(
  p_from date default null,
  p_to date default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  start_month date;
  end_month date;
begin
  select
    coalesce(date_trunc('month', p_from)::date, date_trunc('month', min(report_date))::date),
    coalesce(date_trunc('month', p_to)::date, date_trunc('month', max(report_date))::date)
  into start_month, end_month
  from public.reports;

  if start_month is null or end_month is null then
    return public.refresh_report_analytics_cache();
  end if;

  delete from public.report_rollup_months where month between to_char(start_month, 'YYYY-MM') and to_char(end_month, 'YYYY-MM');
  delete from public.report_rollup_stocks where month between to_char(start_month, 'YYYY-MM') and to_char(end_month, 'YYYY-MM');
  delete from public.report_rollup_providers where month between to_char(start_month, 'YYYY-MM') and to_char(end_month, 'YYYY-MM');
  delete from public.report_rollup_authors where month between to_char(start_month, 'YYYY-MM') and to_char(end_month, 'YYYY-MM');
  delete from public.report_rollup_target_changes where month between to_char(start_month, 'YYYY-MM') and to_char(end_month, 'YYYY-MM');
  delete from public.report_rollup_opinions where month between to_char(start_month, 'YYYY-MM') and to_char(end_month, 'YYYY-MM');
  delete from public.report_rollup_target_rank where month between to_char(start_month, 'YYYY-MM') and to_char(end_month, 'YYYY-MM');
  delete from public.report_rollup_opinion_rank where month between to_char(start_month, 'YYYY-MM') and to_char(end_month, 'YYYY-MM');

  insert into public.report_rollup_months (month, count)
  select to_char(report_date, 'YYYY-MM'), count(*)::int
  from public.reports
  where report_date >= start_month and report_date < (end_month + interval '1 month')
  group by to_char(report_date, 'YYYY-MM');

  insert into public.report_rollup_stocks (month, name, gicode, count)
  select to_char(report_date, 'YYYY-MM'), stock_name, min(gicode), count(*)::int
  from public.reports
  where report_date >= start_month and report_date < (end_month + interval '1 month')
    and stock_name is not null
  group by to_char(report_date, 'YYYY-MM'), stock_name;

  insert into public.report_rollup_providers (month, name, count)
  select to_char(report_date, 'YYYY-MM'), provider, count(*)::int
  from public.reports
  where report_date >= start_month and report_date < (end_month + interval '1 month')
    and provider is not null
  group by to_char(report_date, 'YYYY-MM'), provider;

  insert into public.report_rollup_authors (month, name, count)
  select to_char(report_date, 'YYYY-MM'), author, count(*)::int
  from public.reports
  where report_date >= start_month and report_date < (end_month + interval '1 month')
    and author is not null
  group by to_char(report_date, 'YYYY-MM'), author;

  insert into public.report_rollup_target_changes (month, name, count)
  select to_char(report_date, 'YYYY-MM'), coalesce(target_price_change, '(없음)'), count(*)::int
  from public.reports
  where report_date >= start_month and report_date < (end_month + interval '1 month')
  group by to_char(report_date, 'YYYY-MM'), coalesce(target_price_change, '(없음)');

  insert into public.report_rollup_opinions (month, name, count)
  select to_char(report_date, 'YYYY-MM'), coalesce(opinion, '(없음)'), count(*)::int
  from public.reports
  where report_date >= start_month and report_date < (end_month + interval '1 month')
  group by to_char(report_date, 'YYYY-MM'), coalesce(opinion, '(없음)');

  insert into public.report_rollup_target_rank (month, name, gicode, up, hold, down, neu, total)
  select
    to_char(report_date, 'YYYY-MM'),
    stock_name,
    min(gicode),
    count(*) filter (where target_price_change = '상향')::int,
    count(*) filter (where target_price_change = '유지')::int,
    count(*) filter (where target_price_change = '하향')::int,
    count(*) filter (where target_price_change = '신규')::int,
    count(*) filter (where target_price_change in ('상향','유지','하향','신규'))::int
  from public.reports
  where report_date >= start_month and report_date < (end_month + interval '1 month')
  group by to_char(report_date, 'YYYY-MM'), stock_name
  having count(*) filter (where target_price_change in ('상향','유지','하향','신규')) > 0;

  insert into public.report_rollup_opinion_rank (month, name, gicode, up, hold, down, neu, total)
  select
    to_char(report_date, 'YYYY-MM'),
    stock_name,
    min(gicode),
    count(*) filter (where opinion_change = '상향')::int,
    count(*) filter (where opinion_change = '유지')::int,
    count(*) filter (where opinion_change = '하향')::int,
    count(*) filter (where opinion_change = '신규')::int,
    count(*) filter (where opinion_change in ('상향','유지','하향','신규'))::int
  from public.reports
  where report_date >= start_month and report_date < (end_month + interval '1 month')
  group by to_char(report_date, 'YYYY-MM'), stock_name
  having count(*) filter (where opinion_change in ('상향','유지','하향','신규')) > 0;

  return public.refresh_report_analytics_cache();
end;
$$;

do $$
begin
  perform public.refresh_report_rollups(null, null);
end $$;
