-- Independent private inquiry system for internet students and teachers.

create table if not exists public.student_inquiries (
  id uuid primary key default gen_random_uuid(),
  student_id text not null references public.students(id) on delete cascade,
  category text not null check (category in ('이용 문의', '플래너', '스터디카페', '타이머', '커리큘럼', '게시판', '알림', '계정·기기')),
  title text not null check (char_length(trim(title)) between 2 and 120),
  body text not null check (char_length(trim(body)) between 2 and 5000),
  status text not null default 'open' check (status in ('open', 'answered')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.student_inquiry_messages (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.student_inquiries(id) on delete cascade,
  author_type text not null check (author_type in ('student', 'teacher')),
  student_id text references public.students(id) on delete cascade,
  teacher_name text,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (
    (author_type = 'student' and student_id is not null and teacher_name is null)
    or (author_type = 'teacher' and student_id is null and char_length(trim(teacher_name)) between 1 and 80)
  )
);

create index if not exists student_inquiries_student_created_idx
on public.student_inquiries (student_id, created_at desc)
where deleted_at is null;

create index if not exists student_inquiries_status_created_idx
on public.student_inquiries (status, created_at desc)
where deleted_at is null;

create index if not exists student_inquiry_messages_inquiry_created_idx
on public.student_inquiry_messages (inquiry_id, created_at asc)
where deleted_at is null;

create index if not exists student_inquiry_messages_student_created_idx
on public.student_inquiry_messages (student_id, created_at desc)
where deleted_at is null and student_id is not null;

alter table public.student_inquiries enable row level security;
alter table public.student_inquiry_messages enable row level security;
revoke all on table public.student_inquiries from public, anon, authenticated;
revoke all on table public.student_inquiry_messages from public, anon, authenticated;
grant select, insert, update, delete on table public.student_inquiries to service_role;
grant select, insert, update, delete on table public.student_inquiry_messages to service_role;
