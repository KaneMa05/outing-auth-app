-- One device registry for app login and OX. Existing student_devices rows remain valid.
-- Purchase grants are never changed by device management.
create table public.ox_device_sessions (
  student_id text primary key references public.students(id) on delete cascade,
  device_id uuid not null references public.student_devices(id),
  session_id uuid not null default gen_random_uuid(),
  expires_at timestamptz not null
);
create table public.student_device_changes (
  id bigint generated always as identity primary key,
  student_id text not null references public.students(id) on delete cascade,
  old_device_id uuid references public.student_devices(id),
  new_device_id uuid references public.student_devices(id),
  actor text not null,
  reason text not null,
  changed_at timestamptz not null default now()
);
create index student_device_changes_student_time on public.student_device_changes(student_id,changed_at desc);
create table public.student_device_requests (
  id uuid primary key default gen_random_uuid(),
  student_id text not null references public.students(id) on delete cascade,
  old_device_id uuid not null references public.student_devices(id),
  new_device_hash text not null check(new_device_hash ~ '^[a-f0-9]{64}$'),
  new_label text not null,
  credential_fingerprint text not null,
  reason text not null check(length(reason) between 1 and 500),
  status text not null default 'pending' check(status in ('pending','approved','rejected','cancelled')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text,
  review_reason text
);
create unique index student_device_requests_pending on public.student_device_requests(student_id) where status='pending';
create index student_device_requests_status_time on public.student_device_requests(status,requested_at);
alter table public.ox_device_sessions enable row level security;
alter table public.student_device_changes enable row level security;
alter table public.student_device_requests enable row level security;
revoke all on public.ox_device_sessions,public.student_device_changes,public.student_device_requests from public,anon,authenticated;
grant select,insert,update on public.ox_device_sessions,public.student_device_requests to service_role;
grant select,insert on public.student_device_changes to service_role;
grant usage,select on sequence public.student_device_changes_id_seq to service_role;
-- Existing base functions remain the writers of app registration and realtime events.
alter function public.revoke_student_device(text,text,uuid,text,text) rename to revoke_student_device_before_unification;
alter function public.reset_student_devices(text,text,text,text,text,text) rename to reset_student_devices_before_unification;
revoke all on function public.revoke_student_device_before_unification(text,text,uuid,text,text), public.reset_student_devices_before_unification(text,text,text,text,text,text) from public,anon,authenticated;

create function public.revoke_student_device(p_student_id text,p_requester_token_hash text,p_target_device_id uuid,p_actor text,p_reason text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_result jsonb;
begin
  perform pg_advisory_xact_lock(hashtext(p_student_id)::bigint);
  if p_actor='student' and exists(select 1 from public.student_device_changes where student_id=p_student_id and changed_at>now()-interval '30 days') then
    return jsonb_build_object('error','device_replace_limit');
  end if;
  v_result:=public.revoke_student_device_before_unification(p_student_id,p_requester_token_hash,p_target_device_id,p_actor,p_reason);
  if (v_result->>'revoked')::boolean then
    insert into public.student_device_changes(student_id,old_device_id,actor,reason) values(p_student_id,p_target_device_id,p_actor,coalesce(p_reason,'기기 해제'));
    update public.ox_device_sessions set expires_at=now() where student_id=p_student_id and device_id=p_target_device_id;
    update public.student_device_requests set status='cancelled',reviewed_at=now(),reviewed_by=p_actor where student_id=p_student_id and old_device_id=p_target_device_id and status='pending';
  end if;
  return v_result;
end; $$;

create function public.reset_student_devices(p_student_id text,p_password_hash text,p_actor text,p_reason text default null,p_client_display_mode text default null,p_client_user_agent text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_result jsonb;
begin
  -- The old self-reset removed both devices and the password, bypassing all quotas.
  -- New-device recovery now uses password-verified replacement, not a blanket reset.
  if p_actor='student' then return jsonb_build_object('error','device_replacement_required'); end if;
  perform pg_advisory_xact_lock(hashtext(p_student_id)::bigint);
  v_result:=public.reset_student_devices_before_unification(p_student_id,p_password_hash,p_actor,p_reason,p_client_display_mode,p_client_user_agent);
  if (v_result->>'reset')::boolean then
    insert into public.student_device_changes(student_id,actor,reason) values(p_student_id,p_actor,coalesce(p_reason,'관리자 초기화'));
    update public.ox_device_sessions set expires_at=now() where student_id=p_student_id;
    update public.student_device_requests set status='cancelled',reviewed_at=now(),reviewed_by=p_actor where student_id=p_student_id and status='pending';
  end if;
  return v_result;
end; $$;
revoke all on function public.revoke_student_device(text,text,uuid,text,text), public.reset_student_devices(text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.revoke_student_device(text,text,uuid,text,text), public.reset_student_devices(text,text,text,text,text,text) to service_role;

create function public.student_device_manage(p_action text,p_actor jsonb,p_body jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_student text:=p_actor->>'id'; v_hash text:=p_actor->>'deviceHash';
  v_admin boolean:=coalesce(p_actor->>'type'='admin',false);
  v_password text; v_device public.student_devices; v_old public.student_devices;
  v_request public.student_device_requests; v_session public.ox_device_sessions;
  v_last timestamptz; v_count integer; v_target text; v_result jsonb;
  v_page integer:=greatest(0,least(coalesce((p_body->>'page')::integer,0),10000));
begin
  if coalesce(v_student,'')='' then raise exception 'unauthorized'; end if;
  if p_action like 'admin_device_%' then
    if not v_admin then raise exception 'forbidden'; end if;
    if p_action='admin_device_requests' then
      return jsonb_build_object('ok',true,'total',(select count(*) from public.student_device_requests where status='pending'),
        'items',coalesce((select jsonb_agg(to_jsonb(t) order by t.requested_at,t.id) from (
          select r.id,r.student_id,s.name,s.cohort,s.student_category,r.reason,r.new_label,r.requested_at,d.device_label as old_label
          from public.student_device_requests r join public.students s on s.id=r.student_id join public.student_devices d on d.id=r.old_device_id
          where r.status='pending' order by r.requested_at,r.id limit 30 offset v_page*30)t),'[]'::jsonb));
    end if;
    if p_action='admin_device_decide' then
      if jsonb_typeof(p_body->'approve') is distinct from 'boolean' or length(trim(coalesce(p_body->>'reason',''))) not between 1 and 500 then raise exception 'invalid_request'; end if;
      select student_id into v_target from public.student_device_requests where id=(p_body->>'requestId')::uuid;
      if v_target is null then raise exception 'device_request_changed'; end if;
      perform pg_advisory_xact_lock(hashtext(v_target)::bigint);
      select * into v_request from public.student_device_requests where id=(p_body->>'requestId')::uuid for update;
      if v_request.status<>'pending' then raise exception 'device_request_changed'; end if;
      if (p_body->>'approve')::boolean then
        select password_hash into v_password from public.students where id=v_target and is_active;
        if v_password is null or encode(sha256(convert_to(v_password,'UTF8')),'hex')<>v_request.credential_fingerprint then raise exception 'device_unavailable'; end if;
        select * into v_old from public.student_devices where id=v_request.old_device_id and student_id=v_target and revoked_at is null;
        if v_old.id is null or exists(select 1 from public.student_devices where student_id=v_target and device_token_hash=v_request.new_device_hash and revoked_at is null) then raise exception 'device_request_changed'; end if;
        v_result:=public.revoke_student_device_before_unification(v_target,'',v_old.id,'teacher',trim(p_body->>'reason'));
        if v_result ? 'error' then raise exception 'device_unavailable'; end if;
        v_result:=public.register_student_device(v_target,v_password,v_request.new_device_hash,'',v_request.new_label);
        if v_result ? 'error' then raise exception 'device_unavailable'; end if;
        insert into public.student_device_changes(student_id,old_device_id,new_device_id,actor,reason) values(v_target,v_old.id,(v_result->>'device_id')::uuid,v_student,trim(p_body->>'reason'));
        update public.ox_device_sessions set expires_at=now() where student_id=v_target and device_id=v_old.id;
      end if;
      update public.student_device_requests set status=case when (p_body->>'approve')::boolean then 'approved' else 'rejected' end,
        reviewed_at=now(),reviewed_by=v_student,review_reason=trim(p_body->>'reason') where id=v_request.id;
      return jsonb_build_object('ok',true);
    end if;
    if p_action<>'admin_device_list' then raise exception 'unsupported_action'; end if;
    v_student:=p_body->>'memberId';
  elsif coalesce(p_actor->>'type','')<>'student' or coalesce(v_hash,'') !~ '^[a-f0-9]{64}$' then raise exception 'unauthorized';
  end if;
  if coalesce(v_student,'')='' then raise exception 'invalid_request'; end if;
  perform pg_advisory_xact_lock(hashtext(v_student)::bigint);
  select password_hash into v_password from public.students where id=v_student and (is_active or v_admin);
  if not found then raise exception 'unauthorized'; end if;
  select * into v_device from public.student_devices where student_id=v_student and device_token_hash=v_hash and revoked_at is null;
  -- A new device can ONLY inspect/replace after checking the existing password.
  if not v_admin and v_device.id is null and (v_password is null or v_password is distinct from p_actor->>'passwordHash') then raise exception 'unauthorized'; end if;
  select * into v_session from public.ox_device_sessions where student_id=v_student;
  select count(*) into v_count from public.student_devices where student_id=v_student and revoked_at is null;
  select max(changed_at) into v_last from public.student_device_changes where student_id=v_student;
  if p_action in ('device_replace','device_request') then
    if v_device.id is not null then raise exception 'device_already_registered'; end if;
    select * into v_old from public.student_devices where id=(p_body->>'targetDeviceId')::uuid and student_id=v_student and revoked_at is null;
    if v_old.id is null or length(trim(coalesce(p_body->>'reason',''))) not between 1 and 500 then raise exception 'invalid_request'; end if;
    if p_action='device_request' then
      if exists(select 1 from public.student_device_requests where student_id=v_student and status='pending' and new_device_hash<>v_hash) then raise exception 'device_request_changed'; end if;
      insert into public.student_device_requests(student_id,old_device_id,new_device_hash,new_label,credential_fingerprint,reason)
        values(v_student,v_old.id,v_hash,left(coalesce(nullif(p_body->>'deviceLabel',''),'새 기기'),80),encode(sha256(convert_to(v_password,'UTF8')),'hex'),trim(p_body->>'reason'))
        on conflict(student_id) where status='pending' do nothing;
      return jsonb_build_object('ok',true);
    end if;
    if v_last>now()-interval '30 days' then raise exception 'device_replace_limit'; end if;
    v_result:=public.revoke_student_device_before_unification(v_student,v_old.device_token_hash,v_old.id,'student',trim(p_body->>'reason'));
    if v_result ? 'error' then raise exception 'device_unavailable'; end if;
    v_result:=public.register_student_device(v_student,v_password,v_hash,'',left(coalesce(nullif(p_body->>'deviceLabel',''),'새 기기'),80));
    if v_result ? 'error' then raise exception 'device_unavailable'; end if;
    insert into public.student_device_changes(student_id,old_device_id,new_device_id,actor,reason) values(v_student,v_old.id,(v_result->>'device_id')::uuid,'student',trim(p_body->>'reason'));
    update public.ox_device_sessions set expires_at=now() where student_id=v_student and device_id=v_old.id;
    update public.student_device_requests set status='cancelled',reviewed_at=now(),reviewed_by='student' where student_id=v_student and status='pending';
    return jsonb_build_object('ok',true);
  end if;
  if p_action='device_request_cancel' then
    update public.student_device_requests set status='cancelled',reviewed_at=now(),reviewed_by='student' where student_id=v_student and status='pending' and (v_device.id is not null or new_device_hash=v_hash);
    return jsonb_build_object('ok',true);
  end if;
  if p_action='device_register' then
    -- Compatibility for pre-unification clients. Never creates a second registry.
    if v_device.id is null then raise exception 'device_not_registered'; end if;
    return jsonb_build_object('ok',true);
  end if;
  if p_action not in ('device_state','admin_device_list') then raise exception 'unsupported_action'; end if;
  return jsonb_build_object('ok',true,'registered',v_device.id is not null,'canRegister',false,
    'canReplace',v_last is null or v_last<=now()-interval '30 days','nextReplacementAt',case when v_last>now()-interval '30 days' then v_last+interval '30 days' else null end,
    'activeSessionId',case when v_session.expires_at>now() then v_session.session_id else null end,
    'activeHere',coalesce(v_session.expires_at>now() and v_session.device_id=v_device.id,false),
    'devices',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'label',d.device_label,'registeredAt',d.registered_at,
      'current',coalesce(d.device_token_hash=v_hash,false),'learning',coalesce(d.id=v_session.device_id and v_session.expires_at>now(),false),'appActive',true) order by d.registered_at,d.id)
      from public.student_devices d where d.student_id=v_student and d.revoked_at is null),'[]'::jsonb),
    'request',(select jsonb_build_object('id',r.id,'status',r.status,'reason',r.reason,'reviewReason',r.review_reason,'requestedAt',r.requested_at)
      from public.student_device_requests r where r.student_id=v_student and (v_admin or v_device.id is not null or r.new_device_hash=v_hash) order by r.requested_at desc,r.id desc limit 1),
    'changes',case when v_admin then coalesce((select jsonb_agg(to_jsonb(t) order by t.changed_at desc,t.id desc) from
      (select c.id,c.changed_at,c.actor,c.reason,o.device_label as old_label,n.device_label as new_label from public.student_device_changes c
       left join public.student_devices o on o.id=c.old_device_id left join public.student_devices n on n.id=c.new_device_id
       where c.student_id=v_student order by c.changed_at desc,c.id desc limit 30)t),'[]'::jsonb) else '[]'::jsonb end);
end; $$;
revoke all on function public.student_device_manage(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.student_device_manage(text,jsonb,jsonb) to service_role;

create function public.ox_device_gateway(p_action text,p_actor jsonb,p_body jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_student text:=p_actor->>'id'; v_hash text:=p_actor->>'deviceHash';
  v_device public.student_devices; v_session public.ox_device_sessions; v_result jsonb;
begin
  if p_action like 'admin_device_%' then return public.student_device_manage(p_action,p_actor,p_body); end if;
  if coalesce(p_actor->>'type','')<>'student' or coalesce(v_student,'')='' or coalesce(v_hash,'') !~ '^[a-f0-9]{64}$' then raise exception 'unauthorized'; end if;
  -- Share the same transaction lock as login, revoke, reset, and replacement.
  perform pg_advisory_xact_lock(hashtext(v_student)::bigint);
  select d.* into v_device from public.student_devices d join public.students s on s.id=d.student_id
    where d.student_id=v_student and d.device_token_hash=v_hash and d.revoked_at is null and s.is_active and s.account_type='student';
  if v_device.id is null then raise exception 'unauthorized'; end if;
  if p_action='status' then return public.ox_service(p_action,p_actor,p_body); end if;
  if p_action in ('device_state','device_register') then
    v_result:=public.student_device_manage(p_action,p_actor,p_body);
    return v_result||jsonb_build_object('learningError',case when not exists(select 1 from public.ox_members where student_id=v_student and allowed) then 'ox_not_registered'
      when not exists(select 1 from public.ox_book_access where student_id=v_student and active) then 'ox_book_required'
      when not (select enabled from public.ox_config where id) then 'ox_disabled' else null end);
  end if;
  select * into v_session from public.ox_device_sessions where student_id=v_student;
  if p_action='device_start' then
    if not exists(select 1 from public.ox_members where student_id=v_student and allowed) then raise exception 'ox_not_registered'; end if;
    if not exists(select 1 from public.ox_book_access where student_id=v_student and active) then raise exception 'ox_book_required'; end if;
    if not (select enabled from public.ox_config where id) then raise exception 'ox_disabled'; end if;
    if v_device.id is null then raise exception 'device_not_registered'; end if;
    if v_session.expires_at>now() and v_session.device_id<>v_device.id then
      if coalesce((p_body->>'takeover')::boolean,false) is not true then raise exception 'device_in_use'; end if;
      if v_session.session_id::text is distinct from p_body->>'expectedSessionId' then raise exception 'device_session_changed'; end if;
    end if;
    if v_session.device_id=v_device.id and v_session.expires_at>now() then
      update public.ox_device_sessions set expires_at=now()+interval '3 minutes' where student_id=v_student returning * into v_session;
    else
      insert into public.ox_device_sessions(student_id,device_id,expires_at) values(v_student,v_device.id,now()+interval '3 minutes')
        on conflict(student_id) do update set device_id=excluded.device_id,session_id=gen_random_uuid(),expires_at=excluded.expires_at returning * into v_session;
    end if;
    return jsonb_build_object('ok',true,'sessionId',v_session.session_id);
  end if;
  if p_action not in ('bootstrap','questions','detail','submit','note','device_heartbeat') then raise exception 'unsupported_action'; end if;
  if not exists(select 1 from public.ox_members where student_id=v_student and allowed) then raise exception 'ox_not_registered'; end if;
  if not exists(select 1 from public.ox_book_access where student_id=v_student and active) then raise exception 'ox_book_required'; end if;
  if v_device.id is null then raise exception 'device_not_registered'; end if;
  if v_session.device_id is distinct from v_device.id or v_session.session_id::text is distinct from p_body->>'sessionId' or v_session.expires_at is null or v_session.expires_at<=now() then raise exception 'device_session_changed'; end if;
  if not (select enabled from public.ox_config where id) then raise exception 'ox_disabled'; end if;
  update public.ox_device_sessions set expires_at=now()+interval '3 minutes' where student_id=v_student;
  if p_action='device_heartbeat' then return jsonb_build_object('ok',true); end if;
  if p_action='questions' or (p_action='bootstrap' and coalesce((p_body->>'summaryOnly')::boolean,false)) then
    return public.ox_learning_data(p_action,p_actor,p_body-'sessionId');
  end if;
  return public.ox_service(p_action,p_actor,p_body-'sessionId');
end; $$;
revoke all on function public.ox_device_gateway(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ox_device_gateway(text,jsonb,jsonb) to service_role;
