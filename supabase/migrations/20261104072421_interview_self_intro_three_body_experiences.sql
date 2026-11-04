begin;

-- Require three grounded experiences in the introduction body at the DB boundary.
-- Keep the existing evidence checks, grants and other answer kinds.
do $policy$
declare src text;old_text text;
begin
 select pg_get_functiondef('public.ip_ai_validate_result(jsonb,jsonb,text)'::regprocedure) into src;
 old_text:='select count(distinct value->>''experience_id'') into n from jsonb_array_elements(p_result->''experience_coverage'');';
 if strpos(src,old_text)=0 or strpos(src,'if n<1 then')=0 then
  raise exception 'Expected introduction coverage check';
 end if;
 src:=replace(src,old_text,'select least(count(distinct value->>''experience_id''),count(distinct value->>''answer_excerpt'')) into n from jsonb_array_elements(p_result->''experience_coverage'');');
 execute replace(src,'if n<1 then','if n<3 then');

 select pg_get_functiondef('public.ip_ai_service(text,jsonb,jsonb)'::regprocedure) into src;
 old_text:='저장된 경험에서 핵심 강점을 보여주는 경험 1~2개를 골라 해양경찰 업무와 연결한 자기소개를 작성해주세요.';
 if strpos(src,old_text)=0 then raise exception 'Expected introduction prompt';end if;
 execute replace(src,old_text,'저장된 서로 다른 실제 경험을 최소 3개 포함해 본인을 소개하는 자기소개를 작성해주세요. 각 경험의 맥락·본인 행동·결과를 본문에 담고, 확인되는 강점을 해양경찰 업무에서의 활용 방향과 연결해주세요.');
end $policy$;

commit;
