'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),output=path.join(root,'.tmp/practice-inline-review');
const runs=Array.from({length:18},(_,i)=>({id:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,student_id:'qa-'+i,student_name:'검수 학생 '+(i+1),exam_number:'QA-'+(i+1),recorded_at:'2026-11-26T11:00:00Z',mode:'job',track:'공채',question_count:4,answer_count:4,uploaded_count:3,answer_seconds:80,finished:true,completed:true,transcription:{completed:2,failed:1}}));
const transcription=(text='상황을 확인하고 보고합니다.')=>({status:'completed',transcript:text,segments:[{start:1,end:2,text}],revision:1,review_status:'pending',corrected_text:'',review_note:'',student_text:'수강생 수정본'});
let state;
function reset(){state={calls:[],jobs:new Map(runs.map(run=>[run.id,[transcription(),transcription('원본 답변 <img src=x onerror="window.bad=true">')]])),reviewError:false,holdGet:null};}
// Generated local WAV keeps playback checks independent of OS audio converters.
const pcm=Buffer.alloc(16000*2*8),wav=Buffer.alloc(44+pcm.length);
for(let i=0;i<pcm.length/2;i++)pcm.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*440/16000)*1200),i*2);
wav.write('RIFF');wav.writeUInt32LE(pcm.length+36,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(pcm.length,40);pcm.copy(wav,44);
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/api/interview-practice-records'){
   let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);state.calls.push(body);
   res.setHeader('Content-Type','application/json');
   const send=data=>res.end(JSON.stringify({ok:true,...data}));
   if(body.action==='admin_list')return send({runs:body.search==='없음'?[]:runs,hasMore:body.page===0});
   if(body.action==='admin_get'){
    const data={run:runs.find(run=>run.id===body.runId),turns:[1,2,3,4].map(number=>({number,question:'질문 '+number,answer:'기기의 답변',duration:20,audio_bytes:32000,uploaded:number<4,transcription:number<3?{...state.jobs.get(body.runId)[number-1]}:number===3?{status:'failed',attempts:3}:null}))};
    if(state.holdGet?.id===body.runId)await new Promise(resolve=>state.holdGet.release=resolve);
    return send(data);
   }
   if(body.action==='admin_audio')return send({url:'https://audio.test/storage/v1/object/sign/interview-practice/'+body.runId+'/'+body.number+'.wav?token=local-test'});
   if(body.action==='admin_review'){
    const job=state.jobs.get(body.runId)[body.number-1];
    if(state.reviewError||job.revision!==body.revision){res.statusCode=409;return res.end(JSON.stringify({ok:false,error:'revision_conflict'}));}
    Object.assign(job,{revision:job.revision+1,corrected_text:body.correctedText,review_status:body.reviewStatus,review_note:body.note,reviewed_at:new Date().toISOString()});return send({});
   }
   if(body.action==='admin_retry')return send({});
   throw Error('Unexpected API action: '+body.action);
  }
  if(url.pathname==='/'){
   res.setHeader('Content-Type','text/html; charset=utf-8');
   return res.end('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/interview-prep.css"><style>body{margin:0;background:#f6f9fd;font-family:Arial,"Malgun Gothic",sans-serif}#host{max-width:1050px;margin:24px auto;padding:0 16px;box-sizing:border-box}#host>.ip-tabs{display:none}</style><main id="host"></main></html>');
  }
  const file=path.resolve(root,'.'+url.pathname);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}
  res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(file));
 }catch(error){res.statusCode=500;res.end(error.message);}
});
async function main(){
 let browser;const errors=[],cases=[];
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));fs.mkdirSync(output,{recursive:true});
 try{
  browser=await chromium.launch({headless:true,...process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}});
  const origin='http://127.0.0.1:'+server.address().port;
  for(const width of [1280,390]){
   reset();
   const context=await browser.newContext({viewport:{width,height:900},isMobile:width===390,hasTouch:width===390});
   const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
   await page.route('https://audio.test/**',route=>route.fulfill({status:200,contentType:'audio/wav',body:wav}));
   async function mount(canWrite=true){
    await page.goto(origin);
    await page.evaluate(async canWrite=>{
     const {mountAdmin}=await import('/interview-prep-ui.js');window.parentCalls=[];
     window.view=await mountAdmin(document.querySelector('#host'),{initialSection:'practice',canWrite,request:async action=>{
      window.parentCalls.push(action);if(action!=='admin_catalog')throw Error('Unexpected parent action: '+action);
      return {topics:[],enabled:true,categoryCounts:{personality:{total:0,draft:0,published:0}}};
     }});
    },canWrite);
   }
   const button=id=>page.locator(`[data-practice-run="${id}"]`);
   const review=number=>page.locator(`[data-practice-review="${number}"]`);
   async function open(id){await button(id).click();await page.locator('[data-practice-review="1"]').waitFor();}
   const first=runs[0].id,middle=runs[8].id,last=runs[17].id;
   await mount();
   await open(middle);
   assert.equal(await button(middle).getAttribute('aria-expanded'),'true');
   assert.equal(await page.locator('[data-practice-detail]').evaluate(n=>n.previousElementSibling.querySelector('[data-practice-run]').dataset.practiceRun),middle);
   assert.equal(await page.locator('[data-practice-detail]').evaluate(n=>n.nextElementSibling.classList.contains('ip-practice-record')),true,'detail precedes next row');
   assert.equal(await page.locator('[data-practice-detail] img').count(),0,'escape transcription text');
   await page.locator('[data-practice-turn="2"]>summary').click();
   await review(2).locator('[name=note]').fill('다른 답변의 미저장 메모');
   await page.locator('[data-practice-listen="1"]').click();await page.locator('audio').waitFor();
   await page.locator('audio').evaluate(async audio=>{audio.currentTime=1;await audio.play();audio.pause();});
   await review(1).locator('[name=correctedText]').fill('수정한 답변');
   assert.equal(await review(1).locator('[name=reviewStatus]').inputValue(),'pending');
   assert.equal(await review(1).locator('[data-practice-review-options]').evaluate(n=>n.open),false,'accuracy classification is optional and collapsed');
   const save=review(1).getByRole('button',{name:'수정 내용 저장'});await save.scrollIntoViewIfNeeded();
   await page.evaluate(()=>{
    window.preserved={hero:document.querySelector('.ip-hero'),list:document.querySelector('[data-practice-list]'),form:document.querySelector('[data-practice-review="1"]'),other:document.querySelector('[data-practice-review="2"]'),audio:document.querySelector('audio'),time:document.querySelector('audio').currentTime,scroll:scrollY};
   });
   const beforeCalls=state.calls.length;
   await save.click();await review(1).getByText('수정 내용을 저장했습니다.').waitFor();
   const preserved=await page.evaluate(()=>{
    const p=window.preserved;return {hero:p.hero===document.querySelector('.ip-hero'),list:p.list===document.querySelector('[data-practice-list]'),form:p.form===document.querySelector('[data-practice-review="1"]'),other:p.other===document.querySelector('[data-practice-review="2"]'),audio:p.audio===document.querySelector('audio'),time:document.querySelector('audio').currentTime,previousTime:p.time,scroll:scrollY,previousScroll:p.scroll,parentCalls:window.parentCalls};
   });
   for(const key of ['hero','list','form','other','audio'])assert.equal(preserved[key],true,key+' DOM preserved');
   assert(Math.abs(preserved.scroll-preserved.previousScroll)<=1,`saving preserves scroll position at ${width}px: ${preserved.previousScroll} -> ${preserved.scroll}`);
   assert.equal(preserved.time,preserved.previousTime);assert.deepEqual(preserved.parentCalls,['admin_catalog']);
   assert.deepEqual(state.calls.slice(beforeCalls).map(call=>call.action),['admin_review'],'saving does not refetch page/list/details');
   assert.equal(state.calls.at(-1).reviewStatus,'pending','saving corrections does not invent an accuracy classification');
   assert.equal(await page.locator('[data-practice-turn="1"] [data-practice-review-summary]').innerText(),'수정 내용 저장됨');
   assert.equal(await review(1).getAttribute('data-revision'),'2');
   assert.equal(await review(2).locator('[name=note]').inputValue(),'다른 답변의 미저장 메모');
   assert.equal(await page.locator('[data-practice-turn="2"]').evaluate(n=>n.open),true);
   assert.equal(await page.evaluate(()=>window.view.canLeave()),false,'other unsaved answer remains dirty');
   // Save again without reopening, then keep a failed save available for retry.
   await review(1).locator('[data-practice-review-options]>summary').click();
   assert.match(await review(1).locator('[data-practice-review-options]').innerText(),/3명.*30명/);
   await review(1).locator('[name=reviewStatus]').selectOption('meaning');
   await review(1).locator('[name=note]').fill('추가 메모');await save.click();await review(1).getByText('수정 내용을 저장했습니다.').waitFor();
   assert.equal(state.jobs.get(middle)[0].revision,3);
   assert.equal(state.jobs.get(middle)[0].review_status,'meaning');
   assert.equal(await page.locator('[data-practice-turn="1"] [data-practice-review-summary]').innerText(),'단어·숫자가 달라 의미가 바뀜');
   state.reviewError=true;await review(1).locator('[name=correctedText]').fill('실패 시 보존할 답변');await save.click();
   await review(1).getByText(/다른 관리자가 먼저 수정/).waitFor();
   assert.equal(await review(1).locator('[name=correctedText]').inputValue(),'실패 시 보존할 답변');assert.equal(await save.isEnabled(),true);assert.equal(await review(1).getAttribute('data-revision'),'3');
   state.reviewError=false;
   page.once('dialog',dialog=>dialog.dismiss());await button(middle).click();assert.equal(await button(middle).getAttribute('aria-expanded'),'true','cancel retains open edits');
   page.once('dialog',dialog=>dialog.accept());await button(middle).click();assert.equal(await page.locator('[data-practice-detail]').isVisible(),false);
   assert.equal(await button(middle).getAttribute('aria-expanded'),'false');
   // Reopen each end of the list, with the same shared detail node.
   await open(first);
   await review(1).locator('[name=correctedText]').fill('구분 없이 저장한 수정본');
   await review(1).getByRole('button',{name:'수정 내용 저장'}).click();await review(1).getByText('수정 내용을 저장했습니다.').waitFor();
   await button(first).click();await open(first);
   assert.equal(await review(1).locator('[name=correctedText]').inputValue(),'구분 없이 저장한 수정본','unclassified corrections persist when reopened');
   assert.equal(await review(1).locator('[name=reviewStatus]').inputValue(),'pending');
   assert.equal(await review(1).locator('[data-practice-review-options]').evaluate(n=>n.open),false);
   await button(first).evaluate(n=>{n.closest('.ip-practice-record').scrollIntoView({block:'start'});window.scrollBy(0,-12);});
   await page.screenshot({path:path.join(output,`simple-save-${width}.png`)});
   await open(last);
   assert.equal(await button(first).getAttribute('aria-expanded'),'false');
   assert.equal(await page.locator('[data-practice-detail]').evaluate(n=>n.previousElementSibling.querySelector('[data-practice-run]').dataset.practiceRun),last);
   assert.equal(await page.locator('[data-practice-detail]').evaluate(n=>n.nextElementSibling.hasAttribute('class')&&n.nextElementSibling.classList.contains('ip-practice-record-pages')),true);
   await page.locator('[data-practice-turn="3"]>summary').click();await page.locator('[data-practice-retry="3"]').click();await page.locator('[data-practice-turn="3"]').getByText(/전사 순서를 기다리고/).waitFor();
   await page.locator('[data-practice-status-refresh]').click();await review(1).waitFor();
   // A search submit inside the real parent admin must only refresh the records.
   await page.locator('[name=search]').fill('학생');await page.locator('[data-practice-filter]').getByRole('button',{name:'검색',exact:true}).click();
   await button(first).waitFor();assert.equal(await page.locator('[data-practice-detail]').isVisible(),false);assert.deepEqual(await page.evaluate(()=>window.parentCalls),['admin_catalog']);
   assert.deepEqual(state.calls.at(-1),{action:'admin_list',page:0,search:'학생',mode:''});
   await open(first);await page.locator('[data-practice-next]').click();await page.waitForFunction(()=>document.querySelector('[data-practice-prev]')?.disabled===false);
   await open(middle);assert.equal(await page.locator('[data-practice-detail]').isVisible(),true,'detail survives list rebuild');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
   await button(middle).evaluate(n=>{n.closest('.ip-practice-record').scrollIntoView({block:'start'});window.scrollBy(0,-12);});
   await page.screenshot({path:path.join(output,`inline-${width}.png`)});
   // An older network result cannot replace a newly selected recording.
   state.holdGet={id:first};await button(first).click();await page.waitForFunction(()=>document.querySelector('[data-practice-detail]').textContent==='답변을 불러오는 중…');
   await open(last);state.holdGet.release();state.holdGet=null;
   await page.waitForFunction(()=>document.querySelector('[data-practice-run]').disabled===false);
   assert.match(await page.locator('[data-practice-detail] h3').innerText(),/검수 학생 18/);
   await page.evaluate(()=>window.view.destroy());assert.equal(await page.locator('[data-practice-list]').count(),0);
   await mount(false);await open(first);assert.equal(await review(1).getByRole('button',{name:'수정 내용 저장'}).isDisabled(),true);
   assert.equal(await review(1).locator('[name=correctedText]').isDisabled(),true);
   await page.evaluate(()=>window.view.destroy());await context.close();
   cases.push({width,inline:true,parentIsolation:true,scrollPreserved:true,revisions:true,unsavedAnswers:true,playbackPreserved:true,filters:true,pagination:true,staleResponse:true,readOnly:true,optionalAccuracy:true,unclassifiedEditsPersist:true});
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify({cases,errors},null,2));
  console.log('PASS desktop/mobile recording details: inline placement, optional accuracy with examples, unclassified edits persist, parent submit isolation, save/scroll/audio/other edits preserved, repeat saves, failures, filters/pagination, stale responses and read-only access.');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
