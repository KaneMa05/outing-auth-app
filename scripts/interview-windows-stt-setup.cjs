'use strict';
// Run explicitly on Windows. Downloads ~500 MB model once; never handles worker secrets.
const fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process');
const ROOT=path.resolve(__dirname,'..');
async function setup({directory=path.join(ROOT,'.tmp/interview-mock-control'),platform=process.platform,run=execute}={}){
 if(platform!=='win32')throw Error('windows_required');
 const file=path.join(directory,'config.json'),config=JSON.parse(await fs.readFile(file,'utf8'));
 const venv=path.join(directory,'speech-venv'),python=path.join(venv,'Scripts/python.exe'),model=path.join(directory,'speech-model-small'),script=path.join(ROOT,'scripts/interview-windows-stt.py');
 if(!path.isAbsolute(config.python||''))throw Error('prepare_worker_first');
 try{await fs.access(python);}catch{await run(config.python,['-m','venv',venv]);}
 await run(python,['-m','pip','install','--disable-pip-version-check','faster-whisper==1.2.1']);
 await run(python,[script,'setup','--model',model,'--audio',path.join(ROOT,'native/android/interview/src/debug/res/raw/interview_question_1.mp3')]);
 const adapter=path.join(directory,'transcriber.json');
 await fs.writeFile(adapter,JSON.stringify({executable:python,args:[script,'transcribe','--model',model,'--audio','{audio}','--pass','{pass}'],healthArgs:[script,'check','--model',model],timeoutMs:600000},null,2)+'\n',{mode:0o600});
 // Existing encrypted token, PID, queue locks and receipts remain intact.
 config.transcriber=adapter;config.transcriptionVerifiedAt=new Date().toISOString();
 const temp=file+'.speech.tmp';await fs.writeFile(temp,JSON.stringify(config,null,2)+'\n',{mode:0o600});await fs.rename(temp,file);
 return {configured:true,restartWorkerRequired:true,audioProcessing:'on_next_start',offlineAfterSetup:true};
}
function execute(executable,args){return new Promise((resolve,reject)=>{const p=spawn(executable,args,{shell:false,windowsHide:true,stdio:'inherit'});p.on('error',()=>reject(Error('speech_setup_failed')));p.on('close',code=>code?reject(Error('speech_setup_failed')):resolve());});}
if(require.main===module)setup().then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(/^[a-z_]+$/.test(e.message)?e.message:'speech_setup_failed');process.exitCode=1;});
module.exports={setup};
