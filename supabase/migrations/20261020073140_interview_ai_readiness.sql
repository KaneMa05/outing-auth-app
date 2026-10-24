begin;
-- Completeness is evaluated from the authenticated owner's saved source data.
-- Drafts count when filled; teacher approval is not a prerequisite.
create function public.ip_ai_readiness(p_student text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
 content jsonb;missing jsonb:='[]';section text;label text;fields text[];field text;
 rowdata jsonb;idx integer;t ip_topics;n ip_notes;track text;topic_count integer:=0;
begin
 select m.track into track from ip_members m where m.student_id=p_student;
 select p.content into content from ip_life_profiles p where p.student_id=p_student;
 if length(btrim(coalesce(content->>'background','')))=0 then
  missing:=missing||jsonb_build_array('기본 정보: 주요 이력·전공을 입력하고 저장해주세요.');
 end if;
 foreach section in array array['qualifications','affiliations','awards','experiences'] loop
  label:=case section when 'qualifications' then '자격·어학' when 'affiliations' then '소속 이력'
   when 'awards' then '수상·성과' else '경험·인생그래프' end;
  if section<>'experiences' and coalesce(content->'none','[]') ? section then continue;end if;
  if jsonb_array_length(coalesce(content->section,'[]'))=0 then
   missing:=missing||jsonb_build_array(label||case when section='experiences' then ': 실제 경험을 1개 이상 입력해주세요.' else ': 이력을 입력하거나 해당 없음을 선택하고 저장해주세요.' end);
  end if;
  fields:=case section
   when 'qualifications' then array['type','date','name','issuer','effort']
   when 'affiliations' then array['type','name','period','role','activities']
   when 'awards' then array['date','name','issuer','rank','action']
   else array['period','title','situation','action','result','learning'] end;
  idx:=0;
  for rowdata in select value from jsonb_array_elements(coalesce(content->section,'[]')) loop
   idx:=idx+1;
   foreach field in array fields loop
    if length(btrim(coalesce(rowdata->>field,'')))=0 then
     missing:=missing||jsonb_build_array(label||' '||idx||'번: '||case field
      when 'type' then '구분' when 'date' then '시기' when 'name' then '이름·명칭'
      when 'issuer' then '발급·수여 기관' when 'effort' then '취득 노력' when 'period' then '기간·시기'
      when 'role' then '직책·역할' when 'activities' then '담당 업무·활동' when 'rank' then '수상 등급'
      when 'title' then '경험 제목' when 'situation' then '상황·문제' when 'action' then '본인의 행동'
      when 'result' then '실제 결과' when 'learning' then '배운 점' end||'을 입력해주세요.');
    end if;
   end loop;
  end loop;
 end loop;
 for t in select * from ip_topics where active and (cardinality(tracks)=0 or track=any(tracks)) order by sort_order,id loop
  topic_count:=topic_count+1;
  select * into n from ip_notes where student_id=p_student and topic_id=t.id;
  fields:=case t.kind when 'experience' then array['situation','role','action','result','learning']
   when 'value' then array['position','reason','application'] else array['criteria','steps','caution'] end;
  if n.student_id is null or n.topic_revision<>t.revision then
   missing:=missing||jsonb_build_array(t.title||': 현재 양식의 모든 질문에 답변하고 저장해주세요.');
  else
   foreach field in array fields loop
    if length(btrim(coalesce(n.fields->>field,'')))<10 then
     missing:=missing||jsonb_build_array(t.title||': '||case field
      when 'situation' then '상황' when 'role' then '목표·역할' when 'action' then '본인의 행동'
      when 'result' then '결과' when 'learning' then '배운 점' when 'position' then '본인의 생각·지원 계기'
      when 'reason' then '이유·근거' when 'application' then '준비 노력·실천 방법'
      when 'criteria' then '판단 기준' when 'steps' then '행동 순서' when 'caution' then '주의점' end||'을 10자 이상 입력해주세요.');
    end if;
   end loop;
  end if;
 end loop;
 if topic_count=0 then missing:=missing||jsonb_build_array('인성 경험·가치관 작성 항목이 설정되지 않았습니다. 관리자에게 확인해주세요.');end if;
 return jsonb_build_object('dbReady',jsonb_array_length(missing)=0,'missing',missing);
end $$;
revoke all on function public.ip_ai_readiness(text) from public,anon,authenticated;
grant execute on function public.ip_ai_readiness(text) to service_role;

create or replace function public.ip_ai_service(p_action text,p_actor jsonb,p_body jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
 readiness jsonb;
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
  readiness:=ip_ai_readiness(sid);
  result:=result||readiness||jsonb_build_object('ready',(result->>'ready')::boolean and (readiness->>'dbReady')::boolean);
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
  readiness:=ip_ai_readiness(sid);
  if not (readiness->>'dbReady')::boolean then return readiness||jsonb_build_object('ok',true,'ready',false,'enabled',cfg.enabled,'state','NEEDS_INPUT');end if;
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
commit;
