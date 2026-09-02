-- Speeds up the student board list filtered by subject and ordered newest first.
-- Safe to apply independently to an existing question-board installation.
create index if not exists question_posts_visible_subject_created_idx
on public.question_posts (board_type, subject, created_at desc)
where deleted_at is null and is_hidden = false;
