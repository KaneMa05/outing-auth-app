'use strict';
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {start}=require('../scripts/interview-question-publication-preview.cjs');
(async()=>{
 const server=await start();let browser;
 try{
  browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));await page.goto(server.url);
  const row=()=>page.locator('tbody tr').filter({hasText:'팀원과 협업했던 경험을 말해주세요.'});
  await row().getByRole('button',{name:'검토·수정',exact:true}).click();
  const editor=page.locator('[data-editor]');
  await editor.getByText('연결할 인성 준비 항목 (선택)',{exact:true}).waitFor();
  for(const checkbox of await editor.locator('input[name=topicIds]').all())await checkbox.uncheck();
  await editor.getByRole('button',{name:'저장',exact:true}).click();
  await row().getByText('미연결 (선택)',{exact:false}).waitFor();
  await row().getByRole('button',{name:'공개 승인',exact:true}).click();
  await row().getByText('공개 승인 완료',{exact:true}).waitFor();
  assert.match(await page.locator('#student-questions').innerText(),/팀원과 협업했던 경험/);
  await row().getByRole('button',{name:'승인 취소',exact:true}).click();
  await row().getByText('승인 대기',{exact:true}).waitFor();
  await row().locator('[data-publish-id]').check();
  await page.getByRole('button',{name:'선택 문항 공개 승인',exact:true}).click();
  await row().getByText('공개 승인 완료',{exact:true}).waitFor();
  await page.setViewportSize({width:390,height:844});await row().getByRole('button',{name:'검토·수정',exact:true}).click();
  await editor.getByText('연결할 인성 준비 항목 (선택)',{exact:true}).waitFor();
  await page.screenshot({path:'/private/tmp/interview-optional-personality-topics-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS browser: clear all personality links, save, individual approval/withdrawal, batch approval, student visibility and optional labels on desktop/mobile.');
 }finally{await browser?.close();await server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
