'use strict';
const fail=()=>{throw Error('invalid_request');};
const string=(value,max)=>typeof value==='string'&&value.length<=max;
function validate(body){
 const common=['action','studentId','deviceToken'];
 const fields={admin_enrollment_list:['page','search','enrollmentStatus','reasonId','terminationScope'],admin_enrollment_history:['targetStudentId'],admin_enrollment_reason_save:['id','revision','name','active','requiresNote'],admin_enrollment_change:['operation','items','scope','reasonId','note']}[body.action];
 if(!fields||Object.keys(body).some(key=>![...common,...fields].includes(key)))fail();
 if(body.action==='admin_enrollment_list'){
  if(body.page!==undefined&&(!Number.isInteger(body.page)||body.page<0||body.page>100000))fail();
  if(body.search!==undefined&&!string(body.search,200))fail();
  if(body.reasonId!==undefined&&!string(body.reasonId,120))fail();
  if(body.enrollmentStatus!==undefined&&!['','active','ended','expired','suspended'].includes(body.enrollmentStatus))fail();
  if(body.terminationScope!==undefined&&!['','interview','app'].includes(body.terminationScope))fail();
 }else if(body.action==='admin_enrollment_history'){
  if(!string(body.targetStudentId,120)||!body.targetStudentId)fail();
 }else if(body.action==='admin_enrollment_reason_save'){
  if(!string(body.id,120)||!string(body.name,80)||!body.name.trim()||!Number.isInteger(body.revision)||body.revision<0||typeof body.active!=='boolean'||typeof body.requiresNote!=='boolean')fail();
 }else{
  if(!['end','restore'].includes(body.operation)||!['active','interview','app'].includes(body.scope)||!string(body.reasonId,120)||!string(body.note,2000)||!Array.isArray(body.items)||body.items.length<1||body.items.length>100)fail();
  if(body.operation==='end'?(body.scope==='active'||!body.reasonId):(body.scope!=='active'||body.reasonId!==''))fail();
  const ids=new Set();
  for(const item of body.items){
   if(!item||Object.keys(item).some(k=>!['id','revision','memberUpdatedAt'].includes(k))||!string(item.id,120)||!item.id||ids.has(item.id)||!Number.isInteger(item.revision)||item.revision<0||!string(item.memberUpdatedAt,60)||!Number.isFinite(Date.parse(item.memberUpdatedAt)))fail();
   ids.add(item.id);
  }
 }
}
async function invoke(action,actor,body,read){return read('POST','rpc/ip_enrollment_service',{p_action:action,p_actor:actor,p_body:body});}
module.exports={validate,invoke};
