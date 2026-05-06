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
  data_url text not null,
  original_name text,
  uploaded_at timestamptz not null default now()
);

alter table public.students
add column if not exists track text,
add column if not exists gender text,
add column if not exists password_hash text,
add column if not exists device_token text,
add column if not exists app_registered_at timestamptz;

alter table public.students enable row level security;
alter table public.outings enable row level security;
alter table public.outing_photos enable row level security;

drop policy if exists "outing_app_students_all" on public.students;
drop policy if exists "outing_app_outings_all" on public.outings;
drop policy if exists "outing_app_photos_all" on public.outing_photos;
drop policy if exists "anon_students_select_active" on public.students;
drop policy if exists "anon_students_insert_roster" on public.students;
drop policy if exists "anon_students_register_profile_once" on public.students;
drop policy if exists "anon_outings_select_not_deleted" on public.outings;
drop policy if exists "anon_outings_insert_request" on public.outings;
drop policy if exists "anon_outings_update_student_status" on public.outings;
drop policy if exists "anon_outings_soft_delete" on public.outings;
drop policy if exists "anon_photos_select" on public.outing_photos;
drop policy if exists "anon_photos_insert" on public.outing_photos;

revoke all on public.students from anon;
revoke all on public.outings from anon;
revoke all on public.outing_photos from anon;

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
  created_at,
  verified_at,
  returned_at
) on public.outings to anon;

grant update (
  status,
  receipt_note,
  verified_at,
  returned_at,
  deleted_at
) on public.outings to anon;

grant select (
  id,
  outing_id,
  photo_type,
  data_url,
  original_name,
  uploaded_at
) on public.outing_photos to anon;

grant insert (
  id,
  outing_id,
  photo_type,
  data_url,
  original_name,
  uploaded_at
) on public.outing_photos to anon;

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
  and early_leave_reason is null
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
);
