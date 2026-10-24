'use strict';
// Synthetic UI/queue preview only: never connects to the production database or AI.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {fixture,rawReport}=require('../tests/core25-pc-worker.test.cjs');
const {run}=require('./core25-pc-worker.cjs');
(async()=>{
 const x=await fixture(),root=path.resolve(__dirname,'..'),stop=new AbortController();
 const loop=run({request:x.request,signal:stop.signal,pollMs:2000,provider:async s=>{await new Promise(r=>setTimeout(r,7000));return rawReport(s);}});
 const server=http.createServer(async(req,res)=>{try{
  res.status=n=>{res.statusCode=n;return res;};res.json=d=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(d));};
  if(req.method==='POST'&&req.url==='/api/interview-preassignments'){
   let body='';for await(const c of req){body+=c;if(body.length>65000)throw Error('large');}req.body=JSON.parse(body);return x.student(req,res);
  }
  if(req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>핵심 25제 PC 실행기 검증</title><style>body{font-family:'Malgun Gothic',sans-serif;background:#f4f6fa;margin:0}header{background:#fff1d4;padding:12px}main{max-width:1040px;margin:auto;padding:20px}</style><header>로컬 검증 · 가상 학생과 가상 진단 결과 · 운영 DB·실제 AI에 연결하지 않습니다.</header><main id="app"></main><script type="module">import {mountPreassignments} from '/interview-preassignments.js';await mountPreassignments(document.getElementById('app'));</script></html>`);}
  const target=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));
  if(!target.startsWith(root+path.sep)||!['.js','.css','.png'].includes(path.extname(target))||!fs.existsSync(target)){res.statusCode=404;return res.end();}
  res.setHeader('Content-Type',{'.js':'text/javascript','.css':'text/css','.png':'image/png'}[path.extname(target)]);res.end(fs.readFileSync(target));
 }catch{res.statusCode=500;res.end('local_preview_error');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));console.log('CORE25_PC_PREVIEW http://127.0.0.1:'+server.address().port);
 async function close(){stop.abort();server.close();await loop;await x.db.close();}
 process.once('SIGINT',close);process.once('SIGTERM',close);
})().catch(e=>{console.error(e.message);process.exitCode=1;});
