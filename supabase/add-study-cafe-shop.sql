-- Study cafe shop MVP for lecture students.
-- Apply after supabase/add-study-cafe.sql. Existing study-cafe tables are not modified.

begin;

create table if not exists public.study_cafe_shop_items (
  id text primary key,
  name text not null check (char_length(trim(name)) between 1 and 40),
  description text not null default '' check (char_length(description) <= 160),
  slot text not null check (slot in ('outfit', 'head', 'desk', 'chair')),
  icon text not null check (char_length(icon) between 1 and 12),
  price integer not null check (price between 1 and 10000),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists study_cafe_shop_items_active_sort_idx
on public.study_cafe_shop_items(is_active, sort_order, id);

create table if not exists public.study_cafe_point_wallets (
  student_id text primary key references public.students(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  lifetime_earned integer not null default 0 check (lifetime_earned >= 0),
  study_date date,
  awarded_study_points integer not null default 0 check (awarded_study_points >= 0),
  updated_at timestamptz not null default now(),
  check (student_id like '2%')
);

create table if not exists public.study_cafe_point_ledger (
  id uuid primary key default gen_random_uuid(),
  student_id text not null references public.students(id) on delete cascade,
  source_type text not null check (source_type in ('study_time', 'purchase', 'refund', 'adjustment')),
  source_key text not null check (char_length(source_key) between 1 and 120),
  amount integer not null check (amount <> 0),
  balance_after integer not null check (balance_after >= 0),
  item_id text references public.study_cafe_shop_items(id) on delete set null,
  description text not null default '' check (char_length(description) <= 160),
  created_at timestamptz not null default now(),
  unique (student_id, source_key)
);

create index if not exists study_cafe_point_ledger_student_created_idx
on public.study_cafe_point_ledger(student_id, created_at desc);

create table if not exists public.study_cafe_inventory (
  student_id text not null references public.students(id) on delete cascade,
  item_id text not null references public.study_cafe_shop_items(id) on delete restrict,
  purchased_at timestamptz not null default now(),
  primary key (student_id, item_id),
  check (student_id like '2%')
);

create index if not exists study_cafe_inventory_student_purchased_idx
on public.study_cafe_inventory(student_id, purchased_at desc);

create table if not exists public.study_cafe_equipment (
  student_id text not null references public.students(id) on delete cascade,
  slot text not null check (slot in ('outfit', 'head', 'desk', 'chair')),
  item_id text not null references public.study_cafe_shop_items(id) on delete restrict,
  equipped_at timestamptz not null default now(),
  primary key (student_id, slot, item_id),
  unique (student_id, item_id),
  check (student_id like '2%')
);

-- Keep legacy outfit ownership valid while allowing the current cosmetic slots.
alter table public.study_cafe_shop_items
  drop constraint if exists study_cafe_shop_items_slot_check;
alter table public.study_cafe_shop_items
  add constraint study_cafe_shop_items_slot_check
  check (slot in ('outfit', 'head', 'desk', 'chair'));
alter table public.study_cafe_equipment
  drop constraint if exists study_cafe_equipment_slot_check;
alter table public.study_cafe_equipment
  add constraint study_cafe_equipment_slot_check
  check (slot in ('outfit', 'head', 'desk', 'chair'));
alter table public.study_cafe_equipment
  drop constraint if exists study_cafe_equipment_pkey;
alter table public.study_cafe_equipment
  add constraint study_cafe_equipment_pkey primary key (student_id, slot, item_id);

insert into public.study_cafe_shop_items
  (id, name, description, slot, icon, price, sort_order, is_active)
values
  ('outfit_coast_guard_uniform', '해경 정복', '해양경찰 정복입니다.', 'outfit', '👮', 4000, 100, true),
  ('head_navy_cap', '네이비 캡', '가볍게 눌러쓰는 기본 스터디 모자입니다.', 'head', '🧢', 800, 110, true),
  ('head_bucket_hat', '버킷햇', '편안한 공부 분위기를 더하는 모자입니다.', 'head', '👒', 1000, 120, true),
  ('head_coast_guard_dress_cap', '해경정모', '해양경찰 정모입니다.', 'head', '🎖️', 2500, 130, true),
  ('desk_sprout', '새싹 화분', '책상 위에 작은 생기를 더합니다.', 'desk', '🪴', 500, 210, true),
  ('desk_lamp', '집중 스탠드', '늦은 시간에도 따뜻한 빛을 밝혀줍니다.', 'desk', '💡', 800, 220, true),
  ('desk_tumbler', '미니 책 더미', '작은 책 더미가 책상에 공부 분위기를 더합니다.', 'desk', '📚', 700, 230, true),
  ('desk_clock', '응원 오리', '책상 위에서 오늘의 공부를 응원하는 노란 오리입니다.', 'desk', '🐥', 1000, 240, true),
  ('chair_navy', '네이비 의자', '차분한 네이비 패브릭 의자입니다.', 'chair', '🪑', 1800, 310, true),
  ('chair_mint', '민트 의자', '산뜻한 민트 컬러의 집중 의자입니다.', 'chair', '🪑', 2200, 320, true),
  ('chair_rose', '로즈 의자', '부드러운 로즈 컬러의 패브릭 의자입니다.', 'chair', '🪑', 2500, 330, true),
  ('chair_premium', '프리미엄 의자', '등받이 포인트가 있는 고급 집중 의자입니다.', 'chair', '🪑', 3500, 340, true),
  ('desk_coast_patrol_ship', '미니 경비함', '흰색 선체와 파란 경광등을 갖춘 경비함 모형입니다.', 'desk', '🚢', 2400, 250, true),
  ('desk_coast_speed_boat', '고속단정', '해상 구조 현장으로 빠르게 출동하는 고속단정입니다.', 'desk', '🚤', 1800, 260, true)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  slot = excluded.slot,
  icon = excluded.icon,
  price = excluded.price,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = now();

update public.study_cafe_shop_items
set is_active = false, updated_at = now()
where id in (
  'outfit_blue_hoodie',
  'outfit_mint_knit',
  'outfit_school_jacket',
  'outfit_lab_coat',
  'head_round_glasses',
  'head_headphones',
  'head_focus_band',
  'head_classic_hat',
  'head_graduation_cap',
  'desk_coast_helicopter',
  'desk_coast_rescue_buoy',
  'desk_coast_lighthouse',
  'head_coast_vessel_cap',
  'head_coast_rescue_helmet',
  'chair_coast_captain'
);

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
  if p_student_id is null or p_student_id not like '2%' then
    raise exception 'invalid_student_id';
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
       v_delta, v_wallet.balance, '순공시간 자동 적립', p_now)
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

create or replace function public.purchase_study_cafe_item(
  p_student_id text,
  p_item_id text,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item public.study_cafe_shop_items%rowtype;
  v_desk_count integer := 0;
  v_wallet public.study_cafe_point_wallets%rowtype;
begin
  select * into v_item
  from public.study_cafe_shop_items
  where id = p_item_id and is_active = true;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'item_not_found');
  end if;

  insert into public.study_cafe_point_wallets (student_id)
  values (p_student_id)
  on conflict (student_id) do nothing;

  select * into v_wallet
  from public.study_cafe_point_wallets
  where student_id = p_student_id
  for update;

  if exists (
    select 1 from public.study_cafe_inventory
    where student_id = p_student_id and item_id = p_item_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'already_owned', 'balance', v_wallet.balance);
  end if;

  if v_wallet.balance < v_item.price then
    return jsonb_build_object('ok', false, 'error', 'insufficient_points', 'balance', v_wallet.balance);
  end if;

  update public.study_cafe_point_wallets
  set balance = balance - v_item.price,
      updated_at = p_now
  where student_id = p_student_id
  returning * into v_wallet;

  insert into public.study_cafe_inventory (student_id, item_id, purchased_at)
  values (p_student_id, p_item_id, p_now);

  insert into public.study_cafe_point_ledger
    (student_id, source_type, source_key, amount, balance_after, item_id, description, created_at)
  values
    (p_student_id, 'purchase', 'purchase:' || p_item_id, -v_item.price,
     v_wallet.balance, p_item_id, v_item.name || ' 구매', p_now);

  return jsonb_build_object('ok', true, 'balance', v_wallet.balance, 'itemId', p_item_id);
end;
$$;

create or replace function public.equip_study_cafe_item(
  p_student_id text,
  p_item_id text,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item public.study_cafe_shop_items%rowtype;
  v_desk_count integer := 0;
begin
  select item.* into v_item
  from public.study_cafe_shop_items as item
  join public.study_cafe_inventory as inventory
    on inventory.item_id = item.id
   and inventory.student_id = p_student_id
  where item.id = p_item_id and item.is_active = true;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'item_not_owned');
  end if;

  if v_item.slot = 'desk' then
    select count(*) into v_desk_count
    from public.study_cafe_equipment
    where student_id = p_student_id and slot = 'desk' and item_id <> p_item_id;

    if v_desk_count >= 4 then
      return jsonb_build_object('ok', false, 'error', 'desk_item_limit');
    end if;

    insert into public.study_cafe_equipment (student_id, slot, item_id, equipped_at)
    values (p_student_id, v_item.slot, p_item_id, p_now)
    on conflict (student_id, slot, item_id) do update set
      equipped_at = excluded.equipped_at;
  else
    delete from public.study_cafe_equipment
    where student_id = p_student_id and slot = v_item.slot;

    insert into public.study_cafe_equipment (student_id, slot, item_id, equipped_at)
    values (p_student_id, v_item.slot, p_item_id, p_now);
  end if;

  return jsonb_build_object('ok', true, 'slot', v_item.slot, 'itemId', p_item_id);
end;
$$;

drop function if exists public.unequip_study_cafe_item(text, text);

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
  if p_student_id is null or p_student_id not like '2%' then
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

alter table public.study_cafe_shop_items enable row level security;
alter table public.study_cafe_point_wallets enable row level security;
alter table public.study_cafe_point_ledger enable row level security;
alter table public.study_cafe_inventory enable row level security;
alter table public.study_cafe_equipment enable row level security;

revoke all on public.study_cafe_shop_items from anon, authenticated;
revoke all on public.study_cafe_point_wallets from anon, authenticated;
revoke all on public.study_cafe_point_ledger from anon, authenticated;
revoke all on public.study_cafe_inventory from anon, authenticated;
revoke all on public.study_cafe_equipment from anon, authenticated;

revoke execute on function public.award_study_cafe_time_points(text, timestamptz) from public, anon, authenticated;
revoke execute on function public.purchase_study_cafe_item(text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.equip_study_cafe_item(text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.unequip_study_cafe_item(text, text, text) from public, anon, authenticated;
grant execute on function public.award_study_cafe_time_points(text, timestamptz) to service_role;
grant execute on function public.purchase_study_cafe_item(text, text, timestamptz) to service_role;
grant execute on function public.equip_study_cafe_item(text, text, timestamptz) to service_role;
grant execute on function public.unequip_study_cafe_item(text, text, text) to service_role;

commit;
