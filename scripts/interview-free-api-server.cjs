'use strict';
// Local USB-connected Android testing only. API credentials never enter the APK.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
try{process.loadEnvFile(path.join(root,'.env.local'));}catch{}
const {createFreeProvider,MODEL}=require('../lib/interview-free-provider');
const {attachLive}=require('../lib/interview-free-live');
const dir=path.join(root,'.tmp/interview-free-api');fs.mkdirSync(dir,{recursive:true});
const configPath=path.join(dir,'bridge.json');
let config;try{config=JSON.parse(fs.readFileSync(configPath,'utf8'));}catch{config={url:'http://127.0.0.1:8787',token:crypto.randomBytes(32).toString('hex')};fs.writeFileSync(configPath,JSON.stringify(config));}
const provider=createFreeProvider({key:process.env.GEMINI_API_KEY});
const usagePath=path.join(dir,'usage.json');let active=false;const recent=[];
function consume(){
 const day=new Date().toISOString().slice(0,10);let usage;try{usage=JSON.parse(fs.readFileSync(usagePath,'utf8'));}catch{usage={};}
 const now=Date.now();while(recent.length&&recent[0]<now-60000)recent.shift();
 if(recent.length>=5||(usage.day===day&&usage.count>=30))throw Error('free_limit_reached');
 recent.push(now);fs.writeFileSync(usagePath,JSON.stringify({day,count:usage.day===day?usage.count+1:1}));
}
function reply(res,status,value){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
function authorized(req){const token=(req.headers.authorization||'').replace(/^Bearer /,'');return token.length===config.token.length&&crypto.timingSafeEqual(Buffer.from(token),Buffer.from(config.token));}
const server=http.createServer(async(req,res)=>{
 if(!authorized(req))return reply(res,401,{ok:false,error:'unauthorized'});
 if(req.method==='GET'&&req.url==='/status')return reply(res,200,{ok:true,ready:!!process.env.GEMINI_API_KEY,model:MODEL});
 if(req.method!=='POST'||req.url!=='/analyze')return reply(res,404,{ok:false,error:'not_found'});
 if(active)return reply(res,429,{ok:false,error:'busy'});
 let size=0,chunks=[];req.on('data',c=>{size+=c.length;if(size>4100000){chunks=[];req.destroy();}else chunks.push(c);});
 req.on('end',async()=>{
  if(active)return reply(res,429,{ok:false,error:'busy'});
  active=true;
  try{
   const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   if(body.consent!==true||typeof body.audio!=='string'||body.audio.length>4000000||!/^[A-Za-z0-9+/]*={0,2}$/.test(body.audio))throw Error('invalid_request');
   consume();const result=await provider.analyze({audio:Buffer.from(body.audio,'base64'),question:body.question,mode:body.mode,transcript:body.transcript});
   reply(res,200,{ok:true,result});
  }catch(error){const allowed=['invalid_request','invalid_audio','free_limit_reached','provider_timeout','api_not_configured'];reply(res,error.message==='free_limit_reached'?429:400,{ok:false,error:allowed.includes(error.message)?error.message:'analysis_failed'});}
  finally{active=false;}
 });
});
server.requestTimeout=60000;
attachLive(server,{key:process.env.GEMINI_API_KEY,authorize:authorized,consume});
server.listen(8787,'127.0.0.1',()=>console.log('Local interview API listening on 127.0.0.1:8787; model '+MODEL+'; credentials not logged.'));
