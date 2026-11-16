// Preserve the exact submitted WAV so retries cannot change bytes through another decode.
export async function openJobSubmissions({indexedDB=globalThis.indexedDB}={}){
 const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('ronpark-job-submissions-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('prepared',{keyPath:['accountId','id']});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('storage_blocked'));});
 db.onversionchange=()=>db.close();
 function work(mode,accountId,id,blob){
  if(typeof accountId!=='string'||!accountId||typeof id!=='string'||!id)throw Error('invalid_owner');
  return new Promise((resolve,reject)=>{const tx=db.transaction('prepared',mode==='get'?'readonly':'readwrite'),store=tx.objectStore('prepared');let result;
   tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(tx.error||Error('storage_aborted'));tx.onerror=()=>{};
   const r=store.get([accountId,id]);r.onsuccess=()=>{
    if(mode==='get')result=r.result?.blob;
    if(mode==='put'){if(r.result)result=r.result.blob;else{store.add({accountId,id,blob});result=blob;}}
    if(mode==='remove')store.delete([accountId,id]);
   };
  });
 }
 return {get:(owner,id)=>work('get',owner,id),put:(owner,id,blob)=>{if(!(blob instanceof Blob)||blob.type!=='audio/wav'||blob.size>3000000)throw Error('invalid_audio');return work('put',owner,id,blob);},remove:(owner,id)=>work('remove',owner,id),close:()=>db.close()};
}
