begin;
alter table public.ip_writings add column submission_round integer not null default 0 check(submission_round>=0),
 add column feedback_at timestamptz, add column feedback_round integer;
create table public.ip_writing_rounds (
 student_id text not null, kind text not null, item_id text not null,
 round integer not null check(round>0), submitted_revision integer not null,
 prompt_snapshot text not null, submitted_body text not null,
 submitted_at timestamptz not null, status text not null check(status in ('submitted','needs_revision','approved')),
 feedback text not null default '', feedback_at timestamptz,
 primary key(student_id,kind,item_id,round),
 unique(student_id,kind,item_id,submitted_revision),
 foreign key(student_id,kind,item_id) references public.ip_writings(student_id,kind,item_id) on delete cascade
);
alter table public.ip_writing_rounds enable row level security;
revoke all on public.ip_writing_rounds from public,anon,authenticated;
grant select,insert,update,delete on public.ip_writing_rounds to service_role;

-- Recover known submissions from audit snapshots. Carried-over feedback belongs
-- to feedback_revision, never to the newer submission carrying that text.
with snapshots as (
 select h.snapshot as s,h.id from public.ip_history h
 join public.ip_writings w on w.student_id=h.student_id and w.kind=h.snapshot->>'kind' and w.item_id=h.snapshot->>'item_id'
 where h.entity='writing' and h.snapshot->>'submitted_revision' is not null
 union all select to_jsonb(w),9223372036854775807::bigint from public.ip_writings w where submitted_revision is not null
), submissions as (
 select distinct on (s->>'student_id',s->>'kind',s->>'item_id',(s->>'submitted_revision')::integer) s
 from snapshots order by s->>'student_id',s->>'kind',s->>'item_id',(s->>'submitted_revision')::integer,id desc
), numbered as (
 select s,row_number() over(partition by s->>'student_id',s->>'kind',s->>'item_id' order by (s->>'submitted_revision')::integer)::integer as round
 from submissions
)
insert into public.ip_writing_rounds
 select s->>'student_id',s->>'kind',s->>'item_id',round,(s->>'submitted_revision')::integer,
 s->>'prompt_snapshot',s->>'submitted_body',(s->>'submitted_at')::timestamptz,
 case when s->>'feedback_revision'=s->>'submitted_revision' then s->>'submission_status' else 'submitted' end,
 case when s->>'feedback_revision'=s->>'submitted_revision' then coalesce(s->>'feedback','') else '' end,null
 from numbered;
-- Earliest audit snapshot with the final feedback identifies when that version
-- was recorded, even if later working-copy saves retained it. Legacy records
-- without a matching audit snapshot keep an unknown feedback time (NULL).
update public.ip_writing_rounds r set feedback_at=(
 select min(h.created_at) from public.ip_history h where h.entity='writing' and h.student_id=r.student_id
 and h.snapshot->>'kind'=r.kind and h.snapshot->>'item_id'=r.item_id
 and (h.snapshot->>'feedback_revision')::integer=r.submitted_revision
 and h.snapshot->>'feedback'=r.feedback and h.snapshot->>'submission_status'=r.status
 and h.snapshot->>'submitted_revision'=h.snapshot->>'feedback_revision'
) where feedback<>'';
update public.ip_writings w set submission_round=r.round,feedback_round=(
 select f.round from public.ip_writing_rounds f where f.student_id=w.student_id and f.kind=w.kind and f.item_id=w.item_id and f.submitted_revision=w.feedback_revision
),feedback_at=(
 select f.feedback_at from public.ip_writing_rounds f where f.student_id=w.student_id and f.kind=w.kind and f.item_id=w.item_id and f.submitted_revision=w.feedback_revision
) from public.ip_writing_rounds r where r.student_id=w.student_id and r.kind=w.kind and r.item_id=w.item_id and r.submitted_revision=w.submitted_revision;

create function public.ip_writing_round_before() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if new.submitted_revision is distinct from old.submitted_revision then
  new.submission_round:=old.submission_round+1;
 elsif new.feedback_revision=new.submitted_revision and new.submission_status in ('needs_revision','approved') then
  new.feedback_at:=now();
  new.feedback_round:=new.submission_round;
 end if;
 return new;
end; $$;
create trigger ip_writing_round_before before update of submitted_revision,feedback_revision on public.ip_writings
 for each row execute function public.ip_writing_round_before();
create function public.ip_writing_round_after() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if new.submitted_revision is distinct from old.submitted_revision then
  insert into ip_writing_rounds(student_id,kind,item_id,round,submitted_revision,prompt_snapshot,submitted_body,submitted_at,status)
   values(new.student_id,new.kind,new.item_id,new.submission_round,new.submitted_revision,new.prompt_snapshot,new.submitted_body,new.submitted_at,'submitted');
 elsif new.feedback_revision=new.submitted_revision then
  update ip_writing_rounds set feedback=new.feedback,feedback_at=new.feedback_at,status=new.submission_status
   where student_id=new.student_id and kind=new.kind and item_id=new.item_id and round=new.submission_round;
 end if;
 return new;
end; $$;
create trigger ip_writing_round_after after update of submitted_revision,feedback_revision on public.ip_writings
 for each row execute function public.ip_writing_round_after();
revoke all on function public.ip_writing_round_before(),public.ip_writing_round_after() from public,anon,authenticated;

create function public.ip_writing_history_service(p_action text,p_actor jsonb,p_body jsonb default '{}')
returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare
 v_target text;v_kind text:=p_body->>'kind';v_item text:=p_body->>'itemId';
 v_page integer:=coalesce((p_body->>'page')::integer,0);
begin
 if coalesce(p_actor->>'id','')='' then raise exception 'unauthorized'; end if;
 if p_action='admin_writing_history' then
  if p_actor->>'type' is distinct from 'admin' then raise exception 'forbidden'; end if;
  v_target:=p_body->>'targetStudentId';
 elsif p_action='writing_history' then
  if p_actor->>'type' is distinct from 'student' then raise exception 'forbidden'; end if;
  v_target:=p_actor->>'id';
  if not coalesce((ip_service('status',p_actor,'{}')->>'enabled')::boolean,false) then raise exception 'not_enrolled'; end if;
 else raise exception 'unsupported_action'; end if;
 if v_kind is null or v_kind not in ('introduction','motivation','public_service','core') or v_item is null
  or (v_kind='core' and length(v_item) not between 1 and 120) or (v_kind<>'core' and v_item<>'')
  or v_page not between 0 and 100000 then raise exception 'invalid_request'; end if;
 if not exists(select 1 from ip_members where student_id=v_target) then raise exception 'student_unavailable'; end if;
 return jsonb_build_object('ok',true,'rounds',(
  select coalesce(jsonb_agg(to_jsonb(r) order by r.round desc),'[]') from (
   select * from ip_writing_rounds where student_id=v_target and kind=v_kind and item_id=v_item order by round desc limit 10 offset v_page*10
  ) r),'total',(select count(*) from ip_writing_rounds where student_id=v_target and kind=v_kind and item_id=v_item),'page',v_page,'pageSize',10);
end; $$;
revoke all on function public.ip_writing_history_service(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ip_writing_history_service(text,jsonb,jsonb) to service_role;
commit;
