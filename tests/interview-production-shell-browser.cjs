// Synthetic portal session and API replies only; no external requests.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const root=path.resolve(__dirname,'..');const server=http.createServer((req,res)=>{
  const p=new URL(req.url,'http://local').pathname;
  if(p==='/qa'){res.setHeader('Content-Type','text/html');return res.end('<meta charset="utf-8"><link rel="stylesheet" href="/interview-app.css"><link rel="stylesheet" href="/interview-prep.css"><div id="host"></div>');}
  const f=path.resolve(root,'.'+p);if(!f.startsWith(root+'/')||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.statusCode=404;return res.end();}
  res.setHeader('Content-Type',p.endsWith('.css')?'text/css':/\.m?js$/.test(p)?'text/javascript':'application/octet-stream');res.end(fs.readFileSync(f));
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),submissions=[];let success=false;
  await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.hostname!=='127.0.0.1')return route.abort();if(url.pathname==='/api/interview-app-feedback'){submissions.push(route.request().postDataJSON());return route.fulfill({status:success?200:503,contentType:'application/json',body:JSON.stringify(success?{ok:true,id:'fixture-receipt'}:{ok:false,error:'feedback_unavailable'})});}return route.continue();});
  await page.goto('http://127.0.0.1:'+server.address().port+'/qa#interview-prep?tab=my');
  await page.evaluate(async()=>{const {mountInterviewApp}=await import('/interview-app-ui.js');window.view=await mountInterviewApp(document.querySelector('#host'),{account:{id:'fixture-owner',name:'수강생'},request:async action=>action==='mock_status'?{allowed:false}:{member:{track:'공채'},topics:[],notes:[],writings:[]}});});
  assert.equal(await page.locator('[data-app-mock]').count(),0);
  for(const width of [320,390,844]){await page.setViewportSize({width,height:844});const geometry=await page.locator('.ip-app-footer').evaluate(n=>{const r=n.getBoundingClientRect();return {bottom:r.bottom,width:r.width,viewport:innerWidth,height:innerHeight,bg:getComputedStyle(n).backgroundColor};});assert.equal(geometry.bottom,geometry.height);assert.equal(geometry.width,geometry.viewport);assert.equal(geometry.bg,'rgb(255, 255, 255)');}
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'의견 보내기'}).click();const dialog=page.getByRole('dialog');await dialog.waitFor();const submit=dialog.locator('[type=submit]');assert.equal(await submit.isDisabled(),true);
  await dialog.locator('textarea').fill('마이 화면에서 의견을 보냅니다.');await submit.click();await dialog.getByRole('alert').waitFor();assert.equal(submissions.length,1);assert.equal(await dialog.locator('textarea').inputValue(),'마이 화면에서 의견을 보냅니다.');
  success=true;await submit.click();await dialog.getByText('의견을 접수했습니다. 감사합니다.').waitFor();assert.equal(submissions.length,2);assert.deepEqual(submissions[0],submissions[1]);assert.deepEqual(Object.keys(submissions[0]).sort(),['appVersion','content','kind','requestId','screen']);assert(!('studentId'in submissions[0]));
  await dialog.getByRole('button',{name:'닫기'}).click();assert.equal(await page.getByRole('dialog').count(),0);
  await page.locator('[data-app-tab="home"]').first().click();await page.waitForTimeout(100);assert.equal(await page.locator('[data-app-feedback]').count(),0);
  console.log('PASS ordinary portal: docked menu 320/390/844, my-only feedback, draft retention, same-ID retry, private minimal payload, success and close; no interview or external API');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
