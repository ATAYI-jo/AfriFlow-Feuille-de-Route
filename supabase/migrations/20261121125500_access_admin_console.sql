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
