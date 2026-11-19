-- Separate editorial announcements from commercial product listings.
alter table public.afriflow_market_products
  add column if not exists listing_type text not null default 'product'
  check (listing_type in ('product', 'announcement'));

create index if not exists afriflow_market_products_listing_active_created_idx
  on public.afriflow_market_products (listing_type, is_active, created_at desc);
