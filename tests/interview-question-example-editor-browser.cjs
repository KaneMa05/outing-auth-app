'use strict';
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {fixture}=require('./helpers/interview-mock-cli-fixture.cjs');
(async()=>{
 const f=await fixture(),root=process.cwd(),admin={type:'admin',id:'검증 관리자'};let browser,server;
 try{
  for(const file of ['20261102073138_interview_question_taxonomy.sql','20261106075735_interview_portal_practice_access.sql','20261106083856_interview_practice_reference_assessment.sql','20261106084214_interview_practice_result_reference_answer.sql','20261117082257_interview_question_example_editor.sql'])await f.db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
  const q=f.detail.question,question={id:q.id,prompt:q.prompt,category:'job',tracks:['공채'],topic_ids:[],revision:2,status:'published',source_count:1};
  await f.db.query("insert into ip_sources(id,filename,sha256,track) values('example-source','검증용 교재.pdf','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','공채') on conflict do nothing");
  const source='상황을 확인하고 동료에게 보고한 뒤 필요한 조치를 기록합니다. <img src=x onerror=alert(1)>';
  await f.db.query("insert into ip_occurrences(id,source_id,question_id,number,locator,year,original_prompt,answer) values('example-occurrence','example-source',$1,'1','p.1',2026,$2,$3)",[q.id,q.prompt,source]);
  const rpc=f.rpc('ip_question_example_service');
  server=http.createServer(async(req,res)=>{
   try{
    const name=req.url.split('?')[0];
    if(name==='/rpc'){
     let body='';for await(const c of req)body+=c;const {action,payload}=JSON.parse(body);let result;
     if(action==='admin_catalog')result={ok:true,enabled:true,topics:[],categoryCounts:{job:{total:1,published:1,draft:0},personality:{total:0,published:0,draft:0}}};
     else if(action==='admin_questions')result={ok:true,questions:[question],total:1};
     else result=await rpc(action,admin,payload);
     res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));return;
    }
    if(name==='/'){
     res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/interview-prep.css"><style>body{margin:24px;background:#f4f7fb;font-family:Arial,sans-serif}h1{font-size:18px}</style><h1>관리자 문항 편집 · 로컬 검증 화면</h1><main id="host"></main><script type="module">import {mountAdmin} from '/interview-prep-ui.js';window.failSave=false;window.request=async(action,payload={})=>{if(window.failSave&&action==='admin_question_example_save')throw Error('network_error');const response=await fetch('/rpc',{method:'POST',body:JSON.stringify({action,payload})});const data=await response.json();if(!response.ok)throw Error(data.error);return data;};window.mount=async canWrite=>{window.view?.destroy();window.view=await mountAdmin(document.querySelector('#host'),{request:window.request,initialSection:'job',canWrite});};await window.mount(true);window.ready=true;</script>`);return;
    }
    if(name.startsWith('/assets/')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({questions:[]}));return;}
    const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.statusCode=404;res.end();return;}
    res.setHeader('Content-Type',/\.m?js$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(fs.readFileSync(file));
   }catch(error){res.statusCode=409;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:error.message.includes('revision_conflict')?'revision_conflict':'failed'}));}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.ready);
  await page.locator('[data-ip=question-example]').click();await page.locator('[data-example-form]').waitFor();
  assert.equal(await page.locator('[data-example-row]').count(),1);assert.equal(await page.locator('[data-example-row] img').count(),0);assert(await page.locator('[data-example-row]').textContent().then(value=>value.includes(source)));
  const textarea=page.locator('[data-example-form] textarea');await textarea.fill('관리자가 검토한 새 예시답변입니다. 상황 확인과 동료 보고의 순서대로 설명합니다.');
  await page.locator('[data-example-save]').click();await page.getByText('예시답변을 저장했습니다.',{exact:true}).waitFor();
  assert.equal((await rpc('admin_question_example_detail',admin,{id:q.id})).example.revision,1);
  await page.evaluate(()=>window.failSave=true);await textarea.fill('저장 실패 시에도 유지되어야 하는 입력 내용');await page.locator('[data-example-save]').click();await page.getByText('저장하지 못했습니다.',{exact:false}).waitFor();assert.equal(await textarea.evaluate(el=>el.value),'저장 실패 시에도 유지되어야 하는 입력 내용');
  await page.evaluate(()=>window.failSave=false);
  await rpc('admin_question_example_save',admin,{id:q.id,revision:1,questionRevision:2,answer:'다른 관리자가 먼저 저장한 예시답변입니다.'});
  await page.locator('[data-example-save]').click();await page.getByText('다른 곳에서 문항 또는 예시답변이 수정됐습니다.',{exact:false}).waitFor();assert.equal(await textarea.evaluate(el=>el.value),'저장 실패 시에도 유지되어야 하는 입력 내용');
  page.once('dialog',dialog=>dialog.accept());await page.locator('[data-example-reload]').click();await page.locator('[data-example-form]').waitFor();assert.equal(await textarea.evaluate(el=>el.value),'다른 관리자가 먼저 저장한 예시답변입니다.');
  await f.db.query("update ip_occurrences set answer='원본 교재에 등록된 해설을 확인하는 검증용 내용입니다.' where id='example-occurrence'");
  await page.locator('[data-example-reload]').click();await page.locator('[data-example-form]').waitFor();
  await page.screenshot({path:'/tmp/ronpark-question-example-editor-desktop.png',fullPage:true});
  await page.locator('.ip-table-wrap').screenshot({path:'/tmp/ronpark-question-example-editor-preview.png'});
  await page.locator('[data-example-close]').click();assert.equal(await page.locator('[data-example-row]').count(),0);
  await page.setViewportSize({width:390,height:844});await page.locator('[data-ip=question-example]').click();await page.locator('[data-example-form]').waitFor();assert.equal(await page.locator('.ip-table-wrap').evaluate(el=>el.scrollLeft),0);assert(await page.locator('[data-example-host]').evaluate(el=>el.getBoundingClientRect().right<=innerWidth));await page.screenshot({path:'/tmp/ronpark-question-example-editor-mobile.png',fullPage:true});
  await page.evaluate(()=>window.mount(false));await page.locator('[data-ip=question-example]').click();await page.locator('[data-example-form]').waitFor();assert.equal(await page.locator('[data-example-save]').count(),0);assert.equal(await textarea.evaluate(el=>el.readOnly),true);
  assert.deepEqual(errors,[]);console.log('PASS inline source/explanation view, XSS escaping, real DB save/reload, failed save and conflict preserve input, read-only access, desktop and mobile.');
 }finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));await f.db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
