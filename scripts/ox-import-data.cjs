const fs=require('fs');
const vm=require('vm');
const path=require('path');
// Server-side import only: never embed this question bank in browser bundles.
function readBank(filename) {
  const data=JSON.parse(fs.readFileSync(filename,'utf8'));
  const context=vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../docs/criminal-law-ox-proposal/question-display.js'),'utf8')+';globalThis.present=questionPresentation;globalThis.reviewed=id=>standaloneDerivedIds.has(id)||derivedStatements.has(id);',context);
  const ids=new Set();
  data.questions=data.questions.map(q=> {
    if(ids.has(q.id) || !['O','X'].includes(q.correct_answer) || !q.prompt || !q.explanation_html) throw Error('Invalid question: '+q.id);
    ids.add(q.id);
    const reviewed=q.origin_type!=='derived_mcq' || context.reviewed(q.id);
    return {...q,original_prompt:q.prompt,original_context:q.context,...context.present(q),reviewed,status:reviewed?'published':'draft'};
  });
  return data;
}
module.exports={readBank};
