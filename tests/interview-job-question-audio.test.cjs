'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const category=process.argv[2]||'job';
assert(['job','personality'].includes(category));
const root=path.resolve(__dirname,'..'),folder=path.join(root,'assets/interview-'+category+'-audio');
const catalog=JSON.parse(fs.readFileSync(path.join(folder,'catalog.json')));
for(const q of catalog.clips){
 assert.match(q.file,new RegExp('^'+q.id+'-[a-f0-9]{16}\\.mp3$'));
 const data=fs.readFileSync(path.join(folder,q.file));
 assert.equal(data.length,q.bytes);assert.equal(crypto.createHash('sha256').update(data).digest('hex'),q.sha256);
}
assert.equal(new Set(catalog.clips.map(q=>q.id)).size,catalog.clips.length);
const sample=process.argv[3]?catalog.clips.find(q=>q.id===process.argv[3]):catalog.clips.find(q=>q.spokenPrompt!==q.prompt);
const expectedTitle=sample?.displayPrompt||sample?.spokenPrompt;
assert(sample,'Exercise a recording whose spoken title differs from the original');
const html=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/interview-prep.css"><main id="admin"></main><script type="module">
import {mountAdmin} from '/interview-prep-ui.js';
const sample=${JSON.stringify(sample).replaceAll('<','\\u003c')};
const question={...sample,category:${JSON.stringify(category)},revision:1,status:'draft',source_count:1,topic_ids:[],tracks:['공채']};
window.view=await mountAdmin(document.querySelector('#admin'),{initialSection:${JSON.stringify(category==='job'?'job':'questions')},request:async(action,body)=>{
 if(action==='admin_catalog')return {enabled:true,topics:[],categoryCounts:{}};
 if(action==='admin_question_detail')return {question,sources:[]};
 if(action==='admin_questions')return {questions:body.category===${JSON.stringify(category)}?[question,{...question,id:'new-job-question',prompt:'새 질문'}]:[{...question,category:${JSON.stringify(category==='job'?'personality':'job')}}]};
 throw Error(action);
}});window.ready=true;
</script>`;
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}
 const file=path.resolve(root,'.'+pathname);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
 const mime={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.mp3':'audio/mpeg'}[path.extname(file)];
 if(!mime){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',mime);res.end(fs.readFileSync(file));
});
(async()=>{
 let browser;
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1280,height:960}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const url='http://127.0.0.1:'+server.address().port;
  await page.goto(url);await page.waitForFunction(()=>window.ready);
  assert.equal(await page.locator('audio').count(),1);await page.getByText('질문 음성 미연결',{exact:true}).waitFor();
  assert.equal((await page.locator('tbody tr').first().locator('td').first().locator('label').innerText()).trim(),expectedTitle);
  await page.getByText('기출 원문',{exact:true}).waitFor();
  const audio=page.locator('audio');assert.equal(await audio.getAttribute('preload'),'none');
  await audio.evaluate(async node=>{await node.play();node.pause();});
  assert((await audio.evaluate(node=>node.duration))>0);
  await page.getByRole('button',{name:'검토·수정'}).first().click();
  const editor=page.locator('[data-editor]').last();
  await editor.getByText('질문 음성 연결됨',{exact:true}).waitFor();
  assert.equal(await editor.locator('[data-question-title]').innerText(),expectedTitle);
  assert.equal(await editor.locator('[name=prompt]').inputValue(),sample.prompt);
  await editor.locator('[name=prompt]').fill('수정된 질문입니다.');
  await editor.getByText('질문이 변경되어 음성 재연결이 필요합니다.',{exact:true}).waitFor();
  assert.equal(await editor.locator('audio').count(),0);
  await editor.locator('[name=prompt]').fill(sample.prompt);assert.equal(await editor.locator('audio').count(),1);
  await page.setViewportSize({width:390,height:844});
  assert(await page.locator('[data-content] audio').evaluate(node=>node.getBoundingClientRect().width>=250));
  assert(await editor.locator('audio').evaluate(node=>node.getBoundingClientRect().width<=node.parentElement.getBoundingClientRect().width));
  await page.screenshot({path:'/private/tmp/interview-'+category+'-question-audio-mobile.png',fullPage:true});
  await page.evaluate(section=>window.view.openSection(section),category==='job'?'questions':'job');assert.equal(await page.locator('audio').count(),0);
  await page.route('**/assets/interview-'+category+'-audio/catalog.json',route=>route.fulfill({status:503,body:'unavailable'}));
  await page.reload();await page.waitForFunction(()=>window.ready);await page.getByText(/질문 음성 목록을 불러오지 못했습니다/).first().waitFor();
  assert.equal(await page.getByRole('button',{name:'검토·수정'}).count(),2);
  await page.unroute('**/assets/interview-'+category+'-audio/catalog.json');
  await page.getByRole('button',{name:'검토·수정'}).first().click();await page.locator('[data-editor]').last().getByText('질문 음성 연결됨',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);
  console.log('PASS '+catalog.clips.length+' '+category+' audio checksums; browser playback, list/detail linkage, prompt changes, missing audio, mobile sizing, category isolation and catalog failure recovery.');
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
