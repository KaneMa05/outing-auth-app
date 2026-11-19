const {test}=require('node:test'),assert=require('node:assert/strict');
const {createHandler}=require('../api/interview-native-practice');
const auth=require('../lib/interview-native-practice-auth.cjs'),legacy=require('../lib/interview-native-auth');
const key='n'.repeat(64);
async function call(handler,body,headers={}){let status,data;await handler({method:'POST',headers:{host:'app.test',origin:'https://app.test',...headers},body},{setHeader(){},status(n){status=n;return this;},json(value){data=value;}});return {status,data};}
function harness(extra={}){const codes=new Map(),calls=[];const d={enabled:true,secret:key,authenticateWeb:async()=>({id:'a'}),authenticateDevice:async b=>b.deviceToken==='valid'?{id:b.studentId}:null,requireAccess:async id=>{calls.push(['access',id]);if(id!=='a')throw Error('forbidden');},invoke:async(action,actor,body)=>{calls.push([action,actor]);if(action==='issue'){codes.set(body.codeHash,actor.id);return {ok:true};}const id=codes.get(body.codeHash);if(!id)throw Error('unauthorized');codes.delete(body.codeHash);return {studentId:id};},bootstrap:async(user,mode)=>({ok:true,accountId:user.id,mode,track:'공채',fields:[],questions:[]}),...extra};return {d,calls,codes,handler:createHandler(d)};}
test('ordinary package member launches, consumes once and reads only its bound mode without test headers',async()=>{
 const h=harness(),launched=await call(h.handler,{action:'launch',mode:'job'});assert.equal(launched.status,200);assert.equal(launched.data.code.length,43);
 assert.equal((await call(h.handler,{action:'exchange',mode:'personality',code:launched.data.code})).status,401);
 const exchanged=await call(h.handler,{action:'exchange',mode:'job',code:launched.data.code});assert.equal(exchanged.status,200);assert.deepEqual(auth.read(exchanged.data.token,key),{id:'a',practiceMode:'job'});
 assert.equal((await call(h.handler,{action:'exchange',mode:'job',code:launched.data.code})).status,401);
 const headers={authorization:'Bearer '+exchanged.data.token};assert.equal((await call(h.handler,{action:'bootstrap',mode:'job'},headers)).data.accountId,'a');assert.equal((await call(h.handler,{action:'bootstrap',mode:'personality'},headers)).status,403);
 assert.equal(h.calls.filter(c=>c[0]==='access').length,3);
});
test('native beta cannot authenticate Live, test practice, AI or administrator commands',async()=>{
 const token=auth.issue('a','job',key,1000);assert.throws(()=>legacy.read(token,key,1000));assert.throws(()=>legacy.readPractice(token,key,1000));assert.throws(()=>auth.read(legacy.issuePractice('a',key,1000),key,1000));
 assert.notEqual(auth.codeHash('a'.repeat(43),'job'),legacy.hash('a'.repeat(43)));
 for(const time of [999,7201000])assert.throws(()=>auth.read(token,key,time));assert.throws(()=>auth.read(token+'x',key,1001));assert.throws(()=>auth.read(token,'z'.repeat(64),1001));
 const h=harness();for(const body of [{action:'launch',mode:'ai'},{action:'command',mode:'job'},{action:'admin_get',mode:'job'},{action:'launch',mode:'job',actor:{id:'other'}}])assert.equal((await call(h.handler,body)).status,400);assert.equal(h.codes.size,0);
});
test('access is checked before issue and after consume; revoked access never receives a native token',async()=>{
 let allowed=true;const h=harness({requireAccess:async()=>{if(!allowed)throw Error('forbidden');}});const code=(await call(h.handler,{action:'launch',mode:'personality'})).data.code;allowed=false;
 assert.equal((await call(h.handler,{action:'exchange',mode:'personality',code})).status,403);assert.equal((await call(h.handler,{action:'launch',mode:'personality'})).status,403);
 const headers={authorization:'Bearer '+auth.issue('a','personality',key)};assert.equal((await call(h.handler,{action:'bootstrap',mode:'personality'},headers)).status,403);
});
test('device credentials and portal cookies bind the owner; foreign origins and mixed owners fail',async()=>{
 const h=harness({authenticateWeb:async()=>null});assert.equal((await call(h.handler,{action:'launch',mode:'job',studentId:'a',deviceToken:'valid'})).status,200);assert.equal((await call(h.handler,{action:'launch',mode:'job',studentId:'a',deviceToken:'wrong'})).status,401);assert.equal((await call(h.handler,{action:'launch',mode:'job',studentId:'other',deviceToken:'valid'})).status,403);
 assert.equal((await call(harness().handler,{action:'launch',mode:'job',studentId:'other',deviceToken:'valid'})).status,403);
 assert.equal((await call(h.handler,{action:'launch',mode:'job',studentId:'a',deviceToken:'valid'},{origin:'https://evil.example'})).status,403);
 assert.equal((await call(harness({enabled:false}).handler,{action:'launch',mode:'job'})).status,409);
});
