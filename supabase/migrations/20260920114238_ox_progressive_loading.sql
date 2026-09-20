-- Additive: older clients retain the full ox_service bootstrap.
-- Actor identity is resolved by the API, never supplied by the browser.
create function public.ox_learning_data(p_action text, p_actor jsonb, p_body jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_student text := p_actor->>'id';
  v_questions jsonb;
begin
  if coalesce(p_actor->>'type','') <> 'student' or coalesce(v_student,'') = '' then raise exception 'unauthorized'; end if;
  if not exists(select 1 from public.students where id=v_student and is_active and account_type='student') then raise exception 'unauthorized'; end if;
  if not coalesce((select enabled from public.ox_config where id),false) then raise exception 'ox_disabled'; end if;
  if not exists(select 1 from public.ox_members where student_id=v_student and allowed) then raise exception 'ox_not_registered'; end if;

  if p_action='questions' then
    if jsonb_typeof(p_body->'questions') is distinct from 'array' then raise exception 'invalid_request'; end if;
    if jsonb_array_length(p_body->'questions') not between 1 and 50 then raise exception 'invalid_request'; end if;
    if exists(select 1 from jsonb_to_recordset(p_body->'questions') as r(id text,version integer)
      where coalesce(length(r.id),0) not between 1 and 120 or r.version is null or r.version<1) then raise exception 'invalid_request'; end if;
    if exists(select 1 from jsonb_to_recordset(p_body->'questions') as r(id text,version integer)
      left join public.ox_questions q on q.id=r.id and q.status='published' where q.id is null) then raise exception 'question_unavailable'; end if;
    if exists(select 1 from jsonb_to_recordset(p_body->'questions') as r(id text,version integer)
      join public.ox_questions q on q.id=r.id where q.content_version<>r.version) then raise exception 'question_changed'; end if;
    select jsonb_agg(jsonb_build_object('id',q.id,'version',q.content_version,'prompt',q.entry->>'prompt','context',coalesce(q.entry->>'context','')))
      into v_questions from public.ox_questions q join jsonb_to_recordset(p_body->'questions') as r(id text,version integer) on q.id=r.id and q.content_version=r.version and q.status='published';
    if coalesce(jsonb_array_length(v_questions),0)<>jsonb_array_length(p_body->'questions') then raise exception 'question_changed'; end if;
    return jsonb_build_object('ok',true,'questions',v_questions);
  end if;

  if p_action is distinct from 'bootstrap' then raise exception 'unsupported_action'; end if;
  -- Preserve ordering and solved-answer visibility; defer question text.
  select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'chapter_id',q.chapter_id,'version',q.content_version)
    || case when p.question_id is not null then jsonb_build_object('correct_answer',q.entry->>'correct_answer') else '{}'::jsonb end
    order by q.chapter_id,coalesce(nullif(q.entry->>'source_question_number',''),'0')::integer,q.entry->>'source_option_label',q.id),'[]'::jsonb)
    into v_questions from public.ox_questions q left join public.ox_progress p on p.student_id=v_student and p.question_id=q.id and p.content_version=q.content_version where q.status='published';
  return jsonb_build_object('ok',true,'catalog',jsonb_build_object(
    'collections',coalesce((select jsonb_agg(entry order by (entry->>'sort_order')::integer) from public.ox_collections),'[]'::jsonb),
    'chapters',coalesce((select jsonb_agg(c.entry||jsonb_build_object('question_count',coalesce(n.total,0)) order by (c.entry->>'sort_order')::integer)
      from public.ox_chapters c left join (select chapter_id,count(*) total from public.ox_questions where status='published' group by chapter_id) n on n.chapter_id=c.id),'[]'::jsonb),
    'questions',v_questions),
    'progress',coalesce((select jsonb_agg(to_jsonb(p)-'student_id') from public.ox_progress p join public.ox_questions q on q.id=p.question_id and q.content_version=p.content_version where p.student_id=v_student and q.status='published'),'[]'::jsonb),
    'notes',coalesce((select jsonb_agg((to_jsonb(n)-'student_id'-'memo')||jsonb_build_object('has_memo',n.memo<>'')) from public.ox_notes n where student_id=v_student),'[]'::jsonb),
    'statistics',coalesce((select jsonb_object_agg(t.question_id,jsonb_build_object('answered',t.answered,'wrong',t.wrong)) from (select a.question_id,count(*) answered,count(*) filter(where not a.correct) wrong from public.ox_attempts a join public.ox_questions q on q.id=a.question_id and q.content_version=a.content_version where a.is_first and exists(select 1 from public.ox_progress p where p.student_id=v_student and p.question_id=q.id and p.content_version=q.content_version) group by a.question_id)t),'{}'::jsonb),
    'todayCount',(select count(*) from public.ox_attempts where student_id=v_student and answered_at >= (date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')));
end;
$$;
revoke all on function public.ox_learning_data(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ox_learning_data(text,jsonb,jsonb) to service_role;
