-- Original headings from 06_기타_면접 기출해설.hwpx; existing 기타 accounts retain access.
begin;
set local lock_timeout='5s';
create or replace function public.ip_track_matches(member_track text,content_tracks text[])
returns boolean language sql immutable security invoker set search_path='' as $match$
 select cardinality(coalesce(content_tracks,'{}'::text[]))=0
  or coalesce(member_track=any(content_tracks),false)
  or (member_track='기타' and content_tracks && array['구급(응급구조)','구조','항공','특공(전술)','전산','통신','특임','함정정비','간부','수사','홍보','정책','중국어']::text[])
  or (member_track=any(array['구급(응급구조)','구조','항공','특공(전술)','전산','통신','특임','함정정비','간부','수사','홍보','정책','중국어']::text[]) and '기타'=any(content_tracks));
$match$;
revoke all on function public.ip_track_matches(text,text[]) from public,anon,authenticated;
grant execute on function public.ip_track_matches(text,text[]) to service_role;
alter table public.ip_members drop constraint ip_members_track_check,
 add constraint ip_members_track_check check(track=any(array['공채','항해','기관','방제','관제','구급(응급구조)','구조','항공','특공(전술)','전산','통신','특임','함정정비','간부','수사','홍보','정책','중국어','기타']::text[]));
alter table public.ip_applications drop constraint ip_applications_track_check,
 add constraint ip_applications_track_check check(track=any(array['공채','항해','기관','방제','관제','구급(응급구조)','구조','항공','특공(전술)','전산','통신','특임','함정정비','간부','수사','홍보','정책','중국어','기타']::text[]));
-- Narrow substitutions preserve all existing authorization and unrelated service behavior.
do $migration$
declare spec jsonb; change jsonb; definition text; matches integer;
begin
 for spec in select value from jsonb_array_elements($specs$[{"signature":"public.ip_service(text,jsonb,jsonb)","replacements":[{"from":"array['공채','항해','기관','방제','관제','기타']::text[]","to":"array['공채','항해','기관','방제','관제','구급(응급구조)','구조','항공','특공(전술)','전산','통신','특임','함정정비','간부','수사','홍보','정책','중국어','기타']::text[]","count":2},{"from":"(cardinality(t.tracks)=0 or v_member.track=any(t.tracks))","to":"public.ip_track_matches(v_member.track,t.tracks)","count":1},{"from":"(cardinality(t.tracks)=0 or m.track=any(t.tracks))","to":"public.ip_track_matches(m.track,t.tracks)","count":1},{"from":"(cardinality(q.tracks)=0 or v_member.track=any(q.tracks))","to":"public.ip_track_matches(v_member.track,q.tracks)","count":1},{"from":"(cardinality(v_question.tracks)>0 and not(v_member.track=any(v_question.tracks)))","to":"(not public.ip_track_matches(v_member.track,v_question.tracks))","count":1},{"from":"(cardinality(tracks)=0 or v_member.track=any(tracks))","to":"public.ip_track_matches(v_member.track,tracks)","count":1}]},{"signature":"public.ip_portal_service(text,jsonb,jsonb)","replacements":[{"from":"('공채','항해','기관','방제','관제','기타')","to":"('공채','항해','기관','방제','관제','구급(응급구조)','구조','항공','특공(전술)','전산','통신','특임','함정정비','간부','수사','홍보','정책','중국어','기타')","count":1}]},{"signature":"public.ip_ai_service(text,jsonb,jsonb)","replacements":[{"from":"(cardinality(q.tracks)=0 or m.track=any(q.tracks))","to":"public.ip_track_matches(m.track,q.tracks)","count":1}]},{"signature":"public.ip_ai_readiness(text)","replacements":[{"from":"(cardinality(tracks)=0 or track=any(tracks))","to":"public.ip_track_matches(track,tracks)","count":1}]},{"signature":"public.ip_core_service(text,jsonb,jsonb)","replacements":[{"from":"(cardinality(q.tracks)=0 or v_track=any(q.tracks))","to":"public.ip_track_matches(v_track,q.tracks)","count":1}]},{"signature":"public.ip_live_service(text,jsonb,jsonb)","replacements":[{"from":"(cardinality(tracks)=0 or v_member.track=any(tracks))","to":"public.ip_track_matches(v_member.track,tracks)","count":2}]},{"signature":"public.ip_writing_service(text,jsonb,jsonb)","replacements":[{"from":"(cardinality(q.tracks)=0 or v_track=any(q.tracks))","to":"public.ip_track_matches(v_track,q.tracks)","count":1}]}]$specs$::jsonb) loop
  select pg_get_functiondef((spec->>'signature')::regprocedure) into definition;
  for change in select value from jsonb_array_elements(spec->'replacements') loop
   matches:=(length(definition)-length(replace(definition,change->>'from','')))/length(change->>'from');
   if matches<>(change->>'count')::integer then raise exception 'track_contract_changed: % %',spec->>'signature',change->>'from';end if;
   definition:=replace(definition,change->>'from',change->>'to');
  end loop;
  execute definition;
 end loop;
end;
$migration$;
commit;
