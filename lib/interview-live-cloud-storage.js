'use strict';
const {wavHeader,createStorage}=require('./interview-live-storage');
const {UUID}=require('./interview-ai-validation');
const CHUNK=960000,MAX=30000000;
function createCloudStorage({url,key,fetchImpl=fetch}){
 const base=url.replace(/\/$/,'')+'/storage/v1',bucket='interview-live';
 const legacy=createStorage({url,key,fetchImpl});
 async function request(method,route,body,type){
  const r=await fetchImpl(base+route,{method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{apikey:key,Authorization:'Bearer '+key,...(type?{'Content-Type':type}:{}),...(method==='POST'&&type==='audio/wav'?{'x-upsert':'true'}:{})},body});
  if(!r.ok)throw Error('recording_unavailable');return r;
 }
 function valid(id){if(!UUID.test(id))throw Error('invalid_request');}
 async function list(id){valid(id);const r=await request('POST','/object/list/'+bucket,JSON.stringify({prefix:id+'/',limit:100,offset:0,sortBy:{column:'name',order:'asc'}}),'application/json');
  const rows=await r.json();if(!Array.isArray(rows)||rows.length>=100||rows.some(r=>! /^(input|output)(-\d{3})?\.wav$/.test(r.name)))throw Error('invalid_recording');return rows.map(r=>r.name);}
 const store={
  signed:legacy.signed,
  async put(id,name,pcm){valid(id);if(!/^(input|output)(-\d{3})?\.wav$/.test(name)||pcm.length>MAX||pcm.length%2)throw Error('invalid_recording');
   await request('POST','/object/'+bucket+'/'+id+'/'+name,Buffer.concat([wavHeader(pcm.length),pcm]),'audio/wav');},
  async get(id,name){valid(id);const r=await request('GET','/object/authenticated/'+bucket+'/'+id+'/'+name);const b=Buffer.from(await r.arrayBuffer());
   if(b.length<44||b.length>MAX+44||!b.subarray(0,44).equals(wavHeader(b.length-44))||(b.length-44)%2)throw Error('invalid_recording');return b.subarray(44);},
  list,
  async removeNames(id,names){valid(id);if(!names.length)return;await request('DELETE','/object/'+bucket,JSON.stringify({prefixes:names.map(n=>id+'/'+n)}),'application/json');},
  async remove(id){await store.removeNames(id,await list(id));},
  async recover(id){
   const names=await list(id);if(names.includes('input.wav')&&names.includes('output.wav'))return true;
   if(!names.some(n=>n.startsWith('input-')))return false;
   for(const channel of ['input','output']){
    const parts=names.filter(n=>new RegExp('^'+channel+'-\\d{3}\\.wav$').test(n)).sort();const buffers=[];let total=0;
    for(let i=0;i<parts.length;i++){
     if(parts[i]!==channel+'-'+String(i).padStart(3,'0')+'.wav')throw Error('incomplete_recording');
     const data=await store.get(id,parts[i]);total+=data.length;
     if(data.length>CHUNK||i<parts.length-1&&data.length!==CHUNK||total>MAX)throw Error('incomplete_recording');buffers.push(data);
    }
    await store.put(id,channel+'.wav',Buffer.concat(buffers));
   }
   await store.removeNames(id,names.filter(n=>/-(\d{3})\.wav$/.test(n))).catch(()=>{});return true;
  }
 };return store;
}
// Fixed-size remote pieces are checkpoints, not browser-controlled uploads.
function createCloudRecorder(store,id){
 const sizes={input:0,output:0},pieces={input:new Map(),output:new Map()};let closed=false,flight;
 function append(channel,base64,startMs){
  if(closed)return;if(!pieces[channel]||typeof base64!=='string'||base64.length>2800000)throw Error('invalid_recording');
  const bytes=Buffer.from(base64,'base64');let offset=channel==='output'&&Number.isFinite(startMs)?Math.round(startMs*24)*2:sizes[channel];
  if(offset<0||offset+bytes.length>MAX||bytes.length%2)throw Error('recording_limit');
  const end=offset+bytes.length;sizes[channel]=Math.max(sizes[channel],end);
  // Explicit zero-filled pieces preserve output timeline gaps.
  for(let i=0;i<Math.ceil(sizes[channel]/CHUNK);i++)if(!pieces[channel].has(i))pieces[channel].set(i,{buffer:Buffer.alloc(CHUNK),version:1,saved:0});
  let source=0;while(source<bytes.length){const index=Math.floor(offset/CHUNK),local=offset%CHUNK,n=Math.min(bytes.length-source,CHUNK-local),piece=pieces[channel].get(index);bytes.copy(piece.buffer,local,source,source+n);piece.version++;source+=n;offset+=n;}
 }
 async function flush(){
  if(flight)return flight;
  flight=(async()=>{const started=Date.now();for(const channel of ['input','output'])for(const [index,piece] of pieces[channel]){
   if(piece.saved===piece.version)continue;const version=piece.version;
   if(Date.now()-started>45000)throw Error('recording_unavailable');
   const bytes=Buffer.from(piece.buffer.subarray(0,Math.min(CHUNK,sizes[channel]-index*CHUNK)));
   await store.put(id,channel+'-'+String(index).padStart(3,'0')+'.wav',bytes);piece.saved=version;
  }})();try{await flight;}finally{flight=null;}
 }
 return {sizes,dir:id,append,flush,close(){closed=true;},async finalize(){
  closed=true;if(flight)await flight;await flush();
  for(const channel of ['input','output']){
   const buffers=[...pieces[channel]].map(([i,p])=>p.buffer.subarray(0,Math.min(CHUNK,sizes[channel]-i*CHUNK)));
   await store.put(id,channel+'.wav',Buffer.concat(buffers));
  }
  await store.removeNames(id,[...pieces.input.keys()].map(i=>'input-'+String(i).padStart(3,'0')+'.wav').concat([...pieces.output.keys()].map(i=>'output-'+String(i).padStart(3,'0')+'.wav'))).catch(()=>{});
 }};
}
module.exports={createCloudStorage,createCloudRecorder,CHUNK};
