-- Allow every active lecture student to use the study-cafe shop.
-- Older shop constraints only accepted IDs beginning with 2, while current
-- lecture accounts can also use the 900001+ range.

begin;

alter table if exists public.study_cafe_point_wallets
drop constraint if exists study_cafe_point_wallets_student_id_check;

alter table if exists public.study_cafe_inventory
drop constraint if exists study_cafe_inventory_student_id_check;

alter table if exists public.study_cafe_equipment
drop constraint if exists study_cafe_equipment_student_id_check;

create or replace function public.award_study_cafe_time_points(
  p_student_id text,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_study_date date;
  v_study_start timestamptz;
  v_total_seconds integer := 0;
  v_target_points integer := 0;
  v_delta integer := 0;
  v_wallet public.study_cafe_point_wallets%rowtype;
begin
  if p_student_id is null or not exists (
    select 1
    from public.students
    where id = p_student_id
      and is_active = true
      and student_category = 'lecture'
  ) then
    return jsonb_build_object('ok', false, 'error', 'invalid_student_id');
  end if;

  v_study_date := ((p_now at time zone 'Asia/Seoul') - interval '4 hours')::date;
  v_study_start := ((v_study_date::timestamp + interval '4 hours') at time zone 'Asia/Seoul');

  insert into public.study_cafe_point_wallets (student_id, study_date)
  values (p_student_id, v_study_date)
  on conflict (student_id) do nothing;

  select * into v_wallet
  from public.study_cafe_point_wallets
  where student_id = p_student_id
  for update;

  if v_wallet.study_date is distinct from v_study_date then
    update public.study_cafe_point_wallets
    set study_date = v_study_date,
        awarded_study_points = 0,
        updated_at = p_now
    where student_id = p_student_id
    returning * into v_wallet;
  end if;

  select coalesce(sum(
    greatest(0, s.elapsed_seconds) +
    case
      when s.status = 'running' and s.active_started_at is not null
        then greatest(0, floor(extract(epoch from (p_now - s.active_started_at)))::integer)
      else 0
    end
  ), 0)::integer
  into v_total_seconds
  from public.study_cafe_sessions as s
  where s.student_id = p_student_id
    and s.started_at >= v_study_start
    and s.started_at < v_study_start + interval '1 day';

  -- 5 points per completed 30 verified focus minutes = 10 points per hour.
  -- No points are awarded before the first 30-minute block is complete.
  v_target_points := greatest(0, floor(v_total_seconds / 1800.0)::integer * 5);
  v_delta := greatest(0, v_target_points - v_wallet.awarded_study_points);

  if v_delta > 0 then
    update public.study_cafe_point_wallets
    set balance = balance + v_delta,
        lifetime_earned = lifetime_earned + v_delta,
        awarded_study_points = v_target_points,
        updated_at = p_now
    where student_id = p_student_id
    returning * into v_wallet;

    insert into public.study_cafe_point_ledger
      (student_id, source_type, source_key, amount, balance_after, description, created_at)
    values
      (p_student_id, 'study_time', 'study:' || v_study_date::text || ':' || v_target_points::text,
       v_delta, v_wallet.balance, '순공부시간 자동 적립', p_now)
    on conflict (student_id, source_key) do nothing;
  end if;

  return jsonb_build_object(
    'balance', v_wallet.balance,
    'earnedToday', v_wallet.awarded_study_points,
    'totalStudySeconds', v_total_seconds,
    'secondsToNextPoint', 1800 - (v_total_seconds % 1800),
    'awardedNow', v_delta
  );
end;
$$;

create or replace function public.unequip_study_cafe_item(
  p_student_id text,
  p_slot text,
  p_item_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_student_id is null or not exists (
    select 1
    from public.students
    where id = p_student_id
      and is_active = true
      and student_category = 'lecture'
  ) then
    return jsonb_build_object('ok', false, 'error', 'invalid_student_id');
  end if;

  if p_slot not in ('outfit', 'head', 'desk', 'chair') then
    return jsonb_build_object('ok', false, 'error', 'invalid_shop_slot');
  end if;

  delete from public.study_cafe_equipment
  where student_id = p_student_id
    and slot = p_slot
    and (p_slot <> 'desk' or item_id = p_item_id);

  return jsonb_build_object('ok', true, 'slot', p_slot);
end;
$$;

revoke execute on function public.award_study_cafe_time_points(text, timestamptz) from public, anon, authenticated;
revoke execute on function public.unequip_study_cafe_item(text, text, text) from public, anon, authenticated;
grant execute on function public.award_study_cafe_time_points(text, timestamptz) to service_role;
grant execute on function public.unequip_study_cafe_item(text, text, text) to service_role;

commit;
