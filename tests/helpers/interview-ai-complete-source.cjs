// Explicit synthetic local fixtures, never production student data.
const templates={experience:['situation','role','action','result','learning'],value:['position','reason','application'],situation:['criteria','steps','caution']};
module.exports=async(invoke,studentId,{experienceCount=3,structuredBasic=false}={})=>{
 const actor={type:'student',id:studentId},bootstrap=await invoke('bootstrap',actor);
 for(const topic of bootstrap.topics){
  const n=bootstrap.notes.find(n=>n.topic_id===topic.id);
  await invoke('note_save',actor,{topicId:topic.id,topicRevision:topic.revision,revision:n?.revision||0,status:'draft',
   fields:Object.fromEntries(templates[topic.kind].map(key=>[key,n?.fields[key]?.trim().length>=10?n.fields[key]:`테스트 학생 본인의 구체적인 기록입니다. ${topic.id} ${key}`]))});
 }
 const profile=(await invoke('life_get',actor)).profile;
 await invoke('life_save',actor,{revision:profile?.revision||0,status:'draft',content:{
  background:'저장 순서와 실패 보존을 검증하는 전공 기록',qualifications:[],affiliations:[],awards:[],none:['qualifications','affiliations','awards'],
  ...(structuredBasic?{basicInfo:Object.fromEntries(['school','major','clubs','volunteering','internships','company','role','achievements'].map(k=>[k,{text:k==='school'?'저장 순서와 실패 보존을 검증하는 전공 기록':'',none:k!=='school'}]))}:{}),
  experiences:Array.from({length:experienceCount},(_,i)=>({id:'qa-exp-'+i,age:'23',title:'경험 '+i,
   content:'실제 상황과 직접 행동 및 실제 결과 '+i,appeal:'배운 점과 발휘한 강점 '+i,competencyIds:[]}))
 }});
};
