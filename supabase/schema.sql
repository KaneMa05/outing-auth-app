create extension if not exists "pgcrypto";

create table if not exists public.students (
  id text primary key,
  name text not null,
  class_name text not null default '오프라인반',
  student_category text not null default 'offline'
    check (student_category in ('offline', 'online_managed', 'lecture')),
  account_type text not null default 'student'
    check (account_type in ('student', 'teacher')),
  position text,
  cohort smallint check (cohort between 1 and 99),
  phone text,
  track text,
  gender text,
  password_hash text,
  device_token text,
  app_registered_at timestamptz,
  attendance_excluded boolean not null default false,
  fitness_excluded boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.outings (
  id uuid primary key default gen_random_uuid(),
  student_id text not null references public.students(id) on delete cascade,
  student_name text not null,
  class_name text not null default '오프라인반',
  reason text not null,
  detail text,
  expected_return time,
  status text not null default 'requested'
    check (status in ('requested', 'verified', 'returned')),
  decision text not null default 'pending'
    check (decision in ('pending', 'approved', 'rejected')),
  approved_by text,
  approved_at timestamptz,
  approval_reason text,
  receipt_note text,
  teacher_memo text,
  early_leave_reason text,
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  returned_at timestamptz,
  deleted_at timestamptz
);

alter table public.outings add column if not exists approved_by text;
alter table public.outings add column if not exists approved_at timestamptz;
alter table public.outings add column if not exists approval_reason text;

create table if not exists public.outing_photos (
  id uuid primary key default gen_random_uuid(),
  outing_id uuid not null references public.outings(id) on delete cascade,
  photo_type text not null,
  data_url text,
  photo_path text,
  photo_url text,
  thumbnail_path text,
  thumbnail_url text,
  original_name text,
  uploaded_at timestamptz not null default now()
);

create table if not exists public.manager_allowed_ips (
  username text primary key,
  ip_address text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.managers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cohort text not null default '',
  role text,
  memo text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.managers
add column if not exists cohort text not null default '';

alter table public.managers
alter column cohort set default '';

create table if not exists public.track_options (
  label text primary key,
  sort_order integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.track_options
add column if not exists sort_order integer;

create table if not exists public.attendance_checks (
  id uuid primary key default gen_random_uuid(),
  student_id text not null references public.students(id) on delete cascade,
  student_name text not null,
  class_name text not null default '오프라인반',
  check_date date not null default ((now() at time zone 'Asia/Seoul')::date),
  status text not null default 'present'
    check (status in ('present', 'pre_arrival_reason', 'pre_arrival_verified')),
  reason text,
  detail text,
  manager_name text,
  photo_path text not null,
  photo_url text,
  thumbnail_path text,
  thumbnail_url text,
  arrival_photo_path text,
  arrival_photo_url text,
  arrival_thumbnail_path text,
  arrival_thumbnail_url text,
  arrival_original_name text,
  arrived_at timestamptz,
  photo_data_url text,
  original_name text,
  created_at timestamptz not null default now(),
  unique (student_id, check_date)
);

create table if not exists public.attendance_holidays (
  date_key date primary key,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.penalties (
  id uuid primary key default gen_random_uuid(),
  student_id text not null references public.students(id) on delete cascade,
  student_name text not null,
  class_name text not null default '오프라인반',
  points integer not null check (points <> 0),
  reason text not null,
  manager_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.notices (
  id text primary key,
  title text not null,
  body text not null,
  target_audience text not null default 'academy' check (target_audience in ('academy', 'lecture')),
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notices
add column if not exists target_audience text not null default 'academy';

update public.notices
set target_audience = 'academy'
where target_audience not in ('academy', 'lecture');

alter table public.notices
drop constraint if exists notices_target_audience_check;

alter table public.notices
add constraint notices_target_audience_check
check (target_audience in ('academy', 'lecture'));

create table if not exists public.student_registration_events (
  id uuid primary key default gen_random_uuid(),
  student_id text not null references public.students(id) on delete cascade,
  student_name text,
  event_type text not null check (event_type in ('registered', 'reset')),
  device_token text,
  reason text,
  actor text,
  client_display_mode text,
  client_user_agent text,
  created_at timestamptz not null default now()
);

alter table public.penalties
add column if not exists deleted_at timestamptz,
add column if not exists deleted_by text;

create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cohort text not null default '',
  week_number integer not null default 1,
  start_at timestamptz,
  end_at timestamptz,
  target_tracks text[] not null default '{}',
  is_published boolean not null default false,
  score_release_mode text not null default 'after_all_submitted'
    check (score_release_mode in ('hidden', 'after_submit', 'after_all_submitted')),
  explanation_release_mode text not null default 'after_all_submitted'
    check (explanation_release_mode in ('hidden', 'after_submit', 'after_all_submitted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.exams
add column if not exists cohort text not null default '';

create table if not exists public.exam_sections (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  track text not null,
  subject text not null,
  question_count integer not null default 20 check (question_count > 0),
  total_score numeric not null default 100 check (total_score > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (exam_id, track, subject)
);

create table if not exists public.exam_subject_settings (
  id uuid primary key default gen_random_uuid(),
  track text not null,
  subject text not null,
  question_count integer not null default 20 check (question_count > 0),
  total_score numeric not null default 100 check (total_score > 0),
  is_active boolean not null default true,
  sort_order integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (track, subject)
);

create table if not exists public.exam_answers (
  id uuid primary key default gen_random_uuid(),
  exam_section_id uuid not null references public.exam_sections(id) on delete cascade,
  question_number integer not null check (question_number > 0),
  correct_answer integer check (correct_answer between 1 and 4),
  correct_answers integer[] not null default '{}',
  points numeric not null default 5 check (points >= 0),
  target_tracks text[] not null default '{}',
  unique (exam_section_id, question_number)
);

alter table public.exam_answers
add column if not exists target_tracks text[] not null default '{}';

alter table public.exam_answers
add column if not exists correct_answers integer[] not null default '{}';

update public.exam_answers
set correct_answers = array[correct_answer]
where cardinality(correct_answers) = 0
  and correct_answer is not null;

create or replace function public.sync_exam_answer_choices()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
    and new.correct_answers is not distinct from old.correct_answers
    and new.correct_answer is distinct from old.correct_answer then
    new.correct_answers := case
      when new.correct_answer is null then '{}'::integer[]
      else array[new.correct_answer]
    end;
  else
    select coalesce(array_agg(choice order by choice), '{}'::integer[])
    into new.correct_answers
    from (select distinct unnest(coalesce(new.correct_answers, '{}'::integer[])) as choice) choices;

    if cardinality(new.correct_answers) = 0 and new.correct_answer is not null then
      new.correct_answers := array[new.correct_answer];
    end if;
    new.correct_answer := new.correct_answers[1];
  end if;
  return new;
end;
$$;

drop trigger if exists sync_exam_answer_choices on public.exam_answers;
create trigger sync_exam_answer_choices
before insert or update of correct_answer, correct_answers
on public.exam_answers
for each row execute function public.sync_exam_answer_choices();

create table if not exists public.exam_submissions (
  id uuid primary key default gen_random_uuid(),
  exam_section_id uuid not null references public.exam_sections(id) on delete cascade,
  student_id text not null references public.students(id) on delete cascade,
  student_name text not null,
  track text not null,
  status text not null default 'submitted'
    check (status in ('draft', 'submitted', 'cancelled')),
  score numeric not null default 0,
  correct_count integer not null default 0,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (student_id, exam_section_id)
);

create table if not exists public.submission_answers (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.exam_submissions(id) on delete cascade,
  question_number integer not null check (question_number > 0),
  selected_answer integer check (selected_answer between 1 and 4),
  is_correct boolean not null default false,
  points_awarded numeric not null default 0,
  unique (submission_id, question_number)
);

create table if not exists public.exam_files (
  id uuid primary key default gen_random_uuid(),
  exam_section_id uuid not null references public.exam_sections(id) on delete cascade,
  file_type text not null check (file_type = 'answer_pdf'),
  file_path text,
  file_url text,
  original_name text,
  uploaded_at timestamptz not null default now()
);

create table if not exists public.final_exam_scores (
  id text primary key,
  round integer not null default 1 check (round > 0),
  student_id text not null,
  student_name text,
  track text,
  cohort text not null default '',
  is_external_final_score boolean not null default false,
  score numeric,
  max_score numeric,
  wrong_count numeric,
  subject_scores jsonb not null default '{}'::jsonb,
  status text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.students add column if not exists account_type text not null default 'student';
alter table public.students add column if not exists position text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'students_teacher_account_check'
      and conrelid = 'public.students'::regclass
  ) then
    alter table public.students add constraint students_teacher_account_check
    check (
      (account_type = 'student' and position is null and id !~ '^(10|[1-9])$')
      or (
        account_type = 'teacher'
        and position = '선생님'
        and id ~ '^(10|[1-9])$'
        and student_category = 'lecture'
      )
    );
  end if;
end
$$;

-- supabase/add-curriculum-management.sql
create table if not exists public.curriculum_subjects (
  id text primary key,
  name text not null check (char_length(name) between 1 and 60),
  short_name text not null check (char_length(short_name) between 1 and 12),
  tone text not null default 'indigo' check (tone in ('indigo', 'teal', 'violet')),
  target_tracks text[] not null default array['경찰직 - 공채(순경)']::text[],
  sort_order integer not null default 1 check (sort_order between 1 and 999),
  is_published boolean not null default true,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.curriculum_subjects
add column if not exists target_tracks text[] not null default array['경찰직 - 공채(순경)']::text[];

create table if not exists public.curriculum_stages (
  id text primary key,
  subject_id text not null references public.curriculum_subjects(id) on delete cascade,
  stage_number integer not null check (stage_number between 1 and 100),
  title text not null check (char_length(title) between 1 and 1000),
  sort_order integer not null default 1 check (sort_order between 1 and 100),
  is_published boolean not null default true,
  requires_wrap_up boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.curriculum_stages
add column if not exists requires_wrap_up boolean not null default true;

create table if not exists public.curriculum_lectures (
  id text primary key,
  stage_id text not null references public.curriculum_stages(id) on delete cascade,
  lecture_number text not null check (char_length(lecture_number) between 1 and 30),
  title text not null check (char_length(title) between 1 and 240),
  sort_order integer not null default 1 check (sort_order between 1 and 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.curriculum_student_lecture_progress (
  student_id text not null references public.students(id) on delete cascade,
  lecture_id text not null references public.curriculum_lectures(id) on delete cascade,
  completed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (student_id, lecture_id)
);

create table if not exists public.curriculum_student_stage_progress (
  student_id text not null references public.students(id) on delete cascade,
  stage_id text not null references public.curriculum_stages(id) on delete cascade,
  consolidation_completed boolean not null default false,
  mbt_completed boolean not null default false,
  stage_completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (student_id, stage_id)
);

create index if not exists curriculum_subjects_published_sort_idx
on public.curriculum_subjects(is_archived, is_published, sort_order);
create index if not exists curriculum_stages_subject_sort_idx
on public.curriculum_stages(subject_id, sort_order);
create index if not exists curriculum_lectures_stage_sort_idx
on public.curriculum_lectures(stage_id, sort_order);
create index if not exists curriculum_subjects_target_tracks_idx
on public.curriculum_subjects using gin(target_tracks);
create index if not exists curriculum_lecture_progress_lecture_idx
on public.curriculum_student_lecture_progress(lecture_id);
create index if not exists curriculum_stage_progress_stage_idx
on public.curriculum_student_stage_progress(stage_id);

alter table public.curriculum_subjects enable row level security;
alter table public.curriculum_stages enable row level security;
alter table public.curriculum_lectures enable row level security;
alter table public.curriculum_student_lecture_progress enable row level security;
alter table public.curriculum_student_stage_progress enable row level security;
revoke all on public.curriculum_subjects from anon, authenticated;
revoke all on public.curriculum_stages from anon, authenticated;
revoke all on public.curriculum_lectures from anon, authenticated;
revoke all on public.curriculum_student_lecture_progress from anon, authenticated;
revoke all on public.curriculum_student_stage_progress from anon, authenticated;
grant select, insert, update, delete on public.curriculum_subjects to service_role;
grant select, insert, update, delete on public.curriculum_stages to service_role;
grant select, insert, update, delete on public.curriculum_lectures to service_role;
grant select, insert, update, delete on public.curriculum_student_lecture_progress to service_role;
grant select, insert, update, delete on public.curriculum_student_stage_progress to service_role;

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

create table if not exists public.fitness_scores (
  id text primary key,
  assessment_month text not null default to_char((now() at time zone 'Asia/Seoul')::date, 'YYYY-MM'),
  student_id text not null references public.students(id) on delete cascade,
  student_name text,
  gender text,
  cohort text not null default '',
  sit_up_count numeric,
  push_up_count numeric,
  grip_strength numeric,
  converted_scores jsonb not null default '{}'::jsonb,
  total_score numeric,
  memo text,
  measured_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (assessment_month, student_id)
);

alter table public.fitness_scores
add column if not exists assessment_month text not null default to_char((now() at time zone 'Asia/Seoul')::date, 'YYYY-MM');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fitness_scores_assessment_month_student_id_key'
      and conrelid = 'public.fitness_scores'::regclass
  ) then
    alter table public.fitness_scores
    add constraint fitness_scores_assessment_month_student_id_key
    unique (assessment_month, student_id);
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'exam_files_exam_section_id_file_type_key'
      and conrelid = 'public.exam_files'::regclass
  ) then
    alter table public.exam_files drop constraint exam_files_exam_section_id_file_type_key;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'exam_answers_correct_answer_check'
      and conrelid = 'public.exam_answers'::regclass
  ) then
    alter table public.exam_answers drop constraint exam_answers_correct_answer_check;
  end if;

  alter table public.exam_answers
  add constraint exam_answers_correct_answer_check
  check (correct_answer is null or correct_answer between 1 and 4);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'exam_answers_correct_answers_check'
      and conrelid = 'public.exam_answers'::regclass
  ) then
    alter table public.exam_answers drop constraint exam_answers_correct_answers_check;
  end if;

  alter table public.exam_answers
  add constraint exam_answers_correct_answers_check
  check (
    cardinality(correct_answers) <= 4
    and array_position(correct_answers, null) is null
    and correct_answers <@ array[1, 2, 3, 4]::integer[]
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'submission_answers_selected_answer_check'
      and conrelid = 'public.submission_answers'::regclass
  ) then
    alter table public.submission_answers drop constraint submission_answers_selected_answer_check;
  end if;

  alter table public.submission_answers
  add constraint submission_answers_selected_answer_check
  check (selected_answer is null or selected_answer between 1 and 4);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'exam_files_file_type_check'
      and conrelid = 'public.exam_files'::regclass
  ) then
    alter table public.exam_files drop constraint exam_files_file_type_check;
  end if;

  alter table public.exam_files
  add constraint exam_files_file_type_check
  check (file_type = 'answer_pdf');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'penalties_points_check'
      and conrelid = 'public.penalties'::regclass
  ) then
    alter table public.penalties drop constraint penalties_points_check;
  end if;

  alter table public.penalties
  add constraint penalties_points_check
  check (points <> 0);
exception
  when duplicate_object then null;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attendance-photos', 'attendance-photos', true, 524288, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('outing-photos', 'outing-photos', true, 524288, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exam-files', 'exam-files', true, 10485760, array['application/pdf'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create index if not exists attendance_checks_check_date_created_at_idx
on public.attendance_checks (check_date, created_at desc);

create index if not exists attendance_holidays_date_key_idx
on public.attendance_holidays (date_key desc);

create index if not exists penalties_student_id_created_at_idx
on public.penalties (student_id, created_at desc);

create index if not exists notices_created_at_idx
on public.notices (created_at desc);

create index if not exists notices_target_audience_published_created_at_idx
on public.notices (target_audience, is_published, created_at desc);

create index if not exists outings_created_at_idx
on public.outings (created_at desc);

create index if not exists outings_student_created_at_idx
on public.outings (student_id, created_at desc);

create index if not exists outing_photos_uploaded_at_idx
on public.outing_photos (uploaded_at asc);

create index if not exists outing_photos_outing_uploaded_idx
on public.outing_photos (outing_id, uploaded_at asc);

create index if not exists student_registration_events_student_created_idx
on public.student_registration_events (student_id, created_at desc);

create index if not exists student_devices_student_active_idx
on public.student_devices (student_id, registered_at desc)
where revoked_at is null;

create index if not exists exams_week_created_at_idx
on public.exams (week_number desc, created_at desc);

create index if not exists exams_cohort_week_idx
on public.exams (cohort, week_number);

create index if not exists exam_files_section_type_uploaded_idx
on public.exam_files (exam_section_id, file_type, uploaded_at desc);

create index if not exists exam_sections_exam_track_idx
on public.exam_sections (exam_id, track);

create index if not exists exam_subject_settings_track_idx
on public.exam_subject_settings (track, sort_order, created_at);

create index if not exists exam_submissions_section_idx
on public.exam_submissions (exam_section_id, submitted_at desc);

create index if not exists exam_submissions_student_idx
on public.exam_submissions (student_id, created_at desc);

create index if not exists final_exam_scores_round_student_idx
on public.final_exam_scores (round, student_id);

create index if not exists fitness_scores_month_student_idx
on public.fitness_scores (assessment_month, student_id);

delete from public.notices
where id in ('attendance-guide', 'outing-guide');

alter table public.students
add column if not exists track text,
add column if not exists gender text,
add column if not exists password_hash text,
add column if not exists device_token text,
add column if not exists app_registered_at timestamptz,
add column if not exists attendance_excluded boolean not null default false,
add column if not exists fitness_excluded boolean not null default false,
add column if not exists student_category text,
add column if not exists cohort smallint;

update public.students
set student_category = case
  when id like '2%' then 'lecture'
  when class_name like '%온라인%' then 'online_managed'
  else 'offline'
end
where student_category is null
   or student_category not in ('offline', 'online_managed', 'lecture');

update public.students
set cohort = case
  when student_category = 'lecture' then null
  when id ~ '^\d{4,5}$' then left(id, length(id) - 3)::smallint
  else cohort
end
where cohort is null
  and student_category <> 'lecture';

alter table public.students
alter column student_category set default 'offline',
alter column student_category set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'students_student_category_check'
      and conrelid = 'public.students'::regclass
  ) then
    alter table public.students
    add constraint students_student_category_check
    check (student_category in ('offline', 'online_managed', 'lecture'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'students_cohort_check'
      and conrelid = 'public.students'::regclass
  ) then
    alter table public.students
    add constraint students_cohort_check
    check (cohort between 1 and 99);
  end if;
end $$;

-- Lecture students apply before a student account exists. Only the server-side
-- service role can read or mutate this table through the Data API.
create table if not exists public.lecture_applications (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 40),
  phone text not null,
  phone_normalized text not null check (phone_normalized ~ '^01[0-9]{8,9}$'),
  birth_date date not null check (birth_date between date '1900-01-01' and current_date),
  gender text not null check (gender in ('남', '여')),
  track text not null check (char_length(track) between 1 and 100),
  course_type text not null default 'lecture'
    check (course_type in ('offline', 'online_managed', 'lecture')),
  cohort smallint check (cohort is null or cohort between 1 and 99),
  referral_source text not null
    check (referral_source in ('naver_cafe', 'referral', 'youtube', 'search', 'other')),
  referral_source_detail text,
  lecture_id text check (lecture_id is null or char_length(lecture_id) between 2 and 80),
  lecture_id_normalized text check (lecture_id_normalized is null or char_length(lecture_id_normalized) between 2 and 80),
  lookup_token_hash text check (lookup_token_hash is null or lookup_token_hash ~ '^[0-9a-f]{64}$'),
  privacy_consent_at timestamptz not null,
  terms_consent_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  rejection_reason text,
  approved_student_id text references public.students(id),
  reviewed_at timestamptz,
  reviewed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists lecture_applications_active_phone_idx
on public.lecture_applications (phone_normalized)
where status in ('pending', 'approved');

create unique index if not exists lecture_applications_active_lecture_id_idx
on public.lecture_applications (lecture_id_normalized)
where status in ('pending', 'approved')
  and course_type = 'lecture'
  and lecture_id_normalized is not null;

create index if not exists lecture_applications_status_created_idx
on public.lecture_applications (status, created_at desc);

create index if not exists lecture_applications_approved_student_idx
on public.lecture_applications (approved_student_id)
where approved_student_id is not null;

create unique index if not exists lecture_applications_lookup_token_idx
on public.lecture_applications (lookup_token_hash)
where lookup_token_hash is not null;

create sequence if not exists public.lecture_student_number_seq
start with 1 increment by 1 minvalue 1;

do $$
declare
  current_offset bigint;
begin
  select coalesce(max(id::bigint) - 900000, 0)
  into current_offset
  from public.students
  where id ~ '^9[0-9]{5}$';

  if current_offset > 0 then
    perform setval('public.lecture_student_number_seq', current_offset, true);
  else
    perform setval('public.lecture_student_number_seq', 1, false);
  end if;
end $$;

create or replace function public.approve_lecture_application()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  next_student_id text;
  next_class_name text;
  next_attendance_excluded boolean;
begin
  new.updated_at := now();

  if old.status = 'approved'
    and new.status <> 'approved'
    and not (
      new.status = 'cancelled'
      and new.approved_student_id is not null
      and exists (
        select 1
        from public.students
        where id = new.approved_student_id
          and is_active = false
      )
    ) then
    raise exception 'approved_application_is_final';
  end if;

  if new.status = 'approved' and old.status <> 'approved' then
    if new.course_type in ('offline', 'online_managed') then
      next_student_id := nullif(btrim(new.approved_student_id), '');
      if new.cohort is null or new.cohort < 1 or new.cohort > 99 then
        raise exception 'invalid_cohort';
      end if;
      if next_student_id is null then
        raise exception 'registration_number_required';
      end if;
      if next_student_id !~ ('^' || new.cohort::text || '[0-9]{3}$')
        or right(next_student_id, 3) = '000' then
        raise exception 'registration_number_cohort_mismatch';
      end if;
      if exists (select 1 from public.students where id = next_student_id) then
        raise exception 'registration_number_in_use';
      end if;
    else
      loop
        next_student_id := (900000 + nextval('public.lecture_student_number_seq'))::text;
        exit when not exists (select 1 from public.students where id = next_student_id);
      end loop;
    end if;

    next_class_name := case new.course_type
      when 'offline' then '오프라인반'
      when 'online_managed' then '온라인 관리반'
      else '수강생'
    end;
    next_attendance_excluded := new.course_type <> 'offline';

    insert into public.students (
      id,
      name,
      class_name,
      student_category,
      cohort,
      track,
      gender,
      attendance_excluded,
      fitness_excluded,
      is_active,
      created_at
    ) values (
      next_student_id,
      new.name,
      next_class_name,
      new.course_type,
      case when new.course_type = 'lecture' then null else new.cohort end,
      new.track,
      new.gender,
      next_attendance_excluded,
      false,
      true,
      now()
    );

    new.approved_student_id := next_student_id;
    new.reviewed_at := coalesce(new.reviewed_at, now());
    new.rejection_reason := null;
  elsif new.status = 'rejected' and old.status <> 'rejected' then
    if nullif(btrim(new.rejection_reason), '') is null then
      raise exception 'rejection_reason_required';
    end if;
    new.reviewed_at := coalesce(new.reviewed_at, now());
  end if;

  return new;
end;
$$;

drop trigger if exists lecture_application_review_trigger on public.lecture_applications;
create trigger lecture_application_review_trigger
before update of status on public.lecture_applications
for each row
execute function public.approve_lecture_application();

create schema if not exists private;
revoke all on schema private from public;

create or replace function private.cancel_application_for_deactivated_student()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.lecture_applications
  set
    status = 'cancelled',
    reviewed_at = coalesce(reviewed_at, now()),
    reviewed_by = coalesce(reviewed_by, 'system:student_deleted')
  where approved_student_id = new.id
    and status = 'approved';

  return new;
end;
$$;

revoke all on function private.cancel_application_for_deactivated_student() from public;

drop trigger if exists cancel_application_on_student_deactivation on public.students;
create trigger cancel_application_on_student_deactivation
after update of is_active on public.students
for each row
when (old.is_active = true and new.is_active = false)
execute function private.cancel_application_for_deactivated_student();

alter table public.lecture_applications enable row level security;

revoke all on table public.lecture_applications from anon, authenticated;
revoke all on sequence public.lecture_student_number_seq from anon, authenticated;
grant select, insert, update on table public.lecture_applications to service_role;
grant usage, select on sequence public.lecture_student_number_seq to service_role;

alter table public.attendance_checks
add column if not exists reason text,
add column if not exists detail text,
add column if not exists manager_name text,
add column if not exists thumbnail_path text,
add column if not exists thumbnail_url text,
add column if not exists arrival_photo_path text,
add column if not exists arrival_photo_url text,
add column if not exists arrival_thumbnail_path text,
add column if not exists arrival_thumbnail_url text,
add column if not exists arrival_original_name text,
add column if not exists arrived_at timestamptz;

alter table public.outing_photos
add column if not exists photo_path text,
add column if not exists photo_url text,
add column if not exists thumbnail_path text,
add column if not exists thumbnail_url text,
alter column data_url drop not null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'attendance_checks_status_check'
      and conrelid = 'public.attendance_checks'::regclass
  ) then
    alter table public.attendance_checks drop constraint attendance_checks_status_check;
  end if;
end $$;

alter table public.attendance_checks
add constraint attendance_checks_status_check
check (status in ('present', 'pre_arrival_reason', 'pre_arrival_verified'));

alter table public.students enable row level security;
alter table public.outings enable row level security;
alter table public.outing_photos enable row level security;
alter table public.manager_allowed_ips enable row level security;
alter table public.managers enable row level security;
alter table public.track_options enable row level security;
alter table public.attendance_checks enable row level security;
alter table public.attendance_holidays enable row level security;
alter table public.penalties enable row level security;
alter table public.notices enable row level security;
alter table public.student_registration_events enable row level security;
alter table public.student_devices enable row level security;
alter table public.exams enable row level security;
alter table public.exam_sections enable row level security;
alter table public.exam_subject_settings enable row level security;
alter table public.exam_answers enable row level security;
alter table public.exam_submissions enable row level security;
alter table public.submission_answers enable row level security;
alter table public.exam_files enable row level security;
alter table public.final_exam_scores enable row level security;
alter table public.fitness_scores enable row level security;

drop policy if exists "outing_app_students_all" on public.students;
drop policy if exists "outing_app_outings_all" on public.outings;
drop policy if exists "outing_app_photos_all" on public.outing_photos;
drop policy if exists "anon_students_select_active" on public.students;
drop policy if exists "anon_students_insert_roster" on public.students;
drop policy if exists "anon_students_register_profile_once" on public.students;
drop policy if exists "anon_students_update_roster_before_registration" on public.students;
drop policy if exists "anon_students_update_attendance_excluded" on public.students;
drop policy if exists "anon_students_deactivate" on public.students;
drop policy if exists "anon_track_options_select_active" on public.track_options;
drop policy if exists "anon_track_options_insert" on public.track_options;
drop policy if exists "anon_track_options_update" on public.track_options;
drop policy if exists "anon_outings_select_not_deleted" on public.outings;
drop policy if exists "anon_outings_insert_request" on public.outings;
drop policy if exists "anon_outings_update_student_status" on public.outings;
drop policy if exists "anon_outings_update_teacher_decision" on public.outings;
drop policy if exists "anon_outings_soft_delete" on public.outings;
drop policy if exists "anon_outings_restore_deleted" on public.outings;
drop policy if exists "anon_photos_select" on public.outing_photos;
drop policy if exists "anon_photos_insert" on public.outing_photos;
drop policy if exists "anon_managers_select_active" on public.managers;
drop policy if exists "anon_managers_insert" on public.managers;
drop policy if exists "anon_managers_update" on public.managers;
drop policy if exists "anon_attendance_select" on public.attendance_checks;
drop policy if exists "anon_attendance_insert" on public.attendance_checks;
drop policy if exists "anon_attendance_update" on public.attendance_checks;
drop policy if exists "anon_attendance_holidays_select" on public.attendance_holidays;
drop policy if exists "anon_attendance_holidays_insert" on public.attendance_holidays;
drop policy if exists "anon_attendance_holidays_update" on public.attendance_holidays;
drop policy if exists "anon_attendance_holidays_delete" on public.attendance_holidays;
drop policy if exists "anon_penalties_select" on public.penalties;
drop policy if exists "anon_penalties_insert" on public.penalties;
drop policy if exists "anon_notices_select" on public.notices;
drop policy if exists "anon_notices_insert" on public.notices;
drop policy if exists "anon_notices_update" on public.notices;
drop policy if exists "anon_notices_delete" on public.notices;
drop policy if exists "anon_student_registration_events_select" on public.student_registration_events;
drop policy if exists "anon_student_registration_events_insert" on public.student_registration_events;
drop policy if exists "anon_student_registration_events_update" on public.student_registration_events;
drop policy if exists "anon_exams_select" on public.exams;
drop policy if exists "anon_exams_insert" on public.exams;
drop policy if exists "anon_exams_update" on public.exams;
drop policy if exists "anon_exam_sections_select" on public.exam_sections;
drop policy if exists "anon_exam_sections_insert" on public.exam_sections;
drop policy if exists "anon_exam_sections_update" on public.exam_sections;
drop policy if exists "anon_exam_sections_delete" on public.exam_sections;
drop policy if exists "anon_exam_subject_settings_select" on public.exam_subject_settings;
drop policy if exists "anon_exam_subject_settings_insert" on public.exam_subject_settings;
drop policy if exists "anon_exam_subject_settings_update" on public.exam_subject_settings;
drop policy if exists "anon_exam_answers_select" on public.exam_answers;
drop policy if exists "anon_exam_answers_insert" on public.exam_answers;
drop policy if exists "anon_exam_answers_update" on public.exam_answers;
drop policy if exists "anon_exam_submissions_select" on public.exam_submissions;
drop policy if exists "anon_exam_submissions_insert" on public.exam_submissions;
drop policy if exists "anon_exam_submissions_update" on public.exam_submissions;
drop policy if exists "anon_exam_submissions_delete" on public.exam_submissions;
drop policy if exists "anon_submission_answers_select" on public.submission_answers;
drop policy if exists "anon_submission_answers_insert" on public.submission_answers;
drop policy if exists "anon_submission_answers_update" on public.submission_answers;
drop policy if exists "anon_submission_answers_delete" on public.submission_answers;
drop policy if exists "anon_exam_files_select" on public.exam_files;
drop policy if exists "anon_exam_files_insert" on public.exam_files;
drop policy if exists "anon_exam_files_update" on public.exam_files;
drop policy if exists "anon_exam_files_delete" on public.exam_files;
drop policy if exists "anon_final_exam_scores_select" on public.final_exam_scores;
drop policy if exists "anon_final_exam_scores_insert" on public.final_exam_scores;
drop policy if exists "anon_final_exam_scores_update" on public.final_exam_scores;
drop policy if exists "anon_final_exam_scores_delete" on public.final_exam_scores;
drop policy if exists "anon_fitness_scores_select" on public.fitness_scores;
drop policy if exists "anon_fitness_scores_insert" on public.fitness_scores;
drop policy if exists "anon_fitness_scores_update" on public.fitness_scores;
drop policy if exists "anon_fitness_scores_delete" on public.fitness_scores;
drop policy if exists "anon_attendance_photo_select" on storage.objects;
drop policy if exists "anon_attendance_photo_insert" on storage.objects;
drop policy if exists "anon_outing_photo_select" on storage.objects;
drop policy if exists "anon_outing_photo_insert" on storage.objects;
drop policy if exists "anon_exam_file_select" on storage.objects;
drop policy if exists "anon_exam_file_insert" on storage.objects;
drop policy if exists "anon_exam_file_delete" on storage.objects;

revoke all on public.students from anon;
revoke all on public.outings from anon;
revoke all on public.outing_photos from anon;
revoke all on public.manager_allowed_ips from anon;
revoke all on public.managers from anon;
revoke all on public.track_options from anon;
revoke all on public.attendance_checks from anon;
revoke all on public.attendance_holidays from anon;
revoke all on public.penalties from anon;
revoke all on public.notices from anon;
revoke all on public.student_registration_events from anon;
revoke all on public.student_devices from anon;
revoke all on public.exams from anon;
revoke all on public.exam_sections from anon;
revoke all on public.exam_subject_settings from anon;
revoke all on public.exam_answers from anon;
revoke all on public.exam_submissions from anon;
revoke all on public.submission_answers from anon;
revoke all on public.exam_files from anon;
revoke all on public.final_exam_scores from anon;
revoke all on public.fitness_scores from anon;

grant select (
  id,
  name,
  class_name,
  student_category,
  account_type,
  position,
  cohort,
  track,
  gender,
  app_registered_at,
  attendance_excluded,
  fitness_excluded,
  is_active,
  created_at
) on public.students to anon;

grant insert (
  id,
  name,
  class_name,
  track,
  attendance_excluded,
  fitness_excluded,
  is_active,
  created_at
) on public.students to anon;

grant update (
  name,
  class_name,
  track,
  gender,
  password_hash,
  device_token,
  app_registered_at,
  attendance_excluded,
  fitness_excluded,
  is_active
) on public.students to anon;

grant select (
  id,
  student_id,
  student_name,
  class_name,
  reason,
  detail,
  expected_return,
  status,
  decision,
  approved_by,
  approved_at,
  approval_reason,
  receipt_note,
  early_leave_reason,
  created_at,
  verified_at,
  returned_at,
  deleted_at
) on public.outings to anon;

grant insert (
  id,
  student_id,
  student_name,
  class_name,
  reason,
  detail,
  expected_return,
  status,
  decision,
  approved_by,
  approved_at,
  approval_reason,
  receipt_note,
  early_leave_reason,
  created_at,
  verified_at,
  returned_at
) on public.outings to anon;

grant update (
  status,
  decision,
  approved_by,
  approved_at,
  approval_reason,
  receipt_note,
  teacher_memo,
  verified_at,
  returned_at,
  deleted_at
) on public.outings to anon;

grant select (
  id,
  outing_id,
  photo_type,
  data_url,
  photo_path,
  photo_url,
  thumbnail_path,
  thumbnail_url,
  original_name,
  uploaded_at
) on public.outing_photos to anon;

grant insert (
  id,
  outing_id,
  photo_type,
  data_url,
  photo_path,
  photo_url,
  thumbnail_path,
  thumbnail_url,
  original_name,
  uploaded_at
) on public.outing_photos to anon;

grant select (
  id,
  name,
  role,
  memo,
  is_active,
  created_at
) on public.managers to anon;

grant insert (
  id,
  name,
  role,
  memo,
  is_active,
  created_at
) on public.managers to anon;

grant update (
  name,
  role,
  memo,
  is_active,
  created_at
) on public.managers to anon;

grant select (
  label,
  sort_order,
  is_active,
  created_at
) on public.track_options to anon;

grant insert (
  label,
  sort_order,
  is_active,
  created_at
) on public.track_options to anon;

grant update (
  label,
  sort_order,
  is_active,
  created_at
) on public.track_options to anon;

grant select (
  id,
  student_id,
  student_name,
  class_name,
  check_date,
  status,
  reason,
  detail,
  manager_name,
  photo_path,
  photo_url,
  thumbnail_path,
  thumbnail_url,
  arrival_photo_path,
  arrival_photo_url,
  arrival_thumbnail_path,
  arrival_thumbnail_url,
  arrival_original_name,
  arrived_at,
  photo_data_url,
  original_name,
  created_at
) on public.attendance_checks to anon;

grant select (
  id,
  title,
  body,
  target_audience,
  is_published,
  created_at,
  updated_at
) on public.notices to anon;

grant insert (
  id,
  title,
  body,
  target_audience,
  is_published,
  created_at,
  updated_at
) on public.notices to anon;

grant update (
  title,
  body,
  target_audience,
  is_published,
  created_at,
  updated_at
) on public.notices to anon;

grant delete on public.notices to anon;

grant select (
  id,
  student_id,
  student_name,
  event_type,
  device_token,
  reason,
  actor,
  client_display_mode,
  client_user_agent,
  created_at
) on public.student_registration_events to anon;

grant insert (
  id,
  student_id,
  student_name,
  event_type,
  device_token,
  reason,
  actor,
  client_display_mode,
  client_user_agent,
  created_at
) on public.student_registration_events to anon;

grant update (
  student_id,
  student_name,
  event_type,
  device_token,
  reason,
  actor,
  client_display_mode,
  client_user_agent,
  created_at
) on public.student_registration_events to anon;

grant select (
  id,
  student_id,
  student_name,
  class_name,
  points,
  reason,
  manager_name,
  created_at,
  deleted_at,
  deleted_by
) on public.penalties to anon;

grant insert (
  id,
  student_id,
  student_name,
  class_name,
  points,
  reason,
  manager_name,
  created_at
) on public.penalties to anon;

grant insert (
  id,
  student_id,
  student_name,
  class_name,
  check_date,
  status,
  reason,
  detail,
  manager_name,
  photo_path,
  photo_url,
  thumbnail_path,
  thumbnail_url,
  arrival_photo_path,
  arrival_photo_url,
  arrival_thumbnail_path,
  arrival_thumbnail_url,
  arrival_original_name,
  arrived_at,
  photo_data_url,
  original_name,
  created_at
) on public.attendance_checks to anon;

grant update (
  status,
  arrival_photo_path,
  arrival_photo_url,
  arrival_thumbnail_path,
  arrival_thumbnail_url,
  arrival_original_name,
  arrived_at
) on public.attendance_checks to anon;

grant select (
  date_key,
  note,
  created_at,
  updated_at
) on public.attendance_holidays to anon;

grant insert (
  date_key,
  note,
  created_at,
  updated_at
) on public.attendance_holidays to anon;

grant update (
  note,
  created_at,
  updated_at
) on public.attendance_holidays to anon;

grant delete on public.attendance_holidays to anon;

grant select, insert, update on public.exams to anon;
grant select, insert, update, delete on public.exam_sections to anon;
grant select, insert, update on public.exam_subject_settings to anon;
grant delete on public.exam_subject_settings to anon;
grant select, insert, update on public.exam_answers to anon;
grant select, insert, update, delete on public.exam_submissions to anon;
grant select, insert, update, delete on public.submission_answers to anon;
grant select, insert, update on public.exam_files to anon;
grant delete on public.exam_files to anon;
grant select, insert, update, delete on public.final_exam_scores to anon;
grant select, insert, update, delete on public.fitness_scores to anon;

create policy "anon_students_select_active"
on public.students
for select
to anon
using (is_active = true);

create policy "anon_students_insert_roster"
on public.students
for insert
to anon
with check (
  is_active = true
  and password_hash is null
  and device_token is null
  and app_registered_at is null
);

create policy "anon_students_register_profile_once"
on public.students
for update
to anon
using (
  is_active = true
  and (
    (app_registered_at is null and password_hash is null and device_token is null)
    or (app_registered_at is not null and password_hash is not null and device_token is null)
  )
)
with check (
  is_active = true
  and app_registered_at is not null
  and password_hash is not null
  and device_token is not null
);

create policy "anon_students_update_roster_before_registration"
on public.students
for update
to anon
using (
  is_active = true
  and app_registered_at is null
  and password_hash is null
  and device_token is null
)
with check (
  is_active = true
  and app_registered_at is null
  and password_hash is null
  and device_token is null
);

create policy "anon_students_update_attendance_excluded"
on public.students
for update
to anon
using (is_active = true)
with check (is_active = true);

create policy "anon_students_deactivate"
on public.students
for update
to anon
using (is_active = true)
with check (is_active = false);

create policy "anon_track_options_select_active"
on public.track_options
for select
to anon
using (is_active = true);

create policy "anon_track_options_insert"
on public.track_options
for insert
to anon
with check (label <> '');

create policy "anon_track_options_update"
on public.track_options
for update
to anon
using (true)
with check (label <> '');

create policy "anon_outings_select_not_deleted"
on public.outings
for select
to anon
using (true);

create policy "anon_outings_insert_request"
on public.outings
for insert
to anon
with check (
  deleted_at is null
  and status = 'requested'
  and decision = 'pending'
  and teacher_memo is null
  and verified_at is null
  and returned_at is null
);

create policy "anon_outings_update_student_status"
on public.outings
for update
to anon
using (deleted_at is null and decision <> 'rejected')
with check (
  deleted_at is null
  and decision <> 'rejected'
  and teacher_memo is null
  and status in ('verified', 'returned')
);

create policy "anon_outings_update_teacher_decision"
on public.outings
for update
to anon
using (deleted_at is null)
with check (
  deleted_at is null
  and decision in ('approved', 'rejected')
);

create policy "anon_outings_soft_delete"
on public.outings
for update
to anon
using (deleted_at is null)
with check (
  deleted_at is not null
);

create policy "anon_outings_restore_deleted"
on public.outings
for update
to anon
using (deleted_at is not null)
with check (
  deleted_at is null
);

create policy "anon_photos_select"
on public.outing_photos
for select
to anon
using (
  exists (
    select 1
    from public.outings
    where outings.id = outing_photos.outing_id
      and outings.deleted_at is null
  )
);

create policy "anon_photos_insert"
on public.outing_photos
for insert
to anon
with check (
  exists (
    select 1
    from public.outings
    where outings.id = outing_photos.outing_id
      and outings.deleted_at is null
      and outings.decision <> 'rejected'
  )
  and (outing_photos.data_url is not null or outing_photos.photo_url is not null or outing_photos.photo_path is not null)
);

create policy "anon_managers_select_active"
on public.managers
for select
to anon
using (is_active = true);

create policy "anon_managers_insert"
on public.managers
for insert
to anon
with check (is_active = true and name is not null);

create policy "anon_managers_update"
on public.managers
for update
to anon
using (true)
with check (name is not null);

create policy "anon_attendance_select"
on public.attendance_checks
for select
to anon
using (true);

create policy "anon_attendance_insert"
on public.attendance_checks
for insert
to anon
with check (
  status in ('present', 'pre_arrival_reason')
  and check_date = ((now() at time zone 'Asia/Seoul')::date)
  and photo_path is not null
);

create policy "anon_attendance_update"
on public.attendance_checks
for update
to anon
using (
  check_date = ((now() at time zone 'Asia/Seoul')::date)
  and status = 'pre_arrival_reason'
)
with check (
  check_date = ((now() at time zone 'Asia/Seoul')::date)
  and status in ('pre_arrival_verified', 'present')
);

create policy "anon_attendance_holidays_select"
on public.attendance_holidays
for select
to anon
using (true);

create policy "anon_attendance_holidays_insert"
on public.attendance_holidays
for insert
to anon
with check (date_key is not null);

create policy "anon_attendance_holidays_update"
on public.attendance_holidays
for update
to anon
using (true)
with check (date_key is not null);

create policy "anon_attendance_holidays_delete"
on public.attendance_holidays
for delete
to anon
using (true);

create policy "anon_penalties_select"
on public.penalties
for select
to anon
using (true);

create policy "anon_penalties_insert"
on public.penalties
for insert
to anon
with check (
  points <> 0
  and reason is not null
  and manager_name is not null
);

create policy "anon_notices_select"
on public.notices
for select
to anon
using (true);

create policy "anon_notices_insert"
on public.notices
for insert
to anon
with check (title is not null and body is not null);

create policy "anon_notices_update"
on public.notices
for update
to anon
using (true)
with check (title is not null and body is not null);

create policy "anon_notices_delete"
on public.notices
for delete
to anon
using (true);

create policy "anon_student_registration_events_select"
on public.student_registration_events
for select
to anon
using (true);

create policy "anon_student_registration_events_insert"
on public.student_registration_events
for insert
to anon
with check (
  student_id is not null
  and event_type in ('registered', 'reset')
);

create policy "anon_student_registration_events_update"
on public.student_registration_events
for update
to anon
using (true)
with check (
  student_id is not null
  and event_type in ('registered', 'reset')
);

create policy "anon_exams_select"
on public.exams
for select
to anon
using (true);

create policy "anon_exams_insert"
on public.exams
for insert
to anon
with check (name is not null and week_number > 0);

create policy "anon_exams_update"
on public.exams
for update
to anon
using (true)
with check (name is not null and week_number > 0);

create policy "anon_exam_sections_select"
on public.exam_sections
for select
to anon
using (true);

create policy "anon_exam_sections_insert"
on public.exam_sections
for insert
to anon
with check (track is not null and subject is not null and question_count > 0);

create policy "anon_exam_sections_update"
on public.exam_sections
for update
to anon
using (true)
with check (track is not null and subject is not null and question_count > 0);

create policy "anon_exam_sections_delete"
on public.exam_sections
for delete
to anon
using (true);

create policy "anon_exam_subject_settings_select"
on public.exam_subject_settings
for select
to anon
using (true);

create policy "anon_exam_subject_settings_insert"
on public.exam_subject_settings
for insert
to anon
with check (track is not null and subject is not null and question_count > 0);

create policy "anon_exam_subject_settings_update"
on public.exam_subject_settings
for update
to anon
using (true)
with check (track is not null and subject is not null and question_count > 0);

create policy "anon_exam_answers_select"
on public.exam_answers
for select
to anon
using (true);

create policy "anon_exam_answers_insert"
on public.exam_answers
for insert
to anon
with check (
  question_number > 0
  and (correct_answer is null or correct_answer between 1 and 4)
  and cardinality(correct_answers) <= 4
  and array_position(correct_answers, null) is null
  and correct_answers <@ array[1, 2, 3, 4]::integer[]
);

create policy "anon_exam_answers_update"
on public.exam_answers
for update
to anon
using (true)
with check (
  question_number > 0
  and (correct_answer is null or correct_answer between 1 and 4)
  and cardinality(correct_answers) <= 4
  and array_position(correct_answers, null) is null
  and correct_answers <@ array[1, 2, 3, 4]::integer[]
);

create policy "anon_exam_submissions_select"
on public.exam_submissions
for select
to anon
using (true);

create policy "anon_exam_submissions_insert"
on public.exam_submissions
for insert
to anon
with check (student_id is not null and status in ('draft', 'submitted', 'cancelled'));

create policy "anon_exam_submissions_update"
on public.exam_submissions
for update
to anon
using (true)
with check (student_id is not null and status in ('draft', 'submitted', 'cancelled'));

create policy "anon_exam_submissions_delete"
on public.exam_submissions
for delete
to anon
using (true);

create policy "anon_submission_answers_select"
on public.submission_answers
for select
to anon
using (true);

create policy "anon_submission_answers_insert"
on public.submission_answers
for insert
to anon
with check (question_number > 0 and (selected_answer is null or selected_answer between 1 and 4));

create policy "anon_submission_answers_update"
on public.submission_answers
for update
to anon
using (true)
with check (question_number > 0 and (selected_answer is null or selected_answer between 1 and 4));

create policy "anon_submission_answers_delete"
on public.submission_answers
for delete
to anon
using (true);

create policy "anon_exam_files_select"
on public.exam_files
for select
to anon
using (true);

create policy "anon_exam_files_insert"
on public.exam_files
for insert
to anon
with check (file_type = 'answer_pdf');

create policy "anon_exam_files_update"
on public.exam_files
for update
to anon
using (true)
with check (file_type = 'answer_pdf');

create policy "anon_exam_files_delete"
on public.exam_files
for delete
to anon
using (true);

create policy "anon_final_exam_scores_select"
on public.final_exam_scores
for select
to anon
using (true);

create policy "anon_final_exam_scores_insert"
on public.final_exam_scores
for insert
to anon
with check (id is not null and student_id is not null and round > 0);

create policy "anon_final_exam_scores_update"
on public.final_exam_scores
for update
to anon
using (true)
with check (id is not null and student_id is not null and round > 0);

create policy "anon_final_exam_scores_delete"
on public.final_exam_scores
for delete
to anon
using (true);

create policy "anon_fitness_scores_select"
on public.fitness_scores
for select
to anon
using (true);

create policy "anon_fitness_scores_insert"
on public.fitness_scores
for insert
to anon
with check (id is not null and student_id is not null and assessment_month ~ '^\d{4}-\d{2}$');

create policy "anon_fitness_scores_update"
on public.fitness_scores
for update
to anon
using (true)
with check (id is not null and student_id is not null and assessment_month ~ '^\d{4}-\d{2}$');

create policy "anon_fitness_scores_delete"
on public.fitness_scores
for delete
to anon
using (true);

create policy "anon_attendance_photo_select"
on storage.objects
for select
to anon
using (bucket_id = 'attendance-photos');

create policy "anon_attendance_photo_insert"
on storage.objects
for insert
to anon
with check (
  bucket_id = 'attendance-photos'
  and lower((storage.foldername(name))[1]) = to_char((now() at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD')
);

create policy "anon_outing_photo_select"
on storage.objects
for select
to anon
using (bucket_id = 'outing-photos');

create policy "anon_outing_photo_insert"
on storage.objects
for insert
to anon
with check (
  bucket_id = 'outing-photos'
  and lower((storage.foldername(name))[1]) = to_char((now() at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD')
);

create policy "anon_exam_file_select"
on storage.objects
for select
to anon
using (bucket_id = 'exam-files');

create policy "anon_exam_file_insert"
on storage.objects
for insert
to anon
with check (bucket_id = 'exam-files');

create policy "anon_exam_file_delete"
on storage.objects
for delete
to anon
using (bucket_id = 'exam-files');

-- RONPARK STUDYCAFE: server-only persistence for online students.
create table if not exists public.study_cafe_profiles (
  student_id text primary key references public.students(id) on delete cascade,
  avatar_tone text not null default 'navy'
    check (avatar_tone in ('navy', 'blue', 'mint', 'purple', 'orange', 'rose')),
  nickname text
    check (nickname is null or (
      char_length(trim(nickname)) between 2 and 10
      and nickname ~ '^[가-힣A-Za-z0-9 ]+$'
    )),
  status_message text
    check (status_message is null or char_length(trim(status_message)) between 1 and 40),
  updated_at timestamptz not null default now()
);

alter table public.study_cafe_profiles
add column if not exists nickname text;

alter table public.study_cafe_profiles
add column if not exists status_message text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'study_cafe_profiles_nickname_check'
      and conrelid = 'public.study_cafe_profiles'::regclass
  ) then
    alter table public.study_cafe_profiles
    add constraint study_cafe_profiles_nickname_check
    check (nickname is null or (
      char_length(trim(nickname)) between 2 and 10
      and nickname ~ '^[가-힣A-Za-z0-9 ]+$'
    ));
  end if;
end
$$;

-- RONPARK LECTURE Q&A: server-only subject questions and comment answers.
create table if not exists public.question_posts (
  id uuid primary key default gen_random_uuid(),
  student_id text not null references public.students(id) on delete cascade,
  subject text not null check (char_length(trim(subject)) between 1 and 40),
  title text not null check (char_length(trim(title)) between 2 and 120),
  body text not null check (char_length(trim(body)) between 2 and 5000),
  image_paths text[] not null default '{}'::text[],
  status text not null default 'open' check (status in ('open', 'answered')),
  view_count integer not null default 0 check (view_count >= 0),
  is_hidden boolean not null default false,
  hidden_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by text
);

alter table public.question_posts add column if not exists board_type text not null default 'subject';
alter table public.question_posts add column if not exists image_paths text[] not null default '{}'::text[];
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'question_posts_image_paths_limit_check'
      and conrelid = 'public.question_posts'::regclass
  ) then
    alter table public.question_posts add constraint question_posts_image_paths_limit_check
    check (coalesce(cardinality(image_paths), 0) <= 3);
  end if;
end
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('question-board-images', 'question-board-images', false, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'question_posts_board_type_check'
      and conrelid = 'public.question_posts'::regclass
  ) then
    alter table public.question_posts add constraint question_posts_board_type_check
    check (board_type in ('subject', 'notice', 'free'));
  end if;
end
$$;

create table if not exists public.question_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.question_posts(id) on delete cascade,
  author_type text not null check (author_type in ('student', 'teacher')),
  student_id text references public.students(id) on delete cascade,
  teacher_name text,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  is_hidden boolean not null default false,
  hidden_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by text,
  check ((author_type = 'student' and student_id is not null and teacher_name is null)
    or (author_type = 'teacher' and char_length(trim(teacher_name)) between 1 and 80))
);

create table if not exists public.question_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_student_id text not null references public.students(id) on delete cascade,
  post_id uuid references public.question_posts(id) on delete cascade,
  comment_id uuid references public.question_comments(id) on delete cascade,
  reason text not null check (char_length(trim(reason)) between 2 and 300),
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text,
  check ((post_id is not null)::integer + (comment_id is not null)::integer = 1)
);

create index if not exists question_posts_visible_created_idx on public.question_posts (is_hidden, created_at desc) where deleted_at is null;
create index if not exists question_posts_subject_created_idx on public.question_posts (board_type, subject, created_at desc) where deleted_at is null;
create index if not exists question_posts_student_idx on public.question_posts (student_id, created_at desc);
create index if not exists question_comments_post_created_idx on public.question_comments (post_id, created_at asc) where deleted_at is null;
create unique index if not exists question_reports_pending_post_student_idx on public.question_reports (reporter_student_id, post_id) where post_id is not null and status = 'pending';
create unique index if not exists question_reports_pending_comment_student_idx on public.question_reports (reporter_student_id, comment_id) where comment_id is not null and status = 'pending';

alter table public.question_posts enable row level security;
alter table public.question_comments enable row level security;
alter table public.question_reports enable row level security;
revoke all on table public.question_posts from public, anon, authenticated;
revoke all on table public.question_comments from public, anon, authenticated;
revoke all on table public.question_reports from public, anon, authenticated;
grant select, insert, update, delete on table public.question_posts to service_role;
grant select, insert, update, delete on table public.question_comments to service_role;
grant select, insert, update, delete on table public.question_reports to service_role;

create or replace function public.increment_question_view_count(p_post_id uuid)
returns void language sql security invoker set search_path = public
as $$
  update public.question_posts set view_count = view_count + 1
  where id = p_post_id and deleted_at is null and is_hidden = false;
$$;
revoke all on function public.increment_question_view_count(uuid) from public, anon, authenticated;
grant execute on function public.increment_question_view_count(uuid) to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'study_cafe_profiles_status_message_check'
      and conrelid = 'public.study_cafe_profiles'::regclass
  ) then
    alter table public.study_cafe_profiles
    add constraint study_cafe_profiles_status_message_check
    check (status_message is null or char_length(trim(status_message)) between 1 and 40);
  end if;
end
$$;

create table if not exists public.study_cafe_subjects (
  id uuid primary key default gen_random_uuid(),
  student_id text not null references public.students(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 20),
  sort_order integer not null default 0 check (sort_order between 0 and 7),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, name),
  unique (student_id, sort_order)
);

create table if not exists public.study_cafe_todos (
  id uuid primary key default gen_random_uuid(),
  student_id text not null references public.students(id) on delete cascade,
  study_date date not null,
  subject_name text not null check (char_length(trim(subject_name)) between 1 and 20),
  content text not null check (char_length(trim(content)) between 1 and 80),
  is_completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (is_completed = false and completed_at is null)
    or (is_completed = true and completed_at is not null)
  )
);

create index if not exists study_cafe_todos_student_date_idx
on public.study_cafe_todos(student_id, study_date, created_at);

create table if not exists public.study_cafe_subject_goals (
  student_id text not null references public.students(id) on delete cascade,
  study_date date not null,
  subject_name text not null check (char_length(trim(subject_name)) between 1 and 20),
  target_minutes integer not null check (target_minutes between 60 and 600 and target_minutes % 60 = 0),
  result_status text check (result_status is null or result_status in ('on_time', 'overtime')),
  completed_elapsed_seconds integer not null default 0 check (completed_elapsed_seconds >= 0),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (student_id, study_date, subject_name)
);

create index if not exists study_cafe_subject_goals_student_date_idx
on public.study_cafe_subject_goals(student_id, study_date);


create table if not exists public.study_cafe_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id text not null references public.students(id) on delete cascade,
  subject_name text not null check (char_length(trim(subject_name)) between 1 and 20),
  status text not null default 'running'
    check (status in ('running', 'paused', 'completed')),
  elapsed_seconds integer not null default 0 check (elapsed_seconds >= 0),
  started_at timestamptz not null default now(),
  active_started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'running' and active_started_at is not null and ended_at is null)
    or (status = 'paused' and active_started_at is null and ended_at is null)
    or (status = 'completed' and active_started_at is null and ended_at is not null)
  )
);

create unique index if not exists study_cafe_one_active_session_per_student
on public.study_cafe_sessions(student_id)
where status in ('running', 'paused');

create index if not exists study_cafe_sessions_student_started_idx
on public.study_cafe_sessions(student_id, started_at desc);

create index if not exists study_cafe_sessions_started_idx
on public.study_cafe_sessions(started_at desc);

create table if not exists public.study_cafe_presence (
  student_id text primary key references public.students(id) on delete cascade,
  seat_number integer not null check (seat_number between 1 and 192),
  status text not null default 'seated'
    check (status in ('seated', 'countdown', 'studying', 'paused')),
  current_subject text,
  avatar_tone text not null default 'navy'
    check (avatar_tone in ('navy', 'blue', 'mint', 'purple', 'orange', 'rose')),
  display_name text
    check (display_name is null or (
      char_length(trim(display_name)) between 2 and 10
      and display_name ~ '^[가-힣A-Za-z0-9 ]+$'
    )),
  last_heartbeat_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (seat_number)
);

alter table public.study_cafe_presence
drop constraint if exists study_cafe_presence_seat_number_check;

alter table public.study_cafe_presence
add constraint study_cafe_presence_seat_number_check
check (seat_number between 1 and 192);

alter table public.study_cafe_presence
add column if not exists display_name text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'study_cafe_presence_display_name_check'
      and conrelid = 'public.study_cafe_presence'::regclass
  ) then
    alter table public.study_cafe_presence
    add constraint study_cafe_presence_display_name_check
    check (display_name is null or (
      char_length(trim(display_name)) between 2 and 10
      and display_name ~ '^[가-힣A-Za-z0-9 ]+$'
    ));
  end if;
