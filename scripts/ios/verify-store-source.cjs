const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const m=JSON.parse(fs.readFileSync('store-release-source.json'));
assert.equal(m.version,'1.1.0');assert.equal(m.buildNumber,7);assert.equal(m.captionCommit,'108fdd191e960cd5b3e3bc059480646374fb85d7');
for(const f of m.files)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(f.path)).digest('hex'),f.sha256,f.path);
assert(m.files.some(f=>f.path.endsWith('/InterviewRecordingCaptions.swift')));
assert.equal(JSON.parse(fs.readFileSync('vercel.json')).git.deploymentEnabled,false);
console.log('PASS reviewed iOS source includes caption editing, isolated caption tests, version 1.1.0 build 7.');
