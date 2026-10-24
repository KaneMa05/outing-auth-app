// Isolated browser + real API + embedded Postgres. Models only with --serve --local-ai.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {createDb}=require('../tests/helpers/interview-db.cjs');
const {createHandler}=require('../api/interview-prep'),auth=require('../api/teacher-auth-utils');
const webAuth=require('../lib/interview-web-auth');
const {createHandler:createPreassignmentHandler}=require('../api/interview-preassignments');
const {createHandler:createAuthHandler}=require('../api/interview-auth');
const {createHandler:createAIHandler}=require('../api/interview-ai');
const {createHandler:createFollowupHandler}=require('../api/interview-life-followup');
const {createHandler:createWorkerHandler}=require('../api/interview-ai-worker');
const {createHandler:createExamHandler}=require('../api/interview-exam');
const {createHandler:createLiveHandler}=require('../api/interview-live');
const liveFixture=process.argv.includes('--live-fixture');
if(liveFixture&&!process.argv.includes('--serve'))throw Error('--live-fixture requires --serve');
const examFixture=process.argv.includes('--exam-fixture');
if(examFixture&&!process.argv.includes('--serve'))throw Error('--exam-fixture requires --serve');
const localAI=process.argv.includes('--local-ai');
if(localAI&&!process.argv.includes('--serve'))throw Error('--local-ai requires --serve');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.tmp/interview-qa');fs.mkdirSync(dir,{recursive:true});
let db,server,browser,ws,localWorker;
(async()=>{try{
 const setup=await createDb();db=setup.db;const invoke=setup.invoke,admin={type:'admin',id:'qa'};
 await db.exec(fs.readFileSync('supabase/migrations/20261020063234_interview_ai_pipeline.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261020073140_interview_ai_readiness.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261021063447_interview_experience_year_age.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261021065038_interview_life_satisfaction.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261020074446_interview_ai_load_protection.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261020081526_interview_ai_single_question.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261021071011_interview_experience_age_only.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261021082149_interview_basic_fields_followup.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261021085056_interview_life_followup_entry_state.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261023052344_interview_applicant_identity.sql','utf8'));
 await db.exec("insert into students(id,name) values('18120','테스트 학생')");
 await db.query("update students set password_hash=$1 where id='18120'",[webAuth.hash('demo2026!!')]);
 await db.exec(fs.readFileSync('supabase/seeds/interview-corpus.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/seeds/interview-personality-analysis.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/seeds/interview-core30.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/seeds/interview-life-catalog.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/seeds/interview-rubric-drafts.sql','utf8'));
 await invoke('admin_member_save',admin,{targetStudentId:'18120',track:'공채',examNumber:'2026-001',enabled:true});
 await invoke('admin_enabled',admin,{enabled:true});
 await db.exec(fs.readFileSync('supabase/migrations/20261023064604_interview_preassignments.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261023073656_interview_preassignment_guidance.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261023074848_interview_preassignment_core25_only.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261023130354_interview_preassignment_deadline_nov9.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261023124834_interview_preassignment_diagnosis.sql','utf8'));
 const preassignmentCall=async(action,actor,body)=>(await db.query('select '+(action.startsWith('diagnosis_')?'ip_pa_diagnosis_service':action.startsWith('admin_guidance_')?'ip_pa_guidance_service':'ip_preassignment_service')+'($1,$2::jsonb,$3::jsonb) result',[action.startsWith('diagnosis_')?action.slice(10):action,JSON.stringify(actor),JSON.stringify(body)])).rows[0].result;
 await preassignmentCall('admin_settings',admin,{revision:(await preassignmentCall('admin_list',admin,{})).settings.revision,enabled:true,dueAt:'2026-11-10T00:00:00+09:00',revisionDueAt:'2026-11-10T00:00:00+09:00',allowLate:true});
 process.env.TEACHER_SESSION_SECRET='interview-browser-qa-only';
 if(examFixture){
  const fixture=require('../tests/interview-exam.test.cjs').detail();
  await db.query('insert into ip_questions(id,prompt,category,revision) values($1,$2,$3,$4)',[fixture.question.id,fixture.question.prompt,fixture.question.category,fixture.question.revision]);
  await invoke('admin_rubric_save',admin,{id:fixture.question.id,revision:0,questionRevision:fixture.question.revision,kind:'job_knowledge',rationale:'브라우저 검증만을 위한 가상 채점 기준입니다.',criteria:fixture.rubric.criteria,criticalErrors:fixture.rubric.critical_errors,verificationNote:fixture.rubric.verification_note,scoreMap:fixture.rubric.score_map,status:'reviewed'});
 }
 const examHandler=createExamHandler({config:()=>({enabled:examFixture,ready:examFixture}),
  authenticate:async req=>{const s=auth.readSessionToken(auth.readCookie(req,auth.COOKIE_NAME),process.env.TEACHER_SESSION_SECRET);if(!s||s.role!=='admin')throw Error('unauthorized');return {type:'admin',id:s.username};},
  detail:(actor,id)=>invoke('admin_rubric_detail',actor,{id}),
  provider:()=>require('../tests/interview-exam.test.cjs').provider()});
 let failSave=false,interviewRequests=0,kakaoCode='qa-new';
 const aiCalls=[];
 const aiInvoke=async(action,actor,body={})=>(await db.query('select ip_ai_service($1,$2::jsonb,$3::jsonb) result',[action.startsWith('diagnosis_')?action.slice(10):action,JSON.stringify(actor),JSON.stringify(body)])).rows[0].result;
 const aiWorker=async(action,body={})=>(await db.query('select ip_ai_worker_service($1,$2,$3::jsonb) result',[action,'a'.repeat(64),JSON.stringify(body)])).rows[0].result;
 const workerHandler=createWorkerHandler({invoke:async(action,tokenHash,body)=>(await db.query('select ip_ai_worker_service($1,$2,$3::jsonb) result',[action,tokenHash,JSON.stringify(body)])).rows[0].result});
 const portalConfig=()=>({enabled:true,origin:'http://127.0.0.1:'+server.address().port,clientId:'qa-app',clientSecret:''});
 const portalCall=(action,body)=>invoke(action,{type:'server'},body);
 await db.exec("update ip_life_followup_config set enabled=true,student_ids=array['18120'] where id");
 const followupHandler=createFollowupHandler({enabled:()=>true,
  authenticateWeb:req=>webAuth.authenticatePortal(req,{getConfig:portalConfig,call:portalCall}),
  authenticateDevice:async body=>body.studentId==='18120'&&body.deviceToken==='qa-device'?{id:'18120'}:null,previewAllowed:id=>id==='18120',
  invoke:async(action,actor,body)=>(await db.query('select ip_life_followup_service($1,$2::jsonb,$3::jsonb) result',[action.startsWith('diagnosis_')?action.slice(10):action,JSON.stringify(actor),JSON.stringify(body)])).rows[0].result});
 if(liveFixture){
  await db.exec(fs.readFileSync('supabase/migrations/20261021060740_interview_live_sessions.sql','utf8'));
  await db.query(`insert into ip_live_runs(id,student_id,request_key,state,questions,turns,current_question,recording_state,retain_until)
   values($1,'18120',$2,'completed','[]',$3::jsonb,'로컬 화면 검토용 · 실제 음성 면접 아님','missing',now()+interval '30 days')`,
   [require('node:crypto').randomUUID(),require('node:crypto').randomUUID(),JSON.stringify([
    {kind:'initial',question:'[화면 검토 예시] 협업 경험을 말씀해주세요.',answer:'팀원들과 역할을 나누어 과제를 완수한 경험이 있습니다.',complete:true,grade:null,score:null},
    {kind:'followup',question:'[화면 검토 예시] 그 과정에서 본인이 맡은 역할은 무엇이었나요?',answer:'일정을 정리하고 팀원 간 진행 상황을 공유했습니다.',complete:true,grade:null,score:null}
   ])]);
 }
 const liveHandler=createLiveHandler({config:{enabled:liveFixture,url:'http://localhost',secret:'local-live-fixture-only-secret-000000'},
  authenticateWeb:req=>webAuth.authenticatePortal(req,{getConfig:portalConfig,call:portalCall}),
  authenticateDevice:async body=>body.studentId==='18120'&&body.deviceToken==='qa-device'?{id:'18120'}:null,previewAllowed:id=>id==='18120',
  authenticateAdmin:async req=>{const s=auth.readSessionToken(auth.readCookie(req,auth.COOKIE_NAME),process.env.TEACHER_SESSION_SECRET);if(s?.role!=='admin')throw Error('unauthorized');return {id:s.username};},
  fetchImpl:async(url,options)=>{const {actor,body}=JSON.parse(options.body);
   if(body.action==='ready')return {ok:true,json:async()=>({ok:true,ready:false,reason:'live_not_configured'})};
   if(!['list','get','admin_list','admin_get'].includes(body.action))throw Error('automation_disabled');
   const data=(await db.query('select ip_live_service($1,$2::jsonb,$3::jsonb) result',[body.action,JSON.stringify(actor),JSON.stringify(body)])).rows[0].result;
   return {ok:true,json:async()=>data};
  }});
 const preassignmentHandler=createPreassignmentHandler({
  diagnosisProvider:process.argv.includes('--core25-diagnosis')?require('./core25-diagnosis-cli.cjs').createProvider({executable:process.env.INTERVIEW_CODEX||'C:/Users/W11/AppData/Local/Programs/OpenAI/Codex/bin/codex.exe',runtimeDir:path.join(dir,'core25-diagnosis')}):null,
  authenticateWeb:req=>webAuth.authenticatePortal(req,{getConfig:portalConfig,call:portalCall}),
  authenticateDevice:async body=>body.studentId==='18120'&&body.deviceToken==='qa-device'?{id:'18120'}:null,previewAllowed:id=>id==='18120',
  authenticateAdmin:async(req,write)=>{const s=auth.readSessionToken(auth.readCookie(req,auth.COOKIE_NAME),process.env.TEACHER_SESSION_SECRET);if(!s||s.role!=='admin'||!auth.hasPermission(s,write?'interview.write':'interview.read'))throw Error('forbidden');return {id:s.username};},
  invoke:preassignmentCall});
 const authHandler=createAuthHandler({getConfig:portalConfig,invoke:portalCall,exchange:async code=>code==='qa-new'?'20261020001':'20261020002'});
 const handler=createHandler({authenticate:async body=>body.studentId==='18120'&&body.deviceToken==='qa-device'?{id:'18120'}:null,
   authenticateWeb:req=>webAuth.authenticatePortal(req,{getConfig:portalConfig,call:portalCall}),
   invoke:async(...args)=>{if(failSave&&['note_save','life_save','writing_save','diagnosis_save'].includes(args[0])){failSave=false;throw Error('temporary_db_failure');}return invoke(...args);}});
 const aiHandler=createAIHandler({authenticateWeb:req=>webAuth.authenticatePortal(req,{getConfig:portalConfig,call:portalCall}),
  authenticateAdmin:async req=>{
   const session=auth.readSessionToken(auth.readCookie(req,auth.COOKIE_NAME),process.env.TEACHER_SESSION_SECRET);
   if(!session||session.role!=='admin')throw Error('unauthorized');
   return {id:session.username};
  },
  previewAllowed:id=>id==='18120',authenticateDevice:async body=>body.studentId==='18120'&&body.deviceToken==='qa-device'?{id:'18120'}:null,
  invoke:async(...args)=>{aiCalls.push(args[0]);return aiInvoke(...args);}});
 const page=adminMode=>`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/interview-prep.css"><style>body{margin:0;padding:24px;background:#f3f6fa;font-family:Arial,"Malgun Gothic",sans-serif}</style>
 ${process.argv.includes('--serve')?'<div style="max-width:1180px;margin:0 auto 20px">로컬 검토용 · 샘플 학생 계정 · 운영 DB와 연결되지 않습니다. <a href="/">학생 화면</a> / <a href="/admin">관리자 화면</a><br>이 화면에서 변경한 데이터는 미리보기 종료 시 초기화됩니다.</div>':''}
 <main id="app"></main><script type="module">
 import {mountStudent,mountAdmin} from '/interview-prep-ui.js';
 const request=async(action,payload={})=>{const r=await fetch('/api/interview-prep',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,action,${adminMode?'':"studentId:'18120',deviceToken:'qa-device',"}})});const d=await r.json();if(!r.ok||!d.ok)throw Object.assign(new Error(d.error),{code:d.error});return d;};
 window.controller=await ${adminMode?'mountAdmin':'mountStudent'}(document.querySelector('#app'),{request});window.ready=true;
 </script></html>`;
 server=http.createServer(async(req,res)=>{
  let p=new URL(req.url,'http://localhost').pathname;
  if(p==='/__qa/live-flow'&&liveFixture){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(fs.readFileSync(path.join(root,'tests/fixtures/interview-live-flow.html')));}
  if(p==='/interview')p='/interview.html';
  if(p==='/api/interview-auth'){
   res.status=n=>{res.statusCode=n;return res;};
   res.json=d=>{
    // Fake provider only in this isolated QA harness. No Kakao network calls.
    if(d.url){const u=new URL(d.url);d.url=portalConfig().origin+'/__qa/kakao?state='+encodeURIComponent(u.searchParams.get('state'));}
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify(d));
   };
   return authHandler(req,res);
  }
  if(p==='/__qa/kakao'){
   const query=new URL(req.url,portalConfig().origin).searchParams,state=query.get('state');
   if(process.argv.includes('--serve')){
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Cache-Control','no-store');
    return res.end(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>로컬 인증 테스트</title>
     <style>body{max-width:480px;margin:60px auto;padding:24px;background:#f5f7fa;color:#223347;font-family:system-ui}a{display:block;padding:16px;margin:16px 0;background:#234e83;color:white;border-radius:10px;text-align:center;text-decoration:none}p{line-height:1.7}</style>
     <h1>로컬 인증 테스트</h1><p>실제 카카오 인증 대신 테스트 계정을 사용합니다. 운영 데이터와 연결되지 않으며 서버 종료 시 초기화됩니다.</p>
     <a href="/__qa/login">등록된 테스트 수강생으로 로그인</a>
     <a href="/api/interview-auth?action=callback&amp;state=${encodeURIComponent(state||'')}&amp;code=qa-new">신규 회원가입 테스트</a>
     <p>신규 가입은 이름·직렬·수험번호 입력 후 관리자 승인이 필요합니다. <a href="/admin" target="_blank" rel="noopener">테스트 관리자 열기</a></p></html>`);
   }
   res.writeHead(302,{Location:'/api/interview-auth?action=callback&state='+encodeURIComponent(state)+'&code='+kakaoCode}).end();return;
  }
  if(p==='/__qa/login'&&process.argv.includes('--serve')){
   res.setHeader('Content-Type','text/html; charset=utf-8');
   res.setHeader('Cache-Control','no-store');
   return res.end(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>로컬 테스트 로그인</title>
    <style>body{max-width:480px;margin:60px auto;padding:24px;background:#f5f7fa;color:#223347;font-family:system-ui}label{display:block;margin:16px 0}input{display:block;box-sizing:border-box;width:100%;padding:12px;margin-top:8px}button{padding:14px;width:100%;background:#234e83;color:#fff;border:0;border-radius:10px;font:inherit}p{line-height:1.7}</style>
    <h1>로컬 테스트 계정</h1><p>운영 계정·카카오와 연결되지 않은 메모리 DB입니다. 서버 종료 시 초기화됩니다.</p>
    <form><label>학생 번호<input name="studentId" value="18120"></label><label>테스트 비밀번호<input name="password" type="password" value="demo2026!!"></label>
    <button>테스트 계정으로 면접반 열기</button></form><p role="status"></p>
    <script>document.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);
     const r=await fetch('/api/interview-auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'legacy_login',intent:'login',studentId:f.get('studentId'),password:f.get('password')})});
     const d=await r.json();if(d.ok)location.assign('/interview');else document.querySelector('[role=status]').textContent='테스트 로그인 실패';};</script></html>`);
  }
  if(p==='/api/interview-ai-worker'&&localAI){res.status=n=>{res.statusCode=n;return res;};res.json=d=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(d));};return workerHandler(req,res);}
  if(p==='/api/interview-ai'){interviewRequests++;res.status=n=>{res.statusCode=n;return res;};res.json=d=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(d));};return aiHandler(req,res);}
  if(p==='/api/interview-life-followup'){res.status=n=>{res.statusCode=n;return res;};res.json=d=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(d));};return followupHandler(req,res);}
  if(p==='/api/interview-exam'){res.status=n=>{res.statusCode=n;return res;};res.json=d=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(d));};return examHandler(req,res);}
  if(p==='/api/interview-live'){res.status=n=>{res.statusCode=n;return res;};res.json=d=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(d));};return liveHandler(req,res);}
  if(p==='/api/interview-preassignments'){res.status=n=>{res.statusCode=n;return res;};res.json=d=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(d));};return preassignmentHandler(req,res);}
  if(p==='/api/interview-prep'){interviewRequests++;res.status=n=>{res.statusCode=n;return res;};res.json=d=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(d));};return handler(req,res);}
  if(p==='/__qa/diagnosis'){
   res.setHeader('Content-Type','text/html; charset=utf-8');
   return res.end(page(false).replace('import {mountStudent,mountAdmin} from \'/interview-prep-ui.js\';','import {mountWorkspace as mountStudent} from \'/interview-workspace.js\';').replace('</style>','</style><link rel="stylesheet" href="/interview-portal.css">'));
  }
  if(p==='/'||p==='/admin'){
   if(p==='/admin')res.setHeader('Set-Cookie',auth.COOKIE_NAME+'='+auth.createSessionToken(process.env.TEACHER_SESSION_SECRET,{username:'qa',role:'admin',permissions:['*']})+'; HttpOnly; SameSite=Strict; Path=/');
   if(p==='/admin'&&process.argv.includes('--serve')){res.writeHead(302,{Location:'/teacher.html#interview-prep-admin?section=home'}).end();return;}
   res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(page(p==='/admin'));
  }
  if(p==='/api/teacher-session'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({ok:true,authenticated:true,user:{username:'qa',role:'admin',permissions:['*']}}));}
  if(p==='/config.js'){res.setHeader('Content-Type','text/javascript');return res.end('window.OUTING_APP_CONFIG='+JSON.stringify({supabaseUrl:'',supabaseAnonKey:'',interviewPreviewStudentHashes:require('../lib/interview-preview-access').getPreviewHashes()})+';');}
  if(p.startsWith('/api/')||p.startsWith('/_vercel/')){res.writeHead(404).end();return;}
  if(!(/^\/(?:client\/|assets\/(?:core25-summaries|interview-login)\/)?[a-z0-9.-]+\.(?:js|css|html|png|webmanifest)$/.test(p)||p==='/fonts/HakgyoansimPosterB.woff2')||!fs.existsSync(path.join(root,p.slice(1)))){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',p.endsWith('.css')?'text/css':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.png')?'image/png':p.endsWith('.woff2')?'font/woff2':'text/javascript');res.end(fs.readFileSync(path.join(root,p.slice(1))));
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 if(process.argv.includes('--serve')){
   if(localAI){
    const crypto=require('node:crypto'),bundle=crypto.createHash('sha256');
    for(const name of ['instructions.txt','output.schema.json'])bundle.update(name+'\0').update(fs.readFileSync(path.join(root,'tools/interview-worker/guidelines',name))).update('\0');
    const token=crypto.randomBytes(32).toString('base64url');
    const selection=await require('./interview-local-demo.cjs')({db,invoke,aiInvoke,admin,studentId:'18120',bundleHash:bundle.digest('hex'),token});
    const runtime=path.join(dir,'local-worker-'+crypto.randomUUID());
    localWorker=spawn(process.env.INTERVIEW_PYTHON||'C:/Users/W11/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',[path.join(root,'scripts/interview-local-worker.py')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    await new Promise((resolve,reject)=>{
     let buffer='';const timer=setTimeout(()=>reject(Error('Local worker startup timed out')),30000);
     localWorker.once('error',e=>{clearTimeout(timer);reject(e);});
     localWorker.once('exit',()=>{clearTimeout(timer);reject(Error('Local worker stopped'));if(db)aiInvoke('admin_configure',admin,{enabled:false}).catch(()=>{});});
     localWorker.stdout.on('data',b=>{buffer+=b;process.stdout.write(b);if(buffer.includes('LOCAL_WORKER_READY')){clearTimeout(timer);resolve();}});
     localWorker.stderr.on('data',()=>process.stderr.write('Local worker diagnostic error (no student data logged).\n'));
     localWorker.stdin.write(JSON.stringify({token,config:{web_origin:'http://127.0.0.1:'+server.address().port,runtime_dir:runtime,engine:'cli',poll_seconds:2,hours:[0,24],allow_local_http:true,codex_executable:process.env.INTERVIEW_CODEX||'C:/Users/W11/AppData/Local/Programs/OpenAI/Codex/bin/codex.exe'}})+'\n');
    });
    console.log('Local AI ready: all source fields populated; core questions = 25 main + appendix positions '+selection.appendixPositions.join(', '));
   }
   console.log('Student preview: http://127.0.0.1:'+server.address().port+'/');
   console.log('Admin preview: http://127.0.0.1:'+server.address().port+'/admin');
   console.log('Login portal: http://127.0.0.1:'+server.address().port+'/interview (local sample: 18120 / demo2026!!; Kakao buttons use local test authentication)');
   console.log('Local test sign-in: http://127.0.0.1:'+server.address().port+'/__qa/login');
   await new Promise(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);});
   return;
 }
 browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+path.join(dir,'browser-'+Date.now()),'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
 const debug=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('Chrome timeout')),15000);browser.stderr.on('data',c=>{output+=c;const m=output.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m){clearTimeout(timer);resolve(m[1]);}});browser.on('error',reject);});
 const tabs=await(await fetch('http://'+new URL(debug).host+'/json')).json();ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
 let id=0;const pending=new Map(),exceptions=[];
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}else if(m.method==='Page.javascriptDialogOpening')send('Page.handleJavaScriptDialog',{accept:true});else if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails);});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
 const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=async exp=>{for(let i=0;i<160;i++){try{if(await ev(exp))return;}catch(e){if(!/context.*destroyed|context.*not.*found|target navigated/i.test(e.message||''))throw e;}await new Promise(r=>setTimeout(r,50));}throw Error('Timeout '+exp+' | exceptions: '+JSON.stringify(exceptions)+' | '+await ev("JSON.stringify({url:location.href,text:document.body.innerText.slice(0,1600)})"));};
 const click=s=>ev(`document.querySelector(${JSON.stringify(s)}).click()`);
 const fill=(name,value)=>ev(`(()=>{const n=document.querySelector('[name="'+${JSON.stringify(name)}+'"]');n.value=${JSON.stringify(value)};n.dispatchEvent(new Event('input',{bubbles:true}));if(n.matches('[data-basic-field=school]'))document.querySelectorAll('[data-basic-none]').forEach(c=>{if(c.dataset.basicNone!=='school'&&!c.checked&&!document.querySelector('[data-basic-field='+c.dataset.basicNone+']').value){c.click();}});})()`);
 const submit=s=>ev(`document.querySelector(${JSON.stringify(s)}).requestSubmit()`);
 const screenshot=async(name,width)=>{
   await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});
   const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(dir,name+'.png'),Buffer.from(shot.data,'base64'));
   const overflow=await ev('document.documentElement.scrollWidth>innerWidth');
   const offenders=overflow?await ev("[...document.querySelectorAll('#app *')].filter(n=>n.getBoundingClientRect().right>innerWidth && !n.closest('.ip-table-wrap')).slice(0,12).map(n=>({tag:n.tagName,cls:n.className,right:n.getBoundingClientRect().right}))"):[];
   assert.equal(overflow,false,name+' overflow '+JSON.stringify(offenders));
 };
 const base='http://127.0.0.1:'+server.address().port;
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Network.setBlockedURLs',{urls:['https://*']});
 if(process.argv.includes('--diagnosis-only')){
  await invoke('life_save',{type:'student',id:'18120'},{revision:0,status:'draft',content:{background:'기존 소개 내용',none:[],qualifications:[],affiliations:[],awards:[],experiences:[{id:require('node:crypto').randomUUID(),age:'22',satisfaction:'-10',title:'팀 프로젝트 갈등 해결',content:'팀원들과 공동 목표를 정하고 의견 차이를 경청하며 역할을 분담했습니다.',appeal:'갈등을 해결하고 협력하는 방법을 배웠습니다.',competencyIds:[]}]}});
  const lifeFill=(selector,value)=>ev(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});n.value=${JSON.stringify(value)};n.dispatchEvent(new Event('input',{bubbles:true}));if(n.matches('[data-basic-field=school]'))document.querySelectorAll('[data-basic-none]').forEach(c=>{if(c.dataset.basicNone!=='school'&&!c.checked&&!document.querySelector('[data-basic-field='+c.dataset.basicNone+']').value){c.click();}});})()`);
  await send('Page.navigate',{url:base+'/__qa/diagnosis'});await wait("window.ready && !!document.querySelector('[data-db-area=diagnosis]')");
  await require('../tests/helpers/interview-diagnosis-browser.cjs')({invoke,ev,wait,click,lifeFill,send,screenshot,failSave:()=>{failSave=true;}});
  assert.equal(exceptions.length,0,JSON.stringify(exceptions));return;
 }
 await send('Page.navigate',{url:base+'/admin'});await wait("window.ready && !!document.querySelector('[data-filter]')");
 await fill('search','공동');await ev("document.querySelector('[data-filter] [name=track]').value='공채'");
 await submit('[data-filter]');await wait("document.querySelectorAll('[data-ip=question-edit]').length>0");
 await click('[data-ip=question-edit]');await wait("!!document.querySelector('[data-question-form]')");
 await ev("document.querySelector('[data-question-form] [name=status]').value='published'");await submit('[data-question-form]');await wait("document.querySelector('[data-message]').textContent==='저장했습니다.'");
 assert.equal((await invoke('questions',{type:'student',id:'18120'})).questions.length,1);
 await screenshot('admin-questions-desktop',1200);
 await click('[data-tab=members]');await wait("!!document.querySelector('.ip-matrix')");
 await screenshot('admin-matrix-mobile',390);
 await click('[data-ip=member-edit]');await wait("!!document.querySelector('[data-member-form]')");
 assert.equal(await ev("document.querySelector('[name=examNumber]').value"),'2026-001');
 await send('Page.navigate',{url:base+'/'});await wait("window.ready && !!document.querySelector('[data-note-form]')");
 await click('[data-ip=topic][data-id=teamwork]');
 const teamworkActionLabel=await ev("document.querySelector('[name=action]').closest('label').textContent");
 await click('[data-ip=topic][data-id=communication]');
 assert.notEqual(await ev("document.querySelector('[name=action]').closest('label').textContent"),teamworkActionLabel);
 assert.equal(await ev("document.querySelectorAll('[data-element-prompt]').length"),2);
 await screenshot('student-specific-prompts',390);
 await click('[data-ip=topic][data-id=teamwork]');
 for(const k of ['situation','role','action','result','learning'])await fill(k,'팀 과제에서 협력하며 준비한 실제 경험을 작성합니다. '+k);
 await wait("document.querySelector('[data-save]').textContent==='서버에 저장됨'");
 const saved=(await invoke('bootstrap',{type:'student',id:'18120'})).notes.find(n=>n.topic_id==='teamwork');assert(saved.fields.action.includes('action'));
 await click('[data-ip=submit]');await wait("document.querySelector('[data-message]').textContent.includes('작성 완료로 제출')");
 assert((await ev("document.querySelector('[data-note-status]').textContent")).includes('작성 완료'));
 await click('[data-category=job]');await wait("document.querySelector('h2').textContent==='직무 기출문제'");
 assert.equal(await ev("document.querySelectorAll('[data-note-field],progress').length"),0);
 await screenshot('student-job-mobile',390);
 await click('[data-category=personality]');await wait("!!document.querySelector('[data-note-form]')");
 await screenshot('student-desktop',1200);await screenshot('student-mobile',390);
 await send('Page.reload');await wait("window.ready && !!document.querySelector('[data-note-form]')");await click('[data-id=teamwork]');
 assert((await ev("document.querySelector('[name=action]').value")).includes('action'));
 failSave=true;await fill('action','실패 후에도 입력 내용이 사라지지 않아야 합니다.');
 await wait("document.querySelector('[data-save]').textContent==='저장되지 않음'");
 assert((await ev("document.querySelector('[name=action]').value")).includes('사라지지'));
 await click('[data-ip=save]');await wait("document.querySelector('[data-save]').textContent==='서버에 저장됨'");
 await click('[data-ip=submit]');await wait("document.querySelector('[data-message]').textContent.includes('작성 완료로 제출')");
 await send('Page.navigate',{url:base+'/admin'});await wait("window.ready && !!document.querySelector('[data-filter]')");
 await click('[data-tab=members]');await wait("!!document.querySelector('.ip-matrix')");
 await click('[data-ip=feedback][data-topic=teamwork]');await wait("!!document.querySelector('[data-feedback-form]')");
 await fill('feedback','본인의 구체적인 행동이 잘 드러납니다.');await ev("document.querySelector('[data-feedback-form] [name=status]').value='approved'");
 await submit('[data-feedback-form]');await wait("document.querySelector('[data-message]').textContent==='저장했습니다.'");
 await screenshot('admin-progress-desktop',1200);
 await send('Page.navigate',{url:base+'/'});await wait("window.ready && !!document.querySelector('[data-note-form]')");await click('[data-id=teamwork]');
 assert((await ev("document.querySelector('.ip-feedback').textContent")).includes('구체적인 행동'));
 await click('[data-ip=history]');await wait("document.querySelectorAll('.ip-history').length>0");
 // Life worksheet: source fields, ownership-aware real API, manual save/reload,
 // failure retention, admin feedback, resubmission, and cross-device conflict.
 const lifeFill=(selector,value)=>ev(`(()=>{let n=document.querySelector(${JSON.stringify(selector)});if(n.readOnly){n.closest('[data-life-row]').querySelector('[data-life-action=edit-experience]').click();n=document.querySelector(${JSON.stringify(selector)});}n.value=${JSON.stringify(value)};n.dispatchEvent(new Event('input',{bubbles:true}));if(n.matches('[data-basic-field=school]'))document.querySelectorAll('[data-basic-none]').forEach(c=>{if(c.dataset.basicNone!=='school'&&!c.checked&&!document.querySelector('[data-basic-field='+c.dataset.basicNone+']').value){c.click();}});})()`);
 const lifeOpen=async()=>{await click('[data-view=life]');await wait("!!document.querySelector('[data-basic-field=school]')");};
 const lifeSection=async section=>{await click(`[data-life-action=section][data-section=${section}]`);};
 await lifeOpen();
 assert.equal(await ev("document.querySelector('[data-basic-field=school]').value"),'');
 await lifeFill('[data-basic-field=school]','대학교에서 전공을 공부하며 팀 프로젝트와 봉사활동을 했습니다.');
 await lifeSection('qualifications');await click('[data-life-action=add]');
 for(const [key,value] of Object.entries({type:'어학',date:'2025년',name:'어학 시험',issuer:'시험 기관',effort:'매일 시간을 정해 학습했습니다.'}))await lifeFill(`[data-life-field=${key}]`,value);
 await lifeSection('affiliations');await click('[data-life-action=add]');
 for(const [key,value] of Object.entries({type:'학교',name:'대학교 동아리',period:'2023~2024',role:'총무',activities:'행사 예산과 일정을 정리했습니다.'}))await lifeFill(`[data-life-field=${key}]`,value);
 await lifeSection('awards');await click('[data-life-none]');
 await lifeSection('experiences');await click('[data-life-action=add]');
 for(const [key,value] of Object.entries({age:'23',title:'행사 준비 중 의견 차이 조정',content:'예산 배분에 대한 의견이 달라 각자의 이유를 듣고 두 대안을 비교한 뒤 합의했습니다.',appeal:'상대의 이유를 듣고 갈등을 조정하는 태도'}))await lifeFill(`[data-life-field=${key}]`,value);
 assert.equal(await ev("document.querySelectorAll('[data-life-row] textarea').length"),2);
 assert.equal(await ev("document.querySelectorAll('[data-life-field=year],[data-life-field=period],[data-life-tag]').length"),0);
 await lifeFill('[data-life-field=age]','');
 await click('[data-life-action=submit]');await wait("document.querySelector('[data-life-message]').textContent.includes('당시 나이를 입력')");
 assert.equal(await ev("document.querySelector('[data-life-field=title]').value"),'행사 준비 중 의견 차이 조정');
 await lifeFill('[data-life-field=age]','23');
 failSave=true;await click('[data-life-action=save-experience]');await wait("document.querySelector('[data-life-message]').textContent.includes('입력 내용은 유지')");
 assert.equal(await ev("document.querySelector('[data-life-field=content]').readOnly"),false);
 assert.equal(await ev("document.querySelector('[data-life-action=save-experience]').disabled"),false);
 assert.equal(await ev("document.querySelector('[data-life-field=title]').value"),'행사 준비 중 의견 차이 조정');
 await click('[data-life-action=save]');await wait("document.querySelector('[data-life-message]').textContent==='서버에 저장했습니다.'");
 const datedExperience=(await invoke('life_get',{type:'student',id:'18120'})).profile.content.experiences[0];
 assert.equal(datedExperience.year,undefined);assert.equal(datedExperience.age,'23');assert(datedExperience.content);assert(datedExperience.appeal);
 await screenshot('student-life-experience-mobile',390);
 await ev("document.querySelector('[data-life-row]').scrollIntoView({block:'start'})");
 await screenshot('student-life-fields-mobile',390);
 await lifeSection('basic');await screenshot('student-life-timeline-desktop',1200);
 await send('Page.reload');await wait("window.ready && !!document.querySelector('[data-note-form]')");await lifeOpen();
 assert((await ev("document.querySelector('[data-basic-field=school]').value")).includes('전공'));
 await click('[data-life-action=submit]');await wait("document.querySelector('[data-life-message]').textContent==='첨삭을 요청했습니다.'");
 await send('Page.navigate',{url:base+'/admin'});await wait("window.ready && !!document.querySelector('[data-filter]')");
 await click('[data-tab=members]');await wait("!!document.querySelector('[data-ip=life]')");await click('[data-ip=life]');
 await wait("!!document.querySelector('[data-life-feedback]')");await lifeSection('experiences');
 assert((await ev("document.querySelector('[data-life-body]').textContent")).includes('면접관에게 어필할 점'));
 await lifeFill('[data-life-feedback]','비교한 두 가지 대안을 구체적으로 보완해주세요.');
 await click('[data-life-action=feedback]');await wait("document.querySelector('[data-life-message]').textContent==='피드백을 공개했습니다.'");
 await screenshot('admin-life-feedback-desktop',1200);
 await ev("document.querySelector('[data-life-feedback]').scrollIntoView({block:'center'})");
 await screenshot('admin-life-review-desktop',1200);
 await send('Page.navigate',{url:base+'/'});await wait("window.ready && !!document.querySelector('[data-note-form]')");await lifeOpen();
 assert((await ev("document.querySelector('[data-life-host] .ip-feedback').textContent")).includes('두 가지'));
 await lifeSection('experiences');await lifeFill('[data-life-field=content]','장소 비용을 줄이는 안과 행사 규모를 줄이는 안의 장단점을 비교했습니다.');
 await click('[data-life-action=submit]');await wait("document.querySelector('[data-life-message]').textContent==='첨삭을 요청했습니다.'");
 const lifeSnapshot=(await invoke('life_get',{type:'student',id:'18120'})).profile;
 await invoke('life_save',{type:'student',id:'18120'},{revision:lifeSnapshot.revision,content:lifeSnapshot.content,status:'draft'});
 await lifeFill('[data-life-field=appeal]','다른 기기 충돌 시에도 보존해야 할 입력입니다.');
 await click('[data-life-action=save]');await wait("document.querySelector('[data-life-message]').textContent.includes('다른 기기')");
 assert((await ev("document.querySelector('[data-life-field=appeal]').value")).includes('보존해야'));
 await click('[data-life-action=reload]');await wait("document.querySelector('[data-life-save-state]').textContent==='서버에 저장됨'");
 // Actual /interview entry: browser-bound mock OAuth, existing account linking, new
 // application, existing admin approval, protected notes, and legacy linking.
 await send('Page.navigate',{url:base+'/interview'});await wait("!!document.querySelector('.ip-coast-kakao')");
 assert.equal(await ev("document.querySelectorAll('[data-legacy-form]').length"),0);
 await screenshot('actual-pc-portal-login',1200);
 await screenshot('portal-login-mobile',390);
 kakaoCode='qa-existing';await click('[data-kakao=login]');await wait("!!document.querySelector('[data-choice=existing]')");
 await click('[data-choice=existing]');
 await fill('studentId','18120');await fill('password','demo2026!!');await submit('[data-legacy-form]');
 await wait("!!document.querySelector('[data-basic-field=school]')");
 assert.equal(await ev("document.cookie.includes('ip_web_session')"),false);
 assert.equal(await ev("document.querySelectorAll('[data-category=job]').length"),0);
 await screenshot('portal-workspace-desktop',1200);
 await screenshot('portal-workspace-mobile',390);
 assert((await ev("document.querySelector('[data-basic-field=school]').value")).includes('전공'));
 await require('../tests/helpers/interview-combined-life-browser.cjs')({invoke,ev,wait,click,lifeFill,send,screenshot});
 await require('../tests/helpers/interview-life-followup-browser.cjs')({db,invoke,ev,wait,click,lifeFill,send,screenshot});
 if(process.argv.includes('--life-followup-only'))return;
 await require('../tests/helpers/interview-diagnosis-browser.cjs')({invoke,ev,wait,click,lifeFill,send,screenshot,failSave:()=>{failSave=true;}});
 await require('../tests/helpers/interview-ai-browser.cjs')({db,invoke,admin,aiInvoke,aiWorker,aiCalls,ev,wait,click,lifeFill,send,screenshot,failSave:()=>{failSave=true;}});
 await click('[data-logout]');await wait("!!document.querySelector('[data-kakao=login]')");
 await screenshot('portal-signup-desktop',1200);
 await screenshot('portal-signup-mobile',390);
 kakaoCode='qa-new';await click('[data-kakao=login]');await wait("!!document.querySelector('[data-choice=new]')");
 await click('[data-choice=new]');await fill('name','신규 면접 QA');await fill('examNumber','NEW-2026');
 await submit('[data-application-form]');await wait("document.body.textContent.includes('관리자 승인 대기')");
 await screenshot('portal-pending-mobile',390);
 assert.equal(await ev("document.querySelectorAll('[data-note-form]').length"),0);
 const pendingApplication=(await invoke('admin_applications',admin,{status:'pending'})).applications.find(a=>a.name==='신규 면접 QA');
 assert(pendingApplication.owner_id.startsWith('iw_'));
 await send('Page.navigate',{url:base+'/teacher.html#interview-prep-admin?section=applications'});
 await wait("!!document.querySelector('[data-ip=application-edit]')");
 await click('[data-ip=application-edit]');await wait("!!document.querySelector('[data-application-review]')");
 await fill('reviewNote','실제 수강 확인 후 승인하는 테스트입니다.');
 await screenshot('admin-application-review-desktop',1200);
 await submit('[data-application-review]');await wait("document.querySelector('[data-message]').textContent==='저장했습니다.'");
 await send('Page.navigate',{url:base+'/interview'});await wait("!!document.querySelector('[data-basic-field=school]')");
 assert.equal(await ev("document.querySelectorAll('.ip-account-bar a').length"),0,'Interview-only account has no ordinary app link');
 assert.equal(await ev("document.querySelector('[data-basic-field=school]').value"),'','New user cannot see legacy notes');
 await click('[data-workspace-page=motivation]');
 await wait("document.querySelector('[data-ai-message]') && document.querySelector('[data-ai-message]').textContent.includes('입력을 완료')");
 assert.equal(await ev("document.querySelectorAll('[data-ai-answer],.ip-ai-item').length"),0,'New student cannot see previous AI results');
 await click('[data-workspace-page=db]');await wait("!!document.querySelector('[data-basic-field=school]')");
 await lifeFill('[data-basic-field=school]','신규 계정에만 저장되는 인생그래프입니다.');
 await click('[data-life-action=save]');await wait("document.querySelector('[data-life-message]').textContent==='서버에 저장했습니다.'");
 assert((await invoke('life_get',{type:'student',id:pendingApplication.owner_id})).profile.content.basicInfo.school.text.includes('신규 계정'));
 // Interview-only web identity inside the app: no regular-class switch or device login.
 await send('Page.navigate',{url:base+'/interview?app=1'});await wait("!!document.querySelector('.ip-app-welcome')");
 assert.deepEqual(await ev("Array.from(document.querySelectorAll('.ip-app-footer button>span:last-child'),n=>n.textContent)"),['홈','DB 정리','작성하기','모의면접','마이']);
 await click('.ip-app-footer [data-app-tab=mock]');await wait("document.querySelectorAll('.ip-mock-menu [data-app-mock]').length===3");
 assert.deepEqual(await ev("[...document.querySelectorAll('.ip-mock-menu [data-app-mock]')].map(n=>n.dataset.appMock)"),['job','personality','ai']);
 await send('Page.reload');await wait("!!document.querySelector('.ip-mock-menu')");
 await screenshot('interview-app-mock',390);
 await screenshot('interview-app-mock-desktop',1200);
 for(const mode of ['job','personality']){
  await click('[data-app-mock='+mode+']');await wait("!!document.querySelector('[data-mock-mode="+mode+"]')");
  assert.equal(await ev("document.querySelector('.ip-mock-detail button').disabled"),true,'Unimplemented exam cannot start');
  assert.equal(await ev("document.querySelector('.ip-app-footer [aria-current]').dataset.appTab"),'mock');
  if(mode==='personality')assert.deepEqual(await ev("[...document.querySelectorAll('.ip-mock-elements strong')].map(n=>n.textContent)"),['결론','이유','경험','마무리']);
  if(mode==='job')assert.deepEqual(await ev("[...document.querySelectorAll('.ip-mock-grades>span')].map(n=>n.textContent)"),['O','△','X']);
  await send('Page.reload');await wait("!!document.querySelector('[data-mock-mode="+mode+"]')");
  await screenshot('interview-app-mock-'+mode,390);
  await ev('history.back()');await wait("!!document.querySelector('.ip-mock-menu')");
 }
 await click('[data-app-mock=personality]');await wait("!!document.querySelector('[data-mock-mode=personality]')");
 await click('.ip-mock-back');await wait("!!document.querySelector('.ip-mock-menu')");
 await click('.ip-app-footer [data-app-tab=writing]');await wait("!!document.querySelector('[data-ai-generate=self_intro]') && document.querySelector('.ip-ai-panel').getAttribute('aria-busy')==='false'");
 await click('.ip-app-footer [data-app-tab=my]');await wait("!!document.querySelector('.ip-app-profile')");
 assert.equal(await ev("document.querySelectorAll('[data-app-exit]').length"),0);
 await screenshot('interview-app-only-my',390);
 await send('Page.navigate',{url:base+'/index.html#home'});await wait("!!document.querySelector('.ip-app-welcome')");
 assert.equal(await ev("location.pathname"),'/interview','App launch restores authenticated interview-only web session');
 await click('.ip-app-footer [data-app-tab=my]');await wait("!!document.querySelector('[data-app-logout]')");
 await click('[data-app-logout]');await wait("!!document.querySelector('.ip-coast-kakao')");
 assert.equal(await ev("document.querySelectorAll('.ip-app-footer,[data-ai-answer]').length"),0);
 await send('Page.navigate',{url:base+'/interview'});await wait("!!document.querySelector('.ip-coast-kakao')");
 kakaoCode='qa-existing';await click('[data-kakao=login]');
 await wait("!!document.querySelector('[data-basic-field=school]')");
 assert.equal(await ev("document.querySelectorAll('.ip-account-bar,[data-kakao=link],.ip-portal-header [data-refresh]').length"),0);
 assert((await ev("document.querySelector('[data-basic-field=school]').value")).includes('전공'));
 await click('[data-logout]');await wait("!!document.querySelector('[data-kakao=login]')");
 await click('[data-kakao=login]');await wait("!!document.querySelector('[data-basic-field=school]')");
 await click('[data-logout]');await wait("!!document.querySelector('[data-kakao=login]')");
 // Ordinary application entry remains unchanged.
 await send('Page.navigate',{url:base+'/index.html'});await wait("typeof isLocalStudentPreview==='function'");
 await ev("isLocalStudentPreview=()=>false;render()");await wait("document.body.classList.contains('student-browser-install-only')");
 // Actual app/PWA shell: all three ordinary categories keep their screens and
 // generate zero interview API requests; only 18120 receives the entry.
 const ordinaryRequestCount=interviewRequests;
 await ev(`isStandaloneStudentApp=()=>true;isStudyCafeLocalPreview=()=>false;
   state.students.push({id:'18121',name:'일반 학생',studentCategory:'offline',isActive:true,appRegisteredAt:'2026-01-01'});
   state.settings.studentAuthId='18121';
   state.settings.studentProfiles['18121']={passwordHash:'qa-password',deviceToken:'qa-device'};`);
 for(const category of ['offline','online_managed','lecture']){
   await ev(`findStudent('18121').studentCategory=${JSON.stringify(category)};location.hash='#home';render();`);
   await wait("currentRoute==='home'");
   assert.equal(await ev("document.querySelector('#app').textContent.includes('면접 준비')"),false);
   assert.equal(await ev("document.querySelectorAll('.student-interview-registration').length"),1);
   assert.equal(await ev("document.querySelector('.pass-prediction-home-entry').nextElementSibling.classList.contains('student-interview-registration')"),true);
   assert.equal(await ev("document.querySelector('.student-interview-registration strong').textContent"),'면접반 등록');
   assert.equal(await ev("document.querySelector('.student-interview-registration').getAttribute('href')"),'/interview?app=1');
   await ev("document.querySelector('.pass-prediction-home-entry').scrollIntoView({block:'start'})");
   await screenshot('registration-home-'+category+'-mobile',390);
   await screenshot('registration-home-'+category+'-desktop',1200);
   await ev("location.hash='#mypage';render()");
   await wait("currentRoute==='mypage'");
   await ev("renderInterviewPrepEntry.cache?.promise");
   assert.equal(await ev("document.querySelector('#app').textContent.includes('면접 준비')"),false);
   assert.equal(await ev("document.querySelectorAll('.student-interview-registration').length"),0);
 }
 assert.equal(interviewRequests,ordinaryRequestCount,'Ordinary students must not call interview API');
 await screenshot('ordinary-student-mypage',390);
 await ev(`state.students.push({id:'18120',name:'테스트 학생',studentCategory:'offline',isActive:true,appRegisteredAt:'2026-01-01'});
   state.settings.studentAuthId='18120';
   state.settings.studentProfiles['18120']={passwordHash:'qa-password',deviceToken:'qa-device'};
   render();`);
 await wait("document.querySelector('#app').textContent.includes('면접반 모드로 전환')");
 await ev("navigate('interview-prep')");
 await wait("!!document.querySelector('.ip-app-welcome')");
 assert.equal(await ev("getComputedStyle(document.querySelector('.normal-student-footer')).display"),'none');
 await screenshot('interview-app-home',390);
 await click('.ip-app-footer [data-app-tab=db]');await wait("!!document.querySelector('[data-basic-field=school]')");
 assert.equal(await ev("document.querySelector('.ip-app-header h1').textContent"),'나의 DB 정리하기');
 assert.equal(await ev("document.querySelectorAll('[data-ai-generate]').length"),0);
 await click('.ip-app-footer [data-app-tab=writing]');await wait("!!document.querySelector('[data-ai-generate=self_intro]') && document.querySelector('.ip-ai-panel').getAttribute('aria-busy')==='false'");
 await click('[data-workspace-page=public_service]');await wait("!!document.querySelector('[data-ai-generate=public_service]') && document.querySelector('.ip-ai-panel').getAttribute('aria-busy')==='false'");
 await screenshot('actual-test-account-interview',390);
 await click('.ip-app-footer [data-app-tab=home]');await wait("!!document.querySelector('.ip-app-welcome')");
 await ev("history.back()");await wait("!!document.querySelector('[data-ai-generate=public_service]') && document.querySelector('.ip-ai-panel').getAttribute('aria-busy')==='false'");
 await click('.ip-app-footer [data-app-tab=my]');await wait("!!document.querySelector('[data-app-exit]')");
 await ev("renderInterviewPrepModule.view.controller.destroy();renderInterviewPrepModule.view=null;prepareInterviewAppEntry.cache=null;history.replaceState(null,'','#home');render()");
 await wait("!!document.querySelector('.ip-app-welcome')");
 assert.equal(await ev("currentRoute"),'interview-prep','Saved account mode restored after enrollment check');
 await ev("saveState({skipRemote:true})");await send('Page.reload');await wait("!!document.querySelector('.ip-app-welcome')");
 assert.equal(await ev("currentRoute"),'interview-prep','Reload restores verified interview mode');
 await click('.ip-app-footer [data-app-tab=my]');await wait("!!document.querySelector('[data-app-exit]')");
 await click('[data-app-exit]');await wait("currentRoute==='home' && !document.querySelector('.ip-app-footer')");
 assert.notEqual(await ev("getComputedStyle(document.querySelector('.normal-student-footer')).display"),'none');
 await send('Page.navigate',{url:base+'/teacher.html#interview-prep-admin'});
 await wait("document.body.classList.contains('teacher-interview-mode') && !!document.querySelector('[data-section=core]')");
 assert.equal(await ev("document.querySelector('[data-teacher-standard-nav]').hidden"),true);
 await screenshot('actual-admin-shell',1200);
 await click('[data-interview-section=core]');await wait("!!document.querySelector('[name=coreKind]')");
 assert.equal(await ev("new URLSearchParams(location.hash.split('?')[1]).get('section')"),'core');
 await screenshot('admin-core30-desktop',1200);
 await ev("document.querySelector('[data-publish-id]').checked=true");
 await click('[data-ip=question-publish]');await wait("document.querySelector('[data-message]').textContent.includes('공개했습니다')");
 assert((await invoke('core_questions',{type:'student',id:'18120'})).questions.length>0);
 // Re-opening the existing teacher page without a hash restores the mode/section.
 await send('Page.navigate',{url:base+'/teacher.html'});await wait("document.body.classList.contains('teacher-interview-mode') && !!document.querySelector('[name=coreKind]')");
 await click('[data-teacher-mode=standard]');await wait("!document.body.classList.contains('teacher-interview-mode') && currentRoute==='home'");
 assert.equal(await ev("document.querySelector('[data-teacher-standard-nav]').hidden"),false);
 await click('[data-teacher-mode=interview]');await wait("document.body.classList.contains('teacher-interview-mode') && !!document.querySelector('[data-section=core]')");
 await click('[data-interview-section=analysis]');await wait("!!document.querySelector('[name=elementId]')");
 await screenshot('admin-analysis-desktop',1200);
 await ev("document.querySelector('[name=elementId]').value='shared-goal'");
 await submit('[data-filter]');await wait("!!document.querySelector('[data-ip=analysis-edit]')");
 await click('[data-ip=analysis-edit]');await wait("!!document.querySelector('[data-analysis-form]')");
 assert((await ev("document.querySelector('[data-editor]').textContent")).includes('학생 소재'));
 await fill('rationale','팀 목표와 본인 역할을 구분하고 동료를 지원한 실제 행동을 확인합니다.');
 await ev("document.querySelector('[data-analysis-form] [name=status]').value='reviewed'");
 await submit('[data-analysis-form]');await wait("document.querySelector('[data-message]').textContent==='저장했습니다.'");
 assert.equal((await invoke('admin_analysis_catalog',admin)).reviewed,1);
 await screenshot('admin-analysis-mobile',390);
 await click('[data-ip=analysis-edit]');await wait("!!document.querySelector('[data-analysis-form]')");
 await ev("document.querySelector('[data-editor]').scrollIntoView({block:'start',behavior:'instant'})");
 await screenshot('admin-analysis-editor-mobile',390);
 await click('[data-interview-section=job]');await wait("document.querySelector('#app h2').textContent==='직무 기출 관리'");
 assert.equal(await ev("document.querySelectorAll('[data-tab=topics],[data-tab=members],[data-tab=analysis]').length"),0);
 await screenshot('actual-admin-job-shell',1200);
 await require('../tests/helpers/interview-review-browser.cjs')({db,invoke,admin,newStudentId:pendingApplication.owner_id,ev,wait,click,fill,submit,screenshot});
 await send('Page.navigate',{url:base+'/interview?app=1'});await wait("!!document.querySelector('[data-kakao=login]')");
 kakaoCode='qa-existing';await click('[data-kakao=login]');await wait("!!document.querySelector('.ip-app-welcome')");
 await click('.ip-app-footer [data-app-tab=writing]');await wait("document.querySelector('.ip-ai-panel')?.getAttribute('aria-busy')==='false'");
 await click('[data-workspace-page=public_service]');
 await wait("!!document.querySelector('[data-writing-text]') && document.querySelector('.ip-ai-panel')?.getAttribute('aria-busy')==='false'");
 assert((await ev("document.querySelector('.ip-writing-editor .ip-feedback').textContent")).includes('실천 방법'));
 assert((await ev("document.querySelector('.ip-writing-submission').textContent")).includes('보완 필요'));
 await lifeFill('[data-writing-text]','피드백을 반영해 확인한 정보를 기록하고 동료와 교차 확인하겠습니다.');
 await click('[data-writing-save=submitted]');await wait("document.querySelector('[data-writing-message]').textContent.includes('교사에게 제출했습니다')");
 assert((await ev("document.querySelector('.ip-writing-editor .ip-feedback strong').textContent")).includes('이전 제출'));
 const resubmitted=(await invoke('admin_review_detail',admin,{targetStudentId:'18120'})).writings.find(w=>w.kind==='public_service');
 assert.equal(resubmitted.submission_status,'submitted');assert(resubmitted.submitted_body.includes('교차 확인'));
 assert.equal(resubmitted.submission_round,2);assert.equal(resubmitted.feedback_round,1);
 await click('[data-writing-history] .ip-writing-history>summary');
 await wait("document.querySelectorAll('[data-writing-history] .ip-writing-round').length===2");
 const rounds=await ev("[...document.querySelectorAll('[data-writing-history] .ip-writing-round')].map(n=>n.textContent)");
 assert(rounds[0].includes('2차 제출'));assert(rounds[0].includes('교차 확인'));
 assert(!rounds[0].includes('실천 방법'));assert(rounds[1].includes('1차 교사 피드백'));assert(rounds[1].includes('실천 방법'));
 await ev("document.querySelectorAll('[data-writing-history] .ip-writing-round')[1].open=true;document.querySelector('[data-writing-history]').scrollIntoView({block:'start'})");
 await screenshot('student-submission-resubmitted',390);
 await send('Page.navigate',{url:base+'/'});await wait("window.ready && !!document.querySelector('[data-note-form]')");
 await click('[data-view=core]');await wait("!!document.querySelector('[data-ip=core-note]')");
 assert.equal(await ev("document.querySelector('progress')===null"),true);
 await screenshot('student-core30-mobile',390);
 await click('[data-ip=core-note]');await wait("!!document.querySelector('[data-note-form]')");
 assert.equal(exceptions.length,0,JSON.stringify(exceptions));
 console.log('PASS browser: persistent teacher interview mode, core collection publication/student access, distinct topic prompts, enrollment, autosave, feedback/history, analysis and unchanged ordinary student routes; 390/1200px screenshots in .tmp/interview-qa.');
 }finally{localWorker?.stdin.end();ws?.close();browser?.kill();server?.close();await db?.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
