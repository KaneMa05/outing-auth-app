-- Existing deployed clients can continue creating applications while the new
-- client starts attaching a private status lookup token.
alter table public.lecture_applications
add column if not exists lookup_token_hash text;

alter table public.lecture_applications
drop constraint if exists lecture_applications_lookup_token_hash_check;

alter table public.lecture_applications
add constraint lecture_applications_lookup_token_hash_check
check (lookup_token_hash is null or lookup_token_hash ~ '^[0-9a-f]{64}$');

create unique index if not exists lecture_applications_lookup_token_idx
on public.lecture_applications (lookup_token_hash)
where lookup_token_hash is not null;
