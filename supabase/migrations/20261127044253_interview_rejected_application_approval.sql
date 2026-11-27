begin;
set local lock_timeout='1s';
set local statement_timeout='15s';

-- Reuse the existing atomic approval, enrollment and history path. A rejected
-- application may only move to approved; completed approvals stay immutable.
do $migration$
declare source text; original text; replacement text;
begin
 source:=replace(pg_get_functiondef('public.ip_portal_service(text,jsonb,jsonb)'::regprocedure),E'\r\n',E'\n');
 original:=$old$if v_app.revision<>v_revision or v_app.status<>'pending' then raise exception 'revision_conflict'; end if;$old$;
 replacement:=$new$if v_app.revision<>v_revision
    or not (v_app.status='pending' or (v_app.status='rejected' and coalesce(p_body->>'status','')='approved'))
  then raise exception 'revision_conflict'; end if;$new$;
 if (length(source)-length(replace(source,original,'')))/length(original)<>1 then
  raise exception 'Unexpected application review state check';
 end if;
 execute replace(source,original,replacement);
end;
$migration$;

commit;
