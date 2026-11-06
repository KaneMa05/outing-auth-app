'use strict';
const {spawn}=require('node:child_process'),path=require('node:path'),readline=require('node:readline');
let child,sequence=0;const pending=new Map();
function reset(){for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('transcription_failed'));}pending.clear();child=undefined;}
function transcribe(pcm,hints=''){
 if(!Buffer.isBuffer(pcm)||pcm.length>2880000||pcm.length%2)return Promise.reject(Error('invalid_audio'));
 if(pending.size>=4)return Promise.reject(Error('transcription_busy'));
 if(!child){const root=process.env.INTERVIEW_LOCAL_RUNTIME;if(!root)return Promise.reject(Error('api_not_configured'));
 const processChild=spawn(path.join(root,'venv/bin/python'),[path.resolve(__dirname,'../scripts/interview-local-transcribe.py'),'--stream',path.join(root,'whisper-turbo')],{env:{...process.env,HF_HUB_OFFLINE:'1'},stdio:['pipe','pipe','ignore']});child=processChild;
 processChild.on('error',()=>{if(child===processChild)reset();});processChild.on('exit',()=>{if(child===processChild)reset();});
 readline.createInterface({input:processChild.stdout}).on('line',line=>{let result;try{result=JSON.parse(line);}catch{return;}const p=pending.get(result.id);if(!p)return;pending.delete(result.id);clearTimeout(p.timer);result.error?p.reject(Error(result.error)):p.resolve(result.text);});
 }
 return new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{const old=child;reset();old?.kill();},90000);pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({id,pcm:pcm.toString('base64'),hints})+'\n',error=>{if(error){const p=pending.get(id);if(p){pending.delete(id);clearTimeout(timer);reject(Error('transcription_failed'));}}});});
}
function close(){const old=child;reset();old?.kill();}
process.once('exit',()=>child?.kill());
module.exports={transcribe,close};
