const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=file=>fs.readFileSync(file,'utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const settle=()=>new Promise(resolve=>setImmediate(resolve));
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
