'use strict';
// Replays the actual desktop-generated synthetic answer through the real handlers/RPCs.
// No model call or production DB access occurs when this test is rerun.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname,'..');
const app = process.env.INTERVIEW_APP_ROOT || (fs.existsSync(path.join(root,'tests/helpers/interview-db.cjs')) ? root :
  'C:/Users/W11/Desktop/Coding/Codex_Project/outing-auth-app');
const fixture = require('./fixtures/desktop-app-generation.json');
const {validateResult} = require('../lib/interview-ai-validation');
const {createHandler: studentHandler} = require('../api/interview-ai');
const {createHandler: workerHandler} = require('../api/interview-ai-worker');
async function main() {
  validateResult(fixture.result,fixture.job.sources,fixture.job.kind);
  process.chdir(app);
  const {db,invoke:base} = await require(path.join(app,'tests/helpers/interview-db.cjs')).createDb();
  const admin={type:'admin',id:'desktop-test'}, actor={type:'student',id:'ip-a'};
  const invoke=async(action,owner,body={})=>(await db.query('select ip_ai_service($1,$2::jsonb,$3::jsonb) result',
    [action,JSON.stringify(owner),JSON.stringify(body)])).rows[0].result;
  const token=crypto.randomBytes(32).toString('base64url'), bundle='b'.repeat(64);
  const api=studentHandler({authenticateWeb:async()=>({id:'ip-a'}),invoke});
  const worker=workerHandler({invoke:async(action,tokenHash,body)=>(await db.query(
    'select ip_ai_worker_service($1,$2,$3::jsonb) result',[action,tokenHash,JSON.stringify(body)])).rows[0].result});
  const request=async(handler,body,headers={})=>{
    let status,data;
    await handler({method:'POST',headers:{host:'local.test',...headers},body},
      {setHeader(){},status(n){status=n;return this;},json(d){data=d;}});
    assert.equal(status,200,JSON.stringify(data)); return data;
  };
  const run=(action,body={})=>request(worker,{action,...body},{authorization:'Bearer '+token});
  try {
    await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261020063234_interview_ai_pipeline.sql'),'utf8'));
    await base('admin_enabled',admin,{enabled:true});
    await base('admin_member_save',admin,{targetStudentId:'ip-a',track:'공채',examNumber:'synthetic',enabled:true});
    const experiences=['e1','e2','e3'].map(id=>Object.fromEntries([['id',id],
      ...fixture.job.sources.filter(s=>s.experience_id===id).map(s=>[s.id.split(':').at(-1),s.text])]));
    await db.query("insert into ip_life_profiles(student_id,content,status) values('ip-a',$1,'draft')",
      [JSON.stringify({experiences})]);
    await invoke('admin_configure',admin,{enabled:true,bundleHash:bundle});
    await invoke('admin_register_worker',admin,{label:'synthetic-desktop-test',studentIds:['ip-a'],
      tokenHash:crypto.createHash('sha256').update(token).digest('hex')});
    const prep=await request(api,{action:'prepare',kind:'self_intro'});
    const registered=await request(api,{action:'generate',kind:'self_intro',sourceHash:prep.sourceHash,requestKey:'desktop-real-result'});
    const {job}=await run('claim',{bundleHash:bundle});
    const lease={jobId:job.id,leaseToken:job.lease_token,leaseEpoch:job.lease_epoch},executionId=crypto.randomUUID();
    await run('execution_start',{...lease,executionId});
    await run('session',{...lease,executionId,sessionRef:fixture.thread_id});
    await run('complete',{...lease,executionId,result:fixture.result});
    assert((await run('complete',{...lease,executionId,result:fixture.result})).reused);
    const view=await request(api,{action:'status',requestId:registered.requestId});
    assert.equal(view.items[0].status,'COMPLETED');
    assert.equal(view.items[0].result.answer,fixture.result.answer);
    assert.equal(view.items[0].result.experience_coverage.length,3);
    console.log('PASS actual Codex desktop answer: 504 characters, 9 source references, 3 experiences; API → DB → student status; duplicate upload idempotent');
  } finally {await db.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
