-- OAuth refresh tokens are encrypted by the Edge Function before persistence.
-- No browser role can read this table.
create table if not exists public.afriflow_private_integrations (
  key text primary key,
  ciphertext text not null,
  iv text not null,
  updated_at timestamptz not null default now()
);

alter table public.afriflow_private_integrations enable row level security;
revoke all on table public.afriflow_private_integrations from anon, authenticated;
