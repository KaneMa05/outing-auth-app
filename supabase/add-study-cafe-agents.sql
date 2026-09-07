-- Five persistent study-cafe agents backed by the same student, presence, and
-- session tables as real users. Apply only after reviewing the preview query at
-- the bottom of this file. Times are evaluated in Asia/Seoul and vary by day.

begin;

create extension if not exists pg_cron;
create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

create table if not exists private.study_cafe_agents (
  student_id text primary key references public.students(id) on delete cascade,
  enabled boolean not null default true,
  name text not null,
  nickname text,
  track text not null,
  subjects text[] not null,
  avatar_tone text not null,
  preferred_seat integer not null check (preferred_seat between 1 and 96),
  start_1 integer not null,
  end_1 integer not null,
  start_2 integer not null,
  end_2 integer not null,
  start_3 integer not null,
  end_3 integer not null,
  check (cardinality(subjects) between 1 and 8),
  check (avatar_tone in ('navy', 'blue', 'mint', 'purple', 'orange', 'rose')),
  check (start_1 < end_1 and end_1 < start_2 and start_2 < end_2),
  check (end_2 < start_3 and start_3 < end_3),
  check (start_1 >= 0 and end_3 <= 1439)
);

alter table private.study_cafe_agents enable row level security;
alter table private.study_cafe_agents alter column nickname drop not null;
revoke all on table private.study_cafe_agents from public, anon, authenticated;

drop policy if exists study_cafe_agents_deny_client_access
on private.study_cafe_agents;
create policy study_cafe_agents_deny_client_access
on private.study_cafe_agents
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

do $$
begin
  if exists (
    select 1
    from public.students
    where id in ('29999701', '29999702', '29999703', '29999704', '29999705')
      and class_name <> '스터디카페 운영계정'
  ) then
    raise exception 'A reserved study-cafe agent ID is already in use.';
  end if;
end
$$;

insert into public.students (
  id,
  name,
  class_name,
  student_category,
  account_type,
  track,
  gender,
  password_hash,
  attendance_excluded,
  fitness_excluded,
  is_active
)
values
  ('29999701', '김도윤', '스터디카페 운영계정', 'online_managed', 'student', '경찰직 - 공채(순경)', '남', encode(extensions.gen_random_bytes(32), 'hex'), true, true, true),
  ('29999702', '이서준', '스터디카페 운영계정', 'online_managed', 'student', '경찰직 - 공채(순경)', '남', encode(extensions.gen_random_bytes(32), 'hex'), true, true, true),
  ('29999703', '정유진', '스터디카페 운영계정', 'online_managed', 'student', '경찰직 - 공채(순경)', '여', encode(extensions.gen_random_bytes(32), 'hex'), true, true, true),
  ('29999704', '박지훈', '스터디카페 운영계정', 'online_managed', 'student', '경찰직 - 함정요원 항해(순경)', '남', encode(extensions.gen_random_bytes(32), 'hex'), true, true, true),
  ('29999705', '최민재', '스터디카페 운영계정', 'online_managed', 'student', '경찰직 - 함정요원 기관(순경)', '남', encode(extensions.gen_random_bytes(32), 'hex'), true, true, true)
on conflict (id) do update
set name = excluded.name,
    class_name = excluded.class_name,
    student_category = excluded.student_category,
    account_type = excluded.account_type,
    track = excluded.track,
    gender = excluded.gender,
    attendance_excluded = true,
    fitness_excluded = true,
    is_active = true;

