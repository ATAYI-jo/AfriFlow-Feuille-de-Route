create table if not exists public.afriflow_cod_routes (
 country_code text primary key check(country_code in ('BF','TG','BJ','CI','SN')),
 seller_user_id uuid not null references auth.users(id),
 seller_name text not null check(length(seller_name) between 2 and 150),
 delivery_fee bigint not null check(delivery_fee between 0 and 1000000),
 enabled boolean not null default false,
 verified_at timestamptz not null default now()
);
create table if not exists public.afriflow_cod_orders (
 id uuid primary key default gen_random_uuid(),
 buyer_user_id uuid not null references auth.users(id),
 request_id uuid not null,
 seller_user_id uuid not null references auth.users(id),
 seller_name text not null,
 country_code text not null,
 customer_name text not null,
 phone text not null,
 address text not null,
 items jsonb not null,
 subtotal bigint not null check(subtotal>0),
 delivery_fee bigint not null check(delivery_fee>=0),
 total bigint generated always as (subtotal+delivery_fee) stored,
 commission_rate numeric not null check(commission_rate between 0 and 100),
 status text not null default 'requested' check(status in ('requested','accepted','delivered','cash_received','cancelled')),
 created_at timestamptz not null default now(),
 accepted_at timestamptz,
 delivered_at timestamptz,
 cash_received_at timestamptz,
 cancelled_at timestamptz,
 unique(buyer_user_id,request_id)
);
alter table public.afriflow_cod_routes enable row level security;
alter table public.afriflow_cod_orders enable row level security;
revoke all on public.afriflow_cod_routes,public.afriflow_cod_orders from anon,authenticated,public;
grant select,insert,update on public.afriflow_cod_routes,public.afriflow_cod_orders to service_role;
create index if not exists afriflow_cod_orders_seller_idx on public.afriflow_cod_orders(seller_user_id,created_at desc);
create index if not exists afriflow_cod_orders_buyer_idx on public.afriflow_cod_orders(buyer_user_id,created_at desc);
