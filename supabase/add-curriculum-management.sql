-- Curriculum catalog managed through the server-side /api/curriculum endpoint.
create table if not exists public.curriculum_subjects (
  id text primary key,
  name text not null check (char_length(name) between 1 and 60),
  short_name text not null check (char_length(short_name) between 1 and 12),
  tone text not null default 'indigo' check (tone in ('indigo', 'teal', 'violet')),
  target_tracks text[] not null default array['경찰직 - 공채(순경)']::text[],
  sort_order integer not null default 1 check (sort_order between 1 and 999),
  is_published boolean not null default true,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.curriculum_subjects
add column if not exists target_tracks text[] not null default array['경찰직 - 공채(순경)']::text[];

create table if not exists public.curriculum_stages (
  id text primary key,
  subject_id text not null references public.curriculum_subjects(id) on delete cascade,
  stage_number integer not null check (stage_number between 1 and 100),
  title text not null check (char_length(title) between 1 and 160),
  sort_order integer not null default 1 check (sort_order between 1 and 100),
  is_published boolean not null default true,
  requires_wrap_up boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.curriculum_stages
add column if not exists requires_wrap_up boolean not null default true;

create table if not exists public.curriculum_lectures (
  id text primary key,
  stage_id text not null references public.curriculum_stages(id) on delete cascade,
  lecture_number text not null check (char_length(lecture_number) between 1 and 30),
  title text not null check (char_length(title) between 1 and 240),
  sort_order integer not null default 1 check (sort_order between 1 and 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.curriculum_student_lecture_progress (
  student_id text not null references public.students(id) on delete cascade,
  lecture_id text not null references public.curriculum_lectures(id) on delete cascade,
  completed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (student_id, lecture_id)
);

create table if not exists public.curriculum_student_stage_progress (
  student_id text not null references public.students(id) on delete cascade,
  stage_id text not null references public.curriculum_stages(id) on delete cascade,
  consolidation_completed boolean not null default false,
  mbt_completed boolean not null default false,
  stage_completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (student_id, stage_id)
);

create index if not exists curriculum_subjects_published_sort_idx
on public.curriculum_subjects(is_archived, is_published, sort_order);

create index if not exists curriculum_stages_subject_sort_idx
on public.curriculum_stages(subject_id, sort_order);

create index if not exists curriculum_lectures_stage_sort_idx
on public.curriculum_lectures(stage_id, sort_order);

create index if not exists curriculum_subjects_target_tracks_idx
on public.curriculum_subjects using gin(target_tracks);

create index if not exists curriculum_lecture_progress_lecture_idx
on public.curriculum_student_lecture_progress(lecture_id);

create index if not exists curriculum_stage_progress_stage_idx
on public.curriculum_student_stage_progress(stage_id);

alter table public.curriculum_subjects enable row level security;
alter table public.curriculum_stages enable row level security;
alter table public.curriculum_lectures enable row level security;
alter table public.curriculum_student_lecture_progress enable row level security;
alter table public.curriculum_student_stage_progress enable row level security;

revoke all on public.curriculum_subjects from anon, authenticated;
revoke all on public.curriculum_stages from anon, authenticated;
revoke all on public.curriculum_lectures from anon, authenticated;
revoke all on public.curriculum_student_lecture_progress from anon, authenticated;
revoke all on public.curriculum_student_stage_progress from anon, authenticated;

grant select, insert, update, delete on public.curriculum_subjects to service_role;
grant select, insert, update, delete on public.curriculum_stages to service_role;
grant select, insert, update, delete on public.curriculum_lectures to service_role;
grant select, insert, update, delete on public.curriculum_student_lecture_progress to service_role;
grant select, insert, update, delete on public.curriculum_student_stage_progress to service_role;
