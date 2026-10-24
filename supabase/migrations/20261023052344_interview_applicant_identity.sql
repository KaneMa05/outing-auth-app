begin;
-- Optional identity fields use the existing owner-scoped life profile and revisions.
-- Keep writing readiness and AI source text based on the existing eight history fields.
create or replace function public.ip_basic_validate(c jsonb) returns boolean
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare k text; r jsonb; v text; birthday date;
begin
 if not c ? 'basicInfo' then return true;end if;
 if jsonb_typeof(c->'basicInfo') is distinct from 'object' then return false;end if;
 if exists(select 1 from jsonb_object_keys(c->'basicInfo') x where x not in ('school','major','clubs','volunteering','internships','company','role','achievements','name','birthDate','gender')) then return false;end if;
 foreach k in array array['school','major','clubs','volunteering','internships','company','role','achievements','name','birthDate','gender'] loop
  if k in ('name','birthDate','gender') and not ((c->'basicInfo') ? k) then continue;end if;
  r:=c->'basicInfo'->k;
  if jsonb_typeof(r) is distinct from 'object' then return false;end if;
  if jsonb_typeof(r->'text') is distinct from 'string' or length(r->>'text')>2000 or jsonb_typeof(r->'none') is distinct from 'boolean' then return false;end if;
  if exists(select 1 from jsonb_object_keys(r) x where x not in ('text','none')) then return false;end if;
  v:=r->>'text';
  if k in ('name','birthDate','gender') and (r->>'none')::boolean then return false;end if;
  if k='name' and length(v)>100 then return false;end if;
  if k='gender' and v not in ('','male','female','undisclosed') then return false;end if;
  if k='birthDate' and v<>'' then
   if v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return false;end if;
   begin
    birthday:=make_date(substring(v,1,4)::integer,substring(v,6,2)::integer,substring(v,9,2)::integer);
   exception when datetime_field_overflow then return false;
   end;
   if birthday>current_date then return false;end if;
  end if;
 end loop;
 return true;
end;$$;
revoke all on function public.ip_basic_validate(jsonb) from public,anon,authenticated;
grant execute on function public.ip_basic_validate(jsonb) to service_role;
commit;
