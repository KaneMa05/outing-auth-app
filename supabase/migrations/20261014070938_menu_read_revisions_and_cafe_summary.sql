-- Additive read invalidation. Revision changes commit atomically with their source rows.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';
create table public.app_read_revisions (name text primary key, revision bigint not null default 1);
alter table public.app_read_revisions enable row level security;
revoke all on public.app_read_revisions from public, anon, authenticated;
grant select on public.app_read_revisions to anon, authenticated, service_role;
create policy read_revision_numbers on public.app_read_revisions for select to anon, authenticated using (true);
insert into public.app_read_revisions(name) values ('students'),('notices'),('track_options'),('exams'),('exam_sections'),('exam_answers'),('exam_files'),('exam_subject_settings'),('outings'),('outing_photos');
create schema if not exists private;
-- Trigger-only function: callers cannot supply a table name or execute it directly.
-- RLS remains intact on source tables; this only advances a non-personal counter.
create function private.advance_app_read_revision() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if TG_TABLE_SCHEMA <> 'public' then raise exception 'invalid revision source'; end if;
  -- Ignore empty upserts and unchanged updates used by legacy save paths.
  -- Transition relations are scoped to this statement, not caller-owned tables.
  if TG_OP = 'INSERT' then
    if not exists (select 1 from new_rows) then return null; end if;
  elsif TG_OP = 'DELETE' then
    if not exists (select 1 from old_rows) then return null; end if;
  elsif TG_OP = 'UPDATE' then
    if not exists (
      select pg_catalog.to_jsonb(n) from new_rows n
      except select pg_catalog.to_jsonb(o) from old_rows o
    ) then return null; end if;
  end if;
  update public.app_read_revisions set revision = revision + 1 where name = TG_TABLE_NAME;
  return null;
end;
$$;
revoke all on function private.advance_app_read_revision() from public, anon, authenticated, service_role;
create trigger app_read_revision_insert after insert on public.students referencing new table as new_rows for each statement execute function private.advance_app_read_revision();
create trigger app_read_revision_update after update on public.students referencing old table as old_rows new table as new_rows for each statement execute function private.advance_app_read_revision();
create trigger app_read_revision_delete after delete on public.students referencing old table as old_rows for each statement execute function private.advance_app_read_revision();
create trigger app_read_revision_truncate after truncate on public.students for each statement execute function private.advance_app_read_revision();
create trigger app_read_revision_insert after insert on public.notices referencing new table as new_rows for each statement execute function private.advance_app_read_revision();
create trigger app_read_revision_update after update on public.notices referencing old table as old_rows new table as new_rows for each statement execute function private.advance_app_read_revision();
create trigger app_read_revision_delete after delete on public.notices referencing old table as old_rows for each statement execute function private.advance_app_read_revision();
create trigger app_read_revision_truncate after truncate on public.notices for each statement execute function private.advance_app_read_revision();
create trigger app_read_revision_insert after insert on public.track_options referencing new table as new_rows for each statement execute function private.advance_app_read_revision();
create trigger app_read_revision_update after update on public.track_options referencing old table as old_rows new table as new_rows for each statement execute function private.advance_app_read_revision();
create trigger app_read_revision_delete after delete on public.track_options referencing old table as old_rows for each statement execute function private.advance_app_read_revision();
create trigger app_read_revision_truncate after truncate on public.track_options for each statement execute function private.advance_app_read_revision();
create trigger app_read_revision_insert after insert on public.exams referencing new table as new_rows for each statement execute function private.advance_app_read_revision();
create trigger app_read_revision_update after update on public.exams referencing old table as old_rows new table as new_rows for each statement execute function private.advance_app_read_revision();
create trigger app_read_revision_delete after delete on public.exams referencing old table as old_rows for each statement execute function private.advance_app_read_revision();
create trigger app_read_revision_truncate after truncate on public.exams for each statement execute function private.advance_app_read_revision();
create trigger app_read_revision_insert after insert on public.exam_sections referencing new table as new_rows for each statement execute function private.advance_app_read_revision();
create trigger app_read_revision_update after update on public.exam_sections referencing old table as old_rows new table as new_rows for each statement execute function private.advance_app_read_revision();
create trigger app_read_revision_delete after delete on public.exam_sections referencing old table as old_rows for each statement execute function private.advance_app_read_revision();
create trigger app_read_revision_truncate after truncate on public.exam_sections for each statement execute function private.advance_app_read_revision();
create trigger app_read_revision_insert after insert on public.exam_answers referencing new table as new_rows for each statement execute function private.advance_app_read_revision();
create trigger app_read_revision_update after update on public.exam_answers referencing old table as old_rows new table as new_rows for each statement execute function private.advance_app_read_revision();
create trigger app_read_revision_delete after delete on public.exam_answers referencing old table as old_rows for each statement execute function private.advance_app_read_revision();
create trigger app_read_revision_truncate after truncate on public.exam_answers for each statement execute function private.advance_app_read_revision();
create trigger app_read_revision_insert after insert on public.exam_files referencing new table as new_rows for each statement execute function private.advance_app_read_revision();
create trigger app_read_revision_update after update on public.exam_files referencing old table as old_rows new table as new_rows for each statement execute function private.advance_app_read_revision();
create trigger app_read_revision_delete after delete on public.exam_files referencing old table as old_rows for each statement execute function private.advance_app_read_revision();
create trigger app_read_revision_truncate after truncate on public.exam_files for each statement execute function private.advance_app_read_revision();
create trigger app_read_revision_insert after insert on public.exam_subject_settings referencing new table as new_rows for each statement execute function private.advance_app_read_revision();
create trigger app_read_revision_update after update on public.exam_subject_settings referencing old table as old_rows new table as new_rows for each statement execute function private.advance_app_read_revision();
create trigger app_read_revision_delete after delete on public.exam_subject_settings referencing old table as old_rows for each statement execute function private.advance_app_read_revision();
create trigger app_read_revision_truncate after truncate on public.exam_subject_settings for each statement execute function private.advance_app_read_revision();
create trigger app_read_revision_insert after insert on public.outings referencing new table as new_rows for each statement execute function private.advance_app_read_revision();
create trigger app_read_revision_update after update on public.outings referencing old table as old_rows new table as new_rows for each statement execute function private.advance_app_read_revision();
create trigger app_read_revision_delete after delete on public.outings referencing old table as old_rows for each statement execute function private.advance_app_read_revision();
create trigger app_read_revision_truncate after truncate on public.outings for each statement execute function private.advance_app_read_revision();
create trigger app_read_revision_insert after insert on public.outing_photos referencing new table as new_rows for each statement execute function private.advance_app_read_revision();
create trigger app_read_revision_update after update on public.outing_photos referencing old table as old_rows new table as new_rows for each statement execute function private.advance_app_read_revision();
create trigger app_read_revision_delete after delete on public.outing_photos referencing old table as old_rows for each statement execute function private.advance_app_read_revision();
create trigger app_read_revision_truncate after truncate on public.outing_photos for each statement execute function private.advance_app_read_revision();

