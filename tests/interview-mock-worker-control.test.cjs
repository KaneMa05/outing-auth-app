'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {createControl,workerEnvironment,safeOrigin}=require('../scripts/interview-mock-worker-control.cjs');
test('worker environment has the dedicated token but no API, database or Vercel credentials',()=>{
 const config={origin:'https://app.ronparkpass.com',codex:'C:/codex.exe',python:'C:/python.exe',queueRoot:'C:/queue',analyzer:'model-test'},token='x'.repeat(43);
 const result=workerEnvironment(config,token,{PATH:'test-path',USERPROFILE:'C:/profile',OPENAI_API_KEY:'never',SUPABASE_SERVICE_ROLE_KEY:'never',VERCEL_TOKEN:'never'});
 assert.equal(result.INTERVIEW_MOCK_CLI_WORKER_TOKEN,token);assert.equal(result.PATH,'test-path');assert.equal(result.OPENAI_API_KEY,undefined);assert.equal(result.SUPABASE_SERVICE_ROLE_KEY,undefined);assert.equal(result.VERCEL_TOKEN,undefined);assert.equal(result.INTERVIEW_MOCK_TRANSCRIBER_CONFIG,undefined);
 assert.throws(()=>workerEnvironment(config,'short'),/invalid_worker_token/);
 assert.equal(safeOrigin('https://app.ronparkpass.com/'),'https://app.ronparkpass.com');
 for(const url of ['http://app.ronparkpass.com','https://attacker.test','https://app.ronparkpass.com/path','https://app.ronparkpass.com:8443','https://user@app.ronparkpass.com'])assert.throws(()=>safeOrigin(url));
});
async function setup(t,{existing=[]}={}){
 const base=path.resolve('.tmp');await fs.mkdir(base,{recursive:true});const directory=await fs.mkdtemp(path.join(base,'mock-control-test-'));
 t.after(async()=>{assert.equal(path.dirname(directory),base);assert(path.basename(directory).startsWith('mock-control-test-'));await fs.rm(directory,{recursive:true,force:true});});
 const cli=path.join(directory,'vercel.cjs'),token='x'.repeat(43),config={origin:'https://app.ronparkpass.com',python:'C:/python.exe',codex:'C:/codex.exe',analyzer:'model-test',queueRoot:path.join(directory,'queue')};
 await fs.writeFile(cli,'test CLI placeholder');await fs.writeFile(path.join(directory,'config.json'),JSON.stringify(config));await fs.writeFile(path.join(directory,'token.dpapi'),'opaque-protected-bytes');
 const vars=new Set(existing),calls=[];
 const run=(executable,args,options)=>{
  if(executable===config.python){assert.equal(args[1],'open');return {status:0,stdout:Buffer.from(JSON.stringify({token}))};}
  assert.equal(executable,process.execPath);assert(args.includes('prj_8UAb0IPc4gGmow5RZ4wEz8vcgVhi'));assert(args.includes('ronpark'));assert.equal(options.windowsHide,true);
  if(args[2]==='ls')return {status:0,stdout:[...vars].map(name=>' '+name+' Hidden Secret Production').join('\n')};
  assert.equal(args[2],'add');const name=args[3];calls.push({name,input:options.input,args});vars.add(name);return {status:0,stdout:'Added variable'};
 };
 return {directory,cli,token,calls,run,control:createControl({directory,run})};
}
test('server setup only uploads the new token and PC mode flags; it never downloads or forces existing secrets',async t=>{
 const f=await setup(t),previous=process.env.INTERVIEW_VERCEL_CLI;process.env.INTERVIEW_VERCEL_CLI=f.cli;
 try{
  const first=await f.control.registerServer();assert.equal(first.registered.length,4);assert.equal(first.audioAdmissionEnabled,false);assert.equal(f.calls.length,4);
  assert.equal(f.calls[0].input,f.token);assert(f.calls[0].args.includes('--sensitive'));assert(f.calls.every(c=>!c.args.includes('--force')&&!c.args.includes('--value')));assert(f.calls.slice(1).every(c=>c.input==='pc'));
  await f.control.registerServer();assert.equal(f.calls.length,4,'Repeat setup does not rotate the token');
  for(const name of ['config.json','server-registration.json'])assert(!(await fs.readFile(path.join(f.directory,name),'utf8')).includes(f.token));
 }finally{if(previous===undefined)delete process.env.INTERVIEW_VERCEL_CLI;else process.env.INTERVIEW_VERCEL_CLI=previous;}
});
test('an existing server token without a matching setup record is preserved for reconciliation',async t=>{
 const f=await setup(t,{existing:['INTERVIEW_MOCK_CLI_WORKER_TOKEN']}),previous=process.env.INTERVIEW_VERCEL_CLI;process.env.INTERVIEW_VERCEL_CLI=f.cli;
 try{await assert.rejects(f.control.registerServer(),/existing_server_setting_requires_reconciliation/);assert.equal(f.calls.length,0);}
 finally{if(previous===undefined)delete process.env.INTERVIEW_VERCEL_CLI;else process.env.INTERVIEW_VERCEL_CLI=previous;}
});
test('connection check sends a metadata heartbeat to the approved origin and never polls a student job',async t=>{
 const f=await setup(t),health={checkedAt:new Date().toISOString(),cliReady:true,transcriptionConfigured:false,verificationConfigured:false,analysisConfigured:true,blockedReason:''};let calls=0;
 const control=createControl({directory:f.directory,run:f.run,healthProbe:()=>({check:async()=>health}),fetchImpl:async(url,options)=>{
  calls++;assert.equal(url.origin,'https://app.ronparkpass.com');assert.equal(url.pathname,'/api/interview-mock-worker');assert.equal(options.headers.Authorization,'Bearer '+f.token);assert.equal(options.redirect,'error');assert.deepEqual(JSON.parse(options.body),{action:'heartbeat',health});return {ok:true,json:async()=>({ok:true,healthRecorded:true})};
 }});
 assert.deepEqual(await control.connect(),{connected:true,healthRecorded:true,cliReady:true,audioProcessing:false});assert.equal(calls,1);
});
