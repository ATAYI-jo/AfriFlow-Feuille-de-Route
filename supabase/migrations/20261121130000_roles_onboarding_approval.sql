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
    new.access_mode := case new.requested_role
      when 'shareholder' then 'shareholder_pending'
      when 'partner' then 'partner_waiting' else 'client' end;
  else
    if new.requested_role is distinct from old.requested_role then
      raise exception 'Le type de profil ne peut pas etre modifie apres inscription';
    end if;
    if not privileged then
      if new.access_mode is distinct from old.access_mode then
        raise exception 'Approbation reservee au serveur';
      end if;
      new.access_mode := old.access_mode;
    elsif new.access_mode is distinct from old.access_mode then
      if new.access_mode='shareholder_approved' and old.requested_role='shareholder' then
        null; -- Admin approval via service role only.
      elsif new.access_mode='shareholder_pending' and old.requested_role='shareholder' then
        null;
      elsif new.access_mode in ('partner_waiting','partner_approved') and old.requested_role='partner' then
        null;
      else
        raise exception 'Transition de profil interdite';
      end if;
    end if;
  end if;
  new.updated_at:=now();
  return new;
end;
$$;

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
