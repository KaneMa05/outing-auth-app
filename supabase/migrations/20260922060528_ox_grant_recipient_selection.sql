-- Review an offline cohort roster and explicitly choose benefit recipients.
alter table public.ox_grant_batches add column selection_mode text not null default 'all' check(selection_mode in ('all','selected'));

-- Normalize the same aliases used by the student roster. Unknown tracks need explicit subject settings.
create function public.ox_normalize_grant_track(p_track text)
returns text language sql immutable security invoker set search_path='' as $$
 select coalesce((select canonical from (values
 ('??','전체'),
 ('전체','전체'),
 ('공채','경찰직 - 공채(순경)'),
 ('공개채용','경찰직 - 공채(순경)'),
 ('해경학과','경찰직 - 해경학과 항해(경장)'),
 ('학과특채항해','경찰직 - 해경학과 항해(경장)'),
 ('학과특채기관','경찰직 - 해경학과 기관(경장)'),
 ('함정요원','경찰직 - 함정요원 항해(경장)'),
 ('함정요원순경항해','경찰직 - 함정요원 항해(순경)'),
 ('함정요원항해순경','경찰직 - 함정요원 항해(순경)'),
 ('함정항해순경','경찰직 - 함정요원 항해(순경)'),
 ('함정요원순경기관','경찰직 - 함정요원 기관(순경)'),
 ('함정요원기관순경','경찰직 - 함정요원 기관(순경)'),
 ('함정기관순경','경찰직 - 함정요원 기관(순경)'),
 ('함정요원경장항해','경찰직 - 함정요원 항해(경장)'),
 ('함정요원항해경장','경찰직 - 함정요원 항해(경장)'),
 ('함정항해경장','경찰직 - 함정요원 항해(경장)'),
 ('함정요원경장기관','경찰직 - 함정요원 기관(경장)'),
 ('함정요원기관경장','경찰직 - 함정요원 기관(경장)'),
 ('함정기관경장','경찰직 - 함정요원 기관(경장)'),
 ('구조','경찰직 - 구조(순경)'),
 ('구급','경찰직 - 구급(순경)'),
 ('선박교통관제','일반직 - 선박교통관제(VTS)'),
 ('선박관제','일반직 - 선박교통관제(VTS)'),
 ('일반직vts','일반직 - 선박교통관제(VTS)'),
 ('vts','경찰직 - 해상교통관제(VTS)(순경)'),
 ('해상교통관제','경찰직 - 해상교통관제(VTS)(순경)'),
 ('간부후보기관','경찰직 - 경위 공채(해양-기관)'),
 ('간부후보항해','경찰직 - 경위 공채(해양-항해)'),
 ('간부해양기관','경찰직 - 경위 공채(해양-기관)'),
 ('간부해양항해','경찰직 - 경위 공채(해양-항해)'),
 ('경위공채해양기관','경찰직 - 경위 공채(해양-기관)'),
 ('경위공채해양항해','경찰직 - 경위 공채(해양-항해)'),
 ('경찰직경위공채해양기관','경찰직 - 경위 공채(해양-기관)'),
 ('경찰직경위공채해양항해','경찰직 - 경위 공채(해양-항해)'),
 ('기타','기타'),
 ('경찰직공채순경','경찰직 - 공채(순경)'),
 ('경찰직해경학과항해경장','경찰직 - 해경학과 항해(경장)'),
 ('경찰직해경학과기관경장','경찰직 - 해경학과 기관(경장)'),
 ('경찰직함정요원항해경장','경찰직 - 함정요원 항해(경장)'),
 ('경찰직함정요원항해순경','경찰직 - 함정요원 항해(순경)'),
 ('경찰직함정요원기관순경','경찰직 - 함정요원 기관(순경)'),
 ('경찰직함정요원기관경장','경찰직 - 함정요원 기관(경장)'),
 ('경찰직구조순경','경찰직 - 구조(순경)'),
 ('경찰직구급순경','경찰직 - 구급(순경)'),
 ('일반직선박교통관제vts','일반직 - 선박교통관제(VTS)'),
 ('경찰직해상교통관제vts순경','경찰직 - 해상교통관제(VTS)(순경)'),
 ('수사특채','수사특채')
 )aliases(key,canonical) where key=lower(regexp_replace(btrim(p_track),'[-[:space:]()（）_·]','','g')) limit 1),nullif(btrim(p_track),''))
