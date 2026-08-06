-- Student experiences are explicit. Registration-number patterns remain only
-- as a one-time compatibility backfill for existing students.
alter table public.students
add column if not exists student_category text,
add column if not exists cohort smallint;

update public.students
set student_category = case
  when id like '2%' then 'lecture'
  when class_name like '%온라인%' then 'online_managed'
  else 'offline'
end
where student_category is null
   or student_category not in ('offline', 'online_managed', 'lecture');

update public.students
set cohort = case
  when student_category = 'lecture' then null
  when id ~ '^\d{4,5}$' then left(id, length(id) - 3)::smallint
  else cohort
end
where cohort is null
  and student_category <> 'lecture';

alter table public.students
alter column student_category set default 'offline',
alter column student_category set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'students_student_category_check'
      and conrelid = 'public.students'::regclass
  ) then
    alter table public.students
    add constraint students_student_category_check
    check (student_category in ('offline', 'online_managed', 'lecture'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'students_cohort_check'
      and conrelid = 'public.students'::regclass
  ) then
    alter table public.students
    add constraint students_cohort_check
    check (cohort between 1 and 99);
  end if;
end $$;

-- The browser reads these fields to choose the correct student experience.
-- Category changes remain server-only; do not grant anon insert/update here.
grant select (student_category, cohort) on public.students to anon;
