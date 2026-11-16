'use strict';
// Local-only evaluation tooling. No DB writes, deployment, automatic retries or default paid mode.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const benchmark=require('../lib/interview-exam-benchmark.cjs');
const {configuration,createProvider}=require('../lib/interview-exam-provider');
const {readEnvironment}=require('./check-interview-live.cjs');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function read(file){const stat=fs.statSync(file);if(!stat.isFile()||stat.size>3000000)throw Error('invalid_input_file');return JSON.parse(fs.readFileSync(file,'utf8'));}
function write(file,data){fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n',{flag:'wx',mode:0o600});}
function reviewHtml(d){
 return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>전공 채점 검증 · 검수 자료</title><style>body{font:16px system-ui;max-width:1000px;margin:24px auto;padding:0 16px;color:#203447;background:#f3f6fa}article,section{padding:20px;margin:16px 0;background:white;border:1px solid #dce3eb;border-radius:12px}p,blockquote{white-space:pre-wrap;line-height:1.7}aside{padding:16px;background:#fff0c6}details{margin:14px 0}small{color:#546478}h1{font-size:26px}h2{font-size:21px}code{overflow-wrap:anywhere}</style><h1>전공 채점 정확도 검증 · 강사 검수용 초안</h1><aside>DB 원문 해설을 근거로 만든 검수 전 자료입니다. 아래 사례의 제안 라벨은 확정 정답이 아닙니다. 실제 AI 실행·채점 정확도 측정·음성 인식 검증은 수행되지 않았습니다. 검수자 두 분이 출처와 기준을 확인하고 각각 reviewer-a.json / reviewer-b.json에 독립 판정을 입력해주세요. 이 HTML은 읽기 전용입니다.</aside><p>문항 ${d.questions.length}개 · 답변 사례 ${d.cases.length}개 · 분할 development · 파이프라인 단계: 전사문 의미 판정</p><p><small>데이터 해시: ${esc(d.datasetHash)}</small></p>${d.questions.map(q=>`<section><h2>${esc(q.question.prompt)}</h2><p>문항 ID: <code>${esc(q.id)}</code> · 문항 버전 ${esc(q.question.revision)} · DB 기준 상태 ${esc(q.sourceRubricStatus)}</p><details open><summary>기존 DB 해설과 출처</summary>${q.sources.map(s=>`<article><small>${esc(s.filename)} · ${esc(s.year)} · ${esc(s.locator)}</small><p>${esc(s.answer)}</p><small>원문 해시 ${esc(s.answerHash)}</small></article>`).join('')}</details><details><summary>검수할 개념 기준</summary>${q.proposal.criteria.map(c=>`<article><h3>${esc(c.label)}</h3>${c.assessment.concepts.map(item=>`<p>개념: ${esc(item.claim)}\n관계: ${esc(item.relation)}\n부분 인정: ${esc(item.partial||'허용하지 않음')}\n오류: ${esc(item.reject)}</p>`).join('')}</article>`).join('')}<h3>전체 X를 강제하는 핵심 오류</h3><ul>${q.proposal.criticalErrors.map(e=>`<li>${esc(e)}</li>`).join('')}</ul></details>${d.cases.filter(c=>c.questionId===q.id).map(c=>`<article><h3>${esc(c.id)}</h3><small>${c.tags.map(esc).join(' · ')}</small><blockquote>${esc(c.transcript)}</blockquote><p>검수 항목: 전체 O/△/X/보류, 개념별 충족/부분/오류/누락/불확실, 핵심 오류, 판단 이유</p><details><summary>설계자의 미검수 제안 라벨 보기</summary><p>${esc(c.proposedGold?.grade)} · 개념 ${esc(c.proposedGold?.concepts.join(', '))} · 오류 ${esc(c.proposedGold?.errors.join(', '))}</p><small>이 제안과 달라도 강사가 타당하다고 판단하는 결과를 검수 파일에 입력합니다.</small></details></article>`).join('')}</section>`).join('')}<p>이 자료에는 학생 개인 답변이나 녹음이 포함되지 않습니다. API 키·모델 설정과 두 검수 기록이 준비되어야 실제 평가를 실행할 수 있습니다.</p></html>`;
}
function parse(argv){
 const mode=argv[0],allowed={prepare:['source','out'],review:['dataset','out'],check:['dataset','review-a','review-b','cases','split','max-cases','max-requests','max-output-tokens'],run:['dataset','review-a','review-b','cases','split','max-cases','max-requests','max-output-tokens','out','execute'],summarize:['dataset','review-a','review-b','run']};
 if(!allowed[mode])throw Error('invalid_arguments');const args={mode};
 for(let i=1;i<argv.length;i++){const key=argv[i].replace(/^--/,'');if(argv[i]!=='--'+key||!allowed[mode].includes(key)||Object.hasOwn(args,key))throw Error('invalid_arguments');if(key==='execute'){args[key]=true;continue;}if(!argv[i+1]||argv[i+1].startsWith('--'))throw Error('invalid_arguments');args[key]=argv[++i];}
 return args;
}
async function main(argv,{environment=readEnvironment(),providerFactory=createProvider}={}){
 const args=parse(argv);
 if(args.mode==='prepare'){
  if(!args.source||!args.out)throw Error('invalid_arguments');
  const dataset=benchmark.makeDataset(read(args.source),require('./data/interview-concept-benchmark-plan.cjs')),out=path.resolve(args.out);fs.mkdirSync(out,{mode:0o700});
  write(path.join(out,'dataset.json'),dataset);for(const name of ['reviewer-a.json','reviewer-b.json'])write(path.join(out,name),benchmark.reviewTemplate(dataset));
  fs.writeFileSync(path.join(out,'review.html'),reviewHtml(dataset),{flag:'wx',mode:0o600});
  const summary={stage:'transcript_only',productionApproved:false,questions:dataset.questions.length,cases:dataset.cases.length,reviewedCases:0,actualApiRequests:0,accuracy:null,datasetHash:dataset.datasetHash,output:out};write(path.join(out,'preparation.json'),summary);return summary;
 }
 if(!args.dataset)throw Error('invalid_arguments');const dataset=read(args.dataset);benchmark.validateDataset(dataset);
 if(args.mode==='review'){
  if(!args.out)throw Error('invalid_arguments');const out=path.resolve(args.out);
  fs.writeFileSync(out,require('./render-interview-exam-review.cjs').renderReview(dataset),{flag:'wx',mode:0o600});
  return {status:'prepared',output:out,questions:dataset.questions.length,cases:dataset.cases.length,actualApiRequests:0,productionApproved:false};
 }
 const reviews=[args['review-a'],args['review-b']].filter(Boolean).map(read);
 if(args.mode==='summarize'){if(!args.run)throw Error('invalid_arguments');return benchmark.summarizeBenchmark(dataset,reviews,read(args.run));}
 const config=configuration({...environment,INTERVIEW_EXAM_VALIDATION_ENABLED:'true'});
 const number=key=>args[key]===undefined?undefined:/^[1-9][0-9]*$/.test(args[key])?Number(args[key]):NaN;
 const options={split:args.split||'development',caseIds:args.cases?.split(','),maxCases:number('max-cases'),maxRequests:number('max-requests'),maxOutputTokens:number('max-output-tokens')};
 const plan=benchmark.planRun(dataset,reviews,config,options);
 if(args.mode==='check')return {...plan,actualApiRequests:0,models:config.models,reviewIdentityVerified:false};
 if(!args.execute||!args.out)throw Error('explicit_execute_and_output_required');
 if(!plan.ready)return {...plan,actualApiRequests:0,status:'blocked'};
 const out=path.resolve(args.out);fs.mkdirSync(out,{mode:0o700});
 write(path.join(out,'plan.json'),plan);
 const file=path.join(out,'run.json');
 const checkpoint=async report=>{const tmp=file+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(tmp,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});fs.renameSync(tmp,file);};
 const report=await benchmark.runBenchmark({dataset,reviews,config,options,createProvider:()=>providerFactory({config,maxOutputTokens:options.maxOutputTokens}),checkpoint});
 return {status:report.status,stage:report.stage,productionApproved:false,requestsStarted:report.requestsStarted,resultsFile:file,metrics:report.metrics||null};
}
if(require.main===module)main(process.argv.slice(2)).then(result=>{console.log(JSON.stringify(result,null,2));if(result.ready===false||result.status==='blocked'||result.status==='stopped')process.exitCode=2;}).catch(()=>{console.error('Benchmark could not complete. Check input/review files, explicit limits and local provider settings. No automatic retry was started.');process.exitCode=1;});
module.exports={main,parse,reviewHtml};
