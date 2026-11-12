'use strict';
const object=properties=>({type:'object',additionalProperties:false,properties,required:Object.keys(properties)});
const string={type:'string'};
function groupedInput(input,run){
 const groups=[];let current=null;
 const turns=input.turns.map((turn,i)=>{
  const parent=run.turns[i].parentQuestionId||null;
  // A conflicting or missing parent must not merge unrelated answers.
  if(turn.kind==='initial'||!current||!parent||parent!==current.parent){
   current={id:'g'+(groups.length+1),mainTurnId:turn.id,turnIds:[],parent};groups.push(current);
  }
  current.turnIds.push(turn.id);return {...turn,groupId:current.id};
 });
 return {...input,turns,questionGroups:groups.map(({parent,...g})=>g)};
}
function schema(base){return object({groupReviews:{type:'array',items:object({groupId:string,evidence:{type:'array',items:object({turnId:string,quote:string})},remainingDetail:string})},...base.properties});}
const instructions=` 메인 질문과 그에 연결된 꼬리질문은 questionGroups 단위로 함께 검토하세요. 꼬리 답변에서 보완된 사실을 메인 답변에 없다는 이유로 누락되었다고 평가하지 마세요. 이미 설명한 행동은 인정하고, 추가로 필요한 시점·빈도·결과 등 구체적인 차원만 개선점으로 쓰세요. 서로 다른 묶음의 경험을 섞지 마세요. 계획과 실제 수행, 부정·정정, 미완료 답변을 구분하세요. groupReviews는 각 그룹을 정확히 한 번 포함하고, 빈 답변을 제외한 모든 turnId마다 해당 answer의 200자 이내 정확한 연속 인용을 하나씩 evidence에 넣으세요. remainingDetail은 묶음 전체에서도 확인되지 않은 구체적인 보완점만 300자 이내로 적고 없으면 빈 문자열로 쓰세요. 이 검토를 바탕으로 최종 summary와 피드백을 작성하세요.`;
function validate(raw,input){
 const reviews=raw?.groupReviews;
 if(!Array.isArray(reviews)||reviews.length!==input.questionGroups.length)throw Error('invalid_context_review');
 for(const group of input.questionGroups){
  const matches=reviews.filter(r=>r?.groupId===group.id),r=matches[0];
  if(matches.length!==1||Object.keys(r).sort().join()!=='evidence,groupId,remainingDetail'||typeof r.remainingDetail!=='string'||r.remainingDetail.length>300||!Array.isArray(r.evidence))throw Error('invalid_context_review');
  const turns=input.turns.filter(t=>group.turnIds.includes(t.id)&&t.answer.trim());
  if(r.evidence.length!==turns.length)throw Error('invalid_context_review');
  for(const turn of turns){
   const rows=r.evidence.filter(e=>e?.turnId===turn.id),e=rows[0];
   if(rows.length!==1||Object.keys(e).sort().join()!=='quote,turnId'||typeof e.quote!=='string'||!e.quote.trim()||e.quote.length>200||!turn.answer.includes(e.quote))throw Error('invalid_context_evidence');
  }
 }
 const {groupReviews,...analysis}=raw;return {analysis,contextReview:{version:'group-context-1',groups:reviews}};
}
module.exports={groupedInput,schema,instructions,validate};
