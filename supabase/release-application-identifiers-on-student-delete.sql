-- Release application identifiers when an approved student account is deactivated.
-- Safe to run again: function/trigger replacement and the backfill are idempotent.

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

-- Repair accounts that were deactivated before this trigger existed.
update public.lecture_applications as application
set
  status = 'cancelled',
  reviewed_at = coalesce(application.reviewed_at, now()),
  reviewed_by = coalesce(application.reviewed_by, 'system:student_deleted')
from public.students as student
where application.approved_student_id = student.id
  and application.status = 'approved'
  and student.is_active = false;
