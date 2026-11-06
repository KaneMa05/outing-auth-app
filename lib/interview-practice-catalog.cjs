'use strict';
const {fields}=require('./interview-taxonomy.json');
const fieldIDs=new Set(fields.map(f=>f.id));
const tracks=new Set(['공채','항해','기관','방제','관제','기타']);
async function practiceCatalog(read,{track,mode}){
 if(!tracks.has(track)||!['job','personality','ai'].includes(mode))throw Error('invalid_request');
 const category=mode==='job'?'job':'personality',questions=[],personality=mode==='personality';
 let choices=fields,allowedFields=fieldIDs;
 if(personality){
  const query=new URLSearchParams({select:'id,title,tracks,active,sort_order',active:'eq.true',or:`(tracks.cs.{${track}},tracks.eq.{})`,order:'sort_order.asc,id.asc'});
  const topics=await read('GET','ip_topics?'+query);if(!Array.isArray(topics))throw Error('invalid_response');
  choices=topics.filter(t=>t.active===true&&Array.isArray(t.tracks)&&(!t.tracks.length||t.tracks.includes(track))&&typeof t.id==='string'&&typeof t.title==='string').map(t=>({id:t.id,label:t.title}));
  allowedFields=new Set(choices.map(t=>t.id));
 }
 // Fetch the complete authorized pool, rather than only the first 30 questions.
 for(let offset=0;;offset+=500){
  const query=new URLSearchParams({select:personality?'id,prompt,category,status,tracks,topic_ids':'id,prompt,category,status,tracks,taxonomy:ip_question_taxonomy(primary_field,related_fields,review_status,source_prompt,source_category),occurrences:ip_occurrences(region,source:ip_sources(track))',
   category:'eq.'+category,status:'eq.published',or:`(tracks.cs.{${track}},tracks.eq.{})`,order:'id.asc',limit:'500',offset:String(offset)});
  const batch=await read('GET','ip_questions?'+query);
  if(!Array.isArray(batch))throw Error('invalid_response');
  for(const q of batch){
   if(q.status!=='published'||q.category!==category||!Array.isArray(q.tracks)||q.tracks.length&&!q.tracks.includes(track))continue;
   const t=Array.isArray(q.taxonomy)?q.taxonomy[0]:q.taxonomy;
   const reviewed=t?.review_status==='classified'&&t.source_prompt===q.prompt&&t.source_category===q.category;
   const fieldIds=personality?[...new Set((Array.isArray(q.topic_ids)?q.topic_ids:[]).filter(id=>allowedFields.has(id)))]:reviewed?[...new Set([t.primary_field,...(t.related_fields||[])].filter(id=>fieldIDs.has(id)))]:[];
   const regions=[...new Set((q.occurrences||[]).filter(o=>o.source?.track===track).map(o=>(o.region||'').trim()).filter(Boolean))].sort();
   questions.push({id:q.id,prompt:q.prompt,category:q.category,tracks:q.tracks,fieldIds,regions});
  }
  if(batch.length<500)break;
 }
 const availableFieldIDs=new Set(questions.flatMap(q=>q.fieldIds));
 return {questions,fields:['job','personality'].includes(mode)?choices.filter(field=>availableFieldIDs.has(field.id)):[]};
}
module.exports={practiceCatalog};
