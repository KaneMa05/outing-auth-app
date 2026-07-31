begin;

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

alter table public.study_cafe_todos enable row level security;
revoke all on public.study_cafe_todos from anon;

alter table public.study_cafe_presence
drop constraint if exists study_cafe_presence_seat_number_check;

alter table public.study_cafe_presence
add constraint study_cafe_presence_seat_number_check
check (seat_number between 1 and 192)
not valid;

alter table public.study_cafe_presence
validate constraint study_cafe_presence_seat_number_check;

commit;
