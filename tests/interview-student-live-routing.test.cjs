'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function element(){const nodes=new Map(),listeners=new Map();return {nodes,listeners,innerHTML:'',style:{},classList:{add(){},toggle(){},contains(){return false;}},querySelector(s){if(!nodes.has(s))nodes.set(s,element());return nodes.get(s);},querySelectorAll(){return [];},replaceWith(){},replaceChildren(){this.innerHTML='';},addEventListener(k,v){listeners.set(k,v);},removeEventListener(k){listeners.delete(k);}};}
for(const mode of ['ai','job','personality'])for(const installed of [false,true])test(`ordinary app keeps ${mode} coming soon even for an approved account (installed=${installed})`,async()=>{
 const host=element(),calls=[],imports=[];
 const window={addEventListener(){},removeEventListener(){},scrollTo(){}};
 if(installed)window.webkit={messageHandlers:{interviewNative:{}}};
 const context={URLSearchParams,AbortController,document:{createElement:element},window,location:{hash:'#interview-prep?tab=mock&mockMode='+mode},history:{replaceState(){},pushState(){}},localStorage:{setItem(){}},loadMode:async url=>{imports.push(url);throw Error('ordinary app must not load interview controllers');}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('interview-app-ui.js','utf8').replace(/^import .*\r?\n/gm,'').replaceAll('export ','').replace(/await import\(([^)]+)\)/g,'await loadMode($1)'),context);
 const view=await context.mountInterviewApp(host,{request:async action=>{calls.push(action);return {allowed:true};},aiRequest:async()=>{throw Error('ordinary app must not call interview APIs');}});
 assert.match(host.querySelector('[data-app-content]').innerHTML,/준비 중입니다\./);
 assert.equal(imports.length,0);assert.deepEqual(calls,['mock_status','mock_status']);
 assert.equal(view.canLeave(),true);view.destroy();
});
for(const mode of ['ai','job','personality'])test(`${mode} mounts only its own authenticated student controller`,async()=>{
 const host=element(),calls=[],mounts=[],imports=[];let leave=false,destroyed=0;
 const controller=async(_host,options)=>{mounts.push(options);await options.request('ready');return {canLeave:()=>leave,destroy(){destroyed++;}};};
 // Existing job/personality mounts are synchronous.
 const syncController=(_host,options)=>{mounts.push(options);void options.request('ready');return {canLeave:()=>leave,destroy(){destroyed++;}};};
 const context={URLSearchParams,AbortController,document:{createElement:element},window:{__ronparkMockTestApp:true,addEventListener(){},removeEventListener(){},scrollTo(){}},location:{hash:'#interview-prep?tab=mock&mockMode='+mode},history:{replaceState(){},pushState(){}},localStorage:{getItem(){return null;},setItem(){}},loadMode:async url=>{imports.push(url);return {mountLive:controller,mountJobExam:syncController,mountPersonalityPractice:syncController};}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('interview-app-ui.js','utf8').replace(/^import .*\r?\n/gm,'').replaceAll('export ','').replace(/await import\(([^)]+)\)/g,'await loadMode($1)'),context);
 const view=await context.mountInterviewApp(host,{account:{id:'ip-a'},request:async action=>{calls.push(action);return action==='mock_status'?{allowed:true}:{};},aiRequest:async(url,body)=>{calls.push({url,...body});return {ready:true};}});
 const endpoint={ai:'/api/interview-live',job:'/api/interview-job-exam',personality:'/api/interview-personality'}[mode];
 assert.deepEqual(calls,['mock_status','mock_status',{url:endpoint,action:'ready'}]);assert.equal(imports.length,1);assert.equal(mounts.length,1);assert.equal(view.canLeave(),false);
 const click=host.listeners.get('click');await click({target:{closest:()=>({dataset:{appTab:'home'},hasAttribute:()=>false})}});assert.equal(calls.length,3);assert.equal(destroyed,0);
 leave=true;await click({target:{closest:()=>({dataset:{appTab:'my'},hasAttribute:()=>false})}});assert.equal(destroyed,1);assert.equal(calls.at(-1),'bootstrap');view.destroy();
});
for(const offline of [false,true])test(`unapproved account cannot see or deep-link into modes (offline=${offline})`,async()=>{
 const host=element(),imports=[];
 const context={URLSearchParams,AbortController,document:{createElement:element},window:{addEventListener(){},removeEventListener(){},scrollTo(){}},location:{hash:'#interview-prep?tab=mock&mockMode=job'},history:{replaceState(){},pushState(){}},localStorage:{setItem(){}},loadMode:async url=>{imports.push(url);throw Error('must not import');}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('interview-app-ui.js','utf8').replace(/^import .*\r?\n/gm,'').replaceAll('export ','').replace(/await import\(([^)]+)\)/g,'await loadMode($1)'),context);
 const view=await context.mountInterviewApp(host,{request:async action=>{if(action==='mock_status'){if(offline)throw Error('offline');return {allowed:false};}return {};}});
 assert(!host.innerHTML.includes('data-app-tab="mock"'));assert.equal(imports.length,0);
 await host.listeners.get('click')({target:{closest:()=>({dataset:{appTab:'mock'},hasAttribute:()=>false})}});
 assert.equal(imports.length,0);view.destroy();
});
for(const mode of ['job','personality','ai'])test('test iPhone opens authorized Windows practice: '+mode,async()=>{
 const host=element(),sent=[],imports=[];
 const context={URLSearchParams,AbortController,document:{createElement:element},window:{__ronparkMockTestApp:true,__ronparkPracticeNative:true,__ronparkWindowsPractice:true,webkit:{messageHandlers:{interviewPractice:{postMessage:v=>sent.push(v)}}},addEventListener(){},removeEventListener(){},scrollTo(){}},location:{hash:'#interview-prep?tab=mock&mockMode='+mode},history:{replaceState(){},pushState(){}},localStorage:{setItem(){}},loadMode:async url=>{imports.push(url);throw Error('must not load cloud exam');}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('interview-app-ui.js','utf8').replace(/^import .*\r?\n/gm,'').replaceAll('export ','').replace(/await import\(([^)]+)\)/g,'await loadMode($1)'),context);
 let allowed=true;const view=await context.mountInterviewApp(host,{request:async()=>({allowed})});
 const slot=host.querySelector('[data-app-content]').querySelector('[data-mock-mode="'+mode+'"]');
 const button=slot.querySelector('[data-native-practice]');assert.match(slot.innerHTML,/연습 시작/);
 await button.onclick({currentTarget:button});assert.equal(sent[0].mode,mode);assert.equal(imports.length,0);
 allowed=false;await button.onclick({currentTarget:button});assert.equal(sent.length,1);view.destroy();
});

