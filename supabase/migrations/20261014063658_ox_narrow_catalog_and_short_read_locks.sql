-- Preserve API/ACLs and all user records. Fail quickly instead of waiting on
-- production DDL locks. Apply as one transaction; see release notes for rollback.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
do $guard$ begin
  if (select md5(replace(prosrc,E'\r\n',E'\n')) from pg_proc where oid='public.ox_device_gateway(text,jsonb,jsonb)'::regprocedure) is distinct from 'b345ae9cb222ed2a22a5f0972eafbcb2' then
    raise exception 'ox_device_gateway_changed_since_review';
  end if;
  if (select md5(replace(prosrc,E'\r\n',E'\n')) from pg_proc where oid='public.ox_learning_data(text,jsonb,jsonb)'::regprocedure) is distinct from 'b956f220f24270bffdf102e7ce997adc' then
    raise exception 'ox_learning_data_changed_since_review';
  end if;
end $guard$;

-- Derived data only. Answers remain server-only and are still exposed solely
-- after the existing solved/version/entitlement checks in ox_learning_data.
create table public.ox_question_summaries (
  id text primary key references public.ox_questions(id) on update cascade on delete cascade,
  chapter_id text not null, content_version integer not null, status text not null,
  sort_number text not null, sort_option text, correct_answer text
);
alter table public.ox_question_summaries enable row level security;
revoke all on public.ox_question_summaries from public,anon,authenticated;
grant select,insert,update,delete on public.ox_question_summaries to service_role;
create index ox_question_summaries_chapter_status on public.ox_question_summaries(chapter_id,status,id);

create function public.sync_ox_question_summary() returns trigger
language plpgsql security invoker set search_path='' as $sync$
begin
  insert into public.ox_question_summaries(id,chapter_id,content_version,status,sort_number,sort_option,correct_answer)
    values(new.id,new.chapter_id,new.content_version,new.status,
      coalesce(nullif(new.entry->>'source_question_number',''),'0'),
      new.entry->>'source_option_label',new.entry->>'correct_answer')
    on conflict(id) do update set chapter_id=excluded.chapter_id,content_version=excluded.content_version,
      status=excluded.status,sort_number=excluded.sort_number,sort_option=excluded.sort_option,correct_answer=excluded.correct_answer;
  return new;
end $sync$;
revoke all on function public.sync_ox_question_summary() from public,anon,authenticated;
grant execute on function public.sync_ox_question_summary() to service_role;
create trigger sync_ox_question_summary after insert or update of id,chapter_id,content_version,status,entry
  on public.ox_questions for each row execute function public.sync_ox_question_summary();
insert into public.ox_question_summaries
  select id,chapter_id,content_version,status,
    coalesce(nullif(entry->>'source_question_number',''),'0'),
    entry->>'source_option_label',entry->>'correct_answer' from public.ox_questions;

