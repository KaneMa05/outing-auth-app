begin;

-- Self-introductions use the life graph. Other draft kinds keep their current checks.
create function public.ip_ai_draft_readiness(p_student text,p_kind text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare profile jsonb;missing jsonb:='[]';experience_count integer;
begin
 if p_kind is distinct from 'self_intro' then return public.ip_ai_readiness(p_student);end if;
 select content into profile from public.ip_life_profiles where student_id=p_student;
 if not coalesce(public.ip_basic_complete(profile),false) then
  missing:=missing||jsonb_build_array('기본 이력: ‘DB 정리 → 기본 이력’에서 내용을 입력하거나 해당 없음을 선택하고 저장해주세요.');
 end if;
 -- Count only complete, distinct experiences; unfinished extra drafts do not block generation.
 select count(distinct rowdata->>'content') into experience_count from (
  select public.ip_life_experience_text(value) rowdata
  from jsonb_array_elements(coalesce(profile->'experiences','[]'))
 ) experiences where not exists(
  select 1 from unnest(array['age','title','content','appeal']) field
  where length(btrim(coalesce(rowdata->>field,'')))=0
 );
 if experience_count<3 then
  missing:=missing||jsonb_build_array('인생그래프: 서로 다른 경험이 '||experience_count||'개 준비되어 있습니다. 각 경험의 나이·키워드·내용·어필할 점을 작성하고 저장해 3개 이상 준비해주세요.');
 end if;
 return jsonb_build_object('dbReady',jsonb_array_length(missing)=0,'missing',missing,
  'experienceCount',experience_count,'readinessVersion','self_intro_life_v1');
end $$;
revoke all on function public.ip_ai_draft_readiness(text,text) from public,anon,authenticated;
grant execute on function public.ip_ai_draft_readiness(text,text) to service_role;

-- Prepare, generate and selected retries must all apply the same server-side rule.
do $migration$
declare src text;old_prepare text;new_prepare text;old_retry text;new_retry text;
begin
 select replace(pg_get_functiondef('public.ip_ai_service(text,jsonb,jsonb)'::regprocedure),chr(13),'') into src;
 old_prepare:=$old$readiness:=ip_ai_readiness(sid);
  result:=result||readiness$old$;
 new_prepare:=$new$readiness:=ip_ai_draft_readiness(sid,kind);
  result:=result||readiness$new$;
 old_retry:=$old$elsif p_action='retry_items' then
  readiness:=ip_ai_readiness(sid);
  if not (readiness->>'dbReady')::boolean then return readiness||jsonb_build_object('ok',true,'ready',false,'enabled',cfg.enabled,'state','NEEDS_INPUT');end if;
  if not cfg.enabled then raise exception 'automation_disabled'; end if;
  select * into req from ip_ai_requests where id=(p_body->>'requestId')::uuid and student_id=sid;
  if not found then raise exception 'not_found'; end if;$old$;
 new_retry:=$new$elsif p_action='retry_items' then
  select * into req from ip_ai_requests where id=(p_body->>'requestId')::uuid and student_id=sid;
  if not found then raise exception 'not_found'; end if;
  readiness:=ip_ai_draft_readiness(sid,req.kind);
  if not (readiness->>'dbReady')::boolean then return readiness||jsonb_build_object('ok',true,'ready',false,'enabled',cfg.enabled,'state','NEEDS_INPUT');end if;
  if not cfg.enabled then raise exception 'automation_disabled'; end if;$new$;
 old_prepare:=replace(old_prepare,chr(13),'');new_prepare:=replace(new_prepare,chr(13),'');
 old_retry:=replace(old_retry,chr(13),'');new_retry:=replace(new_retry,chr(13),'');
 if strpos(src,old_prepare)=0 or strpos(src,old_retry)=0 then
  raise exception 'Expected current draft preparation and retry checks';
 end if;
 execute replace(replace(src,old_prepare,new_prepare),old_retry,new_retry);
end $migration$;

commit;
