-- Admin-only partner activity stream: requests, sales and disputes.
create table if not exists public.afriflow_partner_events (
 id uuid primary key default gen_random_uuid(),
 partner_user_id uuid not null references auth.users(id) on delete cascade,
 source_type text not null check(source_type in ('order','sale','dispute')),
 source_id uuid not null,
 created_at timestamptz not null default now(),
 unique(source_type,source_id)
);
create index if not exists af_partner_events_partner_idx on public.afriflow_partner_events(partner_user_id,created_at desc);
alter table public.afriflow_partner_events enable row level security;
grant select on public.afriflow_partner_events to authenticated;
drop policy if exists admin_only_partner_events on public.afriflow_partner_events;
create policy admin_only_partner_events on public.afriflow_partner_events for select to authenticated
 using ((select afriflow_private.is_admin()));
create table if not exists public.afriflow_partner_event_reads (
 event_id uuid not null references public.afriflow_partner_events(id) on delete cascade,
 admin_user_id uuid not null references auth.users(id) on delete cascade,
 seen_at timestamptz not null default now(),
 primary key(event_id,admin_user_id)
);
alter table public.afriflow_partner_event_reads enable row level security;
grant select,insert on public.afriflow_partner_event_reads to authenticated;
drop policy if exists admin_read_own_seen on public.afriflow_partner_event_reads;
create policy admin_read_own_seen on public.afriflow_partner_event_reads for select to authenticated
 using(admin_user_id=(select auth.uid()) and (select afriflow_private.is_admin()));
drop policy if exists admin_mark_own_seen on public.afriflow_partner_event_reads;
create policy admin_mark_own_seen on public.afriflow_partner_event_reads for insert to authenticated
 with check(admin_user_id=(select auth.uid()) and (select afriflow_private.is_admin()));
create or replace function public.afriflow_capture_partner_event() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into public.afriflow_partner_events(partner_user_id,source_type,source_id)
 values(new.partner_user_id,TG_ARGV[0],new.id)
 on conflict(source_type,source_id) do nothing;
 return new;
end $$;
drop trigger if exists af_partner_order_event on public.afriflow_partner_orders;
create trigger af_partner_order_event after insert on public.afriflow_partner_orders
 for each row execute function public.afriflow_capture_partner_event('order');
drop trigger if exists af_partner_sale_event on public.afriflow_partner_sales_reports;
create trigger af_partner_sale_event after insert on public.afriflow_partner_sales_reports
 for each row execute function public.afriflow_capture_partner_event('sale');
drop trigger if exists af_partner_dispute_event on public.afriflow_partner_disputes;
create trigger af_partner_dispute_event after insert on public.afriflow_partner_disputes
 for each row execute function public.afriflow_capture_partner_event('dispute');
