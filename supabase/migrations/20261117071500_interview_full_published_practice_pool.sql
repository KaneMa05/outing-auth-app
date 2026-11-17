-- Expand the pilot to existing published content. Preserve enrollment and track checks.
begin;
set local lock_timeout='5s';
create or replace function public.ip_mock_test_question_allowed(p_mode text,p_id text,p_prompt text,p_actor jsonb) returns boolean
language sql stable security invoker set search_path='' as $$
 select coalesce(p_actor->'testApp','false'::jsonb)<>'true'::jsonb or exists(
  select 1 from public.ip_questions q where q.id=p_id and q.prompt=p_prompt and q.status='published'
   and p_mode in ('job','personality','ai') and q.category=case when p_mode='job' then 'job' else 'personality' end
 );
$$;
revoke all on function public.ip_mock_test_question_allowed(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.ip_mock_test_question_allowed(text,text,text,jsonb) to service_role;
-- Keep main/follow-up counts; randomize across the full eligible pool.
do $patch$
declare definition text; before text := $old$order by case when coalesce(p_actor->'testApp','false'::jsonb)='true'::jsonb then (select t.position from public.ip_mock_test_question_scope t where t.mode='ai' and t.question_id=ip_questions.id) else random() end$old$;
begin
 definition:=pg_get_functiondef('public.ip_live_service(text,jsonb,jsonb)'::regprocedure);
 if position(before in definition)>0 then
  if (length(definition)-length(replace(definition,before,'')))/length(before)<>1 then raise exception 'unexpected_live_question_order';end if;
  execute replace(definition,before,'order by random()');
 elsif position('public.ip_mock_test_question_scope' in definition)>0 or position('order by random() limit' in definition)=0 then
  raise exception 'unexpected_live_question_selection';
 end if;
end $patch$;
commit;
