begin;

-- Portal owners also own life profiles/notes; version rows must use the same identity table.
do $owners$
declare src text;
begin
 if exists(select 1 from public.ip_ai_source_versions v left join public.ip_owners o on o.id=v.student_id where o.id is null) then
  raise exception 'Unexpected version owner';
 end if;
 if not exists(select 1 from pg_constraint where conrelid='public.ip_ai_source_versions'::regclass and contype='f' and confrelid='public.ip_owners'::regclass) then
  alter table public.ip_ai_source_versions drop constraint ip_ai_source_versions_student_id_fkey;
  alter table public.ip_ai_source_versions add constraint ip_ai_source_versions_student_id_fkey
   foreign key(student_id) references public.ip_owners(id) on delete cascade;
 end if;
 select pg_get_functiondef('public.ip_ai_bump_source_version()'::regprocedure) into src;
 if strpos(src,'from students s')=0 then raise exception 'Expected source version owner lookup';end if;
 execute replace(src,'from students s','from public.ip_owners s');
end $owners$;

-- Saved diagnostic answers are evidence, not a requirement to complete all 13 axes.
create function public.ip_ai_draft_answer_sources(p_student text,p_kind text)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('id','diagnosis:'||a.topic_id||':'||x.n,
  'text',x.answer,'experience_id',null) order by a.topic_id,x.n),'[]')
 from public.ip_diagnosis_answers a cross join lateral jsonb_array_elements_text(a.answers) with ordinality x(answer,n)
 where a.student_id=p_student and a.topic_id=case p_kind when 'motivation' then 'motivation' when 'public_service' then 'public' end
  and length(btrim(x.answer))>=10;
$$;
revoke all on function public.ip_ai_draft_answer_sources(text,text) from public,anon,authenticated;
grant execute on function public.ip_ai_draft_answer_sources(text,text) to service_role;

create function public.ip_ai_diagnosis_source_changed() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare sid text;
begin
 if tg_op='UPDATE' and old.answers is not distinct from new.answers and old.prompts is not distinct from new.prompts then return new;end if;
 sid:=case when tg_op='DELETE' then old.student_id else new.student_id end;
 insert into public.ip_ai_source_versions(student_id,revision)
 select id,1 from public.ip_owners where id=sid
 on conflict(student_id) do update set revision=ip_ai_source_versions.revision+1;
 return coalesce(new,old);
end $$;
revoke all on function public.ip_ai_diagnosis_source_changed() from public,anon,authenticated;
grant execute on function public.ip_ai_diagnosis_source_changed() to service_role;
create trigger ip_ai_diagnosis_version after insert or update or delete on public.ip_diagnosis_answers
 for each row execute function public.ip_ai_diagnosis_source_changed();

do $sources$
declare src text;
begin
 select pg_get_functiondef('public.ip_ai_sources(text,text)'::regprocedure) into src;
 if strpos(src,'return outdata;')=0 then raise exception 'Expected evidence collector';end if;
 execute replace(src,'return outdata;','return outdata||public.ip_ai_draft_answer_sources(p_student,p_kind);');
end $sources$;

-- Existing saved answers become evidence immediately, including cached status checks.
insert into public.ip_ai_source_versions(student_id,revision)
select o.id,1 from public.ip_owners o where exists(select 1 from public.ip_diagnosis_answers a
 where a.student_id=o.id and a.topic_id in ('motivation','public'))
on conflict(student_id) do update set revision=ip_ai_source_versions.revision+1;

