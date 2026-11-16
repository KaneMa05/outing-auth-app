-- Admin-only classification metadata, independent of question publication.
create table public.ip_question_taxonomy (
 question_id text primary key references public.ip_questions(id) on delete cascade,
 primary_field text,
 related_fields text[] not null default '{}',
 answer_formats text[] not null default '{}',
 material_tags text[] not null default '{}',
 review_status text not null check(review_status in ('classified','needs_context')),
 rationale text not null check(length(btrim(rationale)) between 5 and 4000),
 content_note text not null default '' check(length(content_note)<=4000),
 source_prompt text not null,
 source_category text not null check(source_category in ('job','personality')),
 reviewer text not null,
 reviewed_at timestamptz not null default now(),
 revision integer not null default 1 check(revision>0),
 updated_at timestamptz not null default now(),
 constraint ip_taxonomy_primary_check check(primary_field is null or primary_field=any(array['coast_guard','navigation','domestic_maritime_law','criminal_law_investigation','engineering_maintenance','international_maritime_law','marine_environment','vts_communications','rescue_diving','emergency_care','special_operations','it_security']::text[])),
 constraint ip_taxonomy_related_check check(related_fields <@ array['coast_guard','navigation','domestic_maritime_law','criminal_law_investigation','engineering_maintenance','international_maritime_law','marine_environment','vts_communications','rescue_diving','emergency_care','special_operations','it_security']::text[] and cardinality(related_fields)<=12 and array_position(related_fields,null) is null and (primary_field is null or not(primary_field=any(related_fields)))),
 constraint ip_taxonomy_formats_check check(answer_formats <@ array['knowledge','situation','opinion','debate']::text[] and cardinality(answer_formats) between 1 and 4 and array_position(answer_formats,null) is null),
 constraint ip_taxonomy_tags_check check(material_tags <@ array['marine_incident','current_affairs']::text[] and cardinality(material_tags)<=2 and array_position(material_tags,null) is null),
 constraint ip_taxonomy_classified_check check(review_status='needs_context' or (source_category='job' and primary_field is not null) or (source_category='personality' and primary_field is null))
);
alter table public.ip_question_taxonomy enable row level security;
revoke all on public.ip_question_taxonomy from public,anon,authenticated;
grant select,insert,update,delete on public.ip_question_taxonomy to service_role;
create index ip_question_taxonomy_review_field_idx on public.ip_question_taxonomy(review_status,primary_field);

create function public.ip_invalidate_taxonomy() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.prompt is distinct from old.prompt or new.category is distinct from old.category then
  update public.ip_question_taxonomy set review_status='needs_context',revision=revision+1,updated_at=now()
   where question_id=new.id;
 end if;
 return new;
end;
$$;
revoke all on function public.ip_invalidate_taxonomy() from public,anon,authenticated;
grant execute on function public.ip_invalidate_taxonomy() to service_role;
create trigger ip_question_taxonomy_invalidate after update of prompt,category on public.ip_questions
 for each row execute function public.ip_invalidate_taxonomy();

