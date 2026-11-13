'use strict';
// Synthetic local applicants only; no production database or sessions.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/W11/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const root=path.resolve(__dirname,'..'),output=path.join(root,'output/interview-application-products');fs.mkdirSync(output,{recursive:true});
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://local');
  if(url.pathname==='/qa'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end('<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/interview-prep.css"><main id="host"></main>');}
  const file=path.resolve(root,'.'+url.pathname);
  if(!file.startsWith(root+path.sep)||!['.js','.mjs','.css'].includes(path.extname(file))||!fs.existsSync(file)){res.statusCode=404;return res.end();}
  res.setHeader('Content-Type',path.extname(file)==='.css'?'text/css':'text/javascript');res.end(fs.readFileSync(file));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const page=await browser.newPage({serviceWorkers:'block',viewport:{width:1280,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port+'/qa');
  await page.evaluate(async()=>{
   const {mountAdmin}=await import('/interview-prep-ui.js');window.calls=[];window.mode='normal';
   window.applicants=['pending','approved','rejected'].map((status,i)=>({id:'qa-'+status,name:['대기 신청자','승인 수강생','반려 신청자'][i],track:'공채',exam_number:'000'+i,status,access_product:'interview_package',current_access_product:status==='approved'?'aptitude_only':'interview_package',revision:1,created_at:new Date().toISOString()}));
   const request=async(action,body={})=>{
    calls.push({action,body});
    if(action==='admin_catalog')return {topics:[],counts:{},enabled:true};
    if(action==='admin_applications')return {applications:structuredClone(applicants.filter(a=>!body.status||a.status===body.status)),summary:{students:1,pending:1,approved:1,rejected:1}};
    if(action==='admin_application_decide'){
     const application=applicants.find(a=>a.id===body.id);if(application.revision!==body.revision||application.status!=='pending')throw Error('revision_conflict');
     Object.assign(application,{status:body.status,access_product:body.accessProduct,current_access_product:body.accessProduct,revision:application.revision+1});return {ok:true,application};
    }
    if(action==='admin_application_product_save'){
     if(mode==='failure')throw Error('interview_unavailable');if(mode==='conflict')throw Error('revision_conflict');
     const application=applicants.find(a=>a.id===body.id);if(application.revision!==body.revision||application.current_access_product!==body.expectedProduct)throw Error('revision_conflict');
     Object.assign(application,{access_product:body.accessProduct,current_access_product:body.accessProduct,revision:application.revision+1});return {ok:true,application};
    }
    throw Error('Unexpected action: '+action);
   };
   window.remount=async canWrite=>{window.view?.destroy();window.view=await mountAdmin(document.querySelector('#host'),{initialSection:'applications',request,canWrite});};await remount(true);
  });
  const editor=page.locator('[data-editor]'),product=()=>page.locator('[data-application-product] [name=accessProduct]');
  const change=status=>page.locator('[data-ip=application-product][data-id="qa-'+status+'"]');
  await change('pending').click();assert.equal(await product().inputValue(),'interview_package');assert((await editor.innerText()).includes('수강 승인은 별도로'));
  await product().selectOption('aptitude_only');await page.getByRole('button',{name:'변경 저장',exact:true}).click();
  await page.waitForFunction(()=>applicants[0].revision===2);await change('pending').waitFor();
  assert.equal(await page.evaluate(()=>applicants[0].status),'pending');await change('pending').click();assert.equal(await product().inputValue(),'aptitude_only');
  await product().selectOption('interview_package');await page.evaluate(()=>{mode='failure';});await page.getByRole('button',{name:'변경 저장',exact:true}).click();
  await page.getByText('면접 준비 기능에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.',{exact:true}).waitFor();assert.equal(await product().inputValue(),'interview_package');
  await page.evaluate(()=>{mode='conflict';});await page.getByRole('button',{name:'변경 저장',exact:true}).click();
  await page.getByText('다른 기기 또는 관리자가 내용을 수정했습니다. 입력 내용을 복사해 보관한 후 최신 내용을 불러오세요.',{exact:true}).waitFor();assert.equal(await product().inputValue(),'interview_package');
  page.once('dialog',dialog=>dialog.dismiss());await page.locator('[data-application-product] [data-ip=close]').click();assert.equal(await editor.isVisible(),true);
  page.once('dialog',dialog=>dialog.accept());await page.locator('[data-application-product] [data-ip=close]').click();await page.evaluate(()=>{mode='normal';});
  await page.locator('[data-filter] [name=status]').selectOption('');await page.locator('[data-filter] button').click();await change('approved').waitFor();
  await change('approved').click();assert.equal(await product().inputValue(),'aptitude_only','Current membership overrides the original application product');
  assert((await editor.innerText()).includes('이용 권한이 바로 적용'));
  await product().selectOption('interview_package');await page.getByRole('button',{name:'변경 저장',exact:true}).click();await page.waitForFunction(()=>applicants[1].revision===2);
  await change('approved').click();assert.equal(await product().inputValue(),'interview_package');
  await page.screenshot({path:path.join(output,'approved-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:path.join(output,'approved-mobile.png'),fullPage:true});
  await page.locator('[data-application-product] [data-ip=close]').click();await change('rejected').click();await product().selectOption('aptitude_only');await page.getByRole('button',{name:'변경 저장',exact:true}).click();await page.waitForFunction(()=>applicants[2].revision===2);
  assert.equal(await page.evaluate(()=>applicants[2].status),'rejected');
  assert.equal(await page.evaluate(()=>calls.some(c=>['admin_application_decide','admin_member_save'].includes(c.action))),false,'Editing a product does not approve or overwrite other member settings');
  await page.evaluate(()=>view.openSection('applications'));await page.locator('[data-ip=application-edit]').click();
  const review=page.locator('[data-application-review]');assert.equal(await review.locator('[name=accessProduct]').inputValue(),'aptitude_only');
  await review.locator('[name=accessProduct]').selectOption('interview_package');await review.locator('[name=expiresOn]').fill('2099-12-31');
  await page.locator('[data-editor]').screenshot({path:path.join(output,'review-mobile.png')});await page.setViewportSize({width:1280,height:900});await page.locator('[data-editor]').screenshot({path:path.join(output,'review-desktop.png')});
  await review.locator('[data-write]').click();await page.waitForFunction(()=>applicants[0].status==='approved');
  const approval=await page.evaluate(()=>calls.findLast(c=>c.action==='admin_application_decide').body);assert.equal(approval.accessProduct,'interview_package');assert.equal(approval.status,'approved');assert.equal(approval.expiresOn,'2099-12-31');assert.equal(approval.revision,2);
  await page.evaluate(()=>remount(false));await page.locator('[data-filter] [name=status]').selectOption('');await page.locator('[data-filter] button').click();await change('approved').waitFor();assert.equal(await change('approved').isDisabled(),true);
  assert.deepEqual(errors,[]);console.log('PASS browser: standalone course changes and selection during approval, atomic approval payload, save/reopen, failures/conflicts preserve input, unsaved-change guard, read-only access and desktop/mobile layout.');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
