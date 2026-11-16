begin;
set local lock_timeout = '1s';
set local statement_timeout = '15s';

-- Raise only the per-student rolling 24-hour quota. Preserve cached results,
-- queued work, ownership checks, concurrency limits and existing RPC grants.
do $migration$
declare
 definition text := pg_catalog.pg_get_functiondef('public.ip_draft_question_service(text,jsonb,jsonb)'::regprocedure);
 old_check text := $old$if (select count(*) from ip_draft_question_jobs where student_id=sid and created_at>now()-interval '24 hours')>=10 then raise exception 'daily_limit';end if;$old$;
 new_check text := $new$if (select count(*) from ip_draft_question_jobs where student_id=sid and created_at>now()-interval '24 hours')>=40 then raise exception 'daily_limit';end if;$new$;
 old_matches integer;
 new_matches integer;
begin
 old_matches := (length(definition)-length(replace(definition,old_check,'')))/length(old_check);
 new_matches := (length(definition)-length(replace(definition,new_check,'')))/length(new_check);
 if old_matches=1 and new_matches=0 then
  execute pg_catalog.replace(definition,old_check,new_check);
 elsif old_matches<>0 or new_matches<>1 then
  raise exception 'ip_draft_question_service quota changed; review 40-request migration';
 end if;
end;
$migration$;
commit;
