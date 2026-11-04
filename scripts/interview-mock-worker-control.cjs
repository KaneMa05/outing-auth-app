'use strict';
// Explicit operator commands. Only the newly generated worker token is sent to Vercel.
// No production credentials are downloaded. Local secrets use current-user DPAPI.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{spawn,spawnSync}=require('node:child_process');
const {createHealthProbe}=require('./interview-mock-health.cjs'),{MODEL}=require('../lib/core25-worker-config.cjs');
const ROOT=path.resolve(__dirname,'..'),PROJECT='prj_8UAb0IPc4gGmow5RZ4wEz8vcgVhi',SCOPE='ronpark';
function workerEnvironment(config,token,source=process.env){
 if(!/^[A-Za-z0-9_-]{43}$/.test(token||''))throw Error('invalid_worker_token');
 if(safeOrigin(config.origin)!==config.origin)throw Error('invalid_origin');
 const env={};for(const key of ['PATH','Path','SystemRoot','WINDIR','COMSPEC','PATHEXT','USERPROFILE','HOME','APPDATA','LOCALAPPDATA','TEMP','TMP','CODEX_HOME','HTTPS_PROXY','HTTP_PROXY','NO_PROXY'])if(source[key])env[key]=source[key];
 return {...env,INTERVIEW_MOCK_CLI_ORIGIN:config.origin,INTERVIEW_MOCK_CLI_WORKER_TOKEN:token,INTERVIEW_CODEX:config.codex,
  INTERVIEW_PYTHON:config.python,INTERVIEW_MOCK_CLI_RUNTIME:config.queueRoot,INTERVIEW_MOCK_CLI_ANALYSIS_MODEL:config.analyzer,
  INTERVIEW_MOCK_CLI_JUDGE_MODEL:MODEL,INTERVIEW_MOCK_CLI_VERIFIER_MODEL:MODEL,...(config.transcriber?{INTERVIEW_MOCK_TRANSCRIBER_CONFIG:config.transcriber}:{})};
}
function safeOrigin(value){const url=new URL(value);if(url.protocol!=='https:'||!['app.ronparkpass.com','outing-auth-app.vercel.app'].includes(url.hostname)||url.username||url.password||url.port||url.pathname!=='/'||url.search||url.hash)throw Error('invalid_origin');return url.origin;}
function createControl({directory=path.join(ROOT,'.tmp/interview-mock-control'),spawnProcess=spawn,run=spawnSync,fetchImpl=fetch,healthProbe=createHealthProbe}={}){
 const configFile=path.join(directory,'config.json'),tokenFile=path.join(directory,'token.dpapi'),pidFile=path.join(directory,'worker.json'),registrationFile=path.join(directory,'server-registration.json');
 const exists=async file=>{try{await fs.access(file);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
 const read=file=>fs.readFile(file,'utf8').then(JSON.parse);
 function crypt(config,operation,input){const r=run(config.python,[path.join(ROOT,'scripts/mock-cli-protect.py'),operation],{windowsHide:true,encoding:null,input,stdio:['pipe','pipe','pipe'],timeout:15000,maxBuffer:2000000});if(r.status!==0)throw Error('credential_protection_failed');return r.stdout;}
 async function audioReady(config){
  if(!config.transcriber)return false;
  if(!path.isAbsolute(config.transcriber))throw Error('invalid_transcriber');
  const adapter=await read(config.transcriber);require('./interview-mock-cli.cjs').createTranscriber(adapter);
  const modelAt=adapter.args.indexOf('--model'),script=adapter.args[0];
  if(modelAt<0||!path.isAbsolute(script)||!path.isAbsolute(adapter.args[modelAt+1]))throw Error('invalid_transcriber');
  const r=run(adapter.executable,[script,'check','--model',adapter.args[modelAt+1]],{windowsHide:true,encoding:'utf8',timeout:120000,maxBuffer:2000000});
  if(r.status!==0)throw Error('transcription_check_failed');return JSON.parse(r.stdout).ok===true;
 }
 async function credentials(){const config=await read(configFile),secret=JSON.parse(crypt(config,'open',await fs.readFile(tokenFile)).toString('utf8'));workerEnvironment(config,secret.token);return {config,token:secret.token};}
 const save=(file,data)=>fs.writeFile(file,JSON.stringify(data,null,2)+'\n',{mode:0o600});
 async function prepare(){
  await fs.mkdir(directory,{recursive:true,mode:0o700});
  if(await exists(configFile)||await exists(tokenFile)){await credentials();return {prepared:true,reused:true,tokenEncrypted:true};}
  const profile=process.env.USERPROFILE||'',local=process.env.LOCALAPPDATA||'';
  const config={version:1,origin:safeOrigin(process.env.INTERVIEW_MOCK_CLI_ORIGIN||'https://app.ronparkpass.com'),
   python:process.env.INTERVIEW_PYTHON||path.join(profile,'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'),
   codex:process.env.INTERVIEW_CODEX||path.join(local,'Programs/OpenAI/Codex/bin/codex.exe'),
   analyzer:MODEL,queueRoot:path.join(directory,'queue'),preparedAt:new Date().toISOString()};
  for(const executable of [config.python,config.codex]){if(!path.isAbsolute(executable))throw Error('absolute_executable_required');await fs.access(executable);}
  const health=await healthProbe({executable:config.codex,models:{analyzer:config.analyzer},transcriptionConfigured:false}).check();
  if(!health.cliReady||!health.analysisConfigured)throw Error('cli_login_or_model_configuration');
  const token=crypto.randomBytes(32).toString('base64url'),encrypted=crypt(config,'seal',Buffer.from(JSON.stringify({token})));
  if(JSON.parse(crypt(config,'open',encrypted).toString('utf8')).token!==token)throw Error('credential_roundtrip_failed');
  await fs.writeFile(tokenFile,encrypted,{flag:'wx',mode:0o600});await fs.writeFile(configFile,JSON.stringify(config,null,2)+'\n',{flag:'wx',mode:0o600});
  return {prepared:true,tokenEncrypted:true,cliReady:true,analyzer:config.analyzer,audioProcessing:false};
 }
 async function registerServer(){
  const cli=process.env.INTERVIEW_VERCEL_CLI;if(!cli||!path.isAbsolute(cli))throw Error('absolute_vercel_cli_required');await fs.access(cli);
  const {config,token}=await credentials();
  const call=(args,input)=>{const r=run(process.execPath,[cli,...args,'--scope',SCOPE,'--project',PROJECT],{cwd:ROOT,windowsHide:true,input,encoding:'utf8',timeout:60000,maxBuffer:2000000});if(r.status!==0)throw Error('vercel_configuration_failed');return r.stdout;};
  const listing=call(['env','ls','--environment','production']);
  const state=await exists(registrationFile)?await read(registrationFile):{origin:config.origin,registered:[]};
  const variables=[['INTERVIEW_MOCK_CLI_WORKER_TOKEN',token],['INTERVIEW_MOCK_REPORT_MODE','pc'],['INTERVIEW_JOB_EXAM_MODE','pc'],['INTERVIEW_PERSONALITY_MODE','pc']];
  for(const [name,value] of variables){
   const present=new RegExp('(?:^|\\n)\\s*'+name+'\\s').test(listing);
   if(state.registered.includes(name)){if(!present)throw Error('server_configuration_changed');continue;}
   if(present)throw Error('existing_server_setting_requires_reconciliation');
   call(['env','add',name,'--environment','production',name.endsWith('TOKEN')?'--sensitive':'--no-sensitive','--yes'],value);
   state.registered.push(name);await save(registrationFile,state);
  }
  return {registered:state.registered,redeploymentRequired:true,audioAdmissionEnabled:false};
 }
 async function status(){
  if(!await exists(configFile)||!await exists(tokenFile))return {prepared:false,running:false};
  const config=await read(configFile),metadata=await exists(pidFile)?await read(pidFile):null;let running=false;
  if(Number.isSafeInteger(metadata?.pid)&&metadata.pid>0)try{process.kill(metadata.pid,0);running=true;}catch{}
  return {prepared:true,running,pid:running?metadata.pid:null,origin:config.origin,transcriptionConfigured:!!config.transcriber,audioProcessing:running&&!!config.transcriber&&metadata?.transcriber===config.transcriber,restartRequired:!!config.transcriber&&running&&metadata?.transcriber!==config.transcriber};
 }
 async function connect(){
  const {config,token}=await credentials(),health=await healthProbe({executable:config.codex,models:{analyzer:config.analyzer},transcriptionConfigured:await audioReady(config)}).check();
  if(!health.cliReady)throw Error('cli_login_required');
  const response=await fetchImpl(new URL('/api/interview-mock-worker',config.origin),{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action:'heartbeat',health})});
  const data=await response.json();if(!response.ok||data.ok!==true||data.healthRecorded!==true)throw Error('worker_connection_or_health_unavailable');
  return {connected:true,healthRecorded:true,cliReady:true,audioProcessing:health.transcriptionConfigured};
 }
 async function restart(){
  if(process.platform!=='win32')throw Error('windows_required');
  const {config,token}=await credentials();
  // Validate the new adapter before disturbing the existing worker.
  if(!await audioReady(config))throw Error('transcription_check_failed');
  const call=async action=>{
   const response=await fetchImpl(new URL('/api/interview-mock-worker',config.origin),{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action})});
   const data=await response.json();if(!response.ok||data.ok!==true)throw Error('worker_connection_unavailable');return data;
  };
  const paused=await call('pause');
  // Pause is leased for five minutes. Existing processing can finish while new claims wait.
  if(paused.busy)throw Error('worker_busy_retry_after_completion');
  const queue=path.join(config.queueRoot,require('../lib/interview-exam-scoring').digest(config.origin).slice(0,16));
  if(await exists(path.join(queue,'receipt.dpapi')))throw Error('existing_receipt_requires_review');
  const current=await status();
  if(current.running){
   const ps=path.join(process.env.SystemRoot||'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
   const check=run(ps,['-NoProfile','-NonInteractive','-Command',`(Get-CimInstance Win32_Process -Filter 'ProcessId = ${current.pid}').CommandLine`],{windowsHide:true,encoding:'utf8',timeout:15000,maxBuffer:200000});
   const expected=path.join(ROOT,'scripts/interview-mock-pc-worker.cjs').toLowerCase();
   if(check.status!==0||!check.stdout.toLowerCase().includes(expected))throw Error('worker_process_identity_unconfirmed');
   process.kill(current.pid);
   for(let attempt=0;attempt<50;attempt++){
    await new Promise(resolve=>setTimeout(resolve,100));
    let alive=false;try{process.kill(current.pid,0);alive=true;}catch{}
    if(!alive)break;if(attempt===49)throw Error('worker_stop_unconfirmed');
   }
   // Only the lock belonging to this verified, now-dead process can be removed.
   const lock=path.join(queue,'worker.lock');
   if(await exists(lock)){
    if((await fs.readFile(lock,'utf8')).trim()!==String(current.pid))throw Error('existing_worker_lock_requires_review');
    await fs.rm(lock);
   }
  }
  const started=await start();await call('resume');return {...started,restarted:true};
 }
 async function start(){
  const current=await status();if(current.running)throw Error('worker_already_running');
  const {config,token}=await credentials(),queue=path.join(config.queueRoot,require('../lib/interview-exam-scoring').digest(config.origin).slice(0,16));
  if(await exists(path.join(queue,'worker.lock')))throw Error('existing_worker_lock_requires_review');
  const health=await healthProbe({executable:config.codex,models:{analyzer:config.analyzer},transcriptionConfigured:await audioReady(config)}).check();if(!health.cliReady)throw Error('cli_login_required');
  const out=await fs.open(path.join(directory,'worker.log'),'a',0o600),err=await fs.open(path.join(directory,'worker-error.log'),'a',0o600);let child;
  try{child=spawnProcess(process.execPath,[path.join(ROOT,'scripts/interview-mock-pc-worker.cjs')],{cwd:ROOT,windowsHide:true,detached:true,stdio:['ignore',out.fd,err.fd],env:workerEnvironment(config,token)});
   await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();
  }finally{await out.close();await err.close();}
  await save(pidFile,{pid:child.pid,origin:config.origin,startedAt:new Date().toISOString(),script:'interview-mock-pc-worker.cjs',transcriber:config.transcriber||null});
  return {started:true,pid:child.pid,audioProcessing:health.transcriptionConfigured,idlePollSeconds:30};
 }
 return {prepare,registerServer,connect,start,restart,status};
}
async function main(){const control=createControl(),command=process.argv[2];if(!['prepare','register-server','connect','start','restart','status'].includes(command))throw Error('usage_prepare_register-server_connect_start_restart_status');console.log(JSON.stringify(await control[command==='register-server'?'registerServer':command]()));}
if(require.main===module)main().catch(e=>{console.error(/^[a-z_-]+$/.test(e.message)?e.message:'worker_control_failed');process.exitCode=1;});
module.exports={createControl,workerEnvironment,safeOrigin};
