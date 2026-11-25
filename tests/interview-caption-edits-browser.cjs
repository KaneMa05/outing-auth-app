'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const root=process.cwd(),output=path.join(root,'.tmp/recording-captions-review');fs.mkdirSync(output,{recursive:true});
 const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://local').pathname;
  if(name==='/qa'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/interview-portal.css"><link rel="stylesheet" href="/interview-prep.css"><link rel="stylesheet" href="/client/interview-practice.css"><body class="ip-portal"><main id="host"></main><main id="admin" class="ip-root"></main></body></html>');}
  const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.statusCode=404;return res.end();}res.setHeader('Content-Type',/\.m?js$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':'application/json');res.end(fs.readFileSync(file));
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port+'/qa');
  await page.evaluate(async()=>{
   const {renderPractice}=await import('/client/interview-practice.mjs'),{createRecordingCaptions}=await import('/client/interview-recording-captions.mjs');
   window.run={runId:crypto.randomUUID(),mode:'personality',turns:[{number:1,question:'협력하여 문제를 해결한 경험을 말해주세요.',duration:71,blob:new Blob([new Uint8Array(45)])}],questionCount:1,completed:true,track:'공채'};
   const data=new ArrayBuffer(44+71*32000),wav=new DataView(data),str=(offset,value)=>[...value].forEach((c,i)=>wav.setUint8(offset+i,c.charCodeAt(0)));str(0,'RIFF');wav.setUint32(4,data.byteLength-8,true);str(8,'WAVEfmt ');wav.setUint32(16,16,true);wav.setUint16(20,1,true);wav.setUint16(22,1,true);wav.setUint32(24,16000,true);wav.setUint32(28,32000,true);wav.setUint16(32,2,true);wav.setUint16(34,16,true);str(36,'data');wav.setUint32(40,data.byteLength-44,true);window.run.turns[0].blob=new Blob([data],{type:'audio/wav'});
   window.asr='저는 역할을 나누고 동료와 문제를 해결했습니다.';window.serverRow={number:1,status:'completed',text:window.asr,studentText:null,studentRevision:0,studentUpdatedAt:null};
   document.querySelector('#host').innerHTML=renderPractice({screen:'result',mode:'personality',run:window.run,fields:[],all:[],catalog:{},favorites:new Set(),records:[],audio:blob=>URL.createObjectURL(blob)});
   window.controller=createRecordingCaptions({host:document.querySelector('#host'),request:async(_url,body)=>{
    if(body.action==='caption_update'){
     if(window.serverRow.studentRevision!==body.studentRevision)throw Object.assign(Error('revision_conflict'),{code:'revision_conflict'});
     window.serverRow={...window.serverRow,studentText:body.text,studentRevision:body.studentRevision+1,studentUpdatedAt:new Date().toISOString()};return {ok:true,runId:body.runId,caption:{...window.serverRow}};
    }
    if(window.delayed)return new Promise(resolve=>window.releaseCaption=resolve);
    return {ok:true,runId:body.runId,estimate:{state:'completed'},captions:[{...window.serverRow}]};
   }});window.controller.show(window.run);window.player=document.querySelector('audio');
  });
  await page.locator('[data-caption-action=edit]:visible').click();const input=page.locator('[data-caption-input]:visible');
  await input.fill('제가 실제로 말한 내용입니다.');await page.evaluate(()=>{window.serverRow={...window.serverRow,studentText:'다른 창에서 먼저 고친 자막',studentRevision:1,studentUpdatedAt:new Date().toISOString()};void window.controller.refresh();});
  await page.waitForFunction(()=>document.querySelector('[data-caption-text]').textContent.includes('다른 창'));
  assert.equal(await input.inputValue(),'제가 실제로 말한 내용입니다.');
  await page.locator('[data-caption-action=save]:visible').click();await page.waitForFunction(()=>document.querySelector('[data-caption-save-status]').textContent.includes('먼저 수정'));
  assert.equal(await input.inputValue(),'제가 실제로 말한 내용입니다.');await page.locator('[data-caption-action=cancel]:visible').click();
  await page.locator('[data-caption-action=edit]:visible').click();await input.fill('저는 역할을 나누고 동료와 함께 문제를 해결했습니다.\n서로 진행 상황을 공유했습니다.');
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(output,'03-student-edit-mobile.png'),fullPage:true});
  await page.locator('[data-caption-action=save]:visible').click();await page.waitForFunction(()=>document.querySelector('[data-caption-edited]').textContent.includes('직접 수정'));
  assert.equal(await page.locator('[data-caption-input]:visible').count(),0);assert.equal(await page.evaluate(()=>window.serverRow.studentRevision),2);assert.equal(await page.evaluate(()=>window.asr===window.serverRow.text),true);
  // A delayed poll must not replace the correction saved after that poll began.
  const stale=await page.evaluate(()=>({ok:true,runId:window.run.runId,captions:[{...window.serverRow}],estimate:{state:'completed'}}));
  await page.evaluate(()=>{window.delayed=true;void window.controller.refresh();});await page.waitForFunction(()=>!!window.releaseCaption);
  await page.locator('[data-caption-action=edit]:visible').click();await input.fill('최종 수정본 <img src=x onerror="window.captionXSS=true">');await page.locator('[data-caption-action=save]:visible').click();
  await page.waitForFunction(()=>window.serverRow.studentRevision===3);await page.evaluate(value=>window.releaseCaption(value),stale);
  await page.waitForFunction(()=>document.querySelector('[data-caption-text]').textContent.startsWith('최종 수정본'));assert.equal(await page.locator('[data-recording-caption] img').count(),0);
  assert.equal(await page.evaluate(()=>window.player===document.querySelector('audio')&&!window.captionXSS),true);
  await page.evaluate(()=>{window.delayed=false;});
  await page.locator('[data-caption-action=edit]:visible').click();await input.fill('저는 역할을 나누고 동료와 함께 문제를 해결했습니다.\n서로 진행 상황을 공유하면서 정해진 시간 안에 일을 마쳤습니다.');await page.locator('[data-caption-action=save]:visible').click();
  await page.waitForFunction(()=>window.serverRow.studentRevision===4);
  // The existing administrator view receives both ASR and student correction.
  await page.evaluate(async()=>{
   const {mountPracticeRecords}=await import('/interview-practice-admin-ui.js');window.adminView=await mountPracticeRecords(document.querySelector('#admin'),{canWrite:false,request:async(action)=>{
    const run={id:window.run.runId,student_name:'검증 수강생',mode:'personality',track:'공채',recorded_at:new Date().toISOString(),answer_count:1,question_count:1,uploaded_count:1,answer_seconds:71,completed:true};
    if(action==='admin_list')return {ok:true,runs:[run],hasMore:false};
    return {ok:true,run,turns:[{number:1,question:window.run.turns[0].question,duration:71,uploaded:true,transcription:{status:'completed',transcript:window.asr,segments:[],revision:1,review_status:'pending',corrected_text:'',review_note:'',student_text:window.serverRow.studentText,student_updated_at:window.serverRow.studentUpdatedAt}}]};
   }});
  });await page.locator('[data-practice-run]').click();await page.locator('[data-student-caption]').waitFor();
  assert.match(await page.locator('[data-student-caption]').textContent(),/함께 문제를 해결/);assert.match(await page.locator('.ip-practice-segments').textContent(),/역할을 나누고/);assert.equal(await page.locator('[data-student-caption] img').count(),0);
  await page.setViewportSize({width:1280,height:1000});await page.locator('#admin').screenshot({path:path.join(output,'04-admin-student-correction.png')});
  assert.deepEqual(errors,[]);await page.evaluate(()=>{window.controller.destroy();window.adminView.destroy();});
  console.log('PASS caption editor browser: drafts survive polling/conflict, corrections save separately, stale polls cannot overwrite saves, HTML stays text, audio stays mounted and administrator sees original plus student correction');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
