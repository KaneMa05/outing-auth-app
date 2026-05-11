create extension if not exists "pgcrypto";

create table if not exists public.students (
  id text primary key,
  name text not null,
  class_name text not null default '오프라인반',
  phone text,
  track text,
  gender text,
  password_hash text,
  device_token text,
  app_registered_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.outings (
  id uuid primary key default gen_random_uuid(),
  student_id text not null references public.students(id) on delete cascade,
  student_name text not null,
  class_name text not null default '오프라인반',
  reason text not null,
  detail text,
  expected_return time,
  status text not null default 'requested'
    check (status in ('requested', 'verified', 'returned')),
  decision text not null default 'pending'
    check (decision in ('pending', 'approved', 'rejected')),
  receipt_note text,
  teacher_memo text,
  early_leave_reason text,
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  returned_at timestamptz,
  deleted_at timestamptz
);

create table if not exists public.outing_photos (
  id uuid primary key default gen_random_uuid(),
  outing_id uuid not null references public.outings(id) on delete cascade,
  photo_type text not null,
  data_url text,
  photo_path text,
  photo_url text,
  thumbnail_path text,
  thumbnail_url text,
  original_name text,
  uploaded_at timestamptz not null default now()
);

create table if not exists public.manager_allowed_ips (
  username text primary key,
  ip_address text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.managers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text,
  memo text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.track_options (
  label text primary key,
  sort_order integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.track_options
add column if not exists sort_order integer;

create table if not exists public.attendance_checks (
  id uuid primary key default gen_random_uuid(),
  student_id text not null references public.students(id) on delete cascade,
  student_name text not null,
  class_name text not null default '오프라인반',
  check_date date not null default ((now() at time zone 'Asia/Seoul')::date),
  status text not null default 'present'
    check (status in ('present', 'pre_arrival_reason')),
  reason text,
  detail text,
  photo_path text not null,
  photo_url text,
  thumbnail_path text,
  thumbnail_url text,
  photo_data_url text,
  original_name text,
  created_at timestamptz not null default now(),
  unique (student_id, check_date)
);

create table if not exists public.attendance_holidays (
  date_key date primary key,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.penalties (
  id uuid primary key default gen_random_uuid(),
  student_id text not null references public.students(id) on delete cascade,
  student_name text not null,
  class_name text not null default '오프라인반',
  points integer not null check (points <> 0),
  reason text not null,
  manager_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.notices (
  id text primary key,
  title text not null,
  body text not null,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  week_number integer not null default 1,
  start_at timestamptz,
  end_at timestamptz,
  target_tracks text[] not null default '{}',
  is_published boolean not null default false,
  score_release_mode text not null default 'after_all_submitted'
    check (score_release_mode in ('hidden', 'after_submit', 'after_all_submitted')),
  explanation_release_mode text not null default 'after_all_submitted'
    check (explanation_release_mode in ('hidden', 'after_submit', 'after_all_submitted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.exam_sections (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  track text not null,
  subject text not null,
  question_count integer not null default 20 check (question_count > 0),
  total_score numeric not null default 100 check (total_score > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (exam_id, track, subject)
);

create table if not exists public.exam_subject_settings (
  id uuid primary key default gen_random_uuid(),
  track text not null,
  subject text not null,
  question_count integer not null default 20 check (question_count > 0),
  total_score numeric not null default 100 check (total_score > 0),
  is_active boolean not null default true,
  sort_order integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (track, subject)
);

create table if not exists public.exam_answers (
  id uuid primary key default gen_random_uuid(),
  exam_section_id uuid not null references public.exam_sections(id) on delete cascade,
  question_number integer not null check (question_number > 0),
  correct_answer integer check (correct_answer between 1 and 4),
  points numeric not null default 5 check (points >= 0),
  unique (exam_section_id, question_number)
);

create table if not exists public.exam_submissions (
  id uuid primary key default gen_random_uuid(),
  exam_section_id uuid not null references public.exam_sections(id) on delete cascade,
  student_id text not null references public.students(id) on delete cascade,
  student_name text not null,
  track text not null,
  status text not null default 'submitted'
    check (status in ('draft', 'submitted', 'cancelled')),
  score numeric not null default 0,
  correct_count integer not null default 0,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (student_id, exam_section_id)
);

create table if not exists public.submission_answers (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.exam_submissions(id) on delete cascade,
  question_number integer not null check (question_number > 0),
  selected_answer integer check (selected_answer between 1 and 4),
  is_correct boolean not null default false,
  points_awarded numeric not null default 0,
  unique (submission_id, question_number)
);

create table if not exists public.exam_files (
  id uuid primary key default gen_random_uuid(),
  exam_section_id uuid not null references public.exam_sections(id) on delete cascade,
  file_type text not null check (file_type = 'answer_pdf'),
  file_path text,
  file_url text,
  original_name text,
  uploaded_at timestamptz not null default now(),
  unique (exam_section_id, file_type)
);

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'exam_answers_correct_answer_check'
      and conrelid = 'public.exam_answers'::regclass
  ) then
    alter table public.exam_answers drop constraint exam_answers_correct_answer_check;
  end if;

  alter table public.exam_answers
  add constraint exam_answers_correct_answer_check
  check (correct_answer is null or correct_answer between 1 and 4);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'submission_answers_selected_answer_check'
      and conrelid = 'public.submission_answers'::regclass
  ) then
    alter table public.submission_answers drop constraint submission_answers_selected_answer_check;
  end if;

  alter table public.submission_answers
  add constraint submission_answers_selected_answer_check
  check (selected_answer is null or selected_answer between 1 and 4);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'exam_files_file_type_check'
      and conrelid = 'public.exam_files'::regclass
  ) then
    alter table public.exam_files drop constraint exam_files_file_type_check;
  end if;

  alter table public.exam_files
  add constraint exam_files_file_type_check
  check (file_type = 'answer_pdf');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'penalties_points_check'
      and conrelid = 'public.penalties'::regclass
  ) then
    alter table public.penalties drop constraint penalties_points_check;
  end if;

  alter table public.penalties
  add constraint penalties_points_check
  check (points <> 0);
exception
  when duplicate_object then null;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attendance-photos', 'attendance-photos', true, 524288, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('outing-photos', 'outing-photos', true, 524288, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exam-files', 'exam-files', true, 10485760, array['application/pdf'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create index if not exists attendance_checks_check_date_created_at_idx
on public.attendance_checks (check_date, created_at desc);

create index if not exists attendance_holidays_date_key_idx
on public.attendance_holidays (date_key desc);

create index if not exists penalties_student_id_created_at_idx
on public.penalties (student_id, created_at desc);

create index if not exists notices_created_at_idx
on public.notices (created_at desc);

create index if not exists exams_week_created_at_idx
on public.exams (week_number desc, created_at desc);

create index if not exists exam_sections_exam_track_idx
on public.exam_sections (exam_id, track);

create index if not exists exam_subject_settings_track_idx
on public.exam_subject_settings (track, sort_order, created_at);

create index if not exists exam_submissions_section_idx
on public.exam_submissions (exam_section_id, submitted_at desc);

create index if not exists exam_submissions_student_idx
on public.exam_submissions (student_id, created_at desc);

delete from public.notices
where id in ('attendance-guide', 'outing-guide');

alter table public.students
add column if not exists track text,
add column if not exists gender text,
add column if not exists password_hash text,
add column if not exists device_token text,
add column if not exists app_registered_at timestamptz;

alter table public.attendance_checks
add column if not exists reason text,
add column if not exists detail text,
add column if not exists thumbnail_path text,
add column if not exists thumbnail_url text;

alter table public.outing_photos
add column if not exists photo_path text,
add column if not exists photo_url text,
add column if not exists thumbnail_path text,
add column if not exists thumbnail_url text,
alter column data_url drop not null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'attendance_checks_status_check'
      and conrelid = 'public.attendance_checks'::regclass
  ) then
    alter table public.attendance_checks drop constraint attendance_checks_status_check;
  end if;
end $$;

alter table public.attendance_checks
add constraint attendance_checks_status_check
check (status in ('present', 'pre_arrival_reason'));

alter table public.students enable row level security;
alter table public.outings enable row level security;
alter table public.outing_photos enable row level security;
alter table public.manager_allowed_ips enable row level security;
alter table public.managers enable row level security;
alter table public.track_options enable row level security;
alter table public.attendance_checks enable row level security;
alter table public.attendance_holidays enable row level security;
alter table public.penalties enable row level security;
alter table public.notices enable row level security;
alter table public.exams enable row level security;
alter table public.exam_sections enable row level security;
alter table public.exam_subject_settings enable row level security;
alter table public.exam_answers enable row level security;
alter table public.exam_submissions enable row level security;
alter table public.submission_answers enable row level security;
alter table public.exam_files enable row level security;

drop policy if exists "outing_app_students_all" on public.students;
drop policy if exists "outing_app_outings_all" on public.outings;
drop policy if exists "outing_app_photos_all" on public.outing_photos;
drop policy if exists "anon_students_select_active" on public.students;
drop policy if exists "anon_students_insert_roster" on public.students;
drop policy if exists "anon_students_register_profile_once" on public.students;
drop policy if exists "anon_students_update_roster_before_registration" on public.students;
drop policy if exists "anon_track_options_select_active" on public.track_options;
drop policy if exists "anon_track_options_insert" on public.track_options;
drop policy if exists "anon_track_options_update" on public.track_options;
drop policy if exists "anon_outings_select_not_deleted" on public.outings;
drop policy if exists "anon_outings_insert_request" on public.outings;
drop policy if exists "anon_outings_update_student_status" on public.outings;
drop policy if exists "anon_outings_update_teacher_decision" on public.outings;
drop policy if exists "anon_outings_soft_delete" on public.outings;
drop policy if exists "anon_outings_restore_deleted" on public.outings;
drop policy if exists "anon_photos_select" on public.outing_photos;
drop policy if exists "anon_photos_insert" on public.outing_photos;
drop policy if exists "anon_managers_select_active" on public.managers;
drop policy if exists "anon_managers_insert" on public.managers;
drop policy if exists "anon_managers_update" on public.managers;
drop policy if exists "anon_attendance_select" on public.attendance_checks;
drop policy if exists "anon_attendance_insert" on public.attendance_checks;
drop policy if exists "anon_attendance_holidays_select" on public.attendance_holidays;
drop policy if exists "anon_attendance_holidays_insert" on public.attendance_holidays;
drop policy if exists "anon_attendance_holidays_update" on public.attendance_holidays;
drop policy if exists "anon_attendance_holidays_delete" on public.attendance_holidays;
drop policy if exists "anon_penalties_select" on public.penalties;
drop policy if exists "anon_penalties_insert" on public.penalties;
drop policy if exists "anon_notices_select" on public.notices;
drop policy if exists "anon_notices_insert" on public.notices;
drop policy if exists "anon_notices_update" on public.notices;
drop policy if exists "anon_notices_delete" on public.notices;
drop policy if exists "anon_exams_select" on public.exams;
drop policy if exists "anon_exams_insert" on public.exams;
drop policy if exists "anon_exams_update" on public.exams;
drop policy if exists "anon_exam_sections_select" on public.exam_sections;
drop policy if exists "anon_exam_sections_insert" on public.exam_sections;
drop policy if exists "anon_exam_sections_update" on public.exam_sections;
drop policy if exists "anon_exam_sections_delete" on public.exam_sections;
drop policy if exists "anon_exam_subject_settings_select" on public.exam_subject_settings;
drop policy if exists "anon_exam_subject_settings_insert" on public.exam_subject_settings;
drop policy if exists "anon_exam_subject_settings_update" on public.exam_subject_settings;
drop policy if exists "anon_exam_answers_select" on public.exam_answers;
drop policy if exists "anon_exam_answers_insert" on public.exam_answers;
drop policy if exists "anon_exam_answers_update" on public.exam_answers;
drop policy if exists "anon_exam_submissions_select" on public.exam_submissions;
drop policy if exists "anon_exam_submissions_insert" on public.exam_submissions;
drop policy if exists "anon_exam_submissions_update" on public.exam_submissions;
drop policy if exists "anon_submission_answers_select" on public.submission_answers;
drop policy if exists "anon_submission_answers_insert" on public.submission_answers;
drop policy if exists "anon_submission_answers_update" on public.submission_answers;
drop policy if exists "anon_exam_files_select" on public.exam_files;
drop policy if exists "anon_exam_files_insert" on public.exam_files;
drop policy if exists "anon_exam_files_update" on public.exam_files;
drop policy if exists "anon_attendance_photo_select" on storage.objects;
drop policy if exists "anon_attendance_photo_insert" on storage.objects;
drop policy if exists "anon_outing_photo_select" on storage.objects;
drop policy if exists "anon_outing_photo_insert" on storage.objects;
drop policy if exists "anon_exam_file_select" on storage.objects;
drop policy if exists "anon_exam_file_insert" on storage.objects;

revoke all on public.students from anon;
revoke all on public.outings from anon;
revoke all on public.outing_photos from anon;
revoke all on public.manager_allowed_ips from anon;
revoke all on public.managers from anon;
revoke all on public.track_options from anon;
revoke all on public.attendance_checks from anon;
revoke all on public.attendance_holidays from anon;
revoke all on public.penalties from anon;
revoke all on public.notices from anon;
revoke all on public.exams from anon;
revoke all on public.exam_sections from anon;
revoke all on public.exam_subject_settings from anon;
revoke all on public.exam_answers from anon;
revoke all on public.exam_submissions from anon;
revoke all on public.submission_answers from anon;
revoke all on public.exam_files from anon;

grant select (
  id,
  name,
  class_name,
  track,
  gender,
  app_registered_at,
  is_active,
  created_at
) on public.students to anon;

grant insert (
  id,
  name,
  class_name,
  track,
  is_active,
  created_at
) on public.students to anon;

grant update (
  name,
  class_name,
  track,
  gender,
  password_hash,
  device_token,
  app_registered_at
) on public.students to anon;

grant select (
  id,
  student_id,
  student_name,
  class_name,
  reason,
  detail,
  expected_return,
  status,
  decision,
  receipt_note,
  early_leave_reason,
  created_at,
  verified_at,
  returned_at,
  deleted_at
) on public.outings to anon;

grant insert (
  id,
  student_id,
  student_name,
  class_name,
  reason,
  detail,
  expected_return,
  status,
  decision,
  receipt_note,
  early_leave_reason,
  created_at,
  verified_at,
  returned_at
) on public.outings to anon;

grant update (
  status,
  decision,
  receipt_note,
  teacher_memo,
  verified_at,
  returned_at,
  deleted_at
) on public.outings to anon;

grant select (
  id,
  outing_id,
  photo_type,
  data_url,
  photo_path,
  photo_url,
  thumbnail_path,
  thumbnail_url,
  original_name,
  uploaded_at
) on public.outing_photos to anon;

grant insert (
  id,
  outing_id,
  photo_type,
  data_url,
  photo_path,
  photo_url,
  thumbnail_path,
  thumbnail_url,
  original_name,
  uploaded_at
) on public.outing_photos to anon;

grant select (
  id,
  name,
  role,
  memo,
  is_active,
  created_at
) on public.managers to anon;

grant insert (
  id,
  name,
  role,
  memo,
  is_active,
  created_at
) on public.managers to anon;

grant update (
  name,
  role,
  memo,
  is_active,
  created_at
) on public.managers to anon;

grant select (
  label,
  sort_order,
  is_active,
  created_at
) on public.track_options to anon;

grant insert (
  label,
  sort_order,
  is_active,
  created_at
) on public.track_options to anon;

grant update (
  label,
  sort_order,
  is_active,
  created_at
) on public.track_options to anon;

grant select (
  id,
  student_id,
  student_name,
  class_name,
  check_date,
  status,
  reason,
  detail,
  photo_path,
  photo_url,
  thumbnail_path,
  thumbnail_url,
  photo_data_url,
  original_name,
  created_at
) on public.attendance_checks to anon;

grant select (
  id,
  title,
  body,
  is_published,
  created_at,
  updated_at
) on public.notices to anon;

grant insert (
  id,
  title,
  body,
  is_published,
  created_at,
  updated_at
) on public.notices to anon;

grant update (
  title,
  body,
  is_published,
  created_at,
  updated_at
) on public.notices to anon;

grant delete on public.notices to anon;

grant select (
  id,
  student_id,
  student_name,
  class_name,
  points,
  reason,
  manager_name,
  created_at
) on public.penalties to anon;

grant insert (
  id,
  student_id,
  student_name,
  class_name,
  points,
  reason,
  manager_name,
  created_at
) on public.penalties to anon;

grant insert (
  id,
  student_id,
  student_name,
  class_name,
  check_date,
  status,
  reason,
  detail,
  photo_path,
  photo_url,
  thumbnail_path,
  thumbnail_url,
  photo_data_url,
  original_name,
  created_at
) on public.attendance_checks to anon;

grant select (
  date_key,
  note,
  created_at,
  updated_at
) on public.attendance_holidays to anon;

grant insert (
  date_key,
  note,
  created_at,
  updated_at
) on public.attendance_holidays to anon;

grant update (
  note,
  created_at,
  updated_at
) on public.attendance_holidays to anon;

grant delete on public.attendance_holidays to anon;

grant select, insert, update on public.exams to anon;
grant select, insert, update, delete on public.exam_sections to anon;
grant select, insert, update on public.exam_subject_settings to anon;
grant select, insert, update on public.exam_answers to anon;
grant select, insert, update on public.exam_submissions to anon;
grant select, insert, update on public.submission_answers to anon;
grant select, insert, update on public.exam_files to anon;

create policy "anon_students_select_active"
on public.students
for select
to anon
using (is_active = true);

create policy "anon_students_insert_roster"
on public.students
for insert
to anon
with check (
  is_active = true
  and password_hash is null
  and device_token is null
  and app_registered_at is null
);

create policy "anon_students_register_profile_once"
on public.students
for update
to anon
using (
  is_active = true
  and (
    (app_registered_at is null and password_hash is null and device_token is null)
    or (app_registered_at is not null and password_hash is not null and device_token is null)
  )
)
with check (
  is_active = true
  and app_registered_at is not null
  and password_hash is not null
  and device_token is not null
);

create policy "anon_students_update_roster_before_registration"
on public.students
for update
to anon
using (
  is_active = true
  and app_registered_at is null
  and password_hash is null
  and device_token is null
)
with check (
  is_active = true
  and app_registered_at is null
  and password_hash is null
  and device_token is null
);

create policy "anon_track_options_select_active"
on public.track_options
for select
to anon
using (is_active = true);

create policy "anon_track_options_insert"
on public.track_options
for insert
to anon
with check (label <> '');

create policy "anon_track_options_update"
on public.track_options
for update
to anon
using (true)
with check (label <> '');

create policy "anon_outings_select_not_deleted"
on public.outings
for select
to anon
using (true);

create policy "anon_outings_insert_request"
on public.outings
for insert
to anon
with check (
  deleted_at is null
  and status = 'requested'
  and decision = 'pending'
  and teacher_memo is null
  and verified_at is null
  and returned_at is null
);

create policy "anon_outings_update_student_status"
on public.outings
for update
to anon
using (deleted_at is null and decision <> 'rejected')
with check (
  deleted_at is null
  and decision <> 'rejected'
  and teacher_memo is null
  and status in ('verified', 'returned')
);

create policy "anon_outings_update_teacher_decision"
on public.outings
for update
to anon
using (deleted_at is null)
with check (
  deleted_at is null
  and decision in ('approved', 'rejected')
);

create policy "anon_outings_soft_delete"
on public.outings
for update
to anon
using (deleted_at is null)
with check (
  deleted_at is not null
);

create policy "anon_outings_restore_deleted"
on public.outings
for update
to anon
using (deleted_at is not null)
with check (
  deleted_at is null
);

create policy "anon_photos_select"
on public.outing_photos
for select
to anon
using (
  exists (
    select 1
    from public.outings
    where outings.id = outing_photos.outing_id
      and outings.deleted_at is null
  )
);

create policy "anon_photos_insert"
on public.outing_photos
for insert
to anon
with check (
  exists (
    select 1
    from public.outings
    where outings.id = outing_photos.outing_id
      and outings.deleted_at is null
      and outings.decision <> 'rejected'
  )
  and (outing_photos.data_url is not null or outing_photos.photo_url is not null or outing_photos.photo_path is not null)
);

create policy "anon_managers_select_active"
on public.managers
for select
to anon
using (is_active = true);

create policy "anon_managers_insert"
on public.managers
for insert
to anon
with check (is_active = true and name is not null);

create policy "anon_managers_update"
on public.managers
for update
to anon
using (true)
with check (name is not null);

create policy "anon_attendance_select"
on public.attendance_checks
for select
to anon
using (true);

create policy "anon_attendance_insert"
on public.attendance_checks
for insert
to anon
with check (
  status in ('present', 'pre_arrival_reason')
  and check_date = ((now() at time zone 'Asia/Seoul')::date)
  and photo_path is not null
);

create policy "anon_attendance_holidays_select"
on public.attendance_holidays
for select
to anon
using (true);

create policy "anon_attendance_holidays_insert"
on public.attendance_holidays
for insert
to anon
with check (date_key is not null);

create policy "anon_attendance_holidays_update"
on public.attendance_holidays
for update
to anon
using (true)
with check (date_key is not null);

create policy "anon_attendance_holidays_delete"
on public.attendance_holidays
for delete
to anon
using (true);

create policy "anon_penalties_select"
on public.penalties
for select
to anon
using (true);

create policy "anon_penalties_insert"
on public.penalties
for insert
to anon
with check (
  points <> 0
  and reason is not null
  and manager_name is not null
);

create policy "anon_notices_select"
on public.notices
for select
to anon
using (true);

create policy "anon_notices_insert"
on public.notices
for insert
to anon
with check (title is not null and body is not null);

create policy "anon_notices_update"
on public.notices
for update
to anon
using (true)
with check (title is not null and body is not null);

create policy "anon_notices_delete"
on public.notices
for delete
to anon
using (true);

create policy "anon_exams_select"
on public.exams
for select
to anon
using (true);

create policy "anon_exams_insert"
on public.exams
for insert
to anon
with check (name is not null and week_number > 0);

create policy "anon_exams_update"
on public.exams
for update
to anon
using (true)
with check (name is not null and week_number > 0);

create policy "anon_exam_sections_select"
on public.exam_sections
for select
to anon
using (true);

create policy "anon_exam_sections_insert"
on public.exam_sections
for insert
to anon
with check (track is not null and subject is not null and question_count > 0);

create policy "anon_exam_sections_update"
on public.exam_sections
for update
to anon
using (true)
with check (track is not null and subject is not null and question_count > 0);

create policy "anon_exam_sections_delete"
on public.exam_sections
for delete
to anon
using (true);

create policy "anon_exam_subject_settings_select"
on public.exam_subject_settings
for select
to anon
using (true);

create policy "anon_exam_subject_settings_insert"
on public.exam_subject_settings
for insert
to anon
with check (track is not null and subject is not null and question_count > 0);

create policy "anon_exam_subject_settings_update"
on public.exam_subject_settings
for update
to anon
using (true)
with check (track is not null and subject is not null and question_count > 0);

create policy "anon_exam_answers_select"
on public.exam_answers
for select
to anon
using (true);

create policy "anon_exam_answers_insert"
on public.exam_answers
for insert
to anon
with check (question_number > 0 and (correct_answer is null or correct_answer between 1 and 4));

create policy "anon_exam_answers_update"
on public.exam_answers
for update
to anon
using (true)
with check (question_number > 0 and (correct_answer is null or correct_answer between 1 and 4));

create policy "anon_exam_submissions_select"
on public.exam_submissions
for select
to anon
using (true);

create policy "anon_exam_submissions_insert"
on public.exam_submissions
for insert
to anon
with check (student_id is not null and status in ('draft', 'submitted', 'cancelled'));

create policy "anon_exam_submissions_update"
on public.exam_submissions
for update
to anon
using (true)
with check (student_id is not null and status in ('draft', 'submitted', 'cancelled'));

create policy "anon_submission_answers_select"
on public.submission_answers
for select
to anon
using (true);

create policy "anon_submission_answers_insert"
on public.submission_answers
for insert
to anon
with check (question_number > 0 and (selected_answer is null or selected_answer between 1 and 4));

create policy "anon_submission_answers_update"
on public.submission_answers
for update
to anon
using (true)
with check (question_number > 0 and (selected_answer is null or selected_answer between 1 and 4));

create policy "anon_exam_files_select"
on public.exam_files
for select
to anon
using (true);

create policy "anon_exam_files_insert"
on public.exam_files
for insert
to anon
with check (file_type = 'answer_pdf');

create policy "anon_exam_files_update"
on public.exam_files
for update
to anon
using (true)
with check (file_type = 'answer_pdf');

create policy "anon_attendance_photo_select"
on storage.objects
for select
to anon
using (bucket_id = 'attendance-photos');

create policy "anon_attendance_photo_insert"
on storage.objects
for insert
to anon
with check (
  bucket_id = 'attendance-photos'
  and lower((storage.foldername(name))[1]) = to_char((now() at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD')
);

create policy "anon_outing_photo_select"
on storage.objects
for select
to anon
using (bucket_id = 'outing-photos');

create policy "anon_outing_photo_insert"
on storage.objects
for insert
to anon
with check (
  bucket_id = 'outing-photos'
  and lower((storage.foldername(name))[1]) = to_char((now() at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD')
);

create policy "anon_exam_file_select"
on storage.objects
for select
to anon
using (bucket_id = 'exam-files');

create policy "anon_exam_file_insert"
on storage.objects
for insert
to anon
with check (bucket_id = 'exam-files');
