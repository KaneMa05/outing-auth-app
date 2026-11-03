'use strict';
// Loopback-only administrator review. No credentials, production DB or AI calls.
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const {buildStatus}=require('../lib/interview-mock-monitor.cjs');
function previewStatus(scenario){
 const now=Date.now(),stamp=delta=>new Date(now+delta).toISOString(),stats=()=>({queued:0,running:0,attention:0,held:0,interrupted:0,recordingPending:0,completed24h:0,failed24h:0,lastCompletedAt:null,lastFailedAt:null});
 const snapshot={access:{enabled:true},api:{job:stats(),personality:stats()},live:stats(),questions:{job:48,personality:30,live:78},cli:{lastSeenAt:stamp(-5000),healthCheckedAt:stamp(-10000),health:{cliReady:true,transcriptionConfigured:true,verificationConfigured:true,analysisConfigured:true,blockedReason:''},stats:{job:stats(),personality:stats(),report:stats()}}};
 const env={INTERVIEW_JOB_EXAM_ENABLED:'true',INTERVIEW_PERSONALITY_ENABLED:'true',INTERVIEW_LIVE_ENABLED:'true',INTERVIEW_JOB_EXAM_MODE:'pc',INTERVIEW_PERSONALITY_MODE:'pc',INTERVIEW_MOCK_REPORT_MODE:'pc',INTERVIEW_MOCK_CLI_WORKER_TOKEN:'p'.repeat(43),INTERVIEW_MOCK_CLI_AUDIO_READY:'true',SUPABASE_URL:'https://preview.invalid',SUPABASE_SERVICE_ROLE_KEY:'fictional',CRON_SECRET:'p'.repeat(32),INTERVIEW_LIVE_WORKER_URL:'https://preview.invalid',INTERVIEW_LIVE_WORKER_SECRET:'p'.repeat(32)};
 Object.assign(snapshot.cli.stats.job,{lastCompletedAt:stamp(-180000),completed24h:12,held:2});
 Object.assign(snapshot.cli.stats.personality,{queued:2,running:1,lastCompletedAt:stamp(-240000),completed24h:7});
 Object.assign(snapshot.live,{lastCompletedAt:stamp(-600000),completed24h:4,interrupted:1});
 if(scenario==='offline')snapshot.cli.lastSeenAt=stamp(-120000);
 if(scenario==='login')snapshot.cli.health.cliReady=false;
 if(scenario==='transcription')snapshot.cli.health.transcriptionConfigured=false;
 if(scenario==='error'){Object.assign(snapshot.cli.stats.job,{attention:1,failed24h:1,lastFailedAt:stamp(-60000)});snapshot.live.recordingPending=1;}
 if(scenario==='disabled')snapshot.access.enabled=false;
 if(scenario==='unverified'){for(const item of [...Object.values(snapshot.cli.stats),snapshot.live])Object.assign(item,stats());}
 return buildStatus(snapshot,{env,metricsAvailable:scenario!=='unavailable'});
}
async function createPreview({port=0}={}){
 const root=path.resolve(__dirname,'..'),server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost');res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'");
  if(url.pathname==='/saved-review'){
   res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors 'none'");res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(await fs.readFile(path.join(root,'output/interview-mock-monitor-review.html')));
  }
  if(url.pathname==='/preview/monitor'){
   const scenario=url.searchParams.get('scenario')||'normal';res.setHeader('Content-Type','application/json; charset=utf-8');
   if(scenario==='unavailable'){res.statusCode=503;return res.end('{"error":"preview_unavailable"}');}
   return res.end(JSON.stringify(previewStatus(scenario)));
  }
  const relative=url.pathname==='/'?'tests/fixtures/interview-mock-monitor/index.html':url.pathname.slice(1);
  if(!/^(tests\/fixtures\/interview-mock-monitor\/(index\.html|main\.mjs|style\.css)|interview-[a-z-]+\.(js|css)|client\/interview-[a-z-]+\.(js|mjs))$/.test(relative)){res.statusCode=404;return res.end();}
  const data=await fs.readFile(path.join(root,relative));res.setHeader('Content-Type',relative.endsWith('.html')?'text/html; charset=utf-8':relative.endsWith('.css')?'text/css':'text/javascript');return res.end(data);
 }catch{res.statusCode=404;res.end('Preview unavailable');}});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 return {origin:'http://127.0.0.1:'+server.address().port,close:()=>new Promise(resolve=>server.close(resolve))};
}
if(require.main===module)createPreview({port:Number(process.env.INTERVIEW_MOCK_MONITOR_PREVIEW_PORT)||11902}).then(view=>{console.log(JSON.stringify({origin:view.origin,scope:'fictional monitoring; no external calls'}));process.on('SIGINT',()=>void view.close().then(()=>process.exit(0)));}).catch(()=>{console.error('Preview unavailable');process.exitCode=1;});
module.exports={createPreview,previewStatus};
