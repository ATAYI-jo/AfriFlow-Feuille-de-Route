-- The invitation preview reads through existing meeting RLS and supplies a trusted clock.
create function public.af_meeting_preview(p_meeting_id text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_meeting jsonb; v_link text; v_now timestamptz:=clock_timestamp();
begin
 if auth.uid() is null or public.af_email() is null then raise exception 'Connexion requise' using errcode='42501'; end if;
 if p_meeting_id is null or p_meeting_id !~ '^m[a-z0-9]{5,35}$' then raise exception 'Réunion invalide' using errcode='22023'; end if;
 select value into v_meeting from public.afriflow_state where key='meet:'||p_meeting_id;
 if v_meeting is null then raise exception 'Cette réunion est indisponible ou votre compte n’est pas invité' using errcode='P0002'; end if;
 v_link:=nullif(btrim(v_meeting->>'link'),'');
 if v_link is null then select nullif(btrim(value->>'link'),'') into v_link from public.afriflow_state where key='pub:meetcfg'; end if;
 return jsonb_build_object('meeting',v_meeting||jsonb_build_object('link',coalesce(v_link,'')),'serverNow',floor(extract(epoch from v_now)*1000));
end;
$$;
revoke all on function public.af_meeting_preview(text) from public,anon;
grant execute on function public.af_meeting_preview(text) to authenticated;
