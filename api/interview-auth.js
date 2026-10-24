const crypto=require('node:crypto');
const {readCookie}=require('./teacher-auth-utils');
const webAuth=require('../lib/interview-web-auth');
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
async function readBody(req){
 let body=req.body;
 if(body===undefined){let raw='';for await(const part of req){raw+=part;if(Buffer.byteLength(raw)>10000)fail('invalid_request');}body=JSON.parse(raw||'{}');}
 if(typeof body==='string')body=JSON.parse(body);
 if(!body||typeof body!=='object'||Array.isArray(body)||Buffer.byteLength(JSON.stringify(body))>10000)fail('invalid_request');
 return body;
}
async function kakaoUser(code,cfg,fetcher=fetch){
 const redirect=cfg.origin+'/api/interview-auth?action=callback';
 const form=new URLSearchParams({grant_type:'authorization_code',client_id:cfg.clientId,redirect_uri:redirect,code});
 if(cfg.clientSecret)form.set('client_secret',cfg.clientSecret);
 const tokenResponse=await fetcher('https://kauth.kakao.com/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form.toString(),signal:AbortSignal.timeout(10000)});
 const token=await tokenResponse.json();
 if(!tokenResponse.ok||typeof token.access_token!=='string'||!token.access_token)fail('kakao_login_failed');
 const userResponse=await fetcher('https://kapi.kakao.com/v2/user/me',{headers:{Authorization:'Bearer '+token.access_token},signal:AbortSignal.timeout(10000)});
 const user=await userResponse.json();
 if(!userResponse.ok||!Number.isSafeInteger(user.id)||user.id<=0)fail('kakao_login_failed');
 // Access/refresh tokens and optional personal details are never persisted.
 return String(user.id);
}
function createHandler({getConfig=webAuth.config,invoke=webAuth.invoke,exchange=kakaoUser,random=webAuth.random}={}){
 return async(req,res)=>{
  const cfg=getConfig();
  const url=new URL(req.url||'/api/interview-auth','http://localhost');
  const callback=req.method==='GET'&&url.searchParams.get('action')==='callback';
  res.setHeader('Cache-Control','no-store, max-age=0');res.setHeader('Vary','Cookie');
  res.setHeader('Referrer-Policy','no-referrer');
  const redirect=error=>{res.statusCode=303;res.setHeader('Location','/interview'+(error?'?auth_error='+encodeURIComponent(error):''));res.end();};
  const clearState=()=>webAuth.cookie(webAuth.STATE_COOKIE,'',0,cfg,'/api/interview-auth');
  try{
   if(req.method==='GET'&&!callback){
    if(url.searchParams.get('action')!=='session')fail('unsupported_action');
    const base={ok:true,enabled:cfg.enabled,kakaoEnabled:cfg.enabled&&!!cfg.clientId};
    if(!cfg.enabled)return res.status(200).json({...base,authenticated:false});
    const data=await invoke('session',{sessionHash:webAuth.sessionHash(req)});
    return res.status(200).json({...data,...base});
   }
   if(!cfg.enabled)fail('portal_not_configured',503);
   if(callback){
    if(!cfg.clientId)fail('kakao_not_configured',503);
    const state=url.searchParams.get('state')||'',browser=readCookie(req,webAuth.STATE_COOKIE)||'';
    if(!/^[A-Za-z0-9_-]{43}$/.test(state)||!/^[A-Za-z0-9_-]{43}$/.test(browser))fail('oauth_state_invalid');
    const transaction=await invoke('oauth_consume',{stateHash:webAuth.hash(state),browserHash:webAuth.hash(browser)});
    if(transaction.intent==='link'&&transaction.sessionHash!==webAuth.sessionHash(req))fail('oauth_state_invalid');
    if(url.searchParams.has('error'))fail('kakao_cancelled');
    const code=url.searchParams.get('code');if(!code||code.length>2048)fail('kakao_login_failed');
    const subject=await exchange(code,cfg),token=random();
    await invoke('oauth_login',{appId:cfg.clientId,subject,intent:transaction.intent,sessionHash:transaction.sessionHash,newHash:webAuth.hash(token)});
    res.setHeader('Set-Cookie',[webAuth.cookie(webAuth.COOKIE,token,604800,cfg),clearState()]);
    return redirect();
   }
   if(req.method!=='POST'){res.setHeader('Allow','GET, POST');fail('method_not_allowed',405);}
   webAuth.requireOrigin(req,cfg);
   const body=await readBody(req),sessionHash=webAuth.sessionHash(req);
   const allowed=['kakao_start','legacy_login','apply','logout'];if(!allowed.includes(body.action))fail('unsupported_action');
   const rate=async(key,limit)=>{if(!(await invoke('rate',{key:webAuth.hash(key),limit})).allowed){res.setHeader('Retry-After','900');fail('too_many_attempts',429);}};
   if(body.action==='kakao_start'){
    if(!cfg.clientId)fail('kakao_not_configured',503);
    if(!['login','link'].includes(body.intent))fail('invalid_request');
    await rate('oauth:'+String(req.socket?.remoteAddress||req.headers['x-vercel-forwarded-for']||'shared'),300);
    const state=random(),browser=random();
    await invoke('oauth_start',{stateHash:webAuth.hash(state),browserHash:webAuth.hash(browser),intent:body.intent,sessionHash});
    res.setHeader('Set-Cookie',webAuth.cookie(webAuth.STATE_COOKIE,browser,600,cfg,'/api/interview-auth'));
    const location=new URL('https://kauth.kakao.com/oauth/authorize');
    location.search=new URLSearchParams({response_type:'code',client_id:cfg.clientId,redirect_uri:cfg.origin+'/api/interview-auth?action=callback',state}).toString();
    return res.status(200).json({ok:true,url:location.href});
   }
   if(body.action==='legacy_login'){
    if(typeof body.studentId!=='string'||!body.studentId.trim()||body.studentId.length>120||typeof body.password!=='string'||body.password.length<1||body.password.length>200||!['login','link'].includes(body.intent))fail('invalid_request');
    const id=body.studentId.trim();
    await rate('legacy-account:'+id,10);
    await rate('legacy-network:'+String(req.headers['x-vercel-forwarded-for']||req.socket?.remoteAddress||'shared'),300);
    const token=random();
    await invoke('legacy_login',{studentId:id,passwordHash:crypto.createHash('sha256').update(body.password).digest('hex'),
      legacyPasswordHash:Buffer.from(body.password,'utf8').toString('base64'),intent:body.intent,sessionHash,newHash:webAuth.hash(token)});
    res.setHeader('Set-Cookie',webAuth.cookie(webAuth.COOKIE,token,604800,cfg));
    return res.status(200).json({ok:true});
   }
   if(body.action==='apply'){
    for(const key of ['name','track','examNumber'])if(typeof body[key]!=='string'||!body[key].trim()||body[key].length>80)fail('invalid_request');
    if(!Number.isInteger(body.revision)||body.revision<0||body.revision>100000)fail('invalid_request');
    return res.status(200).json(await invoke('apply',{sessionHash,name:body.name,track:body.track,examNumber:body.examNumber,revision:body.revision}));
   }
   await invoke('logout',{sessionHash});
   res.setHeader('Set-Cookie',[webAuth.cookie(webAuth.COOKIE,'',0,cfg),clearState()]);
   return res.status(200).json({ok:true});
  }catch(error){
   const known=['oauth_state_invalid','account_already_linked','kakao_cancelled','kakao_login_failed','kakao_not_configured','portal_not_configured','invalid_request','forbidden','unauthorized','revision_conflict','already_enrolled','unsupported_action','method_not_allowed','too_many_attempts'];
   const code=known.includes(error.message)?error.message:error instanceof SyntaxError?'invalid_request':'interview_unavailable';
   if(callback){res.setHeader('Set-Cookie',clearState());return redirect(code);}
   return res.status(({unauthorized:401,forbidden:403,revision_conflict:409,account_already_linked:409,interview_unavailable:503,portal_not_configured:503,kakao_not_configured:503,too_many_attempts:429,method_not_allowed:405}[code]||400)).json({ok:false,error:code});
  }
 };
}
module.exports=createHandler();
module.exports.createHandler=createHandler;
module.exports._private={kakaoUser,readBody};
