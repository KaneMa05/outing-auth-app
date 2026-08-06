-- Lecture students apply before a student account exists. Only the server-side
-- service role can read or mutate this table through the Data API.
create table if not exists public.lecture_applications (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 40),
  phone text not null,
  phone_normalized text not null check (phone_normalized ~ '^01[0-9]{8,9}$'),
  birth_date date not null check (birth_date between date '1900-01-01' and current_date),
  gender text not null check (gender in ('남', '여')),
  track text not null check (char_length(track) between 1 and 100),
  referral_source text not null
    check (referral_source in ('naver_cafe', 'referral', 'youtube', 'search', 'other')),
  referral_source_detail text,
  lecture_id text not null check (char_length(lecture_id) between 2 and 80),
  lecture_id_normalized text not null check (char_length(lecture_id_normalized) between 2 and 80),
  lookup_token_hash text check (lookup_token_hash is null or lookup_token_hash ~ '^[0-9a-f]{64}$'),
  privacy_consent_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  rejection_reason text,
  approved_student_id text references public.students(id),
  reviewed_at timestamptz,
  reviewed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists lecture_applications_active_phone_idx
on public.lecture_applications (phone_normalized)
where status in ('pending', 'approved');

create unique index if not exists lecture_applications_active_lecture_id_idx
on public.lecture_applications (lecture_id_normalized)
where status in ('pending', 'approved');

create index if not exists lecture_applications_status_created_idx
on public.lecture_applications (status, created_at desc);

create index if not exists lecture_applications_approved_student_idx
on public.lecture_applications (approved_student_id)
where approved_student_id is not null;

create unique index if not exists lecture_applications_lookup_token_idx
on public.lecture_applications (lookup_token_hash)
where lookup_token_hash is not null;

create sequence if not exists public.lecture_student_number_seq
start with 1 increment by 1 minvalue 1;

do $$
declare
  current_offset bigint;
begin
  select coalesce(max(id::bigint) - 900000, 0)
  into current_offset
  from public.students
  where id ~ '^9[0-9]{5}$';

  if current_offset > 0 then
    perform setval('public.lecture_student_number_seq', current_offset, true);
  else
    perform setval('public.lecture_student_number_seq', 1, false);
  end if;
end $$;

create or replace function public.approve_lecture_application()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  next_student_id text;
begin
  new.updated_at := now();

  if old.status = 'approved' and new.status <> 'approved' then
    raise exception 'approved_application_is_final';
  end if;

  if new.status = 'approved' and old.status <> 'approved' then
    loop
      next_student_id := (900000 + nextval('public.lecture_student_number_seq'))::text;
      exit when not exists (select 1 from public.students where id = next_student_id);
    end loop;

    insert into public.students (
      id,
      name,
      class_name,
      student_category,
      cohort,
      track,
      gender,
      attendance_excluded,
      fitness_excluded,
      is_active,
      created_at
    ) values (
      next_student_id,
      new.name,
      '수강생',
      'lecture',
      null,
      new.track,
      new.gender,
      true,
      false,
      true,
      now()
    );

    new.approved_student_id := next_student_id;
    new.reviewed_at := coalesce(new.reviewed_at, now());
    new.rejection_reason := null;
  elsif new.status = 'rejected' and old.status <> 'rejected' then
    if nullif(btrim(new.rejection_reason), '') is null then
      raise exception 'rejection_reason_required';
    end if;
    new.reviewed_at := coalesce(new.reviewed_at, now());
  end if;

  return new;
end;
$$;

drop trigger if exists lecture_application_review_trigger on public.lecture_applications;
create trigger lecture_application_review_trigger
before update of status on public.lecture_applications
for each row
execute function public.approve_lecture_application();

alter table public.lecture_applications enable row level security;

revoke all on table public.lecture_applications from anon, authenticated;
revoke all on sequence public.lecture_student_number_seq from anon, authenticated;
grant select, insert, update on table public.lecture_applications to service_role;
grant usage, select on sequence public.lecture_student_number_seq to service_role;
