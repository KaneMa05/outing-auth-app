-- Web Push subscriptions belong to pre-registration lecture applications.
-- Only the server-side service role can access their endpoint and key material.
create table if not exists public.lecture_application_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.lecture_applications(id) on delete cascade,
  endpoint text not null check (endpoint ~ '^https://'),
  p256dh text not null check (char_length(p256dh) between 20 and 512),
  auth text not null check (char_length(auth) between 8 and 512),
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_id, endpoint)
);

create index if not exists lecture_application_push_application_idx
on public.lecture_application_push_subscriptions (application_id);

alter table public.lecture_application_push_subscriptions enable row level security;

revoke all on table public.lecture_application_push_subscriptions from anon, authenticated;
grant select, insert, update, delete on table public.lecture_application_push_subscriptions to service_role;
