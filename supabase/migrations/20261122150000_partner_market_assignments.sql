-- Assign each commercial partner to a real destination market (not product origin).
-- Only verified AfriFloW administrators may read/write these assignments.
create table if not exists public.afriflow_partner_markets(
 partner_user_id uuid primary key references auth.users(id) on delete cascade,
 market_name text not null check(char_length(trim(market_name)) between 2 and 80),
 updated_at timestamptz not null default now(),
 assigned_by uuid references auth.users(id)
);
alter table public.afriflow_partner_markets enable row level security;
revoke all on public.afriflow_partner_markets from anon;
grant select,insert,update on public.afriflow_partner_markets to authenticated;
create policy af_partner_markets_admin_select on public.afriflow_partner_markets
 for select to authenticated using ((select afriflow_private.is_admin()));
create policy af_partner_markets_admin_insert on public.afriflow_partner_markets
 for insert to authenticated
 with check ((select afriflow_private.is_admin()) and assigned_by=(select auth.uid()));
create policy af_partner_markets_admin_update on public.afriflow_partner_markets
 for update to authenticated
 using ((select afriflow_private.is_admin()))
 with check ((select afriflow_private.is_admin()) and assigned_by=(select auth.uid()));
