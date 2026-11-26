const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const m=JSON.parse(fs.readFileSync('store-release-source.json'));
assert.equal(m.version,'1.1.1');assert.equal(m.buildNumber,8);assert.equal(m.sourceCommit,'f4aa63cb497c381c8f08f088e5ea8a0f116d49e5');assert.equal(m.forcedUpdate,false);assert.equal(m.fullNativeRegression,true);
for(const f of m.files)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(f.path)).digest('hex'),f.sha256,f.path);
assert(m.files.some(f=>f.path.endsWith('/NativePracticeNavigation.swift')));assert(m.files.some(f=>f.path.endsWith('/InterviewRecordingCaptions.swift')));
assert.equal(JSON.parse(fs.readFileSync('vercel.json')).git.deploymentEnabled,false);
console.log('PASS exact reviewed source: iOS 1.1.1 build 8, full native regression, optional update, no website deployment.');
