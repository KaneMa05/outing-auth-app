const assert=require('node:assert/strict');
const fs=require('node:fs');
const {usage}=require('../lib/interview-ai-usage.cjs');
const {createHandler}=require('../api/interview-prep');
const auth=require('../api/teacher-auth-utils');
(async()=>{
 let calls=0;
 const read=async(method,path)=>{
  calls++;assert.equal(method,'GET');
  const q=new URLSearchParams(path.split('?')[1]);
  assert.equal(q.get('student_id'),'eq."student,&other"');
  assert.equal(q.get('limit'),'1');assert.equal(q.get('select'),'created_at,ip_ai_jobs(status)');
  return q.get('kind')==='eq.self_intro'?[{created_at:'2026-10-27T01:00:00Z',ip_ai_jobs:[{status:'COMPLETED'}]}]:[];
 };
 const actor={type:'admin',id:'reader'};
 await assert.rejects(usage({targetStudentId:'x'},{type:'student'},read),/forbidden/);assert.equal(calls,0);
 const result=await usage({targetStudentId:'student,&other'},actor,read);
 assert.equal(calls,4);assert.equal(result.items[0].requested,true);assert.deepEqual(result.items[0].statuses,['COMPLETED']);assert.equal(result.items[1].requested,false);
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
  assert.equal((await call(reader)).status,200);assert.equal(calls,4);
  assert.equal((await call(reader,{action:'admin_ai_usage'})).status,400);
 }finally{if(previous===undefined)delete process.env.TEACHER_SESSION_SECRET;else process.env.TEACHER_SESSION_SECRET=previous;}
 const {mountAIUsage}=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('interview-ai-usage.js','utf8')).toString('base64'));
 const host={innerHTML:'',onclick:null};
 const view=mountAIUsage(host,{studentId:'a',request:async()=>result});await view.ready;
 assert(host.innerHTML.includes('요청됨'));assert(host.innerHTML.includes('생성 완료'));assert(host.innerHTML.includes('요청 기록 없음'));view.destroy();
 const failed=mountAIUsage(host,{request:async()=>{throw Error('offline');}});await failed.ready;
 assert(host.innerHTML.includes('불러오지 못했습니다'));assert(!host.innerHTML.includes('요청 기록 없음'));failed.destroy();
 let resolve;const pending=mountAIUsage(host,{request:()=>new Promise(r=>resolve=r)});pending.destroy();host.innerHTML='new student';resolve(result);await pending.ready;assert.equal(host.innerHTML,'new student');
 console.log('PASS AI usage: permissions, isolated read queries, latest status, empty/error distinction and stale response protection');
})().catch(e=>{console.error(e);process.exitCode=1;});
