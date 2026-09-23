-- Count persisted attempts, including replays. No backfill or progress reset.
-- Kept separate from the cohort's first-answer statistics.
create function public.ox_attempt_counts(p_student text,p_question text default null)
returns jsonb language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_object_agg(t.question_id,jsonb_build_object(
    'attempts',t.attempts,'correct',t.correct,'wrong',t.wrong)),'{}'::jsonb)
  from (
    select a.question_id,a.attempts,a.correct,a.wrong
    from (
      select question_id,content_version,count(*) attempts,
        count(*) filter(where correct) correct,count(*) filter(where not correct) wrong
      from public.ox_attempts
      where student_id=p_student and (p_question is null or question_id=p_question)
      group by question_id,content_version
    ) a
    join public.ox_questions q on q.id=a.question_id and q.content_version=a.content_version and q.status='published'
    join public.ox_chapters c on c.id=q.chapter_id
    where public.ox_has_book(p_student,c.collection_id)
  ) t
$$;
revoke all on function public.ox_attempt_counts(text,text) from public,anon,authenticated;
grant execute on function public.ox_attempt_counts(text,text) to service_role;

do $patch$
declare v_signature text; v_definition text; v_old text; v_new text;
begin
  foreach v_signature in array array['public.ox_service(text,jsonb,jsonb)','public.ox_learning_data(text,jsonb,jsonb)'] loop
    v_definition:=pg_get_functiondef(v_signature::regprocedure);
    v_old:=$old$'todayCount',(select count(*)$old$;
    v_new:=$new$'attemptCounts',public.ox_attempt_counts(v_student),
      'todayCount',(select count(*)$new$;
    if position('''attemptCounts''' in v_definition)>0 or
      (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old)<>1 then
      raise exception 'ox_bootstrap_changed_since_review: %',v_signature;
    end if;
    v_definition:=replace(v_definition,v_old,v_new);
    if v_signature='public.ox_service(text,jsonb,jsonb)' then
      v_old:=$old$'statistics',jsonb_build_object('answered',v_count,'wrong',v_wrong)$old$;
      v_new:=$new$'attemptCounts',public.ox_attempt_counts(v_student,v_id),
      'statistics',jsonb_build_object('answered',v_count,'wrong',v_wrong)$new$;
      if (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old)<>1 then
        raise exception 'ox_submit_changed_since_review';
      end if;
      v_definition:=replace(v_definition,v_old,v_new);
    end if;
    execute v_definition;
  end loop;
end $patch$;
