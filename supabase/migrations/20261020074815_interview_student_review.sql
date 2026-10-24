begin;
-- Read-only administrator projection. The API supplies a verified admin actor;
-- browser roles cannot call this function or read the underlying student data.
create function public.ip_review_service(p_action text,p_actor jsonb,p_body jsonb default '{}')
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
   select student_id,status,updated_at,'note'::text as kind from ip_notes
   union all select student_id,status,updated_at,'life' from ip_life_profiles
   union all select student_id,status,updated_at,'writing' from ip_writings
  ), counts as (
   select student_id,count(*) as saved_count,
    count(*) filter(where kind='note') as note_count,
    count(*) filter(where kind='life') as life_count,
    count(*) filter(where kind='writing') as writing_count,
    count(*) filter(where status in ('submitted','saved')) as pending_count,
    count(*) filter(where status in ('needs_revision','no_experience')) as revision_count,
    count(*) filter(where status='draft') as draft_count,
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
