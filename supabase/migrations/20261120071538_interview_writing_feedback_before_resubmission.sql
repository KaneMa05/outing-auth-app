begin;

-- Compute waiting state from the latest submitted round, never from the
-- working-copy status or feedback carried over from an older submission.
-- An administrator-hidden submission has been withdrawn from the review queue.
create or replace function public.ip_writing_awaiting_feedback(p_row public.ip_writings)
returns boolean language sql stable security invoker set search_path='' as $$
 select coalesce(p_row.submission_status='submitted',false) and not exists (
  select 1 from public.ip_writing_board_hidden h
  where h.student_id=p_row.student_id and h.kind=p_row.kind and h.item_id=p_row.item_id
   and h.submitted_revision=p_row.submitted_revision
 );
$$;
revoke all on function public.ip_writing_awaiting_feedback(public.ip_writings) from public,anon,authenticated;
grant execute on function public.ip_writing_awaiting_feedback(public.ip_writings) to service_role;

-- Keep the existing ownership, enrollment, revision, row-lock and idempotent
-- retry checks. Reject a new round before changing either the draft or history.
do $patch$
declare
 v_definition text:=pg_get_functiondef('public.ip_writing_service(text,jsonb,jsonb)'::regprocedure);
 v_list text:=$needle$jsonb_agg(to_jsonb(w) order by w.kind,w.item_id)$needle$;
 v_result text:=$needle$return jsonb_build_object('ok',true,'writing',to_jsonb(v_row));$needle$;
 v_insert text:=$needle$  insert into ip_writings(student_id,kind,item_id,prompt_snapshot,body,status)$needle$;
begin
 if (length(v_definition)-length(replace(v_definition,v_list,'')))/length(v_list)<>1
  or (length(v_definition)-length(replace(v_definition,v_result,'')))/length(v_result)<>2
  or (length(v_definition)-length(replace(v_definition,v_insert,'')))/length(v_insert)<>1
  or position('feedback_pending' in v_definition)>0 then
  raise exception 'Unexpected writing service before feedback gate';
 end if;
 v_definition:=replace(v_definition,v_list,$replacement$jsonb_agg((to_jsonb(w)||jsonb_build_object('awaiting_feedback',public.ip_writing_awaiting_feedback(w))) order by w.kind,w.item_id)$replacement$);
 v_definition:=replace(v_definition,v_result,$replacement$return jsonb_build_object('ok',true,'writing',to_jsonb(v_row)||jsonb_build_object('awaiting_feedback',public.ip_writing_awaiting_feedback(v_row)));$replacement$);
 v_definition:=replace(v_definition,v_insert,$guard$  if v_status='submitted' and public.ip_writing_awaiting_feedback(v_row) then
   raise exception 'feedback_pending';
  end if;
$guard$||v_insert);
 execute v_definition;
end $patch$;

commit;