create function public.ip_ai_draft_materials(p_student text,p_kind text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare topic text;current_topic public.ip_topics;note public.ip_notes;combined text;has_experience boolean;
 material jsonb;outfields jsonb:='[]';key text;question text;found boolean;answer text;value_found boolean;
begin
 topic:=case p_kind when 'motivation' then 'motivation' when 'public_service' then 'public' end;
 if topic is null then return null;end if;
 select * into current_topic from public.ip_topics where id=topic and active;
 select * into note from public.ip_notes where student_id=p_student and topic_id=topic;
 select string_agg(value->>'text',E'\n'),bool_or(value->>'experience_id' is not null)
 into combined,has_experience from jsonb_array_elements(public.ip_ai_sources(p_student,p_kind)) where value->>'id'<>'life:background';
 -- Field labels such as '전공: 해당 없음' are not evidence of actual preparation.
 combined:=coalesce(combined,'')||E'\n'||coalesce((select case when content ? 'basicInfo' then
  (select string_agg(value->>'text',E'\n') from jsonb_each(content->'basicInfo') where value->>'none' is distinct from 'true')
  else content->>'background' end from public.ip_life_profiles where student_id=p_student),'');
 value_found:=combined ~ '(공직|공익|국민|청렴|정직|공정|책임|봉사|안전|사명)';
 foreach key in array array['position','reason','application'] loop
  question:=case when p_kind='motivation' then case key
   when 'position' then '해양경찰에 지원하게 된 본인만의 계기는 무엇인가요?'
   when 'reason' then '다른 진로 대신 해양경찰과 이 직렬을 선택한 이유는 무엇인가요?'
   else '지원하기 위해 실제로 준비한 일과 그 과정에서 배운 점은 무엇인가요?' end
  else case key
   when 'position' then '가장 중요하게 생각하는 공직 가치는 무엇인가요?'
   when 'reason' then '그 가치를 중요하게 생각하게 된 이유는 무엇인가요?'
   else '그 가치를 직접 실천한 경험과 앞으로의 실천 방법은 무엇인가요?' end end;
  answer:=coalesce(note.fields->>key,'');
  found:=length(btrim(answer))>=10;
  if not found then
   if p_kind='motivation' then
    found:=case key
     when 'position' then combined ~ '(지원.*(계기|동기|결심)|관심.*(갖|생|계기)|(해양경찰|해경).*(싶|지원|선택|결심))'
     when 'reason' then combined ~ '((해양경찰|해경).*(때문|이유|선택|기여|싶|보람)|(선택|지원).*(이유|때문|가치|안전))'
     else combined ~ '(공부|학습|준비|훈련|실습|승선|항해|자격|교육|전공|면허|연습)' end;
   else found:=value_found and (key='position' or coalesce(has_experience,false));end if;
  end if;
  outfields:=outfields||jsonb_build_array(jsonb_build_object('key',key,'question',question,'ready',coalesce(found,false),
   'value',answer,'source',case when length(btrim(answer))>=10 then 'answer' when found then 'db' else 'missing' end));
 end loop;
 return jsonb_build_object('topicId',topic,'topicRevision',current_topic.revision,
  'revision',coalesce(note.revision,0),'fields',outfields);
end $$;
revoke all on function public.ip_ai_draft_materials(text,text) from public,anon,authenticated;
grant execute on function public.ip_ai_draft_materials(text,text) to service_role;

create or replace function public.ip_ai_draft_readiness(p_student text,p_kind text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare profile jsonb;missing jsonb:='[]';experience_count integer;minimum integer;materials jsonb;material_field jsonb;
begin
 if p_kind not in ('self_intro','motivation','public_service') or p_kind is null then return public.ip_ai_readiness(p_student);end if;
 minimum:=case when p_kind='self_intro' then 3 else 1 end;
 select content into profile from public.ip_life_profiles where student_id=p_student;
 if not coalesce(public.ip_basic_complete(profile),false) then
  missing:=missing||jsonb_build_array('기본 이력: ‘DB 정리 → 기본 이력’에서 내용을 입력하거나 해당 없음을 선택하고 저장해주세요.');
 end if;
 select count(distinct rowdata->>'content') into experience_count from (
  select public.ip_life_experience_text(value) rowdata from jsonb_array_elements(coalesce(profile->'experiences','[]'))
 ) experiences where not exists(select 1 from unnest(array['age','title','content','appeal']) field
  where length(btrim(coalesce(rowdata->>field,'')))=0);
 if experience_count<minimum then
  missing:=missing||jsonb_build_array('인생그래프: 내용과 어필할 점이 있는 서로 다른 경험을 '||minimum||'개 이상 작성하고 저장해주세요. 현재 '||experience_count||'개입니다.');
 end if;
 materials:=public.ip_ai_draft_materials(p_student,p_kind);
 for material_field in select value from jsonb_array_elements(coalesce(materials->'fields','[]')) loop
  if not (material_field->>'ready')::boolean then missing:=missing||jsonb_build_array(material_field->>'question');end if;
 end loop;
 return jsonb_build_object('dbReady',jsonb_array_length(missing)=0,'missing',missing,'experienceCount',experience_count,
  'minExperienceCount',minimum,'materials',materials,'readinessVersion','draft_materials_v1');
end $$;

-- Merge only explicitly edited answers, preserving older notes and optimistic revisions.
create function public.ip_ai_materials_service(p_actor jsonb,p_body jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare kind text:=p_body->>'kind';topic text;previous jsonb;result jsonb;
begin
 if kind not in ('motivation','public_service') or kind is null then raise exception 'invalid_request';end if;
 if jsonb_typeof(p_body->'fields') is distinct from 'object' or exists(
  select 1 from jsonb_each(p_body->'fields') e where e.key not in ('position','reason','application')
   or jsonb_typeof(e.value)<>'string' or length(e.value#>>'{}')>2000
 ) then raise exception 'invalid_request';end if;
 topic:=case kind when 'motivation' then 'motivation' else 'public' end;
 select fields into previous from public.ip_notes where student_id=p_actor->>'id' and topic_id=topic;
 result:=public.ip_service('note_save',p_actor,jsonb_build_object('topicId',topic,'topicRevision',p_body->'topicRevision',
  'revision',p_body->'revision','status','draft','fields',coalesce(previous,'{}')||(p_body->'fields')));
 return public.ip_ai_service('prepare',p_actor,jsonb_build_object('kind',kind));
end $$;
revoke all on function public.ip_ai_materials_service(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ip_ai_materials_service(jsonb,jsonb) to service_role;

-- Keep three prepared experiences as the introduction's material pool; use selected evidence in the answer.
do $policy$
declare src text;old_text text;
begin
 select pg_get_functiondef('public.ip_ai_validate_result(jsonb,jsonb,text)'::regprocedure) into src;
 if strpos(src,'if n<3 then')=0 then raise exception 'Expected introduction coverage check';end if;
 execute replace(src,'if n<3 then','if n<1 then');
 select pg_get_functiondef('public.ip_ai_service(text,jsonb,jsonb)'::regprocedure) into src;
 old_text:='본인의 실제 경험 3개 이상을 포함해 자기소개를 작성해주세요.';
 if strpos(src,old_text)=0 then raise exception 'Expected introduction prompt';end if;
 src:=replace(src,old_text,'저장된 경험에서 핵심 강점을 보여주는 경험 1~2개를 골라 해양경찰 업무와 연결한 자기소개를 작성해주세요.');
 -- Serialize admission with policy handover, without locking ordinary readiness/status reads.
 old_text:='select * into cfg from ip_ai_settings where id;';
 if strpos(src,old_text)=0 then raise exception 'Expected draft settings read';end if;
 src:=replace(src,old_text,'if p_action in (''generate'',''retry_items'') then select * into cfg from ip_ai_settings where id for update;
 else select * into cfg from ip_ai_settings where id;end if;');
 execute src;
end $policy$;

commit;
