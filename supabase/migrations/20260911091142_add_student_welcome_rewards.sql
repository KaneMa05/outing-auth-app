begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- Apply after student devices, study cafe rooms and study cafe shop migrations.
-- This date is fixed once, so retries never re-enroll existing students.
create table public.student_reward_campaign (
  id boolean primary key default true check (id),
  starts_at timestamptz not null default now(),
  welcome_points integer not null default 100 check (welcome_points > 0),
  -- Confirmed challenge reward: 300P, in addition to the 100P welcome gift.
  challenge_points integer default 300 check (challenge_points > 0)
);
insert into public.student_reward_campaign (id) values (true);

create table public.student_reward_enrollments (
  student_id text primary key references public.students(id) on delete cascade,
  registered_at timestamptz not null,
  eligible boolean not null,
  created_at timestamptz not null default now()
);
-- Remember old registrations even when app_registered_at is reset later.
insert into public.student_reward_enrollments (student_id, registered_at, eligible)
select s.id, coalesce(s.app_registered_at, min(d.registered_at), s.created_at), false
from public.students s left join public.student_devices d on d.student_id = s.id
group by s.id
having s.app_registered_at is not null or count(d.id) > 0;

create table public.student_reward_receipts (
  student_id text not null references public.students(id) on delete cascade,
  reward_key text not null check (reward_key in ('welcome', 'routine3')),
  amount integer not null check (amount > 0),
  awarded_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  primary key (student_id, reward_key)
);

