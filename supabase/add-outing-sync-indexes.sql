create index if not exists outings_created_at_idx
on public.outings (created_at desc);

create index if not exists outings_student_created_at_idx
on public.outings (student_id, created_at desc);

create index if not exists outing_photos_uploaded_at_idx
on public.outing_photos (uploaded_at asc);

create index if not exists outing_photos_outing_uploaded_idx
on public.outing_photos (outing_id, uploaded_at asc);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'outings'
    ) then
      alter publication supabase_realtime add table public.outings;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'students'
    ) then
      alter publication supabase_realtime add table public.students;
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
