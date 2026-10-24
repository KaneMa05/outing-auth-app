begin;
-- Optional nested value: old profiles and older clients remain valid.
do $migration$
declare src text;
begin
 select pg_get_functiondef('public.ip_basic_validate(jsonb)'::regprocedure) into src;
 if strpos(src,'if exists(select 1 from jsonb_object_keys(r) x where x not in (''text'',''none'')) then return false;end if;')=0 then
  raise exception 'Expected basic field validation';
 end if;
 src:=replace(src,
  'if exists(select 1 from jsonb_object_keys(r) x where x not in (''text'',''none'')) then return false;end if;',
  'if exists(select 1 from jsonb_object_keys(r) x where x not in (''text'',''none'') and not (k=''school'' and x=''status'')) then return false;end if;
  if k=''school'' and r ? ''status'' then
   if jsonb_typeof(r->''status'') is distinct from ''string'' or r->>''status'' not in ('''',''graduated'',''enrolled'',''leave'') then return false;end if;
  end if;');
 execute src;

 select pg_get_functiondef('public.ip_basic_text(jsonb)'::regprocedure) into src;
 if strpos(src,'end loop;return result;')=0 then raise exception 'Expected basic text formatter';end if;
 src:=replace(src,'end loop;return result;',
  'if k=''school'' and coalesce(c#>>''{basicInfo,school,none}'',''false'')<>''true'' then
   result:=result||case c#>>''{basicInfo,school,status}'' when ''graduated'' then '' · 졸업'' when ''enrolled'' then '' · 재학'' when ''leave'' then '' · 휴학'' else '''' end;
  end if;
 end loop;return result;');
 execute src;
end $migration$;
-- Issuer is no longer collected for qualifications; retained values remain readable.
do $migration$
declare src text;
begin
 if to_regprocedure('public.ip_ai_readiness(text)') is not null then
  select pg_get_functiondef('public.ip_ai_readiness(text)'::regprocedure) into src;
  if strpos(src,'when ''qualifications'' then array[''type'',''date'',''name'',''issuer'',''effort'']')=0 then
   raise exception 'Expected qualification readiness fields';
  end if;
  execute replace(src,
   'when ''qualifications'' then array[''type'',''date'',''name'',''issuer'',''effort'']',
   'when ''qualifications'' then array[''type'',''date'',''name'',''effort'']');
 end if;
end $migration$;
-- CREATE OR REPLACE preserves existing service-role-only privileges and invoker security.
commit;
