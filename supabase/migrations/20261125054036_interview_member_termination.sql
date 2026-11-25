begin;
set local lock_timeout='1s';
set local statement_timeout='20s';

-- Enrollment lifecycle is separate from purchases, account activation and expiry.
create table public.ip_termination_reasons (
 id text primary key default gen_random_uuid()::text,
 name text not null check(length(btrim(name)) between 1 and 80),
 active boolean not null default true,
 requires_note boolean not null default false,
 sort_order integer not null default 100,
 revision integer not null default 1,
 updated_at timestamptz not null default now()
);
create unique index ip_termination_reason_name on public.ip_termination_reasons(lower(btrim(name)));
insert into public.ip_termination_reasons(id,name,sort_order,requires_note) values
 ('fitness','체력 탈락',1,false),('documents','서류 탈락',2,false),('requested','본인 요청',3,false),
 ('refund','환불',4,false),('course_end','수강 종료',5,false),('other','기타',6,true);

create table public.ip_member_access (
 student_id text primary key references public.ip_members(student_id) on delete cascade,
 scope text not null default 'active' check(scope in ('active','interview','app')),
 reason_id text references public.ip_termination_reasons(id),
 reason_name text not null default '',note text not null default '' check(length(note)<=2000),
 ended_at timestamptz,ended_by text,
 revision integer not null default 0
);
create index ip_member_access_scope on public.ip_member_access(scope,ended_at desc);
create table public.ip_member_access_history (
 id bigint generated always as identity primary key,
 student_id text not null references public.ip_members(student_id) on delete cascade,
 action text not null check(action in ('end','restore')),
 scope text not null check(scope in ('interview','app')),
 reason_id text references public.ip_termination_reasons(id),reason_name text not null default '',
 note text not null default '',actor_id text not null,created_at timestamptz not null default now(),
 before_state jsonb not null,after_state jsonb not null
);
create index ip_member_access_history_student on public.ip_member_access_history(student_id,id desc);
alter table public.ip_termination_reasons enable row level security;
alter table public.ip_member_access enable row level security;
alter table public.ip_member_access_history enable row level security;
revoke all on public.ip_termination_reasons,public.ip_member_access,public.ip_member_access_history from public,anon,authenticated;
grant select,insert,update on public.ip_termination_reasons,public.ip_member_access to service_role;
grant select,insert on public.ip_member_access_history to service_role;
grant usage,select on sequence public.ip_member_access_history_id_seq to service_role;

create function public.ip_termination_scope(p_student text) returns text language sql stable security invoker
 set search_path=public,pg_temp as $$
 select coalesce((select scope from public.ip_member_access where student_id=p_student),'active');
$$;
revoke all on function public.ip_termination_scope(text) from public,anon,authenticated;
grant execute on function public.ip_termination_scope(text) to service_role;

create function public.ip_enrollment_service(p_action text,p_actor jsonb,p_body jsonb default '{}')
 returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
 rows jsonb; result jsonb:='[]'; item jsonb; reason public.ip_termination_reasons;
 member public.ip_members; access public.ip_member_access; previous jsonb; target text; current_scope text;
 requested_scope text:=p_body->>'scope'; operation text:=p_body->>'operation';
 v_note text:=btrim(coalesce(p_body->>'note','')); v_name text; actor text:=p_actor->>'id';
