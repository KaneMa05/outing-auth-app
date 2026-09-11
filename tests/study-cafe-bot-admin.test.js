const assert = require('node:assert/strict');
const { validateBotRequest } = require('../api/study-cafe-bots');
const handler = require('../api/study-cafe-admin');
const { COOKIE_NAME, createSessionToken } = require('../api/teacher-auth-utils');
const crypto = require('node:crypto');
process.env.TEACHER_SESSION_SECRET='bot-test-secret';
process.env.SUPABASE_URL='https://bot-test.example';
process.env.SUPABASE_SERVICE_ROLE_KEY='test-only';
const originalFetch = global.fetch;
async function invoke(body, role) {
  const token=role?createSessionToken(process.env.TEACHER_SESSION_SECRET,{role,username:'verified-admin',permissions:['study_cafe.read','study_cafe.write']}):'';
  const res={code:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(c){this.code=c;return this;},json(b){this.body=b;return this;}};
  await handler({method:'POST',body,headers:{cookie:`${COOKIE_NAME}=${token}`}},res); return res;
}
(async()=>{
  let calls=[];
  global.fetch=async(url,options)=>{
    calls.push({url,body:JSON.parse(options.body)});
    return {ok:true,status:200,json:async()=>({ok:true,bots:[]})};
  };
  assert.equal((await invoke({action:'bot_list'})).code,401);
  assert.equal((await invoke({action:'bot_list'},'teacher')).code,403);
  assert.equal(calls.length,0,'teachers never reach bot store even with cafe write permission');
  const list=await invoke({action:'bot_list'},'admin');
  assert.equal(list.code,200); assert.equal(list.headers['Cache-Control'],'no-store');
  const data={action:'bot_purchase',studentId:'29999701',requestId:crypto.randomUUID(),actor:'forged',payload:{itemId:'hair_sport',expectedPrice:50,equip:true}};
  assert.equal((await invoke(data,'admin')).code,200);
  const purchase=calls.find(c=>c.body.p_action==='purchase');
  assert.equal(purchase.body.p_actor,'verified-admin','audit identity comes from signed session');
  assert.equal(purchase.body.p_request_id,data.requestId);
  assert(calls.some(c=>c.url.includes('realtime')),'successful changes refresh public appearance');
  const count=calls.length;
  for(const payload of [{...data,requestId:'bad'},{...data,payload:{...data.payload,expectedPrice:-1}},{...data,payload:{...data.payload,equip:'true'}}]) {
    assert.equal((await invoke(payload,'admin')).code,400);
  }
  assert.equal(calls.length,count,'invalid requests never mutate');
  const settings={action:'bot_save',studentId:'29999701',requestId:crypto.randomUUID(),payload:{version:0,name:'봇',nickname:'공부수달',track:'공채',subjects:['형사법'],avatarTone:'navy',preferredSeat:7,windows:[[158,450],[505,828],[900,1135]]}};
  assert(validateBotRequest(settings));
  for(const patch of [{preferredSeat:49},{nickname:'<script>'},{subjects:['형사법','형사법']},{windows:[[158,600],[505,828],[900,1135]]},{version:-1}]) {
    assert(!validateBotRequest({...settings,payload:{...settings.payload,...patch}}));
  }
  global.fetch=async()=>({ok:true,status:200,json:async()=>({ok:false,error:'bot_not_found'})});
  assert.equal((await invoke({...data,studentId:'real-student'},'admin')).code,404);
  global.fetch=async()=>({ok:false,status:404,json:async()=>({})});
  const unavailable=await invoke({action:'bot_list'},'admin');
  assert.equal(unavailable.code,503); assert.equal(unavailable.body.error,'bots_unavailable');
  console.log('Bot admin API: authentication, admin-only access, validation, trusted audit identity and unavailable DB passed.');
})().finally(()=>{global.fetch=originalFetch;}).catch(error=>{console.error(error);process.exitCode=1;});
