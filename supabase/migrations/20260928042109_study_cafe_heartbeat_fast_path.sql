-- Additive, server-only fast path. Keep cleanup, rollover and push semantics in
-- the existing API whenever maintenance is needed; do not change their timing.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create or replace function public.study_cafe_heartbeat(
  p_student_id text,
  p_device_token_hash text,
  p_client_display_mode text default null,
  p_client_user_agent text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_validation jsonb;
  v_student jsonb;
  v_category text;
  v_now timestamptz;
  v_started_at timestamptz;
  v_presence public.study_cafe_presence%rowtype;
  v_room_student_id text;
begin
  -- Do not weaken or cache the existing device/revocation checks.
  if nullif(btrim(p_student_id), '') is null
     or p_device_token_hash is null
     or p_device_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'error', 'device_not_active');
  end if;
  v_validation := public.validate_student_device(
    p_student_id, p_device_token_hash, p_client_display_mode, p_client_user_agent
  );
  if (v_validation ->> 'valid') is distinct from 'true' then
    return jsonb_build_object('ok', false, 'error', 'device_not_active');
  end if;
  select jsonb_build_object('id', s.id, 'name', s.name, 'track', s.track,
                           'student_category', s.student_category, 'is_active', s.is_active),
         coalesce(btrim(s.student_category), '')
    into v_student, v_category
    from public.students s where s.id = p_student_id and s.is_active = true;
  if v_student is null then
    return jsonb_build_object('ok', false, 'error', 'device_not_active');
  end if;
  if not (v_category in ('online_managed', 'lecture')
          or (v_category = '' and p_student_id like '2%')) then
    return jsonb_build_object('ok', false, 'error', 'online_student_only');
  end if;
  v_now := clock_timestamp();

  -- Do not wait on a seat while retaining the validator's student-row lock:
  -- other room transactions can acquire these locks in the opposite order.
  begin
    select * into v_presence from public.study_cafe_presence
      where student_id = p_student_id for update nowait;
  exception when lock_not_available then
    return jsonb_build_object('legacy', true, 'student', v_student);
  end;

  -- Same eligibility as clearStalePresence: the two-minute filter is only the
  -- initial candidate filter; actual release requires 15 minutes + 10 seconds.
  if exists (
    select 1 from public.study_cafe_presence p
    where p.last_heartbeat_at < v_now - interval '2 minutes'
      and (case when p.status in ('seated', 'paused') then p.updated_at
                else p.last_heartbeat_at end) <= v_now - interval '15 minutes 10 seconds'
  ) then
    return jsonb_build_object('legacy', true, 'student', v_student);
  end if;

  select started_at into v_started_at from public.study_cafe_sessions
    where student_id = p_student_id and status in ('running', 'paused')
    order by started_at desc limit 1;
  if v_started_at is not null
     and ((v_started_at at time zone 'Asia/Seoul') - interval '4 hours')::date
         <> ((v_now at time zone 'Asia/Seoul') - interval '4 hours')::date then
    return jsonb_build_object('legacy', true, 'student', v_student);
  end if;

  if v_presence.student_id is not null then
    -- Idle activity time (updated_at), subject, status and session stay intact.
    update public.study_cafe_presence set last_heartbeat_at = v_now
      where student_id = p_student_id;
  else
    -- The existing cafe heartbeat also maintains seats in private study rooms.
    -- Do not recreate a released seat or refresh a membership without a seat.
    begin
      select student_id into v_room_student_id from public.study_cafe_room_members
        where student_id = p_student_id and seat_number is not null for update nowait;
    exception when lock_not_available then
      return jsonb_build_object('legacy', true, 'student', v_student);
    end;
    if v_room_student_id is null then
      return jsonb_build_object('ok', false, 'error', 'seat_required');
    end if;
    update public.study_cafe_room_members set updated_at = v_now
      where student_id = p_student_id and seat_number is not null;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'seat_required');
    end if;
  end if;
  return jsonb_build_object('ok', true, 'serverNow', v_now);
end;
$$;

revoke all on function public.study_cafe_heartbeat(text, text, text, text) from public, anon, authenticated;
grant execute on function public.study_cafe_heartbeat(text, text, text, text) to service_role;

comment on function public.study_cafe_heartbeat(text, text, text, text) is
  'Server-only normal heartbeat fast path; explicit legacy response leaves seat/session unchanged for cleanup/rollover.';

-- Merge the two authentication reads. Keep reward settlement in a separate
-- transaction: the existing validator holds a student FOR UPDATE lock, while
-- settlement locks enrollment/wallet rows and inserts records referencing it.
create or replace function public.validate_student_reward_device(
  p_student_id text,
  p_device_token_hash text,
  p_client_display_mode text default null,
  p_client_user_agent text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_validation jsonb;
begin
  if nullif(btrim(p_student_id), '') is null
     or p_device_token_hash is null
     or p_device_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'error', 'device_not_active');
  end if;
  v_validation := public.validate_student_device(
    p_student_id, p_device_token_hash, p_client_display_mode, p_client_user_agent
  );
  if (v_validation ->> 'valid') is distinct from 'true' then
    return jsonb_build_object('ok', false, 'error', 'device_not_active');
  end if;
  if not exists (
    select 1 from public.students s where s.id = p_student_id
      and s.is_active = true and s.account_type = 'student'
      and s.class_name is distinct from '스터디카페 운영계정'
      and s.id !~ '^0*([1-9]|10)$'
  ) then
    return jsonb_build_object('ok', false, 'error', 'student_only');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.validate_student_reward_device(text, text, text, text) from public, anon, authenticated;
grant execute on function public.validate_student_reward_device(text, text, text, text) to service_role;

commit;
