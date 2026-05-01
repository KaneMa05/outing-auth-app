alter table public.outings
add column if not exists deleted_at timestamptz;
