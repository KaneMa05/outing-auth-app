'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const auth=require('../../api/teacher-auth-utils');
const noticesHandler=require('../../api/notices');
const {createHandler}=require('../../api/interview-prep');
const migration=fs.readFileSync(path.join(__dirname,'../../supabase/migrations/20261118064237_interview_notices.sql'),'utf8');
async function setup({migrate=true}={}){
 const {PGlite}=require(process.env.PGLITE_MODULE||'C:/Users/Public/Documents/ESTsoft/CreatorTemp/ox-db-tools/node_modules/@electric-sql/pglite');
 const db=new PGlite();
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
 const schema=fs.readFileSync(path.join(__dirname,'../../supabase/schema.sql'),'utf8');
 const createTable=schema.slice(schema.indexOf('create table if not exists public.notices ('),schema.indexOf('alter table public.notices'));
 await db.exec(createTable);
 if(migrate)await db.exec(migration);
 const originalFetch=global.fetch,envKeys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','TEACHER_SESSION_SECRET'];
 const originalEnv=Object.fromEntries(envKeys.map(key=>[key,process.env[key]]));
 Object.assign(process.env,{SUPABASE_URL:'https://notice-fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'local-test-only',TEACHER_SESSION_SECRET:'local-notice-test-only'});
 const token=permissions=>auth.createSessionToken(process.env.TEACHER_SESSION_SECRET,{username:'qa-admin',role:'admin',permissions});
 const adminCookie=auth.COOKIE_NAME+'='+token(['*']);
 let failRead=false,failWrite=false,readCount=0;
 async function read(method,route,body){
  const url=new URL(route,'https://notice-fixture.invalid/');
  const table=url.pathname.slice(1);
  if(!['notices','interview_notices'].includes(table))throw Error('unexpected_fixture_route');
  if(method==='GET'){
   readCount++;if(failRead)throw Error('temporary_read_failure');
   const id=url.searchParams.get('id')?.slice(3);
   const fields=url.searchParams.get('select')||'*';
   if(!/^(\*|[a-z_,]+)$/.test(fields))throw Error('invalid_fields');
   const rows=(await db.query(`select ${fields} from ${table} ${id?'where id=$1':''} order by created_at desc,id asc`,id?[id]:[])).rows;
   return url.searchParams.has('is_published')?rows.filter(row=>row.is_published):rows;
  }
  if(failWrite)throw Error('temporary_write_failure');
  const id=url.searchParams.get('id')?.slice(3);
  if(method==='DELETE')return db.query(`delete from ${table} where id=$1`,[id]);
  const keys=Object.keys(body);if(keys.some(key=>!['id','title','body','image_path','target_audience','is_published','created_at','updated_at'].includes(key)))throw Error('invalid_fields');
  if(method==='POST')await db.query(`insert into ${table} (${keys.join(',')}) values (${keys.map((_,i)=>'$'+(i+1)).join(',')})`,keys.map(key=>body[key]));
  else if(method==='PATCH')await db.query(`update ${table} set ${keys.map((key,i)=>key+'=$'+(i+1)).join(',')} where id=$${keys.length+1}`,keys.map(key=>body[key]).concat(id));
  else throw Error('unexpected_fixture_method');
  return null;
 }
 global.fetch=async(url,options)=>{
  const parsed=new URL(url);if(parsed.origin!=='https://notice-fixture.invalid'||!parsed.pathname.startsWith('/rest/v1/'))throw Error('fixture_prevents_network');
  const result=await read(options.method,parsed.pathname.slice('/rest/v1/'.length)+parsed.search,options.body?JSON.parse(options.body):undefined);
  return {ok:true,status:result===null?204:200,json:async()=>result};
 };
 const studentHandler=createHandler({read,previewAllowed:()=>false,authenticateWeb:async req=>req.headers.cookie?.includes('qa_student=1')?{id:'qa-student'}:null,
  invoke:async(action,actor)=>{if(actor.type!=='student')throw Error('forbidden');if(action==='mock_status')return {ok:true,allowed:false};if(action==='bootstrap')return {ok:true,member:{},topics:[],notes:[]};if(action==='life_get')return {ok:true,profile:{}};if(action==='writing_list')return {ok:true,writings:[]};throw Error('unexpected_action');}});
 async function call(handler,body,cookie=''){
  let status,data;await handler({method:'POST',headers:{host:'notice-fixture.invalid',cookie},body},{setHeader(){},status(value){status=value;return this;},json(value){data=value;}});
  return {status,data};
 }
 return {db,read,migration,adminCookie,token,noticesHandler,studentHandler,call,get readCount(){return readCount;},setReadFailure(value){failRead=value;},setWriteFailure(value){failWrite=value;},async close(){global.fetch=originalFetch;for(const key of envKeys){if(originalEnv[key]===undefined)delete process.env[key];else process.env[key]=originalEnv[key];}await db.close();}};
}
function sharedFunctions(){
 const source=fs.readFileSync(path.join(__dirname,'../../shared.js'),'utf8');
 return ['el','panel','field','input','button','table','labelTableRows','formData','createId','formatDateCompact','normalizeNoticeTargetAudience','getNoticeTargetAudienceValues','getNoticeTargetAudienceLabel','noticeMatchesStudentCategory','getImportantNotices','getImportantNoticeById','removeLegacySampleNotices','mapNoticeFromRemote','getNoticeImageUrl'].map(name=>{
  const start=source.indexOf('function '+name+'('),next=source.indexOf('\nfunction ',start+1);return source.slice(start,next<0?undefined:next);
 }).join('\n');
}
async function start(){
 const fixture=await setup(),root=path.resolve(__dirname,'../..');let origin;
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,origin);res.status=n=>{res.statusCode=n;return res;};res.json=data=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
  if(req.method==='POST'){let raw='';for await(const c of req)raw+=c;req.body=JSON.parse(raw||'{}');if(url.pathname==='/api/notices')return noticesHandler(req,res);if(url.pathname==='/api/interview-prep')return fixture.studentHandler(req,res);}
  if(url.pathname==='/qa-notices')return res.json(await fixture.read('GET','notices'));
  if(url.pathname==='/'||url.pathname==='/admin'){
   const admin=url.pathname==='/admin';res.setHeader('Set-Cookie',admin?fixture.adminCookie+'; Path=/; HttpOnly; SameSite=Lax':'qa_student=1; Path=/; HttpOnly; SameSite=Lax');
   res.setHeader('Content-Type','text/html; charset=utf-8');
   return res.end(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/interview-prep.css"><link rel="stylesheet" href="/interview-app.css"><style>body{margin:0;background:#f3f6fa}main{padding:20px;max-width:1100px;margin:auto}</style><main id="app"></main><div id="toast" role="status"></div>${admin?`<script>let state={notices:[]},editingNoticeId='',noticeImageDraft=null,noticeImageRemovalRequested=false;const APP_MODE='teacher',teacherAuth={user:{username:'qa-admin'}},STORAGE_KEY='notice-qa',APP_SETTINGS_NOTICE_ID='settings',LEGACY_SAMPLE_NOTICE_IDS=new Set(),remoteStore={};const isTeacherAdmin=()=>true,hasTeacherPermission=()=>true,renderForbidden=()=>document.createElement('div'),saveState=()=>{},notify=message=>document.querySelector('#toast').textContent=message;${sharedFunctions()}function render(){document.querySelector('#app').replaceChildren(renderInterviewPrepAdmin());}</script><script src="/teacher-settings.js"></script><script src="/interview-prep.js"></script><script>fetch('/qa-notices').then(r=>r.json()).then(rows=>{state.notices=rows.map(mapNoticeFromRemote);render();window.ready=true;});</script>`:`<script type="module">import {mountInterviewApp} from '/interview-app-ui.js';const request=async(action,payload={})=>{const r=await fetch('/api/interview-prep',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,action})});const d=await r.json();if(!r.ok)throw Error(d.error);return d;};window.controller=await mountInterviewApp(document.querySelector('#app'),{account:{name:'테스트 수강생'},request});window.ready=true;</script>`}</html>`);
  }
  const target=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!target.startsWith(root+path.sep)||!['.js','.mjs','.css','.png','.svg','.woff2'].includes(path.extname(target))||!fs.existsSync(target)){res.statusCode=404;return res.end();}
  res.setHeader('Content-Type',target.endsWith('.css')?'text/css':/\.m?js$/.test(target)?'text/javascript':'application/octet-stream');res.end(fs.readFileSync(target));
 }catch(error){res.status(500).json({ok:false,error:error.message});}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 return {...fixture,origin,async close(){await new Promise(resolve=>server.close(resolve));await fixture.close();}};
}
module.exports={setup,start,sharedFunctions};
