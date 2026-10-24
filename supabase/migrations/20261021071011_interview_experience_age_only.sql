begin;
-- Read legacy experience text without discarding it. Explicit new fields take precedence.
create or replace function public.ip_life_experience_text(r jsonb)
returns jsonb language sql immutable security invoker set search_path=public,pg_temp as $$
 select r || jsonb_build_object(
  'content',case when r ? 'content' then r->>'content' else concat_ws(E'\n\n',
   case when coalesce(r->>'period','')<>'' then '시기: '||(r->>'period') end,
   case when coalesce(r->>'affiliation','')<>'' then '소속: '||(r->>'affiliation') end,
   case when coalesce(r->>'situation','')<>'' then '상황: '||(r->>'situation') end,
   case when coalesce(r->>'action','')<>'' then '행동: '||(r->>'action') end,
   case when coalesce(r->>'result','')<>'' then '결과: '||(r->>'result') end) end,
  'appeal',case when r ? 'appeal' then r->>'appeal' else coalesce(r->>'learning','') end)
$$;
revoke all on function public.ip_life_experience_text(jsonb) from public,anon,authenticated;
grant execute on function public.ip_life_experience_text(jsonb) to service_role;

do $migration$
declare src text;
begin
 select pg_get_functiondef('public.ip_life_service(text,jsonb,jsonb)'::regprocedure) into src;
 src:=replace(src,chr(13),'');
 if strpos(src,'''content'',''appeal''')=0 then
  if strpos(src,'array[''id'',''year'',''age'',''satisfaction''')=0 then raise exception 'Apply life satisfaction first'; end if;
  src:=replace(src,'array[''id'',''year'',''age'',''satisfaction''','array[''id'',''content'',''appeal'',''year'',''age'',''satisfaction''');
  src:=replace(src,'v_key in (''year'',''age'',''satisfaction'')','v_key in (''content'',''appeal'',''year'',''age'',''satisfaction'',''period'',''affiliation'',''situation'',''action'',''result'',''learning'')');
  src:=replace(src,'length(v_row->>v_key)>2000','length(v_row->>v_key)>(case when v_section=''experiences'' and v_key=''content'' then 12000 else 2000 end)');
  src:=replace(src,$old$          if coalesce(v_row->>'year','')<>'' then
            if (v_row->>'year') !~ '^[0-9]{4}$' then raise exception 'invalid_experience_date'; end if;
            if (v_row->>'year')::int not between 1900 and extract(year from current_date)::int then raise exception 'invalid_experience_date'; end if;
          end if;
$old$,'');
  src:=replace(src,'(coalesce(v_row->>''year'','''')='''' or coalesce(v_row->>''age'','''')='''')','coalesce(v_row->>''age'','''')=''''');
  src:=replace(src,'foreach v_key in array array[''title'',''situation'',''action'',''result'',''learning''] loop','foreach v_key in array array[''title'',''content'',''appeal''] loop');
  src:=replace(src,'length(btrim(v_row->>v_key))=0','length(btrim(coalesce(ip_life_experience_text(v_row)->>v_key,'''')))=0');
  execute src;
 end if;
 if to_regprocedure('public.ip_ai_readiness(text)') is not null then
  select pg_get_functiondef('public.ip_ai_readiness(text)'::regprocedure) into src;
  src:=replace(src,'array[''year'',''age'',''title'',''situation'',''action'',''result'',''learning'']','array[''age'',''title'',''content'',''appeal'']');
  if strpos(src,'rowdata:=ip_life_experience_text(rowdata)')=0 then
   src:=replace(src,'idx:=idx+1;','idx:=idx+1; if section=''experiences'' then rowdata:=ip_life_experience_text(rowdata); end if;');
  end if;
  src:=replace(src,'when ''year'' then ''연도''','when ''content'' then ''내용'' when ''appeal'' then ''면접관에게 어필할 점''');
  execute src;
 end if;
 if to_regprocedure('public.ip_ai_sources(text,text)') is not null then
  select pg_get_functiondef('public.ip_ai_sources(text,text)'::regprocedure) into src;
  src:=replace(src,'array[''year'',''age'',''period'',''title'',''situation'',''action'',''result'',''learning'']','array[''age'',''title'',''content'',''appeal'']');
  if strpos(src,'rowdata:=ip_life_experience_text(rowdata)')=0 then
   src:=replace(src,'for kv in select key,value from jsonb_each_text(rowdata) where key=any(fields) loop','if section=''experiences'' then rowdata:=ip_life_experience_text(rowdata); end if; for kv in select key,value from jsonb_each_text(rowdata) where key=any(fields) loop');
  end if;
  execute src;
 end if;
 if to_regprocedure('public.ip_ai_service(text,jsonb,jsonb)') is not null then
  select pg_get_functiondef('public.ip_ai_service(text,jsonb,jsonb)'::regprocedure) into src;
  src:=replace(src,'like ''%:situation''','like ''%:content''');
  src:=replace(src,'like ''%:action''','like ''%:content''');
  src:=replace(src,'like ''%:result''','like ''%:appeal''');
  -- Different labels/ages/appeals do not turn copied content into distinct experiences.
  src:=replace(src,'in (''situation'',''action'',''result'')','in (''content'')');
  src:=replace(src,'having count(*)=3','having count(*)=1');
  execute src;
 end if;
end $migration$;
commit;