end
$$;

create index if not exists study_cafe_presence_heartbeat_idx
on public.study_cafe_presence(last_heartbeat_at);

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

alter table public.study_cafe_profiles enable row level security;
alter table public.study_cafe_subjects enable row level security;
alter table public.study_cafe_todos enable row level security;
alter table public.study_cafe_subject_goals enable row level security;
alter table public.study_cafe_sessions enable row level security;
alter table public.study_cafe_presence enable row level security;

revoke all on public.study_cafe_profiles from anon;
revoke all on public.study_cafe_subjects from anon;
revoke all on public.study_cafe_todos from anon;
revoke all on public.study_cafe_subject_goals from anon;
revoke all on public.study_cafe_sessions from anon;
revoke all on public.study_cafe_presence from anon;
revoke all on function public.replace_study_cafe_subjects(text, jsonb) from public;
revoke all on function public.replace_study_cafe_subjects(text, jsonb) from anon;
revoke all on function public.replace_study_cafe_subjects(text, jsonb) from authenticated;
grant execute on function public.replace_study_cafe_subjects(text, jsonb) to service_role;

-- Private study rooms and room chat are defined in the complete, rerunnable migration:
-- supabase/add-study-cafe-rooms.sql

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'study_cafe_presence'
    ) then
      alter publication supabase_realtime add table public.study_cafe_presence;
    end if;
  end if;
