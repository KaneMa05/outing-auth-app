function normalizePhone(value){
  if(typeof value!=='string'||value.length>30||!/^[+\d\s()-]*$/.test(value))throw Error('invalid_phone');
  let phone=value.replace(/\D/g,'');
  if(value.trim().startsWith('+82'))phone='0'+phone.slice(2);
  if(phone&&!/^01\d{8,9}$/.test(phone))throw Error('invalid_phone');
  if(!phone&&value.trim())throw Error('invalid_phone');
  return phone;
}

async function withAdminContacts(result,actor,invoke){
  if(actor?.type!=='admin')throw Error('forbidden');
  if(!Array.isArray(result?.members)||result.members.length>30)throw Error('invalid_request');
  if(!result.members.length)return result;
  const response=await invoke('admin_contact_list',actor,{studentIds:result.members.map(m=>m.id)});
  if(!Array.isArray(response?.contacts))throw Error('interview_unavailable');
  const contacts=new Map(response.contacts.map(c=>[c.student_id,c]));
  return {...result,members:result.members.map(m=>({...m,phone:contacts.get(m.id)?.phone||'',phone_revision:contacts.get(m.id)?.revision||0}))};
}
module.exports={normalizePhone,withAdminContacts};
