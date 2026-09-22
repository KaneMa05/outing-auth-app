-- Deployment review: only the admin_members branch differs from the live function.
-- All purchase, learning, history and access branches are byte-identical after newline normalization.
-- No learning gateway is replaced. Existing SECURITY INVOKER and ACL are preserved.
-- Abort if the live non-member branches have changed since the verified production snapshot.
do $guard$
begin
  if (select md5(btrim(regexp_replace(replace(prosrc,E'\r\n',E'\n'),
      $pattern$  if p_action='admin_members' then.*?(?=  if p_action='admin_member_history' then)$pattern$,'','s'),E' \n\r\t'))
      from pg_proc where oid='public.ox_service(text,jsonb,jsonb)'::regprocedure)
      is distinct from '0d1b0defa840bd4395f8afe589d37087' then raise exception 'ox_service_changed_since_review'; end if;
end $guard$;

create or replace function public.ox_service(p_action text, p_actor jsonb, p_body jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_admin boolean := coalesce(p_actor->>'type' = 'admin',false); v_student text := p_actor->>'id';
  v_question public.ox_questions; v_existing public.ox_attempts; v_note public.ox_notes;
  v_entry jsonb; v_old jsonb; v_new jsonb; v_result jsonb; v_items jsonb; v_questions jsonb;
  v_book text; v_book_row public.ox_book_access; v_access_revision integer;
  v_id text; v_version integer; v_revision integer; v_count integer; v_wrong integer;
  v_first boolean; v_answer text; v_submission uuid; v_status text; v_reviewed boolean;
  v_page integer := greatest(0,least(coalesce((p_body->>'page')::integer,0),10000));
begin
  if coalesce(p_actor->>'type','') not in ('admin','student') or coalesce(v_student,'') = '' then raise exception 'unauthorized'; end if;
  if p_action like 'admin_%' and not v_admin then raise exception 'forbidden'; end if;
  if not v_admin and not exists(select 1 from public.students where id=v_student and is_active and account_type='student') then raise exception 'unauthorized'; end if;

  if p_action='admin_members' then
    if p_body?'track' and (jsonb_typeof(p_body->'track') is distinct from 'string'
      or length(p_body->>'track')>200) then raise exception 'invalid_request'; end if;
    if p_body?'cohort' and (jsonb_typeof(p_body->'cohort') is distinct from 'string'
      or (p_body->>'cohort' not in ('','lecture','unassigned') and p_body->>'cohort' !~ '^[0-9]{1,2}$')) then
      raise exception 'invalid_request';
    end if;
    with eligible as (
      select s.id,s.name,s.class_name,s.student_category,s.is_active,
        public.ox_normalize_grant_track(s.track) as track,
        coalesce((select jsonb_agg(ids.lecture_id order by ids.normalized) from (
          select distinct on (normalized) lecture_id,normalized from (
            select btrim(a.lecture_id) as lecture_id,
              lower(regexp_replace(normalize(a.lecture_id,NFKC),'[[:space:]]','','g')) as normalized,0 as priority
            from public.lecture_applications a
            where a.approved_student_id=s.id and a.status='approved' and nullif(btrim(a.lecture_id),'') is not null
            union all
            select f.lecture_id_normalized,
              lower(regexp_replace(normalize(f.lecture_id_normalized,NFKC),'[[:space:]]','','g')),1
            from public.final_score_identities f where f.student_id=s.id
          ) linked order by normalized,priority,lecture_id
        ) ids),'[]'::jsonb) as lecture_ids,
        -- Internet students have no cohort; otherwise use the roster's explicit/legacy rule.
        case when s.student_category='lecture' then null
          when s.cohort between 1 and 99 then s.cohort::text
          when s.id ~ '^[0-9]{4,5}$' then left(s.id,length(s.id)-3)
          else null end as cohort,
        coalesce(m.allowed,false) as allowed,m.updated_at,m.updated_by,coalesce(m.access_revision,0) as access_revision,
        m.student_id is not null as registered,
        coalesce((select jsonb_agg(to_jsonb(b)-'student_id' order by b.collection_id) from public.ox_book_access b where b.student_id=s.id),'[]'::jsonb) as books,
        coalesce((select jsonb_agg(g) from (values('criminal-law'),('criminal-procedure-investigation-evidence'),('criminal-procedure-trial'))g(id) where public.ox_has_grant(s.id,g.id)),'[]'::jsonb) as grants
      from public.students s left join public.ox_members m on m.student_id=s.id
      where s.account_type='student' and (s.is_active or m.student_id is not null)
    ), matched as (
      select e.* from eligible e
      where (not coalesce((p_body->>'registeredOnly')::boolean,true) or e.registered)
        and (coalesce(p_body->>'track','')='' or e.track=public.ox_normalize_grant_track(p_body->>'track')
          or (p_body->>'track'='unassigned' and e.track is null))
        and (coalesce(p_body->>'search','')='' or position(lower(p_body->>'search') in lower(e.name))>0 or e.id=p_body->>'search'
          or exists(select 1 from jsonb_array_elements_text(e.lecture_ids) as lid(value)
            where nullif(regexp_replace(normalize(p_body->>'search',NFKC),'[[:space:]]','','g'),'') is not null
              and position(lower(regexp_replace(normalize(p_body->>'search',NFKC),'[[:space:]]','','g'))
                in lower(regexp_replace(normalize(lid.value,NFKC),'[[:space:]]','','g')))>0))
        and (coalesce(p_body->>'collectionId','')='' or exists(select 1 from public.ox_book_access b where b.student_id=e.id and b.collection_id=p_body->>'collectionId'))
        and (coalesce(p_body->>'bookStatus','')='' or
          (p_body->>'bookStatus'='active' and e.allowed and exists(select 1 from public.ox_book_access b where b.student_id=e.id and b.active and (coalesce(p_body->>'collectionId','')='' or b.collection_id=p_body->>'collectionId'))) or
          (p_body->>'bookStatus'='stopped' and exists(select 1 from public.ox_book_access b where b.student_id=e.id and (not b.active or not e.allowed) and (coalesce(p_body->>'collectionId','')='' or b.collection_id=p_body->>'collectionId'))))
        and (coalesce(p_body->>'cohort','')='' or e.cohort=p_body->>'cohort'
          or (p_body->>'cohort'='lecture' and e.student_category='lecture')
          or (p_body->>'cohort'='unassigned' and e.student_category<>'lecture' and e.cohort is null))
    )
    select jsonb_build_object('ok',true,'total',(select count(*) from matched),
      'tracks',coalesce((select jsonb_agg(t.track order by t.track) from (select distinct track from eligible e where track is not null
          and (coalesce(p_body->>'cohort','')='' or e.cohort=p_body->>'cohort'
            or (p_body->>'cohort'='lecture' and e.student_category='lecture')
            or (p_body->>'cohort'='unassigned' and e.student_category<>'lecture' and e.cohort is null)))t),'[]'::jsonb),
      'cohorts',coalesce((select jsonb_agg(c.cohort order by c.cohort::integer desc) from
        (select distinct cohort from eligible where cohort is not null)c),'[]'::jsonb),
      'items',coalesce((select jsonb_agg(to_jsonb(t)-'registered' order by t.name,t.id) from
        (select * from matched order by name,id limit 30 offset v_page*30)t),'[]'::jsonb)) into v_result;
    return v_result;
  end if;
  if p_action='admin_member_history' then
    return jsonb_build_object('ok',true,'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.id desc) from
      (select collection_id,before_value,after_value,reason,actor,changed_at,id from public.ox_book_access_history
       where student_id=p_body->>'memberId' order by id desc limit 50) h),'[]'::jsonb));
  end if;
  if p_action='admin_book_set' then
    v_id:=p_body->>'memberId';
    if coalesce(v_id,'')='' or jsonb_typeof(p_body->'active') is distinct from 'boolean'
      or jsonb_typeof(p_body->'collectionIds') is distinct from 'array'
      or jsonb_typeof(p_body->'revision') is distinct from 'number'
      or length(trim(coalesce(p_body->>'reason',''))) not between 1 and 500 then raise exception 'invalid_request'; end if;
    if jsonb_array_length(p_body->'collectionIds') not between 1 and 3
      or exists(select 1 from jsonb_array_elements_text(p_body->'collectionIds') b(id)
        where id is null or id not in ('criminal-law','criminal-procedure-investigation-evidence','criminal-procedure-trial'))
      or (select count(distinct id) from jsonb_array_elements_text(p_body->'collectionIds') b(id))<>jsonb_array_length(p_body->'collectionIds') then raise exception 'invalid_request'; end if;
    if (p_body->>'active')::boolean and (coalesce(p_body->>'purchaseDate','') !~ '^\d{4}-\d{2}-\d{2}$'
      or (p_body->>'purchaseDate')::date > (now() at time zone 'Asia/Seoul')::date) then raise exception 'invalid_request'; end if;
    perform pg_advisory_xact_lock(hashtextextended('ox-member:'||v_id,0));
    if not exists(select 1 from public.students where id=v_id and account_type='student'
      and (is_active or not (p_body->>'active')::boolean)) then raise exception 'student_unavailable'; end if;
    select coalesce((select access_revision from public.ox_members where student_id=v_id),0) into v_access_revision;
    if v_access_revision is distinct from (p_body->>'revision')::integer then raise exception 'access_conflict'; end if;
    if (p_body->>'active')::boolean and exists(select 1 from public.ox_book_access where student_id=v_id and active
      and collection_id in (select jsonb_array_elements_text(p_body->'collectionIds'))) then raise exception 'book_already_active'; end if;
    if not (p_body->>'active')::boolean and exists(select 1 from jsonb_array_elements_text(p_body->'collectionIds') b(id)
      where not public.ox_has_purchased_book(v_id,b.id)) then raise exception 'invalid_request'; end if;
    for v_book in select jsonb_array_elements_text(p_body->'collectionIds') loop
      select to_jsonb(b) into v_old from public.ox_book_access b where student_id=v_id and collection_id=v_book;
      insert into public.ox_book_access(student_id,collection_id,active,purchase_date,source,updated_by)
        values(v_id,v_book,(p_body->>'active')::boolean,case when (p_body->>'active')::boolean then (p_body->>'purchaseDate')::date else null end,'purchase',v_student)
        on conflict(student_id,collection_id) do update set active=excluded.active,
          purchase_date=case when excluded.active then excluded.purchase_date else ox_book_access.purchase_date end,
          source=case when excluded.active then excluded.source else ox_book_access.source end,
          updated_by=excluded.updated_by,updated_at=now() returning * into v_book_row;
      insert into public.ox_book_access_history(student_id,collection_id,before_value,after_value,reason,actor)
        values(v_id,v_book,v_old,to_jsonb(v_book_row),trim(p_body->>'reason'),v_student);
    end loop;
    insert into public.ox_members(student_id,allowed,updated_by,access_revision)
      values(v_id,true,v_student,v_access_revision+1)
      on conflict(student_id) do update set access_revision=excluded.access_revision,updated_by=excluded.updated_by,updated_at=now();
    return jsonb_build_object('ok',true,'revision',v_access_revision+1);
  end if;
  -- Older admin clients may suspend/resume existing scopes, but cannot create all-book access.
  if p_action='admin_member_set' then
    v_id:=p_body->>'memberId';
    if coalesce(v_id,'')='' or jsonb_typeof(p_body->'allowed') is distinct from 'boolean' then raise exception 'invalid_request'; end if;
    perform pg_advisory_xact_lock(hashtextextended('ox-member:'||v_id,0));
    if not exists(select 1 from public.students where id=v_id and account_type='student'
      and (is_active or not (p_body->>'allowed')::boolean)) then raise exception 'student_unavailable'; end if;
    if (p_body->>'allowed')::boolean and not public.ox_has_any_access(v_id) then raise exception 'book_selection_required'; end if;
    if p_body?'revision' and coalesce((select access_revision from public.ox_members where student_id=v_id),0) is distinct from (p_body->>'revision')::integer then raise exception 'access_conflict'; end if;
    select to_jsonb(m) into v_old from public.ox_members m where student_id=v_id;
    insert into public.ox_members(student_id,allowed,updated_by,access_revision) values(v_id,(p_body->>'allowed')::boolean,v_student,1)
      on conflict(student_id) do update set allowed=excluded.allowed,updated_by=excluded.updated_by,updated_at=now(),access_revision=ox_members.access_revision+1
      returning to_jsonb(ox_members.*) into v_new;
    insert into public.ox_book_access_history(student_id,collection_id,before_value,after_value,reason,actor)
      values(v_id,'all',v_old,v_new,case when (p_body->>'allowed')::boolean then 'OX 전체 이용 재개' else 'OX 전체 이용 중지' end,v_student);
    return jsonb_build_object('ok',true,'memberId',v_id,'allowed',(p_body->>'allowed')::boolean);
  end if;
  if p_action = 'admin_import' then
    insert into public.ox_collections select x->>'id',x from jsonb_array_elements(p_body->'collections') x on conflict(id) do nothing;
    insert into public.ox_chapters select x->>'id',x->>'collection_id',x from jsonb_array_elements(p_body->'chapters') x on conflict(id) do nothing;
    insert into public.ox_questions(id,chapter_id,entry,status,reviewed)
      select x->>'id',x->>'chapter_id',x - 'status' - 'reviewed',coalesce(x->>'status','draft'),coalesce((x->>'reviewed')::boolean,false)
      from jsonb_array_elements(p_body->'questions') x on conflict(id) do nothing;
    return jsonb_build_object('ok',true,'count',(select count(*) from public.ox_questions));
  end if;
  if p_action='admin_enabled' then
    update public.ox_config set enabled=(p_body->>'enabled')::boolean where id;
    return jsonb_build_object('ok',true,'enabled',(select enabled from public.ox_config where id));
  end if;
  if p_action='admin_catalog' then
    return jsonb_build_object('ok',true,'enabled',(select enabled from public.ox_config where id),
      'collections',coalesce((select jsonb_agg(entry order by (entry->>'sort_order')::integer) from public.ox_collections),'[]'::jsonb),
      'chapters',coalesce((select jsonb_agg(entry order by collection_id,(entry->>'sort_order')::integer) from public.ox_chapters),'[]'::jsonb),
      'counts',(select jsonb_build_object('total',count(*),'published',count(*) filter(where status='published'),'draft',count(*) filter(where status='draft'),'archived',count(*) filter(where status='archived'),'unreviewed',count(*) filter(where not reviewed)) from public.ox_questions));
  end if;
  if p_action='admin_list' then
    select count(*) into v_count from public.ox_questions q
      where (coalesce(p_body->>'chapterId','')='' or q.chapter_id=p_body->>'chapterId')
      and (coalesce(p_body->>'status','')='' or q.status=p_body->>'status')
      and (coalesce(p_body->>'search','')='' or position(lower(p_body->>'search') in lower(q.entry->>'prompt'))>0 or q.id=p_body->>'search')
      and (not coalesce((p_body->>'unreviewed')::boolean,false) or not q.reviewed);
    select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into v_items from (
      select q.id,q.chapter_id,q.entry,q.status,q.reviewed,q.revision,q.content_version,q.updated_at from public.ox_questions q
      where (coalesce(p_body->>'chapterId','')='' or q.chapter_id=p_body->>'chapterId')
      and (coalesce(p_body->>'status','')='' or q.status=p_body->>'status')
      and (coalesce(p_body->>'search','')='' or position(lower(p_body->>'search') in lower(q.entry->>'prompt'))>0 or q.id=p_body->>'search')
      and (not coalesce((p_body->>'unreviewed')::boolean,false) or not q.reviewed)
      order by q.chapter_id,coalesce(nullif(q.entry->>'source_question_number',''),'0')::integer,q.entry->>'source_option_label',q.id
      limit 30 offset v_page*30
    ) t;
    return jsonb_build_object('ok',true,'items',v_items,'total',v_count,'page',v_page);
  end if;
  if p_action='admin_history' then
    return jsonb_build_object('ok',true,'history',coalesce((select jsonb_agg(to_jsonb(t)) from (select actor,before_value,after_value,changed_at from public.ox_question_history where question_id=p_body->>'id' order by changed_at desc limit 10)t),'[]'::jsonb));
  end if;
  if p_action='admin_save' then
    v_entry:=p_body->'question'; v_id:=v_entry->>'id'; v_status:=p_body->>'status';
    v_reviewed:=coalesce((p_body->>'reviewed')::boolean,false);
    if length(coalesce(v_id,'')) not between 1 and 120 or length(coalesce(v_entry->>'prompt','')) not between 1 and 15000
      or length(coalesce(v_entry->>'explanation_html','')) not between 1 and 30000 or coalesce(v_entry->>'correct_answer','') not in ('O','X')
      or coalesce(v_status,'') not in ('draft','published','archived') or (v_status='published' and not v_reviewed)
      or not exists(select 1 from public.ox_chapters where id=v_entry->>'chapter_id') then raise exception 'invalid_question'; end if;
    perform pg_advisory_xact_lock(hashtextextended('ox-question:'||v_id,0));
    select * into v_question from public.ox_questions where id=v_id for update;
    if found then
      if v_question.revision is distinct from (p_body->>'revision')::integer then raise exception 'revision_conflict'; end if;
      v_entry := v_question.entry || jsonb_build_object('chapter_id',v_entry->>'chapter_id','prompt',v_entry->>'prompt','context',coalesce(v_entry->>'context',''),'correct_answer',v_entry->>'correct_answer','explanation_html',v_entry->>'explanation_html','explanation',regexp_replace(v_entry->>'explanation_html','</?u>','','g'));
      v_old:=to_jsonb(v_question);
      v_version:=v_question.content_version + case when (v_question.entry->>'prompt',v_question.entry->>'context',v_question.entry->>'correct_answer',v_question.chapter_id)
        is distinct from (v_entry->>'prompt',v_entry->>'context',v_entry->>'correct_answer',v_entry->>'chapter_id') then 1 else 0 end;
      update public.ox_questions set entry=v_entry,chapter_id=v_entry->>'chapter_id',status=v_status,reviewed=v_reviewed,
        content_version=v_version,revision=revision+1,updated_at=now() where id=v_id returning to_jsonb(ox_questions.*) into v_new;
    else
      if coalesce((p_body->>'revision')::integer,0) <> 0 then raise exception 'revision_conflict'; end if;
      insert into public.ox_questions(id,chapter_id,entry,status,reviewed) values(v_id,v_entry->>'chapter_id',v_entry,v_status,v_reviewed)
        returning to_jsonb(ox_questions.*) into v_new;
    end if;
    insert into public.ox_question_history(question_id,actor,before_value,after_value) values(v_id,v_student,v_old,v_new);
    return jsonb_build_object('ok',true,'item',v_new);
  end if;
  if v_admin then raise exception 'unsupported_action'; end if;
  if p_action='status' then
    return jsonb_build_object('ok',true,'enabled',coalesce((select enabled from public.ox_config where id),false)
      and exists(select 1 from public.ox_members where student_id=v_student and allowed)
      and public.ox_has_any_access(v_student),
      'hasAccessHistory',exists(select 1 from public.ox_book_access where student_id=v_student) or exists(select 1 from public.ox_grant_recipients where student_id=v_student));
  end if;
  if not coalesce((select enabled from public.ox_config where id),false) then raise exception 'ox_disabled'; end if;
  if not exists(select 1 from public.ox_members where student_id=v_student and allowed) then raise exception 'ox_not_registered'; end if;
  if not public.ox_has_any_access(v_student) then raise exception 'ox_book_required'; end if;

  if p_action='bootstrap' then
    select coalesce(jsonb_agg((case when p.question_id is not null then q.entry else q.entry-'correct_answer' end)-'original_prompt'-'original_context'-'explanation'-'explanation_html'-'underline_count'
      ||jsonb_build_object('version',q.content_version) order by q.chapter_id,coalesce(nullif(q.entry->>'source_question_number',''),'0')::integer,q.entry->>'source_option_label',q.id),'[]'::jsonb)
      into v_questions from public.ox_questions q left join public.ox_progress p on p.student_id=v_student and p.question_id=q.id and p.content_version=q.content_version where q.status='published' and exists(select 1 from public.ox_chapters access_ch where access_ch.id=q.chapter_id and public.ox_has_book(v_student,access_ch.collection_id));
    return jsonb_build_object('ok',true,'catalog',jsonb_build_object(
      'collections',coalesce((select jsonb_agg(entry||jsonb_build_object('accessible',public.ox_has_book(v_student,id)) order by (entry->>'sort_order')::integer) from public.ox_collections),'[]'::jsonb),
      'chapters',coalesce((select jsonb_agg(c.entry||jsonb_build_object('question_count',(select count(*) from public.ox_questions q where q.chapter_id=c.id and q.status='published')) order by (c.entry->>'sort_order')::integer) from public.ox_chapters c where public.ox_has_book(v_student,c.collection_id)),'[]'::jsonb),
      'questions',v_questions),
      'progress',coalesce((select jsonb_agg(to_jsonb(p)-'student_id') from public.ox_progress p join public.ox_questions q on q.id=p.question_id and q.content_version=p.content_version where p.student_id=v_student and q.status='published' and exists(select 1 from public.ox_chapters access_ch where access_ch.id=q.chapter_id and public.ox_has_book(v_student,access_ch.collection_id))),'[]'::jsonb),
      'notes',coalesce((select jsonb_agg((to_jsonb(n)-'student_id'-'memo')||jsonb_build_object('has_memo',n.memo<>'')) from public.ox_notes n join public.ox_questions q on q.id=n.question_id where n.student_id=v_student and exists(select 1 from public.ox_chapters access_ch where access_ch.id=q.chapter_id and public.ox_has_book(v_student,access_ch.collection_id))),'[]'::jsonb),
      'statistics',coalesce((select jsonb_object_agg(t.question_id,jsonb_build_object('answered',t.answered,'wrong',t.wrong)) from (select a.question_id,count(*) answered,count(*) filter(where not a.correct) wrong from public.ox_attempts a join public.ox_questions q on q.id=a.question_id and q.content_version=a.content_version where a.is_first and exists(select 1 from public.ox_chapters access_ch where access_ch.id=q.chapter_id and public.ox_has_book(v_student,access_ch.collection_id)) and exists(select 1 from public.ox_progress p where p.student_id=v_student and p.question_id=q.id and p.content_version=q.content_version) group by a.question_id)t),'{}'::jsonb),
      'todayCount',(select count(*) from public.ox_attempts a join public.ox_questions q on q.id=a.question_id where a.student_id=v_student and exists(select 1 from public.ox_chapters access_ch where access_ch.id=q.chapter_id and public.ox_has_book(v_student,access_ch.collection_id)) and a.answered_at >= (date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')));
  end if;
  v_id:=p_body->>'questionId';
  select * into v_question from public.ox_questions where id=v_id and status='published' for share;
  if not found then raise exception 'question_unavailable'; end if;
  if not exists(select 1 from public.ox_chapters c where c.id=v_question.chapter_id and public.ox_has_book(v_student,c.collection_id)) then raise exception 'ox_book_required'; end if;
  if v_question.content_version is distinct from (p_body->>'version')::integer then raise exception 'question_changed'; end if;
  if p_action='detail' then
    if not exists(select 1 from public.ox_progress where student_id=v_student and question_id=v_id and content_version=v_question.content_version) then raise exception 'answer_required'; end if;
    return jsonb_build_object('ok',true,'question',(v_question.entry-'original_prompt'-'original_context'-'explanation')||jsonb_build_object('version',v_question.content_version),
      'note',(select to_jsonb(n)-'student_id' from public.ox_notes n where student_id=v_student and question_id=v_id));
  end if;
  if p_action='submit' then
    v_answer:=p_body->>'answer'; v_submission:=(p_body->>'submissionId')::uuid;
    if coalesce(v_answer,'') not in ('O','X') or v_submission is null then raise exception 'invalid_answer'; end if;
    perform pg_advisory_xact_lock(hashtextextended('ox-submission:'||v_student||':'||v_submission,0));
    select * into v_existing from public.ox_attempts where student_id=v_student and submission_id=v_submission;
    if found then
      if v_existing.question_id<>v_id or v_existing.content_version<>v_question.content_version or v_existing.answer<>v_answer then raise exception 'submission_conflict'; end if;
    else
      perform pg_advisory_xact_lock(hashtextextended('ox-progress:'||v_student||':'||v_id,0));
      v_first:=not exists(select 1 from public.ox_progress where student_id=v_student and question_id=v_id and content_version=v_question.content_version);
      insert into public.ox_attempts values(v_student,v_submission,v_id,v_question.content_version,v_answer,v_answer=v_question.entry->>'correct_answer',v_first,now());
      insert into public.ox_progress values(v_student,v_id,v_question.content_version,v_answer,v_answer=v_question.entry->>'correct_answer',case when v_answer=v_question.entry->>'correct_answer' then 0 else 1 end,now())
      on conflict(student_id,question_id,content_version) do update set answer=excluded.answer,correct=excluded.correct,wrong_count=ox_progress.wrong_count+excluded.wrong_count,answered_at=excluded.answered_at;
      if v_answer<>v_question.entry->>'correct_answer' then update public.ox_notes set mastered_version=null,updated_at=now() where student_id=v_student and question_id=v_id; end if;
    end if;
    select count(*),count(*) filter(where not correct) into v_count,v_wrong from public.ox_attempts where question_id=v_id and content_version=v_question.content_version and is_first;
    return jsonb_build_object('ok',true,'question',v_question.entry||jsonb_build_object('version',v_question.content_version),
      'progress',(select to_jsonb(p)-'student_id' from public.ox_progress p where student_id=v_student and question_id=v_id and content_version=v_question.content_version),
      'note',(select to_jsonb(n)-'student_id' from public.ox_notes n where student_id=v_student and question_id=v_id),
      'statistics',jsonb_build_object('answered',v_count,'wrong',v_wrong));
  end if;
  if p_action='note' then
    if length(coalesce(p_body->>'memo',''))>5000 then raise exception 'invalid_memo'; end if;
    if coalesce((p_body->>'mastered')::boolean,false) and not exists(select 1 from public.ox_progress where student_id=v_student and question_id=v_id and content_version=v_question.content_version) then raise exception 'answer_required'; end if;
    perform pg_advisory_xact_lock(hashtextextended('ox-progress:'||v_student||':'||v_id,0));
    insert into public.ox_notes(student_id,question_id) values(v_student,v_id) on conflict do nothing;
    update public.ox_notes set
      memo=case when p_body?'memo' then p_body->>'memo' else memo end,
      bookmark=case when p_body?'bookmark' then (p_body->>'bookmark')::boolean else bookmark end,
      mastered_version=case when p_body?'mastered' then case when (p_body->>'mastered')::boolean then v_question.content_version else null end else mastered_version end,
      updated_at=now() where student_id=v_student and question_id=v_id returning * into v_note;
    return jsonb_build_object('ok',true,'note',to_jsonb(v_note)-'student_id');
  end if;
  raise exception 'unsupported_action';
end $$;
