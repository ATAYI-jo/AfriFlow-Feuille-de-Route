-- Run only after applying attendance_reviewer_eligibility_fix.sql.
-- This transaction uses real account IDs but creates only temporary evidence.
-- The censeur roster and one shareholder approval are changed inside the
-- transaction and rolled back. It performs no external notification dispatch.
-- The profile transition uses the existing approved -> pending -> approved
-- path; it neither disables triggers nor changes account credentials.
begin;
do $$
declare
  reviewer_id uuid; reviewer_email text; member_id uuid; member_email text;
  admin_id uuid; admin_email text; config jsonb; censeurs jsonb;
  mid text:='mqualityrevieweraccess20261126'; t timestamptz:=clock_timestamp();
  snapshot jsonb; member_request uuid; reviewer_request uuid;
  blocked boolean; n integer; decision public.afriflow_attendance_events;
begin
  select u.id,lower(u.email) into reviewer_id,reviewer_email
    from auth.users u join public.afriflow_market_profiles p on p.user_id=u.id
    where u.email_confirmed_at is not null and p.access_mode='shareholder_approved'
      and p.requested_role='shareholder'
      and not exists(select 1 from public.afriflow_admins a where lower(a.email)=lower(u.email))
    order by u.created_at limit 1;
  select u.id,lower(u.email) into member_id,member_email
    from auth.users u join public.afriflow_market_profiles p on p.user_id=u.id
    where u.id is distinct from reviewer_id and u.email_confirmed_at is not null
      and p.access_mode in ('collaborator','shareholder_approved')
      and not exists(select 1 from public.afriflow_admins a where lower(a.email)=lower(u.email))
    order by u.created_at limit 1;
  select u.id,lower(u.email) into admin_id,admin_email
    from auth.users u join public.afriflow_admins a on lower(a.email)=lower(u.email)
    where u.email_confirmed_at is not null order by u.created_at limit 1;
  if reviewer_id is null or member_id is null or admin_id is null then
    raise exception 'Fixture requires an approved nonadmin shareholder, another approved member and an administrator';
  end if;
  if exists(select 1 from public.afriflow_attendance_events where meeting_id=mid) then
    raise exception 'Fixture identifier already exists; refusing to use existing evidence';
  end if;
  select value into config from public.afriflow_state where key='pub:meetcfg' for update;
  if config is null then raise exception 'Meeting configuration is required for this fixture'; end if;
  censeurs:=case when jsonb_typeof(config->'censeurs')='array' then config->'censeurs' else '[]'::jsonb end;
  if not exists(select 1 from jsonb_array_elements_text(censeurs) e(email) where lower(btrim(e.email))=reviewer_email) then
    update public.afriflow_state set value=jsonb_set(config,'{censeurs}',censeurs||jsonb_build_array(reviewer_email))
      where key='pub:meetcfg';
  end if;
  snapshot:=jsonb_build_object('id',mid,'title','Temporary reviewer eligibility fixture',
    'start',floor(extract(epoch from t-interval '2 minutes')*1000),'dur',30,'grace',5);
  insert into public.afriflow_attendance_events(meeting_id,member_email,kind,reason,actor_id,actor_email,meeting_snapshot)
    values(mid,member_email,'request','Fixture requesting an independently verified attendance decision.',member_id,member_email,snapshot)
    returning id into member_request;
  insert into public.afriflow_attendance_events(meeting_id,member_email,kind,reason,actor_id,actor_email,meeting_snapshot)
    values(mid,reviewer_email,'request','Fixture proving that the same workspace barrier also protects own evidence.',reviewer_id,reviewer_email,snapshot)
    returning id into reviewer_request;

  perform set_config('request.jwt.claim.sub',reviewer_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',reviewer_id,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  if not public.af_is_meeting_scheduler() then raise exception 'Fixture censeur configuration is missing'; end if;
  select count(*) into n from public.afriflow_attendance_events where meeting_id=mid;
  if n<>2 then raise exception 'An eligible censeur cannot read authorized review evidence'; end if;
  execute 'reset role';

  update public.afriflow_market_profiles set access_mode='shareholder_pending' where user_id=reviewer_id;
  execute 'set local role authenticated';
  if not public.af_is_meeting_scheduler() then raise exception 'Fixture must retain the censeur configuration during revocation'; end if;
  select count(*) into n from public.afriflow_attendance_events where meeting_id=mid;
  if n<>0 then raise exception 'Revoked censeur still reads attendance evidence'; end if;
  blocked:=false;
  begin
    perform public.af_meeting_attendance_decide(member_request,'on_time','Fixture: a revoked censeur must not decide this request.',null);
  exception when insufficient_privilege then blocked:=true;
  end;
  if not blocked then raise exception 'Revoked censeur still writes attendance decisions'; end if;
  execute 'reset role';
  if exists(select 1 from public.afriflow_attendance_events where request_id=member_request) then
    raise exception 'Rejected reviewer attempt created evidence';
  end if;

  -- The documented approval transition restores access without touching the
  -- roster. Existing approved reviewers must continue to work after the fix.
  update public.afriflow_market_profiles set access_mode='shareholder_approved' where user_id=reviewer_id;
  execute 'set local role authenticated';
  select count(*) into n from public.afriflow_attendance_events where meeting_id=mid;
  if n<>2 then raise exception 'Restored approval did not restore review access'; end if;
  decision:=public.af_meeting_attendance_decide(member_request,'on_time','Fixture: eligible censeur independently verified this attendance.',null);
  if decision.actor_id<>reviewer_id or decision.request_id<>member_request then raise exception 'Eligible censeur decision identity is incorrect'; end if;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  select count(*) into n from public.afriflow_attendance_events where meeting_id=mid;
  if n<>3 then raise exception 'Administrator exception lost read access'; end if;
  decision:=public.af_meeting_attendance_decide(reviewer_request,'excused','Fixture: administrator review must remain authorized.',null);
  if decision.actor_id<>admin_id then raise exception 'Administrator exception lost decision access'; end if;
  execute 'reset role';
end;
$$;
rollback;
select 'Reviewer eligibility checks passed; approval, roster and all evidence fixtures rolled back.' as result;
