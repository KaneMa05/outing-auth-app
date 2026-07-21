create extension if not exists "pgcrypto";

create table if not exists public.student_devices (
  id uuid primary key default gen_random_uuid(),
  student_id text not null references public.students(id) on delete cascade,
  device_token_hash text not null,
  token_preview text not null default '',
  device_label text not null default 'Registered device',
  client_display_mode text,
  client_user_agent text,
  registered_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by text,
  revoke_reason text,
  unique (student_id, device_token_hash)
);

create index if not exists student_devices_student_active_idx
on public.student_devices (student_id, registered_at desc)
where revoked_at is null;

alter table public.student_devices enable row level security;
revoke all on public.student_devices from anon;

insert into public.student_devices (
  student_id,
  device_token_hash,
  token_preview,
  device_label,
  registered_at,
  last_used_at
)
select
  id,
  encode(extensions.digest(device_token, 'sha256'), 'hex'),
  right(device_token, 8),
  'Migrated device',
  coalesce(app_registered_at, now()),
  coalesce(app_registered_at, now())
from public.students
where nullif(device_token, '') is not null
on conflict (student_id, device_token_hash) do nothing;

drop function if exists public.register_student_device(text, text, text, text, text, text, text);

create or replace function public.register_student_device(
  p_student_id text,
  p_password_hash text,
  p_device_token_hash text,
  p_token_preview text default '',
  p_device_label text default 'Registered device',
  p_client_display_mode text default null,
  p_client_user_agent text default null,
  p_track text default null,
  p_gender text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student_password_hash text;
  v_student_name text;
  v_student_active boolean;
  v_legacy_device_token text;
  v_student_registered_at timestamptz;
  v_device_id uuid;
  v_revoked_at timestamptz;
  v_active_count integer := 0;
  v_now timestamptz := now();
begin
  if nullif(trim(p_student_id), '') is null
     or nullif(trim(p_password_hash), '') is null
     or p_device_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('error', 'invalid_input');
  end if;

  perform pg_advisory_xact_lock(hashtext(p_student_id)::bigint);

  select password_hash, name, is_active, device_token, app_registered_at
  into v_student_password_hash, v_student_name, v_student_active, v_legacy_device_token, v_student_registered_at
  from public.students
  where id = p_student_id
  for update;

  if not found then
    return jsonb_build_object('error', 'student_not_found');
  end if;

  if v_student_active is not true then
    return jsonb_build_object('error', 'student_inactive');
  end if;

  if v_student_password_hash is not null
     and v_student_password_hash <> p_password_hash then
    return jsonb_build_object('error', 'password_mismatch');
  end if;

  if nullif(v_legacy_device_token, '') is not null then
    insert into public.student_devices (
      student_id,
      device_token_hash,
      token_preview,
      device_label,
      registered_at,
      last_used_at
    )
    values (
      p_student_id,
      encode(extensions.digest(v_legacy_device_token, 'sha256'), 'hex'),
      right(v_legacy_device_token, 8),
      'Migrated device',
      coalesce(v_student_registered_at, v_now),
      coalesce(v_student_registered_at, v_now)
    )
    on conflict (student_id, device_token_hash) do nothing;
  end if;

  select id, revoked_at
  into v_device_id, v_revoked_at
  from public.student_devices
  where student_id = p_student_id
    and device_token_hash = p_device_token_hash;

  select count(*)::integer
  into v_active_count
  from public.student_devices
  where student_id = p_student_id
    and revoked_at is null;

  if v_device_id is not null and v_revoked_at is null then
    update public.student_devices
    set last_used_at = v_now,
        device_label = coalesce(nullif(trim(p_device_label), ''), device_label),
        client_display_mode = p_client_display_mode,
        client_user_agent = p_client_user_agent
    where id = v_device_id;

    if v_student_password_hash is null then
      update public.students
      set password_hash = p_password_hash,
          app_registered_at = coalesce(app_registered_at, v_now),
          track = coalesce(nullif(trim(p_track), ''), track),
          gender = coalesce(nullif(trim(p_gender), ''), gender)
      where id = p_student_id;
    end if;

    return jsonb_build_object(
      'status', 'already_registered',
      'device_id', v_device_id,
      'active_count', v_active_count
    );
  end if;

  if v_active_count >= 2 then
    return jsonb_build_object(
      'error', 'device_limit_reached',
      'active_count', v_active_count
    );
  end if;

  if v_student_password_hash is null then
    update public.students
    set password_hash = p_password_hash,
        app_registered_at = coalesce(app_registered_at, v_now),
        track = coalesce(nullif(trim(p_track), ''), track),
        gender = coalesce(nullif(trim(p_gender), ''), gender)
    where id = p_student_id;
  end if;

  if v_device_id is not null then
    update public.student_devices
    set token_preview = left(coalesce(p_token_preview, ''), 16),
        device_label = coalesce(nullif(trim(p_device_label), ''), 'Registered device'),
        client_display_mode = p_client_display_mode,
        client_user_agent = p_client_user_agent,
        registered_at = v_now,
        last_used_at = v_now,
        revoked_at = null,
        revoked_by = null,
        revoke_reason = null
    where id = v_device_id
    returning id into v_device_id;
  else
    insert into public.student_devices (
      student_id,
      device_token_hash,
      token_preview,
      device_label,
      client_display_mode,
      client_user_agent,
      registered_at,
      last_used_at
    )
    values (
      p_student_id,
      p_device_token_hash,
      left(coalesce(p_token_preview, ''), 16),
      coalesce(nullif(trim(p_device_label), ''), 'Registered device'),
      p_client_display_mode,
      p_client_user_agent,
      v_now,
      v_now
    )
    returning id into v_device_id;
  end if;

  insert into public.student_registration_events (
    student_id,
    student_name,
    event_type,
    device_token,
    reason,
    actor,
    client_display_mode,
    client_user_agent,
    created_at
  )
  values (
    p_student_id,
    v_student_name,
    'registered',
    left(coalesce(p_token_preview, ''), 16),
    'Device registered',
    'student',
    p_client_display_mode,
    p_client_user_agent,
    v_now
  );

  return jsonb_build_object(
    'status', 'registered',
    'device_id', v_device_id,
    'active_count', v_active_count + 1
  );
end;
$$;

revoke all on function public.register_student_device(text, text, text, text, text, text, text, text, text) from public;
revoke all on function public.register_student_device(text, text, text, text, text, text, text, text, text) from anon;
revoke all on function public.register_student_device(text, text, text, text, text, text, text, text, text) from authenticated;
grant execute on function public.register_student_device(text, text, text, text, text, text, text, text, text) to service_role;

create or replace function public.validate_student_device(
  p_student_id text,
  p_device_token_hash text,
  p_client_display_mode text default null,
  p_client_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student_active boolean;
  v_legacy_device_token text;
  v_student_registered_at timestamptz;
  v_device_id uuid;
  v_active_count integer := 0;
  v_now timestamptz := now();
begin
  if nullif(trim(p_student_id), '') is null
     or p_device_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('error', 'invalid_input');
  end if;

  perform pg_advisory_xact_lock(hashtext(p_student_id)::bigint);

  select is_active, device_token, app_registered_at
  into v_student_active, v_legacy_device_token, v_student_registered_at
  from public.students
  where id = p_student_id
  for update;

  if not found or v_student_active is not true then
    return jsonb_build_object('error', 'device_not_active');
  end if;

  if nullif(v_legacy_device_token, '') is not null
     and encode(extensions.digest(v_legacy_device_token, 'sha256'), 'hex') = p_device_token_hash then
    insert into public.student_devices (
      student_id,
      device_token_hash,
      token_preview,
      device_label,
      registered_at,
      last_used_at
    )
    values (
      p_student_id,
      p_device_token_hash,
      right(v_legacy_device_token, 8),
      'Migrated device',
      coalesce(v_student_registered_at, v_now),
      v_now
    )
    on conflict (student_id, device_token_hash) do nothing;
  end if;

  select id
  into v_device_id
  from public.student_devices
  where student_id = p_student_id
    and device_token_hash = p_device_token_hash
    and revoked_at is null;

  if v_device_id is null then
    return jsonb_build_object('error', 'device_not_active');
  end if;

  update public.student_devices
  set last_used_at = v_now,
      client_display_mode = coalesce(p_client_display_mode, client_display_mode),
      client_user_agent = coalesce(p_client_user_agent, client_user_agent)
  where id = v_device_id;

  select count(*)::integer
  into v_active_count
  from public.student_devices
  where student_id = p_student_id
    and revoked_at is null;

  return jsonb_build_object(
    'valid', true,
    'device_id', v_device_id,
    'active_count', v_active_count
  );
end;
$$;

revoke all on function public.validate_student_device(text, text, text, text) from public;
revoke all on function public.validate_student_device(text, text, text, text) from anon;
revoke all on function public.validate_student_device(text, text, text, text) from authenticated;
grant execute on function public.validate_student_device(text, text, text, text) to service_role;

create or replace function public.revoke_student_device(
  p_student_id text,
  p_requester_token_hash text,
  p_target_device_id uuid,
  p_actor text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_requester_device_id uuid;
  v_target_token_preview text;
  v_student_name text;
  v_active_count integer := 0;
  v_now timestamptz := now();
begin
  if nullif(trim(p_student_id), '') is null
     or p_target_device_id is null
     or p_actor not in ('student', 'teacher') then
    return jsonb_build_object('error', 'invalid_input');
  end if;

  perform pg_advisory_xact_lock(hashtext(p_student_id)::bigint);

  select name into v_student_name
  from public.students
  where id = p_student_id;

  if not found then
    return jsonb_build_object('error', 'student_not_found');
  end if;

  if p_actor = 'student' then
    select id into v_requester_device_id
    from public.student_devices
    where student_id = p_student_id
      and device_token_hash = p_requester_token_hash
      and revoked_at is null;

    if v_requester_device_id is null then
      return jsonb_build_object('error', 'device_not_active');
    end if;
  end if;

  select token_preview into v_target_token_preview
  from public.student_devices
  where id = p_target_device_id
    and student_id = p_student_id
    and revoked_at is null;

  if not found then
    return jsonb_build_object('error', 'device_not_found');
  end if;

  update public.student_devices
  set revoked_at = v_now,
      revoked_by = p_actor,
      revoke_reason = nullif(trim(coalesce(p_reason, '')), '')
  where id = p_target_device_id
    and student_id = p_student_id
    and revoked_at is null;

  -- Emit a non-sensitive student-row update so the registered clients can
  -- validate their own device after a single-device revocation.
  update public.students
  set app_registered_at = app_registered_at
  where id = p_student_id;

  insert into public.student_registration_events (
    student_id,
    student_name,
    event_type,
    device_token,
    reason,
    actor,
    created_at
  )
  values (
    p_student_id,
    v_student_name,
    'reset',
    v_target_token_preview,
    coalesce(nullif(trim(p_reason), ''), 'Device revoked'),
    p_actor,
    v_now
  );

  select count(*)::integer into v_active_count
  from public.student_devices
  where student_id = p_student_id
    and revoked_at is null;

  return jsonb_build_object(
    'revoked', true,
    'self_revoked', v_requester_device_id = p_target_device_id,
    'active_count', v_active_count
  );
end;
$$;

revoke all on function public.revoke_student_device(text, text, uuid, text, text) from public;
revoke all on function public.revoke_student_device(text, text, uuid, text, text) from anon;
revoke all on function public.revoke_student_device(text, text, uuid, text, text) from authenticated;
grant execute on function public.revoke_student_device(text, text, uuid, text, text) to service_role;

create or replace function public.reset_student_devices(
  p_student_id text,
  p_password_hash text,
  p_actor text,
  p_reason text default null,
  p_client_display_mode text default null,
  p_client_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student_password_hash text;
  v_student_name text;
  v_revoked_count integer := 0;
  v_now timestamptz := now();
begin
  if nullif(trim(p_student_id), '') is null
     or p_actor not in ('student', 'teacher') then
    return jsonb_build_object('error', 'invalid_input');
  end if;

  perform pg_advisory_xact_lock(hashtext(p_student_id)::bigint);

  select password_hash, name
  into v_student_password_hash, v_student_name
  from public.students
  where id = p_student_id
  for update;

  if not found then
    return jsonb_build_object('error', 'student_not_found');
  end if;

  if p_actor = 'student'
     and (v_student_password_hash is null or v_student_password_hash <> p_password_hash) then
    return jsonb_build_object('error', 'password_mismatch');
  end if;

  update public.student_devices
  set revoked_at = v_now,
      revoked_by = p_actor,
      revoke_reason = coalesce(nullif(trim(p_reason), ''), 'Registration reset')
  where student_id = p_student_id
    and revoked_at is null;
  get diagnostics v_revoked_count = row_count;

  update public.students
  set password_hash = null,
      device_token = null,
      app_registered_at = null
  where id = p_student_id;

  insert into public.student_registration_events (
    student_id,
    student_name,
    event_type,
    reason,
    actor,
    client_display_mode,
    client_user_agent,
    created_at
  )
  values (
    p_student_id,
    v_student_name,
    'reset',
    coalesce(nullif(trim(p_reason), ''), 'Registration reset'),
    p_actor,
    p_client_display_mode,
    p_client_user_agent,
    v_now
  );

  return jsonb_build_object('reset', true, 'revoked_count', v_revoked_count);
end;
$$;

revoke all on function public.reset_student_devices(text, text, text, text, text, text) from public;
revoke all on function public.reset_student_devices(text, text, text, text, text, text) from anon;
revoke all on function public.reset_student_devices(text, text, text, text, text, text) from authenticated;
grant execute on function public.reset_student_devices(text, text, text, text, text, text) to service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'students'
    ) then
      alter publication supabase_realtime add table public.students;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'outings'
    ) then
      alter publication supabase_realtime add table public.outings;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'outing_photos'
    ) then
      alter publication supabase_realtime add table public.outing_photos;
    end if;
  end if;
end;
$$;
