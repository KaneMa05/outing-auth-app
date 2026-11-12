begin;
-- Only the authenticated test-app path accepts an approved open-ended enrollment.
create or replace function public.ip_live_openai_report_service(p_action text,p_actor jsonb,p_body jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 v_run public.ip_live_runs;
 v_report public.ip_live_openai_reports;
 v_claimed boolean:=false;
begin
 if p_action not in ('get','claim','complete','unknown') then raise exception 'unsupported_action'; end if;
 if p_action in ('get','claim') then
  if coalesce(p_actor->>'type','')<>'student' then raise exception 'forbidden'; end if;
  -- Reuse the run's student, ownership and retention checks before returning any status.
  perform public.ip_live_service('get',p_actor,jsonb_build_object('runId',p_body->>'runId'));
 elsif coalesce(p_actor->>'type','')<>'server' then raise exception 'forbidden';
 end if;
 select * into v_run from public.ip_live_runs where id=(p_body->>'runId')::uuid for update;
 if not found or v_run.retain_until<=now() then raise exception 'not_found'; end if;
 select * into v_report from public.ip_live_openai_reports where run_id=v_run.id;
 if p_action in ('get','claim') and v_report.state='running' and v_report.created_at<now()-interval '2 minutes' then
  update public.ip_live_openai_reports set state='unknown' where run_id=v_run.id returning * into v_report;
 end if;
 if p_action='claim' and v_report.run_id is null then
  if v_run.state not in ('completed','interrupted') or jsonb_array_length(v_run.turns)=0 then raise exception 'report_not_ready'; end if;
  if not exists(select 1 from public.ip_members where student_id=p_actor->>'id' and enabled
    and (expires_on>=(now() at time zone 'Asia/Seoul')::date
      or (expires_on is null and mock_test_enabled and p_actor->'testApp'='true'::jsonb))) then raise exception 'not_enrolled'; end if;
  if not coalesce((select enabled from public.ip_settings where id),false) then raise exception 'not_enrolled'; end if;
  if v_run.turns is distinct from p_body->'turns' then raise exception 'source_changed'; end if;
  if coalesce(p_body->>'sourceHash','') !~ '^[a-f0-9]{64}$' then raise exception 'invalid_request'; end if;
  insert into public.ip_live_openai_reports(run_id,state,source_hash,execution_token)
   values(v_run.id,'running',p_body->>'sourceHash',(p_body->>'token')::uuid) returning * into v_report;
  v_claimed:=true;
 elsif p_action in ('complete','unknown') then
  if v_report.run_id is null or v_report.execution_token is distinct from (p_body->>'token')::uuid
   or v_report.source_hash is distinct from p_body->>'sourceHash' then raise exception 'execution_mismatch'; end if;
  if v_report.state<>'running' then raise exception 'unsafe_retry'; end if;
  if p_action='complete' then
   if jsonb_typeof(p_body->'report') is distinct from 'object' or octet_length((p_body->'report')::text)>100000
    or p_body->'report'->>'status' is distinct from 'practice_feedback'
    or not (p_body->'report' ?& array['grade','score','analysis','audit'])
    or p_body->'report'->'grade' is distinct from 'null'::jsonb or p_body->'report'->'score' is distinct from 'null'::jsonb
    or p_body->'report'->'audit'->>'sourceHash' is distinct from v_report.source_hash then raise exception 'invalid_output'; end if;
   update public.ip_live_openai_reports set state='completed',report=p_body->'report' where run_id=v_run.id returning * into v_report;
  else
   update public.ip_live_openai_reports set state='unknown' where run_id=v_run.id returning * into v_report;
  end if;
 end if;
 return jsonb_build_object('ok',true,'claimed',v_claimed,'processing',case when v_report.run_id is null then null
  else jsonb_build_object('state',v_report.state,'report',v_report.report) end);
end $$;
commit;
