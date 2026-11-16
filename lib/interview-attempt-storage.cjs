'use strict';
// Dedicated persistent-volume adapter. Never point at a serverless temporary disk.
const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash, randomUUID} = require('node:crypto');
const digest = value => createHash('sha256').update(value).digest('hex');
const fail = code => { throw Error(code); };
const validId = id => typeof id === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(id);
const MAX_BYTES = 64 * 1024 * 1024, CHUNK_BYTES = 512 * 1024;
function createAttemptStorage({root, now = Date.now}) {
 if (!path.isAbsolute(root || '')) throw Error('absolute_storage_root_required');
 const locks = new Map();
 function serial(key, task) {
  const p = (locks.get(key) || Promise.resolve()).catch(() => {}).then(task); locks.set(key,p);
  return p.finally(() => { if (locks.get(key) === p) locks.delete(key); });
 }
 function directory(owner,id) {
  if (typeof owner !== 'string' || !owner || !validId(id)) fail('invalid_request');
  return path.join(root,digest(owner),id);
 }
 async function read(owner,id) {
  try { const r = JSON.parse(await fs.readFile(path.join(directory(owner,id),'manifest.json'),'utf8')); if (r.retainUntil <= now()) fail('expired'); return r; }
  catch(e) { if(e.code === 'ENOENT') fail('not_found'); throw e; }
 }
 async function write(dir, record) {
  const temp = path.join(dir,randomUUID()+'.tmp');
  try { await fs.writeFile(temp,JSON.stringify(record),{mode:0o600,flag:'wx'}); await fs.rename(temp,path.join(dir,'manifest.json')); }
  finally { await fs.rm(temp,{force:true}); }
 }
 return {
  async create(owner, input, {retainUntil}) {
   if (!Number.isFinite(retainUntil) || retainUntil <= now()) fail('not_enrolled');
   if (!input || typeof input!=='object' || !validId(input.id) || !['job','personality','ai'].includes(input.mode) || !['recorded','interrupted'].includes(input.state) || !Array.isArray(input.questions) || !input.questions.length || input.questions.length>30 || input.questions.some(q => !q || typeof q.id!=='string' || q.id.length>120 || !q.id || typeof q.prompt!=='string' || !q.prompt.trim() || q.prompt.length>4000) || new Set(input.questions.map(q=>q.id)).size!==input.questions.length || !/^audio\/(webm(;codecs=opus)?|mp4|ogg(;codecs=opus)?)$/.test(input.mimeType) || !Number.isInteger(input.bytes) || input.bytes<=0 || input.bytes>MAX_BYTES || !/^[a-f0-9]{64}$/.test(input.sha256||'')) fail('invalid_request');
   const dir=directory(owner,input.id);
   return serial(dir,async()=>{
    const payload={id:input.id,mode:input.mode,state:input.state,questions:input.questions.map(q=>({id:q.id,prompt:q.prompt})),mimeType:input.mimeType,bytes:input.bytes,sha256:input.sha256};
    const fingerprint=digest(JSON.stringify(payload));
    try { const old=await read(owner,input.id); if(old.fingerprint!==fingerprint) fail('idempotency_conflict'); return old; } catch(e) { if(e.message!=='not_found')throw e; }
    await fs.mkdir(dir,{recursive:true,mode:0o700});
    const record={...payload,fingerprint,createdAt:now(),retainUntil,status:'uploading',chunkCount:Math.ceil(input.bytes/CHUNK_BYTES),grade:null,score:null};
    await write(dir,record);return record;
   });
  },
  get:read,
  async put(owner,id,index,data) {
   const dir=directory(owner,id);
   return serial(dir,async()=>{
    const r=await read(owner,id);
    if(!Number.isInteger(index)||index<0||index>=r.chunkCount||!Buffer.isBuffer(data)||data.length!==Math.min(CHUNK_BYTES,r.bytes-index*CHUNK_BYTES)) fail('invalid_chunk');
    const file=path.join(dir,index+'.part');
    try { const old=await fs.readFile(file);if(!old.equals(data))fail('idempotency_conflict');return {ok:true}; } catch(e) { if(e.code!=='ENOENT')throw e; }
    if(r.status!=='uploading')fail('attempt_closed');
    const temp=path.join(dir,randomUUID()+'.tmp');
    try {await fs.writeFile(temp,data,{mode:0o600,flag:'wx'});await fs.rename(temp,file);} finally {await fs.rm(temp,{force:true});}
    return {ok:true};
   });
  },
  async finalize(owner,id) {
   const dir=directory(owner,id);
   return serial(dir,async()=>{
    const r=await read(owner,id);if(r.status==='stored')return r;
    const hash=createHash('sha256');let size=0;
    for(let i=0;i<r.chunkCount;i++){let bytes;try{bytes=await fs.readFile(path.join(dir,i+'.part'));}catch(e){if(e.code==='ENOENT')fail('upload_incomplete');throw e;}hash.update(bytes);size+=bytes.length;}
    if(size!==r.bytes||hash.digest('hex')!==r.sha256)fail('checksum_mismatch');
    const result={...r,status:'stored',storedAt:now()};await write(dir,result);return result;
   });
  },
  async audio(owner,id) {
   const r=await read(owner,id);if(r.status!=='stored')fail('upload_incomplete');
   const chunks=[];for(let i=0;i<r.chunkCount;i++)chunks.push(await fs.readFile(path.join(directory(owner,id),i+'.part')));
   const data=Buffer.concat(chunks);if(digest(data)!==r.sha256)fail('checksum_mismatch');return {record:r,data};
  },
  // Scheduler integration is deliberately separate. Do not erase local copies on upload.
  async sweepExpired() {
   let count=0;await fs.mkdir(root,{recursive:true,mode:0o700});
   for(const owner of await fs.readdir(root,{withFileTypes:true}))if(owner.isDirectory()&&/^[a-f0-9]{64}$/.test(owner.name)){
    for(const id of await fs.readdir(path.join(root,owner.name),{withFileTypes:true}))if(id.isDirectory()&&validId(id.name)){
     const dir=path.join(root,owner.name,id.name);
     await serial(dir,async()=>{try{const r=JSON.parse(await fs.readFile(path.join(dir,'manifest.json'),'utf8'));if(r.retainUntil<=now()){await fs.rm(dir,{recursive:true,force:true});count++;}}catch(e){if(e.code!=='ENOENT')throw e;}});
    }
   }return count;
  }
 };
}
module.exports={createAttemptStorage,CHUNK_BYTES,MAX_BYTES};