for(const mode of ['job','personality','ai'])test('OpenAI test iPhone routes only the selected mode to its authenticated API: '+mode,async()=>{
 const host=element(),calls=[],mounts=[],imports=[];
 const native=async(_host,options)=>{mounts.push('native-live');assert.equal(options.platform,'ios');await options.request('/api/interview-native',{action:'launch'});return {canLeave:()=>true,destroy(){}};};
 const exam=(_host,options)=>{mounts.push('recorded-answer');void options.request('status');return {canLeave:()=>true,destroy(){}};};
 const context={URLSearchParams,AbortController,document:{createElement:element},window:{__ronparkMockTestApp:true,__ronparkOpenAIPractice:true,__ronparkPracticeNative:true,__ronparkWindowsPractice:true,webkit:{messageHandlers:{interviewNative:{},interviewPractice:{postMessage:v=>calls.push({nativePractice:v.mode})}}},addEventListener(){},removeEventListener(){},scrollTo(){}},location:{hash:'#interview-prep?tab=mock&mockMode='+mode},history:{replaceState(){},pushState(){}},localStorage:{setItem(){}},loadMode:async url=>{imports.push(url);return {mountNativeInterview:native,mountJobExam:exam,mountPersonalityPractice:exam,mountLive:()=>{throw Error('native AI must use its handoff');}};}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('interview-app-ui.js','utf8').replace(/^import .*\r?\n/gm,'').replaceAll('export ','').replace(/await import\(([^)]+)\)/g,'await loadMode($1)'),context);
 const view=await context.mountInterviewApp(host,{account:{id:'ip-a'},request:async()=>({allowed:true}),aiRequest:async(url,body)=>{calls.push({url,...body});return {ok:true};}});
 if(mode!=='ai'){
  const slot=host.querySelector('[data-app-content]').querySelector('[data-mock-mode="'+mode+'"]');
  const button=slot.querySelector('[data-native-practice]');await button.onclick({currentTarget:button});
  assert.equal(imports.length,0);assert.equal(mounts.length,0);assert.deepEqual(calls,[{nativePractice:mode}]);
 }else{assert.equal(imports.length,1);assert.deepEqual(calls,[{url:'/api/interview-native',action:'launch'}]);assert.equal(mounts[0],'native-live');}
 view.destroy();
});
