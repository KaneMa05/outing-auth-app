const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {test}=require('node:test');
const code='A'.repeat(43),source=fs.readFileSync('client/interview-native-launcher.js','utf8').replaceAll('export ','');
const settle=()=>new Promise(r=>setImmediate(r));
function harness({userAgent='Android',search='?nativeInterview=1',webkit,request=async()=>({code})}={}){
 const timers=new Map(),nodes=new Map();let n=0;
 const host={innerHTML:'',querySelector(s){if(!nodes.has(s))nodes.set(s,{hidden:false,href:'',listeners:{},setAttribute(){},removeAttribute(k){delete this[k];},addEventListener(k,fn){this.listeners[k]=fn;},removeEventListener(k){delete this.listeners[k];}});return nodes.get(s);},replaceChildren(){this.innerHTML='';}};
 const c={navigator:{userAgent},location:{search},URLSearchParams,webkit,setTimeout(fn,ms){const id=++n;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);}};vm.createContext(c);vm.runInContext(source,c);
 return {c,host,nodes,timers,mount:()=>c.mountNativeInterview(host,{request})};
}
test('ordinary web and home-screen iOS remain web; installed Android and iOS bridge opt into native',()=>{
 assert.equal(harness({search:''}).c.nativeInterviewPlatform(),null);
 assert.equal(harness({userAgent:'iPhone'}).c.nativeInterviewPlatform(),null);
 assert.equal(harness().c.nativeInterviewPlatform(),'android');
 assert.equal(harness({userAgent:'iPhone',webkit:{messageHandlers:{interviewNative:{}}}}).c.nativeInterviewPlatform(),'ios');
 assert.throws(()=>harness().c.nativeInterviewUrl('x;package=wrong'),/invalid_response/);
});
test('Android handoff is package-bound, expires, and discards its code after user activation',async()=>{
 const h=harness(),view=await h.mount();await settle();const link=h.nodes.get('[data-open]');
 assert.equal(link.hidden,false);assert.equal(link.href,`intent://interview/start?code=${code}#Intent;scheme=ronpark-study;package=com.ronpark.study;end`);
 const expiry=[...h.timers.values()].find(t=>t.ms===55000);assert(expiry);expiry.fn();assert.equal(link.hidden,true);assert(!link.href);
 await h.nodes.get('[data-retry]').listeners.click();link.listeners.click({preventDefault(){assert.fail('Android follows its intent link');}});
 [...h.timers.values()].find(t=>t.ms===0).fn();assert.equal(link.hidden,true);assert(!link.href);view.destroy();assert.equal(h.host.innerHTML,'');
});
test('iOS hands only the one-use code to its native bridge',async()=>{
 let delivered;const h=harness({userAgent:'iPhone',webkit:{messageHandlers:{interviewNative:{postMessage(d){delivered=d;}}}}});
 const view=await h.mount();await settle();let prevented=false;h.nodes.get('[data-open]').listeners.click({preventDefault(){prevented=true;}});
 assert(prevented);assert.equal(JSON.stringify(delivered),JSON.stringify({code}));view.destroy();
});
test('slow launch does not trap navigation and late credentials cannot revive a destroyed view',async()=>{
 let resolve;const h=harness({request:()=>new Promise(r=>resolve=r)}),view=await h.mount();assert(view.canLeave());view.destroy();
 resolve({code});await settle();assert.equal(h.host.innerHTML,'');assert.equal(h.timers.size,0);assert(!h.nodes.get('[data-open]').href);
});
