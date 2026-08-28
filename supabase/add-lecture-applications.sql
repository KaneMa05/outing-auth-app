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
  course_type text not null default 'lecture'
    check (course_type in ('offline', 'online_managed', 'lecture')),
  cohort smallint check (cohort is null or cohort between 1 and 99),
  referral_source text not null
    check (referral_source in ('naver_cafe', 'referral', 'youtube', 'search', 'other')),
  referral_source_detail text,
  lecture_id text check (lecture_id is null or char_length(lecture_id) between 2 and 80),
  lecture_id_normalized text check (lecture_id_normalized is null or char_length(lecture_id_normalized) between 2 and 80),
  lookup_token_hash text check (lookup_token_hash is null or lookup_token_hash ~ '^[0-9a-f]{64}$'),
  privacy_consent_at timestamptz not null,
  terms_consent_at timestamptz not null,
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
where status in ('pending', 'approved')
  and course_type = 'lecture'
  and lecture_id_normalized is not null;

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
  next_class_name text;
  next_attendance_excluded boolean;
begin
  new.updated_at := now();

  if old.status = 'approved'
    and new.status <> 'approved'
    and not (
      new.status = 'cancelled'
      and new.approved_student_id is not null
      and exists (
        select 1
        from public.students
        where id = new.approved_student_id
          and is_active = false
      )
    ) then
    raise exception 'approved_application_is_final';
  end if;

  if new.status = 'approved' and old.status <> 'approved' then
    if new.course_type in ('offline', 'online_managed') then
      next_student_id := nullif(btrim(new.approved_student_id), '');
      if new.cohort is null or new.cohort < 1 or new.cohort > 99 then
        raise exception 'invalid_cohort';
      end if;
      if next_student_id is null then
        raise exception 'registration_number_required';
      end if;
      if next_student_id !~ ('^' || new.cohort::text || '[0-9]{3}$')
        or right(next_student_id, 3) = '000' then
        raise exception 'registration_number_cohort_mismatch';
      end if;
      if exists (select 1 from public.students where id = next_student_id) then
        raise exception 'registration_number_in_use';
      end if;
    else
      loop
        next_student_id := (900000 + nextval('public.lecture_student_number_seq'))::text;
        exit when not exists (select 1 from public.students where id = next_student_id);
      end loop;
    end if;

    next_class_name := case new.course_type
      when 'offline' then '오프라인반'
      when 'online_managed' then '온라인 관리반'
      else '수강생'
    end;
    next_attendance_excluded := new.course_type <> 'offline';

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
      next_class_name,
      new.course_type,
      case when new.course_type = 'lecture' then null else new.cohort end,
      new.track,
      new.gender,
      next_attendance_excluded,
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

create schema if not exists private;
revoke all on schema private from public;

create or replace function private.cancel_application_for_deactivated_student()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.lecture_applications
  set
    status = 'cancelled',
    reviewed_at = coalesce(reviewed_at, now()),
    reviewed_by = coalesce(reviewed_by, 'system:student_deleted')
  where approved_student_id = new.id
    and status = 'approved';

  return new;
end;
$$;

revoke all on function private.cancel_application_for_deactivated_student() from public;

drop trigger if exists cancel_application_on_student_deactivation on public.students;
create trigger cancel_application_on_student_deactivation
after update of is_active on public.students
for each row
when (old.is_active = true and new.is_active = false)
execute function private.cancel_application_for_deactivated_student();

alter table public.lecture_applications enable row level security;

revoke all on table public.lecture_applications from anon, authenticated;
revoke all on sequence public.lecture_student_number_seq from anon, authenticated;
grant select, insert, update on table public.lecture_applications to service_role;
grant usage, select on sequence public.lecture_student_number_seq to service_role;
