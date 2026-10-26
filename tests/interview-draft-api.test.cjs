const assert=require('node:assert/strict');
const {createHandler}=require('../api/interview-life-followup');
const worker=require('../api/interview-draft-worker');
const experience={title:'발표',content:'팀원이 어려워해서 제가 자료를 정리하고 발표했습니다.'};
async function send(handler,body,headers={host:'app.test',origin:'https://app.test'}){let code,result;await handler({method:'POST',headers,body},{setHeader(){},status(n){code=n;return this;},json(d){result=d;}});return {code,result};}
(async()=>{
 let called=0;const deps={authenticateWeb:async()=>({id:'student-a'}),previewAllowed:()=>false,enabled:()=>false,draftEnabled:()=>true,draftInvoke:async(action,actor,body)=>{called++;assert.equal(actor.id,'student-a');assert.equal(action,'request');assert.deepEqual(body,{experience});return {ok:true,id:'fixture',state:'queued',questions:[]};}};
 assert.equal((await send(createHandler(deps),{action:'draft_questions',experience})).code,200);
 assert.equal((await send(createHandler({...deps,authenticateWeb:async()=>null}),{action:'draft_questions',experience})).code,403);
 assert.equal((await send(createHandler(deps),{action:'draft_questions',experience,actor:{id:'other'}})).code,400);
 assert.equal((await send(createHandler(deps),{action:'draft_questions',experience},{host:'app.test',origin:'https://other.test'})).code,403);
 assert.equal((await send(createHandler({...deps,draftEnabled:()=>false}),{action:'draft_questions',experience})).code,409);assert.equal(called,1);
 const token='a'.repeat(43);const handler=worker.createHandler({env:{INTERVIEW_DRAFT_QUESTIONS_ENABLED:'true',INTERVIEW_CORE25_WORKER_TOKEN:token},invoke:async()=>({ok:true,jobs:[]})});
 assert.equal((await send(handler,{action:'poll'},{authorization:'Bearer '+token})).code,200);
 assert.equal((await send(handler,{action:'poll'},{})).code,401);
 assert.equal((await send(handler,{action:'poll'},{authorization:'Bearer '+token,origin:'https://app.test'})).code,403);
 console.log('PASS draft API: authenticated student identity, payload/origin validation, feature gate and worker token isolation');
})().catch(e=>{console.error(e);process.exitCode=1;});
