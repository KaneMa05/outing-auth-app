-- Keep the existing API, entitlement checks, solved-answer visibility and order.
-- Only reduce the width of the question-summary sort; no data or grants change.
-- The source guard prevents overwriting a concurrent, unreviewed function edit.
do $patch$
declare
  v_definition text;
  v_old text := $old$  select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'chapter_id',q.chapter_id,'version',q.content_version)
    || case when p.question_id is not null then jsonb_build_object('correct_answer',q.entry->>'correct_answer') else '{}'::jsonb end
    order by q.chapter_id,coalesce(nullif(q.entry->>'source_question_number',''),'0')::integer,q.entry->>'source_option_label',q.id),'[]'::jsonb)
    into v_questions from public.ox_questions q left join public.ox_progress p on p.student_id=v_student and p.question_id=q.id and p.content_version=q.content_version where q.status='published' and exists(select 1 from public.ox_chapters access_ch where access_ch.id=q.chapter_id and access_ch.collection_id=any(v_books));
$old$;
  v_new text := $new$  -- Project compact summaries before sorting. Carrying q.entry through the
  -- aggregate's presort spills full question bodies/explanations to temp files.
  with question_summaries as materialized (
    select q.id,q.chapter_id,
      coalesce(nullif(q.entry->>'source_question_number',''),'0')::integer sort_number,
      q.entry->>'source_option_label' sort_option,
      jsonb_build_object('id',q.id,'chapter_id',q.chapter_id,'version',q.content_version)
        || case when p.question_id is not null then jsonb_build_object('correct_answer',q.entry->>'correct_answer') else '{}'::jsonb end summary
    from public.ox_questions q
    left join public.ox_progress p on p.student_id=v_student and p.question_id=q.id and p.content_version=q.content_version
    where q.status='published' and exists(
      select 1 from public.ox_chapters access_ch
      where access_ch.id=q.chapter_id and access_ch.collection_id=any(v_books))
  )
  select coalesce(jsonb_agg(summary order by chapter_id,sort_number,sort_option,id),'[]'::jsonb)
    into v_questions from question_summaries;
$new$;
begin
  v_old:=replace(v_old,E'\r\n',E'\n');
  v_new:=replace(v_new,E'\r\n',E'\n');
  if (select md5(replace(prosrc,E'\r\n',E'\n')) from pg_proc
      where oid='public.ox_learning_data(text,jsonb,jsonb)'::regprocedure)
    is distinct from '07aa2d5f13ccf6df68a87f9ca3de6900' then
    raise exception 'ox_learning_data_changed_since_review';
  end if;
  v_definition:=replace(pg_get_functiondef('public.ox_learning_data(text,jsonb,jsonb)'::regprocedure),E'\r\n',E'\n');
  if position(v_old in v_definition)=0 then raise exception 'ox_summary_query_changed'; end if;
  execute replace(v_definition,v_old,v_new);
end $patch$;
