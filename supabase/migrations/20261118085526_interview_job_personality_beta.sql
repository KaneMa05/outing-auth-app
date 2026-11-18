begin;

-- Keep the existing test grant for AI/native/graded routes. Only the
-- authenticated recording archive opts in to beta_status.
create or replace function public.ip_mock_access_service(p_action text,p_actor jsonb,p_body jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare result jsonb; beta_allowed boolean; test_allowed boolean;
begin
 if p_action in ('admin_members','admin_member_save') then
  if coalesce(p_actor->>'type','')<>'admin' or coalesce(p_actor->>'id','')='' then raise exception 'forbidden'; end if;
  if p_action='admin_member_save' and p_body ? 'mockTestEnabled' and jsonb_typeof(p_body->'mockTestEnabled')<>'boolean' then raise exception 'invalid_request'; end if;
  result:=ip_service(p_action,p_actor,p_body);
  if p_action='admin_member_save' and p_body ? 'mockTestEnabled' then
   update ip_members set mock_test_enabled=(p_body->>'mockTestEnabled')::boolean,updated_at=now() where student_id=p_body->>'targetStudentId';
   insert into ip_history(entity,entity_id,actor_id,snapshot,student_id)
    select 'member',student_id,p_actor->>'id',to_jsonb(m),student_id from ip_members m where student_id=p_body->>'targetStudentId';
  elsif p_action='admin_members' then
   select jsonb_set(result,'{members}',coalesce(jsonb_agg(row || jsonb_build_object('mock_test_enabled',coalesce(m.mock_test_enabled,false)) order by ord),'[]')) into result
    from jsonb_array_elements(result->'members') with ordinality as entries(row,ord)
    left join ip_members m on m.student_id=row->>'id';
  end if;
  return result;
 elsif p_action in ('mock_status','beta_status') then
  if coalesce(p_actor->>'type','')<>'student' or coalesce(p_actor->>'id','')='' then raise exception 'forbidden'; end if;
  select exists(select 1 from ip_members m join ip_student_directory s on s.id=m.student_id
   where m.student_id=p_actor->>'id' and m.enabled and m.access_product='interview_package'
    and (m.expires_on is null or m.expires_on>=(now() at time zone 'Asia/Seoul')::date) and s.is_active
    and coalesce(s.account_type,'student')='student' and exists(select 1 from ip_settings where id and enabled)) into beta_allowed;
  test_allowed:=beta_allowed and coalesce((select mock_test_enabled from ip_members where student_id=p_actor->>'id'),false);
  return jsonb_build_object('ok',true,'allowed',case when p_action='beta_status' then beta_allowed else test_allowed end,'betaAllowed',beta_allowed);
 end if;
 raise exception 'unsupported_action';
end $$;
revoke all on function public.ip_mock_access_service(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ip_mock_access_service(text,jsonb,jsonb) to service_role;

-- Authenticate archive writes/reads in SQL as well as HTTP. A caller-provided
-- mode may describe a new sync only; existing uploads use the owned run's mode.
-- Keep AI archive access test-only, even when a beta member forges a mode.
do $migration$
declare source text;
 before text:='and m.enabled and m.mock_test_enabled';
 after text:=$replacement$and m.enabled and m.access_product='interview_package'
    and exists(select 1 from public.ip_settings where id and enabled)
    and (m.mock_test_enabled or (case when p_action='sync' then p_body->>'mode'
      else (select mode from public.ip_practice_runs where id=(p_body->>'runId')::uuid and student_id=v_actor) end) in ('job','personality'))$replacement$;
begin
 select pg_get_functiondef('public.ip_practice_service(text,jsonb,jsonb)'::regprocedure) into source;
 if (length(source)-length(replace(source,before,'')))/length(before)<>1 then
  raise exception 'Unexpected practice archive authorization; review beta migration';
 end if;
 execute replace(source,before,after);
end $migration$;

commit;
