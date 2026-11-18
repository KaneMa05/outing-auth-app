'use strict';
const {spawn}=require('node:child_process'),path=require('node:path'),readline=require('node:readline'),{randomUUID}=require('node:crypto');
function createTranscriber(configFile,config){
 let child,ready,readyResolve,readyReject,readyTimer;const pending=new Map();
 function stop(){clearTimeout(readyTimer);readyReject?.(Error('runtime_unavailable'));readyResolve=readyReject=null;for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('transcription_failed'));}pending.clear();const old=child;child=ready=null;old?.kill();}
 function start(){
  ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
  readyTimer=setTimeout(stop,120000);
  child=spawn(config.python,[path.resolve(__dirname,'../scripts/interview-practice-transcribe.py'),path.resolve(configFile)],{windowsHide:true,env:{...process.env,HF_HUB_OFFLINE:'1',PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'},stdio:['pipe','pipe','ignore']});
  const current=child;child.once('error',()=>{if(child===current)stop();});child.once('exit',()=>{if(child===current)stop();});
  readline.createInterface({input:child.stdout}).on('line',line=>{
   let r;try{r=JSON.parse(line);}catch{return;}
   if(r.ready===true&&r.model==='Whisper large-v3'){clearTimeout(readyTimer);readyResolve?.();readyResolve=readyReject=null;return;}
   const p=pending.get(r.id);if(!p)return;pending.delete(r.id);clearTimeout(p.timer);r.error?p.reject(Error('transcription_failed')):p.resolve(r.result);
  });
 }
 return {async transcribe(file){if(!child)start();await ready;if(pending.size)throw Error('transcription_busy');
  return new Promise((resolve,reject)=>{const id=randomUUID();const timer=setTimeout(stop,7200000);pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({id,file:path.resolve(file)})+'\n',error=>{if(error)stop();});});
 },close:stop};
}
module.exports={createTranscriber};
