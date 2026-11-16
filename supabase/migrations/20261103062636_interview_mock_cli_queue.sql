-- Optional PC processing. Existing API mode and existing student records are preserved.
begin;
create table public.ip_mock_cli_jobs (
 id uuid primary key default gen_random_uuid(),kind text not null check(kind in ('job','personality','report')),
 run_id uuid not null,student_id text not null references public.students(id),snapshot jsonb not null,
 state text not null default 'queued' check(state in ('queued','running','completed','failed','unknown','cancelled')),
 lease uuid,lease_until timestamptz,started_at timestamptz,completed_at timestamptz,
 created_at timestamptz not null default now(),retain_until timestamptz not null,report jsonb,
 unique(kind,run_id)
);
create index ip_mock_cli_pending on public.ip_mock_cli_jobs(state,created_at);
alter table public.ip_mock_cli_jobs enable row level security;
revoke all on public.ip_mock_cli_jobs from public,anon,authenticated;
grant select,insert,update,delete on public.ip_mock_cli_jobs to service_role;
create table public.ip_mock_cli_presence(id boolean primary key default true check(id),last_seen_at timestamptz not null);
alter table public.ip_mock_cli_presence enable row level security;
revoke all on public.ip_mock_cli_presence from public,anon,authenticated;
grant select,insert,update on public.ip_mock_cli_presence to service_role;

