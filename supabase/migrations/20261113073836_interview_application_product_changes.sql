begin;
set local lock_timeout='1s';
set local statement_timeout='15s';

-- Extend the existing invoker/service-role-only RPC without replacing unrelated
-- login, approval, summary or product-access behavior.
do $migration$
declare source text; original text; replacement text;
begin
 source:=replace(pg_get_functiondef('public.ip_portal_service(text,jsonb,jsonb)'::regprocedure),E'\r\n',E'\n');
 original:=$old$select a.*,o.legacy_student_id from ip_applications a join ip_owners o on o.id=a.owner_id$old$;
 replacement:=$new$select a.*,o.legacy_student_id,
    case when a.status='approved' then coalesce((select m.access_product from ip_members m where m.student_id=a.owner_id),a.access_product)
      else a.access_product end as current_access_product
   from ip_applications a join ip_owners o on o.id=a.owner_id$new$;
 if (length(source)-length(replace(source,original,'')))/length(original)<>1 then
  raise exception 'Unexpected application list definition: review product-change migration';
 end if;
 source:=replace(source,original,replacement);
 original:=$old$elsif p_action='admin_application_decide' then$old$;
 replacement:=$new$elsif p_action='admin_application_product_save' then
  if jsonb_typeof(p_body->'accessProduct') is distinct from 'string'
    or p_body->>'accessProduct' not in ('interview_package','aptitude_only')
    or jsonb_typeof(p_body->'expectedProduct') is distinct from 'string'
    or p_body->>'expectedProduct' not in ('interview_package','aptitude_only')
    or jsonb_typeof(p_body->'revision') is distinct from 'number' then raise exception 'invalid_request'; end if;
  select * into v_app from ip_applications where id=(p_body->>'id')::uuid for update;
  if v_app.id is null then raise exception 'not_found'; end if;
  if v_app.revision<>v_revision then raise exception 'revision_conflict'; end if;
  if v_app.status='approved' then
   select access_product into v_name from ip_members where student_id=v_app.owner_id for update;
   if not found then raise exception 'student_unavailable'; end if;
  else
   v_name:=v_app.access_product;
  end if;
  -- A change from the separate member editor must also invalidate this form.
  if v_name is distinct from p_body->>'expectedProduct' then raise exception 'revision_conflict'; end if;
  if v_app.status='approved' then
   update ip_members set access_product=p_body->>'accessProduct',updated_at=now() where student_id=v_app.owner_id;
  end if;
  update ip_applications set access_product=p_body->>'accessProduct',revision=revision+1,updated_at=now()
   where id=v_app.id returning * into v_app;
  insert into ip_history(entity,entity_id,actor_id,snapshot,student_id)
   values('application',v_app.id::text,p_actor->>'id',to_jsonb(v_app)||jsonb_build_object('change','access_product','previous_access_product',v_name),v_app.owner_id);
  return jsonb_build_object('ok',true,'application',to_jsonb(v_app));
 elsif p_action='admin_application_decide' then$new$;
 if (length(source)-length(replace(source,original,'')))/length(original)<>1 then
  raise exception 'Unexpected application approval definition: review product-change migration';
 end if;
 execute replace(source,original,replacement);
end;
$migration$;

commit;
