'use strict';
const text=value=>typeof value==='string'?value:'';
function experienceContent(row){
 if(Object.hasOwn(row,'content'))return text(row.content);
 return [['period','시기'],['affiliation','소속'],['situation','상황'],['action','행동'],['result','결과']].filter(([key])=>row[key]).map(([key,label])=>`${label}: ${row[key]}`).join('\n\n');
}
function savedAnswers(content,question){
 const value=text(content).replace(/\r\n?/g,'\n'),heading='질문: '+text(question).replace(/\r\n?/g,'\n').trim();
 if(heading==='질문: ')return [];
 const answers=[];let offset=0,index;
 while((index=value.indexOf(heading,offset))!==-1){
  offset=index+heading.length;
  if(index>0&&value[index-1]!=='\n')continue;
  let start=offset;while(value[start]===' '||value[start]==='\t')start++;
  if(start<value.length&&value[start]!=='\n')continue;
  const next=/\n[ \t]*질문:/.exec(value.slice(start));
  answers.push(value.slice(start,next?start+next.index:value.length).trim());
 }
 return answers;
}
function questionUsage(questions,profile){
 const experiences=(Array.isArray(profile?.experiences)?profile.experiences:[]).filter(row=>row&&typeof row==='object').map(row=>({id:text(row.id),title:text(row.title),age:row.age??'',content:experienceContent(row),appeal:Object.hasOwn(row,'appeal')?text(row.appeal):text(row.learning)}));
 const items=(Array.isArray(questions)?questions:[]).filter(q=>typeof q==='string').map(question=>({question,matches:experiences.flatMap(row=>savedAnswers(row.content,question).map(answer=>({experienceId:row.id,experienceTitle:row.title,answer})))}));
 return {profileAvailable:!!profile,savedAt:profile?.updated_at||null,questionCount:items.length,addedQuestionCount:items.filter(q=>q.matches.length).length,savedAnswerCount:items.filter(q=>q.matches.some(m=>m.answer)).length,questions:items,experiences};
}
module.exports={questionUsage,savedAnswers};
