create extension if not exists pg_trgm;

create table if not exists public.reports (
  id bigserial primary key,
  source_key text not null unique,
  report_date date not null,
  gicode text,
  stock_name text not null,
  title text not null,
  summary jsonb not null default '[]'::jsonb,
  opinion text,
  opinion_change text,
  target_price numeric,
  target_price_change text,
  prev_close numeric,
  provider text,
  author text,
  is_best boolean not null default false,
  actual_6m numeric,
  actual_1y numeric,
  naver_url text,
  hankyung_url text,
  newspim_url text,
  inserted_at timestamptz not null default now()
);

create table if not exists public.stock_prices (
  id bigserial primary key,
  gicode text not null,
  price_date date not null,
  open_price numeric,
  high_price numeric,
  low_price numeric,
  close_price numeric not null,
  volume numeric,
  foreign_ownership_rate numeric,
  source text not null default 'naver',
  inserted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (gicode, price_date)
);

create index if not exists reports_report_date_idx on public.reports (report_date desc);
create index if not exists reports_gicode_idx on public.reports (gicode);
create index if not exists reports_stock_name_idx on public.reports (stock_name);
create index if not exists reports_provider_idx on public.reports (provider);
create index if not exists reports_author_idx on public.reports (author);
create index if not exists reports_opinion_idx on public.reports (opinion);
create index if not exists reports_target_price_change_idx on public.reports (target_price_change);
create index if not exists reports_is_best_idx on public.reports (is_best);
create index if not exists stock_prices_gicode_date_idx on public.stock_prices (gicode, price_date);

create index if not exists reports_stock_name_trgm_idx
  on public.reports using gin (stock_name gin_trgm_ops);

create index if not exists reports_title_trgm_idx
  on public.reports using gin (title gin_trgm_ops);

create index if not exists reports_summary_gin_idx
  on public.reports using gin (summary);

create or replace view public.report_filter_options as
select
  (select count(*) from public.reports) as report_count,
  (select count(distinct coalesce(gicode, stock_name)) from public.reports) as stock_count,
  (select count(distinct provider) from public.reports where provider is not null) as provider_count,
  (select count(distinct author) from public.reports where author is not null) as author_count,
  (select min(report_date) from public.reports) as min_report_date,
  (select max(report_date) from public.reports) as max_report_date;

alter table public.reports enable row level security;
alter table public.stock_prices enable row level security;
