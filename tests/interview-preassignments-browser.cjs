const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {start}=require('../scripts/preassignment-preview.cjs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/W11/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const server=await start({diagnosisProvider:async s=>({summary:'브라우저 테스트용 진단 결과',criteria:s.rubric.criteria.map((c,index)=>({index,state:'보완',quote:s.answer,reason:'테스트용 근거 설명',nextQuestion:c[2]}))})});let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page=await browser.newPage({viewport:{width:1280,height:950}}),errors=[],submissionRequests=[];page.on('request',request=>{if(request.method()==='POST'&&request.url().endsWith('/api/interview-preassignments')&&request.postDataJSON()?.action==='submit')submissionRequests.push(request.postDataJSON());});page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept());
  const shot=async name=>{fs.mkdirSync('.tmp/preassignments',{recursive:true});await page.screenshot({path:'.tmp/preassignments/'+name+'.png',fullPage:true});};
  await page.goto(server.origin+'/#interview-prep?tab=preassignments');await page.waitForFunction(()=>window.ready);
  await page.getByRole('heading',{name:'핵심 25제 작성하기',exact:true}).last().waitFor();await page.locator('[data-unit="core-25"]').waitFor();assert.equal(await page.locator('[data-unit^="core-"]').count(),25);assert.equal(await page.locator('[data-unit="other"]').count(),0);
  assert.equal(await page.locator('.ip-app-footer button').count(),5);assert.equal(await page.locator('[data-app-tab=preassignments],[data-workspace-page=preassignments]').count(),0);assert.equal(await page.getByRole('button',{name:/핵심 30제/}).count(),0);assert.doesNotMatch(await page.locator('.pa-root').innerText(),/교사 확인|보완 요청|확인 대기/);await shot('student-desktop');
  for(let i=1;i<=25;i++){
   const id='core-'+String(i).padStart(2,'0');await page.locator(`[data-unit="${id}"]`).click();await page.locator('[data-summary]:not([hidden])').waitFor();
   assert.equal(await page.locator('[data-pa-controls] button').first().innerText(),'요약서 접기');
   assert.equal(await page.locator('[data-pa=summary]').getAttribute('aria-expanded'),'true');
   assert.match(await page.locator('.pa-handout-kicker').innerText(),new RegExp('핵심인성 '+i+'번'));
   assert.equal(await page.locator('[data-summary] iframe').count(),0);assert.equal(await page.locator('.pa-handout-page img').count(),2);await page.waitForFunction(()=>[...document.querySelectorAll('.pa-handout-page img')].every(img=>img.complete&&img.naturalWidth>1000));assert.match(await page.locator('.pa-handout-page img').first().getAttribute('src'),new RegExp(id+'-'));assert.equal(await page.locator('.pa-handout-page').first().getAttribute('target'),'_blank');
   assert.doesNotMatch(await page.locator('[data-summary]').textContent(),/(영상|강의)\s*근거/);
   const cleanPages=JSON.parse(fs.readFileSync('interview-core25-summaries.js','utf8').split('export const summaryPages=')[1].trim().replace(/;$/,''));
   assert((await page.locator('.pa-handout-page img').first().getAttribute('src')).endsWith(cleanPages[id][0].src));
   if(i===1)await shot('core25-summary-desktop');
   await page.getByRole('button',{name:'요약서 닫기',exact:true}).click();assert.equal(await page.locator('[data-pa=summary]').getAttribute('aria-expanded'),'false');
   await page.getByRole('button',{name:'과제 목록',exact:true}).click();
  }
  await page.locator('[data-unit="core-25"]').click();await page.locator('[data-field=f1]').fill('요약서를 열어도 유지할 답변');
  await page.getByRole('button',{name:'요약서 접기',exact:true}).click();
  await page.getByRole('button',{name:'요약서 보기',exact:true}).click();await page.locator('[data-summary]:not([hidden])').waitFor();assert.equal(await page.locator('[data-field=f1]').inputValue(),'요약서를 열어도 유지할 답변');
  await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));await shot('core25-summary-mobile');
  await page.getByRole('button',{name:'요약서 닫기',exact:true}).click();assert.equal(await page.locator('[data-field=f1]').inputValue(),'요약서를 열어도 유지할 답변');await page.setViewportSize({width:1280,height:950});
  await page.locator('[data-field="f1"]').fill('팀원과 의견이 다르면 어떻게 하겠습니까?');
  await page.getByRole('button',{name:'임시저장',exact:true}).click();await page.getByText('임시저장했습니다.',{exact:false}).waitFor();
  assert.equal(await page.locator('[data-summary]').isHidden(),true,'saving preserves manually collapsed summary');
  await page.request.post(server.origin+'/qa-fail-next',{data:{}});
  await page.locator('[data-field="f1"]').fill('실패 시에도 유지해야 할 학생 입력');await page.getByRole('button',{name:'임시저장',exact:true}).click();await page.getByText('처리하지 못했습니다.',{exact:false}).waitFor();assert.equal(await page.locator('[data-field="f1"]').inputValue(),'실패 시에도 유지해야 할 학생 입력');
  await page.getByRole('button',{name:'임시저장',exact:true}).click();await page.getByText('임시저장했습니다.',{exact:false}).waitFor();
  assert.equal(await page.locator('textarea').count(),1);assert.equal(await page.locator('input[type=file]').count(),0);
  await page.locator('[data-field=f1]').fill('실패 시에도 유지해야 할 학생 입력 · 진단 전 수정');await page.getByRole('button',{name:'내 답변 진단하기',exact:true}).click();await page.getByRole('heading',{name:'내 답변 진단 결과',exact:true}).waitFor();
  const saved=await server.call('detail',{type:'student',id:'ip-a'},{unitId:'core-25'});assert.equal(saved.latest,null);assert.equal((await server.call('diagnosis_get',{type:'student',id:'ip-a'},{unitId:'core-25'})).diagnosis.status,'completed');assert.equal(saved.draft.fields.f1,'실패 시에도 유지해야 할 학생 입력 · 진단 전 수정');
  assert.equal(await page.locator('[data-feedback],[data-pa=approve],[data-pa=revision]').count(),0);await shot('diagnosis-completed');await page.getByRole('button',{name:'과제 목록',exact:true}).click();await page.locator('[data-unit=core-25]').click();await page.getByRole('heading',{name:'내 답변 진단 결과',exact:true}).waitFor();assert.equal(await page.locator('[data-diagnosis] article').count(),4);

  const submit=page.getByRole('button',{name:'제출하기',exact:true});assert.equal(await submit.isDisabled(),true);
  await submit.evaluate(button=>button.click());assert.equal((await server.call('detail',{type:'student',id:'ip-a'},{unitId:'core-25'})).latest,null);
  // Even a re-enabled DOM control cannot send a submission through this student screen.
  await submit.evaluate(button=>button.disabled=false);await submit.click();await page.getByText('핵심인성 답변의 교사 제출은 현재 이용할 수 없습니다. 임시저장과 답변 진단은 계속 이용할 수 있습니다.',{exact:true}).first().waitFor();assert.deepEqual(submissionRequests,[]);await submit.evaluate(button=>button.disabled=true);
  await shot('submit-disabled-student');
  await page.locator('.pa-card').filter({has:page.locator('[data-field=f1]')}).screenshot({path:'.tmp/preassignments/submission-disabled-desktop.png'});
  // Seed a historical submission directly in the local fixture, for existing history/admin coverage.
  await server.call('submit',{type:'student',id:'ip-a'},{unitIds:['core-25'],revisions:{'core-25':saved.draft.revision},fields:saved.draft.fields,requestId:require('node:crypto').randomUUID()});await page.goto(server.origin+'/admin');await page.waitForFunction(()=>window.ready);
  // Inspect the shared core component's admin mode independently of the newer assignment-management menu.
  await page.evaluate(async()=>{
   window.controller.destroy();const {mountPreassignments}=await import('/interview-preassignments.js');
   window.controller=await mountPreassignments(document.querySelector('#app'),{admin:true,request:async(action,payload={})=>{const response=await fetch('/api/interview-preassignments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,action})});const data=await response.json();if(!response.ok||!data.ok)throw Object.assign(Error(data.error),{code:data.error});return data;}});
  });
  await page.getByText('제출 운영 설정',{exact:true}).click();await page.locator('[data-setting=dueAt]').fill('2026-11-09T23:59');await page.locator('[data-setting=revisionDueAt]').fill('2026-11-09T23:59');await page.getByRole('button',{name:'운영 설정 저장',exact:true}).click();await page.getByText('운영 설정을 저장했습니다.',{exact:true}).waitFor();
  const cfg=(await server.call('admin_list',{type:'admin',id:'qa'},{})).settings;assert.equal(Date.parse(cfg.due_at),Date.parse('2026-11-10T00:00:00+09:00'));
  await page.getByText('제출 운영 설정',{exact:true}).click();assert.equal(await page.locator('[data-setting=dueAt]').inputValue(),'2026-11-09T23:59');
  await page.getByRole('button',{name:'질문별 진단 지침',exact:true}).click();await page.locator('[data-pa=guidanceOpen]').first().waitFor();assert.equal(await page.locator('[data-pa=guidanceOpen]').count(),26);await page.locator('[data-pa=guidanceOpen][data-unit=core-01]').click();
  const instruction='질문의 의도와 본인의 구체적인 행동을 확인한다. <img src=x onerror=alert(1)>';
  await page.locator('[data-guidance]').fill(instruction);await page.getByRole('button',{name:'지침 저장',exact:true}).click();await page.getByText('진단 지침을 저장했습니다.',{exact:true}).waitFor();
  await page.locator('[data-guidance-select]').selectOption('core-02');await page.getByRole('heading',{name:'핵심인성 2번 · 진단 지침',exact:true}).waitFor();assert.match(await page.locator('[data-guidance]').inputValue(),/공동 목표/);await page.locator('[data-guidance-select]').selectOption('core-01');await page.getByRole('heading',{name:'핵심인성 1번 · 진단 지침',exact:true}).waitFor();assert.equal(await page.locator('[data-guidance]').inputValue(),instruction);
  await page.locator('[data-guidance]').fill(instruction+' 두 번째 수정');await page.request.post(server.origin+'/qa-fail-next',{data:{}});await page.getByRole('button',{name:'지침 저장',exact:true}).click();await page.getByText('처리하지 못했습니다.',{exact:false}).waitFor();assert.equal(await page.locator('[data-guidance]').inputValue(),instruction+' 두 번째 수정');
  await page.getByRole('button',{name:'지침 저장',exact:true}).click();await page.getByText('진단 지침을 저장했습니다.',{exact:true}).waitFor();await page.getByRole('button',{name:'수정 이력 불러오기',exact:true}).click();await page.locator('[data-guidance-history] article').first().waitFor();assert.equal(await page.locator('[data-guidance-history] article').count(),3);assert.equal(await page.locator('[data-guidance-history] img').count(),0);await shot('admin-question-guidance');
  await page.getByRole('button',{name:'지침 목록',exact:true}).click();await page.getByRole('button',{name:'제출 현황으로',exact:true}).click();await page.locator('[data-student=ip-a]').click();await page.locator('[data-unit-select]').selectOption('core-25');assert.equal(await page.locator('[data-feedback],[data-pa=approve],[data-pa=revision]').count(),0);assert.equal(await page.getByRole('button',{name:'내 답변 진단하기',exact:true}).count(),0);
  await page.goto(server.origin);await page.waitForFunction(()=>window.ready);await page.locator('.ip-app-footer [data-app-tab=writing]').click();await page.locator('[data-workspace-page=core]').click();await page.locator('[data-unit="core-25"]').click();await page.locator('[data-field="f1"]').fill('제가 직접 의견을 정리해 회의를 진행했고 팀원 모두가 역할에 동의했습니다.');assert.equal(await page.getByRole('button',{name:'수정 후 다시 제출',exact:true}).isDisabled(),true);await page.getByRole('button',{name:'임시저장',exact:true}).click();await page.getByText('임시저장했습니다.',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'수정 후 다시 제출',exact:true}).isDisabled(),true);const revised=await server.call('detail',{type:'student',id:'ip-a'},{unitId:'core-25'});assert.equal(revised.latest.round,1);assert.equal(revised.draft.fields.f1,'제가 직접 의견을 정리해 회의를 진행했고 팀원 모두가 역할에 동의했습니다.');
  await page.getByRole('button',{name:'이력 불러오기',exact:true}).click();await page.locator('[data-history] article').first().waitFor();assert.equal(await page.locator('[data-history] article').count(),1);assert.match(await page.locator('[data-history]').innerText(),/실패 시에도 유지해야 할 학생 입력/);
  await page.goto(server.origin);await page.waitForFunction(()=>window.ready);await page.locator('.ip-app-footer [data-app-tab=writing]').click();await page.locator('[data-workspace-page=core]').click();await page.locator('[data-unit="core-25"] .submitted').waitFor();assert.match(await page.locator('.pa-intro').innerText(),/2026년 11월 9일 오후 11:59까지/);
  assert.equal(await page.locator('[data-day],[data-bulk-unit],[data-upload]').count(),0);
  await page.setViewportSize({width:390,height:844});await shot('student-mobile');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Mobile must not overflow horizontally');
  await page.locator('[data-unit="core-01"]').click();await page.locator('[data-field="f1"]').waitFor();await shot('editor-mobile');assert.equal(await page.locator('textarea').count(),1);assert.equal(await page.getByRole('button',{name:'제출하기',exact:true}).isDisabled(),true);await page.getByRole('button',{name:'내 답변 진단하기',exact:true}).click();await page.getByText('내 답변을 작성해주세요.',{exact:true}).waitFor();assert.deepEqual(submissionRequests,[]);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
  await page.goto(server.origin+'/desktop');await page.waitForFunction(()=>window.ready);await page.locator('[data-unit=core-25]').waitFor();assert.equal(await page.locator('[data-workspace-page=core]').count(),1);await page.locator('[data-unit=core-25]').click();assert.equal(await page.getByRole('button',{name:'수정 후 다시 제출',exact:true}).isDisabled(),true);
  assert.equal(await page.locator('[data-workspace-page=preassignments]').count(),0);assert.equal(await page.locator('[data-workspace-page=core]').getAttribute('aria-current'),'page');
  await page.route('**/api/interview-preassignments',route=>route.abort(),{times:1});await page.reload();await page.getByText('과제를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.',{exact:true}).waitFor();assert.equal(await page.getByText('사전과제를 불러오는 중…',{exact:true}).count(),0);await page.getByRole('button',{name:'다시 시도',exact:true}).click();await page.locator('[data-unit=core-25]').waitFor();assert.equal(await page.locator('[data-guidance]').count(),0);assert.doesNotMatch(await page.locator('.pa-root').innerText(),/두 번째 수정/);
  assert.deepEqual(errors,[]);console.log('PASS browser: separate student/admin menus, online save, failed-save recovery, disabled first/resubmission with no submission requests, student diagnosis with save, saved criteria results, unchanged teacher controls, existing history, single-answer requirement and mobile layout.');
 }finally{await browser?.close();await server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
