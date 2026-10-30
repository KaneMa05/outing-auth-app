-- Additive authoring validation and admin validation reports. No student exams enabled.
begin;
create function public.ip_validate_keyword_rules() returns trigger
language plpgsql security invoker set search_path='' as $$
declare c jsonb; k jsonb; expression jsonb; flat jsonb; seen text[]; normalized text;
begin
 for c in select value from jsonb_array_elements(new.criteria) loop
  if c ? 'match' and coalesce(c->>'match','') not in ('any','all') then raise exception 'invalid_request'; end if;
  if c ? 'keywords' then
   if coalesce(c->>'match','') not in ('any','all') or jsonb_typeof(c->'keywords') is distinct from 'array' then raise exception 'invalid_request'; end if;
   if jsonb_array_length(c->'keywords') not between 1 and 30 then raise exception 'invalid_request'; end if;
   flat:='[]'::jsonb; seen:=array[]::text[];
   for k in select value from jsonb_array_elements(c->'keywords') loop
    if jsonb_typeof(k) is distinct from 'object' or jsonb_typeof(k->'term') is distinct from 'string' or length(btrim(k->>'term')) not between 1 and 120 or jsonb_typeof(k->'aliases') is distinct from 'array' then raise exception 'invalid_request'; end if;
    if exists(select 1 from jsonb_object_keys(k) name where name not in ('term','aliases')) or jsonb_array_length(k->'aliases')>29 then raise exception 'invalid_request'; end if;
    for expression in select value from jsonb_array_elements(jsonb_build_array(k->'term') || (k->'aliases')) loop
     if jsonb_typeof(expression) is distinct from 'string' or length(btrim(expression#>>'{}')) not between 1 and 120 then raise exception 'invalid_request'; end if;
     normalized:=lower(regexp_replace(btrim(expression#>>'{}'),'\s+',' ','g'));
     if normalized=any(seen) then raise exception 'invalid_request'; end if;
     seen:=array_append(seen,normalized); flat:=flat || jsonb_build_array(expression);
    end loop;
   end loop;
   if jsonb_array_length(flat)>30 or flat is distinct from c->'terms' then raise exception 'invalid_request'; end if;
  end if;
 end loop;
 return new;
end;
$$;
revoke all on function public.ip_validate_keyword_rules() from public,anon,authenticated;
grant execute on function public.ip_validate_keyword_rules() to service_role;
create trigger ip_rubric_keyword_rules before insert or update of criteria on public.ip_question_rubrics
for each row execute function public.ip_validate_keyword_rules();

create table public.ip_exam_reports (
 id uuid primary key,
 created_by text not null check(length(created_by) between 1 and 120),
 question_id text not null,
 question_revision integer not null check(question_revision>0),
 rubric_revision integer not null check(rubric_revision>0),
 audio_hash text not null check(audio_hash ~ '^[a-f0-9]{64}$'),
 request_hash text not null check(request_hash ~ '^[a-f0-9]{64}$'),
 state text not null check(state in ('processing','completed','failed')),
 report jsonb,
 error text,
 created_at timestamptz not null default now(),
 completed_at timestamptz,
 check(report is null or (jsonb_typeof(report)='object' and (report->>'status') is not distinct from 'review_required' and (report->'grade') is not distinct from 'null'::jsonb and (report->'score') is not distinct from 'null'::jsonb)),
 check((state='completed' and report is not null and completed_at is not null) or (state<>'completed' and report is null))
);
create index ip_exam_reports_question_created on public.ip_exam_reports(question_id,created_at desc,id);
alter table public.ip_exam_reports enable row level security;
revoke all on public.ip_exam_reports from public,anon,authenticated;
grant select,insert,update on public.ip_exam_reports to service_role;

create function public.ip_exam_report_service(p_action text,p_actor jsonb,p_body jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r public.ip_exam_reports; inserted integer; rows jsonb; v_report jsonb;
begin
 if coalesce(p_actor->>'type','')<>'admin' or length(coalesce(p_actor->>'id','')) not between 1 and 120 then raise exception 'forbidden'; end if;
 if p_action='reserve' then
  if length(coalesce(p_body->>'questionId','')) not between 1 and 120 then raise exception 'invalid_request'; end if;
  insert into public.ip_exam_reports(id,created_by,question_id,question_revision,rubric_revision,audio_hash,request_hash,state)
  values((p_body->>'id')::uuid,p_actor->>'id',p_body->>'questionId',(p_body->>'questionRevision')::integer,(p_body->>'rubricRevision')::integer,p_body->>'audioHash',p_body->>'requestHash','processing') on conflict(id) do nothing;
  get diagnostics inserted=row_count;
  select * into r from public.ip_exam_reports where id=(p_body->>'id')::uuid;
  if r.created_by<>p_actor->>'id' or r.request_hash<>p_body->>'requestHash' then raise exception 'idempotency_conflict'; end if;
  return jsonb_build_object('ok',true,'created',inserted=1,'record',to_jsonb(r));
 elsif p_action in ('complete','fail') then
  select * into r from public.ip_exam_reports where id=(p_body->>'id')::uuid for update;
  if not found then raise exception 'not_found'; end if;
  if r.created_by<>p_actor->>'id' then raise exception 'forbidden'; end if;
  if p_action='complete' then
   v_report:=p_body->'report';
   if jsonb_typeof(v_report) is distinct from 'object' or v_report->>'status' is distinct from 'review_required'
    or v_report->'grade' is distinct from 'null'::jsonb or v_report->'score' is distinct from 'null'::jsonb
    or v_report#>>'{audit,audioHash}' is distinct from r.audio_hash or v_report#>>'{audit,questionId}' is distinct from r.question_id
    or v_report#>>'{audit,questionRevision}' is distinct from r.question_revision::text or v_report#>>'{audit,rubricRevision}' is distinct from r.rubric_revision::text
    or jsonb_typeof(v_report->'rubric') is distinct from 'object' or jsonb_typeof(v_report->'keywordResults') is distinct from 'array'
    or octet_length(v_report::text)>1000000 then raise exception 'invalid_report'; end if;
   if r.state='completed' then
    if r.report is distinct from v_report then raise exception 'idempotency_conflict'; end if;
   elsif r.state='processing' then
    update public.ip_exam_reports set state='completed',report=v_report,completed_at=now() where id=r.id returning * into r;
   else raise exception 'report_closed'; end if;
  elsif r.state='processing' then
   update public.ip_exam_reports set state='failed',error='evaluation_failed',completed_at=now() where id=r.id returning * into r;
  end if;
  return jsonb_build_object('ok',true,'record',to_jsonb(r));
 elsif p_action='get' then
  select * into r from public.ip_exam_reports where id=(p_body->>'id')::uuid;
  if not found then raise exception 'not_found'; end if;
  return jsonb_build_object('ok',true,'record',to_jsonb(r));
 elsif p_action='list' then
  select coalesce(jsonb_agg(x),'[]'::jsonb) into rows from (
   select id,created_by,question_id,question_revision,rubric_revision,state,created_at,completed_at,
    report->'suggestion' as suggestion,report->'reasons' as reasons
   from public.ip_exam_reports where (coalesce(p_body->>'questionId','')='' or question_id=p_body->>'questionId')
   order by created_at desc,id limit 30 offset greatest(0,least(10000,coalesce((p_body->>'page')::integer,0)))*30
  ) x;
  return jsonb_build_object('ok',true,'reports',rows);
 else raise exception 'unsupported_action'; end if;
end;
$$;
revoke all on function public.ip_exam_report_service(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ip_exam_report_service(text,jsonb,jsonb) to service_role;
comment on table public.ip_exam_reports is 'Admin-only, immutable completed validation reports. Review suggestions are not official student grades.';
commit;
