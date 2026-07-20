-- Read-only verification. Returns every check in a single result row.

with function_checks as (
  select
    count(distinct p.proname) as function_count,
    coalesce(bool_and(p.prosecdef), false) as all_security_definer,
    coalesce(bool_and(not has_function_privilege('anon', p.oid, 'execute')), false) as anon_functions_blocked,
    coalesce(bool_and(has_function_privilege('service_role', p.oid, 'execute')), false) as service_role_functions_allowed
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'register_student_device',
      'validate_student_device',
      'revoke_student_device',
      'reset_student_devices'
    )
),
migration_checks as (
  select
    (select count(*)
     from public.students
     where nullif(device_token, '') is not null) as legacy_token_students,
    (select count(*)
     from public.student_devices
     where revoked_at is null) as active_devices,
    (select count(*)
     from public.students s
     where nullif(s.device_token, '') is not null
       and not exists (
         select 1
         from public.student_devices d
         where d.student_id = s.id
           and d.device_token_hash = encode(digest(s.device_token, 'sha256'), 'hex')
       )) as missing_legacy_migrations
),
limit_checks as (
  select
    count(*) filter (where active_count > 2) as students_over_limit,
    coalesce(max(active_count), 0) as maximum_active_devices
  from (
    select student_id, count(*) as active_count
    from public.student_devices
    where revoked_at is null
    group by student_id
  ) active_device_counts
)
select
  to_regclass('public.student_devices') is not null as table_exists,
  coalesce((
    select c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'student_devices'
  ), false) as rls_enabled,
  not has_table_privilege('anon', 'public.student_devices', 'select')
    and not has_table_privilege('anon', 'public.student_devices', 'insert')
    and not has_table_privilege('anon', 'public.student_devices', 'update') as anon_table_blocked,
  function_checks.function_count,
  function_checks.all_security_definer,
  function_checks.anon_functions_blocked,
  function_checks.service_role_functions_allowed,
  migration_checks.legacy_token_students,
  migration_checks.active_devices,
  migration_checks.missing_legacy_migrations,
  limit_checks.students_over_limit,
  limit_checks.maximum_active_devices
from function_checks
cross join migration_checks
cross join limit_checks;
