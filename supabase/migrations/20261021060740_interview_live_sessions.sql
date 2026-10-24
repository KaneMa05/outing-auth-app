-- Additive, server-only live practice. No official grades are written here.
begin;
create table public.ip_live_runs (
 id uuid primary key default gen_random_uuid(), student_id text not null,
 request_key uuid not null, state text not null default 'starting'
   check(state in ('starting','active','closing','completed','interrupted','unknown')),
 provider_id text, questions jsonb not null, turns jsonb not null default '[]',
 current_question text not null default '', recording_partial boolean not null default false, recording_state text not null default 'pending'
   check(recording_state in ('pending','ready','missing')),
 created_at timestamptz not null default now(), deadline timestamptz not null default now()+interval '10 minutes',
 heartbeat_at timestamptz not null default now(), retain_until timestamptz not null,
 unique(student_id,request_key)
);
create unique index ip_live_one_active on public.ip_live_runs(student_id)
 where state in ('starting','active','closing','unknown');
create index ip_live_owner_created on public.ip_live_runs(student_id,created_at desc);
create index ip_live_retention on public.ip_live_runs(retain_until);
alter table public.ip_live_runs enable row level security;
revoke all on public.ip_live_runs from public,anon,authenticated;
grant select,insert,update,delete on public.ip_live_runs to service_role;

create function public.ip_live_member_retention() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.expires_on is not null and new.expires_on is distinct from old.expires_on then
  update public.ip_live_runs set retain_until=(new.expires_on+31)::timestamp at time zone 'Asia/Seoul'
   where student_id=new.student_id;
 end if;
 return new;
end $$;
revoke all on function public.ip_live_member_retention() from public,anon,authenticated;
grant execute on function public.ip_live_member_retention() to service_role;
create trigger ip_live_retention_change after update of expires_on on public.ip_members
 for each row execute function public.ip_live_member_retention();

