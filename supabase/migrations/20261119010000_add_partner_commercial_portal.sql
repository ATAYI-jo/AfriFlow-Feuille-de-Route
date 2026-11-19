-- AfriFloW commercial partner portal.
-- Partners are enabled manually by AfriFloW; all commercial calculations are
-- captured server-side by the partner Edge Function.

create table if not exists public.afriflow_partner_terms (
  partner_user_id uuid primary key references auth.users(id) on delete cascade,
  commission_rate numeric(5,2) not null default 0 check (commission_rate >= 0 and commission_rate <= 100),
  is_enabled boolean not null default false,
  payment_notes text not null default '' check (char_length(payment_notes) <= 1200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.afriflow_partner_orders (
  id uuid primary key default gen_random_uuid(),
  partner_user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.afriflow_market_products(id) on delete restrict,
  quantity_requested integer not null check (quantity_requested between 1 and 1000000),
  unit_price numeric(12,2),
  currency text not null default 'XOF' check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'requested' check (status in ('requested', 'approved', 'supplied', 'rejected', 'closed')),
  note text not null default '' check (char_length(note) <= 1200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.afriflow_partner_sales_reports (
  id uuid primary key default gen_random_uuid(),
  partner_user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid not null references public.afriflow_partner_orders(id) on delete restrict,
  product_id uuid not null references public.afriflow_market_products(id) on delete restrict,
  quantity_sold integer not null check (quantity_sold between 1 and 1000000),
  unit_sale_price numeric(12,2) not null check (unit_sale_price >= 0),
  gross_amount numeric(14,2) not null check (gross_amount >= 0),
  commission_rate numeric(5,2) not null check (commission_rate >= 0 and commission_rate <= 100),
  afriflow_amount numeric(14,2) not null check (afriflow_amount >= 0),
  partner_net_amount numeric(14,2) not null check (partner_net_amount >= 0),
  currency text not null default 'XOF' check (currency ~ '^[A-Z]{3}$'),
  note text not null default '' check (char_length(note) <= 1200),
  status text not null default 'pending_review' check (status in ('pending_review', 'validated', 'settled', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (partner_net_amount + afriflow_amount = gross_amount)
);

create index if not exists af_partner_orders_partner_status_created_idx
  on public.afriflow_partner_orders (partner_user_id, status, created_at desc);
create index if not exists af_partner_orders_product_idx
  on public.afriflow_partner_orders (product_id);
create index if not exists af_partner_sales_partner_status_created_idx
  on public.afriflow_partner_sales_reports (partner_user_id, status, created_at desc);
create index if not exists af_partner_sales_order_idx
  on public.afriflow_partner_sales_reports (order_id);
create index if not exists af_partner_sales_product_idx
  on public.afriflow_partner_sales_reports (product_id);

alter table public.afriflow_partner_terms enable row level security;
alter table public.afriflow_partner_orders enable row level security;
alter table public.afriflow_partner_sales_reports enable row level security;

create policy "af_partner_terms_own_or_admin_read" on public.afriflow_partner_terms
  for select to authenticated
  using ((select auth.uid()) = partner_user_id or (select public.af_is_admin()));
create policy "af_partner_orders_own_or_admin_read" on public.afriflow_partner_orders
  for select to authenticated
  using ((select auth.uid()) = partner_user_id or (select public.af_is_admin()));
create policy "af_partner_sales_own_or_admin_read" on public.afriflow_partner_sales_reports
  for select to authenticated
  using ((select auth.uid()) = partner_user_id or (select public.af_is_admin()));

drop trigger if exists afriflow_partner_terms_touch on public.afriflow_partner_terms;
create trigger afriflow_partner_terms_touch before update on public.afriflow_partner_terms
  for each row execute function public.afriflow_market_touch_updated_at();
drop trigger if exists afriflow_partner_orders_touch on public.afriflow_partner_orders;
create trigger afriflow_partner_orders_touch before update on public.afriflow_partner_orders
  for each row execute function public.afriflow_market_touch_updated_at();
drop trigger if exists afriflow_partner_sales_touch on public.afriflow_partner_sales_reports;
create trigger afriflow_partner_sales_touch before update on public.afriflow_partner_sales_reports
  for each row execute function public.afriflow_market_touch_updated_at();

grant select on public.afriflow_partner_terms, public.afriflow_partner_orders, public.afriflow_partner_sales_reports to authenticated;
