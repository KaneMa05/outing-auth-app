begin;
do $patch$
declare definition text:=pg_get_functiondef('public.ip_live_usage_service(text,jsonb,jsonb)'::regprocedure);
 old_text text:='p_actor->>''type'' in (''admin'',''server'') or (p_actor->>''type''=''student'' and p_actor->>''id''=owner_id)';
begin
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then raise exception 'unexpected_usage_access_definition';end if;
 execute replace(definition,old_text,'p_actor->>''type'' in (''admin'',''server'')');
end $patch$;
commit;
