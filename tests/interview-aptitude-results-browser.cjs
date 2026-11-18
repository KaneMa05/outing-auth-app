'use strict';
// Local database, identities and PDF metadata only; no production requests.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/W11/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {createDb}=require('./helpers/interview-db.cjs'),{createHandler}=require('../api/interview-aptitude');
(async()=>{
 const root=path.resolve(__dirname,'..'),out=path.join(root,'output/aptitude-results');fs.mkdirSync(out,{recursive:true});
 const {db}=await createDb();let browser,server;
 try{
  await db.exec("create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); update ip_settings set enabled=true; insert into ip_members(student_id,track,exam_number,enabled) values('ip-a','공채','a',true),('ip-b','공채','b',true);");
  for(const file of ['20261109053559_interview_aptitude_exams.sql','20261112152643_interview_aptitude_results_on_submission.sql','20261116072310_interview_aptitude_historical_attempts.sql','20261117122611_interview_aptitude_subject_scores.sql','20261118084036_interview_aptitude_answer_reset.sql'])await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8').replace(/\r\n/g,'\n'));
  const invoke=async(action,actor,body={})=>(await db.query('select ip_aptitude_service($1,$2::jsonb,$3::jsonb) result',[action,JSON.stringify(actor),JSON.stringify(body)])).rows[0].result;
  const admin={type:'admin',id:'browser-qa'},id=randomUUID(),answerKey=Array(75).fill(1);
  await invoke('admin_save',admin,{id,revision:0,kind:'half',roundNo:1,title:'하프 1회',state:'open',resultsReleased:false,opensAt:null,closesAt:null,answerKey});
  const roundIds={half1:id};
  for(const [kind,roundNo] of [['half',2],['full',1],['full',2],['full',3]]){
   const extraId=randomUUID();roundIds[kind+roundNo]=extraId;
   await invoke('admin_save',admin,{id:extraId,revision:0,kind,roundNo,title:kind+' '+roundNo+'회',state:'open',resultsReleased:false,opensAt:null,closesAt:null,answerKey:Array(kind==='half'?75:150).fill(1)});
  }
  const file=(await invoke('admin_upload_prepare',admin,{id,revision:1,name:'제출 후 확인하는 해설.pdf',bytes:100})).file;
  await invoke('admin_upload_commit',admin,{id,fileId:file.id,bytes:100,sha256:'a'.repeat(64)});
  const handler=createHandler({invoke,authenticateAdmin:async()=>({id:admin.id}),authenticateWeb:async req=>({id:req.headers['x-qa-owner']||'ip-a'}),authenticateDevice:async()=>null,storage:()=>({signed:async p=>'https://fixture.invalid/object/sign/interview-aptitude/'+p})});
  server=http.createServer(async(req,res)=>{
   try{
    const pathname=new URL(req.url,'http://local').pathname;
    if(pathname==='/api/interview-aptitude')return handler(req,{setHeader:(...a)=>res.setHeader(...a),status(code){res.statusCode=code;return this;},json(value){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));}});
    if(pathname==='/qa'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/interview-prep.css"><main id="host"></main>');}
    const asset=path.resolve(root,'.'+pathname);
    if(!asset.startsWith(root+path.sep)||!fs.existsSync(asset)||!fs.statSync(asset).isFile()){res.statusCode=404;return res.end();}
    res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(asset)]||'application/octet-stream');res.end(fs.readFileSync(asset));
   }catch(error){res.statusCode=500;res.end(JSON.stringify({error:error.message}));}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/qa');
  await page.evaluate(async()=>{const {mountAdmin}=await import('/interview-prep-ui.js?v=20261113-aptitude-results');window.view=await mountAdmin(document.querySelector('#host'),{initialSection:'aptitude',canWrite:true,request:async action=>{if(action==='admin_catalog')return {topics:[],counts:{},enabled:true};throw Error(action);}});});
  await page.locator('[data-ia-action="open"][data-id="'+id+'"]').click();await page.locator('.ia-settings summary').click();
  await page.locator('[name=resultsReleased]').selectOption('true');await page.locator('[name=title]').fill('하프 1회 · 제출 후 결과 공개');
  await page.locator('[data-ia-action="admin-save"]').click();await page.getByText('저장했습니다.',{exact:true}).waitFor();
  await page.locator('.ia-settings summary').click();assert.equal(await page.locator('[name=state]').inputValue(),'open');assert.equal(await page.locator('[name=resultsReleased]').inputValue(),'true');
  for(const width of [1440,390]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(out,'admin-'+width+'.png'),fullPage:true});}
  // Publishing an already open round must not end another student's exam.
  const studentContext=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844},extraHTTPHeaders:{'x-qa-owner':'ip-a'}}),student=await studentContext.newPage();student.on('pageerror',e=>errors.push(e.message));
  await student.goto(base+'/qa');
  await student.evaluate(async()=>{const {mountAptitude}=await import('/client/interview-aptitude.mjs?v=20261113-aptitude-results');window.view=await mountAptitude(document.querySelector('#host'),{accountId:'ip-a'});});
  await student.locator('.ia-menus [data-menu="results"]').click();await student.getByText('아직 제출한 답안이 없습니다.').waitFor();assert.equal(await student.locator('.ia-score,.ia-files').count(),0);
  for(const width of [390,1280]){
   await student.setViewportSize({width,height:900});
   assert.deepEqual(await student.locator('[data-round-select] option').allTextContents(),['1회','2회']);assert.equal(await student.locator('[data-round-select]').inputValue(),roundIds.half1);
   await student.locator('[data-ia-action="kind"][data-kind="full"]').click();await student.waitForFunction(id=>document.querySelector('[data-round-select]')?.value===id,roundIds.full1);
   assert.deepEqual(await student.locator('[data-round-select] option').allTextContents(),['1회','2회','3회']);
   const laterRound=student.waitForResponse(response=>response.url().endsWith('/api/interview-aptitude')&&response.request().postDataJSON()?.id===roundIds.full3);
   await student.locator('[data-round-select]').selectOption(roundIds.full3);await laterRound;assert.equal(await student.locator('[data-round-select]').inputValue(),roundIds.full3);
   await student.locator('[data-ia-action="kind"][data-kind="half"]').click();await student.waitForFunction(id=>document.querySelector('[data-round-select]')?.value===id,roundIds.half1);
   await student.screenshot({path:path.join(out,'round-order-'+width+'.png'),fullPage:true});
  }
  await student.locator('.ia-menus [data-menu="answers"]').click();await student.locator('[data-ia-action="section"]').first().click();await student.locator('[data-answer="0"][data-choice="1"]').click();
  await student.locator('[data-ia-action="save"]').click();await student.getByText('저장 완료',{exact:true}).waitFor();
  const draft=await studentContext.request.post(base+'/api/interview-aptitude',{data:{action:'get',accountId:'ip-a',id}});const draftData=await draft.json();assert.equal(draftData.result,undefined);assert.equal(draftData.correctAnswers,undefined);assert.equal(draftData.files,undefined);
  await student.locator('[data-ia-action="subjects"]').first().click();student.once('dialog',d=>d.accept());await student.locator('[data-ia-action="submit"]').click();await student.getByText('제출 완료',{exact:true}).first().waitFor();
  await student.locator('.ia-menus [data-menu="results"]').click();await student.locator('.ia-score').waitFor();assert.match(await student.locator('.ia-score').innerText(),/1 \/ 75/);await student.getByText(file.original_name,{exact:true}).waitFor();
  await student.getByText('현재 등수',{exact:true}).waitFor();
  for(const width of [390,1280]){await student.setViewportSize({width,height:900});assert.equal(await student.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await student.screenshot({path:path.join(out,'submitted-'+width+'.png'),fullPage:true});}
  await student.locator('[data-ia-action="section"]').first().click();assert.match(await student.locator('.ia-answer-number small').first().innerText(),/정답 1/);
  const current=await invoke('admin_get',admin,{id});assert.equal(current.round.state,'open');assert.equal(current.round.accepting,true);
  const unsubmitted=await invoke('get',{type:'student',id:'ip-b'},{id});for(const key of ['result','correctAnswers','files'])assert.equal(unsubmitted[key],undefined);
  await assert.rejects(invoke('file',{type:'student',id:'ip-b'},{id,fileId:file.id}),/forbidden/);assert.deepEqual(errors,[]);
  // The separate administrator grade page reads the existing report, including private results.
  await invoke('save',{type:'student',id:'ip-b'},{id,revision:0,answers:Array(75).fill(2)});
  await db.exec("insert into ip_members(student_id,track,exam_number,enabled) values('ip-c','공채','c',true)");
  await invoke('submit',{type:'student',id:'ip-a'},{id:roundIds.full3,revision:0,answers:Array(150).fill(1),requestKey:randomUUID()});
  const subjects=['언어이해','언어비판','수열추리','도형추리','문제해결'];
  await page.locator('[data-ia-action="report"]').click();await page.getByRole('heading',{name:'응시·성적 현황',exact:true}).waitFor();
  assert.deepEqual(await page.locator('.ia-table thead th').allTextContents(),['학생','제출 상태',...subjects,'정답 수','정답률','등수']);
  const reportRow=page.locator('.ia-table tbody tr').filter({hasText:'면접학생 A'});
  assert.deepEqual((await reportRow.locator('td').allTextContents()).slice(2,8),['1 / 15','0 / 15','0 / 15','0 / 15','0 / 15','1/75']);
  for(const width of [1440,390,320]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(out,'subject-report-'+width+'.png'),fullPage:true});}
  const gradeReads=[];page.on('request',req=>{if(req.url().endsWith('/api/interview-aptitude'))gradeReads.push(req.postDataJSON()?.action);});
  await page.evaluate(async()=>{window.view.destroy();const {mountAdmin}=await import('/interview-prep-ui.js?v=20261113-aptitude-grades');window.view=await mountAdmin(document.querySelector('#host'),{initialSection:'aptitude_grades',canWrite:false,request:async action=>{if(action==='admin_catalog')return {topics:[],counts:{},enabled:true};throw Error(action);}});});
  await page.locator('[data-ag-round]').selectOption(id);await page.locator('[data-ag-rows] tr').filter({hasText:'면접학생 A'}).waitFor();
  assert.equal(await page.locator('[data-ag-rows] tr').count(),3);
  assert.deepEqual(await page.locator('.ag-table thead th').allTextContents(),['학생','학생 ID','제출 상태',...subjects,'정답 수','정답률','등수','제출 시각 (한국시간)']);
  assert.deepEqual((await page.locator('[data-ag-rows] tr').filter({hasText:'ip-a'}).locator('td').allTextContents()).slice(3,9),['1 / 15','0 / 15','0 / 15','0 / 15','0 / 15','1 / 75']);
  for(const owner of ['ip-b','ip-c'])assert.deepEqual((await page.locator('[data-ag-rows] tr').filter({hasText:owner}).locator('td').allTextContents()).slice(3,8),Array(5).fill('—'));
  assert.match(await page.locator('.ag-summary').innerText(),/전체 인원\s*3명/);assert.match(await page.locator('.ag-summary').innerText(),/제출\s*1명/);
  assert.match(await page.locator('.ag-summary').innerText(),/임시저장\s*1명/);assert.match(await page.locator('.ag-summary').innerText(),/미제출\s*1명/);
  assert.equal(await page.locator('[data-ag-query]').isEnabled(),true,'read-only admins can search');
  await page.locator('[data-ag-query]').fill('ip-a');assert.equal(await page.locator('[data-ag-rows] tr').count(),1);
  assert.match(await page.locator('[data-ag-rows]').innerText(),/1 \/ 75/);
  const csvDownload=page.waitForEvent('download');await page.locator('[data-ag-action="export"]').click();const downloaded=await csvDownload;
  assert.match(downloaded.suggestedFilename(),/적성모의고사_하프_1회_성적\.csv/);
  const exported=fs.readFileSync(await downloaded.path(),'utf8');assert(exported.includes('ip-a'));assert(!exported.includes('ip-b'));assert(exported.startsWith('\uFEFF'));
  assert(exported.includes(subjects.map(label=>'"'+label+' 정답 수"').join(',')));assert(exported.includes('"1","0","0","0","0","1","75"'));
  await page.locator('[data-ag-query]').fill('');await page.locator('[data-ag-state]').selectOption('draft');
  assert.match(await page.locator('[data-ag-rows]').innerText(),/ip-b/);assert(!((await page.locator('[data-ag-rows]').innerText()).includes('0 / 75')));
  await page.locator('[data-ag-state]').selectOption('not_submitted');assert.match(await page.locator('[data-ag-rows]').innerText(),/ip-c/);
  await page.locator('[data-ag-state]').selectOption('all');
  for(const width of [1440,390,320]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(out,'grades-'+width+'.png'),fullPage:true});}
  await page.locator('[data-ag-action="kind"][data-kind="full"]').click();await page.waitForFunction(()=>document.querySelector('[data-ag-round]')?.options.length===3);await page.locator('[data-ag-query]:enabled').waitFor();
  assert.match(await page.locator('.ag-heading').innerText(),/150문항/);
  assert.deepEqual((await page.locator('[data-ag-rows] tr').filter({hasText:'ip-a'}).locator('td').allTextContents()).slice(3,9),['30 / 30','30 / 30','30 / 30','30 / 30','30 / 30','150 / 150']);
  await page.setViewportSize({width:1440,height:900});await page.screenshot({path:path.join(out,'grades-full-subjects-1440.png'),fullPage:true});
  await page.locator('[data-ag-query]').fill('no-match');assert.equal(await page.locator('[data-ag-action="export"]').isDisabled(),true);await page.locator('[data-ag-query]').fill('');
  await page.locator('[data-ag-action="kind"][data-kind="half"]').click();await page.locator('[data-ag-query]:enabled').waitFor();await page.locator('[data-ag-round]').selectOption(id);await page.locator('[data-ag-query]:enabled').waitFor();
  // A failed refresh removes the prior grades and export; retry restores current data.
  let failNextReport=true;
  await page.route('**/api/interview-aptitude',route=>{if(failNextReport&&route.request().postDataJSON()?.action==='admin_report'){failNextReport=false;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,error:'aptitude_unavailable'})});}return route.continue();});
  await page.locator('[data-ag-action="refresh"]').click();await page.locator('[data-ag-message][role="alert"]').waitFor();assert.equal(await page.locator('[data-ag-rows],[data-ag-action="export"]').count(),0);
  await page.unroute('**/api/interview-aptitude');
  await page.locator('[data-ag-action="refresh"]').click();await page.locator('[data-ag-query]:enabled').waitFor();assert.equal(await page.locator('[data-ag-rows] tr').count(),3);
  assert(gradeReads.length>0&&gradeReads.every(action=>['admin_list','admin_report'].includes(action)),'grade management never writes exam or student data');
  assert.equal(await page.locator('[data-ag-action="reset"]').count(),0,'read-only admins have no reset controls');
  // Writable grade management: row-scoped modal, explicit subjects, conflict recovery.
  await page.evaluate(async()=>{window.view.destroy();const {mountAdmin}=await import('/interview-prep-ui.js?v=20261118-aptitude-answer-reset');window.view=await mountAdmin(document.querySelector('#host'),{initialSection:'aptitude_grades',canWrite:true,request:async action=>{if(action==='admin_catalog')return {topics:[],counts:{},enabled:true};throw Error(action);}});});
  await page.locator('[data-ag-query]:enabled').waitFor();
  await page.locator('[data-ag-action="kind"][data-kind="full"]').click();await page.locator('[data-ag-query]:enabled').waitFor();
  assert.equal(await page.locator('[data-ag-round]').inputValue(),roundIds.full3);
  assert.equal((await page.locator('.ag-table thead th').allTextContents()).at(-1),'답안지 관리');
  const resetButton=()=>page.locator('[data-ag-action="reset"][data-student-id="ip-a"]');
  assert.equal(await page.locator('[data-ag-action="reset"][data-student-id="ip-b"]').isDisabled(),true,'no saved answer sheet to reset');
  const beforeReset=(await invoke('get',{type:'student',id:'ip-a'},{id:roundIds.full3})).attempt;
  await resetButton().click();assert.equal(await page.locator('[data-ag-dialog]').evaluate(el=>el.open),true);
  assert.equal(await page.locator('[data-ag-action="reset-confirm"]').isDisabled(),true,'explicit subject selection is required');
  await page.locator('[data-ag-reset-section][value="0"]').check();await page.locator('[data-ag-action="reset-cancel"]').click();
  assert.deepEqual((await invoke('get',{type:'student',id:'ip-a'},{id:roundIds.full3})).attempt,beforeReset);
  await resetButton().click();await page.keyboard.press('Escape');assert.equal(await page.locator('[data-ag-dialog]').count(),0);
  await resetButton().click();await page.locator('[data-ag-reset-section][value="0"]').check();await page.locator('[data-ag-reset-section][value="3"]').check();
  assert.equal(await page.locator('[data-ag-reset-all]').evaluate(el=>el.indeterminate),true);
  assert.match(await page.locator('[data-ag-reset-summary]').innerText(),/언어이해 · 도형추리 · 60문항/);
  for(const width of [1440,390,320]){
   await page.setViewportSize({width,height:900});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   assert.equal(await page.locator('[data-ag-dialog]').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
   await page.screenshot({path:path.join(out,'reset-subjects-'+width+'.png'),fullPage:true});
  }
  await page.locator('[data-ag-action="reset-confirm"]').click();
  await page.locator('[data-ag-message]').filter({hasText:'언어이해 · 도형추리 답안을 초기화했습니다.'}).waitFor();
  const partial=(await invoke('get',{type:'student',id:'ip-a'},{id:roundIds.full3})).attempt;
  assert.equal(partial.state,'draft');assert.equal(partial.revision,beforeReset.revision+1);
  assert.deepEqual(partial.answers,Array.from({length:150},(_,i)=>[0,3].includes(Math.floor(i/30))?0:1));
  assert.equal((await page.locator('[data-ag-rows] tr').filter({hasText:'ip-a'}).locator('td').allTextContents())[2],'임시저장');
  // Old device backups must not resurrect the answers cleared by the administrator.
  await student.evaluate(({roundId,revision})=>localStorage.setItem('interview-aptitude:ip-a:'+roundId,JSON.stringify({answers:Array(150).fill(5),revision})),{roundId:roundIds.full3,revision:beforeReset.revision});
  await student.locator('.ia-menus [data-menu="answers"]').click();await student.locator('[data-ia-action="kind"][data-kind="full"]').click();
  await student.locator('[data-round-select]:enabled').waitFor();await student.locator('[data-round-select]').selectOption(roundIds.full3);await student.locator('[data-round-select]:enabled').waitFor();
  assert.match(await student.locator('.ia-subjects').innerText(),/0\/30 입력/);assert(!((await student.locator('.ia-subjects').innerText()).includes('제출 완료')));
  await student.locator('[data-ia-action="section"]').nth(1).click();assert.equal(await student.locator('[data-answer="30"][data-choice="1"]').getAttribute('aria-pressed'),'true');
  await student.locator('[data-ia-action="subjects"]').first().click();await student.locator('[data-ia-action="section"]').first().click();assert.equal(await student.locator('[data-answer="0"][data-choice="5"]').getAttribute('aria-pressed'),'false');
  // Full reset is also available for drafts, and select-all stays synchronized.
  await resetButton().click();await page.locator('[data-ag-reset-all]').check();assert.equal(await page.locator('[data-ag-reset-section]:checked').count(),5);
  await page.locator('[data-ag-reset-section][value="2"]').uncheck();assert.equal(await page.locator('[data-ag-reset-all]').evaluate(el=>el.indeterminate),true);
  await page.locator('[data-ag-reset-all]').check();await page.locator('[data-ag-action="reset-confirm"]').click();
  await page.locator('[data-ag-message]').filter({hasText:'전체 과목 답안을 초기화했습니다.'}).waitFor();
  const blank=(await invoke('get',{type:'student',id:'ip-a'},{id:roundIds.full3})).attempt;assert.deepEqual(blank.answers,Array(150).fill(0));
  // A student saving after the report was loaded wins; a stale admin cannot clear it.
  await resetButton().click();await page.locator('[data-ag-reset-section][value="0"]').check();
  const newer=await invoke('save',{type:'student',id:'ip-a'},{id:roundIds.full3,revision:blank.revision,answers:Array(150).fill(2)});
  await page.locator('[data-ag-action="reset-confirm"]').click();
  await page.locator('[data-ag-message]').filter({hasText:'답안이 변경되어 초기화하지 않았습니다.'}).waitFor();
  assert.deepEqual((await invoke('get',{type:'student',id:'ip-a'},{id:roundIds.full3})).attempt,newer.attempt);
  // The server can commit before a transport error; never automatically repeat a reset.
  let resetRequests=0;
  await page.route('**/api/interview-aptitude',async route=>{
   if(route.request().postDataJSON()?.action!=='admin_reset_attempt')return route.continue();
   resetRequests++;const response=await route.fetch();assert.equal(response.status(),200);
   return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,error:'aptitude_unavailable'})});
  });
  await resetButton().click();await page.locator('[data-ag-reset-section][value="1"]').check();await page.locator('[data-ag-action="reset-confirm"]').click();
  await page.locator('[data-ag-reset-error]').filter({hasText:'초기화 결과를 확인하지 못했습니다.'}).waitFor();
  assert.equal(await page.locator('[data-ag-action="reset-confirm"]').isDisabled(),true);assert.equal(resetRequests,1);
  await page.locator('[data-ag-action="reset-cancel"]').click();await page.unroute('**/api/interview-aptitude');
  await page.locator('[data-ag-action="refresh"]').click();await page.locator('[data-ag-query]:enabled').waitFor();
  const recovered=(await invoke('get',{type:'student',id:'ip-a'},{id:roundIds.full3})).attempt;
  assert.equal(recovered.revision,newer.attempt.revision+1);assert.deepEqual(recovered.answers,Array.from({length:150},(_,i)=>Math.floor(i/30)===1?0:2));
  await page.setViewportSize({width:1440,height:900});await page.screenshot({path:path.join(out,'reset-completed-1440.png'),fullPage:true});
  await page.evaluate(()=>window.view.destroy());assert.deepEqual(errors,[]);
  console.log('PASS grade reset browser: write permissions, cancel, partial/full selection, mobile layouts, stale backups, concurrent saves, and transport errors.');
  console.log('PASS grade management browser: dedicated read-only admin entry, half/full rounds, submission counts, search/status filters, filtered CSV, refresh recovery, and 320/390/1440px layouts.');
  console.log('PASS browser: half/full default to round 1 with ascending dropdowns and later rounds selectable; open + public saves; submitted results visible; unsubmitted/draft results private; ongoing exams stay open; desktop/mobile layouts fit.');
 }finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
