-- Existing published questions retain their approvals. Editing visible content
-- returns the question to draft across every existing student query path.
begin;
create function public.ip_question_require_reapproval() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.prompt is distinct from old.prompt or new.category is distinct from old.category
    or new.topic_ids is distinct from old.topic_ids or new.tracks is distinct from old.tracks then
  if new.status='published' then new.status:='draft'; end if;
  new.revision:=greatest(new.revision,old.revision+1);
  new.updated_at:=now();
 end if;
 return new;
end;
$$;
revoke all on function public.ip_question_require_reapproval() from public,anon,authenticated;
grant execute on function public.ip_question_require_reapproval() to service_role;
create trigger ip_question_publication_changed before update on public.ip_questions
for each row execute function public.ip_question_require_reapproval();

create function public.ip_question_publication_service(p_action text,p_actor jsonb,p_body jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 q public.ip_questions;
 target_status text;
begin
 if coalesce(p_actor->>'type','')<>'admin' or coalesce(p_actor->>'id','')='' then raise exception 'forbidden'; end if;
 if p_action is distinct from 'admin_question_publication' then raise exception 'unsupported_action'; end if;
 if coalesce(p_body->>'id','')='' or jsonb_typeof(p_body->'approved') is distinct from 'boolean'
    or coalesce((p_body->>'revision')::integer,0)<1 then raise exception 'invalid_request'; end if;
 -- Match the existing editor's advisory-lock -> row-lock order.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('question:'||(p_body->>'id'),0));
 select * into q from public.ip_questions where id=p_body->>'id' for update;
 if not found or q.status='archived' then raise exception 'question_unavailable'; end if;
 if q.revision<>(p_body->>'revision')::integer then raise exception 'revision_conflict'; end if;
 target_status:=case when (p_body->>'approved')::boolean then 'published' else 'draft' end;
 if q.status<>target_status then
  if target_status='published' then
   -- Reuse existing topic/track validation, revision checking and audit history.
   perform public.ip_service('admin_question_publish',p_actor,
    jsonb_build_object('items',jsonb_build_array(jsonb_build_object('id',q.id,'revision',q.revision))));
  else
   -- Approval withdrawal must work even when an old topic has become inactive.
   update public.ip_questions set status='draft',revision=revision+1,updated_at=now() where id=q.id;
   insert into public.ip_history(entity,entity_id,actor_id,snapshot)
    select 'question',id,p_actor->>'id',to_jsonb(x) from public.ip_questions x where id=q.id;
  end if;
  select * into q from public.ip_questions where id=q.id;
 end if;
 return jsonb_build_object('ok',true,'question',to_jsonb(q));
end;
$$;
revoke all on function public.ip_question_publication_service(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ip_question_publication_service(text,jsonb,jsonb) to service_role;
commit;