-- Minutes are measured from the 04:00 KST study-day boundary. Each boundary
-- receives an independent deterministic daily jitter of up to 14 minutes.
insert into private.study_cafe_agents (
  student_id, name, nickname, track, subjects, avatar_tone, preferred_seat,
  start_1, end_1, start_2, end_2, start_3, end_3
)
values
  ('29999701', '김도윤', null, '경찰직 - 공채(순경)', array['해사법규', '해양경찰학개론', '형사법'], 'navy', 7,  158, 450, 505, 828, 900, 1135),
  ('29999702', '이서준', null, '경찰직 - 공채(순경)', array['형사법', '해사법규', '해양경찰학개론'], 'blue', 22, 205, 490, 540, 850, 955, 1220),
  ('29999703', '정유진', null, '경찰직 - 공채(순경)', array['해양경찰학개론', '형사법', '해사법규'], 'rose', 38, 300, 600, 660, 1050, 1095, 1275),
  ('29999704', '박지훈', null, '경찰직 - 함정요원 항해(순경)', array['해사법규', '해양경찰학개론', '해사영어', '항해학'], 'mint', 43, 115, 405, 450, 765, 840, 1170),
  ('29999705', '최민재', null, '경찰직 - 함정요원 기관(순경)', array['해사법규', '해양경찰학개론', '해사영어', '기관학'], 'orange', 46, 245, 555, 610, 950, 1020, 1330)
on conflict (student_id) do update
set name = excluded.name,
    nickname = excluded.nickname,
    track = excluded.track,
    subjects = excluded.subjects,
    avatar_tone = excluded.avatar_tone,
    preferred_seat = excluded.preferred_seat,
    start_1 = excluded.start_1,
    end_1 = excluded.end_1,
    start_2 = excluded.start_2,
    end_2 = excluded.end_2,
    start_3 = excluded.start_3,
    end_3 = excluded.end_3;

insert into public.study_cafe_profiles (
  student_id, avatar_tone, nickname, status_message, updated_at
)
select
  student_id,
  avatar_tone,
  null,
  null,
  now()
from private.study_cafe_agents
on conflict (student_id) do update
set avatar_tone = excluded.avatar_tone,
    nickname = excluded.nickname,
    status_message = excluded.status_message,
    updated_at = excluded.updated_at;

delete from public.study_cafe_subjects
where student_id in (select student_id from private.study_cafe_agents);

insert into public.study_cafe_subjects (student_id, name, sort_order, updated_at)
select agent.student_id, subject.name, subject.ordinality - 1, now()
from private.study_cafe_agents agent
cross join lateral unnest(agent.subjects) with ordinality as subject(name, ordinality);

create or replace function private.study_cafe_agent_jitter(p_key text, p_span integer)
returns integer
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select case
    when p_span <= 1 then 0
    else mod(get_byte(decode(substr(md5(p_key), 1, 2), 'hex'), 0), p_span)
  end;
$$;

create or replace function private.finish_study_cafe_agent_session(
  p_student_id text,
  p_now timestamptz
)
returns void
language sql
security invoker
set search_path = pg_catalog
as $$
  update public.study_cafe_sessions
  set status = 'completed',
      elapsed_seconds = elapsed_seconds + case
        when status = 'running' and active_started_at is not null
          then greatest(0, floor(extract(epoch from (p_now - active_started_at)))::integer)
        else 0
      end,
      active_started_at = null,
      ended_at = p_now,
      updated_at = p_now
  where student_id = p_student_id
    and status in ('running', 'paused');
$$;

create or replace function private.run_study_cafe_agents(p_now timestamptz default clock_timestamp())
returns void
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  agent record;
  active_session public.study_cafe_sessions%rowtype;
  local_clock timestamp without time zone;
  study_clock timestamp without time zone;
  study_date date;
  minute_of_day integer;
  window_starts integer[];
  window_ends integer[];
  window_index integer;
  visit_index integer;
  window_start integer;
  window_end integer;
  cursor_minute integer;
  cycle_index integer;
  study_minutes integer;
  break_minutes integer;
  desired_state text;
  desired_subject text;
  desired_nickname text;
  subject_index integer;
  seat_number integer;
  candidate_started_at timestamptz;
  latest_ended_at timestamptz;
  nickname_moods text[] := array[
    '웃고있는', '집중하는', '차분한', '신나는', '졸고있는',
    '용감한', '부지런한', '생각하는', '즐거운', '느긋한'
  ];
  nickname_animals text[] := array[
    '기린', '하마', '수달', '판다', '여우',
    '펭귄', '토끼', '다람쥐', '카피바라'
  ];
