-- Independent admin-only analysis. Existing question publication and student notes stay unchanged.
begin;
create table public.ip_elements (
  id text primary key,
  topic_id text not null references public.ip_topics(id),
  title text not null,
  intent text not null,
  material_prompts jsonb not null check(jsonb_typeof(material_prompts)='array'),
  checkpoints jsonb not null check(jsonb_typeof(checkpoints)='array'),
  sort_order integer not null
);
create table public.ip_question_analysis (
  question_id text primary key references public.ip_questions(id) on delete cascade,
  source_prompt text not null,
  source_category text not null check(source_category='personality'),
  element_ids text[] not null default '{}',
  evidence jsonb not null default '[]' check(jsonb_typeof(evidence)='array'),
  disposition text not null check(disposition in ('personal','knowledge_review','context_needed','rapport','sensitive_review','unresolved')),
  flags text[] not null default '{}',
  answer_form text not null check(answer_form in ('experience','value','situation','profile','mixed','context')),
  rationale text not null check(length(rationale) between 1 and 4000),
  status text not null default 'draft' check(status in ('draft','reviewed')),
  revision integer not null default 1,
  method text not null,
  reviewer text not null default '',
  reviewed_at timestamptz
);
create index ip_analysis_elements on public.ip_question_analysis using gin(element_ids);
create index ip_analysis_disposition on public.ip_question_analysis(disposition,status);
alter table public.ip_elements enable row level security;
alter table public.ip_question_analysis enable row level security;
revoke all on public.ip_elements,public.ip_question_analysis from public,anon,authenticated;
grant select,insert,update,delete on public.ip_elements,public.ip_question_analysis to service_role;

-- Review cannot silently survive changes to the question's meaning or category.
create function public.ip_invalidate_analysis() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if new.prompt is distinct from old.prompt or new.category is distinct from old.category then
    update ip_question_analysis set status='draft',reviewer='',reviewed_at=null,revision=revision+1
      where question_id=new.id;
  end if;
  return new;
end;
$$;
revoke all on function public.ip_invalidate_analysis() from public,anon,authenticated;
grant execute on function public.ip_invalidate_analysis() to service_role;
create trigger ip_question_analysis_changed after update of prompt,category on public.ip_questions
for each row execute function public.ip_invalidate_analysis();

