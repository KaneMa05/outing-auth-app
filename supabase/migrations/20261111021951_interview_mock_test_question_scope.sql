-- Test phase only: preserve all source questions and historical attempts.
begin;
set local lock_timeout='5s';
create table public.ip_mock_test_question_scope (
 mode text not null check(mode in ('job','personality','ai')),
 question_id text not null references public.ip_questions(id),
 prompt text not null, position integer not null check(position between 1 and 3),
 primary key(mode,question_id), unique(mode,position)
);
alter table public.ip_mock_test_question_scope enable row level security;
revoke all on public.ip_mock_test_question_scope from public,anon,authenticated;
grant select on public.ip_mock_test_question_scope to service_role;
insert into public.ip_mock_test_question_scope(mode,question_id,prompt,position) values
 ('job','q-1b0b4b1339e0cba9b893bc93','V-pass',1),
 ('job','q-d3a575d9f82bb682bd7014d8','선위통보제도',2),
 ('job','q-b77be4bbd97dd0b89bb1d7d4','깨진 유리창 이론에 대해서 아는가?',3),
 ('personality','q-1a757da6894404dd4e00aaaa','학창시절 동아리 활동은?',1),
 ('ai','q-1a757da6894404dd4e00aaaa','학창시절 동아리 활동은?',1),
 ('personality','q-220afd909dd6efe1c389fae1','실패했던 경험이 있나요?  / 실패를 통해 무얼 배웠나요?',2),
 ('ai','q-220afd909dd6efe1c389fae1','실패했던 경험이 있나요?  / 실패를 통해 무얼 배웠나요?',2),
 ('personality','q-6b5c347c76f4ac625b16a37d','행사를 해야 하는데 예산과 인력이 부족하다면 어떻게 할 것인가?',3),
 ('ai','q-6b5c347c76f4ac625b16a37d','행사를 해야 하는데 예산과 인력이 부족하다면 어떻게 할 것인가?',3);
do $$ begin
 if exists(select 1 from public.ip_mock_test_question_scope t join public.ip_questions q on q.id=t.question_id
  where q.prompt<>t.prompt or q.status<>'published' or q.category<>case when t.mode='job' then 'job' else 'personality' end) then
  raise exception 'test_question_source_changed';
 end if;
end $$;
create function public.ip_mock_test_question_allowed(p_mode text,p_id text,p_prompt text,p_actor jsonb) returns boolean
language sql stable security invoker set search_path='' as $$
 select coalesce(p_actor->'testApp','false'::jsonb)<>'true'::jsonb or exists(select 1 from public.ip_mock_test_question_scope where mode=p_mode and question_id=p_id and prompt=p_prompt);
$$;
revoke all on function public.ip_mock_test_question_allowed(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.ip_mock_test_question_allowed(text,text,text,jsonb) to service_role;

-- Change only creation/list selection. Existing saved attempts and report sources remain readable.
do $patch$
declare signature text; definition text; mode text; old_text text; new_text text;
begin
 foreach signature in array array['ip_live_service','ip_openai_practice_service','ip_practice_cli_service','ip_job_exam_service','ip_personality_service'] loop
  definition:=pg_get_functiondef(('public.'||signature||'(text,jsonb,jsonb)')::regprocedure);
  if signature='ip_live_service' then
   old_text:='from public.ip_questions where';
   new_text:='from public.ip_questions where public.ip_mock_test_question_allowed(''ai'',id,prompt,p_actor) and';
   if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>2 or position('order by random() limit 3' in definition)=0 then raise exception 'unexpected_live_question_selection';end if;
   definition:=replace(definition,old_text,new_text);
   definition:=replace(definition,'order by random() limit 3','order by case when coalesce(p_actor->''testApp'',''false''::jsonb)=''true''::jsonb then (select t.position from public.ip_mock_test_question_scope t where t.mode=''ai'' and t.question_id=ip_questions.id) else random() end limit 3');
  elsif signature in ('ip_openai_practice_service','ip_practice_cli_service') then
   old_text:='from public.ip_questions where id=p_body->>''questionId''';
   new_text:='from public.ip_questions where public.ip_mock_test_question_allowed(k,id,prompt,p_actor) and id=p_body->>''questionId''';
   if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then raise exception 'unexpected_practice_question_selection';end if;
   definition:=replace(definition,old_text,new_text);
  else
   mode:=case when signature='ip_job_exam_service' then 'job' else 'personality' end;
   old_text:='from public.ip_questions qb';
   new_text:='from (select * from public.ip_questions where public.ip_mock_test_question_allowed('||quote_literal(mode)||',id,prompt,p_actor)) qb';
   if position(old_text in definition)=0 or position('from public.ip_questions where id=p_body->>''questionId''' in definition)=0 then raise exception 'unexpected_exam_question_selection';end if;
   definition:=replace(definition,old_text,new_text);
   definition:=replace(definition,'from public.ip_questions where id=p_body->>''questionId''','from public.ip_questions where public.ip_mock_test_question_allowed('||quote_literal(mode)||',id,prompt,p_actor) and id=p_body->>''questionId''');
  end if;
  execute definition;
 end loop;
end $patch$;
commit;
