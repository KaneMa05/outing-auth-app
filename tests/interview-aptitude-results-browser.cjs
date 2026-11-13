'use strict';
// Local database, identities and PDF metadata only; no production requests.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/W11/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {createDb}=require('./helpers/interview-db.cjs'),{createHandler}=require('../api/interview-aptitude');
(async()=>{
 const root=path.resolve(__dirname,'..'),out=path.join(root,'output/aptitude-results');fs.mkdirSync(out,{recursive:true});
 const {db}=await createDb();let browser,server;
 try{
  await db.exec("create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); update ip_settings set enabled=true; insert into ip_members(student_id,track,exam_number,enabled) values('ip-a','공채','a',true),('ip-b','공채','b',true);");
  for(const file of ['20261109053559_interview_aptitude_exams.sql','20261112152643_interview_aptitude_results_on_submission.sql'])await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8'));
  const invoke=async(action,actor,body={})=>(await db.query('select ip_aptitude_service($1,$2::jsonb,$3::jsonb) result',[action,JSON.stringify(actor),JSON.stringify(body)])).rows[0].result;
  const admin={type:'admin',id:'browser-qa'},id=randomUUID(),answerKey=Array(75).fill(1);
  await invoke('admin_save',admin,{id,revision:0,kind:'half',roundNo:1,title:'하프 1회',state:'open',resultsReleased:false,opensAt:null,closesAt:null,answerKey});
  const roundIds={half1:id};
  for(const [kind,roundNo] of [['half',2],['full',1],['full',2],['full',3]]){
   const extraId=randomUUID();roundIds[kind+roundNo]=extraId;
   await invoke('admin_save',admin,{id:extraId,revision:0,kind,roundNo,title:kind+' '+roundNo+'회',state:'open',resultsReleased:false,opensAt:null,closesAt:null,answerKey:Array(kind==='half'?75:150).fill(1)});
  }
  const file=(await invoke('admin_upload_prepare',admin,{id,revision:1,name:'제출 후 확인하는 해설.pdf',bytes:100})).file;
  await invoke('admin_upload_commit',admin,{id,fileId:file.id,bytes:100,sha256:'a'.repeat(64)});
  const handler=createHandler({invoke,authenticateAdmin:async()=>({id:admin.id}),authenticateWeb:async req=>({id:req.headers['x-qa-owner']||'ip-a'}),authenticateDevice:async()=>null,storage:()=>({signed:async p=>'https://fixture.invalid/object/sign/interview-aptitude/'+p})});
  server=http.createServer(async(req,res)=>{
   try{
    const pathname=new URL(req.url,'http://local').pathname;
    if(pathname==='/api/interview-aptitude')return handler(req,{setHeader:(...a)=>res.setHeader(...a),status(code){res.statusCode=code;return this;},json(value){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));}});
    if(pathname==='/qa'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/interview-prep.css"><main id="host"></main>');}
    const asset=path.resolve(root,'.'+pathname);
    if(!asset.startsWith(root+path.sep)||!fs.existsSync(asset)||!fs.statSync(asset).isFile()){res.statusCode=404;return res.end();}
    res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(asset)]||'application/octet-stream');res.end(fs.readFileSync(asset));
   }catch(error){res.statusCode=500;res.end(JSON.stringify({error:error.message}));}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/qa');
  await page.evaluate(async()=>{const {mountAdmin}=await import('/interview-prep-ui.js?v=20261113-aptitude-results');window.view=await mountAdmin(document.querySelector('#host'),{initialSection:'aptitude',canWrite:true,request:async action=>{if(action==='admin_catalog')return {topics:[],counts:{},enabled:true};throw Error(action);}});});
  await page.locator('[data-ia-action="open"][data-id="'+id+'"]').click();await page.locator('.ia-settings summary').click();
  await page.locator('[name=resultsReleased]').selectOption('true');await page.locator('[name=title]').fill('하프 1회 · 제출 후 결과 공개');
  await page.locator('[data-ia-action="admin-save"]').click();await page.getByText('저장했습니다.',{exact:true}).waitFor();
  await page.locator('.ia-settings summary').click();assert.equal(await page.locator('[name=state]').inputValue(),'open');assert.equal(await page.locator('[name=resultsReleased]').inputValue(),'true');
  for(const width of [1440,390]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(out,'admin-'+width+'.png'),fullPage:true});}
  // Publishing an already open round must not end another student's exam.
  const studentContext=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844},extraHTTPHeaders:{'x-qa-owner':'ip-a'}}),student=await studentContext.newPage();student.on('pageerror',e=>errors.push(e.message));
  await student.goto(base+'/qa');
  await student.evaluate(async()=>{const {mountAptitude}=await import('/client/interview-aptitude.mjs?v=20261113-aptitude-results');window.view=await mountAptitude(document.querySelector('#host'),{accountId:'ip-a'});});
  await student.locator('.ia-menus [data-menu="results"]').click();await student.getByText('아직 제출한 답안이 없습니다.').waitFor();assert.equal(await student.locator('.ia-score,.ia-files').count(),0);
  for(const width of [390,1280]){
   await student.setViewportSize({width,height:900});
   assert.deepEqual(await student.locator('[data-round-select] option').allTextContents(),['1회','2회']);assert.equal(await student.locator('[data-round-select]').inputValue(),roundIds.half1);
   await student.locator('[data-ia-action="kind"][data-kind="full"]').click();await student.waitForFunction(id=>document.querySelector('[data-round-select]')?.value===id,roundIds.full1);
   assert.deepEqual(await student.locator('[data-round-select] option').allTextContents(),['1회','2회','3회']);
   const laterRound=student.waitForResponse(response=>response.url().endsWith('/api/interview-aptitude')&&response.request().postDataJSON()?.id===roundIds.full3);
   await student.locator('[data-round-select]').selectOption(roundIds.full3);await laterRound;assert.equal(await student.locator('[data-round-select]').inputValue(),roundIds.full3);
   await student.locator('[data-ia-action="kind"][data-kind="half"]').click();await student.waitForFunction(id=>document.querySelector('[data-round-select]')?.value===id,roundIds.half1);
   await student.screenshot({path:path.join(out,'round-order-'+width+'.png'),fullPage:true});
  }
  await student.locator('.ia-menus [data-menu="answers"]').click();await student.locator('[data-ia-action="section"]').first().click();await student.locator('[data-answer="0"][data-choice="1"]').click();
  await student.locator('[data-ia-action="save"]').click();await student.getByText('저장 완료',{exact:true}).waitFor();
  const draft=await studentContext.request.post(base+'/api/interview-aptitude',{data:{action:'get',accountId:'ip-a',id}});const draftData=await draft.json();assert.equal(draftData.result,undefined);assert.equal(draftData.correctAnswers,undefined);assert.equal(draftData.files,undefined);
  await student.locator('[data-ia-action="subjects"]').first().click();student.once('dialog',d=>d.accept());await student.locator('[data-ia-action="submit"]').click();await student.getByText('제출 완료',{exact:true}).first().waitFor();
  await student.locator('.ia-menus [data-menu="results"]').click();await student.locator('.ia-score').waitFor();assert.match(await student.locator('.ia-score').innerText(),/1 \/ 75/);await student.getByText(file.original_name,{exact:true}).waitFor();
  await student.getByText('현재 등수',{exact:true}).waitFor();
  for(const width of [390,1280]){await student.setViewportSize({width,height:900});assert.equal(await student.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await student.screenshot({path:path.join(out,'submitted-'+width+'.png'),fullPage:true});}
  await student.locator('[data-ia-action="section"]').first().click();assert.match(await student.locator('.ia-answer-number small').first().innerText(),/정답 1/);
  const current=await invoke('admin_get',admin,{id});assert.equal(current.round.state,'open');assert.equal(current.round.accepting,true);
  const unsubmitted=await invoke('get',{type:'student',id:'ip-b'},{id});for(const key of ['result','correctAnswers','files'])assert.equal(unsubmitted[key],undefined);
  await assert.rejects(invoke('file',{type:'student',id:'ip-b'},{id,fileId:file.id}),/forbidden/);assert.deepEqual(errors,[]);
  console.log('PASS browser: half/full default to round 1 with ascending dropdowns and later rounds selectable; open + public saves; submitted results visible; unsubmitted/draft results private; ongoing exams stay open; desktop/mobile layouts fit.');
 }finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
