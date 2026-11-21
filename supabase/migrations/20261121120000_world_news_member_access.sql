alter table public.afriflow_market_products add column if not exists news_relevance boolean not null default false;
drop policy if exists "af_market_authenticated_agro_briefs_read" on public.afriflow_market_products;
create policy "af_market_authenticated_world_briefs_read" on public.afriflow_market_products for select to authenticated using (
  is_active = true and listing_type = 'announcement'
  and category in ('Veille agroalimentaire','Actualités mondiales')
  and audience = 'shareholders' and promotion_label like 'Brief IA · %'
  and (expires_at is null or expires_at > now())
  and ((select af_is_admin()) or exists (select 1 from public.afriflow_market_profiles member where member.user_id = (select auth.uid())))
);