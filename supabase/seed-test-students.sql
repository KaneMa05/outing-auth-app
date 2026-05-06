insert into public.students (
  id,
  name,
  class_name,
  is_active
) values
  ('19001', '테스트학생1', '오프라인반', true),
  ('19002', '테스트학생2', '오프라인반', true),
  ('19003', '테스트학생3', '오프라인반', true),
  ('19004', '테스트학생4', '오프라인반', true)
on conflict (id) do update
set
  name = excluded.name,
  class_name = excluded.class_name,
  is_active = true;
