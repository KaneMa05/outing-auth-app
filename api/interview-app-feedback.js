'use strict';
const {bodyOf,postOnly,sameOrigin}=require('../lib/interview-ai-http');
const {feedback}=require('../lib/interview-app-feedback.cjs');
function createHandler({authenticate=require('../lib/interview-web-auth').authenticatePortal,read=(...args)=>require('./curriculum')._private.requestSupabase(...args)}={}){
 return async(req,res)=>{res.setHeader('Cache-Control','no-store');try{
  postOnly(req,res);sameOrigin(req);const b=await bodyOf(req,10000);
  const student=await authenticate(req);if(!student)throw Object.assign(Error('unauthorized'),{status:401});
  return res.status(200).json(await feedback('create',{type:'student',id:student.id,testApp:require('../lib/interview-test-app.cjs').testAppFields(req).testApp===true},b,read));
 }catch(e){const code=['invalid_request','forbidden','unauthorized','request_conflict','rate_limited'].find(c=>e.message===c||e.message?.includes('"message":"'+c+'"'))||'feedback_unavailable';
  res.status(e.status||({forbidden:403,unauthorized:401,rate_limited:429,request_conflict:409,invalid_request:400}[code])||503).json({ok:false,error:code});}
 };
}
module.exports=createHandler();module.exports.createHandler=createHandler;
