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
    elsif privileged and old.requested_role='partner'
       and old.access_mode in ('partner_waiting','partner_approved')
       and new.requested_role='client' and new.access_mode='client' then
      new.selection_confirmed_at:=coalesce(old.selection_confirmed_at,now());
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

-- Serialize activation with removal. Commercial settings remain for history.
create or replace function public.afriflow_partner_terms_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.is_enabled then
    perform 1 from public.afriflow_market_profiles
    where user_id=new.partner_user_id and requested_role='partner'
    for share;
    if not found then
      raise exception 'Seul un partenaire enregistré peut être activé.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists afriflow_partner_terms_guard on public.afriflow_partner_terms;
create trigger afriflow_partner_terms_guard
  before insert or update of is_enabled on public.afriflow_partner_terms
  for each row execute function public.afriflow_partner_terms_guard();

create or replace function public.af_remove_partner(p_actor uuid, p_target uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  prior public.afriflow_market_profiles%rowtype;
begin
  if auth.role() is distinct from 'service_role' or not exists (
    select 1 from auth.users u join public.afriflow_admins a on lower(a.email)=lower(u.email)
    where u.id=p_actor and u.email_confirmed_at is not null
  ) then
    raise exception 'Administration requise';
  end if;
  if p_actor=p_target or not exists (
    select 1 from auth.users u
    where u.id=p_target and not exists (
      select 1 from public.afriflow_admins a where lower(a.email)=lower(u.email)
    )
  ) then
    raise exception 'Compte introuvable ou protégé';
  end if;

  select * into prior from public.afriflow_market_profiles where user_id=p_target for update;
  if not found then raise exception 'Partenaire introuvable'; end if;
  if prior.requested_role='client' and prior.access_mode='client' and exists (
    select 1 from public.afriflow_access_audit
    where target_user_id=p_target and action='remove_partner'
  ) then return; end if;
  if prior.requested_role<>'partner' or prior.access_mode not in ('partner_waiting','partner_approved') then
    raise exception 'Ce compte ne figure pas parmi les partenaires';
  end if;

  update public.afriflow_market_profiles set requested_role='client',access_mode='client' where user_id=p_target;
  update public.afriflow_partner_terms set is_enabled=false where partner_user_id=p_target and is_enabled;
  update public.afriflow_cod_routes set enabled=false where seller_user_id=p_target and enabled;

  insert into public.afriflow_access_audit (
    target_user_id,administrator_user_id,previous_role,previous_access,new_role,new_access,action,reason
  ) values (p_target,p_actor,prior.requested_role,prior.access_mode,'client','client','remove_partner','');
end;
$$;

revoke all on function public.af_remove_partner(uuid,uuid) from public,anon,authenticated;
grant execute on function public.af_remove_partner(uuid,uuid) to service_role;
