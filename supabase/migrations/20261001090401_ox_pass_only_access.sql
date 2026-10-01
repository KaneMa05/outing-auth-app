-- OX access is granted only through individual or cohort passes.
-- Keep existing purchases as audit data and preserve their current entitlement as passes.
set local lock_timeout='3s';
set local statement_timeout='30s';

create table public.ox_individual_passes (
 student_id text not null references public.students(id) on delete cascade,
 collection_id text not null check(collection_id in ('criminal-law','criminal-procedure-investigation-evidence','criminal-procedure-trial')),
 active boolean not null default true,
 origin text not null check(origin in ('manual','converted')),
 updated_by text not null,
 updated_at timestamptz not null default now(),
 primary key(student_id,collection_id)
);
alter table public.ox_individual_passes enable row level security;
revoke all on public.ox_individual_passes from public,anon,authenticated;
grant select,insert,update on public.ox_individual_passes to service_role;

insert into public.ox_individual_passes(student_id,collection_id,active,origin,updated_by,updated_at)
 select student_id,collection_id,true,'converted','migration:ox_pass_only',updated_at
 from public.ox_book_access where active and source='purchase' and purchase_date is not null;
insert into public.ox_book_access_history(student_id,collection_id,before_value,after_value,reason,actor)
 select p.student_id,p.collection_id,to_jsonb(b),to_jsonb(p),'기존 이용 권한을 이용권으로 전환','migration:ox_pass_only'
 from public.ox_individual_passes p join public.ox_book_access b using(student_id,collection_id);

create function public.ox_has_individual_pass(p_student text,p_collection text)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.ox_individual_passes where student_id=p_student and collection_id=p_collection and active)
$$;
create function public.ox_pass_status(p_student text,p_collection text)
returns text language sql stable security invoker set search_path='' as $$
 select case when public.ox_has_individual_pass(p_student,p_collection) or public.ox_has_grant(p_student,p_collection) then 'active'
   when exists(select 1 from public.ox_individual_passes where student_id=p_student and collection_id=p_collection)
     or exists(select 1 from public.ox_grant_recipients r join public.ox_grant_batches b on b.id=r.batch_id
       where r.student_id=p_student and b.state in ('issued','revoked') and p_collection=any(b.collection_ids)) then 'ended'
   else 'none' end
$$;
revoke all on function public.ox_has_individual_pass(text,text),public.ox_pass_status(text,text) from public,anon,authenticated;
grant execute on function public.ox_has_individual_pass(text,text),public.ox_pass_status(text,text) to service_role;

-- Preserve the current teacher exception, device policy and optimized grant logic.
do $patch$
declare signature text; definition text;
begin
 foreach signature in array array['public.ox_has_book(text,text)','public.ox_grant_admin(text,jsonb,jsonb)'] loop
   definition:=pg_get_functiondef(signature::regprocedure);
   if position('public.ox_has_purchased_book(' in definition)=0 then raise exception 'ox_pass_prerequisite_changed: %',signature; end if;
   definition:=replace(definition,'public.ox_has_purchased_book(','public.ox_has_individual_pass(');
   if signature='public.ox_grant_admin(text,jsonb,jsonb)' then definition:=replace(definition,' as purchased',' as individual'); end if;
   execute definition;
 end loop;
end $patch$;

