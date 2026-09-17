const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = {
  session: null, route: 'home', attempts: [], main: {innerHTML: ''},
  pendingReviewItems: () => [], esc: String, render: () => {},
  button: (label, action) => `<button data-action="${action}">${label}</button>`,
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'home-view.js'), 'utf8'), context);
context.home();
assert.match(context.main.innerHTML, /단원 선택하고 시작/);
// A one-question set is not complete just because the counter is at 1 / 1.
context.session = {ids:['q1'], answers:[], index:0, label:'형법의 적용범위'};
context.home();
assert.match(context.main.innerHTML, /0 \/ 1문항 풀이/);
assert.doesNotMatch(context.main.innerHTML, /오늘 학습 완료/);
context.showSessionResult();
assert.equal(context.route, 'home');
// The last answer completes the set before pressing the result button.
context.session.answers[0] = {correct:false};
context.home();
assert.match(context.main.innerHTML, /오늘 학습 완료/);
assert.doesNotMatch(context.main.innerHTML, /학습 이어하기/);
context.showSessionResult();
assert.equal(context.route, 'result');
assert.equal(context.session.index, 1);
context.home();
assert.match(context.main.innerHTML, /오늘 학습 완료/);
// Count submitted answers; don't treat a sparse answer array as a complete set.
context.session = {ids:Array.from({length:10}, (_,i)=>`q${i}`), answers:[], index:9, label:'형법의 기본개념'};
context.session.answers[9] = {correct:true};
context.home();
assert.match(context.main.innerHTML, /1 \/ 10문항 풀이/);
assert.equal(context.isSessionComplete(), false);
context.session.answers = context.session.ids.map(()=>({correct:true}));
context.home();
assert.match(context.main.innerHTML, /10문항을 모두 풀었어요/);
assert.doesNotMatch(context.main.innerHTML, /학습 이어하기/);
console.log('PASS: actual answered counts, one/ten-question completion and result navigation');
