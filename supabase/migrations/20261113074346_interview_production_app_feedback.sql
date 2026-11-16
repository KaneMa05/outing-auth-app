-- Existing reports remain test reports; future requests derive channel on the server.
alter table public.ip_test_app_feedback add column app_channel text not null default 'test' check(app_channel in ('test','production'));
create or replace function public.ip_test_app_feedback_service(p_action text,p_actor jsonb,p_body jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r public.ip_test_app_feedback%rowtype; actor_id text:=p_actor->>'id'; request uuid; result jsonb; page integer;
begin
 if coalesce(actor_id,'')='' or char_length(actor_id)>120 then raise exception 'forbidden'; end if;
 if p_action='create' then
  if coalesce(p_actor->>'type','')<>'student' then raise exception 'forbidden'; end if;
  if coalesce(p_body->>'kind','') not in ('bug','suggestion') or char_length(btrim(coalesce(p_body->>'content',''))) not between 2 and 2000
   or coalesce(p_body->>'screen','') !~ '^[a-zA-Z0-9._/-]{1,80}$' or char_length(coalesce(p_body->>'appVersion',''))>50 then raise exception 'invalid_request'; end if;
  begin request:=(p_body->>'requestId')::uuid; exception when others then raise exception 'invalid_request'; end;
  if request is null then raise exception 'invalid_request'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('test-feedback:'||actor_id,0));
  select * into r from public.ip_test_app_feedback where student_id=actor_id and request_id=request;
  if found then
   if r.content<>btrim(p_body->>'content') or r.kind<>p_body->>'kind' or r.screen<>p_body->>'screen' then raise exception 'request_conflict'; end if;
   return jsonb_build_object('ok',true,'id',r.id,'status',r.status);
  end if;
  if (select count(*) from public.ip_test_app_feedback where student_id=actor_id and created_at>now()-interval '1 day')>=20 then raise exception 'rate_limited'; end if;
  insert into public.ip_test_app_feedback(student_id,request_id,kind,content,screen,app_version,app_channel)
   values(actor_id,request,p_body->>'kind',btrim(p_body->>'content'),p_body->>'screen',coalesce(p_body->>'appVersion',''),case when coalesce((p_actor->>'testApp')::boolean,false) then 'test' else 'production' end) returning * into r;
  return jsonb_build_object('ok',true,'id',r.id,'status',r.status);
 end if;
 if coalesce(p_actor->>'type','')<>'admin' then raise exception 'forbidden'; end if;
 if p_action='admin_app_feedback_list' then
  page:=coalesce((p_body->>'page')::integer,0);
  if page<0 or page>1000 or coalesce(p_body->>'status','all') not in ('all','received','reviewing','resolved') then raise exception 'invalid_request'; end if;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc,t.id desc),'[]'::jsonb) into result from
   (select f.id,f.student_id,coalesce(o.name,s.name,f.student_id) as student_name,f.kind,f.content,f.screen,f.app_version,f.app_channel,f.status,f.revision,f.handled_by,f.created_at,f.updated_at from public.ip_test_app_feedback f
    left join public.ip_owners o on o.id=f.student_id left join public.students s on s.id=f.student_id
    where coalesce(p_body->>'status','all')='all' or f.status=p_body->>'status' order by f.created_at desc,f.id desc limit 31 offset page*30) t;
  return jsonb_build_object('ok',true,'items',result,'hasMore',jsonb_array_length(result)>30);
 elsif p_action='admin_app_feedback_update' then
  if coalesce(p_body->>'status','') not in ('received','reviewing','resolved') then raise exception 'invalid_request'; end if;
  update public.ip_test_app_feedback set status=p_body->>'status',revision=revision+1,handled_by=actor_id,updated_at=now()
   where id=(p_body->>'id')::uuid and revision=(p_body->>'revision')::integer returning * into r;
  if not found then raise exception 'revision_conflict'; end if;
  return jsonb_build_object('ok',true,'id',r.id,'revision',r.revision);
 end if;
 raise exception 'unsupported_action';
end $$;
revoke all on function public.ip_test_app_feedback_service(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ip_test_app_feedback_service(text,jsonb,jsonb) to service_role;
