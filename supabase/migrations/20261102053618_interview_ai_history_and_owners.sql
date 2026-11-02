-- Preserve previous answers on retry and admit interview-only enrolled accounts.
-- No feature gates are enabled by this migration.
begin;
set local lock_timeout='5s';

alter table public.ip_ai_workers add column all_enrolled boolean not null default false;
do $$
declare definition text:=pg_get_functiondef('public.ip_ai_worker_service(text,text,jsonb)'::regprocedure);
begin
 if position('join students s on s.id=m.student_id' in definition)=0
    or position('req.student_id=any(w.student_ids)' in definition)=0
    or position('if not r.student_id=any(w.student_ids) then' in definition)=0 then
  raise exception 'unexpected_ai_worker_definition';
 end if;
 definition:=replace(definition,'join students s on s.id=m.student_id','join ip_student_directory s on s.id=m.student_id');
 definition:=replace(definition,'req.student_id=any(w.student_ids)','(w.all_enrolled or req.student_id=any(w.student_ids))');
 definition:=replace(definition,'if not r.student_id=any(w.student_ids) then','if not (w.all_enrolled or r.student_id=any(w.student_ids)) then');
 execute definition;
end $$;

create table public.ip_ai_job_history (
 id bigint generated always as identity primary key,
 request_id uuid not null references public.ip_ai_requests(id) on delete cascade,
 job_id uuid not null references public.ip_ai_jobs(id) on delete cascade,
 execution_id uuid,
 status text not null,
 reason text,
 result jsonb,
 sources jsonb not null,
 attempts integer not null,
 recorded_at timestamptz not null default now()
);
create index ip_ai_job_history_request on public.ip_ai_job_history(request_id,recorded_at,id);
create index ip_ai_job_history_job on public.ip_ai_job_history(job_id);
alter table public.ip_ai_job_history enable row level security;
revoke all on public.ip_ai_job_history from public,anon,authenticated;
grant select,insert on public.ip_ai_job_history to service_role;
grant usage,select on sequence public.ip_ai_job_history_id_seq to service_role;

create function public.ip_ai_preserve_job_result() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.status not in ('COMPLETED','NEEDS_INPUT','FAILED','BLOCKED','CANCELED') then return new;end if;
 if tg_op='UPDATE' then
  if (new.status,new.reason,new.result,new.execution_id,new.attempts)
    is not distinct from (old.status,old.reason,old.result,old.execution_id,old.attempts) then return new;end if;
 end if;
 insert into public.ip_ai_job_history(request_id,job_id,execution_id,status,reason,result,sources,attempts,recorded_at)
  select new.request_id,new.id,new.execution_id,new.status,new.reason,new.result,
   coalesce(new.sources_override,r.sources),new.attempts,new.updated_at
  from public.ip_ai_requests r where r.id=new.request_id;
 return new;
end $$;
revoke all on function public.ip_ai_preserve_job_result() from public,anon,authenticated;
grant execute on function public.ip_ai_preserve_job_result() to service_role;
create trigger ip_ai_preserve_job_result after insert or update on public.ip_ai_jobs
 for each row execute function public.ip_ai_preserve_job_result();

-- Backfill only retained results. Discarded results cannot be reconstructed.
insert into public.ip_ai_job_history(request_id,job_id,execution_id,status,reason,result,sources,attempts,recorded_at)
 select j.request_id,j.id,j.execution_id,j.status,j.reason,j.result,coalesce(j.sources_override,r.sources),j.attempts,j.updated_at
 from public.ip_ai_jobs j join public.ip_ai_requests r on r.id=j.request_id
 where j.status in ('COMPLETED','NEEDS_INPUT','FAILED','BLOCKED','CANCELED');
commit;
