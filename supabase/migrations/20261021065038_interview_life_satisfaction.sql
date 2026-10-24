begin;
-- Extend the current service instead of replacing its enrollment/portal rules.
-- Optional satisfaction is the student's own reflection, never an AI score.
do $migration$
declare src text;
begin
 select pg_get_functiondef('public.ip_life_service(text,jsonb,jsonb)'::regprocedure) into src;
 if strpos(src,'''satisfaction''')=0 then
  if strpos(src,'array[''id'',''year'',''age'',''period''')=0 then raise exception 'Apply interview_experience_year_age first'; end if;
  src:=replace(src,'array[''id'',''year'',''age'',''period''','array[''id'',''year'',''age'',''satisfaction'',''period''');
  src:=replace(src,'v_key in (''year'',''age'')','v_key in (''year'',''age'',''satisfaction'')');
  src:=replace(src,'if coalesce(v_row->>''year'','''')<>'''' then',
   'if coalesce(v_row->>''satisfaction'','''')<>'''' and (v_row->>''satisfaction'') !~ ''^(-([1-9]|1[0-9]|2[0-5])|[0-9]|1[0-9]|2[0-5])$'' then raise exception ''invalid_satisfaction''; end if;
          if coalesce(v_row->>''year'','''')<>'''' then');
  if strpos(src,'invalid_satisfaction')=0 then raise exception 'Unexpected life validation definition'; end if;
 end if;
 -- Also update a local preview that previously used the narrower scale.
 src:=replace(src,'^(-[1-5]|[0-5])$','^(-([1-9]|1[0-9]|2[0-5])|[0-9]|1[0-9]|2[0-5])$');
 execute src;
end $migration$;
revoke all on function public.ip_life_service(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ip_life_service(text,jsonb,jsonb) to service_role;
commit;
