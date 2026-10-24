begin;
alter table public.ip_writings add column annotation_marks jsonb not null default '[]' check(jsonb_typeof(annotation_marks)='array'),
 add column feedback_body text;
alter table public.ip_writing_rounds add column annotation_marks jsonb not null default '[]' check(jsonb_typeof(annotation_marks)='array');
create or replace function public.ip_writing_service(p_action text,p_actor jsonb,p_body jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
 v_admin boolean:=coalesce(p_actor->>'type','')='admin';
 v_id text:=p_actor->>'id';v_target text;v_track text;
 v_kind text:=p_body->>'kind';v_item text:=coalesce(p_body->>'itemId','');
 v_status text:=p_body->>'status';v_prompt text;v_row ip_writings;
 v_marks jsonb; v_mark jsonb; v_start integer; v_end integer;
 v_revision integer:=coalesce((p_body->>'revision')::integer,0);
begin
 if coalesce(v_id,'')='' then raise exception 'unauthorized'; end if;
 if p_action in ('admin_writing_list','admin_writing_feedback') then
  if not v_admin then raise exception 'forbidden'; end if;
  v_target:=p_body->>'targetStudentId';
 elsif p_action in ('writing_list','writing_save') then
  if p_actor->>'type' is distinct from 'student' then raise exception 'forbidden'; end if;
  v_target:=v_id;
 else raise exception 'unsupported_action'; end if;
 select track into v_track from ip_members where student_id=v_target for update;
 if not found then raise exception 'student_unavailable'; end if;
 if not v_admin and not coalesce((ip_service('status',p_actor,'{}')->>'enabled')::boolean,false) then raise exception 'not_enrolled'; end if;
 if p_action in ('writing_list','admin_writing_list') then
  return jsonb_build_object('ok',true,'writings',(select coalesce(jsonb_agg(to_jsonb(w) order by w.kind,w.item_id),'[]') from ip_writings w where student_id=v_target));
 end if;
 if v_kind is null or v_kind not in ('introduction','motivation','public_service','core')
  or (v_kind='core' and length(v_item) not between 1 and 120) or (v_kind<>'core' and v_item<>'') then raise exception 'invalid_request'; end if;
 select * into v_row from ip_writings where student_id=v_target and kind=v_kind and item_id=v_item for update;
 if v_revision<>coalesce(v_row.revision,0) then raise exception 'revision_conflict'; end if;
 if p_action='admin_writing_feedback' then
  if v_row.submission_status is null then raise exception 'not_submitted'; end if;
  if v_status is null or v_status not in ('needs_revision','approved') or jsonb_typeof(p_body->'feedback') is distinct from 'string'
   or length(p_body->>'feedback')>8000 then raise exception 'invalid_request'; end if;
  -- Old clients can continue text-only reviews without erasing current marks.
  v_marks:=case when p_body ? 'annotations' then p_body->'annotations'
   when v_row.feedback_revision=v_row.submitted_revision then v_row.annotation_marks else '[]'::jsonb end;
  if jsonb_typeof(v_marks) is distinct from 'array' then raise exception 'invalid_request'; end if;
  if jsonb_array_length(v_marks)>100 or (length(btrim(p_body->>'feedback'))=0 and jsonb_array_length(v_marks)=0 and not coalesce(v_row.feedback_revision=v_row.submitted_revision and (length(btrim(v_row.feedback))>0 or jsonb_array_length(v_row.annotation_marks)>0),false)) then raise exception 'invalid_request'; end if;
  for v_mark in select value from jsonb_array_elements(v_marks) loop
   if jsonb_typeof(v_mark) is distinct from 'object' or coalesce(v_mark->>'type','') not in ('underline','strike','bracket','comment','color')
    or jsonb_typeof(v_mark->'start') is distinct from 'number' or jsonb_typeof(v_mark->'end') is distinct from 'number'
    or (v_mark->>'start') !~ '^[0-9]{1,5}$' or (v_mark->>'end') !~ '^[0-9]{1,5}$'
    or jsonb_typeof(v_mark->'note') is distinct from 'string' or length(v_mark->>'note')>1000 then raise exception 'invalid_request'; end if;
   if (v_mark ? 'color' or v_mark->>'type'='color') and (jsonb_typeof(v_mark->'color') is distinct from 'string' or coalesce(v_mark->>'color','') !~ '^#[0-9a-fA-F]{6}$') then raise exception 'invalid_request'; end if;
   v_start:=(v_mark->>'start')::integer;v_end:=(v_mark->>'end')::integer;
   if v_start>v_end or (v_start=v_end and v_mark->>'type'<>'comment') or v_end>length(v_row.submitted_body) or (v_mark->>'type'='comment' and length(btrim(v_mark->>'note'))=0) then raise exception 'invalid_request'; end if;
  end loop;
  update ip_writings set feedback=p_body->>'feedback',annotation_marks=v_marks,feedback_body=submitted_body,
   submission_status=v_status,feedback_revision=submitted_revision,
   revision=revision+1,updated_at=now()
   where student_id=v_target and kind=v_kind and item_id=v_item returning * into v_row;
 else
  if v_status is null or v_status not in ('draft','saved','submitted') or jsonb_typeof(p_body->'text') is distinct from 'string'
   or length(p_body->>'text')>10000 or (v_status<>'draft' and length(btrim(p_body->>'text'))=0) then raise exception 'invalid_request'; end if;
  if v_kind='core' then
   select q.prompt into v_prompt from ip_questions q join ip_collection_items i on i.question_id=q.id
    where q.id=v_item and i.collection_id='core-personality-30' and q.category='personality' and q.status='published'
    and (cardinality(q.tracks)=0 or v_track=any(q.tracks)) for share of q;
   if not found then raise exception 'question_unavailable'; end if;
  else v_prompt:=case when v_kind='public_service' then '공직관' when v_kind='introduction' then '자기소개' else '지원동기' end; end if;
  if v_status='submitted' and v_row.submission_status='submitted' and v_row.submitted_body=p_body->>'text' and v_row.body=p_body->>'text' then
   return jsonb_build_object('ok',true,'writing',to_jsonb(v_row));
  end if;
  insert into ip_writings(student_id,kind,item_id,prompt_snapshot,body,status)
   values(v_target,v_kind,v_item,v_prompt,p_body->>'text',case when v_status='submitted' then 'saved' else v_status end)
   on conflict(student_id,kind,item_id) do update set prompt_snapshot=excluded.prompt_snapshot,body=excluded.body,status=excluded.status,
    revision=ip_writings.revision+1,updated_at=now() returning * into v_row;
  if v_status='submitted' then
   update ip_writings set submitted_body=body,submitted_at=now(),submitted_revision=revision,submission_status='submitted'
    where student_id=v_target and kind=v_kind and item_id=v_item returning * into v_row;
  end if;
 end if;
 insert into ip_history(entity,entity_id,actor_id,snapshot,student_id)
  values('writing',v_target||':'||v_kind||':'||v_item,v_id,to_jsonb(v_row),v_target);
 return jsonb_build_object('ok',true,'writing',to_jsonb(v_row));
end;
$$;
revoke all on function public.ip_writing_service(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ip_writing_service(text,jsonb,jsonb) to service_role;


create or replace function public.ip_writing_round_after() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if new.submitted_revision is distinct from old.submitted_revision then
  insert into ip_writing_rounds(student_id,kind,item_id,round,submitted_revision,prompt_snapshot,submitted_body,submitted_at,status)
   values(new.student_id,new.kind,new.item_id,new.submission_round,new.submitted_revision,new.prompt_snapshot,new.submitted_body,new.submitted_at,'submitted');
 elsif new.feedback_revision=new.submitted_revision then
  update ip_writing_rounds set annotation_marks=new.annotation_marks,feedback=new.feedback,feedback_at=new.feedback_at,status=new.submission_status
   where student_id=new.student_id and kind=new.kind and item_id=new.item_id and round=new.submission_round;
 end if;
 return new;
end; $$;

-- One row per submitted answer; never load drafts or answer bodies in the list.
create function public.ip_writing_board_service(p_action text,p_actor jsonb,p_body jsonb default '{}')
returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare
 v_page integer:=coalesce((p_body->>'page')::integer,0);
 v_status text:=coalesce(p_body->>'status','');v_kind text:=coalesce(p_body->>'kind','');
 v_search text:=lower(btrim(coalesce(p_body->>'search','')));v_result jsonb;
begin
 if p_actor->>'type' is distinct from 'admin' or coalesce(p_actor->>'id','')='' then raise exception 'forbidden'; end if;
 if p_action<>'admin_writing_board' then raise exception 'unsupported_action'; end if;
 if v_page not between 0 and 100000 or v_status not in ('','submitted','needs_revision','approved')
  or v_kind not in ('','introduction','motivation','public_service') or length(v_search)>200 then raise exception 'invalid_request'; end if;
 with matches as (
  select w.student_id,w.kind,w.item_id,w.prompt_snapshot,w.submitted_at,w.submission_round,w.submission_status,w.feedback_at,
   d.name,m.track,m.exam_number
  from ip_writings w join ip_members m on m.student_id=w.student_id join ip_student_directory d on d.id=w.student_id
  where w.submitted_at is not null and w.kind in ('introduction','motivation','public_service')
   and (v_kind='' or w.kind=v_kind)
   and (v_search='' or strpos(lower(d.name),v_search)>0 or strpos(lower(w.student_id),v_search)>0
    or strpos(lower(m.exam_number),v_search)>0 or strpos(lower(w.prompt_snapshot),v_search)>0)
 ), filtered as (select * from matches where v_status='' or submission_status=v_status),
 paged as (select * from filtered order by submitted_at desc,student_id,kind limit 30 offset v_page*30)
 select jsonb_build_object('ok',true,'submissions',coalesce((select jsonb_agg(p order by p.submitted_at desc,p.student_id,p.kind) from paged p),'[]'),
  'total',(select count(*) from filtered),'page',v_page,'pageSize',30,
  'pending',(select count(*) from matches where submission_status='submitted'),
  'revision',(select count(*) from matches where submission_status='needs_revision'),
  'approved',(select count(*) from matches where submission_status='approved')) into v_result;
 return v_result;
end; $$;
revoke all on function public.ip_writing_board_service(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ip_writing_board_service(text,jsonb,jsonb) to service_role;
create index ip_writings_board_submitted_idx on public.ip_writings(submitted_at desc,student_id,kind)
 where submitted_at is not null and kind in ('introduction','motivation','public_service');
commit;
