-- Keep asynchronous AI-Horde requests durable.  The identifiers are server-only
-- and are never exposed to public Marketplace readers.
alter table public.afriflow_market_variant_jobs
  add column if not exists provider text not null default 'legacy'
    check (provider in ('legacy', 'ai_horde')),
  add column if not exists provider_request_id text,
  add column if not exists completed_variant_id uuid references public.afriflow_market_variants(id) on delete set null;

create unique index if not exists afriflow_market_variant_jobs_provider_request_id_key
  on public.afriflow_market_variant_jobs (provider, provider_request_id)
  where provider_request_id is not null;

create index if not exists afriflow_market_variant_jobs_pending_idx
  on public.afriflow_market_variant_jobs (status, created_at asc)
  where status in ('queued', 'processing');
