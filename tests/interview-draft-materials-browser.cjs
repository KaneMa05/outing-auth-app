const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict'),crypto=require('crypto');
const {createHandler}=require('../api/interview-ai');
const {chromium}=require('C:/Users/W11/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const root=process.cwd(),out=path.join(root,'.tmp/interview-materials-qa');fs.mkdirSync(out,{recursive:true});
 const fields={},revisions={},calls=[];let failSave=false;
 const questions=['본인의 지원 계기는 무엇인가요?','이 진로를 선택한 이유는 무엇인가요?','실제로 준비한 노력은 무엇인가요?'];
 function prepare(kind){
  const definitions=kind==='self_intro'?[]:['position','reason','application'].map((key,i)=>({key,question:questions[i],
   ready:kind==='public_service'||i===2||(fields[kind]?.[key]?.length||0)>=10,value:fields[kind]?.[key]||'',source:kind==='public_service'||i===2?'db':'missing'}));
  const missing=definitions.filter(f=>!f.ready).map(f=>f.question);
  return {ok:true,enabled:true,ready:!missing.length,dbReady:!missing.length,experienceCount:kind==='self_intro'?3:1,
   minExperienceCount:kind==='self_intro'?3:1,readinessVersion:'draft_materials_v1',missing,
   sourceHash:crypto.createHash('sha256').update(JSON.stringify(fields[kind]||{})).digest('hex'),
   materials:kind==='self_intro'?null:{topicId:kind==='motivation'?'motivation':'public',topicRevision:1,revision:revisions[kind]||0,fields:definitions}};
 }
 const handler=createHandler({authenticateWeb:async()=>({id:'synthetic-owner'}),invoke:async(action,actor,body)=>{
  assert.equal(actor.id,'synthetic-owner');calls.push(action);
  if(action==='prepare')return prepare(body.kind);if(action==='requests')return {ok:true,requests:[]};
  if(action==='materials_save'){
   if(failSave){failSave=false;throw Error('temporary_connection_error');}
   if(body.revision!==(revisions[body.kind]||0))throw Error('revision_conflict');
   fields[body.kind]={...fields[body.kind],...body.fields};revisions[body.kind]=(revisions[body.kind]||0)+1;return prepare(body.kind);
  }
  if(action==='generate')return {ok:true,requestId:'00000000-0000-4000-8000-000000000001'};
  if(action==='status')return {ok:true,requestId:'00000000-0000-4000-8000-000000000001',kind:'motivation',items:[{key:'motivation',position:1,status:'COMPLETED',question:'지원동기',result:{answer:'검증용 초안입니다.'}}]};
  throw Error('unexpected_action');
 }});
 const server=http.createServer(async(req,res)=>{
  const name=new URL(req.url,'http://local').pathname;
  if(name==='/api/interview-ai'){let raw='';for await(const chunk of req)raw+=chunk;req.body=JSON.parse(raw);res.status=n=>{res.statusCode=n;return res;};res.json=d=>res.end(JSON.stringify(d));return handler(req,res);}
  if(name==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end('<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/interview-prep.css"><link rel="stylesheet" href="/interview-portal.css"><main id="host"></main></html>');}
  const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',name.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(file));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss());
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.evaluate(async()=>{const {mountWorkspace}=await import('/interview-workspace.js');window.view=await mountWorkspace(document.querySelector('#host'),{
   initialPage:'motivation',request:async action=>{if(action==='writing_list')return {writings:[]};throw Error('unexpected_editor_read');}});});
  await page.locator('[data-ai-material=position]').waitFor();assert.equal(await page.locator('[data-ai-material]').count(),2,'Only missing questions are expanded');
  assert(await page.locator('[data-ai-generate]').isDisabled());
  const position='실제 활동을 하며 해양경찰이라는 진로에 관심을 갖게 되었습니다.',reason='국민의 안전을 지키는 역할에 기여하고 싶어 선택했습니다.';
  await page.locator('[data-ai-material=position]').fill(position);await page.locator('[data-ai-material=reason]').fill(reason);
  failSave=true;await page.locator('[data-ai-materials-save]').click();await page.waitForFunction(()=>document.querySelector('.ip-ai-panel').getAttribute('aria-busy')==='false');
  assert.equal(await page.locator('[data-ai-material=position]').inputValue(),position);assert.equal(await page.locator('[data-ai-material=reason]').inputValue(),reason,'Failed save preserves both inputs');
  await page.locator('[data-workspace-page=public_service]').click();assert.equal(await page.locator('[data-ai-generate]').getAttribute('data-ai-generate'),'motivation','Unsaved answers block navigation when discard is declined');
  await page.locator('[data-ai-materials-save]').click();await page.waitForFunction(()=>!document.querySelector('[data-ai-generate]').disabled);
  assert.equal(await page.locator('.ip-ai-materials-panel').count(),0);assert(await page.locator('summary').filter({hasText:'자료 확인·추가 보완'}).isVisible());
  await page.locator('summary').filter({hasText:'자료 확인·추가 보완'}).click();await page.locator('[data-ai-material=reason]').fill(reason+' 직접 준비한 내용을 더 보완합니다.');
  const before=calls.length;await page.locator('[data-ai-generate]').click();await page.locator('[data-ai-answer]').waitFor();
  assert.deepEqual(calls.slice(before,before+4),['materials_save','prepare','generate','status'],'Generation saves pending supplemental answers before preparation');
  await page.screenshot({path:path.join(out,'motivation-mobile.png'),fullPage:true});
  await page.locator('[data-workspace-page=public_service]').click();await page.waitForFunction(()=>document.querySelector('[data-ai-generate=public_service]')&&!document.querySelector('[data-ai-generate]').disabled);
  assert.equal(await page.locator('.ip-ai-materials-panel').count(),0,'Existing DB evidence does not force redundant answers');
  assert.match(await page.locator('.ip-ai-requirements').innerText(),/공직 가치/);assert.match(await page.locator('[data-ai-experience-count]').innerText(),/최소 1개/);
  await page.screenshot({path:path.join(out,'public-service-mobile.png'),fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.locator('[data-workspace-page=introduction]').click();await page.waitForFunction(()=>document.querySelector('[data-ai-generate=self_intro]')&&document.querySelector('.ip-ai-panel').getAttribute('aria-busy')==='false');
  assert.match(await page.locator('.ip-ai-requirements').innerText(),/핵심 경험 1~2개/);assert.match(await page.locator('[data-ai-experience-count]').innerText(),/최소 3개/);
  assert.deepEqual(errors,[]);console.log('PASS browser: typed questions, DB reuse, failure preservation, unsaved navigation, save-before-generation, type-specific experience counts and mobile layout. Synthetic API only; no model calls.');
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
