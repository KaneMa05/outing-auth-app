-- Deploy the API's structured not_found handling before applying this migration.
-- Expected missing results keep the same owner/retention checks without RAISE.
begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
do $migration$
declare
 definition text:=pg_catalog.pg_get_functiondef('public.ip_openai_practice_service(text,jsonb,jsonb)'::regprocedure);
 previous text:=$previous$ elsif p_action='get' then
  select * into r from public.ip_openai_practice_attempts where id=(p_body->>'id')::uuid and owner_id=owner and retain_until>now();
  if not found then raise exception 'not_found'; end if;$previous$;
 replacement text:=$replacement$ elsif p_action='get' then
  select * into r from public.ip_openai_practice_attempts where id=(p_body->>'id')::uuid and owner_id=owner and retain_until>now();
  if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;$replacement$;
begin
 definition:=pg_catalog.replace(definition,E'\r\n',E'\n');
 previous:=pg_catalog.replace(previous,E'\r\n',E'\n');
 replacement:=pg_catalog.replace(replacement,E'\r\n',E'\n');
 if pg_catalog.strpos(definition,previous)=0 then
  raise exception 'practice_get_definition_mismatch';
 end if;
 execute pg_catalog.replace(definition,previous,replacement);
end $migration$;
commit;
