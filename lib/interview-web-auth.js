const crypto=require('node:crypto');
const {readCookie}=require('../api/teacher-auth-utils');
const {requestSupabase}=require('../api/curriculum')._private;
const COOKIE='ip_web_session',STATE_COOKIE='ip_oauth_browser';
const hash=value=>crypto.createHash('sha256').update(String(value||'')).digest('hex');
const random=()=>crypto.randomBytes(32).toString('base64url');
function config(){
 let origin='';
 try{
  const u=new URL(process.env.INTERVIEW_ORIGIN||'');
  if(u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error();
  if(u.protocol!=='https:'&&!(process.env.VERCEL!=='1'&&u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)))throw Error();
  origin=u.origin;
 }catch{}
 return {enabled:process.env.INTERVIEW_PORTAL_ENABLED==='true'&&!!origin,origin,
  clientId:process.env.KAKAO_REST_API_KEY||'',clientSecret:process.env.KAKAO_CLIENT_SECRET||''};
}
const invoke=(action,body)=>requestSupabase('POST','rpc/ip_portal_service',{p_action:action,p_actor:{type:'server'},p_body:body});
const sessionHash=req=>{const value=readCookie(req,COOKIE);return /^[A-Za-z0-9_-]{43}$/.test(value||'')?hash(value):'';};
function cookie(name,value,seconds,cfg,path='/api'){
 return `${name}=${value}; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=${seconds}${cfg.origin.startsWith('https:')?'; Secure':''}`;
}
function requireOrigin(req,cfg){
 if(!cfg.enabled||req.headers.origin!==cfg.origin)throw Object.assign(Error('forbidden'),{status:403});
}
async function authenticatePortal(req,{getConfig=config,call=invoke}={}){
 const cfg=getConfig(),token=sessionHash(req);
 if(!cfg.enabled||!token)return null;
 requireOrigin(req,cfg);
 const data=await call('session',{sessionHash:token});
 if(!data.authenticated||!data.account?.ownerId)return null;
 return {id:data.account.ownerId};
}
module.exports={COOKIE,STATE_COOKIE,config,hash,random,invoke,sessionHash,cookie,requireOrigin,authenticatePortal};
