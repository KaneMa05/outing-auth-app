-- Preserve old callers. Opt-in entry returns only home counters; learning and
-- statistics remain behind the same live device, lease and entitlement checks.
-- No tables, grants, progress rows or answers are changed by this migration.
do $patch$
declare
  v_definition text; v_old text; v_new text; v record;
begin
  -- Refuse to overwrite an unreviewed concurrent change to the live functions.
  for v in select * from (values
    ('public.ox_learning_data(text,jsonb,jsonb)','a924daa3bfd28d811594d7d530c11c7f'),
    ('public.ox_device_gateway(text,jsonb,jsonb)','796aa4b9ebefd9a763be52e1218e49a7'),
    ('public.ox_attempt_counts(text,text)','485930a629360b339bde36fe78d90c60')
  ) expected(signature,source_hash) loop
    if (select md5(replace(prosrc,E'\r\n',E'\n')) from pg_proc where oid=v.signature::regprocedure)
      is distinct from v.source_hash then raise exception 'ox_function_changed_since_review: %',v.signature; end if;
  end loop;
  v_definition:=replace(pg_get_functiondef('public.ox_learning_data(text,jsonb,jsonb)'::regprocedure),E'\r\n',E'\n');
  if position('homeOnly' in v_definition)>0 or position('public.ox_attempt_counts(v_student)' in v_definition)=0 then
    raise exception 'ox_learning_data_changed_since_review';
  end if;
  v_definition:=replace(v_definition,'v_questions jsonb;','v_questions jsonb; v_books text[];');
  v_old:=$old$  if p_action='questions' then$old$;
  v_new:=$new$  -- Evaluate book access per collection, rather than per question/attempt.
  select coalesce(array_agg(id),'{}'::text[]) into v_books
    from public.ox_collections where public.ox_has_book(v_student,id);
  if p_action='questions' then$new$;
  if position(v_old in v_definition)=0 then raise exception 'ox_questions_branch_changed'; end if;
  v_definition:=replace(v_definition,v_old,v_new);
  v_definition:=replace(v_definition,'public.ox_has_book(v_student,access_ch.collection_id)','access_ch.collection_id=any(v_books)');
  v_definition:=replace(v_definition,'public.ox_has_book(v_student,c.collection_id)','c.collection_id=any(v_books)');

  v_old:=$old$  -- Preserve ordering and solved-answer visibility; defer question text.$old$;
  v_new:=$new$  if coalesce((p_body->>'homeOnly')::boolean,false) then
    return jsonb_build_object('ok',true,'homeOnly',true,
      'catalog',jsonb_build_object('collections','[]'::jsonb,'chapters','[]'::jsonb,'questions','[]'::jsonb),
      'progress','[]'::jsonb,'notes','[]'::jsonb,'statisticsDeferred',true,
      'home',jsonb_build_object('reviewCount',(
        select count(*) from public.ox_progress p
        join public.ox_questions q on q.id=p.question_id and q.content_version=p.content_version and q.status='published'
        join public.ox_chapters c on c.id=q.chapter_id
        left join public.ox_notes n on n.student_id=p.student_id and n.question_id=p.question_id
        where p.student_id=v_student and c.collection_id=any(v_books)
          and p.wrong_count>0 and not p.correct and n.mastered_version is distinct from q.content_version)),
      'todayCount',(
        select count(*) from public.ox_attempts a
        join public.ox_questions q on q.id=a.question_id join public.ox_chapters c on c.id=q.chapter_id
        where a.student_id=v_student and c.collection_id=any(v_books)
          and a.answered_at >= (date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')));
  end if;
  -- Preserve ordering and solved-answer visibility; defer question text.$new$;
  if position(v_old in v_definition)=0 then raise exception 'ox_bootstrap_branch_changed'; end if;
  v_definition:=replace(v_definition,v_old,v_new);
  v_definition:=replace(v_definition,
    $old$'ok',true,'catalog',jsonb_build_object($old$,
    $new$'ok',true,'statisticsDeferred',coalesce((p_body->>'deferStatistics')::boolean,false),'catalog',jsonb_build_object($new$);
  -- CASE prevents either aggregate from executing at all for deferred callers.
  v_old:=substring(v_definition from E'    ''statistics'',coalesce[^\n]*');
  if v_old is null or right(v_old,1)<>',' then raise exception 'ox_statistics_branch_changed'; end if;
  v_new:=replace(left(v_old,length(v_old)-1),
    $old$'statistics',coalesce$old$,
    $new$'statistics',case when coalesce((p_body->>'deferStatistics')::boolean,false) then '{}'::jsonb else coalesce$new$)||' end,';
  v_definition:=replace(v_definition,v_old,v_new);
  v_definition:=replace(v_definition,
    $old$'attemptCounts',public.ox_attempt_counts(v_student)$old$,
    $new$'attemptCounts',case when coalesce((p_body->>'deferStatistics')::boolean,false) then '{}'::jsonb else public.ox_attempt_counts(v_student) end$new$);
  execute v_definition;

  v_definition:=replace(pg_get_functiondef('public.ox_device_gateway(text,jsonb,jsonb)'::regprocedure),E'\r\n',E'\n');
  v_old:=$old$    return jsonb_build_object('ok',true,'sessionId',v_session.session_id);$old$;
  v_new:=$new$    if coalesce((p_body->>'includeBootstrap')::boolean,false) then
      -- The existing advisory lock and all start checks remain in this transaction.
      -- If the summary fails, the session start rolls back as well.
      return jsonb_build_object('ok',true,'sessionId',v_session.session_id,'bootstrap',
        public.ox_learning_data('bootstrap',p_actor,jsonb_build_object(
          'homeOnly',coalesce((p_body->>'homeOnly')::boolean,false),
          'deferStatistics',coalesce((p_body->>'deferStatistics')::boolean,false))));
    end if;
    return jsonb_build_object('ok',true,'sessionId',v_session.session_id);$new$;
  if position('includeBootstrap' in v_definition)>0 or position(v_old in v_definition)=0 then raise exception 'ox_device_start_changed'; end if;
  v_definition:=replace(v_definition,v_old,v_new);
  v_old:=$old$('bootstrap','questions','detail','submit','note','device_heartbeat')$old$;
  if position(v_old in v_definition)=0 then raise exception 'ox_device_actions_changed'; end if;
  v_definition:=replace(v_definition,v_old,$new$('bootstrap','questions','detail','submit','note','device_heartbeat','attempt_counts')$new$);
  v_old:=$old$  if p_action='questions' or (p_action='bootstrap'$old$;
  v_new:=$new$  if p_action='attempt_counts' then
    return jsonb_build_object('ok',true,'attemptCounts',public.ox_attempt_counts(v_student));
  end if;
  if p_action='detail' and coalesce((p_body->>'includeStatistics')::boolean,false) then
    -- Validate solved status, purchase and content version before querying stats.
    v_result:=public.ox_service(p_action,p_actor,p_body-'sessionId');
    return v_result||jsonb_build_object('statistics',(
      select jsonb_build_object('answered',count(*),'wrong',count(*) filter(where not a.correct))
      from public.ox_attempts a join public.students s on s.id=a.student_id and s.account_type='student'
      where a.question_id=p_body->>'questionId' and a.content_version=(p_body->>'version')::integer and a.is_first));
  end if;
  if p_action='questions' or (p_action='bootstrap'$new$;
  if position(v_old in v_definition)=0 then raise exception 'ox_device_dispatch_changed'; end if;
  v_definition:=replace(v_definition,v_old,v_new);
  execute v_definition;

  -- Keep cumulative semantics, but check entitlements once per book rather than
  -- once per question in a learner's entire attempt history.
  execute $counts$
  create or replace function public.ox_attempt_counts(p_student text,p_question text default null)
  returns jsonb language sql stable security invoker set search_path='' as $fn$
    with allowed_books as materialized (
      select id from public.ox_collections where public.ox_has_book(p_student,id)
    )
    select coalesce(jsonb_object_agg(t.question_id,jsonb_build_object(
      'attempts',t.attempts,'correct',t.correct,'wrong',t.wrong)),'{}'::jsonb)
    from (
      select a.question_id,a.attempts,a.correct,a.wrong from (
        select question_id,content_version,count(*) attempts,
          count(*) filter(where correct) correct,count(*) filter(where not correct) wrong
        from public.ox_attempts
        where student_id=p_student and (p_question is null or question_id=p_question)
        group by question_id,content_version
      ) a
      join public.ox_questions q on q.id=a.question_id and q.content_version=a.content_version and q.status='published'
      join public.ox_chapters c on c.id=q.chapter_id
      join allowed_books b on b.id=c.collection_id
    ) t
  $fn$;
  $counts$;
end $patch$;
