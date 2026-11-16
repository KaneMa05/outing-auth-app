const config=require('./interview-taxonomy.json');
const fields=new Set(config.fields.map(x=>x.id)),formats=new Set(config.formats.map(x=>x.id)),tags=new Set(config.tags.map(x=>x.id));
function validateTaxonomy(body){
 const bad=()=>{throw Object.assign(new Error('invalid_request'),{status:400});};
 for(const [key,allowed] of [['fieldId',fields],['answerFormat',formats],['materialTag',tags],['taxonomyStatus',new Set(['classified','needs_context','unclassified'])],['taxonomyView',new Set(['public_navigation'])]])
  if(body[key]!==undefined&&(typeof body[key]!=='string'||(body[key]!==''&&!allowed.has(body[key]))))bad();
 if(body.action!=='admin_question_taxonomy_save')return;
 if(typeof body.id!=='string'||!body.id||!Number.isInteger(body.questionRevision)||body.questionRevision<1||!Number.isInteger(body.revision)||body.revision<0||!['classified','needs_context'].includes(body.reviewStatus))bad();
 if(typeof body.primaryField!=='string'||(body.primaryField!==''&&!fields.has(body.primaryField)))bad();
 for(const [key,allowed,max,min] of [['relatedFields',fields,12,0],['answerFormats',formats,4,1],['materialTags',tags,2,0]]){
  const a=body[key];if(!Array.isArray(a)||a.length<min||a.length>max||new Set(a).size!==a.length||a.some(x=>typeof x!=='string'||!allowed.has(x)))bad();
 }
 if(body.relatedFields.includes(body.primaryField)||typeof body.rationale!=='string'||body.rationale.trim().length<5||body.rationale.length>4000||typeof body.contentNote!=='string'||body.contentNote.length>4000)bad();
}
module.exports={validateTaxonomy};
