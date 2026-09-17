-- Raw lecture account identifiers are available only through the teacher API.
-- Existing student IDs and public final score rows remain unchanged.
create table if not exists public.final_score_identities (
  cohort text not null check (cohort ~ '^([1-9][0-9]?|lecture)$'),
  lecture_id_normalized text not null check (
    char_length(lecture_id_normalized) between 1 and 80
    and lecture_id_normalized = lower(btrim(lecture_id_normalized))
    and lecture_id_normalized !~ '[[:space:][:cntrl:]]'
  ),
  participant_id text not null,
  student_id text references public.students(id) on delete set null,
  created_by text not null,
  created_at timestamptz not null default now(),
  primary key (cohort, lecture_id_normalized),
  unique (cohort, participant_id),
  check (student_id is null or participant_id = student_id)
);

alter table public.final_score_identities enable row level security;
revoke all on public.final_score_identities from public, anon, authenticated, service_role;
grant select, insert on public.final_score_identities to service_role;
