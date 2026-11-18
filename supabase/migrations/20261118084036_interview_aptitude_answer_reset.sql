begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

-- Patch the existing invoker service, preserving membership, historical rankings,
-- result visibility and server-only grants. No stored answers change on upgrade.
do $patch$
declare
 source text := replace(pg_catalog.pg_get_functiondef('public.ip_aptitude_service(text,jsonb,jsonb)'::regprocedure),chr(13),'');
 marker text := $marker$ if p_action='admin_report' then$marker$;
 reset_branch text := $branch$ if p_action='admin_reset_attempt' then
  -- The round is already locked by the service, matching student save/submit.
  if jsonb_typeof(p_body->'targetStudentId') is distinct from 'string'
   or length(btrim(p_body->>'targetStudentId')) not between 1 and 200
   or jsonb_typeof(p_body->'attemptRevision') is distinct from 'number'
   or (p_body->>'attemptRevision') !~ '^[1-9][0-9]{0,9}$'
   or (p_body->>'attemptRevision')::bigint>2147483647
   or jsonb_typeof(p_body->'sections') is distinct from 'array' then raise exception 'invalid_request'; end if;
  keys:=p_body->'sections';
  if jsonb_array_length(keys) not between 1 and 5 then raise exception 'invalid_request'; end if;
  if exists(select 1 from jsonb_array_elements(keys) x where jsonb_typeof(x)<>'number' or x::text !~ '^[0-4]$')
   or (select count(distinct x) from jsonb_array_elements(keys) x)<>jsonb_array_length(keys) then raise exception 'invalid_request'; end if;
  select * into a from public.ip_aptitude_attempts where round_id=rid and student_id=p_body->>'targetStudentId' for update;
  if not found then raise exception 'not_found'; end if;
  if a.revision<>(p_body->>'attemptRevision')::int then raise exception 'revision_conflict'; end if;
  result:=to_jsonb(a);
  select jsonb_agg(case when keys @> jsonb_build_array((x.ordinality::int-1)/(n/5)) then '0'::jsonb else x.value end order by x.ordinality)
   into answer_list from jsonb_array_elements(a.answers) with ordinality x;
  update public.ip_aptitude_attempts set answers=answer_list,state='draft',revision=revision+1,
   submission_key=null,submitted_at=null,correct_count=null,scored_key_revision=null,updated_at=now()
   where round_id=rid and student_id=a.student_id returning * into a;
  insert into public.ip_aptitude_audit(round_id,actor_id,reason,before_value,after_value)
   values(rid,owner_id,'성적관리 답안지 초기화',result,to_jsonb(a)||jsonb_build_object('resetSections',keys));
  return jsonb_build_object('ok',true,'studentId',a.student_id,'attemptRevision',a.revision,'sections',keys);
 end if;
$branch$;
begin
 if position(marker in source)=0 or position('''admin_reset_attempt''' in source)>0 then
  raise exception 'aptitude_answer_reset_migration_source_mismatch';
 end if;
 source:=replace(source,marker,reset_branch||marker);
 if position($old$'state',coalesce(t.state,'not_submitted'),'correctCount'$old$ in source)>0 then
  source:=replace(source,$old$'state',coalesce(t.state,'not_submitted'),'correctCount'$old$,
   $new$'state',coalesce(t.state,'not_submitted'),'attemptRevision',coalesce(t.revision,0),'correctCount'$new$);
 elsif position($old$'submittedAt',e.submitted_at,'historical'$old$ in source)>0 then
  -- Imported previous-cohort results are not live student answer sheets.
  source:=replace(source,$old$'submittedAt',e.submitted_at,'historical'$old$,
   $new$'submittedAt',e.submitted_at,'attemptRevision',case when not e.historical then coalesce((select t.revision from public.ip_aptitude_attempts t where t.round_id=rid and t.student_id=e.student_id),0) end,'historical'$new$);
 else
  raise exception 'aptitude_answer_reset_report_source_mismatch';
 end if;
 execute source;
end
$patch$;
commit;
