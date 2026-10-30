'use strict';
// Isolated synthetic provider/audio fixture. Never loads .env or external services.
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{randomBytes}=require('node:crypto');
const {createDb}=require('../tests/helpers/interview-db.cjs');
const {createHandler}=require('../api/interview-live');
const {LiveEngine}=require('../lib/interview-live-engine');
const {createRecorder,removeSpool}=require('../lib/interview-live-storage');
const {attach}=require('../lib/interview-live-socket');
(async()=>{
 const {db}=await createDb();
 for(const file of ['20261021060740_interview_live_sessions.sql','20261029142215_interview_live_result_reports.sql'])await db.exec(await fs.readFile('supabase/migrations/'+file,'utf8'));
 await db.exec("update ip_settings set enabled=true;insert into ip_members(student_id,track,exam_number,expires_on) values('ip-a','공채','qa-only','2099-01-01');insert into ip_questions(id,prompt,category,status) values('qa-live-1','협업에서 의견 차이를 조율한 경험을 말씀해주세요.','personality','published'),('qa-live-2','갈등을 해결한 경험을 말씀해주세요.','personality','published'),('qa-live-3','지원 동기를 말씀해주세요.','personality','published');");
 const invoke=async(action,actor,body={})=>(await db.query('select ip_live_service($1,$2::jsonb,$3::jsonb) result',[action,JSON.stringify(actor),JSON.stringify(body)])).rows[0].result;
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'student-live-preview-')),token=randomBytes(32).toString('hex'),secret=randomBytes(32).toString('hex');
 const authenticated=req=>(req.headers.cookie||'').split(';').some(c=>c.trim()==='live_qa='+token);
 const cloud={upload:async(id,dir)=>{await fs.mkdir(path.join(root,'audio',id),{recursive:true});for(const side of ['input','output'])await fs.copyFile(path.join(dir,side+'.wav'),path.join(root,'audio',id,side+'.wav'));},signed:async id=>({input:'/audio/'+id+'/input.wav',output:'/audio/'+id+'/output.wav'})};
 const engines=new Set();
 const createRuntime=()=>{
  const recorders=new Map();
  const engine=new LiveEngine({invoke,spool:path.join(root,'spool'),storage:cloud,
   recorder:(dir,id)=>{const r=createRecorder(dir,id);r.flush=async()=>{};recorders.set(id,r);return r;},cleanup:removeSpool,
   provider:{create:async()=>({id:'live_synthetic',sdp:'v=0 synthetic answer'}),closeSession:async()=>true,
    attach:async(_id,callback)=>({send:event=>{if(event.type==='session.close')callback({type:'session.closed'});},destroy(){}}),
    followup:async({remainingFollowups})=>({turnComplete:true,ask:remainingFollowups===2,question:'의견을 조율할 때 본인이 한 행동은 무엇인가요?',evidence:'의견'})}});
  engines.add(engine);return {engine,recorders};
 };
 const env={INTERVIEW_LIVE_TRANSPORT:'vercel',INTERVIEW_LIVE_ENABLED:'true',INTERVIEW_LIVE_WORKER_SECRET:secret,OPENAI_API_KEY:'synthetic-only',INTERVIEW_LIVE_FOLLOWUP_MODEL:'synthetic-only',SUPABASE_URL:'https://example.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-only',CRON_SECRET:secret,INTERVIEW_LIVE_RUNTIME_SECONDS:'800'};
 const handler=createHandler({config:{transport:'vercel',configured:true,enabled:true,secret},authenticateWeb:async req=>authenticated(req)?{id:'ip-a'}:null,previewAllowed:()=>false,invoke,storage:()=>cloud});
 const repository=path.resolve(__dirname,'..');
 const server=http.createServer(async(req,res)=>{try{
  res.status=code=>{res.statusCode=code;return res;};res.json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/api/interview-live')return handler(req,res);
  if(['/api/interview-job-exam','/api/interview-personality'].includes(pathname))return res.json({ok:true,ready:false,reason:'exam_not_configured',runs:[],questions:[]});
  if(pathname==='/qa/answer'){
   if(req.method!=='POST'||!authenticated(req)||new URL(req.headers.origin||'http://invalid').host!==req.headers.host)return res.status(403).json({ok:false});
   const engine=[...engines].find(e=>e.sessions.size),live=engine&&[...engine.sessions.values()][0];
   if(!live||live.ending||live.completed)return res.status(409).json({ok:false});
   const answer='팀원들의 의견을 먼저 듣고 제가 역할을 조율했습니다. 서로 합의한 방식으로 과제를 마무리했습니다.';
   const pcm=Buffer.alloc(48000);for(let i=0;i<24000;i++)pcm.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*440/24000)*3000),i*2);
   engine.event(live,{type:'session.input_audio.append',audio:pcm.toString('base64')});engine.event(live,{type:'session.output_audio.delta',delta:pcm.toString('base64')});engine.event(live,{type:'session.input_transcript.delta',delta:answer});
   return res.json({ok:true,answer});
  }
  if(pathname.startsWith('/audio/')){
   const match=pathname.match(/^\/audio\/([a-f0-9-]{36})\/(input|output)\.wav$/);if(!authenticated(req)||!match)return res.status(404).end();
   await invoke('get',{type:'student',id:'ip-a'},{runId:match[1]});res.setHeader('Content-Type','audio/wav');return res.end(await fs.readFile(path.join(root,'audio',match[1],match[2]+'.wav')));
  }
  const relative=pathname.slice(1)||'tests/fixtures/interview-student-live/index.html';
  if(!/^(interview-[a-z0-9-]+\.(js|css)|client\/interview-[a-z0-9-]+\.(js|mjs)|client\/interview-attempts\/[a-z-]+\.mjs|tests\/fixtures\/interview-student-live\/(index\.html|main\.mjs))$/.test(relative))return res.status(404).end();
  const bytes=await fs.readFile(path.join(repository,relative));res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',relative.endsWith('.html')?'text/html; charset=utf-8':relative.endsWith('.css')?'text/css':'text/javascript');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; media-src 'self' blob:; connect-src 'self' ws://127.0.0.1:*; img-src 'self' data:");
  if(pathname==='/')res.setHeader('Set-Cookie',`live_qa=${token}; HttpOnly; SameSite=Strict; Path=/`);res.end(bytes);
 }catch{res.statusCode=404;res.end();}});
 const wss=attach(server,{env,createRuntime});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});console.log(JSON.stringify({origin:'http://127.0.0.1:'+server.address().port,root,scope:'student app, simulated WebRTC/provider/PCM, real local WebSocket/API/DB/file storage'}));
 process.on('SIGINT',()=>{for(const client of wss.clients)client.close();server.close();void Promise.all([...engines].flatMap(e=>[...e.sessions.values()].map(l=>e.finish(l,'interrupted')))).finally(()=>db.close()).then(()=>process.exit(0));});
})().catch(e=>{console.error(e.message);process.exitCode=1;});
