-- Classify registration applications and require administrators to assign
-- registration numbers for offline and online-managed students.
alter table public.lecture_applications
add column if not exists course_type text,
add column if not exists cohort smallint;

update public.lecture_applications
set course_type = 'lecture'
where course_type is null;

alter table public.lecture_applications
alter column course_type set default 'lecture',
alter column course_type set not null,
alter column lecture_id drop not null,
alter column lecture_id_normalized drop not null;

alter table public.lecture_applications
drop constraint if exists lecture_applications_course_type_check;

alter table public.lecture_applications
drop constraint if exists lecture_applications_cohort_check;

alter table public.lecture_applications
add constraint lecture_applications_course_type_check
check (course_type in ('offline', 'online_managed', 'lecture'));

alter table public.lecture_applications
add constraint lecture_applications_cohort_check
check (cohort is null or cohort between 1 and 99);

drop index if exists public.lecture_applications_active_lecture_id_idx;
create unique index lecture_applications_active_lecture_id_idx
on public.lecture_applications (lecture_id_normalized)
where status in ('pending', 'approved')
  and course_type = 'lecture'
  and lecture_id_normalized is not null;

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
