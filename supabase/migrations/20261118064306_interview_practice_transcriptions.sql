-- Separate from native answer text: subsequent device sync must not overwrite ASR/reviews.
create table public.ip_practice_transcriptions (
 run_id uuid not null, number integer not null, audio_hash text not null check(audio_hash ~ '^[a-f0-9]{64}$'),
 status text not null default 'pending' check(status in ('pending','processing','completed','failed')),
 attempts integer not null default 0 check(attempts between 0 and 3),
 lease_id uuid, lease_until timestamptz, next_attempt_at timestamptz not null default now(),
 error_code text not null default '',
 transcript text not null default '' check(length(transcript)<=30000),
 segments jsonb not null default '[]' check(jsonb_typeof(segments)='array' and jsonb_array_length(segments)<=2000),
 model text not null default 'Whisper large-v3' check(model='Whisper large-v3'),
 model_revision text not null default '', engine_version text not null default '',
 processing_seconds double precision, decoded_seconds double precision, transcribed_at timestamptz,
 revision integer not null default 0,
 review_status text not null default 'pending' check(review_status in ('pending','ok','minor','meaning','unclear')),
 corrected_text text not null default '' check(length(corrected_text)<=30000),
 review_note text not null default '' check(length(review_note)<=3000),
 reviewed_by text, reviewed_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(run_id,number), foreign key(run_id,number) references public.ip_practice_turns(run_id,number) on delete cascade,
 check((status='processing')=(lease_id is not null and lease_until is not null))
);
create index ip_practice_asr_queue on public.ip_practice_transcriptions(created_at,run_id,number) where attempts<3 and status in ('pending','failed','processing');
create index ip_practice_asr_expired on public.ip_practice_transcriptions(lease_until) where status='processing';
alter table public.ip_practice_transcriptions enable row level security;
revoke all on public.ip_practice_transcriptions from public,anon,authenticated;
grant select,insert,update,delete on public.ip_practice_transcriptions to service_role;

-- Invoker trigger runs under the existing service-role upload transaction.
create function public.ip_practice_enqueue_transcription() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.uploaded and new.audio_bytes>0 then
  insert into public.ip_practice_transcriptions(run_id,number,audio_hash) values(new.run_id,new.number,new.audio_hash) on conflict do nothing;
 end if;
 return new;
end $$;
revoke all on function public.ip_practice_enqueue_transcription() from public,anon,authenticated;
grant execute on function public.ip_practice_enqueue_transcription() to service_role;
create trigger ip_practice_transcription_enqueue after insert or update of uploaded on public.ip_practice_turns
for each row execute function public.ip_practice_enqueue_transcription();
insert into public.ip_practice_transcriptions(run_id,number,audio_hash)
 select run_id,number,audio_hash from public.ip_practice_turns where uploaded and audio_bytes>0 on conflict do nothing;

