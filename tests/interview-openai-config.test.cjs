'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {models,feature}=require('../lib/interview-openai-config.cjs');
const {configuration:exam}=require('../lib/interview-exam-provider');
const {configuration:personality}=require('../lib/interview-personality-provider.cjs');
const {configuration:live}=require('../api/interview-live');
const {check}=require('../scripts/check-interview-openai.cjs');
const {configure}=require('../scripts/configure-interview-openai.cjs');
const secret='synthetic-private-key';
test('one server key configures all modes, with explicit off switches and independent job judges',()=>{
 const env={OPENAI_API_KEY:secret,INTERVIEW_OPENAI_ENABLED:'true',SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:secret,INTERVIEW_LIVE_WORKER_SECRET:'s'.repeat(43),CRON_SECRET:'c'.repeat(43),INTERVIEW_LIVE_RUNTIME_SECONDS:'800',INTERVIEW_LIVE_TRANSPORT:'vercel'};
 assert(exam(env).enabled&&exam(env).ready);assert(personality(env).enabled&&personality(env).ready);assert(live(env).enabled);
 assert(!exam({...env,INTERVIEW_EXAM_VALIDATION_ENABLED:'false'}).enabled);
 assert(!personality({...env,INTERVIEW_PERSONALITY_ENABLED:'false'}).enabled);
 assert(!live({...env,INTERVIEW_LIVE_ENABLED:'false'}).enabled);
 assert(!feature('INTERVIEW_NATIVE_ENABLED',{}));assert(!exam({}).enabled);assert(!personality({}).enabled);
 assert(!exam({...env,INTERVIEW_EXAM_VERIFIER_MODEL:models(env).judge}).ready);
 assert(!exam({...env,INTERVIEW_EXAM_JUDGE_MODEL:'invalid\nmodel'}).ready);
 assert(!personality({...env,INTERVIEW_PERSONALITY_ANALYSIS_MODEL:''}).ready);
 assert(!live({...env,INTERVIEW_LIVE_MODEL:''}).enabled);
});
test('local setup preserves credentials, unrelated settings and PC tokens without creating remote state',async()=>{
 const base=path.resolve('.tmp/interview-openai-config-tests');fs.mkdirSync(base,{recursive:true});
 const root=fs.mkdtempSync(path.join(base,'config-')),file=path.join(root,'.env.local');
 fs.writeFileSync(file,'# Keep existing settings\nOPENAI_API_KEY='+secret+'\nOTHER_SETTING=keep-me\nINTERVIEW_MOCK_CLI_WORKER_TOKEN=existing-pc-token\nINTERVIEW_LIVE_ENABLED=false\n');
 const result=configure({root}),text=fs.readFileSync(file,'utf8'),env=require('node:util').parseEnv(text);
 assert.equal(env.OPENAI_API_KEY,secret);assert.equal(env.OTHER_SETTING,'keep-me');assert.equal(env.INTERVIEW_MOCK_CLI_WORKER_TOKEN,'existing-pc-token');assert(text.includes('# Keep existing settings'));
 assert.equal(result.remoteChanges,false);assert(!JSON.stringify(result).includes(secret));assert(!configure({root}).changed);
 Object.assign(env,{SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'synthetic-database-key'});
 assert((await check(env)).ok);
 const remote=await check(env,{remote:true,fetchImpl:async(url,options)=>{
  assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
  if(url.includes('/models/'))return {ok:true,json:async()=>({id:decodeURIComponent(url.split('/').pop())})};
  if(url.includes('/rest/')){if(url.includes('ip_live_openai_reports'))assert(url.includes('select=run_id'));return {ok:true,json:async()=>[]};}
  return {ok:true,json:async()=>({id:url.split('/').pop(),public:false})};
 }});
 assert(remote.ok);assert(!JSON.stringify(remote).includes(secret));
 const failed=await check(env,{remote:true,fetchImpl:async()=>{throw Error(secret);}});assert(!failed.ok);assert(!JSON.stringify(failed).includes(secret));
 const empty=fs.mkdtempSync(path.join(base,'empty-'));assert.throws(()=>configure({root:empty}),/server_openai_key_required/);assert(!fs.existsSync(path.join(empty,'.env.local')));
});
