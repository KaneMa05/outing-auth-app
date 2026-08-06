alter table public.students
add column if not exists account_type text not null default 'student';

alter table public.students
add column if not exists position text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'students_account_type_check'
      and conrelid = 'public.students'::regclass
  ) then
    alter table public.students add constraint students_account_type_check
    check (account_type in ('student', 'teacher'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'students_teacher_account_check'
      and conrelid = 'public.students'::regclass
  ) then
    alter table public.students add constraint students_teacher_account_check
    check (
      (account_type = 'student' and position is null and id !~ '^(10|[1-9])$')
      or (
        account_type = 'teacher'
        and position = '선생님'
        and id ~ '^(10|[1-9])$'
        and student_category = 'lecture'
      )
    );
  end if;
end
$$;

revoke all on public.students from anon;

grant select (
  id,
  name,
  class_name,
  student_category,
  account_type,
  position,
  cohort,
  track,
  gender,
  app_registered_at,
  attendance_excluded,
  fitness_excluded,
  is_active,
  created_at
) on public.students to anon;

grant insert (
  id,
  name,
  class_name,
  track,
  attendance_excluded,
  fitness_excluded,
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
  app_registered_at,
  attendance_excluded,
  fitness_excluded,
  is_active
) on public.students to anon;

-- question_comments already supports teacher authors. Allow an app teacher account
-- to retain its students-row id so ownership and deletion checks remain reliable.
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.question_comments'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%author_type%'
      and pg_get_constraintdef(oid) like '%teacher_name%'
  loop
    execute format('alter table public.question_comments drop constraint %I', constraint_name);
  end loop;
end
$$;

alter table public.question_comments
add constraint question_comments_author_identity_check
check (
  (author_type = 'student' and student_id is not null and teacher_name is null)
  or (
    author_type = 'teacher'
    and char_length(trim(teacher_name)) between 1 and 80
  )
);
