begin;
create table public.ip_aptitude_rounds (
 id uuid primary key default gen_random_uuid(), kind text not null check(kind in ('half','full')),
 round_no integer not null check(round_no between 1 and 9999), title text not null check(length(title) between 1 and 120),
 state text not null default 'draft' check(state in ('draft','open','closed')), results_released boolean not null default false,
 opens_at timestamptz, closes_at timestamptz, answer_key jsonb not null,
 revision integer not null default 1, key_revision integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(kind,round_no), check(closes_at is null or opens_at is null or closes_at>opens_at),
 check(not results_released or state='closed')
);
create table public.ip_aptitude_attempts (
 round_id uuid not null references public.ip_aptitude_rounds(id) on delete cascade,
 student_id text not null references public.ip_owners(id), answers jsonb not null,
 state text not null default 'draft' check(state in ('draft','submitted')), revision integer not null default 1,
 submission_key uuid, submitted_at timestamptz, correct_count integer check(correct_count between 0 and 150), scored_key_revision integer,
 updated_at timestamptz not null default now(), primary key(round_id,student_id),
 check((state='submitted')=(submitted_at is not null and submission_key is not null and correct_count is not null))
);
create index ip_aptitude_attempts_owner on public.ip_aptitude_attempts(student_id,round_id);
create table public.ip_aptitude_files (
 id uuid primary key default gen_random_uuid(), round_id uuid not null references public.ip_aptitude_rounds(id),
 object_path text not null unique, original_name text not null check(length(original_name) between 1 and 160),
 bytes integer not null check(bytes between 5 and 20971520), sha256 text,
 state text not null default 'pending' check(state in ('pending','ready','deleted')),
 base_revision integer not null, created_at timestamptz not null default now()
);
create table public.ip_aptitude_audit (
 id bigint generated always as identity primary key, round_id uuid not null references public.ip_aptitude_rounds(id),
 actor_id text not null, reason text not null, before_value jsonb, after_value jsonb not null, created_at timestamptz not null default now()
);
create table public.ip_aptitude_file_gc (object_path text primary key,created_at timestamptz not null default now(),available_at timestamptz not null default now());
alter table public.ip_aptitude_rounds enable row level security;
alter table public.ip_aptitude_attempts enable row level security;
alter table public.ip_aptitude_files enable row level security;
alter table public.ip_aptitude_audit enable row level security;
alter table public.ip_aptitude_file_gc enable row level security;
revoke all on public.ip_aptitude_rounds,public.ip_aptitude_attempts,public.ip_aptitude_files,public.ip_aptitude_audit,public.ip_aptitude_file_gc from public,anon,authenticated;
grant select,insert,update,delete on public.ip_aptitude_rounds,public.ip_aptitude_attempts,public.ip_aptitude_files,public.ip_aptitude_audit,public.ip_aptitude_file_gc to service_role;
grant usage,select on sequence public.ip_aptitude_audit_id_seq to service_role;

create function public.ip_aptitude_score(a jsonb,k jsonb) returns integer
language sql immutable set search_path='' as $$
 select count(*)::integer from jsonb_array_elements(a) with ordinality x
 where x.value=k->(x.ordinality::int-1) and x.value<>'0'::jsonb
$$;
create function public.ip_aptitude_round_json(r public.ip_aptitude_rounds) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',r.id,'kind',r.kind,'roundNo',r.round_no,'title',r.title,'state',r.state,
 'resultsReleased',r.results_released,'opensAt',r.opens_at,'closesAt',r.closes_at,'revision',r.revision,'keyRevision',r.key_revision,
 'accepting',r.state='open' and (r.opens_at is null or now()>=r.opens_at) and (r.closes_at is null or now()<r.closes_at),
 'perSection',case when r.kind='full' then 30 else 15 end,'questionCount',case when r.kind='full' then 150 else 75 end,
 'sections',jsonb_build_array('언어이해','언어비판','수열추리','도형추리','문제해결'),
 'minutes',case when r.kind='full' then '[15,20,10,15,30]'::jsonb else '[8,10,5,8,15]'::jsonb end)
