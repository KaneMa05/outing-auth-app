'use strict';
// Loopback review harness: fictional data, local PGlite, no environment files or paid API.
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {fixture}=require('../tests/helpers/interview-mock-cli-fixture.cjs');
const {createHandler}=require('../api/interview-mock-worker');
const {analyzeTask}=require('../lib/interview-mock-analysis.cjs');
async function createPreview({port=0}={}){
 const f=await fixture(),ids={},processing=new Set(),cached={};
 for(const kind of ['job','personality']){const r=await f.submit(kind);if(r.status!==200)throw Error(JSON.stringify(r));ids[kind]=r.data.run.id;}
 ids.report=randomUUID();await f.db.query("insert into ip_live_runs(id,student_id,request_key,state,questions,turns,retain_until) values($1,'ip-a',$2,'completed','[]',$3::jsonb,now()+interval '30 days')",[ids.report,randomUUID(),JSON.stringify([{kind:'initial',question:f.personality.question.prompt,answer:f.personality.transcript,complete:true}])]);
 await f.queue.enqueue('report',ids.report,{type:'student',id:'ip-a'});
 for(const kind of ['job','personality','report'])try{cached[kind]=JSON.parse(await fs.readFile(path.resolve('output/interview-mock-cli',kind+'-result.json'),'utf8'));}catch{}
 const token='p'.repeat(43),handler=createHandler({token,configured:true,queue:f.queue,storage:kind=>f.deps(kind).storage()}),auth={authorization:'Bearer '+token};
 const call=async(body)=>{const result=await f.callHandler(handler,body,auth);if(result.status!==200)throw Error(result.data.error);return result.data;};
 async function processKind(kind){
  const {jobs}=await call({action:'poll',kinds:[kind]});if(!jobs.length)return;const job=jobs[0];let pass=0;
  try{
   await new Promise(resolve=>setTimeout(resolve,1200));
   const stored=cached[kind],infer=async(input,options)=>{
    if(stored&&kind==='report')return stored.analysis;
    if(stored?.judgments?.length&&kind==='job')return stored.judgments[pass++];
    if(stored?.analysis&&kind==='personality'){
     const a=stored.analysis;return {components:Object.fromEntries(a.components.map(({id,presence,quality,quote,feedback})=>[id,{presence,quality,quote,feedback}])),experienceEvidence:Object.fromEntries(Object.entries(a.experienceEvidence).map(([k,v])=>[k,v.quote])),connections:a.connections.map(({from,to,status,quote,feedback})=>({from,to,status,quote,feedback})),issues:a.issues.map(({kind,firstQuote,secondQuote,feedback})=>({kind,firstQuote,secondQuote,feedback})),summary:a.summary,nextPractice:a.nextPractice};
    }return f.infer(input,options);
   };
   const models={...f.models,...stored?.audit?.models,transcriber:'fixture-transcript'},task=kind==='report'?{kind,run:job.snapshot}:{kind,audio:Buffer.from(job.audioBase64,'base64'),...(kind==='job'?{detail:job.snapshot.rubric_detail}:{question:job.snapshot.question})};
   const report=await analyzeTask(task,{models,infer,transcribe:async()=>kind==='job'?'VHF를 사용하고 위치 정보를 교환합니다.':f.personality.transcript});await call({action:'complete',id:job.id,lease:job.lease,report});
  }catch{await call({action:'fail',id:job.id,lease:job.lease}).catch(()=>{});}finally{processing.delete(kind);}
 }
 const root=path.resolve(__dirname,'..'),server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost');res.setHeader('Cache-Control','no-store');
  if(url.pathname==='/saved-review'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(await fs.readFile(path.join(root,'output/interview-mock-cli-review.html')));}
  if(url.pathname==='/preview/data'){
   const kind=url.searchParams.get('kind');if(!ids[kind])throw Error('not_found');const state=await f.queue.get(kind,ids[kind],{type:'student',id:'ip-a'});
   const run=kind==='report'?null:(await f.callHandler(f.handlers[kind],{action:'get',id:ids[kind]})).data.run;
   res.setHeader('Content-Type','application/json; charset=utf-8');return res.end(JSON.stringify({kind,processing:state,report:run?.report||state?.report,question:kind==='job'?f.detail.question.prompt:f.personality.question.prompt,transcript:kind==='job'?'VHF를 사용하고 위치 정보를 교환합니다.':f.personality.transcript,source:cached[kind]?'실제 CLI 분석 결과 · 가상 전사문':'모의 분석 결과 · 가상 전사문'}));
  }
  if(url.pathname==='/preview/process'){
   if(req.method!=='POST'||req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)throw Error('forbidden');const kind=url.searchParams.get('kind');if(!ids[kind])throw Error('not_found');
   if(!processing.has(kind)){processing.add(kind);void processKind(kind);}res.setHeader('Content-Type','application/json');return res.end('{"ok":true}');
  }
  const relative=url.pathname==='/'?'tests/fixtures/interview-mock-cli/index.html':url.pathname.slice(1);
  if(!/^(tests\/fixtures\/interview-mock-cli\/(index\.html|main\.mjs|style\.css)|client\/interview-[a-z-]+\.(mjs|js)|client\/interview-attempts\/[a-z-]+\.mjs)$/.test(relative)){res.statusCode=404;return res.end();}
  const data=await fs.readFile(path.join(root,relative));res.setHeader('Content-Type',relative.endsWith('.html')?'text/html; charset=utf-8':relative.endsWith('.css')?'text/css':'text/javascript');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; media-src 'self' blob:; frame-ancestors 'none'");res.end(data);
 }catch{res.statusCode=500;res.end('Preview unavailable');}});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 return {origin:'http://127.0.0.1:'+server.address().port,server,db:f.db,close:async()=>{await new Promise(resolve=>server.close(resolve));await f.db.close();}};
}
if(require.main===module)createPreview({port:Number(process.env.INTERVIEW_MOCK_PREVIEW_PORT)||0}).then(view=>{console.log(JSON.stringify({origin:view.origin,scope:'fictional data; no external calls'}));process.on('SIGINT',()=>void view.close().then(()=>process.exit(0)));}).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={createPreview};
