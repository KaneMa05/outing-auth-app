'use strict';
// Pure authoring validation shared by API and scoring. Legacy terms remain OR alternatives.
const normalized=s=>s.normalize('NFC').toLowerCase().replace(/\s+/gu,' ').trim();
const text=(v,n)=>typeof v==='string'&&v.trim().length>0&&v.length<=n;
function keywordRule(criterion) {
 if(!criterion||!Array.isArray(criterion.terms)||criterion.terms.length<1||criterion.terms.length>30||criterion.terms.some(t=>!text(t,120)))throw Error('invalid_keyword_rule');
 if(criterion.keywords===undefined){
  if(criterion.match!==undefined&&!['any','all'].includes(criterion.match))throw Error('invalid_keyword_rule');
  // Explicit flat all is supported; old unspecific lists keep their original OR meaning.
  return {match:criterion.match||'any',keywords:criterion.terms.map(term=>({term,aliases:[]}))};
 }
 if(!['any','all'].includes(criterion.match)||!Array.isArray(criterion.keywords)||!criterion.keywords.length||criterion.keywords.length>30)throw Error('invalid_keyword_rule');
 const seen=new Set(),flat=[];
 for(const group of criterion.keywords){
  if(!group||Object.keys(group).some(k=>!['term','aliases'].includes(k))||!text(group.term,120)||!Array.isArray(group.aliases)||group.aliases.length>29||group.aliases.some(t=>!text(t,120)))throw Error('invalid_keyword_rule');
  for(const expression of [group.term,...group.aliases]){
   const key=normalized(expression);if(seen.has(key))throw Error('duplicate_keyword_expression');seen.add(key);flat.push(expression);
  }
 }
 if(flat.length>30||flat.length!==criterion.terms.length||flat.some((t,i)=>t!==criterion.terms[i]))throw Error('invalid_keyword_rule');
 return {match:criterion.match,keywords:criterion.keywords.map(k=>({term:k.term,aliases:[...k.aliases]}))};
}
function keywordCoverage(criterion,transcript,occurrences){
 const rule=keywordRule(criterion);
 const keywords=rule.keywords.map(group=>{
  const expressions=[group.term,...group.aliases],matched=expressions.filter(t=>occurrences(transcript,t).length);
  return {...group,matched,missing:matched.length===0};
 });
 const literalSatisfied=rule.match==='all'?keywords.every(k=>!k.missing):keywords.some(k=>!k.missing);
 return {match:rule.match,literalSatisfied,keywords};
}
module.exports={keywordRule,keywordCoverage};
