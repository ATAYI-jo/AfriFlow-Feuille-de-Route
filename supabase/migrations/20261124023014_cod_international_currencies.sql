alter table public.afriflow_cod_routes drop constraint if exists afriflow_cod_routes_country_code_check;
alter table public.afriflow_cod_routes add constraint afriflow_cod_routes_country_code_check check(country_code ~ '^[A-Z]{2}$');
alter table public.afriflow_cod_routes add column if not exists currency text not null default 'XOF' check(currency in ('XOF','XAF','EUR','USD','GBP','CAD','CHF','GHS','NGN','MAD','AUD','JPY','ZAR'));
alter table public.afriflow_cod_orders add column if not exists currency text not null default 'XOF' check(currency in ('XOF','XAF','EUR','USD','GBP','CAD','CHF','GHS','NGN','MAD','AUD','JPY','ZAR'));
comment on column public.afriflow_cod_orders.subtotal is 'Amount in minor units of currency (XOF whole francs, EUR cents).';
comment on column public.afriflow_cod_routes.delivery_fee is 'Amount in minor units of currency.';
