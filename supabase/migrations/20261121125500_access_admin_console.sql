-- Admin-only account classification. Does not change any existing access rows.
-- The historical collaborator accounts remain unchanged until an explicit action.
ALTER TABLE public.afriflow_market_profiles
  DROP CONSTRAINT IF EXISTS afriflow_market_profiles_access_mode_check;
ALTER TABLE public.afriflow_market_profiles
  ADD CONSTRAINT afriflow_market_profiles_access_mode_check
  CHECK(access_mode IN ('client','collaborator','shareholder_pending','shareholder_approved','partner_waiting','partner_approved'));

CREATE OR REPLACE FUNCTION public.afriflow_market_profile_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE privileged boolean;
BEGIN
  new.requested_role:=coalesce(nullif(new.requested_role,''),'client');
  IF new.requested_role NOT IN ('client','shareholder','partner') THEN
    RAISE EXCEPTION 'Rôle Market invalide';
  END IF;
  privileged:=coalesce((select auth.role())='service_role',false)
             OR current_user IN ('postgres','supabase_admin');
  IF tg_op='INSERT' THEN
    -- User declarations can only create pending or customer accounts.
    new.access_mode:=CASE new.requested_role
      WHEN 'shareholder' THEN 'shareholder_pending'
      WHEN 'partner' THEN 'partner_waiting'
      ELSE 'client' END;
  ELSIF NOT privileged THEN
    IF new.requested_role IS DISTINCT FROM old.requested_role
       OR new.access_mode IS DISTINCT FROM old.access_mode THEN
      RAISE EXCEPTION 'La modification des rôles est réservée à l’administration';
    END IF;
    new.access_mode:=old.access_mode;
  ELSIF old.access_mode='collaborator'
        AND (new.access_mode IS DISTINCT FROM old.access_mode
             OR new.requested_role IS DISTINCT FROM old.requested_role) THEN
    -- Classification is not approval: shareholder/partner starts pending.
    new.access_mode:=CASE new.requested_role
      WHEN 'shareholder' THEN 'shareholder_pending'
      WHEN 'partner' THEN 'partner_waiting'
      ELSE 'client' END;
  ELSE
    IF new.requested_role IS DISTINCT FROM old.requested_role THEN
      RAISE EXCEPTION 'Le profil ne peut pas être reclassé automatiquement';
    END IF;
    IF new.access_mode IS DISTINCT FROM old.access_mode THEN
      IF new.requested_role='shareholder' AND new.access_mode IN ('shareholder_pending','shareholder_approved') THEN
        NULL;
      ELSIF new.requested_role='partner' AND new.access_mode IN ('partner_waiting','partner_approved') THEN
        NULL;
      ELSIF new.requested_role='client' AND new.access_mode='client' THEN
        NULL;
      ELSE
        RAISE EXCEPTION 'Transition de rôle interdite';
      END IF;
    END IF;
  END IF;
  new.updated_at:=now();
  RETURN new;
END;
$$;

CREATE TABLE IF NOT EXISTS public.afriflow_access_audit(
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  target_user_id uuid NOT NULL,
  administrator_user_id uuid NOT NULL,
  previous_role text,
  previous_access text,
  new_role text NOT NULL,
  new_access text NOT NULL,
  action text NOT NULL,
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.afriflow_access_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.afriflow_access_audit FROM anon, authenticated;
DROP POLICY IF EXISTS af_access_audit_admin_read ON public.afriflow_access_audit;
CREATE POLICY af_access_audit_admin_read ON public.afriflow_access_audit
  FOR SELECT TO authenticated USING ((select public.af_is_admin()));
GRANT SELECT ON public.afriflow_access_audit TO authenticated;

-- Atomic and auditable decisions. Only the service role can execute the RPC.
-- Always verify the actual administrator again inside the database transaction.
CREATE OR REPLACE FUNCTION public.af_access_admin_decide(
  p_actor uuid,p_target uuid,p_action text,p_reason text DEFAULT ''
) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE
  actor_email text; target_email text; prior public.afriflow_market_profiles%ROWTYPE;
  next_role text; next_mode text; terms_enabled boolean;
BEGIN
  IF (select auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Droits insuffisants';
  END IF;
  SELECT lower(email) INTO actor_email FROM auth.users WHERE id=p_actor;
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
