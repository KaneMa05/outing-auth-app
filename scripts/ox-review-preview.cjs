// Local-only preview. Uses the production learner UI with isolated example records.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>오답노트 · 로컬 미리보기</title><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/criminal-law-ox.css">
<style>body{margin:0;background:#f3f6f8}.preview-bar{max-width:640px;margin:20px auto 0;padding:0 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;font:13px sans-serif;color:#546578}.preview-bar select{padding:8px;border:1px solid #ccd5df;border-radius:8px}.criminal-law-ox-local-page{max-width:640px;margin:16px auto 40px;padding:20px 16px;background:var(--surface,#fff);border-radius:16px;box-sizing:border-box}@media(max-width:480px){.criminal-law-ox-local-page{margin:12px 8px 24px;padding:16px 12px}.preview-bar{padding:0 12px;font-size:11px}}</style>
<style>.preview-bar span{white-space:nowrap}.preview-bar select{width:auto;max-width:180px}body.student-online-mode .preview-bar{color:#d8e6ef}body.student-online-mode .criminal-law-ox-local-page{background:transparent}</style>
<body class="student-mode student-online-mode student-lecture-mode"><div class="preview-bar"><span>로컬 미리보기 · 예시 학습 기록</span><select aria-label="수강생 화면" id="theme"><option value="lecture">인터넷 수강생</option><option value="online">온라인 관리반</option><option value="offline">오프라인 수강생</option></select></div>
<main class="criminal-law-ox-local-page"><div id="host"></div></main>
<script type="module">
import {mount} from '/criminal-law-ox.js';
const collections=[{id:'criminal-law',name:'형법',accessible:true},{id:'criminal-procedure-investigation-evidence',name:'수사·증거',accessible:true},{id:'criminal-procedure-trial',name:'공판',accessible:true}];
const chapterNames=['정범 및 공범론','책임론','수사총론','증거의 종류','공판절차'];
const chapters=chapterNames.map((name,i)=>({id:'chapter-'+i,display_name:name,collection_id:collections[i<2?0:i<4?1:2].id,question_count:i===0?3:2,sort_order:i+1}));
const prompts=['공범의 성립 요건과 각 행위자의 책임 범위는 구별하여 판단한다.','공동정범과 종범을 구별할 때에는 범행에 대한 역할과 관여 정도를 살펴야 한다.','교사범의 성립 여부를 판단할 때에는 교사행위와 실행행위의 관계를 검토한다.','책임능력과 위법성의 인식은 책임 판단에서 검토할 사항이다.','강요된 행위에 해당하는지는 구체적인 사정을 살펴 판단한다.','수사의 적법성을 검토할 때에는 수사 방법과 절차를 함께 살펴야 한다.','임의수사와 강제수사는 구별하여 검토해야 한다.','증거능력과 증명력은 구별되는 개념이다.','진술증거와 비진술증거는 그 성질에 따라 구별한다.','공판절차에서는 당사자의 주장과 증거를 심리한다.','공판의 기본 원칙을 구체적인 절차와 연결하여 검토한다.'];
let number=0;
const questions=chapters.flatMap(c=>Array.from({length:c.question_count},()=>({id:'preview-'+number,chapter_id:c.id,version:1,prompt:prompts[number++],context:'',correct_answer:'O',explanation_html:'로컬 화면 확인을 위한 예시 문항입니다.'})));
let progress=questions.map((q,i)=>({question_id:q.id,content_version:1,answer:i===3?'O':'X',correct:i===3,wrong_count:[6,2,4,3,1,5,2,3,1,2,1][i],answered_at:new Date(Date.UTC(2026,8,28,9)-i*3600000).toISOString()}));
let counts=Object.fromEntries(progress.map(p=>[p.question_id,{attempts:p.wrong_count+Number(p.correct),wrong:p.wrong_count,correct:Number(p.correct)}]));
let notes=[{question_id:questions.at(-1).id,mastered_version:1,memo:'다시 확인할 문항',bookmark:false}];
function boot(){return {catalog:{collections,chapters,questions:structuredClone(questions)},progress:structuredClone(progress),attemptCounts:structuredClone(counts),notes:structuredClone(notes),statistics:{},todayCount:11};}
const submitted=new Map();
async function request(action,body){
  if(action==='bootstrap')return boot();
  const q=questions.find(q=>q.id===body.questionId);
  if(action==='detail')return {question:{...q},note:notes.find(n=>n.question_id===q.id)};
  if(action==='submit'){
    if(submitted.has(body.submissionId))return structuredClone(submitted.get(body.submissionId));
    const p=progress.find(p=>p.question_id===q.id),c=counts[q.id];
    p.answer=body.answer;p.correct=body.answer===q.correct_answer;p.answered_at=new Date().toISOString();c.attempts++;
    if(p.correct)c.correct++;else{p.wrong_count++;c.wrong++;const n=notes.find(n=>n.question_id===q.id);if(n)n.mastered_version=null;}
    const saved={question:{...q},progress:{...p},attemptCounts:{[q.id]:{...c}},statistics:{},note:notes.find(n=>n.question_id===q.id)};
    submitted.set(body.submissionId,structuredClone(saved));return saved;
  }
  if(action==='note'){
    let n=notes.find(n=>n.question_id===q.id);if(!n){n={question_id:q.id};notes.push(n);}
    if('mastered' in body)n.mastered_version=body.mastered?1:null;
    if('memo' in body)n.memo=body.memo;if('bookmark' in body)n.bookmark=body.bookmark;
    return {note:{...n}};
  }
  throw Error('Unsupported local preview action');
}
mount(document.querySelector('#host'),{bootstrap:boot(),request});
document.querySelector('[data-ox-route="review"]').click();
document.querySelector('#theme').addEventListener('change',e=>{document.body.className='student-mode'+(e.target.value==='offline'?'':' student-online-mode')+(e.target.value==='lecture'?' student-lecture-mode':'');});
</script></body></html>`;
http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://127.0.0.1').pathname;
  res.setHeader('Cache-Control','no-store');
  if(pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);}
  const assets={'/styles.css':'text/css','/criminal-law-ox.css':'text/css','/criminal-law-ox.js':'text/javascript',
    '/fonts/NanumGothic-Regular.woff':'font/woff','/fonts/NanumGothic-Bold.woff':'font/woff','/fonts/GongGothicLight.woff':'font/woff'};
  if(!assets[pathname]){res.statusCode=404;return res.end();}
  res.setHeader('Content-Type',assets[pathname]);res.end(fs.readFileSync(path.join(root,pathname.slice(1))));
}).listen(4318,'127.0.0.1',()=>console.log('OX review preview: http://127.0.0.1:4318'));
