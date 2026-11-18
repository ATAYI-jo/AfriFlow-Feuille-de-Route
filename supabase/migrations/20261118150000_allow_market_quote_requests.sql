-- Marketplace quote requests: authenticated customers can create only their
-- own request; only an administrator can read requests from all customers.
-- This keeps the rest of afriflow_state private under its existing RLS rules.

create policy "af_market_quote_insert_own"
on public.afriflow_state
for insert to authenticated
with check (
  key like 'quote:%'
  and value ? 'email'
  and lower(coalesce(value ->> 'email', '')) = public.af_email()
);

create policy "af_market_quote_admin_read"
on public.afriflow_state
for select to authenticated
using (
  key like 'quote:%'
  and public.af_is_admin()
);
