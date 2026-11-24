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
    elsif privileged and new.requested_role='shareholder'
       and new.access_mode='shareholder_approved'
       and ((old.requested_role='client' and old.access_mode='client')
         or (old.requested_role='partner' and old.access_mode in ('partner_waiting','partner_approved'))) then
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

CREATE OR REPLACE FUNCTION public.af_access_admin_decide(
  p_actor uuid,p_target uuid,p_action text,p_reason text DEFAULT ''
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor_email text; target_email text; prior public.afriflow_market_profiles%ROWTYPE;
  next_role text; next_mode text; terms_enabled boolean;
BEGIN
  IF (select auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Droits insuffisants';
  END IF;
  SELECT lower(email) INTO actor_email FROM auth.users WHERE id=p_actor AND email_confirmed_at IS NOT NULL;
  IF actor_email IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.afriflow_admins WHERE lower(email)=actor_email
  ) THEN RAISE EXCEPTION 'Administration requise'; END IF;
  IF p_actor=p_target THEN RAISE EXCEPTION 'Auto-modification interdite'; END IF;
  SELECT lower(email) INTO target_email FROM auth.users WHERE id=p_target;
  IF target_email IS NULL OR EXISTS(
    SELECT 1 FROM public.afriflow_admins WHERE lower(email)=target_email
  ) THEN RAISE EXCEPTION 'Compte introuvable ou protégé'; END IF;

  SELECT * INTO prior FROM public.afriflow_market_profiles
  WHERE user_id=p_target FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profil introuvable'; END IF;
  next_role:=prior.requested_role;next_mode:=prior.access_mode;

  IF p_action IN ('classify_client','classify_partner','classify_shareholder') THEN
    IF prior.access_mode<>'collaborator' THEN RAISE EXCEPTION 'Classification réservée aux anciens collaborateurs'; END IF;
    next_role:=substring(p_action from 10);
    next_mode:=CASE next_role WHEN 'shareholder' THEN 'shareholder_pending'
      WHEN 'partner' THEN 'partner_waiting' ELSE 'client' END;
  ELSIF p_action='promote_shareholder' THEN
    IF prior.requested_role='shareholder' AND prior.access_mode='shareholder_approved'
       AND EXISTS (SELECT 1 FROM public.afriflow_access_audit
                   WHERE target_user_id=p_target AND action='promote_shareholder') THEN
      RETURN prior.access_mode;
    END IF;
    IF NOT ((prior.requested_role='client' AND prior.access_mode='client')
          OR (prior.requested_role='partner' AND prior.access_mode IN ('partner_waiting','partner_approved'))) THEN
      RAISE EXCEPTION 'Ce changement est réservé aux clients et aux partenaires';
    END IF;
    next_role:='shareholder';
    next_mode:='shareholder_approved';
  ELSIF p_action='approve' THEN
    IF prior.requested_role='shareholder' AND prior.access_mode='shareholder_pending' THEN
      next_mode:='shareholder_approved';
    ELSIF prior.requested_role='partner' AND prior.access_mode='partner_waiting' THEN
      SELECT is_enabled INTO terms_enabled FROM public.afriflow_partner_terms
      WHERE partner_user_id=p_target;
      IF NOT coalesce(terms_enabled,false) THEN
        RAISE EXCEPTION 'Conditions commerciales non activées';
      END IF;
      next_mode:='partner_approved';
    ELSE RAISE EXCEPTION 'Demande non éligible à l’approbation'; END IF;
  ELSIF p_action IN ('revoke','reject') THEN
    IF prior.requested_role='shareholder' AND prior.access_mode IN ('shareholder_approved','shareholder_pending') THEN
      next_mode:='shareholder_pending';
    ELSIF prior.requested_role='partner' AND prior.access_mode IN ('partner_approved','partner_waiting') THEN
      next_mode:='partner_waiting';
    ELSE RAISE EXCEPTION 'Aucun droit correspondant'; END IF;
  ELSE RAISE EXCEPTION 'Action invalide'; END IF;
  IF (next_mode=prior.access_mode AND next_role=prior.requested_role) AND p_action<>'reject' THEN
    RAISE EXCEPTION 'Aucun changement nécessaire';
  END IF;
  UPDATE public.afriflow_market_profiles
  SET requested_role=next_role,access_mode=next_mode
  WHERE user_id=p_target;
  IF p_action='promote_shareholder' AND prior.requested_role='partner' THEN
    UPDATE public.afriflow_partner_terms SET is_enabled=false
    WHERE partner_user_id=p_target AND is_enabled;
    UPDATE public.afriflow_cod_routes SET enabled=false
    WHERE seller_user_id=p_target AND enabled;
  END IF;
  INSERT INTO public.afriflow_access_audit(
    target_user_id,administrator_user_id,previous_role,previous_access,
    new_role,new_access,action,reason
  ) VALUES (
    p_target,p_actor,prior.requested_role,prior.access_mode,
    next_role,next_mode,p_action,coalesce(left(p_reason,500),'')
  );
  RETURN next_mode;
END;
$$;
REVOKE ALL ON FUNCTION public.af_access_admin_decide(uuid,uuid,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.af_access_admin_decide(uuid,uuid,text,text)
  TO service_role;
