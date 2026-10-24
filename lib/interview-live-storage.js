'use strict';
const fs=require('node:fs'),path=require('node:path');
function wavHeader(bytes){const h=Buffer.alloc(44);h.write('RIFF');h.writeUInt32LE(36+bytes,4);h.write('WAVEfmt ',8);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(1,22);h.writeUInt32LE(24000,24);h.writeUInt32LE(48000,28);h.writeUInt16LE(2,32);h.writeUInt16LE(16,34);h.write('data',36);h.writeUInt32LE(bytes,40);return h;}
function createRecorder(root,id){
 if(!/^[a-f0-9-]{36}$/.test(id))throw Error('invalid_request');
 const dir=path.resolve(root,id);fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const files={},sizes={input:0,output:0};let closed=false;
 for(const channel of ['input','output']){files[channel]=fs.openSync(path.join(dir,channel+'.wav'),'wx',0o600);fs.writeSync(files[channel],wavHeader(0));}
 return {dir,sizes,append(channel,base64,startMs){
  if(closed)return;const b=Buffer.from(base64,'base64');
  const position=channel==='output'&&Number.isFinite(startMs)?Math.round(startMs*24)*2:sizes[channel];
  if(position<0||position+b.length>30000000||b.length%2)throw Error('recording_limit');
  fs.writeSync(files[channel],b,0,b.length,44+position);sizes[channel]=Math.max(sizes[channel],position+b.length);
 },close(){if(closed)return;closed=true;for(const channel of ['input','output']){
  fs.writeSync(files[channel],wavHeader(sizes[channel]),0,44,0);fs.fsyncSync(files[channel]);fs.closeSync(files[channel]);
 }fs.writeFileSync(path.join(dir,'finalized'),'1',{mode:0o600});}};
}
function createStorage({url,key,fetchImpl=fetch}){
 const base=url.replace(/\/$/,'')+'/storage/v1',bucket='interview-live';
 async function request(method,route,body,headers={}){
  const r=await fetchImpl(base+route,{method,redirect:'error',signal:AbortSignal.timeout(30000),headers:{apikey:key,Authorization:'Bearer '+key,...headers},body});
  if(!r.ok)throw Error('recording_unavailable');return r.json();
 }
 const keys=id=>['input','output'].map(c=>id+'/'+c+'.wav');
 return {
  async upload(id,dir){for(const c of ['input','output'])await request('POST','/object/'+bucket+'/'+id+'/'+c+'.wav',fs.readFileSync(path.join(dir,c+'.wav')),{'Content-Type':'audio/wav','x-upsert':'true'});},
  async remove(id){await request('DELETE','/object/'+bucket,JSON.stringify({prefixes:keys(id)}),{'Content-Type':'application/json'});},
  async signed(id,seconds=60){const urls={};for(const c of ['input','output']){
   const r=await request('POST','/object/sign/'+bucket+'/'+id+'/'+c+'.wav',JSON.stringify({expiresIn:Math.max(1,Math.min(60,seconds))}),{'Content-Type':'application/json'});
   if(typeof r.signedURL!=='string'||!r.signedURL.startsWith('/object/sign/'))throw Error('recording_unavailable');
   urls[c]=base+r.signedURL;
  }return urls;}
 };
}
function removeSpool(root,id){if(!/^[a-f0-9-]{36}$/.test(id))throw Error('invalid_request');const target=path.resolve(root,id),parent=path.resolve(root);
 if(path.dirname(target)!==parent)throw Error('invalid_request');fs.rmSync(target,{recursive:true,force:true});}
function recoverSpool(root,id){
 if(!/^[a-f0-9-]{36}$/.test(id))throw Error('invalid_request');const dir=path.join(root,id);
 if(!fs.existsSync(dir))return false;
 for(const channel of ['input','output']){const file=path.join(dir,channel+'.wav');if(!fs.existsSync(file))return false;
  const bytes=fs.statSync(file).size-44;if(bytes<0||bytes>30000000||bytes%2)throw Error('invalid_recording');
  const fd=fs.openSync(file,'r+');try{fs.writeSync(fd,wavHeader(bytes),0,44,0);}finally{fs.closeSync(fd);}
 }fs.writeFileSync(path.join(dir,'finalized'),'1',{mode:0o600});return true;
}
module.exports={createRecorder,createStorage,removeSpool,recoverSpool,wavHeader};
