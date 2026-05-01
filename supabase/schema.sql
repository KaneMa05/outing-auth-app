create extension if not exists "pgcrypto";

create table if not exists public.students (
  id text primary key,
  name text not null,
  class_name text not null default '오프라인반',
  phone text,
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

alter table public.students enable row level security;
alter table public.outings enable row level security;
alter table public.outing_photos enable row level security;

drop policy if exists "outing_app_students_all" on public.students;
drop policy if exists "outing_app_outings_all" on public.outings;
drop policy if exists "outing_app_photos_all" on public.outing_photos;

create policy "outing_app_students_all"
on public.students
for all
to anon
using (true)
with check (true);

create policy "outing_app_outings_all"
on public.outings
for all
to anon
using (true)
with check (true);

create policy "outing_app_photos_all"
on public.outing_photos
for all
to anon
using (true)
with check (true);
