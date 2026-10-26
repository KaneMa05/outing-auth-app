// Writing aids run locally; they never generate answers or send drafts to a server.
const general = [
  '언제, 어디서 있었던 일이며 당시 내가 맡은 역할은 무엇이었나요?',
  '그 상황에서 무엇을 고민했고, 왜 그런 선택을 했나요?',
  '내가 직접 한 행동을 순서대로 적으면 무엇인가요?',
  '그 뒤 어떤 결과가 있었고, 지금 다시 한다면 무엇을 바꾸고 싶나요?',
];
const sets = [
  {pattern:/갈등|의견\s*차이|다툼|불화|마찰|충돌/, questions:[
    '누구와 어떤 의견 차이가 있었고, 각자 무엇을 중요하게 생각했나요?',
    '상대의 입장을 확인하기 위해 어떤 말을 하거나 질문했나요?',
    '갈등을 풀기 위해 내가 직접 제안하거나 실천한 일은 무엇인가요?',
    '그 뒤 관계나 상황은 어떻게 달라졌고, 해결되지 않은 점은 무엇인가요?',
  ]},
  {pattern:/실패|실수|불합격|탈락|좌절/, questions:[
    '무엇을 이루려 했고, 기대와 실제 결과는 어떻게 달랐나요?',
    '그 과정에서 내가 바꿀 수 있었던 행동과 바꾸기 어려웠던 조건은 무엇인가요?',
    '결과를 확인한 뒤 내가 직접 수습하거나 다시 시도한 일은 무엇인가요?',
    '이후 비슷한 상황에서 행동이 달라진 사례가 있나요? 없다면 무엇을 바꾸고 싶나요?',
  ]},
  {pattern:/도전|목표|합격|성취|성공|대회|우승/, questions:[
    '어떤 목표를 세웠고, 나에게 그 목표가 중요했던 이유는 무엇인가요?',
    '가장 어려웠던 점은 무엇이며, 어떤 방법을 선택했나요?',
    '목표를 위해 내가 직접 반복하거나 개선한 행동은 무엇인가요?',
    '실제 결과와 확인할 수 있는 변화는 무엇이며, 이 경험에서 무엇을 배웠나요?',
  ]},
  {pattern:/협력|협업|팀|동아리|조별|공동/, questions:[
    '함께 이루려던 목표와 그 안에서 내가 맡은 역할은 무엇이었나요?',
    '서로 다른 의견이나 역할을 어떻게 조율했나요?',
    '다른 사람의 행동과 구분해 내가 직접 기여한 일은 무엇인가요?',
    '내 행동 뒤에 팀이나 결과가 어떻게 달라졌고, 다음에는 무엇을 보완하고 싶나요?',
  ]},
];
export function experiencePrompts(row={}) {
  // Inserted guide headings must not classify themselves as the student's experience.
  const source=`${row.title||''}\n${row.content||''}`.replace(/^질문:.*$/gm,'');
  return [...(sets.find(set=>set.pattern.test(source))?.questions||general)];
}

export function appendExperiencePrompt(content,question) {
  const original=String(content||''),heading=`질문: ${question}`;
  if(original.split('\n').includes(heading))return {content:original,reason:'duplicate'};
  const next=original+(original?'\n\n':'')+heading+'\n';
  if([...next].length>12000)return {content:original,reason:'limit'};
  return {content:next,reason:'added'};
}
