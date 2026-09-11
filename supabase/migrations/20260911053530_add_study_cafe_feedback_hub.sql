begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create table if not exists public.study_cafe_feature_previews (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 120),
  description text not null check (char_length(description) between 2 and 3000),
  question text not null check (char_length(question) between 2 and 300),
  image_paths text[] not null default '{}' check (cardinality(image_paths) <= 3),
  is_published boolean not null default false,
  highlighted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.study_cafe_feature_previews enable row level security;
revoke all on public.study_cafe_feature_previews from public, anon, authenticated;
grant select, insert, update on public.study_cafe_feature_previews to service_role;
create index if not exists study_cafe_features_published_created_idx
  on public.study_cafe_feature_previews (is_published, created_at desc, id desc);
alter table public.question_posts add column if not exists feature_preview_id uuid
  references public.study_cafe_feature_previews(id);
create index if not exists question_posts_feature_created_idx
  on public.question_posts (feature_preview_id, created_at desc, id desc);

notify pgrst, 'reload schema';
commit;
