begin;
set local lock_timeout='5s';
create table public.ip_question_examples (
 question_id text primary key references public.ip_questions(id) on delete cascade,
 question_prompt text not null, question_category text not null check(question_category in ('job','personality')),
 answer text not null check(length(trim(answer)) between 1 and 20000),
 revision integer not null check(revision>0),
 updated_by text not null, updated_at timestamptz not null default now()
);
create table public.ip_question_example_history (
 question_id text not null references public.ip_questions(id) on delete cascade,
 revision integer not null check(revision>0), question_prompt text not null, question_category text not null, answer text not null,
 updated_by text not null, updated_at timestamptz not null default now(),
 primary key(question_id,revision)
);
alter table public.ip_question_examples enable row level security;
alter table public.ip_question_example_history enable row level security;
revoke all on public.ip_question_examples,public.ip_question_example_history from public,anon,authenticated;
grant select,insert,update on public.ip_question_examples to service_role;
grant select,insert on public.ip_question_example_history to service_role;

create function public.ip_practice_reference_answer(p_id text,p_prompt text,p_mode text,p_track text) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare q public.ip_questions; result jsonb;
begin
 select * into q from public.ip_questions where id=p_id and prompt=p_prompt and status='published'
  and category=p_mode and (cardinality(tracks)=0 or p_track=any(tracks));
 if not found then return null;end if;
 select jsonb_build_object('answer',answer,'revision',revision,'source','admin') into result
  from public.ip_question_examples where question_id=q.id and question_prompt=q.prompt and question_category=q.category;
 if result is not null then return result;end if;
 select jsonb_build_object('answer',o.answer,'occurrenceId',o.id,'sourceId',o.source_id) into result
  from public.ip_occurrences o join public.ip_sources s on s.id=o.source_id
  where o.question_id=q.id and length(trim(coalesce(o.answer,'')))>20 and length(o.answer)<=20000
  order by (s.track=p_track) desc,o.id asc limit 1;
 return result;
end $$;
revoke all on function public.ip_practice_reference_answer(text,text,text,text) from public,anon,authenticated;
grant execute on function public.ip_practice_reference_answer(text,text,text,text) to service_role;

create function public.ip_question_example_service(p_action text,p_actor jsonb,p_body jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare q public.ip_questions; e public.ip_question_examples; detail jsonb; answer_value text; info jsonb; reference jsonb;
begin
 if p_action='practice_reference' then
  if p_actor->>'type' is distinct from 'student' then raise exception 'forbidden';end if;
  info:=public.ip_mock_access_service('mock_status',p_actor,'{}'::jsonb);
  if info->'allowed' is distinct from 'true'::jsonb then raise exception 'forbidden';end if;
  info:=public.ip_service('bootstrap',p_actor,'{}'::jsonb);
  if not exists(select 1 from public.ip_practice_runs r join public.ip_practice_turns t on t.run_id=r.id
   where r.id=(p_body->>'runId')::uuid and r.student_id=p_actor->>'id' and r.mode=p_body->>'mode'
    and r.completed and r.finished and t.number=(p_body->>'number')::integer and t.uploaded
    and t.question_id=p_body->>'questionId') then raise exception 'forbidden';end if;
  select * into q from public.ip_questions where id=p_body->>'questionId' and prompt=p_body->>'questionPrompt'
   and category=p_body->>'mode' and category in ('job','personality') and status='published'
   and (cardinality(tracks)=0 or (info->'member'->>'track')=any(tracks));
  if not found then raise exception 'question_unavailable';end if;
  reference:=public.ip_practice_reference_answer(q.id,q.prompt,q.category,info->'member'->>'track');
  return jsonb_build_object('ok',true,'accountId',p_actor->>'id','referenceAnswer',reference->>'answer');
 end if;
 if p_actor->>'type' is distinct from 'admin' or length(coalesce(p_actor->>'id',''))=0 then raise exception 'forbidden';end if;
 if p_action not in ('admin_question_example_detail','admin_question_example_save') then raise exception 'unsupported_action';end if;
 select * into q from public.ip_questions where id=p_body->>'id' for update;
 if not found then raise exception 'question_unavailable';end if;
 select * into e from public.ip_question_examples where question_id=q.id;
 if p_action='admin_question_example_save' then
  if jsonb_typeof(p_body->'revision') is distinct from 'number' or jsonb_typeof(p_body->'questionRevision') is distinct from 'number'
   or jsonb_typeof(p_body->'answer') is distinct from 'string' then raise exception 'invalid_request';end if;
  if (p_body->>'revision')::integer<>coalesce(e.revision,0) or (p_body->>'questionRevision')::integer<>q.revision then raise exception 'revision_conflict';end if;
  answer_value:=trim(p_body->>'answer');
  if length(answer_value) not between 1 and 20000 then raise exception 'invalid_request';end if;
  insert into public.ip_question_examples(question_id,question_prompt,question_category,answer,revision,updated_by)
   values(q.id,q.prompt,q.category,answer_value,coalesce(e.revision,0)+1,p_actor->>'id')
   on conflict(question_id) do update set question_prompt=excluded.question_prompt,question_category=excluded.question_category,answer=excluded.answer,
    revision=excluded.revision,updated_by=excluded.updated_by,updated_at=now() returning * into e;
  insert into public.ip_question_example_history(question_id,revision,question_prompt,question_category,answer,updated_by)
   values(e.question_id,e.revision,e.question_prompt,e.question_category,e.answer,e.updated_by);
 end if;
 detail:=public.ip_taxonomy_service('admin_question_detail',p_actor,jsonb_build_object('id',q.id));
 if e.question_id is null then
  select o.answer into answer_value from public.ip_occurrences o where o.question_id=q.id
   and length(trim(coalesce(o.answer,'')))>20 and length(o.answer)<=20000 order by o.id asc limit 1;
 else answer_value:=e.answer;end if;
 return detail||jsonb_build_object('example',jsonb_build_object('answer',coalesce(answer_value,''),'revision',coalesce(e.revision,0),
  'custom',e.question_id is not null,'stale',e.question_id is not null and (e.question_prompt<>q.prompt or e.question_category<>q.category),
  'updatedBy',e.updated_by,'updatedAt',e.updated_at),
  'exampleHistory',coalesce((select jsonb_agg(to_jsonb(h) order by h.revision desc) from
   (select revision,updated_by,updated_at from public.ip_question_example_history where question_id=q.id order by revision desc limit 20) h),'[]'::jsonb));
end $$;
revoke all on function public.ip_question_example_service(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ip_question_example_service(text,jsonb,jsonb) to service_role;

-- New attempts snapshot the current edited example. Previously saved references stay intact.
do $patch$
declare definition text; before text:=$old$   select jsonb_build_object('answer',o.answer,'occurrenceId',o.id,'sourceId',o.source_id) into reference
   from public.ip_occurrences o join public.ip_sources s on s.id=o.source_id
   where o.question_id=q.id and length(trim(coalesce(o.answer,'')))>20 and length(o.answer)<=20000
   order by (s.track=m.track) desc,o.id asc limit 1;$old$;
begin
 definition:=replace(pg_get_functiondef('public.ip_openai_practice_service(text,jsonb,jsonb)'::regprocedure),E'\r','');
 if (length(definition)-length(replace(definition,before,'')))/length(before)<>1 then raise exception 'unexpected_practice_reference_selection';end if;
 execute replace(definition,before,'   reference:=public.ip_practice_reference_answer(q.id,q.prompt,k,m.track);');
end $patch$;
commit;
