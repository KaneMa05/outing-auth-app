const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function node(){const children=new Map(),listeners=new Map();return {innerHTML:'',textContent:'',disabled:false,dataset:{},classList:{add(){},remove(){},toggle(){}},listeners,
 setAttribute(){},hasAttribute(){return false;},addEventListener:(k,v)=>listeners.set(k,v),removeEventListener:k=>listeners.delete(k),
 querySelector(s){if(!children.has(s))children.set(s,node());return children.get(s);},querySelectorAll(){return [];}};}
function harness(){
 const host=node(),storage=new Map(),calls=[],controls=[node()],windowListeners=new Map();let handler=async()=>({ok:true});
 host.querySelectorAll=()=>controls;
 const c={crypto:{randomUUID},console,FormData,URL,confirm:()=>true,document:{querySelector:()=>true},
 localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
 window:{addEventListener:(k,v)=>windowListeners.set(k,v),removeEventListener:k=>windowListeners.delete(k)}};
 vm.createContext(c);vm.runInContext(fs.readFileSync('client/interview-aptitude.mjs','utf8').replaceAll('export ',''),c);
 const id=randomUUID(),round={id,kind:'half',roundNo:1,title:'하프 1회',revision:1,keyRevision:1,state:'open',accepting:true,questionCount:75,perSection:15};
 const detail=()=>({ok:true,studentId:'account-a',round,attempt:null});
 const request=async(action,body)=>{calls.push({action,body});if(action==='list')return {ok:true,studentId:'account-a',rounds:[round]};if(action==='get')return detail();return handler(action,body);};
 const click=(action,extra={})=>host.listeners.get('click')({target:{closest:()=>({disabled:false,dataset:{iaAction:action,...extra}})}});
 const answer=()=>host.listeners.get('change')({target:{value:'2',dataset:{answer:'0'},matches:()=>false,hasAttribute:k=>k==='data-answer'}});
 return {c,host,storage,calls,controls,windowListeners,id,detail,click,answer,setHandler:v=>handler=v,mount:()=>c.mountAptitude(host,{request})};
}
test('empty submissions stay editable; failed saves retain account-scoped answers and ambiguous final submissions freeze until refresh',async()=>{
 const h=harness(),view=await h.mount();await h.click('open',{id:h.id});
 await h.click('submit');assert.equal(h.calls.some(c=>c.action==='submit'),false);assert.equal(h.controls[0].disabled,false);
 h.answer();h.setHandler(async()=>{throw new TypeError('network lost');});await h.click('save');
 assert.equal(h.controls[0].disabled,false);assert.equal(h.storage.size,1);
 let saved=JSON.parse([...h.storage.values()][0]);assert.equal(saved.answers[0],2);assert([...h.storage.keys()][0].includes('account-a'));
 await h.click('submit');assert.equal(h.controls[0].disabled,true);
 saved=JSON.parse([...h.storage.values()][0]);assert.equal(saved.uncertain,true);assert.equal(typeof saved.pendingKey,'string');
 const submit=h.calls.find(c=>c.action==='submit');assert.equal(submit.body.accountId,'account-a');
 await h.click('reload');assert.equal(h.controls[0].disabled,false);assert.equal(h.calls.filter(c=>c.action==='submit').length,1);
 h.setHandler(async(_a,b)=>({...h.detail(),attempt:{state:'submitted',revision:1,answers:b.answers}}));await h.click('submit');
 assert.equal(h.calls.filter(c=>c.action==='submit')[1].body.requestKey,submit.body.requestKey);assert.equal(h.storage.size,0);
 view.destroy();assert.equal(h.windowListeners.size,0);
});
test('a completed save clears the backup and a late response cannot render after navigation',async()=>{
 const h=harness(),view=await h.mount();await h.click('open',{id:h.id});h.answer();
 h.setHandler(async(_a,b)=>({...h.detail(),attempt:{state:'draft',revision:1,answers:b.answers}}));await h.click('save');
 assert.equal(h.storage.size,0);view.destroy();assert.equal(h.storage.size,0);
 const late=harness(),lateView=await late.mount();await late.click('open',{id:late.id});late.answer();
 let resolve;late.setHandler(()=>new Promise(r=>resolve=r));const pending=late.click('submit');lateView.destroy();
 const html=late.host.innerHTML;resolve({...late.detail(),attempt:{state:'submitted',revision:1,answers:Array(75).fill(2)}});await pending;await settle();
 assert.equal(late.host.innerHTML,html);assert.equal(late.storage.size,1);
});
test('bulk answer input accepts all five circled choices and rejects missing or unsupported answers',async()=>{
 const {parseAnswerKey}=await import('../client/interview-aptitude.mjs');
 assert.deepEqual(parseAnswerKey('① ②,③;④ ⑤',5),[1,2,3,4,5]);
 assert.throws(()=>parseAnswerKey('1 2 3 4',5),/5개/);assert.throws(()=>parseAnswerKey('1 2 3 4 6',5),/1~5/);
});
