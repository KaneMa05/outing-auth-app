'use strict';
// Explicit activation only. Default mode checks readiness without changing the DB.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn,spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),origin='https://app.ronparkpass.com';
const python=process.env.INTERVIEW_PYTHON||path.join(process.env.USERPROFILE||'','.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
const codex=process.env.INTERVIEW_CODEX||path.join(process.env.LOCALAPPDATA||'','Programs/OpenAI/Codex/bin/codex.exe');
const activate=process.argv.includes('--activate');
const runtime=path.join(process.env.LOCALAPPDATA||'','InterviewDraftWorker');
const actor={type:'admin',id:'interview-draft-activation'};
const {requestSupabase:read}=require('../api/curriculum')._private;
const {planCapacity}=require('../lib/interview-ai-capacity.cjs');
const invoke=(action,body)=>read('POST','rpc/ip_ai_service',{p_action:action,p_actor:actor,p_body:body});
function bridgeCheck(directory){
 const code='import json,sys;from pathlib import Path;sys.path.insert(0,sys.argv[1]);from cli_bridge import CliBridge;c=json.loads(sys.stdin.read());b=CliBridge(c,Path(sys.argv[1])/"guidelines");print(json.dumps(b.doctor()));b.close()';
 const result=spawnSync(python,['-c',code,path.join(root,'tools/interview-worker')],{windowsHide:true,encoding:'utf8',input:JSON.stringify({runtime_dir:directory,codex_executable:codex})});
 if(result.status!==0)throw Error('cli_login_or_runtime_unavailable');
 return JSON.parse(result.stdout);
}
async function main(){
 const settings=(await read('GET','ip_ai_settings?select=enabled,bundle_hash,daily_call_limit,requests_per_day&limit=1'))[0];
 const ids=[];for(let offset=0;;offset+=500){const rows=await read('GET','ip_members?select=student_id&enabled=eq.true&order=student_id&limit=500&offset='+offset);ids.push(...rows.map(r=>r.student_id));if(rows.length<500)break;}
 const capacity=planCapacity({students:ids.length,requestsPerDay:settings.requests_per_day,currentDailyLimit:settings.daily_call_limit});
 if(process.argv.includes('--set-capacity')){
  await invoke('admin_configure',{dailyCallLimit:capacity.dailyCallLimit});
  const verified=(await read('GET','ip_ai_settings?select=enabled,daily_call_limit,requests_per_day&limit=1'))[0];
  if(verified.daily_call_limit!==capacity.dailyCallLimit||verified.enabled!==settings.enabled||verified.requests_per_day!==settings.requests_per_day)throw Error('capacity_verification_failed');
  console.log(JSON.stringify({mode:'set-capacity',previousDailyLimit:settings.daily_call_limit,...capacity,enabled:verified.enabled}));return;
 }
 let schemaReady=true;try{await read('GET','ip_ai_workers?select=id,all_enrolled&limit=1');await read('GET','ip_ai_job_history?select=id&limit=1');}catch(e){if([400,404].includes(e.storeStatus))schemaReady=false;else throw e;}
 const checkDir=path.join(root,'.tmp/interview-draft-check');fs.mkdirSync(checkDir,{recursive:true});
 const login=bridgeCheck(checkDir);
 const endpoint=await fetch(origin+'/api/interview-ai-worker',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"action":"claim"}',signal:AbortSignal.timeout(20000)});
 if(endpoint.status!==401)throw Error('worker_endpoint_unavailable');
 const guides=path.join(root,'tools/interview-worker/guidelines'),bundle=crypto.createHash('sha256');
 for(const name of ['instructions.txt','output.schema.json'])bundle.update(name+'\0').update(fs.readFileSync(path.join(guides,name))).update('\0');
 const bundleHash=bundle.digest('hex');
 console.log(JSON.stringify({mode:activate?'activate':'check',cliConnected:login.connected,workerEndpoint:true,schemaReady,enabled:settings.enabled,dailyLimit:settings.daily_call_limit,plannedCapacity:capacity}));
 if(!activate)return;
 if(!schemaReady)throw Error('apply_interview_ai_history_and_owners_migration_first');
 if(settings.enabled)throw Error('already_enabled_check_existing_worker_before_reconfiguring');
 if(!path.isAbsolute(runtime)||!process.env.LOCALAPPDATA)throw Error('runtime_path_unavailable');
 fs.mkdirSync(runtime,{recursive:true});
 const configPath=path.join(runtime,'config.json'),tokenPath=path.join(runtime,'token.dpapi');
 if(fs.existsSync(tokenPath))throw Error('existing_worker_token_requires_reconciliation');
 if(!ids.length)throw Error('no_enrolled_students');
 const token=crypto.randomBytes(32).toString('base64url'),tokenHash=crypto.createHash('sha256').update(token).digest('hex');
 let workerId,enableAttempted=false,child;
 try{
  await invoke('admin_configure',{bundleHash,dailyCallLimit:capacity.dailyCallLimit});
  workerId=(await invoke('admin_register_worker',{label:'면접반 전체 수강생 초안 PC',studentIds:ids,tokenHash})).workerId;
  await read('PATCH','ip_ai_workers?id=eq.'+workerId,{all_enrolled:true});
  const code='import json,sys;from pathlib import Path;sys.path.insert(0,sys.argv[1]);from workerlib import Protector;p=json.loads(sys.stdin.read());Path(p["file"]).write_bytes(Protector().seal({"token":p["token"]}))';
  const sealed=spawnSync(python,['-c',code,path.join(root,'tools/interview-worker')],{windowsHide:true,encoding:'utf8',input:JSON.stringify({file:tokenPath,token})});
  if(sealed.status!==0)throw Error('token_protection_failed');
  fs.writeFileSync(configPath,JSON.stringify({web_origin:origin,runtime_dir:runtime,codex_executable:codex,engine:'cli',poll_seconds:2,hours:[0,24],allow_local_http:false},null,2));
  const once=spawnSync(python,[path.join(root,'tools/interview-worker/worker.py'),'--config',configPath,'once'],{windowsHide:true,encoding:'utf8',timeout:45000});
  if(once.status!==0||!once.stdout.includes('automation_disabled'))throw Error('authenticated_worker_connection_failed');
  const seen=(await read('GET','ip_ai_workers?id=eq.'+workerId+'&select=last_seen_at'))[0];
  if(!seen?.last_seen_at||Date.now()-Date.parse(seen.last_seen_at)>60000)throw Error('worker_not_seen');
  // Start before enabling admission; no requests are generated by this script.
  const out=fs.openSync(path.join(runtime,'worker.log'),'a'),err=fs.openSync(path.join(runtime,'worker-error.log'),'a');
  try{child=spawn(python,['-u',path.join(root,'tools/interview-worker/worker.py'),'--config',configPath,'run'],{cwd:root,detached:true,windowsHide:true,stdio:['ignore',out,err]});await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();}finally{fs.closeSync(out);fs.closeSync(err);}
  await new Promise(r=>setTimeout(r,1000));process.kill(child.pid,0);
  fs.writeFileSync(path.join(runtime,'worker.json'),JSON.stringify({workerId,pid:child.pid,preparedAt:new Date().toISOString()}));
  enableAttempted=true;await invoke('admin_configure',{enabled:true});
  const verified=await invoke('admin_overview',{});
  if(!verified.enabled)throw Error('enable_verification_failed');
  fs.writeFileSync(path.join(runtime,'worker.json'),JSON.stringify({workerId,pid:child.pid,enabledAt:new Date().toISOString()}));
  console.log(JSON.stringify({enabled:true,workerConnected:true,enrolledStudents:ids.length,includesFutureEnrollments:true,dailyLimit:verified.dailyCallLimit,pid:child.pid}));
 }catch(e){
  if(enableAttempted){
   try{await invoke('admin_configure',{enabled:false});}
   catch{throw Error('activation_state_unknown_worker_preserved_for_reconciliation');}
  }
  if(child?.pid)try{process.kill(child.pid);}catch{}
  if(workerId)await invoke('admin_revoke_worker',{workerId}).catch(()=>{});
  // Keep encrypted state on failure so ambiguous work can be reconciled safely.
  throw e;
 }
}
main().catch(e=>{console.error('Draft setup failed: '+(/^[a-z_]+$/.test(e.message)?e.message:'connection_or_configuration_error'));process.exitCode=1;});
