begin;
-- Additive basic fields. Retain background verbatim for legacy clients/history.
create or replace function public.ip_basic_text(c jsonb) returns text language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare k text; label text; result text:='';
begin
 if not c ? 'basicInfo' then return coalesce(c->>'background','');end if;
 for k,label in select * from (values ('school','학교'),('major','전공·학과'),('clubs','동아리'),('volunteering','봉사 경험'),('internships','인턴 경험'),('company','회사 경력'),('role','담당 직무'),('achievements','성과·역량')) t loop
  result:=result||case when result='' then '' else E'\n' end||label||': '||case when c#>>array['basicInfo',k,'none']='true' then '해당 없음' else coalesce(c#>>array['basicInfo',k,'text'],'') end;
 end loop;return result;
end;$$;
create or replace function public.ip_basic_complete(c jsonb) returns boolean language sql immutable security invoker set search_path=public,pg_temp as $$
 select case when c ? 'basicInfo' then not exists(select 1 from unnest(array['school','major','clubs','volunteering','internships','company','role','achievements']) k where coalesce(c#>>array['basicInfo',k,'none'],'false')<>'true' and length(btrim(coalesce(c#>>array['basicInfo',k,'text'],'')))=0) else length(btrim(coalesce(c->>'background','')))>0 end;
$$;
create or replace function public.ip_basic_validate(c jsonb) returns boolean language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare k text; r jsonb;
begin
 if not c ? 'basicInfo' then return true;end if;
 if jsonb_typeof(c->'basicInfo') is distinct from 'object' then return false;end if;
 if exists(select 1 from jsonb_object_keys(c->'basicInfo') x where x not in ('school','major','clubs','volunteering','internships','company','role','achievements')) then return false;end if;
 foreach k in array array['school','major','clubs','volunteering','internships','company','role','achievements'] loop
  r:=c->'basicInfo'->k;
  if jsonb_typeof(r) is distinct from 'object' then return false;end if;
  if jsonb_typeof(r->'text') is distinct from 'string' or length(r->>'text')>2000 or jsonb_typeof(r->'none') is distinct from 'boolean' then return false;end if;
  if exists(select 1 from jsonb_object_keys(r) x where x not in ('text','none')) then return false;end if;
 end loop;return true;
end;$$;
do $patch$ declare src text;begin
 select pg_get_functiondef('public.ip_life_service(text,jsonb,jsonb)'::regprocedure) into src;
 src:=replace(src,'''experiences'',''none''','''experiences'',''none'',''basicInfo''');
 src:=replace(src,'or octet_length(v_content::text)>160000','or octet_length(v_content::text)>160000 or not ip_basic_validate(v_content)');
 src:=replace(src,'length(btrim(v_content->>''background''))=0','not ip_basic_complete(v_content)');execute src;
 if to_regprocedure('public.ip_ai_readiness(text)') is not null then
  select pg_get_functiondef('public.ip_ai_readiness(text)'::regprocedure) into src;
  execute replace(src,'length(btrim(coalesce(content->>''background'','''')))=0','not ip_basic_complete(content)');
 end if;
 if to_regprocedure('public.ip_ai_sources(text,text)') is not null then
  select pg_get_functiondef('public.ip_ai_sources(text,text)'::regprocedure) into src;
  execute replace(src,'profile->>''background''','ip_basic_text(profile)');
 end if;
end;$patch$;
revoke all on function public.ip_basic_text(jsonb),public.ip_basic_complete(jsonb),public.ip_basic_validate(jsonb) from public,anon,authenticated;
grant execute on function public.ip_basic_text(jsonb),public.ip_basic_complete(jsonb),public.ip_basic_validate(jsonb) to service_role;

create table if not exists public.ip_life_followup_config (
 id boolean primary key default true check(id),enabled boolean not null default false,
 student_ids text[] not null default '{}',daily_limit integer not null default 30 check(daily_limit between 1 and 200),
 global_daily_limit integer not null default 300 check(global_daily_limit between 1 and 10000)
);
insert into public.ip_life_followup_config(id) values(true) on conflict do nothing;
create table if not exists public.ip_life_followup_sessions (
 id uuid primary key default gen_random_uuid(),student_id text not null references public.ip_owners(id) on delete cascade,
 experience_id text not null,source_hash text not null,start_revision integer not null,
 answer_revision integer not null default 0,policy_version text not null default 'life-v1',created_at timestamptz not null default now(),
 unique(student_id,experience_id)
);
create table if not exists public.ip_life_followup_questions (
 id uuid primary key default gen_random_uuid(),session_id uuid not null references public.ip_life_followup_sessions(id) on delete cascade,
 batch integer not null check(batch between 1 and 5),topic text not null,kind text not null check(kind in ('fact','interpretation','hypothetical')),
 text text not null check(length(text) between 1 and 600),refs jsonb not null,source_hash text not null,answer_revision integer not null,
 unique(session_id,topic)
);
create table if not exists public.ip_life_followup_answers (
 question_id uuid primary key references public.ip_life_followup_questions(id) on delete cascade,
 text text not null default '' check(length(text)<=4000),status text not null check(status in ('answered','unknown','skipped')),
 revision integer not null,updated_at timestamptz not null default now()
);
create table if not exists public.ip_life_followup_outputs (
 id uuid primary key default gen_random_uuid(),session_id uuid not null references public.ip_life_followup_sessions(id) on delete cascade,
 source_hash text not null,answer_revision integer not null,result jsonb not null,engine text not null,
 before_value jsonb,after_value jsonb,applied_revision integer,applied_at timestamptz,restored_at timestamptz,created_at timestamptz not null default now()
);
create table if not exists public.ip_life_followup_requests (
 id uuid primary key default gen_random_uuid(),session_id uuid not null references public.ip_life_followup_sessions(id) on delete cascade,
 student_id text not null references public.ip_owners(id) on delete cascade,request_key text not null,
 input_hash text not null,source_hash text not null,answer_revision integer not null,action text not null,
 state text not null check(state in ('processing','completed','failed','stale')),engine text,model text,usage jsonb,error text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(student_id,request_key)
);
create unique index if not exists ip_life_followup_one_pending on public.ip_life_followup_requests(student_id) where state='processing';
create index if not exists ip_life_followup_daily on public.ip_life_followup_requests(created_at,student_id);
create index if not exists ip_life_followup_requests_session on public.ip_life_followup_requests(session_id,created_at);
create index if not exists ip_life_followup_outputs_session on public.ip_life_followup_outputs(session_id,created_at);
do $$ declare t text;begin
 foreach t in array array['ip_life_followup_config','ip_life_followup_sessions','ip_life_followup_questions','ip_life_followup_answers','ip_life_followup_outputs','ip_life_followup_requests'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to service_role',t);
 end loop;
end;$$;
create or replace function public.ip_life_followup_hash(e jsonb) returns text language sql immutable security invoker set search_path=public,pg_temp as $$
 select md5(jsonb_build_object('age',e->'age','title',e->'title','satisfaction',e->'satisfaction','content',ip_life_experience_text(e)->'content','appeal',ip_life_experience_text(e)->'appeal')::text);
$$;
create or replace function public.ip_life_followup_service(p_action text,p_actor jsonb,p_body jsonb default '{}') returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare sid text:=p_actor->>'id';cfg ip_life_followup_config;p ip_life_profiles;s ip_life_followup_sessions;r ip_life_followup_requests;o ip_life_followup_outputs;
 e jsonb;h text;v jsonb;q jsonb;x jsonb;newcontent jsonb;v_result jsonb;batchno integer;ih text;allowed boolean;newid uuid;
begin
 if p_actor->>'type' is distinct from 'student' or coalesce(sid,'')='' then raise exception 'unauthorized';end if;
 if not coalesce((ip_service('status',p_actor,'{}')->>'enabled')::boolean,false) then raise exception 'not_enrolled';end if;
 perform 1 from ip_members where student_id=sid for update;
 if not coalesce((ip_service('status',p_actor,'{}')->>'enabled')::boolean,false) then raise exception 'not_enrolled';end if;
 select * into cfg from ip_life_followup_config where id;
 allowed:=cfg.enabled and (cardinality(cfg.student_ids)=0 or sid=any(cfg.student_ids));
 select * into p from ip_life_profiles where student_id=sid for update;
 if p_action='availability' then
  return jsonb_build_object('ok',true,'enabled',allowed,'sessions',case when allowed then (select coalesce(jsonb_agg(jsonb_build_object('experience_id',f.experience_id,'answered',(select count(*) from ip_life_followup_answers a join ip_life_followup_questions z on z.id=a.question_id where z.session_id=f.id))),'[]') from ip_life_followup_sessions f where f.student_id=sid and exists(select 1 from jsonb_array_elements(p.content->'experiences') t where t->>'id'=f.experience_id)) else '[]'::jsonb end);
 end if;
 if not allowed then raise exception 'automation_disabled';end if;
 if p_action in ('start','get') and p_body ? 'experienceId' then
  select * into s from ip_life_followup_sessions where student_id=sid and experience_id=p_body->>'experienceId';
 else select * into s from ip_life_followup_sessions where id=(p_body->>'sessionId')::uuid and student_id=sid;end if;
 if s.id is null and p_action<>'start' then raise exception 'not_found';end if;
 select value into e from jsonb_array_elements(p.content->'experiences') where value->>'id'=coalesce(s.experience_id,p_body->>'experienceId');
 if e is null then raise exception 'not_found';end if;
 h:=ip_life_followup_hash(e);
 if p_action='start' and s.id is null then
  if coalesce(e->>'age','')='' or length(btrim(coalesce(e->>'title','')))=0 or length(btrim(ip_life_experience_text(e)->>'content'))=0 then raise exception 'experience_required';end if;
  insert into ip_life_followup_sessions(student_id,experience_id,source_hash,start_revision) values(sid,e->>'id',h,p.revision) returning * into s;
 end if;
 -- Recover abandoned invocations. A late response cannot commit an expired request.
 update ip_life_followup_requests set state='failed',error='request_timeout',updated_at=now() where student_id=sid and state='processing' and created_at<now()-interval '90 seconds';
 if p_action='save_answers' then
  if (p_body->>'answerRevision')::int is distinct from s.answer_revision then raise exception 'revision_conflict';end if;
  if jsonb_typeof(p_body->'answers') is distinct from 'array' or jsonb_array_length(p_body->'answers')>15 then raise exception 'invalid_request';end if;
  if exists(select 1 from jsonb_array_elements(p_body->'answers') a group by a->>'questionId' having count(*)>1) then raise exception 'invalid_request';end if;
  for v in select value from jsonb_array_elements(p_body->'answers') loop
   if not exists(select 1 from ip_life_followup_questions where id=(v->>'questionId')::uuid and session_id=s.id) then raise exception 'forbidden';end if;
   if coalesce(v->>'status','') not in ('answered','unknown','skipped') or jsonb_typeof(v->'text') is distinct from 'string' or length(v->>'text')>4000 or (v->>'status'='answered' and length(btrim(v->>'text'))=0) then raise exception 'invalid_request';end if;
   if exists(select 1 from ip_life_followup_answers where question_id=(v->>'questionId')::uuid and text=v->>'text' and status=v->>'status') then continue;end if;
   insert into ip_life_followup_answers(question_id,text,status,revision) values((v->>'questionId')::uuid,v->>'text',v->>'status',s.answer_revision+1)
    on conflict(question_id) do update set text=excluded.text,status=excluded.status,revision=excluded.revision,updated_at=now();
  end loop;
  if exists(select 1 from ip_life_followup_answers a join ip_life_followup_questions z on z.id=a.question_id where z.session_id=s.id and a.revision>s.answer_revision) then
   update ip_life_followup_sessions set answer_revision=answer_revision+1 where id=s.id returning * into s;
  end if;
 elsif p_action='claim' then
  if p_body->>'sourceHash' is distinct from h then raise exception 'source_changed';end if;
  if (p_body->>'answerRevision')::int is distinct from s.answer_revision then raise exception 'revision_conflict';end if;
  if coalesce(p_body->>'kind','') not in ('generate_questions','summarize') or length(coalesce(p_body->>'requestKey','')) not between 8 and 100 then raise exception 'invalid_request';end if;
  ih:=md5(h||':'||s.answer_revision||':'||s.policy_version||':'||(p_body->>'kind')||':'||(select count(*) from ip_life_followup_questions where session_id=s.id));
  select * into r from ip_life_followup_requests where student_id=sid and request_key=p_body->>'requestKey';
  if r.id is not null then
   -- A key identifies the original snapshot, even after its questions are committed.
   if r.session_id<>s.id or r.action<>p_body->>'kind' or r.source_hash<>h or r.answer_revision<>s.answer_revision then raise exception 'idempotency_conflict';end if;
   return jsonb_build_object('ok',true,'claimed',false,'request',to_jsonb(r));
  end if;
  select * into r from ip_life_followup_requests where session_id=s.id and input_hash=ih and state in ('processing','completed') order by created_at desc limit 1;
  if r.id is not null then return jsonb_build_object('ok',true,'claimed',false,'request',to_jsonb(r));end if;
  if exists(select 1 from ip_life_followup_requests where student_id=sid and state='processing') then raise exception 'admission_busy';end if;
  if p_body->>'kind'='generate_questions' then
   if (select count(*) from ip_life_followup_questions where session_id=s.id)>=15 or (select coalesce(max(batch),0) from ip_life_followup_questions where session_id=s.id)>=5 then raise exception 'question_limit';end if;
   if exists(select 1 from ip_life_followup_questions z where z.session_id=s.id and not exists(select 1 from ip_life_followup_answers where question_id=z.id)) then raise exception 'answers_required';end if;
  end if;
  -- Serialize global admission only, never hold a database transaction during generation.
  perform 1 from ip_life_followup_config where id for update;
  if (select count(*) from ip_life_followup_requests where student_id=sid and created_at>=date_trunc('day',now()))>=cfg.daily_limit then raise exception 'daily_limit';end if;
  if (select count(*) from ip_life_followup_requests where created_at>=date_trunc('day',now()))>=cfg.global_daily_limit then raise exception 'daily_limit';end if;
  insert into ip_life_followup_requests(session_id,student_id,request_key,input_hash,source_hash,answer_revision,action,state)
   values(s.id,sid,p_body->>'requestKey',ih,h,s.answer_revision,p_body->>'kind','processing') returning * into r;
  return jsonb_build_object('ok',true,'claimed',true,'request',to_jsonb(r));
 elsif p_action='finish' then
  select * into r from ip_life_followup_requests where id=(p_body->>'requestId')::uuid and session_id=s.id and student_id=sid;
  if r.id is null then raise exception 'not_found';end if;
  if r.state<>'processing' then return jsonb_build_object('ok',true,'request',to_jsonb(r));end if;
  if r.source_hash<>h or r.answer_revision<>s.answer_revision then
   update ip_life_followup_requests set state='stale',updated_at=now() where id=r.id;
  elsif p_body ? 'error' then update ip_life_followup_requests set state='failed',error=left(p_body->>'error',100),updated_at=now() where id=r.id;
  else
   v_result:=p_body->'result';
   if jsonb_typeof(v_result) is distinct from 'object' or octet_length(v_result::text)>100000 then raise exception 'invalid_output';end if;
   if r.action='generate_questions' then
    if jsonb_typeof(v_result->'questions') is distinct from 'array' or jsonb_array_length(v_result->'questions')>3 then raise exception 'invalid_output';end if;
    select coalesce(max(batch),0)+1 into batchno from ip_life_followup_questions where session_id=s.id;
    if batchno>5 then raise exception 'question_limit';end if;
    if (select count(*) from jsonb_array_elements(v_result->'questions') z where z->>'kind'='hypothetical')>1 then raise exception 'invalid_output';end if;
    for q in select value from jsonb_array_elements(v_result->'questions') loop
     insert into ip_life_followup_questions(session_id,batch,topic,kind,text,refs,source_hash,answer_revision) values(s.id,batchno,q->>'topic',q->>'kind',q->>'text',q->'refs',h,s.answer_revision);
    end loop;
   else insert into ip_life_followup_outputs(session_id,source_hash,answer_revision,result,engine) values(s.id,h,s.answer_revision,v_result,p_body->>'engine');end if;
   update ip_life_followup_requests set state='completed',engine=p_body->>'engine',model=p_body->>'model',usage=p_body->'usage',error=case when r.action='generate_questions' and jsonb_array_length(v_result->'questions')=0 then 'no_more_questions' else null end,updated_at=now() where id=r.id;
  end if;
 elsif p_action in ('apply','restore') then
  if (p_body->>'profileRevision')::int is distinct from p.revision then raise exception 'revision_conflict';end if;
  if p_body->>'sourceHash' is distinct from h then raise exception 'source_changed';end if;
  if p_action='restore' then
   select * into o from ip_life_followup_outputs where id=(p_body->>'outputId')::uuid and session_id=s.id;
   if o.id is null or o.applied_at is null or o.restored_at is not null then raise exception 'not_found';end if;
   if o.after_value is distinct from e or o.applied_revision<>p.revision then raise exception 'revision_conflict';end if;
   x:=o.before_value;
  else
   if (p_body->>'answerRevision')::int is distinct from s.answer_revision then raise exception 'revision_conflict';end if;
   if p_body ? 'outputId' then
    select * into o from ip_life_followup_outputs where id=(p_body->>'outputId')::uuid and session_id=s.id;
    if o.id is null then raise exception 'not_found';end if;
    if o.source_hash<>h or o.answer_revision<>s.answer_revision then raise exception 'source_changed';end if;
   end if;
   v:=p_body->'fields';if jsonb_typeof(v) is distinct from 'object' then raise exception 'invalid_request';end if;
   if v='{}' or exists(select 1 from jsonb_object_keys(v) k where k not in ('content','appeal')) then raise exception 'invalid_request';end if;
   if exists(select 1 from jsonb_each(v) t where jsonb_typeof(t.value)<>'string' or length(t.value#>>'{}')>case when t.key='content' then 12000 else 2000 end) then raise exception 'invalid_request';end if;
   x:=e||v;
   insert into ip_life_followup_outputs(session_id,source_hash,answer_revision,result,engine,before_value,after_value)
    values(s.id,h,s.answer_revision,jsonb_build_object('fields',v,'parentOutputId',o.id),'student_reviewed',e,x) returning * into o;
  end if;
  select jsonb_agg(case when value->>'id'=s.experience_id then x else value end order by ord) into newcontent from jsonb_array_elements(p.content->'experiences') with ordinality a(value,ord);
  v_result:=ip_life_service('life_save',p_actor,jsonb_build_object('revision',p.revision,'status','draft','content',jsonb_set(p.content,'{experiences}',newcontent)));
  if p_action='apply' then update ip_life_followup_outputs set applied_at=now(),applied_revision=(v_result#>>'{profile,revision}')::int where id=o.id;
  else update ip_life_followup_outputs set restored_at=now() where id=o.id;end if;
  select * into p from ip_life_profiles where student_id=sid;e:=x;h:=ip_life_followup_hash(e);
 elsif p_action not in ('start','get','status') then raise exception 'unsupported_action';end if;
 return jsonb_build_object('ok',true,'session',to_jsonb(s),'experience',ip_life_experience_text(e),'sourceHash',h,'profileRevision',p.revision,
  'questions',(select coalesce(jsonb_agg(to_jsonb(z)||jsonb_build_object('answer',(select to_jsonb(a) from ip_life_followup_answers a where a.question_id=z.id),'stale',z.source_hash<>h or exists(select 1 from ip_life_followup_answers a join ip_life_followup_questions prev on prev.id=a.question_id where prev.session_id=s.id and prev.batch<z.batch and a.revision>z.answer_revision)) order by z.batch,z.id),'[]') from ip_life_followup_questions z where z.session_id=s.id),
  'outputs',(select coalesce(jsonb_agg(to_jsonb(z)||jsonb_build_object('stale',z.source_hash<>h or z.answer_revision<>s.answer_revision) order by z.created_at desc),'[]') from ip_life_followup_outputs z where z.session_id=s.id),
  'requests',(select coalesce(jsonb_agg(to_jsonb(z) order by z.created_at desc),'[]') from ip_life_followup_requests z where z.session_id=s.id),'pollAfterMs',3000);
end;$$;
revoke all on function public.ip_life_followup_hash(jsonb),public.ip_life_followup_service(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ip_life_followup_hash(jsonb),public.ip_life_followup_service(text,jsonb,jsonb) to service_role;
commit;
