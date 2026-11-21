-- Invitation visibility and first-click protection for Censeur meetings.
-- Deploy afriflow-meeting-checkin before this migration.
drop policy if exists af_meet_select on public.afriflow_state;
create policy af_meet_select on public.afriflow_state
  for select to authenticated using (
    starts_with(key,'meet:')
    and (
      (select public.af_is_admin())
      or (select public.af_is_meeting_scheduler())
      or (
        exists (
          select 1 from public.afriflow_market_profiles mp
          where mp.user_id=(select auth.uid())
            and mp.access_mode in ('collaborator','shareholder_approved')
        )
        and (
          jsonb_typeof(value->'invitees') is distinct from 'array'
          or (value->'invitees') @> to_jsonb(array[(select public.af_email())])
        )
      )
    )
  );
-- The legacy frontend could write its own timestamp. Only the Edge Function
-- now writes first-click attendance with service-role privileges.
drop policy if exists af_meet_att_insert_own on public.afriflow_state;
