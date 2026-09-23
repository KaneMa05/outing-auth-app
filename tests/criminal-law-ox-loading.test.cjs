const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
const {createHandler}=require('../api/criminal-law-ox');
const {authenticateStudent,compactBootstrap,invokeLearning,validate}=require('../api/criminal-law-ox')._private;
const source=fs.readFileSync('app.js','utf8');
function extract(name){const start=source.search(new RegExp('(?:async )?function '+name+'\\('));assert.ok(start>=0);const tail=source.slice(start),end=tail.search(/\n(?:async )?function /);return tail.slice(0,end);}
function fixture(storage=new Map()){
  let now=100000,student={id:'a'},token='device-a';const requests=[],routes=[],modals=[];
  const node=(tag,props={},children=[])=>({...props,tag,children,style:{},disabled:false});
  const context=vm.createContext({Date:{now:()=>now},APP_MODE:'student',navigator:{userAgent:'qa'},
    getAuthedStudent:()=>student,getStudentProfile:()=>({deviceToken:token}),isStandaloneStudentApp:()=>false,
    el:node,button:(label,classes,type,onclick,children)=>node('button',{onclick},children),navigate:route=>routes.push(route),openInfoModal:options=>modals.push(options),
    document:{querySelector:()=>true},
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
    fetch:(url,options)=>new Promise(resolve=>requests.push({body:JSON.parse(options.body),resolve}))});
  vm.runInContext(extract('criminalLawOxEntryHint')+'\n'+extract('requestCriminalLawOx')+'\n'+extract('renderCriminalLawOxLocalEntry'),context);
  return {context,storage,requests,routes,modals,request:context.requestCriminalLawOx,entry:context.renderCriminalLawOxLocalEntry,
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
  const original={ok:true,progress:[{question_id:'a'}],notes:[],statistics:{},attemptCounts:{a:{attempts:28,correct:20,wrong:8}},todayCount:3,catalog:{chapters:[{id:'c'}],collections:[],questions:[
    {id:'a',chapter_id:'c',prompt:'P',context:'C',version:2,origin_type:'source',source_page:3},
    {id:'b',chapter_id:'c',prompt:'Q',context:'',version:1,correct_answer:'O',explanation_html:'hidden'}]}};
  const compact=compactBootstrap(original);
  assert.deepEqual(compact.catalog.questions[0],{id:'a',chapter_id:'c',prompt:'P',context:'C',version:2});
  assert.equal(compact.catalog.questions[1].correct_answer,'O');assert.equal(compact.catalog.questions[1].explanation_html,undefined);
  for(const field of ['progress','notes','statistics','attemptCounts','todayCount'])assert.equal(compact[field],original[field]);
  assert.equal(original.catalog.questions[0].source_page,3);
});
test('unapproved students see the home shortcut and only the updating modal',async()=>{
  for(const hasAccessHistory of [false,true]){
    const f=fixture(),card=f.entry();assert.equal(card.hidden,false);
    const click=card.onclick();await card.onclick();assert.equal(f.requests.length,1,'Repeated clicks share the in-flight check');
    f.respond(0,{ok:true,enabled:false,hasAccessHistory});await click;
    assert.deepEqual(f.routes,[]);assert.equal(f.modals.length,1);
    assert.equal(f.modals[0].title,'형사법 OX');assert.equal(f.modals[0].content.children,'업데이트 진행 중입니다.');
    assert.equal(card.disabled,false);assert.equal(card.hidden,false);
  }
});

test('approved students enter learning after a current server check',async()=>{
  const f=fixture(),card=f.entry();f.respond(0,{ok:true,enabled:false});await f.request('status');
  const click=card.onclick();assert.equal(f.requests.length,2);
  f.respond(1,{ok:true,enabled:true});await click;
  assert.deepEqual(f.routes,['criminal-law-ox']);assert.equal(f.modals.length,0);
});

test('a cached approval or saved hint cannot bypass revoked access',async()=>{
  const f=fixture(),card=f.entry();f.respond(0,{ok:true,enabled:true});await f.request('status');
  assert.ok(f.storage.size);const click=card.onclick();assert.equal(f.requests.length,2);
  f.respond(1,{ok:true,enabled:false});await click;
  assert.deepEqual(f.routes,[]);assert.equal(f.modals.length,1);assert.equal(f.storage.size,0);
});

