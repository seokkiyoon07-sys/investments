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
language sql
stable
as $$
  with filtered as (
    select *
    from public.reports r
    where (p_from is null or r.report_date >= p_from)
      and (p_to is null or r.report_date <= p_to)
      and (p_provider is null or r.provider = p_provider)
      and (not coalesce(p_best_only, false) or r.is_best = true)
      and (not coalesce(p_has_tp, false) or r.target_price is not null)
      and (p_opinions is null or r.opinion = any(p_opinions))
      and (p_tp_changes is null or r.target_price_change = any(p_tp_changes))
      and (
        p_stock is null
        or lower(r.stock_name) like '%' || lower(p_stock) || '%'
        or lower(coalesce(r.gicode, '')) like '%' || lower(p_stock) || '%'
      )
      and (
        p_author is null
        or lower(coalesce(r.author, '')) like '%' || lower(p_author) || '%'
      )
      and (
        p_keyword is null
        or lower(r.title) like '%' || lower(p_keyword) || '%'
        or lower(r.stock_name) like '%' || lower(p_keyword) || '%'
        or lower(r.summary::text) like '%' || lower(p_keyword) || '%'
      )
  ),
  stock_rank as (
    select stock_name as name, min(gicode) as gicode, count(*)::int as count
    from filtered
    where stock_name is not null
    group by stock_name
    order by count(*) desc, stock_name
    limit 50
  ),
  provider_rank as (
    select provider as name, null::text as gicode, count(*)::int as count
    from filtered
    where provider is not null
    group by provider
    order by count(*) desc, provider
    limit 50
  ),
  author_rank as (
    select author as name, null::text as gicode, count(*)::int as count
    from filtered
    where author is not null
    group by author
    order by count(*) desc, author
    limit 50
  ),
  month_dist as (
    select to_char(report_date, 'YYYY-MM') as name, count(*)::int as count
    from filtered
    group by to_char(report_date, 'YYYY-MM')
    order by name
  ),
  target_change_dist as (
    select coalesce(target_price_change, '(없음)') as name, count(*)::int as count
    from filtered
    group by coalesce(target_price_change, '(없음)')
    order by count(*) desc, name
    limit 10
  ),
  opinion_dist as (
    select coalesce(opinion, '(없음)') as name, count(*)::int as count
    from filtered
    group by coalesce(opinion, '(없음)')
    order by count(*) desc, name
    limit 12
  ),
  target_acc as (
    select
      stock_name as name,
      min(gicode) as gicode,
      count(*) filter (where target_price_change = '상향')::int as up,
      count(*) filter (where target_price_change = '유지')::int as hold,
      count(*) filter (where target_price_change = '하향')::int as down,
      count(*) filter (where target_price_change = '신규')::int as neu,
      count(*) filter (where target_price_change in ('상향','유지','하향','신규'))::int as total
    from filtered
    group by stock_name
  ),
  opinion_acc as (
    select
      stock_name as name,
      min(gicode) as gicode,
      count(*) filter (where opinion_change = '상향')::int as up,
      count(*) filter (where opinion_change = '유지')::int as hold,
      count(*) filter (where opinion_change = '하향')::int as down,
      count(*) filter (where opinion_change = '신규')::int as neu,
      count(*) filter (where opinion_change in ('상향','유지','하향','신규'))::int as total
    from filtered
    group by stock_name
  ),
  target_rank_base as (
    select
      name, gicode, up, hold, down, neu, total,
      case when total > 0 then up::numeric / total * 100 else 0 end as up_pct,
      case when total > 0 then down::numeric / total * 100 else 0 end as down_pct
    from target_acc
    where total >= 3
  ),
  opinion_rank_base as (
    select
      name, gicode, up, hold, down, neu, total,
      case when total > 0 then up::numeric / total * 100 else 0 end as up_pct,
      case when total > 0 then down::numeric / total * 100 else 0 end as down_pct
    from opinion_acc
    where total >= 3
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
    'total', (select count(*)::int from filtered),
    'stocks', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', count, 'gicode', gicode)) from stock_rank), '[]'::jsonb),
    'providers', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', count, 'gicode', gicode)) from provider_rank), '[]'::jsonb),
    'authors', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', count, 'gicode', gicode)) from author_rank), '[]'::jsonb),
    'months', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', count)) from month_dist), '[]'::jsonb),
    'targetPriceChanges', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', count)) from target_change_dist), '[]'::jsonb),
    'opinions', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', count)) from opinion_dist), '[]'::jsonb),
    'rank', jsonb_build_object(
      'targetUp', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'gicode', gicode, 'up', up, 'hold', hold, 'down', down, 'neu', neu, 'total', total, 'upPct', up_pct, 'downPct', down_pct)) from target_up), '[]'::jsonb),
      'targetDown', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'gicode', gicode, 'up', up, 'hold', hold, 'down', down, 'neu', neu, 'total', total, 'upPct', up_pct, 'downPct', down_pct)) from target_down), '[]'::jsonb),
      'opinionUp', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'gicode', gicode, 'up', up, 'hold', hold, 'down', down, 'neu', neu, 'total', total, 'upPct', up_pct, 'downPct', down_pct)) from opinion_up), '[]'::jsonb),
      'opinionDown', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'gicode', gicode, 'up', up, 'hold', hold, 'down', down, 'neu', neu, 'total', total, 'upPct', up_pct, 'downPct', down_pct)) from opinion_down), '[]'::jsonb)
    )
  );
$$;
