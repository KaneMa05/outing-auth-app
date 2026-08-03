begin;

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

alter table public.study_cafe_subject_goals enable row level security;
revoke all on public.study_cafe_subject_goals from anon;

commit;
