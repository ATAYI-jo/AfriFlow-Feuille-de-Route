-- Server-authored attendance evidence and append-only, accountable corrections.
-- Existing first-click records are retained verbatim. No historical verdict is inferred.
create table public.afriflow_attendance_events (
  id uuid primary key default gen_random_uuid(),
  meeting_id text not null check (meeting_id ~ '^m[a-z0-9]{5,35}$'),
  member_email text not null,
  kind text not null check (kind in ('request','decision')),
  request_id uuid references public.afriflow_attendance_events(id),
  outcome text check (outcome in ('on_time','late','excused','absent','rejected')),
  occurred_at timestamptz,
  reason text not null check (char_length(btrim(reason)) between 10 and 2000),
  actor_id uuid not null,
  actor_email text not null,
  created_at timestamptz not null default clock_timestamp(),
  meeting_snapshot jsonb not null,
  pointage_snapshot jsonb,
  check ((kind='request' and request_id is null and outcome is null)
      or (kind='decision' and request_id is not null and outcome is not null)),
  check (member_email=lower(member_email) and actor_email=lower(actor_email))
);
create index af_attendance_events_member_meeting on public.afriflow_attendance_events(member_email,meeting_id,created_at);
create unique index af_attendance_one_decision on public.afriflow_attendance_events(request_id) where kind='decision';
alter table public.afriflow_attendance_events enable row level security;
revoke all on public.afriflow_attendance_events from public,anon,authenticated;
grant select on public.afriflow_attendance_events to authenticated;
grant all on public.afriflow_attendance_events to service_role;
create policy af_attendance_events_read on public.afriflow_attendance_events
for select to authenticated using (
  member_email=(select public.af_email()) or (select public.af_is_meeting_scheduler())
);

