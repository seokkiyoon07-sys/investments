create index if not exists reports_gicode_report_date_idx on public.reports (gicode, report_date);

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
      r.actual_6m as current_6m,
      r.actual_1y as current_1y,
      six.close_price as next_6m,
      one_year.close_price as next_1y
    from public.reports r
    left join lateral (
      select sp.close_price
      from public.stock_prices sp
      where sp.gicode = r.gicode
        and sp.price_date >= (r.report_date + interval '6 months')::date
        and sp.price_date <= (r.report_date + interval '6 months' + interval '14 days')::date
      order by sp.price_date
      limit 1
    ) six on true
    left join lateral (
      select sp.close_price
      from public.stock_prices sp
      where sp.gicode = r.gicode
        and sp.price_date >= (r.report_date + interval '1 year')::date
        and sp.price_date <= (r.report_date + interval '1 year' + interval '14 days')::date
      order by sp.price_date
      limit 1
    ) one_year on true
    where r.gicode is not null
      and (p_from is null or r.report_date >= p_from)
      and (p_to is null or r.report_date <= p_to)
  ),
  updates as (
    update public.reports r
    set
      actual_6m = case
        when c.next_6m is not null and (p_overwrite or r.actual_6m is null) then c.next_6m
        else r.actual_6m
      end,
      actual_1y = case
        when c.next_1y is not null and (p_overwrite or r.actual_1y is null) then c.next_1y
        else r.actual_1y
      end
    from candidates c
    where r.id = c.id
      and (
        (c.next_6m is not null and (p_overwrite or r.actual_6m is null) and r.actual_6m is distinct from c.next_6m)
        or
        (c.next_1y is not null and (p_overwrite or r.actual_1y is null) and r.actual_1y is distinct from c.next_1y)
      )
    returning
      r.id,
      r.actual_6m,
      r.actual_1y
  )
  select jsonb_build_object(
    'matchedReports', (select count(*) from candidates),
    'available6m', (select count(*) from candidates where next_6m is not null),
    'available1y', (select count(*) from candidates where next_1y is not null),
    'updatedReports', (select count(*) from updates),
    'filled6m', (select count(*) from updates where actual_6m is not null),
    'filled1y', (select count(*) from updates where actual_1y is not null)
  )
  into result;

  return result;
end;
$$;
