-- Keep attendance evidence under the same current workspace-access barrier
-- as legacy meeting state. A retained censeur configuration is not membership.
-- The existing permissive policy still limits reads to the member or reviewers.
create policy af_attendance_events_workspace_barrier
on public.afriflow_attendance_events
as restrictive for select to authenticated
using (
  (select public.af_is_admin())
  or exists (
    select 1 from public.afriflow_market_profiles mp
    where mp.user_id=(select auth.uid())
      and mp.access_mode in ('collaborator','shareholder_approved')
  )
);

create or replace function public.af_meeting_attendance_decide(
  p_request_id uuid,p_outcome text,p_reason text,p_confirmed_at timestamptz default null
) returns public.afriflow_attendance_events language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid:=auth.uid(); v_email text:=public.af_email(); v_now timestamptz:=clock_timestamp();
  v_request public.afriflow_attendance_events; v_row public.afriflow_attendance_events;
  v_start timestamptz; v_end timestamptz; v_limit timestamptz;
begin
  if v_uid is null or v_email is null or not public.af_is_meeting_scheduler() then
    raise exception 'Seul un censeur ou administrateur peut vérifier une présence' using errcode='42501';
  end if;
  -- The scheduler list may outlive workspace access. Re-check the current
  -- account's approved membership before this privileged write.
  if not public.af_is_admin() and not exists(
    select 1 from public.afriflow_market_profiles
    where user_id=v_uid and access_mode in ('collaborator','shareholder_approved')
  ) then
    raise exception 'Votre accès à la vérification des présences a été retiré' using errcode='42501';
  end if;
  if p_outcome is null or p_outcome not in ('on_time','late','excused','absent','rejected') or char_length(btrim(coalesce(p_reason,''))) not between 10 and 2000 then
    raise exception 'Choisissez une décision et indiquez ses éléments de vérification (10 à 2 000 caractères)' using errcode='22023';
  end if;
  select * into v_request from public.afriflow_attendance_events where id=p_request_id and kind='request' for update;
  if not found then raise exception 'Demande introuvable' using errcode='P0002'; end if;
  if v_request.actor_id=v_uid or v_request.member_email=v_email then
    raise exception 'Un autre censeur ou administrateur doit vérifier votre propre présence' using errcode='42501';
  end if;
  if exists(select 1 from public.afriflow_attendance_events where request_id=p_request_id and kind='decision') then
    raise exception 'Cette demande a déjà reçu une décision. L’historique est conservé' using errcode='23505';
  end if;
  v_start:=to_timestamp((v_request.meeting_snapshot->>'start')::numeric/1000);
  v_end:=v_start+make_interval(mins=>coalesce((v_request.meeting_snapshot->>'dur')::integer,60));
  v_limit:=v_start+make_interval(mins=>coalesce((v_request.meeting_snapshot->>'grace')::integer,5));
  if p_confirmed_at is not null then
    if p_outcome not in ('on_time','late') or p_confirmed_at<v_start-interval '1 hour' or p_confirmed_at>least(v_end,v_now+interval '5 minutes') then
      raise exception 'L’heure confirmée doit correspondre à cette réunion et à une présence vérifiée' using errcode='22023';
    end if;
    if (p_outcome='on_time' and p_confirmed_at>v_limit) or (p_outcome='late' and p_confirmed_at<=v_limit) then
      raise exception 'L’heure confirmée ne correspond pas à la décision et à la tolérance de la réunion' using errcode='22023';
    end if;
  end if;
  insert into public.afriflow_attendance_events(meeting_id,member_email,kind,request_id,outcome,occurred_at,reason,actor_id,actor_email,created_at,meeting_snapshot,pointage_snapshot)
    values(v_request.meeting_id,v_request.member_email,'decision',v_request.id,p_outcome,p_confirmed_at,btrim(p_reason),v_uid,v_email,v_now,v_request.meeting_snapshot,v_request.pointage_snapshot)
    returning * into v_row;
  return v_row;
end;
$$;
revoke all on function public.af_meeting_attendance_decide(uuid,text,text,timestamptz) from public,anon;
grant execute on function public.af_meeting_attendance_decide(uuid,text,text,timestamptz) to authenticated;
