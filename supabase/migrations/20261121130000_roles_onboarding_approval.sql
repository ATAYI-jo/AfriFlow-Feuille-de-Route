-- AfriFloW: first-login profiles, server-controlled approval, shareholder-only workspace.
-- Rollout: deploy migration before frontend; verify existing shareholder accounts are approved.
-- Partner activation is performed only by afriflow-partner-portal's admin action.

alter table public.afriflow_market_profiles
  drop constraint if exists afriflow_market_profiles_access_mode_check;
alter table public.afriflow_market_profiles
  add constraint afriflow_market_profiles_access_mode_check
  check (access_mode in (
    'client','shareholder_pending','shareholder_approved',
    'partner_waiting','partner_approved','collaborator'
  ));

-- Existing rows remain NULL (unknown selection); future inserts are confirmed.
alter table public.afriflow_market_profiles
  add column if not exists selection_confirmed_at timestamptz;
alter table public.afriflow_market_profiles
  alter column selection_confirmed_at set default now();

create or replace function public.afriflow_market_profile_guard()
returns trigger language plpgsql set search_path=public as $$
declare privileged boolean;
begin
  new.requested_role := coalesce(nullif(new.requested_role,''),'client');
  if new.requested_role not in ('client','partner','shareholder') then
    raise exception 'Role Market invalide';
  end if;
  privileged := coalesce((select auth.role())='service_role', false)
                or current_user in ('postgres','supabase_admin');
  if tg_op='INSERT' then
    new.selection_confirmed_at:=now();
    new.access_mode := case new.requested_role
      when 'shareholder' then 'shareholder_pending'
      when 'partner' then 'partner_waiting' else 'client' end;
  else
    if privileged and old.access_mode='collaborator'
       and (new.requested_role is distinct from old.requested_role
            or new.access_mode is distinct from old.access_mode) then
      -- Admin-only reconciliation of historical collaboration accounts.
      -- Do not grant shareholder/partner approval on classification alone.
      new.access_mode:=case new.requested_role
        when 'shareholder' then 'shareholder_pending'
        when 'partner' then 'partner_waiting'
        else 'client' end;
      new.selection_confirmed_at:=now();
    elsif not privileged and old.requested_role='client'
       and old.access_mode='client' and old.selection_confirmed_at is null then
      -- One-time confirmation for profiles automatically created by the old code.
      -- Any elevated requested role remains PENDING, never approved.
      if new.selection_confirmed_at is null then
        raise exception 'Confirmez le choix du profil';
      end if;
      new.selection_confirmed_at:=now();
      new.access_mode:=case new.requested_role
        when 'partner' then 'partner_waiting'
        when 'shareholder' then 'shareholder_pending'
        else 'client' end;
    else
      if new.requested_role is distinct from old.requested_role then
        raise exception 'Le type de profil ne peut pas etre modifie apres inscription';
      end if;
      if new.selection_confirmed_at is distinct from old.selection_confirmed_at then
        raise exception 'La confirmation du profil est verrouillee';
      end if;
      if not privileged then
        if new.access_mode is distinct from old.access_mode then
          raise exception 'Approbation reservee au serveur';
        end if;
        new.access_mode := old.access_mode;
      elsif new.access_mode is distinct from old.access_mode then
        if new.access_mode='shareholder_approved' and old.requested_role='shareholder' then
          null;
        elsif new.access_mode='shareholder_pending' and old.requested_role='shareholder' then
          null;
        elsif new.access_mode in ('partner_waiting','partner_approved') and old.requested_role='partner' then
          null;
        else
          raise exception 'Transition de profil interdite';
        end if;
      end if;
    end if;
  end if;
  new.updated_at:=now();
  return new;
end;
$$;

-- Existing partners already approved through their commercial terms remain approved.
update public.afriflow_market_profiles mp
set access_mode='partner_approved'
from public.afriflow_partner_terms pt
where pt.partner_user_id=mp.user_id and pt.is_enabled=true
  and mp.requested_role='partner'
  and mp.access_mode <> 'partner_approved';

-- Protect shareholder-only journal, collaboration records, internal configuration.
-- Marketplace product catalog and currency rates remain public through their
-- distinct policies and keys.
drop policy if exists af_shareholder_workspace_barrier on public.afriflow_state;
create policy af_shareholder_workspace_barrier on public.afriflow_state
  as restrictive for all to authenticated
  using (
    (
      key not in ('items','map','extra')
      and key not like 'user:%'
      and key not like 'req:%'
      and key not like 'log:%'
      and key not like 'msg:%'
      and key not like 'sent:%'
      and key not like 'att:%'
      and key not like 'meet:%'
      and (key not like 'pub:%' or key='pub:markethero' or key like 'pub:fx:%')
    )
    or (select public.af_is_admin())
    or exists (
      select 1 from public.afriflow_market_profiles mp
      where mp.user_id=(select auth.uid())
        and mp.access_mode='shareholder_approved'
    )
  )
  with check (
    (
      key not in ('items','map','extra')
      and key not like 'user:%'
      and key not like 'req:%'
      and key not like 'log:%'
      and key not like 'msg:%'
      and key not like 'sent:%'
      and key not like 'att:%'
      and key not like 'meet:%'
      and (key not like 'pub:%' or key='pub:markethero' or key like 'pub:fx:%')
    )
    or (select public.af_is_admin())
    or exists (
      select 1 from public.afriflow_market_profiles mp
      where mp.user_id=(select auth.uid())
        and mp.access_mode='shareholder_approved'
    )
  );

-- Customers and applicants can view their own directory entry but not the
-- internal member directory of the shareholder workspace.
drop policy if exists af_directory_shareholder_visibility on public.afriflow_member_directory;
create policy af_directory_shareholder_visibility on public.afriflow_member_directory
  as restrictive for select to authenticated
  using (
    user_id=(select auth.uid())
    or (select public.af_is_admin())
    or exists (
      select 1 from public.afriflow_market_profiles mp
      where mp.user_id=(select auth.uid())
        and mp.access_mode='shareholder_approved'
    )
  );

-- Administrator decisions are retained separately from customer-facing profiles.
create table if not exists public.afriflow_access_audit (
  id bigint generated always as identity primary key,
  target_user_id uuid not null,
  administrator_user_id uuid not null,
  previous_role text,
  previous_access text,
  new_role text not null,
  new_access text not null,
  action text not null,
  reason text not null default '',
  created_at timestamptz not null default now()
);
alter table public.afriflow_access_audit enable row level security;
revoke all on public.afriflow_access_audit from anon, authenticated;
create policy af_access_audit_admin_read on public.afriflow_access_audit
  for select to authenticated using ((select public.af_is_admin()));
grant select on public.afriflow_access_audit to authenticated;
