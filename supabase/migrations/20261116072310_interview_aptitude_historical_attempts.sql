begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

-- Historical exam records do not create login accounts or overwrite live attempts.
create table public.ip_aptitude_historical_attempts (
 id uuid primary key default gen_random_uuid(),
 round_id uuid not null references public.ip_aptitude_rounds(id) on delete cascade,
 source_id text not null check(length(source_id) between 1 and 120),
 cohort text not null check(length(cohort) between 1 and 120),
 display_name text not null check(length(display_name) between 1 and 120),
 submitted_at timestamptz not null,
 answers jsonb not null check(jsonb_typeof(answers)='array' and jsonb_array_length(answers) in (75,150) and answers <@ '[0,1,2,3,4,5]'::jsonb),
 correct_count integer not null check(correct_count between 0 and jsonb_array_length(answers)),
 source_correct_count integer not null check(source_correct_count between 0 and jsonb_array_length(answers)),
 scored_key_revision integer not null check(scored_key_revision>0),
 source_filename text not null,
 source_sha256 text not null check(source_sha256 ~ '^[0-9a-f]{64}$'),
 source_row integer not null check(source_row>1),
 imported_at timestamptz not null default now(),
 unique(round_id,cohort,source_id)
);
alter table public.ip_aptitude_historical_attempts enable row level security;
revoke all on public.ip_aptitude_historical_attempts from public,anon,authenticated;
grant select,insert,update,delete on public.ip_aptitude_historical_attempts to service_role;

create function public.ip_aptitude_rankings(p_round_id uuid)
returns table(participant_id text,correct_count integer,rank bigint,historical boolean)
language sql stable security invoker set search_path='' as $$
 select p.participant_id,p.correct_count,rank() over(order by p.correct_count desc),p.historical
 from (
  select 'student:'||a.student_id as participant_id,a.correct_count,false as historical
  from public.ip_aptitude_attempts a where a.round_id=p_round_id and a.state='submitted'
  union all
  select 'history:'||h.id::text,h.correct_count,true
  from public.ip_aptitude_historical_attempts h where h.round_id=p_round_id
 ) p
$$;
revoke all on function public.ip_aptitude_rankings(uuid) from public,anon,authenticated;
grant execute on function public.ip_aptitude_rankings(uuid) to service_role;

-- Patch only the count/ranking/rescoring portions of the existing service.
-- Abort atomically if the expected implementation has changed.
do $patch$
declare
 source text:=replace(pg_catalog.pg_get_functiondef('public.ip_aptitude_service(text,jsonb,jsonb)'::regprocedure),chr(13),'');
 patch record;
begin
 for patch in select * from (values
  ($before$select count(*) into submitted from public.ip_aptitude_attempts where round_id=rid and state='submitted';$before$,
   $after$select count(*) into submitted from public.ip_aptitude_rankings(rid);$after$),
  ($before$get diagnostics affected=row_count;
  end if;
  insert into public.ip_aptitude_audit$before$,
   $after$get diagnostics affected=row_count;
   update public.ip_aptitude_historical_attempts set correct_count=public.ip_aptitude_score(answers,keys),scored_key_revision=new_key_revision where round_id=rid;
   affected:=affected+(select count(*)::int from public.ip_aptitude_historical_attempts where round_id=rid);
  end if;
  insert into public.ip_aptitude_audit$after$),
  ($before$with ranked as(select s.*,rank() over(order by correct_count desc) as rank from public.ip_aptitude_attempts s where round_id=rid and state='submitted'),
  population as(select m.student_id from public.ip_members m join public.ip_owners o on o.id=m.student_id join public.ip_student_directory d on d.id=m.student_id where m.enabled and o.active and d.is_active and coalesce(d.account_type,'student')='student' and (m.expires_on is null or m.expires_on>=(now() at time zone 'Asia/Seoul')::date)
   union select student_id from ranked)
  select coalesce(jsonb_agg(jsonb_build_object('studentId',p.student_id,'name',o.name,'state',coalesce(t.state,'not_submitted'),'correctCount',s.correct_count,
   'accuracy',round(s.correct_count::numeric/n*100,2),'rank',s.rank,'submittedAt',s.submitted_at) order by s.rank nulls last,o.name,p.student_id),'[]') into rows
  from population p join public.ip_owners o on o.id=p.student_id left join public.ip_aptitude_attempts t on t.round_id=rid and t.student_id=p.student_id left join ranked s on s.student_id=p.student_id;$before$,
   $after$with ranked as(select * from public.ip_aptitude_rankings(rid)),
  population as(select m.student_id from public.ip_members m join public.ip_owners o on o.id=m.student_id join public.ip_student_directory d on d.id=m.student_id where m.enabled and o.active and d.is_active and coalesce(d.account_type,'student')='student' and (m.expires_on is null or m.expires_on>=(now() at time zone 'Asia/Seoul')::date)
   union select student_id from public.ip_aptitude_attempts where round_id=rid and state='submitted'),
  entries as(
   select p.student_id,o.name,coalesce(t.state,'not_submitted') as state,s.correct_count,s.rank,t.submitted_at,false as historical,null::text as cohort
   from population p join public.ip_owners o on o.id=p.student_id
   left join public.ip_aptitude_attempts t on t.round_id=rid and t.student_id=p.student_id
   left join ranked s on s.participant_id='student:'||p.student_id
   union all
   select 'history:'||h.id::text,h.display_name||' ('||h.cohort||' · 이전 기수)','submitted',s.correct_count,s.rank,h.submitted_at,true,h.cohort
   from public.ip_aptitude_historical_attempts h join ranked s on s.participant_id='history:'||h.id::text where h.round_id=rid
  )
  select coalesce(jsonb_agg(jsonb_build_object('studentId',e.student_id,'name',e.name,'state',e.state,'correctCount',e.correct_count,
   'accuracy',round(e.correct_count::numeric/n*100,2),'rank',e.rank,'submittedAt',e.submitted_at,'historical',e.historical,'cohort',e.cohort)
   order by e.rank nulls last,e.name,e.student_id),'[]') into rows from entries e;$after$),
  ($before$'submittedCount',(select count(*) from public.ip_aptitude_attempts where round_id=rid and state='submitted')$before$,
   $after$'submittedCount',(select count(*) from public.ip_aptitude_rankings(rid))$after$),
  ($before$with ranked as(select student_id,rank() over(order by correct_count desc) as rank from public.ip_aptitude_attempts where round_id=rid and state='submitted')
   select jsonb_build_object('correctCount',a.correct_count,'totalQuestions',n,'accuracy',round(a.correct_count::numeric/n*100,2),'rank',rank,
    'participants',(select count(*) from ranked),'keyRevision',r.key_revision) into rows from ranked where student_id=owner_id;$before$,
   $after$with ranked as(select * from public.ip_aptitude_rankings(rid))
   select jsonb_build_object('correctCount',a.correct_count,'totalQuestions',n,'accuracy',round(a.correct_count::numeric/n*100,2),'rank',rank,
    'participants',(select count(*) from ranked),'historicalParticipants',(select count(*) from ranked where historical),'keyRevision',r.key_revision)
    into rows from ranked where participant_id='student:'||owner_id;$after$)
 ) as replacements(before_text,after_text)
 loop
  if position(patch.before_text in source)=0 then raise exception 'aptitude_history_migration_source_mismatch'; end if;
  source:=replace(source,patch.before_text,patch.after_text);
 end loop;
 execute source;
end
$patch$;
commit;
