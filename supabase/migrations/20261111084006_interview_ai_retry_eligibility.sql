begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

-- One eligibility rule for status responses and the locked retry path.
create function public.ip_ai_retry_reason(p_status text,p_reason text,p_attempts integer,p_same_sources boolean)
returns text language sql immutable parallel safe security invoker set search_path='' as $$
 select case
  when p_status not in ('FAILED','NEEDS_INPUT','CANCELED')
    or (p_status='CANCELED' and p_reason is distinct from 'operator_resolved') then 'job_not_retryable'
  when p_same_sources and p_status='NEEDS_INPUT' then 'source_update_required'
  when p_same_sources and p_attempts>=2 then 'retry_limit'
  else null end
$$;
revoke all on function public.ip_ai_retry_reason(text,text,integer,boolean) from public,anon,authenticated;
grant execute on function public.ip_ai_retry_reason(text,text,integer,boolean) to service_role;

-- Patch the installed definitions, preserving intervening readiness/source migrations.
do $patch$
declare src text; old_text text; new_text text;
begin
 select replace(pg_get_functiondef('public.ip_ai_service(text,jsonb,jsonb)'::regprocedure),chr(13),'') into src;
 old_text:=$old$  perform ip_ai_admit(sid,jsonb_array_length(p_body->'itemKeys'));
  for q in select value from jsonb_array_elements(p_body->'itemKeys') loop
   select * into target from ip_ai_jobs where request_id=req.id and item_key=(q#>>'{}') for update;
   if not found then raise exception 'not_found'; end if;
   if target.status not in ('FAILED','NEEDS_INPUT','CANCELED')
     or (target.status='CANCELED' and target.reason is distinct from 'operator_resolved')
     or (coalesce(target.source_hash_override,req.source_hash)=sh and
       (target.status='NEEDS_INPUT' or target.attempts>=2))
     then raise exception 'unsafe_retry'; end if;$old$;
 new_text:=$new$  -- Lock and validate every selected item before admission or any write.
  for q in select value from jsonb_array_elements(p_body->'itemKeys') order by value::text loop
   select * into target from ip_ai_jobs where request_id=req.id and item_key=(q#>>'{}') for update;
   if not found then raise exception 'not_found'; end if;
   if public.ip_ai_retry_reason(target.status,target.reason,target.attempts,
      coalesce(target.source_hash_override,req.source_hash)=sh) is not null then
    return jsonb_build_object('ok',false,'error','unsafe_retry','retryReason',
     public.ip_ai_retry_reason(target.status,target.reason,target.attempts,
      coalesce(target.source_hash_override,req.source_hash)=sh));
   end if;
  end loop;
  perform ip_ai_admit(sid,jsonb_array_length(p_body->'itemKeys'));
  for q in select value from jsonb_array_elements(p_body->'itemKeys') loop
   select * into target from ip_ai_jobs where request_id=req.id and item_key=(q#>>'{}');$new$;
 if strpos(src,old_text)=0 then raise exception 'Expected locked AI retry guard'; end if;
 src:=replace(src,old_text,new_text);

 old_text:=$old$  v_source_version:=ip_ai_source_version(sid);
  select ip_ai_source_hash(jsonb_build_array(req.id,v_source_version,$old$;
 new_text:=$new$  v_source_version:=ip_ai_source_version(sid);
  if exists(select 1 from ip_ai_jobs where request_id=req.id and status in ('FAILED','NEEDS_INPUT','CANCELED')) then
   sh:=ip_ai_source_hash(ip_ai_sources(sid,req.kind));
  end if;
  select ip_ai_source_hash(jsonb_build_array(req.id,v_source_version,sh,$new$;
 if strpos(src,old_text)=0 then raise exception 'Expected AI status version'; end if;
 src:=replace(src,old_text,new_text);
 old_text:=$old$    'status',j.status,'reason',j.reason,
    'sourceHash',coalesce(j.source_hash_override,req.source_hash),$old$;
 new_text:=$new$    'status',j.status,'reason',j.reason,'attempts',j.attempts,
    'canRetry',public.ip_ai_retry_reason(j.status,j.reason,j.attempts,coalesce(j.source_hash_override,req.source_hash)=sh) is null,
    'retryReason',public.ip_ai_retry_reason(j.status,j.reason,j.attempts,coalesce(j.source_hash_override,req.source_hash)=sh),
    'sourceHash',coalesce(j.source_hash_override,req.source_hash),$new$;
 if strpos(src,old_text)=0 then raise exception 'Expected AI status items'; end if;
 execute replace(src,old_text,new_text);

 select replace(pg_get_functiondef('public.ip_ai_worker_service(text,text,jsonb)'::regprocedure),chr(13),'') into src;
 old_text:=$old$('dispatch_unknown','invalid_output','connection_unavailable','bundle_mismatch','canceled')$old$;
 if strpos(src,old_text)=0 then raise exception 'Expected worker failure reasons'; end if;
 src:=replace(src,old_text,$new$('dispatch_unknown','invalid_output','invalid_evidence','experience_required','generation_failed','connection_unavailable','bundle_mismatch','canceled')$new$);
 src:=replace(src,$old$p_body->>'reason'='invalid_output'$old$,
  $new$p_body->>'reason' in ('invalid_output','invalid_evidence','experience_required','generation_failed')$new$);
 old_text:=$old$   update ip_ai_executions set dispatch_state='INVALID',finished_at=now() where id=j.execution_id;$old$;
 if strpos(src,old_text)=0 then raise exception 'Expected worker terminal failure'; end if;
 src:=replace(src,old_text,old_text||E'\n   insert into ip_ai_events(request_id,job_id,actor,event) values(r.id,j.id,w.id::text,''failed:''||(p_body->>''reason''));');
 execute src;
end $patch$;
commit;