create or replace function public.get_study_cafe_personal_snapshot(
  p_student_id text,
  p_study_date date,
  p_day_start timestamptz,
  p_day_end timestamptz
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with subject_rows as (
    select subject.name, subject.sort_order
    from public.study_cafe_subjects as subject
    where subject.student_id = p_student_id
    order by subject.sort_order asc
  ),
  todo_rows as (
    select todo.id, todo.study_date, todo.subject_name, todo.content,
      todo.is_completed, todo.completed_at, todo.created_at
    from public.study_cafe_todos as todo
    where todo.student_id = p_student_id
      and todo.study_date = p_study_date
    order by todo.created_at asc
  ),
  goal_rows as (
    select goal.study_date, goal.subject_name, goal.target_minutes,
      goal.result_status, goal.completed_elapsed_seconds, goal.completed_at
    from public.study_cafe_subject_goals as goal
    where goal.student_id = p_student_id
      and goal.study_date = p_study_date
    order by goal.subject_name asc
  ),
  active_session_rows as (
    select session.id, session.student_id, session.subject_name, session.status,
      session.elapsed_seconds, session.started_at, session.active_started_at, session.ended_at
    from public.study_cafe_sessions as session
    where session.student_id = p_student_id
      and session.status in ('running', 'paused')
    order by session.started_at desc
    limit 1
  ),
  day_session_rows as (
    select session.id, session.student_id, session.subject_name, session.status,
      session.elapsed_seconds, session.started_at, session.active_started_at, session.ended_at
    from public.study_cafe_sessions as session
    where session.student_id = p_student_id
      and session.started_at >= p_day_start
      and session.started_at < p_day_end
  ),
  presence_rows as (
    select presence.student_id, presence.seat_number, presence.status,
      presence.current_subject, presence.avatar_tone, presence.display_name,
      presence.last_heartbeat_at, presence.updated_at
    from public.study_cafe_presence as presence
    order by presence.seat_number asc
  )
  select jsonb_build_object(
    'subjects', coalesce((
      select jsonb_agg(to_jsonb(subject) order by subject.sort_order asc)
      from subject_rows as subject
    ), '[]'::jsonb),
    'todos', coalesce((
      select jsonb_agg(to_jsonb(todo) order by todo.created_at asc)
      from todo_rows as todo
    ), '[]'::jsonb),
    'subjectGoals', coalesce((
      select jsonb_agg(to_jsonb(goal) order by goal.subject_name asc)
      from goal_rows as goal
    ), '[]'::jsonb),
    'profiles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'student_id', profile.student_id,
        'avatar_tone', profile.avatar_tone,
        'nickname', profile.nickname,
        'status_message', profile.status_message,
        'hair_style', coalesce(to_jsonb(profile)->>'hair_style', 'default')
      ))
      from public.study_cafe_profiles as profile
      where profile.student_id = p_student_id
    ), '[]'::jsonb),
    'ownPresence', coalesce((
      select jsonb_agg(to_jsonb(presence))
      from presence_rows as presence
      where presence.student_id = p_student_id
    ), '[]'::jsonb),
    'activeSessions', coalesce((
      select jsonb_agg(to_jsonb(session))
      from active_session_rows as session
    ), '[]'::jsonb),
    'sessions', coalesce((
      select jsonb_agg(to_jsonb(session))
      from day_session_rows as session
    ), '[]'::jsonb),
    'focusedCount', (select count(*) from public.study_cafe_presence)
  );
$$;
revoke all on function public.get_study_cafe_personal_snapshot(text,date,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.get_study_cafe_personal_snapshot(text,date,timestamptz,timestamptz) to service_role;
notify pgrst, 'reload schema';
commit;
