alter table public.reports
  add column if not exists previous_6m numeric,
  add column if not exists previous_1y numeric;

create index if not exists reports_previous_6m_idx on public.reports (previous_6m);
create index if not exists reports_previous_1y_idx on public.reports (previous_1y);
create index if not exists reports_actual_6m_idx on public.reports (actual_6m);
create index if not exists reports_actual_1y_idx on public.reports (actual_1y);

create or replace function public.update_report_actual_prices(
  p_from date default null,
  p_to date default null,
  p_overwrite boolean default false
)
returns jsonb
language plpgsql
security definer
as $$
declare
  result jsonb;
begin
  with candidates as (
    select
      r.id,
      before_six.close_price as next_previous_6m,
      before_one_year.close_price as next_previous_1y,
      after_six.close_price as next_actual_6m,
      after_one_year.close_price as next_actual_1y
    from public.reports r
    left join lateral (
      select sp.close_price
      from public.stock_prices sp
      where sp.gicode = r.gicode
        and sp.price_date <= (r.report_date - interval '6 months')::date
        and sp.price_date >= (r.report_date - interval '6 months' - interval '14 days')::date
      order by sp.price_date desc
      limit 1
    ) before_six on true
    left join lateral (
      select sp.close_price
      from public.stock_prices sp
      where sp.gicode = r.gicode
        and sp.price_date <= (r.report_date - interval '1 year')::date
        and sp.price_date >= (r.report_date - interval '1 year' - interval '14 days')::date
      order by sp.price_date desc
      limit 1
    ) before_one_year on true
    left join lateral (
      select sp.close_price
      from public.stock_prices sp
      where sp.gicode = r.gicode
        and sp.price_date >= (r.report_date + interval '6 months')::date
        and sp.price_date <= (r.report_date + interval '6 months' + interval '14 days')::date
      order by sp.price_date
      limit 1
    ) after_six on true
    left join lateral (
      select sp.close_price
      from public.stock_prices sp
      where sp.gicode = r.gicode
        and sp.price_date >= (r.report_date + interval '1 year')::date
        and sp.price_date <= (r.report_date + interval '1 year' + interval '14 days')::date
      order by sp.price_date
      limit 1
    ) after_one_year on true
    where r.gicode is not null
      and (p_from is null or r.report_date >= p_from)
      and (p_to is null or r.report_date <= p_to)
  ),
  updates as (
    update public.reports r
    set
      previous_6m = case
        when c.next_previous_6m is not null and (p_overwrite or r.previous_6m is null) then c.next_previous_6m
        else r.previous_6m
      end,
      previous_1y = case
        when c.next_previous_1y is not null and (p_overwrite or r.previous_1y is null) then c.next_previous_1y
        else r.previous_1y
      end,
      actual_6m = case
        when c.next_actual_6m is not null and (p_overwrite or r.actual_6m is null) then c.next_actual_6m
        else r.actual_6m
      end,
      actual_1y = case
        when c.next_actual_1y is not null and (p_overwrite or r.actual_1y is null) then c.next_actual_1y
        else r.actual_1y
      end
    from candidates c
    where r.id = c.id
      and (
        (c.next_previous_6m is not null and (p_overwrite or r.previous_6m is null) and r.previous_6m is distinct from c.next_previous_6m)
        or
        (c.next_previous_1y is not null and (p_overwrite or r.previous_1y is null) and r.previous_1y is distinct from c.next_previous_1y)
        or
        (c.next_actual_6m is not null and (p_overwrite or r.actual_6m is null) and r.actual_6m is distinct from c.next_actual_6m)
        or
        (c.next_actual_1y is not null and (p_overwrite or r.actual_1y is null) and r.actual_1y is distinct from c.next_actual_1y)
      )
    returning
      r.id,
      r.previous_6m,
      r.previous_1y,
      r.actual_6m,
      r.actual_1y
  )
  select jsonb_build_object(
    'matchedReports', (select count(*) from candidates),
    'availablePrevious6m', (select count(*) from candidates where next_previous_6m is not null),
    'availablePrevious1y', (select count(*) from candidates where next_previous_1y is not null),
    'available6m', (select count(*) from candidates where next_actual_6m is not null),
    'available1y', (select count(*) from candidates where next_actual_1y is not null),
    'updatedReports', (select count(*) from updates),
    'filledPrevious6m', (select count(*) from updates where previous_6m is not null),
    'filledPrevious1y', (select count(*) from updates where previous_1y is not null),
    'filled6m', (select count(*) from updates where actual_6m is not null),
    'filled1y', (select count(*) from updates where actual_1y is not null)
  )
  into result;

  return result;
end;
$$;

drop function if exists public.search_reports(
  date,
  date,
  text,
  text,
  text,
  text,
  text[],
  text[],
  boolean,
  boolean,
  integer,
  integer,
  text,
  text
);

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
  p_dir text default 'desc',
  p_price_basis text default 'after'
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
      case when lower(coalesce(p_dir, 'desc')) = 'asc' then 'asc' else 'desc' end as sort_dir,
      case when lower(coalesce(p_price_basis, 'after')) = 'before' then 'before' else 'after' end as price_basis
  ),
  filtered as (
    select
      r.*,
      case when (select price_basis from params) = 'before' then r.previous_6m else r.actual_6m end as basis_6m,
      case when (select price_basis from params) = 'before' then r.previous_1y else r.actual_1y end as basis_1y
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
      count(*) filter (where target_price is not null and basis_6m is not null and basis_6m >= target_price * 0.9)::int as hit,
      count(*) filter (where target_price is not null and basis_6m is not null)::int as hit_total,
      avg((basis_6m / nullif(prev_close, 0) - 1) * 100) filter (where basis_6m is not null and prev_close is not null and prev_close <> 0) as avg_return_6m
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
      case when p.sort_col = 'actual_6m' and p.sort_dir = 'asc' then f.basis_6m end asc nulls last,
      case when p.sort_col = 'actual_6m' and p.sort_dir = 'desc' then f.basis_6m end desc nulls last,
      case when p.sort_col = 'actual_1y' and p.sort_dir = 'asc' then f.basis_1y end asc nulls last,
      case when p.sort_col = 'actual_1y' and p.sort_dir = 'desc' then f.basis_1y end desc nulls last,
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
          'actual_6m', basis_6m,
          'actual_1y', basis_1y,
          'previous_6m', previous_6m,
          'previous_1y', previous_1y,
          'actual_6m_after', actual_6m,
          'actual_1y_after', actual_1y,
          'price_basis', (select price_basis from params),
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

create or replace function public.dashboard_health_check()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'reportsCount', (select count(*)::int from public.reports),
    'searchReportsRpcReady', to_regprocedure('public.search_reports(date,date,text,text,text,text,text[],text[],boolean,boolean,integer,integer,text,text,text)') is not null,
    'reportAnalyticsRpcReady', to_regprocedure('public.report_analytics(date,date,text,text,text,text,text[],text[],boolean,boolean)') is not null
  );
$$;
