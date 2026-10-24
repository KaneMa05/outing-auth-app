'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
async function main(){
 const {createInterviewAI}=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(path.join(__dirname,'../client/interview-ai-client.js'),'utf8')).toString('base64'));
 function harness(){
  let now=0,id=0;const tasks=new Map(),listeners=new Set();
  const visibility={visibilityState:'visible',addEventListener:(name,fn)=>listeners.add(fn),removeEventListener:(name,fn)=>listeners.delete(fn)};
  const clock={setTimeout(fn,delay){tasks.set(++id,{at:now+delay,fn});return id;},clearTimeout(n){tasks.delete(n);}};
  return {clock,visibility,listeners,tasks,
   hide(value){visibility.visibilityState=value?'hidden':'visible';for(const fn of listeners)fn();},
   async advance(ms){const until=now+ms;while(true){const first=[...tasks.entries()].sort((a,b)=>a[1].at-b[1].at)[0];
    if(!first||first[1].at>until)break;now=first[1].at;tasks.delete(first[0]);await first[1].fn();}
    now=until;await new Promise(resolve=>setImmediate(resolve));}
  };
 }
 const h=harness();let calls=0,phase='QUEUED';const updates=[],bodies=[];
 const ai=createInterviewAI({...h,random:()=>.5,onUpdate:data=>updates.push(data),request:async(_,body)=>{
  calls++;bodies.push(body);if(body.version===phase)return {ok:true,requestId:'r',version:phase,unchanged:true};
  return {ok:true,requestId:'r',version:phase,items:[{id:'j',status:phase}]};
 }});
 await ai.resume('r');await h.advance(35000);
 assert.equal(calls,4);assert.equal(updates.length,1);assert.equal(bodies[1].version,'QUEUED');
 h.hide(true);await h.advance(300000);assert.equal(calls,4);
 h.hide(false);await h.advance(0);assert.equal(calls,5);
 phase='PROCESSING';await h.advance(30000);const before=calls;await h.advance(15000);assert.equal(calls-before,3);
 phase='COMPLETED';await h.advance(5000);const finished=calls;await h.advance(300000);assert.equal(calls,finished);
 ai.destroy();assert.equal(h.listeners.size,0);
 // Ignore a response that arrives after the user hid the screen.
 const late=harness();let resolve;
 const emitted=[];const race=createInterviewAI({...late,request:()=>new Promise(r=>{resolve=r;}),onUpdate:x=>emitted.push(x)});
 const pending=race.resume('r');late.hide(true);resolve({ok:true,items:[{status:'QUEUED'}]});await pending;
 assert.equal(emitted.length,0);assert.equal(late.tasks.size,0);race.destroy();
 const recovering=harness();let error=false;const recovered=[];
 const reconnect=createInterviewAI({...recovering,random:()=>.5,onUpdate:x=>recovered.push(x),request:async(_,body)=>{
  if(error)throw Error('offline');
  return body.version?{ok:true,version:'v1',unchanged:true}:{ok:true,version:'v1',items:[{status:'QUEUED'}]};
 }});
 await reconnect.resume('r');error=true;await recovering.advance(5000);
 assert.equal(recovered.at(-1).ok,false);error=false;await recovering.advance(15000);
 assert.equal(recovered.at(-1).ok,true,'unchanged recovery must clear the connection error in the UI');
 reconnect.destroy();
 // Model 50 visible waiting screens for ten minutes, without real timers/network.
 const load=harness();let requests=0;const clients=[];
 for(let n=0;n<50;n++){const client=createInterviewAI({...load,random:()=>.5,request:async()=>{requests++;return {ok:true,items:[{id:'j',status:'QUEUED'}]};}});
  clients.push(client);await client.resume(String(n));}
 await load.advance(600000);
 const baseline=50*121;assert(requests<baseline*.25);
 load.hide(true);const hiddenCount=requests;await load.advance(600000);assert.equal(requests,hiddenCount);
 clients.forEach(x=>x.destroy());
 console.log(`PASS adaptive polling, conditional status, visibility, completion, late response isolation; 50 waiting clients/10 min: ${requests} requests vs ${baseline} at fixed 5s (${Math.round((1-requests/baseline)*100)}% fewer); hidden: 0 additional`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
