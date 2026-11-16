'use strict';
const parts=[
 '저는 문제가 생기면 함께 확인하고 역할을 나누겠습니다.',
 '혼자 넘기면 누락이 이어질 수 있기 때문입니다.',
 '팀 과제에서 자료가 빠진 일이 있었습니다. 저는 빠진 항목을 정리하고 역할을 나눴습니다. 다음 날 자료를 모두 모아 발표를 마쳤습니다.',
 '이 경험에서 확인과 소통을 배웠습니다. 직무에서도 동료와 확인하며 협력하겠습니다.'
];
const transcript=parts.join(' '),question={id:'qa-personality',prompt:'협업하면서 문제를 해결한 경험을 말해주세요.',revision:2};
function analysis(){const ids=['conclusion','reason','experience','closing'];return {
 components:Object.fromEntries(ids.map((id,index)=>[id,{presence:'present',quality:'clear',quote:parts[index],feedback:['질문에 대한 입장을 먼저 제시했습니다.','누락을 예방해야 하는 이유를 설명했습니다.','본인의 행동과 결과가 드러납니다.','배운 점과 실천 방향을 정리했습니다.'][index]}])),
 experienceEvidence:{situation:'팀 과제에서 자료가 빠진 일이 있었습니다.',action:'저는 빠진 항목을 정리하고 역할을 나눴습니다.',result:'다음 날 자료를 모두 모아 발표를 마쳤습니다.'},
 connections:ids.slice(0,3).map((from,index)=>({from,to:ids[index+1],status:'connected',quote:parts.slice(index,index+2).join(' '),feedback:'앞 요소와 뒤 요소를 연결해 설명했습니다.'})),issues:[],summary:'결론과 근거, 본인의 행동·결과, 마무리가 포함되어 있습니다.',nextPractice:'첫 결론을 짧게 유지하며 본인의 행동을 더 구체화해 다시 말해보세요.'
};}
function provider(overrides={}){return {models:{transcriber:'fake-asr',analyzer:'fake-structure'},promptHash:'synthetic-prompt',transcribe:async()=>transcript,analyze:async()=>analysis(),...overrides};}
module.exports={parts,transcript,question,analysis,provider};
