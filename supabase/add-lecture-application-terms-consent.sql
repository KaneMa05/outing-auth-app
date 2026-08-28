-- Existing applications predate the separate terms agreement, so the new
-- consent timestamp stays nullable for historical rows. The public API requires
-- it for every application submitted after this migration is deployed.
alter table public.lecture_applications
add column if not exists terms_consent_at timestamptz;
