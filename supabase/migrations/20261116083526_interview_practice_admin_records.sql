-- Student beta archive. Only the authenticated server may call this service.
create table public.ip_practice_runs (
 id uuid primary key,
 student_id text not null references public.ip_owners(id) on delete cascade,
 mode text not null check(mode in ('job','personality','ai')),
 track text not null,
 field_id text not null default '', field_label text not null default '', region text not null default '',
 recorded_at timestamptz not null,
 question_count integer not null check(question_count between 0 and 20),
 completed boolean not null default false, finished boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index ip_practice_owner_date on public.ip_practice_runs(student_id,recorded_at desc,id desc);
create index ip_practice_date on public.ip_practice_runs(recorded_at desc,id desc);
create table public.ip_practice_turns (
 run_id uuid not null references public.ip_practice_runs(id) on delete cascade,
 number integer not null check(number between 1 and 20),
 question_id text not null default '', question text not null check(length(question) between 1 and 4000),
 answer text not null default '' check(length(answer)<=10000),
 duration double precision not null check(duration between 0 and 3600),
 audio_bytes integer not null check(audio_bytes=0 or audio_bytes between 45 and 16777216),
 audio_hash text not null check(audio_hash='' or audio_hash ~ '^[a-f0-9]{64}$'),
 uploaded boolean not null default false,
 primary key(run_id,number),
 check((audio_bytes=0)=(audio_hash=''))
);
alter table public.ip_practice_runs enable row level security;
alter table public.ip_practice_turns enable row level security;
revoke all on public.ip_practice_runs,public.ip_practice_turns from public,anon,authenticated;
grant select,insert,update,delete on public.ip_practice_runs,public.ip_practice_turns to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('interview-practice','interview-practice',false,16777216,array['audio/mp4'])
 on conflict(id) do nothing;

create function public.ip_practice_service(p_action text,p_actor jsonb,p_body jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 v_actor text:=p_actor->>'id'; v_type text:=p_actor->>'type';
 v_run public.ip_practice_runs; v_turn public.ip_practice_turns; v_item jsonb; v_rows jsonb;
 v_id uuid; v_page integer:=coalesce((p_body->>'page')::integer,0);
 v_search text:=coalesce(p_body->>'search',''); v_mode text:=coalesce(p_body->>'mode','');
begin
 if coalesce(v_actor,'')='' then raise exception 'unauthorized'; end if;
 if p_action like 'admin_%' then
  if v_type is distinct from 'admin' then raise exception 'forbidden'; end if;
 elsif p_action in ('sync','uploaded','get') then
  if v_type is distinct from 'student' then raise exception 'forbidden'; end if;
  if not exists(select 1 from public.ip_student_directory s join public.ip_members m on m.student_id=s.id
    where s.id=v_actor and s.is_active and coalesce(s.account_type,'student')='student' and m.enabled
    and (m.expires_on is null or m.expires_on>=(now() at time zone 'Asia/Seoul')::date)) then raise exception 'not_enrolled'; end if;
 else raise exception 'unsupported_action'; end if;
 if p_action='admin_list' then
  if v_page not between 0 and 10000 or length(v_search)>120 or v_mode not in ('','job','personality','ai') then raise exception 'invalid_request'; end if;
  select coalesce(jsonb_agg(to_jsonb(r)),'[]') into v_rows from (
   select r.*,s.name student_name,m.exam_number,
    (select count(*) from public.ip_practice_turns t where t.run_id=r.id) answer_count,
    (select count(*) from public.ip_practice_turns t where t.run_id=r.id and t.uploaded) uploaded_count,
    (select coalesce(sum(duration),0) from public.ip_practice_turns t where t.run_id=r.id) answer_seconds
   from public.ip_practice_runs r join public.ip_student_directory s on s.id=r.student_id
   left join public.ip_members m on m.student_id=r.student_id
   where (v_mode='' or r.mode=v_mode) and (v_search='' or position(lower(v_search) in lower(coalesce(s.name,'')||' '||r.student_id||' '||coalesce(m.exam_number,'')))>0)
   order by r.recorded_at desc,r.id desc limit 31 offset v_page*30
  ) r;
  return jsonb_build_object('ok',true,'hasMore',jsonb_array_length(v_rows)>30,'runs',
    coalesce((select jsonb_agg(value order by ordinality) from jsonb_array_elements(v_rows) with ordinality where ordinality<=30),'[]'));
 end if;
 v_id:=(p_body->>'runId')::uuid;
 if p_action='sync' then
  if coalesce(p_body->>'mode','') not in ('job','personality','ai') or coalesce(p_body->>'track','') not in ('공채','항해','기관','방제','관제','기타')
   or jsonb_typeof(p_body->'turns') is distinct from 'array' or jsonb_array_length(p_body->'turns')>20
   or coalesce((p_body->>'questionCount')::integer,-1) not between 0 and 20
   or length(coalesce(p_body->>'fieldId',''))>120 or length(coalesce(p_body->>'fieldLabel',''))>120 or length(coalesce(p_body->>'region',''))>120
   or (p_body->>'recordedAt')::timestamptz>now()+interval '1 day' then raise exception 'invalid_request'; end if;
  insert into public.ip_practice_runs(id,student_id,mode,track,field_id,field_label,region,recorded_at,question_count,completed,finished)
   values(v_id,v_actor,p_body->>'mode',p_body->>'track',coalesce(p_body->>'fieldId',''),coalesce(p_body->>'fieldLabel',''),coalesce(p_body->>'region',''),
    (p_body->>'recordedAt')::timestamptz,(p_body->>'questionCount')::integer,coalesce((p_body->>'completed')::boolean,false),coalesce((p_body->>'finished')::boolean,false))
   on conflict(id) do nothing;
 end if;
 select * into v_run from public.ip_practice_runs where id=v_id for update;
 if not found or (v_type='student' and v_run.student_id<>v_actor) then raise exception 'not_found'; end if;
 if p_action='sync' then
  if v_run.mode<>p_body->>'mode' or v_run.track<>p_body->>'track' then raise exception 'idempotency_conflict'; end if;
  if (select count(distinct value->>'number') from jsonb_array_elements(p_body->'turns'))<>jsonb_array_length(p_body->'turns') then raise exception 'invalid_request'; end if;
  for v_item in select value from jsonb_array_elements(p_body->'turns') loop
   if (v_item->>'number')::integer>(p_body->>'questionCount')::integer or length(coalesce(v_item->>'questionId',''))>120 then raise exception 'invalid_request'; end if;
   select * into v_turn from public.ip_practice_turns where run_id=v_id and number=(v_item->>'number')::integer;
   if found and (v_turn.question<>v_item->>'question' or v_turn.audio_hash<>v_item->>'audioHash' or v_turn.audio_bytes<>(v_item->>'audioBytes')::integer) then raise exception 'idempotency_conflict'; end if;
   insert into public.ip_practice_turns(run_id,number,question_id,question,answer,duration,audio_bytes,audio_hash)
    values(v_id,(v_item->>'number')::integer,coalesce(v_item->>'questionId',''),v_item->>'question',coalesce(v_item->>'answer',''),
      (v_item->>'duration')::double precision,(v_item->>'audioBytes')::integer,v_item->>'audioHash')
    on conflict(run_id,number) do update set answer=excluded.answer;
  end loop;
  update public.ip_practice_runs set completed=completed or coalesce((p_body->>'completed')::boolean,false),finished=finished or coalesce((p_body->>'finished')::boolean,false),updated_at=now() where id=v_id;
 elsif p_action='uploaded' then
  update public.ip_practice_turns set uploaded=true where run_id=v_id and number=(p_body->>'number')::integer and audio_hash=p_body->>'audioHash' and audio_bytes>0;
  if not found then raise exception 'not_found'; end if;
 elsif p_action not in ('admin_get','admin_audio','get') then raise exception 'unsupported_action'; end if;
 select coalesce(jsonb_agg(to_jsonb(t) order by number),'[]') into v_rows from public.ip_practice_turns t where run_id=v_id;
 return jsonb_build_object('ok',true,'run',(select to_jsonb(r)||jsonb_build_object('student_name',s.name) from public.ip_practice_runs r join public.ip_student_directory s on s.id=r.student_id where r.id=v_id),'turns',v_rows);
end $$;
revoke all on function public.ip_practice_service(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ip_practice_service(text,jsonb,jsonb) to service_role;
