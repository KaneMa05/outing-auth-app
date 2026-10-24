begin;
-- Interview-only identities never become offline/lecture students.
create table public.ip_owners (
 id text primary key,
 legacy_student_id text unique references public.students(id) on delete cascade,
 name text not null,
 active boolean not null default true,
 created_at timestamptz not null default now(),
 check(legacy_student_id is null or id=legacy_student_id)
);
insert into public.ip_owners(id,legacy_student_id,name)
 select distinct s.id,s.id,s.name from students s
 where exists(select 1 from ip_members m where m.student_id=s.id)
 or exists(select 1 from ip_history h where h.student_id=s.id);
create view public.ip_student_directory with(security_invoker=true) as
 select s.id,s.name,s.is_active,s.account_type from public.students s
 union all select o.id,o.name,o.active,'student'::text from public.ip_owners o where o.legacy_student_id is null;
revoke all on public.ip_student_directory from public,anon,authenticated;
grant select on public.ip_student_directory to service_role;
alter table public.ip_members drop constraint ip_members_student_id_fkey;
alter table public.ip_members add foreign key(student_id) references public.ip_owners(id) on delete cascade;
alter table public.ip_history drop constraint ip_history_student_id_fkey;
alter table public.ip_history add foreign key(student_id) references public.ip_owners(id) on delete cascade;
create function public.ip_ensure_owner() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 insert into ip_owners(id,legacy_student_id,name)
 select id,id,name from students where id=new.student_id on conflict(id) do nothing;
 return new;
end;
$$;
create trigger ip_members_owner before insert on public.ip_members for each row execute function public.ip_ensure_owner();
revoke all on function public.ip_ensure_owner() from public,anon,authenticated;
grant execute on function public.ip_ensure_owner() to service_role;
-- Change only the interview directory reads. No existing student categories,
-- student login functions, roster queries or personal-data IDs are changed.
do $$
declare src text;
begin
 select pg_get_functiondef('public.ip_service(text,jsonb,jsonb)'::regprocedure) into src;
 if strpos(src,'join students s')=0 or strpos(src,'from students where')=0 or strpos(src,'from students s')=0 then
  raise exception 'Unexpected ip_service definition: review directory migration';
 end if;
 src:=replace(replace(replace(src,'join students s','join ip_student_directory s'),'from students where','from ip_student_directory where'),'from students s','from ip_student_directory s');
 execute src;
 select pg_get_functiondef('public.ip_life_service(text,jsonb,jsonb)'::regprocedure) into src;
 if strpos(src,'join students s')=0 then raise exception 'Unexpected ip_life_service definition'; end if;
 execute replace(src,'join students s','join ip_student_directory s');
