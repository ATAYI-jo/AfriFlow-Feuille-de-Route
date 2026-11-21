-- Enforce at most one world-news bulletin per UTC day and publishing slot.
create unique index if not exists afriflow_world_news_slot_unique
on public.afriflow_market_products (promotion_label)
where listing_type = 'announcement' and category = 'Actualités mondiales' and promotion_label like 'Brief IA · %';
