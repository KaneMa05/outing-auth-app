-- Retire other from student assignments without deleting drafts, snapshots, or guidelines.
create or replace function public.ip_preassignment_service(p_action text,p_actor jsonb,p_body jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare
 v_admin boolean:=coalesce(p_actor->>'type','')='admin';v_actor text:=p_actor->>'id';v_student text;
 v_cfg ip_pa_settings;v_unit ip_pa_units;v_draft ip_pa_drafts;v_sub ip_pa_submissions;v_receipt ip_pa_receipts;
 v_id text:=p_body->>'unitId';v_ids jsonb;v_fields jsonb:=coalesce(p_body->'fields','{}');
 v_result jsonb;v_rows jsonb;v_fingerprint text;v_request_hash text;v_round integer;v_new uuid;
 v_revision integer:=coalesce((p_body->>'revision')::integer,0);v_page integer:=coalesce((p_body->>'page')::integer,0);v_due timestamptz;
begin
 if coalesce(v_actor,'')='' or p_actor->>'type' not in ('student','admin') then raise exception 'unauthorized';end if;
 if (p_action like 'admin_%') is distinct from v_admin then raise exception 'forbidden';end if;
 if v_page<0 or v_page>100000 then raise exception 'invalid_request';end if;
 select * into v_cfg from ip_pa_settings where id;
 v_student:=case when v_admin then p_body->>'targetStudentId' else v_actor end;
 if not v_admin then
  perform ip_service('bootstrap',p_actor,'{}');
  if p_action<>'bootstrap' and not v_cfg.enabled then raise exception 'disabled';end if;
 elsif v_student is not null and not exists(select 1 from ip_members where student_id=v_student) then raise exception 'not_found';
 end if;
 if not v_admin and (v_id='other' or coalesce(p_body->'unitIds','[]'::jsonb) ? 'other') then raise exception 'invalid_request';end if;
 if p_action in ('save','submit') then
  perform pg_advisory_xact_lock(182731,hashtext(v_student));
 end if;
 if p_action in ('save','submit') then
  if coalesce(p_body->>'requestId','') !~ '^[A-Za-z0-9-]{8,100}$' then raise exception 'invalid_request';end if;
  v_request_hash:=md5((p_body-'requestId')::text);
  select * into v_receipt from ip_pa_receipts where student_id=v_student and request_id=p_body->>'requestId';
  if found then
   if v_receipt.action<>p_action or v_receipt.fingerprint<>v_request_hash then raise exception 'idempotency_conflict';end if;
   return v_receipt.result;
  end if;
 end if;

 if p_action in ('bootstrap','admin_list') then
  if not v_admin and not v_cfg.enabled then return jsonb_build_object('ok',true,'settings',to_jsonb(v_cfg),'units','[]'::jsonb);end if;
  if not v_admin then
   select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'revision',coalesce(d.revision,0),'status',coalesce(s.status,case when d.revision>0 then 'draft' else 'empty' end),
    'round',s.round,'submitted_at',s.submitted_at,'late',s.late,'changed',s.id is not null and d.fields<>s.fields) order by u.position),'[]') into v_rows
   from ip_pa_units u left join ip_pa_drafts d on d.unit_id=u.id and d.student_id=v_student left join ip_pa_submissions s on s.id=d.latest_id where u.id like 'core-%';
   return jsonb_build_object('ok',true,'settings',to_jsonb(v_cfg),'units',v_rows,'track',(select track from ip_members where student_id=v_student));
  end if;
  with counts as (
   select d.student_id,count(s.id) filter(where d.unit_id like 'core-%') as submitted,
    count(s.id) filter(where d.unit_id like 'core-%') as core_submitted,max(s.status) filter(where d.unit_id='other') as other_status,max(s.submitted_at) filter(where d.unit_id like 'core-%') as latest
   from ip_pa_drafts d left join ip_pa_submissions s on s.id=d.latest_id group by d.student_id
  ), roster as (
   select m.student_id,d.name,m.track,m.enabled,coalesce(c.submitted,0) as submitted,coalesce(c.core_submitted,0) as core_submitted,coalesce(c.other_status,'empty') as other_status,c.latest
   from ip_members m join ip_student_directory d on d.id=m.student_id left join counts c on c.student_id=m.student_id
   where coalesce(p_body->>'search','')='' or strpos(lower(d.name||' '||m.student_id||' '||m.track),lower(p_body->>'search'))>0
  ), filtered as (
   select * from roster where coalesce(p_body->>'status','')='' or (p_body->>'status'='submitted' and submitted>0) or (p_body->>'status'='empty' and submitted<(select count(*) from ip_pa_units where id like 'core-%')) or (p_body->>'status'='complete' and submitted=(select count(*) from ip_pa_units where id like 'core-%'))
  ), paged as (select * from filtered order by latest desc nulls last,student_id limit 30 offset v_page*30)
  select jsonb_build_object('ok',true,'settings',to_jsonb(v_cfg),'students',coalesce((select jsonb_agg(p) from paged p),'[]'),'total',(select count(*) from filtered),'page',v_page,'pageSize',30) into v_result;return v_result;
 elsif p_action='admin_settings' then
  if (p_body->>'revisionDueAt')::timestamptz<(p_body->>'dueAt')::timestamptz then raise exception 'invalid_request';end if;
  update ip_pa_settings set enabled=(p_body->>'enabled')::boolean,due_at=(p_body->>'dueAt')::timestamptz,revision_due_at=(p_body->>'revisionDueAt')::timestamptz,allow_late=(p_body->>'allowLate')::boolean,revision=revision+1 where id and revision=v_revision returning * into v_cfg;
  if not found then raise exception 'revision_conflict';end if;
  insert into ip_pa_events(actor_id,action,data) values(v_actor,p_action,to_jsonb(v_cfg));return jsonb_build_object('ok',true,'settings',to_jsonb(v_cfg));
 elsif p_action in ('detail','admin_detail') then
  if not exists(select 1 from ip_pa_units where id=v_id) then raise exception 'not_found';end if;
  select * into v_draft from ip_pa_drafts where student_id=v_student and unit_id=v_id;
  select * into v_sub from ip_pa_submissions where id=v_draft.latest_id;
  return jsonb_build_object('ok',true,'draft',case when v_admin or v_draft.student_id is null then null else to_jsonb(v_draft) end,'latest',case when v_sub.id is null then null else to_jsonb(v_sub) end,'student',(select jsonb_build_object('name',d.name,'track',m.track) from ip_members m join ip_student_directory d on d.id=m.student_id where m.student_id=v_student),
   'units',(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'status',coalesce(s.status,'empty')) order by u.position),'[]') from ip_pa_units u left join ip_pa_drafts d on d.unit_id=u.id and d.student_id=v_student left join ip_pa_submissions s on s.id=d.latest_id where v_admin or u.id like 'core-%'));
 elsif p_action in ('history','admin_history') then
  return jsonb_build_object('ok',true,'rounds',(select coalesce(jsonb_agg(x order by x.round desc),'[]') from (select * from ip_pa_submissions where student_id=v_student and unit_id=v_id order by round desc limit 10 offset v_page*10) x),'total',(select count(*) from ip_pa_submissions where student_id=v_student and unit_id=v_id));
 elsif p_action in ('save','submit') then
  if jsonb_typeof(v_fields)<>'object' or coalesce(p_body->'fileIds','[]'::jsonb)<>'[]'::jsonb then raise exception 'invalid_request';end if;
  v_ids:=case when p_action='save' then jsonb_build_array(v_id) else p_body->'unitIds' end;
  if jsonb_typeof(v_ids)<>'array' or jsonb_array_length(v_ids)<1 or jsonb_array_length(v_ids)<>1 then raise exception 'invalid_request';end if;
  v_rows:='[]';
  for v_id in select value from jsonb_array_elements_text(v_ids) loop
   select * into v_unit from ip_pa_units where id=v_id;
   if not found then raise exception 'invalid_request';end if;
   if exists(select 1 from jsonb_each(v_fields) e where jsonb_typeof(e.value)<>'string' or length(e.value#>>'{}')>4000 or not exists(select 1 from jsonb_array_elements(v_unit.fields) f where f->>'id'=e.key)) then raise exception 'invalid_request';end if;
   insert into ip_pa_drafts(student_id,unit_id) values(v_student,v_id) on conflict do nothing;
   select * into v_draft from ip_pa_drafts where student_id=v_student and unit_id=v_id for update;
   select * into v_sub from ip_pa_submissions where id=v_draft.latest_id;
   v_fingerprint:=md5(jsonb_build_object('fields',v_fields,'definition',to_jsonb(v_unit))::text);
   if p_action='submit' and v_sub.fingerprint=v_fingerprint then
    -- Re-submitting the accepted text can restore an edited draft, but must not
    -- overwrite a newer draft from another tab. Exact request retries return above.
    if v_draft.fields<>v_fields then
     if v_draft.revision<>coalesce((p_body->'revisions'->>v_id)::integer,-1) then raise exception 'revision_conflict';end if;
     update ip_pa_drafts set fields=v_fields,revision=revision+1,updated_at=now() where student_id=v_student and unit_id=v_id;
    end if;
    v_rows:=v_rows||jsonb_build_array(jsonb_build_object('unitId',v_id,'id',v_sub.id,'round',v_sub.round,'reused',true));continue;
   end if;
   if v_draft.revision<>(case when p_action='save' then v_revision else coalesce((p_body->'revisions'->>v_id)::integer,-1) end) then raise exception 'revision_conflict';end if;
   if p_action='submit' then
    if coalesce(v_fields->>'f1','') !~ '[^[:space:]]' then raise exception 'incomplete';end if;
    v_due:=case when v_sub.id is null then v_cfg.due_at else v_cfg.revision_due_at end;
    if now()>=v_due and not v_cfg.allow_late then raise exception 'deadline_passed';end if;
    v_round:=coalesce(v_sub.round,0)+1;
    insert into ip_pa_submissions(student_id,unit_id,round,fields,definition,fingerprint,late) values(v_student,v_id,v_round,v_fields,to_jsonb(v_unit),v_fingerprint,now()>=v_due) returning id into v_new;
    update ip_pa_drafts set latest_id=v_new where student_id=v_student and unit_id=v_id;
    v_rows:=v_rows||jsonb_build_array(jsonb_build_object('unitId',v_id,'id',v_new,'round',v_round,'reused',false));
    insert into ip_pa_events(student_id,unit_id,actor_id,action,data) values(v_student,v_id,v_actor,p_action,jsonb_build_object('submissionId',v_new,'round',v_round));
   end if;
   update ip_pa_drafts set fields=v_fields,revision=revision+1,updated_at=now() where student_id=v_student and unit_id=v_id;
  end loop;
  v_result:=jsonb_build_object('ok',true,'receipts',v_rows);
  insert into ip_pa_receipts(student_id,request_id,action,fingerprint,result) values(v_student,p_body->>'requestId',p_action,v_request_hash,v_result);return v_result;

 end if;
 raise exception 'unsupported_action';
end;$$;
