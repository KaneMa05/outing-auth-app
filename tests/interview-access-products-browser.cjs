'use strict';
// Local fixtures only; no production sessions, database or purchase requests.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/W11/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const root=path.resolve(__dirname,'..'),output=path.join(root,'output/interview-products');fs.mkdirSync(output,{recursive:true});
 let state={ok:true,enabled:true,authenticated:true,available:false,account:{ownerId:'unit-qa',name:'단과 수강생'}},requests=[];
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://local');
  if(url.pathname.startsWith('/api/')){
   res.setHeader('Content-Type','application/json');
   if(req.method==='GET')return res.end(JSON.stringify(state));
   let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);requests.push({url:url.pathname,body});
   if(body.action==='apply'){
    state.application={id:'application-qa',name:body.name,track:body.track,exam_number:body.examNumber,access_product:body.accessProduct,status:'pending',revision:1};
    return res.end(JSON.stringify({ok:true,application:state.application}));
   }
   if(body.action==='logout'){state={ok:true,enabled:true,authenticated:false};return res.end('{"ok":true}');}
   if(url.pathname==='/api/interview-aptitude')return res.end(JSON.stringify({ok:true,rounds:[],studentId:'unit-qa'}));
   if(body.action==='mock_status')return res.end(JSON.stringify({ok:true,allowed:false,betaAllowed:['interview_package','interview_only'].includes(state.member?.access_product)}));
   if(body.action==='home')return res.end(JSON.stringify({ok:true,member:state.member,notices:[{title:'인적성 수강 안내',body:'적성 모의고사 답안을 입력해주세요.'}]}));
   if(body.action==='practice_bootstrap')return res.end(JSON.stringify({ok:true,accountId:state.account.ownerId,mode:body.mode,track:'공채',fields:[],questions:require('../lib/interview-test-question-scope.json').questions.filter(q=>q.category===body.mode).map(q=>({...q,tracks:['공채'],fieldIds:[],regions:[]}))}));
   if(body.action==='life_get')return res.end(JSON.stringify({ok:true,profile:{content:{experiences:[{age:'23',title:'가상 경험 확인',content:'가상 환경에서 의견을 조율한 경험입니다.',appeal:'경청을 배웠습니다.'}]}}}));
   if(body.action==='diagnosis_get')return res.end(JSON.stringify({ok:true,answers:[]}));
   if(['bootstrap','writing_list'].includes(body.action))return res.end(JSON.stringify({ok:true,member:{...state.member,track:'공채',exam_number:'QA'},notes:[],topics:[],writings:[]}));
   res.statusCode=403;return res.end('{"ok":false,"error":"forbidden"}');
  }
  if(url.pathname==='/qa-admin'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end('<link rel="stylesheet" href="/interview-prep.css"><main id="host"></main>');}
  const file=path.resolve(root,'.'+(url.pathname==='/interview'?'/interview.html':url.pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()||!['.html','.css','.js','.mjs','.png','.svg','.woff','.woff2','.webmanifest'].includes(path.extname(file))){res.statusCode=404;return res.end();}
  res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}}),page=await context.newPage(),base='http://127.0.0.1:'+server.address().port,errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/interview?app=1');
  assert.deepEqual(await page.locator('[name=accessProduct] option').evaluateAll(options=>options.map(o=>[o.value,o.textContent])),[['interview_package','면접 패키지'],['interview_only','면접 단과'],['aptitude_only','인적성 단과']]);
  await page.locator('[name=accessProduct]').selectOption('aptitude_only');
  await page.locator('[name=name]').fill('단과 수강생');await page.locator('[name=examNumber]').fill('QA-001');
  await page.locator('#app-startup').waitFor({state:'hidden'});
  await page.screenshot({path:path.join(output,'signup-mobile.png'),fullPage:true});
  await page.getByRole('button',{name:'수강 등록 신청',exact:true}).click();
  await page.getByText('수강 신청을 확인하고 있습니다.').waitFor();
  assert.equal(requests.find(r=>r.body.action==='apply').body.accessProduct,'aptitude_only');
  assert((await page.locator('.ip-portal-status').innerText()).includes('인적성 단과'));
  await page.screenshot({path:path.join(output,'pending-mobile.png'),fullPage:true});
  await page.getByText('신청 정보 수정',{exact:true}).click();
  await page.locator('[name=accessProduct]').selectOption('interview_only');
  await page.getByRole('button',{name:'신청 정보 수정·다시 제출',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.ip-portal-status')?.textContent.includes('면접 단과 ·'));
  assert.equal(requests.findLast(r=>r.body.action==='apply').body.accessProduct,'interview_only');
  await page.getByText('신청 정보 수정',{exact:true}).click();assert.equal(await page.locator('[name=accessProduct]').inputValue(),'interview_only');
  await page.screenshot({path:path.join(output,'interview-only-signup-mobile.png'),fullPage:true});
  state={...state,available:true,member:{enabled:true,access_product:'aptitude_only',expires_on:'2099-12-31'}};
  for(const width of [390,1280]){
   await page.setViewportSize({width,height:844});requests=[];
   await page.goto(base+'/interview'+(width===390?'?app=1':''));
   await page.getByRole('heading',{name:'나의 적성 모의고사',exact:true}).waitFor();
   await page.getByRole('heading',{name:'인적성 수강 안내',exact:true}).waitFor();
   assert.equal(await page.locator('[data-app-notice=preassignments]').count(),0);
   assert.equal(requests.some(r=>['bootstrap','life_get','writing_list'].includes(r.body.action)),false);
   await page.screenshot({path:path.join(output,'aptitude-home-'+width+'.png'),fullPage:true});
   await page.locator('.ip-app-footer [data-app-tab=aptitude]').click();
   await page.locator('[data-timer-clock]').waitFor();
   assert.equal(await page.locator('.ip-app-header h1').innerText(),'적성 모의고사');
   assert.equal(await page.locator('.ip-app-footer [data-app-tab]').count(),6);
   for(const tab of ['db','writing','mock','my']){
    await page.locator('.ip-app-footer [data-app-tab="'+tab+'"]').click();
    await page.getByRole('heading',{name:'면접 패키지 또는 면접 단과로 등록 후 이용할 수 있습니다',exact:true}).waitFor();
    assert.equal(await page.locator('.ip-app-footer [aria-current=page]').getAttribute('data-app-tab'),tab);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   }
   assert.equal(requests.filter(r=>r.url==='/api/interview-prep'&&!['mock_status','home','status'].includes(r.body.action)).length,0,'Home and blocked tabs must not load interview data');
   await page.screenshot({path:path.join(output,'package-required-'+width+'.png'),fullPage:true});
   await page.getByRole('button',{name:'적성 모의고사로 이동',exact:true}).click();await page.locator('[data-timer-clock]').waitFor();
   await page.locator('.ip-app-footer [data-app-tab=db]').click();await page.reload();
   await page.getByRole('heading',{name:'면접 패키지 또는 면접 단과로 등록 후 이용할 수 있습니다',exact:true}).waitFor();
  }
  await page.locator('.ip-app-header [data-app-logout]').click();await page.locator('[data-application-form]').waitFor({state:'detached'});
  assert(requests.some(r=>r.body.action==='logout'));
  // Administrator can see the requested product and change an existing member.
  await page.goto(base+'/qa-admin');
  await page.evaluate(async()=>{
   const {mountAdmin}=await import('/interview-prep-ui.js');
   const request=async(action,body)=>{
    if(action==='admin_catalog')return {topics:[],counts:{},enabled:true};
    if(action==='admin_applications')return {applications:[{id:'qa',name:'단과 신청자',track:'공채',exam_number:'QA',access_product:'aptitude_only',status:'pending',revision:1,created_at:new Date().toISOString()}]};
    if(action==='admin_members')return {members:[{id:'qa',name:'단과 수강생',track:'공채',exam_number:'QA',enabled:true,notes:[],access_product:'aptitude_only'}]};
    if(action==='admin_member_save'){window.savedProduct=body.accessProduct;return {ok:true};}
    throw Error(action);
   };
   window.adminView=await mountAdmin(document.querySelector('#host'),{initialSection:'applications',request,canWrite:true});
  });
  await page.locator('[data-ip=application-edit]').click();assert((await page.locator('[data-editor]').innerText()).includes('인적성 단과'));
  await page.evaluate(()=>adminView.openSection('members'));
  await page.locator('[data-ip=member-edit]').click();assert.equal(await page.locator('[name=accessProduct]').inputValue(),'aptitude_only');
  await page.locator('[name=accessProduct]').selectOption('interview_only');await page.locator('[data-member-form] [data-write]').click();
  await page.waitForFunction(()=>window.savedProduct==='interview_only');
  state={ok:true,enabled:true,authenticated:true,available:true,account:{ownerId:'interview-only-qa',name:'면접 단과 수강생'},member:{enabled:true,access_product:'interview_only'}};
  for(const width of [390,1280]){
   await page.setViewportSize({width,height:844});requests=[];
   await page.goto(base+'/interview?app=1#interview-prep?tab=aptitude');
   await page.locator('.ip-app-stats').waitFor();
   assert.equal(await page.locator('.ip-app-header h1').innerText(),'홈');
   assert.equal(await page.locator('.ip-app-footer [data-app-tab=aptitude]').count(),0);
   assert.equal(await page.locator('.ip-app-footer [data-app-tab]').count(),5);
   assert.equal(requests.some(r=>r.url==='/api/interview-aptitude'),false);
   await page.locator('.ip-app-footer [data-app-tab=my]').click();await page.locator('[data-my-export-open]').waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.screenshot({path:path.join(output,'interview-only-'+width+'.png'),fullPage:true});
   await page.locator('.ip-app-footer [data-app-tab=mock]').click();await page.locator('[data-app-mock=job]').click();
   await page.locator('[data-practice-screen=home]').waitFor();assert.equal(await page.getByRole('button',{name:'연습 시작',exact:true}).isEnabled(),true);
   await page.screenshot({path:path.join(output,'interview-only-mock-beta-'+width+'.png'),fullPage:true});
  }
  // The desktop workspace also omits aptitude, including an old direct entry.
  await page.goto(base+'/qa-admin');requests=[];
  await page.evaluate(async()=>{
   const {mountWorkspace}=await import('/interview-workspace.js');
   await mountWorkspace(document.querySelector('#host'),{account:{accessProduct:'interview_only'},initialPage:'my',request:async(action,payload={})=>(await fetch('/api/interview-prep',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...payload})})).json()});
  });
  await page.locator('[data-my-export-open]').waitFor();assert.equal(await page.locator('[data-workspace-page=aptitude]').count(),0);
  assert.equal(requests.some(r=>r.url==='/api/interview-aptitude'),false);
  state={ok:true,enabled:true,authenticated:true,available:true,account:{ownerId:'package-qa',name:'패키지 수강생'},member:{enabled:true,access_product:'interview_package'}};
  for(const app of [true,false]){
   requests=[];
   if(app)await page.goto(base+'/interview?app=1#interview-prep?tab=my');
   else{
    await page.goto(base+'/qa-admin');
    await page.evaluate(async()=>{
     const {mountWorkspace}=await import('/interview-workspace.js');
     await mountWorkspace(document.querySelector('#host'),{initialPage:'my',request:async(action,payload={})=>(await fetch('/api/interview-prep',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...payload})})).json()});
    });
   }
   await page.locator('[data-my-export-open]').waitFor();assert.equal(await page.locator('[data-my-guide]').count(),5);
   assert.equal(requests.filter(r=>['life_get','diagnosis_get'].includes(r.body.action)).length,0);
   await page.locator('[data-my-export-open]').click();await page.locator('[data-my-export-preview]').waitFor({state:'visible'});
   await page.waitForFunction(()=>document.querySelector('[data-my-export-text]').value.includes('가상 경험 확인'));
   assert.equal(requests.filter(r=>['life_get','diagnosis_get'].includes(r.body.action)).length,2);
  }
  assert.deepEqual(errors,[]);
  console.log('PASS browser: all three signup courses, interview-only resubmit/persistence, mobile/desktop interview access without aptitude requests, administrator selection, existing aptitude/package access and layout; screenshots in output/interview-products.');
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