$$;
create function public.ox_grant_track_eligible(p_track text)
returns boolean language sql stable security invoker set search_path='' as $$
 with track as (select public.ox_normalize_grant_track(p_track) name),
 configured as (select e.subject,e.is_active from public.exam_subject_settings e,track t where public.ox_normalize_grant_track(e.track)=t.name)
 select case when t.name is null or t.name in ('전체','기타','경찰직 - 함정요원 항해(경장)','경찰직 - 함정요원 기관(경장)') then false
   when exists(select 1 from configured) then exists(select 1 from configured where is_active and btrim(subject)='형사법')
   else t.name in ('수사특채','경찰직 - 공채(순경)','경찰직 - 해경학과 항해(경장)','경찰직 - 해경학과 기관(경장)','경찰직 - 경위 공채(해양-기관)','경찰직 - 경위 공채(해양-항해)') end from track t
$$;
grant select on public.exam_subject_settings to service_role;
revoke all on function public.ox_normalize_grant_track(text),public.ox_grant_track_eligible(text) from public,anon,authenticated;
grant execute on function public.ox_normalize_grant_track(text),public.ox_grant_track_eligible(text) to service_role;

create or replace function public.ox_grant_targets(p_cohort text)
returns table(student_id text,student_name text,cohort text,class_name text) language sql stable security invoker set search_path='' as $$
 select t.* from (select s.id,s.name,case when s.cohort between 1 and 99 then s.cohort::text
   when s.id ~ '^[0-9]{4,5}$' then left(s.id,length(s.id)-3) else null end as cohort,s.class_name
   from public.students s where s.is_active and s.account_type='student' and s.student_category='offline'
     and public.ox_grant_track_eligible(s.track)) t
 where p_cohort is null or t.cohort=p_cohort
$$;

