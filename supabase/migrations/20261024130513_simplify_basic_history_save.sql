begin;

-- Retired fields remain readable in existing records, but do not block new input.
create or replace function public.ip_basic_complete(c jsonb) returns boolean
language sql immutable security invoker set search_path=public,pg_temp as $$
 select case when c ? 'basicInfo' then not exists(
  select 1 from unnest(array['school','major','clubs','volunteering','internships','company','role']) k
  where coalesce(c#>>array['basicInfo',k,'none'],'false')<>'true'
   and length(btrim(coalesce(c#>>array['basicInfo',k,'text'],'')))=0
 ) else length(btrim(coalesce(c->>'background','')))>0 end;
$$;

do $migration$
declare src text;
begin
 select pg_get_functiondef('public.ip_basic_validate(jsonb)'::regprocedure) into src;
 if strpos(src,'if k in (''name'',''birthDate'',''gender'') and not')=0
  and strpos(src,'if k in (''achievements'',''name'',''birthDate'',''gender'') and not')=0 then
  raise exception 'Expected applicant identity validation';
 end if;
 execute replace(src,'if k in (''name'',''birthDate'',''gender'') and not',
  'if k in (''achievements'',''name'',''birthDate'',''gender'') and not');

 select pg_get_functiondef('public.ip_life_service(text,jsonb,jsonb)'::regprocedure) into src;
 execute replace(src,'if v_status=''submitted'' and jsonb_array_length(v_content->v_section)=0',
  'if v_status=''submitted'' and v_section<>''affiliations'' and jsonb_array_length(v_content->v_section)=0');

 if to_regprocedure('public.ip_ai_readiness(text)') is not null then
  select pg_get_functiondef('public.ip_ai_readiness(text)'::regprocedure) into src;
  src:=replace(src,'array[''qualifications'',''affiliations'',''awards'',''experiences'']',
   'array[''qualifications'',''awards'',''experiences'']');
  if strpos(src,'-- Language tests do not require an issuer.')=0 then
   src:=replace(src,'foreach field in array fields loop',
    E'foreach field in array fields loop\n    -- Language tests do not require an issuer.\n    if section=''qualifications'' and field=''issuer'' and coalesce(rowdata->>''type'','''') ~ ''어학|외국어|언어'' then continue; end if;');
  end if;
  execute src;
 end if;
end $migration$;

revoke all on function public.ip_basic_complete(jsonb) from public,anon,authenticated;
grant execute on function public.ip_basic_complete(jsonb) to service_role;
commit;
