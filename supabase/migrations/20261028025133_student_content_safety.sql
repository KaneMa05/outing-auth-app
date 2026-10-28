begin;
create table public.student_content_blocks (
  student_id text not null references public.students(id) on delete cascade,
  blocked_student_id text not null references public.students(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (student_id, blocked_student_id),
  check (student_id <> blocked_student_id)
);
create table public.student_content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_student_id text not null references public.students(id) on delete cascade,
  reported_student_id text references public.students(id) on delete set null,
  surface text not null check (surface in ('post','comment','message','feedback','reply','profile','room','member')),
  target_id text not null check (char_length(target_id) between 1 and 200),
  context_id text check (context_id is null or char_length(context_id) <= 200),
  snapshot text not null check (char_length(snapshot) <= 6000),
  reason text not null check (char_length(trim(reason)) between 2 and 300),
  status text not null default 'pending' check (status in ('pending','removed','dismissed')),
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index student_content_reports_pending_unique
on public.student_content_reports(reporter_student_id, surface, target_id) where status='pending';
create index student_content_reports_queue on public.student_content_reports(status,created_at);
create index student_content_reports_rate on public.student_content_reports(reporter_student_id,created_at);
create index student_content_blocks_target on public.student_content_blocks(blocked_student_id);
create index student_content_reports_target on public.student_content_reports(reported_student_id);
alter table public.student_content_blocks enable row level security;
alter table public.student_content_reports enable row level security;
revoke all on public.student_content_blocks, public.student_content_reports from public, anon, authenticated;
grant select, insert, update, delete on public.student_content_blocks, public.student_content_reports to service_role;
commit;
