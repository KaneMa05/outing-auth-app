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
  photo_data_url text,
  original_name text,
  created_at timestamptz not null default now(),
  unique (student_id, check_date)
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

create index if not exists attendance_checks_check_date_created_at_idx
on public.attendance_checks (check_date, created_at desc);

create index if not exists penalties_student_id_created_at_idx
on public.penalties (student_id, created_at desc);

create index if not exists notices_created_at_idx
on public.notices (created_at desc);

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
add column if not exists detail text;

alter table public.outing_photos
add column if not exists photo_path text,
add column if not exists photo_url text,
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
alter table public.attendance_checks enable row level security;
alter table public.penalties enable row level security;
alter table public.notices enable row level security;

drop policy if exists "outing_app_students_all" on public.students;
drop policy if exists "outing_app_outings_all" on public.outings;
drop policy if exists "outing_app_photos_all" on public.outing_photos;
drop policy if exists "anon_students_select_active" on public.students;
drop policy if exists "anon_students_insert_roster" on public.students;
drop policy if exists "anon_students_register_profile_once" on public.students;
drop policy if exists "anon_outings_select_not_deleted" on public.outings;
drop policy if exists "anon_outings_insert_request" on public.outings;
drop policy if exists "anon_outings_update_student_status" on public.outings;
drop policy if exists "anon_outings_update_teacher_decision" on public.outings;
drop policy if exists "anon_outings_soft_delete" on public.outings;
drop policy if exists "anon_photos_select" on public.outing_photos;
drop policy if exists "anon_photos_insert" on public.outing_photos;
drop policy if exists "anon_managers_select_active" on public.managers;
drop policy if exists "anon_managers_insert" on public.managers;
drop policy if exists "anon_managers_update" on public.managers;
drop policy if exists "anon_attendance_select" on public.attendance_checks;
drop policy if exists "anon_attendance_insert" on public.attendance_checks;
drop policy if exists "anon_penalties_select" on public.penalties;
drop policy if exists "anon_penalties_insert" on public.penalties;
drop policy if exists "anon_notices_select" on public.notices;
drop policy if exists "anon_notices_insert" on public.notices;
drop policy if exists "anon_notices_update" on public.notices;
drop policy if exists "anon_notices_delete" on public.notices;
drop policy if exists "anon_attendance_photo_select" on storage.objects;
drop policy if exists "anon_attendance_photo_insert" on storage.objects;
drop policy if exists "anon_outing_photo_select" on storage.objects;
drop policy if exists "anon_outing_photo_insert" on storage.objects;

revoke all on public.students from anon;
revoke all on public.outings from anon;
revoke all on public.outing_photos from anon;
revoke all on public.manager_allowed_ips from anon;
revoke all on public.managers from anon;
revoke all on public.attendance_checks from anon;
revoke all on public.penalties from anon;
revoke all on public.notices from anon;

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
  is_active,
  created_at
) on public.students to anon;

grant update (
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
  photo_data_url,
  original_name,
  created_at
) on public.attendance_checks to anon;

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

create policy "anon_outings_select_not_deleted"
on public.outings
for select
to anon
using (deleted_at is null);

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