end;
$$;
create table public.ip_web_identities (
 id uuid primary key default gen_random_uuid(),
 app_id text not null,
 subject text not null,
 owner_id text unique references public.ip_owners(id) on delete cascade,
 created_at timestamptz not null default now(),
 unique(app_id,subject)
);
create table public.ip_web_sessions (
 token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),
 identity_id uuid references public.ip_web_identities(id) on delete cascade,
 owner_id text references public.ip_owners(id) on delete cascade,
 expires_at timestamptz not null default now()+interval '7 days',
 created_at timestamptz not null default now(),
 check(identity_id is not null or owner_id is not null)
);
create index ip_web_sessions_identity on public.ip_web_sessions(identity_id);
create index ip_web_sessions_owner on public.ip_web_sessions(owner_id);
create index ip_web_sessions_expiry on public.ip_web_sessions(expires_at);
create table public.ip_oauth_states (
 state_hash text primary key,
 browser_hash text not null,
 intent text not null check(intent in ('login','link')),
 session_hash text,
 expires_at timestamptz not null default now()+interval '10 minutes'
);
create table public.ip_login_limits (
 key_hash text primary key,
 attempts integer not null,
 window_start timestamptz not null default now()
);
create table public.ip_applications (
 id uuid primary key default gen_random_uuid(),
 owner_id text not null unique references public.ip_owners(id) on delete cascade,
 name text not null check(length(name) between 1 and 80),
 track text not null check(track in ('공채','항해','기관','방제','관제','기타')),
 exam_number text not null check(length(exam_number) between 1 and 80),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 review_note text not null default '',
 reviewed_by text,
 reviewed_at timestamptz,
 revision integer not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index ip_applications_queue on public.ip_applications(status,created_at,id);
do $$ declare t text; begin
 foreach t in array array['ip_owners','ip_web_identities','ip_web_sessions','ip_oauth_states','ip_login_limits','ip_applications'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to service_role',t);
 end loop;
end; $$;

create function public.ip_web_session(p_hash text) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('identityId',s.identity_id,'ownerId',coalesce(i.owner_id,s.owner_id),'name',d.name,
   'linked',s.identity_id is not null or exists(select 1 from ip_web_identities linked where linked.owner_id=o.id),
   'legacy',o.legacy_student_id is not null)
 from ip_web_sessions s left join ip_web_identities i on i.id=s.identity_id
 left join ip_owners o on o.id=coalesce(i.owner_id,s.owner_id)
 left join ip_student_directory d on d.id=o.id
 where s.token_hash=p_hash and s.expires_at>now()
 and (coalesce(i.owner_id,s.owner_id) is null or (o.active and d.is_active and d.account_type='student'))
$$;
revoke all on function public.ip_web_session(text) from public,anon,authenticated;
grant execute on function public.ip_web_session(text) to service_role;

create function public.ip_portal_service(p_action text,p_actor jsonb,p_body jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
 v_session jsonb;
 v_owner text;
 v_identity ip_web_identities;
 v_state ip_oauth_states;
 v_app ip_applications;
 v_name text;
 v_count integer;
 v_result jsonb;
 v_revision integer:=coalesce((p_body->>'revision')::int,0);
begin
 if p_action like 'admin_%' then
  if p_actor->>'type' is distinct from 'admin' or coalesce(p_actor->>'id','')='' then raise exception 'forbidden'; end if;
 elsif p_actor->>'type' is distinct from 'server' then raise exception 'forbidden'; end if;
 if p_action='rate' then
  delete from ip_login_limits where window_start<now()-interval '1 day';
  insert into ip_login_limits(key_hash,attempts) values(p_body->>'key',1)
   on conflict(key_hash) do update set
   attempts=case when ip_login_limits.window_start<now()-interval '15 minutes' then 1 else ip_login_limits.attempts+1 end,
   window_start=case when ip_login_limits.window_start<now()-interval '15 minutes' then now() else ip_login_limits.window_start end
   returning attempts into v_count;
  return jsonb_build_object('ok',true,'allowed',v_count<=least(300,greatest(1,(p_body->>'limit')::int)));
 elsif p_action='oauth_start' then
  if p_body->>'intent'='link' then
   v_session:=ip_web_session(p_body->>'sessionHash');
   if v_session->>'ownerId' is null then raise exception 'unauthorized'; end if;
  end if;
  delete from ip_oauth_states where expires_at<=now();
  insert into ip_oauth_states(state_hash,browser_hash,intent,session_hash)
   values(p_body->>'stateHash',p_body->>'browserHash',p_body->>'intent',p_body->>'sessionHash');
  return jsonb_build_object('ok',true);
 elsif p_action='oauth_consume' then
  delete from ip_oauth_states where state_hash=p_body->>'stateHash' and browser_hash=p_body->>'browserHash' and expires_at>now()
    returning * into v_state;
  if v_state.state_hash is null then raise exception 'oauth_state_invalid'; end if;
  return jsonb_build_object('ok',true,'intent',v_state.intent,'sessionHash',v_state.session_hash);
 elsif p_action='oauth_login' then
  insert into ip_web_identities(app_id,subject) values(p_body->>'appId',p_body->>'subject')
   on conflict(app_id,subject) do nothing;
  select * into v_identity from ip_web_identities where app_id=p_body->>'appId' and subject=p_body->>'subject' for update;
  if p_body->>'intent'='link' then
   v_session:=ip_web_session(p_body->>'sessionHash');v_owner:=v_session->>'ownerId';
   if v_owner is null then raise exception 'unauthorized'; end if;
   if v_identity.owner_id is not null and v_identity.owner_id<>v_owner then raise exception 'account_already_linked'; end if;
   if exists(select 1 from ip_web_identities where owner_id=v_owner and id<>v_identity.id) then raise exception 'account_already_linked'; end if;
   update ip_web_identities set owner_id=v_owner where id=v_identity.id;
  end if;
  insert into ip_web_sessions(token_hash,identity_id) values(p_body->>'newHash',v_identity.id);
  delete from ip_web_sessions where token_hash=p_body->>'sessionHash' or expires_at<=now();
  return jsonb_build_object('ok',true);
 elsif p_action='legacy_login' then
  -- Never claim an unregistered/null-password student by entering a new password.
  select s.id,s.name into v_owner,v_name from students s
   where s.id=p_body->>'studentId' and s.is_active and s.account_type='student'
   and s.password_hash is not null and s.password_hash<>''
   and (s.password_hash=p_body->>'passwordHash' or s.password_hash=p_body->>'legacyPasswordHash');
  if v_owner is null then raise exception 'unauthorized'; end if;
  insert into ip_owners(id,legacy_student_id,name) values(v_owner,v_owner,v_name) on conflict(id) do nothing;
  v_session:=ip_web_session(p_body->>'sessionHash');
  if p_body->>'intent'='link' then
   if v_session->>'identityId' is null then raise exception 'unauthorized'; end if;
   select * into v_identity from ip_web_identities where id=(v_session->>'identityId')::uuid for update;
   if v_identity.owner_id is not null and v_identity.owner_id<>v_owner then raise exception 'account_already_linked'; end if;
   if exists(select 1 from ip_web_identities where owner_id=v_owner and id<>v_identity.id) then raise exception 'account_already_linked'; end if;
   update ip_web_identities set owner_id=v_owner where id=v_identity.id;
  end if;
  insert into ip_web_sessions(token_hash,owner_id,identity_id) values(p_body->>'newHash',v_owner,v_identity.id);
  delete from ip_web_sessions where token_hash=p_body->>'sessionHash' or expires_at<=now();
  return jsonb_build_object('ok',true);
 elsif p_action='admin_applications' then
  select coalesce(jsonb_agg(x),'[]') into v_result from (
   select a.*,o.legacy_student_id from ip_applications a join ip_owners o on o.id=a.owner_id
   where (coalesce(p_body->>'status','')='' or a.status=p_body->>'status')
   and (coalesce(p_body->>'search','')='' or strpos(a.name,p_body->>'search')>0 or strpos(a.exam_number,p_body->>'search')>0)
   order by a.created_at,a.id limit 30 offset greatest(0,coalesce((p_body->>'page')::int,0))*30
  ) x;
  return jsonb_build_object('ok',true,'applications',v_result);
 elsif p_action='admin_application_decide' then
  select * into v_app from ip_applications where id=(p_body->>'id')::uuid for update;
  if v_app.id is null then raise exception 'invalid_request'; end if;
  if v_app.revision<>v_revision or v_app.status<>'pending' then raise exception 'revision_conflict'; end if;
  if p_body->>'status' not in ('approved','rejected') or p_body->>'status' is null
    or length(coalesce(p_body->>'reviewNote',''))>2000 then raise exception 'invalid_request'; end if;
  if p_body->>'status'='rejected' and length(btrim(coalesce(p_body->>'reviewNote','')))=0 then raise exception 'review_note_required'; end if;
  if p_body->>'status'='approved' then
   if nullif(p_body->>'expiresOn','')::date<current_date then raise exception 'invalid_request'; end if;
   perform ip_service('admin_member_save',p_actor,jsonb_build_object('targetStudentId',v_app.owner_id,
    'track',v_app.track,'examNumber',v_app.exam_number,'enabled',true,'expiresOn',p_body->>'expiresOn'));
  end if;
  update ip_applications set status=p_body->>'status',review_note=coalesce(p_body->>'reviewNote',''),
   reviewed_by=p_actor->>'id',reviewed_at=now(),updated_at=now(),revision=revision+1
   where id=v_app.id returning * into v_app;
  insert into ip_history(entity,entity_id,actor_id,snapshot,student_id)
   values('application',v_app.id::text,p_actor->>'id',to_jsonb(v_app),v_app.owner_id);
  return jsonb_build_object('ok',true,'application',to_jsonb(v_app));
 end if;
 v_session:=ip_web_session(p_body->>'sessionHash');v_owner:=v_session->>'ownerId';
 if p_action='session' then
  if v_session is null then return jsonb_build_object('ok',true,'authenticated',false); end if;
  return jsonb_build_object('ok',true,'authenticated',true,'account',v_session,
   'application',(select to_jsonb(a) from ip_applications a where owner_id=v_owner),
   'member',(select to_jsonb(m) from ip_members m where student_id=v_owner),
   'available',case when v_owner is null then false else (ip_service('status',jsonb_build_object('type','student','id',v_owner),'{}')->>'enabled')::boolean end);
 end if;
 if p_action='logout' then
  delete from ip_web_sessions where token_hash=p_body->>'sessionHash';
  return jsonb_build_object('ok',true);
 end if;
 if v_session is null then raise exception 'unauthorized'; end if;
 if p_action='apply' then
  if jsonb_typeof(p_body->'name') is distinct from 'string' or length(btrim(p_body->>'name')) not between 1 and 80
   or p_body->>'track' is null or p_body->>'track' not in ('공채','항해','기관','방제','관제','기타')
   or jsonb_typeof(p_body->'examNumber') is distinct from 'string' or length(btrim(p_body->>'examNumber')) not between 1 and 80 then raise exception 'invalid_request'; end if;
  if v_owner is null then
   select * into v_identity from ip_web_identities where id=(v_session->>'identityId')::uuid for update;
   v_owner:=v_identity.owner_id;
   if v_owner is null then
    v_owner:='iw_'||replace(gen_random_uuid()::text,'-','');
    insert into ip_owners(id,name) values(v_owner,btrim(p_body->>'name'));
    update ip_web_identities set owner_id=v_owner where id=v_identity.id;
   end if;
  end if;
  perform 1 from ip_owners where id=v_owner for update;
  if exists(select 1 from ip_members where student_id=v_owner and enabled and (expires_on is null or expires_on>=current_date)) then raise exception 'already_enrolled'; end if;
  select * into v_app from ip_applications where owner_id=v_owner for update;
  if coalesce(v_app.revision,0)<>v_revision then raise exception 'revision_conflict'; end if;
  insert into ip_applications(owner_id,name,track,exam_number) values(v_owner,btrim(p_body->>'name'),p_body->>'track',btrim(p_body->>'examNumber'))
   on conflict(owner_id) do update set name=excluded.name,track=excluded.track,exam_number=excluded.exam_number,
    status='pending',review_note='',reviewed_by=null,reviewed_at=null,revision=ip_applications.revision+1,updated_at=now()
   returning * into v_app;
  update ip_owners set name=v_app.name where id=v_owner and legacy_student_id is null;
  insert into ip_history(entity,entity_id,actor_id,snapshot,student_id)
   values('application',v_app.id::text,v_owner,to_jsonb(v_app),v_owner);
  return jsonb_build_object('ok',true,'application',to_jsonb(v_app));
 end if;
 raise exception 'unsupported_action';
exception when unique_violation then raise exception 'account_already_linked';
end;
$$;
revoke all on function public.ip_portal_service(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ip_portal_service(text,jsonb,jsonb) to service_role;
commit;
