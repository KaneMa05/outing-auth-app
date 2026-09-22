-- Only administrator-confirmed purchases open OX. Preserve all learning records.
do $$
declare v_student text; v_book public.ox_book_access; v_after jsonb;
begin
  for v_student in select distinct student_id from public.ox_book_access
    where active and (source<>'purchase' or purchase_date is null)
  loop
    perform pg_advisory_xact_lock(hashtextextended('ox-member:'||v_student,0));
    for v_book in select * from public.ox_book_access where student_id=v_student and active
      and (source<>'purchase' or purchase_date is null) for update
    loop
      update public.ox_book_access b set active=false,updated_at=now(),updated_by='migration:verified_purchase_required'
        where b.student_id=v_student and b.collection_id=v_book.collection_id returning to_jsonb(b) into v_after;
      insert into public.ox_book_access_history(student_id,collection_id,before_value,after_value,reason,actor)
        values(v_student,v_book.collection_id,to_jsonb(v_book),v_after,'교재 구매 확인 전까지 이용 잠금','migration:verified_purchase_required');
    end loop;
    update public.ox_members set access_revision=access_revision+1,updated_at=now(),updated_by='migration:verified_purchase_required' where student_id=v_student;
  end loop;
end; $$;
alter table public.ox_book_access add constraint ox_active_requires_verified_purchase
  check(not active or (source='purchase' and purchase_date is not null));
create or replace function public.ox_has_book(p_student text,p_collection text)
returns boolean language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.ox_book_access where student_id=p_student and collection_id=p_collection
    and active and source='purchase' and purchase_date is not null)
$$;
revoke all on function public.ox_has_book(text,text) from public,anon,authenticated;
grant execute on function public.ox_has_book(text,text) to service_role;
