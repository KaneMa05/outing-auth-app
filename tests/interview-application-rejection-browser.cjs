const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/W11/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/qa'){res.setHeader('Content-Type','text/html');return res.end('<main id="host"></main>');}
  const file=path.join(root,pathname==='/'?'interview.html':pathname);
  if(!fs.existsSync(file)){res.statusCode=404;return res.end();}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const page=await browser.newPage();const base='http://127.0.0.1:'+server.address().port;
  await page.goto(base+'/qa');
  await page.evaluate(async()=>{
   const {mountAdmin}=await import('/interview-prep-ui.js');window.calls=[];
   window.application={id:'qa',name:'테스트 학생',track:'기관',exam_number:'123',status:'pending',revision:1,created_at:new Date().toISOString()};
   await mountAdmin(document.querySelector('#host'),{initialSection:'applications',request:async(action,body)=>{
    if(action==='admin_catalog')return {topics:[],counts:{},enabled:true};
    if(action==='admin_applications')return {applications:window.application.status==='pending'?[window.application,{...window.application,id:'qa-2',name:'두 번째 학생'}]:[],summary:{students:0,pending:1,approved:0,rejected:0}};
    if(action==='admin_application_decide'){window.calls.push(body);window.application.status=body.status;return {};}
    throw Error(action);
   }});
  });
  await page.evaluate(()=>{window.forcedScrolls=0;Element.prototype.scrollIntoView=function(){window.forcedScrolls++;};});
  for(const width of [1280,390]){
   await page.setViewportSize({width,height:844});
   await page.locator('[data-ip="application-edit"][data-id="qa"]').click();
   assert.equal(await page.locator('[data-editor]').evaluate(n=>n.closest('.ip-question').querySelector('[data-ip="application-edit"]').dataset.id),'qa');
   assert.equal(await page.locator('[data-application-review] [name=status]').inputValue(),'approved');
   await page.locator('[data-ip="application-edit"][data-id="qa-2"]').click();
   assert.equal(await page.locator('[data-editor]').evaluate(n=>n.closest('.ip-question').querySelector('[data-ip="application-edit"]').dataset.id),'qa-2');
   assert.equal(await page.locator('[data-editor]').count(),1);
   await page.locator('[data-editor] [data-ip="close"]').click();
   assert.equal(await page.locator('[data-editor]').isVisible(),false);
   await page.locator('[data-filter] button').click();
   await page.locator('[data-ip="application-edit"][data-id="qa"]').waitFor();
  }
  assert.equal(await page.evaluate(()=>forcedScrolls),0,'Inline review must not force scrolling');
  await page.locator('[data-ip="application-reject"][data-id="qa"]').click();
  assert.equal(await page.locator('[data-editor]').evaluate(n=>n.closest('.ip-question').querySelector('[data-ip="application-edit"]').dataset.id),'qa');
  assert.equal(await page.locator('[data-application-review] [name=status]').inputValue(),'rejected');
  await page.locator('[data-application-review] [data-write]').click();
  assert.equal(await page.evaluate(()=>calls.length),0);
  await page.locator('[name=reviewNote]').fill('   ');
  await page.locator('[data-application-review] [data-write]').click();
  assert.equal(await page.evaluate(()=>calls.length),0);
  await page.locator('[name=reviewNote]').fill('수험번호를 확인해주세요. <확인>');
  await page.locator('[data-application-review] [data-write]').click();
  await page.waitForFunction(()=>calls.length===1);
  assert.equal((await page.evaluate(()=>calls[0])).status,'rejected');
  let app={id:'qa',name:'테스트 학생',track:'기관',exam_number:'123',status:'rejected',revision:2,review_note:'수험번호를 확인해주세요. <확인>'},applies=0;
  await page.route('**/api/interview-auth**',async route=>{
   if(route.request().method()==='POST'){
    const body=route.request().postDataJSON();assert.equal(body.action,'apply');assert.equal(body.revision,2);applies++;
    app={...app,status:'pending',revision:3,review_note:''};
   }
   await route.fulfill({json:{ok:true,authenticated:true,available:false,account:{ownerId:'qa'},application:app}});
  });
  await page.goto(base+'/interview.html');
  await page.getByRole('button',{name:'재신청',exact:true}).waitFor();
  assert((await page.locator('.ip-feedback').innerText()).includes('반려 사유'));
  assert((await page.locator('.ip-feedback').innerText()).includes('<확인>'));
  await page.getByRole('button',{name:'등록 상태 확인'}).click();
  await page.getByRole('button',{name:'재신청',exact:true}).waitFor();assert.equal(applies,0);
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'재신청',exact:true}).click();
  await page.getByText('수강 신청을 확인하고 있습니다.').waitFor();assert.equal(applies,1);
  console.log('PASS browser: desktop/mobile inline review, switching rows, close/filter/reopen, no forced scroll, explicit rejection, required reason, escaped student reason, refresh preserves rejection, mobile reapply transitions to pending');
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
