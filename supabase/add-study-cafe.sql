create table if not exists public.study_cafe_profiles (
  student_id text primary key references public.students(id) on delete cascade,
  avatar_tone text not null default 'navy'
    check (avatar_tone in ('navy', 'blue', 'mint', 'purple', 'orange', 'rose')),
  nickname text
    check (nickname is null or (
      char_length(trim(nickname)) between 2 and 10
      and nickname ~ '^[가-힣A-Za-z0-9 ]+$'
    )),
  updated_at timestamptz not null default now(),
  check (student_id like '2%')
);

alter table public.study_cafe_profiles
add column if not exists nickname text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'study_cafe_profiles_nickname_check'
      and conrelid = 'public.study_cafe_profiles'::regclass
  ) then
    alter table public.study_cafe_profiles
    add constraint study_cafe_profiles_nickname_check
    check (nickname is null or (
      char_length(trim(nickname)) between 2 and 10
      and nickname ~ '^[가-힣A-Za-z0-9 ]+$'
    ));
  end if;
end
$$;

create table if not exists public.study_cafe_subjects (
  id uuid primary key default gen_random_uuid(),
  student_id text not null references public.students(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 20),
  sort_order integer not null default 0 check (sort_order between 0 and 7),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, name),
  unique (student_id, sort_order),
  check (student_id like '2%')
);

create table if not exists public.study_cafe_todos (
  id uuid primary key default gen_random_uuid(),
  student_id text not null references public.students(id) on delete cascade,
  study_date date not null,
  subject_name text not null check (char_length(trim(subject_name)) between 1 and 20),
  content text not null check (char_length(trim(content)) between 1 and 80),
  is_completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (student_id like '2%'),
  check (
    (is_completed = false and completed_at is null)
    or (is_completed = true and completed_at is not null)
  )
);

create index if not exists study_cafe_todos_student_date_idx
on public.study_cafe_todos(student_id, study_date, created_at);

create table if not exists public.study_cafe_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id text not null references public.students(id) on delete cascade,
  subject_name text not null check (char_length(trim(subject_name)) between 1 and 20),
  status text not null default 'running'
    check (status in ('running', 'paused', 'completed')),
  elapsed_seconds integer not null default 0 check (elapsed_seconds >= 0),
  started_at timestamptz not null default now(),
  active_started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (student_id like '2%'),
  check (
    (status = 'running' and active_started_at is not null and ended_at is null)
    or (status = 'paused' and active_started_at is null and ended_at is null)
    or (status = 'completed' and active_started_at is null and ended_at is not null)
  )
);

create unique index if not exists study_cafe_one_active_session_per_student
on public.study_cafe_sessions(student_id)
where status in ('running', 'paused');

create index if not exists study_cafe_sessions_student_started_idx
on public.study_cafe_sessions(student_id, started_at desc);

create index if not exists study_cafe_sessions_started_idx
on public.study_cafe_sessions(started_at desc);

create table if not exists public.study_cafe_presence (
  student_id text primary key references public.students(id) on delete cascade,
  seat_number integer not null check (seat_number between 1 and 192),
  status text not null default 'seated'
    check (status in ('seated', 'countdown', 'studying', 'paused')),
  current_subject text,
  avatar_tone text not null default 'navy'
    check (avatar_tone in ('navy', 'blue', 'mint', 'purple', 'orange', 'rose')),
  display_name text
    check (display_name is null or (
      char_length(trim(display_name)) between 2 and 10
      and display_name ~ '^[가-힣A-Za-z0-9 ]+$'
    )),
  last_heartbeat_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (seat_number),
  check (student_id like '2%')
);

alter table public.study_cafe_presence
drop constraint if exists study_cafe_presence_seat_number_check;

alter table public.study_cafe_presence
add constraint study_cafe_presence_seat_number_check
check (seat_number between 1 and 192);

alter table public.study_cafe_presence
add column if not exists display_name text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'study_cafe_presence_display_name_check'
      and conrelid = 'public.study_cafe_presence'::regclass
  ) then
    alter table public.study_cafe_presence
    add constraint study_cafe_presence_display_name_check
    check (display_name is null or (
      char_length(trim(display_name)) between 2 and 10
      and display_name ~ '^[가-힣A-Za-z0-9 ]+$'
    ));
  end if;
end
$$;

create index if not exists study_cafe_presence_heartbeat_idx
on public.study_cafe_presence(last_heartbeat_at);

create or replace function public.replace_study_cafe_subjects(
  p_student_id text,
  p_subjects jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_student_id is null
    or p_student_id not like '2%'
    or jsonb_typeof(p_subjects) <> 'array'
    or jsonb_array_length(p_subjects) not between 1 and 8
    or exists (
      select 1
      from jsonb_array_elements_text(p_subjects) as item(name)
      where char_length(trim(item.name)) not between 1 and 20
    )
    or (
      select count(*)
      from (select distinct trim(item.name) from jsonb_array_elements_text(p_subjects) as item(name)) unique_names
    ) <> jsonb_array_length(p_subjects)
  then
    raise exception 'invalid_subjects';
  end if;

  delete from public.study_cafe_subjects
  where student_id = p_student_id;

  insert into public.study_cafe_subjects (student_id, name, sort_order, updated_at)
  select p_student_id, trim(item.name), item.ordinality::integer - 1, now()
  from jsonb_array_elements_text(p_subjects) with ordinality as item(name, ordinality);
end;
$$;

alter table public.study_cafe_profiles enable row level security;
alter table public.study_cafe_subjects enable row level security;
alter table public.study_cafe_todos enable row level security;
alter table public.study_cafe_sessions enable row level security;
alter table public.study_cafe_presence enable row level security;

revoke all on public.study_cafe_profiles from anon;
revoke all on public.study_cafe_subjects from anon;
revoke all on public.study_cafe_todos from anon;
revoke all on public.study_cafe_sessions from anon;
revoke all on public.study_cafe_presence from anon;
revoke all on function public.replace_study_cafe_subjects(text, jsonb) from public;
revoke all on function public.replace_study_cafe_subjects(text, jsonb) from anon;
revoke all on function public.replace_study_cafe_subjects(text, jsonb) from authenticated;
grant execute on function public.replace_study_cafe_subjects(text, jsonb) to service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'study_cafe_presence'
    ) then
      alter publication supabase_realtime add table public.study_cafe_presence;
    end if;
  end if;
end
$$;