begin
 if p_actor->>'type' is distinct from 'admin' or coalesce(actor,'')='' then raise exception 'forbidden'; end if;
 if p_action='admin_enrollment_list' then
  with roster as (
   select d.name,m.*,coalesce(a.scope,'active') scope,coalesce(a.revision,0) access_revision,
    a.reason_id,a.reason_name,a.note,a.ended_at,a.ended_by,
    case when coalesce(a.scope,'active')<>'active' then 'ended' when not m.enabled then 'suspended'
     when m.expires_on<(now() at time zone 'Asia/Seoul')::date then 'expired' else 'active' end enrollment_status
   from public.ip_members m join public.ip_student_directory d on d.id=m.student_id
   left join public.ip_member_access a on a.student_id=m.student_id
   where d.is_active and coalesce(d.account_type,'student')='student'
  ), filtered as (
   select r.* from roster r where
    (coalesce(p_body->>'search','')='' or strpos(lower(r.name||' '||r.student_id||' '||r.exam_number),lower(p_body->>'search'))>0)
    and (coalesce(p_body->>'enrollmentStatus','')='' or enrollment_status=p_body->>'enrollmentStatus')
    and (coalesce(p_body->>'reasonId','')='' or (scope<>'active' and reason_id=p_body->>'reasonId'))
    and (coalesce(p_body->>'terminationScope','')='' or scope=p_body->>'terminationScope')
  ) select jsonb_build_object('ok',true,'total',(select count(*) from filtered),
   'members',(select coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('id',x.student_id)),'[]') from
    (select * from filtered order by name,student_id offset coalesce((p_body->>'page')::integer,0)*30 limit 30) x),
   'reasons',(select coalesce(jsonb_agg(to_jsonb(r) order by sort_order,name),'[]') from public.ip_termination_reasons r),
   'summary',jsonb_build_object('students',(select count(*) from roster where enrollment_status='active'),
    'pending',(select count(*) from public.ip_applications where status='pending'),
    'approved',(select count(*) from public.ip_applications where status='approved'),
    'rejected',(select count(*) from public.ip_applications where status='rejected'))) into rows;
  return rows;
 elsif p_action='admin_enrollment_history' then
  return jsonb_build_object('ok',true,'history',(select coalesce(jsonb_agg(to_jsonb(x) order by id desc),'[]') from
   (select id,action,scope,reason_name,note,actor_id,created_at from public.ip_member_access_history
    where student_id=p_body->>'targetStudentId' order by id desc limit 200) x));
 elsif p_action='admin_enrollment_reason_save' then
  if jsonb_typeof(p_body->'name') is distinct from 'string' or length(btrim(p_body->>'name')) not between 1 and 80
   or jsonb_typeof(p_body->'active') is distinct from 'boolean' or jsonb_typeof(p_body->'requiresNote') is distinct from 'boolean'
   or jsonb_typeof(p_body->'revision') is distinct from 'number' then raise exception 'invalid_request'; end if;
  begin
   if coalesce(p_body->>'id','')='' then
    if (p_body->>'revision')::integer<>0 then raise exception 'revision_conflict'; end if;
    insert into public.ip_termination_reasons(name,active,requires_note)
     values(btrim(p_body->>'name'),(p_body->>'active')::boolean,(p_body->>'requiresNote')::boolean) returning * into reason;
   else
    update public.ip_termination_reasons set name=btrim(p_body->>'name'),active=(p_body->>'active')::boolean,
     requires_note=(p_body->>'requiresNote')::boolean,revision=revision+1,updated_at=now()
     where id=p_body->>'id' and revision=(p_body->>'revision')::integer returning * into reason;
    if not found then raise exception 'revision_conflict'; end if;
   end if;
  exception when unique_violation then raise exception 'reason_in_use'; end;
  return jsonb_build_object('ok',true,'reason',to_jsonb(reason));
 elsif p_action='admin_enrollment_change' then
  if operation is null or operation not in ('end','restore') or requested_scope is null
   or jsonb_typeof(p_body->'items') is distinct from 'array' or jsonb_array_length(p_body->'items') not between 1 and 100
   or length(v_note)>2000 or (operation='end' and requested_scope not in ('interview','app'))
   or (operation='restore' and requested_scope<>'active') then raise exception 'invalid_request'; end if;
  if operation='end' then
   select * into reason from public.ip_termination_reasons where id=p_body->>'reasonId' and active for share;
   if not found or (reason.requires_note and v_note='') then raise exception 'invalid_request'; end if;
  end if;
  -- Stable ordering prevents overlapping bulk operations from locking in opposite orders.
  for item in select value from jsonb_array_elements(p_body->'items') order by value->>'id' loop
   target:=item->>'id';v_name:=null;
   begin
    if coalesce(target,'')='' or jsonb_typeof(item->'revision') is distinct from 'number'
     or coalesce(item->>'memberUpdatedAt','')='' then raise exception 'invalid_request'; end if;
    select * into member from public.ip_members where student_id=target for update;
    if not found then raise exception 'not_found'; end if;
    select d.name into v_name from public.ip_student_directory d where d.id=target and d.is_active and coalesce(d.account_type,'student')='student';
    if not found then raise exception 'not_found'; end if;
    insert into public.ip_member_access(student_id) values(target) on conflict do nothing;
    select * into access from public.ip_member_access where student_id=target for update;
    if access.revision<>(item->>'revision')::integer or member.updated_at is distinct from (item->>'memberUpdatedAt')::timestamptz then raise exception 'revision_conflict'; end if;
    current_scope:=access.scope;previous:=to_jsonb(access);
    if (operation='end' and current_scope<>'active') or (operation='restore' and current_scope='active') then raise exception 'revision_conflict'; end if;
    if operation='end' and requested_scope='interview' and member.access_product='aptitude_only' then raise exception 'invalid_request'; end if;
    update public.ip_member_access set scope=requested_scope,revision=revision+1,
     reason_id=case when operation='end' then reason.id else null end,
     reason_name=case when operation='end' then reason.name else '' end,
     note=case when operation='end' then v_note else '' end,
     ended_at=case when operation='end' then now() else null end,
     ended_by=case when operation='end' then actor else null end where student_id=target returning * into access;
    insert into public.ip_member_access_history(student_id,action,scope,reason_id,reason_name,note,actor_id,before_state,after_state)
     values(target,operation,case when operation='end' then requested_scope else current_scope end,
      case when operation='end' then reason.id else previous->>'reason_id' end,
      case when operation='end' then reason.name else previous->>'reason_name' end,v_note,actor,previous,to_jsonb(access));
    result:=result||jsonb_build_array(jsonb_build_object('id',target,'name',v_name,'ok',true));
   exception when others then
    result:=result||jsonb_build_array(jsonb_build_object('id',target,'name',v_name,'ok',false,'error',
     case when sqlerrm in ('invalid_request','not_found','revision_conflict') then sqlerrm else 'interview_unavailable' end));
   end;
  end loop;
  return jsonb_build_object('ok',true,'results',result);
 end if;
 raise exception 'unsupported_action';
