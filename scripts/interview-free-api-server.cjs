'use strict';
// Local interview testing. Provider credentials remain on the Mac; optional pinned TLS serves physical iPhones.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
try{process.loadEnvFile(path.join(root,'.env.local'));}catch{}
const {createFreeProvider,MODEL}=require('../lib/interview-free-provider');
const {attachLive}=require('../lib/interview-free-live');
const {attachLocalLive}=require('../lib/interview-local-live');
const dir=path.join(root,'.tmp/interview-free-api');fs.mkdirSync(dir,{recursive:true});
const configPath=path.join(dir,'bridge.json');
let config;try{config=JSON.parse(fs.readFileSync(configPath,'utf8'));}catch{config={url:'http://127.0.0.1:8787',token:crypto.randomBytes(32).toString('hex')};fs.writeFileSync(configPath,JSON.stringify(config));}
const local=process.env.INTERVIEW_AI_PROVIDER==='local';
const provider=local?require('../lib/interview-local-provider').createLocalProvider():createFreeProvider({key:process.env.GEMINI_API_KEY});
const usagePath=path.join(dir,'usage.json');let active=false;const recent=[];let localQueue=Promise.resolve(),localWaiting=0;
async function analyze(body){if(!local)return provider.analyze(body);if(localWaiting>=4)throw Error("busy");localWaiting++;const task=localQueue.then(()=>provider.analyze(body));localQueue=task.catch(()=>{});try{return await task;}finally{localWaiting--;}}
function consume(){
 const day=new Date().toISOString().slice(0,10);let usage;try{usage=JSON.parse(fs.readFileSync(usagePath,'utf8'));}catch{usage={};}
 const now=Date.now();while(recent.length&&recent[0]<now-60000)recent.shift();
 if(recent.length>=5||(usage.day===day&&usage.count>=30))throw Error('free_limit_reached');
 recent.push(now);fs.writeFileSync(usagePath,JSON.stringify({day,count:usage.day===day?usage.count+1:1}));
}
function reply(res,status,value){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
function authorized(req){const token=Buffer.from((req.headers.authorization||'').replace(/^Bearer /,''));const expected=Buffer.from(config.token);return token.length===expected.length&&crypto.timingSafeEqual(token,expected);}
const handleRequest=async(req,res)=>{
 if(!authorized(req))return reply(res,401,{ok:false,error:'unauthorized'});
 if(req.method==='GET'&&req.url==='/status')return reply(res,200,{ok:true,ready:local?await provider.ready():!!process.env.GEMINI_API_KEY,provider:local?'local':'gemini',liveCaptions:true,model:local?require('../lib/interview-local-provider').MODEL:MODEL});
 if(req.method!=='POST'||req.url!=='/analyze')return reply(res,404,{ok:false,error:'not_found'});
 if(!local&&active)return reply(res,429,{ok:false,error:'busy'});
 let size=0,chunks=[];req.on('data',c=>{size+=c.length;if(size>4100000){chunks=[];req.destroy();}else chunks.push(c);});
 req.on('end',async()=>{
  if(!local&&active)return reply(res,429,{ok:false,error:'busy'});
  active=true;
  try{
   const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   if(body.consent!==true||typeof body.audio!=='string'||body.audio.length>4000000||!/^[A-Za-z0-9+/]*={0,2}$/.test(body.audio))throw Error('invalid_request');
   if(!local)consume();const result=await analyze({audio:Buffer.from(body.audio,'base64'),question:body.question,mode:body.mode,transcript:body.transcript});
   reply(res,200,{ok:true,result});
  }catch(error){const allowed=['invalid_request','invalid_audio','free_limit_reached','provider_timeout','api_not_configured','transcription_failed','transcription_busy','busy'];reply(res,error.message==='free_limit_reached'?429:400,{ok:false,error:allowed.includes(error.message)?error.message:'analysis_failed'});}
  finally{active=false;}
 });
};
const server=http.createServer(handleRequest);
server.requestTimeout=290000;
if(local)attachLocalLive(server,{authorize:authorized});
else attachLive(server,{key:process.env.GEMINI_API_KEY,authorize:authorized,consume});
server.listen(8787,'127.0.0.1',()=>console.log('Local interview API listening on 127.0.0.1:8787; model '+(local?require('../lib/interview-local-provider').MODEL:MODEL)+'; credentials not logged.'));

// Explicit local-only opt-in. Reuse the same authentication, request handler and quotas.
if(process.env.INTERVIEW_DEVICE_BRIDGE==='1'){
 const https=require('node:https');
 const device=JSON.parse(fs.readFileSync(path.join(dir,'bridge-device.json'),'utf8'));
 const url=new URL(device.url);
 if(url.protocol!=='https:'||url.port!=='8788'||!(/^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(url.hostname)))throw Error('invalid_device_host');
 const secure=https.createServer({key:fs.readFileSync(path.join(dir,'device-server.key')),cert:fs.readFileSync(path.join(dir,'device-server.crt')),minVersion:'TLSv1.2',maxVersion:'TLSv1.2',ciphers:'ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384'},handleRequest);
 secure.requestTimeout=290000;
 secure.on('tlsClientError',error=>console.log('Device bridge TLS handshake error: '+(error.code||'unknown')));
 secure.on('secureConnection',()=>console.log('Device bridge TLS connection established'));
 if(local)attachLocalLive(secure,{authorize:authorized});
 else attachLive(secure,{key:process.env.GEMINI_API_KEY,authorize:authorized,consume});
 secure.listen(8788,url.hostname,()=>console.log('Pinned TLS device bridge listening on '+url.origin+'; credentials not logged.'));
}
