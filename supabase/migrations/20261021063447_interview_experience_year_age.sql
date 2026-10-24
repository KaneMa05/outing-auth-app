begin;
-- Preserve legacy period text; new clients store year/age as separate strings.
-- Existing records are never assigned an inferred age or year.
create or replace function public.ip_life_service(p_action text,p_actor jsonb,p_body jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  v_admin boolean:=coalesce(p_actor->>'type','')='admin';
  v_id text:=p_actor->>'id';
  v_target text;
  v_profile ip_life_profiles;
  v_content jsonb:=p_body->'content';
  v_section text;
  v_row jsonb;
  v_key text;
  v_keys text[];
  v_ids text[]:='{}';
  v_count integer:=0;
  v_status text:=p_body->>'status';
  v_revision integer:=coalesce((p_body->>'revision')::integer,0);
begin
  if coalesce(v_id,'')='' then raise exception 'unauthorized'; end if;
  if p_action in ('admin_life_get','admin_life_feedback') then
    if not v_admin then raise exception 'forbidden'; end if;
    v_target:=p_body->>'targetStudentId';
  elsif p_action in ('life_get','life_save') then
    if v_admin or p_actor->>'type' is distinct from 'student' then raise exception 'forbidden'; end if;
    if not coalesce((ip_service('status',p_actor,'{}')->>'enabled')::boolean,false) then raise exception 'not_enrolled'; end if;
    v_target:=v_id;
  else raise exception 'unsupported_action';
  end if;
  -- Serialize first inserts and edits, including enrollment changes, on the owner.
  perform 1 from ip_members where student_id=v_target for update;
  if not found then raise exception 'student_unavailable'; end if;
  if not v_admin and not coalesce((ip_service('status',p_actor,'{}')->>'enabled')::boolean,false) then raise exception 'not_enrolled'; end if;
  select * into v_profile from ip_life_profiles where student_id=v_target for update;
  if p_action in ('life_get','admin_life_get') then
    return jsonb_build_object('ok',true,'profile',case when v_profile.student_id is null then null else to_jsonb(v_profile) end,
      'member',(select jsonb_build_object('student_id',m.student_id,'track',m.track,'exam_number',m.exam_number,'name',s.name)
        from ip_members m join ip_student_directory s on s.id=m.student_id where m.student_id=v_target),
      'competencies',(select coalesce(jsonb_agg(to_jsonb(c) order by c.position),'[]') from ip_life_competencies c),
      'elements',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'topic_id',e.topic_id)),'[]') from ip_elements e));
  end if;
  if v_revision<>coalesce(v_profile.revision,0) then raise exception 'revision_conflict'; end if;
  if p_action='admin_life_feedback' then
    if v_profile.student_id is null or v_profile.status='draft' then raise exception 'not_submitted'; end if;
    if v_status is null or v_status not in ('needs_revision','approved') or jsonb_typeof(p_body->'feedback') is distinct from 'string'
      or length(btrim(p_body->>'feedback')) not between 1 and 8000 then raise exception 'invalid_request'; end if;
    update ip_life_profiles set feedback=p_body->>'feedback',status=v_status,revision=revision+1,updated_at=now()
      where student_id=v_target returning * into v_profile;
  else
    if v_status is null or v_status not in ('draft','submitted') or jsonb_typeof(v_content) is distinct from 'object'
      or octet_length(v_content::text)>160000 then raise exception 'invalid_request'; end if;
    if exists(select 1 from jsonb_object_keys(v_content) k where k not in ('background','qualifications','affiliations','awards','experiences','none'))
      or jsonb_typeof(v_content->'background') is distinct from 'string' or length(v_content->>'background')>2000
      or jsonb_typeof(v_content->'none') is distinct from 'array' then raise exception 'invalid_request'; end if;
    if jsonb_array_length(v_content->'none')>3 or exists(select 1 from jsonb_array_elements(v_content->'none') n
      where jsonb_typeof(n)<>'string' or n#>>'{}' not in ('qualifications','affiliations','awards'))
      then raise exception 'invalid_request'; end if;
    foreach v_section in array array['qualifications','affiliations','awards','experiences'] loop
      if jsonb_typeof(v_content->v_section) is distinct from 'array' then raise exception 'invalid_request'; end if;
      v_count:=v_count+jsonb_array_length(v_content->v_section);
      if v_count>80 or jsonb_array_length(v_content->v_section)>40 then raise exception 'invalid_request'; end if;
      if (v_content->'none') ? v_section and jsonb_array_length(v_content->v_section)>0 then raise exception 'invalid_request'; end if;
      v_keys:=case v_section
        when 'qualifications' then array['id','type','date','name','issuer','effort']
        when 'affiliations' then array['id','type','name','period','role','activities']
        when 'awards' then array['id','date','name','issuer','rank','contribution','action']
        else array['id','year','age','period','affiliation','title','situation','action','result','learning','competencyIds'] end;
      for v_row in select value from jsonb_array_elements(v_content->v_section) loop
        if jsonb_typeof(v_row) is distinct from 'object' then raise exception 'invalid_request'; end if;
        if exists(select 1 from jsonb_object_keys(v_row) k where not k=any(v_keys)) then raise exception 'invalid_request'; end if;
        foreach v_key in array v_keys loop
          if v_key='competencyIds' or (v_section='experiences' and v_key in ('year','age') and not v_row ? v_key) then continue; end if;
          if jsonb_typeof(v_row->v_key) is distinct from 'string' or length(v_row->>v_key)>2000 then raise exception 'invalid_request'; end if;
        end loop;
        if (v_row->>'id') !~ '^[a-zA-Z0-9_-]{1,80}$' or (v_row->>'id')=any(v_ids) then raise exception 'invalid_request'; end if;
        v_ids:=array_append(v_ids,v_row->>'id');
        if v_section='awards' and v_row->>'contribution'<>'' then
          if (v_row->>'contribution') !~ '^[0-9]{1,3}$' then raise exception 'invalid_request'; end if;
          if (v_row->>'contribution')::int>100 then raise exception 'invalid_request'; end if;
        end if;
        if v_section='experiences' then
          if coalesce(v_row->>'year','')<>'' then
            if (v_row->>'year') !~ '^[0-9]{4}$' then raise exception 'invalid_experience_date'; end if;
            if (v_row->>'year')::int not between 1900 and extract(year from current_date)::int then raise exception 'invalid_experience_date'; end if;
          end if;
          if coalesce(v_row->>'age','')<>'' then
            if (v_row->>'age') !~ '^[0-9]{1,3}$' then raise exception 'invalid_experience_date'; end if;
            if (v_row->>'age')::int not between 0 and 120 then raise exception 'invalid_experience_date'; end if;
          end if;
          if v_status='submitted' and
            (coalesce(v_row->>'year','')='' or coalesce(v_row->>'age','')='') then raise exception 'incomplete_experience_date'; end if;
          if jsonb_typeof(v_row->'competencyIds') is distinct from 'array' then raise exception 'invalid_request'; end if;
          if jsonb_array_length(v_row->'competencyIds')>30 or exists(
            select 1 from jsonb_array_elements(v_row->'competencyIds') n
            where jsonb_typeof(n)<>'string' or not exists(select 1 from ip_life_competencies c where c.id=n#>>'{}'))
            then raise exception 'invalid_request'; end if;
        end if;
        if v_status='submitted' then
          if v_section='experiences' then
            foreach v_key in array array['title','situation','action','result','learning'] loop
              if length(btrim(v_row->>v_key))=0 then raise exception 'incomplete_life'; end if;
            end loop;
          elsif length(btrim(v_row->>'name'))=0 then raise exception 'incomplete_life'; end if;
        end if;
      end loop;
      if v_status='submitted' and jsonb_array_length(v_content->v_section)=0 and not (v_content->'none') ? v_section
        then raise exception 'incomplete_life'; end if;
    end loop;
    if v_status='submitted' and length(btrim(v_content->>'background'))=0 then raise exception 'incomplete_life'; end if;
    insert into ip_life_profiles(student_id,content,status) values(v_target,v_content,v_status)
      on conflict(student_id) do update set content=excluded.content,status=excluded.status,
      revision=ip_life_profiles.revision+1,updated_at=now() returning * into v_profile;
  end if;
  insert into ip_history(entity,entity_id,actor_id,snapshot,student_id)
    values('life_profile',v_target,v_id,to_jsonb(v_profile),v_target);
  return jsonb_build_object('ok',true,'profile',to_jsonb(v_profile));
end;
$$;
revoke all on function public.ip_life_service(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ip_life_service(text,jsonb,jsonb) to service_role;

do $migration$ begin
 if to_regprocedure('public.ip_ai_readiness(text)') is not null then
 execute $definition$
create or replace function public.ip_ai_readiness(p_student text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
 content jsonb;missing jsonb:='[]';section text;label text;fields text[];field text;
 rowdata jsonb;idx integer;t ip_topics;n ip_notes;track text;topic_count integer:=0;
begin
 select m.track into track from ip_members m where m.student_id=p_student;
 select p.content into content from ip_life_profiles p where p.student_id=p_student;
 if length(btrim(coalesce(content->>'background','')))=0 then
  missing:=missing||jsonb_build_array('기본 정보: 주요 이력·전공을 입력하고 저장해주세요.');
 end if;
 foreach section in array array['qualifications','affiliations','awards','experiences'] loop
  label:=case section when 'qualifications' then '자격·어학' when 'affiliations' then '소속 이력'
   when 'awards' then '수상·성과' else '경험·인생그래프' end;
  if section<>'experiences' and coalesce(content->'none','[]') ? section then continue;end if;
  if jsonb_array_length(coalesce(content->section,'[]'))=0 then
   missing:=missing||jsonb_build_array(label||case when section='experiences' then ': 실제 경험을 1개 이상 입력해주세요.' else ': 이력을 입력하거나 해당 없음을 선택하고 저장해주세요.' end);
  end if;
  fields:=case section
   when 'qualifications' then array['type','date','name','issuer','effort']
   when 'affiliations' then array['type','name','period','role','activities']
   when 'awards' then array['date','name','issuer','rank','action']
   else array['year','age','title','situation','action','result','learning'] end;
  idx:=0;
  for rowdata in select value from jsonb_array_elements(coalesce(content->section,'[]')) loop
   idx:=idx+1;
   foreach field in array fields loop
    if length(btrim(coalesce(rowdata->>field,'')))=0 then
     missing:=missing||jsonb_build_array(label||' '||idx||'번: '||case field
      when 'type' then '구분' when 'date' then '시기' when 'name' then '이름·명칭' when 'year' then '연도' when 'age' then '당시 나이'
      when 'issuer' then '발급·수여 기관' when 'effort' then '취득 노력' when 'period' then '기간·시기'
      when 'role' then '직책·역할' when 'activities' then '담당 업무·활동' when 'rank' then '수상 등급'
      when 'title' then '경험 제목' when 'situation' then '상황·문제' when 'action' then '본인의 행동'
      when 'result' then '실제 결과' when 'learning' then '배운 점' end||'을 입력해주세요.');
    end if;
   end loop;
  end loop;
 end loop;
 for t in select * from ip_topics where active and (cardinality(tracks)=0 or track=any(tracks)) order by sort_order,id loop
  topic_count:=topic_count+1;
  select * into n from ip_notes where student_id=p_student and topic_id=t.id;
  fields:=case t.kind when 'experience' then array['situation','role','action','result','learning']
   when 'value' then array['position','reason','application'] else array['criteria','steps','caution'] end;
  if n.student_id is null or n.topic_revision<>t.revision then
   missing:=missing||jsonb_build_array(t.title||': 현재 양식의 모든 질문에 답변하고 저장해주세요.');
  else
   foreach field in array fields loop
    if length(btrim(coalesce(n.fields->>field,'')))<10 then
     missing:=missing||jsonb_build_array(t.title||': '||case field
      when 'situation' then '상황' when 'role' then '목표·역할' when 'action' then '본인의 행동'
      when 'result' then '결과' when 'learning' then '배운 점' when 'position' then '본인의 생각·지원 계기'
      when 'reason' then '이유·근거' when 'application' then '준비 노력·실천 방법'
      when 'criteria' then '판단 기준' when 'steps' then '행동 순서' when 'caution' then '주의점' end||'을 10자 이상 입력해주세요.');
    end if;
   end loop;
  end if;
 end loop;
 if topic_count=0 then missing:=missing||jsonb_build_array('인성 경험·가치관 작성 항목이 설정되지 않았습니다. 관리자에게 확인해주세요.');end if;
 return jsonb_build_object('dbReady',jsonb_array_length(missing)=0,'missing',missing);
end $$;
revoke all on function public.ip_ai_readiness(text) from public,anon,authenticated;
grant execute on function public.ip_ai_readiness(text) to service_role;

$definition$;
 end if;
end $migration$;
do $migration$ begin
 if to_regprocedure('public.ip_ai_sources(text,text)') is not null then
 execute $definition$
create or replace function public.ip_ai_sources(p_student text,p_kind text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare profile jsonb; notes jsonb; section text; rowdata jsonb; kv record; outdata jsonb:='[]';
 fields text[]; chosen_topic text;
begin
 select content into profile from ip_life_profiles where student_id=p_student;
 if length(btrim(coalesce(profile->>'background','')))>0 then
  outdata:=outdata||jsonb_build_array(jsonb_build_object('id','life:background','text',profile->>'background','experience_id',null));
 end if;
 foreach section in array array['experiences','qualifications','affiliations','awards'] loop
  fields:=case section
   when 'experiences' then array['year','age','period','title','situation','action','result','learning']
   when 'qualifications' then array['type','date','name','effort']
   when 'affiliations' then array['type','period','role','activities']
   else array['date','name','rank','contribution','action'] end;
  for rowdata in select value from jsonb_array_elements(coalesce(profile->section,'[]')) loop
   for kv in select key,value from jsonb_each_text(rowdata) where key=any(fields) loop
    if length(btrim(coalesce(kv.value,'')))>0 then
     outdata:=outdata||jsonb_build_array(jsonb_build_object(
      'id','life:'||section||':'||(rowdata->>'id')||':'||kv.key,'text',kv.value,
      'experience_id',case when section='experiences' then rowdata->>'id' else null end));
    end if;
   end loop;
  end loop;
 end loop;
 chosen_topic:=case p_kind when 'self_intro' then 'self' when 'motivation' then 'motivation' when 'public_service' then 'public' else null end;
 for rowdata in select jsonb_build_object('id',n.topic_id,'fields',n.fields) from ip_notes n
   join ip_topics t on t.id=n.topic_id
   where n.student_id=p_student and t.active and (p_kind='core30' or n.topic_id=chosen_topic) loop
  for kv in select key,value from jsonb_each_text(rowdata->'fields')
   where key in ('situation','role','action','result','learning','position','reason','application','criteria','steps','caution') loop
   if length(btrim(coalesce(kv.value,'')))>0 then
    outdata:=outdata||jsonb_build_array(jsonb_build_object('id','note:'||(rowdata->>'id')||':'||kv.key,'text',kv.value,'experience_id',null));
   end if;
  end loop;
 end loop;
 select coalesce(jsonb_agg(value order by value->>'id'),'[]') into outdata from jsonb_array_elements(outdata);
 return outdata;
end $$;
revoke all on function public.ip_ai_sources(text,text) from public,anon,authenticated;
grant execute on function public.ip_ai_sources(text,text) to service_role;

$definition$;
 end if;
end $migration$;
commit;
