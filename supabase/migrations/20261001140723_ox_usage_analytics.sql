-- Read-only aggregates for the authenticated admin API. No learner RPC changes.
create index ox_attempts_analytics_time on public.ox_attempts(answered_at) include(student_id);

create function public.ox_usage_analytics(p_actor jsonb, p_start date, p_end date)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_result jsonb;
begin
  if coalesce(p_actor->>'type','') <> 'admin' or coalesce(p_actor->>'id','') = '' then
    raise exception 'forbidden';
  end if;
  if p_start is null or p_end is null or p_start < date '2026-09-17' or p_start > p_end
    or p_end > (now() at time zone 'Asia/Seoul')::date or p_end-p_start > 365 then
    raise exception 'invalid_request';
  end if;

  with user_days as materialized (
    select (a.answered_at at time zone 'Asia/Seoul')::date as day,
      a.student_id, s.account_type, count(*) as attempts
    from public.ox_attempts a join public.students s on s.id=a.student_id
    where a.answered_at >= (p_start::timestamp at time zone 'Asia/Seoul')
      and a.answered_at < ((p_end+1)::timestamp at time zone 'Asia/Seoul')
      and s.account_type in ('student','teacher')
    -- Include retained history of inactive accounts, and all content versions/retries.
    group by 1,2,3
  ), daily as (
    select day, count(*) filter(where account_type='student') as students,
      count(*) filter(where account_type='teacher') as teachers,
      coalesce(sum(attempts) filter(where account_type='student'),0) as student_attempts,
      coalesce(sum(attempts) filter(where account_type='teacher'),0) as teacher_attempts
    from user_days group by day
  ), calendar as (
    select p_start+n as day from generate_series(0,p_end-p_start) n
  )
  select jsonb_build_object(
    'ok',true,'startDate',p_start,'endDate',p_end,
    'checkedAt',to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD HH24:MI:SS'),
    'summary',(select jsonb_build_object(
      'students',count(distinct student_id) filter(where account_type='student'),
      'teachers',count(distinct student_id) filter(where account_type='teacher'),
      'studentAttempts',coalesce(sum(attempts) filter(where account_type='student'),0),
      'teacherAttempts',coalesce(sum(attempts) filter(where account_type='teacher'),0)
    ) from user_days),
    'daily',(select jsonb_agg(jsonb_build_object(
      'date',c.day,'students',coalesce(d.students,0),'teachers',coalesce(d.teachers,0),
      'studentAttempts',coalesce(d.student_attempts,0),'teacherAttempts',coalesce(d.teacher_attempts,0)
    ) order by c.day desc) from calendar c left join daily d using(day))
  ) into v_result;
  return v_result;
end $$;

revoke all on function public.ox_usage_analytics(jsonb,date,date) from public,anon,authenticated;
grant execute on function public.ox_usage_analytics(jsonb,date,date) to service_role;
