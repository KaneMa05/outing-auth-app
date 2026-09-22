-- Only the private identifier columns used by the OX member lookup.
create table public.lecture_applications (
  id integer generated always as identity primary key,
  approved_student_id text references public.students(id),
  status text not null,
  lecture_id text
);
create table public.final_score_identities (
  cohort text not null,
  student_id text references public.students(id),
  lecture_id_normalized text not null,
  primary key(cohort,lecture_id_normalized)
);
alter table public.lecture_applications enable row level security;
alter table public.final_score_identities enable row level security;
revoke all on public.lecture_applications,public.final_score_identities from public,anon,authenticated;
grant select on public.lecture_applications,public.final_score_identities to service_role;
