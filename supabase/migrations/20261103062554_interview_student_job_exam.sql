-- Student job exams are opt-in. Separate from admin validation and other mock modes.
begin;
create table public.ip_job_exam_attempts (
 id uuid primary key, student_id text not null references public.students(id),
 question_id text not null, question jsonb not null, rubric_detail jsonb not null,
 state text not null default 'started' check(state in ('started','uploading','upload_failed','evaluating','completed','unknown','cancelled','expired')),
 audio_hash text, audio_path text, report jsonb,
 created_at timestamptz not null default now(), deadline timestamptz not null default now()+interval '3 minutes',
 claim_at timestamptz, completed_at timestamptz, retain_until timestamptz not null,
 check(audio_hash is null or audio_hash ~ '^[a-f0-9]{64}$'),
 check(report is null or (jsonb_typeof(report)='object' and (report->>'status') is not distinct from 'review_required' and (report->'grade') is not distinct from 'null'::jsonb and (report->'score') is not distinct from 'null'::jsonb))
);
create index ip_job_exam_owner_created on public.ip_job_exam_attempts(student_id,created_at desc,id);
create index ip_job_exam_active on public.ip_job_exam_attempts(state,claim_at) where state in ('uploading','evaluating');
create index ip_job_exam_retention on public.ip_job_exam_attempts(retain_until);
alter table public.ip_job_exam_attempts enable row level security;
revoke all on public.ip_job_exam_attempts from public,anon,authenticated;
grant select,insert,update,delete on public.ip_job_exam_attempts to service_role;

create function public.ip_job_exam_public(r public.ip_job_exam_attempts) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',r.id,'question',r.question,'state',r.state,'createdAt',r.created_at,'deadline',r.deadline,'retainUntil',r.retain_until,
 'audioReady',r.audio_path is not null,'report',case when r.state='completed' then r.report-'rubric'-'audit'-'quality' else null end);
$$;
revoke all on function public.ip_job_exam_public(public.ip_job_exam_attempts) from public,anon,authenticated;
grant execute on function public.ip_job_exam_public(public.ip_job_exam_attempts) to service_role;

