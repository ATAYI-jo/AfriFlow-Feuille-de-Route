-- Integration checks against installed functions. Run as a database administrator.
-- All fixtures, check-ins and decisions are rolled back. No real meeting is changed.
begin;
do $$
declare
  member_id uuid; other_id uuid; admin_id uuid; member_email text; other_email text; admin_email text;
  mid text:='mqualityattendance20261126'; t timestamptz:=clock_timestamp(); start_ms bigint;
  first_result jsonb; second_result jsonb; old_record jsonb; preview jsonb;
  req public.afriflow_attendance_events; duplicate_req public.afriflow_attendance_events;
  admin_req public.afriflow_attendance_events; decision public.afriflow_attendance_events;
  blocked boolean; n integer;
begin
  select u.id,lower(u.email) into member_id,member_email from auth.users u
    join public.afriflow_market_profiles p on p.user_id=u.id
    where u.email_confirmed_at is not null and p.access_mode in ('collaborator','shareholder_approved')
      and not exists(select 1 from public.afriflow_admins a where lower(a.email)=lower(u.email))
      and not exists(select 1 from public.afriflow_state s, jsonb_array_elements_text(s.value->'censeurs') c(email) where s.key='pub:meetcfg' and lower(btrim(c.email))=lower(u.email))
    order by u.created_at limit 1;
  select u.id,lower(u.email) into other_id,other_email from auth.users u
    join public.afriflow_market_profiles p on p.user_id=u.id
    where u.email_confirmed_at is not null and p.access_mode in ('collaborator','shareholder_approved')
      and u.id<>member_id and not exists(select 1 from public.afriflow_admins a where lower(a.email)=lower(u.email))
      and not exists(select 1 from public.afriflow_state s, jsonb_array_elements_text(s.value->'censeurs') c(email) where s.key='pub:meetcfg' and lower(btrim(c.email))=lower(u.email))
    order by u.created_at limit 1;
  select u.id,lower(u.email) into admin_id,admin_email from auth.users u
    join public.afriflow_admins a on lower(a.email)=lower(u.email) where u.email_confirmed_at is not null limit 1;
  if member_id is null or other_id is null or admin_id is null then raise exception 'Test requires two members and an administrator'; end if;
  if has_function_privilege('authenticated','public.af_meeting_checkin_write(text,uuid,timestamptz,text)','EXECUTE')
    or has_function_privilege('anon','public.af_meeting_checkin_write(text,uuid,timestamptz,text)','EXECUTE')
    or not has_function_privilege('service_role','public.af_meeting_checkin_write(text,uuid,timestamptz,text)','EXECUTE') then raise exception 'Trusted writer execution grants are wrong'; end if;
  if has_table_privilege('authenticated','public.afriflow_attendance_events','INSERT')
    or has_table_privilege('authenticated','public.afriflow_attendance_events','UPDATE')
    or has_table_privilege('authenticated','public.afriflow_attendance_events','DELETE')
    or has_table_privilege('anon','public.afriflow_attendance_events','SELECT') then raise exception 'Append-only event grants are wrong'; end if;
  if has_function_privilege('anon','public.af_meeting_attendance_request(text,text,timestamptz)','EXECUTE')
    or has_function_privilege('anon','public.af_meeting_attendance_decide(uuid,text,text,timestamptz)','EXECUTE')
    or has_function_privilege('anon','public.af_meeting_preview(text)','EXECUTE') then raise exception 'Anonymous function access'; end if;
  start_ms:=floor(extract(epoch from t-interval '2 minutes')*1000);
  insert into public.afriflow_state(key,value,updated_at) values('meet:'||mid,
    jsonb_build_object('id',mid,'title','Temporary verification fixture','start',start_ms,'dur',30,'grace',5,
      'link','https://teams.microsoft.com/l/meetup-join/verification-fixture','invitees',jsonb_build_array(member_email,admin_email)),t);
  first_result:=public.af_meeting_checkin_write(mid,member_id,t-interval '10 seconds','alert');
  if first_result->'record'->>'source'<>'alert' or (first_result->'record'->>'scheduledStart')::bigint<>start_ms then raise exception 'Missing source/schedule snapshot'; end if;
  second_result:=public.af_meeting_checkin_write(mid,member_id,t-interval '5 seconds','home');
  if second_result->'record'<>first_result->'record' then raise exception 'Later retry overwrote first check-in'; end if;
  second_result:=public.af_meeting_checkin_write(mid,member_id,t-interval '20 seconds','push');
  if (second_result->'record'->>'at')::bigint<>floor(extract(epoch from t-interval '20 seconds')*1000)::bigint then raise exception 'Out-of-order earlier receipt lost'; end if;
  old_record:=(second_result->'record')-'schemaVersion';
  update public.afriflow_state set value=old_record where key='att:'||mid||':'||member_email;
  second_result:=public.af_meeting_checkin_write(mid,member_id,t-interval '30 seconds','android');
  if second_result->'record'<>old_record then raise exception 'Historical check-in was modified'; end if;
  blocked:=false;begin perform public.af_meeting_checkin_write(mid,other_id,t,'home');exception when insufficient_privilege then blocked:=true;end;
  if not blocked then raise exception 'Uninvited check-in accepted'; end if;
  blocked:=false;begin perform public.af_meeting_checkin_write(mid,member_id,t-interval '10 minutes','home');exception when invalid_parameter_value then blocked:=true;end;
  if not blocked then raise exception 'Backdated receipt accepted'; end if;
  blocked:=false;begin perform public.af_meeting_checkin_write(mid,member_id,t+interval '1 minute','home');exception when invalid_parameter_value then blocked:=true;end;
  if not blocked then raise exception 'Future receipt accepted'; end if;

  perform set_config('request.jwt.claim.sub',member_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',member_id,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  blocked:=false;
  begin
    insert into public.afriflow_state(key,value) values('att:perm-'||mid||':'||member_email,
      jsonb_build_object('mid',mid,'email',member_email,'from',member_email,'by',member_email,'type','censeur_permission','reason','Fixture forged permission must be refused.','at',start_ms));
  exception when insufficient_privilege then blocked:=true;end;
  if not blocked then raise exception 'Generic attachment policy permits forged exemption'; end if;
  blocked:=false;
  begin
    insert into public.afriflow_state(key,value) values('att:jd-'||mid||':'||member_email,
      jsonb_build_object('mid',mid,'email',member_email,'from',member_email,'by',member_email,'ok',true,'reason','Fixture forged decision must be refused.','at',start_ms));
  exception when insufficient_privilege then blocked:=true;end;
  if not blocked then raise exception 'Generic attachment policy permits forged decision'; end if;
  blocked:=false;
  begin
    insert into public.afriflow_state(key,value) values('att:j-'||mid||':'||other_email,
      jsonb_build_object('mid',mid,'email',other_email,'from',member_email,'reason','Fixture cannot submit for another account.','at',start_ms));
  exception when insufficient_privilege then blocked:=true;end;
  if not blocked then raise exception 'Generic attachment policy permits another member impersonation'; end if;
  insert into public.afriflow_state(key,value) values('att:j-'||mid||':'||member_email,
    jsonb_build_object('mid',mid,'email',member_email,'reason','Fixture own justification remains available.','at',start_ms));
  preview:=public.af_meeting_preview(mid);
  if preview->'meeting'->>'id'<>mid or abs((preview->>'serverNow')::numeric-extract(epoch from clock_timestamp())*1000)>5000 then raise exception 'Preview lacks authorized meeting/server clock'; end if;
  req:=public.af_meeting_attendance_request(mid,'Fixture: joined through notification; please verify.',t-interval '1 minute');
  if req.actor_id<>member_id or req.member_email<>member_email or req.pointage_snapshot<>old_record then raise exception 'Request identity/evidence not preserved'; end if;
  duplicate_req:=public.af_meeting_attendance_request(mid,'Duplicate request must retain the original.',null);
  if duplicate_req.id<>req.id then raise exception 'Duplicate pending request created'; end if;
  blocked:=false;begin perform public.af_meeting_attendance_request(mid,'short',null);exception when invalid_parameter_value then blocked:=true;end;
  if not blocked then raise exception 'Short reason accepted'; end if;
  blocked:=false;begin perform public.af_meeting_attendance_request(mid,'Fixture with an invalid declared arrival.',t+interval '1 day');exception when invalid_parameter_value then blocked:=true;end;
  if not blocked then raise exception 'Out-of-meeting arrival accepted'; end if;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub',other_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',other_id,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  select count(*) into n from public.afriflow_attendance_events where meeting_id=mid;
  if n<>0 then raise exception 'Another member can read private requests'; end if;
  blocked:=false;begin perform public.af_meeting_preview(mid);exception when no_data_found then blocked:=true;end;
  if not blocked then raise exception 'Uninvited member can preview meeting'; end if;
  blocked:=false;begin perform public.af_meeting_attendance_request(mid,'Fixture from an uninvited account.',null);exception when insufficient_privilege then blocked:=true;end;
  if not blocked then raise exception 'Uninvited member can request correction'; end if;
  blocked:=false;begin perform public.af_meeting_attendance_decide(req.id,'on_time','Fixture unauthorized reviewer attempt.',null);exception when insufficient_privilege then blocked:=true;end;
  if not blocked then raise exception 'Ordinary member can decide attendance'; end if;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  select count(*) into n from public.afriflow_attendance_events where meeting_id=mid;
  if n<>1 then raise exception 'Reviewer cannot read requested evidence'; end if;
  admin_req:=public.af_meeting_attendance_request(mid,'Administrator fixture requiring an independent reviewer.',null);
  blocked:=false;begin perform public.af_meeting_attendance_decide(admin_req.id,'on_time','Self-review must not be accepted.',null);exception when insufficient_privilege then blocked:=true;end;
  if not blocked then raise exception 'Self-review accepted'; end if;
  blocked:=false;begin perform public.af_meeting_attendance_decide(req.id,'late','Fixture inconsistent time and conclusion.',t-interval '1 minute');exception when invalid_parameter_value then blocked:=true;end;
  if not blocked then raise exception 'Contradictory confirmed time accepted'; end if;
  decision:=public.af_meeting_attendance_decide(req.id,'on_time','Fixture: participation verified with supporting evidence.',t-interval '1 minute');
  if decision.actor_id<>admin_id or decision.request_id<>req.id or decision.outcome<>'on_time' or decision.pointage_snapshot<>old_record then raise exception 'Decision audit trail incorrect'; end if;
  blocked:=false;begin perform public.af_meeting_attendance_decide(req.id,'absent','Attempt to replace an existing decision.',null);exception when unique_violation then blocked:=true;end;
  if not blocked then raise exception 'Existing decision overwritten'; end if;
  select count(*) into n from public.afriflow_attendance_events where meeting_id=mid;
  if n<>3 then raise exception 'Unexpected event count'; end if;
  execute 'reset role';
  if (select value from public.afriflow_state where key='att:'||mid||':'||member_email)<>old_record then raise exception 'Review changed original first-click evidence'; end if;
end;
$$;
rollback;
select 'Attendance database checks passed; all fixtures rolled back.' as result;
