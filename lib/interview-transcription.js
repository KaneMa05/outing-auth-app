'use strict';
// Use the imported teaching corpus, not student writings or generated model answers.
const corpus=require('../supabase/seeds/interview-corpus.json');
const drafts=require('../supabase/seeds/interview-rubric-drafts.json');
const stop=new Set('본인 본인에게 본인이 자신 어떤 어떻게 무엇 무엇인가요 무엇입니까 설명 설명해 설명하고 설명해보세요 말씀 말씀해주세요 말해보세요 말해주세요 작성하세요 대해서 관련 관련해 가장 이유 생각 경험 경우 있습니다 입니다 생각하십니까 않고 대한 따라 저는 먼저 있는 필요한 가능한 실제 함께 위해 통해 또는 대해 해당 이를 수가'.split(' '));
function terms(text){return (String(text||'').match(/[가-힣A-Za-z][가-힣A-Za-z0-9.+-]{1,29}/g)||[])
 .map(t=>t.replace(/[.+-]+$/,'').replace(/([가-힣]{2,})(에서는|에서|으로|은|는|을|를|의)$/,'$1'))
 .filter(t=>!stop.has(t)&&!/(니다|니까|세요|하며|하는|하고|이다)$/.test(t));}
const answers=new Map(),rubrics=new Map(drafts.records.map(r=>[r.question_id,r]));
for(const o of corpus.occurrences){if(o.answer){if(!answers.has(o.question_id))answers.set(o.question_id,[]);answers.get(o.question_id).push(o.answer);}}
const frequency={job:new Map(),personality:new Map()};
const entries=corpus.questions.map(q=>{
 const source=[q.prompt,...(answers.get(q.id)||[])].join('\n');
 const candidates=(rubrics.get(q.id)?.term_candidates||[]).map(c=>c.term).filter(t=>typeof t==='string'&&source.includes(t));
 const hints=[...new Set([...candidates,...terms(q.prompt),...terms((answers.get(q.id)||[]).join('\n'))])].filter(t=>t.length>=2&&t.length<=80);
 const category=q.category==='job'?'job':'personality';
 for(const term of hints)frequency[category].set(term,(frequency[category].get(term)||0)+1);
 return {prompt:q.prompt,category,words:new Set(terms(q.prompt)),hints};
});
const popular=Object.fromEntries(Object.entries(frequency).map(([mode,counts])=>[mode,[...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(x=>x[0])]));
function recognitionHints(question,mode){
 const words=terms(question),category=mode==='job'?'job':'personality',counts=frequency[category];
 const ranked=entries.filter(e=>e.category===category).map(e=>({entry:e,score:e.prompt===question?10000:words.reduce((s,w)=>s+(e.words.has(w)?1/Math.log(2+(counts.get(w)||0)):0),0)}))
  .filter(r=>r.score>0).sort((a,b)=>b.score-a.score).slice(0,3);
 return [...new Set([...words,...ranked.flatMap(r=>r.entry.hints.slice(0,40)),...popular[category]])].slice(0,100);
}
function join(a,b){return a&&b?a.trimEnd()+' '+b.trimStart():a||b;}
class LiveTranscript {
 constructor(){this.committed='';this.partial='';}
 update(text,partial){
  if(typeof text!=='string')return this.text();
  const value=text.trim();
  if(partial)this.partial=value;
  else{this.committed=join(this.committed,value);this.partial='';}
  return this.text();
 }
 text(){return join(this.committed,this.partial).slice(0,12000);}
}
module.exports={recognitionHints,LiveTranscript,sourceQuestionCount:entries.length};
