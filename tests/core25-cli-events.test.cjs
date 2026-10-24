'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const {createProvider}=require('../scripts/core25-diagnosis-cli.cjs');
const {MODEL,ENGINE_VERSION}=require('../lib/core25-worker-config.cjs');
const notice='Code Mode is unavailable because code-mode host is disabled. Code mode will fail closed; enable `features.code_mode_host` and install `codex-code-mode-host`.';
async function check(events,{abort=false,reject=false}={}){
 let child,captured;
 const provider=createProvider({runtimeDir:path.resolve('.tmp/core25-cli-events'),spawnProcess:(exe,args,options)=>{
  captured={args,options};child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>true;
  child.stdin.on('finish',()=>setImmediate(()=>{for(const e of events)child.stdout.write(JSON.stringify(e)+'\n');if(!abort)child.emit('close',0);}));return child;
 }});
 const controller=new AbortController();const result=provider({answer:'가상 답변'},{signal:controller.signal});
 if(abort)controller.abort();
 if(abort||reject)await assert.rejects(result,/diagnosis_unavailable/);else assert.deepEqual(await result,{summary:'ok',criteria:[]});
 assert(captured.args.includes(MODEL));assert.equal(provider.version,ENGINE_VERSION);
 assert(!Object.hasOwn(captured.options.env,'INTERVIEW_CORE25_WORKER_TOKEN'));assert(!Object.hasOwn(captured.options.env,'OPENAI_API_KEY'));
 assert(captured.args.includes('features.shell_tool=false'));assert(captured.args.includes('features.code_mode_host=false'));
}
(async()=>{
 const complete=[{type:'item.completed',item:{type:'agent_message',text:'{"summary":"ok","criteria":[]}'}},{type:'turn.completed'}];
 await check([{type:'item.completed',item:{type:'error',message:notice}},...complete]);
 await check([{type:'item.completed',item:{type:'error',message:'Different error'}},...complete],{reject:true});
 await check([{type:'item.started',item:{type:'command_execution'}},...complete],{reject:true});
 await check([],{abort:true});
 console.log('PASS CLI events: intentional disabled-host notice accepted; tools/other errors rejected; cancellation settles; model pinned and secrets excluded');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
