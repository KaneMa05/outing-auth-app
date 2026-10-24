const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {test}=require('node:test');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function element(){
 const nodes=new Map(),listeners=new Map();
 return {innerHTML:'',inert:false,style:{},classList:{add(){},toggle(){},contains(){return false;}},listeners,
  querySelector(s){if(!nodes.has(s))nodes.set(s,element());return nodes.get(s);},querySelectorAll(){return [];},
  addEventListener(k,v){listeners.set(k,v);},removeEventListener(k){listeners.delete(k);},replaceChildren(){this.innerHTML='';}};
}
function load(file,extra={}){
 const context={URLSearchParams,AbortController,document:{createElement:element},window:{addEventListener(){},removeEventListener(){},scrollTo(){}},
  location:{hash:''},history:{replaceState(){},pushState(){}},localStorage:{getItem(){return null;},setItem(){}},...extra};
 vm.createContext(context);
 vm.runInContext(fs.readFileSync(file,'utf8').replace(/^import .*\r?\n/gm,'').replaceAll('export ',''),context);
 return context;
}

test('home starts all independent reads before any response, and my loads only membership',async()=>{
 const calls=[],pending=new Map(['bootstrap','life_get','writing_list'].map(a=>[a,deferred()]));
 const host=element(),c=load('interview-app-ui.js');
 const mounted=c.mountInterviewApp(host,{request:action=>{calls.push(action);return pending.get(action).promise;}});
 assert.deepEqual(calls,['bootstrap','life_get','writing_list']);
 pending.get('bootstrap').resolve({notes:[],topics:[],member:{}});
 pending.get('life_get').resolve({profile:null});pending.get('writing_list').resolve({writings:[]});
 const view=await mounted;
 assert.match(host.querySelector('[data-app-content]').innerHTML,/나의 면접 준비/);
 calls.length=0;
 await host.listeners.get('click')({target:{closest:()=>({dataset:{appTab:'my'},hasAttribute:()=>false})}});
 assert.deepEqual(calls,['bootstrap']);view.destroy();
});

test('editors load directly without an unused bootstrap; unsaved edits still block navigation',async()=>{
 for(const page of ['db','introduction','motivation','public_service']){
  const calls=[];let leave=true;
  const child=request=>({ready:request(page==='db'?'life_get':'writing_list'),canLeave:()=>leave,destroy(){}});
  const host=element(),c=load('interview-workspace.js',{
   mountLife:(host,{request})=>child(request),mountWriting:(host,{request})=>child(request),
   mountInterviewAI:()=>({destroy(){}})
  });
  const view=await c.mountWorkspace(host,{initialPage:page,request:async action=>{calls.push(action);if(action==='bootstrap')throw Error('unnecessary bootstrap');return {};}});
  assert.deepEqual(calls,[page==='db'?'life_get':'writing_list']);assert.equal(view.canLeave(),true);
  leave=false;assert.equal(view.canLeave(),false);view.destroy();
 }
});

function aiHarness(kind='self_intro'){
 const prep=deferred(),previous=deferred(),generated=deferred(),calls=[],locks=[];
 const host=element(),c=load('interview-ai-ui.js',{createInterviewAI:()=>({
  prepare(){calls.push('prepare');return prep.promise;},requests(){calls.push('requests');return previous.promise;},
  generate(){calls.push('generate');return generated.promise;},pause(){},destroy(){}
 })});
 const view=c.mountInterviewAI(host,{kind,onBusy:value=>locks.push(value)});
 return {host,view,prep,previous,generated,calls,locks};
}
test('slow AI reads run concurrently without locking the editor; generation still locks',async()=>{
 const h=aiHarness();assert.deepEqual(h.calls,['prepare','requests']);assert.deepEqual(h.locks,[]);
 h.prep.resolve({enabled:true,dbReady:true,experienceCount:3});h.previous.resolve({requests:[]});await h.view.ready;
 h.host.onclick({target:{closest:()=>({hasAttribute:key=>key==='data-ai-generate',dataset:{}})}});
 assert.deepEqual(h.locks,[true]);assert.equal(h.calls.at(-1),'generate');
 h.generated.resolve({});await settle();assert.deepEqual(h.locks,[true,false]);h.view.destroy();
});
test('AI read failure never locks editing, and late responses cannot restore a destroyed screen',async()=>{
 const failed=aiHarness();failed.prep.reject(Error('offline'));failed.previous.resolve({requests:[]});await failed.view.ready;
 assert.deepEqual(failed.locks,[]);failed.view.destroy();
 const late=aiHarness();late.view.destroy();late.prep.resolve({enabled:false});late.previous.resolve({requests:[]});await late.view.ready;
 assert.equal(late.host.innerHTML,'');assert.deepEqual(late.locks,[]);
});
test('legacy core question selection keeps its edit lock during initial refresh',async()=>{
 const h=aiHarness('core30');assert.deepEqual(h.locks,[true]);
 h.prep.resolve({enabled:false,questions:[]});h.previous.resolve({requests:[]});await h.view.ready;
 assert.deepEqual(h.locks,[true,false]);h.view.destroy();
});
test('all interview functions use the database region without changing other app regions or limits',()=>{
 const config=JSON.parse(fs.readFileSync('vercel.json','utf8'));
 for(const file of fs.readdirSync('api').filter(name=>/^interview-.*\.js$/.test(name)))assert.deepEqual(config.functions['api/'+file].regions,['syd1'],file);
 assert.equal(config.regions,undefined);assert.equal(config.functions['api/interview-preassignments.js'].maxDuration,240);
 assert.equal(config.functions['api/interview-live-socket.js'].maxDuration,800);
});
