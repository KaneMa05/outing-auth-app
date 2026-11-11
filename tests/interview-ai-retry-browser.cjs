'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/W11/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const root=process.cwd(),output=path.join(root,'.tmp/interview-ai-retry-qa');fs.mkdirSync(output,{recursive:true});
 const server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://local').pathname;
  if(name==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/interview-prep.css"><div class="ip-root"><div id="host"></div></div>');return;}
  const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',name.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(file));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));await page.goto('http://127.0.0.1:'+server.address().port);
  await page.evaluate(async()=>{
   const {mountInterviewAI}=await import('/interview-ai-ui.js');
   window.calls=[];window.allowed=false;window.expire=false;window.queued=false;
   window.panel=mountInterviewAI(document.querySelector('#host'),{kind:'self_intro',request:async(_,body)=>{
    window.calls.push(body.action);
    if(body.action==='prepare')return {ok:true,enabled:true,dbReady:true,ready:true,experienceCount:3,sourceHash:'a'.repeat(64)};
    if(body.action==='requests')return {ok:true,requests:[{id:'fixture-request',kind:'self_intro'}]};
    if(body.action==='retry_items'){window.queued=true;return {ok:true,requestId:'fixture-request'};}
    if(body.action==='status'){
     if(window.expire){window.allowed=false;window.expire=false;}
     return {ok:true,requestId:'fixture-request',kind:'self_intro',items:[{id:'fixture-job',key:'self_intro',position:1,
      question:'자기소개',status:window.queued?'QUEUED':'FAILED',reason:window.queued?null:'invalid_output',attempts:2,
      canRetry:!window.queued&&window.allowed,retryReason:window.allowed?null:'retry_limit'}]};
    }
    throw Error('unexpected_action');
   }});
   await window.panel.ready;
  });
  assert.equal(await page.locator('[data-ai-item]').count(),0);
  assert.equal(await page.locator('[data-ai-retry]').count(),0);
  assert.match(await page.locator('[data-ai-retry-reason]').innerText(),/두 차례/);
  await page.screenshot({path:path.join(output,'retry-limit-mobile.png'),fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.evaluate(async()=>{window.allowed=true;await window.panel.refreshAvailability();});
  await page.locator('[data-ai-item]').check();assert.equal(await page.locator('[data-ai-retry]').isDisabled(),false);
  await page.evaluate(()=>window.expire=true);await page.locator('[data-ai-retry]').click();
  await page.waitForFunction(()=>document.querySelector('[data-ai-message]').textContent.includes('두 차례'));
  assert.equal(await page.evaluate(()=>window.calls.filter(action=>action==='retry_items').length),0);
  assert.equal(await page.locator('[data-ai-item]').count(),0);
  await page.evaluate(async()=>{window.allowed=true;await window.panel.refreshAvailability();});
  await page.locator('[data-ai-item]').check();await page.locator('[data-ai-retry]').click();
  await page.waitForFunction(()=>window.queued&&document.querySelector('.ip-ai-panel').getAttribute('aria-busy')==='false');
  assert.equal(await page.evaluate(()=>window.calls.filter(action=>action==='retry_items').length),1);
  assert.equal(await page.locator('[data-ai-item]').count(),0);
  assert.match(await page.locator('.ip-ai-items').innerText(),/대기 중/);
  await page.evaluate(()=>window.panel.destroy());assert.deepEqual(errors,[]);
  console.log('PASS mobile retry-limit guidance, hidden denied controls, saved-source refresh, stale-screen denial without retry RPC, allowed retry and queued-state controls');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
