-- Lecture-only subject Q&A board. All access goes through the server API after
-- student-device or teacher-session verification.
create table if not exists public.question_posts (
  id uuid primary key default gen_random_uuid(),
  student_id text not null references public.students(id) on delete cascade,
  board_type text not null default 'subject' check (board_type in ('subject', 'notice', 'free')),
  subject text not null check (char_length(trim(subject)) between 1 and 40),
  title text not null check (char_length(trim(title)) between 2 and 120),
  body text not null check (char_length(trim(body)) between 2 and 5000),
  status text not null default 'open' check (status in ('open', 'answered')),
  view_count integer not null default 0 check (view_count >= 0),
  is_hidden boolean not null default false,
  hidden_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by text
);

alter table public.question_posts
add column if not exists board_type text not null default 'subject';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'question_posts_board_type_check'
      and conrelid = 'public.question_posts'::regclass
  ) then
    alter table public.question_posts
    add constraint question_posts_board_type_check
    check (board_type in ('subject', 'notice', 'free'));
  end if;
end
$$;

create table if not exists public.question_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.question_posts(id) on delete cascade,
  author_type text not null check (author_type in ('student', 'teacher')),
  student_id text references public.students(id) on delete cascade,
  teacher_name text,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  is_hidden boolean not null default false,
  hidden_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by text,
  check (
    (author_type = 'student' and student_id is not null and teacher_name is null)
    or (author_type = 'teacher' and student_id is null and char_length(trim(teacher_name)) between 1 and 80)
  )
);

create table if not exists public.question_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_student_id text not null references public.students(id) on delete cascade,
  post_id uuid references public.question_posts(id) on delete cascade,
  comment_id uuid references public.question_comments(id) on delete cascade,
  reason text not null check (char_length(trim(reason)) between 2 and 300),
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text,
  check ((post_id is not null)::integer + (comment_id is not null)::integer = 1)
);

create index if not exists question_posts_visible_created_idx
on public.question_posts (is_hidden, created_at desc)
where deleted_at is null;

create index if not exists question_posts_subject_created_idx
on public.question_posts (board_type, subject, created_at desc)
where deleted_at is null;

create index if not exists question_posts_student_idx
on public.question_posts (student_id, created_at desc);

create index if not exists question_comments_post_created_idx
on public.question_comments (post_id, created_at asc)
where deleted_at is null;

create unique index if not exists question_reports_pending_post_student_idx
on public.question_reports (reporter_student_id, post_id)
where post_id is not null and status = 'pending';

create unique index if not exists question_reports_pending_comment_student_idx
on public.question_reports (reporter_student_id, comment_id)
where comment_id is not null and status = 'pending';

alter table public.question_posts enable row level security;
alter table public.question_comments enable row level security;
alter table public.question_reports enable row level security;

revoke all on table public.question_posts from public, anon, authenticated;
revoke all on table public.question_comments from public, anon, authenticated;
revoke all on table public.question_reports from public, anon, authenticated;

grant select, insert, update, delete on table public.question_posts to service_role;
grant select, insert, update, delete on table public.question_comments to service_role;
grant select, insert, update, delete on table public.question_reports to service_role;

create or replace function public.increment_question_view_count(p_post_id uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.question_posts
  set view_count = view_count + 1
  where id = p_post_id
    and deleted_at is null
    and is_hidden = false;
$$;

revoke all on function public.increment_question_view_count(uuid) from public, anon, authenticated;
grant execute on function public.increment_question_view_count(uuid) to service_role;
