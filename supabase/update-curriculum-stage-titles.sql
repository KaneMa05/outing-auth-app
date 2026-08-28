-- Run once before releasing lecture-derived curriculum stage titles.
-- This updates every subject and every stage from its ordered lecture titles.
begin;

alter table public.curriculum_stages
  drop constraint if exists curriculum_stages_title_check;

alter table public.curriculum_stages
  add constraint curriculum_stages_title_check
  check (char_length(title) between 1 and 1000);

update public.curriculum_stages as stage
set title = lecture_titles.title,
    updated_at = now()
from (
  select stage_id, string_agg(title, ', ' order by sort_order, id) as title
  from public.curriculum_lectures
  group by stage_id
) as lecture_titles
where stage.id = lecture_titles.stage_id;

commit;
