begin;

-- Extend the existing authorized availability response; no per-experience API calls.
-- Preserve the service function's owner, grants and all other action branches.
do $migration$
declare
  definition text := pg_get_functiondef('public.ip_life_followup_service(text,jsonb,jsonb)'::regprocedure);
  old_fragment text := $old$'experience_id',f.experience_id,'answered'$old$;
  new_fragment text := $new$'experience_id',f.experience_id,
    'summary_ready',coalesce((select
      summary_output.applied_at is null and summary_output.engine<>'student_reviewed'
      and summary_output.answer_revision=f.answer_revision
      and summary_output.source_hash=(select public.ip_life_followup_hash(t) from jsonb_array_elements(p.content->'experiences') t where t->>'id'=f.experience_id)
      from public.ip_life_followup_outputs summary_output where summary_output.session_id=f.id
      order by summary_output.created_at desc,summary_output.id desc limit 1),false),
    'answered'$new$;
begin
  if position(old_fragment in definition)=0 then
    raise exception 'followup_availability_patch_target_missing';
  end if;
  execute replace(definition,old_fragment,new_fragment);
end;
$migration$;

commit;
