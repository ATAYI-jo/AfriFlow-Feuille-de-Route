-- Partner claims: partner owns the allocation; admins review; no invented batch data.
create unique index if not exists af_partner_order_owner_unique
 on public.afriflow_partner_orders(id,partner_user_id);

create table if not exists public.afriflow_partner_disputes (
 id uuid primary key default gen_random_uuid(),
 partner_user_id uuid not null references auth.users(id),
 order_id uuid not null,
 category text not null check(category in ('qualite','quantite','livraison','emballage','tracabilite','autre')),
 description text not null check(char_length(trim(description)) between 15 and 3000),
 batch_reference text check(batch_reference is null or char_length(batch_reference)<=100),
 status text not null default 'open' check(status in ('open','in_review','resolved','rejected')),
 admin_response text check(admin_response is null or char_length(admin_response)<=3000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 resolved_at timestamptz,
 foreign key (order_id,partner_user_id) references public.afriflow_partner_orders(id,partner_user_id)
);
create schema if not exists afriflow_private;
create or replace function afriflow_private.is_admin()
returns boolean language sql stable security definer set search_path='' as $$
 select (select auth.uid()) is not null and exists(
  select 1 from public.afriflow_admins a
  join auth.users u on lower(u.email)=lower(a.email)
  where u.id=(select auth.uid())
 );
$$;
revoke all on function afriflow_private.is_admin() from public,anon;
grant usage on schema afriflow_private to authenticated;
grant execute on function afriflow_private.is_admin() to authenticated;
alter table public.afriflow_partner_disputes enable row level security;
revoke all on public.afriflow_partner_disputes from anon;
grant select,insert,update on public.afriflow_partner_disputes to authenticated;
create policy af_dispute_partner_read on public.afriflow_partner_disputes for select to authenticated
 using(partner_user_id=(select auth.uid()));
create policy af_dispute_admin_read on public.afriflow_partner_disputes for select to authenticated
 using((select afriflow_private.is_admin()));
create policy af_dispute_partner_insert on public.afriflow_partner_disputes for insert to authenticated
 with check(partner_user_id=(select auth.uid()) and status='open' and admin_response is null and resolved_at is null);
create policy af_dispute_admin_update on public.afriflow_partner_disputes for update to authenticated
 using((select afriflow_private.is_admin()))
 with check((select afriflow_private.is_admin()));

create table if not exists public.afriflow_partner_dispute_audit(
 id bigint generated always as identity primary key,
 dispute_id uuid not null references public.afriflow_partner_disputes(id) on delete cascade,
 actor_user_id uuid not null references auth.users(id),
 previous_status text not null,
 new_status text not null,
 response text,
 changed_at timestamptz not null default now()
);
alter table public.afriflow_partner_dispute_audit enable row level security;
grant select on public.afriflow_partner_dispute_audit to authenticated;
create policy af_dispute_audit_read on public.afriflow_partner_dispute_audit for select to authenticated
 using((select afriflow_private.is_admin()) or exists(
  select 1 from public.afriflow_partner_disputes d where d.id=dispute_id and d.partner_user_id=(select auth.uid())
 ));
create or replace function public.af_dispute_audit_update()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.id<>new.id or old.order_id<>new.order_id or old.partner_user_id<>new.partner_user_id
 or old.category<>new.category or old.description<>new.description
 or old.batch_reference is distinct from new.batch_reference or old.created_at<>new.created_at then
  raise exception 'Identité et contenu de la contestation non modifiables';
 end if;
 new.updated_at=now();
 if new.status in ('resolved','rejected') then new.resolved_at=coalesce(new.resolved_at,now());
 else new.resolved_at=null; end if;
 return new;
end;
$$;
create trigger af_dispute_guard before update on public.afriflow_partner_disputes
 for each row execute function public.af_dispute_audit_update();
create or replace function afriflow_private.log_dispute_decision()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.status is distinct from new.status or old.admin_response is distinct from new.admin_response then
  insert into public.afriflow_partner_dispute_audit
   (dispute_id,actor_user_id,previous_status,new_status,response)
  values(new.id,auth.uid(),old.status,new.status,new.admin_response);
 end if;
 return new;
end;
$$;
revoke all on function afriflow_private.log_dispute_decision() from public,anon,authenticated;
create trigger af_dispute_audit after update on public.afriflow_partner_disputes
 for each row execute function afriflow_private.log_dispute_decision();
