-- Unlimited enrollment still uses bounded 31-day audio retention.
begin;
create or replace function public.ip_practice_cli_service(p_action text,p_actor jsonb,p_body jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare owner_id text:=p_actor->>'id'; j public.ip_mock_cli_jobs; q public.ip_questions; m public.ip_members;
 online boolean; health jsonb; health_time timestamptz; k text:=p_body->>'mode';
begin
 if coalesce(owner_id,'')='' then raise exception 'unauthorized'; end if;
 if p_action='stored' then
  if p_actor->>'type' is distinct from 'server' then raise exception 'forbidden'; end if;
  update public.ip_mock_cli_jobs set state='queued' where kind='practice' and id=(p_body->>'id')::uuid and state='uploading' and snapshot->>'audio_hash'=p_body->>'audioHash';
  if not found then raise exception 'idempotency_conflict'; end if;
  return jsonb_build_object('ok',true);
 end if;
 if p_actor->>'type' is distinct from 'student' then raise exception 'forbidden'; end if;
 if (public.ip_mock_access_service('mock_status',p_actor,'{}')->>'allowed')::boolean is not true then raise exception 'forbidden'; end if;
 if p_action='status' then
  select last_seen_at>now()-interval '45 seconds' and (pause_until is null or pause_until<=now()),presence.health,health_checked_at into online,health,health_time from public.ip_mock_cli_presence presence where id;
  return jsonb_build_object('ok',true,'ready',coalesce(online and health_time>now()-interval '2 minutes' and (health->>'cliReady')::boolean and (health->>'transcriptionConfigured')::boolean and (health->>'analysisConfigured')::boolean and coalesce(health->>'blockedReason','')='',false),
    'provider','windows-cli','liveCaptions',false,'workerOnline',coalesce(online,false));
 end if;
 if p_action='create' then
  if k not in ('job','personality','ai') or k is null or coalesce(p_body->>'audioHash','')!~'^[a-f0-9]{64}$' then raise exception 'invalid_request'; end if;
  perform pg_catalog.pg_advisory_xact_lock(214637018);
  select * into j from public.ip_mock_cli_jobs where id=(p_body->>'id')::uuid;
  if found then
   if j.student_id<>owner_id or j.kind<>'practice' or j.retain_until<=now() then raise exception 'not_found'; end if;
   if j.snapshot->>'audio_hash' is distinct from p_body->>'audioHash' or j.snapshot#>>'{question,id}' is distinct from p_body->>'questionId' or j.snapshot->>'mode' is distinct from k or j.snapshot#>>'{question,prompt}' is distinct from p_body->>'questionPrompt' then raise exception 'idempotency_conflict'; end if;
   return jsonb_build_object('ok',true,'id',j.id,'audioNeeded',j.state='uploading');
  end if;
  select * into m from public.ip_members where student_id=owner_id;
  select * into q from public.ip_questions where id=p_body->>'questionId' and status='published'
    and category=case when k='job' then 'job' else 'personality' end and (cardinality(tracks)=0 or m.track=any(tracks));
  if not found or q.prompt is distinct from p_body->>'questionPrompt' then raise exception 'question_unavailable'; end if;
  if (select count(*) from public.ip_mock_cli_jobs where student_id=owner_id and state in ('uploading','queued','running'))>=6 then raise exception 'queue_full'; end if;
  if (select count(*) from public.ip_mock_cli_jobs where student_id=owner_id and created_at>=date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')>=9 then raise exception 'daily_limit'; end if;
  insert into public.ip_mock_cli_jobs(id,kind,run_id,student_id,snapshot,state,retain_until)
   values((p_body->>'id')::uuid,'practice',(p_body->>'id')::uuid,owner_id,jsonb_build_object('mode',k,'audio_hash',p_body->>'audioHash','question',jsonb_build_object('id',q.id,'prompt',q.prompt,'revision',q.revision)),
    'uploading',(coalesce(m.expires_on,(now() at time zone 'Asia/Seoul')::date)+31)::timestamp at time zone 'Asia/Seoul') returning * into j;
  return jsonb_build_object('ok',true,'id',j.id,'audioNeeded',true);
 elsif p_action='get' then
  select * into j from public.ip_mock_cli_jobs where kind='practice' and id=(p_body->>'id')::uuid and student_id=owner_id and retain_until>now();
  if not found then raise exception 'not_found'; end if;
  if j.state='running' and j.lease_until<=now() then update public.ip_mock_cli_jobs set state='unknown' where id=j.id returning * into j; end if;
  return jsonb_build_object('ok',true,'id',j.id,'state',j.state,'provider','windows-cli','report',case when j.state='completed' then j.report-'audit' else null end);
 end if;
 raise exception 'unsupported_action';
end $$;
revoke all on function public.ip_practice_cli_service(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ip_practice_cli_service(text,jsonb,jsonb) to service_role;
commit;
