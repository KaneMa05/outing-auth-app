-- Factual end-of-session reports, separate from job/personality assessment.
begin;
alter table public.ip_live_runs add column result_report jsonb;

create function public.ip_live_result_report() returns trigger
language plpgsql security invoker set search_path='' as $$
declare
 v_main integer; v_followup integer; v_complete integer; v_partial integer; v_empty integer;
 v_pending text; v_review jsonb;
begin
 if new.state not in ('completed','interrupted') then
  new.result_report:=null;
  return new;
 end if;
 -- Storage retries and enrollment retention updates must preserve the report.
 if tg_op='UPDATE' then
  if old.result_report is not null and new.state=old.state and new.turns=old.turns
   and new.current_question=old.current_question then
   new.result_report:=old.result_report;
   return new;
  end if;
 end if;
 select count(*) filter(where t->>'kind'='initial'),
  count(*) filter(where t->>'kind'='followup'),
  count(*) filter(where t->>'complete'='true' and btrim(coalesce(t->>'answer',''))<>''),
  count(*) filter(where coalesce(t->>'complete','false')<>'true'),
  count(*) filter(where btrim(coalesce(t->>'answer',''))='')
 into v_main,v_followup,v_complete,v_partial,v_empty
 from jsonb_array_elements(new.turns) t;
 v_pending:=case when new.current_question<>'' and new.current_question<>'면접 종료'
  and new.current_question is distinct from (new.turns->-1->>'question') then new.current_question else null end;
 v_review:=jsonb_build_array('질문별 답변과 원음을 함께 들으며 전사가 실제 발화와 일치하는지 확인하세요.');
 if v_partial>0 or v_pending is not null or v_empty>0 then
  v_review:=v_review||jsonb_build_array('미완료 또는 전사가 없는 질문을 확인하고 다시 답변해보세요.');
 end if;
 if v_followup>0 then
  v_review:=v_review||jsonb_build_array('꼬리질문의 근거가 된 앞선 발언과 후속 답변이 이어지는지 확인하세요.');
 end if;
 new.result_report:=jsonb_build_object(
  'version',1,'runId',new.id,'createdAt',clock_timestamp(),'state',new.state,
  'source','saved_live_turns','transcriptVerified',false,'grade',null,'score',null,
  'counts',jsonb_build_object('plannedMainQuestions',jsonb_array_length(new.questions),
   'recordedTurns',jsonb_array_length(new.turns),'mainQuestions',v_main,'followups',v_followup,
   'completedAnswers',v_complete,'incompleteAnswers',v_partial,'emptyTranscripts',v_empty),
  'turns',new.turns,'pendingQuestion',v_pending,'nextPractice',v_review);
 return new;
end $$;
revoke all on function public.ip_live_result_report() from public,anon,authenticated;
grant execute on function public.ip_live_result_report() to service_role;
create trigger ip_live_save_result_report before insert or update on public.ip_live_runs
 for each row execute function public.ip_live_result_report();
-- Existing terminal records become readable reports without another AI call.
update public.ip_live_runs set state=state where state in ('completed','interrupted');
comment on column public.ip_live_runs.result_report is 'Server-generated factual report; unverified transcript, no grade. Same owner/retention access as run.';
commit;
