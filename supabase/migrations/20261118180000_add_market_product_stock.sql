-- Products remain visible when unavailable, but cannot receive a new quote.
alter table public.afriflow_market_products
  add column if not exists is_in_stock boolean not null default true;

create index if not exists afriflow_market_products_active_stock_created_idx
  on public.afriflow_market_products (is_active, is_in_stock, created_at desc);