create function public.ip_analysis_service(p_action text,p_actor jsonb,p_body jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  v_q ip_questions;
  v_a ip_question_analysis;
  v_ids text[];
  v_rows jsonb;
  v_page integer:=greatest(0,least(100000,coalesce((p_body->>'page')::integer,0)));
begin
  if coalesce(p_actor->>'type','')<>'admin' or coalesce(p_actor->>'id','')='' then raise exception 'forbidden'; end if;
  if p_action='admin_analysis_catalog' then
    return jsonb_build_object('ok',true,
      'elements',(select coalesce(jsonb_agg(to_jsonb(e) order by sort_order),'[]') from ip_elements e),
      'counts',(select coalesce(jsonb_object_agg(disposition,n),'{}') from (
        select a.disposition,count(*) n from ip_question_analysis a join ip_questions q on q.id=a.question_id
        where q.category='personality' group by a.disposition) s),
      'reviewed',(select count(*) from ip_question_analysis a join ip_questions q on q.id=a.question_id
        where a.status='reviewed' and a.source_prompt=q.prompt and q.category='personality'));
  elsif p_action='admin_analysis_questions' then
    select coalesce(jsonb_agg(x),'[]') into v_rows from (
      select q.id,q.prompt,q.tracks,q.revision as question_revision,a.element_ids,a.disposition,
        case when a.question_id is null then 'missing'
             when a.source_prompt<>q.prompt then 'stale' else a.status end as analysis_status
      from ip_questions q left join ip_question_analysis a on a.question_id=q.id
      where q.category='personality'
        and (coalesce(p_body->>'search','')='' or strpos(q.prompt,p_body->>'search')>0)
        and (coalesce(p_body->>'elementId','')='' or p_body->>'elementId'=any(a.element_ids))
        and (coalesce(p_body->>'disposition','')='' or p_body->>'disposition'=a.disposition)
        and (coalesce(p_body->>'analysisStatus','')='' or p_body->>'analysisStatus'=
          case when a.question_id is null then 'missing' when a.source_prompt<>q.prompt then 'stale' else a.status end)
      order by q.id limit 30 offset v_page*30
    ) x;
    return jsonb_build_object('ok',true,'questions',v_rows);
  elsif p_action in ('admin_analysis_detail','admin_analysis_save') then
    -- Lock the question first, matching the question-edit/trigger lock order.
    select * into v_q from ip_questions where id=p_body->>'id' for update;
    if not found or v_q.category<>'personality' then raise exception 'question_unavailable'; end if;
    select * into v_a from ip_question_analysis where question_id=v_q.id for update;
    if p_action='admin_analysis_detail' then
      return jsonb_build_object('ok',true,'question',to_jsonb(v_q),'analysis',case when v_a.question_id is null then null else to_jsonb(v_a) end,
        'stale',coalesce(v_a.source_prompt<>v_q.prompt,false));
    end if;
    if coalesce((p_body->>'questionRevision')::int,-1)<>v_q.revision or
      coalesce((p_body->>'revision')::int,-1)<>coalesce(v_a.revision,0) then raise exception 'revision_conflict'; end if;
    v_ids:=array(select distinct jsonb_array_elements_text(p_body->'elementIds'));
    if cardinality(v_ids)>40 or exists(select 1 from unnest(v_ids) i where not exists(select 1 from ip_elements where id=i))
      then raise exception 'invalid_request'; end if;
    if coalesce(p_body->>'status','') not in ('draft','reviewed') or
       coalesce(p_body->>'disposition','') not in ('personal','knowledge_review','context_needed','rapport','sensitive_review','unresolved') or
       coalesce(p_body->>'answerForm','') not in ('experience','value','situation','profile','mixed','context') or
       length(btrim(coalesce(p_body->>'rationale',''))) not between 10 and 4000 or
       (p_body->>'disposition'='personal' and cardinality(v_ids)=0) or
       (p_body->>'status'='reviewed' and p_body->>'disposition'='unresolved')
      then raise exception 'invalid_request'; end if;
    insert into ip_question_analysis(question_id,source_prompt,source_category,element_ids,evidence,disposition,
        flags,answer_form,rationale,status,revision,method,reviewer,reviewed_at)
      values(v_q.id,v_q.prompt,'personality',v_ids,
        case when v_a.source_prompt=v_q.prompt then coalesce(v_a.evidence,'[]') else '[]' end,
        p_body->>'disposition','{}',p_body->>'answerForm',btrim(p_body->>'rationale'),
        p_body->>'status',coalesce(v_a.revision,0)+1,'admin-review',
        case when p_body->>'status'='reviewed' then p_actor->>'id' else '' end,
        case when p_body->>'status'='reviewed' then now() end)
      on conflict(question_id) do update set source_prompt=excluded.source_prompt,element_ids=excluded.element_ids,
        evidence=excluded.evidence,disposition=excluded.disposition,flags=excluded.flags,answer_form=excluded.answer_form,
        rationale=excluded.rationale,status=excluded.status,revision=excluded.revision,method=excluded.method,
        reviewer=excluded.reviewer,reviewed_at=excluded.reviewed_at;
    insert into ip_history(entity,entity_id,actor_id,snapshot)
      select 'analysis',v_q.id,p_actor->>'id',to_jsonb(a) from ip_question_analysis a where question_id=v_q.id;
    return jsonb_build_object('ok',true);
  else
    raise exception 'unsupported_action';
  end if;
end;
$$;
revoke all on function public.ip_analysis_service(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ip_analysis_service(text,jsonb,jsonb) to service_role;
comment on table public.ip_question_analysis is 'Admin-only interpretive drafts. Not official assessment criteria; never auto-published or copied into student personal notes.';
commit;
