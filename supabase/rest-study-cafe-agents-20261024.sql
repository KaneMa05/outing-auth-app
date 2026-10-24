-- Operational schedule only: 2026-10-24 00:00 through 2026-10-26 00:00 Asia/Seoul.
-- Preserves bot enabled flags and all real-student sessions.
-- The original command restores itself on the first run on/after October 26.
begin;
set local lock_timeout = '5s';
do $guard$
begin
  if not exists (
    select 1 from cron.job
    where jobname = 'study-cafe-agents-every-minute'
      and active and schedule = '* * * * *'
      and command = 'select private.run_study_cafe_agents();'
  ) then
    raise exception 'Bot cron configuration changed; inspect before scheduling the rest day.';
  end if;
end;
$guard$;
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'study-cafe-agents-every-minute'),
  command := $command$do $rest_day$
declare
  v_now timestamptz := clock_timestamp();
  v_start constant timestamptz := timestamptz '2026-10-24 00:00:00+09';
  v_end constant timestamptz := timestamptz '2026-10-26 00:00:00+09';
  v_id text;
begin
  perform pg_advisory_xact_lock(299997, 1);
  if v_now >= v_start and v_now < v_end then
    for v_id in select student_id from private.study_cafe_agents order by student_id loop
      perform private.finish_study_cafe_agent_session(v_id, v_start);
    end loop;
    delete from public.study_cafe_presence p
    using private.study_cafe_agents a
    where p.student_id = a.student_id;
  else
    if v_now >= v_end then
      perform private.run_study_cafe_agents_core(v_now);
      -- The existing runner backdates a new session to its current study cycle.
      -- Clamp the first resumed sessions so no holiday study time is credited.
      update public.study_cafe_sessions s
      set started_at = greatest(s.started_at, v_end),
          active_started_at = case when s.active_started_at is null then null
                                   else greatest(s.active_started_at, v_end) end
      from private.study_cafe_agents a
      where s.student_id = a.student_id
        and s.status in ('running', 'paused')
        and s.started_at < v_end;
      perform private.run_study_cafe_agents(v_now);
      perform cron.alter_job(
        job_id := (select jobid from cron.job where jobname = 'study-cafe-agents-every-minute'),
        command := 'select private.run_study_cafe_agents();'
      );
    else
      perform private.run_study_cafe_agents(v_now);
    end if;
  end if;
end;
$rest_day$;$command$
);
commit;

-- Cancel the holiday before it starts, if requested:
-- select cron.alter_job(job_id := 7, command := 'select private.run_study_cafe_agents();');
