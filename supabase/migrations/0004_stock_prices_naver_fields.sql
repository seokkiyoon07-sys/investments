alter table public.stock_prices
  add column if not exists open_price numeric,
  add column if not exists high_price numeric,
  add column if not exists low_price numeric,
  add column if not exists volume numeric,
  add column if not exists foreign_ownership_rate numeric,
  add column if not exists source text not null default 'naver',
  add column if not exists updated_at timestamptz not null default now();

create index if not exists stock_prices_price_date_idx on public.stock_prices (price_date desc);
