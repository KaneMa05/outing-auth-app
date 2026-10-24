// Explicit local acceptance test: synthetic text only, real ChatGPT-backed CLI inference.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {setup}=require('./interview-preassignments.test.cjs');
const {createProvider}=require('../scripts/core25-diagnosis-cli.cjs');
const {createHandler}=require('../api/interview-preassignments');
(async()=>{
 const {db,call,admin,a}=await setup();
 try{
  const provider=createProvider({executable:process.env.INTERVIEW_CODEX||'C:/Users/W11/AppData/Local/Programs/OpenAI/Codex/bin/codex.exe',runtimeDir:path.resolve('.tmp/core25-live')});
  await call('admin_settings',admin,{revision:(await call('admin_list',admin)).settings.revision,enabled:true,dueAt:'2099-01-01T00:00:00Z',revisionDueAt:'2099-01-02T00:00:00Z',allowLate:true});
  const answer='저는 일정이 복잡한 일을 작은 단계로 나눠 누락을 줄이는 일을 잘합니다. 동아리 행사 준비 때 담당자와 마감이 정해지지 않아 준비물이 빠졌습니다. 저는 담당자별 체크리스트를 만들고 매일 진행 상황을 확인했습니다. 예산 결정은 회장이 했고 저는 물품과 일정 확인을 맡았습니다. 행사 당일 준비물 누락 없이 시작했으며 다음 행사에서도 같은 표를 사용했습니다. 입직 후에도 장비 점검과 인수인계에서 담당 사항을 기록하고 빠진 점을 확인하는 데 이 강점을 활용하겠습니다. 현장 장비 지식은 아직 부족해 교육과 선배의 확인을 받아 보완하겠습니다.';
  await call('save',a,{unitId:'core-01',revision:0,fields:{f1:answer},requestId:require('node:crypto').randomUUID()});
  const api=createHandler({authenticateWeb:async()=>({id:a.id}),previewAllowed:()=>false,diagnosisProvider:async(...args)=>{try{return await provider(...args);}catch(e){console.error('Local acceptance diagnostic:',e.diagnostic||e.message);throw e;}},invoke:call});
  const res={setHeader(){},status(n){this.statusCode=n;return this;},json(data){this.data=data;}};
  await api({method:'POST',headers:{host:'app.test',origin:'https://app.test'},body:{action:'diagnose',unitId:'core-01',revision:1}},res);
  assert.equal(res.statusCode,200);assert.equal(res.data.diagnosis?.status,'completed');
  const report=res.data.diagnosis.report;assert.equal(report.criteria.length,4);assert(report.criteria.some(c=>c.state==='충분'));assert(report.criteria.every(c=>!c.quote||answer.includes(c.quote)));
  fs.mkdirSync('.tmp/core25-live',{recursive:true});fs.writeFileSync('.tmp/core25-live/verified-report.json',JSON.stringify({synthetic:true,answer,diagnosis:res.data.diagnosis},null,2));
  console.log('PASS live CLI + authenticated API + DB: '+report.criteria.map(c=>c.label+'='+c.state).join(', '));
 }finally{await db.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
