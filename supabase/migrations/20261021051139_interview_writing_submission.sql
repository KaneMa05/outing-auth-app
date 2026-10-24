begin;
-- Editing and teacher submission have separate lifecycles. Submission snapshots
-- remain stable while the student saves a newer working copy.
alter table public.ip_writings
 add column submitted_body text,
 add column submitted_at timestamptz,
 add column submitted_revision integer,
 add column submission_status text check(submission_status in ('submitted','needs_revision','approved')),
 add column feedback_revision integer;
alter table public.ip_writings add constraint ip_writings_submission_check check(
 (submission_status is null and submitted_body is null and submitted_at is null and submitted_revision is null)
 or (submission_status is not null and submitted_body is not null and length(btrim(submitted_body)) between 1 and 10000
 and submitted_at is not null and submitted_revision is not null and submitted_revision>0));
-- Preserve already-reviewed records; ordinary saved answers are not submissions.
update public.ip_writings set submitted_body=body,submitted_at=updated_at,submitted_revision=revision,
 submission_status=status,feedback_revision=revision,status='saved'
 where status in ('needs_revision','approved');

create or replace function public.ip_writing_service(p_action text,p_actor jsonb,p_body jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
 v_admin boolean:=coalesce(p_actor->>'type','')='admin';
 v_id text:=p_actor->>'id';v_target text;v_track text;
 v_kind text:=p_body->>'kind';v_item text:=coalesce(p_body->>'itemId','');
 v_status text:=p_body->>'status';v_prompt text;v_row ip_writings;
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
   or length(btrim(p_body->>'feedback')) not between 1 and 8000 then raise exception 'invalid_request'; end if;
  update ip_writings set feedback=p_body->>'feedback',submission_status=v_status,feedback_revision=submitted_revision,
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

-- Read-only administrator projection. The API supplies a verified admin actor;
-- browser roles cannot call this function or read the underlying student data.
create or replace function public.ip_review_service(p_action text,p_actor jsonb,p_body jsonb default '{}')
returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare
 v_member jsonb;
 v_result jsonb;
 v_page integer:=coalesce((p_body->>'page')::integer,0);
 v_status text:=coalesce(p_body->>'status','');
 v_search text:=lower(btrim(coalesce(p_body->>'search','')));
begin
 if p_actor->>'type' is distinct from 'admin' or coalesce(p_actor->>'id','')='' then raise exception 'forbidden'; end if;
 if v_page<0 or v_page>100000 or v_status not in ('','pending','revision','draft','empty') then raise exception 'invalid_request'; end if;
 if p_action='admin_review_students' then
  with records as (
   select student_id,status,updated_at,'note'::text as kind,status='draft' as is_draft from ip_notes
   union all select student_id,status,updated_at,'life',status='draft' from ip_life_profiles
   union all select student_id,coalesce(submission_status,status),updated_at,'writing',status='draft' from ip_writings
  ), counts as (
   select student_id,count(*) as saved_count,
    count(*) filter(where kind='note') as note_count,
    count(*) filter(where kind='life') as life_count,
    count(*) filter(where kind='writing') as writing_count,
    count(*) filter(where (status='submitted' or (kind<>'writing' and status='saved'))) as pending_count,
    count(*) filter(where status in ('needs_revision','no_experience')) as revision_count,
    count(*) filter(where is_draft) as draft_count,
    max(updated_at) as updated_at
   from records group by student_id
  ), students as (
   select m.student_id as id,d.name,d.is_active,m.track,m.exam_number,m.enabled,m.expires_on,
    coalesce(c.saved_count,0) as saved_count,coalesce(c.note_count,0) as note_count,
    coalesce(c.life_count,0) as life_count,coalesce(c.writing_count,0) as writing_count,
    coalesce(c.pending_count,0) as pending_count,coalesce(c.revision_count,0) as revision_count,
    coalesce(c.draft_count,0) as draft_count,c.updated_at
   from ip_members m join ip_student_directory d on d.id=m.student_id
   left join counts c on c.student_id=m.student_id
   where (v_search='' or strpos(lower(d.name),v_search)>0 or strpos(lower(m.student_id),v_search)>0 or strpos(lower(m.exam_number),v_search)>0)
    and (coalesce(p_body->>'track','')='' or m.track=p_body->>'track')
  ), filtered as (
   select * from students where v_status=''
    or (v_status='pending' and pending_count>0) or (v_status='revision' and revision_count>0)
    or (v_status='draft' and draft_count>0) or (v_status='empty' and saved_count=0)
  ), paged as (
   select * from filtered order by updated_at desc nulls last,name,id limit 30 offset v_page*30
  )
  select jsonb_build_object('ok',true,'students',coalesce((select jsonb_agg(p order by p.updated_at desc nulls last,p.name,p.id) from paged p),'[]'),
   'total',(select count(*) from filtered),'page',v_page,'pageSize',30,
   'pendingStudents',(select count(*) from filtered where pending_count>0),
   'revisionStudents',(select count(*) from filtered where revision_count>0)) into v_result;
  return v_result;
 elsif p_action='admin_review_detail' then
  select jsonb_build_object('id',m.student_id,'name',d.name,'is_active',d.is_active,'track',m.track,
   'exam_number',m.exam_number,'enabled',m.enabled,'expires_on',m.expires_on) into v_member
  from ip_members m join ip_student_directory d on d.id=m.student_id where m.student_id=p_body->>'targetStudentId';
  if v_member is null then raise exception 'student_unavailable'; end if;
  return jsonb_build_object('ok',true,'student',v_member,
   'profile',(select to_jsonb(p) from ip_life_profiles p where p.student_id=p_body->>'targetStudentId'),
   'notes',(select coalesce(jsonb_agg(to_jsonb(n)||jsonb_build_object('topic',to_jsonb(t)) order by t.sort_order,t.id),'[]')
     from ip_notes n join ip_topics t on t.id=n.topic_id where n.student_id=p_body->>'targetStudentId'),
   'writings',(select coalesce(jsonb_agg(to_jsonb(w) order by w.kind,w.item_id),'[]') from ip_writings w where w.student_id=p_body->>'targetStudentId'),
   'competencies',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'title',c.title) order by c.position),'[]') from ip_life_competencies c));
 else raise exception 'unsupported_action';
 end if;
end;
$$;
revoke all on function public.ip_review_service(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ip_review_service(text,jsonb,jsonb) to service_role;
comment on function public.ip_review_service(text,jsonb,jsonb) is 'Admin-only read projection including drafts, retired topics/questions and inactive/expired members. Does not lock or mutate student records.';
commit;
