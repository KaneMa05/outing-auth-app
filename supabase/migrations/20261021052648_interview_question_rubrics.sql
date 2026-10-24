-- Separate, admin-only rubric authoring. Does not enable exams or change the original bank.
begin;
create table public.ip_question_rubrics (
 question_id text primary key references public.ip_questions(id) on delete cascade,
 source_prompt text not null,
 source_category text not null check(source_category in ('personality','job')),
 kind text not null check(kind in ('job_knowledge','personality_experience','personality_opinion','profile','followup','practical','hold')),
 rationale text not null,
 source_draft jsonb not null default '{}' check(jsonb_typeof(source_draft)='object'),
 criteria jsonb not null default '[]' check(jsonb_typeof(criteria)='array'),
 critical_errors jsonb not null default '[]' check(jsonb_typeof(critical_errors)='array'),
 verification_note text not null default '',
 score_map jsonb,
 status text not null default 'draft' check(status in ('draft','reviewed')),
 revision integer not null default 1,
 reviewer text not null default '',
 reviewed_at timestamptz,
 updated_at timestamptz not null default now()
);
create index ip_rubric_kind_status on public.ip_question_rubrics(kind,status,question_id);
alter table public.ip_question_rubrics enable row level security;
revoke all on public.ip_question_rubrics from public,anon,authenticated;
grant select,insert,update,delete on public.ip_question_rubrics to service_role;

create function public.ip_invalidate_rubric() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.prompt is distinct from old.prompt or new.category is distinct from old.category then
  update public.ip_question_rubrics set status='draft',reviewer='',reviewed_at=null,revision=revision+1,updated_at=now() where question_id=new.id;
 end if;
 return new;
end;
$$;
revoke all on function public.ip_invalidate_rubric() from public,anon,authenticated;
grant execute on function public.ip_invalidate_rubric() to service_role;
create trigger ip_rubric_question_changed after update of prompt,category on public.ip_questions
for each row execute function public.ip_invalidate_rubric();

