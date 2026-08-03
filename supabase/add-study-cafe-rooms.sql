-- RONPARK STUDYCAFE: private study rooms, room seats, and member-only chat.
-- Run this file once in the Supabase SQL editor. It is safe to run again.

create extension if not exists pgcrypto;

create table if not exists public.study_cafe_rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 20),
  description text not null default '' check (char_length(description) <= 50),
  capacity integer not null check (capacity between 2 and 20),
  theme text not null default 'oak' check (theme in ('oak', 'dawn', 'forest', 'night', 'classic')),
  access_type text not null default 'public' check (access_type in ('public', 'password')),
  password_hash text,
  password_salt text,
  host_student_id text not null references public.students(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  check (host_student_id like '2%'),
  check (
    (access_type = 'public' and password_hash is null and password_salt is null)
    or
    (access_type = 'password' and password_hash is not null and password_salt is not null)
  )
);

alter table public.study_cafe_rooms
add column if not exists theme text not null default 'oak';

alter table public.study_cafe_rooms
alter column theme set default 'oak';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'study_cafe_rooms_theme_check'
      and conrelid = 'public.study_cafe_rooms'::regclass
  ) then
    alter table public.study_cafe_rooms
    add constraint study_cafe_rooms_theme_check
    check (theme in ('oak', 'dawn', 'forest', 'night', 'classic'));
  end if;
end
$$;

create index if not exists study_cafe_rooms_active_updated_idx
on public.study_cafe_rooms(is_active, updated_at desc);

create table if not exists public.study_cafe_room_members (
  room_id uuid not null references public.study_cafe_rooms(id) on delete cascade,
  student_id text not null references public.students(id) on delete cascade,
  role text not null default 'member' check (role in ('host', 'member')),
  seat_number integer,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (room_id, student_id),
  unique (student_id),
  check (student_id like '2%'),
  check (seat_number is null or seat_number between 1 and 20)
);

create unique index if not exists study_cafe_room_one_host
on public.study_cafe_room_members(room_id)
where role = 'host';

create unique index if not exists study_cafe_room_one_member_per_seat
on public.study_cafe_room_members(room_id, seat_number)
where seat_number is not null;

create index if not exists study_cafe_room_members_room_joined_idx
on public.study_cafe_room_members(room_id, joined_at);

create table if not exists public.study_cafe_room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.study_cafe_rooms(id) on delete cascade,
  student_id text references public.students(id) on delete set null,
  message_type text not null default 'chat' check (message_type in ('chat', 'system')),
  message_text text not null check (char_length(message_text) between 1 and 300),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_student_id text references public.students(id) on delete set null,
  check (
    (message_type = 'chat' and student_id is not null)
    or message_type = 'system'
  )
);

create index if not exists study_cafe_room_messages_room_created_idx
on public.study_cafe_room_messages(room_id, created_at desc);

drop function if exists public.create_study_cafe_room(text, text, text, integer, text, text, text);