create function public.ip_mock_cli_queue_service(p_action text,p_actor jsonb,p_body jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare j public.ip_mock_cli_jobs; src jsonb; owner_id text; expiry timestamptz; result jsonb; allowed boolean; k text:=p_body->>'kind';
begin
 if coalesce(p_actor->>'id','')='' then raise exception 'unauthorized'; end if;
 if coalesce(p_actor->>'type','') not in ('student','server','worker') then raise exception 'forbidden'; end if;
 if p_action in ('heartbeat','poll','complete','fail','internal_get') and p_actor->>'type' not in ('worker','server') then raise exception 'forbidden'; end if;
 if p_action='status' then
  return jsonb_build_object('ok',true,'online',exists(select 1 from public.ip_mock_cli_presence where last_seen_at>now()-interval '45 seconds'));
 end if;
 if p_action in ('heartbeat','poll') then
  insert into public.ip_mock_cli_presence(id,last_seen_at) values(true,now()) on conflict(id) do update set last_seen_at=now();
  if p_body ? 'id' then
   update public.ip_mock_cli_jobs set lease_until=least(retain_until,started_at+interval '25 minutes',now()+interval '60 seconds')
    where id=(p_body->>'id')::uuid and state='running' and lease=(p_body->>'lease')::uuid and lease_until>now();
   if not found then raise exception 'lease_lost'; end if;
  end if;
 end if;
 -- An expired execution is never returned to the queue: its CLI may already have run.
 update public.ip_mock_cli_jobs set state='unknown' where state='running' and lease_until<=now();
 if p_action='heartbeat' then return jsonb_build_object('ok',true); end if;
 if p_action='enqueue' then
  if k='job' and p_actor->>'type'='server' then select to_jsonb(r),r.student_id,r.retain_until into src,owner_id,expiry from public.ip_job_exam_attempts r where r.id=(p_body->>'runId')::uuid and r.state='evaluating';
  elsif k='personality' and p_actor->>'type'='server' then select to_jsonb(r),r.student_id,r.retain_until into src,owner_id,expiry from public.ip_personality_attempts r where r.id=(p_body->>'runId')::uuid and r.state='evaluating';
  elsif k='report' and p_actor->>'type'='student' then select to_jsonb(r),r.student_id,r.retain_until into src,owner_id,expiry from public.ip_live_runs r where r.id=(p_body->>'runId')::uuid and r.student_id=p_actor->>'id' and r.state in ('completed','interrupted') and exists(select 1 from jsonb_array_elements(r.turns) t where btrim(coalesce(t->>'answer',''))<>'');
  else raise exception 'forbidden'; end if;
  if src is null or expiry<=now() then raise exception 'not_found'; end if;
  if (public.ip_mock_access_service('mock_status',jsonb_build_object('type','student','id',owner_id),'{}')->>'allowed')::boolean is not true then raise exception 'forbidden'; end if;
  perform pg_catalog.pg_advisory_xact_lock(214637018);
  select * into j from public.ip_mock_cli_jobs where kind=k and run_id=(p_body->>'runId')::uuid;
  if found then return jsonb_build_object('ok',true,'id',j.id,'state',j.state); end if;
  if (select count(*) from public.ip_mock_cli_jobs where student_id=owner_id and state in ('queued','running'))>=6 then raise exception 'queue_full'; end if;
  if (select count(*) from public.ip_mock_cli_jobs where student_id=owner_id and created_at>=date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')>=9 then raise exception 'daily_limit'; end if;
  insert into public.ip_mock_cli_jobs(kind,run_id,student_id,snapshot,retain_until) values(k,(p_body->>'runId')::uuid,owner_id,src,expiry) returning * into j;
  return jsonb_build_object('ok',true,'id',j.id,'state',j.state);
 elsif p_action='poll' then
  perform pg_catalog.pg_advisory_xact_lock(214637018);
  if exists(select 1 from public.ip_mock_cli_jobs where state='running') then return jsonb_build_object('ok',true,'jobs','[]'::jsonb); end if;
  for j in select * from public.ip_mock_cli_jobs where state='queued' and (not p_body ? 'kinds' or p_body->'kinds' ? kind) order by created_at,id for update loop
   allowed:=(public.ip_mock_access_service('mock_status',jsonb_build_object('type','student','id',j.student_id),'{}')->>'allowed')::boolean;
   if not coalesce(allowed,false) or j.retain_until<=now() then update public.ip_mock_cli_jobs set state='cancelled' where id=j.id;continue; end if;
   update public.ip_mock_cli_jobs set state='running',lease=gen_random_uuid(),started_at=now(),lease_until=least(retain_until,now()+interval '60 seconds') where id=j.id returning * into j;
   return jsonb_build_object('ok',true,'jobs',jsonb_build_array(jsonb_build_object('id',j.id,'kind',j.kind,'runId',j.run_id,'lease',j.lease,'snapshot',j.snapshot-'student_id')));
  end loop;
  return jsonb_build_object('ok',true,'jobs','[]'::jsonb);
 elsif p_action='get' then
  if p_actor->>'type' not in ('student','server') then raise exception 'forbidden'; end if;
  select * into j from public.ip_mock_cli_jobs where kind=k and run_id=(p_body->>'runId')::uuid and retain_until>now() and (p_actor->>'type'='server' or student_id=p_actor->>'id');
  if not found then return jsonb_build_object('ok',true,'processing',null); end if;
  -- Keep the original asynchronous attempt alive while a valid queue owns it.
  if j.state in ('queued','running') then
   if j.kind='job' then update public.ip_job_exam_attempts set claim_at=now() where id=j.run_id and state='evaluating';
   elsif j.kind='personality' then update public.ip_personality_attempts set claim_at=now() where id=j.run_id and state='evaluating'; end if;
  elsif j.state in ('failed','unknown','cancelled') then
   if j.kind='job' then update public.ip_job_exam_attempts set state='unknown' where id=j.run_id and state='evaluating';
   elsif j.kind='personality' then update public.ip_personality_attempts set state='unknown' where id=j.run_id and state='evaluating'; end if;
  end if;
  return jsonb_build_object('ok',true,'processing',jsonb_build_object('id',j.id,'state',j.state,'mode','pc','report',case when j.state='completed' and j.kind='report' then j.report-'audit' else null end));
 elsif p_action='purge' then
  if p_actor->>'type'<>'server' then raise exception 'forbidden'; end if;
  delete from public.ip_mock_cli_jobs where retain_until<=now();return jsonb_build_object('ok',true);
 end if;
 select * into j from public.ip_mock_cli_jobs where id=(p_body->>'id')::uuid for update;
 if not found or j.retain_until<=now() then raise exception 'not_found'; end if;
 if j.lease is distinct from (p_body->>'lease')::uuid then raise exception 'lease_lost'; end if;
 if p_action='internal_get' then return jsonb_build_object('ok',true,'job',jsonb_build_object('id',j.id,'kind',j.kind,'snapshot',j.snapshot,'state',j.state)); end if;
 if j.state='completed' and p_action='complete' then
  if j.report is distinct from p_body->'report' then raise exception 'idempotency_conflict'; end if;
  return jsonb_build_object('ok',true);
 end if;
 if j.state<>'running' or j.lease_until<=now() then raise exception 'lease_lost'; end if;
 if (public.ip_mock_access_service('mock_status',jsonb_build_object('type','student','id',j.student_id),'{}')->>'allowed')::boolean is not true then raise exception 'forbidden'; end if;
 if p_action='fail' then update public.ip_mock_cli_jobs set state='failed' where id=j.id;return jsonb_build_object('ok',true); end if;
 if p_action<>'complete' then raise exception 'unsupported_action'; end if;
 if jsonb_typeof(p_body->'report') is distinct from 'object' or p_body#>'{report,grade}' is distinct from 'null'::jsonb or p_body#>'{report,score}' is distinct from 'null'::jsonb then raise exception 'invalid_output'; end if;
 if j.kind='job' then result:=public.ip_job_exam_service('complete',jsonb_build_object('type','server','id','job-exam'),jsonb_build_object('id',j.run_id,'report',p_body->'report'));
 elsif j.kind='personality' then result:=public.ip_personality_service('complete',jsonb_build_object('type','server','id','personality-practice'),jsonb_build_object('id',j.run_id,'report',p_body->'report')); end if;
 update public.ip_mock_cli_jobs set state='completed',report=p_body->'report',completed_at=now() where id=j.id;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.ip_mock_cli_queue_service(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ip_mock_cli_queue_service(text,jsonb,jsonb) to service_role;
commit;
