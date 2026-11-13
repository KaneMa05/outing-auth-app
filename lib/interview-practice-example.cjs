'use strict';
const {practiceCatalog}=require('./interview-practice-catalog.cjs');
async function practiceExample(read,{actor,track,mode,questionId,questionPrompt}){
 if(actor?.type!=='student'||actor.testApp!==true)throw Object.assign(Error('forbidden'),{status:403});
 if(!['job','personality'].includes(mode)||typeof questionId!=='string'||questionId.length>120||typeof questionPrompt!=='string'||!questionPrompt.trim()||questionPrompt.length>4000)throw Object.assign(Error('invalid_request'),{status:400});
 const catalog=await practiceCatalog(read,{track,mode,testOnly:true});
 if(!catalog.questions.some(q=>q.id===questionId&&q.prompt===questionPrompt))throw Object.assign(Error('question_unavailable'),{status:409});
 for(const preferred of [true,false]){
  const query=new URLSearchParams({select:'id,answer,source:ip_sources!inner(track)',question_id:'eq.'+questionId,answer:'not.is.null',order:'id.asc',limit:'100'});
  if(preferred)query.set('source.track','eq.'+track);
  const rows=await read('GET','ip_occurrences?'+query);if(!Array.isArray(rows))throw Error('invalid_response');
  const example=rows.find(r=>typeof r.answer==='string'&&r.answer.trim().length>20&&r.answer.length<=20000);
  if(example)return {ok:true,accountId:actor.id,referenceAnswer:example.answer};
 }
 return {ok:true,accountId:actor.id,referenceAnswer:null};
}
module.exports={practiceExample};
