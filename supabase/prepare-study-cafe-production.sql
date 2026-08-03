begin;

alter table public.study_cafe_profiles
add column if not exists status_message text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'study_cafe_profiles_status_message_check'
      and conrelid = 'public.study_cafe_profiles'::regclass
  ) then
    alter table public.study_cafe_profiles
    add constraint study_cafe_profiles_status_message_check
    check (status_message is null or char_length(trim(status_message)) between 1 and 40);
  end if;
end
$$;

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

create table if not exists public.study_cafe_subject_goals (
  student_id text not null references public.students(id) on delete cascade,
  study_date date not null,
  subject_name text not null check (char_length(trim(subject_name)) between 1 and 20),
  target_minutes integer not null check (target_minutes between 60 and 600 and target_minutes % 60 = 0),
  result_status text check (result_status is null or result_status in ('on_time', 'overtime')),
  completed_elapsed_seconds integer not null default 0 check (completed_elapsed_seconds >= 0),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (student_id, study_date, subject_name),
  check (student_id like '2%')
);

create index if not exists study_cafe_subject_goals_student_date_idx
on public.study_cafe_subject_goals(student_id, study_date);


alter table public.study_cafe_todos enable row level security;
alter table public.study_cafe_subject_goals enable row level security;
revoke all on public.study_cafe_todos from anon;
revoke all on public.study_cafe_subject_goals from anon;

alter table public.study_cafe_presence
drop constraint if exists study_cafe_presence_seat_number_check;

alter table public.study_cafe_presence
add constraint study_cafe_presence_seat_number_check
check (seat_number between 1 and 192)
not valid;

alter table public.study_cafe_presence
validate constraint study_cafe_presence_seat_number_check;

commit;
