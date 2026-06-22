-- Reset app registration only for students whose normalized name appears more than once.
-- Run the preview query first. Run the transaction only after confirming the target list.

-- 1) Preview targets. This does not change data.
with normalized_students as (
  select
    id,
    name,
    regexp_replace(trim(name), '\s+', '', 'g') as normalized_name,
    class_name,
    track,
    gender,
    is_active,
    password_hash,
    device_token,
    app_registered_at,
    created_at
  from public.students
),
duplicate_names as (
  select normalized_name
  from normalized_students
  where normalized_name <> ''
  group by normalized_name
  having count(*) > 1
)
select
  s.normalized_name,
  s.id,
  s.name,
  s.class_name,
  s.track,
  s.gender,
  s.is_active,
  s.app_registered_at,
  case
    when s.password_hash is not null or s.device_token is not null or s.app_registered_at is not null
      then 'will_reset'
    else 'already_empty'
  end as reset_status,
  s.created_at
from normalized_students s
join duplicate_names d on d.normalized_name = s.normalized_name
order by s.normalized_name, s.id;

-- 2) Execute reset. This clears only registered/auth fields for duplicate-name students.
-- Run this whole statement at once. It does not depend on temporary tables.
with normalized_students as (
  select
    id,
    name,
    regexp_replace(trim(name), '\s+', '', 'g') as normalized_name,
    password_hash,
    device_token,
    app_registered_at
  from public.students
),
duplicate_names as (
  select normalized_name
  from normalized_students
  where normalized_name <> ''
  group by normalized_name
  having count(*) > 1
),
reset_targets as (
  select s.*
  from normalized_students s
  join duplicate_names d on d.normalized_name = s.normalized_name
  where s.password_hash is not null
     or s.device_token is not null
     or s.app_registered_at is not null
),
event_rows as (
  insert into public.student_registration_events (
    student_id,
    student_name,
    event_type,
    device_token,
    reason,
    actor,
    client_display_mode,
    client_user_agent
  )
  select
    id,
    name,
    'reset',
    device_token,
    'duplicate_name_registration_reset',
    'sql',
    'sql',
    'reset-duplicate-name-registrations.sql'
  from reset_targets
  returning student_id
),
updated_rows as (
  update public.students s
  set
    password_hash = null,
    device_token = null,
    app_registered_at = null
  from reset_targets t
  where s.id = t.id
  returning s.id
)
select
  (select count(*) from reset_targets) as target_count,
  (select count(*) from event_rows) as event_count,
  (select count(*) from updated_rows) as reset_student_count;
