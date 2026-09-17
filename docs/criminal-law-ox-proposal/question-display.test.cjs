const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, 'criminal-law-ox-preview.html'), 'utf8');
const data = JSON.parse(html.match(/<script type="application\/json" id="criminal-ox-data">([\s\S]*?)<\/script>/)[1]);
const fullChapter = JSON.parse(fs.readFileSync(path.join(__dirname, 'complete-chapter-questions.json'), 'utf8'));
data.questions = fullChapter.concat(data.questions.filter(q => q.chapter_id !== fullChapter[0].chapter_id));
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'question-display.js'), 'utf8'), sandbox);
const present = sandbox.questionPresentation;
const before = JSON.stringify(data);
const derived = data.questions.filter(q => q.origin_type === 'derived_mcq');
assert.equal(derived.length, 10);
for (const q of data.questions) {
  const display = present(q);
  if (q.origin_type === 'derived_mcq') {
    assert.equal(display.context, '', q.id);
    assert.ok(!display.prompt.includes('다음 선택지의 내용은 옳다.'), q.id);
    assert.ok(!display.prompt.includes('가장 옳지 않은 것은'), q.id);
    assert.equal(display.prompt.includes('다툼이 있는 경우 판례에 의함'), q.context.includes('다툼이 있는 경우 판례에 의함'), q.id);
  } else {
    assert.equal(display.prompt, q.prompt);
    assert.equal(display.context, q.context);
  }
}
const photographed = data.questions.find(q => q.id === 'criminal-law-001-choice-4');
assert.equal(present(photographed).prompt, '형법은 보호적 기능과 보장적 기능을 가진다.');
assert.equal(photographed.correct_answer, 'O');
assert.ok(present(data.questions.find(q => q.id === 'criminal-law-084-item-1')).prompt.includes('형법상 친고죄이다.'));
const unseen = { id: 'unreviewed-case', origin_type: 'derived_mcq', prompt: '갑은 처벌받는다.', context: '갑이 을을 도운 상황과 판단에 필요한 조건' };
assert.equal(present(unseen).context, unseen.context);
assert.equal(present(unseen).prompt, unseen.prompt);
assert.equal(JSON.stringify(data), before, 'Source records including answer, ID and underlined explanations must not change');
console.log(`PASS: ${derived.length} derived displays, ${data.questions.length - derived.length} original displays, qualifiers, unknown context and source preservation`);
