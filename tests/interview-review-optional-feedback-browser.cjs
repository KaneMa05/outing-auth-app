const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/W11/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {createDb}=require('./helpers/interview-db.cjs'),{createHandler}=require('../api/interview-prep');
const teacherSession=require('../api/teacher-session'),auth=require('../api/teacher-auth-utils');
(async()=>{
 const {db,invoke}=await createDb(),admin={type:'admin',id:'review-qa'},student={type:'student',id:'ip-a'},root=path.resolve(__dirname,'..'),errors=[];
 const previousSecret=process.env.TEACHER_SESSION_SECRET;process.env.TEACHER_SESSION_SECRET='optional-feedback-browser-local-test';
 let server,browser;
 try{
  await invoke('admin_member_save',admin,{targetStudentId:student.id,track:'공채',examNumber:'OPTIONAL',enabled:true});
  await invoke('admin_enabled',admin,{enabled:true});
  for(const kind of ['introduction','motivation'])await invoke('writing_save',student,{kind,itemId:'',revision:0,status:'submitted',text:kind+' 학생이 제출한 답변입니다.'});
  const handler=createHandler({invoke});
  server=http.createServer(async(req,res)=>{
   try{
    const url=new URL(req.url,'http://local.test');
    const wrapped={setHeader:(...args)=>res.setHeader(...args),status(n){res.statusCode=n;return wrapped;},json(v){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(v));}};
    if(url.pathname==='/api/teacher-session')return teacherSession(req,wrapped);
    if(url.pathname==='/api/interview-prep'){
     let raw='';for await(const chunk of req)raw+=chunk;req.body=JSON.parse(raw);return await handler(req,wrapped);
    }
    if(url.pathname==='/'){
     res.setHeader('Content-Type','text/html; charset=utf-8');
     return res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/interview-prep.css"><main class="ip-root" id="host"></main>');
    }
    const file=path.resolve(root,'.'+url.pathname);
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}
    res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(file));
   }catch(e){res.statusCode=500;res.end(e.message);}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const origin='http://127.0.0.1:'+server.address().port;
  for(const [width,kind,status] of [[1280,'introduction','approved'],[390,'motivation','needs_revision']]){
   const context=await browser.newContext({viewport:{width,height:900},isMobile:width===390,hasTouch:width===390});
   await context.addCookies([{name:auth.COOKIE_NAME,value:auth.createSessionToken(process.env.TEACHER_SESSION_SECRET,{username:admin.id,role:'admin',permissions:['interview.read','interview.write']}),url:origin}]);
   context.on('page',page=>page.on('pageerror',e=>errors.push(e.message)));
   const page=await context.newPage();await page.goto(origin);
   await page.evaluate(async()=>{
    const {mountWritingBoard}=await import('/interview-writing-board.js');
    window.view=mountWritingBoard(document.querySelector('#host'),{canWrite:true,request:async(action,payload={})=>{
     const response=await fetch('/api/interview-prep',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...payload})});
     const result=await response.json();if(!response.ok||!result.ok)throw Object.assign(Error(result.error),{code:result.error});return result;
    }});await window.view.ready;
   });
   await page.locator('[name=kind]').selectOption(kind);await page.locator('[data-board-filter]').evaluate(form=>form.requestSubmit());
   await page.waitForFunction(()=>document.querySelector('[data-board-results]').getAttribute('aria-busy')===null);
   const popupReady=context.waitForEvent('page');await page.locator('[data-board-open]').first().click();const popup=await popupReady;
   await popup.locator('[data-writing-save=feedback]').waitFor();
   assert.equal(await popup.locator('[data-inline-comment],[data-inline-legacy]').count(),0);
   await popup.locator('[data-writing-review]').selectOption(status);
   if(width===390)await popup.locator('[data-writing-save=feedback]').tap();else await popup.locator('[data-writing-save=feedback]').click();
   await popup.waitForFunction(()=>document.querySelector('[data-writing-save=feedback]')?.dataset.saveState==='saved');
   assert.equal(await popup.locator('[data-writing-message]').innerText(),'피드백을 저장했습니다.');
   assert.equal(await popup.locator('[data-writing-close]').isVisible(),true);
   const writing=(await invoke('writing_list',student)).writings.find(w=>w.kind===kind);
   assert.equal(writing.feedback,'');assert.deepEqual(writing.annotation_marks,[]);assert.equal(writing.submission_status,status);
   assert.equal(writing.submission_round,1);assert.equal(writing.awaiting_feedback,false);assert.equal(writing.body,kind+' 학생이 제출한 답변입니다.');
   await popup.reload();await popup.locator('[data-writing-save=feedback]').waitFor();
   assert.equal(await popup.locator('[data-writing-review]').inputValue(),status);assert.equal(await popup.locator('[data-inline-comment],[data-inline-legacy]').count(),0);
   await popup.close();await page.locator('[data-board-action=reload]').click();
   await page.waitForFunction(()=>document.querySelector('[data-board-results]').getAttribute('aria-busy')===null);
   assert.equal(await page.locator('[data-board-open]').count(),0,'Reviewed submissions leave the default pending board');
   await page.locator('[data-board-action='+ (status==='approved'?'completed':'revision')+']').click();
   await page.waitForFunction(()=>document.querySelector('[data-board-results]').getAttribute('aria-busy')===null);
   assert.equal(await page.locator('[data-board-open]').count(),1);
   await context.close();
  }
  assert.deepEqual(errors,[]);
  console.log('PASS desktop/mobile real review popup: empty review saves through authenticated API and DB, reload and status lists persist, answer and round preserved, resubmission unlocked.');
 }finally{
  await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));await db.close();
  if(previousSecret===undefined)delete process.env.TEACHER_SESSION_SECRET;else process.env.TEACHER_SESSION_SECRET=previousSecret;
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
