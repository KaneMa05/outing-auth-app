begin;
alter table public.ip_draft_question_jobs
 drop constraint ip_draft_question_jobs_student_id_fkey;
alter table public.ip_draft_question_jobs
 add constraint ip_draft_question_jobs_student_id_fkey
 foreign key(student_id) references public.ip_owners(id) on delete cascade;
commit;
