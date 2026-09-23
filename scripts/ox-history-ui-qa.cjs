// Production learner module and styles with isolated synthetic, in-memory records.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.tmp/ox-history-qa');
fs.mkdirSync(out,{recursive:true});
const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/criminal-law-ox.css"><body><main class="criminal-law-ox-local-page" style="max-width:640px;margin:16px auto;padding:12px"><div id="host"></div></main><script type="module">
import {mount} from '/criminal-law-ox.js';
const records=Array.from({length:20},(_,i)=>({id:'q'+i,chapter_id:'c',version:1,prompt:'검증용 지문 '+(i+1),context:'',correct_answer:'O',explanation_html:'검증용 해설',number:i+1}));
let progress=records.map((q,i)=>({question_id:q.id,answer:'O',correct:true,wrong_count:i<8?(i===0?4:1):0}));
let notes=records.slice(0,8).map(q=>({question_id:q.id,mastered_version:1,memo:'보존할 메모',bookmark:true}));
window.calls=[];window.failText=false;
async function request(action,body){
  window.calls.push({action,body});
  await new Promise(r=>setTimeout(r,10));
  if(action==='questions'){
    if(window.failText){window.failText=false;throw Error('검증용 조회 실패');}
    return {questions:body.questions.map(v=>{const q=records.find(q=>q.id===v.id);return {id:q.id,version:1,prompt:q.prompt,context:q.context};})};
  }
  const q=records.find(q=>q.id===body.questionId),p=progress.find(p=>p.question_id===q.id),n=notes.find(n=>n.question_id===q.id);
  if(action==='note'){if('mastered' in body)n.mastered_version=body.mastered?1:null;return {note:{...n}};}
  if(action==='detail')return {question:{...q},note:{...n}};
  if(action==='submit'){p.answer=body.answer;p.correct=body.answer==='O';if(!p.correct){p.wrong_count++;n.mastered_version=null;}return {question:{...q},progress:{...p},note:{...n},statistics:{answered:10,wrong:4}};}
  throw Error('Unexpected request: '+action);
}
window.show=(category='lecture')=>{
  document.body.className=category==='offline'?'student-mode':'student-mode student-online-mode'+(category==='lecture'?' student-lecture-mode':'');
  mount(document.querySelector('#host'),{bootstrap:{catalog:{collections:[{id:'criminal-law',name:'형법',scope:'형법',accessible:true}],chapters:[{id:'c',collection_id:'criminal-law',display_name:'형법의 적용범위',part_title:'형법총론',question_count:50}],questions:records.map(q=>({id:q.id,chapter_id:q.chapter_id,version:1,number:q.number}))},progress:structuredClone(progress),notes:structuredClone(notes),todayCount:20},request});
};
window.show();window.ready=true;
</script></body></html>`;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  let server,browser,ws;
  try{
    server=http.createServer((req,res)=>{
      const url=new URL(req.url,'http://localhost');
      if(url.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);}
      const files={'/styles.css':'text/css','/criminal-law-ox.css':'text/css','/criminal-law-ox.js':'text/javascript','/fonts/NanumGothic-Regular.woff':'font/woff','/fonts/NanumGothic-Bold.woff':'font/woff','/fonts/GongGothicLight.woff':'font/woff'};
      if(files[url.pathname]){res.setHeader('Content-Type',files[url.pathname]);return res.end(fs.readFileSync(path.join(root,url.pathname.slice(1))));}
      res.statusCode=404;res.end();
    });
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    browser=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+path.join(out,'browser-'+Date.now()),'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
    const endpoint=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('Chrome startup timeout')),15000);browser.stderr.on('data',b=>{output+=b;const m=output.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m){clearTimeout(timer);resolve(m[1]);}});browser.on('error',reject);});
    const tabs=await(await fetch('http://'+new URL(endpoint).host+'/json')).json();
    ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
    let id=0;const pending=new Map(),errors=[];
    ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}});
    const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
    const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
    const wait=async expression=>{for(let n=0;n<100;n++){if(await evaluate(expression))return;await delay(30);}throw Error('Timeout: '+expression);};
    const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
    await send('Runtime.enable');await send('Page.enable');
    await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}`});await wait('window.ready');
    for(const category of ['offline','online','lecture']){
      await evaluate(`show('${category}')`);
      await click('[data-ox-route="weak"]');
      for(const width of [320,390,768]){
        await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:true});
        assert.equal(await evaluate("document.querySelector('.ox-weak-rate').textContent"),'40%');
        assert.equal(await evaluate("document.querySelector('.ox-weak-status').textContent"),'취약 이력');
        await evaluate("document.querySelector('[data-weak-chapter]').open=true");
        assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth+1'),true,category+' '+width+' overflow');
        if(width<=390){const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(out,category+'-'+width+'.png'),Buffer.from(shot.data,'base64'));}
      }
    }
    await click('[data-action="weak-view"][data-view="current"]');
    assert.equal(await evaluate("document.querySelector('.ox-weak-rate').textContent"),'100%');
    await click('[data-action="weak-view"][data-view="history"]');
    await evaluate("document.querySelector('[data-weak-chapter]').open=true");
    await click('[data-action="history-chapter"]');await wait("document.querySelectorAll('[data-review-question]').length===8");
    assert.equal(await evaluate("document.querySelectorAll('[data-action=master]').length"),8,'completed items remain visible');
    assert.deepEqual(await evaluate("calls.filter(c=>c.action==='questions').at(-1).body.questions.map(q=>q.id).sort()"),['q0','q1','q2','q3','q4','q5','q6','q7']);
    await click('[data-action="history-status"][data-status="wrong"]');
    assert.equal(await evaluate("document.querySelectorAll('[data-review-question]').length"),0);
    await click('[data-action="history-status"][data-status="regained"]');await click('[data-action="history-repeat"]');
    assert.equal(await evaluate("document.querySelectorAll('[data-review-question]').length"),1);
    await click('[data-action="review-all"]');await wait("document.querySelector('.ox-quiz-count')");
    assert.equal(await evaluate("document.querySelector('.ox-quiz-count').textContent.replace(/\\s/g,'')"),'1/1');
    assert.equal(await evaluate("document.querySelector('.ox-explanation')===null"),true,'answers remain hidden during replay');
    await click('[data-action="answer"][data-answer="O"]');await wait("document.querySelector('.ox-correct')");
    await click('[data-action="next"]');await click('[data-ox-route="review"]');await wait("document.querySelectorAll('[data-review-question]').length===1");
    assert.equal(await evaluate("document.querySelector('.ox-content h2').textContent"),'형법의 적용범위','return preserves chapter and filter');
    await click('[data-action="master"]');await wait("document.querySelector('[data-action=master]').textContent==='복습 완료'");
    await click('[data-action="master"]');await wait("document.querySelector('[data-action=master]').textContent==='완료 취소'");
    await click('[data-ox-route="weak"]');
    assert.equal(await evaluate("document.querySelector('.ox-weak-rate').textContent"),'40%');
    await evaluate("show('lecture')");await click('[data-ox-route="weak"]');
    assert.equal(await evaluate("document.querySelector('.ox-weak-rate').textContent"),'40%','remount preserves history');
    await evaluate("document.querySelector('[data-weak-chapter]').open=true;window.failText=true");
    await click('[data-action="history-chapter"]');await wait("document.querySelector('[data-action=retry-questions]')");
    await click('[data-action="retry-questions"]');await wait("document.querySelectorAll('[data-review-question]').length===8");
    await click('.ox-nav [data-ox-route="review"]');
    assert.equal(await evaluate("document.querySelectorAll('[data-review-question]').length"),0,'normal review still hides completed items');
    await click('[data-action="review-mode"][data-mode="history"]');await wait("document.querySelectorAll('[data-review-question]').length===8");
    await click('[data-action="history-repeat"]');await click('[data-action="review-all"]');await wait("document.querySelector('.ox-quiz-count')");
    await click('[data-action="answer"][data-answer="X"]');await wait("document.querySelector('.ox-incorrect')");
    await click('[data-action="leave"]');await wait("document.querySelector('[data-review-question]')");
    assert.equal(await evaluate("document.querySelector('[data-action=master]').textContent"),'복습 완료','new wrong clears completion');
    await click('[data-ox-route="weak"]');
    assert.equal(await evaluate("document.querySelector('.ox-weak-rate').textContent"),'40%','repeated wrong does not duplicate historical question');
    assert.deepEqual(errors,[]);
    console.log('PASS: 3 student themes × 3 widths; completed history, filters, lazy load/retry, replay, return scope, remount, re-wrong. Screenshots: '+out);
  }finally{if(ws)ws.close();if(browser)browser.kill();if(server)await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
