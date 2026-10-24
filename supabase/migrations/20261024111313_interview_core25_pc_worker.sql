-- Outbound-only worker; service_role only. Existing answers and reports are preserved.
alter table public.ip_pa_diagnoses add column worker_queued boolean not null default false;
alter table public.ip_pa_diagnoses add column worker_lease uuid;
create index ip_pa_pc_queue on public.ip_pa_diagnoses(created_at)
 where status='running' and worker_queued and worker_lease is null;
create table public.ip_pa_worker_presence (engine_version text primary key,seen_at timestamptz not null default now());
alter table public.ip_pa_worker_presence enable row level security;
revoke all on public.ip_pa_worker_presence from public,anon,authenticated;
grant select,insert,update on public.ip_pa_worker_presence to service_role;

create function public.ip_pa_pc_service(p_action text,p_actor jsonb,p_body jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_result jsonb;v_engine text:=p_body->>'engineVersion';v_ready boolean;
begin
 if p_actor->>'type' is distinct from 'student' then raise exception 'forbidden';end if;
 perform ip_service('bootstrap',p_actor,'{}');
 if length(coalesce(v_engine,'')) not between 1 and 160 then raise exception 'invalid_request';end if;
 select exists(select 1 from ip_pa_worker_presence where engine_version=v_engine and seen_at>now()-interval '60 seconds') into v_ready;
 if p_action='status' then return jsonb_build_object('ok',true,'ready',v_ready);end if;
 if p_action<>'enqueue' then raise exception 'unsupported_action';end if;
 if not v_ready then raise exception 'diagnosis_worker_offline';end if;
 -- Existing admission lock covers cache reuse, ownership and daily/concurrency limits.
 v_result:=ip_pa_diagnosis_service('claim',p_actor,p_body);
 if (v_result->>'claimed')::boolean then
  update ip_pa_diagnoses set worker_queued=true where id=(v_result->>'diagnosisId')::uuid;
 end if;
 return ip_pa_diagnosis_service('get',p_actor,p_body);
end;$$;
revoke all on function public.ip_pa_pc_service(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ip_pa_pc_service(text,jsonb,jsonb) to service_role;

create function public.ip_pa_worker_service(p_action text,p_body jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_engine text:=p_body->>'engineVersion';v_run ip_pa_diagnoses;
 v_jobs jsonb:='[]';v_capacity integer;v_result jsonb;
begin
 if length(coalesce(v_engine,'')) not between 1 and 160 then raise exception 'invalid_request';end if;
 if p_action not in ('poll','inspect','finish') then raise exception 'unsupported_action';end if;
 perform pg_advisory_xact_lock(182734,1);
 update ip_pa_diagnoses set status='failed',error='diagnosis_timeout',finished_at=now() where status='running' and expires_at<=now();
 if p_action='poll' then
  v_capacity:=(p_body->>'capacity')::integer;
  if v_capacity is null or v_capacity not between 0 and 3 then raise exception 'invalid_request';end if;
  insert into ip_pa_worker_presence(engine_version,seen_at) values(v_engine,now()) on conflict(engine_version) do update set seen_at=excluded.seen_at;
  if not exists(select 1 from ip_pa_settings where id and enabled) then return jsonb_build_object('ok',true,'jobs',v_jobs);end if;
  for v_run in select * from ip_pa_diagnoses where status='running' and worker_queued and worker_lease is null
   and engine_version=v_engine order by created_at limit v_capacity for update loop
   -- Never redeliver after an ambiguous PC failure; the student explicitly retries.
   update ip_pa_diagnoses set worker_lease=gen_random_uuid() where id=v_run.id returning * into v_run;
   v_jobs:=v_jobs||jsonb_build_array(jsonb_build_object('id',v_run.id,'lease',v_run.worker_lease,
    'snapshot',v_run.snapshot,'expiresAt',v_run.expires_at,'engineVersion',v_run.engine_version));
  end loop;
  return jsonb_build_object('ok',true,'jobs',v_jobs);
 end if;
 select * into v_run from ip_pa_diagnoses where id=(p_body->>'id')::uuid and worker_queued
  and engine_version=v_engine and worker_lease=(p_body->>'lease')::uuid for update;
 if not found or v_run.status='failed' then raise exception 'lease_lost';end if;
 if p_action='inspect' then return jsonb_build_object('ok',true,'status',v_run.status,'snapshot',v_run.snapshot);end if;
 if v_run.status='completed' then return jsonb_build_object('ok',true,'status','completed');end if;
 v_result:=ip_pa_diagnosis_service('finish',jsonb_build_object('type','student','id',v_run.student_id),
  jsonb_build_object('unitId',v_run.unit_id,'diagnosisId',v_run.id)||case when p_body ? 'error'
   then jsonb_build_object('error','diagnosis_unavailable') else jsonb_build_object('report',p_body->'report') end);
 return jsonb_build_object('ok',true,'status',v_result->'diagnosis'->>'status');
end;$$;
revoke all on function public.ip_pa_worker_service(text,jsonb) from public,anon,authenticated;
grant execute on function public.ip_pa_worker_service(text,jsonb) to service_role;
