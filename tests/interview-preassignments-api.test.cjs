const assert=require('node:assert/strict');
const {createHandler,validate}=require('../api/interview-preassignments');
async function send(handler,body,headers={},method='POST'){const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(d){this.data=d;return this;}};await handler({method,headers:{host:'app.test',origin:'https://app.test',...headers},body},res);return res;}
(async()=>{
 const calls=[];let adminWrite;
 const deps={authenticateWeb:async()=>({id:'student-a'}),previewAllowed:()=>false,authenticateAdmin:async(req,write)=>{adminWrite=write;return {id:'admin-a'};},invoke:async(action,actor,body)=>{calls.push({action,actor,body});return {ok:true,settings:{enabled:true},draft:{revision:2,fields:{f1:'저장한 내 답변'}}};}};
 const handler=createHandler(deps);
 let r=await send(handler,{action:'bootstrap',studentId:'forged'});assert.equal(r.statusCode,200);assert.equal(calls.at(-1).actor.id,'student-a');assert(!Object.hasOwn(calls.at(-1).body,'studentId'));assert.equal(r.headers['Cache-Control'],'no-store');assert.equal(r.data.catalog.length,25);assert(!r.data.catalog.some(u=>u.id==='other'));
 r=await send(handler,{action:'bootstrap',actor:{id:'victim'}});assert.equal(r.statusCode,400);
 r=await send(handler,{action:'file_finish'});assert.equal(r.statusCode,400);
 r=await send(handler,{action:'bootstrap'},{origin:'https://other.test'});assert.equal(r.statusCode,403);
 r=await send(handler,{action:'bootstrap'},{},'GET');assert.equal(r.statusCode,405);
 r=await send(handler,{action:'admin_list'});assert.equal(adminWrite,false);assert.equal(calls.at(-1).actor.type,'admin');
 r=await send(handler,{action:'admin_review',submissionId:'00000000-0000-0000-0000-000000000000',revision:0,status:'approved',feedback:''});assert.equal(r.statusCode,400);assert.equal(r.data.error,'unsupported_action');
 const denied=createHandler({...deps,authenticateWeb:async()=>null});assert.equal((await send(denied,{action:'bootstrap'})).statusCode,403);
 const unauthorized=createHandler({...deps,authenticateAdmin:async()=>{throw Error('unauthorized');}});assert.equal((await send(unauthorized,{action:'admin_list'})).statusCode,401);
 for(const action of ['file_begin','file_complete','check','help'])assert.equal((await send(handler,{action})).statusCode,400);
 const payload={action:'submit',unitIds:['core-01'],revisions:{'core-01':0},fields:{f1:'내 답변'},requestId:'12345678'};
 assert.equal((await send(handler,payload)).statusCode,200);
 for(const patch of [{unitIds:['other']},{unitIds:['core-26']},{unitIds:['core-01','core-02']},{fields:{f1:'답변',f2:'분석'}},{fields:{f1:'a'.repeat(4001)}},{fileIds:['fake']}]){
  assert.throws(()=>validate({...payload,...patch}),/invalid_request/);
 }
 const diagnosis={action:'diagnose',unitId:'core-01',revision:2};
 r=await send(handler,diagnosis);assert.equal(r.statusCode,409);assert.equal(r.data.error,'diagnosis_not_configured');
 assert.equal((await send(handler,{...diagnosis,revision:1})).statusCode,409);
 assert.equal((await send(handler,{...diagnosis,targetStudentId:'victim'})).statusCode,400);
 assert.equal((await send(handler,{...diagnosis,score:100})).statusCode,400);
 assert.equal((await send(denied,diagnosis)).statusCode,403);
 assert.equal((await send(createHandler({...deps,invoke:async()=>({ok:true,draft:null})}),diagnosis)).statusCode,409);
 assert.equal((await send(createHandler({...deps,invoke:async()=>{throw Error('disabled');}}),diagnosis)).statusCode,409);
 for(const action of ['admin_guidance_list','admin_guidance_detail','admin_guidance_history']){assert.equal((await send(handler,{action,...(action==='admin_guidance_list'?{}:{unitId:'core-01'})})).statusCode,200);assert.equal(adminWrite,false);}
 const guideline={action:'admin_guidance_save',unitId:'core-01',revision:0,instructions:'가'.repeat(10000)};
 assert.equal((await send(handler,guideline)).statusCode,200);assert.equal(adminWrite,true);assert.equal(calls.at(-1).actor.id,'admin-a');assert.equal(calls.at(-1).body.instructions.length,10000);
 const readOnly=createHandler({...deps,authenticateAdmin:async(req,write)=>{if(write)throw Error('forbidden');return {id:'read-only'};}});
 assert.equal((await send(readOnly,{action:'admin_guidance_list'})).statusCode,200);assert.equal((await send(readOnly,guideline)).statusCode,403);
 assert.equal((await send(unauthorized,{action:'admin_guidance_detail',unitId:'core-01'})).statusCode,401);
 for(const patch of [{instructions:'a'.repeat(10001)},{instructions:null},{instructions:[]},{unitId:'core-26'},{revision:-1},{actor:{type:'admin'}}])assert.equal((await send(handler,{...guideline,...patch})).statusCode,400);
 console.log('PASS API: identity, permissions, bounds, review removed, unconfigured diagnosis fails closed; no client-supplied scores or actors.');
})().catch(e=>{console.error(e);process.exitCode=1;});

for(const body of [{action:'detail',unitId:'other'},{action:'history',unitId:'other'},{action:'diagnose',unitId:'other',revision:0},{action:'save',unitId:'other',revision:0,fields:{f1:'answer'},requestId:'12345678'}])assert.throws(()=>validate(body),/invalid_request/);