create or replace function public.ox_grant_admin(p_action text,p_actor jsonb,p_body jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 v_batch public.ox_grant_batches; v_cohort text:=nullif(p_body->>'cohort',''); v_ids text[]; v_count integer;
 v_students text[]; v_selected boolean:=p_body ? 'studentIds';
 v_actor text:=p_actor->>'id'; v_student text; v_end date; v_page integer:=coalesce((p_body->>'page')::integer,0);
begin
 if coalesce(p_actor->>'type','')<>'admin' or coalesce(v_actor,'')='' then raise exception 'forbidden'; end if;
 if v_page not between 0 and 10000 then raise exception 'invalid_request'; end if;
 if p_action in ('admin_grant_targets','admin_grant_preview') and
   (jsonb_typeof(p_body->'cohort') is distinct from 'string' or (v_cohort is not null and v_cohort !~ '^[0-9]{1,2}$')) then raise exception 'invalid_request'; end if;
 if p_action='admin_grant_targets' then
   return jsonb_build_object('ok',true,'items',coalesce((select jsonb_agg(to_jsonb(t) order by t.student_name,t.student_id) from (
     select r.*,public.ox_normalize_grant_track((select s.track from public.students s where s.id=r.student_id)) as track,
       coalesce((select jsonb_agg(lid order by lid) from (
         select btrim(a.lecture_id) as lid from public.lecture_applications a where a.approved_student_id=r.student_id and a.status='approved' and nullif(btrim(a.lecture_id),'') is not null
         union select f.lecture_id_normalized from public.final_score_identities f where f.student_id=r.student_id and nullif(btrim(f.lecture_id_normalized),'') is not null
       )ids),'[]'::jsonb) as lecture_ids,
       coalesce((select jsonb_agg(c) from unnest(array['criminal-law','criminal-procedure-investigation-evidence','criminal-procedure-trial'])c where public.ox_has_purchased_book(r.student_id,c)),'[]'::jsonb) as purchased,
       coalesce((select jsonb_agg(c) from unnest(array['criminal-law','criminal-procedure-investigation-evidence','criminal-procedure-trial'])c where public.ox_has_grant(r.student_id,c)),'[]'::jsonb) as granted,
       exists(select 1 from public.ox_members m where m.student_id=r.student_id and not m.allowed) as blocked
     from public.ox_grant_targets(v_cohort)r
   )t),'[]'::jsonb));
 end if;
 if p_action='admin_grant_preview' then
   if (v_cohort is not null and v_cohort !~ '^[0-9]{1,2}$') or jsonb_typeof(p_body->'collectionIds') is distinct from 'array'
     or length(trim(coalesce(p_body->>'reason',''))) not between 1 and 500 then raise exception 'invalid_request'; end if;
   select array_agg(value order by value) into v_ids from jsonb_array_elements_text(p_body->'collectionIds');
   if coalesce(cardinality(v_ids),0) not between 1 and 3 or not v_ids <@ array['criminal-law','criminal-procedure-investigation-evidence','criminal-procedure-trial']::text[]
     or cardinality(v_ids)<>(select count(distinct x) from unnest(v_ids)x) then raise exception 'invalid_request'; end if;
   v_end:=nullif(p_body->>'expiresOn','')::date;
   if v_end<(now() at time zone 'Asia/Seoul')::date then raise exception 'invalid_request'; end if;
   if v_selected then
     if jsonb_typeof(p_body->'studentIds') is distinct from 'array' then raise exception 'invalid_request'; end if;
     if jsonb_array_length(p_body->'studentIds') not between 1 and 10000 or exists(select 1 from jsonb_array_elements(p_body->'studentIds')x where jsonb_typeof(x) is distinct from 'string' or length(x#>>'{}') not between 1 and 120) then raise exception 'invalid_request'; end if;
     select array_agg(value order by value) into v_students from jsonb_array_elements_text(p_body->'studentIds');
     if cardinality(v_students)<>(select count(distinct x) from unnest(v_students)x) then raise exception 'invalid_request'; end if;
     if cardinality(v_students)<>(select count(*) from public.ox_grant_targets(v_cohort) where student_id=any(v_students)) then raise exception 'grant_target_changed'; end if;
   end if;
   select count(*) into v_count from public.ox_grant_targets(v_cohort) where not v_selected or student_id=any(v_students);
   if v_count=0 then raise exception 'grant_empty_targets'; end if;
   insert into public.ox_grant_batches(cohort,collection_ids,expires_on,reason,target_count,created_by,selection_mode)
     values(v_cohort,v_ids,v_end,trim(p_body->>'reason'),v_count,v_actor,case when v_selected then 'selected' else 'all' end) returning * into v_batch;
   insert into public.ox_grant_recipients(batch_id,student_id,student_name,cohort,class_name)
     select v_batch.id,t.* from public.ox_grant_targets(v_cohort)t where not v_selected or t.student_id=any(v_students);
   update public.ox_grant_batches set target_count=(select count(*) from public.ox_grant_recipients where batch_id=v_batch.id) where id=v_batch.id;
   if v_selected and cardinality(v_students)<>(select count(*) from public.ox_grant_recipients where batch_id=v_batch.id) then raise exception 'grant_target_changed'; end if;
   return jsonb_build_object('ok',true,'batchId',v_batch.id);
 end if;
 if p_action='admin_grant_list' then
   return jsonb_build_object('ok',true,'total',(select count(*) from public.ox_grant_batches where state<>'draft'),
     'items',coalesce((select jsonb_agg(to_jsonb(t) order by t.issued_at desc,t.id desc) from
       (select * from public.ox_grant_batches where state<>'draft' order by issued_at desc,id desc limit 20 offset v_page*20)t),'[]'::jsonb));
 end if;
 select * into v_batch from public.ox_grant_batches where id=(p_body->>'batchId')::uuid for update;
 if v_batch.id is null or (v_batch.state='draft' and v_batch.created_by<>v_actor) then raise exception 'grant_unavailable'; end if;
 if p_action='admin_grant_issue' then
   if v_batch.state='issued' then return jsonb_build_object('ok',true,'batchId',v_batch.id,'count',v_batch.target_count); end if;
   if v_batch.state<>'draft' or v_batch.created_at<now()-interval '10 minutes' then raise exception 'grant_preview_expired'; end if;
   if v_batch.expires_on<(now() at time zone 'Asia/Seoul')::date then raise exception 'grant_preview_expired'; end if;
   if v_batch.target_count<>(select count(*) from public.ox_grant_recipients where batch_id=v_batch.id) then raise exception 'grant_target_changed'; end if;
   if (select array_agg(student_id order by student_id) from public.ox_grant_targets(v_batch.cohort) where v_batch.selection_mode='all' or student_id in (select r.student_id from public.ox_grant_recipients r where r.batch_id=v_batch.id))
     is distinct from (select array_agg(student_id order by student_id) from public.ox_grant_recipients where batch_id=v_batch.id) then raise exception 'grant_target_changed'; end if;
   for v_student in select student_id from public.ox_grant_recipients where batch_id=v_batch.id order by student_id loop
     perform pg_advisory_xact_lock(hashtextextended('ox-member:'||v_student,0));
     insert into public.ox_members(student_id,allowed,updated_by) values(v_student,true,v_actor) on conflict do nothing;
   end loop;
   update public.ox_grant_batches set state='issued',issued_at=now() where id=v_batch.id;
   return jsonb_build_object('ok',true,'batchId',v_batch.id,'count',v_batch.target_count);
 end if;
 if p_action='admin_grant_revoke' then
   if length(trim(coalesce(p_body->>'reason',''))) not between 1 and 500 then raise exception 'invalid_request'; end if;
   if v_batch.state='revoked' then return jsonb_build_object('ok',true); end if;
   if v_batch.state<>'issued' then raise exception 'grant_unavailable'; end if;
   update public.ox_grant_batches set state='revoked',revoked_at=now(),revoked_by=v_actor,revoke_reason=trim(p_body->>'reason') where id=v_batch.id;
   return jsonb_build_object('ok',true);
 end if;
 if p_action='admin_grant_detail' then
   return jsonb_build_object('ok',true,'batch',to_jsonb(v_batch),'total',(select count(*) from public.ox_grant_recipients where batch_id=v_batch.id),
     'items',coalesce((select jsonb_agg(to_jsonb(t) order by t.student_name,t.student_id) from
       (select r.student_id,r.student_name,r.cohort,r.class_name,
         coalesce((select jsonb_agg(c) from unnest(v_batch.collection_ids)c where public.ox_has_purchased_book(r.student_id,c)),'[]'::jsonb) as purchased,
         coalesce((select jsonb_agg(c) from unnest(v_batch.collection_ids)c where public.ox_has_grant(r.student_id,c)),'[]'::jsonb) as granted,
         exists(select 1 from public.ox_members m where m.student_id=r.student_id and not m.allowed) as blocked
        from public.ox_grant_recipients r where r.batch_id=v_batch.id order by student_name,student_id limit 30 offset v_page*30)t),'[]'::jsonb));
 end if;
 raise exception 'unsupported_action';
end; $$;
revoke all on function public.ox_grant_admin(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ox_grant_admin(text,jsonb,jsonb) to service_role;