create function public.ip_job_exam_service(p_action text,p_actor jsonb,p_body jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_id text:=p_actor->>'id'; v_type text:=p_actor->>'type'; m public.ip_members; q public.ip_questions; rubric public.ip_question_rubrics;
 r public.ip_job_exam_attempts; rows jsonb; active boolean;
begin
 if coalesce(v_id,'')='' then raise exception 'unauthorized'; end if;
 if p_action in ('internal_get','stored','complete','upload_failed','unknown','sweep','purge') then
  if v_type<>'server' then raise exception 'forbidden'; end if;
 else
  if v_type<>'student' or not exists(select 1 from public.students where id=v_id and is_active and coalesce(account_type,'student')='student') then raise exception 'forbidden'; end if;
  select * into m from public.ip_members where student_id=v_id;
  active:=coalesce(m.enabled and m.expires_on>=(now() at time zone 'Asia/Seoul')::date and (select enabled from public.ip_settings where id),false);
 end if;
 if p_action in ('ready','questions') then
  if p_action='ready' and active is not true then return jsonb_build_object('ok',true,'ready',false,'reason','not_enrolled'); end if;
  if active is not true then raise exception 'not_enrolled'; end if;
  select coalesce(jsonb_agg(x),'[]'::jsonb) into rows from (
   select qb.id,qb.prompt,qb.revision from public.ip_questions qb join public.ip_question_rubrics rb on rb.question_id=qb.id
   where qb.status='published' and qb.category='job' and (cardinality(qb.tracks)=0 or m.track=any(qb.tracks))
    and rb.status='reviewed' and rb.kind='job_knowledge' and rb.source_prompt=qb.prompt and rb.source_category=qb.category
    and jsonb_array_length(rb.criteria)>0 and rb.score_map is not null and rb.reviewed_at is not null
   order by qb.id limit 31 offset greatest(0,least(10000,coalesce((p_body->>'page')::integer,0)))*30
  ) x;
  if p_action='ready' then return jsonb_build_object('ok',true,'ready',jsonb_array_length(rows)>0,'reason',case when jsonb_array_length(rows)=0 then 'questions_unavailable' else '' end,'maxSeconds',90); end if;
  return jsonb_build_object('ok',true,'hasMore',jsonb_array_length(rows)>30,'questions',coalesce((select jsonb_agg(value order by ordinality) from jsonb_array_elements(rows) with ordinality where ordinality<=30),'[]'));
 elsif p_action='start' then
  if active is not true then raise exception 'not_enrolled'; end if;
  perform pg_catalog.pg_advisory_xact_lock(214637002);
  select * into r from public.ip_job_exam_attempts where id=(p_body->>'requestKey')::uuid;
  if found then
   if r.student_id<>v_id then raise exception 'not_found'; end if;
   if r.question_id<>p_body->>'questionId' then raise exception 'idempotency_conflict'; end if;
   if r.retain_until<=now() then raise exception 'not_found'; end if;
   return jsonb_build_object('ok',true,'run',public.ip_job_exam_public(r));
  end if;
  update public.ip_job_exam_attempts set state='expired' where student_id=v_id and state='started' and deadline<=now();
  if exists(select 1 from public.ip_job_exam_attempts where student_id=v_id and (state='started' or (state in ('uploading','evaluating') and claim_at>now()-interval '10 minutes'))) then raise exception 'admission_busy'; end if;
  if (select count(*) from public.ip_job_exam_attempts where student_id=v_id and created_at>=date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')>=3 then raise exception 'daily_limit'; end if;
  select * into q from public.ip_questions where id=p_body->>'questionId' and category='job' and status='published' and (cardinality(tracks)=0 or m.track=any(tracks)) for share;
  if not found then raise exception 'questions_unavailable'; end if;
  select * into rubric from public.ip_question_rubrics where question_id=q.id and status='reviewed' and kind='job_knowledge' and source_prompt=q.prompt and source_category=q.category and jsonb_array_length(criteria)>0 and score_map is not null for share;
  if not found then raise exception 'rubric_not_ready'; end if;
  insert into public.ip_job_exam_attempts(id,student_id,question_id,question,rubric_detail,retain_until)
   values((p_body->>'requestKey')::uuid,v_id,q.id,jsonb_build_object('id',q.id,'prompt',q.prompt,'revision',q.revision),jsonb_build_object('question',to_jsonb(q),'rubric',to_jsonb(rubric),'stale',false),(m.expires_on+31)::timestamp at time zone 'Asia/Seoul') returning * into r;
  return jsonb_build_object('ok',true,'run',public.ip_job_exam_public(r));
 elsif p_action='list' then
  select coalesce(jsonb_agg(x),'[]'::jsonb) into rows from (
   select id,question,state,created_at as "createdAt",retain_until as "retainUntil" from public.ip_job_exam_attempts where student_id=v_id and retain_until>now()
   order by created_at desc,id limit 31 offset greatest(0,least(10000,coalesce((p_body->>'page')::integer,0)))*30
  ) x;
  return jsonb_build_object('ok',true,'hasMore',jsonb_array_length(rows)>30,'runs',coalesce((select jsonb_agg(value order by ordinality) from jsonb_array_elements(rows) with ordinality where ordinality<=30),'[]'));
 elsif p_action='sweep' then
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into rows from (select id,audio_path from public.ip_job_exam_attempts where retain_until<=now() order by retain_until limit 100) x;
  return jsonb_build_object('ok',true,'runs',rows);
 end if;
 if p_action='claim' then perform pg_catalog.pg_advisory_xact_lock(214637002); end if;
 select * into r from public.ip_job_exam_attempts where id=(p_body->>'id')::uuid for update;
 if not found or (v_type='student' and (r.student_id<>v_id or r.retain_until<=now())) then raise exception 'not_found'; end if;
 if p_action='get' then
  if r.state='started' and r.deadline<=now() then update public.ip_job_exam_attempts set state='expired' where id=r.id returning * into r; end if;
  if r.state in ('uploading','evaluating') and r.claim_at<=now()-interval '10 minutes' then update public.ip_job_exam_attempts set state=case when r.state='uploading' then 'upload_failed' else 'unknown' end where id=r.id returning * into r; end if;
  return jsonb_build_object('ok',true,'run',public.ip_job_exam_public(r));
 elsif p_action='internal_get' then return jsonb_build_object('ok',true,'run',to_jsonb(r));
 elsif p_action='claim' then
  if active is not true then raise exception 'not_enrolled'; end if;
  if coalesce(p_body->>'audioHash','') !~ '^[a-f0-9]{64}$' then raise exception 'invalid_request'; end if;
  if r.audio_hash is not null and r.audio_hash<>p_body->>'audioHash' then raise exception 'idempotency_conflict'; end if;
  if r.state not in ('started','upload_failed') then return jsonb_build_object('ok',true,'claimed',false,'run',public.ip_job_exam_public(r)); end if;
  if r.state='started' and r.deadline<=now() then raise exception 'session_expired'; end if;
  if (select count(*) from public.ip_job_exam_attempts where state in ('uploading','evaluating') and claim_at>now()-interval '10 minutes')>=5 then raise exception 'queue_full'; end if;
  update public.ip_job_exam_attempts set state='uploading',audio_hash=p_body->>'audioHash',claim_at=now() where id=r.id returning * into r;
  return jsonb_build_object('ok',true,'claimed',true,'run',public.ip_job_exam_public(r));
 elsif p_action='cancel' then
  if r.state='started' then update public.ip_job_exam_attempts set state='cancelled' where id=r.id; end if;
 elsif p_action='stored' then
  if r.state<>'uploading' then raise exception 'unsafe_retry'; end if;
  update public.ip_job_exam_attempts set audio_path=r.id::text||'/answer.wav',state='evaluating' where id=r.id;
 elsif p_action='upload_failed' then
  update public.ip_job_exam_attempts set state='upload_failed' where id=r.id and state='uploading';
 elsif p_action='unknown' then
  update public.ip_job_exam_attempts set state='unknown' where id=r.id and state='evaluating';
 elsif p_action='complete' then
  if r.state='completed' then
   if r.report is distinct from p_body->'report' then raise exception 'idempotency_conflict'; end if;
  else
   if r.state<>'evaluating' then raise exception 'unsafe_retry'; end if;
   if jsonb_typeof(p_body->'report') is distinct from 'object' or p_body#>>'{report,audit,audioHash}' is distinct from r.audio_hash
    or p_body#>>'{report,audit,questionId}' is distinct from r.question_id
    or p_body#>>'{report,audit,questionRevision}' is distinct from r.rubric_detail#>>'{question,revision}'
    or p_body#>>'{report,audit,rubricRevision}' is distinct from r.rubric_detail#>>'{rubric,revision}'
    or p_body#>>'{report,status}' is distinct from 'review_required'
    or p_body#>'{report,grade}' is distinct from 'null'::jsonb or p_body#>'{report,score}' is distinct from 'null'::jsonb
    or octet_length((p_body->'report')::text)>1000000 then raise exception 'invalid_report'; end if;
   update public.ip_job_exam_attempts set state='completed',report=p_body->'report',completed_at=now() where id=r.id;
  end if;
 elsif p_action='purge' then
  if r.retain_until>now() then raise exception 'forbidden'; end if;
  delete from public.ip_job_exam_attempts where id=r.id;
 else raise exception 'unsupported_action'; end if;
 return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.ip_job_exam_service(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ip_job_exam_service(text,jsonb,jsonb) to service_role;
do $$ begin
 if to_regclass('storage.buckets') is not null then
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
   values('interview-job-exam','interview-job-exam',false,3000000,array['audio/wav']) on conflict(id) do nothing;
  if exists(select 1 from storage.buckets where id='interview-job-exam' and public) then raise exception 'unsafe_bucket_configuration'; end if;
 end if;
end $$;
commit;
