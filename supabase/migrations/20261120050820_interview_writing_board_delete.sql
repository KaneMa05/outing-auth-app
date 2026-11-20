begin;
set local lock_timeout='1s';
set local statement_timeout='15s';

-- A deleted board entry hides one submitted snapshot; student answers and
-- correction history remain intact. A later submission has a new revision.
create table public.ip_writing_board_hidden (
 student_id text not null,
 kind text not null,
 item_id text not null default '',
 submitted_revision integer not null check(submitted_revision>0),
 hidden_by text not null,
 hidden_at timestamptz not null default now(),
 primary key(student_id,kind,item_id,submitted_revision),
 foreign key(student_id,kind,item_id) references public.ip_writings(student_id,kind,item_id) on delete cascade
);
alter table public.ip_writing_board_hidden enable row level security;
revoke all on public.ip_writing_board_hidden from public,anon,authenticated;
grant select,insert on public.ip_writing_board_hidden to service_role;

create function public.ip_writing_board_delete_service(p_action text,p_actor jsonb,p_body jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 v_target text:=p_body->>'targetStudentId';
 v_kind text:=p_body->>'kind';
 v_item text:=coalesce(p_body->>'itemId','');
 v_row public.ip_writings%rowtype;
begin
 if p_actor->>'type' is distinct from 'admin' or coalesce(p_actor->>'id','')='' then raise exception 'forbidden'; end if;
 if p_action<>'admin_writing_delete' then raise exception 'unsupported_action'; end if;
 if coalesce(v_target,'')='' or length(v_target)>120 or v_kind is null or v_kind not in ('introduction','motivation','public_service') or v_item<>''
  or jsonb_typeof(p_body->'revision') is distinct from 'number' or coalesce(p_body->>'revision','') !~ '^[1-9][0-9]{0,8}$' then raise exception 'invalid_request'; end if;
 select * into v_row from public.ip_writings where student_id=v_target and kind=v_kind and item_id=v_item for update;
 if not found or v_row.submitted_at is null then raise exception 'not_submitted'; end if;
 if v_row.revision<>(p_body->>'revision')::integer then raise exception 'revision_conflict'; end if;
 insert into public.ip_writing_board_hidden(student_id,kind,item_id,submitted_revision,hidden_by)
  values(v_target,v_kind,v_item,v_row.submitted_revision,p_actor->>'id') on conflict do nothing;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.ip_writing_board_delete_service(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ip_writing_board_delete_service(text,jsonb,jsonb) to service_role;

-- A deliberate resubmission of a hidden answer starts a new round even if its
-- text is unchanged. Keep the existing duplicate-click guard for other rows.
do $patch$
declare
 v_definition text:=pg_get_functiondef('public.ip_writing_service(text,jsonb,jsonb)'::regprocedure);
 v_needle text:=$needle$and v_row.body=p_body->>'text' then$needle$;
begin
 if (length(v_definition)-length(replace(v_definition,v_needle,'')))/length(v_needle)<>1 then
  raise exception 'Unexpected writing service duplicate-submit guard';
 end if;
 execute replace(v_definition,v_needle,$replacement$and v_row.body=p_body->>'text' and not exists (
  select 1 from public.ip_writing_board_hidden h where h.student_id=v_target and h.kind=v_kind and h.item_id=v_item and h.submitted_revision=v_row.submitted_revision
 ) then$replacement$);
end $patch$;

create or replace function public.ip_writing_board_service(p_action text,p_actor jsonb,p_body jsonb default '{}')
returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare
 v_page integer:=coalesce((p_body->>'page')::integer,0);
 v_status text:=coalesce(p_body->>'status','');v_kind text:=coalesce(p_body->>'kind','');
 v_search text:=lower(btrim(coalesce(p_body->>'search','')));v_result jsonb;
begin
 if p_actor->>'type' is distinct from 'admin' or coalesce(p_actor->>'id','')='' then raise exception 'forbidden'; end if;
 if p_action<>'admin_writing_board' then raise exception 'unsupported_action'; end if;
 if v_page not between 0 and 100000 or v_status not in ('','submitted','needs_revision','approved')
  or v_kind not in ('','introduction','motivation','public_service') or length(v_search)>200 then raise exception 'invalid_request'; end if;
 with matches as (
  select w.student_id,w.kind,w.item_id,w.prompt_snapshot,w.submitted_at,w.submission_round,w.submission_status,w.feedback_at,w.revision,
   d.name,m.track,m.exam_number
  from ip_writings w join ip_members m on m.student_id=w.student_id join ip_student_directory d on d.id=w.student_id
  where w.submitted_at is not null and w.kind in ('introduction','motivation','public_service')
   and not exists (select 1 from public.ip_writing_board_hidden h where h.student_id=w.student_id and h.kind=w.kind and h.item_id=w.item_id and h.submitted_revision=w.submitted_revision)
   and (v_kind='' or w.kind=v_kind)
   and (v_search='' or strpos(lower(d.name),v_search)>0 or strpos(lower(w.student_id),v_search)>0
    or strpos(lower(m.exam_number),v_search)>0 or strpos(lower(w.prompt_snapshot),v_search)>0)
 ), filtered as (select * from matches where v_status='' or submission_status=v_status),
 paged as (select * from filtered order by submitted_at desc,student_id,kind limit 30 offset v_page*30)
 select jsonb_build_object('ok',true,'submissions',coalesce((select jsonb_agg(p order by p.submitted_at desc,p.student_id,p.kind) from paged p),'[]'),
  'total',(select count(*) from filtered),'page',v_page,'pageSize',30,
  'pending',(select count(*) from matches where submission_status='submitted'),
  'revision',(select count(*) from matches where submission_status='needs_revision'),
  'approved',(select count(*) from matches where submission_status='approved')) into v_result;
 return v_result;
end; $$;
revoke all on function public.ip_writing_board_service(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ip_writing_board_service(text,jsonb,jsonb) to service_role;
commit;
