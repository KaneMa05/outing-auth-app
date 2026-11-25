'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const root=process.cwd(),output=path.join(root,'.tmp/recording-captions-review');fs.mkdirSync(output,{recursive:true});
 const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://local').pathname;
  if(pathname==='/qa'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/interview-portal.css"><link rel="stylesheet" href="/client/interview-practice.css"><body class="ip-portal" style="margin:0"><main id="host"></main></body></html>');}
  const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.statusCode=404;return res.end();}
  res.setHeader('Content-Type',/\.m?js$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':'application/json');res.end(fs.readFileSync(file));
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/qa');
  await page.evaluate(async()=>{
   const {renderPractice}=await import('/client/interview-practice.mjs');const {createRecordingCaptions}=await import('/client/interview-recording-captions.mjs');
   const pcm=new ArrayBuffer(44+71*32000),wav=new DataView(pcm);const str=(offset,value)=>[...value].forEach((c,i)=>wav.setUint8(offset+i,c.charCodeAt(0)));str(0,'RIFF');wav.setUint32(4,pcm.byteLength-8,true);str(8,'WAVEfmt ');wav.setUint32(16,16,true);wav.setUint16(20,1,true);wav.setUint16(22,1,true);wav.setUint32(24,16000,true);wav.setUint32(28,32000,true);wav.setUint16(32,2,true);wav.setUint16(34,16,true);str(36,'data');wav.setUint32(40,pcm.byteLength-44,true);
   window.run={runId:crypto.randomUUID(),turns:[{number:1,question:'협력하여 문제를 해결한 경험을 말해주세요.',duration:71,blob:new Blob([pcm],{type:'audio/wav'})}],questionCount:1,completed:true,mode:'personality',track:'공채'};
   window.captionState='pending';window.fail=false;window.calls=[];
   window.controller=createRecordingCaptions({host:document.querySelector('#host'),intervalMs:100,maxPolls:1000,request:async(url,body)=>{
    window.calls.push({url,...body});if(window.delayed)return new Promise(resolve=>window.releaseCaption=resolve);if(window.fail)throw Error('offline');
    return {ok:true,runId:body.runId,estimate:{state:window.captionState==='completed'?'completed':'pending',minSeconds:60,maxSeconds:120},captions:[{number:1,status:window.captionState,text:window.captionText||''}]};
   }});
   window.draw=()=>{document.querySelector('#host').innerHTML=renderPractice({screen:'result',mode:'personality',run:window.run,fields:[],all:[],catalog:{},favorites:new Set(),records:[],audio:blob=>URL.createObjectURL(blob)});window.controller.show(window.run);};
   window.draw();window.player=document.querySelector('audio');window.player.pause=()=>window.pauseCalls=(window.pauseCalls||0)+1;
  });
  await page.waitForFunction(()=>document.querySelector('[data-caption-text]').textContent.includes('준비 중'));
  assert.match(await page.locator('[data-caption-estimate]').textContent(),/약 1~2분/);
  assert.equal(await page.locator('textarea:visible,input:visible').count(),0);assert.doesNotMatch(await page.locator('#host').textContent(),/점검하기|채점|전사문/);
  await page.screenshot({path:path.join(output,'01-pending-mobile.png'),fullPage:true});
  await page.evaluate(()=>{window.captionState='completed';window.captionText='저는 먼저 역할을 나누고 동료와 함께 문제를 해결했습니다.\n서로 진행 상황을 공유하면서 정해진 시간 안에 일을 마칠 수 있었습니다.';});
  await page.waitForFunction(()=>document.querySelector('[data-caption-text]').textContent.includes('역할을 나누고'));
  assert.equal(await page.evaluate(()=>window.player===document.querySelector('audio')&&!window.pauseCalls&&!window.captionXSS),true);
  assert.equal(await page.locator('[data-recording-caption] img').count(),0);
  assert.equal(await page.locator('[data-caption-overview]:visible').count(),0);assert.equal(await page.locator('[data-caption-refresh]').count(),0);
  await page.screenshot({path:path.join(output,'02-completed-mobile.png'),fullPage:true});
  await page.evaluate(()=>window.captionText+='\n<img src=x onerror="window.captionXSS=true">');await page.evaluate(()=>window.controller.refresh());
  await page.waitForFunction(()=>document.querySelector('[data-caption-text]').textContent.includes('<img'));
  assert.equal(await page.locator('[data-recording-caption] img').count(),0);assert.equal(await page.evaluate(()=>!!window.captionXSS),false);
  await page.evaluate(()=>window.fail=true);await page.evaluate(()=>window.controller.refresh());
  await page.waitForFunction(()=>document.querySelector('[data-caption-status]').textContent.includes('불러오지 못했습니다'));
  assert.match(await page.locator('[data-caption-text]').textContent(),/역할을 나누고/);
  await page.evaluate(()=>{window.fail=false;window.captionText='';});await page.evaluate(()=>window.controller.refresh());
  await page.waitForFunction(()=>document.querySelector('[data-caption-text]').textContent.includes('인식된 음성이 없습니다'));
  await page.evaluate(()=>{window.delayed=true;void window.controller.refresh();});
  await page.waitForFunction(()=>!!window.releaseCaption);
  await page.evaluate(()=>{const previous=window.run.runId;window.run={...window.run,runId:crypto.randomUUID()};window.delayed=false;window.captionText='새 기록의 자막';window.draw();window.releaseCaption({ok:true,runId:previous,captions:[{number:1,status:'completed',text:'이전 기록의 자막'}]});});
  await page.waitForFunction(()=>document.querySelector('[data-caption-text]').textContent==='새 기록의 자막');
  await page.evaluate(()=>window.controller.show(null));const count=await page.evaluate(()=>window.calls.length);await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>window.calls.length),count);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);await page.evaluate(()=>window.controller.destroy());
  console.log('PASS captions browser: pending/completed/empty/error, read-only UI, escaped text, preserved audio nodes, stale-response isolation and stopped polling');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
