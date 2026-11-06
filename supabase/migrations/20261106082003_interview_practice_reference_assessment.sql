-- Practice-only source-answer comparison. No rubric approvals or official grades are modified.
begin;
set local lock_timeout='5s';
create index if not exists ip_openai_practice_daily on public.ip_openai_practice_attempts(created_at);
create or replace function public.ip_openai_practice_service(p_action text,p_actor jsonb,p_body jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare owner text:=p_actor->>'id'; r public.ip_openai_practice_attempts; q public.ip_questions;
 m public.ip_members; reference jsonb; claimed boolean:=false; k text:=p_body->>'mode'; rows jsonb;
begin
 if coalesce(owner,'')='' then raise exception 'unauthorized'; end if;
 if p_action in ('claim','complete','unknown','sweep','purge') then
  if p_actor->>'type' is distinct from 'server' then raise exception 'forbidden'; end if;
  if p_action='sweep' then
   select coalesce(jsonb_agg(x),'[]'::jsonb) into rows from
    (select id from public.ip_openai_practice_attempts where retain_until<=now() order by retain_until limit 50) x;
   return jsonb_build_object('ok',true,'runs',rows);
  elsif p_action='purge' then
   delete from public.ip_openai_practice_attempts where id=(p_body->>'id')::uuid and retain_until<=now();
   return jsonb_build_object('ok',true);
  elsif p_action='claim' then
   update public.ip_openai_practice_attempts set state='running',execution_token=(p_body->>'token')::uuid,started_at=now()
    where id=(p_body->>'id')::uuid and state='uploading' and retain_until>now() and audio_hash=p_body->>'audioHash'
    returning * into r;
   claimed:=found;
   return jsonb_build_object('ok',true,'claimed',claimed,'question',case when claimed then r.question else null end);
  elsif p_action='complete' then
   if p_body#>'{report,grade}' is distinct from 'null'::jsonb or p_body#>'{report,score}' is distinct from 'null'::jsonb
    or p_body#>>'{report,status}' is null or p_body#>>'{report,status}' not in ('practice_feedback','review_required') then raise exception 'invalid_report'; end if;
   update public.ip_openai_practice_attempts set state='completed',report=p_body->'report'
    where id=(p_body->>'id')::uuid and execution_token=(p_body->>'token')::uuid and state='running' and retain_until>now();
   if not found then raise exception 'lease_lost'; end if;
   return jsonb_build_object('ok',true);
  else
   update public.ip_openai_practice_attempts set state='unknown'
    where id=(p_body->>'id')::uuid and execution_token=(p_body->>'token')::uuid and state='running';
   return jsonb_build_object('ok',true);
  end if;
 end if;
 if p_actor->>'type' is distinct from 'student' then raise exception 'forbidden'; end if;
 if (public.ip_mock_access_service('mock_status',p_actor,'{}')->>'allowed')::boolean is not true then raise exception 'forbidden'; end if;
 if p_action='status' then return jsonb_build_object('ok',true,'ready',true,'provider','openai','liveCaptions',false,'dailyAnswerLimit',100,'dailyServiceAnswerLimit',10000); end if;
 if p_action='create' then
  if k is null or k not in ('job','personality') or coalesce(p_body->>'audioHash','')!~'^[a-f0-9]{64}$' then raise exception 'invalid_request'; end if;
  perform pg_catalog.pg_advisory_xact_lock(214637031);
  select * into r from public.ip_openai_practice_attempts where id=(p_body->>'id')::uuid;
  if found then
   if r.owner_id<>owner or r.retain_until<=now() then raise exception 'not_found'; end if;
   if r.mode<>k or r.audio_hash<>p_body->>'audioHash' or r.question->>'id' is distinct from p_body->>'questionId'
    or r.question->>'prompt' is distinct from p_body->>'questionPrompt' then raise exception 'idempotency_conflict'; end if;
   return jsonb_build_object('ok',true,'id',r.id,'audioNeeded',r.state='uploading');
  end if;
  select * into m from public.ip_members where student_id=owner;
  select * into q from public.ip_questions where id=p_body->>'questionId' and status='published' and category=k
   and (cardinality(tracks)=0 or m.track=any(tracks));
  if not found or q.prompt is distinct from p_body->>'questionPrompt' then raise exception 'question_unavailable'; end if;
  if (select count(*) from public.ip_openai_practice_attempts where owner_id=owner and state in ('uploading','running') and created_at>now()-interval '4 minutes')>=6 then raise exception 'queue_full'; end if;
  if (select count(*) from public.ip_openai_practice_attempts where owner_id=owner and created_at>=date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')>=100 then raise exception 'daily_limit'; end if;
  if (select count(*) from public.ip_openai_practice_attempts where created_at>=date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')>=10000 then raise exception 'daily_limit'; end if;
  if k='job' then
   select jsonb_build_object('answer',o.answer,'occurrenceId',o.id,'sourceId',o.source_id) into reference
   from public.ip_occurrences o join public.ip_sources s on s.id=o.source_id
   where o.question_id=q.id and length(trim(coalesce(o.answer,'')))>20 and length(o.answer)<=20000
   order by (s.track=m.track) desc,o.id asc limit 1;
  end if;
  insert into public.ip_openai_practice_attempts(id,owner_id,mode,question,audio_hash,retain_until)
   values((p_body->>'id')::uuid,owner,k,jsonb_build_object('id',q.id,'prompt',q.prompt,'revision',q.revision,'reference',reference),p_body->>'audioHash',case when m.expires_on is null then now()+interval '31 days' else (m.expires_on+31)::timestamp at time zone 'Asia/Seoul' end) returning * into r;
  return jsonb_build_object('ok',true,'id',r.id,'audioNeeded',true);
 elsif p_action='get' then
  select * into r from public.ip_openai_practice_attempts where id=(p_body->>'id')::uuid and owner_id=owner and retain_until>now();
  if not found then raise exception 'not_found'; end if;
  if r.state='running' and r.started_at<now()-interval '4 minutes' then
   update public.ip_openai_practice_attempts set state='unknown' where id=r.id returning * into r;
  end if;
  return jsonb_build_object('ok',true,'id',r.id,'state',r.state,'provider','openai','report',case when r.state='completed' then r.report-'audit' else null end);
 end if;
 raise exception 'unsupported_action';
end $$;
commit;
