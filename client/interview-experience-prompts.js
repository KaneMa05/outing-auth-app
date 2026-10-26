export function appendExperiencePrompt(content,question) {
  const original=String(content||''),heading=`질문: ${question}`;
  if(original.split('\n').includes(heading))return {content:original,reason:'duplicate'};
  const next=original+(original?'\n\n':'')+heading+'\n';
  if([...next].length>12000)return {content:original,reason:'limit'};
  return {content:next,reason:'added'};
}
