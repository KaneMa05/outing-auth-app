const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=file=>fs.readFileSync(file,'utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('only the installed iOS lecture screen restores dark full-screen edges and resets on account changes',()=>{
 for(const [category,standalone,ua,page,native] of [
  ['lecture',true,'iPhone','student',false],['offline',true,'iPhone','student',false],
  ['online_managed',true,'iPhone','student',false],['lecture',false,'iPhone','student',false],
  ['lecture',true,'Android','student',false],['lecture',true,'iPhone','teacher',false],
  ['lecture',true,'iPhone','student',true],
 ]){
  const classes=new Set();const metas=Object.fromEntries([['viewport','width=device-width, initial-scale=1'],['apple-mobile-web-app-status-bar-style','default'],['theme-color','#f3f7fb']].map(([name,value])=>[name,{value,getAttribute(){return this.value;},setAttribute(_,next){this.value=next;}}]));
  const saved={settings:{studentAuthId:'20001',studentProfiles:{'20001':{passwordHash:'test',deviceToken:'test'}}},students:[{id:'20001',studentCategory:category}]};
  const context=vm.createContext({navigator:{standalone,userAgent:ua},URLSearchParams,location:{search:''},sessionStorage:{getItem(){}},localStorage:{getItem:()=>JSON.stringify(saved)},
   window:{webkit:native?{messageHandlers:{interviewNative:{}}}:undefined,matchMedia:()=>({matches:standalone}),setTimeout(){},clearTimeout(){}},
   document:{currentScript:{dataset:{startupPage:page}},referrer:'',documentElement:{classList:{add:x=>classes.add(x),toggle:(x,on)=>on?classes.add(x):classes.delete(x)}},
    querySelector:s=>metas[s.match(/name="([^"]+)"/)?.[1]],addEventListener(){}}});
  vm.runInContext(read('app-startup.js'),context);
  const expected=category==='lecture'&&standalone&&ua==='iPhone'&&page==='student'&&!native;
  assert.equal(classes.has('student-lecture-ios-standalone'),expected);
  assert.equal(metas.viewport.value.includes('viewport-fit=cover'),expected);
  assert.equal(metas['apple-mobile-web-app-status-bar-style'].value,expected?'black-translucent':'default');
  if(expected){context.window.__studentViewport.update('offline');assert.equal(metas.viewport.value,'width=device-width, initial-scale=1');assert.equal(metas['theme-color'].value,'#f3f7fb');assert.equal(classes.has('student-lecture-ios-standalone'),false);}
 }
});
function portalHarness(){
 const session=deferred(),home=deferred(),calls=[];
 const box={innerHTML:''},host={innerHTML:'',querySelector:()=>box,addEventListener(){}},actions={innerHTML:''};
 const context=vm.createContext({URL,URLSearchParams,AbortSignal,navigator:{},location:{search:'?app=1',href:'https://example.test/interview?app=1'},
  sessionStorage:{getItem(){},setItem(){}},localStorage:{setItem(){}},
  window:{__appStartup:{finish(){calls.push('finish');}}},
  document:{referrer:'',body:{classList:{toggle(){}}},querySelector:s=>s==='#interview-portal'?host:s==='#portal-actions'?actions:null,addEventListener(){}},
  fetch:()=>session.promise,
  mountInterviewLogin:(host,options)=>{calls.push(options.retry?'retry':'login');return ()=>{};},
  loadModule:async()=>({mountInterviewApp:async()=>{calls.push('mount');await home.promise;calls.push('home');return {destroy(){}};}})
 });
 vm.runInContext(read('interview-portal.js').replace(/^import .*\r?\n/,'').replace('import(appMode?', 'loadModule(appMode?'),context);
 return {session,home,calls,box};
}
test('startup waits through session AND home reads before a single reveal',async()=>{
 const h=portalHarness();await settle();assert.deepEqual(h.calls,[]);
 h.session.resolve({ok:true,json:async()=>({ok:true,authenticated:true,available:true,account:{ownerId:'test',name:'테스트'}})});
 await settle();assert.deepEqual(h.calls,['mount']);
 h.home.resolve();await settle();assert.deepEqual(h.calls,['mount','home','finish']);
});
test('expired session reveals login directly; network failure reveals retry',async()=>{
 for(const failed of [false,true]){
  const h=portalHarness();
  if(failed)h.session.reject(Error('offline'));
  else h.session.resolve({ok:true,json:async()=>({ok:true,authenticated:false})});
  await settle();assert.deepEqual(h.calls,[failed?'retry':'login','finish']);
 }
});
test('home initialization failure reveals an actionable error instead of a stuck cover',async()=>{
 const h=portalHarness();h.session.resolve({ok:true,json:async()=>({ok:true,authenticated:true,available:true,account:{ownerId:'test'}})});
 await settle();h.home.reject(Error('offline'));await settle();
 assert.deepEqual(h.calls,['mount','finish']);assert.match(h.box.innerHTML,/data-refresh/);
});
test('slow startup keeps the cover and exposes retry; completion fades only once',()=>{
 const classes=new Set(),timers=new Map(),frames=[],retry={hidden:true},message={},overlay={setAttribute(){},remove(){this.removed=true;}};
 let timerId=0,reloads=0,click;
 const context=vm.createContext({URLSearchParams,navigator:{standalone:true},location:{search:'',reload(){reloads++;}},sessionStorage:{getItem(){}},
  requestAnimationFrame:fn=>frames.push(fn),
  window:{matchMedia:()=>({matches:false}),setTimeout:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)},
  document:{currentScript:{dataset:{startupPage:'student'}},referrer:'',documentElement:{classList:{add:(...xs)=>xs.forEach(x=>classes.add(x)),remove:(...xs)=>xs.forEach(x=>classes.delete(x))}},
   querySelector:s=>s==='[data-startup-message]'?message:retry,getElementById:()=>overlay,addEventListener:(_,fn)=>click=fn}
 });
 vm.runInContext(read('app-startup.js'),context);
 assert(classes.has('app-starting'));timers.get(1).fn();assert.equal(retry.hidden,false);assert.match(message.textContent,/지연/);assert(classes.has('app-starting'));
 click({target:{closest:()=>retry}});assert.equal(reloads,1);
 context.window.__appStartup.finish();context.window.__appStartup.finish();assert.equal(frames.length,1);
 frames.shift()();frames.shift()();assert(classes.has('app-startup-leaving'));assert.equal(overlay.inert,true);
 [...timers.values()].find(t=>t.ms===240).fn();assert.equal(classes.size,0);assert.equal(overlay.removed,true);
});
test('student shell waits for remote data and pending interview module; ordinary ready view can reveal',()=>{
 let pending=false,finishes=0;
 const app={children:[{}],removeAttribute(){},querySelector:()=>pending?{}:null};
 const context=vm.createContext({qs:()=>app,fallbackMode:true,window:{__studentStartupDataPending:true,__appStartup:{finish(){finishes++;}}}});
 const fn=read('index.html').match(/window\.__studentAppReady = function \(\) \{[\s\S]*?\n        \};/)[0];vm.runInContext(fn,context);
 context.window.__studentAppReady();assert.equal(finishes,0);
 context.window.__studentStartupDataPending=false;pending=true;context.window.__studentAppReady();assert.equal(finishes,0);
 pending=false;context.window.__studentAppReady();assert.equal(finishes,1);
});
