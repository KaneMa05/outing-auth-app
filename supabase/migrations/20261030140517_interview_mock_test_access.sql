-- Pilot access is separate from enrollment. No existing account is opted in.
alter table public.ip_members add column mock_test_enabled boolean not null default false;

create function public.ip_mock_access_service(p_action text,p_actor jsonb,p_body jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = public,pg_temp as $$
declare result jsonb; allowed boolean;
begin
 if p_action in ('admin_members','admin_member_save') then
  if coalesce(p_actor->>'type','') <> 'admin' or coalesce(p_actor->>'id','')='' then raise exception 'forbidden'; end if;
  if p_action='admin_member_save' and p_body ? 'mockTestEnabled' and jsonb_typeof(p_body->'mockTestEnabled') <> 'boolean' then raise exception 'invalid_request'; end if;
  result := ip_service(p_action,p_actor,p_body);
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
 elsif p_action='mock_status' then
  if coalesce(p_actor->>'type','') <> 'student' or coalesce(p_actor->>'id','')='' then raise exception 'forbidden'; end if;
  select exists(select 1 from ip_members m join students s on s.id=m.student_id
   where m.student_id=p_actor->>'id' and m.mock_test_enabled and m.enabled
    and (m.expires_on is null or m.expires_on>=current_date) and s.is_active
    and coalesce(s.account_type,'student')='student' and exists(select 1 from ip_settings where id and enabled)) into allowed;
  return jsonb_build_object('ok',true,'allowed',allowed);
 end if;
 raise exception 'unsupported_action';
end $$;
revoke all on function public.ip_mock_access_service(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ip_mock_access_service(text,jsonb,jsonb) to service_role;
