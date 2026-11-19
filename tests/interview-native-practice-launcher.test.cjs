const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('client/interview-native-practice-launcher.mjs','utf8').replaceAll('export ','');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function harness(request=async()=>({code:'a'.repeat(43)})){
 const nodes=new Map(),timers=new Map();let next=0,back=0;const host={innerHTML:'',querySelector(id){if(!nodes.has(id))nodes.set(id,{hidden:false,href:'',listeners:{},addEventListener(e,fn){this.listeners[e]=fn;},removeEventListener(e){delete this.listeners[e];},removeAttribute(k){delete this[k];}});return nodes.get(id);},replaceChildren(){this.innerHTML='';}};
 const context={URLSearchParams,location:{search:'?nativePractice=1'},setTimeout(fn,ms){const id=++next;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);}};vm.createContext(context);vm.runInContext(source,context);
 const view=context.mountNativePracticeLauncher(host,{mode:'job',request,onBack:()=>back++});return {context,host,nodes,timers,view,back:()=>back};
}
test('Android handoff is bound to a known app package and exactly two practice modes',()=>{
 const h=harness();assert.match(h.context.nativePracticeUrl('a'.repeat(43),'job'),/package=com\.ronpark\.study;end$/);
 for(const args of [['invalid','job'],['a'.repeat(43),'ai'],['a'.repeat(43),'job','evil.app']])assert.throws(()=>h.context.nativePracticeUrl(...args));h.view.destroy();
});
test('launcher prepares once, expires credentials and returns the underlying app to its list after activation',async()=>{
 let calls=0;const h=harness(async(url,body)=>{calls++;assert.equal(url,'/api/interview-native-practice');assert.equal(body.mode,'job');assert.equal(body.action,'launch');return {code:'a'.repeat(43)};});await settle();const open=h.nodes.get('[data-native-open]');assert.equal(open.hidden,false);assert.match(open.href,/interview\/practice\?code=a+&mode=job/);assert.equal(calls,1);
 open.listeners.click({preventDefault(){assert.fail();}});[...h.timers.values()].find(t=>t.ms===0).fn();assert.equal(h.back(),1);assert.equal(open.hidden,true);assert.equal(open.href,undefined);h.view.destroy();
});
test('leaving during preparation discards a late launch code',async()=>{
 let resolve;const h=harness(()=>new Promise(r=>resolve=r));h.view.destroy();resolve({code:'a'.repeat(43)});await settle();assert.equal(h.host.innerHTML,'');assert.equal(h.timers.size,0);
});
