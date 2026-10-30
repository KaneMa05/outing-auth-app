'use strict';
// Isolated local server. A fresh in-memory session is created for synthetic QA only.
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {randomBytes}=require('node:crypto');
const {createAttemptStorage}=require('../lib/interview-attempt-storage.cjs');
const {createAttemptHandler}=require('../lib/interview-attempt-http.cjs');
async function createPreview({root,port=0}={}){
 const dataRoot=root||await fs.mkdtemp(path.join(os.tmpdir(),'interview-attempt-qa-'));
 const storage=createAttemptStorage({root:dataRoot}),token=randomBytes(32).toString('hex');let handler,origin;
 const repository=path.resolve(__dirname,'..');
 const server=http.createServer(async(req,res)=>{
  try{
   if(req.url==='/attempt-api')return handler(req,res);
   const pathname=new URL(req.url,'http://localhost').pathname;
   if(req.method!=='GET') {res.writeHead(405);return res.end();}
   let relative=pathname==='/'?'tests/fixtures/interview-attempts/index.html':pathname.slice(1);
   if(!/^(client\/interview-attempts\/[^/]+\.mjs|tests\/fixtures\/interview-attempts\/(index\.html|verify\.mjs))$/.test(relative)){res.writeHead(404);return res.end();}
   const content=await fs.readFile(path.join(repository,relative));
   res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',relative.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8');
   res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; media-src 'self' blob:; connect-src 'self'");
   if(pathname==='/')res.setHeader('Set-Cookie',`attempt_qa=${token}; HttpOnly; SameSite=Strict; Path=/`);
   res.end(content);
  }catch{res.writeHead(500);res.end('preview_unavailable');}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});origin='http://127.0.0.1:'+server.address().port;
 handler=createAttemptHandler({storage,origin,authenticate:async req=>({id:req.headers.cookie?.split(';').map(v=>v.trim()).includes('attempt_qa='+token)?'synthetic-qa':null}),authorize:async()=>({retainUntil:Date.now()+86400000})});
 return {server,origin,dataRoot};
}
if(require.main===module)createPreview({root:process.env.ATTEMPT_QA_ROOT,port:Number(process.env.ATTEMPT_QA_PORT||0)}).then(({origin,dataRoot})=>console.log(JSON.stringify({origin,dataRoot,scope:'local synthetic QA only'}))).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={createPreview};
