-- Apply during the release that renames the lecture student label.
-- Safe to run again: the function replacement and data update are idempotent.

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

update public.students
set class_name = '수강생'
where student_category = 'lecture'
  and class_name = '인강생';
