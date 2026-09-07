-- Read-only operational checks for the five study-cafe agents.
select
  agent.student_id,
  agent.enabled,
  agent.nickname,
  agent.track,
  agent.subjects,
  presence.seat_number,
  presence.status,
  presence.current_subject,
  presence.last_heartbeat_at,
  session.started_at,
  session.elapsed_seconds,
  session.active_started_at
from private.study_cafe_agents agent
left join public.study_cafe_presence presence using (student_id)
left join lateral (
  select started_at, elapsed_seconds, active_started_at
  from public.study_cafe_sessions
  where student_id = agent.student_id
    and status in ('running', 'paused')
  order by started_at desc
  limit 1
) session on true
order by agent.student_id;

select jobid, jobname, schedule, active
from cron.job
where jobname in (
  'study-cafe-agents-every-minute',
  'study-cafe-agent-cron-history-cleanup'
)
order by jobname;

select status, count(*) as runs
from cron.job_run_details
where jobid = (
  select jobid from cron.job where jobname = 'study-cafe-agents-every-minute'
)
  and start_time >= now() - interval '1 day'
group by status
order by status;
