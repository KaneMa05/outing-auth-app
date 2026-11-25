// Native screens use the current app's authenticated request closure. Credentials
// stay in their existing login flow; handoff messages contain only a mode and ID.
export function createPracticeGateway({accountId,request,onWebRecords},target=window){
 let active=null,closed=false;
 const receive=async(sessionId,body)=>{
  const session=active;
  if(closed||!session||session.id!==sessionId||!body||typeof body!=='object'||Array.isArray(body))throw Error('practice_session_expired');
  if(!['practice_bootstrap','sync','uploaded','captions','caption_update'].includes(body.action))throw Error('practice_action_forbidden');
  if(!['uploaded','captions'].includes(body.action)&&body.mode!==session.mode)throw Error('practice_mode_changed');
  const url=body.action==='practice_bootstrap'?'/api/interview-prep':'/api/interview-practice-records';
  const result=await request(url,body);
  if(closed||active!==session)throw Error('practice_session_expired');
  if(body.action==='practice_bootstrap'&&(result.accountId!==accountId||result.mode!==session.mode))throw Error('practice_account_changed');
  if(body.action==='captions'&&result.mode!==session.mode)throw Error('practice_mode_changed');
  return result;
 };
 const close=sessionId=>{if(active?.id===sessionId)active=null;};
 const webRecords=sessionId=>{if(active?.id!==sessionId||closed)return;const mode=active.mode;active=null;onWebRecords?.(mode);};
 target.__ronparkPracticeRequest=receive;target.__ronparkPracticeClose=close;
 target.__ronparkPracticeWebRecords=webRecords;
 return {
  open(mode){
   if(closed||!['job','personality'].includes(mode))throw Error('practice_mode_forbidden');
   if(active)throw Error('practice_already_open');
   const session={id:crypto.randomUUID(),mode};active=session;
   try{target.webkit.messageHandlers.interviewPractice.postMessage({mode,sessionId:session.id});}
   catch(error){active=null;throw error;}
   return session.id;
  },
  destroy(){closed=true;active=null;if(target.__ronparkPracticeRequest===receive)delete target.__ronparkPracticeRequest;if(target.__ronparkPracticeClose===close)delete target.__ronparkPracticeClose;if(target.__ronparkPracticeWebRecords===webRecords)delete target.__ronparkPracticeWebRecords;}
 };
}
