'use strict';
// Local application inference only. No shell, web, tools, student IDs, or repository access in the prompt.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process');
const {INSTRUCTIONS,schema,VERSION}=require('../lib/preassignment-diagnosis.cjs');
function createProvider({executable=process.env.INTERVIEW_CODEX||'codex',runtimeDir=path.join(os.tmpdir(),'core25-diagnosis')}={}){
 fs.mkdirSync(runtimeDir,{recursive:true});
 const schemaPath=path.join(runtimeDir,'output.schema.json');fs.writeFileSync(schemaPath,JSON.stringify(schema));
 const provider=(snapshot,{signal})=>new Promise((resolve,reject)=>{
  const cwd=fs.mkdtempSync(path.join(runtimeDir,'session-'));
  const env={...process.env};for(const key of ['OPENAI_API_KEY','CODEX_API_KEY','CODEX_THREAD_ID'])delete env[key];
  const args=['exec','--ignore-user-config','--ephemeral','--skip-git-repo-check','--sandbox','read-only','--json','--color','never','--cd',cwd,'--output-schema',schemaPath];
  for(const v of ['approval_policy="never"','web_search="disabled"','model_provider="openai"','forced_login_method="chatgpt"','apps._default.enabled=false','features.shell_tool=false','features.apply_patch_freeform=false','features.code_mode=false','features.code_mode_host=false','features.multi_agent=false','features.js_repl=false','memories.use_memories=false','memories.generate_memories=false'])args.push('-c',v);
  args.push('-');
  const child=spawn(executable,args,{windowsHide:true,env,stdio:['pipe','pipe','pipe']});
  let pending='',answer,completed=false,invalid=false,size=0,settled=false,diagnostic='';
  child.stderr.setEncoding('utf8');child.stderr.on('data',data=>{diagnostic=(diagnostic+data).slice(-4000);});
  const finish=(error,result)=>{if(settled)return;settled=true;signal?.removeEventListener('abort',abort);try{fs.rmdirSync(cwd);}catch{}error?reject(error):resolve(result);};
  const abort=()=>{invalid=true;child.kill();};signal?.addEventListener('abort',abort,{once:true});
  child.on('error',()=>finish(Error('diagnosis_unavailable')));
  child.stdin.on('error',()=>{invalid=true;});
  child.stdout.setEncoding('utf8');child.stdout.on('data',data=>{
   size+=Buffer.byteLength(data);if(size>300000){invalid=true;child.kill();return;}pending+=data;
   let pos;while((pos=pending.indexOf('\n'))>=0){const line=pending.slice(0,pos);pending=pending.slice(pos+1);if(!line.trim())continue;
    try{const e=JSON.parse(line);if(['item.started','item.updated','item.completed'].includes(e.type)&&!['reasoning','agent_message'].includes(e.item?.type)){invalid=true;child.kill();}
     if(e.type==='item.completed'&&e.item?.type==='agent_message')answer=e.item.text;
     if(e.type==='turn.completed')completed=true;if(e.type==='turn.failed'){diagnostic=JSON.stringify(e.error||{});invalid=true;child.kill();}
    }catch{invalid=true;child.kill();}
   }
  });
  child.on('close',code=>{if(code!==0||invalid||!completed||!answer)return finish(Object.assign(Error('diagnosis_unavailable'),{diagnostic}));try{finish(null,JSON.parse(answer));}catch{finish(Error('invalid_diagnosis'));}});
  if(signal?.aborted){abort();return;}
  child.stdin.end(INSTRUCTIONS+'\n\n입력 자료(JSON 데이터):\n'+JSON.stringify(snapshot));
 });
 provider.version=VERSION+':codex-chatgpt';return provider;
}
module.exports={createProvider};
