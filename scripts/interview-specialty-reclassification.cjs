// Operational preparation only; excluded from hosting with the scripts directory.
// Builds an atomic operation; never connects to a DB or changes production.
const crypto=require('node:crypto');
function sqlJson(value){
 const text=JSON.stringify(value);
 let name='classification_'+crypto.createHash('sha256').update(text).digest('hex').slice(0,16);
 while(text.includes('$'+name+'$'))name+='x';
 return '$'+name+'$'+text+'$'+name+'$::jsonb';
}
function reclassificationSql(changes,{runId='20261102-specialty-law-v3',actorId='codex:specialty-classification:20261102'}={}){
 if(!changes.length)throw Error('No classification changes to apply');
 const expected=changes.map(q=>({id:q.id,target_category:q.to,topic_ids:q.topic_ids,revision:q.revision,status:q.status,question_md5:q.question_md5,sources_md5:q.sources_md5,rationale:q.rationale}));
 if(new Set(expected.map(q=>q.id)).size!==expected.length)throw Error('Duplicate targets');
 const record="jsonb_to_recordset(expected) as e(id text,target_category text,topic_ids jsonb,revision integer,status text,question_md5 text,sources_md5 text,rationale text)";
 const digest="md5(concat_ws(chr(31),q.prompt,q.category,array_to_string(q.tracks,chr(30)),array_to_string(q.topic_ids,chr(30)),q.status,q.revision::text))";
 const source="(select md5(string_agg(concat_ws(chr(31),o.id,o.source_id,s.track,o.section_title,o.original_prompt,o.answer,o.number,coalesce(o.year::text,'')),chr(30) order by o.id collate \"C\")) from public.ip_occurrences o join public.ip_sources s on s.id=o.source_id where o.question_id=t.id)";
 const protectedSql="select jsonb_build_object('sources',(select md5(coalesce(string_agg(to_jsonb(x)::text,E'\\n' order by to_jsonb(x)::text),'')) from public.ip_sources x),'occurrences',(select md5(coalesce(string_agg(to_jsonb(x)::text,E'\\n' order by to_jsonb(x)::text),'')) from public.ip_occurrences x),'notes',(select md5(coalesce(string_agg(to_jsonb(x)::text,E'\\n' order by to_jsonb(x)::text),'')) from public.ip_notes x),'topics',(select md5(coalesce(string_agg(to_jsonb(x)::text,E'\\n' order by to_jsonb(x)::text),'')) from public.ip_topics x),'other_rubrics',(select md5(coalesce(string_agg(to_jsonb(x)::text,E'\\n' order by to_jsonb(x)::text),'')) from public.ip_question_rubrics x where not(x.question_id=any(targets))),'other_analysis',(select md5(coalesce(string_agg(to_jsonb(x)::text,E'\\n' order by to_jsonb(x)::text),'')) from public.ip_question_analysis x where not(x.question_id=any(targets))))";
 return [
  "begin isolation level repeatable read;",
  "set local lock_timeout='5s';set local statement_timeout='90s';",
  "do $classification_action$",
  "declare",
  " expected jsonb:="+sqlJson(expected)+";",
  " actor jsonb:="+sqlJson({type:'admin',id:actorId})+";",
  " run_id text:="+sqlJson(runId)+"#>>'{}';",
  " targets text[];applied_ids text[]:='{}';t record;q public.ip_questions;new_q public.ip_questions;",
  " before_questions jsonb;before_other jsonb;after_other jsonb;before_rubrics jsonb;before_analysis jsonb;",
  " protected_before jsonb;protected_after jsonb;before_counts jsonb;after_counts jsonb;applied integer:=0;already_applied integer:=0;",
  "begin",
  " select array_agg(e->>'id' order by e->>'id') into targets from jsonb_array_elements(expected)e;",
  " for t in select * from "+record+" order by id loop",
  "  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('question:'||t.id,0));",
  " end loop;",
  " for t in select * from "+record+" order by id loop",
  "  select * into q from public.ip_questions where id=t.id for update;",
  "  if not found then raise exception 'classification_snapshot_conflict: %',t.id;end if;",
  "  if q.category=t.target_category and to_jsonb(q.topic_ids)=t.topic_ids and q.status=t.status",
  "   and exists(select 1 from public.ip_history h where h.entity='question_classification' and h.entity_id=t.id and h.actor_id=actor->>'id' and h.snapshot->>'run_id'=run_id and h.snapshot->'after'=to_jsonb(q)) then",
  "   already_applied:=already_applied+1;continue;",
  "  end if;",
  "  if q.category=t.target_category or "+digest+" is distinct from t.question_md5 or "+source+" is distinct from t.sources_md5 then raise exception 'classification_snapshot_conflict: %',t.id;end if;",
  "  if t.target_category not in ('job','personality') or (t.target_category='job' and jsonb_array_length(t.topic_ids)<>0) or exists(select 1 from jsonb_array_elements_text(t.topic_ids) e where not exists(select 1 from public.ip_topics x where x.id=e and x.active)) then raise exception 'invalid_classification_target: %',t.id;end if;",
  " end loop;",
  " select jsonb_object_agg(x.id,to_jsonb(x)) into before_questions from public.ip_questions x where x.id=any(targets);",
  " select coalesce(jsonb_object_agg(x.id,to_jsonb(x)),'{}'::jsonb) into before_other from public.ip_questions x where not(x.id=any(targets));",
  " select coalesce(jsonb_object_agg(x.question_id,to_jsonb(x)),'{}'::jsonb) into before_rubrics from public.ip_question_rubrics x where x.question_id=any(targets);",
  " select coalesce(jsonb_object_agg(x.question_id,to_jsonb(x)),'{}'::jsonb) into before_analysis from public.ip_question_analysis x where x.question_id=any(targets);",
  " "+protectedSql+" into protected_before;",
  " select jsonb_agg(to_jsonb(x) order by category,status) into before_counts from(select category,status,count(*) as count from public.ip_questions group by category,status)x;",
  " for t in select * from "+record+" order by id loop",
  "  select * into q from public.ip_questions where id=t.id;",
  "  if q.category=t.target_category then continue;end if;",
  "  perform public.ip_service('admin_question_save',actor,jsonb_build_object('id',q.id,'revision',q.revision,'prompt',q.prompt,'category',t.target_category,'topicIds',t.topic_ids,'tracks',to_jsonb(q.tracks),'status',case when q.status='published' then 'draft' else q.status end));",
  "  if q.status='published' then",
  "   perform public.ip_question_publication_service('admin_question_publication',actor,jsonb_build_object('id',q.id,'revision',q.revision+1,'approved',true));",
  "  end if;",
  "  select * into new_q from public.ip_questions where id=q.id;",
  "  if new_q.category<>t.target_category or to_jsonb(new_q.topic_ids)<>t.topic_ids or new_q.status<>q.status",
  "   or new_q.revision<>q.revision+(case when q.status='published' then 2 else 1 end)",
  "   or(to_jsonb(new_q)-array['category','topic_ids','revision','updated_at']) is distinct from(to_jsonb(q)-array['category','topic_ids','revision','updated_at']) then raise exception 'classification_result_mismatch: %',q.id;end if;",
  "  insert into public.ip_history(entity,entity_id,actor_id,snapshot) values('question_classification',q.id,actor->>'id',jsonb_build_object('run_id',run_id,'before',to_jsonb(q),'after',to_jsonb(new_q),'category',t.target_category,'topic_ids',t.topic_ids,'rationale',t.rationale,'prior_rubric',before_rubrics->q.id,'prior_analysis',before_analysis->q.id));",
  "  applied:=applied+1;",
  "  applied_ids:=array_append(applied_ids,q.id);",
  " end loop;",
  " select coalesce(jsonb_object_agg(x.id,to_jsonb(x)),'{}'::jsonb) into after_other from public.ip_questions x where not(x.id=any(targets));",
  " if before_other is distinct from after_other then raise exception 'unselected_question_changed';end if;",
  " "+protectedSql+" into protected_after;",
  " if protected_before is distinct from protected_after then raise exception 'protected_content_changed';end if;",
  " if exists(select 1 from public.ip_question_rubrics x where x.question_id=any(applied_ids) and not(x.status='draft' and x.reviewer='' and x.reviewed_at is null)) or exists(select 1 from public.ip_question_analysis x where x.question_id=any(applied_ids) and not(x.status='draft' and x.reviewer='' and x.reviewed_at is null)) then raise exception 'classification_review_not_invalidated';end if;",
  " select jsonb_agg(to_jsonb(x) order by category,status) into after_counts from(select category,status,count(*) as count from public.ip_questions group by category,status)x;",
  " if applied>0 then insert into public.ip_history(entity,entity_id,actor_id,snapshot) values('question_classification_run',run_id,actor->>'id',jsonb_build_object('applied',applied,'already_applied',already_applied,'expected',expected,'before_questions',before_questions,'before_counts',before_counts,'after_counts',after_counts,'source_and_student_notes_unchanged',true,'unselected_questions_unchanged',true));end if;",
  "end;$classification_action$;commit;"
 ].join('\n');
}
module.exports={reclassificationSql};
