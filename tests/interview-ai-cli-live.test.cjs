'use strict';
// Explicit opt-in: one real ChatGPT-authenticated CLI generation; synthetic local DB only.
if (!process.argv.includes('--live-cli')) {
  console.log('SKIP live CLI test (requires --live-cli; consumes Codex usage)');
  process.exit(0);
}
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const crypto=require('node:crypto'), http=require('node:http'), {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const app=process.env.INTERVIEW_APP_ROOT || (fs.existsSync(path.join(root,'tests/helpers/interview-db.cjs'))?root:
  'C:/Users/W11/Desktop/Coding/Codex_Project/outing-auth-app');
const seed=require('./fixtures/desktop-app-generation.json');
const {createHandler:studentHandler}=require('../api/interview-ai');
const {createHandler:workerHandler}=require('../api/interview-ai-worker');
async function main(){
  process.chdir(app);
  const {db,invoke:base}=await require(path.join(app,'tests/helpers/interview-db.cjs')).createDb();
  const guides=path.join(root,'tools/interview-worker/guidelines');
  const bundle=crypto.createHash('sha256');
  for(const name of ['instructions.txt','output.schema.json'])bundle.update(name+'\0').update(fs.readFileSync(path.join(guides,name))).update('\0');
  const bundleHash=bundle.digest('hex'), token=crypto.randomBytes(32).toString('base64url');
  const admin={type:'admin',id:'cli-local-test'};
  const invoke=async(action,actor,body={})=>(await db.query('select ip_ai_service($1,$2::jsonb,$3::jsonb) result',
    [action,JSON.stringify(actor),JSON.stringify(body)])).rows[0].result;
  const student=studentHandler({authenticateWeb:async()=>({id:'ip-a'}),invoke});
  let claimedJob, modelResult, generationCount=0;
  const worker=workerHandler({invoke:async(action,tokenHash,body)=>{
    const value=(await db.query('select ip_ai_worker_service($1,$2,$3::jsonb) result',
      [action,tokenHash,JSON.stringify(body)])).rows[0].result;
    if(action==='claim'&&value.job)claimedJob=value.job;
    if(action==='execution_start')generationCount++;
    if(action==='complete')modelResult=body.result;
    return value;
  }});
  const server=http.createServer(async(req,res)=>{
    try{
      let text='';for await(const chunk of req)text+=chunk;
      req.body=JSON.parse(text);
      const handler=req.url==='/api/interview-ai-worker'?worker:student;
      await handler(req,{setHeader:(...args)=>res.setHeader(...args),status(n){res.statusCode=n;return this;},
        json(value){res.end(JSON.stringify(value));}});
    }catch{res.statusCode=500;res.end('{"ok":false,"error":"local_test_failure"}');}
  });
  let child;
  try{
    await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261020063234_interview_ai_pipeline.sql'),'utf8'));
    await base('admin_enabled',admin,{enabled:true});
    await base('admin_member_save',admin,{targetStudentId:'ip-a',track:'공채',examNumber:'synthetic',enabled:true});
    const experiences=['e1','e2','e3'].map(id=>Object.fromEntries([['id',id],
      ...seed.job.sources.filter(s=>s.experience_id===id).map(s=>[s.id.split(':').at(-1),s.text])]));
    await db.query("insert into ip_life_profiles(student_id,content,status) values('ip-a',$1,'draft')",[JSON.stringify({experiences})]);
    await invoke('admin_configure',admin,{enabled:true,bundleHash});
    await invoke('admin_register_worker',admin,{label:'local-cli-test',studentIds:['ip-a'],
      tokenHash:crypto.createHash('sha256').update(token).digest('hex')});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const origin=`http://127.0.0.1:${server.address().port}`;
    const request=async(url,body)=>{
      const response=await fetch(origin+url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data;
    };
    // This is the same adapter called by the app's four buttons.
    const moduleText=fs.readFileSync(path.join(app,'client/interview-ai-client.js'),'utf8');
    const {createInterviewAI}=await import('data:text/javascript;base64,'+Buffer.from(moduleText).toString('base64'));
    const ai=createInterviewAI({request,interval:500,onUpdate(){}});
    let saved=false;
    const registration=await ai.generate('self_intro',{savePending:async()=>{saved=true;}});
    ai.pause();
    assert(saved);
    const runtime=path.join(root,'tests','.cli-live-'+crypto.randomUUID());
    const python=process.env.INTERVIEW_PYTHON || 'C:/Users/W11/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
    child=spawn(python,[path.join(root,'tests/run_cli_worker.py')],{stdio:['pipe','pipe','pipe'],windowsHide:true});
    let stdout='',stderr='';
    child.stdout.on('data',b=>{stdout+=b;});
    child.stderr.on('data',b=>{stderr+=b;});
    child.stdin.end(JSON.stringify({token,config:{web_origin:origin,runtime_dir:runtime,
      codex_executable:process.env.INTERVIEW_CODEX || 'C:/Users/W11/AppData/Local/Programs/OpenAI/Codex/bin/codex.exe'}}));
    const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});
    assert.equal(code,0,stdout+'\n'+stderr);
    const observation=JSON.parse(stdout.trim());
    assert.equal(observation.tool_events,0);
    assert.equal(generationCount,1);
    const view=await request('/api/interview-ai',{action:'status',requestId:registration.requestId});
    assert.equal(view.items[0].status,'COMPLETED');
    assert.equal(view.items[0].result.answer,modelResult.answer);
    assert(modelResult.experience_coverage.length>=3);
    const report={test:'synthetic-local-cli',created_at:new Date().toISOString(),...observation,
      job:{kind:claimedJob.kind,question:claimedJob.question,sources:claimedJob.sources},result:modelResult};
    fs.writeFileSync(path.join(root,'tests/fixtures/cli-generation.json'),JSON.stringify(report,null,2)+'\n');
    console.log(`PASS button adapter → local HTTP API → DB queue → Codex CLI → result upload → student status; ${observation.seconds}s, ${modelResult.answer.length} chars, ${modelResult.experience_coverage.length} experiences, no tools`);
  }finally{
    if(child&&child.exitCode===null)child.kill();
    await new Promise(resolve=>server.close(resolve));
    await db.close();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