-- Only the authenticated Edge Function may supply its trusted receipt timestamp.
-- An atomic minimum handles two overlapping requests arriving out of order.
create function public.af_meeting_checkin_write(
  p_meeting_id text,p_user_id uuid,p_received_at timestamptz,p_source text default 'home'
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_now timestamptz:=clock_timestamp(); v_email text; v_name text; v_admin boolean;
  v_meeting jsonb; v_record jsonb; v_saved jsonb; v_key text;
  v_start numeric; v_duration numeric; v_grace numeric; v_at bigint; v_end numeric;
  v_link text; v_existing boolean;
begin
  if p_meeting_id !~ '^m[a-z0-9]{5,35}$' or p_meeting_id is null then
    raise exception 'Réunion invalide' using errcode='22023';
  end if;
  if p_received_at is null or p_received_at<v_now-interval '5 minutes' or p_received_at>v_now+interval '10 seconds' then
    raise exception 'Horodatage serveur invalide' using errcode='22023';
  end if;
  select lower(email),left(coalesce(raw_user_meta_data->>'full_name',email),120)
    into v_email,v_name from auth.users where id=p_user_id and email_confirmed_at is not null;
  if v_email is null then raise exception 'Session invalide' using errcode='42501'; end if;
  select exists(select 1 from public.afriflow_admins where lower(email)=v_email) into v_admin;
  if not v_admin and not exists(select 1 from public.afriflow_market_profiles
      where user_id=p_user_id and access_mode in ('collaborator','shareholder_approved')) then
    raise exception 'Cette réunion est réservée aux membres autorisés' using errcode='42501';
  end if;
  select value into v_meeting from public.afriflow_state where key='meet:'||p_meeting_id for share;
  if v_meeting is null then raise exception 'Réunion introuvable' using errcode='P0002'; end if;
  if jsonb_typeof(v_meeting->'invitees')='array' and not v_admin
     and not exists(select 1 from jsonb_array_elements_text(v_meeting->'invitees') e(email) where lower(btrim(e.email))=v_email) then
    raise exception 'Vous ne faites pas partie des personnes invitées' using errcode='42501';
  end if;
  v_start:=(v_meeting->>'start')::numeric;
  v_duration:=coalesce((v_meeting->>'dur')::numeric,60);
  v_grace:=coalesce((v_meeting->>'grace')::numeric,5);
  if v_start is null or v_duration not between 5 and 600 or v_grace not between 0 and 120 then
    raise exception 'Horaire de réunion invalide' using errcode='22023';
  end if;
  v_at:=floor(extract(epoch from p_received_at)*1000)::bigint;
  v_end:=v_start+v_duration*60000;
  if v_at<v_start-15*60000 or v_at>v_end then
    raise exception 'Le pointage ouvre 15 minutes avant le début et ferme à la fin de la réunion' using errcode='22023';
  end if;
  v_link:=nullif(btrim(v_meeting->>'link'),'');
  if v_link is null then select nullif(btrim(value->>'link'),'') into v_link from public.afriflow_state where key='pub:meetcfg'; end if;
  if v_link is null or v_link !~ '^https://(teams[.]microsoft[.]com|teams[.]live[.]com|teams[.]microsoft[.]us)/' then
    raise exception 'Le lien Teams de cette réunion est indisponible' using errcode='22023';
  end if;
  v_key:='att:'||p_meeting_id||':'||v_email;
  v_record:=jsonb_build_object('meet',p_meeting_id,'email',v_email,'name',v_name,
    'at',v_at,'userId',p_user_id,'schemaVersion',2,'evidence','afriflow_join_request',
    'source',case when p_source in ('home','alert','desktop','android','push') then p_source else 'home' end,
    'scheduledStart',v_start,'graceMinutes',v_grace,'scheduledEnd',v_end);
  insert into public.afriflow_state as old(key,value,updated_at)
    values(v_key,v_record,p_received_at)
    on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at
      where old.value->>'schemaVersion'='2' and (old.value->>'at')::numeric>(excluded.value->>'at')::numeric
    returning value into v_saved;
  if v_saved is null then select value into v_saved from public.afriflow_state where key=v_key; end if;
  if v_saved is null then raise exception 'Pointage indisponible'; end if;
  return jsonb_build_object('ok',true,'record',v_saved,'serverNow',floor(extract(epoch from v_now)*1000),
    'meeting',jsonb_build_object('id',p_meeting_id,'title',v_meeting->>'title','start',v_start,'dur',v_duration,'grace',v_grace,'link',v_link));
end;
$$;
revoke all on function public.af_meeting_checkin_write(text,uuid,timestamptz,text) from public,anon,authenticated;
grant execute on function public.af_meeting_checkin_write(text,uuid,timestamptz,text) to service_role;

create function public.af_meeting_attendance_request(
  p_meeting_id text,p_reason text,p_claimed_at timestamptz default null
) returns public.afriflow_attendance_events language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid:=auth.uid(); v_email text:=public.af_email(); v_now timestamptz:=clock_timestamp();
  v_meeting jsonb; v_pointage jsonb; v_row public.afriflow_attendance_events;
  v_start timestamptz; v_end timestamptz;
begin
  if v_uid is null or v_email is null then raise exception 'Connexion requise' using errcode='42501'; end if;
  if p_meeting_id is null or p_meeting_id !~ '^m[a-z0-9]{5,35}$' or char_length(btrim(coalesce(p_reason,''))) not between 10 and 2000 then
    raise exception 'Expliquez votre demande en 10 à 2 000 caractères' using errcode='22023';
  end if;
  if not public.af_is_admin() and not exists(select 1 from public.afriflow_market_profiles
      where user_id=v_uid and access_mode in ('collaborator','shareholder_approved')) then
    raise exception 'Accès réservé aux membres autorisés' using errcode='42501';
  end if;
  select value into v_meeting from public.afriflow_state where key='meet:'||p_meeting_id for share;
  if v_meeting is null then raise exception 'Réunion introuvable' using errcode='P0002'; end if;
  if jsonb_typeof(v_meeting->'invitees')='array' and not public.af_is_admin()
     and not exists(select 1 from jsonb_array_elements_text(v_meeting->'invitees') e(email) where lower(btrim(e.email))=v_email) then
    raise exception 'Vous ne faites pas partie des personnes invitées' using errcode='42501';
  end if;
  v_start:=to_timestamp((v_meeting->>'start')::numeric/1000);
  v_end:=v_start+make_interval(mins=>coalesce((v_meeting->>'dur')::integer,60));
  if v_start is null or v_now<v_start-interval '15 minutes' then
    raise exception 'La réunion n’a pas encore ouvert' using errcode='22023';
  end if;
  if p_claimed_at is not null and (p_claimed_at<v_start-interval '1 hour' or p_claimed_at>least(v_end,v_now+interval '5 minutes')) then
    raise exception 'L’heure indiquée doit correspondre à cette réunion' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('af_attendance:'||p_meeting_id||':'||v_email,0));
  select e.* into v_row from public.afriflow_attendance_events e
    where e.meeting_id=p_meeting_id and e.member_email=v_email and e.kind='request'
      and not exists(select 1 from public.afriflow_attendance_events d where d.request_id=e.id and d.kind='decision')
    order by e.created_at desc limit 1;
  if found then return v_row; end if;
  select value into v_pointage from public.afriflow_state where key='att:'||p_meeting_id||':'||v_email;
  insert into public.afriflow_attendance_events(meeting_id,member_email,kind,occurred_at,reason,actor_id,actor_email,created_at,meeting_snapshot,pointage_snapshot)
    values(p_meeting_id,v_email,'request',p_claimed_at,btrim(p_reason),v_uid,v_email,v_now,v_meeting,v_pointage) returning * into v_row;
  return v_row;
end;
$$;
revoke all on function public.af_meeting_attendance_request(text,text,timestamptz) from public,anon;
grant execute on function public.af_meeting_attendance_request(text,text,timestamptz) to authenticated;

create function public.af_meeting_attendance_decide(
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
comment on table public.afriflow_attendance_events is 'Append-only requests and accountable human decisions. AfriFlow check-ins are not proof of Teams participation.';
