begin;
set local lock_timeout='1s';
set local statement_timeout='15s';

-- Existing rows retain their course. Enforce the expanded set for new writes
-- without scanning either enrollment table while holding an exclusive lock.
alter table public.ip_members
  drop constraint ip_members_access_product_check,
  add constraint ip_members_access_product_check
    check (access_product in ('interview_package','interview_only','aptitude_only')) not valid;
alter table public.ip_applications
  drop constraint ip_applications_access_product_check,
  add constraint ip_applications_access_product_check
    check (access_product in ('interview_package','interview_only','aptitude_only')) not valid;

-- Patch only product validation and entitlement predicates. Keep current
-- approval, revisions, expiry, suspension, invoker security and RPC grants.
do $migration$
declare patch record; source text;
begin
 for patch in select * from (values
  ('public.ip_service(text,jsonb,jsonb)',
   $old$('interview_package','aptitude_only')$old$,
   $new$('interview_package','interview_only','aptitude_only')$new$,1),
  ('public.ip_service(text,jsonb,jsonb)',
   $old$v_member.access_product='interview_package'$old$,
   $new$v_member.access_product in ('interview_package','interview_only')$new$,2),
  ('public.ip_portal_service(text,jsonb,jsonb)',
   $old$('interview_package','aptitude_only')$old$,
   $new$('interview_package','interview_only','aptitude_only')$new$,4),
  ('public.ip_mock_access_service(text,jsonb,jsonb)',
   $old$m.access_product='interview_package'$old$,
   $new$m.access_product in ('interview_package','interview_only')$new$,1),
  ('public.ip_aptitude_service(text,jsonb,jsonb)',
   $old$where m.student_id=owner_id and m.enabled$old$,
   $new$where m.student_id=owner_id and m.access_product in ('interview_package','aptitude_only') and m.enabled$new$,1)
 ) as changes(signature,original,replacement,expected_hits)
 loop
  source:=replace(pg_get_functiondef(patch.signature::regprocedure),E'\r\n',E'\n');
  if (length(source)-length(replace(source,patch.original,'')))/length(patch.original)<>patch.expected_hits then
   raise exception 'Unexpected % definition near %: review interview-only migration',patch.signature,left(patch.original,90);
  end if;
  execute replace(source,patch.original,patch.replacement);
 end loop;
end;
$migration$;
commit;

-- Validation permits normal reads and writes while checking existing rows.
begin;
set local lock_timeout='1s';
set local statement_timeout='15s';
alter table public.ip_members validate constraint ip_members_access_product_check;
alter table public.ip_applications validate constraint ip_applications_access_product_check;
commit;
