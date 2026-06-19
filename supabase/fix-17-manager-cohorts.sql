update public.managers
set cohort = '17'
where is_active = true
  and cohort = '18'
  and name in (
    '관리자',
    '서준표',
    '우경국',
    '임성현',
    '천정우',
    '최진이',
    '황다영'
  );
