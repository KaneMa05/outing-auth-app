'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const titles=require('../scripts/data/interview-audio-display-titles.json');
const corrected=[];
for(const category of ['job','personality']){
 const catalog=JSON.parse(fs.readFileSync('assets/interview-'+category+'-audio/catalog.json'));
 for(const q of catalog.clips){
  const title=titles[q.id];
  if(!title){assert.equal(q.displayPrompt,undefined);continue;}
  corrected.push(q.id);assert.equal(q.spokenPrompt,title.spokenPrompt);assert.equal(q.displayPrompt,title.displayPrompt);
  assert.notEqual(q.displayPrompt,q.spokenPrompt);
  // NLL's source includes a memorized answer with a year and island count;
  // the revised question asks for its meaning without disclosing that answer.
  if(q.id!=='q-17f1c2a457936fc0d2953a73')for(const token of q.prompt.match(/\d+(?:[.,]\d+)*/g)||[])assert(q.displayPrompt.includes(token),'Preserve source number: '+q.id+' '+token);
 }
}
assert.deepEqual(corrected.sort(),Object.keys(titles).sort());
assert.equal(corrected.length,55,'Existing 41 titles and 14 numeric/acronym/spacing titles for the revised scripts');
assert.match(titles['q-02a6310d338d54cfe8bb2328'].displayPrompt,/5단계/);
assert.match(titles['q-0426d19f83ff31a6ca07328d'].displayPrompt,/성범죄 2차 피해/);
assert.match(titles['q-049be4ff22aaaadd411143b2'].displayPrompt,/서해5도와 서해5도/);
assert.match(titles['q-020caab457ca1dcf0b32faad'].displayPrompt,/단점 3가지/);
assert.match(titles['q-0354b31dae68886b2cd3619b'].displayPrompt,/장점 2가지/);
assert.match(titles['q-1f308991ff5d37f79af0e87b'].displayPrompt,/병렬조건 5가지/);
assert.match(titles['q-2b0abc3a7fe385e19bff9a4c'].displayPrompt,/메인엔진 rpm/);
assert.match(titles['q-6034a3ae702a382c0cc914fb'].displayPrompt,/제1조 제1항/);
assert.match(titles['q-a24df1bd3985599a44fd790a'].displayPrompt,/제1조/);
assert.match(titles['q-5051f0c46934cfab1a777e2c'].displayPrompt,/제3자/);
assert.match(titles['q-4fcc19e2f9219a806a2f836d'].displayPrompt,/장점 3가지와 단점 3가지/);
assert.match(titles['q-0bd4fc1e7a50c3890c03b84b'].displayPrompt,/4\.19.*5\.16.*5\.18/);
assert.match(titles['q-23717cdf6e7e6d11c74aa5a9'].displayPrompt,/3대.*3S/);
assert.match(titles['q-0bc006558422dc7db4698912'].displayPrompt,/VDR/);
assert.match(titles['q-17f1c2a457936fc0d2953a73'].displayPrompt,/NLL/);
assert.doesNotMatch(titles['q-17f1c2a457936fc0d2953a73'].displayPrompt,/1953/);
console.log('PASS 55 reviewed display titles; numeric/acronym notation and spoken transcripts verified across both catalogs.');