end
$$;
-- Independent private inquiries. Access is server-only through api/inquiries.js.
create table if not exists public.student_inquiries (
  id uuid primary key default gen_random_uuid(),
  student_id text not null references public.students(id) on delete cascade,
  category text not null check (category in ('이용 문의', '플래너', '스터디카페', '타이머', '커리큘럼', '게시판', '알림', '계정·기기')),
  title text not null check (char_length(trim(title)) between 2 and 120),
  body text not null check (char_length(trim(body)) between 2 and 5000),
  status text not null default 'open' check (status in ('open', 'answered')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.student_inquiry_messages (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.student_inquiries(id) on delete cascade,
  author_type text not null check (author_type in ('student', 'teacher')),
  student_id text references public.students(id) on delete cascade,
  teacher_name text,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (
    (author_type = 'student' and student_id is not null and teacher_name is null)
    or (author_type = 'teacher' and student_id is null and char_length(trim(teacher_name)) between 1 and 80)
  )
);

create index if not exists student_inquiries_student_created_idx on public.student_inquiries (student_id, created_at desc) where deleted_at is null;
create index if not exists student_inquiries_status_created_idx on public.student_inquiries (status, created_at desc) where deleted_at is null;
create index if not exists student_inquiry_messages_inquiry_created_idx on public.student_inquiry_messages (inquiry_id, created_at asc) where deleted_at is null;
create index if not exists student_inquiry_messages_student_created_idx on public.student_inquiry_messages (student_id, created_at desc) where deleted_at is null and student_id is not null;
alter table public.student_inquiries enable row level security;
alter table public.student_inquiry_messages enable row level security;
revoke all on table public.student_inquiries from public, anon, authenticated;
revoke all on table public.student_inquiry_messages from public, anon, authenticated;
grant select, insert, update, delete on table public.student_inquiries to service_role;
grant select, insert, update, delete on table public.student_inquiry_messages to service_role;