-- Creates a room and joins the creator as host in one transaction.
create or replace function public.create_study_cafe_room(
  p_host_student_id text,
  p_name text,
  p_description text,
  p_capacity integer,
  p_theme text,
  p_access_type text,
  p_password_hash text,
  p_password_salt text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id uuid;
begin
  if exists (
    select 1 from public.study_cafe_room_members
    where student_id = p_host_student_id
  ) then
    raise exception 'room_membership_exists' using errcode = 'P0001';
  end if;

  insert into public.study_cafe_rooms (
    name, description, capacity, theme, access_type,
    password_hash, password_salt, host_student_id
  ) values (
    trim(p_name), coalesce(trim(p_description), ''), p_capacity, p_theme, p_access_type,
    p_password_hash, p_password_salt, p_host_student_id
  ) returning id into v_room_id;

  insert into public.study_cafe_room_members (room_id, student_id, role)
  values (v_room_id, p_host_student_id, 'host');

  insert into public.study_cafe_room_messages (room_id, message_type, message_text)
  values (v_room_id, 'system', '스터디방이 만들어졌습니다.');

  return v_room_id;
end;
$$;

-- The API verifies the password before calling this transaction-safe join.
create or replace function public.join_study_cafe_room(
  p_room_id uuid,
  p_student_id text,
  p_display_name text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.study_cafe_rooms%rowtype;
  v_member_count integer;
begin
  select * into v_room
  from public.study_cafe_rooms
  where id = p_room_id
  for update;

  if v_room.id is null or not v_room.is_active then
    raise exception 'room_not_found' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.study_cafe_room_members where student_id = p_student_id) then
    raise exception 'room_membership_exists' using errcode = 'P0001';
  end if;

  select count(*) into v_member_count
  from public.study_cafe_room_members
  where room_id = p_room_id;
  if v_member_count >= v_room.capacity then
    raise exception 'room_full' using errcode = 'P0001';
  end if;

  insert into public.study_cafe_room_members (room_id, student_id)
  values (p_room_id, p_student_id);
  insert into public.study_cafe_room_messages (room_id, message_type, message_text)
  values (p_room_id, 'system', left(coalesce(nullif(trim(p_display_name), ''), '새 구성원'), 40) || '님이 참여했습니다.');
  update public.study_cafe_rooms set updated_at = now() where id = p_room_id;
  return true;
end;
$$;

-- Claims or moves to a room-local seat. Row locks plus the unique index prevent races.
create or replace function public.claim_study_cafe_room_seat(
  p_room_id uuid,
  p_student_id text,
  p_seat_number integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_capacity integer;
begin
  select capacity into v_capacity
  from public.study_cafe_rooms
  where id = p_room_id and is_active = true
  for update;
  if v_capacity is null then
    raise exception 'room_not_found' using errcode = 'P0001';
  end if;
  if p_seat_number < 1 or p_seat_number > v_capacity then
    raise exception 'invalid_room_seat' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.study_cafe_room_members
    where room_id = p_room_id and student_id = p_student_id
  ) then
    raise exception 'room_membership_required' using errcode = 'P0001';
  end if;

  update public.study_cafe_room_members
  set seat_number = p_seat_number, updated_at = now()
  where room_id = p_room_id and student_id = p_student_id;
  update public.study_cafe_rooms set updated_at = now() where id = p_room_id;
  return true;
exception
  when unique_violation then
    raise exception 'room_seat_taken' using errcode = 'P0001';
end;
$$;

-- Leaves a room, transfers host to the longest-standing member, or closes an empty room.
create or replace function public.leave_study_cafe_room(
  p_room_id uuid,
  p_student_id text,
  p_display_name text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_next_host text;
begin
  perform 1 from public.study_cafe_rooms where id = p_room_id for update;
  select role into v_role
  from public.study_cafe_room_members
  where room_id = p_room_id and student_id = p_student_id;
  if v_role is null then
    raise exception 'room_membership_required' using errcode = 'P0001';
  end if;

  delete from public.study_cafe_room_members
  where room_id = p_room_id and student_id = p_student_id;

  select student_id into v_next_host
  from public.study_cafe_room_members
  where room_id = p_room_id
  order by joined_at asc
  limit 1;

  if v_next_host is null then
    update public.study_cafe_rooms
    set is_active = false, closed_at = now(), updated_at = now()
    where id = p_room_id;
  else
    if v_role = 'host' then
      update public.study_cafe_room_members
      set role = 'host', updated_at = now()
      where room_id = p_room_id and student_id = v_next_host;
      update public.study_cafe_rooms
      set host_student_id = v_next_host, updated_at = now()
      where id = p_room_id;
      insert into public.study_cafe_room_messages (room_id, message_type, message_text)
      values (p_room_id, 'system', '방장이 자동으로 변경되었습니다.');
    else
      update public.study_cafe_rooms set updated_at = now() where id = p_room_id;
    end if;
    insert into public.study_cafe_room_messages (room_id, message_type, message_text)
    values (p_room_id, 'system', left(coalesce(nullif(trim(p_display_name), ''), '구성원'), 40) || '님이 나갔습니다.');
  end if;
  return true;
end;
$$;

alter table public.study_cafe_rooms enable row level security;
alter table public.study_cafe_room_members enable row level security;
alter table public.study_cafe_room_messages enable row level security;

revoke all on public.study_cafe_rooms from anon, authenticated;
revoke all on public.study_cafe_room_members from anon, authenticated;
revoke all on public.study_cafe_room_messages from anon, authenticated;
revoke all on function public.create_study_cafe_room(text, text, text, integer, text, text, text, text) from public, anon, authenticated;
revoke all on function public.join_study_cafe_room(uuid, text, text) from public, anon, authenticated;
revoke all on function public.claim_study_cafe_room_seat(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.leave_study_cafe_room(uuid, text, text) from public, anon, authenticated;

grant execute on function public.create_study_cafe_room(text, text, text, integer, text, text, text, text) to service_role;
grant execute on function public.join_study_cafe_room(uuid, text, text) to service_role;
grant execute on function public.claim_study_cafe_room_seat(uuid, text, integer) to service_role;
grant execute on function public.leave_study_cafe_room(uuid, text, text) to service_role;
