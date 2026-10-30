'use strict';
// Explicit opt-in. Existing keyword criteria retain their exact-term rules.
const text=(v,max,empty=false)=>typeof v==='string'&&v.length<=max&&(empty||v.trim().length>0);
const keys=(v,names)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===names.length&&names.every(k=>Object.hasOwn(v,k));
function conceptRule(criterion){
 if(criterion.assessment===undefined)return null;
 const a=criterion.assessment;
 if(!keys(a,['mode','match','concepts','acceptedExamples','rejectedExamples'])||a.mode!=='concept'||!['all','any'].includes(a.match)||!Array.isArray(a.concepts)||a.concepts.length<1||a.concepts.length>5)throw Error('invalid_concept_rule');
 const seen=new Set();
 for(const c of a.concepts){
  if(!keys(c,['claim','relation','partial','reject'])||!text(c.claim,1000)||!text(c.relation,1000,true)||!text(c.partial,1000,true)||!text(c.reject,1000))throw Error('invalid_concept_rule');
  const label=c.claim.normalize('NFC').trim().toLowerCase();if(seen.has(label))throw Error('duplicate_concept');seen.add(label);
 }
 for(const examples of [a.acceptedExamples,a.rejectedExamples])if(!Array.isArray(examples)||examples.length>5||examples.some(e=>!text(e,1000)))throw Error('invalid_concept_rule');
 return {mode:'concept',match:a.match,concepts:a.concepts.map(c=>({...c})),acceptedExamples:[...a.acceptedExamples],rejectedExamples:[...a.rejectedExamples]};
}
function validateConceptCriteria(criteria){
 let count=0;for(const c of criteria){const rule=conceptRule(c);count+=rule?.concepts.length||0;}
 if(count>30)throw Error('too_many_concepts');
}
function conceptItems(rubric){
 return rubric.criteria.flatMap((c,criterionIndex)=>{const a=conceptRule(c);return (a?.concepts||[]).map((item,conceptIndex)=>({criterionIndex,conceptIndex,...item}));}).map((item,index)=>({index,...item}));
}
function aggregateConcept(match,rows){
 if(rows.some(r=>r.status==='uncertain'))return 'uncertain';
 if(rows.some(r=>r.status==='rejected'))return 'rejected';
 const accepted=rows.filter(r=>r.status==='accepted').length;
 if(match==='all'?accepted===rows.length:accepted>0)return 'accepted';
 return rows.some(r=>['accepted','partial'].includes(r.status))?'partial':'absent';
}
module.exports={conceptRule,validateConceptCriteria,conceptItems,aggregateConcept};
