begin;
alter table public.ip_mock_cli_presence add column health jsonb;
alter table public.ip_mock_cli_presence add column health_checked_at timestamptz;

-- Anonymous operational events: no student identifiers, questions, answers or tokens.
create table public.ip_mock_operation_events (
 id uuid primary key default gen_random_uuid(),kind text not null check(kind in ('job','personality','live','report')),
 transport text not null check(transport in ('api','pc')),event text not null check(event in ('completed','failed')),
 created_at timestamptz not null default now()
);
create index ip_mock_operation_recent on public.ip_mock_operation_events(kind,transport,created_at desc);
create index ip_mock_operation_expiry on public.ip_mock_operation_events(created_at);
alter table public.ip_mock_operation_events enable row level security;
revoke all on public.ip_mock_operation_events from public,anon,authenticated;
grant select,insert,delete on public.ip_mock_operation_events to service_role;

create function public.ip_mock_operation_event() returns trigger
language plpgsql security invoker set search_path='' as $$
declare k text:=tg_argv[0]; route text:='api'; previous text:=''; ev text;
begin
 if tg_op='UPDATE' then previous:=old.state; end if;
 if tg_table_name='ip_mock_cli_jobs' then
  k:=new.kind;route:='pc';
  if new.state='completed' and previous<>'completed' and k='report' then ev:='completed';
  elsif new.state in ('failed','unknown') and previous is distinct from new.state then ev:='failed'; end if;
 elsif tg_table_name='ip_live_runs' then
  if new.state='completed' and previous<>'completed' then ev:='completed';
  elsif new.state='unknown' and previous<>'unknown' then ev:='failed';
  elsif new.recording_state='missing' and (tg_op='INSERT' or old.recording_state is distinct from 'missing') then ev:='failed'; end if;
 else
  if exists(select 1 from public.ip_mock_cli_jobs where kind=k and run_id=new.id) then route:='pc'; end if;
  if new.state='completed' and previous<>'completed' then ev:='completed';
  elsif new.state in ('upload_failed','unknown') and previous is distinct from new.state then ev:='failed'; end if;
 end if;
 if ev is not null then
  insert into public.ip_mock_operation_events(kind,transport,event) values(k,route,ev);
  delete from public.ip_mock_operation_events where created_at<now()-interval '30 days';
 end if;
 if tg_table_name='ip_live_runs' then
  if new.recording_state='missing' and ev is distinct from 'failed' then
   if tg_op='INSERT' or old.recording_state is distinct from 'missing' then insert into public.ip_mock_operation_events(kind,transport,event) values('live','api','failed'); end if;
  end if;
 end if;
 return new;
end $$;
revoke all on function public.ip_mock_operation_event() from public,anon,authenticated;
grant execute on function public.ip_mock_operation_event() to service_role;
create trigger ip_job_operation_event after insert or update of state on public.ip_job_exam_attempts for each row execute function public.ip_mock_operation_event('job');
create trigger ip_personality_operation_event after insert or update of state on public.ip_personality_attempts for each row execute function public.ip_mock_operation_event('personality');
create trigger ip_live_operation_event after insert or update of state,recording_state on public.ip_live_runs for each row execute function public.ip_mock_operation_event('live');
create trigger ip_cli_operation_event after insert or update of state on public.ip_mock_cli_jobs for each row execute function public.ip_mock_operation_event('report');

create function public.ip_mock_cli_report_health(p_health jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare checked timestamptz;
begin
 if jsonb_typeof(p_health) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_health))<>6
  or not (p_health ?& array['checkedAt','cliReady','transcriptionConfigured','verificationConfigured','analysisConfigured','blockedReason'])
  or jsonb_typeof(p_health->'cliReady') is distinct from 'boolean'
  or jsonb_typeof(p_health->'transcriptionConfigured') is distinct from 'boolean'
  or jsonb_typeof(p_health->'verificationConfigured') is distinct from 'boolean'
  or jsonb_typeof(p_health->'analysisConfigured') is distinct from 'boolean'
  or jsonb_typeof(p_health->'checkedAt') is distinct from 'string'
  or jsonb_typeof(p_health->'blockedReason') is distinct from 'string'
  or coalesce(p_health->>'blockedReason','') not in ('','execution_needs_review','delivery_pending','lease_lost','processing_unavailable') then raise exception 'invalid_request'; end if;
 checked:=(p_health->>'checkedAt')::timestamptz;
 if checked is null or checked>now()+interval '5 seconds' or checked<now()-interval '2 minutes' then raise exception 'invalid_request'; end if;
 update public.ip_mock_cli_presence set health=p_health-'checkedAt',health_checked_at=checked
  where id and (health_checked_at is null or checked>health_checked_at);
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.ip_mock_cli_report_health(jsonb) from public,anon,authenticated;
grant execute on function public.ip_mock_cli_report_health(jsonb) to service_role;

create function public.ip_mock_operation_metrics(p_kind text,p_transport text) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('lastCompletedAt',max(created_at) filter(where event='completed'),
  'lastFailedAt',max(created_at) filter(where event='failed'),
  'completed24h',count(*) filter(where event='completed' and created_at>now()-interval '24 hours'),
  'failed24h',count(*) filter(where event='failed' and created_at>now()-interval '24 hours'))
 from public.ip_mock_operation_events where kind=p_kind and transport=p_transport;