begin
  local_clock := p_now at time zone 'Asia/Seoul';
  study_clock := local_clock - interval '4 hours';
  study_date := study_clock::date;
  minute_of_day := extract(hour from study_clock)::integer * 60
    + extract(minute from study_clock)::integer;

  for agent in
    select * from private.study_cafe_agents order by student_id
  loop
    desired_state := null;
    desired_subject := null;
    desired_nickname := null;
    visit_index := null;

    if agent.enabled then
      window_starts := array[agent.start_1, agent.start_2, agent.start_3];
      window_ends := array[agent.end_1, agent.end_2, agent.end_3];

      for window_index in 1..3 loop
        window_start := window_starts[window_index]
          + private.study_cafe_agent_jitter(
              study_date::text || ':' || agent.student_id || ':' || window_index || ':start',
              29
            ) - 14;
        window_end := window_ends[window_index]
          + private.study_cafe_agent_jitter(
              study_date::text || ':' || agent.student_id || ':' || window_index || ':end',
              29
            ) - 14;

        if minute_of_day < window_start or minute_of_day >= window_end then
          continue;
        end if;

        cursor_minute := window_start;
        cycle_index := 0;
        while cursor_minute < window_end loop
          study_minutes := 50 + private.study_cafe_agent_jitter(
            study_date::text || ':' || agent.student_id || ':' || window_index || ':' || cycle_index || ':study',
            36
          );
          break_minutes := 6 + private.study_cafe_agent_jitter(
            study_date::text || ':' || agent.student_id || ':' || window_index || ':' || cycle_index || ':break',
            13
          );
          subject_index := mod(
            cycle_index + window_index
              + private.study_cafe_agent_jitter(study_date::text || ':' || agent.student_id || ':subject', cardinality(agent.subjects)),
            cardinality(agent.subjects)
          ) + 1;

          if minute_of_day >= cursor_minute
            and minute_of_day < least(cursor_minute + study_minutes, window_end)
          then
            desired_state := 'studying';
            desired_subject := agent.subjects[subject_index];
            visit_index := window_index;
            exit;
          end if;

          if minute_of_day >= cursor_minute + study_minutes
            and minute_of_day < least(cursor_minute + study_minutes + break_minutes, window_end)
          then
            desired_state := 'paused';
            desired_subject := agent.subjects[subject_index];
            visit_index := window_index;
            exit;
          end if;

          cursor_minute := cursor_minute + study_minutes + break_minutes;
          cycle_index := cycle_index + 1;
        end loop;

        exit when desired_state is not null;
      end loop;
    end if;

    if desired_state is null then
      perform private.finish_study_cafe_agent_session(agent.student_id, p_now);
      delete from public.study_cafe_presence where student_id = agent.student_id;
      continue;
    end if;

    -- Match the app's default temporary nickname style. The name remains
    -- stable during one visit and changes naturally at the next visit window.
    desired_nickname := nickname_moods[
      private.study_cafe_agent_jitter(
        study_date::text || ':' || agent.student_id || ':' || coalesce(visit_index, 1) || ':nickname-mood',
        cardinality(nickname_moods)
      ) + 1
    ] || nickname_animals[
      mod(
        private.study_cafe_agent_jitter(
          study_date::text || ':nickname-animal-base',
          cardinality(nickname_animals)
        ) + right(agent.student_id, 1)::integer - 1,
        cardinality(nickname_animals)
      ) + 1
    ];

    select presence.seat_number
    into seat_number
    from public.study_cafe_presence presence
    where presence.student_id = agent.student_id;

    if seat_number is null then
      select candidate.seat
      into seat_number
      from generate_series(1, 48) as candidate(seat)
      where not exists (
        select 1
        from public.study_cafe_presence occupied
        where occupied.seat_number = candidate.seat
      )
      order by abs(candidate.seat - agent.preferred_seat), candidate.seat
      limit 1;
    end if;

    if seat_number is null then
      perform private.finish_study_cafe_agent_session(agent.student_id, p_now);
      continue;
    end if;

    begin
      insert into public.study_cafe_presence (
        student_id, seat_number, status, current_subject, avatar_tone,
        display_name, last_heartbeat_at, updated_at
      )
      values (
        agent.student_id, seat_number, desired_state, desired_subject,
        agent.avatar_tone, desired_nickname, p_now, p_now
      )
      on conflict (student_id) do update
      set seat_number = excluded.seat_number,
          status = excluded.status,
          current_subject = excluded.current_subject,
          avatar_tone = excluded.avatar_tone,
          display_name = excluded.display_name,
          last_heartbeat_at = excluded.last_heartbeat_at,
          updated_at = excluded.updated_at;
    exception when unique_violation then
      -- A real user claimed this seat concurrently. The next minute chooses a
      -- different free seat without interrupting the real user's request.
      continue;
    end;

    select sessions.*
    into active_session
    from public.study_cafe_sessions sessions
    where sessions.student_id = agent.student_id
      and sessions.status in ('running', 'paused')
    order by sessions.started_at desc
    limit 1;

    if active_session.id is not null and active_session.subject_name <> desired_subject then
      perform private.finish_study_cafe_agent_session(agent.student_id, p_now);
      active_session := null;
    end if;

    if desired_state = 'studying' then
      if active_session.id is null then
        candidate_started_at := p_now - make_interval(
          mins => greatest(0, minute_of_day - cursor_minute)
        );
        select max(sessions.ended_at)
        into latest_ended_at
        from public.study_cafe_sessions sessions
        where sessions.student_id = agent.student_id
          and sessions.status = 'completed';
        candidate_started_at := greatest(
          candidate_started_at,
          coalesce(latest_ended_at, candidate_started_at)
        );
        insert into public.study_cafe_sessions (
          student_id, subject_name, status, elapsed_seconds,
          started_at, active_started_at, updated_at
        )
        values (
          agent.student_id, desired_subject, 'running', 0,
          candidate_started_at, candidate_started_at, p_now
        );
      elsif active_session.status = 'paused' then
        update public.study_cafe_sessions
        set status = 'running',
            active_started_at = p_now,
            updated_at = p_now
        where id = active_session.id;
      end if;
    elsif desired_state = 'paused' then
      if active_session.id is null then
        insert into public.study_cafe_sessions (
          student_id, subject_name, status, elapsed_seconds,
          started_at, active_started_at, updated_at
        )
        values (
          agent.student_id, desired_subject, 'paused', 0,
          p_now, null, p_now
        );
      elsif active_session.status = 'running' then
        update public.study_cafe_sessions
        set status = 'paused',
            elapsed_seconds = elapsed_seconds
              + greatest(0, floor(extract(epoch from (p_now - active_started_at)))::integer),
            active_started_at = null,
            updated_at = p_now
        where id = active_session.id;
      end if;
    end if;
  end loop;
