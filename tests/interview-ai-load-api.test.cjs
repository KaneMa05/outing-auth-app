const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createHandler,validate}=require('../api/interview-ai');
async function main(){
 const requestId=crypto.randomUUID();
 validate({action:'status',requestId,version:'a'.repeat(64)});
 assert.throws(()=>validate({action:'status',requestId,version:'bad'}),/invalid_request/);
 validate({action:'admin_configure',maxPendingTotal:300,requestsPerMinute:4});
 for(const body of [{maxPendingTotal:0},{maxPendingTotal:5001},{requestsPerMinute:0},{requestsPerMinute:61}])
  assert.throws(()=>validate({action:'admin_configure',...body}),/invalid_request/);
 for(const code of ['queue_full','request_rate_limited','admission_busy']){
  const headers={};let status,data;
  const handler=createHandler({authenticateWeb:async()=>({id:'student'}),invoke:async()=>{throw Error(code);}});
  await handler({method:'POST',headers:{host:'local.test'},body:{action:'generate',kind:'self_intro',sourceHash:'a'.repeat(64),requestKey:'test-request'}},
   {setHeader(k,v){headers[k]=v;},status(n){status=n;return this;},json(d){data=d;}});
  assert.equal(status,429);assert.equal(data.error,code);assert(Number(headers['Retry-After'])>0);
 }
 console.log('PASS conditional version validation, admin-only limit fields, bounded settings and Retry-After responses');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
