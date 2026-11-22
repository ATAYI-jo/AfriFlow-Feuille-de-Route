-- Private server-issued shareholder / partner certificates.
-- This table is intentionally inaccessible through public PostgREST.
create table if not exists public.afriflow_certificates (
 id uuid primary key default gen_random_uuid(),
 holder_user_id uuid not null references auth.users(id) on delete cascade,
 certificate_type text not null check(certificate_type in ('partner','shareholder')),
 holder_name text not null check(char_length(trim(holder_name)) between 3 and 160),
 market_name text,
 issued_at timestamptz not null default now(),
 issued_by uuid not null references auth.users(id),
 verification_token text not null unique check(char_length(verification_token) between 48 and 128),
 status text not null default 'active' check(status in ('active','revoked')),
 revoked_at timestamptz,
 revoked_by uuid references auth.users(id),
 revocation_reason text,
 legal_evidence_confirmed boolean not null default false,
 constraint certificate_market_required check (
 (certificate_type='partner' and market_name is not null and char_length(trim(market_name))>=2)
 or (certificate_type='shareholder' and market_name is null)),
 constraint certificate_shareholder_evidence check (certificate_type='partner' or legal_evidence_confirmed=true)
);
create unique index if not exists af_certificate_one_active_per_type
 on public.afriflow_certificates(holder_user_id,certificate_type) where status='active';
alter table public.afriflow_certificates enable row level security;
revoke all on public.afriflow_certificates from anon,authenticated,public;
comment on table public.afriflow_certificates is 'Server-only certificate registry: read and write through guarded Edge Function. Verification bearer token must not leak via PostgREST.';
