// Build validation in an isolated directory, preserving the existing config.js.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{spawnSync}=require('node:child_process'),assert=require('node:assert/strict');
const dir=path.resolve('.tmp/interview-build');fs.mkdirSync(dir,{recursive:true});
for(const file of ['build-config.js','shared.js','student.js','teacher.js'])fs.copyFileSync(file,path.join(dir,file));
fs.mkdirSync(path.join(dir,'lib'),{recursive:true});
for(const file of ['lib/interview-preview-access.js','interview-preview-config.json'])fs.copyFileSync(file,path.join(dir,file));
const original=fs.existsSync('config.js')?fs.readFileSync('config.js'):null;
for(const file of ['client/interview-native-launcher.js','api/interview-native.js','lib/interview-native-auth.js','lib/interview-live-engine.js','lib/interview-live-provider.js','lib/interview-live-storage.js','lib/interview-live-cloud-storage.js','lib/interview-live-socket.js','lib/interview-live-ticket.js','api/interview-live-socket.js','api/interview-live-cleanup.js','scripts/check-interview-live.cjs','interview-live-ui.js','client/interview-live-view.js','client/interview-live-client.js','api/interview-live.js','lib/interview-live-policy.js','tools/interview-live-worker/engine.cjs','tools/interview-live-worker/provider.cjs','tools/interview-live-worker/storage.cjs','tools/interview-live-worker/server.cjs','interview-app-ui.js','interview-portal.js','interview-rubric-ui.js','interview-exam-validation-ui.js','api/interview-exam.js','lib/interview-exam-scoring.js','lib/interview-exam-audio.js','lib/interview-exam-provider.js','lib/interview-exam-service.js'])assert.equal(spawnSync(process.execPath,['--check',file],{encoding:'utf8'}).status,0,file+' syntax');
const context={window:{}};
if(original)vm.runInNewContext(original.toString('utf8'),context,{timeout:1000});
const config=context.window.OUTING_APP_CONFIG||{};
const env={...process.env,VERCEL:'1',VERCEL_ENV:'preview',
  SUPABASE_URL:config.supabaseUrl||'https://example.supabase.co',
  SUPABASE_ANON_KEY:config.supabaseAnonKey||'build-validation-public-placeholder'};
const result=spawnSync(process.execPath,['build-config.js'],{cwd:dir,env,encoding:'utf8'});
if(result.status!==0)throw Error('Isolated config build failed'+(result.error?.code?': '+result.error.code:''));
const built={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(dir,'config.js'),'utf8'),built);
assert.equal(JSON.stringify(built.window.OUTING_APP_CONFIG.interviewPreviewStudentHashes),
  JSON.stringify(require('../lib/interview-preview-access').getPreviewHashes()));
if(original)assert(fs.readFileSync('config.js').equals(original),'Original config changed');
for(const file of ['app.js','shared.js','interview-prep.js','interview-prep-ui.js','interview-review-ui.js','interview-prep-prompts.js','interview-life-ui.js','interview-life-graph.js','interview-portal.js','interview-workspace.js','interview-diagnosis.js','interview-diagnosis-ui.js','interview-writing-ui.js','interview-ai-ui.js','client/interview-ai-client.js','api/interview-ai.js','api/interview-ai-worker.js','lib/interview-web-auth.js','api/interview-auth.js','api/interview-prep.js','sw.js']){
  const check=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  assert.equal(check.status,0,file+': '+check.stderr);
}
console.log('PASS isolated build and syntax checks; original config preserved. '+(config.supabaseUrl?'Existing public configuration used.':'Build-only placeholder configuration used.'));
