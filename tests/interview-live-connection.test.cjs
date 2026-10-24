'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {check,baseUrl}=require('../scripts/check-interview-live.cjs');
(async()=>{
 const env={OPENAI_API_KEY:'private-openai-value',INTERVIEW_LIVE_FOLLOWUP_MODEL:'test-model',
  SUPABASE_SERVICE_ROLE_KEY:'private-database-value',SUPABASE_URL:'https://example.supabase.co',
  INTERVIEW_LIVE_WORKER_SECRET:'a'.repeat(64),INTERVIEW_LIVE_WORKER_URL:'http://127.0.0.1:3091',
  INTERVIEW_LIVE_SPOOL:path.resolve('.tmp/test-spool'),INTERVIEW_LIVE_ENABLED:'false'};
 let calls=[];
 const fetchImpl=async(url,options)=>{
  calls.push({url,options});assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
  if(url.includes('/models/'))return {ok:true,json:async()=>({id:decodeURIComponent(url.split('/').pop())})};
  if(url.includes('/rest/'))return {ok:true,json:async()=>[]};
  return {ok:true,json:async()=>({id:'interview-live',public:false,file_size_limit:32000000,allowed_mime_types:['audio/wav']})};
 };
 assert((await check(env,{fetchImpl})).ok);assert.equal(calls.length,0);
 const remote=await check(env,{remote:true,fetchImpl});assert(remote.ok);assert.equal(calls.length,4);
 for(const secret of [env.OPENAI_API_KEY,env.SUPABASE_SERVICE_ROLE_KEY,env.INTERVIEW_LIVE_WORKER_SECRET])assert(!JSON.stringify(remote).includes(secret));
 const bad=await check(env,{remote:true,fetchImpl:async()=>{throw Error(env.OPENAI_API_KEY);}});
 assert(!bad.ok);assert(!JSON.stringify(bad).includes(env.OPENAI_API_KEY));
 const publicBucket=await check(env,{remote:true,fetchImpl:async(url,options)=>url.includes('/bucket/')?{ok:true,json:async()=>({id:'interview-live',public:true,file_size_limit:32000000})}:fetchImpl(url,options)});
 assert(!publicBucket.ok);
 calls=[];assert(!(await check({},{remote:true,fetchImpl})).ok);assert.equal(calls.length,0);
 for(const url of ['http://example.com','https://user:pass@example.com','https://example.com/a','https://example.com?token=secret'])assert.equal(baseUrl(url),null);
 console.log('PASS read-only Live preflight, missing settings, private bucket, redirect rejection, and secret redaction.');
})().catch(e=>{console.error(e);process.exitCode=1;});