-- Keep active intervals, not just a session's accumulated duration: pauses and
-- KST midnight must be handled independently of the existing 04:00 study day.
create table public.student_reward_focus_intervals (
  session_id uuid not null references public.study_cafe_sessions(id) on delete cascade,
  student_id text not null references public.students(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz not null check (ended_at > started_at),
  primary key (session_id, started_at)
);
create index student_reward_focus_student_time_idx
on public.student_reward_focus_intervals (student_id, started_at);

create function public.enroll_student_rewards()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  -- Legacy profile updates may run with the public client role. They must not
  -- gain access to reward tables or interrupt existing profile save flows.
  -- Enrollment is driven by the trusted device-registration function/server.
  if current_user in ('anon', 'authenticated') then return new; end if;
  if tg_op = 'UPDATE' and new.app_registered_at is not distinct from old.app_registered_at then
    return new;
  end if;
  if new.app_registered_at is not null then
    insert into public.student_reward_enrollments (student_id, registered_at, eligible)
    select new.id, new.app_registered_at,
      new.app_registered_at >= c.starts_at
      and new.account_type = 'student' and new.is_active
      and new.class_name <> '스터디카페 운영계정'
      and new.id !~ '^0*([1-9]|10)$'
    from public.student_reward_campaign c
    on conflict (student_id) do nothing;
  end if;
  return new;
end;
$$;
create trigger student_rewards_registration
after insert or update of app_registered_at on public.students
for each row execute function public.enroll_student_rewards();

create function public.capture_student_reward_focus()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_end timestamptz;
begin
  if old.status <> 'running' or old.active_started_at is null
    or (new.status = 'running' and new.active_started_at = old.active_started_at)
    or not exists (select 1 from public.student_reward_enrollments
                   where student_id = old.student_id and eligible) then
    return new;
  end if;
  v_end := least(
    old.active_started_at + greatest(0, new.elapsed_seconds - old.elapsed_seconds) * interval '1 second',
    coalesce(new.ended_at, new.updated_at), statement_timestamp()
  );
  if v_end > old.active_started_at then
    insert into public.student_reward_focus_intervals
      (session_id, student_id, started_at, ended_at)
    values (old.id, old.student_id, old.active_started_at, v_end)
    on conflict (session_id, started_at) do update
      set ended_at = excluded.ended_at;
  end if;
  return new;
end;
$$;
create trigger student_rewards_focus_interval
after update on public.study_cafe_sessions
for each row execute function public.capture_student_reward_focus();

create function public.student_reward_study_days(p_student_id text)
returns table (study_date date, seconds integer)
language sql stable security invoker set search_path = '' as $$
  with enrollment as (
    select registered_at from public.student_reward_enrollments
    where student_id = p_student_id and eligible
  ), intervals as (
    select greatest(i.started_at, e.registered_at) as start_at,
      least(i.ended_at, statement_timestamp()) as end_at
    from public.student_reward_focus_intervals i cross join enrollment e
    where i.student_id = p_student_id
    union all
    select greatest(s.active_started_at, e.registered_at),
      least(statement_timestamp(), coalesce(p.last_heartbeat_at, m.updated_at, s.active_started_at) + interval '30 seconds')
    from public.study_cafe_sessions s cross join enrollment e
    left join public.study_cafe_presence p on p.student_id = s.student_id
    left join public.study_cafe_room_members m on m.student_id = s.student_id and m.seat_number is not null
    where s.student_id = p_student_id and s.status = 'running'
      and s.active_started_at is not null
  ), merged as (
    -- Defensive union prevents concurrent/overlapping session records from
    -- manufacturing additional hours.
    select unnest(range_agg(tstzrange(start_at, end_at, '[)'))) as span
    from intervals where end_at > start_at
  ), daily as (
    select d.day::date as study_date,
      extract(epoch from (
        least(upper(span), (d.day + interval '1 day') at time zone 'Asia/Seoul')
        - greatest(lower(span), d.day at time zone 'Asia/Seoul')
      )) as seconds
    from merged cross join lateral generate_series(
      (lower(span) at time zone 'Asia/Seoul')::date::timestamp,
      (upper(span) at time zone 'Asia/Seoul')::date::timestamp,
      interval '1 day'
    ) d(day)
  )
  select study_date, floor(sum(seconds))::integer from daily
  group by study_date having sum(seconds) > 0;
$$;

create function public.sync_student_rewards(p_student_id text, p_welcome boolean default false)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_campaign public.student_reward_campaign%rowtype;
  v_enrollment public.student_reward_enrollments%rowtype;
  v_balance integer;
  v_key text;
  v_amount integer;
  v_description text;
  v_completed boolean := false;
  v_pending jsonb;
begin
  if not exists (select 1 from public.students where id = p_student_id
      and account_type = 'student' and is_active
      and class_name <> '스터디카페 운영계정' and id !~ '^0*([1-9]|10)$') then
    return jsonb_build_object('ok', false, 'error', 'student_only');
  end if;
  select * into v_campaign from public.student_reward_campaign where id;
  select * into v_enrollment from public.student_reward_enrollments
    where student_id = p_student_id for update;
  if not found or not v_enrollment.eligible then
    return jsonb_build_object('ok', true, 'eligible', false, 'notifications', '[]'::jsonb);
  end if;

  if v_campaign.challenge_points is not null
    and exists (select 1 from public.student_reward_receipts where student_id = p_student_id and reward_key = 'welcome')
    and not exists (select 1 from public.student_reward_receipts where student_id = p_student_id and reward_key = 'routine3') then
    with days as (select study_date from public.student_reward_study_days(p_student_id) where seconds >= 18000)
    select exists (select 1 from days a join days b on b.study_date = a.study_date + 1
      join days c on c.study_date = a.study_date + 2) into v_completed;
  end if;

  -- Same wallet lock as purchases/time points. Receipt, ledger and balance are
  -- committed together; duplicate requests can never credit the wallet twice.
  insert into public.study_cafe_point_wallets (student_id) values (p_student_id)
    on conflict (student_id) do nothing;
  select balance into v_balance from public.study_cafe_point_wallets
    where student_id = p_student_id for update;
  foreach v_key in array array['welcome', 'routine3'] loop
    if (v_key = 'welcome' and p_welcome) or (v_key = 'routine3' and v_completed) then
      v_amount := case when v_key = 'welcome' then v_campaign.welcome_points else v_campaign.challenge_points end;
      v_description := case when v_key = 'welcome' then '웰컴포인트' else '3일 공부 루틴 달성 보너스' end;
      insert into public.student_reward_receipts (student_id, reward_key, amount)
        values (p_student_id, v_key, v_amount) on conflict do nothing;
      if found then
        update public.study_cafe_point_wallets
        set balance = balance + v_amount, lifetime_earned = lifetime_earned + v_amount, updated_at = now()
        where student_id = p_student_id returning balance into v_balance;
        insert into public.study_cafe_point_ledger
          (student_id, source_type, source_key, amount, balance_after, description)
        values (p_student_id, 'adjustment', 'bonus:' || v_key || ':v1', v_amount, v_balance, v_description);
      end if;
    end if;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('key', reward_key, 'amount', amount,
    'awardedAt', awarded_at) order by awarded_at, reward_key desc), '[]'::jsonb)
    into v_pending from public.student_reward_receipts
    where student_id = p_student_id and acknowledged_at is null;
  return jsonb_build_object('ok', true, 'eligible', true, 'balance', v_balance,
    'welcomePoints', v_campaign.welcome_points, 'challengePoints', v_campaign.challenge_points,
    'completed', exists (select 1 from public.student_reward_receipts
      where student_id = p_student_id and reward_key = 'routine3'), 'notifications', v_pending);
end;
$$;

alter table public.student_reward_campaign enable row level security;
alter table public.student_reward_enrollments enable row level security;
alter table public.student_reward_receipts enable row level security;
alter table public.student_reward_focus_intervals enable row level security;
revoke all on public.student_reward_campaign, public.student_reward_enrollments,
  public.student_reward_receipts, public.student_reward_focus_intervals from public, anon, authenticated;
grant select, insert, update, delete on public.student_reward_campaign, public.student_reward_enrollments,
  public.student_reward_receipts, public.student_reward_focus_intervals to service_role;
revoke execute on function public.enroll_student_rewards(), public.capture_student_reward_focus(),
  public.student_reward_study_days(text), public.sync_student_rewards(text, boolean) from public, anon, authenticated;
grant execute on function public.enroll_student_rewards(), public.capture_student_reward_focus(),
  public.student_reward_study_days(text), public.sync_student_rewards(text, boolean) to service_role;

commit;
