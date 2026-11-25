begin;
set local lock_timeout='1s';
set local statement_timeout='15s';
alter table public.ip_practice_transcriptions
 add column student_text text check(student_text is null or length(student_text)<=30000),
 add column student_revision integer not null default 0 check(student_revision>=0),
 add column student_updated_at timestamptz,
 add column student_updated_by text;
create index ip_practice_caption_speed_sample on public.ip_practice_transcriptions(transcribed_at desc)
 where status='completed' and transcribed_at is not null and decoded_seconds>=10 and processing_seconds>0;

-- Aggregate timing only; no other student's identity or recording is returned.
create function public.ip_practice_caption_estimate(p_run_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 v_last public.ip_practice_transcriptions;
 v_low double precision; v_high double precision; v_min double precision; v_max double precision;
 v_state text; v_seen timestamptz; v_backoff double precision;
begin
 if not exists(select 1 from public.ip_practice_turns where run_id=p_run_id and audio_bytes>0) then
  return jsonb_build_object('state','unavailable');
 end if;
 if exists(select 1 from public.ip_practice_turns where run_id=p_run_id and audio_bytes>0 and not uploaded) then
  return jsonb_build_object('state','uploading');
 end if;
 select * into v_last from public.ip_practice_transcriptions
 where run_id=p_run_id and (status in ('pending','processing') or (status='failed' and attempts<3))
 order by created_at desc,run_id desc,number desc limit 1;
 if not found then
  return jsonb_build_object('state',case when exists(select 1 from public.ip_practice_transcriptions where run_id=p_run_id and status='failed') then 'failed' else 'completed' end);
 end if;
 select state,seen_at into v_state,v_seen from public.ip_practice_asr_worker_presence where id;
 if v_seen is null or v_seen<now()-interval '90 seconds' or v_state not in ('idle','processing') then
  return jsonb_build_object('state','waiting');
 end if;
 select greatest(.05,coalesce(percentile_cont(.5) within group(order by processing_seconds/decoded_seconds),.5)),
        greatest(.1,coalesce(percentile_cont(.9) within group(order by processing_seconds/decoded_seconds),.8))
 into v_low,v_high from (
  select processing_seconds,decoded_seconds from public.ip_practice_transcriptions
  where status='completed' and transcribed_at is not null and decoded_seconds>=10 and processing_seconds>0
  order by transcribed_at desc limit 100
 ) sample;
 select coalesce(sum(greatest(2,greatest(2,t.duration*v_low)+2-case when j.status='processing' and j.lease_until>now() then extract(epoch from now()-j.updated_at) else 0 end)),0),
        coalesce(sum(greatest(2,greatest(2,t.duration*v_high)+2-case when j.status='processing' and j.lease_until>now() then extract(epoch from now()-j.updated_at) else 0 end)),0)
 into v_min,v_max
 from public.ip_practice_transcriptions j join public.ip_practice_turns t using(run_id,number)
 where t.uploaded and t.audio_hash=j.audio_hash
  and (j.status='processing' or (j.status in ('pending','failed') and j.attempts<3))
  and (j.status='processing' or (j.created_at,j.run_id,j.number)<=(v_last.created_at,v_last.run_id,v_last.number));
 select coalesce(max(greatest(0,extract(epoch from next_attempt_at-now()))),0) into v_backoff
 from public.ip_practice_transcriptions where run_id=p_run_id and status='failed' and attempts<3;
 -- An idle worker currently backs off up to five minutes between queue checks.
 return jsonb_build_object('state','pending','minSeconds',ceil(v_min+v_backoff)::integer,
  'maxSeconds',ceil(greatest(v_min+30,v_max)+v_backoff+case when v_state='idle' then 300 else 30 end)::integer);
end $$;
revoke all on function public.ip_practice_caption_estimate(uuid) from public,anon,authenticated;
grant execute on function public.ip_practice_caption_estimate(uuid) to service_role;

create or replace function public.ip_practice_student_captions(p_actor jsonb,p_run_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_data jsonb; v_captions jsonb;
begin
 if p_actor->>'type' is distinct from 'student' then raise exception 'forbidden'; end if;
 if to_regprocedure('public.ip_termination_scope(text)') is not null then
  if public.ip_termination_scope(p_actor->>'id')<>'active' then raise exception 'not_enrolled'; end if;
 end if;
 v_data:=public.ip_practice_service('get',p_actor,jsonb_build_object('runId',p_run_id));
 select coalesce(jsonb_agg(jsonb_build_object(
  'number',t.number,
  'status',case when t.audio_bytes=0 then 'unavailable' when not t.uploaded then 'uploading' else coalesce(j.status,'pending') end,
  'text',case when t.uploaded and j.status='completed' then j.transcript else '' end,
  'studentText',case when t.uploaded and j.status='completed' then j.student_text end,
  'studentRevision',coalesce(j.student_revision,0),'studentUpdatedAt',j.student_updated_at
 ) order by t.number),'[]'::jsonb) into v_captions
 from public.ip_practice_turns t left join public.ip_practice_transcriptions j
 on j.run_id=t.run_id and j.number=t.number and j.audio_hash=t.audio_hash
 where t.run_id=p_run_id;
 return jsonb_build_object('ok',true,'mode',v_data->'run'->>'mode','captions',v_captions,
  'estimate',public.ip_practice_caption_estimate(p_run_id));
end $$;

create function public.ip_practice_update_student_caption(p_actor jsonb,p_run_id uuid,p_mode text,p_number integer,p_revision integer,p_text text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_data jsonb; v_job public.ip_practice_transcriptions;
begin
 if p_actor->>'type' is distinct from 'student' then raise exception 'forbidden'; end if;
 if to_regprocedure('public.ip_termination_scope(text)') is not null then
  if public.ip_termination_scope(p_actor->>'id')<>'active' then raise exception 'not_enrolled'; end if;
 end if;
 if p_number is null or p_number not between 1 and 20 or p_revision is null or p_revision<0 or p_revision>2147483646
  or p_text is null or length(p_text)>30000 or p_mode is null or p_mode not in ('job','personality') then raise exception 'invalid_request'; end if;
 -- Serialize a save with enrollment termination without changing membership.
 perform 1 from public.ip_members where student_id=p_actor->>'id' for share;
 if to_regprocedure('public.ip_termination_scope(text)') is not null then
  if public.ip_termination_scope(p_actor->>'id')<>'active' then raise exception 'not_enrolled'; end if;
 end if;
 v_data:=public.ip_practice_service('get',p_actor,jsonb_build_object('runId',p_run_id));
 if v_data->'run'->>'mode' is distinct from p_mode then raise exception 'forbidden'; end if;
 select j.* into v_job from public.ip_practice_transcriptions j join public.ip_practice_turns t using(run_id,number)
 where j.run_id=p_run_id and j.number=p_number and t.uploaded and t.audio_hash=j.audio_hash and j.status='completed' for update of j;
 if not found then raise exception 'report_not_ready'; end if;
 if v_job.student_revision<>p_revision then raise exception 'revision_conflict'; end if;
 update public.ip_practice_transcriptions set student_text=p_text,student_revision=student_revision+1,
  student_updated_at=now(),student_updated_by=p_actor->>'id'
 where run_id=p_run_id and number=p_number returning * into v_job;
 return jsonb_build_object('ok',true,'mode',p_mode,'caption',jsonb_build_object('number',p_number,'status','completed',
  'text',v_job.transcript,'studentText',v_job.student_text,'studentRevision',v_job.student_revision,'studentUpdatedAt',v_job.student_updated_at));
end $$;
revoke all on function public.ip_practice_update_student_caption(jsonb,uuid,text,integer,integer,text) from public,anon,authenticated;
grant execute on function public.ip_practice_update_student_caption(jsonb,uuid,text,integer,integer,text) to service_role;
commit;
