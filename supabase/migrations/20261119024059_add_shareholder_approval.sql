-- A shareholder declaration is never a privilege grant. Only the server-side
-- administrator workflow may move a pending shareholder to approved.
alter table public.afriflow_market_profiles
  drop constraint if exists afriflow_market_profiles_access_mode_check;

alter table public.afriflow_market_profiles
  add constraint afriflow_market_profiles_access_mode_check
  check (access_mode in ('client', 'shareholder_pending', 'shareholder_approved', 'partner_waiting', 'collaborator'));

create or replace function public.afriflow_market_profile_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.requested_role := coalesce(nullif(new.requested_role, ''), 'client');
  if new.requested_role not in ('client', 'shareholder', 'partner') then
    raise exception 'Role Market invalide';
  end if;

  if tg_op = 'UPDATE' and old.access_mode = 'collaborator' then
    new.access_mode := 'collaborator';
  elsif tg_op = 'UPDATE'
    and old.requested_role = 'shareholder'
    and new.requested_role = 'shareholder'
    and old.access_mode in ('shareholder_pending', 'shareholder_approved')
    and new.access_mode = 'shareholder_approved'
    and (select auth.role()) = 'service_role' then
    -- The Edge Function has already authenticated an AfriFloW administrator.
    new.access_mode := 'shareholder_approved';
  elsif new.requested_role = 'client' then
    new.access_mode := 'client';
  elsif new.requested_role = 'shareholder' then
    new.access_mode := 'shareholder_pending';
  else
    new.access_mode := 'partner_waiting';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
