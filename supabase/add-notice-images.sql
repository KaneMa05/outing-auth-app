-- Add one optional public image to each notice. Uploads and deletions are
-- performed by /api/notices after teacher-session authorization.
alter table public.notices
add column if not exists image_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('notice-images', 'notice-images', true, 1048576, array['image/jpeg'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

grant select (image_path) on public.notices to anon;
