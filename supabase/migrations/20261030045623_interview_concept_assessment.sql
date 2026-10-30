-- Optional reviewed concept criteria. No existing criterion is converted.
begin;
create function public.ip_validate_concept_rules() returns trigger
language plpgsql security invoker set search_path='' as $$
declare c jsonb; a jsonb; item jsonb; examples jsonb; example jsonb; count_items integer:=0; seen text[]; label text;
begin
 for c in select value from jsonb_array_elements(new.criteria) loop
  if not (c ? 'assessment') then continue; end if;
  a:=c->'assessment';
  if new.kind<>'job_knowledge' or jsonb_typeof(a) is distinct from 'object' then raise exception 'invalid_request'; end if;
  if (select count(*) from jsonb_object_keys(a))<>5 or exists(select 1 from jsonb_object_keys(a) k where k not in ('mode','match','concepts','acceptedExamples','rejectedExamples'))
   or a->>'mode' is distinct from 'concept' or coalesce(a->>'match','') not in ('all','any')
   or jsonb_typeof(a->'concepts') is distinct from 'array' then raise exception 'invalid_request'; end if;
  if jsonb_array_length(a->'concepts') not between 1 and 5 then raise exception 'invalid_request'; end if;
  count_items:=count_items+jsonb_array_length(a->'concepts');seen:=array[]::text[];
  for item in select value from jsonb_array_elements(a->'concepts') loop
   if jsonb_typeof(item) is distinct from 'object' then raise exception 'invalid_request'; end if;
   if (select count(*) from jsonb_object_keys(item))<>4 or exists(select 1 from jsonb_object_keys(item) k where k not in ('claim','relation','partial','reject'))
    or jsonb_typeof(item->'claim') is distinct from 'string' or length(btrim(item->>'claim')) not between 1 and 1000
    or jsonb_typeof(item->'reject') is distinct from 'string' or length(btrim(item->>'reject')) not between 1 and 1000
    or jsonb_typeof(item->'relation') is distinct from 'string' or length(item->>'relation')>1000
    or jsonb_typeof(item->'partial') is distinct from 'string' or length(item->>'partial')>1000 then raise exception 'invalid_request'; end if;
   label:=lower(btrim(normalize(item->>'claim',NFC)));if label=any(seen) then raise exception 'invalid_request'; end if;seen:=array_append(seen,label);
  end loop;
  foreach label in array array['acceptedExamples','rejectedExamples'] loop
   examples:=a->label;if jsonb_typeof(examples) is distinct from 'array' then raise exception 'invalid_request'; end if;
   if jsonb_array_length(examples)>5 then raise exception 'invalid_request'; end if;
   for example in select value from jsonb_array_elements(examples) loop
    if jsonb_typeof(example) is distinct from 'string' or length(btrim(example#>>'{}')) not between 1 and 1000 then raise exception 'invalid_request'; end if;
   end loop;
  end loop;
 end loop;
 if count_items>30 or (count_items>0 and octet_length(new.criteria::text)>200000) then raise exception 'invalid_request'; end if;
 return new;
end $$;
revoke all on function public.ip_validate_concept_rules() from public,anon,authenticated;
grant execute on function public.ip_validate_concept_rules() to service_role;
create trigger ip_rubric_concept_rules before insert or update of criteria,kind on public.ip_question_rubrics
for each row execute function public.ip_validate_concept_rules();
comment on function public.ip_validate_concept_rules() is 'Opt-in concept rubric shape; unchanged keyword rules and human review requirements remain in force.';
commit;
