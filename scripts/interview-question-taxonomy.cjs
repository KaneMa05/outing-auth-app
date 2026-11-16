const crypto=require('node:crypto');
const {validateTaxonomy}=require('../lib/interview-taxonomy.cjs');
function taxonomySql(review,{actorId='codex:taxonomy:20261102'}={}){
 if(!review.run_id||!Array.isArray(review.rows)||!review.rows.length||new Set(review.rows.map(r=>r.id)).size!==review.rows.length)throw Error('Unique review rows required');
 for(const r of review.rows){
  if(!r.id||!r.prompt||r.category!=='job'||!['job','personality'].includes(r.target_category)||!Number.isInteger(r.revision)||r.revision<1||!['draft','published','archived'].includes(r.status)||!Array.isArray(r.tracks)||!r.sources_md5)throw Error('Invalid review row '+r.id);
  validateTaxonomy({action:'admin_question_taxonomy_save',id:r.id,questionRevision:r.revision,revision:0,...r.taxonomy});
 }
 const value=JSON.stringify({run_id:review.run_id,review_sha256:review.review_sha256,rows:review.rows,actor_id:actorId});
 const tag='$taxonomy_'+crypto.createHash('sha256').update(value).digest('hex').slice(0,16)+'$';
 const tables=['ip_sources','ip_occurrences','ip_notes','ip_topics','ip_members','ip_applications','ip_writings','ip_writing_rounds','ip_life_profiles','ip_diagnosis_answers','ip_collections','ip_collection_items','ip_settings'];
 const protectedSql='jsonb_build_object('+tables.map(t=>`'${t}',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text)::text,'[]')) from public.${t} x)`).concat(['ip_question_rubrics','ip_question_analysis'].map(t=>`'${t}',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by question_id)::text,'[]')) from public.${t} x where not(question_id=any(moved_ids)))`)).join(',')+')';
 return `begin isolation level repeatable read;
set local lock_timeout='5s';set local statement_timeout='120s';
do $apply_taxonomy$
declare payload jsonb:=${tag}${value}${tag}::jsonb;
 item jsonb;q public.ip_questions;before_q jsonb;after_t jsonb;actor jsonb;ids text[];moved_ids text[];source_hash text;
 outside_before text;outside_after text;protected_before jsonb;protected_after jsonb;rubric_before jsonb;analysis_before jsonb;applied integer:=0;moved integer:=0;
begin
 actor:=jsonb_build_object('type','admin','id',payload->>'actor_id');
 perform pg_advisory_xact_lock(hashtextextended('taxonomy-run:'||(payload->>'run_id'),0));
 if exists(select 1 from public.ip_history where entity='question_taxonomy_run' and entity_id=payload->>'run_id') then
  if (select count(*) from public.ip_history h join public.ip_questions audited_question on audited_question.id=h.entity_id join public.ip_question_taxonomy t on t.question_id=audited_question.id where h.entity='question_taxonomy_import' and h.snapshot->>'run_id'=payload->>'run_id' and h.snapshot->'after_question'=to_jsonb(audited_question) and h.snapshot->'after_taxonomy'=to_jsonb(t))<>jsonb_array_length(payload->'rows') then raise exception 'taxonomy_run_changed';end if;
  return;
 end if;
 select array_agg(x->>'id' order by x->>'id'),coalesce(array_agg(x->>'id') filter(where x->>'target_category'<>x->>'category'),'{}') into ids,moved_ids from jsonb_array_elements(payload->'rows') x;
 for item in select value from jsonb_array_elements(payload->'rows') order by value->>'id' loop perform pg_advisory_xact_lock(hashtextextended('question:'||(item->>'id'),0));end loop;
 perform 1 from public.ip_questions where id=any(ids) order by id for update;
 if (select count(*) from public.ip_questions where id=any(ids))<>cardinality(ids) then raise exception 'taxonomy_question_missing';end if;
 if exists(select 1 from public.ip_question_taxonomy where question_id=any(ids)) then raise exception 'taxonomy_existing_review';end if;
 select md5(coalesce(jsonb_agg(to_jsonb(x) order by id)::text,'[]')) into outside_before from public.ip_questions x where not(id=any(moved_ids));
 select ${protectedSql} into protected_before;
 for item in select value from jsonb_array_elements(payload->'rows') order by value->>'id' loop
  select * into q from public.ip_questions where id=item->>'id';
  if q.prompt is distinct from item->>'prompt' or q.category is distinct from item->>'category' or q.revision < (item->>'revision')::integer or to_jsonb(q.tracks) is distinct from item->'tracks' or cardinality(q.topic_ids)<>0 then raise exception 'taxonomy_revision_conflict: %',q.id;end if;
  select md5(string_agg(concat_ws(chr(31),o.id,o.source_id,s.track,o.section_title,o.original_prompt,o.answer,o.number,coalesce(o.year::text,'')),chr(30) order by o.id collate "C")) into source_hash from public.ip_occurrences o join public.ip_sources s on s.id=o.source_id where o.question_id=q.id;
  if source_hash is distinct from item->>'sources_md5' then raise exception 'taxonomy_source_conflict: %',q.id;end if;
  -- Preserve publication decisions made since review, after locking and verifying all reviewed content.
  item:=item||jsonb_build_object('revision',q.revision,'status',q.status);
  before_q:=to_jsonb(q);rubric_before:=null;analysis_before:=null;
  if q.category<>item->>'target_category' then
   select to_jsonb(x) into rubric_before from public.ip_question_rubrics x where question_id=q.id;
   select to_jsonb(x) into analysis_before from public.ip_question_analysis x where question_id=q.id;
   perform public.ip_service('admin_question_save',actor,jsonb_build_object('id',q.id,'revision',q.revision,'prompt',q.prompt,'category',item->>'target_category','topicIds',to_jsonb(q.topic_ids),'tracks',to_jsonb(q.tracks),'status',case when q.status='published' then 'draft' else q.status end));
   if item->>'status'='published' then perform public.ip_question_publication_service('admin_question_publication',actor,jsonb_build_object('id',q.id,'revision',q.revision+1,'approved',true));end if;
   select * into q from public.ip_questions where id=item->>'id';
   if q.category<>item->>'target_category' or q.revision<>(item->>'revision')::integer+(case when item->>'status'='published' then 2 else 1 end) or (to_jsonb(q)-'category'-'revision'-'updated_at') is distinct from (before_q-'category'-'revision'-'updated_at') then raise exception 'taxonomy_category_preservation_failed: %',q.id;end if;
   moved:=moved+1;
  end if;
  perform public.ip_taxonomy_service('admin_question_taxonomy_save',actor,item->'taxonomy'||jsonb_build_object('id',q.id,'questionRevision',q.revision,'revision',0));
  select to_jsonb(t) into after_t from public.ip_question_taxonomy t where question_id=q.id;
  insert into public.ip_history(entity,entity_id,actor_id,snapshot) values('question_taxonomy_import',q.id,actor->>'id',jsonb_build_object('run_id',payload->>'run_id','review_sha256',payload->>'review_sha256','before_question',before_q,'after_question',to_jsonb(q),'after_taxonomy',after_t,'rubric_before',rubric_before,'analysis_before',analysis_before));
  applied:=applied+1;
 end loop;
 select md5(coalesce(jsonb_agg(to_jsonb(x) order by id)::text,'[]')) into outside_after from public.ip_questions x where not(id=any(moved_ids));
 select ${protectedSql} into protected_after;
 if outside_before is distinct from outside_after or protected_before is distinct from protected_after then raise exception 'taxonomy_protected_data_changed';end if;
 if applied<>cardinality(ids) or moved<>cardinality(moved_ids) then raise exception 'taxonomy_count_mismatch';end if;
 insert into public.ip_history(entity,entity_id,actor_id,snapshot) values('question_taxonomy_run',payload->>'run_id',actor->>'id',jsonb_build_object('applied',applied,'moved_to_personality',moved,'held',(select count(*) from public.ip_question_taxonomy where question_id=any(ids) and review_status='needs_context'),'publication_preserved',true,'unselected_questions_unchanged',true,'protected_content_unchanged',true,'review_sha256',payload->>'review_sha256'));
end;
$apply_taxonomy$;
commit;`;
}
module.exports={taxonomySql};
