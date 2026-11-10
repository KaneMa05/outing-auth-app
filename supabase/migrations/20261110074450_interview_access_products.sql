begin;
set local lock_timeout='1s';
set local statement_timeout='15s';

-- Existing students and pending applications keep their current package access.
-- A student's application is a request; only administrator approval grants access.
alter table public.ip_members add column access_product text not null default 'interview_package'
  check (access_product in ('interview_package','aptitude_only'));
alter table public.ip_applications add column access_product text not null default 'interview_package'
  check (access_product in ('interview_package','aptitude_only'));

-- Preserve the current service definitions (including Apple login and taxonomy)
-- and fail atomically if any expected authorization/application branch changed.
do $migration$
declare patch record; source text;
begin
 for patch in select * from (values
  ('public.ip_service(text,jsonb,jsonb)',
   $old$return jsonb_build_object('ok',true,'enabled',coalesce(v_enabled and v_member.enabled and
        (v_member.expires_on is null or v_member.expires_on>=current_date),false));$old$,
   $new$return jsonb_build_object('ok',true,
        'accessProduct',coalesce(v_member.access_product,'interview_package'),
        'appEnabled',coalesce(v_enabled and v_member.enabled and
          (v_member.expires_on is null or v_member.expires_on>=current_date),false),
        'enabled',coalesce(v_enabled and v_member.enabled and v_member.access_product='interview_package' and
          (v_member.expires_on is null or v_member.expires_on>=current_date),false));$new$),
  ('public.ip_service(text,jsonb,jsonb)',
   $old$if not coalesce(v_enabled and v_member.enabled and$old$,
   $new$if not coalesce(v_enabled and v_member.enabled and v_member.access_product='interview_package' and$new$),
  ('public.ip_service(text,jsonb,jsonb)',
   $old$elsif p_action='admin_member_save' then$old$,
   $new$elsif p_action='admin_member_save' then
    if p_body ? 'accessProduct' and (jsonb_typeof(p_body->'accessProduct') is distinct from 'string'
      or p_body->>'accessProduct' not in ('interview_package','aptitude_only')) then raise exception 'invalid_request'; end if;$new$),
  ('public.ip_service(text,jsonb,jsonb)',
   $old$insert into ip_members(student_id,track,exam_number,enabled,expires_on)
      values(v_target,p_body->>'track',btrim(p_body->>'examNumber'),(p_body->>'enabled')::boolean,nullif(p_body->>'expiresOn','')::date)$old$,
   $new$insert into ip_members(student_id,track,exam_number,enabled,expires_on,access_product)
      values(v_target,p_body->>'track',btrim(p_body->>'examNumber'),(p_body->>'enabled')::boolean,nullif(p_body->>'expiresOn','')::date,
        coalesce(p_body->>'accessProduct',(select access_product from ip_members where student_id=v_target),'interview_package'))$new$),
  ('public.ip_service(text,jsonb,jsonb)',
   $old$enabled=excluded.enabled,expires_on=excluded.expires_on,updated_at=now();$old$,
   $new$enabled=excluded.enabled,expires_on=excluded.expires_on,
      access_product=case when p_body ? 'accessProduct' then excluded.access_product else ip_members.access_product end,updated_at=now();$new$),
  ('public.ip_service(text,jsonb,jsonb)',
   $old$select s.id,s.name,m.track,m.exam_number,m.enabled,m.expires_on,$old$,
   $new$select s.id,s.name,m.track,m.exam_number,m.enabled,m.expires_on,m.access_product,$new$),
  ('public.ip_mock_access_service(text,jsonb,jsonb)',
   $old$and m.mock_test_enabled and m.enabled$old$,
   $new$and m.mock_test_enabled and m.enabled and m.access_product='interview_package'$new$),
  ('public.ip_portal_service(text,jsonb,jsonb)',
   $old$if p_action='apply' then$old$,
   $new$if p_action='apply' then
  if p_body ? 'accessProduct' and (jsonb_typeof(p_body->'accessProduct') is distinct from 'string'
    or p_body->>'accessProduct' not in ('interview_package','aptitude_only')) then raise exception 'invalid_request'; end if;$new$),
  ('public.ip_portal_service(text,jsonb,jsonb)',
   $old$insert into ip_applications(owner_id,name,track,exam_number) values(v_owner,btrim(p_body->>'name'),p_body->>'track',btrim(p_body->>'examNumber'))$old$,
   $new$insert into ip_applications(owner_id,name,track,exam_number,access_product)
   values(v_owner,btrim(p_body->>'name'),p_body->>'track',btrim(p_body->>'examNumber'),coalesce(p_body->>'accessProduct',v_app.access_product,'interview_package'))$new$),
  ('public.ip_portal_service(text,jsonb,jsonb)',
   $old$set name=excluded.name,track=excluded.track,exam_number=excluded.exam_number,$old$,
   $new$set name=excluded.name,track=excluded.track,exam_number=excluded.exam_number,access_product=excluded.access_product,$new$),
  ('public.ip_portal_service(text,jsonb,jsonb)',
   $old$'track',v_app.track,'examNumber',v_app.exam_number,'enabled',true,'expiresOn',p_body->>'expiresOn'));$old$,
   $new$'track',v_app.track,'examNumber',v_app.exam_number,'enabled',true,'expiresOn',p_body->>'expiresOn','accessProduct',v_app.access_product));$new$),
  ('public.ip_portal_service(text,jsonb,jsonb)',
   $old$(ip_service('status',jsonb_build_object('type','student','id',v_owner),'{}')->>'enabled')::boolean$old$,
   $new$(ip_service('status',jsonb_build_object('type','student','id',v_owner),'{}')->>'appEnabled')::boolean$new$)
 ) as changes(signature,original,replacement)
 loop
  source:=replace(pg_get_functiondef(patch.signature::regprocedure),E'\r\n',E'\n');
  if (length(source)-length(replace(source,patch.original,'')))/length(patch.original)<>1 then
   raise exception 'Unexpected % definition near %: review access-product migration',patch.signature,left(patch.original,90);
  end if;
  execute replace(source,patch.original,patch.replacement);
 end loop;
end;
$migration$;

-- The aptitude service already allows active members independently of interview
-- preparation. Its enrollment, expiry, answer-key and file controls stay intact.
-- Existing RLS, invoker execution and service-role-only RPC ACLs are preserved.
commit;
