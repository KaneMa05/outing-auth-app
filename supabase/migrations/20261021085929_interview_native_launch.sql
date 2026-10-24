-- Only the server can issue/consume a 60-second, one-use native handoff code.
create table public.ip_native_launch_codes (
 student_id text primary key references public.students(id) on delete cascade,
 code_hash text not null unique check(code_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz not null
);
alter table public.ip_native_launch_codes enable row level security;
revoke all on public.ip_native_launch_codes from public,anon,authenticated;
grant select,insert,update,delete on public.ip_native_launch_codes to service_role;
create function public.ip_native_launch_service(p_action text,p_actor jsonb,p_body jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_id text; v_code text:=p_body->>'codeHash';
begin
 if v_code is null or v_code !~ '^[a-f0-9]{64}$' then raise exception 'invalid_request'; end if;
 if p_action='issue' then
  v_id:=p_actor->>'id';
  if p_actor->>'type' is distinct from 'student' then raise exception 'forbidden'; end if;
  if not exists(select 1 from public.students s join public.ip_members m on m.student_id=s.id
    where s.id=v_id and s.is_active and coalesce(s.account_type,'student')='student' and m.enabled
      and m.expires_on>=(now() at time zone 'Asia/Seoul')::date
      and (select enabled from public.ip_settings where id)) then raise exception 'not_enrolled'; end if;
  delete from public.ip_native_launch_codes where expires_at<now();
  insert into public.ip_native_launch_codes values(v_id,v_code,now()+interval '60 seconds')
   on conflict(student_id) do update set code_hash=excluded.code_hash,expires_at=excluded.expires_at;
  return jsonb_build_object('ok',true);
 elsif p_action='consume' then
  if p_actor->>'type' is distinct from 'server' then raise exception 'forbidden'; end if;
  delete from public.ip_native_launch_codes where code_hash=v_code and expires_at>now() returning student_id into v_id;
  if v_id is null then raise exception 'unauthorized'; end if;
  if not exists(select 1 from public.students s join public.ip_members m on m.student_id=s.id
    where s.id=v_id and s.is_active and coalesce(s.account_type,'student')='student' and m.enabled
      and m.expires_on>=(now() at time zone 'Asia/Seoul')::date
      and (select enabled from public.ip_settings where id)) then raise exception 'not_enrolled'; end if;
  return jsonb_build_object('ok',true,'studentId',v_id);
 end if;
 raise exception 'unsupported_action';
end $$;
revoke all on function public.ip_native_launch_service(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ip_native_launch_service(text,jsonb,jsonb) to service_role;
