const fs=require('node:fs'),crypto=require('node:crypto');
const evidence=require('./data/interview-source-track-sections.json');
const options=require('../lib/interview-tracks.json');
const corpus=require('../supabase/seeds/interview-corpus.json');
const hash=s=>crypto.createHash('md5').update(s).digest('hex');
function buildSourceTrackReview(snapshot){
 if(!Array.isArray(snapshot?.questions)||!Array.isArray(snapshot?.occurrences)||!Array.isArray(snapshot?.sources))throw Error('Full live snapshot required');
 const source=snapshot.sources.find(s=>s.id===evidence.source.id);
 if(!source||source.sha256!==evidence.source.sha256||source.filename!==evidence.source.filename)throw Error('Original source fingerprint changed');
 const local=corpus.occurrences.filter(o=>o.source_id===source.id),live=snapshot.occurrences.filter(o=>o.source_id===source.id);
 if(local.length!==evidence.occurrence_count||live.length!==local.length)throw Error('Original occurrence coverage changed');
 const localById=new Map(local.map(o=>[o.id,o])),byQuestion=new Map(),counts={},links=[];
 for(const o of live){
  const original=localById.get(o.id);
  for(const key of ['question_id','locator','original_prompt','section_title','number'])if(!original||o[key]!==original[key])throw Error('Original occurrence changed: '+o.id);
  const m=/^(Contents\/section\d+\.xml):paragraph:(\d+)$/.exec(o.locator);if(!m)throw Error('Unknown locator '+o.id);
  const section=evidence.sections.filter(s=>s.section===m[1]&&s.paragraph<Number(m[2])).at(-1);
  if(!section||!options.includes(section.track))throw Error('Missing source track '+o.id);
  if(!byQuestion.has(o.question_id))byQuestion.set(o.question_id,new Set());byQuestion.get(o.question_id).add(section.track);
  counts[section.track]=(counts[section.track]||0)+1;
  links.push({id:o.id,question_id:o.question_id,locator:o.locator,track:section.track,heading_paragraph:section.paragraph});
 }
 if(byQuestion.size!==evidence.question_count)throw Error('Question coverage changed');
 const questions=new Map(snapshot.questions.map(q=>[q.id,q])),imported=new Map(corpus.questions.map(q=>[q.id,q]));if(questions.size!==snapshot.questions.length)throw Error('Duplicate question ID');
 const changes=[],statusCounts={},trackQuestionCounts={};
 for(const [id,tracks] of byQuestion){
  const q=questions.get(id);if(!q)throw Error('Question missing '+id);
  if(q.prompt!==imported.get(id)?.prompt)throw Error('Question text changed '+id);
  if(q.tracks.some(t=>!options.includes(t)))throw Error('Unknown existing track '+id);
  const target=options.filter(t=>t!=='기타'&&(q.tracks.filter(t=>t!=='기타').includes(t)||tracks.has(t)));
  for(const track of tracks)trackQuestionCounts[track]=(trackQuestionCounts[track]||0)+1;
  if(JSON.stringify(target)===JSON.stringify(q.tracks))continue;
  if(!q.tracks.includes('기타'))throw Error('Unexpected manual track edit '+id);
  statusCounts[q.status]=(statusCounts[q.status]||0)+1;
  changes.push({id,prompt:q.prompt,category:q.category,topic_ids:q.topic_ids,from:q.tracks,to:target,status:q.status,revision:q.revision,sources_md5:q.sources_md5,
   question_md5:hash([q.prompt,q.category,q.tracks.join('\x1e'),q.topic_ids.join('\x1e'),q.status,String(q.revision)].join('\x1f'))});
 }
 const uncovered=snapshot.questions.filter(q=>q.tracks.includes('기타')&&!byQuestion.has(q.id)).map(q=>q.id);
 return {version:1,source:evidence.source,report:{source_occurrences:live.length,source_questions:byQuestion.size,changes:changes.length,publication_states:statusCounts,occurrences_by_track:counts,questions_by_track:trackQuestionCounts,unmapped_legacy_questions:uncovered},changes:changes.sort((a,b)=>a.id.localeCompare(b.id)),occurrences:links};
}
if(require.main===module){
 const args=process.argv.slice(2),snapshot=args[args.indexOf('--snapshot')+1],output=args[args.indexOf('--output')+1];
 if(!args.includes('--snapshot')||!args.includes('--output'))throw Error('Use --snapshot <json> --output <json>; no database writes are performed');
 const review=buildSourceTrackReview(JSON.parse(fs.readFileSync(snapshot,'utf8').replace(/^\uFEFF/,'')));
 fs.writeFileSync(output,JSON.stringify(review,null,2)+'\n');console.log(JSON.stringify(review.report,null,2));
}
module.exports={buildSourceTrackReview};
