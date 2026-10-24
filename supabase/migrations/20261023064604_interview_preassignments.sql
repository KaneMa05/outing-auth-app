begin;
-- Additive, default off. All requests use existing verified interview credentials.
create table public.ip_pa_settings(
 id boolean primary key default true check(id), enabled boolean not null default false,
 cohort text not null default '2026년 3차 해양경찰',revision integer not null default 1,
 due_at timestamptz not null default '2026-11-09T00:00:00+09:00',
 revision_due_at timestamptz not null default '2026-11-09T00:00:00+09:00',allow_late boolean not null default true
);
insert into public.ip_pa_settings(id) values(true);
create table public.ip_pa_units(id text primary key,title text not null,section text not null,fields jsonb not null,prompt text not null,position integer not null);
insert into ip_pa_units(id,title,section,fields,prompt,position) values
('core-01','핵심인성 1번','핵심인성 25제','[{"id": "f1", "label": "내 답변", "required": true}]','본인의 강점을 살려 우리 조직에 들어와 발휘 하는 있는 점?',0),
('core-02','핵심인성 2번','핵심인성 25제','[{"id": "f1", "label": "내 답변", "required": true}]','공동 목표를 위해 자신이 희생한 경험은?',1),
('core-03','핵심인성 3번','핵심인성 25제','[{"id": "f1", "label": "내 답변", "required": true}]','자신의 단점?',2),
('core-04','핵심인성 4번','핵심인성 25제','[{"id": "f1", "label": "내 답변", "required": true}]','공무원들의 고쳐야 할 점 / 공직관 심화',3),
('core-05','핵심인성 5번','핵심인성 25제','[{"id": "f1", "label": "내 답변", "required": true}]','학창시절 동아리 활동은?',4),
('core-06','핵심인성 6번','핵심인성 25제','[{"id": "f1", "label": "내 답변", "required": true}]','사람들 간의 문제를 해결한 적은?',5),
('core-07','핵심인성 7번','핵심인성 25제','[{"id": "f1", "label": "내 답변", "required": true}]','(불안형 질문)일이 육체적으로 힘들고 박봉인데 선택한 이유는?',6),
('core-08','핵심인성 8번','핵심인성 25제','[{"id": "f1", "label": "내 답변", "required": true}]','(학교/승선/의경 생활시) 상사에게 어떤 평가를 받았는지?',7),
('core-09','핵심인성 9번','핵심인성 25제','[{"id": "f1", "label": "내 답변", "required": true}]','상사가 부당한 지시를 내렸을 때?',8),
('core-10','핵심인성 10번','핵심인성 25제','[{"id": "f1", "label": "내 답변", "required": true}]','스트레스는 언제 받고, 어떻게 해소하는지?',9),
('core-11','핵심인성 11번','핵심인성 25제','[{"id": "f1", "label": "내 답변", "required": true}]','창의적인 의견을 건의하여 기여했던 적은?',10),
('core-12','핵심인성 12번','핵심인성 25제','[{"id": "f1", "label": "내 답변", "required": true}]','10년 후 자신의 모습은?',11),
('core-13','핵심인성 13번','핵심인성 25제','[{"id": "f1", "label": "내 답변", "required": true}]','공무원이 갖추어야 할 성인지감수성은?',12),
('core-14','핵심인성 14번','핵심인성 25제','[{"id": "f1", "label": "내 답변", "required": true}]','마지막 하고 싶은 말은?',13),
('core-15','핵심인성 15번','핵심인성 25제','[{"id": "f1", "label": "내 답변", "required": true}]','실패했던 경험이 있나요?  / 실패를 통해 무얼 배웠나요?',14),
('core-16','핵심인성 16번','핵심인성 25제','[{"id": "f1", "label": "내 답변", "required": true}]','화가 나면 참는 편인가요? 화를 내는 편인가요?',15),
('core-17','핵심인성 17번','핵심인성 25제','[{"id": "f1", "label": "내 답변", "required": true}]','우리 조직의 홍보 방법에 대해서 말해 보세요.',16),
('core-18','핵심인성 18번','핵심인성 25제','[{"id": "f1", "label": "내 답변", "required": true}]','(불안형) 입사 후 자신이 맡은 업무가 자신의 생각과 달랐다면 어떻게 하겠습니까?',17),
('core-19','핵심인성 19번','핵심인성 25제','[{"id": "f1", "label": "내 답변", "required": true}]','(사고관련) 안전사고는 왜 일어난다고 생각합니까?',18),
('core-20','핵심인성 20번','핵심인성 25제','[{"id": "f1", "label": "내 답변", "required": true}]','최근에 본 영화나 책은 무엇입니까?',19),
('core-21','핵심인성 21번','핵심인성 25제','[{"id": "f1", "label": "내 답변", "required": true}]','본인은 어떤 리더십을 가지고 있습니까?',20),
('core-22','핵심인성 22번','핵심인성 25제','[{"id": "f1", "label": "내 답변", "required": true}]','과정과 결과 중 무엇이 더 중요한가요?',21),
('core-23','핵심인성 23번','핵심인성 25제','[{"id": "f1", "label": "내 답변", "required": true}]','존경하는 인물이 있습니까?',22),
('core-24','핵심인성 24번','핵심인성 25제','[{"id": "f1", "label": "내 답변", "required": true}]','본인이 생각할 때 좋은 팀워크를 이루기 위한 3가지는?',23),
('core-25','핵심인성 25번','핵심인성 25제','[{"id": "f1", "label": "내 답변", "required": true}]','공무원에게 있어 음주 문제가 중요한 이유는?',24),
('other','기타질문','기타질문','[{"id": "f1", "label": "내 답변", "required": true}]','추가로 준비할 질문에 대한 나의 답변을 작성하세요. 여러 질문은 답변 안에서 구분해주세요.',25);
create table public.ip_pa_drafts(
 student_id text not null references public.ip_members(student_id) on delete cascade,unit_id text not null references public.ip_pa_units(id),
 fields jsonb not null default '{}',revision integer not null default 0,
 latest_id uuid,
 updated_at timestamptz not null default now(),primary key(student_id,unit_id)
);
create table public.ip_pa_submissions(
 id uuid primary key default gen_random_uuid(),student_id text not null references public.ip_members(student_id) on delete cascade,
 unit_id text not null references public.ip_pa_units(id),round integer not null,
 fields jsonb not null,definition jsonb not null,fingerprint text not null,
 submitted_at timestamptz not null default now(),late boolean not null,
 status text not null default 'submitted' check(status in ('submitted','needs_revision','approved')),
 feedback text not null default '',reviewer text,reviewed_at timestamptz,revision integer not null default 0,
 unique(student_id,unit_id,round)
);
create index ip_pa_submissions_lookup on public.ip_pa_submissions(student_id,unit_id,round desc);
create index ip_pa_drafts_latest on public.ip_pa_drafts(latest_id);
alter table public.ip_pa_drafts add constraint ip_pa_drafts_latest_fk foreign key(latest_id) references public.ip_pa_submissions(id);
create table public.ip_pa_receipts(student_id text not null references public.ip_members(student_id) on delete cascade,request_id text not null,action text not null,fingerprint text not null,result jsonb not null,created_at timestamptz not null default now(),primary key(student_id,request_id));
create table public.ip_pa_events(id bigint generated always as identity primary key,student_id text,unit_id text,actor_id text not null,action text not null,data jsonb not null default '{}',created_at timestamptz not null default now());
create index ip_pa_events_student on public.ip_pa_events(student_id,id desc);

