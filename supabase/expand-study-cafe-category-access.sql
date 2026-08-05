-- Study-cafe access is controlled by students.student_category and the server
-- APIs. Legacy ID-prefix checks would reject online-managed and 900001+ users.
alter table if exists public.study_cafe_profiles
drop constraint if exists study_cafe_profiles_student_id_check;

alter table if exists public.study_cafe_subjects
drop constraint if exists study_cafe_subjects_student_id_check;

alter table if exists public.study_cafe_todos
drop constraint if exists study_cafe_todos_student_id_check;

alter table if exists public.study_cafe_subject_goals
drop constraint if exists study_cafe_subject_goals_student_id_check;

alter table if exists public.study_cafe_sessions
drop constraint if exists study_cafe_sessions_student_id_check;

alter table if exists public.study_cafe_presence
drop constraint if exists study_cafe_presence_student_id_check;

alter table if exists public.study_cafe_rooms
drop constraint if exists study_cafe_rooms_host_student_id_check;

alter table if exists public.study_cafe_room_members
drop constraint if exists study_cafe_room_members_student_id_check;

create or replace function public.replace_study_cafe_subjects(
  p_student_id text,
  p_subjects jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_student_id is null
    or not exists (
      select 1
      from public.students
      where id = p_student_id
        and is_active = true
        and student_category in ('online_managed', 'lecture')
    )
    or jsonb_typeof(p_subjects) <> 'array'
    or jsonb_array_length(p_subjects) not between 1 and 8
    or exists (
      select 1
      from jsonb_array_elements_text(p_subjects) as item(name)
      where char_length(trim(item.name)) not between 1 and 20
    )
    or (
      select count(*)
      from (select distinct trim(item.name) from jsonb_array_elements_text(p_subjects) as item(name)) unique_names
    ) <> jsonb_array_length(p_subjects)
  then
    raise exception 'invalid_subjects';
  end if;

  delete from public.study_cafe_subjects
  where student_id = p_student_id;

  insert into public.study_cafe_subjects (student_id, name, sort_order, updated_at)
  select p_student_id, trim(item.name), item.ordinality::integer - 1, now()
  from jsonb_array_elements_text(p_subjects) with ordinality as item(name, ordinality);
end;
$$;

revoke all on function public.replace_study_cafe_subjects(text, jsonb) from public;
revoke all on function public.replace_study_cafe_subjects(text, jsonb) from anon;
revoke all on function public.replace_study_cafe_subjects(text, jsonb) from authenticated;
grant execute on function public.replace_study_cafe_subjects(text, jsonb) to service_role;