create function public.ip_practice_transcription_service(p_action text,p_actor jsonb,p_body jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 v_type text:=p_actor->>'type'; v_actor text:=p_actor->>'id';
 v_run uuid; v_number integer; v_job public.ip_practice_transcriptions; v_turn public.ip_practice_turns;
 v_rows jsonb; v_segment jsonb; v_status text;
begin
 if coalesce(v_actor,'')='' then raise exception 'unauthorized'; end if;
 if p_action like 'admin_%' then
  if v_type is distinct from 'admin' then raise exception 'forbidden'; end if;
 elsif p_action in ('claim','heartbeat','complete','fail') then
  if v_type is distinct from 'worker' then raise exception 'forbidden'; end if;
 else raise exception 'unsupported_action'; end if;

 if p_action='admin_summaries' then
  if jsonb_typeof(p_body->'runIds') is distinct from 'array' or jsonb_array_length(p_body->'runIds')>30 then raise exception 'invalid_request'; end if;
  select coalesce(jsonb_agg(to_jsonb(r)),'[]') into v_rows from (
   select run_id,count(*) filter(where status='completed') completed,count(*) filter(where status='processing') processing,
    count(*) filter(where status='pending') pending,count(*) filter(where status='failed') failed,
    count(*) filter(where review_status<>'pending') reviewed
   from public.ip_practice_transcriptions where run_id in (select value::uuid from jsonb_array_elements_text(p_body->'runIds')) group by run_id
  ) r;
  return jsonb_build_object('ok',true,'summaries',v_rows);
 end if;
 if p_action='claim' then
  -- Interrupted workers eventually release jobs. Bound retries even after crashes.
  update public.ip_practice_transcriptions set status='failed',lease_id=null,lease_until=null,error_code='lease_expired',updated_at=now()
   where status='processing' and lease_until<now() and attempts>=3;
  select j.* into v_job from public.ip_practice_transcriptions j
   join public.ip_practice_turns t using(run_id,number)
   where t.uploaded and t.audio_hash=j.audio_hash and j.attempts<3
    and ((j.status in ('pending','failed') and j.next_attempt_at<=now()) or (j.status='processing' and j.lease_until<now()))
    and (not(p_body?'runId') or (j.run_id=(p_body->>'runId')::uuid and j.number=(p_body->>'number')::integer and j.audio_hash=p_body->>'audioHash'))
   order by j.created_at,j.run_id,j.number limit 1 for update of j skip locked;
  if not found then return jsonb_build_object('ok',true,'job',null); end if;
  update public.ip_practice_transcriptions set status='processing',attempts=attempts+1,lease_id=gen_random_uuid(),lease_until=now()+interval '5 minutes',error_code='',updated_at=now()
   where run_id=v_job.run_id and number=v_job.number returning * into v_job;
  select * into v_turn from public.ip_practice_turns where run_id=v_job.run_id and number=v_job.number;
  return jsonb_build_object('ok',true,'job',jsonb_build_object('runId',v_job.run_id,'number',v_job.number,'audioHash',v_job.audio_hash,'audioBytes',v_turn.audio_bytes,'audioMime',coalesce(to_jsonb(v_turn)->>'audio_mime','audio/mp4'),'leaseId',v_job.lease_id,'duration',v_turn.duration));
 end if;
 v_run:=(p_body->>'runId')::uuid; v_number:=(p_body->>'number')::integer;
 if p_action='admin_get' then
  if not exists(select 1 from public.ip_practice_runs where id=v_run) then raise exception 'not_found'; end if;
  select coalesce(jsonb_agg(to_jsonb(j)-'lease_id'-'lease_until'-'audio_hash' order by number),'[]') into v_rows
   from public.ip_practice_transcriptions j where run_id=v_run;
  return jsonb_build_object('ok',true,'jobs',v_rows);
 end if;
 select * into v_job from public.ip_practice_transcriptions where run_id=v_run and number=v_number for update;
 if not found then raise exception 'not_found'; end if;
 if p_action='admin_review' then
  if v_job.status<>'completed' then raise exception 'report_not_ready'; end if;
  if v_job.revision is distinct from (p_body->>'revision')::integer then raise exception 'revision_conflict'; end if;
  v_status:=p_body->>'reviewStatus';
  if v_status is null or v_status not in ('pending','ok','minor','meaning','unclear')
   or jsonb_typeof(p_body->'correctedText') is distinct from 'string' or jsonb_typeof(p_body->'note') is distinct from 'string'
   or length(p_body->>'correctedText')>30000 or length(p_body->>'note')>3000
   or (v_status in ('ok','minor','meaning') and length(btrim(p_body->>'correctedText'))=0) then raise exception 'invalid_request'; end if;
  update public.ip_practice_transcriptions set corrected_text=p_body->>'correctedText',review_note=p_body->>'note',review_status=v_status,
   reviewed_by=v_actor,reviewed_at=now(),revision=revision+1,updated_at=now() where run_id=v_run and number=v_number;
 elsif p_action='admin_retry' then
  if v_job.status<>'failed' then raise exception 'report_not_ready'; end if;
  update public.ip_practice_transcriptions set status='pending',attempts=0,error_code='',next_attempt_at=now(),updated_at=now() where run_id=v_run and number=v_number;
 else
  if v_job.status<>'processing' or v_job.lease_id is distinct from (p_body->>'leaseId')::uuid or v_job.lease_until<now()
   or v_job.audio_hash is distinct from p_body->>'audioHash' then raise exception 'lease_lost'; end if;
  if p_action='heartbeat' then
   update public.ip_practice_transcriptions set lease_until=now()+interval '5 minutes' where run_id=v_run and number=v_number;
  elsif p_action='complete' then
   if p_body->>'model' is distinct from 'Whisper large-v3' or coalesce(p_body->>'modelRevision','') !~ '^[a-f0-9]{40}$'
    or coalesce(p_body->>'engineVersion','') !~ '^[a-zA-Z0-9.+_-]{1,40}$'
    or jsonb_typeof(p_body->'transcript') is distinct from 'string' or length(p_body->>'transcript')>30000
    or jsonb_typeof(p_body->'segments') is distinct from 'array' or jsonb_array_length(p_body->'segments')>2000
    or jsonb_typeof(p_body->'processingSeconds') is distinct from 'number' or (p_body->>'processingSeconds')::float8 not between 0 and 86400
    or jsonb_typeof(p_body->'decodedSeconds') is distinct from 'number' or (p_body->>'decodedSeconds')::float8 not between 0 and 3610 then raise exception 'invalid_output'; end if;
   for v_segment in select value from jsonb_array_elements(p_body->'segments') loop
    if jsonb_typeof(v_segment->'text') is distinct from 'string' or length(v_segment->>'text')>4000
     or jsonb_typeof(v_segment->'start') is distinct from 'number' or jsonb_typeof(v_segment->'end') is distinct from 'number'
     or (v_segment->>'start')::float8<0 or (v_segment->>'end')::float8<(v_segment->>'start')::float8
     or (v_segment->>'end')::float8>(p_body->>'decodedSeconds')::float8+10 then raise exception 'invalid_output'; end if;
   end loop;
   update public.ip_practice_transcriptions set status='completed',lease_id=null,lease_until=null,transcript=p_body->>'transcript',
    segments=p_body->'segments',model_revision=p_body->>'modelRevision',engine_version=p_body->>'engineVersion',
    decoded_seconds=(p_body->>'decodedSeconds')::float8,processing_seconds=(p_body->>'processingSeconds')::float8,
    transcribed_at=now(),revision=revision+1,updated_at=now() where run_id=v_run and number=v_number;
  elsif p_action='fail' then
   if coalesce(p_body->>'errorCode','') not in ('audio_unavailable','audio_mismatch','transcription_failed','runtime_unavailable') then raise exception 'invalid_request'; end if;
   update public.ip_practice_transcriptions set status='failed',lease_id=null,lease_until=null,error_code=p_body->>'errorCode',
    next_attempt_at=now()+interval '1 minute'*power(2,attempts-1),updated_at=now() where run_id=v_run and number=v_number;
  end if;
 end if;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.ip_practice_transcription_service(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ip_practice_transcription_service(text,jsonb,jsonb) to service_role;
