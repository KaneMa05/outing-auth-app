const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/W11/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const root=process.cwd(),out=path.join(root,'.tmp/taxonomy-browser');fs.mkdirSync(out,{recursive:true});
 const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://local');if(url.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/interview-prep.css"><div class="ip-root" id="host"></div>');return;}const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/javascript');res.end(fs.readFileSync(file));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);
  await page.evaluate(async()=>{
   window.calls=[];window.saved=null;window.q={id:'taxonomy-browser',prompt:'안전속력 판단과 관련 법률을 설명해주세요.',category:'job',topic_ids:[],tracks:['공채'],status:'published',revision:4,source_count:1,taxonomy:{primary_field:'navigation',related_fields:['international_maritime_law'],answer_formats:['knowledge'],material_tags:[],review_status:'classified',rationale:'항법 적용과 국제규칙 지식에 관한 질문입니다.',content_note:'',revision:1}};
   window.request=async(action,b={})=>{calls.push({action,...b});if(action==='admin_catalog')return {topics:[],enabled:true,categoryCounts:{job:{total:1,published:1,draft:0}}};if(action==='admin_questions')return {questions:[structuredClone(q)],total:1};if(action==='admin_question_detail')return {question:structuredClone(q),sources:[{filename:'검증 원문.hwpx',number:'1',original_prompt:q.prompt,answer:'저장된 원문 해설'}]};if(action==='admin_question_taxonomy_save'){saved=b;q.taxonomy={...q.taxonomy,primary_field:b.primaryField,related_fields:b.relatedFields,answer_formats:b.answerFormats,material_tags:b.materialTags,rationale:b.rationale,review_status:b.reviewStatus,content_note:b.contentNote,revision:2};return {ok:true};}throw Error('Unexpected action '+action);};
   window.mod=await import('/interview-prep-ui.js');window.app=await mod.mountAdmin(document.querySelector('#host'),{request,canWrite:true,initialSection:'job'});
  });
  assert.equal(await page.locator('[name=fieldId] option').count(),13);
  await page.locator('[name=taxonomyView]').selectOption('public_navigation');await page.locator('[data-filter] button').click();await page.waitForFunction(()=>calls.some(c=>c.taxonomyView==='public_navigation'));
  await page.getByRole('button',{name:'분류 검토',exact:true}).click();await page.locator('[data-taxonomy-form]').waitFor();
  assert.equal(await page.locator('[data-taxonomy-form] [name=primaryField]').inputValue(),'navigation');
  await page.locator('[data-taxonomy-form] [name=reviewStatus]').selectOption('needs_context');await page.locator('[data-taxonomy-form] [name=contentNote]').fill('원문 상황을 추가 확인합니다.');
  await page.getByRole('button',{name:'분류 저장',exact:true}).click();await page.waitForFunction(()=>saved!==null);
  const saved=await page.evaluate(()=>saved);assert.equal(saved.questionRevision,4);assert.equal(saved.revision,1);assert.equal(saved.reviewStatus,'needs_context');assert.deepEqual(saved.relatedFields,['international_maritime_law']);
  assert.equal(await page.evaluate(()=>q.status),'published');assert.equal(await page.evaluate(()=>q.revision),4);
  await page.locator('[data-content] .ip-badge').getByText('추가 검토',{exact:true}).waitFor();
  await page.screenshot({path:path.join(out,'admin-desktop.png'),fullPage:true});
  await page.evaluate(async()=>{app.destroy();app=await mod.mountAdmin(document.querySelector('#host'),{request,canWrite:false,initialSection:'job'});});
  await page.getByRole('button',{name:'분류 검토',exact:true}).click();assert(await page.getByRole('button',{name:'분류 저장',exact:true}).isDisabled());assert(await page.locator('[data-taxonomy-form] [name=rationale]').isDisabled());
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'admin-mobile.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  assert.deepEqual(errors,[]);
  console.log('PASS administrator taxonomy filters, review editor, separate metadata save, published-state preservation, read-only permissions and mobile layout.');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
