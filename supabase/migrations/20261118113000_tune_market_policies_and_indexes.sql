-- Follow-up: cover Market foreign keys and avoid overlapping permissive RLS policies.

create index if not exists afriflow_market_products_created_by_idx
  on public.afriflow_market_products (created_by);
create index if not exists afriflow_market_variants_approved_by_idx
  on public.afriflow_market_variants (approved_by);
create index if not exists afriflow_market_variant_jobs_requested_by_idx
  on public.afriflow_market_variant_jobs (requested_by);

drop policy if exists "af_market_catalog_public_read" on public.afriflow_market_products;
drop policy if exists "af_market_products_admin_all" on public.afriflow_market_products;
create policy "af_market_catalog_anon_read" on public.afriflow_market_products
  for select to anon using (is_active = true);
create policy "af_market_catalog_authenticated_read" on public.afriflow_market_products
  for select to authenticated using (is_active = true or (select public.af_is_admin()));
create policy "af_market_products_admin_insert" on public.afriflow_market_products
  for insert to authenticated with check ((select public.af_is_admin()));
create policy "af_market_products_admin_update" on public.afriflow_market_products
  for update to authenticated using ((select public.af_is_admin())) with check ((select public.af_is_admin()));
create policy "af_market_products_admin_delete" on public.afriflow_market_products
  for delete to authenticated using ((select public.af_is_admin()));

drop policy if exists "af_market_profiles_own_update" on public.afriflow_market_profiles;
drop policy if exists "af_market_profiles_admin_update" on public.afriflow_market_profiles;
create policy "af_market_profiles_own_or_admin_update" on public.afriflow_market_profiles
  for update to authenticated
  using ((select auth.uid()) = user_id or (select public.af_is_admin()))
  with check ((select auth.uid()) = user_id or (select public.af_is_admin()));
