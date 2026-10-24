// Source-grounded review drafts only. No model calls, publication or automatic scoring.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'supabase/seeds');
const read=name=>JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
const corpus=read('interview-corpus.json'),analysis=read('interview-personality-analysis.json');
const reviewGroups={
 job_knowledge:['41f057d5208a33fcc016e207','cff6b285c7a915cff7eb20b6','4bf7ac1b9bb527f38a608130','99c58cc0bf5249e0f789d680','daa86ed55a6e762f5dfb334c','93c156f5967471736cfff0f1','6a0d11b9449be072d6608a22','a99368a3157c25e54ac228c3','027e18581bff4dbb79f40fa2','7f6597020649b4ce81ad9ba4','8e630b0f552b055236d00be7','5d4e42fa41a05a15c4bdf88b','ce890b804c727540f7fdf34e','d39f3315777ee4040259d603','548e8d74383c3d3234153cb3','f796e3190f841a98b41c9ea2','74c0abedff7df99f6e0aa6c2','625066ce49dd968143e3235e','c1c95110875a17ba70f23c89','efa12ab8a5bad5c7e3596e68','989debb0a0db5f846b4dff1c','bdb1e2fce6e7d8ac1d94e7ba','a0d78224b01e1cbabbe5cb58','1246c901373d6c23752f8669','20a8a05721964a10871422a3'],
 personality_opinion:['5f0b2e7cfd9f027b0265ddfc','fd1e1f12ce959cfadb24b8ce','a8a081def038131e0a514769','cccc6d7920ef3c0c5c1a50b9','3595312b5257090b99a3f504','a54d569c5bba65460b5f9ea6','8db15d84df6c99de5074a3d9','3dd2fbf9c9690a26a8076426','838c4f820fe0f954a62c7bb2','ecb5e00f56d6ba274338ab44','e103b002836491465ba70cef','117eb4c87d8d40dd5c4a49f3','d761e828595cec2a0e35ab13','b158d86da56947cff6a41ab8','3da262c7b3870568112baac6','56f0b40019eef221af42d580','ba81258c7f4aa0acf43a1b1b','f7424c87369d48db88140c4c','9020caa11e721219a0d885c5','11af3af713f17b6b7fbae2ed','dc4109002378edbc951c9998'],
 profile:['3c10b9b7c799f10aa1023e2f','0cc47d2a3133e1537a653b61','81213cd258e5acbf38f1d2d7','85546829089ff5c715ab6856','fe055a0104392da2f38555fe','efb75422a85b163685ee7a76','d020962628e0116c0ab9a422','040fa0b372fae3c90f7de093','291a21a6eff8e6f8a19d46be','32f025df59c4a0715da98c02'],
 personality_experience:['6180588b8ca72b30d0fecbe7'],
 practical:['686af3ce260186d6be0c679c','546dc7531d9b5b5759a545b9','3705181746b724dda0ca03fd','a49f6bced1911e273b960baa','b61ec7d168f335ada311cb5c'],
 followup:['2a6b7049e7ec616ce59f4909','61dde4ab0c765b04b3a83e82','8e59dc04d0257b742773b326','4aa81b03d631a1fa06cc06cd'],
 hold:['91227d008b6c20b6779632a4','7b0d69eb346ddb99cb0836f9']
};
const reasons={job_knowledge:'정의·규정·업무·기술 지식을 묻는 문항입니다. 원문 해설과 최신 근거를 검수한 뒤 전공 시험에 사용합니다.',personality_opinion:'사안에 대한 입장과 이유를 묻습니다. 특정 입장이나 정답 단어를 강제하지 않고 논리와 근거를 평가합니다.',profile:'지원자 자신의 경력·이력·사용 장비를 확인합니다. 공통 정답 워딩으로 채점하지 않습니다.',personality_experience:'본인의 실제 행동과 경험을 묻습니다. 결론·이유·경험·마무리의 근거를 확인합니다.',practical:'영어 답변 또는 실제 업무 표현 수행이 필요합니다. 한국어 워딩 시험과 별도 평가 기준이 필요합니다.',followup:'앞선 질문·지원자 답변에 의존합니다. 출처상 이웃 문항만으로 부모 질문을 확정하지 않으며 단독 출제에서 제외합니다.',hold:'문구가 모호하거나 불완전하여 출제 의도를 확정하기 어렵습니다. 원문과 담당자 확인 전 단독 출제하지 않습니다.'};
const overrides=new Map();
for(const [kind,ids] of Object.entries(reviewGroups))for(const id of ids){if(overrides.has('q-'+id))throw Error('Duplicate override');overrides.set('q-'+id,kind);}
const amap=new Map(analysis.analyses.map(a=>[a.question_id,a]));
const sources=new Map(corpus.sources.map(s=>[s.id,s]));
const authored=new Map();
for(const example of JSON.parse(fs.readFileSync(path.join(root,'scripts/data/interview-rubric-examples.json'),'utf8'))){
 for(const id of example.question_ids){if(authored.has(id))throw Error('Duplicate authored rubric');authored.set(id,example);}
}
const byQuestion=new Map(),groups=new Map();
for(const o of corpus.occurrences){
 if(!byQuestion.has(o.question_id))byQuestion.set(o.question_id,[]);byQuestion.get(o.question_id).push(o);
 const key=[o.source_id,o.section_title,o.year,o.region].join('|');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(o);
}
const adjacent=new Map();
for(const rows of groups.values()){
 rows.sort((a,b)=>Number(a.locator.split(':').at(-1))-Number(b.locator.split(':').at(-1)));
 rows.forEach((o,i)=>adjacent.set(o.id,[rows[i-1],rows[i+1]].filter(Boolean).map(n=>({occurrence_id:n.id,question_id:n.question_id,prompt:n.original_prompt,locator:n.locator,source_id:n.source_id,relation:'source_neighbor_not_confirmed_parent'}))));
}
function classify(q,a){
 if(overrides.has(q.id))return {kind:overrides.get(q.id),method:'question-reading-v1',quote:q.prompt};
 const rules=[
  ['followup',/꼬리질문|그 과정|그 경험|그 사건|그 얘기|그 이야기|그럼|그래서|그때|그 때|이유는요|이유가 무엇|왜 그렇|어떻게 이겨|본적 있나요|표정관리 뿐|그쪽/],
  ['practical',/영어로|영작|영어.*(?:소개|답변|말해)/],
  ['personality_experience',/문제해결 경험|기발한 아이디어|기억에 남|무엇을 배웠|보람|갈등.*(?:경험|해결)|어떻게.*(?:해결|극복)|어케해결|힘들었던|어려웠던/],
  ['followup',/그걸|그것|그거|그 사람|그런|그렇게|그러면|어떻게 풀|어떻게 푸|혼자 푸|말리는 사람|주변인이 당|좋게 평가|더 덧붙|없다면|타셨나요|정확히 언제|방황.*하셨|사례를 들어서|생각할정도로|잘하게 생겼|3가지의 의미|100도/],
  ['personality_experience',/에피소드|어떤 평가|피해를 준 적|사회 생활 경험과 느낀|인상 깊었던 사건|의경생활|관련 경험|관련된 경험|동아리 회장/],
  ['personality_opinion',/어떻게 생각|어떤 생각|무슨 생각|무엇이라 생각|뭐라 생각|어떤 이름|생각하는 바다|이해 해주지|대처할 것|어떤 능력|필요한 정서|공익과 사익|색깔로 표현|사람을 볼 때|휴가때|무엇을 택할/],
  ['profile',/경력|승선|선종|상선|실습|전역|군\s*복무|출신부대|아르바이트|직장|회사|사회\s*생활|사회\s*경험|근무|학점|학력|전공|몇\s*년|몇\s*개월|몇\s*번|어디|나이|형제|부모|고향|결혼|취미|특기|지원한 적|응시한 적|외국.*거주|시험.*처음|첫시험|면접.*처음|면접 본 적|무슨 일|직업|멘토|어떤 운동|최근.*유튜브|진급|항사|기사|군대|고등학교|졸업|의경|수험|팝송|동아리|사회 활동|휴일|해외 여행|영어.*(?:잘|할 줄)|해외 임무|배를 (?:타|얼마나)|무슨 배|선박.*타셨|함정경험|무슨 출신|직별|공단|배 내리고|필기.*체력/]
 ];
 if(a?.disposition==='context_needed'){
  for(const [kind,re] of rules){const match=q.prompt.match(re);if(match)return {kind,method:'wording-rule-v1',quote:match[0]};}
  return {kind:'hold',method:'insufficient-context-v1',quote:q.prompt};
 }
 // Even in the source's job section, personal/opinion/follow-up questions need a different rubric.
 const jobRules=[['followup',/꼬리질문|^그럼|^그 과정|^그래서/],['practical',/영어로|영작|해사영어.*(?:지시|말|표현)/],['personality_experience',/본인.*경험|경험.*말해|해\s*본\s*적|해본\s*적/],['personality_opinion',/본인.*생각|어떻게\s*생각|찬반|찬성.*반대/]];
 for(const [kind,re] of jobRules){const match=q.prompt.match(re);if(match)return {kind,method:'wording-rule-v1',quote:match[0]};}
 return {kind:'job_knowledge',method:'source-category-v1',quote:q.prompt};
}
function terms(answer){
 const found=[];
 // Literal candidates, not mandatory words. Each carries an exact source substring.
 const re=/[A-Z][A-Z0-9/-]{1,15}|[가-힣]{2,}(?:주의|원칙|권리|의무|요건|절차|장치|설비|방식|법칙|작용|압력|온도|기관|구역|신호|오염|안전|증거|혐의)|제\s*\d+\s*조(?:의\s*\d+)?/g;
 for(const m of answer.matchAll(re)){if(!found.includes(m[0]))found.push(m[0]);}
 return found.slice(0,16);
}
const records=[];
for(const q of corpus.questions){
 const a=amap.get(q.id);
 if(q.category!=='job'&&!['knowledge_review','context_needed'].includes(a?.disposition))continue;
 const classification=classify(q,a),occ=byQuestion.get(q.id)||[],answers=[];
 for(const o of occ){if(o.answer.trim()&&!answers.some(e=>e.text===o.answer))answers.push({occurrence_id:o.id,source_id:o.source_id,locator:o.locator,text:o.answer});}
 const candidates=answers.flatMap(e=>terms(e.text).map(term=>({term,occurrence_id:e.occurrence_id,quote:term}))).filter((v,i,arr)=>arr.findIndex(e=>e.term===v.term)===i);
 const flags=['needs_classification_review'];
 if(classification.kind==='job_knowledge')flags.push('needs_rubric_authoring','needs_current_source_verification');
 if(!answers.length)flags.push('missing_source_answer');
 if(answers.length>1)flags.push('multiple_source_answers');
 if(classification.kind==='followup'||classification.kind==='hold')flags.push('not_standalone');
 const example=authored.get(q.id);
 if(example)for(const criterion of example.criteria)if(!answers.some(a=>a.text.includes(criterion.source_quote)))throw Error('Unbacked example '+q.id);
 records.push({question_id:q.id,source_prompt:q.prompt,source_category:q.category,tracks:q.tracks,
  origin_disposition:a?.disposition||'job_source',classification:{...classification,rationale:reasons[classification.kind]},status:'draft',
  source_answers:answers,term_candidates:candidates,criteria:example?.criteria||[],critical_errors:example?.critical_errors||[],score_map:null,
  provenance:occ.map(o=>({occurrence_id:o.id,source_id:o.source_id,filename:sources.get(o.source_id).filename,year:o.year,region:o.region,locator:o.locator,neighbors:adjacent.get(o.id)})),flags});
}
for(const id of overrides.keys())if(!records.some(r=>r.question_id===id&&r.origin_disposition==='knowledge_review'))throw Error('Unknown override '+id);
const count=values=>values.reduce((r,k)=>(r[k]=(r[k]||0)+1,r),{});
const report={source_sha256:digest(fs.readFileSync(path.join(dir,'interview-corpus.json'))),analysis_sha256:digest(fs.readFileSync(path.join(dir,'interview-personality-analysis.json'))),records:records.length,original_job:records.filter(r=>r.source_category==='job').length,classification_review:count(records.filter(r=>r.source_category==='personality').map(r=>r.origin_disposition)),proposed_kinds:count(records.map(r=>r.classification.kind)),knowledge_review_kinds:count(records.filter(r=>r.origin_disposition==='knowledge_review').map(r=>r.classification.kind)),context_review_kinds:count(records.filter(r=>r.origin_disposition==='context_needed').map(r=>r.classification.kind)),original_job_with_answer:records.filter(r=>r.source_category==='job'&&r.source_answers.length).length,original_job_without_answer:records.filter(r=>r.source_category==='job'&&!r.source_answers.length).length,with_term_candidates:records.filter(r=>r.term_candidates.length).length,with_authored_criteria:records.filter(r=>r.criteria.length).length,approved:0,auto_scoring_ready:0};
fs.writeFileSync(path.join(dir,'interview-rubric-drafts.json'),JSON.stringify({report,records},null,2)+'\n');
fs.writeFileSync(path.join(dir,'interview-rubric-report.json'),JSON.stringify(report,null,2)+'\n');
const literal=v=>"'"+JSON.stringify(v).replace(/'/g,"''")+"'::jsonb";
const sql=['-- Review drafts; never overwrites administrator edits or changes question categories.','begin;'];
for(let i=0;i<records.length;i+=30)sql.push(`insert into public.ip_question_rubrics(question_id,source_prompt,source_category,kind,rationale,source_draft,criteria,critical_errors) select r->>'question_id',r->>'source_prompt',r->>'source_category',r->'classification'->>'kind',r->'classification'->>'rationale',r,r->'criteria',r->'critical_errors' from jsonb_array_elements(${literal(records.slice(i,i+30))}) r join public.ip_questions q on q.id=r->>'question_id' and q.prompt=r->>'source_prompt' and q.category=r->>'source_category' on conflict(question_id) do nothing;`);
sql.push('commit;');fs.writeFileSync(path.join(dir,'interview-rubric-drafts.sql'),sql.join('\n')+'\n');
console.log(JSON.stringify(report,null,2));
