'use strict';
const http=require('node:http'),path=require('node:path');
const {verify}=require('../../lib/interview-live-policy');
const {validate}=require('../../api/interview-live');
const {LiveEngine}=require('./engine.cjs');
const {createProvider}=require('./provider.cjs');
const {createStorage}=require('./storage.cjs');
function createServer(engine,secret){return http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
 try{
  if(req.method!=='POST'||req.url!=='/command')throw Error('not_found');
  let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>68000)throw Error('request_too_large');}
  if(!verify(raw,secret,req.headers['x-live-time'],req.headers['x-live-signature']))throw Error('unauthorized');
  const {actor,body}=JSON.parse(raw);validate(body);
  if(!actor||!['student','admin'].includes(actor.type)||typeof actor.id!=='string'||actor.id.length>120)throw Error('unauthorized');
  const data=await engine.command(actor,body);res.end(JSON.stringify(data));
 }catch(e){res.statusCode=400;const safe=['not_found','unauthorized','invalid_request','request_too_large','not_enrolled','unsafe_retry','admission_busy','daily_limit','queue_full','questions_unavailable','session_expired'];
  res.end(JSON.stringify({ok:false,error:safe.includes(e.message)?e.message:'automation_unavailable'}));}
 });}
async function main(){
 for(const name of ['OPENAI_API_KEY','INTERVIEW_LIVE_FOLLOWUP_MODEL','INTERVIEW_LIVE_WORKER_SECRET','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','INTERVIEW_LIVE_SPOOL'])if(!process.env[name])throw Error('Missing '+name);
 if(process.env.INTERVIEW_LIVE_WORKER_SECRET.length<32)throw Error('Worker secret must have at least 32 characters');
 const engine=new LiveEngine({invoke:(action,actor,body)=>require('../../api/curriculum')._private.requestSupabase('POST','rpc/ip_live_service',{p_action:action,p_actor:actor,p_body:body}),
  provider:createProvider({key:process.env.OPENAI_API_KEY,followupModel:process.env.INTERVIEW_LIVE_FOLLOWUP_MODEL}),
  storage:createStorage({url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY}),spool:path.resolve(process.env.INTERVIEW_LIVE_SPOOL)});
 const server=createServer(engine,process.env.INTERVIEW_LIVE_WORKER_SECRET);
 server.requestTimeout=60000;server.headersTimeout=10000;
 const timer=setInterval(async()=>{try{engine.maintenanceFailed=false;await engine.tick();if(engine.maintenanceFailed)console.error('Live maintenance incomplete; inspect service health.');}catch{console.error('Live maintenance failed; inspect service health.');}},15000);
 server.listen(Number(process.env.PORT||3091),process.env.INTERVIEW_LIVE_BIND||'127.0.0.1',()=>console.log('Interview Live worker ready.'));
 let stopping=false;const stop=async()=>{if(stopping)return;stopping=true;clearInterval(timer);server.close();await Promise.allSettled([...engine.sessions.values()].map(s=>engine.finish(s,'interrupted')));process.exit(0);};
 process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={createServer};