$$;

create function public.ip_aptitude_service(p_action text,p_actor jsonb,p_body jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
 owner_id text:=p_actor->>'id'; is_admin boolean:=p_actor->>'type'='admin';
 r public.ip_aptitude_rounds; old_r public.ip_aptitude_rounds; a public.ip_aptitude_attempts; f public.ip_aptitude_files;
 rid uuid; n integer; submitted integer; affected integer; result jsonb; rows jsonb; files jsonb;
 keys jsonb; answer_list jsonb; reason text; released boolean; new_key_revision integer; file_id uuid;
begin
 if coalesce(owner_id,'')='' then raise exception 'unauthorized'; end if;
 if p_action like 'admin_%' then
  if not coalesce(is_admin,false) then raise exception 'forbidden'; end if;
 else
  if p_actor->>'type' is distinct from 'student' then raise exception 'forbidden'; end if;
  -- All active interview members, independent of track or mock-interview test flags.
  if not exists(select 1 from public.ip_members m join public.ip_owners o on o.id=m.student_id join public.ip_student_directory d on d.id=m.student_id
    where m.student_id=owner_id and m.enabled and o.active and d.is_active and coalesce(d.account_type,'student')='student' and (m.expires_on is null or m.expires_on>=(now() at time zone 'Asia/Seoul')::date))
    or not coalesce((select enabled from public.ip_settings where id),false) then raise exception 'not_enrolled'; end if;
 end if;
 if p_action in ('list','admin_list') then
  select coalesce(jsonb_agg(public.ip_aptitude_round_json(e) order by e.kind,e.round_no desc),'[]') into rows
   from public.ip_aptitude_rounds e where is_admin or e.state<>'draft';
  return jsonb_build_object('ok',true,'rounds',rows,'studentId',case when not is_admin then owner_id end);
 end if;
 if p_action='admin_save' then
  if p_body ? 'points' then raise exception 'invalid_request'; end if;
  rid:=(p_body->>'id')::uuid;
  select * into old_r from public.ip_aptitude_rounds where id=rid for update;
  if found then
   if old_r.revision is distinct from (p_body->>'revision')::int then raise exception 'revision_conflict'; end if;
  elsif (p_body->>'revision')::int<>0 then raise exception 'not_found'; end if;
  if p_body->>'kind' not in ('half','full') or p_body->>'state' not in ('draft','open','closed')
   or length(btrim(p_body->>'title')) not between 1 and 120 or (p_body->>'roundNo')::int not between 1 and 9999 then raise exception 'invalid_request'; end if;
  n:=case when p_body->>'kind'='full' then 150 else 75 end;
  keys:=p_body->'answerKey';
  if jsonb_typeof(keys)<>'array' or jsonb_array_length(keys)<>n then raise exception 'invalid_request'; end if;
  if exists(select 1 from jsonb_array_elements(keys) x where x<>'null'::jsonb and (jsonb_typeof(x)<>'number' or x::text !~ '^[1-5]$')) then raise exception 'invalid_request'; end if;
  if p_body->>'state'<>'draft' and exists(select 1 from jsonb_array_elements(keys) x where x='null'::jsonb) then raise exception 'answer_key_incomplete'; end if;
  select count(*) into submitted from public.ip_aptitude_attempts where round_id=rid and state='submitted';
  if old_r.id is not null and (old_r.state<>'draft' or submitted>0) and old_r.kind<>p_body->>'kind' then raise exception 'exam_structure_locked'; end if;
  if old_r.id is not null and old_r.state<>'draft' and p_body->>'state'='draft' then raise exception 'exam_structure_locked'; end if;
  if old_r.results_released and p_body->>'state'<>'closed' then raise exception 'results_already_released'; end if;
  reason:=btrim(coalesce(p_body->>'reason',''));
  if submitted>0 and (old_r.answer_key<>keys) and length(reason)<5 then raise exception 'correction_reason_required'; end if;
  new_key_revision:=coalesce(old_r.key_revision,1)+case when old_r.id is not null and (old_r.answer_key<>keys) then 1 else 0 end;
  insert into public.ip_aptitude_rounds(id,kind,round_no,title,state,results_released,opens_at,closes_at,answer_key,key_revision)
   values(rid,p_body->>'kind',(p_body->>'roundNo')::int,btrim(p_body->>'title'),p_body->>'state',coalesce((p_body->>'resultsReleased')::boolean,false),nullif(p_body->>'opensAt','')::timestamptz,nullif(p_body->>'closesAt','')::timestamptz,keys,new_key_revision)
   on conflict(id) do update set kind=excluded.kind,round_no=excluded.round_no,title=excluded.title,state=excluded.state,results_released=excluded.results_released,
    opens_at=excluded.opens_at,closes_at=excluded.closes_at,answer_key=excluded.answer_key,key_revision=excluded.key_revision,revision=public.ip_aptitude_rounds.revision+1,updated_at=now()
    where old_r.id is not null and public.ip_aptitude_rounds.revision=(p_body->>'revision')::int
   returning * into r;
  if not found then raise exception 'revision_conflict'; end if;
  affected:=0;
  if old_r.id is not null and (old_r.answer_key<>keys) then
   update public.ip_aptitude_attempts set correct_count=public.ip_aptitude_score(answers,keys),scored_key_revision=new_key_revision
    where round_id=rid and state='submitted';
   get diagnostics affected=row_count;
  end if;
  insert into public.ip_aptitude_audit(round_id,actor_id,reason,before_value,after_value)
   values(rid,owner_id,coalesce(nullif(reason,''),'회차 저장'),case when old_r.id is not null then to_jsonb(old_r) end,to_jsonb(r));
  return jsonb_build_object('ok',true,'round',public.ip_aptitude_round_json(r),'rescored',affected);
 end if;
 if p_action in ('admin_gc','admin_gc_ack') then
  if p_action='admin_gc_ack' then delete from public.ip_aptitude_file_gc where object_path=p_body->>'objectPath';return jsonb_build_object('ok',true); end if;
  insert into public.ip_aptitude_file_gc(object_path) select object_path from public.ip_aptitude_files where state='pending' and created_at<now()-interval '3 hours' on conflict do nothing;
  update public.ip_aptitude_files set state='deleted' where state='pending' and created_at<now()-interval '3 hours';
  return jsonb_build_object('ok',true,'paths',(select coalesce(jsonb_agg(object_path),'[]') from (select object_path from public.ip_aptitude_file_gc where available_at<=now() order by created_at limit 20) x));
 end if;
 rid:=(p_body->>'id')::uuid;
 select * into r from public.ip_aptitude_rounds where id=rid for update;
 if not found or (not is_admin and r.state='draft') then raise exception 'not_found'; end if;
 n:=case when r.kind='full' then 150 else 75 end;
 select * into a from public.ip_aptitude_attempts where round_id=rid and student_id=owner_id for update;
 if p_action='admin_delete' then
  if r.revision<>(p_body->>'revision')::int then raise exception 'revision_conflict'; end if;
  if r.state<>'draft' or exists(select 1 from public.ip_aptitude_attempts where round_id=rid) then raise exception 'exam_structure_locked'; end if;
  insert into public.ip_aptitude_file_gc(object_path,available_at) select object_path,greatest(now(),created_at+interval '3 hours') from public.ip_aptitude_files where round_id=rid on conflict do nothing;
  delete from public.ip_aptitude_files where round_id=rid;delete from public.ip_aptitude_audit where round_id=rid;delete from public.ip_aptitude_rounds where id=rid;
  return jsonb_build_object('ok',true);
 end if;
 if p_action in ('save','submit') then
  answer_list:=p_body->'answers';
  if jsonb_typeof(answer_list)<>'array' or jsonb_array_length(answer_list)<>n or exists(select 1 from jsonb_array_elements(answer_list) x where jsonb_typeof(x)<>'number' or x::text !~ '^[0-5]$') then raise exception 'invalid_answers'; end if;
  if a.state='submitted' then
   if p_action='submit' and a.submission_key=(p_body->>'requestKey')::uuid and a.answers=answer_list then p_action:='get';
   else raise exception 'already_submitted'; end if;
  else
   if r.state<>'open' or (r.opens_at is not null and now()<r.opens_at) or (r.closes_at is not null and now()>=r.closes_at) then raise exception 'exam_not_open'; end if;
   if coalesce(a.revision,0) is distinct from (p_body->>'revision')::int then raise exception 'revision_conflict'; end if;
   if p_action='submit' and not exists(select 1 from jsonb_array_elements(answer_list) x where x<>'0'::jsonb) then raise exception 'empty_answers'; end if;
   insert into public.ip_aptitude_attempts(round_id,student_id,answers,state,submission_key,submitted_at,correct_count,scored_key_revision)
    values(rid,owner_id,answer_list,case when p_action='submit' then 'submitted' else 'draft' end,case when p_action='submit' then (p_body->>'requestKey')::uuid end,
     case when p_action='submit' then now() end,case when p_action='submit' then public.ip_aptitude_score(answer_list,r.answer_key) end,case when p_action='submit' then r.key_revision end)
    on conflict(round_id,student_id) do update set answers=excluded.answers,state=excluded.state,submission_key=excluded.submission_key,submitted_at=excluded.submitted_at,
     correct_count=excluded.correct_count,scored_key_revision=excluded.scored_key_revision,revision=public.ip_aptitude_attempts.revision+1,updated_at=now()
    returning * into a;
   p_action:='get';
  end if;
 end if;
 released:=r.state='closed' and r.results_released and a.state='submitted';
 if p_action in ('file','admin_file','admin_upload_abort','admin_upload_probe','admin_upload_prepare','admin_upload_commit','admin_file_delete') then
  if p_action='admin_upload_prepare' then
   if r.revision<>(p_body->>'revision')::int then raise exception 'revision_conflict'; end if;
   if (select count(*) from public.ip_aptitude_files where round_id=rid and state<>'deleted')>=5 then raise exception 'file_limit'; end if;
   file_id:=gen_random_uuid();
   insert into public.ip_aptitude_files(id,round_id,object_path,original_name,bytes,base_revision)
    values(file_id,rid,rid::text||'/'||file_id::text||'.pdf',p_body->>'name',(p_body->>'bytes')::int,r.revision) returning * into f;
   return jsonb_build_object('ok',true,'file',to_jsonb(f));
  end if;
  select * into f from public.ip_aptitude_files where id=(p_body->>'fileId')::uuid and round_id=rid for update;
  if not found then raise exception 'not_found'; end if;
  if p_action='admin_upload_abort' then
   if f.state='pending' then
    insert into public.ip_aptitude_file_gc(object_path,available_at) values(f.object_path,greatest(now(),f.created_at+interval '3 hours')) on conflict do nothing;
    update public.ip_aptitude_files set state='deleted' where id=f.id;
   end if;
   return jsonb_build_object('ok',true);
  end if;
  if p_action='admin_upload_probe' then
   if f.state='deleted' then raise exception 'not_found'; end if;
   return jsonb_build_object('ok',true,'objectPath',f.object_path,'bytes',f.bytes);
  end if;
  if p_action='admin_upload_commit' then
   if f.state='ready' then return jsonb_build_object('ok',true,'revision',r.revision); end if;
   if f.state<>'pending' or r.revision<>f.base_revision or f.bytes<>(p_body->>'bytes')::int then raise exception 'revision_conflict'; end if;
   if coalesce(p_body->>'sha256','')!~'^[0-9a-f]{64}$' then raise exception 'invalid_file'; end if;
   update public.ip_aptitude_files set state='ready',sha256=p_body->>'sha256' where id=f.id;
   update public.ip_aptitude_rounds set revision=revision+1,updated_at=now() where id=rid returning * into r;
   return jsonb_build_object('ok',true,'revision',r.revision);
  elsif p_action='admin_file_delete' then
   if f.state='deleted' then return jsonb_build_object('ok',true,'revision',r.revision); end if;
   if r.revision<>(p_body->>'revision')::int then raise exception 'revision_conflict'; end if;
   insert into public.ip_aptitude_file_gc(object_path,available_at) values(f.object_path,greatest(now(),f.created_at+interval '3 hours')) on conflict do nothing;
   update public.ip_aptitude_files set state='deleted' where id=f.id;
   update public.ip_aptitude_rounds set revision=revision+1,updated_at=now() where id=rid returning * into r;
   return jsonb_build_object('ok',true,'revision',r.revision);
  end if;
  if f.state<>'ready' or (not is_admin and not coalesce(released,false)) then raise exception 'forbidden'; end if;
  return jsonb_build_object('ok',true,'objectPath',f.object_path,'name',f.original_name);
 end if;
 if p_action='admin_report' then
  with ranked as(select s.*,rank() over(order by correct_count desc) as rank from public.ip_aptitude_attempts s where round_id=rid and state='submitted'),
  population as(select m.student_id from public.ip_members m join public.ip_owners o on o.id=m.student_id join public.ip_student_directory d on d.id=m.student_id where m.enabled and o.active and d.is_active and coalesce(d.account_type,'student')='student' and (m.expires_on is null or m.expires_on>=(now() at time zone 'Asia/Seoul')::date)
   union select student_id from ranked)
  select coalesce(jsonb_agg(jsonb_build_object('studentId',p.student_id,'name',o.name,'state',coalesce(t.state,'not_submitted'),'correctCount',s.correct_count,
   'accuracy',round(s.correct_count::numeric/n*100,2),'rank',s.rank,'submittedAt',s.submitted_at) order by s.rank nulls last,o.name,p.student_id),'[]') into rows
  from population p join public.ip_owners o on o.id=p.student_id left join public.ip_aptitude_attempts t on t.round_id=rid and t.student_id=p.student_id left join ranked s on s.student_id=p.student_id;
  return jsonb_build_object('ok',true,'round',public.ip_aptitude_round_json(r),'students',rows);
 end if;
 if p_action not in ('get','admin_get') then raise exception 'unsupported_action'; end if;
 result:=jsonb_build_object('ok',true,'round',public.ip_aptitude_round_json(r));
 if is_admin then
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',original_name,'bytes',bytes,'state',state) order by created_at),'[]') into files
   from public.ip_aptitude_files where round_id=rid and state<>'deleted';
  return result||jsonb_build_object('answerKey',r.answer_key,'files',files,'submittedCount',(select count(*) from public.ip_aptitude_attempts where round_id=rid and state='submitted'));
 end if;
 result:=result||jsonb_build_object('studentId',owner_id,'attempt',case when a.round_id is not null then jsonb_build_object('state',a.state,'revision',a.revision,'answers',a.answers,'submittedAt',a.submitted_at,'requestKey',a.submission_key) end);
 if coalesce(released,false) then
  with ranked as(select student_id,rank() over(order by correct_count desc) as rank from public.ip_aptitude_attempts where round_id=rid and state='submitted')
   select jsonb_build_object('correctCount',a.correct_count,'totalQuestions',n,'accuracy',round(a.correct_count::numeric/n*100,2),'rank',rank,
    'participants',(select count(*) from ranked),'keyRevision',r.key_revision) into rows from ranked where student_id=owner_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',original_name,'bytes',bytes) order by created_at),'[]') into files from public.ip_aptitude_files where round_id=rid and state='ready';
  result:=result||jsonb_build_object('result',rows,'correctAnswers',r.answer_key,'files',files);
 end if;
 return result;
end $$;
revoke all on function public.ip_aptitude_score(jsonb,jsonb),public.ip_aptitude_round_json(public.ip_aptitude_rounds),public.ip_aptitude_service(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ip_aptitude_score(jsonb,jsonb),public.ip_aptitude_round_json(public.ip_aptitude_rounds),public.ip_aptitude_service(text,jsonb,jsonb) to service_role;
-- Browser clients receive only bounded upload/download capabilities from the authenticated API.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('interview-aptitude','interview-aptitude',false,20971520,array['application/pdf'])
 on conflict(id) do update set public=false,file_size_limit=20971520,allowed_mime_types=array['application/pdf'];
commit;
