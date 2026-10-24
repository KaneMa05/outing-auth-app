begin;
create table public.ip_diagnosis_answers (
 student_id text not null references public.ip_owners(id) on delete cascade,
 topic_id text not null check(topic_id in ('self','motivation','teamwork','communication','leadership','achievement','failure','responsibility','service','integrity','public','stress','judgement')),
 prompts jsonb not null,answers jsonb not null,revision integer not null default 1,
 updated_at timestamptz not null default now(),primary key(student_id,topic_id)
);
alter table public.ip_diagnosis_answers enable row level security;
revoke all on public.ip_diagnosis_answers from public,anon,authenticated;
grant select,insert,update,delete on public.ip_diagnosis_answers to service_role;
create function public.ip_diagnosis_service(p_action text,p_actor jsonb,p_body jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare sid text:=p_actor->>'id';item public.ip_diagnosis_answers;v_topic text:=p_body->>'topicId';
begin
 if p_actor->>'type' is distinct from 'student' or coalesce(sid,'')='' then raise exception 'unauthorized';end if;
 if not coalesce((ip_service('status',p_actor,'{}')->>'enabled')::boolean,false) then raise exception 'not_enrolled';end if;
 perform 1 from ip_members where student_id=sid for update;
 if not coalesce((ip_service('status',p_actor,'{}')->>'enabled')::boolean,false) then raise exception 'not_enrolled';end if;
 if p_action='diagnosis_get' then
  return jsonb_build_object('ok',true,'answers',(select coalesce(jsonb_agg(to_jsonb(a) order by topic_id),'[]') from ip_diagnosis_answers a where a.student_id=sid));
 elsif p_action<>'diagnosis_save' then raise exception 'unsupported_action';end if;
 if coalesce(v_topic,'') not in ('self','motivation','teamwork','communication','leadership','achievement','failure','responsibility','service','integrity','public','stress','judgement') then raise exception 'invalid_topic';end if;
 if jsonb_typeof(p_body->'prompts') is distinct from 'array' or jsonb_typeof(p_body->'answers') is distinct from 'array' then raise exception 'invalid_request';end if;
 if jsonb_array_length(p_body->'answers')<>5 or jsonb_array_length(p_body->'prompts')<>5 then raise exception 'invalid_request';end if;
 if exists(select 1 from jsonb_array_elements(p_body->'answers') v where jsonb_typeof(v)<>'string' or length(v#>>'{}')>2000)
  or exists(select 1 from jsonb_array_elements(p_body->'prompts') v where jsonb_typeof(v)<>'string' or length(btrim(v#>>'{}')) not between 1 and 600) then raise exception 'invalid_request';end if;
 select * into item from ip_diagnosis_answers where student_id=sid and topic_id=v_topic;
 if (p_body->>'revision')::int is distinct from coalesce(item.revision,0) then raise exception 'revision_conflict';end if;
 -- A saved answer stays paired with its original question; clients cannot silently remap it.
 if item.student_id is not null and item.prompts is distinct from p_body->'prompts' then raise exception 'topic_changed';end if;
 insert into ip_diagnosis_answers(student_id,topic_id,prompts,answers) values(sid,v_topic,p_body->'prompts',p_body->'answers')
 on conflict(student_id,topic_id) do update set answers=excluded.answers,revision=ip_diagnosis_answers.revision+1,updated_at=now() returning * into item;
 return jsonb_build_object('ok',true,'answer',to_jsonb(item));
end;$$;
revoke all on function public.ip_diagnosis_service(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ip_diagnosis_service(text,jsonb,jsonb) to service_role;
commit;