$$;
revoke all on function public.ip_mock_operation_metrics(text,text) from public,anon,authenticated;
grant execute on function public.ip_mock_operation_metrics(text,text) to service_role;

-- Read-only snapshot. It never claims a task, changes a lease or calls an AI provider.
create function public.ip_mock_operations_snapshot() returns jsonb
language sql stable security invoker set search_path='' as $$
 with queue as (
  select k.kind,jsonb_build_object('queued',count(j.id) filter(where j.state='queued'),
   'running',count(j.id) filter(where j.state='running' and j.lease_until>now()),
   'attention',count(j.id) filter(where j.state in ('failed','unknown') or (j.state='running' and j.lease_until<=now())),
   'stalled',count(j.id) filter(where j.state='running' and j.lease_until<=now()),
   'held',count(j.id) filter(where j.state='completed' and ((j.kind='job' and j.report->'suggestion'='null'::jsonb) or (j.kind='personality' and j.report->>'status'='review_required'))))||public.ip_mock_operation_metrics(k.kind,'pc') as metrics
  from (values('job'),('personality'),('report')) k(kind) left join public.ip_mock_cli_jobs j on j.kind=k.kind and j.retain_until>now() group by k.kind
 ), job as (
  select jsonb_build_object('queued',0,'running',count(*) filter(where state in ('uploading','evaluating') and claim_at>now()-interval '10 minutes'),
   'attention',count(*) filter(where state in ('upload_failed','unknown') or (state in ('uploading','evaluating') and claim_at<=now()-interval '10 minutes')),
   'uploadFailed',count(*) filter(where state='upload_failed'),
   'untrackedUnknown',count(*) filter(where state='unknown' and not exists(select 1 from public.ip_mock_cli_jobs q where q.kind='job' and q.run_id=ip_job_exam_attempts.id)),
   'held',count(*) filter(where state='completed' and report->'suggestion'='null'::jsonb))||public.ip_mock_operation_metrics('job','api') as metrics
  from public.ip_job_exam_attempts where retain_until>now()
 ), personality as (
  select jsonb_build_object('queued',0,'running',count(*) filter(where state in ('uploading','evaluating') and claim_at>now()-interval '10 minutes'),
   'attention',count(*) filter(where state in ('upload_failed','unknown') or (state in ('uploading','evaluating') and claim_at<=now()-interval '10 minutes')),
   'uploadFailed',count(*) filter(where state='upload_failed'),
   'untrackedUnknown',count(*) filter(where state='unknown' and not exists(select 1 from public.ip_mock_cli_jobs q where q.kind='personality' and q.run_id=ip_personality_attempts.id)),
   'held',count(*) filter(where state='completed' and report->>'status'='review_required'))||public.ip_mock_operation_metrics('personality','api') as metrics
  from public.ip_personality_attempts where retain_until>now()
 ), live as (
  select jsonb_build_object('queued',0,'running',count(*) filter(where state in ('starting','active','closing') and heartbeat_at>now()-interval '60 seconds' and deadline>now()),
   'attention',count(*) filter(where state='unknown' or recording_state='missing' or (state in ('starting','active','closing') and (heartbeat_at<=now()-interval '60 seconds' or deadline<=now()))),
   'interrupted',count(*) filter(where state='interrupted'),
   'recordingPending',count(*) filter(where state in ('completed','interrupted') and recording_state='pending'))||public.ip_mock_operation_metrics('live','api') as metrics
  from public.ip_live_runs where retain_until>now()
 )
 select jsonb_build_object('access',jsonb_build_object('enabled',exists(select 1 from public.ip_settings where id and enabled)),
  'api',jsonb_build_object('job',(select metrics from job),'personality',(select metrics from personality)),
  'live',(select metrics from live),
  'cli',jsonb_build_object('lastSeenAt',(select last_seen_at from public.ip_mock_cli_presence where id),
   'health',(select health from public.ip_mock_cli_presence where id),'healthCheckedAt',(select health_checked_at from public.ip_mock_cli_presence where id),
   'stats',(select jsonb_object_agg(kind,metrics) from queue)),
  'questions',jsonb_build_object(
   'job',(select count(*) from public.ip_questions q join public.ip_question_rubrics r on r.question_id=q.id where q.status='published' and q.category='job' and r.status='reviewed' and r.kind='job_knowledge' and r.source_prompt=q.prompt and r.source_category=q.category and jsonb_array_length(r.criteria)>0 and r.score_map is not null and r.reviewed_at is not null),
   'personality',(select count(*) from public.ip_questions q join public.ip_question_rubrics r on r.question_id=q.id where q.status='published' and q.category='personality' and r.status='reviewed' and r.kind in ('personality_experience','personality_opinion') and r.source_prompt=q.prompt and r.source_category=q.category and r.reviewed_at is not null),
   'live',(select count(*) from public.ip_questions where status='published' and length(prompt)<=180)));
$$;
revoke all on function public.ip_mock_operations_snapshot() from public,anon,authenticated;
grant execute on function public.ip_mock_operations_snapshot() to service_role;
commit;
