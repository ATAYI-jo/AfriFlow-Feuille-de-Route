-- Optional commercial facts, shown only when an administrator provides them.
-- Existing products remain unchanged and retain their current public display.
alter table public.afriflow_market_products
  add column if not exists compare_at_price numeric(12,2),
  add column if not exists minimum_order_quantity integer,
  add column if not exists origin_country text,
  add column if not exists delivery_info text,
  add column if not exists promotion_label text;

alter table public.afriflow_market_products
  drop constraint if exists afriflow_market_products_compare_at_price_check,
  add constraint afriflow_market_products_compare_at_price_check
    check (compare_at_price is null or price is null or compare_at_price > price),
  drop constraint if exists afriflow_market_products_minimum_order_quantity_check,
  add constraint afriflow_market_products_minimum_order_quantity_check
    check (minimum_order_quantity is null or minimum_order_quantity >= 1),
  drop constraint if exists afriflow_market_products_origin_country_length_check,
  add constraint afriflow_market_products_origin_country_length_check
    check (origin_country is null or char_length(trim(origin_country)) between 2 and 80),
  drop constraint if exists afriflow_market_products_delivery_info_length_check,
  add constraint afriflow_market_products_delivery_info_length_check
    check (delivery_info is null or char_length(trim(delivery_info)) between 2 and 160),
  drop constraint if exists afriflow_market_products_promotion_label_length_check,
  add constraint afriflow_market_products_promotion_label_length_check
    check (promotion_label is null or char_length(trim(promotion_label)) between 2 and 40);
