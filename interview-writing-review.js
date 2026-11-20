import {mountWriting} from './interview-writing-ui.js?v=20261120-comment-text';

const host=document.querySelector('#app');
const kinds={introduction:'자기소개',motivation:'지원동기',public_service:'공직관',core:'핵심 30제'};
async function request(action,payload={}){
 const response=await fetch('/api/interview-prep',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,action}),signal:AbortSignal.timeout(30000)});
 const result=await response.json();
 if(!response.ok||!result.ok)throw Object.assign(Error(result.error||'unavailable'),{code:result.error});
 return result;
}
async function start(){
 const params=new URLSearchParams(location.search),studentId=params.get('studentId')||'',kind=params.get('kind'),itemId=params.get('itemId')||'';
 if(!studentId||studentId.length>120||!Object.hasOwn(kinds,kind)||itemId.length>120)throw Error('invalid_link');
 const response=await fetch('/api/teacher-session',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});
 const session=await response.json(),user=session.user;
 if(!response.ok||!session.ok||!user)throw Error('unauthorized');
 const allowed=permission=>Array.isArray(user.permissions)&&(user.permissions.includes('*')||user.permissions.includes(permission));
 if(user.role!=='admin'||!allowed('interview.read'))throw Error('forbidden');
 const canWrite=allowed('interview.write');
 host.innerHTML='<header class="ip-panel"><div class="ip-row"><h2></h2><button type="button" class="ip-btn" data-review-close>창 닫기</button></div><p class="ip-help" data-review-student></p></header><div data-review-editor></div>';
 const name=new URLSearchParams(location.hash.slice(1)).get('name')||studentId;
 const title=`${name} · ${kinds[kind]} ${canWrite?'첨삭':'조회'}`;
 document.title=title;host.querySelector('h2').textContent=title;
 host.querySelector('[data-review-student]').textContent=`학생 ID: ${studentId} · ${canWrite?'첨삭을 저장하면 학생에게 전달됩니다.':'조회 권한으로 열었습니다.'}`;
 const editor=mountWriting(host.querySelector('[data-review-editor]'),{request,admin:true,studentId,kind,initialItemId:itemId,canWrite,hideQuestionPicker:true});
 // The writing editor's beforeunload guard also protects the close button.
 host.querySelector('[data-review-close]').onclick=()=>window.close();
 window.addEventListener('pagehide',event=>{if(!event.persisted)editor.destroy();});
}
start().catch(error=>{
 host.replaceChildren();
 const message=document.createElement('p');message.setAttribute('role','alert');
 message.textContent=({unauthorized:'관리자 로그인이 필요합니다. 로그인 후 이 창을 새로고침해주세요.',forbidden:'제출물을 조회할 권한이 없습니다.',invalid_link:'첨삭 주소를 확인해주세요.'})[error.message]||'첨삭 화면을 불러오지 못했습니다. 잠시 후 새로고침해주세요.';
 host.append(message);
 const link=document.createElement('a');link.href='./teacher.html#interview-prep-admin?section=review';link.textContent='관리자 피드백 관리로 이동';host.append(link);
});
