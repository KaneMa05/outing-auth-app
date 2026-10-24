'use strict';
// Local-only fixture: embedded Postgres, no cloud connection.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {setup}=require('../tests/interview-preassignments.test.cjs');
const {createHandler}=require('../api/interview-preassignments');
async function start({diagnosisProvider=null}={}){
 const {db,call,invoke,admin,a}=await setup();let origin,failNext=false;
 await call('admin_settings',admin,{revision:(await call('admin_list',admin)).settings.revision,enabled:true,dueAt:'2099-11-09T00:00:00+09:00',revisionDueAt:'2099-11-10T00:00:00+09:00',allowLate:true});
 const handler=createHandler({diagnosisProvider,authenticateWeb:async req=>req.body.studentId==='ip-a'?{id:'ip-a'}:null,previewAllowed:()=>false,
  authenticateAdmin:async req=>{if(!req.headers.cookie?.includes('qa_admin=1'))throw Error('unauthorized');return {id:'qa'};},
  invoke:async(action,actor,body)=>{if(failNext&&['save','admin_guidance_save'].includes(action)){failNext=false;throw Error('temporary_failure');}return call(action,actor,body);}
 });
 const root=path.resolve(__dirname,'..');
 const html=(mode,desktop=false)=>`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>사전과제 로컬 검토</title><link rel="stylesheet" href="/interview-prep.css"><link rel="stylesheet" href="/interview-app.css"><style>body{margin:0;background:#f3f6fa;font-family:'Malgun Gothic',sans-serif}#preview-note{padding:12px;background:#fff3de;font-size:13px}main#app{padding:16px;max-width:1120px;margin:auto}</style><div id="preview-note">로컬 검토용 · 가상 학생 · 운영 DB와 연결되지 않습니다. <a href="/">학생 화면</a> · <a href="/admin">교사 화면</a></div><main id="app"></main><script type="module">
 import {${mode?'mountAdmin':desktop?'mountWorkspace':'mountInterviewApp'}} from '/${mode?'interview-prep-ui':desktop?'interview-workspace':'interview-app-ui'}.js';
 const send=async(url,body)=>{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,${mode?'':"studentId:'ip-a',"}})});const d=await r.json();if(!r.ok||!d.ok)throw Object.assign(Error(d.error),{code:d.error});return d;};
 const request=(action,payload={})=>send('/qa-prep',{...payload,action});
 window.controller=await ${mode?"mountAdmin(document.querySelector('#app'),{request,initialSection:'preassignments',canWrite:true})":desktop?"mountWorkspace(document.querySelector('#app'),{request,aiRequest:send,initialPage:'preassignments'})":"mountInterviewApp(document.querySelector('#app'),{request,aiRequest:send,account:{id:'ip-a',name:'테스트 학생'}})"};window.ready=true;
 </script></html>`;
 const server=http.createServer(async(req,res)=>{try{
  const u=new URL(req.url,origin);res.status=n=>{res.statusCode=n;return res;};res.json=d=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(d));};
  if(req.method==='POST'){
   const chunks=[];for await(const c of req)chunks.push(c);req.body=JSON.parse(Buffer.concat(chunks).toString()||'{}');
   if(u.pathname==='/api/interview-preassignments')return handler(req,res);
   if(u.pathname==='/qa-prep'){const actor=req.body.action.startsWith('admin_')?admin:a;return res.json(await invoke(req.body.action,actor,req.body));}
   if(u.pathname==='/qa-fail-next'){failNext=true;return res.json({ok:true});}
  }
  if(['/','/admin','/desktop'].includes(u.pathname)){res.setHeader('Set-Cookie',`qa_admin=${u.pathname==='/admin'?'1':'0'}; Path=/; SameSite=Lax`);res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html(u.pathname==='/admin',u.pathname==='/desktop'));return;}
  const target=path.resolve(root,'.'+decodeURIComponent(u.pathname));
  if(!target.startsWith(root+path.sep)||!['.js','.css','.png'].includes(path.extname(target))||!fs.existsSync(target)){res.statusCode=404;res.end();return;}
  res.setHeader('Content-Type',target.endsWith('.css')?'text/css':target.endsWith('.png')?'image/png':'text/javascript');res.end(fs.readFileSync(target));
 }catch(e){res.statusCode=500;res.end(JSON.stringify({ok:false,error:e.message}));}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 return {origin,db,call,close:async()=>{await new Promise(resolve=>server.close(resolve));await db.close();}};
}
module.exports={start};
if(require.main===module)start().then(({origin})=>console.log('PREASSIGNMENT_PREVIEW '+origin)).catch(e=>{console.error(e.message);process.exit(1);});
