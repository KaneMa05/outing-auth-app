const crypto=require('node:crypto');
const options=require('../lib/interview-tracks.json');
function sourceTrackSql(review,{runId='20261102-original-source-tracks-v1',actorId='codex:source-track-split:20261102'}={}){
 const changes=review.changes;if(!Array.isArray(changes)||!changes.length||new Set(changes.map(q=>q.id)).size!==changes.length)throw Error('Unique nonempty change list required');
 for(const q of changes)if(!q.id||!q.question_md5||!q.sources_md5||!Array.isArray(q.to)||!q.to.length||q.to.some(t=>!options.includes(t)||t==='기타'))throw Error('Invalid source track change '+q.id);
 const value=JSON.stringify({run_id:runId,actor_id:actorId,changes:changes.map(q=>({id:q.id,tracks:q.to,status:q.status,revision:q.revision,question_md5:q.question_md5,sources_md5:q.sources_md5})),source:review.source,occurrences:review.occurrences});
 const tag='$tracks_'+crypto.createHash('sha256').update(value).digest('hex').slice(0,16)+'$';
 const protectedTables=['ip_sources','ip_occurrences','ip_notes','ip_topics','ip_members','ip_applications','ip_question_rubrics','ip_question_analysis','ip_writings','ip_writing_rounds','ip_life_profiles','ip_diagnosis_answers','ip_collections','ip_collection_items'];
 const protectedSql="jsonb_build_object("+protectedTables.map(t=>"'"+t+"',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text)::text,'[]')) from public."+t+" x)").join(',')+")";
 const sourceDigest="(select md5(string_agg(concat_ws(chr(31),o.id,o.source_id,s.track,o.section_title,o.original_prompt,o.answer,o.number,coalesce(o.year::text,'')),chr(30) order by o.id collate \"C\")) from public.ip_occurrences o join public.ip_sources s on s.id=o.source_id where o.question_id=t.id)";
 return `begin isolation level repeatable read;
set local lock_timeout='5s';set local statement_timeout='90s';
do $apply_tracks$
declare payload jsonb:=${tag}${value}${tag}::jsonb;
 t record;q public.ip_questions;before_q jsonb;actor jsonb;applied integer:=0;already integer:=0;ids text[];applied_ids text[]:='{}';outside_before text;outside_after text;protected_before jsonb;protected_after jsonb;counts_before jsonb;counts_after jsonb;
begin
 actor:=jsonb_build_object('type','admin','id',payload->>'actor_id');
 perform pg_advisory_xact_lock(hashtextextended('source-tracks:'||(payload->>'run_id'),0));
 select array_agg(x->>'id' order by x->>'id') into ids from jsonb_array_elements(payload->'changes') x;
 for t in select id from public.ip_questions where id=any(ids) order by id loop perform pg_advisory_xact_lock(hashtextextended('question:'||t.id,0));end loop;
 perform 1 from public.ip_questions where id=any(ids) order by id for update;
 if (select count(*) from public.ip_questions where id=any(ids))<>cardinality(ids) then raise exception 'source_track_question_missing';end if;
 if not exists(select 1 from public.ip_sources s where s.id=payload->'source'->>'id' and s.sha256=payload->'source'->>'sha256') then raise exception 'source_track_original_changed';end if;
 select md5(coalesce(jsonb_agg(to_jsonb(x) order by id)::text,'[]')) into outside_before from public.ip_questions x where not(id=any(ids));
 select ${protectedSql} into protected_before;
 select jsonb_agg(to_jsonb(x) order by category,status) into counts_before from(select category,status,count(*) count from public.ip_questions group by category,status)x;
 for t in select * from jsonb_to_recordset(payload->'changes') as x(id text,tracks text[],status text,revision integer,question_md5 text,sources_md5 text) order by id loop
  select * into q from public.ip_questions where id=t.id;
  if ${sourceDigest} is distinct from t.sources_md5 then raise exception 'source_track_provenance_conflict: %',t.id;end if;
  if q.tracks=t.tracks and q.status=t.status and exists(select 1 from public.ip_history h where h.entity='question_track_classification' and h.entity_id=t.id and h.snapshot->>'run_id'=payload->>'run_id' and h.snapshot->'after'=to_jsonb(q)) then already:=already+1;continue;end if;
  if md5(concat_ws(chr(31),q.prompt,q.category,array_to_string(q.tracks,chr(30)),array_to_string(q.topic_ids,chr(30)),q.status,q.revision::text))<>t.question_md5 then raise exception 'source_track_revision_conflict: %',t.id;end if;
  if not (array_remove(q.tracks,'기타') <@ t.tracks) then raise exception 'source_track_existing_assignment_lost: %',t.id;end if;
  before_q:=to_jsonb(q);
  perform public.ip_service('admin_question_save',actor,jsonb_build_object('id',q.id,'revision',q.revision,'prompt',q.prompt,'category',q.category,'topicIds',to_jsonb(q.topic_ids),'tracks',to_jsonb(t.tracks),'status',case when q.status='published' then 'draft' else q.status end));
  if t.status='published' then perform public.ip_question_publication_service('admin_question_publication',actor,jsonb_build_object('id',t.id,'revision',t.revision+1,'approved',true));end if;
  select * into q from public.ip_questions where id=t.id;
  if q.tracks<>t.tracks or q.revision<>t.revision+(case when t.status='published' then 2 else 1 end) or (to_jsonb(q)-'tracks'-'revision'-'updated_at') is distinct from (before_q-'tracks'-'revision'-'updated_at') then raise exception 'source_track_preservation_failed: %',t.id;end if;
  insert into public.ip_history(entity,entity_id,actor_id,snapshot) values('question_track_classification',q.id,actor->>'id',jsonb_build_object('run_id',payload->>'run_id','source',payload->'source','before',before_q,'after',to_jsonb(q),'occurrences',(select jsonb_agg(x) from jsonb_array_elements(payload->'occurrences') x where x->>'question_id'=q.id)));
  applied:=applied+1;applied_ids:=array_append(applied_ids,q.id);
 end loop;
 select md5(coalesce(jsonb_agg(to_jsonb(x) order by id)::text,'[]')) into outside_after from public.ip_questions x where not(id=any(ids));
 select ${protectedSql} into protected_after;
 if outside_before is distinct from outside_after or protected_before is distinct from protected_after then raise exception 'source_track_protected_content_changed';end if;
 select jsonb_agg(to_jsonb(x) order by category,status) into counts_after from(select category,status,count(*) count from public.ip_questions group by category,status)x;
 if counts_before is distinct from counts_after then raise exception 'source_track_publication_counts_changed';end if;
 if applied>0 then insert into public.ip_history(entity,entity_id,actor_id,snapshot) values('question_track_classification_run',payload->>'run_id',actor->>'id',jsonb_build_object('applied',applied,'already_applied',already,'expected',cardinality(ids),'counts',counts_after,'protected_content_unchanged',true,'unselected_questions_unchanged',true,'source',payload->'source'));end if;
end;
$apply_tracks$;
commit;`;
}
module.exports={sourceTrackSql};
