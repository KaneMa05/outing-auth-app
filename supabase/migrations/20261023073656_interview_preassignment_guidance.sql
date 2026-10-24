begin;
-- Private, versioned question instructions. Saving never invokes a diagnosis model.
create table public.ip_pa_guidance (
 unit_id text primary key references public.ip_pa_units(id),
 instructions text not null default '' check(length(instructions)<=10000),
 revision integer not null default 0 check(revision>=0),
 updated_by text,updated_at timestamptz
);
create table public.ip_pa_guidance_versions (
 unit_id text not null references public.ip_pa_units(id),
 revision integer not null check(revision>0),instructions text not null check(length(instructions)<=10000),
 updated_by text not null,updated_at timestamptz not null default now(),
 primary key(unit_id,revision)
);
alter table public.ip_pa_guidance enable row level security;
alter table public.ip_pa_guidance_versions enable row level security;
revoke all on public.ip_pa_guidance,public.ip_pa_guidance_versions from public,anon,authenticated;
grant select,insert,update on public.ip_pa_guidance to service_role;
grant select,insert on public.ip_pa_guidance_versions to service_role;

create function public.ip_pa_guidance_service(p_action text,p_actor jsonb,p_body jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare
 v_id text:=p_body->>'unitId';v_actor text:=p_actor->>'id';v_row ip_pa_guidance;
 v_text text;v_revision integer;v_page integer:=coalesce((p_body->>'page')::integer,0);
begin
 if coalesce(p_actor->>'type','')<>'admin' or coalesce(btrim(v_actor),'')='' then raise exception 'forbidden';end if;
 if p_action not in ('admin_guidance_list','admin_guidance_detail','admin_guidance_save','admin_guidance_history') then raise exception 'unsupported_action';end if;
 if v_page<0 or v_page>100000 then raise exception 'invalid_request';end if;
 if p_action='admin_guidance_list' then
  return jsonb_build_object('ok',true,'guidelines',(select jsonb_agg(jsonb_build_object('unit_id',u.id,'revision',coalesce(g.revision,0),'has_instructions',coalesce(g.instructions ~ '[^[:space:]]',false),'updated_by',g.updated_by,'updated_at',g.updated_at) order by u.position) from ip_pa_units u left join ip_pa_guidance g on g.unit_id=u.id));
 end if;
 if not exists(select 1 from ip_pa_units where id=v_id) then raise exception 'not_found';end if;
 if p_action='admin_guidance_save' then
  if jsonb_typeof(p_body->'instructions') is distinct from 'string' or length(p_body->>'instructions')>10000 or coalesce(p_body->>'revision','') !~ '^[0-9]{1,6}$' then raise exception 'invalid_request';end if;
  v_text:=p_body->>'instructions';v_revision:=(p_body->>'revision')::integer;
  insert into ip_pa_guidance(unit_id) values(v_id) on conflict do nothing;
  select * into v_row from ip_pa_guidance where unit_id=v_id for update;
  -- A retry of the same text reuses its version, without duplicating history.
  if v_row.instructions=v_text then return jsonb_build_object('ok',true,'guidance',to_jsonb(v_row));end if;
  if v_row.revision<>v_revision then raise exception 'revision_conflict';end if;
  update ip_pa_guidance set instructions=v_text,revision=revision+1,updated_by=v_actor,updated_at=now() where unit_id=v_id returning * into v_row;
  insert into ip_pa_guidance_versions(unit_id,revision,instructions,updated_by,updated_at) values(v_id,v_row.revision,v_text,v_actor,v_row.updated_at);
  return jsonb_build_object('ok',true,'guidance',to_jsonb(v_row));
 elsif p_action='admin_guidance_history' then
  return jsonb_build_object('ok',true,'versions',(select coalesce(jsonb_agg(x order by x.revision desc),'[]') from (select * from ip_pa_guidance_versions where unit_id=v_id order by revision desc limit 10 offset v_page*10) x),'total',(select count(*) from ip_pa_guidance_versions where unit_id=v_id));
 end if;
 select * into v_row from ip_pa_guidance where unit_id=v_id;
 return jsonb_build_object('ok',true,'guidance',case when v_row.unit_id is null then jsonb_build_object('unit_id',v_id,'instructions','','revision',0,'updated_at',null,'updated_by',null) else to_jsonb(v_row) end);
end;$$;
revoke all on function public.ip_pa_guidance_service(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ip_pa_guidance_service(text,jsonb,jsonb) to service_role;
commit;
