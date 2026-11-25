'use strict';
// Synthetic local accounts; no production database, sessions or paid AI calls.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/W11/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const root=path.resolve(__dirname,'..'),output=path.join(root,'output/interview-member-termination');fs.mkdirSync(output,{recursive:true});
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://local');
  if(url.pathname==='/qa'){res.setHeader('Content-Type','text/html;charset=utf-8');return res.end('<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/interview-prep.css"><link rel="stylesheet" href="/interview-app.css"><main id="host"></main>');}
  if(url.pathname==='/interview'){res.setHeader('Content-Type','text/html;charset=utf-8');return res.end(fs.readFileSync(path.join(root,'interview.html')));}
  const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep)||!['.js','.mjs','.css'].includes(path.extname(file))||!fs.existsSync(file)){res.statusCode=404;return res.end();}
  res.setHeader('Content-Type',path.extname(file)==='.css'?'text/css':'text/javascript');res.end(fs.readFileSync(file));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const page=await browser.newPage({serviceWorkers:'block',viewport:{width:1280,height:900}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
  await page.goto('http://127.0.0.1:'+server.address().port+'/qa');
  await page.evaluate(async()=>{
   const {mountAdmin}=await import('/interview-prep-ui.js');window.calls=[];window.failSave=false;
   window.roster=Array.from({length:35},(_,i)=>({id:'qa-'+i,name:'검증학생 '+String(i).padStart(2,'0'),track:'공채',exam_number:'A-'+i,access_product:i===34?'aptitude_only':'interview_package',enabled:true,expires_on:'2099-12-31',updated_at:'2026-11-25T00:00:00.000Z',scope:'active',access_revision:0}));
   window.reasons=[{id:'fitness',name:'체력 탈락',active:true,requires_note:false,revision:1},{id:'other',name:'기타',active:true,requires_note:true,revision:1}];window.historyRows=[];
   window.request=async(action,body={})=>{
    calls.push({action,body});
    if(action==='admin_catalog')return {topics:[],counts:{},enabled:true};
    if(action==='admin_applications')return {applications:[],summary:{students:35,pending:0,approved:35,rejected:0}};
    if(action==='admin_enrollment_list'){
     const rows=roster.filter(m=>(!body.search||m.name.includes(body.search)||m.exam_number.includes(body.search))&&(!body.enrollmentStatus||(body.enrollmentStatus==='ended'?m.scope!=='active':m.scope==='active'))&&(!body.reasonId||m.reason_id===body.reasonId)&&(!body.terminationScope||m.scope===body.terminationScope));
     return {members:structuredClone(rows.slice((body.page||0)*30,(body.page||0)*30+30)),total:rows.length,reasons:structuredClone(reasons),summary:{students:roster.filter(m=>m.scope==='active').length,pending:0,approved:35,rejected:0}};
    }
    if(action==='admin_enrollment_reason_save'){
     let reason=reasons.find(r=>r.id===body.id);if(reason){Object.assign(reason,{name:body.name,active:body.active,requires_note:body.requiresNote,revision:reason.revision+1});}else{reason={id:'custom',name:body.name,active:body.active,requires_note:body.requiresNote,revision:1};reasons.push(reason);}return {ok:true,reason};
    }
    if(action==='admin_enrollment_history')return {history:historyRows.filter(h=>h.student_id===body.targetStudentId)};
    if(action==='admin_enrollment_change'){
     if(failSave)throw Error('interview_unavailable');
     return {ok:true,results:body.items.map(item=>{
      const m=roster.find(m=>m.id===item.id);if(m.access_revision!==item.revision)return {id:m.id,name:m.name,ok:false,error:'revision_conflict'};
      const reason=reasons.find(r=>r.id===body.reasonId);Object.assign(m,{scope:body.scope,access_revision:m.access_revision+1,reason_id:reason?.id,reason_name:reason?.name,note:body.note,ended_at:body.operation==='end'?'2026-11-25T01:00:00Z':null,ended_by:'검증 관리자'});
      historyRows.unshift({student_id:m.id,action:body.operation,scope:body.scope,reason_name:reason?.name,note:body.note,created_at:'2026-11-25T01:00:00Z',actor_id:'검증 관리자'});return {id:m.id,ok:true};
     })};
    }
    throw Error('Unexpected action: '+action);
   };
   window.view=await mountAdmin(document.querySelector('#host'),{initialSection:'applications',request,canWrite:true});
  });
  await page.getByRole('heading',{name:'수강생·이용 관리',exact:true}).waitFor();
  await page.getByRole('button',{name:'등록 수강생·이용 종료',exact:true}).click();
  await page.locator('[data-enrollment-select="qa-0"]').check();
  await page.locator('[data-enrollment=next]').click();await page.locator('[data-enrollment-select="qa-30"]').check();
  assert((await page.locator('[data-enrollment-selection]').innerText()).includes('선택 2명'));
  await page.getByRole('button',{name:'선택 학생 이용 종료',exact:true}).click();
  const end=page.locator('[data-enrollment-end]');assert.equal(await end.locator('[name=reasonId]').inputValue(),'');
  await end.locator('[name=reasonId]').selectOption('other');assert.equal(await end.locator('[name=note]').getAttribute('required'),'');
  await end.locator('[name=reasonId]').selectOption('fitness');await end.locator('[name=note]').fill('관리자 비고 검증');
  await page.evaluate(()=>{failSave=true;});await end.getByRole('button',{name:'종료 내용 확인'}).click();
  await page.getByText('처리하지 못했습니다. 연결을 확인한 후 다시 시도해주세요.',{exact:true}).waitFor();assert.equal(await end.locator('[name=note]').inputValue(),'관리자 비고 검증');
  await page.evaluate(()=>{failSave=false;});await end.getByRole('button',{name:'종료 내용 확인'}).click();
  await page.waitForFunction(()=>roster[0].scope==='interview'&&roster[30].scope==='interview');
  await page.getByText('처리 완료 2명 · 제외/실패 0명',{exact:true}).waitFor();
  await page.locator('[data-enrollment-filter] [name=enrollmentStatus]').selectOption('ended');await page.locator('[data-enrollment-filter]').getByRole('button',{name:'검색',exact:true}).click();
  await page.getByText('검색 결과 2명',{exact:true}).waitFor();
  await page.screenshot({path:path.join(output,'admin-ended-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.equal(await page.locator('[data-enrollment-filter] label').evaluateAll(labels=>labels.every(label=>label.getBoundingClientRect().width>300)),true,'Mobile filters use readable full-width rows');
  await page.screenshot({path:path.join(output,'admin-ended-mobile.png'),fullPage:true});
  await page.locator('[data-enrollment=restore][data-id="qa-0"]').click();await page.locator('[data-enrollment-restore]').getByRole('button',{name:'복구 확인'}).click();await page.waitForFunction(()=>roster[0].scope==='active');
  await page.locator('[data-enrollment=history][data-id="qa-30"]').click();await page.getByRole('heading',{name:'이용 종료·복구 이력'}).waitFor();await page.locator('[data-enrollment-editor] [data-enrollment=close]').click();
  await page.getByRole('button',{name:'종료 사유 관리',exact:true}).click();
  const reasonForm=page.locator('[data-enrollment-reason]:not([data-id])');await reasonForm.locator('[name=name]').fill('서류 탈락');await reasonForm.getByRole('button',{name:'사유 추가'}).click();await page.waitForFunction(()=>reasons.some(r=>r.name==='서류 탈락'));
  await page.evaluate(async()=>{view.destroy();const {mountEnrollment}=await import('/client/interview-enrollment.mjs');view=mountEnrollment(document.querySelector('#host'),{request,canWrite:false});await view.ready;});
  assert.equal(await page.locator('[data-enrollment=end]').first().isDisabled(),true);assert.equal(await page.locator('[data-enrollment=reasons]').isDisabled(),true);
  await page.evaluate(async()=>{
   view.destroy();const {mountInterviewApp}=await import('/interview-app-ui.js');window.scope='interview';window.studentCalls=[];
   window.studentRequest=async action=>{studentCalls.push(action);if(action==='status')return {terminationScope:scope,appEnabled:scope!=='app',enabled:scope==='active',endedAt:scope==='active'?null:'2026-11-25T01:00:00Z'};if(action==='mock_status')return {allowed:false};if(action==='bootstrap')return {topics:[],notes:[],member:{}};if(action==='writing_list')return {writings:[]};if(action==='life_get')return {profile:{content:{}}};throw Error(action);};
   view=await mountInterviewApp(document.querySelector('#host'),{request:studentRequest,aptitudeRequest:async()=>({rounds:[]}),account:{id:'qa-student',accessProduct:'interview_package',enrollmentAccess:await studentRequest('status')},onLogout:async()=>{window.didLogout=true;}});
  });
  await page.getByRole('heading',{name:'면접반 이용이 종료되었습니다.',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>studentCalls.includes('bootstrap')),false);
  await page.screenshot({path:path.join(output,'student-interview-ended.png'),fullPage:true});
  await page.getByRole('button',{name:'적성 모의고사로 이동',exact:true}).click();await page.waitForSelector('[data-enrollment-aptitude]',{state:'detached'});
  await page.evaluate(()=>{scope='app';window.dispatchEvent(new Event('focus'));});await page.getByRole('heading',{name:'이용이 종료되었습니다.',exact:true}).waitFor();
  assert.equal(await page.locator('[data-enrollment-aptitude]').count(),0);await page.screenshot({path:path.join(output,'student-app-ended.png'),fullPage:true});
  await page.getByRole('button',{name:'로그아웃',exact:true}).click();assert.equal(await page.evaluate(()=>didLogout),true);
  await page.evaluate(async()=>{scope='active';window.dispatchEvent(new Event('focus'));});await page.getByRole('heading',{name:'나의 면접 준비',exact:true}).waitFor();
  await page.evaluate(async()=>{view.destroy();const {mountWorkspace}=await import('/interview-workspace.js');scope='interview';studentCalls=[];view=await mountWorkspace(document.querySelector('#host'),{request:studentRequest,account:{id:'qa-student',accessProduct:'interview_package',enrollmentAccess:await studentRequest('status')},initialPage:'my',onLogout:async()=>{}});});
  await page.getByRole('heading',{name:'면접반 이용이 종료되었습니다.',exact:true}).waitFor();assert.equal(await page.evaluate(()=>studentCalls.includes('bootstrap')),false);
  await page.setViewportSize({width:1280,height:900});await page.screenshot({path:path.join(output,'student-workspace-ended.png'),fullPage:true});await page.evaluate(()=>view.destroy());
  let portalScope='app';const portalCalls=[];
  await page.route('**/api/interview-auth?action=session',route=>route.fulfill({json:{ok:true,enabled:true,authenticated:true,account:{ownerId:'portal-student',name:'종료 수강생'},member:{enabled:true,access_product:'interview_package'},available:portalScope!=='app',access:{terminationScope:portalScope,appEnabled:portalScope!=='app',enabled:false,accessProduct:'interview_package',endedAt:'2026-11-25T01:00:00Z'}}}));
  await page.route('**/api/interview-prep',async route=>{const action=route.request().postDataJSON().action;portalCalls.push(action);await route.fulfill({json:action==='mock_status'?{ok:true,allowed:false}:{ok:true,terminationScope:portalScope,appEnabled:portalScope!=='app',enabled:false,accessProduct:'interview_package',endedAt:'2026-11-25T01:00:00Z'}});});
  await page.goto('http://127.0.0.1:'+server.address().port+'/interview?app=1');await page.getByRole('heading',{name:'이용이 종료되었습니다.',exact:true}).waitFor();assert.equal(await page.locator('[data-application-form]').count(),0);
  portalScope='interview';await page.reload();await page.getByRole('heading',{name:'면접반 이용이 종료되었습니다.',exact:true}).waitFor();assert.equal(await page.locator('[data-enrollment-aptitude]').count(),1);assert.equal(portalCalls.includes('bootstrap'),false);
  assert.deepEqual(errors,[]);
  console.log('PASS browser: new management location, cross-page bulk selection, required reasons/notes, failed-save recovery, end/filter/restore/history/reasons, read-only controls, mobile layout, student interview/app restrictions, aptitude access, logout and restoration.');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
