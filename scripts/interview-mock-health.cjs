'use strict';
const {spawn}=require('node:child_process');
const valid=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(v);
function createHealthProbe({executable,models,transcriptionConfigured,spawnProcess=spawn,now=Date.now}={}){
 let latest=null,pending=null;
 async function check(){
  if(pending)return pending;if(latest&&now()-Date.parse(latest.checkedAt)<60000)return latest;
  pending=(async()=>{
   const cliReady=await new Promise(resolve=>{
    const env={};for(const key of ['PATH','Path','SystemRoot','WINDIR','COMSPEC','PATHEXT','USERPROFILE','HOME','APPDATA','LOCALAPPDATA','TEMP','TMP','CODEX_HOME','HTTPS_PROXY','HTTP_PROXY','NO_PROXY'])if(process.env[key])env[key]=process.env[key];
    let output='',done=false;const child=spawnProcess(executable||'codex',['login','status'],{windowsHide:true,env,stdio:['ignore','pipe','pipe']});
    const finish=value=>{if(done)return;done=true;clearTimeout(timer);resolve(value);};
    const timer=setTimeout(()=>{child.kill();finish(false);},15000),collect=bytes=>{output+=bytes;if(output.length>12000){child.kill();finish(false);}};
    child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',collect);child.stderr.on('data',collect);
    child.on('error',()=>finish(false));child.on('close',code=>finish(code===0&&/Logged in using ChatGPT/i.test(output)));
   });
   latest={checkedAt:new Date(now()).toISOString(),cliReady,transcriptionConfigured:!!transcriptionConfigured,
    verificationConfigured:valid(models?.judge)&&valid(models?.verifier)&&models.judge!==models.verifier,analysisConfigured:valid(models?.analyzer),blockedReason:''};return latest;
  })();try{return await pending;}finally{pending=null;}
 }
 return {check,read:()=>latest};
}
module.exports={createHealthProbe};
