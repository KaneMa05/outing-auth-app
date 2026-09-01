create table if not exists public.phone_verification_challenges (
  id uuid primary key,
  phone_hash text not null check (phone_hash ~ '^[0-9a-f]{64}$'),
  code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  attempts smallint not null default 0 check (attempts >= 0),
  max_attempts smallint not null default 5 check (max_attempts between 1 and 10),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (attempts <= max_attempts)
);

create index if not exists phone_verification_challenges_phone_created_idx
  on public.phone_verification_challenges (phone_hash, created_at desc);

create index if not exists phone_verification_challenges_expires_idx
  on public.phone_verification_challenges (expires_at);

alter table public.phone_verification_challenges enable row level security;

revoke all on table public.phone_verification_challenges from anon, authenticated;
grant select, insert, update, delete on table public.phone_verification_challenges to service_role;

comment on table public.phone_verification_challenges is
  'Server-only one-time verification challenges for lecture application phone verification.';

comment on column public.phone_verification_challenges.phone_hash is
  'HMAC-SHA256 of the normalized phone number. Raw phone numbers are not stored here.';

comment on column public.phone_verification_challenges.code_hash is
  'HMAC-SHA256 of the challenge id, normalized phone number, and one-time code.';
