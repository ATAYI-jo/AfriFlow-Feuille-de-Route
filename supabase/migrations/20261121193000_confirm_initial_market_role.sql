-- One-time, explicit profile confirmation for OAuth and older auto-client accounts.
-- Backwards compatible: historic collaborators retain their existing mode.
alter table public.afriflow_market_profiles
  add column if not exists role_selected_at timestamptz;

-- Legacy collaborator profiles require separate shareholder reconciliation.
-- Their pre-existing permissions are not modified by this onboarding rollout.
update public.afriflow_market_profiles
set role_selected_at = coalesce(role_selected_at, created_at, now())
where access_mode = 'collaborator' and role_selected_at is null;

-- Previously pending/approved applicants made an explicit request.
update public.afriflow_market_profiles
set role_selected_at = coalesce(role_selected_at, created_at, now())
where requested_role in ('shareholder','partner') and role_selected_at is null;

-- Existing client rows that were auto-generated remain unconfirmed and get the chooser.

create or replace function public.afriflow_market_profile_guard()
returns trigger
language plpgsql
set search_path=public
as $$
declare is_service boolean;
begin
  new.requested_role := coalesce(nullif(new.requested_role,''), 'client');
  if new.requested_role not in ('client','shareholder','partner') then
    raise exception 'Role Market invalide';
  end if;
  is_service := (select auth.role()) = 'service_role';
  if tg_op = 'UPDATE' then
    if old.role_selected_at is not null then
      if new.requested_role is distinct from old.requested_role
         or new.role_selected_at is distinct from old.role_selected_at then
        raise exception 'Profil déjà choisi : modification administrative nécessaire';
      end if;
    else
      -- First confirmation may change an auto-assigned client role once.
      if new.role_selected_at is null
         and new.requested_role is distinct from old.requested_role then
        raise exception 'Confirmez votre profil pour choisir un rôle';
      end if;
    end if;
    if old.access_mode = 'collaborator' then
      new.access_mode := 'collaborator';
    elsif new.requested_role='shareholder'
      and old.requested_role='shareholder'
      and old.access_mode in ('shareholder_pending','shareholder_approved')
      and new.access_mode='shareholder_approved' and is_service then
      new.access_mode := 'shareholder_approved';
    elsif new.requested_role='client' then
      new.access_mode := 'client';
    elsif new.requested_role='shareholder' then
      new.access_mode := 'shareholder_pending';
    else
      new.access_mode := 'partner_waiting';
    end if;
  else
    if new.requested_role='client' then new.access_mode := 'client';
    elsif new.requested_role='shareholder' then new.access_mode := 'shareholder_pending';
    else new.access_mode := 'partner_waiting';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
