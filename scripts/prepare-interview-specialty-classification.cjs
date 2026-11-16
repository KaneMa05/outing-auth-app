// Review preparation only. No network, publication, deployment or audio generation.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const md5=value=>crypto.createHash('md5').update(value).digest('hex');
function buildReview(snapshot){
  const baseline=read('supabase/seeds/interview-question-classification.json');
  const decisions=read('scripts/data/interview-specialty-classification-overrides.json');
  const original=[...read('supabase/seeds/interview-corpus.json').questions,...read('scripts/data/interview-additional-questions.json').questions];
  const source=new Map(original.map(q=>[q.id,q]));
  const current=new Map((snapshot?.questions||original).map(q=>[q.id,q]));
  const overrides=new Map(decisions.records.map(q=>[q.question_id,q]));
  if(current.size!==source.size||overrides.size!==decisions.records.length)throw Error('Incomplete snapshot or duplicate decision');
  const records=[],changes=[];
  for(const r of baseline.records){
    const q=current.get(r.question_id),raw=source.get(r.question_id),override=overrides.get(r.question_id);
    if(!q||!raw||q.prompt!==r.source_prompt||q.prompt!==raw.prompt)throw Error('classification_snapshot_conflict: '+r.question_id);
    if(override&&(override.source_prompt!==raw.prompt||override.source_category!==raw.category))throw Error('Stale specialty decision '+q.id);
    const category=override?.category||r.resolved_category||q.category;
    let topics=q.topic_ids||[];
    if(q.category!==category)topics=category==='job'?[]:override?.topic_ids||r.topic_ids;
    if(category==='job')topics=[];
    if(!['job','personality'].includes(category)||!Array.isArray(topics))throw Error('Invalid classification '+q.id);
    const row={question_id:q.id,source_prompt:q.prompt,source_category:raw.category,current_category:q.category,
      category,topic_ids:topics,classification_status:r.classification_status,
      subtype:override?.subtype||r.subtype,answer_type:override?(override.category==='personality'?(['opinion','practical'].includes(r.answer_type)?r.answer_type:override.subtype==='values_fit'?'opinion':'knowledge'):'knowledge'):r.answer_type,
      flags:r.flags,assessment_parts:(r.assessment_parts||[]).map(part=>override?.category==='personality'?{...part,category:'personality'}:part),
      method:override?'exact-question-specialty-law-v3':r.method,
      rationale:override?.rationale||r.rationale,changed:category!==raw.category,
      operation_needed:category!==q.category};
    records.push(row);
    if(row.operation_needed)changes.push({id:q.id,prompt:q.prompt,from:q.category,to:category,
      topic_ids:topics,revision:q.revision??1,status:q.status||'draft',tracks:q.tracks||[],
      question_md5:md5([q.prompt,q.category,(q.tracks||[]).join('\x1e'),(q.topic_ids||[]).join('\x1e'),q.status||'draft',String(q.revision??1)].join('\x1f')),
      sources_md5:q.sources_md5??null,rationale:row.rationale});
  }
  const normalized=new Map();
  for(const row of records){
    const key=row.source_prompt.normalize('NFKC').toLowerCase().replace(/[^가-힣a-z0-9]/g,'');
    if(key&&normalized.has(key)&&normalized.get(key)!==row.category)throw Error('Same question has inconsistent categories: '+row.source_prompt);
    if(key)normalized.set(key,row.category);
  }
  const count=(rows,key)=>rows.reduce((a,q)=>(a[q[key]]=(a[q[key]]||0)+1,a),{});
  return {version:'specialty-law-v3',confirmed_rule:decisions.confirmed_rule,
    report:{questions:records.length,categories:count(records,'category'),canonical_changes:records.filter(q=>q.changed).length,
      operation_changes:changes.length,transitions:count(changes.map(q=>({transition:q.from+'→'+q.to})),'transition'),
      publication_counts:count(changes,'status'),unresolved:records.filter(q=>q.classification_status==='needs_context').length},
    records,changes};
}
if(require.main===module){
  const args=process.argv.slice(2),snapshotAt=args.indexOf('--snapshot'),outputAt=args.indexOf('--output');
  const snapshot=snapshotAt<0?undefined:JSON.parse(fs.readFileSync(path.resolve(args[snapshotAt+1]),'utf8'));
  const result=buildReview(snapshot);
  const dest=path.resolve(outputAt<0?'supabase/seeds/interview-specialty-classification.json':args[outputAt+1]);
  fs.writeFileSync(dest,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result.report,null,2));
}
module.exports={buildReview};
