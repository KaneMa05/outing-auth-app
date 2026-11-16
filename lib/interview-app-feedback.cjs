'use strict';
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const fail=()=>{throw Object.assign(Error('invalid_request'),{status:400});};
function validate(action,b){
 const fields=action==='create'?['requestId','kind','content','screen','appVersion']:action==='admin_app_feedback_list'?['page','status']:action==='admin_app_feedback_update'?['id','revision','status']:null;
 if(!fields||!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!fields.includes(k)))fail();
 if(action==='create'){
  if(!uuid(b.requestId)||!['bug','suggestion'].includes(b.kind)||typeof b.content!=='string'||b.content.trim().length<2||b.content.length>2000||/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(b.content)||typeof b.screen!=='string'||!/^[a-zA-Z0-9._/-]{1,80}$/.test(b.screen)||typeof b.appVersion!=='string'||b.appVersion.length>50)fail();
 }else if(action==='admin_app_feedback_list'){
  if(b.page!==undefined&&(!Number.isInteger(b.page)||b.page<0||b.page>1000)||b.status!==undefined&&!['all','received','reviewing','resolved'].includes(b.status))fail();
 }else if(!uuid(b.id)||!Number.isInteger(b.revision)||b.revision<0||!['received','reviewing','resolved'].includes(b.status))fail();
}
async function feedback(action,actor,b,read){
 validate(action,b);
 if(action==='create'?actor?.type!=='student':actor?.type!=='admin')throw Object.assign(Error('forbidden'),{status:403});
 return read('POST','rpc/ip_test_app_feedback_service',{p_action:action,p_actor:actor,p_body:b});
}
module.exports={validate,feedback};
