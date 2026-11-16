begin;
create table public.ip_live_usage_events (
 run_id uuid not null references public.ip_live_runs(id) on delete cascade,
 event_key text not null check(length(event_key) between 1 and 120),
 kind text not null check(kind in ('voice','backend')),
 model text not null check(length(model) between 1 and 120),
 status text not null check(status in ('pending','estimated','reported','unconfirmed','unpriced')),
 usage jsonb not null default '{}', rates jsonb not null default '{}',
 usd numeric(16,9) check(usd>=0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(run_id,event_key)
);
alter table public.ip_live_usage_events enable row level security;
revoke all on public.ip_live_usage_events from public,anon,authenticated;
grant all on public.ip_live_usage_events to service_role;
create function public.ip_live_usage_service(p_action text,p_actor jsonb,p_body jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare owner_id text; v_run uuid:=(p_body->>'runId')::uuid; result jsonb;
begin
 select student_id into owner_id from public.ip_live_runs where id=v_run;
 if owner_id is null then raise exception 'run_unavailable';end if;
 if p_action='record' then
  if p_actor->>'type' is distinct from 'server' then raise exception 'forbidden';end if;
  insert into public.ip_live_usage_events(run_id,event_key,kind,model,status,usage,rates,usd)
   values(v_run,p_body->>'eventKey',p_body->>'kind',p_body->>'model',p_body->>'status',coalesce(p_body->'usage','{}'),coalesce(p_body->'rates','{}'),(p_body->>'usd')::numeric)
   on conflict(run_id,event_key) do update set
    status=excluded.status,usage=excluded.usage,rates=excluded.rates,usd=excluded.usd,updated_at=now()
    where ip_live_usage_events.status<>'reported' or excluded.status='reported';
  return jsonb_build_object('ok',true);
 elsif p_action='get' then
  if coalesce((p_actor->>'type' in ('admin','server') or (p_actor->>'type'='student' and p_actor->>'id'=owner_id)),false) is not true then raise exception 'forbidden';end if;
  select jsonb_build_object('currency','USD','confirmedUsd',coalesce(sum(usd) filter(where status='reported'),0),
   'estimatedUsd',coalesce(sum(usd) filter(where status='estimated'),0),
   'unconfirmedEvents',count(*) filter(where status not in ('reported','estimated') or usd is null),
   'fullyConfirmed',count(*)>0 and bool_and(status='reported' and usd is not null),
   'totalUsd',case when count(*)>0 and bool_and(status='reported' and usd is not null) then sum(usd) else null end,
   'events',coalesce(jsonb_agg(jsonb_build_object('eventKey',event_key,'kind',kind,'model',model,'status',status,'usage',usage,'rates',rates,'usd',usd) order by created_at),'[]'))
   into result from public.ip_live_usage_events where run_id=v_run;
  return result;
 end if;
 raise exception 'unsupported_action';
end $$;
revoke all on function public.ip_live_usage_service(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ip_live_usage_service(text,jsonb,jsonb) to service_role;
commit;
