'use strict';
const {questionUsage}=require('./interview-question-usage.cjs');
const PAGE_SIZE=25;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const sources={
 drafts:{table:'ip_ai_requests',label:'답변 초안',select:'id,student_id,kind,created_at,ip_ai_jobs(status)',detail:'id,student_id,kind,created_at,sources,ip_ai_jobs(id,position,question,status,reason,result,attempts,updated_at,ip_ai_executions(id,dispatch_state,created_at,finished_at))'},
 questions:{table:'ip_draft_question_jobs',label:'인생그래프 후속 질문',select:'id,student_id,state,created_at,updated_at,questions',detail:'id,student_id,state,created_at,updated_at,experience,questions'},
 diagnosis:{table:'ip_pa_diagnoses',label:'핵심 25제 진단',select:'id,student_id,unit_id,status,error,created_at,finished_at',detail:'id,student_id,unit_id,status,error,created_at,finished_at,snapshot,report'},
 followup:{table:'ip_life_followup_requests',label:'경험 심화 질문·요약',select:'id,student_id,action,state,error,created_at,updated_at',detail:'id,student_id,session_id,source_hash,answer_revision,action,state,error,engine,model,usage,created_at,updated_at'},
 live:{table:'ip_live_runs',label:'AI 모의면접',select:'id,student_id,state,created_at',detail:'id,student_id,state,created_at,questions,turns,current_question'},
 job:{table:'ip_job_exam_attempts',label:'직무 답변 분석',optional:true,select:'id,student_id,state,created_at,completed_at',detail:'id,student_id,state,created_at,completed_at,question,report'},
 personality:{table:'ip_personality_attempts',label:'인성 답변 분석',optional:true,select:'id,student_id,state,created_at,completed_at',detail:'id,student_id,state,created_at,completed_at,question,report'},
 validation:{table:'ip_exam_reports',label:'관리자 채점 검증',optional:true,owner:'created_by',select:'id,created_by,question_id,state,error,created_at,completed_at',detail:'id,created_by,question_id,state,error,created_at,completed_at,report'}
};
const invalid=()=>{throw Error('invalid_request');};
function validate(body){
 if(body.targetStudentId!==undefined&&(typeof body.targetStudentId!=='string'||!body.targetStudentId.trim()||body.targetStudentId.length>120))invalid();
 if(body.source!==undefined&&!Object.hasOwn(sources,body.source))invalid();
 if(body.recordId!==undefined&&(!UUID.test(body.recordId)||!body.source))invalid();
 if(body.cursor!==undefined){
  if(typeof body.cursor!=='string'||body.cursor.length>600||!/^[A-Za-z0-9_-]+$/.test(body.cursor))invalid();
  try{const c=JSON.parse(Buffer.from(body.cursor,'base64url'));if(!UUID.test(c.id)||!Object.hasOwn(sources,c.source)||typeof c.at!=='string'||!/^\d{4}-\d\d-\d\dT[\d:.]+(?:Z|[+-]\d\d:\d\d)$/.test(c.at)||!Number.isFinite(Date.parse(c.at)))invalid();}
  catch{invalid();}
 }
}
const query=(table,fields)=>table+'?'+new URLSearchParams(fields);
const inFilter=ids=>'in.('+ids.map(id=>'"'+id.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"').join(',')+')';
const profileFields='student_id,updated_at,experiences:content->experiences';
function normalize(source,row){
 const s=sources[source];return {id:row.id,source,kind:row.kind||source,title:s.label,studentId:row.student_id||null,createdBy:row.created_by||null,
  createdAt:row.created_at,updatedAt:row.updated_at||row.finished_at||row.completed_at||null,
  statuses:row.ip_ai_jobs?.map(j=>j.status)||[row.status||row.state],error:row.error||null,subject:row.unit_id||row.question_id||row.action||null};
}
const fraction=value=>(value.match(/\.(\d+)/)?.[1]||'').padEnd(6,'0');
async function usage(body,actor,read){
 if(actor?.type!=='admin'||!actor.id)throw Error('forbidden');
 validate(body);
 const ownerFilter=s=>body.targetStudentId?{[s.owner||'student_id']:'eq.'+body.targetStudentId}:{};
 if(body.recordId){
  const s=sources[body.source];
  if(body.targetStudentId&&s.owner)throw Error('not_found');
  const rows=await read('GET',query(s.table,{select:s.detail,id:'eq.'+body.recordId,...ownerFilter(s),limit:'1'}));
  const row=rows[0];if(!row)throw Error('not_found');
  const record=normalize(body.source,row),sections=[];let studentUsage;
  const add=(title,value)=>{if(value!==undefined&&value!==null)sections.push({title,value});};
  if(body.source==='drafts'){
   add('생성 결과',(row.ip_ai_jobs||[]).sort((a,b)=>a.position-b.position).map(j=>({question:j.question,status:j.status,reason:j.reason,result:j.result,attempts:j.attempts,updatedAt:j.updated_at,executions:j.ip_ai_executions})));
   add('요청 당시 자료',row.sources);
   // Page receipts separately so the REST row limit never hides old retries.
   for(const [table,select,order,title] of [
    ['ip_ai_job_history','status,reason,result,sources,attempts,recorded_at','recorded_at.asc,id.asc','재요청 전 결과를 포함한 전체 처리 결과'],
    ['ip_ai_retries','created_at,request_key','created_at.asc,request_key.asc','학생 재요청 기록'],
    ['ip_ai_events','id,event,at','at.asc,id.asc','처리 이력']]){
    const all=[];let offset=0;
    for(;;){const batch=await read('GET',query(table,{select,request_id:'eq.'+row.id,order,limit:'500',offset:String(offset)}));all.push(...batch);if(batch.length<500)break;offset+=batch.length;}
    add(title,all);
   }
  }else if(body.source==='questions'){
   const profiles=await read('GET',query('ip_life_profiles',{select:profileFields,student_id:'eq.'+row.student_id,limit:'1'}));
   studentUsage=questionUsage(row.questions,profiles[0]);
   add('요청 당시 경험',row.experience);add('생성된 질문',row.questions);
  }
  else if(body.source==='diagnosis'){add('진단 결과',row.report);add('요청 당시 답변',row.snapshot);}
  else if(body.source==='followup'){
   const filters={session_id:'eq.'+row.session_id,source_hash:'eq.'+row.source_hash,answer_revision:'eq.'+row.answer_revision};
   // The legacy store links results to a version, not to an exact retry request.
   const table=row.action==='summarize'?'ip_life_followup_outputs':'ip_life_followup_questions',all=[];
   for(let offset=0;;offset+=500){const batch=await read('GET',query(table,{...filters,select:row.action==='summarize'?'result,created_at':'batch,topic,kind,text,refs,answer:ip_life_followup_answers(text,status,updated_at)',order:row.action==='summarize'?'created_at.asc,id.asc':'batch.asc,id.asc',limit:'500',offset:String(offset)}));all.push(...batch);if(batch.length<500)break;}
   const answerStates={answered:'답변 저장됨',unknown:'기억나지 않음',skipped:'건너뜀'};
   add(row.action==='summarize'?'동일 자료·답변 버전의 요약':'동일 자료 버전의 질문과 현재 저장 답변',row.action==='summarize'?all:all.map(q=>({batch:q.batch,topic:q.topic,kind:q.kind,question:q.text,refs:q.refs,studentAnswer:q.answer?.text||'',answerState:q.answer?answerStates[q.answer.status]||'상태 확인 필요':'저장된 답변 없음',savedAt:q.answer?.updated_at||null})));
   add('사용 모델',row.model);add('사용량',row.usage);
  }else if(body.source==='live'){add('면접 질문',row.questions);add('진행한 질문과 답변',row.turns);add('마지막 질문',row.current_question);}
  else {add('질문',row.question||row.question_id);add('분석 결과',row.report);}
  return {ok:true,record,sections,...(studentUsage?{studentUsage}:{})};
 }
 const cursor=body.cursor?JSON.parse(Buffer.from(body.cursor,'base64url')):null;
 const keys=Object.keys(sources).filter(key=>(!body.source||body.source===key)&&(!body.targetStudentId||!sources[key].owner));
 const unavailable=[],questionJobs=new Map();
 const batches=await Promise.all(keys.map(async key=>{
  const s=sources[key],fields={select:s.select,...ownerFilter(s),order:'created_at.desc,id.desc',limit:String(PAGE_SIZE+1)};
  if(cursor){
   // Stable merged ordering: timestamp descending, source ascending, UUID descending.
   // Keep Postgres microseconds verbatim in the cursor.
   const same=key<cursor.source?'':key===cursor.source?`,and(created_at.eq.${cursor.at},id.lt.${cursor.id})`:`,created_at.eq.${cursor.at}`;
   fields.or=`(created_at.lt.${cursor.at}${same})`;
  }
  try{return (await read('GET',query(s.table,fields))).map(row=>{if(key==='questions')questionJobs.set(row.id,row.questions);return normalize(key,row);});}
  catch(e){if(s.optional&&e.storeStatus===404){unavailable.push(key);return [];}throw e;}
 }));
 const all=batches.flat().sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)||fraction(b.createdAt).localeCompare(fraction(a.createdAt))||a.source.localeCompare(b.source)||b.id.localeCompare(a.id));
 const records=all.slice(0,PAGE_SIZE),last=records.at(-1);
 const ids=[...new Set(records.map(r=>r.studentId).filter(Boolean))];
 if(ids.length){
  const studentIds=[...new Set(records.filter(r=>r.source==='questions').map(r=>r.studentId).filter(Boolean))];
  const [names,profiles]=await Promise.all([
   read('GET',query('ip_student_directory',{select:'id,name',id:inFilter(ids),limit:String(PAGE_SIZE)})),
   studentIds.length?read('GET',query('ip_life_profiles',{select:profileFields,student_id:inFilter(studentIds),limit:String(PAGE_SIZE)})):Promise.resolve([])
  ]);
  const lookup=new Map(names.map(n=>[n.id,n.name]));records.forEach(r=>{r.studentName=lookup.get(r.studentId)||r.studentId;});
  const saved=new Map(profiles.map(p=>[p.student_id,p]));
  for(const r of records)if(r.source==='questions'){
   const usage=questionUsage(questionJobs.get(r.id),saved.get(r.studentId));
   r.studentUsage={profileAvailable:usage.profileAvailable,savedAt:usage.savedAt,questionCount:usage.questionCount,addedQuestionCount:usage.addedQuestionCount,savedAnswerCount:usage.savedAnswerCount};
  }
 }
 return {ok:true,records,pageSize:PAGE_SIZE,nextCursor:all.length>PAGE_SIZE?Buffer.from(JSON.stringify({at:last.createdAt,source:last.source,id:last.id})).toString('base64url'):null,
  sources:Object.entries(sources).filter(([,s])=>!body.targetStudentId||!s.owner).map(([id,s])=>({id,title:s.label})),unavailable};
}
module.exports={usage,validate,sources};
