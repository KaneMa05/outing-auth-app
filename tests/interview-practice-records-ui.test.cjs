'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {execFileSync}=require('node:child_process'),os=require('node:os');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const root=path.resolve(__dirname,'..');let browser;
 const audioDir=fs.mkdtempSync(path.join(os.tmpdir(),'ronpark-aac-ui-'));
 let aac;
 const server=http.createServer((req,res)=>{
  const file={'/interview-practice-admin-ui.js':'interview-practice-admin-ui.js','/interview-prep.css':'interview-prep.css'}[req.url?.split('?')[0]];
  if(file){res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(path.join(root,file)));return;}
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="ko"><meta charset="utf-8"><link rel="stylesheet" href="/interview-prep.css"><body style="margin:32px;background:#f6f8fa"><h1>녹음 기록</h1><main class="ip-root" id="host"></main></body></html>');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const page=await browser.newPage({viewport:{width:1280,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const pcm=Buffer.alloc(64000),header=Buffer.alloc(44);
  for(let i=0;i<32000;i++)pcm.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*440/16000)*12000),i*2);
  header.write('RIFF');header.writeUInt32LE(pcm.length+36,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);
  header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);header.writeUInt32LE(16000,24);header.writeUInt32LE(32000,28);
  header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(pcm.length,40);
  fs.writeFileSync(path.join(audioDir,'test.wav'),Buffer.concat([header,pcm]));
  execFileSync('/usr/bin/afconvert',[path.join(audioDir,'test.wav'),path.join(audioDir,'test.m4a'),'-f','m4af','-d','aac','-b','32000','-c','1']);
  aac=fs.readFileSync(path.join(audioDir,'test.m4a'));
  await page.route('https://test.supabase.co/storage/v1/object/sign/interview-practice/**',async route=>{
   await route.fulfill({status:200,contentType:'audio/mp4',body:aac});
  });
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.evaluate(async()=>{
   const {mountPracticeRecords}=await import('/interview-practice-admin-ui.js');window.calls=[];
   const run={id:'c70e09d2-1020-4015-9899-d7a909ca773d',student_id:'test',student_name:'베타 학생 <테스트>',exam_number:'B-100',recorded_at:'2026-11-16T08:00:00Z',mode:'job',track:'공채',field_label:'형사법·수사절차',region:'서해',question_count:3,answer_count:3,uploaded_count:2,answer_seconds:165,finished:true,completed:true};
   const transcript={status:'completed',model:'Whisper large-v3',transcript:'보고하지 않습니다. <img src=x onerror="window.bad=true">',segments:[{start:0,end:1,text:'보고하지 않습니다. <img src=x onerror="window.bad=true">'}],revision:1,review_status:'pending',corrected_text:'',review_note:''};
   window.transcript=transcript;
   window.view=await mountPracticeRecords(document.querySelector('#host'),{request:async(action,body)=>{
    window.calls.push({action,body});
    if(action==='admin_list')return {ok:true,runs:body.search==='없음'?[]:[run],hasMore:body.page===0};
    if(action==='admin_get')return {ok:true,run,turns:[
     {number:1,question:'현장에서 먼저 확인해야 할 사항은 무엇인가요?',answer:'상황을 확인하고 보고합니다.',duration:60,audio_bytes:32044,uploaded:true,transcription:structuredClone(transcript)},
     {number:2,question:'<img src=x onerror="window.bad=true">',answer:'',duration:45,audio_bytes:32044,uploaded:true,transcription:{status:'failed',attempts:3}},
     {number:3,question:'다음 조치는 무엇인가요?',answer:'',duration:60,audio_bytes:32044,uploaded:false}]};
    if(action==='admin_audio')return {ok:true,url:'https://test.supabase.co/storage/v1/object/sign/interview-practice/'+body.runId+'/'+body.number+'.m4a?token=fake'};
    if(action==='admin_review'){if(body.revision!==transcript.revision)throw Object.assign(Error('revision_conflict'),{code:'revision_conflict'});Object.assign(transcript,{revision:transcript.revision+1,review_status:body.reviewStatus,corrected_text:body.correctedText,review_note:body.note,reviewed_at:new Date().toISOString()});return {ok:true};}
    if(action==='admin_retry')return {ok:true};
    throw Error('unexpected');
   }});
  });
  assert.match(await page.locator('[data-practice-list]').innerText(),/베타 학생 <테스트>/);
  assert.equal(await page.locator('[data-practice-prev]').isDisabled(),true);
  await page.locator('[data-practice-run]').click();await page.locator('[data-practice-listen="1"]').waitFor();
  assert.equal(await page.locator('[data-practice-listen]').count(),2);
  await page.locator('[data-practice-turn="3"]>summary').click();
  assert.match(await page.locator('[data-practice-detail]').innerText(),/녹음 전송 대기 중/);
  assert.equal(await page.locator('[data-practice-detail] img').count(),0);
  await page.locator('[data-practice-listen="1"]').click();await page.locator('[data-practice-audio="1"] audio').waitFor();
  assert.equal(await page.locator('audio').getAttribute('preload'),'none');assert.equal(await page.locator('audio').getAttribute('autoplay'),null);
  await page.locator('audio').evaluate(a=>a.play());
  await page.waitForFunction(()=>document.querySelector('audio').currentTime>0);
  assert(Math.abs((await page.locator('audio').evaluate(a=>a.duration))-2)<0.2);
  const review=page.locator('[data-practice-review="1"]');
  await review.locator('textarea[name=correctedText]').fill('보고합니다.');await review.locator('select[name=reviewStatus]').selectOption('meaning');
  assert.equal(await page.evaluate(()=>window.view.canLeave()),false);
  await review.getByRole('button',{name:'검수 저장'}).click();await review.getByText('검수를 저장했습니다.').waitFor();
  assert.equal(await page.evaluate(()=>window.view.canLeave()),true);assert.match(await page.locator('.ip-practice-segments').innerText(),/보고하지 않습니다/);
  await page.locator('[data-practice-status-refresh]').click();await page.waitForFunction(()=>document.querySelector('textarea[name=correctedText]').value==='보고합니다.');
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.setViewportSize({width:1280,height:1000});
  const shot=path.join(root,'.tmp/practice-archive-admin.png');await page.screenshot({path:shot,fullPage:true});
  await page.locator('[data-practice-listen="1"]').click();await page.locator('audio').evaluate(a=>a.play());
  await page.locator('[data-practice-turn="2"]>summary').click();
  await page.locator('[data-practice-listen="2"]').click();await page.locator('[data-practice-audio="2"] audio').waitFor();
  assert.equal(await page.locator('[data-practice-audio="1"] audio').evaluate(a=>a.paused),true);
  await page.locator('[data-practice-next]').click();
  assert.equal((await page.evaluate(()=>window.calls.at(-1))).body.page,1);
  await page.locator('input[name=search]').fill('없음');await page.locator('select[name=mode]').selectOption('personality');await page.getByRole('button',{name:'검색',exact:true}).click();
  await page.getByText('조건에 맞는 연습 기록이 없습니다.').waitFor();
  const last=await page.evaluate(()=>window.calls.at(-1));assert.deepEqual(last.body,{page:0,search:'없음',mode:'personality'});
  await page.evaluate(()=>window.view.destroy());assert.equal(await page.locator('#host').innerHTML(),'');
  assert.deepEqual(errors,[]);
  console.log('PASS admin browser: student display/XSS, every uploaded answer, pending audio, actual AAC playback, pagination, search/type filters and teardown; screenshot '+shot);
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(audioDir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
