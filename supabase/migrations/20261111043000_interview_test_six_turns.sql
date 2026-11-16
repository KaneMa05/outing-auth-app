begin;
set local lock_timeout='5s';
do $patch$
declare definition text:=pg_get_functiondef('public.ip_live_service(text,jsonb,jsonb)'::regprocedure); change record;
begin
 for change in select * from (values
 ('v_count>=3','v_count>=(case when p_actor->''testApp''=''true''::jsonb then 2 else 3 end)'),
 ('v_count<3','v_count<(case when p_actor->''testApp''=''true''::jsonb then 2 else 3 end)'),
 ('else random() end limit 3','else random() end limit (case when p_actor->''testApp''=''true''::jsonb then 2 else 3 end)'),
 ('jsonb_array_length(coalesce(v_questions,''[]''))<3','jsonb_array_length(coalesce(v_questions,''[]''))<(case when p_actor->''testApp''=''true''::jsonb then 2 else 3 end)')
 ) as replacements(before,after) loop
  if (length(definition)-length(replace(definition,change.before,'')))/length(change.before)<>1 then raise exception 'unexpected_live_test_count_definition';end if;
  definition:=replace(definition,change.before,change.after);
 end loop;
 execute definition;
end $patch$;
commit;
