-- RONPARK STUDYCAFE: collapse the private-room snapshot into one Data API call.
-- Apply after add-study-cafe-rooms.sql. Safe to run repeatedly.

create or replace function public.get_study_cafe_room_snapshot(
  p_student_id text,
  p_day_start timestamptz,
  p_day_end timestamptz
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with own_member as (
    select room_id, role, seat_number, last_read_at
    from public.study_cafe_room_members
    where student_id = p_student_id
    limit 1
  ),
  active_room as (
    select
      room.id,
      room.name,
      room.description,
      room.capacity,
      room.theme,
      room.access_type,
      room.is_active
    from public.study_cafe_rooms as room
    join own_member as own on own.room_id = room.id
    where room.is_active = true
    limit 1
  ),
  member_rows as (
    select member.student_id, member.role, member.seat_number, member.joined_at, member.updated_at
    from public.study_cafe_room_members as member
    join active_room as room on room.id = member.room_id
  ),
  message_rows as (
    select message.id, message.student_id, message.message_type, message.message_text,
      message.created_at, message.deleted_at
    from public.study_cafe_room_messages as message
    join active_room as room on room.id = message.room_id
    order by message.created_at desc
    limit 100
  )
  select jsonb_build_object(
    'membership', (select to_jsonb(own) from own_member as own),
    'room', (select to_jsonb(room) from active_room as room),
    'members', coalesce((
      select jsonb_agg(to_jsonb(member) order by member.joined_at asc)
      from member_rows as member
    ), '[]'::jsonb),
    'profiles', coalesce((
      select jsonb_agg(to_jsonb(profile))
      from public.study_cafe_profiles as profile
      where profile.student_id in (select member.student_id from member_rows as member)
    ), '[]'::jsonb),
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', student.id,
        'name', student.name,
        'track', student.track
      ))
      from public.students as student
      where student.id in (select member.student_id from member_rows as member)
    ), '[]'::jsonb),
    'messages', coalesce((
      select jsonb_agg(to_jsonb(message) order by message.created_at desc)
      from message_rows as message
    ), '[]'::jsonb),
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'student_id', session.student_id,
        'subject_name', session.subject_name,
        'status', session.status,
        'elapsed_seconds', session.elapsed_seconds,
        'active_started_at', session.active_started_at
      ))
      from public.study_cafe_sessions as session
      where session.student_id in (select member.student_id from member_rows as member)
        and session.started_at >= p_day_start
        and session.started_at < p_day_end
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.get_study_cafe_room_snapshot(text, timestamptz, timestamptz)
from public, anon, authenticated;
grant execute on function public.get_study_cafe_room_snapshot(text, timestamptz, timestamptz)
to service_role;

create or replace function public.get_study_cafe_snapshot_data(
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
    where session.started_at >= p_day_start
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
    'presence', coalesce((
      select jsonb_agg(to_jsonb(presence) order by presence.seat_number asc)
      from presence_rows as presence
    ), '[]'::jsonb),
    'onlineStudents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', student.id,
        'name', student.name,
        'track', student.track
      ))
      from public.students as student
      where student.student_category in ('online_managed', 'lecture')
        and student.is_active = true
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.get_study_cafe_snapshot_data(text, date, timestamptz, timestamptz)
from public, anon, authenticated;
grant execute on function public.get_study_cafe_snapshot_data(text, date, timestamptz, timestamptz)
to service_role;
