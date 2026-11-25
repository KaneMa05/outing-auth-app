import {interviewProductLabel} from './interview-products.js?v=20261125-product-labels';
import {createRosterWorkbook} from './roster-workbook.mjs?v=20261120-admin-contacts';
import {formatInterviewPhone} from './interview-admin-contacts.mjs?v=20261120-admin-contacts';

// Use the existing administrator read API, including its registration and account checks.
// Export the full registered roster regardless of the current screen's filters or page.
export async function loadInterviewRoster(request,{isCurrent=()=>true,onProgress=()=>{}}={}){
  const members=[],ids=new Set();
  for(let page=0;page<=100000;page++){
    if(!isCurrent())return null;
    const result=await request('admin_members',{registeredOnly:true,includeContacts:true,page});
    if(!isCurrent())return null;
    if(!Array.isArray(result?.members))throw Error('invalid_roster_data');
    for(const member of result.members){
      if(!member||typeof member.id!=='string'||!member.id||!member.track||ids.has(member.id))throw Error('invalid_roster_data');
      ids.add(member.id);
      // Export only roster fields, never notes, account IDs or contact audit data.
      members.push({name:member.name,track:member.track,exam_number:member.exam_number,access_product:member.access_product,phone:member.phone||''});
    }
    onProgress(members.length);
    if(result.members.length<30)return members;
  }
  throw Error('invalid_roster_data');
}

export function createInterviewRosterWorkbook(members){
  const rows=[['이름','직렬','수험번호','과정','휴대폰 번호'],...members.map(member=>[
    member.name,member.track,member.exam_number,interviewProductLabel(member.access_product),formatInterviewPhone(member.phone),
  ])];
  return createRosterWorkbook('면접반 수강 명단',rows);
}

export function downloadInterviewRoster(members){
  const url=URL.createObjectURL(createInterviewRosterWorkbook(members));
  const link=document.createElement('a');
  const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
  link.href=url;link.download=`면접반_수강명단_${date}.xlsx`;
  document.body.append(link);
  try{link.click();}finally{link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
}
