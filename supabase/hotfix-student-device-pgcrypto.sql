-- Production hotfix for Supabase projects where pgcrypto is installed in the
-- extensions schema. This changes function configuration only; it does not
-- modify student or device rows.

begin;

alter function public.register_student_device(
  text, text, text, text, text, text, text, text, text
)
set search_path = public, extensions, pg_temp;

alter function public.validate_student_device(
  text, text, text, text
)
set search_path = public, extensions, pg_temp;

commit;

-- Both rows should include: public, extensions, pg_temp
select
  p.proname,
  p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('register_student_device', 'validate_student_device')
order by p.proname;
