const CHUNK_BYTES = 512 * 1024;
function base64(bytes) { let value=''; for(let i=0;i<bytes.length;i+=8192)value+=String.fromCharCode(...bytes.subarray(i,i+8192)); return btoa(value); }
export function createAttemptSync({attempts,request}) {
 return {
  async upload(accountId,id) {
   const record=await attempts.get(accountId,id);
   if(!['recorded','interrupted'].includes(record.state))throw Error('attempt_still_recording');
   const audio=await attempts.audio(accountId,id);if(!audio.size)throw Error('empty_recording');
   const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await audio.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');
   const metadata={id:record.id,mode:record.mode,state:record.state,questions:record.questions,mimeType:audio.type,bytes:audio.size,sha256};
   const response=await request({action:'create',attempt:metadata});
   if(response.status==='stored')return response;
   for(let index=0;index*CHUNK_BYTES<audio.size;index++){
    const data=base64(new Uint8Array(await audio.slice(index*CHUNK_BYTES,(index+1)*CHUNK_BYTES).arrayBuffer()));
    await request({action:'put',id,index,data});
   }
   return request({action:'finalize',id});
  }
 };
}
export function attemptRequest({url='/attempt-api',fetchImpl=fetch}={}) {
 return async body => {
  const r=await fetchImpl(url,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await r.json();if(!r.ok||!data.ok)throw Error(data.error||'upload_failed');return data.result;
 };
}
