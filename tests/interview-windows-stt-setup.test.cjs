'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {setup}=require('../scripts/interview-windows-stt-setup.cjs');
const {workerEnvironment}=require('../scripts/interview-mock-worker-control.cjs');
test('explicit Windows STT setup pins the recognizer and updates only local adapter configuration',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'ronpark-stt-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const config={python:path.join(directory,'python.exe'),origin:'https://app.ronparkpass.com',codex:'codex',queueRoot:directory,analyzer:'test'};
 const file=path.join(directory,'config.json');await fs.writeFile(file,JSON.stringify(config));
 await fs.writeFile(path.join(directory,'token.dpapi'),'encrypted-secret');await fs.writeFile(path.join(directory,'worker.json'),'existing-pid');
 const calls=[];const result=await setup({directory,platform:'win32',run:async(executable,args)=>calls.push({executable,args})});
 assert.equal(result.restartWorkerRequired,true);assert(calls[1].args.includes('faster-whisper==1.2.1'));assert(calls[2].args.includes('--audio'));
 const saved=JSON.parse(await fs.readFile(file,'utf8')),adapter=JSON.parse(await fs.readFile(saved.transcriber,'utf8'));
 assert.equal(adapter.timeoutMs,600000);assert(adapter.healthArgs.includes('check'));assert.equal(adapter.args.filter(a=>a==='{audio}').length,1);
 assert.equal(await fs.readFile(path.join(directory,'token.dpapi'),'utf8'),'encrypted-secret');assert.equal(await fs.readFile(path.join(directory,'worker.json'),'utf8'),'existing-pid');
 const env=workerEnvironment(saved,'x'.repeat(43),{OPENAI_API_KEY:'never',SUPABASE_SERVICE_ROLE_KEY:'never'});assert.equal(env.INTERVIEW_MOCK_TRANSCRIBER_CONFIG,saved.transcriber);assert.equal(env.OPENAI_API_KEY,undefined);
});
test('failed decoder verification preserves the previous working configuration',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'ronpark-stt-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const file=path.join(directory,'config.json'),original=JSON.stringify({python:path.join(directory,'python.exe'),transcriber:'old-adapter'});await fs.writeFile(file,original);
 await assert.rejects(setup({directory,platform:'win32',run:async(_exe,args)=>{if(args.includes('setup'))throw Error('decoder_failed');}}),/decoder_failed/);
 assert.equal(await fs.readFile(file,'utf8'),original);
});
