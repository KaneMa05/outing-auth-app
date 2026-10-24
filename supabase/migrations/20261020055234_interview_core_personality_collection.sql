begin;
create table public.ip_collections (
  id text primary key,
  title text not null,
  description text not null
);
create table public.ip_collection_items (
  collection_id text not null references public.ip_collections(id),
  question_id text not null references public.ip_questions(id) on delete cascade,
  kind text not null check(kind in ('main','appendix')),
  position integer not null check(position>0),
  element_ids text[] not null default '{}',
  analysis_note text not null,
  primary key(collection_id,question_id),
  unique(collection_id,kind,position)
);
create index ip_collection_question on public.ip_collection_items(question_id);
alter table public.ip_collections enable row level security;
alter table public.ip_collection_items enable row level security;
revoke all on public.ip_collections,public.ip_collection_items from public,anon,authenticated;
grant select,insert,update,delete on public.ip_collections,public.ip_collection_items to service_role;
create function public.ip_core_service(p_action text,p_actor jsonb,p_body jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  v_admin boolean:=coalesce(p_actor->>'type','')='admin';
  v_track text;
  v_rows jsonb;
  v_page integer:=greatest(0,least(100000,coalesce((p_body->>'page')::integer,0)));
begin
  if p_action='admin_core_questions' then
    if not v_admin or coalesce(p_actor->>'id','')='' then raise exception 'forbidden'; end if;
  elsif p_action='core_questions' then
    if v_admin then raise exception 'forbidden'; end if;
    -- Reuse the authoritative enrollment/expiry/feature/account checks.
    perform ip_service('bootstrap',p_actor,'{}'::jsonb);
    select track into v_track from ip_members where student_id=p_actor->>'id';
  else raise exception 'unsupported_action';
  end if;
  select coalesce(jsonb_agg(x order by x->>'kind' desc,(x->>'position')::integer),'[]') into v_rows from (
    select to_jsonb(q)||jsonb_build_object('kind',i.kind,'position',i.position,
        'source_count',(select count(*) from ip_occurrences o where o.question_id=q.id))||
        case when v_admin then jsonb_build_object('collection_element_ids',i.element_ids,'collection_analysis',i.analysis_note) else '{}'::jsonb end as x
    from ip_collection_items i join ip_questions q on q.id=i.question_id
    where i.collection_id='core-personality-30'
      and (v_admin or (q.category='personality' and q.status='published' and (cardinality(q.tracks)=0 or v_track=any(q.tracks))))
      and (coalesce(p_body->>'coreKind','')='' or i.kind=p_body->>'coreKind')
      and (coalesce(p_body->>'search','')='' or strpos(q.prompt,p_body->>'search')>0)
      and (coalesce(p_body->>'status','')='' or q.status=p_body->>'status')
    order by i.kind desc,i.position limit 30 offset v_page*30
  ) rows;
  return jsonb_build_object('ok',true,
    'collection',(select to_jsonb(c) from ip_collections c where id='core-personality-30'),
    'questions',v_rows);
end;
$$;
revoke all on function public.ip_core_service(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ip_core_service(text,jsonb,jsonb) to service_role;
commit;
