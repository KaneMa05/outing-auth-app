'use strict';
// Local application inference only. No shell, web, tools, student IDs, or repository access in the prompt.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process');
const {INSTRUCTIONS,schema,VERSION}=require('../lib/preassignment-diagnosis.cjs');
const {MODEL,EFFORT,ENGINE_VERSION}=require('../lib/core25-worker-config.cjs');
function createProvider({executable=process.env.INTERVIEW_CODEX||'codex',runtimeDir=path.join(os.tmpdir(),'core25-diagnosis'),onEvent=()=>{},spawnProcess=spawn,instructions=INSTRUCTIONS,outputSchema=schema,model=MODEL,effort=EFFORT}={}){
 fs.mkdirSync(runtimeDir,{recursive:true});
 const schemaPath=path.join(runtimeDir,'output.schema.json');fs.writeFileSync(schemaPath,JSON.stringify(outputSchema));
 const provider=(snapshot,{signal})=>new Promise((resolve,reject)=>{
  const cwd=fs.mkdtempSync(path.join(runtimeDir,'session-'));
  const env={};for(const key of ['PATH','Path','SystemRoot','WINDIR','COMSPEC','PATHEXT','USERPROFILE','HOME','APPDATA','LOCALAPPDATA','TEMP','TMP','CODEX_HOME','HTTPS_PROXY','HTTP_PROXY','NO_PROXY'])if(process.env[key])env[key]=process.env[key];
  const args=['exec','--ignore-user-config','--ephemeral','--skip-git-repo-check','--sandbox','read-only','--model',model,'-c','model_reasoning_effort="'+effort+'"','--json','--color','never','--cd',cwd,'--output-schema',schemaPath];
  for(const v of ['approval_policy="never"','web_search="disabled"','model_provider="openai"','forced_login_method="chatgpt"','apps._default.enabled=false','features.apps=false','features.plugins=false','features.hooks=false','features.browser_use=false','features.computer_use=false','features.image_generation=false','features.view_image=false','features.sleep_tool=false','features.shell_tool=false','features.apply_patch_freeform=false','features.code_mode=false','features.code_mode_only=false','features.code_mode_host=false','features.multi_agent=false','features.js_repl=false','memories.use_memories=false','memories.generate_memories=false'])args.push('-c',v);
  args.push('-');
  const child=spawnProcess(executable,args,{windowsHide:true,env,stdio:['pipe','pipe','pipe']});
  child.on('spawn',()=>onEvent('process_started'));child.on('exit',code=>onEvent('process_exit_'+code));
  let pending='',answer,completed=false,invalid=false,size=0,settled=false,diagnostic='';
  child.stderr.setEncoding('utf8');child.stderr.on('data',data=>{diagnostic=(diagnostic+data).slice(-4000);});
  const finish=(error,result)=>{if(settled)return;settled=true;signal?.removeEventListener('abort',abort);try{fs.rmdirSync(cwd);}catch{}error?reject(error):resolve(result);};
  const abort=()=>{invalid=true;
   // Windows CLI helpers can inherit the pipes: kill only this owned process tree.
   if(process.platform==='win32'&&child.pid){const killer=spawn(path.join(process.env.SystemRoot||'C:/Windows','System32/taskkill.exe'),['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});killer.on('error',()=>child.kill());killer.unref();}else child.kill();
   child.stdin.destroy();child.stdout.destroy();child.stderr.destroy();finish(Object.assign(Error('diagnosis_unavailable'),{diagnostic}));
  };signal?.addEventListener('abort',abort,{once:true});
  child.on('error',()=>finish(Error('diagnosis_unavailable')));
  child.stdin.on('error',()=>{invalid=true;});
  child.stdout.setEncoding('utf8');child.stdout.on('data',data=>{
   if(settled)return;size+=Buffer.byteLength(data);if(size>300000){abort();return;}pending+=data;
   let pos;while((pos=pending.indexOf('\n'))>=0){const line=pending.slice(0,pos);pending=pending.slice(pos+1);if(!line.trim())continue;
    try{const e=JSON.parse(line);
     // This exact startup notice confirms our intentionally disabled code execution host.
     // Other errors/tool events still fail closed, even if the model emits a final answer.
     if(e.type==='item.completed'&&e.item?.type==='error'&&e.item.message==='Code Mode is unavailable because code-mode host is disabled. Code mode will fail closed; enable `features.code_mode_host` and install `codex-code-mode-host`.'){onEvent('code_execution_disabled');continue;}
     if(e.item?.type==='error')diagnostic=JSON.stringify(e.item);onEvent(e.type+(e.item?.type?':'+e.item.type:''));if(['item.started','item.updated','item.completed'].includes(e.type)&&!['reasoning','agent_message'].includes(e.item?.type)){abort();return;}
     if(e.type==='item.completed'&&e.item?.type==='agent_message')answer=e.item.text;
     if(e.type==='turn.completed')completed=true;if(e.type==='turn.failed'){diagnostic=JSON.stringify(e.error||{});abort();return;}
    }catch{abort();return;}
   }
  });
  child.on('close',code=>{if(code!==0||invalid||!completed||!answer)return finish(Object.assign(Error('diagnosis_unavailable'),{diagnostic}));try{finish(null,JSON.parse(answer));}catch{finish(Error('invalid_diagnosis'));}});
  if(signal?.aborted){abort();return;}
  child.stdin.end(instructions+'\n\n입력 자료(JSON 데이터):\n'+JSON.stringify(snapshot));
 });
 provider.version=ENGINE_VERSION;return provider;
}
module.exports={createProvider};
