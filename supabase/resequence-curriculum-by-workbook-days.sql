-- Rebuild curriculum stages from the n일차 values in 론박_커리큘럼_DB.xlsx.
-- This preserves every lecture ID and lecture completion, but resets stage-level completion
-- because the meaning and membership of stages changes. Lectures absent from the detailed
-- workbook rows are retained in an unpublished holding stage instead of being deleted.
begin;

create temporary table curriculum_workbook_day_counts (
  subject_id text not null,
  day_number integer not null,
  lecture_count integer not null,
  primary key (subject_id, day_number)
) on commit drop;

insert into curriculum_workbook_day_counts (subject_id, day_number, lecture_count)
values
  ('criminal-law', 1, 1), ('criminal-law', 2, 3), ('criminal-law', 3, 4), ('criminal-law', 4, 3), ('criminal-law', 5, 4), ('criminal-law', 6, 4), ('criminal-law', 7, 4), ('criminal-law', 8, 3), ('criminal-law', 9, 5), ('criminal-law', 10, 5), ('criminal-law', 11, 5), ('criminal-law', 12, 5), ('criminal-law', 13, 4), ('criminal-law', 14, 5), ('criminal-law', 15, 7), ('criminal-law', 16, 6), ('criminal-law', 17, 4), ('criminal-law', 18, 3), ('criminal-law', 19, 5), ('criminal-law', 20, 4), ('criminal-law', 21, 4), ('criminal-law', 22, 4), ('criminal-law', 23, 4), ('criminal-law', 24, 4), ('criminal-law', 25, 3), ('criminal-law', 26, 3), ('criminal-law', 27, 2),
  ('coast-guard-intro', 1, 2), ('coast-guard-intro', 2, 6), ('coast-guard-intro', 3, 5), ('coast-guard-intro', 4, 5), ('coast-guard-intro', 5, 4), ('coast-guard-intro', 6, 5), ('coast-guard-intro', 7, 3), ('coast-guard-intro', 8, 5), ('coast-guard-intro', 9, 5), ('coast-guard-intro', 10, 6), ('coast-guard-intro', 11, 3), ('coast-guard-intro', 12, 5), ('coast-guard-intro', 13, 6), ('coast-guard-intro', 14, 7), ('coast-guard-intro', 15, 6), ('coast-guard-intro', 16, 4), ('coast-guard-intro', 17, 3), ('coast-guard-intro', 18, 4), ('coast-guard-intro', 19, 2),
  ('maritime-law', 1, 2), ('maritime-law', 2, 4), ('maritime-law', 3, 5), ('maritime-law', 4, 5), ('maritime-law', 5, 7), ('maritime-law', 6, 5), ('maritime-law', 7, 12), ('maritime-law', 8, 3), ('maritime-law', 9, 2), ('maritime-law', 10, 6), ('maritime-law', 11, 6), ('maritime-law', 12, 7), ('maritime-law', 13, 6), ('maritime-law', 14, 3),
  ('navigation-technique', 1, 1), ('navigation-technique', 2, 4), ('navigation-technique', 3, 3), ('navigation-technique', 4, 4), ('navigation-technique', 5, 4), ('navigation-technique', 6, 3), ('navigation-technique', 7, 4), ('navigation-technique', 8, 4), ('navigation-technique', 9, 3), ('navigation-technique', 10, 4), ('navigation-technique', 11, 6), ('navigation-technique', 12, 4), ('navigation-technique', 13, 3), ('navigation-technique', 14, 2), ('navigation-technique', 15, 3), ('navigation-technique', 16, 4), ('navigation-technique', 17, 3), ('navigation-technique', 18, 4), ('navigation-technique', 19, 3),
  ('marine-engineering', 1, 1), ('marine-engineering', 2, 3), ('marine-engineering', 3, 3), ('marine-engineering', 4, 3), ('marine-engineering', 5, 3), ('marine-engineering', 6, 3), ('marine-engineering', 7, 3), ('marine-engineering', 8, 3), ('marine-engineering', 9, 3), ('marine-engineering', 10, 3), ('marine-engineering', 11, 3), ('marine-engineering', 12, 2), ('marine-engineering', 13, 3), ('marine-engineering', 14, 3), ('marine-engineering', 15, 3), ('marine-engineering', 16, 3), ('marine-engineering', 17, 3), ('marine-engineering', 18, 2), ('marine-engineering', 19, 3),
  ('maritime-english', 1, 1), ('maritime-english', 2, 5), ('maritime-english', 3, 5), ('maritime-english', 4, 5), ('maritime-english', 5, 5), ('maritime-english', 6, 4), ('maritime-english', 7, 4), ('maritime-english', 8, 5), ('maritime-english', 9, 4), ('maritime-english', 10, 4), ('maritime-english', 11, 4), ('maritime-english', 12, 5);

