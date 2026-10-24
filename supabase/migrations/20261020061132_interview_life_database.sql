begin;
create table public.ip_life_competencies (
  id text primary key,
  position integer not null unique,
  title text not null,
  definition text not null,
  questions text[] not null,
  element_ids text[] not null,
  source jsonb not null
);
create table public.ip_life_profiles (
  student_id text primary key references public.ip_members(student_id) on delete cascade,
  content jsonb not null check(jsonb_typeof(content)='object' and octet_length(content::text)<=160000),
  status text not null check(status in ('draft','submitted','needs_revision','approved')),
  feedback text not null default '',
  revision integer not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.ip_life_competencies enable row level security;
alter table public.ip_life_profiles enable row level security;
revoke all on public.ip_life_competencies,public.ip_life_profiles from public,anon,authenticated;
grant select,insert,update,delete on public.ip_life_competencies,public.ip_life_profiles to service_role;
comment on table public.ip_life_profiles is 'Personality source material from the life DB worksheet; not an official competency score. Server-only verified actor access.';

create function public.ip_life_service(p_action text,p_actor jsonb,p_body jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  v_admin boolean:=coalesce(p_actor->>'type','')='admin';
  v_id text:=p_actor->>'id';
  v_target text;
  v_profile ip_life_profiles;
  v_content jsonb:=p_body->'content';
  v_section text;
  v_row jsonb;
  v_key text;
  v_keys text[];
  v_ids text[]:='{}';
  v_count integer:=0;
  v_status text:=p_body->>'status';
  v_revision integer:=coalesce((p_body->>'revision')::integer,0);
begin
  if coalesce(v_id,'')='' then raise exception 'unauthorized'; end if;
  if p_action in ('admin_life_get','admin_life_feedback') then
    if not v_admin then raise exception 'forbidden'; end if;
    v_target:=p_body->>'targetStudentId';
  elsif p_action in ('life_get','life_save') then
    if v_admin or p_actor->>'type' is distinct from 'student' then raise exception 'forbidden'; end if;
    if not coalesce((ip_service('status',p_actor,'{}')->>'enabled')::boolean,false) then raise exception 'not_enrolled'; end if;
    v_target:=v_id;
  else raise exception 'unsupported_action';
  end if;
  -- Serialize first inserts and edits, including enrollment changes, on the owner.
  perform 1 from ip_members where student_id=v_target for update;
  if not found then raise exception 'student_unavailable'; end if;
  if not v_admin and not coalesce((ip_service('status',p_actor,'{}')->>'enabled')::boolean,false) then raise exception 'not_enrolled'; end if;
  select * into v_profile from ip_life_profiles where student_id=v_target for update;
  if p_action in ('life_get','admin_life_get') then
    return jsonb_build_object('ok',true,'profile',case when v_profile.student_id is null then null else to_jsonb(v_profile) end,
      'member',(select jsonb_build_object('student_id',m.student_id,'track',m.track,'exam_number',m.exam_number,'name',s.name)
        from ip_members m join students s on s.id=m.student_id where m.student_id=v_target),
      'competencies',(select coalesce(jsonb_agg(to_jsonb(c) order by c.position),'[]') from ip_life_competencies c),
      'elements',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'topic_id',e.topic_id)),'[]') from ip_elements e));
  end if;
  if v_revision<>coalesce(v_profile.revision,0) then raise exception 'revision_conflict'; end if;
  if p_action='admin_life_feedback' then
    if v_profile.student_id is null or v_profile.status='draft' then raise exception 'not_submitted'; end if;
    if v_status is null or v_status not in ('needs_revision','approved') or jsonb_typeof(p_body->'feedback') is distinct from 'string'
      or length(btrim(p_body->>'feedback')) not between 1 and 8000 then raise exception 'invalid_request'; end if;
    update ip_life_profiles set feedback=p_body->>'feedback',status=v_status,revision=revision+1,updated_at=now()
      where student_id=v_target returning * into v_profile;
  else
    if v_status is null or v_status not in ('draft','submitted') or jsonb_typeof(v_content) is distinct from 'object'
      or octet_length(v_content::text)>160000 then raise exception 'invalid_request'; end if;
    if exists(select 1 from jsonb_object_keys(v_content) k where k not in ('background','qualifications','affiliations','awards','experiences','none'))
      or jsonb_typeof(v_content->'background') is distinct from 'string' or length(v_content->>'background')>2000
      or jsonb_typeof(v_content->'none') is distinct from 'array' then raise exception 'invalid_request'; end if;
    if jsonb_array_length(v_content->'none')>3 or exists(select 1 from jsonb_array_elements(v_content->'none') n
      where jsonb_typeof(n)<>'string' or n#>>'{}' not in ('qualifications','affiliations','awards'))
      then raise exception 'invalid_request'; end if;
    foreach v_section in array array['qualifications','affiliations','awards','experiences'] loop
      if jsonb_typeof(v_content->v_section) is distinct from 'array' then raise exception 'invalid_request'; end if;
      v_count:=v_count+jsonb_array_length(v_content->v_section);
      if v_count>80 or jsonb_array_length(v_content->v_section)>40 then raise exception 'invalid_request'; end if;
      if (v_content->'none') ? v_section and jsonb_array_length(v_content->v_section)>0 then raise exception 'invalid_request'; end if;
      v_keys:=case v_section
        when 'qualifications' then array['id','type','date','name','issuer','effort']
        when 'affiliations' then array['id','type','name','period','role','activities']
        when 'awards' then array['id','date','name','issuer','rank','contribution','action']
        else array['id','period','affiliation','title','situation','action','result','learning','competencyIds'] end;
      for v_row in select value from jsonb_array_elements(v_content->v_section) loop
        if jsonb_typeof(v_row) is distinct from 'object' then raise exception 'invalid_request'; end if;
        if exists(select 1 from jsonb_object_keys(v_row) k where not k=any(v_keys)) then raise exception 'invalid_request'; end if;
        foreach v_key in array v_keys loop
          if v_key='competencyIds' then continue; end if;
          if jsonb_typeof(v_row->v_key) is distinct from 'string' or length(v_row->>v_key)>2000 then raise exception 'invalid_request'; end if;
        end loop;
        if (v_row->>'id') !~ '^[a-zA-Z0-9_-]{1,80}$' or (v_row->>'id')=any(v_ids) then raise exception 'invalid_request'; end if;
        v_ids:=array_append(v_ids,v_row->>'id');
        if v_section='awards' and v_row->>'contribution'<>'' then
          if (v_row->>'contribution') !~ '^[0-9]{1,3}$' then raise exception 'invalid_request'; end if;
          if (v_row->>'contribution')::int>100 then raise exception 'invalid_request'; end if;
        end if;
        if v_section='experiences' then
          if jsonb_typeof(v_row->'competencyIds') is distinct from 'array' then raise exception 'invalid_request'; end if;
          if jsonb_array_length(v_row->'competencyIds')>30 or exists(
            select 1 from jsonb_array_elements(v_row->'competencyIds') n
            where jsonb_typeof(n)<>'string' or not exists(select 1 from ip_life_competencies c where c.id=n#>>'{}'))
            then raise exception 'invalid_request'; end if;
        end if;
        if v_status='submitted' then
          if v_section='experiences' then
            foreach v_key in array array['period','title','situation','action','result','learning'] loop
              if length(btrim(v_row->>v_key))=0 then raise exception 'incomplete_life'; end if;
            end loop;
          elsif length(btrim(v_row->>'name'))=0 then raise exception 'incomplete_life'; end if;
        end if;
      end loop;
      if v_status='submitted' and jsonb_array_length(v_content->v_section)=0 and not (v_content->'none') ? v_section
        then raise exception 'incomplete_life'; end if;
    end loop;
    if v_status='submitted' and length(btrim(v_content->>'background'))=0 then raise exception 'incomplete_life'; end if;
    insert into ip_life_profiles(student_id,content,status) values(v_target,v_content,v_status)
      on conflict(student_id) do update set content=excluded.content,status=excluded.status,
      revision=ip_life_profiles.revision+1,updated_at=now() returning * into v_profile;
  end if;
  insert into ip_history(entity,entity_id,actor_id,snapshot,student_id)
    values('life_profile',v_target,v_id,to_jsonb(v_profile),v_target);
  return jsonb_build_object('ok',true,'profile',to_jsonb(v_profile));
end;
$$;
revoke all on function public.ip_life_service(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ip_life_service(text,jsonb,jsonb) to service_role;
commit;
