'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process');
const {createProvider}=require('./core25-diagnosis-cli.cjs');
const {analyzeTask}=require('../lib/interview-mock-analysis.cjs');
const {MOCK_MODEL:MODEL}=require('../lib/core25-worker-config.cjs');
function createInference({runtimeDir,executable=process.env.INTERVIEW_CODEX||'codex',timeoutMs=300000,spawnProcess}={}){
 return async(input,{instructions,schema,model,signal})=>{
  const root=path.resolve(runtimeDir||os.tmpdir());await fs.mkdir(root,{recursive:true});const directory=await fs.mkdtemp(path.join(root,'mock-inference-'));
  const controller=new AbortController(),abort=()=>controller.abort(),timer=setTimeout(abort,timeoutMs);signal?.addEventListener('abort',abort,{once:true});
  if(signal?.aborted)abort();
  try{return await createProvider({executable,runtimeDir:directory,instructions,outputSchema:schema,model,effort:'high',...(spawnProcess?{spawnProcess}:{})})(input,{signal:controller.signal});}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);if(path.dirname(directory)!==root||!path.basename(directory).startsWith('mock-inference-'))throw Error('invalid_runtime_path');await fs.rm(directory,{recursive:true,force:true});}
 };
}
// Explicit local STT executable; no shell expansion, credentials or automatic downloads.
function createTranscriber(config,{runtimeDir,spawnProcess=spawn}={}){
 if(!config||!path.isAbsolute(config.executable||'')||!Array.isArray(config.args)||config.args.some(a=>typeof a!=='string')||config.args.filter(a=>a==='{audio}').length!==1)throw Error('transcription_not_configured');
 return async(audio,{pass,signal}={})=>{
  const root=path.resolve(runtimeDir||os.tmpdir());await fs.mkdir(root,{recursive:true});const directory=await fs.mkdtemp(path.join(root,'mock-transcribe-')),file=path.join(directory,'answer.wav');await fs.writeFile(file,audio,{mode:0o600,flag:'wx'});
  try{return await new Promise((resolve,reject)=>{
   const child=spawnProcess(config.executable,config.args.map(a=>a==='{audio}'?file:a==='{pass}'?String(pass):a),{windowsHide:true,shell:false,stdio:['ignore','pipe','ignore'],env:{PATH:process.env.PATH,Path:process.env.Path,SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP,TMP:process.env.TMP,LANG:'ko_KR.UTF-8',PYTHONIOENCODING:'utf-8'}});
   let output='',done=false;const finish=(e,value)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);e?reject(e):resolve(value);};
   const abort=()=>{child.kill();finish(Error('transcription_unavailable'));};const timer=setTimeout(abort,Math.min(config.timeoutMs||180000,600000));signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
   child.stdout.setEncoding('utf8');child.stdout.on('data',data=>{output+=data;if(output.length>30000)abort();});child.on('error',()=>finish(Error('transcription_unavailable')));
   child.on('close',code=>{try{const result=JSON.parse(output);if(code||!result||typeof result.text!=='string'||!result.text.trim()||result.text.length>12000)throw Error();finish(null,result.text);}catch{finish(Error('transcription_unavailable'));}});
  });}finally{if(path.dirname(directory)!==root||!path.basename(directory).startsWith('mock-transcribe-'))throw Error('invalid_runtime_path');await fs.rm(directory,{recursive:true,force:true});}
 };
}
async function main(argv){
 if(argv.length!==4||argv[0]!=='--input'||argv[2]!=='--out')throw Error('Usage: node scripts/interview-mock-cli.cjs --input task.json --out result.json');
 const task=JSON.parse(await fs.readFile(path.resolve(argv[1]),'utf8')),out=path.resolve(argv[3]);
 const lock=out+'.lock';await fs.writeFile(lock,'CLI execution started; review before retrying if this file remains.\n',{flag:'wx',mode:0o600});
 try{await fs.access(out);throw Error('output_exists');}catch(e){if(e.code!=='ENOENT'){await fs.rm(lock,{force:true});throw e;}}
 const result=await analyzeTask(task,{infer:createInference(),models:{judge:process.env.INTERVIEW_MOCK_CLI_JUDGE_MODEL||MODEL,verifier:process.env.INTERVIEW_MOCK_CLI_VERIFIER_MODEL||MODEL,analyzer:process.env.INTERVIEW_MOCK_CLI_ANALYSIS_MODEL||MODEL}});
 await fs.writeFile(out,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});await fs.rm(lock,{force:true});console.log(JSON.stringify({saved:out,status:result.status,officialGrade:result.grade}));
}
if(require.main===module)main(process.argv.slice(2)).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={createInference,createTranscriber};