create function public.ip_rubric_service(p_action text,p_actor jsonb,p_body jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 v_q public.ip_questions; v_r public.ip_question_rubrics; v_rows jsonb; v_c jsonb; v_t jsonb; v_score jsonb;
 v_page integer:=greatest(0,least(100000,coalesce((p_body->>'page')::integer,0)));
begin
 if coalesce(p_actor->>'type','')<>'admin' or coalesce(p_actor->>'id','')='' then raise exception 'forbidden'; end if;
 if p_action='admin_rubric_list' then
  select coalesce(jsonb_agg(x),'[]') into v_rows from (
   select q.id,q.prompt,q.category,q.tracks,q.revision as question_revision,r.kind,r.revision,
    case when r.source_prompt<>q.prompt or r.source_category<>q.category then 'stale' else r.status end as rubric_status,
    jsonb_array_length(r.criteria) as criteria_count,
    r.source_draft->'flags' as flags,r.source_draft->>'origin_disposition' as origin_disposition
   from public.ip_question_rubrics r join public.ip_questions q on q.id=r.question_id
   where (coalesce(p_body->>'search','')='' or strpos(q.prompt,p_body->>'search')>0)
    and (coalesce(p_body->>'kind','')='' or r.kind=p_body->>'kind')
    and (coalesce(p_body->>'track','')='' or p_body->>'track'=any(q.tracks))
    and (coalesce(p_body->>'originDisposition','')='' or r.source_draft->>'origin_disposition'=p_body->>'originDisposition')
    and (coalesce(p_body->>'status','')='' or p_body->>'status'=case when r.source_prompt<>q.prompt or r.source_category<>q.category then 'stale' else r.status end)
   order by r.question_id limit 30 offset v_page*30
  ) x;
  return jsonb_build_object('ok',true,'questions',v_rows,'counts',(select coalesce(jsonb_object_agg(kind,n),'{}') from (select kind,count(*) n from public.ip_question_rubrics group by kind) s),
   'reviewed',(select count(*) from public.ip_question_rubrics r join public.ip_questions q on q.id=r.question_id where r.status='reviewed' and r.source_prompt=q.prompt and r.source_category=q.category));
 elsif p_action in ('admin_rubric_detail','admin_rubric_save') then
  select * into v_q from public.ip_questions where id=p_body->>'id' for update;
  if not found then raise exception 'question_unavailable'; end if;
  select * into v_r from public.ip_question_rubrics where question_id=v_q.id for update;
  if p_action='admin_rubric_detail' then
   return jsonb_build_object('ok',true,'question',to_jsonb(v_q),'rubric',case when v_r.question_id is null then null else to_jsonb(v_r) end,
    'stale',coalesce(v_r.source_prompt<>v_q.prompt or v_r.source_category<>v_q.category,false),
    'sources',(select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'answer',o.answer,'original_prompt',o.original_prompt,'locator',o.locator,'year',o.year,'filename',s.filename) order by o.id),'[]') from public.ip_occurrences o join public.ip_sources s on s.id=o.source_id where o.question_id=v_q.id));
  end if;
  if coalesce((p_body->>'questionRevision')::integer,-1)<>v_q.revision or coalesce((p_body->>'revision')::integer,-1)<>coalesce(v_r.revision,0) then raise exception 'revision_conflict'; end if;
  if coalesce(p_body->>'kind','') not in ('job_knowledge','personality_experience','personality_opinion','profile','followup','practical','hold')
   or coalesce(p_body->>'status','') not in ('draft','reviewed')
   or length(btrim(coalesce(p_body->>'rationale',''))) not between 10 and 4000
   or coalesce(jsonb_typeof(p_body->'criteria'),'')<>'array' or coalesce(jsonb_typeof(p_body->'criticalErrors'),'')<>'array'
   or length(coalesce(p_body->>'verificationNote',''))>4000 then raise exception 'invalid_request'; end if;
  if jsonb_array_length(p_body->'criteria')>20 or jsonb_array_length(p_body->'criticalErrors')>20 then raise exception 'invalid_request'; end if;
  for v_c in select value from jsonb_array_elements(p_body->'criteria') loop
   if jsonb_typeof(v_c)<>'object' or coalesce(jsonb_typeof(v_c->'label'),'')<>'string'
    or length(btrim(coalesce(v_c->>'label',''))) not between 1 and 200
    or coalesce(jsonb_typeof(v_c->'terms'),'')<>'array'
    or coalesce(jsonb_typeof(v_c->'context'),'')<>'string'
    or length(btrim(coalesce(v_c->>'context',''))) not between 1 and 2000
    or coalesce(jsonb_typeof(v_c->'reject_context'),'')<>'string'
    or length(btrim(coalesce(v_c->>'reject_context',''))) not between 1 and 2000 then raise exception 'invalid_request'; end if;
   if jsonb_array_length(v_c->'terms') not between 1 and 30 then raise exception 'invalid_request'; end if;
   for v_t in select value from jsonb_array_elements(v_c->'terms') loop
    if jsonb_typeof(v_t)<>'string' or length(btrim(v_t#>>'{}')) not between 1 and 120 then raise exception 'invalid_request'; end if;
   end loop;
  end loop;
  for v_t in select value from jsonb_array_elements(p_body->'criticalErrors') loop
   if jsonb_typeof(v_t)<>'string' or length(btrim(v_t#>>'{}')) not between 1 and 2000 then raise exception 'invalid_request'; end if;
  end loop;
  v_score:=nullif(p_body->'scoreMap','null'::jsonb);
  if v_score is not null then
   if jsonb_typeof(v_score)<>'object' or coalesce(jsonb_typeof(v_score->'O'),'')<>'number' or coalesce(jsonb_typeof(v_score->'partial'),'')<>'number' or coalesce(jsonb_typeof(v_score->'X'),'')<>'number' then raise exception 'invalid_request'; end if;
   if not ((v_score->>'O')::numeric>(v_score->>'partial')::numeric and (v_score->>'partial')::numeric>(v_score->>'X')::numeric and (v_score->>'X')::numeric>=0 and (v_score->>'O')::numeric<=10000) then raise exception 'invalid_request'; end if;
  end if;
  if p_body->>'status'='reviewed' then
   if p_body->>'kind'='hold' or length(btrim(coalesce(p_body->>'verificationNote','')))<10 then raise exception 'rubric_incomplete'; end if;
   if p_body->>'kind'='job_knowledge' and (jsonb_array_length(p_body->'criteria')=0 or jsonb_array_length(p_body->'criticalErrors')=0 or v_score is null) then raise exception 'rubric_incomplete'; end if;
  end if;
  -- Draft evidence stays attached to its original wording; the UI warns when it no longer matches.
  insert into public.ip_question_rubrics(question_id,source_prompt,source_category,kind,rationale,criteria,critical_errors,verification_note,score_map,status,revision,reviewer,reviewed_at)
   values(v_q.id,v_q.prompt,v_q.category,p_body->>'kind',btrim(p_body->>'rationale'),p_body->'criteria',p_body->'criticalErrors',coalesce(p_body->>'verificationNote',''),v_score,p_body->>'status',coalesce(v_r.revision,0)+1,
    case when p_body->>'status'='reviewed' then p_actor->>'id' else '' end,case when p_body->>'status'='reviewed' then now() end)
   on conflict(question_id) do update set source_prompt=excluded.source_prompt,source_category=excluded.source_category,kind=excluded.kind,rationale=excluded.rationale,criteria=excluded.criteria,critical_errors=excluded.critical_errors,verification_note=excluded.verification_note,score_map=excluded.score_map,status=excluded.status,revision=excluded.revision,reviewer=excluded.reviewer,reviewed_at=excluded.reviewed_at,updated_at=now();
  insert into public.ip_history(entity,entity_id,actor_id,snapshot) select 'rubric',v_q.id,p_actor->>'id',to_jsonb(r) from public.ip_question_rubrics r where r.question_id=v_q.id;
  return jsonb_build_object('ok',true);
 else raise exception 'unsupported_action';
 end if;
end;
$$;
revoke all on function public.ip_rubric_service(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ip_rubric_service(text,jsonb,jsonb) to service_role;
comment on table public.ip_question_rubrics is 'Source-backed authoring drafts. No student access, publication, exam execution or automatic grading.';
commit;
