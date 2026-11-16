'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {analyzeTask,reportInput,reportSchema,reportInstructions}=require('../lib/interview-mock-analysis.cjs');
const context=require('../lib/interview-test-report-context.cjs');
const holds=require('../lib/interview-practice-hold-reasons.cjs');
const reference=require('../lib/interview-practice-reference.cjs');
const {mergePracticeReports}=require('../lib/interview-practice-agreement.cjs');
const {createReports}=require('../lib/interview-openai-report.cjs');
const {digest}=require('../lib/interview-exam-scoring');
const run={state:'completed',turns:[
 {kind:'initial',parentQuestionId:'a',question:'협력 경험은?',answer:'체크리스트를 만들었습니다.',complete:true},
 {kind:'followup',parentQuestionId:'a',question:'어떻게 나눴나요?',answer:'여유 있는 팀원이 구매하고 다른 팀원은 확인했습니다.',complete:true},
 {kind:'followup',parentQuestionId:'a',question:'어떻게 운영했나요?',answer:'진행을 공유하고 늦으면 도움을 요청했습니다.',complete:true},
 {kind:'initial',parentQuestionId:'b',question:'실패 경험은?',answer:'통계 출처를 빠뜨렸습니다.',complete:true},
 {kind:'followup',parentQuestionId:'b',question:'왜 바꿨나요?',answer:'혼자 검토하는 데 한계가 있었습니다.',complete:true},
 {kind:'followup',parentQuestionId:'b',question:'반응은?',answer:'수정 후 다시 자료 역할을 맡겼습니다.',complete:true}]};
const base=()=>({summary:'역할 조정과 진행 공유를 설명했습니다.',strengths:[],improvements:[],nextPractice:[]});
function output(input){return {...base(),groupReviews:input.questionGroups.map(g=>({groupId:g.id,evidence:g.turnIds.filter(id=>input.turns.find(t=>t.id===id).answer.trim()).map(id=>({turnId:id,quote:input.turns.find(t=>t.id===id).answer})),remainingDetail:''}))};}
test('test live combines six turns in two groups, requires every answer citation and preserves source hash',async()=>{
 let calls=0;
 const result=await analyzeTask({kind:'report',testApp:true,run},{models:{analyzer:'stub'},infer:async(input,config)=>{
  calls++;assert.deepEqual(input.questionGroups.map(g=>g.turnIds),[['1','2','3'],['4','5','6']]);
  assert(config.instructions.includes('꼬리 답변에서 보완된 사실'));assert(config.schema.properties.groupReviews);return output(input);
 }});
 assert.equal(calls,1);assert.equal(result.audit.sourceHash,digest(reportInput(run)));assert.equal(result.audit.contextReview.groups.length,2);assert.deepEqual(result.analysis,base());
});
test('missing, cross-group, question-only or invented evidence is rejected without retry',async()=>{
 for(const change of [r=>r.groupReviews[0].evidence.pop(),r=>r.groupReviews[0].evidence[0].turnId='4',r=>r.groupReviews[0].evidence[0].quote=run.turns[0].question,r=>r.groupReviews[0].evidence[0].quote='없는 사실',r=>r.groupReviews.push(r.groupReviews[0])]){
  let calls=0;await assert.rejects(analyzeTask({kind:'report',testApp:true,run},{models:{analyzer:'stub'},infer:async input=>{calls++;const raw=output(input);change(raw);return raw;}}),/invalid_context/);assert.equal(calls,1);
 }
});
test('empty and incomplete turns retain their state; orphan or conflicting parent is isolated',()=>{
 const changed=structuredClone(run);changed.state='interrupted';changed.turns[2].complete=false;changed.turns[2].answer='';changed.turns[4].parentQuestionId='other';
 const input=context.groupedInput(reportInput(changed),changed);assert.equal(input.turns[2].complete,false);assert.deepEqual(input.questionGroups.map(g=>g.turnIds),[['1','2','3'],['4'],['5'],['6']]);context.validate(output(input),input);
});
test('ordinary live input, instructions, schema and report remain unchanged',async()=>{
 const result=await analyzeTask({kind:'report',run},{models:{analyzer:'stub'},infer:async(input,c)=>{assert.deepEqual(input,reportInput(run));assert.equal(c.schema,reportSchema);assert.equal(c.instructions,reportInstructions);return base();}});
 assert.equal(result.audit.contextReview,undefined);assert.deepEqual(result.analysis,base());
});
test('hold causes distinguish recognition, evaluation, invalid evidence and definite disagreements without regrading',()=>{
 const criteria=reference.criteriaForAnswer('상황을 확인합니다.');
 function rows(cause,quote=''){const raw=[{index:0,status:'uncertain',quote,reason:'확정하기 어렵습니다.',uncertaintyReason:cause}];return holds.classify(reference.validateAssessment(raw,criteria,'상황을 확인합니다.'),raw);}
 for(const cause of ['recognition_uncertain','evaluation_uncertain'])assert.equal(rows(cause)[0].holdReason,cause);
 assert.equal(rows('recognition_uncertain','발화하지 않은 내용')[0].holdReason,'evidence_invalid');
 assert.equal(rows('none')[0].holdReason,'evidence_invalid');
 const report=assessment=>({assessment,analysis:base()});
 const definite=status=>[{index:0,status,quote:'상황',reason:'확인',holdReason:null}];
 const merged=mergePracticeReports([report(definite('O')),report(definite('X'))],['상황','상황'],{separateHolds:true});assert.equal(merged.assessment[0].holdReason,'evaluation_disagreement');assert.equal(merged.assessment[0].status,'uncertain');
 const uncertain=mergePracticeReports([report(rows('evaluation_uncertain')),report(rows('evaluation_uncertain'))],['상황','상황'],{separateHolds:true});assert.equal(uncertain.assessment[0].holdReason,'evaluation_uncertain');assert(!uncertain.analysis.summary.includes('음성 인식'));
});
test('legacy test job display is truthful, immutable and leaves personality/ordinary reports untouched',()=>{
 const value={report:{assessmentBasis:'source_answer',assessment:[{index:0,status:'uncertain',reason:'과거 사유'},{index:1,status:'O',reason:'확인'}]}};
 const before=structuredClone(value),updated=holds.decorateSaved(value,true);assert.equal(updated.report.assessment[0].holdReason,'legacy_unclassified');assert.equal(updated.report.assessment[1].status,'O');assert.deepEqual(value,before);assert.equal(holds.decorateSaved(value,false),value);
 const personality={report:{assessmentBasis:'unavailable'}};assert.equal(holds.decorateSaved(personality,true),personality);
});
test('authenticated test flag reaches one provider request; saved report and uncertain result never retry',async()=>{
 let calls=0,saved=null,claimed=false;
 const invoke=async(action,actor,b)=>{if(action==='claim'){if(claimed)return {claimed:false,processing:saved};claimed=true;return {claimed:true};}if(action==='complete'){saved={state:'completed',report:b.report};return {processing:saved};}if(action==='get')return {processing:saved};throw Error(action);};
 const reports=createReports({invoke,key:'stub',model:'stub',fetchImpl:async(_,options)=>{calls++;const b=JSON.parse(options.body),input=JSON.parse(b.input);assert.equal(b.max_output_tokens,4500);return {ok:true,text:async()=>JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(output(input))}]}]})};}});
 const actor={type:'student',id:'stub',testApp:true};await reports.request(actor,{...run,id:'stub'});await reports.get(actor,'stub');await reports.request(actor,{...run,id:'stub'});assert.equal(calls,1);assert.equal(saved.report.audit.contextReview.groups.length,2);
});
