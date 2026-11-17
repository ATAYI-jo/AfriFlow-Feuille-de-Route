-- AfriFloW Market: additive marketplace data model.
-- Existing collaboration accounts are seeded as collaborators; no new request
-- can grant a collaboration role or editing rights.

create table if not exists public.afriflow_market_products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 160),
  description text not null default '' check (char_length(description) <= 4000),
  category text not null default 'Découvrir' check (char_length(trim(category)) between 2 and 80),
  price numeric(12,2),
  currency text not null default 'XOF' check (currency ~ '^[A-Z]{3}$'),
  original_path text not null check (original_path like '/%'),
  is_active boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.afriflow_market_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.afriflow_market_products(id) on delete cascade,
  storage_path text not null check (storage_path like '/%'),
  source text not null default 'manual' check (source in ('original','manual','ai')),
  approval_status text not null default 'pending' check (approval_status in ('pending','approved','rejected')),
  prompt text check (char_length(prompt) <= 2000),
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.afriflow_market_variant_jobs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.afriflow_market_products(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  prompt text not null check (char_length(trim(prompt)) between 8 and 2000),
  status text not null default 'queued' check (status in ('queued','configuration_missing','processing','ready','failed')),
  error_message text check (char_length(error_message) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.afriflow_market_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  requested_role text not null default 'client' check (requested_role in ('client','shareholder','partner')),
  access_mode text not null default 'client' check (access_mode in ('client','shareholder_pending','partner_waiting','collaborator')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists afriflow_market_products_active_created_idx
  on public.afriflow_market_products (is_active, created_at desc);
create index if not exists afriflow_market_variants_product_approval_idx
  on public.afriflow_market_variants (product_id, approval_status, created_at);
create index if not exists afriflow_market_variant_jobs_product_created_idx
  on public.afriflow_market_variant_jobs (product_id, created_at desc);

alter table public.afriflow_market_products enable row level security;
alter table public.afriflow_market_variants enable row level security;
alter table public.afriflow_market_variant_jobs enable row level security;
alter table public.afriflow_market_profiles enable row level security;

-- Existing accounts keep their current collaborative experience. New accounts
-- receive a profile only from the authenticated client flow below.
insert into public.afriflow_market_profiles (user_id, requested_role, access_mode)
select u.id, 'client', 'collaborator'
from auth.users u
join public.afriflow_state s on s.key = 'user:' || lower(u.email)
on conflict (user_id) do nothing;

create or replace function public.afriflow_market_profile_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.requested_role := coalesce(nullif(new.requested_role, ''), 'client');
  if new.requested_role not in ('client', 'shareholder', 'partner') then
    raise exception 'Role Market invalide';
  end if;

  -- A visitor's declared role is an intent only. It can never create a
  -- collaborator account or any of the application grants.
  if tg_op = 'UPDATE' and old.access_mode = 'collaborator' then
    new.access_mode := 'collaborator';
  elsif new.requested_role = 'client' then
    new.access_mode := 'client';
  elsif new.requested_role = 'shareholder' then
    new.access_mode := 'shareholder_pending';
  else
    new.access_mode := 'partner_waiting';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists afriflow_market_profile_guard on public.afriflow_market_profiles;
create trigger afriflow_market_profile_guard
before insert or update on public.afriflow_market_profiles
for each row execute function public.afriflow_market_profile_guard();

create or replace function public.afriflow_market_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists afriflow_market_products_touch on public.afriflow_market_products;
create trigger afriflow_market_products_touch
before update on public.afriflow_market_products
for each row execute function public.afriflow_market_touch_updated_at();
drop trigger if exists afriflow_market_variants_touch on public.afriflow_market_variants;
create trigger afriflow_market_variants_touch
before update on public.afriflow_market_variants
for each row execute function public.afriflow_market_touch_updated_at();
drop trigger if exists afriflow_market_variant_jobs_touch on public.afriflow_market_variant_jobs;
create trigger afriflow_market_variant_jobs_touch
before update on public.afriflow_market_variant_jobs
for each row execute function public.afriflow_market_touch_updated_at();

-- Public visitors see only catalogued products. Dropbox paths do not contain
-- credentials; the signed/temporary file link is created server-side only.
create policy "af_market_catalog_public_read" on public.afriflow_market_products
  for select to anon, authenticated using (is_active = true);
create policy "af_market_products_admin_all" on public.afriflow_market_products
  for all to authenticated using ((select public.af_is_admin())) with check ((select public.af_is_admin()));
create policy "af_market_variants_admin_all" on public.afriflow_market_variants
  for all to authenticated using ((select public.af_is_admin())) with check ((select public.af_is_admin()));
create policy "af_market_jobs_admin_all" on public.afriflow_market_variant_jobs
  for all to authenticated using ((select public.af_is_admin())) with check ((select public.af_is_admin()));
create policy "af_market_profiles_own_or_admin_read" on public.afriflow_market_profiles
  for select to authenticated using ((select auth.uid()) = user_id or (select public.af_is_admin()));
create policy "af_market_profiles_own_insert" on public.afriflow_market_profiles
  for insert to authenticated with check ((select auth.uid()) = user_id and access_mode <> 'collaborator');
create policy "af_market_profiles_own_update" on public.afriflow_market_profiles
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "af_market_profiles_admin_update" on public.afriflow_market_profiles
  for update to authenticated using ((select public.af_is_admin())) with check ((select public.af_is_admin()));

grant select on public.afriflow_market_products to anon, authenticated;
grant select, insert, update, delete on public.afriflow_market_products to authenticated;
grant select, insert, update, delete on public.afriflow_market_variants to authenticated;
grant select, insert, update, delete on public.afriflow_market_variant_jobs to authenticated;
grant select, insert, update on public.afriflow_market_profiles to authenticated;
