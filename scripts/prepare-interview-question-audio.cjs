'use strict';
// Imports completed Fish Audio UI downloads only. Never calls a paid API.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),os=require('node:os');
const root=path.resolve(__dirname,'..');
const output=path.join(root,'artifacts/interview-question-audio');
const runDate=process.argv.find(a=>a.startsWith('--date='))?.slice(7)||'2026-10-28';
const source=path.resolve(process.argv.find(a=>a.startsWith('--downloads='))?.slice(12)||path.join(os.homedir(),'Downloads'));
const bank=JSON.parse(fs.readFileSync(path.join(output,'questions-20261027.json'),'utf8')).questions;
const trackRows=JSON.parse(fs.readFileSync(path.join(output,'tracks-20261027.json'),'utf8'));
const tracksById=new Map(trackRows.map(q=>[q.id,q.tracks]));
for(const q of bank){if(!tracksById.has(q.id))throw Error('Missing question track: '+q.id);q.tracks=tracksById.get(q.id);}
const job=require('./data/interview-audio-spoken-overrides.json');
const personality=require('./data/interview-audio-personality-overrides.json');
const additional=require('./data/interview-audio-additional-overrides.json');
const publicTrack=require('./data/interview-audio-public-track-overrides.json');
const overrides={...personality,...job,...additional,...publicTrack};
const slug=text=>text.replace(/[^\p{L}\p{N}\s-]/gu,'').trim().replace(/\s+/g,'-');
const downloads=fs.readdirSync(source).filter(n=>/^남성목소리-\d{4}-\d{2}-\d{2}-/.test(n)&&n.endsWith('.mp3'));
function find(text){const exact=slug(text)+'.mp3';return downloads.filter(n=>n.replace(/^남성목소리-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-/,'')===exact).sort().at(-1);}
const ready=[],pending=[];fs.mkdirSync(path.join(output,'audio'),{recursive:true});
function importClip(q,spokenPrompt){
 const file=find(spokenPrompt);if(!file)return false;
 const data=fs.readFileSync(path.join(source,file));
 if(data.length<1000||!(data.subarray(0,3).toString()==='ID3'||data[0]===0xff))throw Error('Invalid MP3: '+file);
 const relative='audio/'+q.id+'.mp3';fs.writeFileSync(path.join(output,relative),data);
 ready.push({...q,spokenPrompt,file:relative,bytes:data.length,sha256:crypto.createHash('sha256').update(data).digest('hex'),sourceDownload:file});return true;
}
for(const q of bank){const spoken=overrides[q.prompt]||q.prompt;if(!importClip(q,spoken))pending.push({...q,spokenPrompt:spoken,status:'pending_audio'});}
const fixed=[
 ['practice-personality-1','협업 중 의견 차이를 해결한 경험을 말씀해주세요.','협업 중 의견 차이를 해결한 경험을 말씀해 주세요.'],
 ['practice-personality-2','그 과정에서 본인이 직접 맡은 역할은 무엇이었나요?'],
 ['practice-personality-3','그 경험에서 배운 점을 말씀해주세요.','그 경험에서 배운 점을 말씀해 주세요.'],
 ['practice-job-1','지원 직렬과 관련해 가장 자신 있는 전공 개념을 설명해 주세요.'],
 ['practice-job-2','그 개념이 현장 업무에 적용되는 예시를 말씀해 주세요.'],
 ['practice-job-3','관련 업무에서 안전을 위해 주의해야 할 점을 설명해 주세요.']
];
for(const [id,prompt,spoken]of fixed)if(!importClip({id,prompt,category:'practice',revision:1},spoken||prompt))throw Error('Missing fixed practice audio: '+id);
const priority=Object.entries(job).map(([prompt,spokenPrompt])=>{
 const q=bank.find(q=>q.category==='job'&&q.prompt===prompt);if(!q)throw Error('Unknown job question: '+prompt);
 const clip=ready.find(r=>r.id===q.id);return {...q,spokenPrompt,audioStatus:clip?'ready':'pending_credits',...(clip?{file:clip.file}:{})};
});
if(priority.length!==50)throw Error('Expected exactly 50 priority job questions');
const summary={bankTotal:bank.length,bankReady:ready.filter(q=>q.category!=='practice').length,practiceReady:6,priorityJobTotal:50,priorityJobReady:priority.filter(q=>q.audioStatus==='ready').length,priorityJobPending:priority.filter(q=>q.audioStatus!=='ready').length,remainingCredits:process.argv.some(a=>a.startsWith('--credits='))?Number(process.argv.find(a=>a.startsWith('--credits=')).slice(10)):null,nextCreditRenewal:'2026-11-28T10:23:00+09:00',pushed:false,deployed:false};
fs.writeFileSync(path.join(output,'catalog.json'),JSON.stringify({createdAt:runDate,provider:'fish.audio',voice:'남성목소리',summary,clips:ready},null,2)+'\n');
fs.writeFileSync(path.join(output,'priority-job-50.json'),JSON.stringify(priority,null,2)+'\n');
fs.writeFileSync(path.join(output,'pending.json'),JSON.stringify(pending,null,2)+'\n');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const review=path.join(output,'job-priority-50');fs.mkdirSync(path.join(review,'audio'),{recursive:true});
for(const q of priority.filter(q=>q.file))fs.copyFileSync(path.join(output,q.file),path.join(review,q.file));
fs.writeFileSync(path.join(review,'index.html'),`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>직무 기출 음성 검토 50개</title><style>body{font:16px/1.6 system-ui;margin:32px auto;padding:0 20px;max-width:850px;color:#152c43}article{padding:16px 0;border-bottom:1px solid #ddd}small{color:#536477}audio{display:block;width:100%;margin:8px 0}.pending{color:#945400}details{margin:8px 0}</style><h1>직무 기출 우선 50개</h1><p>2026년 10월 27일 · 음성 완료 ${summary.priorityJobReady}개 / 무료 크레딧 갱신 대기 ${summary.priorityJobPending}개</p><p>단어형 항목을 면접 질문 문장으로 다듬었습니다. 원문은 대조용으로 보관했습니다. 운영 DB 수정·푸시·배포는 하지 않았습니다.</p>${priority.map((q,i)=>`<article><small>${i+1}. ${esc(q.id)}</small><h2>${esc(q.spokenPrompt)}</h2><details><summary>기출 원문</summary>${esc(q.prompt)}</details>${q.file?`<audio controls preload="none" src="${esc(q.file)}"></audio>`:'<p class="pending">음성 미생성 · 무료 크레딧 갱신 대기</p>'}</article>`).join('')}</html>`);
if(process.argv.includes('--native-debug')){
 const dest=path.join(root,'native/android/interview/src/debug/assets/interview-question-audio');fs.mkdirSync(dest,{recursive:true});
 const clips=ready.map(q=>{const name=q.id+'.mp3';fs.copyFileSync(path.join(output,q.file),path.join(dest,name));return {id:q.id,prompt:q.prompt,spokenPrompt:q.spokenPrompt,file:name,category:q.category,tracks:q.tracks||[]};});
 fs.writeFileSync(path.join(dest,'catalog.json'),JSON.stringify({clips},null,2)+'\n');
}
const publicReady=ready.filter(q=>q.category==='job'&&q.tracks.includes('공채'));
const publicFolder=path.join(output,'public-job-ready');fs.mkdirSync(path.join(publicFolder,'audio'),{recursive:true});
for(const q of publicReady)fs.copyFileSync(path.join(output,q.file),path.join(publicFolder,q.file));
fs.writeFileSync(path.join(publicFolder,'catalog.json'),JSON.stringify({createdAt:runDate,count:publicReady.length,clips:publicReady},null,2)+'\n');
fs.writeFileSync(path.join(publicFolder,'index.html'),`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>공채 직무 음성 질문</title><style>body{font:16px/1.7 system-ui;max-width:850px;margin:32px auto;padding:0 20px;color:#152c43}article{padding:16px 0;border-bottom:1px solid #ddd}small{color:#536477}audio{display:block;width:100%;margin:8px 0}</style><h1>공채 직무 음성 질문 ${publicReady.length}개</h1><p>${esc(runDate)} · Fish Audio 남성목소리 · 생성 완료 파일만 포함</p>${publicReady.map((q,i)=>`<article><small>${i+1}. ${esc(q.id)}</small><h2>${esc(q.spokenPrompt)}</h2><details><summary>기출 원문</summary>${esc(q.prompt)}</details><audio controls preload="none" src="${esc(q.file)}"></audio></article>`).join('')}</html>`);
console.log(JSON.stringify(summary,null,2));
