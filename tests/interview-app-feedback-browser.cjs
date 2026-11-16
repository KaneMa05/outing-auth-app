// Local synthetic reports; no production requests.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const root=path.resolve(__dirname,'..'),output=path.join(root,'output/interview-app-feedback');fs.mkdirSync(output,{recursive:true});
 const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://local').pathname;
  if(pathname==='/qa'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end('<meta charset="utf-8"><link rel="stylesheet" href="/interview-prep.css"><style>body{font:15px system-ui;background:#f4f7fb;margin:30px}</style><main id="host" class="ip-root"></main>');}
  const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep)||!['.js','.css'].includes(path.extname(file))||!fs.existsSync(file)){res.statusCode=404;return res.end();}
  res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(file));
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1200,height:900}});
 try{
  await page.goto('http://127.0.0.1:'+server.address().port+'/qa');
  await page.evaluate(async()=>{const {mountAppFeedback}=await import('/interview-app-feedback-admin.js');window.rows=[{id:'00000000-0000-0000-0000-000000000001',student_id:'테스트 수강생',kind:'bug',content:'<img src=x onerror="window.reportXSS=true">\n질문별 재생 위치 확인 부탁드립니다.',screen:'live.result',app_version:'1.0(1)',status:'received',revision:0,created_at:new Date().toISOString()}];window.calls=[];window.mountFeedback=(canWrite)=>mountAppFeedback(document.querySelector('#host'),{canWrite,request:async(action,b)=>{window.calls.push({action,b});if(action==='admin_app_feedback_update'){window.rows[0].status=b.status;window.rows[0].revision++;return {ok:true};}return {ok:true,items:window.rows.filter(r=>b.status==='all'||r.status===b.status),hasMore:false};}});window.board=window.mountFeedback(true);await window.board.ready;});
  await page.getByRole('heading',{name:'앱 오류·개선 의견'}).waitFor();assert.equal(await page.locator('article img').count(),0);assert.equal(await page.evaluate(()=>window.reportXSS),undefined);
  await page.evaluate(async()=>{window.rows[0].content='첫 질문 답변을 들은 뒤 다음 질문 답변으로 이동할 수 있으면 좋겠습니다.';window.board.destroy();window.board=window.mountFeedback(true);await window.board.ready;});
  await page.screenshot({path:path.join(output,'01-admin-received.png'),fullPage:true});
  await page.locator('[data-report-status]').selectOption('reviewing');await page.locator('[data-save]').click();await page.waitForFunction(()=>window.calls.some(c=>c.action==='admin_app_feedback_update'));
  await page.locator('[data-status]').selectOption('reviewing');await page.locator('article').waitFor();
  await page.screenshot({path:path.join(output,'02-admin-reviewing.png'),fullPage:true});
  await page.evaluate(async()=>{window.board.destroy();window.board=window.mountFeedback(false);await window.board.ready;});assert.equal(await page.locator('[data-save]').count(),0);
  console.log('PASS admin private reports, escaped content, status update/filter, read-only role');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
