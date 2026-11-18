'use strict';
// Private loopback preview: real admin UI/API + local Postgres, never writes the hosted DB.
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),{randomBytes}=require('node:crypto');
const {createPracticeDb}=require('../tests/helpers/practice-archive-db.cjs');
const {createHandler}=require('../api/interview-practice-records');
const {importResults}=require('./interview-practice-asr-worker.cjs');
const {createStorage}=require('../lib/interview-practice-storage');
async function main(){
 const sourceFile=path.resolve(process.argv[2]);const source=JSON.parse((await fs.readFile(sourceFile,'utf8')).replace(/^\uFEFF/,''));
 const root=path.resolve(__dirname,'..'),output=path.join(root,'.tmp/practice-admin-preview');await fs.mkdir(output,{recursive:true});
 const db=await createPracticeDb();
 const invoke=async(name,action,actor,body)=>(await db.query('select '+name+'($1,$2,$3) result',[action,actor,body])).rows[0].result;
 const archive=(action,actor,body)=>invoke('ip_practice_service',action,actor,body);
 async function snapshot(){
  const rows=(await db.query("select run_id,number,audio_hash,model_revision,transcript,review_status,corrected_text,review_note,reviewed_at from ip_practice_transcriptions where reviewed_at is not null")).rows;
  const file=path.join(output,'reviews.json');await fs.writeFile(file+'.tmp',JSON.stringify(rows,null,2),{mode:0o600});await fs.rename(file+'.tmp',file);
 }
 const transcription=async(action,actor,body)=>{const data=await invoke('ip_practice_transcription_service',action,actor,body);if(action==='admin_review')await snapshot();return data;};
 const grouped=new Map();for(const s of source.samples){if(!grouped.has(s.run_id))grouped.set(s.run_id,[]);grouped.get(s.run_id).push(s);}
 for(const [runId,rows] of grouped){
  await archive('sync',{type:'student',id:'a'},{runId,mode:rows[0].mode,track:'공채',fieldId:'',fieldLabel:'보관 녹음 검수',region:'',recordedAt:rows[0].recorded_at,questionCount:Math.max(...rows.map(s=>s.number)),completed:false,finished:true,
   turns:rows.map(s=>({number:s.number,questionId:s.question_id,question:s.question,answer:'',duration:s.duration,audioBytes:s.audio_bytes,audioHash:s.audio_hash}))});
  for(const row of rows)await archive('uploaded',{type:'student',id:'a'},{runId,number:row.number,audioHash:row.audio_hash});
 }
 const imported=await importResults(sourceFile,{rpc:(action,body)=>transcription(action,{type:'worker',id:'preview'},body),cacheDir:path.join(output,'audio-cache'),download:job=>{const row=source.samples.find(s=>s.run_id===job.runId&&s.number===job.number);if(!row)throw Error('audio_mismatch');return fs.readFile(path.resolve(path.dirname(sourceFile),row.audio));}});
 if(imported.filter(r=>r.completed).length!==source.samples.filter(s=>s.status==='transcribed').length)throw Error('preview_import_failed');
 let prior=[];try{prior=JSON.parse(await fs.readFile(path.join(output,'reviews.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 for(const review of prior){
  const row=(await db.query('select * from ip_practice_transcriptions where run_id=$1 and number=$2',[review.run_id,review.number])).rows[0];
  if(row&&row.audio_hash===review.audio_hash&&row.model_revision===review.model_revision&&row.transcript===review.transcript)
   await invoke('ip_practice_transcription_service','admin_review',{type:'admin',id:'local-preview'},{runId:review.run_id,number:review.number,revision:row.revision,reviewStatus:review.review_status,correctedText:review.corrected_text,note:review.review_note});
 }
 const storage=createStorage({url:process.env.SUPABASE_URL||'',key:process.env.SUPABASE_SERVICE_ROLE_KEY||''});
 const handler=createHandler({authenticateAdmin:async()=>({id:'local-preview'}),authenticateWeb:async()=>null,invoke:archive,transcription,storage});
 const token=randomBytes(18).toString('hex'),port=Number(process.env.PRACTICE_PREVIEW_PORT||8798),host='127.0.0.1:'+port,origin='http://'+host;
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  try{
   if(req.headers.host!==host||(req.headers.origin&&req.headers.origin!==origin)){res.writeHead(403);return res.end();}
   const route=new URL(req.url,origin).pathname;
   if(req.method==='GET'&&route==='/'+token+'/'){
    res.setHeader('Set-Cookie','practice_admin_preview='+token+'; HttpOnly; SameSite=Strict; Path=/');res.setHeader('Content-Type','text/html; charset=utf-8');
    return res.end('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>관리자 · 녹음 기록 미리보기</title><link rel="stylesheet" href="/interview-prep.css"><style>body{margin:0;background:#f5f7fa;font-family:"Malgun Gothic",sans-serif;color:#243047}header{padding:22px 30px;background:white;border-bottom:1px solid #e1e7ee}h1{font-size:22px;margin:8px 0}header p{font-size:12px;color:#64748b;margin:0;line-height:1.8}main{box-sizing:border-box;max-width:1340px;margin:24px auto;padding:0 24px}.ip-panel{background:white}</style><script type="module" src="/preview.js"></script><header><p>관리자 &gt; 면접반 &gt; 녹음 기록</p><h1>녹음 기록 · 전사 확인</h1><p>보관 녹음 9개를 연결한 로컬 미리보기입니다. 수정 내용은 이 PC의 검수 파일에 저장됩니다.</p></header><main class="ip-root" id="host"></main></html>');
   }
   if(!(req.headers.cookie||'').split(';').some(c=>c.trim()==='practice_admin_preview='+token)){res.writeHead(403);return res.end();}
   if(route==='/api/interview-practice-records'){
    res.status=code=>{res.statusCode=code;return res;};res.json=data=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
    await handler(req,res);return;
   }
   if(route==='/preview.js'){res.setHeader('Content-Type','text/javascript');return res.end("import {mountPracticeRecords} from '/interview-practice-admin-ui.js'; window.view=await mountPracticeRecords(document.querySelector('#host')); ");}
   const files={'/interview-prep.css':'text/css','/interview-practice-admin-ui.js':'text/javascript'};
   if(req.method==='GET'&&files[route]){res.setHeader('Content-Type',files[route]);return res.end(await fs.readFile(path.join(root,route.slice(1))));}
   res.writeHead(404);res.end();
  }catch{if(!res.headersSent)res.writeHead(500);res.end();}
 });
 server.listen(port,'127.0.0.1',async()=>{const url=origin+'/'+token+'/';await fs.writeFile(path.join(output,'url.txt'),url,{mode:0o600});console.log('ADMIN_PREVIEW_READY '+url);});
}
main().catch(()=>{console.error('preview_unavailable');process.exit(1);});
