const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function node(){const children=new Map(),listeners=new Map();return {innerHTML:'',textContent:'',disabled:false,dataset:{},classList:{add(){},remove(){},toggle(){}},listeners,
 setAttribute(){},hasAttribute(){return false;},addEventListener:(k,v)=>listeners.set(k,v),removeEventListener:k=>listeners.delete(k),
 querySelector(s){if(!children.has(s))children.set(s,node());return children.get(s);},querySelectorAll(){return [];}};}
function harness(){
 const host=node(),storage=new Map(),calls=[],controls=[node()],windowListeners=new Map(),intervals=new Map();let handler=async()=>({ok:true}),now=1000000,intervalId=0,availableRounds=null,serverDetail={};
 host.querySelectorAll=selector=>selector.startsWith('[data-timer-')?(host.querySelector('[data-ia-body]').innerHTML.includes(selector.slice(1,-1))?[host.querySelector(selector)]:[]):controls;
 const c={crypto:{randomUUID},console,FormData,URL,Date:class extends Date{static now(){return now;}},confirm:()=>true,document:{querySelector:()=>true},
 localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
 window:{addEventListener:(k,v)=>windowListeners.set(k,v),removeEventListener:k=>windowListeners.delete(k),setInterval:fn=>{intervals.set(++intervalId,fn);return intervalId;},clearInterval:id=>intervals.delete(id)}};
 vm.createContext(c);vm.runInContext(fs.readFileSync('client/interview-aptitude-timer.mjs','utf8').replaceAll('export ',''),c);
 vm.runInContext(fs.readFileSync('client/interview-aptitude.mjs','utf8').replace(/^import .*\r?\n/gm,'').replaceAll('export ',''),c);
 const id=randomUUID(),round={id,kind:'half',roundNo:1,title:'하프 1회',revision:1,keyRevision:1,state:'open',accepting:true,questionCount:75,perSection:15};
 const detail=()=>({ok:true,studentId:'account-a',round,attempt:null,...serverDetail});
 const request=async(action,body)=>{calls.push({action,body});if(action==='list')return {ok:true,studentId:'account-a',rounds:availableRounds||[round]};if(action==='get')return detail();return handler(action,body);};
 const click=(action,extra={})=>host.listeners.get('click')({target:{closest:()=>({disabled:false,dataset:{iaAction:action,...extra}})}});
 const answer=()=>{click('section',{section:'0'});return click('answer',{answer:'0',choice:'2'});};
 const timerSection=value=>{const el={value:String(value),matches:s=>s==='[data-timer-section-select]'};host.listeners.get('change')({target:el});return el.value;};
 return {c,host,storage,calls,controls,windowListeners,intervals,id,detail,click,answer,timerSection,setHandler:v=>handler=v,setRounds:v=>availableRounds=v,setDetail:v=>serverDetail=v,
  advance:ms=>{now+=ms;for(const callback of [...intervals.values()])callback();},mount:async(menu='answers')=>{const view=await c.mountAptitude(host,{request});if(menu!=='timer')await click('menu',{menu});return view;}};
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
test('subject and ten-question page navigation preserve every answer in a single round submission',async()=>{
 const h=harness(),view=await h.mount();
 await h.click('section',{section:'0'});await h.click('answer',{answer:'9',choice:'4'});await h.click('answer',{answer:'9',choice:'4'});
 await h.click('page',{page:'1'});await h.click('answer',{answer:'14',choice:'5'});
 await h.click('subjects');await h.click('section',{section:'4'});await h.click('page',{page:'1'});
 await h.click('answer',{answer:'74',choice:'2'});await h.click('subjects');
 h.setHandler(async(_a,b)=>({...h.detail(),attempt:{state:'draft',revision:1,answers:b.answers}}));await h.click('save');
 const saved=h.calls.find(c=>c.action==='save').body;
 assert.equal(saved.answers.length,75);assert.equal(saved.answers[9],4);assert.equal(saved.answers[14],5);assert.equal(saved.answers[74],2);
 assert.equal(saved.answers.filter(Boolean).length,3);assert.equal(saved.accountId,'account-a');assert.equal(h.storage.size,0);view.destroy();
});

test('timer is the first menu and remains usable before any exam rounds are opened',async()=>{
 const h=harness();h.setRounds([]);const view=await h.mount('timer');
 const html=h.host.querySelector('[data-ia-body]').innerHTML;
 assert.match(html,/타이머/);assert.match(html,/답안 입력/);assert.match(html,/성적 조회/);
 assert.deepEqual(h.calls.map(c=>c.action),['list']);
 await h.click('timer-toggle');h.advance(480001);
 const saved=JSON.parse(h.storage.get('interview-aptitude-timer:account-a'));
 assert.equal(saved.status,'finished');assert.equal(h.calls.some(c=>['submit','save'].includes(c.action)),false);
 assert.equal(h.intervals.size,0);view.destroy();assert.equal(h.windowListeners.size,0);
});

test('answers and an active clock survive all three menus without a background submission',async()=>{
 const h=harness(),view=await h.mount('timer');await h.click('timer-toggle');h.advance(6500);
 await h.click('menu',{menu:'answers'});h.answer();
 assert.match(h.host.querySelector('[data-ia-body]').innerHTML,/data-timer-mini/);
 const reads=h.calls.filter(c=>c.action==='get').length;
 await h.click('menu',{menu:'timer'});assert.equal(h.calls.filter(c=>c.action==='get').length,reads);
 await h.click('menu',{menu:'results'});
 assert.match(h.host.querySelector('[data-ia-body]').innerHTML,/아직 제출한 답안이 없습니다/);
 assert.doesNotMatch(h.host.querySelector('[data-ia-body]').innerHTML,/ia-score/);
 assert.doesNotMatch(h.host.querySelector('[data-ia-body]').innerHTML,/data-timer-mini/);
 await h.click('menu',{menu:'answers'});
 h.setHandler(async(_a,b)=>({...h.detail(),attempt:{state:'draft',revision:1,answers:b.answers}}));await h.click('save');
 assert.equal(h.calls.find(c=>c.action==='save').body.answers[0],2);
 assert.equal(h.calls.some(c=>c.action==='submit'),false);
 assert.equal(JSON.parse(h.storage.get('interview-aptitude-timer:account-a')).endAt,1480000);
 assert.equal(h.intervals.size,1);view.destroy();assert.equal(h.intervals.size,0);
});

test('the results menu waits for release and only then shows own grades and explanation files',async()=>{
 const h=harness(),view=await h.mount('timer');
 h.setDetail({attempt:{state:'submitted',revision:1,answers:Array(75).fill(2)}});
 await h.click('menu',{menu:'results'});
 assert.match(h.host.querySelector('[data-ia-body]').innerHTML,/성적 공개를 기다리고/);
 assert.doesNotMatch(h.host.querySelector('[data-ia-body]').innerHTML,/ia-score|해설지/);
 h.setDetail({attempt:{state:'submitted',revision:1,answers:Array(75).fill(2)},result:{correctCount:75,totalQuestions:75,accuracy:100,rank:1,participants:1},correctAnswers:Array(75).fill(2),files:[{id:randomUUID(),name:'공개 해설.pdf'}]});
 await h.click('menu',{menu:'answers'});assert.doesNotMatch(h.host.querySelector('[data-ia-body]').innerHTML,/ia-score|공개 해설/);
 await h.click('menu',{menu:'results'});
 assert.match(h.host.querySelector('[data-ia-body]').innerHTML,/ia-score/);assert.match(h.host.querySelector('[data-ia-body]').innerHTML,/공개 해설/);
 view.destroy();
});

test('a full-exam timer opens full-exam answers when no answer round has been loaded',async()=>{
 const h=harness(),half=h.detail().round,full={...half,id:randomUUID(),kind:'full',questionCount:150,perSection:30};
 h.setRounds([half,full]);h.setDetail({round:full});const view=await h.mount('timer');
 await h.click('timer-kind',{kind:'full'});await h.click('menu',{menu:'answers'});
 assert.equal(h.calls.find(c=>c.action==='get').body.id,full.id);
 assert.match(h.host.querySelector('[data-ia-body]').innerHTML,/0\/30 입력/);
 view.destroy();
});

test('changing the subject picker preserves a running timer when reset is declined',async()=>{
 const h=harness(),view=await h.mount('timer');await h.click('timer-toggle');h.advance(5000);
 h.c.confirm=()=>false;assert.equal(h.timerSection(2),'0');
 let timer=JSON.parse(h.storage.get('interview-aptitude-timer:account-a'));assert.equal(timer.section,0);assert.equal(timer.status,'running');
 h.c.confirm=()=>true;h.timerSection(2);timer=JSON.parse(h.storage.get('interview-aptitude-timer:account-a'));
 assert.equal(timer.section,2);assert.equal(timer.remainingMs,300000);assert.equal(timer.status,'idle');
 assert.equal(h.calls.filter(c=>c.action==='get').length,0);view.destroy();
});

test('an unrelated exam timer is hidden from answers and never appears in results',async()=>{
 const h=harness(),view=await h.mount();await h.click('menu',{menu:'timer'});await h.click('timer-toggle');
 await h.click('menu',{menu:'answers'});assert.equal(h.host.querySelector('[data-timer-mini]').hidden,false);
 await h.click('section',{section:'1'});assert.equal(h.host.querySelector('[data-timer-mini]').hidden,true);
 await h.click('subjects');assert.equal(h.host.querySelector('[data-timer-mini]').hidden,false);
 await h.click('menu',{menu:'timer'});await h.click('timer-kind',{kind:'full'});await h.click('timer-toggle');
 await h.click('menu',{menu:'answers'});assert.equal(h.host.querySelector('[data-timer-mini]').hidden,true);
 await h.click('menu',{menu:'results'});assert.doesNotMatch(h.host.querySelector('[data-ia-body]').innerHTML,/data-timer-mini/);
 assert.equal(JSON.parse(h.storage.get('interview-aptitude-timer:account-a')).status,'running');view.destroy();
});
