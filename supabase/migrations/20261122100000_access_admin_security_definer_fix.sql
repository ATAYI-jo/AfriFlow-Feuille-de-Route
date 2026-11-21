-- The admin-only Edge Function invokes this RPC as service_role.
-- It verifies the user session and administrator membership before calling it.
-- auth.users is inaccessible to SECURITY INVOKER service_role in this setup.
-- Execute with the postgres definer, while retaining service_role-only EXECUTE
-- and the in-function role, actor, target, terms and audit checks.
ALTER FUNCTION public.af_access_admin_decide(uuid,uuid,text,text)
  SECURITY DEFINER;
ALTER FUNCTION public.af_access_admin_decide(uuid,uuid,text,text)
  SET search_path = '';
REVOKE ALL ON FUNCTION public.af_access_admin_decide(uuid,uuid,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.af_access_admin_decide(uuid,uuid,text,text)
  TO service_role;
