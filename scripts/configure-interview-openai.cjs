'use strict';
const fs=require('node:fs'),path=require('node:path'),{parseEnv}=require('node:util'),{randomBytes}=require('node:crypto');
const {DEFAULT_MODELS,MODEL_ENV}=require('../lib/interview-openai-config.cjs');
function configure({root=path.resolve(__dirname,'..')}={}){
 const file=path.join(root,'.env.local'),before=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'';
 const env=parseEnv(before);if(!env.OPENAI_API_KEY?.trim())throw Error('server_openai_key_required');
 const values={INTERVIEW_OPENAI_ENABLED:'true',INTERVIEW_EXAM_VALIDATION_ENABLED:'true',INTERVIEW_JOB_EXAM_ENABLED:'true',INTERVIEW_PERSONALITY_ENABLED:'true',INTERVIEW_LIVE_ENABLED:'true',INTERVIEW_NATIVE_ENABLED:'true',INTERVIEW_MOCK_REPORT_ENABLED:'true',
  INTERVIEW_JOB_EXAM_MODE:'openai',INTERVIEW_PERSONALITY_MODE:'openai',INTERVIEW_MOCK_REPORT_MODE:'openai',INTERVIEW_LIVE_TRANSPORT:'vercel',INTERVIEW_LIVE_RUNTIME_SECONDS:env.INTERVIEW_LIVE_RUNTIME_SECONDS||'800'};
 for(const [name,key] of Object.entries(MODEL_ENV))values[key]=env[key]||DEFAULT_MODELS[name];
 for(const key of ['INTERVIEW_LIVE_WORKER_SECRET','CRON_SECRET'])values[key]=env[key]||randomBytes(32).toString('base64url');
 let after=before;
 for(const [key,value] of Object.entries(values)){
  const line=key+'='+JSON.stringify(value),pattern=new RegExp('^'+key+'\\s*=.*$','m');
  after=pattern.test(after)?after.replace(pattern,line):after.replace(/\s*$/,'')+'\n'+line+'\n';
 }
 if(after!==before)fs.writeFileSync(file,after,{mode:0o600});
 return {file,changed:after!==before,configuredNames:Object.keys(values),keyReused:true,remoteChanges:false};
}
if(require.main===module){try{console.log(JSON.stringify(configure(),null,2));}catch{console.error('OpenAI configuration requires an existing server key in .env.local. No credential values are printed.');process.exitCode=1;}}
module.exports={configure};
