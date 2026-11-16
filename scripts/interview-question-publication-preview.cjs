'use strict';
// Loopback-only fixture. Never connects to a deployed app or real student data.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {createPublicationFixture}=require('../tests/helpers/interview-publication-fixture.cjs');
async function start(){
 const fixture=await createPublicationFixture(),root=path.resolve(__dirname,'..');
 const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>면접 질문 공개 승인 · 로컬 검증</title><link rel="stylesheet" href="/interview-prep.css"><style>body{margin:0;background:#f3f6fa;font-family:system-ui,sans-serif}header,#student-preview{margin:20px;padding:20px;background:white;border-radius:14px}header p{color:#5b6570}#admin{padding:20px}#student-preview li{padding:8px}button{cursor:pointer}</style></head><body>
 <header><h1>면접 질문 공개 승인</h1><p>로컬 가상 자료입니다. 운영 데이터와 연결되지 않습니다. 검증 중 확인창은 자동 확인됩니다.</p><button id="personality">인성 질문</button> <button id="job">직무 질문</button> <button id="core">핵심인성</button> <a href="/?readonly=1">읽기 전용 확인</a><p id="confirmation" role="status"></p></header>
 <section id="student-preview"><h2>수강생에게 보이는 질문</h2><ul id="student-questions"></ul></section><main id="admin"></main>
 <script type="module">
 import {mountAdmin} from '/interview-prep-ui.js';
 const send=async(route,body)=>{const r=await fetch(route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),data=await r.json();if(!r.ok)throw Object.assign(Error(data.error),{code:data.error});return data;};
 const renderStudent=async()=>{const list=document.querySelector('#student-questions');list.replaceChildren();for(const category of ['personality','job']){const r=await send('/qa/student',{action:'questions',category});for(const q of r.questions){const li=document.createElement('li');li.textContent=(category==='job'?'직무: ':'인성: ')+q.prompt;list.append(li);}}if(!list.children.length)list.textContent='공개 승인된 질문이 없습니다.';};
 window.confirm=message=>{document.querySelector('#confirmation').textContent=message;return true;};
 const view=await mountAdmin(document.querySelector('#admin'),{canWrite:!new URLSearchParams(location.search).has('readonly'),initialSection:'questions',request:async(action,body={})=>{const r=await send('/qa/admin',{action,...body});await renderStudent();return r;}});
 for(const section of ['personality','job','core'])document.querySelector('#'+section).onclick=()=>view.openSection(section==='personality'?'questions':section);
 await renderStudent();
 </script></body></html>`;
 const server=http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://localhost');
   if(req.method==='POST'&&['/qa/admin','/qa/student'].includes(url.pathname)){
    let raw='';for await(const c of req){raw+=c;if(raw.length>40000)throw Error('invalid_request');}
    const {action,...body}=JSON.parse(raw);
    if(url.pathname==='/qa/student'&&action!=='questions')throw Error('forbidden');
    const data=await fixture.invoke(action,url.pathname==='/qa/admin'?fixture.admin:fixture.student,body);
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));return;
   }
   if(url.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}
   const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
   if(!file.startsWith(root+path.sep)||!['.js','.mjs','.css'].includes(path.extname(file))||path.basename(file)==='config.js'||!fs.existsSync(file)){
    res.writeHead(404);res.end('Not found');return;
   }
   res.setHeader('Content-Type',file.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8');res.end(fs.readFileSync(file));
  }catch(error){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}));}
 });
 try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});}
 catch(error){await fixture.db.close();throw error;}
 return {url:'http://127.0.0.1:'+server.address().port,close:async()=>{await new Promise(r=>server.close(r));await fixture.db.close();}};
}
module.exports={start};
if(require.main===module)start().then(server=>{console.log(server.url);for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await server.close();process.exit(0);});}).catch(error=>{console.error(error);process.exitCode=1;});
