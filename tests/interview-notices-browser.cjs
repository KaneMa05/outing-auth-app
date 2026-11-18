'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {start}=require('./helpers/interview-notices-fixture.cjs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/W11/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const fixture=await start();let browser;
 try{
  await fixture.db.exec("insert into notices(id,title,body,target_audience) values('offline-only','오프라인 전용','다른 반 안내','offline')");
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const admin=await browser.newPage({viewport:{width:1440,height:1000}}),student=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
  for(const page of [admin,student]){page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept());}
  await admin.goto(fixture.origin+'/admin#interview-prep-admin?section=notices');await admin.waitForFunction(()=>window.ready);
  await admin.getByRole('heading',{name:'공지 등록',exact:true}).waitFor();assert.equal(await admin.locator('tbody tr').count(),1);
  assert.equal(await admin.locator('.notice-target-option input[value=interview]').isChecked(),true);assert.equal(await admin.locator('.notice-target-option input:disabled').count(),1);
  await student.goto(fixture.origin);await student.waitForFunction(()=>window.ready);await student.getByRole('heading',{name:'면접반 수강 안내',exact:true}).waitFor();
  const title='면접 일정 안내 <img src=x onerror=alert(1)>',body='첫째 줄\n둘째 줄 <script>alert(1)</script>';
  await admin.locator('[name=title]').fill(title);await admin.locator('[name=body]').fill(body);await admin.getByRole('button',{name:'공지 등록',exact:true}).click();await admin.getByText('공지글을 등록했습니다.',{exact:true}).waitFor();
  await student.reload();await student.waitForFunction(()=>window.ready);await student.getByRole('heading',{name:title,exact:true}).waitFor();
  assert.equal(await student.locator('.ip-app-notice').first().locator('p').textContent(),body);assert.equal(await student.locator('.ip-app-notices script,.ip-app-notices img').count(),0);assert.equal(await student.getByText('오프라인 전용',{exact:true}).count(),0);
  const row=admin.locator('tbody tr').filter({hasText:title});await row.getByRole('button',{name:'수정',exact:true}).click();await admin.locator('[name=title]').fill('변경된 면접 일정');await admin.locator('[name=body]').fill('수정한 공지 내용');await admin.getByRole('button',{name:'공지 수정',exact:true}).click();await admin.getByText('공지글을 수정했습니다.',{exact:true}).waitFor();
  await student.reload();await student.waitForFunction(()=>window.ready);await student.getByRole('heading',{name:'변경된 면접 일정',exact:true}).waitFor();assert.equal(await student.getByText('수정한 공지 내용',{exact:true}).count(),1);
  let updated=admin.locator('tbody tr').filter({hasText:'변경된 면접 일정'});await updated.getByRole('button',{name:'수정',exact:true}).click();await admin.locator('[name=isPublished]').uncheck();await admin.getByRole('button',{name:'공지 수정',exact:true}).click();await admin.getByText('공지글을 수정했습니다.',{exact:true}).waitFor();
  await student.reload();await student.waitForFunction(()=>window.ready);assert.equal(await student.getByRole('heading',{name:'변경된 면접 일정',exact:true}).count(),0);
  updated=admin.locator('tbody tr').filter({hasText:'변경된 면접 일정'});await updated.getByRole('button',{name:'삭제',exact:true}).click();await admin.getByText('공지글을 삭제했습니다.',{exact:true}).waitFor();assert.equal(await admin.locator('tbody tr').count(),1);
  await admin.locator('tbody tr').getByRole('button',{name:'수정',exact:true}).click();await admin.locator('[name=body]').fill('저장 실패 시 보존할 내용');fixture.setWriteFailure(true);await admin.getByRole('button',{name:'공지 수정',exact:true}).click();await admin.getByText(/공지글을 원격 저장소에 저장하지 못했습니다/).waitFor();assert.equal(await admin.locator('[name=body]').inputValue(),'저장 실패 시 보존할 내용');fixture.setWriteFailure(false);
  await admin.getByRole('button',{name:'수정 취소',exact:true}).click();
  fixture.setReadFailure(true);await admin.evaluate(()=>{renderInterviewPrepAdmin.notices=null;render();});await admin.getByRole('button',{name:'다시 시도',exact:true}).waitFor();fixture.setReadFailure(false);await admin.getByRole('button',{name:'다시 시도',exact:true}).click();await admin.getByRole('heading',{name:'공지 등록',exact:true}).waitFor();assert.equal(await admin.locator('tbody tr').count(),1);
  fs.mkdirSync('.tmp/interview-notices',{recursive:true});await admin.screenshot({path:'.tmp/interview-notices/admin.png',fullPage:true});await student.screenshot({path:'.tmp/interview-notices/student-mobile.png',fullPage:true});
  assert(await student.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  fixture.setReadFailure(true);await student.reload();await student.waitForFunction(()=>window.ready);await student.getByRole('button',{name:'다시 시도',exact:true}).waitFor();assert.equal(await student.getByRole('heading',{name:'나의 면접 준비',exact:true}).count(),1);fixture.setReadFailure(false);await student.getByRole('button',{name:'다시 시도',exact:true}).click();await student.getByRole('heading',{name:'면접반 수강 안내',exact:true}).waitFor();
  await admin.locator('tbody tr').getByRole('button',{name:'삭제',exact:true}).click();await admin.getByText('공지글을 삭제했습니다.',{exact:true}).waitFor();await student.reload();await student.waitForFunction(()=>window.ready);await student.getByText('등록된 공지사항이 없습니다.',{exact:true}).waitFor();assert.equal(await student.getByText('ronpark1234',{exact:false}).count(),0);
  assert.deepEqual(errors,[]);console.log('PASS interview notice browser: admin CRUD, visibility, failed-save recovery, student reload, safe text, isolated audience, retry, mobile layout, and empty state.');
 }finally{await browser?.close();await fixture.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
