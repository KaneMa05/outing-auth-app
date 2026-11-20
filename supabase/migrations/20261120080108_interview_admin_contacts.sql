begin;
set local lock_timeout='1s';
set local statement_timeout='15s';

-- Admin-only contact data stays outside student profiles, sessions and histories.
create table public.ip_admin_contacts (
 student_id text primary key references public.ip_owners(id) on delete cascade,
 phone text not null check(phone='' or phone ~ '^01[0-9]{8,9}$'),
 revision integer not null default 1 check(revision>0),
 updated_by text not null,
 updated_at timestamptz not null default now()
);
alter table public.ip_admin_contacts enable row level security;
revoke all on public.ip_admin_contacts from public,anon,authenticated;
grant select,insert,update on public.ip_admin_contacts to service_role;

create function public.ip_admin_contacts_service(p_action text,p_actor jsonb,p_body jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare contact public.ip_admin_contacts; target text; expected integer; result jsonb;
begin
 if p_actor->>'type' is distinct from 'admin' or coalesce(p_actor->>'id','')='' then raise exception 'forbidden'; end if;
 if p_action='admin_contact_list' then
  if jsonb_typeof(p_body->'studentIds') is distinct from 'array' then raise exception 'invalid_request'; end if;
  if jsonb_array_length(p_body->'studentIds')>30 or exists(select 1 from jsonb_array_elements(p_body->'studentIds') x where jsonb_typeof(x)<>'string') then raise exception 'invalid_request'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('student_id',c.student_id,'phone',c.phone,'revision',c.revision)),'[]') into result
   from public.ip_admin_contacts c join public.ip_members m on m.student_id=c.student_id
   join public.ip_student_directory d on d.id=c.student_id
   where c.student_id in(select jsonb_array_elements_text(p_body->'studentIds')) and d.is_active and coalesce(d.account_type,'student')='student';
  return jsonb_build_object('ok',true,'contacts',result);
 elsif p_action='admin_contact_save' then
  target:=p_body->>'targetStudentId';
  if jsonb_typeof(p_body->'phone') is distinct from 'string' or (p_body->>'phone'<>'' and p_body->>'phone' !~ '^01[0-9]{8,9}$')
   or coalesce(p_body->>'revision','') !~ '^[0-9]{1,9}$' then raise exception 'invalid_request'; end if;
  expected:=(p_body->>'revision')::integer;
  -- Stopped and expired registrations remain editable, as in the full roster.
  if not exists(select 1 from public.ip_members m join public.ip_student_directory d on d.id=m.student_id
   where m.student_id=target and d.is_active and coalesce(d.account_type,'student')='student') then raise exception 'student_unavailable'; end if;
  if expected=0 then
   insert into public.ip_admin_contacts(student_id,phone,updated_by) values(target,p_body->>'phone',p_actor->>'id')
    on conflict(student_id) do nothing returning * into contact;
  else
   update public.ip_admin_contacts set phone=p_body->>'phone',revision=revision+1,updated_by=p_actor->>'id',updated_at=now()
    where student_id=target and revision=expected returning * into contact;
  end if;
  if contact.student_id is null then raise exception 'revision_conflict'; end if;
  return jsonb_build_object('ok',true,'phone',contact.phone,'revision',contact.revision);
 end if;
 raise exception 'unsupported_action';
end $$;
revoke all on function public.ip_admin_contacts_service(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ip_admin_contacts_service(text,jsonb,jsonb) to service_role;
commit;
