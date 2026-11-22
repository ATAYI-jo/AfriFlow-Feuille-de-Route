-- Permanent AfriFloW identifiers and ISO 3166-1 country coding.
-- Previously applied through Supabase migrations on the live project.
create table if not exists public.afriflow_member_ids (
 user_id uuid primary key references auth.users(id) on delete cascade,
 serial_no bigint generated always as identity unique not null,
 created_year integer not null default extract(year from now())::integer,
 login_id text generated always as ('AF-' || lpad(serial_no::text,6,'0')) stored unique,
 admin_number text generated always as ('AF-' || created_year::text || '-' || lpad(serial_no::text,6,'0')) stored unique,
 created_at timestamptz not null default now(),
 constraint af_year_valid check (created_year between 2020 and 2200)
);
alter table public.afriflow_member_ids enable row level security;
revoke all on public.afriflow_member_ids from public,anon,authenticated;
grant select on public.afriflow_member_ids to authenticated;
do $$begin
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='afriflow_member_ids' and policyname='af_member_id_own_read') then
  create policy af_member_id_own_read on public.afriflow_member_ids for select to authenticated using ((select auth.uid())=user_id);
 end if;
end$$;
create schema if not exists afriflow_private;
create or replace function afriflow_private.assign_member_id()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,afriflow_private as $$
begin
 insert into public.afriflow_member_ids(user_id,created_year)
 values(new.id,extract(year from new.created_at)::integer)
 on conflict(user_id) do nothing;
 return new;
end;$$;
revoke all on function afriflow_private.assign_member_id() from public,anon,authenticated;
drop trigger if exists af_member_id_after_signup on auth.users;
create trigger af_member_id_after_signup after insert on auth.users for each row execute function afriflow_private.assign_member_id();
insert into public.afriflow_member_ids(user_id,created_year)
select id,extract(year from created_at)::integer from auth.users order by created_at,id
on conflict(user_id) do nothing;
alter table public.afriflow_profiles add column if not exists country_code text;
alter table public.afriflow_member_directory add column if not exists country_code text;
alter table public.afriflow_partner_markets add column if not exists country_code text;
create table if not exists public.afriflow_login_attempts (
 id bigint generated always as identity primary key,
 login_key text not null check(length(login_key)=64),
 attempted_at timestamptz not null default now()
);
create index if not exists af_login_attempt_key_time on public.afriflow_login_attempts(login_key,attempted_at desc);
alter table public.afriflow_login_attempts enable row level security;
revoke all on public.afriflow_login_attempts from public,anon,authenticated;
-- Country codes saved from the ISO selector must be two uppercase letters.
do $$declare name text;begin
 foreach name in array array['afriflow_profiles','afriflow_member_directory','afriflow_partner_markets'] loop
  if not exists(select 1 from pg_constraint where conname='af_country_format_'||name) then
   execute format('alter table public.%I add constraint %I check(country_code is null or country_code ~ %L)',name,'af_country_format_'||name,'^[A-Z]{2}$');
  end if;
 end loop;
end$$;
