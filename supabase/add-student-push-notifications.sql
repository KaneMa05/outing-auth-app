create table if not exists public.student_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  student_id text not null references public.students(id) on delete cascade,
  device_token_hash text not null check (device_token_hash ~ '^[0-9a-f]{64}$'),
  endpoint text not null check (endpoint ~ '^https://'),
  p256dh text not null check (char_length(p256dh) between 20 and 512),
  auth text not null check (char_length(auth) between 8 and 512),
  enabled boolean not null default true,
  notification_preferences jsonb not null default '{"admin":true,"study":true,"study_cafe":true,"question_board":true}'::jsonb
    check (jsonb_typeof(notification_preferences) = 'object'),
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, endpoint)
);

create index if not exists student_push_subscriptions_student_idx
on public.student_push_subscriptions (student_id);

create table if not exists public.student_push_messages (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 80),
  body text not null check (char_length(body) between 1 and 300),
  target_type text not null check (target_type in ('all', 'category', 'students')),
  target_category text check (target_category is null or target_category in ('offline', 'online_managed', 'lecture')),
  target_student_ids text[] not null default '{}',
  target_count integer not null default 0 check (target_count >= 0),
  subscribed_count integer not null default 0 check (subscribed_count >= 0),
  sent_count integer not null default 0 check (sent_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  created_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists student_push_messages_created_idx
on public.student_push_messages (created_at desc);

alter table public.student_push_subscriptions enable row level security;
alter table public.student_push_messages enable row level security;

revoke all on table public.student_push_subscriptions from anon, authenticated;
revoke all on table public.student_push_messages from anon, authenticated;
grant select, insert, update, delete on table public.student_push_subscriptions to service_role;
grant select, insert, update, delete on table public.student_push_messages to service_role;