create temporary table curriculum_workbook_lecture_map on commit drop as
with ordered_lectures as (
  select
    lecture.id,
    stage.subject_id,
    row_number() over (
      partition by stage.subject_id
      order by stage.sort_order, stage.stage_number, lecture.sort_order, lecture.id
    ) as lecture_position
  from public.curriculum_lectures as lecture
  join public.curriculum_stages as stage on stage.id = lecture.stage_id
  where stage.subject_id in (select distinct subject_id from curriculum_workbook_day_counts)
), day_boundaries as (
  select
    subject_id,
    day_number,
    sum(lecture_count) over (partition by subject_id order by day_number) as end_position,
    sum(lecture_count) over (partition by subject_id order by day_number) - lecture_count + 1 as start_position
  from curriculum_workbook_day_counts
)
select
  ordered.id as lecture_id,
  ordered.subject_id,
  ordered.lecture_position,
  boundary.day_number
from ordered_lectures as ordered
left join day_boundaries as boundary
  on boundary.subject_id = ordered.subject_id
 and ordered.lecture_position between boundary.start_position and boundary.end_position;

insert into public.curriculum_stages
  (id, subject_id, stage_number, title, sort_order, is_published, requires_wrap_up)
select
  counts.subject_id || '-stage-' || counts.day_number,
  counts.subject_id,
  counts.day_number,
  counts.day_number || '일차',
  counts.day_number,
  true,
  counts.day_number <> 1
from curriculum_workbook_day_counts as counts
on conflict (id) do update set
  subject_id = excluded.subject_id,
  stage_number = excluded.stage_number,
  sort_order = excluded.sort_order,
  is_published = excluded.is_published,
  requires_wrap_up = excluded.requires_wrap_up,
  updated_at = now();

insert into public.curriculum_stages
  (id, subject_id, stage_number, title, sort_order, is_published, requires_wrap_up)
select distinct
  mapping.subject_id || '-workbook-extra',
  mapping.subject_id,
  100,
  '엑셀 상세표 미수록 강의',
  100,
  false,
  false
from curriculum_workbook_lecture_map as mapping
where mapping.day_number is null
on conflict (id) do update set
  title = excluded.title,
  sort_order = excluded.sort_order,
  is_published = excluded.is_published,
  requires_wrap_up = excluded.requires_wrap_up,
  updated_at = now();

update public.curriculum_lectures as lecture
set
  stage_id = mapping.subject_id || '-stage-' || mapping.day_number,
  sort_order = mapping.lecture_position - boundary.start_position + 1,
  updated_at = now()
from curriculum_workbook_lecture_map as mapping
join (
  select
    subject_id,
    day_number,
    sum(lecture_count) over (partition by subject_id order by day_number) - lecture_count + 1 as start_position
  from curriculum_workbook_day_counts
) as boundary
  on boundary.subject_id = mapping.subject_id and boundary.day_number = mapping.day_number
where lecture.id = mapping.lecture_id
  and mapping.day_number is not null;

-- Rows beyond the last n일차 are absent from the workbook's detailed curriculum.
-- Keep them for audit/progress preservation, but hide their holding stage from students.
update public.curriculum_lectures as lecture
set
  stage_id = mapping.subject_id || '-workbook-extra',
  sort_order = mapping.lecture_position,
  updated_at = now()
from curriculum_workbook_lecture_map as mapping
where lecture.id = mapping.lecture_id
  and mapping.day_number is null;

delete from public.curriculum_student_stage_progress as progress
using public.curriculum_stages as stage
where progress.stage_id = stage.id
  and stage.subject_id in (select distinct subject_id from curriculum_workbook_day_counts);

delete from public.curriculum_stages as stage
where stage.subject_id in (select distinct subject_id from curriculum_workbook_day_counts)
  and stage.id <> stage.subject_id || '-workbook-extra'
  and not exists (
    select 1
    from curriculum_workbook_day_counts as counts
    where counts.subject_id = stage.subject_id
      and counts.day_number = stage.stage_number
  );

update public.curriculum_stages as stage
set title = lecture_titles.title,
    updated_at = now()
from (
  select stage_id, string_agg(title, ', ' order by sort_order, id) as title
  from public.curriculum_lectures
  group by stage_id
) as lecture_titles
where stage.id = lecture_titles.stage_id
  and stage.subject_id in (select distinct subject_id from curriculum_workbook_day_counts);

commit;