create function public.ox_pass_admin(p_action text,p_actor jsonb,p_body jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 v_admin boolean:=coalesce(p_actor->>'type'='admin',false); v_student text:=p_actor->>'id';
 v_id text; v_book text; v_old jsonb; v_result jsonb; v_access_revision integer;
 v_book_row public.ox_individual_passes;
 v_page integer:=greatest(0,least(coalesce((p_body->>'page')::integer,0),10000));
begin
 if not v_admin or coalesce(v_student,'')='' then raise exception 'forbidden'; end if;
  if p_action='admin_members' then
    if p_body?'track' and (jsonb_typeof(p_body->'track') is distinct from 'string'
      or length(p_body->>'track')>200) then raise exception 'invalid_request'; end if;
    if p_body?'cohort' and (jsonb_typeof(p_body->'cohort') is distinct from 'string'
      or (p_body->>'cohort' not in ('','lecture','unassigned') and p_body->>'cohort' !~ '^[0-9]{1,2}$')) then
      raise exception 'invalid_request';
    end if;
    with eligible as (
      select s.id,s.name,s.class_name,s.student_category,s.is_active,
        public.ox_normalize_grant_track(s.track) as track,
        coalesce((select jsonb_agg(ids.lecture_id order by ids.normalized) from (
          select distinct on (normalized) lecture_id,normalized from (
            select btrim(a.lecture_id) as lecture_id,
              lower(regexp_replace(normalize(a.lecture_id,NFKC),'[[:space:]]','','g')) as normalized,0 as priority
            from public.lecture_applications a
            where a.approved_student_id=s.id and a.status='approved' and nullif(btrim(a.lecture_id),'') is not null
            union all
            select f.lecture_id_normalized,
              lower(regexp_replace(normalize(f.lecture_id_normalized,NFKC),'[[:space:]]','','g')),1
            from public.final_score_identities f where f.student_id=s.id
          ) linked order by normalized,priority,lecture_id
        ) ids),'[]'::jsonb) as lecture_ids,
        -- Internet students have no cohort; otherwise use the roster's explicit/legacy rule.
        case when s.student_category='lecture' then null
          when s.cohort between 1 and 99 then s.cohort::text
          when s.id ~ '^[0-9]{4,5}$' then left(s.id,length(s.id)-3)
          else null end as cohort,
        coalesce(m.allowed,false) as allowed,m.updated_at,m.updated_by,coalesce(m.access_revision,0) as access_revision,
        m.student_id is not null as registered,
        coalesce((select jsonb_agg(to_jsonb(b)-'student_id' order by b.collection_id) from public.ox_individual_passes b where b.student_id=s.id),'[]'::jsonb) as passes,
        coalesce((select jsonb_agg(g) from (values('criminal-law'),('criminal-procedure-investigation-evidence'),('criminal-procedure-trial'))g(id) where public.ox_has_grant(s.id,g.id)),'[]'::jsonb) as grants,
        (select jsonb_agg(jsonb_build_object('collection_id',c.id,'status',public.ox_pass_status(s.id,c.id)))
          from (values('criminal-law'),('criminal-procedure-investigation-evidence'),('criminal-procedure-trial')) c(id)) as scopes
      from public.students s left join public.ox_members m on m.student_id=s.id
      where s.account_type='student' and (s.is_active or m.student_id is not null)
    ), matched as (
      select e.* from eligible e
      where (not coalesce((p_body->>'registeredOnly')::boolean,true) or e.registered)
        and (coalesce(p_body->>'track','')='' or e.track=public.ox_normalize_grant_track(p_body->>'track')
          or (p_body->>'track'='unassigned' and e.track is null))
        and (coalesce(p_body->>'search','')='' or position(lower(p_body->>'search') in lower(e.name))>0 or e.id=p_body->>'search'
          or exists(select 1 from jsonb_array_elements_text(e.lecture_ids) as lid(value)
            where nullif(regexp_replace(normalize(p_body->>'search',NFKC),'[[:space:]]','','g'),'') is not null
              and position(lower(regexp_replace(normalize(p_body->>'search',NFKC),'[[:space:]]','','g'))
                in lower(regexp_replace(normalize(lid.value,NFKC),'[[:space:]]','','g')))>0))
        and (coalesce(p_body->>'collectionId','')='' or exists(select 1 from jsonb_array_elements(e.scopes)c where c->>'collection_id'=p_body->>'collectionId' and c->>'status'<>'none'))
        and (coalesce(p_body->>'bookStatus','')='' or exists(select 1 from jsonb_array_elements(e.scopes)c
          where (coalesce(p_body->>'collectionId','')='' or c->>'collection_id'=p_body->>'collectionId') and
          ((p_body->>'bookStatus'='active' and e.allowed and e.is_active and c->>'status'='active') or
           (p_body->>'bookStatus'='stopped' and c->>'status'<>'none' and (c->>'status'<>'active' or not e.allowed or not e.is_active)))))
        and (coalesce(p_body->>'cohort','')='' or e.cohort=p_body->>'cohort'
          or (p_body->>'cohort'='lecture' and e.student_category='lecture')
          or (p_body->>'cohort'='unassigned' and e.student_category<>'lecture' and e.cohort is null))
    )
    select jsonb_build_object('ok',true,'total',(select count(*) from matched),
      'tracks',coalesce((select jsonb_agg(t.track order by t.track) from (select distinct track from eligible e where track is not null
          and (coalesce(p_body->>'cohort','')='' or e.cohort=p_body->>'cohort'
            or (p_body->>'cohort'='lecture' and e.student_category='lecture')
            or (p_body->>'cohort'='unassigned' and e.student_category<>'lecture' and e.cohort is null)))t),'[]'::jsonb),
      'cohorts',coalesce((select jsonb_agg(c.cohort order by c.cohort::integer desc) from
        (select distinct cohort from eligible where cohort is not null)c),'[]'::jsonb),
      'items',coalesce((select jsonb_agg(to_jsonb(t)-'registered' order by t.name,t.id) from
        (select * from matched order by name,id limit 30 offset v_page*30)t),'[]'::jsonb)) into v_result;
    return v_result;
  end if;
  if p_action='admin_pass_set' then
    v_id:=p_body->>'memberId';
    if coalesce(v_id,'')='' or jsonb_typeof(p_body->'active') is distinct from 'boolean'
      or jsonb_typeof(p_body->'collectionIds') is distinct from 'array'
      or jsonb_typeof(p_body->'revision') is distinct from 'number'
      or length(trim(coalesce(p_body->>'reason',''))) not between 1 and 500 then raise exception 'invalid_request'; end if;
    if jsonb_array_length(p_body->'collectionIds') not between 1 and 3
      or exists(select 1 from jsonb_array_elements_text(p_body->'collectionIds') b(id)
        where id is null or id not in ('criminal-law','criminal-procedure-investigation-evidence','criminal-procedure-trial'))
      or (select count(distinct id) from jsonb_array_elements_text(p_body->'collectionIds') b(id))<>jsonb_array_length(p_body->'collectionIds') then raise exception 'invalid_request'; end if;
    perform pg_advisory_xact_lock(hashtextextended('ox-member:'||v_id,0));
    if not exists(select 1 from public.students where id=v_id and account_type='student'
      and (is_active or not (p_body->>'active')::boolean)) then raise exception 'student_unavailable'; end if;
    select coalesce((select access_revision from public.ox_members where student_id=v_id),0) into v_access_revision;
    if v_access_revision is distinct from (p_body->>'revision')::integer then raise exception 'access_conflict'; end if;
    if (p_body->>'active')::boolean and exists(select 1 from public.ox_individual_passes where student_id=v_id and active
      and collection_id in (select jsonb_array_elements_text(p_body->'collectionIds'))) then raise exception 'book_already_active'; end if;
    if not (p_body->>'active')::boolean and exists(select 1 from jsonb_array_elements_text(p_body->'collectionIds') b(id)
      where not public.ox_has_individual_pass(v_id,b.id)) then raise exception 'invalid_request'; end if;
    for v_book in select jsonb_array_elements_text(p_body->'collectionIds') loop
      select to_jsonb(b) into v_old from public.ox_individual_passes b where student_id=v_id and collection_id=v_book;
      insert into public.ox_individual_passes(student_id,collection_id,active,origin,updated_by)
        values(v_id,v_book,(p_body->>'active')::boolean,'manual',v_student)
        on conflict(student_id,collection_id) do update set active=excluded.active,
          origin=case when excluded.active then excluded.origin else ox_individual_passes.origin end,
          updated_by=excluded.updated_by,updated_at=now() returning * into v_book_row;
      insert into public.ox_book_access_history(student_id,collection_id,before_value,after_value,reason,actor)
        values(v_id,v_book,v_old,to_jsonb(v_book_row),trim(p_body->>'reason'),v_student);
    end loop;
    insert into public.ox_members(student_id,allowed,updated_by,access_revision)
      values(v_id,true,v_student,v_access_revision+1)
      on conflict(student_id) do update set access_revision=excluded.access_revision,updated_by=excluded.updated_by,updated_at=now();
    return jsonb_build_object('ok',true,'revision',v_access_revision+1);
  end if;

 raise exception 'unsupported_action';
end $$;
revoke all on function public.ox_pass_admin(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ox_pass_admin(text,jsonb,jsonb) to service_role;

-- During rollout, older API instances also issue passes instead of purchase entitlements.
do $patch$
declare definition text; old_branch text;
begin
 definition:=pg_get_functiondef('public.ox_service(text,jsonb,jsonb)'::regprocedure);
 old_branch:=substring(definition from $pattern$  if p_action='admin_book_set' then.*?(?=  -- Older admin clients)$pattern$);
 if old_branch is null then raise exception 'ox_service_purchase_branch_changed'; end if;
 definition:=replace(definition,old_branch,$new$  if p_action='admin_book_set' then return public.ox_pass_admin('admin_pass_set',p_actor,p_body); end if;
$new$);
 execute definition;
end $patch$;
