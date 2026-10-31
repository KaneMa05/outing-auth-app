'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/W11/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/qa'){res.setHeader('Content-Type','text/html');return res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/interview-prep.css"><main id="host"></main>');}
  const file=path.resolve(root,'.'+pathname);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.statusCode=404;return res.end();}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const page=await browser.newPage();await page.clock.install();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/qa');
  await page.evaluate(async()=>{
   const {mountAdmin}=await import('/interview-prep-ui.js');window.statusCalls=0;
   window.view=await mountAdmin(document.querySelector('#host'),{initialSection:'home',request:async action=>{
    if(action==='admin_catalog')return {topics:[],categoryCounts:{},enabled:true};
    if(action==='admin_applications')return {summary:{students:42,pending:1},applications:[]};
    if(action==='admin_review_students')return {pendingStudents:3,revisionStudents:1};
    if(action==='admin_draft_worker_status'){
     window.statusCalls++;if(window.statusCalls===3)throw Error('offline');
     return {enabled:true,connected:window.statusCalls===1,running:1,queued:2,lastSeenAt:'2026-10-31T06:00:00Z',lastCompletedAt:'2026-10-31T05:59:00Z',checkedAt:'2026-10-31T06:00:15Z'};
    }
    if(action==='admin_questions')return {questions:[]};
    throw Error(action);
   }});
  });
  const card=page.locator('[data-draft-worker-status]');
  assert.match(await card.textContent(),/질문 생성 중/);
  for(const width of [1280,390]){
   await page.setViewportSize({width,height:900});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow');
  }
  if(process.env.DRAFT_STATUS_SCREENSHOT)await page.screenshot({path:process.env.DRAFT_STATUS_SCREENSHOT,fullPage:true});
  await page.clock.runFor(10000);assert.match(await card.textContent(),/연결 확인 지연/);
  await page.clock.runFor(10000);assert.match(await card.textContent(),/상태를 확인하지 못했습니다/);
  await page.evaluate(()=>window.view.openSection('questions'));const count=await page.evaluate(()=>window.statusCalls);
  await page.clock.runFor(30000);assert.equal(await page.evaluate(()=>window.statusCalls),count);
  await page.evaluate(()=>window.view.destroy());assert.deepEqual(errors,[]);
  console.log('PASS browser: admin home, busy/disconnected/error transitions, mobile layout and navigation cleanup');
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
