'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {prepareTestQuestionAudio}=require('../scripts/play-store/prepare-test-question-audio.cjs');
test('every server-approved practice test question is bundled with its existing verified recording',()=>{
 const root=path.resolve(__dirname,'..'),target=fs.mkdtempSync(path.join(os.tmpdir(),'ronpark-audio-'));
 const folder=path.join(target,'interview/src/debug/assets/interview-question-audio');fs.mkdirSync(folder,{recursive:true});
 fs.copyFileSync(path.join(root,'native/android/interview/src/debug/assets/interview-question-audio/catalog.json'),path.join(folder,'catalog.json'));
 const prepared=prepareTestQuestionAudio(root,target),scope=require('../lib/interview-test-question-scope.cjs');
 const expected=[...scope.questionsFor('job'),...scope.questionsFor('personality')];
 assert.equal(prepared.length,expected.length);const rows=JSON.parse(fs.readFileSync(path.join(folder,'catalog.json'))).clips;
 for(const q of expected){const row=rows.find(r=>r.id===q.id);assert(row);assert.equal(row.prompt,q.prompt);assert(row.spokenPrompt);const bytes=fs.readFileSync(path.join(folder,row.file));assert.equal(bytes.length,row.bytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),row.sha256);}
 const first=JSON.stringify(rows);prepareTestQuestionAudio(root,target);assert.equal(JSON.stringify(JSON.parse(fs.readFileSync(path.join(folder,'catalog.json'))).clips),first);
});
