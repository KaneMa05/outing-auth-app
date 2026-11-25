begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

-- Allow a teacher to save the review status without text or annotations.
-- Patch only this guard so later service changes and all permissions survive.
do $patch$
declare
 source text := replace(pg_catalog.pg_get_functiondef('public.ip_writing_service(text,jsonb,jsonb)'::regprocedure),chr(13),'');
 old_guard text := $old$if jsonb_array_length(v_marks)>100 or (length(btrim(p_body->>'feedback'))=0 and jsonb_array_length(v_marks)=0 and not coalesce(v_row.feedback_revision=v_row.submitted_revision and (length(btrim(v_row.feedback))>0 or jsonb_array_length(v_row.annotation_marks)>0),false)) then raise exception 'invalid_request'; end if;$old$;
 new_guard text := $new$if jsonb_array_length(v_marks)>100 then raise exception 'invalid_request'; end if;$new$;
begin
 if (length(source)-length(replace(source,old_guard,'')))/length(old_guard)<>1 then
  raise exception 'optional_teacher_feedback_migration_source_mismatch';
 end if;
 execute replace(source,old_guard,new_guard);
end
$patch$;
commit;
