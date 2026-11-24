do $$
begin
  if exists (select 1 from pg_trigger where tgrelid = 'public.afriflow_state'::regclass and tgname = 'notify-message' and encode(tgargs, 'escape') like '%/functions/v1/super-function%') then
    alter table public.afriflow_state disable trigger "notify-message";
  end if;
end $$;
