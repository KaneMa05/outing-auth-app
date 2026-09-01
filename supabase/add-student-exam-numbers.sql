create table if not exists public.student_exam_numbers (
  student_id text primary key references public.students(id) on delete cascade,
  exam_number text not null check (char_length(exam_number) between 1 and 50),
  updated_by text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.student_exam_numbers enable row level security;

revoke all on table public.student_exam_numbers from public, anon, authenticated;
grant select, insert, update, delete on table public.student_exam_numbers to service_role;

create index if not exists student_exam_numbers_exam_number_idx
on public.student_exam_numbers (exam_number);