test('account changes discard a pending home click',async()=>{
  const f=fixture(),card=f.entry(),click=card.onclick();f.setIdentity('b','device-b');
  f.respond(0,{ok:true,enabled:true});await click;
  assert.deepEqual(f.routes,[]);assert.deepEqual(f.modals,[]);
});

test('failed status checks keep home visible, avoid navigation and allow retry',async()=>{
  const f=fixture(),card=f.entry(),click=card.onclick();
  f.respond(0,{ok:false,error:'ox_unavailable'},false);await click;
  assert.equal(card.hidden,false);assert.equal(card.disabled,false);assert.deepEqual(f.routes,[]);
  assert.ok(f.modals[0].content.children.includes('확인하지 못했습니다'));
  const retry=card.onclick();f.respond(1,{ok:true,enabled:true});await retry;
  assert.deepEqual(f.routes,['criminal-law-ox']);
});

test('student home notice does not render on the teacher screen',()=>{
  const f=fixture();f.context.APP_MODE='teacher';assert.equal(f.entry(),null);assert.equal(f.requests.length,0);
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

function sessionFixture(secret='ox-session-test-secret') {
  let now=1000,deviceActive=true,denied=null;
  const validations=[],operations=[];
  const handler=createHandler({sessionSecret:()=>secret,now:()=>now,
    authenticate:async body=>{
      validations.push(body);
      return deviceActive && body.studentId==='a' && body.deviceToken==='registered-device'?{id:'a'}:null;
    },
    invoke:async(action,actor,body)=>{
      operations.push({action,actor,body});
      if(denied) throw Error(denied);
      return {ok:true,enabled:true};
    }});
  return {validations,operations,advance:seconds=>{now+=seconds;},revoke:()=>{deviceActive=false;},deny:code=>{denied=code;},
    request:async(body={},cookie='')=>{
      const headers={};let status,result;
      await handler({method:'POST',headers:{host:'localhost',cookie,'x-forwarded-proto':'https'},
        body:{action:'status',studentId:'a',deviceToken:'registered-device',...body}},
      {setHeader:(name,value)=>{headers[name]=value;},status(value){status=value;return this;},json(value){result=value;}});
      return {status,result,headers,cookie:headers['Set-Cookie']?.split(';')[0]};
    }};
}

test('a registered OX session skips device DB validation on subsequent learning requests',async()=>{
  const f=sessionFixture(),first=await f.request();
  assert.equal(first.status,200);assert.equal(f.validations.length,1);
  for(const attribute of ['HttpOnly','SameSite=Strict','Path=/api/criminal-law-ox','Max-Age=43200','Secure']) assert.ok(first.headers['Set-Cookie'].includes(attribute));
  const decoded=JSON.parse(Buffer.from(first.cookie.split('=')[1].split('.')[0],'base64url').toString());
  assert.equal(decoded.studentId,'a');assert.equal(decoded.device,crypto.createHash('sha256').update('registered-device').digest('hex'));
  assert.ok(!first.headers['Set-Cookie'].includes('registered-device'));
  for(const body of [{action:'bootstrap'},{action:'submit',questionId:'q',version:1,answer:'O',submissionId:crypto.randomUUID()},
    {action:'detail',questionId:'q',version:1},{action:'note',questionId:'q',version:1,bookmark:true}]) {
    const response=await f.request({...body,actor:{type:'admin',id:'forged'}},first.cookie);
    assert.equal(response.status,200);assert.equal(response.headers['Set-Cookie'],undefined);
    assert.deepEqual(f.operations.at(-1).actor,{type:'student',id:'a',deviceHash:crypto.createHash('sha256').update('registered-device').digest('hex')});
    assert.equal(f.operations.at(-1).body.deviceToken,undefined);assert.equal(f.operations.at(-1).body.actor,undefined);
  }
  assert.equal(f.validations.length,1,'Only the first request validates the device');
  assert.equal(f.operations.length,5,'Every request still checks OX access and saves through ox_service');
});

test('device sessions cannot be forged or reused by another student or device',async()=>{
  for(const scenario of ['signature','student','device','malformed','trailing']) {
    const f=sessionFixture(),first=await f.request();f.revoke();
    let cookie=first.cookie,body={};
    if(scenario==='signature') cookie=cookie.slice(0,-1)+(cookie.endsWith('A')?'B':'A');
    if(scenario==='student') body.studentId='b';
    if(scenario==='device') body.deviceToken='other-device';
    if(scenario==='malformed') cookie='outing_ox_device_session=invalid';
    if(scenario==='trailing') cookie+='.';
    const result=await f.request(body,cookie);
    assert.equal(result.status,401,scenario);assert.equal(f.validations.length,2,scenario);assert.equal(f.operations.length,1,scenario);
    assert.equal(result.headers['Set-Cookie'],undefined);
  }
});

test('sessions have a fixed 12-hour expiry and recheck revoked devices at expiry',async()=>{
  const f=sessionFixture(),first=await f.request();f.revoke();f.advance(43199);
  const last=await f.request({},first.cookie);
  assert.equal(last.status,200);assert.equal(last.headers['Set-Cookie'],undefined);assert.equal(f.validations.length,1);
  f.advance(1);
  assert.equal((await f.request({},first.cookie)).status,401);assert.equal(f.validations.length,2);
  const active=sessionFixture(),initial=await active.request();active.advance(43200);
  const renewed=await active.request({},initial.cookie);
  assert.equal(renewed.status,200);assert.ok(renewed.cookie);assert.notEqual(renewed.cookie,initial.cookie);assert.equal(active.validations.length,2);
});

test('an OX device session does not bypass current enrollment, account, or service checks',async()=>{
  for(const [error,status] of [['ox_not_registered',403],['unauthorized',401],['ox_disabled',404]]) {
    const f=sessionFixture(),first=await f.request();f.deny(error);
    const denied=await f.request({},first.cookie);
    assert.equal(denied.status,status);assert.equal(denied.result.error,error);assert.equal(f.validations.length,1);
    assert.equal(denied.headers['Set-Cookie'],undefined);
  }
});

test('OX cookies do not grant administrator access or accept teacher tokens',async()=>{
  const f=sessionFixture(),first=await f.request();
  assert.equal((await f.request({action:'admin_catalog'},first.cookie)).status,401);
  const auth=require('../api/teacher-auth-utils');
  const token=first.cookie.split('=')[1];
  assert.equal(auth.readSessionToken(token,'ox-session-test-secret'),false);
  const teacherToken=auth.createSessionToken('ox-session-test-secret',{username:'a',role:'admin',permissions:['*']});
  f.revoke();
  assert.equal((await f.request({},'outing_ox_device_session='+teacherToken)).status,401);
});

test('missing signing configuration and missing cookies retain existing device authentication',async()=>{
  const f=sessionFixture('');
  assert.equal((await f.request()).cookie,undefined);assert.equal((await f.request()).status,200);assert.equal(f.validations.length,2);
  f.revoke();assert.equal((await f.request()).status,401);
  const enabled=sessionFixture();await enabled.request();await enabled.request();assert.equal(enabled.validations.length,2);
});

test('failed OX requests never issue a reusable device session',async()=>{
  const f=sessionFixture();f.deny('ox_not_registered');
  const response=await f.request();assert.equal(response.status,403);assert.equal(response.cookie,undefined);
});

test('student learning always uses the device gateway and cannot fall back around it',async()=>{
  const calls=[];const request=async(...args)=>{calls.push(args);return {ok:true};};
  const actor={type:'student',id:'a',deviceHash:'server-hash'};
  for(const action of ['status','bootstrap','questions','submit','note','detail','device_state']) {
    await invokeLearning(action,actor,{},request);assert.equal(calls.at(-1)[1],'rpc/ox_device_gateway');
  }
  await invokeLearning('admin_catalog',{type:'admin',id:'qa'},{},request);assert.equal(calls.at(-1)[1],'rpc/ox_service');
  let failures=0;await assert.rejects(invokeLearning('bootstrap',actor,{summaryOnly:true},async()=>{failures++;throw Object.assign(Error('missing gateway'),{storeStatus:404});}),/missing gateway/);
  assert.equal(failures,1,'Missing policy functions must never bypass device enforcement');
  assert.ok(fs.readFileSync('criminal-law-ox-access.js','utf8').includes("guarded('bootstrap',{summaryOnly:true})"));
});

test('question batch validation rejects excessive, duplicated and malformed requests',()=>{
  validate({action:'questions',questions:[{id:'q',version:1}]});
  for(const questions of [undefined,[],[null],[{id:'',version:1}],[{id:'q',version:0}],[{id:'q',version:1},{id:'q',version:1}],Array.from({length:51},(_,i)=>({id:String(i),version:1}))]) {
    assert.throws(()=>validate({action:'questions',questions}),/invalid_request/);
  }
  assert.throws(()=>validate({action:'bootstrap',summaryOnly:'true'}),/invalid_request/);
});

function questionFixture(count=45) {
  const requests=[],views=[],errors=[];
  const questions=Array.from({length:count},(_,i)=>({id:'q'+i,chapter_id:'c',version:1}));
  const context=vm.createContext({Map,Set,Promise,Error,route:'home',origin:'chapters',session:{ids:questions.map(q=>q.id),index:0},
    byId:new Map(questions.map(q=>[q.id,q])),root:{isConnected:true},main:{innerHTML:''},
    renderNav:()=>{},renderLoadedView:()=>views.push(context.route),button:label=>label,showError:error=>errors.push(error.code),
    reviewItemsForFilter:()=>questions.slice(0,3).map(q=>({q})),bookmarkedQuestions:()=>questions.slice(3,5),
    request:(action,body)=>new Promise((resolve,reject)=>requests.push({action,body,resolve,reject}))});
  const snippet=fs.readFileSync('scripts/ox-question-loading-runtime.js','utf8');
  assert.ok(fs.readFileSync('criminal-law-ox.js','utf8').replace(/\r\n/g,'\n').includes(snippet.replace(/\r\n/g,'\n').trim()));
  vm.runInContext(snippet,context);
  return {context,requests,views,errors,questions,respond:(index,transform=x=>x)=>{
    requests[index].resolve({questions:requests[index].body.questions.map(q=>transform({...q,prompt:'Text '+q.id,context:''}))});
  },flush:()=>new Promise(resolve=>setImmediate(resolve))};
}

test('home and chapters render without texts; quiz loads a stable 20-question batch only once',async()=>{
  const f=questionFixture();f.context.render();f.context.route='chapters';f.context.render();
  assert.equal(f.requests.length,0);assert.deepEqual(f.views,['home','chapters']);
  f.context.route='quiz';f.context.render();f.context.render();
  assert.equal(f.requests.length,1);assert.equal(f.requests[0].body.questions.length,20);
  assert.equal(f.views.length,2,'No blank question is shown');f.respond(0);await f.flush();
  assert.equal(f.views.at(-1),'quiz');
  for(let i=1;i<20;i++){f.context.session.index=i;f.context.render();}
  assert.equal(f.requests.length,1,'Advancing within a batch never fetches one extra question per answer');
  f.context.session.index=20;f.context.render();assert.equal(f.requests.length,2);f.respond(1);await f.flush();
  assert.equal(f.questions[40].prompt,undefined);
});

test('review and bookmarks fetch only visible texts and obsolete loads cannot overwrite navigation',async()=>{
  const f=questionFixture();f.context.route='review';f.context.render();assert.equal(f.requests[0].body.questions.length,3);
  f.context.route='bookmarks';f.context.render();assert.equal(f.requests[1].body.questions.length,2);
  f.respond(0);await f.flush();assert.equal(f.views.length,0);
  f.respond(1);await f.flush();assert.deepEqual(f.views,['bookmarks']);
  f.context.route='review';f.context.render();assert.equal(f.requests.length,2);assert.equal(f.views.at(-1),'review');
});

test('failed text loads retry and malformed or changed batches never partially update questions',async()=>{
  const f=questionFixture();f.context.route='quiz';f.context.render();
  f.requests[0].reject(Object.assign(Error('offline'),{code:'offline'}));await f.flush();
  assert.deepEqual(f.errors,['offline']);assert.ok(f.context.main.innerHTML.includes('다시 시도'));
  f.context.render();assert.equal(f.requests.length,2);
  f.respond(1,q=>q.id==='q19'?{...q,version:2}:q);await f.flush();
  assert.equal(f.errors.at(-1),'question_changed');assert.ok(f.questions.every(q=>q.prompt===undefined));
  f.context.render();f.respond(2);await f.flush();assert.equal(f.views.at(-1),'quiz');
});

test('large text lists use bounded sequential batches and ignore unmounted views',async()=>{
  const f=questionFixture(105);const operation=f.context.loadQuestionTexts(f.questions);
  assert.equal(f.requests.length,1);assert.equal(f.requests[0].body.questions.length,50);
  f.respond(0);await f.flush();assert.equal(f.requests.length,2);assert.equal(f.requests[1].body.questions.length,50);
  f.respond(1);await f.flush();assert.equal(f.requests.length,3);assert.equal(f.requests[2].body.questions.length,5);
  f.respond(2);await operation;
  const gone=questionFixture();gone.context.route='quiz';gone.context.render();gone.context.root.isConnected=false;gone.respond(0);await gone.flush();
  assert.equal(gone.views.length,0);
});
