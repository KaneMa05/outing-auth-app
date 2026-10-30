const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {test}=require('node:test');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function element(){const nodes=new Map(),listeners=new Map(),attrs=new Set();return {
 nodes,listeners,attrs,dataset:{},classList:{add(){}},hidden:false,disabled:false,textContent:'',innerHTML:'',isConnected:true,
 querySelector(s){if(!nodes.has(s))nodes.set(s,element());return nodes.get(s);},querySelectorAll(){return [];},contains(){return true;},setAttribute(k,v){this[k]=v;},close(){this.open=false;},showModal(){this.open=true;},focus(){},play:async()=>{},pause(){},
 addEventListener(k,v){listeners.set(k,v);},removeEventListener(k){listeners.delete(k);},
 hasAttribute(k){return attrs.has(k);},closest(){return this;},replaceChildren(){this.innerHTML='';},
 };}
function harness({request,connect,mediaDevices={getUserMedia:async()=>{throw Error('permission');}}}){
 const host=element();
 const window={RTCPeerConnection(){},addEventListener(){},removeEventListener(){}};
 const context={window,navigator:{mediaDevices},document:{querySelector:()=>true},AbortController,setInterval,clearInterval,connectLive:connect};
 vm.createContext(context);
 vm.runInContext(fs.readFileSync('interview-live-ui.js','utf8').replace(/^export \{mountLive\}.*$/m,'').replaceAll('export async function','async function').replaceAll('export function','function'),context);
 vm.runInContext(fs.readFileSync('client/interview-live-view.js','utf8').replace(/^import .*\r?\n/gm,'').replace(/^const esc=.*\r?\n/m,'').replaceAll('export async function','async function'),context);
 return {host,mount:()=>context.mountLive(host,{request,connect}),click(name){const button=host.querySelector(`[${name}]`);button.attrs.add(name);return host.listeners.get('click')({target:button});}};
}
test('slow history does not block readiness or leaving; late completion stays detached',async()=>{
 const history=deferred();
 const h=harness({request:action=>action==='ready'?Promise.resolve({ready:true}):history.promise});
 const view=await h.mount();await settle();
 assert.equal(view.canLeave(),true);
 assert.equal(h.host.querySelector('[data-live-start]').disabled,false);
 view.destroy();history.resolve({runs:[],hasMore:false});await settle();
 assert.equal(h.host.innerHTML,'');
});
test('ending remains available during answer processing; late answer cannot overwrite saved status',async()=>{
 const answer=deferred(),closing=deferred();let finishes=0,submits=0;
 const h=harness({request:async action=>action==='ready'?{ready:true}:action==='get'?{run:{state:'completed',turns:[],retain_until:'2026-11-20'}}:{runs:[],hasMore:false},
  connect:async()=>({runId:'run',question:'질문',request:()=>{submits++;return answer.promise;},stop:()=>{finishes++;return closing.promise;}})});
 const view=await h.mount();await settle();await h.click('data-live-start');
 const pending=h.click('data-live-done');
 assert.equal(h.host.querySelector('[data-live-done]').disabled,true);
 assert.equal(h.host.querySelector('[data-live-stop]').disabled,false);
 await h.click('data-live-done');assert.equal(submits,1);
 const stopped=h.click('data-live-stop');assert.equal(finishes,1);
 assert.match(h.host.querySelector('[data-live-status]').textContent,/저장/);
 answer.resolve({waiting:true});await pending;
 assert.match(h.host.querySelector('[data-live-status]').textContent,/저장/);
 closing.resolve();await stopped;
 assert.equal(view.canLeave(),true);
 assert.match(h.host.querySelector('[data-live-status]').textContent,/종료했습니다/);
 view.destroy();
});
test('camera preview stays local and releases on exit; mute and captions do not pause the interview',async()=>{
 let released=0,muted;const calls=[];
 const h=harness({request:async action=>{calls.push(action);return action==='ready'?{ready:true}:{runs:[],hasMore:false};},
  mediaDevices:{getUserMedia:async constraints=>{assert.equal(constraints.audio,false);return {getTracks:()=>[{stop(){released++;}}]};}},
  connect:async()=>({runId:'run',question:'질문',setMuted:value=>{muted=value;},stop:async()=>{},request:async()=>({})})});
 const view=await h.mount();await settle();await h.click('data-live-camera');
 assert.ok(h.host.querySelector('[data-live-preview]').srcObject);
 assert.deepEqual(calls.sort(),['list','ready']);
 await h.click('data-live-start');await h.click('data-live-mute');assert.equal(muted,true);
 assert.match(h.host.querySelector('[data-live-status]').textContent,/계속 흐릅니다/);
 await h.click('data-live-exit');assert.equal(h.host.querySelector('[data-live-dialog]').open,true);
 await h.click('data-live-resume');assert.equal(h.host.querySelector('[data-live-dialog]').open,false);
 assert.equal(view.canLeave(),false);view.destroy();assert.equal(released,1);
});
test('late camera permission cannot retain capture after leaving',async()=>{
 const camera=deferred();let released=0;
 const h=harness({request:async action=>action==='ready'?{ready:true}:{runs:[],hasMore:false},mediaDevices:{getUserMedia:()=>camera.promise}});
 const view=await h.mount();await settle();const opening=h.click('data-live-camera');view.destroy();
 camera.resolve({getTracks:()=>[{stop(){released++;}}]});await opening;assert.equal(released,1);
});
test('microphone permission resolving after view destruction immediately releases capture',async()=>{
 const permission=deferred();let released=0;
 const h=harness({request:async action=>action==='ready'?{ready:true}:{runs:[],hasMore:false},mediaDevices:{getUserMedia:()=>permission.promise}});
 const view=await h.mount();await settle();const checking=h.click('data-live-mic');
 view.destroy();permission.resolve({getTracks:()=>[{stop(){released++;}}]});await checking;
 assert.equal(released,1);assert.equal(h.host.innerHTML,'');
});
test('ended report uses the saved snapshot; unknown closure never fabricates a report',async()=>{
 let state='completed',reads=0;
 const saved={version:1,state:'completed',createdAt:'2026-10-29T00:00:00Z',counts:{mainQuestions:1,plannedMainQuestions:3,followups:1,completedAnswers:2,incompleteAnswers:0,emptyTranscripts:0},turns:[],pendingQuestion:'<새 질문>',nextPractice:['<원음 확인>']};
 const h=harness({request:async action=>{
  if(action==='get'){reads++;return {run:{state,turns:[],result_report:state==='unknown'?null:saved,retain_until:'2099-01-01'}};}
  return action==='ready'?{ready:true}:{runs:[],hasMore:false};
 },connect:async()=>({runId:'run',question:'첫 질문',stop:async()=>{},request:async()=>({})})});
 const view=await h.mount();await settle();await h.click('data-live-start');await h.click('data-live-stop');await settle();
 const box=h.host.querySelector('[data-live-report-body]');
 assert.match(box.innerHTML,/data-live-saved-report/);assert.match(box.innerHTML,/&lt;새 질문&gt;/);assert.doesNotMatch(box.innerHTML,/<원음 확인>/);
 const count=reads;await h.click('data-live-load-report');assert.equal(reads,count+1);
 state='unknown';await h.click('data-live-load-report');assert.match(box.innerHTML,/서버에서 면접 종료를 확인/);assert.doesNotMatch(box.innerHTML,/data-live-saved-report/);view.destroy();
});