create function public.ip_live_service(p_action text,p_actor jsonb,p_body jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 v_id text:=p_actor->>'id'; v_type text:=p_actor->>'type';
 v_member public.ip_members; v_run public.ip_live_runs; v_questions jsonb; v_rows jsonb;
 v_ready boolean; v_count integer;
begin
 if coalesce(v_id,'')='' or coalesce(v_type,'') not in ('student','admin','server') then raise exception 'unauthorized'; end if;
 if p_action in ('sweep','purge','activate','save','closed') then
  if v_type<>'server' then raise exception 'forbidden'; end if;
 elsif p_action like 'admin_%' then
  if v_type<>'admin' then raise exception 'forbidden'; end if;
 else
  if v_type<>'student' or not exists(select 1 from public.students where id=v_id and is_active and coalesce(account_type,'student')='student') then raise exception 'forbidden'; end if;
  select * into v_member from public.ip_members where student_id=v_id;
  v_ready:=coalesce(v_member.enabled and v_member.expires_on>=(now() at time zone 'Asia/Seoul')::date
    and (select enabled from public.ip_settings where id),false);
 end if;
 if p_action='ready' then
  select count(*) into v_count from public.ip_questions where status='published' and length(prompt)<=180
   and (cardinality(tracks)=0 or v_member.track=any(tracks));
  return jsonb_build_object('ok',true,'ready',v_ready and v_count>=3,'reason',case
   when v_member.expires_on is null then 'enrollment_end_required' when not v_ready then 'not_enrolled'
   when v_count<3 then 'questions_unavailable' else '' end);
 elsif p_action='reserve' then
  if v_ready is not true then raise exception 'not_enrolled'; end if;
  -- Serialize admissions, including the global concurrency ceiling.
  perform pg_catalog.pg_advisory_xact_lock(214637001);
  select * into v_run from public.ip_live_runs where student_id=v_id and request_key=(p_body->>'requestKey')::uuid;
  if found then raise exception 'unsafe_retry'; end if;
  if exists(select 1 from public.ip_live_runs where student_id=v_id and state in ('starting','active','closing','unknown')) then raise exception 'admission_busy'; end if;
  if (select count(*) from public.ip_live_runs where student_id=v_id and created_at>=date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')>=3 then raise exception 'daily_limit'; end if;
  if (select count(*) from public.ip_live_runs where state in ('starting','active','closing','unknown'))>=5 then raise exception 'queue_full'; end if;
  select jsonb_agg(to_jsonb(q)) into v_questions from (
   select id,prompt,category,revision from public.ip_questions where status='published' and length(prompt)<=180
    and (cardinality(tracks)=0 or v_member.track=any(tracks)) order by random() limit 3) q;
  if jsonb_array_length(coalesce(v_questions,'[]'))<3 then raise exception 'questions_unavailable'; end if;
  insert into public.ip_live_runs(student_id,request_key,questions,retain_until,current_question)
   values(v_id,(p_body->>'requestKey')::uuid,v_questions,(v_member.expires_on+31)::timestamp at time zone 'Asia/Seoul',v_questions->0->>'prompt') returning * into v_run;
  return jsonb_build_object('ok',true,'run',to_jsonb(v_run));
 elsif p_action in ('list','admin_list') then
  select coalesce(jsonb_agg(to_jsonb(r)),'[]') into v_rows from (
   select id,student_id,state,current_question,recording_state,created_at,retain_until from public.ip_live_runs
   where retain_until>now() and (v_type='admin' or student_id=v_id)
   order by created_at desc,id desc limit 31 offset greatest(0,least(10000,coalesce((p_body->>'page')::integer,0)))*30) r;
  return jsonb_build_object('ok',true,'hasMore',jsonb_array_length(v_rows)>30,'runs',
   coalesce((select jsonb_agg(value order by ordinality) from jsonb_array_elements(v_rows) with ordinality where ordinality<=30),'[]'));
 elsif p_action='sweep' then
  select coalesce(jsonb_agg(to_jsonb(r)),'[]') into v_rows from (select * from public.ip_live_runs
   where retain_until<=now() or (state in ('starting','active','closing','unknown') and
    (deadline<now() or heartbeat_at<now()-interval '60 seconds')) or
    (state in ('completed','interrupted') and recording_state='pending')
   order by case when retain_until<=now() then 0 when state in ('starting','active','closing','unknown') then 1 else 2 end,created_at limit 100) r;
  return jsonb_build_object('ok',true,'runs',v_rows);
 end if;
 select * into v_run from public.ip_live_runs where id=(p_body->>'runId')::uuid for update;
 if not found then raise exception 'not_found'; end if;
 if v_type='student' and v_run.student_id<>v_id then raise exception 'not_found'; end if;
 if v_type<>'server' and v_run.retain_until<=now() then raise exception 'not_found'; end if;
 if p_action in ('get','admin_get','heartbeat') then
  if p_action='heartbeat' then
   if not v_ready then raise exception 'not_enrolled'; end if;
   if v_run.deadline<=now() then raise exception 'session_expired'; end if;
   update public.ip_live_runs set heartbeat_at=now() where id=v_run.id;
  end if;
  return jsonb_build_object('ok',true,'run',to_jsonb(v_run)-'provider_id'-'request_key'-'questions');
 elsif p_action='activate' then
  if v_run.state<>'starting' then raise exception 'unsafe_retry'; end if;
  update public.ip_live_runs set provider_id=p_body->>'providerId',state='active' where id=v_run.id;
 elsif p_action='save' then
  if v_run.state not in ('active','closing') then raise exception 'session_expired'; end if;
  if jsonb_typeof(p_body->'turns')<>'array' or jsonb_array_length(p_body->'turns')>9 or octet_length((p_body->'turns')::text)>180000 then raise exception 'invalid_request'; end if;
  update public.ip_live_runs set turns=p_body->'turns',current_question=left(p_body->>'currentQuestion',4000) where id=v_run.id;
 elsif p_action='closed' then
  if p_body->>'state' not in ('completed','interrupted','unknown') then raise exception 'invalid_request'; end if;
  update public.ip_live_runs set state=p_body->>'state',recording_state=p_body->>'recordingState',
   recording_partial=coalesce((p_body->>'recordingPartial')::boolean,recording_partial) where id=v_run.id;
 elsif p_action='purge' then
  if v_run.retain_until>now() then raise exception 'forbidden'; end if;
  delete from public.ip_live_runs where id=v_run.id;
 else raise exception 'unsupported_action';
 end if;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.ip_live_service(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ip_live_service(text,jsonb,jsonb) to service_role;

-- Local PGlite tests do not install Storage. Production creates a private bucket.
do $$ begin
 if to_regclass('storage.buckets') is not null then
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
   values('interview-live','interview-live',false,32000000,array['audio/wav']) on conflict(id) do nothing;
 end if;
end $$;
commit;
