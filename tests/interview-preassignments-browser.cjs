const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {start}=require('../scripts/preassignment-preview.cjs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/W11/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const server=await start({diagnosisProvider:async s=>({summary:'브라우저 테스트용 진단 결과',criteria:s.rubric.criteria.map((c,index)=>({index,state:'보완',quote:s.answer,reason:'테스트용 근거 설명',nextQuestion:c[2]}))})});let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page=await browser.newPage({viewport:{width:1280,height:950}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept());
  const shot=async name=>{fs.mkdirSync('.tmp/preassignments',{recursive:true});await page.screenshot({path:'.tmp/preassignments/'+name+'.png',fullPage:true});};
  await page.goto(server.origin+'/#interview-prep?tab=preassignments');await page.waitForFunction(()=>window.ready);
  await page.getByRole('heading',{name:'핵심 25제 작성하기',exact:true}).last().waitFor();await page.locator('[data-unit="core-25"]').waitFor();assert.equal(await page.locator('[data-unit^="core-"]').count(),25);assert.equal(await page.locator('[data-unit="other"]').count(),0);
  assert.equal(await page.locator('.ip-app-footer button').count(),5);assert.equal(await page.locator('[data-app-tab=preassignments],[data-workspace-page=preassignments]').count(),0);assert.equal(await page.getByRole('button',{name:/핵심 30제/}).count(),0);assert.doesNotMatch(await page.locator('.pa-root').innerText(),/교사 확인|보완 요청|확인 대기/);await shot('student-desktop');
  for(let i=1;i<=25;i++){
   const id='core-'+String(i).padStart(2,'0');await page.locator(`[data-unit="${id}"]`).click();await page.getByRole('button',{name:'요약서 보기',exact:true}).waitFor();
   assert.equal(await page.locator('[data-pa-controls] button').first().innerText(),'요약서 보기');
   await page.getByRole('button',{name:'요약서 보기',exact:true}).click();await page.locator('[data-summary]:not([hidden])').waitFor();
   assert.match(await page.locator('.pa-handout-kicker').innerText(),new RegExp('핵심인성 '+i+'번'));
   assert.equal(await page.locator('[data-summary] iframe').count(),0);assert.equal(await page.locator('.pa-handout-page img').count(),2);await page.waitForFunction(()=>[...document.querySelectorAll('.pa-handout-page img')].every(img=>img.complete&&img.naturalWidth>1000));assert.match(await page.locator('.pa-handout-page img').first().getAttribute('src'),new RegExp(id+'-'));assert.equal(await page.locator('.pa-handout-page').first().getAttribute('target'),'_blank');
   if(i===1)await shot('core25-summary-desktop');
   await page.getByRole('button',{name:'요약서 닫기',exact:true}).click();assert.equal(await page.locator('[data-pa=summary]').getAttribute('aria-expanded'),'false');
   await page.getByRole('button',{name:'과제 목록',exact:true}).click();
  }
  await page.locator('[data-unit="core-25"]').click();await page.locator('[data-field=f1]').fill('요약서를 열어도 유지할 답변');
  await page.getByRole('button',{name:'요약서 보기',exact:true}).click();await page.locator('[data-summary]:not([hidden])').waitFor();assert.equal(await page.locator('[data-field=f1]').inputValue(),'요약서를 열어도 유지할 답변');
  await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));await shot('core25-summary-mobile');
  await page.getByRole('button',{name:'요약서 닫기',exact:true}).click();assert.equal(await page.locator('[data-field=f1]').inputValue(),'요약서를 열어도 유지할 답변');await page.setViewportSize({width:1280,height:950});
  await page.locator('[data-field="f1"]').fill('팀원과 의견이 다르면 어떻게 하겠습니까?');
  await page.getByRole('button',{name:'임시저장',exact:true}).click();await page.getByText('임시저장했습니다.',{exact:false}).waitFor();
  await page.request.post(server.origin+'/qa-fail-next',{data:{}});
  await page.locator('[data-field="f1"]').fill('실패 시에도 유지해야 할 학생 입력');await page.getByRole('button',{name:'임시저장',exact:true}).click();await page.getByText('처리하지 못했습니다.',{exact:false}).waitFor();assert.equal(await page.locator('[data-field="f1"]').inputValue(),'실패 시에도 유지해야 할 학생 입력');
  await page.getByRole('button',{name:'임시저장',exact:true}).click();await page.getByText('임시저장했습니다.',{exact:false}).waitFor();
  assert.equal(await page.locator('textarea').count(),1);assert.equal(await page.locator('input[type=file]').count(),0);
  await page.locator('[data-field=f1]').fill('실패 시에도 유지해야 할 학생 입력 · 진단 전 수정');await page.getByRole('button',{name:'내 답변 진단하기',exact:true}).click();await page.getByRole('heading',{name:'내 답변 진단 결과',exact:true}).waitFor();
  const saved=await server.call('detail',{type:'student',id:'ip-a'},{unitId:'core-25'});assert.equal(saved.latest,null);assert.equal((await server.call('diagnosis_get',{type:'student',id:'ip-a'},{unitId:'core-25'})).diagnosis.status,'completed');assert.equal(saved.draft.fields.f1,'실패 시에도 유지해야 할 학생 입력 · 진단 전 수정');
  assert.equal(await page.locator('[data-feedback],[data-pa=approve],[data-pa=revision]').count(),0);await shot('diagnosis-completed');await page.getByRole('button',{name:'과제 목록',exact:true}).click();await page.locator('[data-unit=core-25]').click();await page.getByRole('heading',{name:'내 답변 진단 결과',exact:true}).waitFor();assert.equal(await page.locator('[data-diagnosis] article').count(),4);

  await page.getByRole('button',{name:'제출하기',exact:true}).click();await page.getByText('제출 접수 완료',{exact:false}).waitFor();
  await shot('submitted-student');await page.goto(server.origin+'/admin');await page.waitForFunction(()=>window.ready);
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
  await page.goto(server.origin);await page.waitForFunction(()=>window.ready);await page.locator('.ip-app-footer [data-app-tab=writing]').click();await page.locator('[data-workspace-page=core]').click();await page.locator('[data-unit="core-25"]').click();await page.locator('[data-field="f1"]').fill('제가 직접 의견을 정리해 회의를 진행했고 팀원 모두가 역할에 동의했습니다.');await page.getByRole('button',{name:'수정 후 다시 제출',exact:true}).click();await page.getByText('제출 접수 완료',{exact:false}).waitFor();
  await page.getByRole('button',{name:'이력 불러오기',exact:true}).click();await page.locator('[data-history] article').first().waitFor();assert.equal(await page.locator('[data-history] article').count(),2);assert.match(await page.locator('[data-history]').innerText(),/실패 시에도 유지해야 할 학생 입력/);
  await page.goto(server.origin);await page.waitForFunction(()=>window.ready);await page.locator('.ip-app-footer [data-app-tab=writing]').click();await page.locator('[data-workspace-page=core]').click();await page.locator('[data-unit="core-25"] .submitted').waitFor();assert.match(await page.locator('.pa-intro').innerText(),/2026년 11월 9일 오후 11:59까지/);
  assert.equal(await page.locator('[data-day],[data-bulk-unit],[data-upload]').count(),0);
  await page.setViewportSize({width:390,height:844});await shot('student-mobile');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Mobile must not overflow horizontally');
  await page.locator('[data-unit="core-01"]').click();await page.locator('[data-field="f1"]').waitFor();await shot('editor-mobile');assert.equal(await page.locator('textarea').count(),1);await page.getByRole('button',{name:'제출하기',exact:true}).click();await page.getByText('내 답변을 작성해주세요.',{exact:true}).waitFor();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
  await page.goto(server.origin+'/desktop');await page.waitForFunction(()=>window.ready);await page.locator('[data-unit=core-25]').waitFor();assert.equal(await page.locator('[data-workspace-page=core]').count(),1);
  assert.equal(await page.locator('[data-workspace-page=preassignments]').count(),0);assert.equal(await page.locator('[data-workspace-page]').last().getAttribute('data-workspace-page'),'core');
  await page.route('**/api/interview-preassignments',route=>route.abort(),{times:1});await page.reload();await page.getByText('과제를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.',{exact:true}).waitFor();assert.equal(await page.getByText('사전과제를 불러오는 중…',{exact:true}).count(),0);await page.getByRole('button',{name:'다시 시도',exact:true}).click();await page.locator('[data-unit=core-25]').waitFor();assert.equal(await page.locator('[data-guidance]').count(),0);assert.doesNotMatch(await page.locator('.pa-root').innerText(),/두 번째 수정/);
  assert.deepEqual(errors,[]);console.log('PASS browser: separate student/admin menus, online save, failed-save recovery, submit, student diagnosis with save, saved criteria results, no teacher review, resubmit/history, single-answer requirement and mobile layout.');
 }finally{await browser?.close();await server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
