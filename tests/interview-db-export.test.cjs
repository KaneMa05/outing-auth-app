const assert=require('node:assert/strict');
const {test}=require('node:test');
const formatter=()=>import('../client/interview-db-export.mjs');
const fixture=()=>({life:{member:{name:'홍예시',exam_number:'EX-001',track:'공채',student_id:'private-owner'},profile:{revision:42,feedback:'PRIVATE-FEEDBACK',content:{
 basicInfo:{name:{text:'김예시'},birthDate:{text:'2000-03-15'},gender:{text:'male'},school:{text:'대한대학교',status:'graduated'},major:{text:'행정학'},company:{text:'샘플전자 회계 업무 2년'},clubs:{text:'바다동아리 회장'},volunteering:{text:'이전 글',none:true}},
 background:'LEGACY-HIDDEN',none:['affiliations'],qualifications:[{id:'private-cert',type:'어학',name:'TOEIC',date:'2025',effort:'매일 공부'}],affiliations:[{name:'숨긴 단체',activities:'HIDDEN-NONE'}],awards:[{name:'안전 활동',issuer:'한빛협회',contribution:0,action:'대피 안내'}],
 experiences:[{id:'private-row',age:'0',satisfaction:'0',title:'홍예시의 봉사',content:'김예시는 대한대학교, 샘플전자, 한빛협회에서 협업. EX-001 20000315 010-1234-5678 me@example.com',appeal:'직접 듣고 조율함',feedback:'PRIVATE-ROW-FEEDBACK'},{id:'legacy',age:'25',satisfaction:'-10',title:'이전 양식',period:'2024년',affiliation:'대한대학교',situation:'갈등',action:'설득',result:'해결',learning:'경청'},{id:'blank',age:'26',title:'빈 경험',content:'',appeal:'작성 중'}]
 }}},diagnosis:{answers:[{student_id:'private-owner',topic_id:'public',prompts:['저장된 원래 질문','','셋째 질문'],answers:['홍예시의 답변','짝 없는 답변',''],revision:3,updated_at:'PRIVATE-TIME'}]}});

test('exports only saved fields, preserves zero/legacy fields and original question pairing, excludes identity and metadata',async()=>{
 const {formatInterviewDbExport}=await formatter(),{life,diagnosis}=fixture();
 const before=JSON.stringify({life,diagnosis}),result=formatInterviewDbExport(life,diagnosis);
 assert.equal(result.experienceCount,2);assert.equal(result.answerCount,1);
 assert.match(result.text,/^\[나의 면접 DB\]/);assert.match(result.text,/당시 나이: 0세/);assert.match(result.text,/만족도: 0점/);assert.match(result.text,/만족도: -10점/);
 assert.match(result.text,/본인 기여도 \(%\): 0/);assert.match(result.text,/시기: 2024년[\s\S]*상황: 갈등[\s\S]*행동: 설득[\s\S]*결과: 해결/);assert.match(result.text,/면접관에게 어필할 점: 경청/);
 assert.match(result.text,/질문: 저장된 원래 질문\n답변: \[이름 제외\]의 답변/);
 assert.match(result.text,/최종학력: OO학교 · 졸업/);assert.match(result.text,/회사 경력: OO회사 회계 업무 2년/);assert.match(result.text,/봉사 경험: 해당 없음/);
 assert.doesNotMatch(result.text,/홍예시|김예시|EX-001|20000315|대한대학교|샘플전자|한빛협회|010-1234-5678|me@example.com|male|private-|PRIVATE-|LEGACY-HIDDEN|HIDDEN-NONE|짝 없는 답변|빈 경험|AI 지침|공통 원칙/);
 assert.equal(JSON.stringify({life,diagnosis}),before,'Export never mutates saved data');
});
test('empty DB has no export, missing answers fail, legacy background is masked only when structured fields are absent',async()=>{
 const {formatInterviewDbExport}=await formatter();
 assert.deepEqual(formatInterviewDbExport({profile:null},{answers:[]}),{text:'',experienceCount:0,answerCount:0});
 assert.throws(()=>formatInterviewDbExport({profile:null},{}),/invalid_export_data/);
 const {life}=fixture();life.profile.content.basicInfo={};life.profile.content.background='홍예시 01012345678의 소개';
 assert.match(formatInterviewDbExport(life,{answers:[]}).text,/이전에 작성한 소개: \[이름 제외\] \[전화번호 제외\]의 소개/);
});
test('five standalone role guides separate interview practice, coaching, review and fact checking from DB data',async()=>{
 const {interviewRoleGuides}=await import('../client/interview-role-guides.mjs');
 assert.deepEqual(interviewRoleGuides.map(g=>g.id),['experience_coach','answer_coach','interviewer','review_coach','fact_checker']);
 for(const role of interviewRoleGuides){assert(role.title&&role.usage);assert.match(role.text,/^\[역할:/);assert.match(role.text,/정확한 정보를 바탕으로 확인/);assert.doesNotMatch(role.text,/공식 공고로 확인|예시 수강생|2026-001/);}
 assert.match(interviewRoleGuides.find(r=>r.id==='interviewer').text,/한 번에 한 개/);
 assert.match(interviewRoleGuides.find(r=>r.id==='fact_checker').text,/실제 확인한 출처/);
});
