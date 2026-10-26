create table public.ip_draft_question_jobs (
 id uuid primary key default gen_random_uuid(), student_id text not null references public.students(id) on delete cascade,
 source_hash text not null, experience jsonb not null, state text not null default 'queued' check(state in ('queued','running','completed','failed')),
 questions jsonb, lease uuid, expires_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(student_id,source_hash)
);
create index ip_draft_jobs_pending on public.ip_draft_question_jobs(state,created_at);
create index ip_draft_jobs_student_time on public.ip_draft_question_jobs(student_id,created_at);
create table public.ip_draft_worker_presence(id boolean primary key default true check(id), seen_at timestamptz not null);
alter table public.ip_draft_question_jobs enable row level security;
alter table public.ip_draft_worker_presence enable row level security;
revoke all on public.ip_draft_question_jobs,public.ip_draft_worker_presence from public,anon,authenticated;
grant all on public.ip_draft_question_jobs,public.ip_draft_worker_presence to service_role;

create or replace function public.ip_draft_question_service(p_action text,p_actor jsonb,p_body jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare sid text:=p_actor->>'id'; j ip_draft_question_jobs; h text; e jsonb:=p_body->'experience'; active boolean; jobs jsonb; q jsonb;
begin
 if p_actor->>'type'='worker' then
  if p_action='poll' then
   insert into ip_draft_worker_presence values(true,now()) on conflict(id) do update set seen_at=now();
   update ip_draft_question_jobs set state='failed',updated_at=now() where state in ('queued','running') and expires_at<now();
   -- Expired work is never automatically executed again.
   with picked as (select id from ip_draft_question_jobs where state='queued' order by created_at for update skip locked limit 1),
   claimed as (update ip_draft_question_jobs set state='running',lease=gen_random_uuid(),expires_at=now()+interval '3 minutes',updated_at=now() where id in(select id from picked) returning *)
   select coalesce(jsonb_agg(jsonb_build_object('id',id,'lease',lease,'experience',experience)),'[]') into jobs from claimed;
   return jsonb_build_object('ok',true,'jobs',jobs);
  end if;
  select * into j from ip_draft_question_jobs where id=(p_body->>'id')::uuid for update;
  if j.id is null or j.lease is distinct from (p_body->>'lease')::uuid then raise exception 'lease_lost';end if;
  if j.state='completed' then return jsonb_build_object('ok',true);end if;
  if j.state<>'running' or j.expires_at<now() then raise exception 'lease_lost';end if;
  if p_action='complete' then
   if jsonb_typeof(p_body->'questions') is distinct from 'array' or jsonb_array_length(p_body->'questions')<>2 then raise exception 'invalid_output';end if;
   for q in select value from jsonb_array_elements(p_body->'questions') loop
    if jsonb_typeof(q) is distinct from 'string' or length(q#>>'{}') not between 1 and 600 then raise exception 'invalid_output';end if;
   end loop;
   if p_body->'questions'->0=p_body->'questions'->1 then raise exception 'invalid_output';end if;
   update ip_draft_question_jobs set state='completed',questions=p_body->'questions',updated_at=now() where id=j.id;
  elsif p_action='fail' then update ip_draft_question_jobs set state='failed',updated_at=now() where id=j.id;
  else raise exception 'unsupported_action';end if;
  return jsonb_build_object('ok',true);
 end if;
 if p_actor->>'type' is distinct from 'student' or sid is null then raise exception 'unauthorized';end if;
 if not coalesce((ip_service('status',p_actor,'{}')->>'enabled')::boolean,false) then raise exception 'not_enrolled';end if;
 perform 1 from ip_members where student_id=sid for update;
 if not coalesce((ip_service('status',p_actor,'{}')->>'enabled')::boolean,false) then raise exception 'not_enrolled';end if;
 select coalesce(max(seen_at)>now()-interval '4 minutes',false) into active from ip_draft_worker_presence;
 if p_action='request' then
  if jsonb_typeof(e) is distinct from 'object' or jsonb_typeof(e->'title') is distinct from 'string' or jsonb_typeof(e->'content') is distinct from 'string' or length(e->>'title')>2000 or length(trim(e->>'content')) not between 10 and 12000 or e-'title'-'content'<>'{}'::jsonb then raise exception 'invalid_request';end if;
  h:=md5('draft-v1:'||e::text);
  select * into j from ip_draft_question_jobs where student_id=sid and source_hash=h;
  if j.id is null then
   if not active then raise exception 'questions_unavailable';end if;
   if (select count(*) from ip_draft_question_jobs where student_id=sid and created_at>now()-interval '24 hours')>=10 then raise exception 'daily_limit';end if;
   if exists(select 1 from ip_draft_question_jobs where student_id=sid and state in ('queued','running') and expires_at>now()) then raise exception 'admission_busy';end if;
   if (select count(*) from ip_draft_question_jobs where state in ('queued','running') and expires_at>now())>=20 then raise exception 'queue_full';end if;
   insert into ip_draft_question_jobs(student_id,source_hash,experience,expires_at) values(sid,h,e,now()+interval '3 minutes') returning * into j;
  end if;
 elsif p_action='status' then
  select * into j from ip_draft_question_jobs where id=(p_body->>'id')::uuid and student_id=sid;
  if j.id is null then raise exception 'not_found';end if;
 else raise exception 'unsupported_action';end if;
 if j.state in ('queued','running') and j.expires_at<now() then
  update ip_draft_question_jobs set state='failed',updated_at=now() where id=j.id returning * into j;
 end if;
 return jsonb_build_object('ok',true,'id',j.id,'state',j.state,'questions',case when j.state='completed' then j.questions else '[]'::jsonb end);
end;$$;
revoke all on function public.ip_draft_question_service(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ip_draft_question_service(text,jsonb,jsonb) to service_role;