CREATE OR REPLACE FUNCTION public.ox_learning_data(p_action text, p_actor jsonb, p_body jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_student text := p_actor->>'id';
  v_questions jsonb; v_books text[];
begin
  if coalesce(p_actor->>'type','') <> 'student' or coalesce(v_student,'') = '' then raise exception 'unauthorized'; end if;
  if not exists(select 1 from public.students where id=v_student and is_active and account_type in ('student','teacher')) then raise exception 'unauthorized'; end if;
  if not coalesce((select enabled from public.ox_config where id),false) then raise exception 'ox_disabled'; end if;
  if not (public.ox_is_teacher(v_student) or exists(select 1 from public.ox_members where student_id=v_student and allowed)) then raise exception 'ox_not_registered'; end if;
  if not public.ox_has_any_access(v_student) then raise exception 'ox_book_required'; end if;

  -- Evaluate book access per collection, rather than per question/attempt.
  select coalesce(array_agg(id),'{}'::text[]) into v_books
    from public.ox_collections where public.ox_has_book(v_student,id);
  if p_action='questions' then
    if jsonb_typeof(p_body->'questions') is distinct from 'array' then raise exception 'invalid_request'; end if;
    if jsonb_array_length(p_body->'questions') not between 1 and 50 then raise exception 'invalid_request'; end if;
    if exists(select 1 from jsonb_to_recordset(p_body->'questions') as r(id text,version integer)
      where coalesce(length(r.id),0) not between 1 and 120 or r.version is null or r.version<1) then raise exception 'invalid_request'; end if;
    if exists(select 1 from jsonb_to_recordset(p_body->'questions') as r(id text,version integer)
      left join public.ox_questions q on q.id=r.id and q.status='published' where q.id is null) then raise exception 'question_unavailable'; end if;
    if exists(select 1 from jsonb_to_recordset(p_body->'questions') as r(id text,version integer)
      join public.ox_questions q on q.id=r.id join public.ox_chapters c on c.id=q.chapter_id
      where not c.collection_id=any(v_books)) then raise exception 'ox_book_required'; end if;
    if exists(select 1 from jsonb_to_recordset(p_body->'questions') as r(id text,version integer)
      join public.ox_questions q on q.id=r.id where q.content_version<>r.version) then raise exception 'question_changed'; end if;
    select jsonb_agg(jsonb_build_object('id',q.id,'version',q.content_version,'prompt',q.entry->>'prompt','context',coalesce(q.entry->>'context','')))
      into v_questions from public.ox_questions q join jsonb_to_recordset(p_body->'questions') as r(id text,version integer) on q.id=r.id and q.content_version=r.version and q.status='published';
    if coalesce(jsonb_array_length(v_questions),0)<>jsonb_array_length(p_body->'questions') then raise exception 'question_changed'; end if;
    return jsonb_build_object('ok',true,'questions',v_questions);
  end if;

  if p_action is distinct from 'bootstrap' then raise exception 'unsupported_action'; end if;
  if coalesce((p_body->>'homeOnly')::boolean,false) then
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
  -- Narrow transactional projection: no question body/TOAST fetch for a catalog.
  with question_summaries as materialized (
    select q.id,q.chapter_id,q.sort_number::integer sort_number,q.sort_option,
      jsonb_build_object('id',q.id,'chapter_id',q.chapter_id,'version',q.content_version)
        || case when p.question_id is not null then jsonb_build_object('correct_answer',q.correct_answer) else '{}'::jsonb end summary
    from public.ox_question_summaries q
    left join public.ox_progress p on p.student_id=v_student and p.question_id=q.id and p.content_version=q.content_version
    where q.status='published' and exists(
      select 1 from public.ox_chapters c where c.id=q.chapter_id and c.collection_id=any(v_books))
  )
  select coalesce(jsonb_agg(summary order by chapter_id,sort_number,sort_option,id),'[]'::jsonb)
    into v_questions from question_summaries;
  return jsonb_build_object('ok',true,'statisticsDeferred',coalesce((p_body->>'deferStatistics')::boolean,false),'catalog',jsonb_build_object(
    'collections',coalesce((select jsonb_agg(entry||jsonb_build_object('accessible',id=any(v_books)) order by (entry->>'sort_order')::integer) from public.ox_collections),'[]'::jsonb),
    'chapters',coalesce((select jsonb_agg(c.entry||jsonb_build_object('question_count',coalesce(n.total,0)) order by (c.entry->>'sort_order')::integer)
      from public.ox_chapters c left join (select q.chapter_id,count(*) total from public.ox_question_summaries q join public.ox_chapters ac on ac.id=q.chapter_id where q.status='published' and ac.collection_id=any(v_books) group by q.chapter_id) n on n.chapter_id=c.id where c.collection_id=any(v_books)),'[]'::jsonb),
    'questions',v_questions),
    'progress',coalesce((select jsonb_agg(to_jsonb(p)-'student_id') from public.ox_progress p join public.ox_questions q on q.id=p.question_id and q.content_version=p.content_version where p.student_id=v_student and q.status='published' and exists(select 1 from public.ox_chapters access_ch where access_ch.id=q.chapter_id and access_ch.collection_id=any(v_books))),'[]'::jsonb),
    'notes',coalesce((select jsonb_agg((to_jsonb(n)-'student_id'-'memo')||jsonb_build_object('has_memo',n.memo<>'')) from public.ox_notes n join public.ox_questions q on q.id=n.question_id where n.student_id=v_student and exists(select 1 from public.ox_chapters access_ch where access_ch.id=q.chapter_id and access_ch.collection_id=any(v_books))),'[]'::jsonb),
    'statistics',case when coalesce((p_body->>'deferStatistics')::boolean,false) then '{}'::jsonb else coalesce((select jsonb_object_agg(t.question_id,jsonb_build_object('answered',t.answered,'wrong',t.wrong)) from (select a.question_id,count(*) answered,count(*) filter(where not a.correct) wrong from public.ox_attempts a join public.ox_questions q on q.id=a.question_id and q.content_version=a.content_version where a.is_first and exists(select 1 from public.students stats_student where stats_student.id=a.student_id and stats_student.account_type='student') and exists(select 1 from public.ox_chapters access_ch where access_ch.id=q.chapter_id and access_ch.collection_id=any(v_books)) and exists(select 1 from public.ox_progress p where p.student_id=v_student and p.question_id=q.id and p.content_version=q.content_version) group by a.question_id)t),'{}'::jsonb) end,
    'attemptCounts',case when coalesce((p_body->>'deferStatistics')::boolean,false) then '{}'::jsonb else public.ox_attempt_counts(v_student) end,
      'todayCount',(select count(*) from public.ox_attempts a join public.ox_questions q on q.id=a.question_id where a.student_id=v_student and exists(select 1 from public.ox_chapters access_ch where access_ch.id=q.chapter_id and access_ch.collection_id=any(v_books)) and a.answered_at >= (date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')));
end;
$function$
;
CREATE OR REPLACE FUNCTION public.ox_device_gateway(p_action text, p_actor jsonb, p_body jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_student text:=p_actor->>'id'; v_hash text:=p_actor->>'deviceHash';
  v_read boolean := p_action in ('bootstrap','questions','detail','attempt_counts');
  v_books_before text[]; v_books_after text[];
  v_device public.student_devices; v_session public.ox_device_sessions; v_result jsonb;
begin
  if p_action like 'admin_device_%' then return public.student_device_manage(p_action,p_actor,p_body); end if;
  if coalesce(p_actor->>'type','')<>'student' or coalesce(v_student,'')='' or coalesce(v_hash,'') !~ '^[a-f0-9]{64}$' then raise exception 'unauthorized'; end if;
  -- Share the same transaction lock as login, revoke, reset, and replacement.
  -- Mutations still serialize with login/reset/replacement. Heavy reads acquire
  -- that lock only after computing their result, then revalidate before returning.
  if not v_read then perform pg_advisory_xact_lock(hashtext(v_student)::bigint); end if;
  select d.* into v_device from public.student_devices d join public.students s on s.id=d.student_id
    where d.student_id=v_student and d.device_token_hash=v_hash and d.revoked_at is null and s.is_active and s.account_type in ('student','teacher');
  if v_device.id is null then raise exception 'unauthorized'; end if;
  if p_action='status' then return public.ox_service(p_action,p_actor,p_body); end if;
  if p_action in ('device_state','device_register') then
    v_result:=public.student_device_manage(p_action,p_actor,p_body);
    return v_result||jsonb_build_object('learningError',case when not (public.ox_is_teacher(v_student) or exists(select 1 from public.ox_members where student_id=v_student and allowed)) then 'ox_not_registered'
      when not public.ox_has_any_access(v_student) then 'ox_book_required'
      when not (select enabled from public.ox_config where id) then 'ox_disabled' else null end);
  end if;
  select * into v_session from public.ox_device_sessions where student_id=v_student;
  if p_action='device_start' then
    if not (public.ox_is_teacher(v_student) or exists(select 1 from public.ox_members where student_id=v_student and allowed)) then raise exception 'ox_not_registered'; end if;
    if not public.ox_has_any_access(v_student) then raise exception 'ox_book_required'; end if;
    if not (select enabled from public.ox_config where id) then raise exception 'ox_disabled'; end if;
    if v_device.id is null then raise exception 'device_not_registered'; end if;
    if v_session.expires_at>now() and v_session.device_id<>v_device.id then
      if coalesce((p_body->>'takeover')::boolean,false) is not true then raise exception 'device_in_use'; end if;
      if v_session.session_id::text is distinct from p_body->>'expectedSessionId' then raise exception 'device_session_changed'; end if;
    end if;
    if v_session.device_id=v_device.id and v_session.expires_at>now() then
      update public.ox_device_sessions set expires_at=now()+interval '3 minutes' where student_id=v_student returning * into v_session;
    else
      insert into public.ox_device_sessions(student_id,device_id,expires_at) values(v_student,v_device.id,now()+interval '3 minutes')
        on conflict(student_id) do update set device_id=excluded.device_id,session_id=gen_random_uuid(),expires_at=excluded.expires_at returning * into v_session;
    end if;
    if coalesce((p_body->>'includeBootstrap')::boolean,false) then
      -- The existing advisory lock and all start checks remain in this transaction.
      -- If the summary fails, the session start rolls back as well.
      return jsonb_build_object('ok',true,'sessionId',v_session.session_id,'bootstrap',
        public.ox_learning_data('bootstrap',p_actor,jsonb_build_object(
          'homeOnly',coalesce((p_body->>'homeOnly')::boolean,false),
          'deferStatistics',coalesce((p_body->>'deferStatistics')::boolean,false))));
    end if;
    return jsonb_build_object('ok',true,'sessionId',v_session.session_id);
  end if;
  if p_action not in ('bootstrap','questions','detail','submit','note','device_heartbeat','attempt_counts') then raise exception 'unsupported_action'; end if;
  if not (public.ox_is_teacher(v_student) or exists(select 1 from public.ox_members where student_id=v_student and allowed)) then raise exception 'ox_not_registered'; end if;
  if not public.ox_has_any_access(v_student) then raise exception 'ox_book_required'; end if;
  if v_device.id is null then raise exception 'device_not_registered'; end if;
  if v_session.device_id is distinct from v_device.id or v_session.session_id::text is distinct from p_body->>'sessionId' or v_session.expires_at is null or v_session.expires_at<=now() then raise exception 'device_session_changed'; end if;
  if not (select enabled from public.ox_config where id) then raise exception 'ox_disabled'; end if;
  if not v_read then
    update public.ox_device_sessions set expires_at=now()+interval '3 minutes' where student_id=v_student;
    if p_action='device_heartbeat' then return jsonb_build_object('ok',true); end if;
    return public.ox_service(p_action,p_actor,p_body-'sessionId');
  end if;
  -- The function is VOLATILE and requires READ COMMITTED: every SQL command
  -- after a concurrent reset/revoke must see its committed state.
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'ox_read_requires_read_committed';
  end if;
  select coalesce(array_agg(id order by id),'{}'::text[]) into v_books_before
    from public.ox_collections where public.ox_has_book(v_student,id);
  if p_action='attempt_counts' then
    v_result:=jsonb_build_object('ok',true,'attemptCounts',public.ox_attempt_counts(v_student));
  elsif p_action='questions' or (p_action='bootstrap' and coalesce((p_body->>'summaryOnly')::boolean,false)) then
    v_result:=public.ox_learning_data(p_action,p_actor,p_body-'sessionId');
  elsif p_action='detail' then
    -- ox_service(detail) takes a question row SHARE lock. Keep that call AFTER
    -- the device lock, in the same order as submissions/admin interactions.
    -- Only its optional aggregate runs here, after a non-locking access check.
    v_result:='{}'::jsonb;
    if coalesce((p_body->>'includeStatistics')::boolean,false) and exists(
      select 1 from public.ox_questions q join public.ox_chapters c on c.id=q.chapter_id
      join public.ox_progress p on p.student_id=v_student and p.question_id=q.id and p.content_version=q.content_version
      where q.id=p_body->>'questionId' and q.content_version=(p_body->>'version')::integer
        and q.status='published' and c.collection_id=any(v_books_before)) then
      v_result:=jsonb_build_object('statistics',(
        select jsonb_build_object('answered',count(*),'wrong',count(*) filter(where not a.correct))
        from public.ox_attempts a join public.students s on s.id=a.student_id and s.account_type='student'
        where a.question_id=p_body->>'questionId' and a.content_version=(p_body->>'version')::integer and a.is_first));
    end if;
  else
    v_result:=public.ox_service(p_action,p_actor,p_body-'sessionId');
  end if;
  -- Recursive call is heartbeat-only: it acquires the shared device lock,
  -- checks live device, student, membership, enablement and exact session ID,
  -- and renews the lease. Any failure discards the entire computed response.
  perform public.ox_device_gateway('device_heartbeat',p_actor,p_body);
  select coalesce(array_agg(id order by id),'{}'::text[]) into v_books_after
    from public.ox_collections where public.ox_has_book(v_student,id);
  if v_books_before is distinct from v_books_after then raise exception 'ox_book_required'; end if;
  if p_action='detail' then
    return public.ox_service(p_action,p_actor,p_body-'sessionId')||v_result;
  end if;
  return v_result;
end; $function$;

commit;
