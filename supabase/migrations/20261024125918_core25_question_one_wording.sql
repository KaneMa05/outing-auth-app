-- Correct the current question only; submitted definitions and student answers
-- remain historical snapshots of the question shown at submission time.
update public.ip_pa_units
set prompt = '본인의 강점을 살려 우리 조직에 들어와 발휘할 수 있는 점은 무엇인가요?'
where id = 'core-01'
  and prompt = '본인의 강점을 살려 우리 조직에 들어와 발휘 하는 있는 점?';
