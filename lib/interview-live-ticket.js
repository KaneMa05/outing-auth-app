'use strict';
const {createHash,createHmac,timingSafeEqual}=require('node:crypto');
const {UUID}=require('./interview-ai-validation');
const digest=s=>createHash('sha256').update(s).digest('hex');
function issue(actor,requestKey,sdp,secret,now=Date.now()){
 if(!secret||secret.length<32||actor.type!=='student'||!UUID.test(requestKey))throw Error('invalid_request');
 const raw=Buffer.from(JSON.stringify({actor,requestKey,sdpHash:digest(sdp),expires:now+30000})).toString('base64url');
 return raw+'.'+createHmac('sha256',secret).update(raw).digest('base64url');
}
function read(ticket,sdp,secret,now=Date.now()){
 if(typeof ticket!=='string'||ticket.length>2000||!secret||secret.length<32)throw Error('unauthorized');
 const [raw,sig,extra]=ticket.split('.');const expected=createHmac('sha256',secret).update(raw||'').digest('base64url');
 if(extra||!sig||sig.length!==expected.length||!timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))throw Error('unauthorized');
 let data;try{data=JSON.parse(Buffer.from(raw,'base64url').toString('utf8'));}catch{throw Error('unauthorized');}
 if(!Number.isFinite(data.expires)||data.expires<now||data.expires>now+30000||data.actor?.type!=='student'||typeof data.actor.id!=='string'||data.actor.id.length>120||!UUID.test(data.requestKey)||data.sdpHash!==digest(sdp))throw Error('unauthorized');
 return data;
}
module.exports={issue,read};
