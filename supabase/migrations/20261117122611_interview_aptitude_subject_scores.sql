begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

-- Extend only the administrator report. Keep student responses, stored scores,
-- answer keys, permissions and result visibility unchanged.
do $patch$
declare
  source text := replace(pg_catalog.pg_get_functiondef('public.ip_aptitude_service(text,jsonb,jsonb)'::regprocedure),chr(13),'');
  before_text text := $before$'correctCount',s.correct_count,$before$;
  after_text text := $after$'correctCount',s.correct_count,
   'subjectCorrectCounts',case when s.student_id is not null then (
    select jsonb_agg((
     select count(*) from generate_series(subject_index*(n/5),(subject_index+1)*(n/5)-1) as questions(question_index)
     where s.answers->question_index=r.answer_key->question_index and s.answers->question_index<>'0'::jsonb
    ) order by subject_index) from generate_series(0,4) as subjects(subject_index)
   ) end,$after$;
begin
  if position('''subjectCorrectCounts''' in source)>0 then
    raise exception 'aptitude_subject_scores_migration_source_mismatch';
  end if;
  if position(before_text in source)>0 then
    source:=replace(source,before_text,after_text);
  elsif position('''correctCount'',e.correct_count,' in source)>0
    and position('false as historical,null::text as cohort' in source)>0
    and position('s.rank,h.submitted_at,true,h.cohort' in source)>0 then
    -- Keep historical participants in their existing ranking population. Answers
    -- stay inside the query; only five counts are returned to administrators.
    source:=replace(source,'false as historical,null::text as cohort',
      'false as historical,null::text as cohort,case when t.state=''submitted'' then t.answers end as answers');
    source:=replace(source,'s.rank,h.submitted_at,true,h.cohort',
      's.rank,h.submitted_at,true,h.cohort,h.answers');
    source:=replace(source,'''correctCount'',e.correct_count,',
      replace(replace(replace(after_text,'s.student_id is not null','e.state=''submitted'''),'s.answers','e.answers'),
        '''correctCount'',s.correct_count,','''correctCount'',e.correct_count,'));
  else
    raise exception 'aptitude_subject_scores_migration_source_mismatch';
  end if;
  execute source;
end
$patch$;
commit;
