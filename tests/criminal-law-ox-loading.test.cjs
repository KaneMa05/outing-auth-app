const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
const {authenticateStudent,compactBootstrap}=require('../api/criminal-law-ox')._private;
const source=fs.readFileSync('app.js','utf8');
function extract(name){const start=source.search(new RegExp('(?:async )?function '+name+'\\('));assert.ok(start>=0);const tail=source.slice(start),end=tail.search(/\n(?:async )?function /);return tail.slice(0,end);}
function fixture(storage=new Map()){
  let now=100000,student={id:'a'},token='device-a';const requests=[];
  const node=(tag,props={},children=[])=>({...props,tag,children,style:{}});
  const context=vm.createContext({Date:{now:()=>now},APP_MODE:'student',navigator:{userAgent:'qa'},
    getAuthedStudent:()=>student,getStudentProfile:()=>({deviceToken:token}),isStandaloneStudentApp:()=>false,
    el:node,button:(label,classes,type,onclick,children)=>node('button',{onclick},children),navigate:()=>{},
    document:{querySelector:()=>true},
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
    fetch:(url,options)=>new Promise(resolve=>requests.push({body:JSON.parse(options.body),resolve}))});
  vm.runInContext(extract('criminalLawOxEntryHint')+'\n'+extract('requestCriminalLawOx')+'\n'+extract('renderCriminalLawOxLocalEntry'),context);
  return {context,storage,requests,request:context.requestCriminalLawOx,entry:context.renderCriminalLawOxLocalEntry,
    setIdentity:(id,device)=>{student={id};token=device;},advance:ms=>{now+=ms;},
    respond:(i,data,ok=true)=>requests[i].resolve({ok,json:async()=>data})};
}
test('validating a device uses one DB request and retains active-student validation',async()=>{
  const calls=[];const body={studentId:'a',deviceToken:'secret',client:{displayMode:'standalone',userAgent:'qa'}};
  const student=await authenticateStudent(body,async(...args)=>{calls.push(args);return {valid:true};});
  assert.deepEqual(student,{id:'a'});assert.equal(calls.length,1);
  assert.equal(calls[0][1],'rpc/validate_student_device');
  assert.equal(calls[0][2].p_device_token_hash,crypto.createHash('sha256').update('secret').digest('hex'));
  assert.equal(await authenticateStudent(body,async()=>({valid:false})),null);
  assert.equal(await authenticateStudent({},async()=>{throw Error('must not query')}),null);
});
test('compact bootstrap preserves learning fields and never introduces answers or explanations',()=>{
  const original={ok:true,progress:[{question_id:'a'}],notes:[],statistics:{},todayCount:3,catalog:{chapters:[{id:'c'}],collections:[],questions:[
    {id:'a',chapter_id:'c',prompt:'P',context:'C',version:2,origin_type:'source',source_page:3},
    {id:'b',chapter_id:'c',prompt:'Q',context:'',version:1,correct_answer:'O',explanation_html:'hidden'}]}};
  const compact=compactBootstrap(original);
  assert.deepEqual(compact.catalog.questions[0],{id:'a',chapter_id:'c',prompt:'P',context:'C',version:2});
  assert.equal(compact.catalog.questions[1].correct_answer,'O');assert.equal(compact.catalog.questions[1].explanation_html,undefined);
  for(const field of ['progress','notes','statistics','todayCount'])assert.equal(compact[field],original[field]);
  assert.equal(original.catalog.questions[0].source_page,3);
});
test('home shows a recent confirmed card immediately while rechecking enrollment',async()=>{
  const f=fixture(),first=f.entry();assert.equal(first.hidden,true);assert.equal(f.requests.length,1);
  f.respond(0,{ok:true,enabled:true});await f.request('status');await Promise.resolve();
  assert.equal(first.hidden,false);
  f.request.statusCache.expires=0;
  const returned=f.entry();assert.equal(returned.hidden,false);assert.equal(f.requests.length,2);
  f.respond(1,{ok:true,enabled:false});await f.request('status');await Promise.resolve();
  assert.equal(returned.hidden,true);assert.equal(f.entry().hidden,true);
});
test('home rejects expired or other-device hints and failed requests can retry immediately',async()=>{
  const f=fixture();let pending=f.request('status');f.respond(0,{ok:true,enabled:true});await pending;
  f.setIdentity('a','device-new');const entry=f.entry();assert.equal(entry.hidden,true);assert.equal(f.requests.length,2);
  f.respond(1,{ok:false,error:'ox_unavailable'},false);await assert.rejects(f.request('status'));await Promise.resolve();
  assert.equal(f.request.statusCache,null);
  pending=f.request('status');assert.equal(f.requests.length,3);f.respond(2,{ok:true,enabled:true});await pending;
  f.advance(7*24*60*60*1000+1);assert.equal(f.entry().hidden,true);f.respond(3,{ok:true,enabled:false});await f.request('status');
});
test('a restarted app shows a confirmed card before the network responds, then hides revoked access',async()=>{
  const first=fixture();const initial=first.request('status');first.respond(0,{ok:true,enabled:true});await initial;
  const restarted=fixture(first.storage);restarted.advance(24*60*60*1000);
  const card=restarted.entry();assert.equal(card.hidden,false);assert.equal(restarted.requests.length,1);
  assert.equal(restarted.requests[0].body.action,'status');
  restarted.respond(0,{ok:true,enabled:false});await restarted.request('status');await Promise.resolve();
  assert.equal(card.hidden,true);assert.equal(first.storage.size,0);
  const next=fixture(first.storage);assert.equal(next.entry().hidden,true);next.respond(0,{ok:true,enabled:false});await next.request('status');
});
test('saved hints are isolated by account and device and contain no raw device credential',async()=>{
  const f=fixture();const initial=f.request('status');f.respond(0,{ok:true,enabled:true});await initial;
  assert.ok(![...f.storage.values()].join('').includes('device-a'));
  const other=fixture(f.storage);other.setIdentity('b','device-a');assert.equal(other.entry().hidden,true);
  other.respond(0,{ok:true,enabled:false});await other.request('status');assert.equal(f.storage.size,1);
  const newDevice=fixture(f.storage);newDevice.setIdentity('a','different-device');assert.equal(newDevice.entry().hidden,true);
  newDevice.respond(0,{ok:true,enabled:false});await newDevice.request('status');assert.equal(f.storage.size,1);
});
test('temporary outages preserve a known card but authorization errors remove its hint',async()=>{
  const f=fixture();let pending=f.request('status');f.respond(0,{ok:true,enabled:true});await pending;
  f.request.statusCache=null;const card=f.entry();assert.equal(card.hidden,false);
  f.respond(1,{ok:false,error:'ox_unavailable'},false);await assert.rejects(f.request('status'));await Promise.resolve();
  assert.equal(card.hidden,false);
  pending=f.request('bootstrap');f.respond(2,{ok:false,error:'ox_not_registered'},false);await assert.rejects(pending);
  assert.equal(f.storage.size,0);assert.equal(f.entry().hidden,true);f.respond(3,{ok:true,enabled:false});await f.request('status');
});
test('malformed or blocked storage does not prevent authoritative status loading',async()=>{
  const f=fixture(new Map([['outing-criminal-ox-entry-v1','not json']]));assert.equal(f.entry().hidden,true);
  f.respond(0,{ok:true,enabled:true});await f.request('status');
  f.request.statusCache=null;f.context.localStorage.getItem=()=>{throw Error('blocked')};f.context.localStorage.setItem=()=>{throw Error('blocked')};
  const card=f.entry();assert.equal(card.hidden,true);f.respond(1,{ok:true,enabled:true});await f.request('status');await Promise.resolve();assert.equal(card.hidden,false);
});
test('concurrent entry loads share one request, but completed data and other accounts are not cached',async()=>{
  const f=fixture();const a=f.request('bootstrap'),b=f.request('bootstrap');assert.equal(f.requests.length,1);
  f.respond(0,{ok:true,catalog:{questions:[]}});await Promise.all([a,b]);assert.equal(f.request.bootstrapPending,null);
  const again=f.request('bootstrap');assert.equal(f.requests.length,2);
  f.setIdentity('b','device-b');const other=f.request('bootstrap');assert.equal(f.requests.length,3);
  f.respond(1,{ok:true});await again;assert.ok(f.request.bootstrapPending);
  f.respond(2,{ok:true});await other;assert.equal(f.request.bootstrapPending,null);
});
test('late authorization failures cannot clear another account status',async()=>{
  const f=fixture();const old=f.request('bootstrap');f.setIdentity('b','device-b');const status=f.request('status');
  f.respond(1,{ok:true,enabled:true});await status;
  f.respond(0,{ok:false,error:'unauthorized'},false);await assert.rejects(old);
  assert.equal(f.request.statusCache.key,'b:device-b');assert.equal(f.request.statusCache.value.enabled,true);
});
test('only the OX function overrides the default deployment region',()=>{
  const config=JSON.parse(fs.readFileSync('vercel.json','utf8'));
  assert.deepEqual(config.functions,{'api/criminal-law-ox.js':{regions:['syd1']}});assert.equal(config.regions,undefined);
});
