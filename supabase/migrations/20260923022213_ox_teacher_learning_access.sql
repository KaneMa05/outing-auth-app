-- Teachers use the existing learner/device channel. Their database account type
-- supplies learning access only; administrator actions and student sales stay unchanged.
-- Guard the reviewed live definitions before making narrowly scoped replacements.
do $guard$
declare v record;
begin
  for v in select * from (values
    ('public.ox_service(text,jsonb,jsonb)','47c5941e34f674c4b55dcf7f023f620f'),
    ('public.ox_learning_data(text,jsonb,jsonb)','8d85a2e04beb2caf6e9cd24931a47e66'),
    ('public.ox_device_gateway(text,jsonb,jsonb)','cca0cf83e8d289baa46865978a92ae99'),
    ('public.ox_has_book(text,text)','47691cd6d6d5371060d3d8d9d044985e')
  ) t(signature,source_hash) loop
    if (select md5(replace(prosrc,E'\r\n',E'\n')) from pg_proc where oid=v.signature::regprocedure)
      is distinct from v.source_hash then
      raise exception 'ox_function_changed_since_review: %',v.signature;
    end if;
  end loop;
end $guard$;

create function public.ox_is_teacher(p_student text)
returns boolean language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.students where id=p_student and is_active and account_type='teacher')
$$;
revoke all on function public.ox_is_teacher(text) from public,anon,authenticated;
grant execute on function public.ox_is_teacher(text) to service_role;

create or replace function public.ox_has_book(p_student text,p_collection text)
returns boolean language sql stable security invoker set search_path='' as $$
  select (public.ox_is_teacher(p_student) and exists(select 1 from public.ox_collections where id=p_collection))
    or public.ox_has_purchased_book(p_student,p_collection) or public.ox_has_grant(p_student,p_collection)
$$;
revoke all on function public.ox_has_book(text,text) from public,anon,authenticated;
grant execute on function public.ox_has_book(text,text) to service_role;

do $patch$
declare v_signature text; v_definition text;
begin
  foreach v_signature in array array[
    'public.ox_service(text,jsonb,jsonb)',
    'public.ox_learning_data(text,jsonb,jsonb)',
    'public.ox_device_gateway(text,jsonb,jsonb)'
  ] loop
    v_definition:=pg_get_functiondef(v_signature::regprocedure);
    -- Match only learner authentication, never administrator roster or sales rules.
    v_definition:=replace(v_definition,
      $old$id=v_student and is_active and account_type='student'$old$,
      $new$id=v_student and is_active and account_type in ('student','teacher')$new$);
    v_definition:=replace(v_definition,
      $old$and s.is_active and s.account_type='student';$old$,
      $new$and s.is_active and s.account_type in ('student','teacher');$new$);
    v_definition:=replace(v_definition,
      $old$exists(select 1 from public.ox_members where student_id=v_student and allowed)$old$,
      $new$(public.ox_is_teacher(v_student) or exists(select 1 from public.ox_members where student_id=v_student and allowed))$new$);
    -- Teacher practice is private progress and must not affect student statistics.
    v_definition:=replace(v_definition,
      $old$where a.is_first and$old$,
      $new$where a.is_first and exists(select 1 from public.students stats_student where stats_student.id=a.student_id and stats_student.account_type='student') and$new$);
    v_definition:=replace(v_definition,
      $old$and content_version=v_question.content_version and is_first;$old$,
      $new$and content_version=v_question.content_version and is_first and exists(select 1 from public.students stats_student where stats_student.id=public.ox_attempts.student_id and stats_student.account_type='student');$new$);
    execute v_definition;
  end loop;
end $patch$;
