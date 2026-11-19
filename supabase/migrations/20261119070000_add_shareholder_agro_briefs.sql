-- Daily AI agro-food briefings: visible only to approved shareholders and administrators.
-- Briefings expire after seven days; no customer, partner or public visitor can read them.

alter table public.afriflow_market_products
  alter column original_path drop not null,
  add column if not exists audience text not null default 'public'
    check (audience in ('public', 'shareholders')),
  add column if not exists expires_at timestamptz,
  add column if not exists news_sources jsonb not null default '[]'::jsonb;

alter table public.afriflow_market_products
  drop constraint if exists afriflow_market_products_announcement_media_check,
  add constraint afriflow_market_products_announcement_media_check
    check (listing_type = 'announcement' or original_path is not null);

create index if not exists afriflow_market_products_audience_expiry_idx
  on public.afriflow_market_products (audience, is_active, expires_at, created_at desc);

drop policy if exists "af_market_catalog_anon_read" on public.afriflow_market_products;
drop policy if exists "af_market_catalog_authenticated_read" on public.afriflow_market_products;

create policy "af_market_catalog_anon_read" on public.afriflow_market_products
  for select to anon
  using (
    is_active = true
    and audience = 'public'
    and (expires_at is null or expires_at > now())
  );

create policy "af_market_catalog_authenticated_read" on public.afriflow_market_products
  for select to authenticated
  using (
    (select public.af_is_admin())
    or (
      is_active = true
      and (expires_at is null or expires_at > now())
      and (
        audience = 'public'
        or exists (
          select 1
          from public.afriflow_market_profiles profile
          where profile.user_id = (select auth.uid())
            and profile.access_mode = 'shareholder_approved'
        )
      )
    )
  );