create function public.ip_taxonomy_service(p_action text,p_actor jsonb,p_body jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 q public.ip_questions;t public.ip_question_taxonomy;result jsonb;before_t jsonb;
 page_number integer:=greatest(0,least(100000,coalesce((p_body->>'page')::integer,0)));
 primary_value text;related_values text[];format_values text[];tag_values text[];
 fields constant text[]:=array['coast_guard','navigation','domestic_maritime_law','criminal_law_investigation','engineering_maintenance','international_maritime_law','marine_environment','vts_communications','rescue_diving','emergency_care','special_operations','it_security'];
begin
 if coalesce(p_actor->>'type','')<>'admin' or coalesce(p_actor->>'id','')='' then raise exception 'forbidden';end if;
 if p_action='admin_questions' then
  if coalesce(p_body->>'category','job') not in ('job','personality')
   or (coalesce(p_body->>'fieldId','')<>'' and not(p_body->>'fieldId'=any(fields)))
   or coalesce(p_body->>'taxonomyStatus','') not in ('','classified','needs_context','unclassified')
   or coalesce(p_body->>'answerFormat','') not in ('','knowledge','situation','opinion','debate')
   or coalesce(p_body->>'materialTag','') not in ('','marine_incident','current_affairs')
   or coalesce(p_body->>'taxonomyView','') not in ('','public_navigation') then raise exception 'invalid_request';end if;
  with filtered as materialized (
   select question_row.*,case when taxonomy_row.question_id is null then null else to_jsonb(taxonomy_row)||jsonb_build_object('stale',taxonomy_row.source_prompt<>question_row.prompt or taxonomy_row.source_category<>question_row.category) end taxonomy
   from public.ip_questions question_row left join public.ip_question_taxonomy taxonomy_row on taxonomy_row.question_id=question_row.id
   where question_row.category=coalesce(nullif(p_body->>'category',''),'personality')
   and (coalesce(p_body->>'status','')='' or question_row.status=p_body->>'status')
   and (coalesce(p_body->>'topicId','')='' or p_body->>'topicId'=any(question_row.topic_ids))
   and (coalesce(p_body->>'track','')='' or p_body->>'track'=any(question_row.tracks))
   and (coalesce(p_body->>'search','')='' or strpos(question_row.prompt,p_body->>'search')>0)
   and (coalesce(p_body->>'fieldId','')='' or taxonomy_row.primary_field=p_body->>'fieldId' or p_body->>'fieldId'=any(taxonomy_row.related_fields))
   and (coalesce(p_body->>'answerFormat','')='' or p_body->>'answerFormat'=any(taxonomy_row.answer_formats))
   and (coalesce(p_body->>'materialTag','')='' or p_body->>'materialTag'=any(taxonomy_row.material_tags))
   and (coalesce(p_body->>'taxonomyStatus','')='' or
    (p_body->>'taxonomyStatus'='unclassified' and taxonomy_row.question_id is null) or
    (p_body->>'taxonomyStatus'='classified' and taxonomy_row.review_status='classified' and taxonomy_row.source_prompt=question_row.prompt and taxonomy_row.source_category=question_row.category) or
    (p_body->>'taxonomyStatus'='needs_context' and (taxonomy_row.review_status='needs_context' or taxonomy_row.source_prompt<>question_row.prompt or taxonomy_row.source_category<>question_row.category)))
   and (coalesce(p_body->>'taxonomyView','')='' or ('공채'=any(question_row.tracks) and (taxonomy_row.primary_field='navigation' or 'navigation'=any(taxonomy_row.related_fields)) and taxonomy_row.review_status='classified' and taxonomy_row.source_prompt=question_row.prompt and taxonomy_row.source_category=question_row.category))
  ),paged as (
   select f.*,(select count(*) from public.ip_occurrences o where o.question_id=f.id) source_count
   from filtered f order by f.id limit 30 offset page_number*30
  ) select jsonb_build_object('ok',true,'total',(select count(*) from filtered),'questions',coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from paged p),'[]'::jsonb)) into result;
  return result;
 elsif p_action='admin_question_detail' then
  result:=public.ip_service(p_action,p_actor,p_body);
  select * into q from public.ip_questions where id=p_body->>'id';
  select * into t from public.ip_question_taxonomy where question_id=q.id;
  return jsonb_set(result,'{question}',result->'question'||jsonb_build_object('taxonomy',case when t.question_id is null then null else to_jsonb(t)||jsonb_build_object('stale',t.source_prompt<>q.prompt or t.source_category<>q.category) end));
 elsif p_action='admin_question_taxonomy_save' then
  if coalesce(p_body->>'id','')='' or coalesce((p_body->>'questionRevision')::integer,0)<1 or coalesce((p_body->>'revision')::integer,-1)<0
   or coalesce(p_body->>'reviewStatus','') not in ('classified','needs_context')
   or length(btrim(coalesce(p_body->>'rationale',''))) not between 5 and 4000 or length(coalesce(p_body->>'contentNote',''))>4000
   or jsonb_typeof(p_body->'relatedFields') is distinct from 'array' or jsonb_typeof(p_body->'answerFormats') is distinct from 'array' or jsonb_typeof(p_body->'materialTags') is distinct from 'array'
   then raise exception 'invalid_request';end if;
  primary_value:=nullif(p_body->>'primaryField','');
  related_values:=array(select distinct jsonb_array_elements_text(p_body->'relatedFields') order by 1);
  format_values:=array(select distinct jsonb_array_elements_text(p_body->'answerFormats') order by 1);
  tag_values:=array(select distinct jsonb_array_elements_text(p_body->'materialTags') order by 1);
  if (primary_value is not null and not(primary_value=any(fields))) or not(related_values <@ fields)
   or array_position(related_values,null) is not null or (primary_value is not null and primary_value=any(related_values))
   or not(format_values <@ array['knowledge','situation','opinion','debate']::text[]) or cardinality(format_values)=0 or array_position(format_values,null) is not null
   or not(tag_values <@ array['marine_incident','current_affairs']::text[]) or array_position(tag_values,null) is not null then raise exception 'invalid_request';end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('question:'||(p_body->>'id'),0));
  select * into q from public.ip_questions where id=p_body->>'id' for update;
  if not found then raise exception 'question_unavailable';end if;
  if q.revision<>(p_body->>'questionRevision')::integer then raise exception 'revision_conflict';end if;
  select * into t from public.ip_question_taxonomy where question_id=q.id for update;
  if coalesce(t.revision,0)<>(p_body->>'revision')::integer then raise exception 'revision_conflict';end if;
  if p_body->>'reviewStatus'='classified' and ((q.category='job' and primary_value is null) or (q.category='personality' and primary_value is not null)) then raise exception 'invalid_request';end if;
  before_t:=case when t.question_id is null then null else to_jsonb(t) end;
  insert into public.ip_question_taxonomy(question_id,primary_field,related_fields,answer_formats,material_tags,review_status,rationale,content_note,source_prompt,source_category,reviewer,revision)
  values(q.id,primary_value,related_values,format_values,tag_values,p_body->>'reviewStatus',btrim(p_body->>'rationale'),coalesce(p_body->>'contentNote',''),q.prompt,q.category,p_actor->>'id',coalesce(t.revision,0)+1)
  on conflict(question_id) do update set primary_field=excluded.primary_field,related_fields=excluded.related_fields,answer_formats=excluded.answer_formats,material_tags=excluded.material_tags,review_status=excluded.review_status,rationale=excluded.rationale,content_note=excluded.content_note,source_prompt=excluded.source_prompt,source_category=excluded.source_category,reviewer=excluded.reviewer,revision=excluded.revision,reviewed_at=now(),updated_at=now();
  select * into t from public.ip_question_taxonomy where question_id=q.id;
  insert into public.ip_history(entity,entity_id,actor_id,snapshot) values('question_taxonomy',q.id,p_actor->>'id',jsonb_build_object('before',before_t,'after',to_jsonb(t)));
  return jsonb_build_object('ok',true,'taxonomy',to_jsonb(t));
 end if;
 raise exception 'unsupported_action';
end;
$$;
revoke all on function public.ip_taxonomy_service(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ip_taxonomy_service(text,jsonb,jsonb) to service_role;
