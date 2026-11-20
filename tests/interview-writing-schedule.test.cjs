const assert=require('node:assert/strict');
const {test}=require('node:test');
const {createHandler}=require('../api/interview-prep');
const opensAt=Date.parse('2026-11-22T15:00:00Z');

test('teacher submissions open exactly at November 23 midnight in Korea; saving stays available',async()=>{
 let instant=opensAt-1;const calls=[];
 const handler=createHandler({now:()=>instant,authenticateWeb:async()=>({id:'schedule-test'}),invoke:async(...args)=>{calls.push(args);return {ok:true};}});
 async function call(kind,status,extra={}){
  let code,data;
  await handler({method:'POST',headers:{host:'localhost',origin:'http://localhost'},body:{action:'writing_save',kind,itemId:'',revision:3,text:'작성 중인 답변',status,...extra}},
   {setHeader(){},status(n){code=n;return this;},json(v){data=v;}});
  return {code,data};
 }
 for(const kind of ['introduction','motivation','public_service']){
  const before=calls.length;
  assert.deepEqual(await call(kind,'submitted',{now:opensAt+1}),{code:403,data:{ok:false,error:'submission_not_open'}});
  assert.equal(calls.length,before,'A client clock cannot bypass the server or mutate a submitted round');
  assert.equal((await call(kind,'draft')).code,200);
  assert.equal((await call(kind,'saved')).code,200);
 }
 assert.equal((await call('core','submitted')).code,200,'The existing core-question schedule is unchanged');
 instant=opensAt;
 for(const kind of ['introduction','motivation','public_service'])assert.equal((await call(kind,'submitted')).code,200);
 instant=opensAt+1;assert.equal((await call('introduction','submitted')).code,200);
});
