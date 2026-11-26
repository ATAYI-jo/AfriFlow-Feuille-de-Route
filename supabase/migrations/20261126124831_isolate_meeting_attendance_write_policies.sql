-- Generic message attachment writes must not bypass meeting-specific RLS.
-- PostgreSQL combines permissive policies with OR, so reserved attendance
-- namespaces rely exclusively on their own identity/reviewer policies.
alter policy af2_att_ins on public.afriflow_state with check (
 key like 'att:%'
 and key not like 'att:m%'
 and key not like 'att:j-%'
 and key not like 'att:jf-%'
 and key not like 'att:jd-%'
 and key not like 'att:perm-%'
 and (value->>'from')=(select public.af_email())
);
