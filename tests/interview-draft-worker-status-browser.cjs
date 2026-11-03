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
  browser=await chromium.launch({...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{}),headless:true});
  const page=await browser.newPage();await page.clock.install();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/qa');
  await page.evaluate(async()=>{
   const {mountAdmin}=await import('/interview-prep-ui.js');window.statusCalls=0;
   window.view=await mountAdmin(document.querySelector('#host'),{initialSection:'home',request:async action=>{
    if(action==='admin_catalog')return {topics:[],categoryCounts:{},enabled:true};
    if(action==='admin_applications')return {summary:{students:42,pending:1},applications:[]};
    if(action==='admin_review_students')return {pendingStudents:3,revisionStudents:1};
    if(action==='admin_cli_status'){
     window.statusCalls++;if(window.statusCalls===3)throw Error('offline');
     const status={available:true,enabled:true,connected:true,running:0,queued:2,lastSeenAt:'2026-11-03T01:00:00Z',lastCompletedAt:'2026-11-03T00:59:00Z'};
     return {checkedAt:'2026-11-03T01:00:15Z',workers:[{...status,id:'core25',connected:window.statusCalls===1,running:1},{...status,id:'questions'},{id:'answers',available:false}]};
    }
    if(action==='admin_questions')return {questions:[]};
    throw Error(action);
   }});
  });
  const card=page.locator('[data-cli-worker-status]');
  assert.equal(await page.evaluate(()=>window.view.canLeave()),true,'Outer sidebar navigation checks the dashboard controller');
  assert.match(await card.textContent(),/CLI 실행 상태/);
  assert.equal(await card.locator('[data-cli-worker]').count(),3);
  assert.match(await card.locator('[data-cli-worker="core25"]').textContent(),/처리 중 1건/);
  assert.match(await card.locator('[data-cli-worker="questions"]').textContent(),/연결됨 · 요청 대기 중/);
  assert.match(await card.locator('[data-cli-worker="answers"]').textContent(),/상태 확인 불가/);
  assert(await page.evaluate(()=>document.querySelector('.ip-hero').nextElementSibling.matches('[data-cli-worker-status]')),'Status is directly below the home summary');
  for(const width of [1280,390]){
   await page.setViewportSize({width,height:900});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow');
   assert((await card.boundingBox()).y<900,'CLI status heading is visible without scrolling');
   if(process.env.CLI_STATUS_SCREENSHOT_DIR){fs.mkdirSync(process.env.CLI_STATUS_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.CLI_STATUS_SCREENSHOT_DIR,'home-'+width+'.png'),fullPage:true});}
  }
  if(process.env.DRAFT_STATUS_SCREENSHOT)await page.screenshot({path:process.env.DRAFT_STATUS_SCREENSHOT,fullPage:true});
  await page.clock.runFor(60000);assert.equal(await page.evaluate(()=>window.statusCalls),1,'No automatic status polling');
  await card.getByRole('button',{name:'상태 새로고침'}).click();assert.match(await card.textContent(),/연결 확인 지연/);
  await card.getByRole('button',{name:'상태 새로고침'}).click();assert.match(await card.textContent(),/상태를 확인하지 못했습니다/);
  await card.getByRole('button',{name:'상태 새로고침'}).click();
  assert.equal(await page.evaluate(()=>window.statusCalls),4);
  assert.match(await card.locator('[data-cli-worker="questions"]').textContent(),/연결됨 · 요청 대기 중/);
  await page.locator('[data-ip="category"][data-category="job"]').click();
  await page.getByRole('heading',{name:'직무 기출 관리',exact:true}).waitFor();
  assert.equal(await card.count(),0);
  await page.evaluate(()=>window.view.openSection('home'));
  assert.equal(await page.evaluate(()=>window.view.canLeave()),true);
  await page.locator('[data-ip="tab"][data-tab="questions"]').click();
  await page.getByRole('heading',{name:'인성 준비 관리',exact:true}).waitFor();
  const count=await page.evaluate(()=>window.statusCalls);
  await page.clock.runFor(30000);assert.equal(await page.evaluate(()=>window.statusCalls),count);
  await page.evaluate(()=>window.view.destroy());assert.deepEqual(errors,[]);
  console.log('PASS browser: all CLI cards on admin home, busy/disconnected/partial/error states, manual refresh, mobile layout, sidebar navigation and no automatic polling');
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
