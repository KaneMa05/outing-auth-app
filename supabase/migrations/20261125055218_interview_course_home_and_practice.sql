begin;
set local lock_timeout='1s';
set local statement_timeout='15s';

-- Home exposes only an active member's own enrollment summary. Interview
-- topics, notes, writing, and question RPCs retain their existing product gate.
do $migration$
declare source text; original text; replacement text;
begin
 source:=replace(pg_get_functiondef('public.ip_service(text,jsonb,jsonb)'::regprocedure),E'\r\n',E'\n');
 original:=$old$    if p_action='status' then$old$;
 replacement:=$new$    if p_action='home' then
      if not coalesce(v_enabled and v_member.enabled and
        (v_member.expires_on is null or v_member.expires_on>=current_date),false) then raise exception 'not_enrolled'; end if;
      return jsonb_build_object('ok',true,'member',jsonb_build_object(
        'track',v_member.track,'exam_number',v_member.exam_number,'access_product',v_member.access_product));
    end if;
    if p_action='status' then$new$;
 if (length(source)-length(replace(source,original,'')))/length(original)<>1 then
  raise exception 'Unexpected status branch: review student home migration';
 end if;
 execute replace(source,original,replacement);

 -- The existing beta menu already permits interview-only members. Align the
 -- archive's sync/upload/get gate, retaining test flags, mode, expiry and owner checks.
 source:=replace(pg_get_functiondef('public.ip_practice_service(text,jsonb,jsonb)'::regprocedure),E'\r\n',E'\n');
 original:=$old$m.access_product='interview_package'$old$;
 replacement:=$new$m.access_product in ('interview_package','interview_only') and public.ip_termination_scope(m.student_id)='active'$new$;
 if (length(source)-length(replace(source,original,'')))/length(original)<>1 then
  raise exception 'Unexpected practice product gate: review student home migration';
 end if;
 execute replace(source,original,replacement);
end;
$migration$;
commit;
