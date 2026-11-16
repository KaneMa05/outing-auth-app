'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/W11/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const root=process.cwd(),output=path.join(root,'.tmp/interview-ai-history-qa');fs.mkdirSync(output,{recursive:true});
 const server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://local').pathname;
  if(name==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/interview-prep.css"><div class="ip-root"><div id="host"></div></div>');return;}
  const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',name.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(file));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);
  await page.evaluate(async()=>{
   window.calls=[];window.fail=false;
   const sources=[{id:'drafts',title:'답변 초안'},{id:'questions',title:'인생그래프 후속 질문'},{id:'diagnosis',title:'핵심 25제 진단'}];
   const studentUsage={profileAvailable:true,savedAt:'2026-11-02T02:00:00Z',questionCount:2,savedAnswerCount:1,addedQuestionCount:2,questions:[{question:'<img src=x onerror="window.injected=true">경험에서 본인이 맡은 역할은 무엇인가요?',matches:[{experienceTitle:'팀 프로젝트',answer:'학생이 직접 쓴 저장 답변 <script>window.injected=true</script>'}]},{question:'두 번째 질문은 무엇인가요?',matches:[{experienceTitle:'팀 프로젝트',answer:''}]}],experiences:[{title:'팀 프로젝트',age:'23',content:'현재 경험 원문과 질문 아래에 저장한 답변',appeal:'협업'}]};
   window.request=async(action,b={})=>{
    calls.push({action,...b});if(action==='admin_catalog')return {enabled:true,topics:[],tracks:[],categoryCounts:{}};
    if(action!=='admin_ai_usage')throw Error('unexpected action');if(window.fail)throw Error('offline');
    if(b.recordId){if(window.delayed)return new Promise(r=>window.releaseDetail=()=>r({sections:[{title:'생성된 질문',value:['지연된 결과']}]}));return {studentUsage:b.source==='questions'?studentUsage:undefined,sections:[{title:'생성된 질문',value:['<img src=x onerror="window.injected=true">경험에서 본인이 맡은 역할은 무엇인가요?']},{title:'재요청 전 결과',value:[{status:'NEEDS_INPUT',result:{missing:['실제로 한 행동을 보완해주세요.']}},{status:'COMPLETED',result:{answer:'보완한 자료로 생성한 답변'}}]}]};}
    const second=!!b.cursor,types=b.source?[b.source]:['questions','drafts','diagnosis'];
    return {ok:true,sources,unavailable:[],records:Array.from({length:second?2:25},(_,i)=>({id:'00000000-0000-0000-0000-'+String((second?25:0)+i).padStart(12,'0'),source:types[i%types.length],kind:types[i%types.length]==='drafts'?'self_intro':types[i%types.length],title:sources.find(s=>s.id===types[i%types.length]).title,studentName:'가상 수강생 '+(i+1),studentId:'test-'+i,createdAt:'2026-11-02T01:30:00.123456+00:00',statuses:[i===1?'failed':'completed'],studentUsage:types[i%types.length]==='questions'?{profileAvailable:true,questionCount:2,savedAnswerCount:1,addedQuestionCount:2}:undefined})),nextCursor:second?null:'next-fixture'};
   };
   const {mountAdmin}=await import('/interview-prep-ui.js');window.admin=await mountAdmin(document.querySelector('#host'),{request,canWrite:false,initialSection:'ai_history'});
  });
  await page.locator('[data-ai-open]').first().waitFor();assert.equal(await page.locator('[data-ai-open]').count(),25);
  assert.equal(await page.locator('[data-tab=ai_history]').getAttribute('aria-current'),'page');
  assert(await page.locator('[data-ai-usage-refresh]').isEnabled(),'Read-only administrator can refresh history');
  await page.locator('[data-ai-open]').first().click();await page.locator('[data-ai-detail] details').first().waitFor();
  assert.match(await page.locator('[data-ai-saved-answer]').innerText(),/학생이 직접 쓴 저장 답변/);
  assert.match(await page.locator('[data-ai-student-usage]').innerText(),/질문만 저장되어 있고 답변 내용은 아직 없습니다/);
  await page.locator('[data-ai-detail] summary').filter({hasText:'재요청 전 결과'}).click();
  assert.match(await page.locator('[data-ai-detail]').innerText(),/보완한 자료로 생성한 답변/);
  assert.equal(await page.locator('[data-ai-detail] img').count(),0);assert.equal(await page.locator('[data-ai-detail] script').count(),0);assert.equal(await page.evaluate(()=>window.injected),undefined);
  await page.screenshot({path:path.join(output,'desktop.png'),fullPage:true});
  await page.locator('[data-ai-next]').click();await page.waitForFunction(()=>document.querySelectorAll('[data-ai-open]').length===2);
  assert(await page.locator('[data-ai-next]').isDisabled());await page.locator('[data-ai-prev]').click();await page.waitForFunction(()=>document.querySelectorAll('[data-ai-open]').length===25);
  await page.locator('[data-ai-source]').selectOption('diagnosis');await page.waitForFunction(()=>window.calls.at(-1).source==='diagnosis');
  assert((await page.locator('.ip-ai-history tbody').innerText()).includes('핵심 25제 진단'));
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(output,'mobile.png'),fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'History table scrolls inside its container on mobile');
  await page.evaluate(()=>window.fail=true);await page.locator('[data-ai-usage-refresh]').click();await page.getByRole('alert').waitFor();
  assert.match(await page.getByRole('alert').innerText(),/불러오지 못했습니다/);
  await page.evaluate(()=>window.fail=false);await page.locator('[data-ai-usage-refresh]').click();await page.locator('[data-ai-open]').first().waitFor();
  await page.evaluate(()=>window.delayed=true);await page.locator('[data-ai-open]').first().click();await page.waitForFunction(()=>!!window.releaseDetail);
  await page.locator('[data-ai-usage-refresh]').click();await page.locator('[data-ai-open]').first().waitFor();await page.evaluate(()=>window.releaseDetail());
  assert.equal(await page.locator('[data-ai-detail]').innerText(),'');assert.deepEqual(errors,[]);
  console.log('PASS administrator history entry, read-only access, all requests, pagination, source filtering, results, retry snapshots, XSS, mobile, recovery and stale detail protection');
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
