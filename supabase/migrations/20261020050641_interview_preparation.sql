-- Interview preparation is additive. Existing student categories/auth are unchanged.
-- Browser roles have NO direct access; the API verifies device/admin credentials.
begin;
create table public.ip_settings (
  id boolean primary key default true check(id),
  enabled boolean not null default false
);
insert into public.ip_settings(id) values(true);
create table public.ip_topics (
  id text primary key,
  title text not null check(length(title) between 1 and 100),
  kind text not null check(kind in ('experience','value','situation')),
  guidance text not null default '',
  required boolean not null default true,
  tracks text[] not null default '{}',
  sort_order integer not null default 0,
  active boolean not null default true,
  revision integer not null default 1
);
create table public.ip_sources (
  id text primary key, filename text not null, sha256 text not null, track text not null
);
create table public.ip_questions (
  id text primary key,
  prompt text not null check(length(prompt) between 1 and 4000),
  category text not null check(category in ('personality','job')),
  topic_ids text[] not null default '{}',
  tracks text[] not null default '{}',
  status text not null default 'draft' check(status in ('draft','published','archived')),
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ip_questions_topics on public.ip_questions using gin(topic_ids);
create index ip_questions_tracks on public.ip_questions using gin(tracks);
create index ip_questions_status on public.ip_questions(status,id);
create index ip_questions_category_status on public.ip_questions(category,status,id);
create table public.ip_occurrences (
  id text primary key,
  source_id text not null references public.ip_sources(id),
  question_id text not null references public.ip_questions(id),
  number text not null,
  year integer,
  region text not null default '',
  section_title text not null default '',
  locator text not null,
  original_prompt text not null,
  answer text not null default ''
);
create index ip_occurrences_question on public.ip_occurrences(question_id);
create index ip_occurrences_source on public.ip_occurrences(source_id);
create table public.ip_members (
  student_id text primary key references public.students(id) on delete cascade,
  track text not null check(track in ('공채','항해','기관','방제','관제','기타')),
  exam_number text not null check(length(exam_number) between 1 and 80),
  enabled boolean not null default true,
  expires_on date,
  updated_at timestamptz not null default now()
);
create table public.ip_notes (
  student_id text not null references public.ip_members(student_id) on delete cascade,
  topic_id text not null references public.ip_topics(id),
  fields jsonb not null default '{}' check(jsonb_typeof(fields)='object'),
  status text not null default 'draft' check(status in ('draft','submitted','needs_revision','approved','no_experience')),
  feedback text not null default '',
  revision integer not null default 1,
  topic_revision integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key(student_id,topic_id)
);
create index ip_notes_topic_status on public.ip_notes(topic_id,status);
create table public.ip_history (
  id bigint generated always as identity primary key,
  student_id text references public.students(id) on delete cascade,
  entity text not null,
  entity_id text not null,
  actor_id text not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);
create index ip_history_lookup on public.ip_history(entity,entity_id,id desc);
create index ip_history_student on public.ip_history(student_id);
comment on table public.ip_notes is 'Student-owned personality preparation only. Job questions never create notebook rows.';
insert into public.ip_topics(id,title,kind,guidance,sort_order) values
 ('self','자기이해·강점과 약점','experience','자신의 특성을 실제 행동으로 보여준 경험을 정리하세요.',1),
 ('motivation','지원동기·직무 준비','value','지원 계기, 해양경찰 직무와의 연결, 실제 준비 노력을 적어주세요.',2),
 ('teamwork','협동심·팀워크','experience','공동 목표를 위해 본인이 맡은 역할과 협력한 방법을 적어주세요.',3),
 ('communication','소통·갈등 해결','experience','의견 차이를 어떻게 이해하고 조율했는지 구체적으로 적어주세요.',4),
 ('leadership','리더십·팔로워십','experience','팀에서 맡은 역할과 다른 구성원을 지원한 행동을 적어주세요.',5),
 ('achievement','도전·성취','experience','목표, 어려움, 꾸준히 실행한 행동과 실제 결과를 적어주세요.',6),
 ('failure','실패·성장','experience','실패나 실수를 인정하고 이후 바꾼 행동을 적어주세요.',7),
 ('responsibility','책임감·헌신','experience','맡은 일을 끝까지 수행하거나 부담을 감수한 경험을 적어주세요.',8),
 ('service','봉사·배려','experience','다른 사람의 필요를 이해하고 도운 경험을 적어주세요.',9),
 ('integrity','정직·청렴·공정','value','본인의 판단 기준과 그 기준을 적용할 방법을 적어주세요.',10),
 ('public','공직관·사명감','value','공직자로서 지킬 가치와 이유, 실천 방법을 적어주세요.',11),
 ('stress','스트레스·감정 관리','experience','스트레스를 느낀 상황, 당시 감정, 대처와 배운 점을 적어주세요.',12),
 ('judgement','인성 상황 판단','situation','갈등이나 가치관이 충돌하는 상황에서 본인의 판단 기준과 행동 순서를 적어주세요.',13);
insert into public.ip_topics(id,title,kind,guidance,required,active,sort_order)
  values('unclassified','분류 검토 필요','value','자동 분류되지 않은 질문입니다. 적합한 활성 준비 항목에 연결한 후 공개하세요.',false,false,999);

-- Server-only transactional boundary. p_actor is created from verified credentials,
-- never accepted from a browser body. All writes use optimistic concurrency.
create function public.ip_service(p_action text,p_actor jsonb,p_body jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = public,pg_temp as $$
declare
  v_admin boolean := p_actor->>'type'='admin';
  v_id text := p_actor->>'id';
  v_enabled boolean;
  v_member ip_members;
  v_topic ip_topics;
  v_note ip_notes;
  v_question ip_questions;
  v_result jsonb;
  v_rows jsonb;
  v_revision integer := coalesce((p_body->>'revision')::int,0);
  v_page integer := greatest(0,least(100000,coalesce((p_body->>'page')::int,0)));
  v_target text;
  v_fields jsonb;
  v_status text;
  v_keys text[];
  v_topic_ids text[];
  v_tracks text[];
  v_key text;
  v_item jsonb;
begin
  if coalesce(v_id,'')='' then raise exception 'unauthorized'; end if;
  select enabled into v_enabled from ip_settings where id;
  if p_action like 'admin_%' then
    if not coalesce(v_admin,false) then raise exception 'forbidden'; end if;
  else
    if coalesce(v_admin,false) then raise exception 'forbidden'; end if;
    select m.* into v_member from ip_members m join students s on s.id=m.student_id
      where m.student_id=v_id and s.is_active and coalesce(s.account_type,'student')='student';
    if p_action='status' then
      return jsonb_build_object('ok',true,'enabled',coalesce(v_enabled and v_member.enabled and
        (v_member.expires_on is null or v_member.expires_on>=current_date),false));
    end if;
    if not coalesce(v_enabled and v_member.enabled and
      (v_member.expires_on is null or v_member.expires_on>=current_date),false) then raise exception 'not_enrolled'; end if;
  end if;

  if p_action in ('bootstrap','admin_catalog') then
    select coalesce(jsonb_agg(to_jsonb(t) order by t.sort_order,t.id),'[]') into v_rows from ip_topics t
      where (v_admin or (t.active and (cardinality(t.tracks)=0 or v_member.track=any(t.tracks))));
    v_result:=jsonb_build_object('ok',true,'enabled',v_enabled,'topics',v_rows);
    if v_admin then
      return v_result || jsonb_build_object('counts',(select jsonb_build_object('total',count(*),
        'draft',count(*) filter(where status='draft'),'published',count(*) filter(where status='published')) from ip_questions),
        'categoryCounts',(select jsonb_object_agg(category,stats) from (
          select category,jsonb_build_object('total',count(*),'draft',count(*) filter(where status='draft'),'published',count(*) filter(where status='published')) stats
          from ip_questions group by category) c),
        'sources',(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from ip_sources s));
    end if;
    return v_result || jsonb_build_object('member',to_jsonb(v_member),'notes',
      (select coalesce(jsonb_agg(to_jsonb(n)),'[]') from ip_notes n where n.student_id=v_id));
  elsif p_action='admin_enabled' then
    update ip_settings set enabled=(p_body->>'enabled')::boolean where id;
    return jsonb_build_object('ok',true);
  elsif p_action='admin_member_save' then
    v_target:=p_body->>'targetStudentId';
    if not exists(select 1 from students where id=v_target and is_active and coalesce(account_type,'student')='student') then raise exception 'student_unavailable'; end if;
    insert into ip_members(student_id,track,exam_number,enabled,expires_on)
      values(v_target,p_body->>'track',btrim(p_body->>'examNumber'),(p_body->>'enabled')::boolean,nullif(p_body->>'expiresOn','')::date)
      on conflict(student_id) do update set track=excluded.track,exam_number=excluded.exam_number,enabled=excluded.enabled,expires_on=excluded.expires_on,updated_at=now();
    insert into ip_history(entity,entity_id,actor_id,snapshot,student_id) select 'member',v_target,v_id,to_jsonb(m),v_target from ip_members m where student_id=v_target;
    return jsonb_build_object('ok',true);
  elsif p_action='admin_members' then
    select coalesce(jsonb_agg(x),'[]') into v_rows from (
      select s.id,s.name,m.track,m.exam_number,m.enabled,m.expires_on,
        coalesce((select jsonb_agg(jsonb_build_object('topic_id',n.topic_id,'status',n.status,'topic_revision',n.topic_revision)) from ip_notes n where n.student_id=s.id),'[]') as notes
      from students s left join ip_members m on m.student_id=s.id
      where s.is_active and coalesce(s.account_type,'student')='student'
      and (coalesce(p_body->>'search','')='' or strpos(s.id, p_body->>'search')>0 or strpos(s.name,p_body->>'search')>0)
      and (coalesce((p_body->>'registeredOnly')::boolean,true)=false or m.student_id is not null)
      and (coalesce(p_body->>'noteStatus','')='' or exists(
        select 1 from ip_topics t left join ip_notes n on n.topic_id=t.id and n.student_id=s.id
        where t.active and m.student_id is not null and (cardinality(t.tracks)=0 or m.track=any(t.tracks))
        and (coalesce(p_body->>'topicId','')='' or t.id=p_body->>'topicId')
        and (case when p_body->>'noteStatus'='empty' then n.student_id is null
          when p_body->>'noteStatus'='changed' then n.topic_revision<>t.revision
          else n.status=p_body->>'noteStatus' end)))
      order by s.id limit 30 offset v_page*30
    ) x;
    return jsonb_build_object('ok',true,'members',v_rows);
  elsif p_action in ('questions','admin_questions') then
    select coalesce(jsonb_agg(x),'[]') into v_rows from (
      select q.*,(select count(*) from ip_occurrences o where o.question_id=q.id) as source_count
      from ip_questions q where
      q.category=coalesce(nullif(p_body->>'category',''),'personality') and
      (v_admin or (q.status='published' and (cardinality(q.tracks)=0 or v_member.track=any(q.tracks))))
      and (coalesce(p_body->>'status','')='' or q.status=p_body->>'status')
      and (coalesce(p_body->>'topicId','')='' or p_body->>'topicId'=any(q.topic_ids))
      and (coalesce(p_body->>'track','')='' or p_body->>'track'=any(q.tracks))
      and (coalesce(p_body->>'search','')='' or strpos(q.prompt,p_body->>'search')>0)
      order by q.id limit 30 offset v_page*30
    ) x;
    return jsonb_build_object('ok',true,'questions',v_rows);
  elsif p_action in ('question_detail','admin_question_detail') then
    select * into v_question from ip_questions where id=p_body->>'id';
    if not found or (not v_admin and (v_question.status<>'published' or
      (cardinality(v_question.tracks)>0 and not(v_member.track=any(v_question.tracks))))) then raise exception 'question_unavailable'; end if;
    select coalesce(jsonb_agg(case when v_admin then to_jsonb(o)||jsonb_build_object('filename',s.filename,'track',s.track)
      else jsonb_build_object('number',o.number,'year',o.year,'region',o.region,'section_title',o.section_title,'filename',s.filename,'track',s.track) end),'[]')
      into v_rows from ip_occurrences o join ip_sources s on s.id=o.source_id where o.question_id=v_question.id;
    return jsonb_build_object('ok',true,'question',to_jsonb(v_question),'sources',v_rows);
  elsif p_action='admin_question_save' then
    v_target:=coalesce(nullif(p_body->>'id',''),'manual-'||gen_random_uuid()::text);
    v_topic_ids:=array(select jsonb_array_elements_text(p_body->'topicIds'));
    v_tracks:=array(select jsonb_array_elements_text(p_body->'tracks'));
    if p_body->>'category' not in ('personality','job') then raise exception 'invalid_request'; end if;
    if (p_body->>'category'='personality' and cardinality(v_topic_ids)=0) or
      (p_body->>'category'='job' and cardinality(v_topic_ids)>0) or
      exists(select 1 from unnest(v_topic_ids) t where not exists(select 1 from ip_topics where id=t and active)) then raise exception 'invalid_topic'; end if;
    if not v_tracks <@ array['공채','항해','기관','방제','관제','기타']::text[] then raise exception 'invalid_request'; end if;
    perform pg_advisory_xact_lock(hashtextextended('question:'||v_target,0));
    select * into v_question from ip_questions where id=v_target for update;
    if coalesce(v_question.revision,0)<>v_revision then raise exception 'revision_conflict'; end if;
    insert into ip_questions(id,prompt,category,topic_ids,tracks,status,revision)
      values(v_target,btrim(p_body->>'prompt'),p_body->>'category',v_topic_ids,v_tracks,p_body->>'status',v_revision+1)
      on conflict(id) do update set prompt=excluded.prompt,category=excluded.category,topic_ids=excluded.topic_ids,tracks=excluded.tracks,status=excluded.status,revision=excluded.revision,updated_at=now();
    insert into ip_history(entity,entity_id,actor_id,snapshot) select 'question',v_target,v_id,to_jsonb(q) from ip_questions q where id=v_target;
    return jsonb_build_object('ok',true,'id',v_target);
  elsif p_action='admin_question_publish' then
    if jsonb_array_length(p_body->'items') not between 1 and 30 then raise exception 'invalid_request'; end if;
    for v_item in select value from jsonb_array_elements(p_body->'items') order by value->>'id' loop
      select * into v_question from ip_questions where id=v_item->>'id';
      if not found then raise exception 'question_unavailable'; end if;
      perform ip_service('admin_question_save',p_actor,jsonb_build_object('id',v_question.id,'revision',v_item->'revision',
        'prompt',v_question.prompt,'category',v_question.category,'topicIds',to_jsonb(v_question.topic_ids),'tracks',to_jsonb(v_question.tracks),'status','published'));
    end loop;
    return jsonb_build_object('ok',true);
  elsif p_action='admin_question_delete' then
    select * into v_question from ip_questions where id=p_body->>'id' for update;
    if not found or v_question.revision<>v_revision then raise exception 'revision_conflict'; end if;
    insert into ip_history(entity,entity_id,actor_id,snapshot) values('question',v_question.id,v_id,to_jsonb(v_question));
    if v_question.status='draft' and not exists(select 1 from ip_occurrences where question_id=v_question.id)
      and not exists(select 1 from ip_history where entity='question' and entity_id=v_question.id and snapshot->>'status'='published') then
      delete from ip_questions where id=v_question.id; v_status:='deleted';
    else
      update ip_questions set status='archived',revision=revision+1,updated_at=now() where id=v_question.id; v_status:='archived';
    end if;
    return jsonb_build_object('ok',true,'result',v_status);
  elsif p_action='admin_topic_save' then
    v_target:=coalesce(nullif(p_body->>'id',''),'topic-'||gen_random_uuid()::text);
    v_tracks:=array(select jsonb_array_elements_text(p_body->'tracks'));
    if not v_tracks <@ array['공채','항해','기관','방제','관제','기타']::text[] then raise exception 'invalid_request'; end if;
    perform pg_advisory_xact_lock(hashtextextended('topic:'||v_target,0));
    select * into v_topic from ip_topics where id=v_target for update;
    if coalesce(v_topic.revision,0)<>v_revision then raise exception 'revision_conflict'; end if;
    -- Changing a filled-in template's kind would silently reinterpret student fields.
    if v_topic.id is not null and v_topic.kind<>p_body->>'kind' and exists(select 1 from ip_notes where topic_id=v_target) then raise exception 'topic_in_use'; end if;
    insert into ip_topics(id,title,kind,guidance,required,tracks,sort_order,active,revision)
      values(v_target,btrim(p_body->>'title'),p_body->>'kind',p_body->>'guidance',(p_body->>'required')::boolean,v_tracks,(p_body->>'sortOrder')::int,(p_body->>'active')::boolean,v_revision+1)
      on conflict(id) do update set title=excluded.title,kind=excluded.kind,guidance=excluded.guidance,required=excluded.required,tracks=excluded.tracks,sort_order=excluded.sort_order,active=excluded.active,revision=excluded.revision;
    insert into ip_history(entity,entity_id,actor_id,snapshot) select 'topic',v_target,v_id,to_jsonb(t) from ip_topics t where id=v_target;
    return jsonb_build_object('ok',true);
  elsif p_action='note_save' then
    v_target:=p_body->>'topicId';
    select * into v_topic from ip_topics where id=v_target and active and (cardinality(tracks)=0 or v_member.track=any(tracks));
    if not found then raise exception 'invalid_topic'; end if;
    if v_topic.revision<>coalesce((p_body->>'topicRevision')::int,0) then raise exception 'topic_changed'; end if;
    v_fields:=p_body->'fields'; v_status:=p_body->>'status';
    if jsonb_typeof(v_fields)<>'object' or length(v_fields::text)>20000 or v_status not in ('draft','submitted','no_experience') then raise exception 'invalid_request'; end if;
    v_keys:=case v_topic.kind when 'experience' then array['situation','role','action','result','learning']
      when 'value' then array['position','reason','application'] when 'situation' then array['criteria','steps','caution']
      else array['concept','evidence','application'] end;
    if exists(select 1 from jsonb_each(v_fields) e where jsonb_typeof(e.value)<>'string' or not(e.key=any(v_keys||array['help']))) then raise exception 'invalid_request'; end if;
    if v_status='submitted' then
      foreach v_key in array v_keys loop
        if length(btrim(coalesce(v_fields->>v_key,'')))<10 then raise exception 'incomplete_note'; end if;
      end loop;
    elsif v_status='no_experience' and length(btrim(coalesce(v_fields->>'help','')))<5 then raise exception 'help_reason_required';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('note:'||v_id||':'||v_target,0));
    select * into v_note from ip_notes where student_id=v_id and topic_id=v_target for update;
    if coalesce(v_note.revision,0)<>v_revision then raise exception 'revision_conflict'; end if;
    insert into ip_notes(student_id,topic_id,fields,status,revision,topic_revision)
      values(v_id,v_target,v_fields,v_status,v_revision+1,v_topic.revision)
      on conflict(student_id,topic_id) do update set fields=excluded.fields,status=excluded.status,revision=excluded.revision,topic_revision=excluded.topic_revision,updated_at=now();
    insert into ip_history(entity,entity_id,actor_id,snapshot,student_id) select 'note',v_id||':'||v_target,v_id,to_jsonb(n),v_id from ip_notes n where student_id=v_id and topic_id=v_target;
    return jsonb_build_object('ok',true,'note',(select to_jsonb(n) from ip_notes n where student_id=v_id and topic_id=v_target));
  elsif p_action='admin_note_detail' then
    select * into v_note from ip_notes where student_id=p_body->>'targetStudentId' and topic_id=p_body->>'topicId';
    if not found then raise exception 'invalid_request'; end if;
    return jsonb_build_object('ok',true,'note',to_jsonb(v_note));
  elsif p_action='admin_feedback' then
    select * into v_note from ip_notes where student_id=p_body->>'targetStudentId' and topic_id=p_body->>'topicId' for update;
    if not found or v_note.revision<>v_revision then raise exception 'revision_conflict'; end if;
    if p_body->>'status' not in ('needs_revision','approved') or length(btrim(coalesce(p_body->>'feedback','')))=0 then raise exception 'invalid_request'; end if;
    if p_body->>'status'='approved' and v_note.status not in ('submitted','approved') then raise exception 'not_submitted'; end if;
    if p_body->>'status'='approved' and v_note.topic_revision<>(select revision from ip_topics where id=v_note.topic_id) then raise exception 'topic_changed'; end if;
    update ip_notes set status=p_body->>'status',feedback=p_body->>'feedback',revision=revision+1,updated_at=now()
      where student_id=v_note.student_id and topic_id=v_note.topic_id;
    insert into ip_history(entity,entity_id,actor_id,snapshot,student_id) select 'note',n.student_id||':'||n.topic_id,v_id,to_jsonb(n),n.student_id from ip_notes n where student_id=v_note.student_id and topic_id=v_note.topic_id;
    return jsonb_build_object('ok',true);
  elsif p_action in ('history','admin_history') then
    v_target:=case when v_admin then p_body->>'targetStudentId' else v_id end;
    select coalesce(jsonb_agg(x),'[]') into v_rows from (
      select id,snapshot,created_at from ip_history where entity='note' and student_id=v_target and entity_id=v_target||':'||(p_body->>'topicId')
      order by id desc limit 20 offset v_page*20
    ) x;
    return jsonb_build_object('ok',true,'history',v_rows);
  end if;
  raise exception 'unsupported_action';
end $$;

do $$ declare t text; begin
  foreach t in array array['ip_settings','ip_topics','ip_sources','ip_questions','ip_occurrences','ip_members','ip_notes','ip_history'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end $$;
grant usage,select on sequence public.ip_history_id_seq to service_role;
revoke all on function public.ip_service(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ip_service(text,jsonb,jsonb) to service_role;
commit;
