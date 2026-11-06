'use strict';
const {fields}=require('./interview-taxonomy.json');
const fieldIDs=new Set(fields.map(f=>f.id));
const tracks=new Set(['공채','항해','기관','방제','관제','기타']);
async function practiceCatalog(read,{track,mode}){
 if(!tracks.has(track)||!['job','personality','ai'].includes(mode))throw Error('invalid_request');
 const category=mode==='job'?'job':'personality',questions=[];
 // Fetch the complete authorized pool, rather than only the first 30 questions.
 for(let offset=0;;offset+=500){
  const query=new URLSearchParams({select:'id,prompt,category,status,tracks,taxonomy:ip_question_taxonomy(primary_field,related_fields,review_status,source_prompt,source_category),occurrences:ip_occurrences(region,source:ip_sources(track))',
   category:'eq.'+category,status:'eq.published',or:`(tracks.cs.{${track}},tracks.eq.{})`,order:'id.asc',limit:'500',offset:String(offset)});
  const batch=await read('GET','ip_questions?'+query);
  if(!Array.isArray(batch))throw Error('invalid_response');
  for(const q of batch){
   if(q.status!=='published'||q.category!==category||!Array.isArray(q.tracks)||q.tracks.length&&!q.tracks.includes(track))continue;
   const t=Array.isArray(q.taxonomy)?q.taxonomy[0]:q.taxonomy;
   const reviewed=t?.review_status==='classified'&&t.source_prompt===q.prompt&&t.source_category===q.category;
   const fieldIds=reviewed?[...new Set([t.primary_field,...(t.related_fields||[])].filter(id=>fieldIDs.has(id)))]:[];
   const regions=[...new Set((q.occurrences||[]).filter(o=>o.source?.track===track).map(o=>(o.region||'').trim()).filter(Boolean))].sort();
   questions.push({id:q.id,prompt:q.prompt,category:q.category,tracks:q.tracks,fieldIds,regions});
  }
  if(batch.length<500)break;
 }
 const availableFieldIDs=new Set(questions.flatMap(q=>q.fieldIds));
 return {questions,fields:mode==='job'?fields.filter(field=>availableFieldIDs.has(field.id)):[]};
}
module.exports={practiceCatalog};
