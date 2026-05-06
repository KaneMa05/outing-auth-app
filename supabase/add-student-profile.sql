alter table public.students
add column if not exists track text,
add column if not exists gender text,
add column if not exists password_hash text,
add column if not exists app_registered_at timestamptz;
