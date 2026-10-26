begin;
-- Add aggregate counts to the existing authorized, paginated read. Filters
-- affect the list only; no additional client requests or student rows are sent.
do $migration$
declare
  source text;
  original text := $old$return jsonb_build_object('ok',true,'applications',v_result);$old$;
  replacement text := $new$return jsonb_build_object('ok',true,'applications',v_result,
    'summary',jsonb_build_object(
      'students',(select count(*) from public.ip_members m
        join public.ip_student_directory s on s.id=m.student_id
        where s.is_active and coalesce(s.account_type,'student')='student'
          and m.enabled and (m.expires_on is null or m.expires_on>=current_date)),
      'pending',(select count(*) from public.ip_applications where status='pending'),
      'approved',(select count(*) from public.ip_applications where status='approved'),
      'rejected',(select count(*) from public.ip_applications where status='rejected')));$new$;
begin
  select pg_get_functiondef('public.ip_portal_service(text,jsonb,jsonb)'::regprocedure) into source;
  if strpos(source,original)=0 then
    raise exception 'Unexpected ip_portal_service definition: application summary not applied';
  end if;
  execute replace(source,original,replacement);
end;
$migration$;
commit;
