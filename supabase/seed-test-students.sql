-- 19기 공채 등수 테스트용 학생/주간평가 성적 시드
-- 전제: 19기 주간평가와 "경찰직 - 공채(순경)" 시험 섹션이 먼저 생성되어 있어야 합니다.

with test_students as (
  select
    student_no,
    '19' || lpad(student_no::text, 3, '0') as student_id,
    '19기 01직렬 테스트' || lpad(student_no::text, 2, '0') as student_name
  from generate_series(1, 30) as student_no
)
insert into public.students (
  id,
  name,
  class_name,
  track,
  is_active
)
select
  student_id,
  student_name,
  '오프라인반',
  '경찰직 - 공채(순경)',
  true
from test_students
on conflict (id) do update
set
  name = excluded.name,
  class_name = excluded.class_name,
  track = excluded.track,
  is_active = true;

with test_students as (
  select
    student_no,
    '19' || lpad(student_no::text, 3, '0') as student_id,
    '19기 01직렬 테스트' || lpad(student_no::text, 2, '0') as student_name
  from generate_series(1, 30) as student_no
),
test_subjects as (
  select *
  from (values
    ('해양경찰학개론', 0, 7),
    ('해사법규', 10, 5),
    ('형사법', 20, 3)
  ) as subjects(subject, offset_score, multiplier)
),
test_scores as (
  select
    test_students.student_id,
    test_students.student_name,
    test_subjects.subject,
    40 + (((31 - test_students.student_no) * test_subjects.multiplier + test_subjects.offset_score) % 13) * 5 as score
  from test_students
  cross join test_subjects
),
public_sections as (
  select
    sections.id as exam_section_id,
    sections.subject,
    greatest(coalesce(sections.question_count, 20), 1) as question_count
  from public.exam_sections sections
  join public.exams exams on exams.id = sections.exam_id
  where exams.cohort = '19'
    and sections.track in ('전체', '경찰직 - 공채(순경)')
    and sections.subject in ('해양경찰학개론', '해사법규', '형사법')
)
insert into public.exam_submissions (
  exam_section_id,
  student_id,
  student_name,
  track,
  status,
  score,
  correct_count,
  submitted_at
)
select
  public_sections.exam_section_id,
  test_scores.student_id,
  test_scores.student_name,
  '경찰직 - 공채(순경)',
  'submitted',
  least(test_scores.score, public_sections.question_count * 5),
  least(round(test_scores.score / 5.0)::integer, public_sections.question_count),
  now()
from public_sections
join test_scores on test_scores.subject = public_sections.subject
on conflict (student_id, exam_section_id) do update
set
  student_name = excluded.student_name,
  track = excluded.track,
  status = excluded.status,
  score = excluded.score,
  correct_count = excluded.correct_count,
  submitted_at = excluded.submitted_at;
