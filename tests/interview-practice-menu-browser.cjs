const fs=require('fs'),http=require('http'),path=require('path'),assert=require('assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{const root=process.cwd(),server=http.createServer((req,res)=>{const name=req.url.split('?')[0];if(name==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/interview-prep.css"><link rel="stylesheet" href="/interview-portal.css"><link rel="stylesheet" href="/interview-app.css"><body class="ip-portal ip-portal-app"><main id="host"></main></body>');return;}const file=path.join(root,name);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.statusCode=404;res.end();return;}res.setHeader('Content-Type',/\.m?js$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':'application/json');res.end(fs.readFileSync(file));});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);
 await page.evaluate(async()=>{location.hash='#interview-prep?tab=mock';window.__ronparkMockTestApp=true;window.calls=[];const {mountInterviewApp}=await import('/interview-app-ui.js');window.view=await mountInterviewApp(document.querySelector('#host'),{account:{id:'pilot'},request:async action=>{window.calls.push(action);return action==='mock_status'?{ok:true,allowed:true}:{};},aiRequest:async(url,body)=>{window.calls.push({url,...body});if(url==='/api/interview-native'&&body.action==='launch')return {ok:true,code:'a'.repeat(43)};if(body.action==='status')return {ok:true,ready:true};if(body.action==='list')return {ok:true,runs:[],hasMore:false};if(body.action==='questions')return {ok:true,questions:[{id:'q-1',prompt:'기존 질문'}],hasMore:false};if(body.action==='practice_bootstrap')return {ok:true,accountId:'pilot',mode:body.mode,track:'공채',fields:[{id:'coast_guard',label:'공통'}],questions:[{id:'q-1',prompt:'질문',category:body.mode,tracks:['공채'],fieldIds:['coast_guard'],regions:['서해']}]};throw Error('unexpected request');}});});

 assert.equal(await page.locator('[data-app-mock="job"]').count(),1);assert.equal(await page.locator('[data-app-mock="job_questions"]').count(),0);assert.equal(await page.locator('.ip-mock-menu [data-app-mock]').count(),3);
 await page.locator('[data-app-mock="job"]').click();await page.locator('[data-job-action=start]').waitFor();assert.equal(await page.locator('[data-pilot=quick]').count(),0);assert.equal(await page.locator('[data-job-question] option').first().textContent(),'기존 질문');
 await page.locator('[data-app-mock=""]').click();await page.locator('[data-app-mock="personality"]').click();await page.locator('[data-personality-action=start]').waitFor();assert.equal(await page.locator('[data-pilot=quick]').count(),0);
 await page.locator('[data-app-mock=""]').click();await page.locator('[data-app-mock="job"]').click();await page.locator('[data-app-mock="job_questions"]').click();await page.locator('[data-pilot=quick]').waitFor();assert.equal(await page.locator('[data-job-action=start]').count(),0);await page.locator('[data-pilot=catalog]').click();await page.locator('[data-progress]').waitFor();
 await page.locator('[data-app-mock="job"]').click();await page.locator('[data-app-mock=""]').click();await page.locator('[data-app-mock="personality"]').click();await page.locator('[data-app-mock="personality_questions"]').click();await page.locator('[data-pilot=quick]').waitFor();assert.equal(await page.locator('[data-personality-action=start]').count(),0);
 await page.locator('[data-app-mock="personality"]').click();await page.locator('[data-app-mock=""]').click();
 await page.evaluate(()=>{window.nativeCalls=[];window.__ronparkPracticeNative=true;window.webkit={messageHandlers:{interviewPractice:{postMessage:body=>window.nativeCalls.push(body)}}};});
 for(const [index,mode] of ['job','personality'].entries()){
  await page.locator('[data-app-mock="'+mode+'"]').click();await page.waitForFunction(count=>window.nativeCalls.length===count,index*2+1);
  assert.equal(await page.locator('.ip-mock-menu [data-app-mock]').count(),3);assert.equal(await page.locator('[data-native-practice]').count(),0);
  assert.equal(await page.evaluate(()=>new URLSearchParams(location.hash.split('?')[1]).get('mockMode')),'');
  await page.locator('[data-app-mock="'+mode+'"]').click();await page.waitForFunction(count=>window.nativeCalls.length===count,index*2+2);
 }
 assert.deepEqual(await page.evaluate(()=>window.nativeCalls.map(call=>call.mode)),['job','job','personality','personality']);
 await page.evaluate(()=>{window.nativeAI=[];window.__ronparkOpenAIPractice=true;window.webkit.messageHandlers.interviewNative={postMessage:body=>window.nativeAI.push(body)};});
 for(let count=1;count<=2;count++){
  await page.locator('[data-app-mock="ai"]').click();await page.waitForFunction(count=>window.nativeAI.length===count,count);
  assert.equal(await page.locator('.ip-mock-menu [data-app-mock]').count(),3);assert.equal(await page.locator('[data-open]').count(),0);
  assert.equal(await page.evaluate(()=>new URLSearchParams(location.hash.split('?')[1]).get('mockMode')),'');
 }
 assert.deepEqual(await page.evaluate(()=>window.calls.filter(call=>call.url==='/api/interview-native').map(call=>call.action)),['launch','launch']);
 // Released apps expose only job/personality beta, even with test native bridges present.
 for(const mode of ['job','personality','personality_questions','ai']){
  await page.evaluate(async mode=>{window.view.destroy();window.__ronparkMockTestApp=false;location.hash='#interview-prep?tab=mock&mockMode='+mode;const {mountInterviewApp}=await import('/interview-app-ui.js');window.view=await mountInterviewApp(document.querySelector('#host'),{account:{id:'beta-member',accessProduct:'interview_package'},request:async()=>({allowed:false,betaAllowed:true}),aiRequest:async(_url,body)=>({ok:true,accountId:'beta-member',mode:body.mode,track:'공채',fields:[],questions:[{id:'q-beta',prompt:'베타 질문',category:body.mode,fieldIds:[],regions:[]}]})});},mode);
  if(['job','personality'].includes(mode)){await page.locator('[data-practice-action=configured]').waitFor();assert.equal(await page.locator('[data-job-action=start],[data-personality-action=start],[data-pilot]').count(),0);}
  else{assert.equal(await page.locator('.ip-mock-menu [data-app-mock]').count(),2);assert.equal(await page.locator('[data-app-mock="ai"]').count(),0);assert.equal(await page.locator('.ip-app-beta-label').count(),1);}
  assert.equal(await page.evaluate(()=>window.nativeCalls.length),4);assert.equal(await page.evaluate(()=>window.nativeAI.length),2);assert.equal(await page.locator('.ip-mock-extra').count(),0);
 }
 fs.mkdirSync('.tmp/mock-beta-review',{recursive:true});
 for(const width of [320,390,844]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'.tmp/mock-beta-review/menu-'+width+'.png',fullPage:true});}
 assert.equal(errors.length,0,errors.join('\n'));console.log('PASS menu browser: existing test native flows preserved; released apps open job/personality recording beta and reject AI/pilot direct links; 320/390/844px layout verified.');
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