end;
$$;

revoke all on function private.study_cafe_agent_jitter(text, integer) from public, anon, authenticated;
revoke all on function private.finish_study_cafe_agent_session(text, timestamptz) from public, anon, authenticated;
revoke all on function private.run_study_cafe_agents(timestamptz) from public, anon, authenticated;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'study-cafe-agents-every-minute';

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;

  perform cron.schedule(
    'study-cafe-agents-every-minute',
    '* * * * *',
    'select private.run_study_cafe_agents();'
  );

  select jobid into existing_job
  from cron.job
  where jobname = 'study-cafe-agent-cron-history-cleanup';

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;

  perform cron.schedule(
    'study-cafe-agent-cron-history-cleanup',
    '17 3 * * *',
    $job$
      delete from cron.job_run_details
      where end_time < now() - interval '7 days'
        and jobid in (
          select jobid
          from cron.job
          where jobname in (
            'study-cafe-agents-every-minute',
            'study-cafe-agent-cron-history-cleanup'
          )
        );
    $job$
  );
end
$$;

commit;

-- Read-only preview after installation:
-- select private.run_study_cafe_agents(now());
-- select a.student_id, a.nickname, a.track, p.seat_number, p.status, p.current_subject
-- from private.study_cafe_agents a
-- left join public.study_cafe_presence p using (student_id)
-- order by a.student_id;
