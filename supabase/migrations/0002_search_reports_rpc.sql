create or replace function public.report_options()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'providers',
      coalesce((
        select jsonb_agg(provider order by provider)
        from (select distinct provider from public.reports where provider is not null) p
      ), '[]'::jsonb),
    'opinions',
      coalesce((
        select jsonb_agg(jsonb_build_object('value', opinion, 'count', count) order by count desc, opinion)
        from (
          select opinion, count(*)::int as count
          from public.reports
          where opinion is not null
          group by opinion
        ) o
      ), '[]'::jsonb),
    'tpChanges',
      coalesce((
        select jsonb_agg(target_price_change order by target_price_change)
        from (select distinct target_price_change from public.reports where target_price_change is not null) t
      ), '[]'::jsonb),
    'minDate', (select min(report_date) from public.reports),
    'maxDate', (select max(report_date) from public.reports)
  );
$$;

create or replace function public.search_reports(
  p_from date default null,
  p_to date default null,
  p_keyword text default null,
  p_stock text default null,
  p_provider text default null,
  p_author text default null,
  p_opinions text[] default null,
  p_tp_changes text[] default null,
  p_best_only boolean default false,
  p_has_tp boolean default false,
  p_page integer default 1,
  p_page_size integer default 100,
  p_sort text default 'report_date',
  p_dir text default 'desc'
)
returns jsonb
language sql
stable
as $$
  with params as (
    select
      greatest(coalesce(p_page, 1), 1) as page,
      least(greatest(coalesce(p_page_size, 100), 25), 500) as page_size,
      case
        when p_sort in ('report_date','stock_name','opinion','target_price','prev_close','actual_6m','actual_1y','provider','author') then p_sort
        else 'report_date'
      end as sort_col,
      case when lower(coalesce(p_dir, 'desc')) = 'asc' then 'asc' else 'desc' end as sort_dir
  ),
  filtered as (
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
  counted as (
    select count(*)::int as total
    from filtered
  ),
  stats as (
    select
      count(*)::int as count,
      count(distinct coalesce(gicode, stock_name))::int as stocks,
      count(distinct provider)::int as providers,
      count(distinct author)::int as authors,
      count(*) filter (where target_price is not null and actual_6m is not null and actual_6m >= target_price * 0.9)::int as hit,
      count(*) filter (where target_price is not null and actual_6m is not null)::int as hit_total,
      avg((actual_6m / nullif(prev_close, 0) - 1) * 100) filter (where actual_6m is not null and prev_close is not null and prev_close <> 0) as avg_return_6m
    from filtered
  ),
  paged as (
    select f.*
    from filtered f
    cross join params p
    order by
      case when p.sort_col = 'report_date' and p.sort_dir = 'asc' then f.report_date end asc nulls last,
      case when p.sort_col = 'report_date' and p.sort_dir = 'desc' then f.report_date end desc nulls last,
      case when p.sort_col = 'stock_name' and p.sort_dir = 'asc' then f.stock_name end asc nulls last,
      case when p.sort_col = 'stock_name' and p.sort_dir = 'desc' then f.stock_name end desc nulls last,
      case when p.sort_col = 'opinion' and p.sort_dir = 'asc' then f.opinion end asc nulls last,
      case when p.sort_col = 'opinion' and p.sort_dir = 'desc' then f.opinion end desc nulls last,
      case when p.sort_col = 'provider' and p.sort_dir = 'asc' then f.provider end asc nulls last,
      case when p.sort_col = 'provider' and p.sort_dir = 'desc' then f.provider end desc nulls last,
      case when p.sort_col = 'author' and p.sort_dir = 'asc' then f.author end asc nulls last,
      case when p.sort_col = 'author' and p.sort_dir = 'desc' then f.author end desc nulls last,
      case when p.sort_col = 'target_price' and p.sort_dir = 'asc' then f.target_price end asc nulls last,
      case when p.sort_col = 'target_price' and p.sort_dir = 'desc' then f.target_price end desc nulls last,
      case when p.sort_col = 'prev_close' and p.sort_dir = 'asc' then f.prev_close end asc nulls last,
      case when p.sort_col = 'prev_close' and p.sort_dir = 'desc' then f.prev_close end desc nulls last,
      case when p.sort_col = 'actual_6m' and p.sort_dir = 'asc' then f.actual_6m end asc nulls last,
      case when p.sort_col = 'actual_6m' and p.sort_dir = 'desc' then f.actual_6m end desc nulls last,
      case when p.sort_col = 'actual_1y' and p.sort_dir = 'asc' then f.actual_1y end asc nulls last,
      case when p.sort_col = 'actual_1y' and p.sort_dir = 'desc' then f.actual_1y end desc nulls last,
      f.id desc
    limit (select page_size from params)
    offset (select (page - 1) * page_size from params)
  )
  select jsonb_build_object(
    'rows',
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'source_key', source_key,
          'report_date', report_date,
          'gicode', gicode,
          'stock_name', stock_name,
          'title', title,
          'summary', summary,
          'opinion', opinion,
          'opinion_change', opinion_change,
          'target_price', target_price,
          'target_price_change', target_price_change,
          'prev_close', prev_close,
          'provider', provider,
          'author', author,
          'is_best', is_best,
          'actual_6m', actual_6m,
          'actual_1y', actual_1y,
          'naver_url', naver_url,
          'hankyung_url', hankyung_url,
          'newspim_url', newspim_url
        ))
        from paged
      ), '[]'::jsonb),
    'page', (select page from params),
    'pageSize', (select page_size from params),
    'total', (select total from counted),
    'totalPages', greatest(1, ceil((select total from counted)::numeric / (select page_size from params))::int),
    'stats', (
      select jsonb_build_object(
        'count', count,
        'stocks', stocks,
        'providers', providers,
        'authors', authors,
        'targetHitRate', jsonb_build_object(
          'hit', hit,
          'total', hit_total,
          'pct', case when hit_total > 0 then hit::numeric / hit_total * 100 else null end
        ),
        'avgReturn6m', avg_return_6m
      )
      from stats
    ),
    'options', public.report_options()
  );
$$;
