const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {prepare,sourceFiles}=require('../scripts/ios/prepare-cloud.cjs');
const base=path.resolve('.tmp/ios-source-tests');fs.mkdirSync(base,{recursive:true});
test('iOS upload snapshot contains only explicit native source and cannot deploy the website',()=>{
 const parent=fs.mkdtempSync(path.join(base,'allowed-')),target=path.join(parent,'snapshot');const report=prepare({target});
 assert(report.files.some(f=>f.path.endsWith('InterviewCall.swift')));
 assert(!report.files.some(f=>f.path.startsWith('api/')||f.path.startsWith('supabase/')||f.path.includes('.env')||f.path.startsWith('native/android/')));
 assert.equal(JSON.parse(fs.readFileSync(path.join(target,'vercel.json'),'utf8')).git.deploymentEnabled,false);
 assert.equal(report.remotePushPerformed,false);assert.equal(report.cloudBuildPerformed,false);
 for(const entry of report.files)assert.equal(require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(target,entry.path))).digest('hex'),entry.sha256);
 assert.equal(prepare({target}).sourceCount,report.sourceCount);
});
test('snapshot refuses unrelated directories and extra files in Swift source',()=>{
 const existing=fs.mkdtempSync(path.join(base,'unrelated-'));fs.writeFileSync(path.join(existing,'keep.txt'),'keep');
 assert.throws(()=>prepare({target:existing}),/unrecognized/);assert.equal(fs.readFileSync(path.join(existing,'keep.txt'),'utf8'),'keep');
 const source=fs.mkdtempSync(path.join(base,'invalid-'));
 fs.mkdirSync(path.join(source,'native/ios/App/Sources'),{recursive:true});fs.writeFileSync(path.join(source,'native/ios/App/Sources/private.p12'),'synthetic-not-a-secret');
 assert.throws(()=>sourceFiles(source),/Unexpected file/);
});
