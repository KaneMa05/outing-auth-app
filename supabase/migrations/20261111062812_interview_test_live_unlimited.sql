-- Test-app Live mock interviews only. Ordinary app keeps three starts per day.
begin;
set local lock_timeout='5s';
do $patch$
declare
 definition text:=pg_get_functiondef('public.ip_live_service(text,jsonb,jsonb)'::regprocedure);
 before text:='if (select count(*) from public.ip_live_runs where student_id=v_id and created_at>=date_trunc(''day'',now() at time zone ''Asia/Seoul'') at time zone ''Asia/Seoul'')>=3 then raise exception ''daily_limit''; end if;';
begin
 if (length(definition)-length(replace(definition,before,'')))/length(before)<>1 then
  raise exception 'unexpected_live_daily_limit_definition';
 end if;
 execute replace(definition,before,replace(before,'if (select','if coalesce(p_actor->''testApp'',''false''::jsonb)<>''true''::jsonb and (select'));
end $patch$;
commit;
