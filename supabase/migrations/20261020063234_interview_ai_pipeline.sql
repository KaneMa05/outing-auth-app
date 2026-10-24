-- Additive, disabled by default. Apply only after release approval.
begin;
create table public.ip_ai_settings (
 id boolean primary key default true check(id),
 enabled boolean not null default false,
 bundle_hash text not null default '',
 core_question_ids text[] not null default '{}',
 daily_call_limit integer not null default 20 check(daily_call_limit between 1 and 10000),
 max_pending_per_student integer not null default 66 check(max_pending_per_student between 30 and 300),
 requests_per_day integer not null default 40 check(requests_per_day between 1 and 1000)
);
insert into public.ip_ai_settings(id) values(true);
create table public.ip_ai_workers (
 id uuid primary key default gen_random_uuid(),
 label text not null,
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 student_ids text[] not null check(cardinality(student_ids)>0),
 expires_at timestamptz not null,
 revoked_at timestamptz,
 last_seen_at timestamptz
);
create table public.ip_ai_requests (
 id uuid primary key default gen_random_uuid(),
 student_id text not null references public.ip_members(student_id) on delete cascade,
 kind text not null check(kind in ('self_intro','motivation','public_service','core30')),
 request_key text not null,
 fingerprint text not null,
 source_hash text not null,
 sources jsonb not null,
 bundle_hash text not null,
 created_at timestamptz not null default now(),
 last_claimed_at timestamptz,
 unique(student_id,request_key),
 unique(student_id,fingerprint)
);
create table public.ip_ai_jobs (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references public.ip_ai_requests(id) on delete cascade,
 item_key text not null,
 position integer not null,
 question text not null,
 question_revision integer not null default 1,
 status text not null default 'QUEUED' check(status in
  ('QUEUED','PROCESSING','BLOCKED','NEEDS_INPUT','COMPLETED','FAILED','CANCELED')),
 reason text,
 worker_id uuid references public.ip_ai_workers(id),
 lease_token uuid,
 lease_epoch integer not null default 0,
 lease_expires_at timestamptz,
 execution_id uuid,
 attempts integer not null default 0,
 result jsonb,
 result_hash text,
 sources_override jsonb,
 source_hash_override text,
 updated_at timestamptz not null default now(),
 unique(request_id,item_key)
);
create index ip_ai_jobs_pending on public.ip_ai_jobs(status,updated_at);
create table public.ip_ai_executions (
 id uuid primary key,
 job_id uuid not null references public.ip_ai_jobs(id) on delete cascade,
 worker_id uuid not null references public.ip_ai_workers(id),
 lease_epoch integer not null,
 dispatch_state text not null default 'RESERVED',
 session_ref text,
 created_at timestamptz not null default now(),
 finished_at timestamptz
);
create index ip_ai_executions_day on public.ip_ai_executions(created_at);
create table public.ip_ai_retries (
 request_id uuid not null references public.ip_ai_requests(id) on delete cascade,
 request_key text not null,
 fingerprint text not null,
 created_at timestamptz not null default now(),
 primary key(request_id,request_key)
);
create table public.ip_ai_events (
 id bigint generated always as identity primary key,
 request_id uuid references public.ip_ai_requests(id) on delete cascade,
 job_id uuid references public.ip_ai_jobs(id) on delete cascade,
 actor text not null,
 event text not null,
 at timestamptz not null default now()
);
do $$
declare t text;
begin
 foreach t in array array['ip_ai_settings','ip_ai_workers','ip_ai_requests','ip_ai_jobs','ip_ai_executions','ip_ai_events','ip_ai_retries'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to service_role',t);
 end loop;
end $$;
grant usage,select on sequence public.ip_ai_events_id_seq to service_role;

-- Text-only, owner-selected evidence. No sample answers, teacher feedback, or identity fields.
create function public.ip_ai_sources(p_student text,p_kind text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare profile jsonb; notes jsonb; section text; rowdata jsonb; kv record; outdata jsonb:='[]';
 fields text[]; chosen_topic text;
begin
 select content into profile from ip_life_profiles where student_id=p_student;
 if length(btrim(coalesce(profile->>'background','')))>0 then
  outdata:=outdata||jsonb_build_array(jsonb_build_object('id','life:background','text',profile->>'background','experience_id',null));
 end if;
 foreach section in array array['experiences','qualifications','affiliations','awards'] loop
  fields:=case section
   when 'experiences' then array['period','title','situation','action','result','learning']
   when 'qualifications' then array['type','date','name','effort']
   when 'affiliations' then array['type','period','role','activities']
   else array['date','name','rank','contribution','action'] end;
  for rowdata in select value from jsonb_array_elements(coalesce(profile->section,'[]')) loop
   for kv in select key,value from jsonb_each_text(rowdata) where key=any(fields) loop
    if length(btrim(coalesce(kv.value,'')))>0 then
     outdata:=outdata||jsonb_build_array(jsonb_build_object(
      'id','life:'||section||':'||(rowdata->>'id')||':'||kv.key,'text',kv.value,
      'experience_id',case when section='experiences' then rowdata->>'id' else null end));
    end if;
   end loop;
  end loop;
 end loop;
 chosen_topic:=case p_kind when 'self_intro' then 'self' when 'motivation' then 'motivation' when 'public_service' then 'public' else null end;
 for rowdata in select jsonb_build_object('id',n.topic_id,'fields',n.fields) from ip_notes n
   join ip_topics t on t.id=n.topic_id
   where n.student_id=p_student and t.active and (p_kind='core30' or n.topic_id=chosen_topic) loop
  for kv in select key,value from jsonb_each_text(rowdata->'fields')
   where key in ('situation','role','action','result','learning','position','reason','application','criteria','steps','caution') loop
   if length(btrim(coalesce(kv.value,'')))>0 then
    outdata:=outdata||jsonb_build_array(jsonb_build_object('id','note:'||(rowdata->>'id')||':'||kv.key,'text',kv.value,'experience_id',null));
   end if;
  end loop;
 end loop;
 select coalesce(jsonb_agg(value order by value->>'id'),'[]') into outdata from jsonb_array_elements(outdata);
 return outdata;
end $$;

create function public.ip_ai_source_hash(p_sources jsonb)
returns text language sql immutable strict as $$
 select encode(sha256(convert_to(p_sources::text,'UTF8')),'hex')
$$;

create function public.ip_ai_service(p_action text,p_actor jsonb,p_body jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
 sid text:=p_actor->>'id'; cfg ip_ai_settings; req ip_ai_requests;
 sources jsonb; sh text; v_fingerprint text; kind text:=p_body->>'kind';
 qs jsonb; q jsonb; result jsonb; exp_count integer; rid uuid; target ip_ai_jobs;
 wid uuid; row_count integer; today timestamptz:=date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
begin
 if coalesce(sid,'')='' then raise exception 'unauthorized'; end if;
 select * into cfg from ip_ai_settings where id;
 if p_action like 'admin_%' then
  if p_actor->>'type' is distinct from 'admin' then raise exception 'forbidden'; end if;
  if p_action='admin_configure' then
   select * into cfg from ip_ai_settings where id for update;
   if p_body ? 'coreQuestionIds' then
    if jsonb_typeof(p_body->'coreQuestionIds') is distinct from 'array'
     or jsonb_array_length(p_body->'coreQuestionIds')<>30
     or (select count(distinct value) from jsonb_array_elements_text(p_body->'coreQuestionIds'))<>30
     or exists(select 1 from jsonb_array_elements_text(p_body->'coreQuestionIds') i
      where not exists(select 1 from ip_questions where id=i and status='published' and category='personality'))
    then raise exception 'invalid_core30'; end if;
    update ip_ai_settings set core_question_ids=array(select jsonb_array_elements_text(p_body->'coreQuestionIds')) where id;
   end if;
   if p_body ? 'bundleHash' then
    if p_body->>'bundleHash' !~ '^[a-f0-9]{64}$' then raise exception 'invalid_request'; end if;
    if p_body->>'bundleHash'<>cfg.bundle_hash then
     if exists(select 1 from ip_ai_jobs where status='PROCESSING' or
       (status='BLOCKED' and reason='dispatch_unknown')) then raise exception 'unsafe_retry'; end if;
     update ip_ai_jobs set status='CANCELED',reason='bundle_changed',updated_at=now()
      where status in ('QUEUED','BLOCKED');
    end if;
    update ip_ai_settings set bundle_hash=p_body->>'bundleHash' where id;
   end if;
   if p_body ? 'dailyCallLimit' then
    update ip_ai_settings set daily_call_limit=(p_body->>'dailyCallLimit')::integer where id;
   end if;
   if p_body ? 'enabled' then
    if jsonb_typeof(p_body->'enabled')<>'boolean' then raise exception 'invalid_request'; end if;
    if (p_body->>'enabled')::boolean and
      not exists(select 1 from ip_ai_settings where bundle_hash ~ '^[a-f0-9]{64}$') then raise exception 'bundle_unconfigured'; end if;
    update ip_ai_settings set enabled=(p_body->>'enabled')::boolean where id;
   end if;
   return jsonb_build_object('ok',true,'settings',(select to_jsonb(s) from ip_ai_settings s where id));
  elsif p_action='admin_register_worker' then
   if jsonb_typeof(p_body->'studentIds') is distinct from 'array' or jsonb_array_length(p_body->'studentIds')=0
     or exists(select 1 from jsonb_array_elements_text(p_body->'studentIds') i where not exists(select 1 from ip_members where student_id=i))
     or length(coalesce(p_body->>'label','')) not between 1 and 80 then raise exception 'invalid_request'; end if;
   insert into ip_ai_workers(label,token_hash,student_ids,expires_at)
    values(p_body->>'label',p_body->>'tokenHash',array(select jsonb_array_elements_text(p_body->'studentIds')),
      now()+interval '30 days') returning id into wid;
   return jsonb_build_object('ok',true,'workerId',wid);
  elsif p_action='admin_revoke_worker' then
   update ip_ai_workers set revoked_at=now() where id=(p_body->>'workerId')::uuid;
   return jsonb_build_object('ok',true);
  elsif p_action='admin_retry_job' then
   -- Human must resolve an uncertain dispatch. Never blindly restart it.
   select * into target from ip_ai_jobs where id=(p_body->>'jobId')::uuid for update;
   if not found then raise exception 'not_found'; end if;
   if target.status not in ('FAILED','BLOCKED') or target.reason='dispatch_unknown' or target.attempts>=2
    then raise exception 'unsafe_retry'; end if;
   update ip_ai_jobs set status='QUEUED',reason=null,execution_id=null,worker_id=null,lease_token=null,
    lease_expires_at=null,updated_at=now() where id=target.id;
   insert into ip_ai_events(request_id,job_id,actor,event) values(target.request_id,target.id,sid,'retry');
   return jsonb_build_object('ok',true);
  elsif p_action='admin_resolve_unknown' then
   select * into target from ip_ai_jobs where id=(p_body->>'jobId')::uuid for update;
   if not found then raise exception 'not_found'; end if;
   if target.status<>'BLOCKED' or target.reason<>'dispatch_unknown'
    or target.execution_id is distinct from (p_body->>'executionId')::uuid
    or p_body->'confirmedStopped' is distinct from 'true'::jsonb then raise exception 'unsafe_retry'; end if;
   -- Operator must inspect/stop the actual desktop turn before making this attestation.
   update ip_ai_jobs set status='CANCELED',reason='operator_resolved',lease_token=null,
    lease_expires_at=null,updated_at=now() where id=target.id;
   update ip_ai_executions set dispatch_state='OPERATOR_STOPPED',finished_at=now() where id=target.execution_id;
   insert into ip_ai_events(request_id,job_id,actor,event)
    values(target.request_id,target.id,sid,'unknown_confirmed_stopped');
   return jsonb_build_object('ok',true);
  elsif p_action='admin_overview' then
   return jsonb_build_object('ok',true,'enabled',cfg.enabled,'dailyCallLimit',cfg.daily_call_limit,
    'todayCalls',(select count(*) from ip_ai_executions where created_at>=today),
    'counts',(select coalesce(jsonb_object_agg(status,n),'{}') from (select status,count(*) n from ip_ai_jobs group by status) x),
    'attention',(select coalesce(jsonb_agg(x),'[]') from
      (select id,request_id,status,reason,execution_id,attempts,updated_at from ip_ai_jobs
       where status in ('BLOCKED','FAILED') order by updated_at limit 100) x),
    'workers',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'label',label,'expiresAt',expires_at,'revokedAt',revoked_at,'lastSeenAt',last_seen_at)),'[]') from ip_ai_workers));
  end if;
  raise exception 'unsupported_action';
 end if;
 if p_actor->>'type' is distinct from 'student' then raise exception 'forbidden'; end if;
 -- Same enrollment lock as life_save. Actor is verified by the existing server auth.
 perform 1 from ip_members where student_id=sid for update;
 perform ip_service('bootstrap',p_actor,'{}');
 if p_action in ('prepare','generate') then
  if kind is null or kind not in ('self_intro','motivation','public_service','core30') then raise exception 'invalid_request'; end if;
  sources:=ip_ai_sources(sid,kind); sh:=ip_ai_source_hash(sources);
  select count(*) into exp_count from (
   select value->>'experience_id' id from jsonb_array_elements(sources)
   where value->>'experience_id' is not null
   group by value->>'experience_id'
   having count(*) filter(where value->>'id' like '%:situation')>0
    and count(*) filter(where value->>'id' like '%:action')>0
    and count(*) filter(where value->>'id' like '%:result')>0
  ) x;
  -- Do not count identical copied situations/actions/results as distinct experiences.
  select count(distinct signature) into exp_count from (
   select string_agg(value->>'text','|' order by split_part(value->>'id',':',4)) signature
   from jsonb_array_elements(sources) where value->>'experience_id' is not null
    and split_part(value->>'id',':',4) in ('situation','action','result')
   group by value->>'experience_id' having count(*)=3
  ) x;
  result:=jsonb_build_object('ok',true,'sourceHash',sh,'experienceCount',exp_count,'enabled',cfg.enabled,
   'ready',jsonb_array_length(sources)>0 and (kind<>'self_intro' or exp_count>=3));
  if p_action='prepare' then return result; end if;
  if not cfg.enabled then raise exception 'automation_disabled'; end if;
  if p_body->>'sourceHash' is distinct from sh then raise exception 'source_changed'; end if;
  if not (result->>'ready')::boolean then return result||jsonb_build_object('state','NEEDS_INPUT'); end if;
  if length(coalesce(p_body->>'requestKey','')) not between 8 and 100 then raise exception 'invalid_request'; end if;
  if kind='core30' then
   select coalesce(jsonb_agg(jsonb_build_object('key',q.id,'question',q.prompt,'revision',q.revision,'position',i.n) order by i.n),'[]')
    into qs from unnest(cfg.core_question_ids) with ordinality i(id,n)
    join ip_questions q on q.id=i.id join ip_members m on m.student_id=sid
    where q.status='published' and q.category='personality' and (cardinality(q.tracks)=0 or m.track=any(q.tracks));
   if jsonb_array_length(qs)<>30 then raise exception 'invalid_core30'; end if;
  else
   qs:=jsonb_build_array(jsonb_build_object('key',kind,'position',1,'revision',1,'question',
    case kind when 'self_intro' then '본인의 실제 경험 3개 이상을 포함해 자기소개를 작성해주세요.'
     when 'motivation' then '본인의 자료에 근거해 지원동기를 작성해주세요.'
     else '본인의 자료에 근거해 공직관을 작성해주세요.' end));
  end if;
  v_fingerprint:=ip_ai_source_hash(jsonb_build_array(sh,kind,qs,cfg.bundle_hash,
    case when coalesce((p_body->>'regenerate')::boolean,false) then p_body->>'requestKey' else '' end));
  select * into req from ip_ai_requests where student_id=sid and request_key=p_body->>'requestKey';
  if found and req.fingerprint<>v_fingerprint then raise exception 'idempotency_conflict'; end if;
  select ir.* into req from ip_ai_requests ir where ir.student_id=sid and ir.fingerprint=v_fingerprint;
  if found then return jsonb_build_object('ok',true,'requestId',req.id,'reused',true); end if;
  if (select count(*) from ip_ai_requests where student_id=sid and created_at>=today)
     +(select count(*) from ip_ai_retries x join ip_ai_requests rr on rr.id=x.request_id
       where rr.student_id=sid and x.created_at>=today)>=cfg.requests_per_day
    or (select count(*) from ip_ai_jobs j join ip_ai_requests r on r.id=j.request_id
     where r.student_id=sid and j.status in ('QUEUED','PROCESSING','BLOCKED'))+jsonb_array_length(qs)>cfg.max_pending_per_student
  then raise exception 'request_limit'; end if;
  insert into ip_ai_requests(student_id,kind,request_key,fingerprint,source_hash,sources,bundle_hash)
   values(sid,kind,p_body->>'requestKey',v_fingerprint,sh,sources,cfg.bundle_hash) returning id into rid;
  for q in select value from jsonb_array_elements(qs) loop
   insert into ip_ai_jobs(request_id,item_key,position,question,question_revision)
    values(rid,q->>'key',(q->>'position')::integer,q->>'question',(q->>'revision')::integer);
  end loop;
  insert into ip_ai_events(request_id,actor,event) values(rid,sid,'generate');
  return jsonb_build_object('ok',true,'requestId',rid,'reused',false);
 elsif p_action='retry_items' then
  if not cfg.enabled then raise exception 'automation_disabled'; end if;
  select * into req from ip_ai_requests where id=(p_body->>'requestId')::uuid and student_id=sid;
  if not found then raise exception 'not_found'; end if;
  if req.bundle_hash<>cfg.bundle_hash then raise exception 'bundle_mismatch'; end if;
  if length(coalesce(p_body->>'requestKey','')) not between 8 and 100
   or jsonb_typeof(p_body->'itemKeys') is distinct from 'array'
   or jsonb_array_length(p_body->'itemKeys') not between 1 and 30
   or (select count(distinct value) from jsonb_array_elements_text(p_body->'itemKeys'))<>jsonb_array_length(p_body->'itemKeys')
   then raise exception 'invalid_request'; end if;
  sources:=ip_ai_sources(sid,req.kind); sh:=ip_ai_source_hash(sources);
  v_fingerprint:=ip_ai_source_hash(jsonb_build_array(p_body->>'sourceHash',p_body->'itemKeys'));
  if exists(select 1 from ip_ai_retries where request_id=req.id and request_key=p_body->>'requestKey') then
   if not exists(select 1 from ip_ai_retries where request_id=req.id and request_key=p_body->>'requestKey'
     and fingerprint=v_fingerprint) then raise exception 'idempotency_conflict'; end if;
   return jsonb_build_object('ok',true,'requestId',req.id,'reused',true);
  end if;
  if sh is distinct from p_body->>'sourceHash' then raise exception 'source_changed'; end if;
  if jsonb_array_length(sources)=0 then raise exception 'experience_required'; end if;
  if req.kind='self_intro' then
   select count(distinct signature) into exp_count from (
    select string_agg(value->>'text','|' order by split_part(value->>'id',':',4)) signature
    from jsonb_array_elements(sources) where value->>'experience_id' is not null
     and split_part(value->>'id',':',4) in ('situation','action','result')
    group by value->>'experience_id' having count(*)=3) x;
   if exp_count<3 then raise exception 'experience_required'; end if;
  end if;
  if (select count(*) from ip_ai_jobs j join ip_ai_requests rr on rr.id=j.request_id
      where rr.student_id=sid and j.status in ('QUEUED','PROCESSING','BLOCKED'))
      +jsonb_array_length(p_body->'itemKeys')>cfg.max_pending_per_student then raise exception 'request_limit'; end if;
  if (select count(*) from ip_ai_retries x join ip_ai_requests rr on rr.id=x.request_id
      where rr.student_id=sid and x.created_at>=today)
    +(select count(*) from ip_ai_requests where student_id=sid and created_at>=today)>=cfg.requests_per_day
    then raise exception 'request_limit'; end if;
  for q in select value from jsonb_array_elements(p_body->'itemKeys') loop
   select * into target from ip_ai_jobs where request_id=req.id and item_key=(q#>>'{}') for update;
   if not found then raise exception 'not_found'; end if;
   if target.status not in ('FAILED','NEEDS_INPUT','CANCELED')
     or (target.status='CANCELED' and target.reason is distinct from 'operator_resolved')
     or (coalesce(target.source_hash_override,req.source_hash)=sh and
       (target.status='NEEDS_INPUT' or target.attempts>=2))
     then raise exception 'unsafe_retry'; end if;
   update ip_ai_jobs set status='QUEUED',reason=null,sources_override=sources,source_hash_override=sh,
    attempts=case when coalesce(target.source_hash_override,req.source_hash)<>sh then 0 else attempts end,
    execution_id=null,worker_id=null,lease_token=null,lease_expires_at=null,result=null,result_hash=null,updated_at=now()
    where id=target.id;
   insert into ip_ai_events(request_id,job_id,actor,event) values(req.id,target.id,sid,'retry_item');
  end loop;
  insert into ip_ai_retries(request_id,request_key,fingerprint) values(req.id,p_body->>'requestKey',v_fingerprint);
  return jsonb_build_object('ok',true,'requestId',req.id,'reused',false);
 elsif p_action='requests' then
  return jsonb_build_object('ok',true,'requests',(select coalesce(jsonb_agg(x order by x->>'createdAt' desc),'[]') from
   (select jsonb_build_object('id',r.id,'kind',r.kind,'createdAt',r.created_at) x
    from ip_ai_requests r where r.student_id=sid order by r.created_at desc limit 50) a));
 elsif p_action='status' then
  select * into req from ip_ai_requests where id=(p_body->>'requestId')::uuid and student_id=sid;
  if not found then raise exception 'not_found'; end if;
  sh:=ip_ai_source_hash(ip_ai_sources(sid,req.kind));
  return jsonb_build_object('ok',true,'requestId',req.id,'kind',req.kind,
   'sourceHash',req.source_hash,'stale',exists(select 1 from ip_ai_jobs where request_id=req.id
     and coalesce(source_hash_override,req.source_hash)<>sh),
   'items',(select jsonb_agg(jsonb_build_object('id',j.id,'key',j.item_key,'position',j.position,'question',j.question,
    'status',j.status,'reason',j.reason,
    'sourceHash',coalesce(j.source_hash_override,req.source_hash),
    'stale',coalesce(j.source_hash_override,req.source_hash)<>sh,
    'result',case when j.status in ('COMPLETED','NEEDS_INPUT') then j.result else null end) order by j.position)
     from ip_ai_jobs j where j.request_id=req.id));
 end if;
 raise exception 'unsupported_action';
end $$;

-- Rechecks result ownership and source quotation at the DB boundary as well as in JS/Python.
create function public.ip_ai_validate_result(p_result jsonb,p_sources jsonb,p_kind text)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare ref jsonb; src jsonb; cover jsonb; answer text:=p_result->>'answer'; n integer;
begin
 if jsonb_typeof(p_result) is distinct from 'object' or p_result->>'schema_version' is distinct from '1.0'
  or p_result->>'status' not in ('ready','needs_input') or p_result->>'status' is null
  or jsonb_typeof(p_result->'source_refs') is distinct from 'array'
  or jsonb_typeof(p_result->'experience_coverage') is distinct from 'array'
  or jsonb_typeof(p_result->'missing') is distinct from 'array'
  or jsonb_typeof(p_result->'answer') is distinct from 'string'
  or length(answer)>8000 or octet_length(p_result::text)>65536
 then raise exception 'invalid_output'; end if;
 if p_result->>'status'='needs_input' then
  if answer<>'' or jsonb_array_length(p_result->'missing')=0 then raise exception 'invalid_output'; end if;
  return;
 end if;
 if length(btrim(answer))=0 or jsonb_array_length(p_result->'source_refs')=0 then raise exception 'invalid_output'; end if;
 for ref in select value from jsonb_array_elements(p_result->'source_refs') loop
  select value into src from jsonb_array_elements(p_sources) where value->>'id'=ref->>'source_id';
  if src is null or length(coalesce(ref->>'quote',''))=0 or strpos(src->>'text',ref->>'quote')=0
    or length(coalesce(ref->>'answer_excerpt',''))=0 or strpos(answer,ref->>'answer_excerpt')=0
  then raise exception 'invalid_evidence'; end if;
 end loop;
 if p_kind='self_intro' then
  select count(distinct value->>'experience_id') into n from jsonb_array_elements(p_result->'experience_coverage');
  if n<3 then raise exception 'experience_required'; end if;
  for cover in select value from jsonb_array_elements(p_result->'experience_coverage') loop
   if length(coalesce(cover->>'answer_excerpt',''))=0 or strpos(answer,cover->>'answer_excerpt')=0
    or not exists(select 1 from jsonb_array_elements(p_sources) s where s->>'experience_id'=cover->>'experience_id')
    or not exists(select 1 from jsonb_array_elements(p_result->'source_refs') r
     join jsonb_array_elements(p_sources) s on s->>'id'=r->>'source_id'
     where s->>'experience_id'=cover->>'experience_id' and strpos(cover->>'answer_excerpt',r->>'answer_excerpt')>0)
   then raise exception 'experience_required'; end if;
  end loop;
 end if;
end $$;

create function public.ip_ai_worker_service(p_action text,p_token_hash text,p_body jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare w ip_ai_workers; cfg ip_ai_settings; j ip_ai_jobs; r ip_ai_requests; e ip_ai_executions;
 today timestamptz:=date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
 rh text; status_text text;
begin
 select * into w from ip_ai_workers where token_hash=p_token_hash and revoked_at is null and expires_at>now() for update;
 if not found then raise exception 'unauthorized'; end if;
 update ip_ai_workers set last_seen_at=now() where id=w.id;
 -- Keep settings -> job lock order for every worker operation.
 select * into cfg from ip_ai_settings where id for update;
 if p_action='claim' then
  select * into cfg from ip_ai_settings where id for update;
  if not cfg.enabled or not exists(select 1 from ip_settings where enabled)
   then return jsonb_build_object('ok',true,'job',null,'reason','automation_disabled'); end if;
  if cfg.bundle_hash is distinct from p_body->>'bundleHash' then raise exception 'bundle_mismatch'; end if;
  update ip_ai_jobs set status='BLOCKED',reason='dispatch_unknown',updated_at=now()
   where status='PROCESSING' and lease_expires_at<now() and execution_id is not null;
  update ip_ai_jobs set status='QUEUED',worker_id=null,lease_token=null,updated_at=now()
   where status='PROCESSING' and lease_expires_at<now() and execution_id is null;
  -- Unknown running work must be resolved before another generation starts.
  if exists(select 1 from ip_ai_jobs where status='PROCESSING' or (status='BLOCKED' and reason='dispatch_unknown'))
   then return jsonb_build_object('ok',true,'job',null,'reason','worker_busy'); end if;
  if (select count(*) from ip_ai_executions where created_at>=today)>=cfg.daily_call_limit
   then return jsonb_build_object('ok',true,'job',null,'reason','daily_limit'); end if;
  select jobs.* into j from ip_ai_jobs jobs join ip_ai_requests req on req.id=jobs.request_id
   join ip_members m on m.student_id=req.student_id join students s on s.id=m.student_id
   where jobs.status='QUEUED' and req.student_id=any(w.student_ids) and m.enabled and s.is_active and s.account_type='student'
    and (m.expires_on is null or m.expires_on>=(now() at time zone 'Asia/Seoul')::date)
    and req.bundle_hash=cfg.bundle_hash
   order by coalesce((select max(rr.last_claimed_at) from ip_ai_requests rr where rr.student_id=req.student_id),
     '-infinity'::timestamptz),req.created_at,jobs.position
   limit 1 for update of jobs skip locked;
  if not found then return jsonb_build_object('ok',true,'job',null); end if;
  update ip_ai_jobs set status='PROCESSING',worker_id=w.id,lease_token=gen_random_uuid(),lease_epoch=lease_epoch+1,
   lease_expires_at=now()+interval '180 seconds',reason=null,updated_at=now() where id=j.id returning * into j;
  update ip_ai_requests set last_claimed_at=now() where id=j.request_id returning * into r;
  return jsonb_build_object('ok',true,'job',jsonb_build_object('id',j.id,'request_id',r.id,'kind',r.kind,
   'item_key',j.item_key,'question',j.question,'sources',coalesce(j.sources_override,r.sources),
   'source_hash',coalesce(j.source_hash_override,r.source_hash),
   'bundle_hash',r.bundle_hash,'lease_token',j.lease_token,'lease_epoch',j.lease_epoch,'attempts',j.attempts));
 end if;
 select * into j from ip_ai_jobs where id=(p_body->>'jobId')::uuid for update;
 if not found then raise exception 'not_found'; end if;
 select * into r from ip_ai_requests where id=j.request_id;
 if not r.student_id=any(w.student_ids) then raise exception 'forbidden'; end if;
 perform ip_service('bootstrap',jsonb_build_object('type','student','id',r.student_id),'{}');
 if p_action='inspect' and p_body ? 'executionId' then
  select * into e from ip_ai_executions where id=(p_body->>'executionId')::uuid and job_id=j.id and worker_id=w.id;
  if not found then raise exception 'forbidden'; end if;
  if e.dispatch_state='OPERATOR_STOPPED' then
   return jsonb_build_object('ok',true,'status','CANCELED','reason','operator_resolved','executionId',e.id);
  end if;
 end if;
 if j.worker_id is distinct from w.id then raise exception 'forbidden'; end if;
 if p_action='inspect' then
  return jsonb_build_object('ok',true,'status',j.status,'executionId',j.execution_id,'resultHash',j.result_hash,
   'leaseEpoch',j.lease_epoch,'reason',j.reason);
 end if;
 if p_action='complete' then
  rh:=ip_ai_source_hash(p_body->'result');
  if j.status in ('COMPLETED','NEEDS_INPUT') then
   if j.execution_id is distinct from (p_body->>'executionId')::uuid or j.result_hash is distinct from rh
    then raise exception 'idempotency_conflict'; end if;
   return jsonb_build_object('ok',true,'status',j.status,'reused',true);
  end if;
 end if;
 if j.lease_epoch is distinct from (p_body->>'leaseEpoch')::integer or j.lease_token is distinct from (p_body->>'leaseToken')::uuid
  then raise exception 'lease_lost'; end if;
 if p_action='recover' then
  if j.execution_id is distinct from (p_body->>'executionId')::uuid or j.status not in ('PROCESSING','BLOCKED')
   then raise exception 'unsafe_retry'; end if;
  -- Ownership transfer is not allowed; recovery only authorizes the already recorded execution.
  update ip_ai_jobs set status='PROCESSING',lease_expires_at=now()+interval '180 seconds',reason=null where id=j.id;
  return jsonb_build_object('ok',true);
 end if;
 if j.status<>'PROCESSING' or j.lease_expires_at<now() then raise exception 'lease_lost'; end if;
 if p_action='renew' then
  update ip_ai_jobs set lease_expires_at=now()+interval '180 seconds' where id=j.id;
  return jsonb_build_object('ok',true);
 elsif p_action='execution_start' then
  if j.execution_id is not null then
   if j.execution_id=(p_body->>'executionId')::uuid then return jsonb_build_object('ok',true,'reused',true); end if;
   raise exception 'unsafe_retry';
  end if;
  select * into cfg from ip_ai_settings where id for update;
  if not cfg.enabled then raise exception 'automation_disabled'; end if;
  if j.attempts>=2 or (select count(*) from ip_ai_executions where created_at>=today)>=cfg.daily_call_limit then raise exception 'daily_limit'; end if;
  insert into ip_ai_executions(id,job_id,worker_id,lease_epoch)
   values((p_body->>'executionId')::uuid,j.id,w.id,j.lease_epoch);
  update ip_ai_jobs set execution_id=(p_body->>'executionId')::uuid,attempts=attempts+1 where id=j.id;
  return jsonb_build_object('ok',true);
 elsif p_action='session' then
  update ip_ai_executions set session_ref=p_body->>'sessionRef',dispatch_state='DISPATCHED'
   where id=j.execution_id and id=(p_body->>'executionId')::uuid;
  if not found then raise exception 'execution_mismatch'; end if;
  return jsonb_build_object('ok',true);
 elsif p_action='complete' then
  if j.execution_id is null or j.execution_id is distinct from (p_body->>'executionId')::uuid then raise exception 'execution_mismatch'; end if;
  perform ip_ai_validate_result(p_body->'result',coalesce(j.sources_override,r.sources),r.kind);
  status_text:=case when p_body->'result'->>'status'='ready' then 'COMPLETED' else 'NEEDS_INPUT' end;
  update ip_ai_jobs set status=status_text,result=p_body->'result',result_hash=rh,reason=null,updated_at=now() where id=j.id;
  update ip_ai_executions set dispatch_state='COMPLETED',finished_at=now() where id=j.execution_id;
  insert into ip_ai_events(request_id,job_id,actor,event) values(r.id,j.id,w.id::text,'complete');
  return jsonb_build_object('ok',true,'status',status_text);
 elsif p_action='report' then
  if p_body->>'reason' not in ('dispatch_unknown','invalid_output','connection_unavailable','bundle_mismatch','canceled')
   or p_body->>'reason' is null then raise exception 'invalid_request'; end if;
  update ip_ai_jobs set status=case when p_body->>'reason'='invalid_output' then 'FAILED' else 'BLOCKED' end,
   reason=p_body->>'reason',updated_at=now() where id=j.id;
  if p_body->>'reason'='invalid_output' then
   update ip_ai_executions set dispatch_state='INVALID',finished_at=now() where id=j.execution_id;
  end if;
  return jsonb_build_object('ok',true);
 end if;
 raise exception 'unsupported_action';
end $$;
revoke all on function public.ip_ai_sources(text,text),public.ip_ai_source_hash(jsonb),
 public.ip_ai_service(text,jsonb,jsonb),public.ip_ai_validate_result(jsonb,jsonb,text),
 public.ip_ai_worker_service(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.ip_ai_sources(text,text),public.ip_ai_source_hash(jsonb),
 public.ip_ai_service(text,jsonb,jsonb),public.ip_ai_validate_result(jsonb,jsonb,text),
 public.ip_ai_worker_service(text,text,jsonb) to service_role;
commit;
