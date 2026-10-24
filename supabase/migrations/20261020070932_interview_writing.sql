begin;
create table public.ip_writings (
 student_id text not null references public.ip_members(student_id) on delete cascade,
 kind text not null check(kind in ('introduction','motivation','core')),
 item_id text not null default '',
 prompt_snapshot text not null,
 body text not null check(length(body)<=10000),
 status text not null check(status in ('draft','saved','needs_revision','approved')),
 feedback text not null default '',
 revision integer not null default 1,
 updated_at timestamptz not null default now(),
 primary key(student_id,kind,item_id),
 check((kind='core' and length(item_id) between 1 and 120) or (kind<>'core' and item_id=''))
);
comment on table public.ip_writings is 'Student answers separate from source DB. Core prompt snapshot survives question archival/deletion; save validates currently published collection membership.';
alter table public.ip_writings enable row level security;
revoke all on public.ip_writings from public,anon,authenticated;
grant select,insert,update,delete on public.ip_writings to service_role;
create function public.ip_writing_service(p_action text,p_actor jsonb,p_body jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
 v_admin boolean:=coalesce(p_actor->>'type','')='admin';
 v_id text:=p_actor->>'id';v_target text;v_track text;
 v_kind text:=p_body->>'kind';v_item text:=coalesce(p_body->>'itemId','');
 v_status text:=p_body->>'status';v_prompt text;v_row ip_writings;
 v_revision integer:=coalesce((p_body->>'revision')::integer,0);
begin
 if coalesce(v_id,'')='' then raise exception 'unauthorized'; end if;
 if p_action in ('admin_writing_list','admin_writing_feedback') then
  if not v_admin then raise exception 'forbidden'; end if;
  v_target:=p_body->>'targetStudentId';
 elsif p_action in ('writing_list','writing_save') then
  if p_actor->>'type' is distinct from 'student' then raise exception 'forbidden'; end if;
  v_target:=v_id;
 else raise exception 'unsupported_action'; end if;
 select track into v_track from ip_members where student_id=v_target for update;
 if not found then raise exception 'student_unavailable'; end if;
 if not v_admin and not coalesce((ip_service('status',p_actor,'{}')->>'enabled')::boolean,false) then raise exception 'not_enrolled'; end if;
 if p_action in ('writing_list','admin_writing_list') then
  return jsonb_build_object('ok',true,'writings',(select coalesce(jsonb_agg(to_jsonb(w) order by w.kind,w.item_id),'[]') from ip_writings w where student_id=v_target));
 end if;
 if v_kind is null or v_kind not in ('introduction','motivation','core')
  or (v_kind='core' and length(v_item) not between 1 and 120) or (v_kind<>'core' and v_item<>'') then raise exception 'invalid_request'; end if;
 select * into v_row from ip_writings where student_id=v_target and kind=v_kind and item_id=v_item for update;
 if v_revision<>coalesce(v_row.revision,0) then raise exception 'revision_conflict'; end if;
 if p_action='admin_writing_feedback' then
  if v_row.student_id is null or v_row.status='draft' then raise exception 'not_submitted'; end if;
  if v_status is null or v_status not in ('needs_revision','approved') or jsonb_typeof(p_body->'feedback') is distinct from 'string'
   or length(btrim(p_body->>'feedback')) not between 1 and 8000 then raise exception 'invalid_request'; end if;
  update ip_writings set feedback=p_body->>'feedback',status=v_status,revision=revision+1,updated_at=now()
   where student_id=v_target and kind=v_kind and item_id=v_item returning * into v_row;
 else
  if v_status is null or v_status not in ('draft','saved') or jsonb_typeof(p_body->'text') is distinct from 'string'
   or length(p_body->>'text')>10000 or (v_status='saved' and length(btrim(p_body->>'text'))=0) then raise exception 'invalid_request'; end if;
  if v_kind='core' then
   select q.prompt into v_prompt from ip_questions q join ip_collection_items i on i.question_id=q.id
    where q.id=v_item and i.collection_id='core-personality-30' and q.category='personality' and q.status='published'
    and (cardinality(q.tracks)=0 or v_track=any(q.tracks)) for share of q;
   if not found then raise exception 'question_unavailable'; end if;
  else v_prompt:=case when v_kind='introduction' then '자기소개' else '지원동기' end; end if;
  insert into ip_writings(student_id,kind,item_id,prompt_snapshot,body,status)
   values(v_target,v_kind,v_item,v_prompt,p_body->>'text',v_status)
   on conflict(student_id,kind,item_id) do update set prompt_snapshot=excluded.prompt_snapshot,body=excluded.body,status=excluded.status,
    revision=ip_writings.revision+1,updated_at=now() returning * into v_row;
 end if;
 insert into ip_history(entity,entity_id,actor_id,snapshot,student_id)
  values('writing',v_target||':'||v_kind||':'||v_item,v_id,to_jsonb(v_row),v_target);
 return jsonb_build_object('ok',true,'writing',to_jsonb(v_row));
end;
$$;
revoke all on function public.ip_writing_service(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ip_writing_service(text,jsonb,jsonb) to service_role;
commit;