create function public.ip_preassignment_service(p_action text,p_actor jsonb,p_body jsonb default '{}') returns jsonb
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
   from ip_pa_units u left join ip_pa_drafts d on d.unit_id=u.id and d.student_id=v_student left join ip_pa_submissions s on s.id=d.latest_id;
   return jsonb_build_object('ok',true,'settings',to_jsonb(v_cfg),'units',v_rows,'track',(select track from ip_members where student_id=v_student));
  end if;
  with counts as (
   select d.student_id,count(s.id) as submitted,
    count(s.id) filter(where d.unit_id like 'core-%') as core_submitted,max(s.status) filter(where d.unit_id='other') as other_status,max(s.submitted_at) as latest
   from ip_pa_drafts d left join ip_pa_submissions s on s.id=d.latest_id group by d.student_id
  ), roster as (
   select m.student_id,d.name,m.track,m.enabled,coalesce(c.submitted,0) as submitted,coalesce(c.core_submitted,0) as core_submitted,coalesce(c.other_status,'empty') as other_status,c.latest
   from ip_members m join ip_student_directory d on d.id=m.student_id left join counts c on c.student_id=m.student_id
   where coalesce(p_body->>'search','')='' or strpos(lower(d.name||' '||m.student_id||' '||m.track),lower(p_body->>'search'))>0
  ), filtered as (
   select * from roster where coalesce(p_body->>'status','')='' or (p_body->>'status'='submitted' and submitted>0) or (p_body->>'status'='empty' and submitted<(select count(*) from ip_pa_units)) or (p_body->>'status'='complete' and submitted=(select count(*) from ip_pa_units))
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
   'units',(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'status',coalesce(s.status,'empty')) order by u.position),'[]') from ip_pa_units u left join ip_pa_drafts d on d.unit_id=u.id and d.student_id=v_student left join ip_pa_submissions s on s.id=d.latest_id));
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
do $$ declare n text;begin
 foreach n in array array['ip_pa_settings','ip_pa_units','ip_pa_drafts','ip_pa_submissions','ip_pa_receipts','ip_pa_events'] loop
  execute format('alter table public.%I enable row level security',n);
  execute format('revoke all on public.%I from public,anon,authenticated',n);
  execute format('grant select,insert,update,delete on public.%I to service_role',n);
 end loop;
end $$;
grant usage,select on sequence ip_pa_events_id_seq to service_role;
revoke all on function public.ip_preassignment_service(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ip_preassignment_service(text,jsonb,jsonb) to service_role;
commit;
