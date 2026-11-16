begin;
set local lock_timeout='1s';
set local statement_timeout='15s';

-- Save the selected course and the approval/rejection in the same existing
-- revision-checked transaction. Old review clients may omit accessProduct.
do $migration$
declare source text; original text; replacement text;
begin
 source:=replace(pg_get_functiondef('public.ip_portal_service(text,jsonb,jsonb)'::regprocedure),E'\r\n',E'\n');
 original:=$old$elsif p_action='admin_application_decide' then
  select * into v_app$old$;
 replacement:=$new$elsif p_action='admin_application_decide' then
  if p_body ? 'accessProduct' and (jsonb_typeof(p_body->'accessProduct') is distinct from 'string'
    or p_body->>'accessProduct' not in ('interview_package','aptitude_only')) then raise exception 'invalid_request'; end if;
  select * into v_app$new$;
 if (length(source)-length(replace(source,original,'')))/length(original)<>1 then raise exception 'Unexpected application review branch'; end if;
 source:=replace(source,original,replacement);
 original:=$old$if v_app.revision<>v_revision or v_app.status<>'pending' then raise exception 'revision_conflict'; end if;$old$;
 replacement:=original||E'\n  v_app.access_product:=coalesce(p_body->>''accessProduct'',v_app.access_product);';
 if (length(source)-length(replace(source,original,'')))/length(original)<>1 then raise exception 'Unexpected application review revision check'; end if;
 source:=replace(source,original,replacement);
 original:=$old$update ip_applications set status=p_body->>'status',review_note=coalesce(p_body->>'reviewNote',''),$old$;
 replacement:=$new$update ip_applications set status=p_body->>'status',access_product=v_app.access_product,review_note=coalesce(p_body->>'reviewNote',''),$new$;
 if (length(source)-length(replace(source,original,'')))/length(original)<>1 then raise exception 'Unexpected application review update'; end if;
 execute replace(source,original,replacement);
end;
$migration$;

commit;
