create table if not exists public.afriflow_ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  operation text not null check (operation in ('assistant', 'voice')),
  created_at timestamptz not null default now()
);

alter table public.afriflow_ai_usage enable row level security;
revoke all on table public.afriflow_ai_usage from anon, authenticated;
revoke all on sequence public.afriflow_ai_usage_id_seq from anon, authenticated;
create index if not exists afriflow_ai_usage_user_operation_created_idx
  on public.afriflow_ai_usage (user_id, operation, created_at desc);

create or replace function public.afriflow_consume_ai_quota(p_user_id uuid, p_operation text)
returns table(allowed boolean, remaining integer, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit integer;
  v_window interval;
  v_window_start timestamptz;
  v_used integer;
begin
  if p_user_id is null or p_operation not in ('assistant', 'voice') then
    raise exception 'invalid AI quota request';
  end if;

  if p_operation = 'voice' then
    v_limit := 10;
  else
    v_limit := 60;
  end if;
  v_window := interval '1 day';
  v_window_start := date_trunc('day', now());

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_operation || ':' || v_window_start::text, 0));

  select count(*)::integer into v_used
  from public.afriflow_ai_usage
  where user_id = p_user_id and operation = p_operation and created_at >= v_window_start;

  if v_used >= v_limit then
    return query select false, 0,
      greatest(1, extract(epoch from ((v_window_start + v_window) - now()))::integer);
    return;
  end if;

  insert into public.afriflow_ai_usage (user_id, operation) values (p_user_id, p_operation);
  return query select true, v_limit - v_used - 1, 0;
end;
$$;

revoke all on function public.afriflow_consume_ai_quota(uuid, text) from public, anon, authenticated;
grant execute on function public.afriflow_consume_ai_quota(uuid, text) to service_role;
