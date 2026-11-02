const assert=require('node:assert/strict');
const fs=require('node:fs');
const {usage,validate,sources}=require('../lib/interview-ai-usage.cjs');
const {createHandler}=require('../api/interview-prep');
const auth=require('../api/teacher-auth-utils');
(async()=>{
 let calls=0;
 const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
 const paths=[];
 const read=async(method,path)=>{
  calls++;paths.push(path);assert.equal(method,'GET');
  const [table,search]=path.split('?'),q=new URLSearchParams(search);
  if(table==='ip_student_directory')return [{id:'student,&other',name:'학생'}];
  assert.equal(q.get('student_id'),'eq.student,&other');
  if(q.get('id'))return [{id:id(1),student_id:'student,&other',state:'completed',created_at:'2026-10-27T01:00:00.000123+00:00',experience:{title:'경험'},questions:['<script>질문</script>']}];
  assert.equal(q.get('limit'),'26');
  if(table==='ip_ai_requests')return [{id:id(1),student_id:'student,&other',kind:'self_intro',created_at:'2026-10-27T01:00:00.000123+00:00',ip_ai_jobs:[{status:'COMPLETED'}]}];
  if(table==='ip_draft_question_jobs')return [{id:id(2),student_id:'student,&other',state:'failed',created_at:'2026-10-27T01:00:00.000124+00:00'}];
  return [];
 };
 const actor={type:'admin',id:'reader'};
 await assert.rejects(usage({targetStudentId:'x'},{type:'student'},read),/forbidden/);assert.equal(calls,0);
 const result=await usage({targetStudentId:'student,&other'},actor,read);
 assert.equal(calls,8);assert.equal(result.records.length,2);assert.equal(result.records[0].source,'questions');assert.deepEqual(result.records[1].statuses,['COMPLETED']);assert.equal(result.records[0].studentName,'학생');
 const detail=await usage({targetStudentId:'student,&other',source:'questions',recordId:id(1)},actor,read);assert.equal(detail.sections[1].value[0],'<script>질문</script>');
 assert(!JSON.stringify(detail).includes('lease'));
 for(const bad of [{source:'nope'},{recordId:id(1)},{source:'questions',recordId:'bad'},{cursor:'bad'},{targetStudentId:''},{cursor:Buffer.from(JSON.stringify({id:id(1),source:'questions',at:'x)'})).toString('base64url')}])assert.throws(()=>validate(bad),/invalid_request/);
 await assert.rejects(usage({source:'questions',recordId:id(9)},actor,async()=>[]),/not_found/);
 const many=await usage({targetStudentId:'student,&other',source:'questions'},actor,async(method,path)=>path.startsWith('ip_student_directory')?[]:Array.from({length:26},(_,i)=>({id:id(100-i),student_id:'student,&other',state:'completed',created_at:'2026-10-27T01:00:00.000123+00:00'})));
 assert.equal(many.records.length,25);assert(many.nextCursor);
 paths.length=0;await usage({targetStudentId:'student,&other',cursor:many.nextCursor},actor,read);
 for(const path of paths.filter(p=>!p.startsWith('ip_student_directory'))){const q=new URLSearchParams(path.split('?')[1]);assert(q.get('or').includes('00.000123+00:00'));}
 const partial=await usage({},actor,async(method,path)=>{if(path.startsWith('ip_personality_attempts'))throw Object.assign(Error('missing table'),{storeStatus:404});return [];});
 assert.deepEqual(partial.unavailable,['personality']);
 await assert.rejects(usage({},actor,async()=>{throw Object.assign(Error('outage'),{storeStatus:503});}),/outage/);
 const previous=process.env.TEACHER_SESSION_SECRET;process.env.TEACHER_SESSION_SECRET='ai-usage-test';
 try{
  const handler=createHandler({read});
  async function call(user,body={action:'admin_ai_usage',targetStudentId:'student,&other'}){
   let status,data;const token=user?auth.createSessionToken(process.env.TEACHER_SESSION_SECRET,user):'';
   await handler({method:'POST',headers:{host:'local',origin:'http://local',cookie:auth.COOKIE_NAME+'='+token},body},{setHeader(){},status(n){status=n;return this;},json(d){data=d;}});
   return {status,data};
  }
  calls=0;
  for(const user of [null,{username:'teacher',role:'teacher',permissions:['interview.read']},{username:'admin',role:'admin',permissions:[]}])assert([401,403].includes((await call(user)).status));
  assert.equal(calls,0);
  const reader={username:'reader',role:'admin',permissions:['interview.read']};
  assert.equal((await call(reader)).status,200);assert.equal(calls,8);
  assert.equal((await call(reader,{action:'admin_ai_usage',source:'bad'})).status,400);
  const globalHandler=createHandler({read:async()=>[]});let status;
  await globalHandler({method:'POST',headers:{host:'local',cookie:auth.COOKIE_NAME+'='+auth.createSessionToken(process.env.TEACHER_SESSION_SECRET,reader)},body:{action:'admin_ai_usage'}},{setHeader(){},status(n){status=n;return this;},json(){}});assert.equal(status,200);
 }finally{if(previous===undefined)delete process.env.TEACHER_SESSION_SECRET;else process.env.TEACHER_SESSION_SECRET=previous;}
 const {mountAIUsage}=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('interview-ai-usage.js','utf8')).toString('base64'));
 const host={innerHTML:'',onclick:null};
 const view=mountAIUsage(host,{studentId:'a',request:async()=>result});await view.ready;
 assert(host.innerHTML.includes('생성 실패'));assert(host.innerHTML.includes('생성 완료'));assert(host.innerHTML.includes('결과 보기'));assert(host.innerHTML.includes('전체 생성 기록'));view.destroy();
 const failed=mountAIUsage(host,{request:async()=>{throw Error('offline');}});await failed.ready;
 assert(host.innerHTML.includes('불러오지 못했습니다'));assert(!host.innerHTML.includes('요청 기록 없음'));failed.destroy();
 let resolve;const pending=mountAIUsage(host,{request:()=>new Promise(r=>resolve=r)});pending.destroy();host.innerHTML='new student';resolve(result);await pending.ready;assert.equal(host.innerHTML,'new student');
 console.log('PASS AI history: admin permissions, all sources, result access, student isolation, microsecond cursors, optional stores, errors and stale responses');
})().catch(e=>{console.error(e);process.exitCode=1;});
