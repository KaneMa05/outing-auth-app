'use strict';
const crypto=require('node:crypto');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const mac=(body,key)=>crypto.createHmac('sha256',key).update('interview-native-v1\n'+body).digest('base64url');
function issue(studentId,key,now=Date.now()){
 if(typeof key!=='string'||key.length<32||typeof studentId!=='string'||!studentId||studentId.length>100)throw Error('unauthorized');
 const body=Buffer.from(JSON.stringify({aud:'interview-native',sub:studentId,iat:now,exp:now+1800000,nonce:crypto.randomBytes(16).toString('hex')})).toString('base64url');
 return body+'.'+mac(body,key);
}
function read(token,key,now=Date.now()){
 if(typeof token!=='string'||token.length>1500||typeof key!=='string'||key.length<32)throw Error('unauthorized');
 const [body,sig,extra]=token.split('.');if(extra!==undefined||!body||!sig||!/^[A-Za-z0-9_-]{43}$/.test(sig))throw Error('unauthorized');
 if(!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(mac(body,key))))throw Error('unauthorized');
 let p;try{p=JSON.parse(Buffer.from(body,'base64url').toString());}catch{throw Error('unauthorized');}
 if(p.aud!=='interview-native'||typeof p.sub!=='string'||!p.sub||p.sub.length>100||!Number.isSafeInteger(p.iat)||!Number.isSafeInteger(p.exp)||p.iat>now||p.exp<=now||p.exp-p.iat!==1800000)throw Error('unauthorized');
 return {id:p.sub};
}
module.exports={issue,read,hash};
