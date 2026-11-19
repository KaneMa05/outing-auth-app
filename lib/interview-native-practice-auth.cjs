'use strict';
const crypto=require('node:crypto');
const validMode=mode=>['job','personality'].includes(mode);
const codeHash=(code,mode)=>{if(!validMode(mode)||!/^[A-Za-z0-9_-]{43}$/.test(code||''))throw Error('invalid_request');return crypto.createHash('sha256').update('interview-practice-beta-code-v1\n'+mode+'\n'+code).digest('hex');};
const mac=(body,key)=>crypto.createHmac('sha256',key).update('interview-practice-beta-token-v1\n'+body).digest('base64url');
function issue(id,mode,key,now=Date.now()){
 if(typeof key!=='string'||key.length<32||typeof id!=='string'||!id||id.length>120||!validMode(mode))throw Error('unauthorized');
 const body=Buffer.from(JSON.stringify({aud:'interview-practice-beta',sub:id,mode,iat:now,exp:now+7200000,nonce:crypto.randomBytes(16).toString('hex')})).toString('base64url');return body+'.'+mac(body,key);
}
function read(token,key,now=Date.now()){
 if(typeof token!=='string'||token.length>1600||typeof key!=='string'||key.length<32)throw Error('unauthorized');
 const [body,sig,extra]=token.split('.');if(extra!==undefined||!body||!/^[A-Za-z0-9_-]{43}$/.test(sig||''))throw Error('unauthorized');
 if(!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(mac(body,key))))throw Error('unauthorized');
 let p;try{p=JSON.parse(Buffer.from(body,'base64url').toString());}catch{throw Error('unauthorized');}
 if(p.aud!=='interview-practice-beta'||typeof p.sub!=='string'||!p.sub||p.sub.length>120||!validMode(p.mode)||!Number.isSafeInteger(p.iat)||!Number.isSafeInteger(p.exp)||p.iat>now||p.exp<=now||p.exp-p.iat!==7200000)throw Error('unauthorized');
 return {id:p.sub,practiceMode:p.mode};
}
module.exports={issue,read,codeHash,validMode};
