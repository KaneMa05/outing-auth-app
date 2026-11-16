// Keep this lease for the entire recording/upload/delete operation.
// Browser Web Locks releases automatically when its document/process exits.
export async function withAttemptLease(id, task, {locks=globalThis.navigator?.locks}={}) {
 if(!locks)throw Error('attempt_lock_unsupported');
 return locks.request('ronpark-interview-attempt:'+id,{ifAvailable:true},lock=>{
  if(!lock)throw Error('attempt_in_use');return task();
 });
}
export async function recoverAttempts(attempts,accountId,options={}) {
 const recovered=[],busy=[];
 for(const record of await attempts.list(accountId))if(record.state==='recording'){
  try { await withAttemptLease(record.id,async()=>{
   const latest=await attempts.get(accountId,record.id);
   if(latest.state==='recording')recovered.push(await attempts.finish(accountId,record.id,{interrupted:true}));
  },options); } catch(error) { if(error.message==='attempt_in_use')busy.push(record.id);else throw error; }
 }
 return {recovered,busy};
}
