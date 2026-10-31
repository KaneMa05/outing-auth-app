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
  for(const token of q.prompt.match(/\d+(?:[.,]\d+)*/g)||[])assert(q.displayPrompt.includes(token),'Preserve source number: '+q.id+' '+token);
 }
}
assert.deepEqual(corrected.sort(),Object.keys(titles).sort());
assert.equal(corrected.length,41,'Original 5 corrections and requested 36 follow-up titles');
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
console.log('PASS 41 reviewed display titles; original numeric values and spoken transcripts preserved across both catalogs.');