end $$;
revoke all on function public.ip_enrollment_service(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ip_enrollment_service(text,jsonb,jsonb) to service_role;

-- Preserve existing service implementations and deny ended enrollment on every
-- student request, including old/native clients and direct RPC callers.
do $patch$
declare source text; signature text; function_name text; original text; replacement text;
begin
 foreach function_name in array array['ip_service','ip_core_service','ip_life_service','ip_ai_service',
  'ip_writing_service','ip_writing_history_service','ip_diagnosis_service','ip_life_followup_service',
  'ip_preassignment_service','ip_pa_guidance_service','ip_pa_diagnosis_service','ip_draft_question_service',
  'ip_job_exam_service','ip_personality_service','ip_practice_cli_service','ip_openai_practice_service',
  'ip_live_service','ip_live_openai_report_service','ip_exam_report_service','ip_test_app_feedback_service'] loop
  signature:='public.'||function_name||'(text,jsonb,jsonb)';
  if to_regprocedure(signature) is null then continue; end if;
  source:=replace(pg_get_functiondef(signature::regprocedure),E'\r\n',E'\n');
  if strpos(lower(source),E'\nbegin\n')=0 then raise exception 'Unexpected service body: %',function_name; end if;
  replacement:=E'\nbegin\n if p_actor->>''type''=''student'' and '||
   case when function_name='ip_service' then 'p_action<>''status'' and ' else '' end||
   E'public.ip_termination_scope(p_actor->>''id'')<>''active'' then raise exception ''not_enrolled''; end if;\n';
  source:=regexp_replace(source,E'\nbegin\n',replacement,'i');
  if function_name='ip_service' then
   original:=$old$'appEnabled',coalesce(v_enabled and v_member.enabled and$old$;
   if strpos(source,original)=0 then raise exception 'Unexpected app access definition'; end if;
   source:=replace(source,original,$new$'appEnabled',coalesce(public.ip_termination_scope(v_id)<>'app' and v_enabled and v_member.enabled and$new$);
   original:=$old$'enabled',coalesce(v_enabled and v_member.enabled and$old$;
   if strpos(source,original)=0 then raise exception 'Unexpected interview access definition'; end if;
   source:=replace(source,original,$new$'terminationScope',public.ip_termination_scope(v_id),
        'endedAt',(select ended_at from public.ip_member_access where student_id=v_id and scope<>'active'),
        'enabled',coalesce(public.ip_termination_scope(v_id)='active' and v_enabled and v_member.enabled and$new$);
  end if;
  execute source;
 end loop;
 -- Prevent never-dispatched work from starting after a member is ended.
 -- Existing server-only cleanup/completion validation is retained; no retry is added.
 for signature,original,replacement in select * from (values
  ('public.ip_ai_worker_service(text,text,jsonb)',
   'and m.enabled and s.is_active',
   'and public.ip_termination_scope(m.student_id)=''active'' and m.enabled and s.is_active'),
  ('public.ip_draft_question_service(text,jsonb,jsonb)',
   'where state=''queued'' order by created_at',
   'where state=''queued'' and public.ip_termination_scope(student_id)=''active'' order by created_at'),
  ('public.ip_pa_worker_service(text,jsonb)',
   'and worker_queued and worker_lease is null',
   'and public.ip_termination_scope(student_id)=''active'' and worker_queued and worker_lease is null'),
  ('public.ip_openai_practice_service(text,jsonb,jsonb)',
   'and state=''uploading'' and retain_until>now()',
   'and state=''uploading'' and public.ip_termination_scope(owner_id)=''active'' and retain_until>now()')
 ) as changes(fn,old_text,new_text) loop
  if to_regprocedure(signature) is null then continue; end if;
  source:=pg_get_functiondef(signature::regprocedure);
  if strpos(source,original)=0 then raise exception 'Unexpected worker access definition: %',signature; end if;
  execute replace(source,original,replacement);
 end loop;
 if to_regprocedure('public.ip_ai_materials_service(jsonb,jsonb)') is not null then
  source:=replace(pg_get_functiondef('public.ip_ai_materials_service(jsonb,jsonb)'::regprocedure),E'\r\n',E'\n');
  execute regexp_replace(source,E'\nbegin\n',E'\nbegin\n if p_actor->>''type''=''student'' and public.ip_termination_scope(p_actor->>''id'')<>''active'' then raise exception ''not_enrolled''; end if;\n','i');
 end if;
 source:=replace(pg_get_functiondef('public.ip_mock_access_service(text,jsonb,jsonb)'::regprocedure),E'\r\n',E'\n');
 original:=$old$where m.student_id=p_actor->>'id'$old$;
 if (length(source)-length(replace(source,original,'')))/length(original)<>1 then raise exception 'Unexpected mock access definition'; end if;
 execute replace(source,original,original||' and public.ip_termination_scope(m.student_id)=''active''');

 source:=replace(pg_get_functiondef('public.ip_aptitude_service(text,jsonb,jsonb)'::regprocedure),E'\r\n',E'\n');
 if strpos(source,'and m.enabled')=0 then raise exception 'Unexpected aptitude access definition'; end if;
 source:=replace(source,'and m.enabled','and public.ip_termination_scope(m.student_id)<>''app'' and m.enabled');
 execute replace(source,'where m.enabled','where public.ip_termination_scope(m.student_id)<>''app'' and m.enabled');

 if to_regprocedure('public.ip_native_launch_service(text,jsonb,jsonb)') is not null then
  source:=pg_get_functiondef('public.ip_native_launch_service(text,jsonb,jsonb)'::regprocedure);
  if strpos(source,'and m.enabled')=0 then raise exception 'Unexpected native access definition'; end if;
  execute replace(source,'and m.enabled','and public.ip_termination_scope(m.student_id)=''active'' and m.enabled');
 end if;

 source:=replace(pg_get_functiondef('public.ip_portal_service(text,jsonb,jsonb)'::regprocedure),E'\r\n',E'\n');
 original:=$old$'member',(select to_jsonb(m) from ip_members m where student_id=v_owner),$old$;
 if strpos(source,original)=0 then raise exception 'Unexpected portal session definition'; end if;
 source:=replace(source,original,original||E'\n   ''access'',case when v_owner is null then null else ip_service(''status'',jsonb_build_object(''type'',''student'',''id'',v_owner),''{}'') end,');
 original:=$old$if p_action='apply' then$old$;
 source:=replace(source,original,original||E'\n  if public.ip_termination_scope(v_owner)<>''active'' then raise exception ''enrollment_ended''; end if;');
 source:=replace(source,'and m.enabled and (m.expires_on','and public.ip_termination_scope(m.student_id)=''active'' and m.enabled and (m.expires_on');
 execute source;
end $patch$;
commit;
