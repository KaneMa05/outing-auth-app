-- Use the same interview owner directory and open-ended enrollment as practice modes.
-- Feature flags, pilot access checks, one-use credentials and paid-session limits stay in place.
begin;
set local lock_timeout='5s';
alter table public.ip_native_launch_codes drop constraint ip_native_launch_codes_student_id_fkey;
alter table public.ip_native_launch_codes add constraint ip_native_launch_codes_student_id_fkey
 foreign key(student_id) references public.ip_owners(id) on delete cascade;

create or replace function public.ip_native_launch_service(p_action text,p_actor jsonb,p_body jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_id text; v_code text:=p_body->>'codeHash';
begin
 if v_code is null or v_code !~ '^[a-f0-9]{64}$' then raise exception 'invalid_request'; end if;
 if p_action='issue' then
  v_id:=p_actor->>'id';
  if p_actor->>'type' is distinct from 'student' then raise exception 'forbidden'; end if;
  if not exists(select 1 from public.ip_student_directory s join public.ip_members m on m.student_id=s.id
    where s.id=v_id and s.is_active and coalesce(s.account_type,'student')='student' and m.enabled
      and (m.expires_on is null or m.expires_on>=(now() at time zone 'Asia/Seoul')::date)
      and (select enabled from public.ip_settings where id)) then raise exception 'not_enrolled'; end if;
  delete from public.ip_native_launch_codes where expires_at<now();
  insert into public.ip_native_launch_codes values(v_id,v_code,now()+interval '60 seconds')
   on conflict(student_id) do update set code_hash=excluded.code_hash,expires_at=excluded.expires_at;
  return jsonb_build_object('ok',true);
 elsif p_action='consume' then
  if p_actor->>'type' is distinct from 'server' then raise exception 'forbidden'; end if;
  delete from public.ip_native_launch_codes where code_hash=v_code and expires_at>now() returning student_id into v_id;
  if v_id is null then raise exception 'unauthorized'; end if;
  if not exists(select 1 from public.ip_student_directory s join public.ip_members m on m.student_id=s.id
    where s.id=v_id and s.is_active and coalesce(s.account_type,'student')='student' and m.enabled
      and (m.expires_on is null or m.expires_on>=(now() at time zone 'Asia/Seoul')::date)
      and (select enabled from public.ip_settings where id)) then raise exception 'not_enrolled'; end if;
  return jsonb_build_object('ok',true,'studentId',v_id);
 end if;
 raise exception 'unsupported_action';
end $$;
revoke all on function public.ip_native_launch_service(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ip_native_launch_service(text,jsonb,jsonb) to service_role;

-- Patch only enrollment and retention in the current Live function, preserving later additions.
do $patch$
declare definition text:=pg_get_functiondef('public.ip_live_service(text,jsonb,jsonb)'::regprocedure);
 replacement record;
begin
 for replacement in select * from (values
  ('from public.students where id=v_id', 'from public.ip_student_directory where id=v_id'),
  ('v_member.enabled and v_member.expires_on>=(now() at time zone ''Asia/Seoul'')::date',
   'v_member.enabled and (v_member.expires_on is null or v_member.expires_on>=(now() at time zone ''Asia/Seoul'')::date)'),
  ('when v_member.expires_on is null then ''enrollment_end_required'' when not v_ready then ''not_enrolled''',
   'when not v_ready then ''not_enrolled'''),
  ('(v_member.expires_on+31)::timestamp at time zone ''Asia/Seoul'',v_questions',
   'case when v_member.expires_on is null then now()+interval ''31 days'' else (v_member.expires_on+31)::timestamp at time zone ''Asia/Seoul'' end,v_questions')
 ) as changes(old_text,new_text) loop
  if (length(definition)-length(replace(definition,replacement.old_text,'')))/length(replacement.old_text)<>1 then
   raise exception 'unexpected_live_enrollment_definition';
  end if;
  definition:=replace(definition,replacement.old_text,replacement.new_text);
 end loop;
 execute definition;
end $patch$;
commit;
