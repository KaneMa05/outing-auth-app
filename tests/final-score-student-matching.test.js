const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('teacher-grades.js', 'utf8');
const extract = name => {
  const found = source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n}`));
  assert.ok(found, name);
  return found[0];
};
const track = '경찰직 - 함정요원 항해(순경)';
const students = [{ id: '18001', name: '동명이인', track }];
const input = [
  ['동명이인', track, 55, 80, '-', 80, 65, '-', '-', 24],
  ['동명이인', track, 50, 65, '-', 55, 50, '-', '-', 36],
].map(row => row.join('\t')).join('\n');

function setup() {
  const nodes = [], notices = [], writes = [];
  let modal = null, closed = 0, failSave = false, nextId = 0;
  const state = { finalExamScores: [{ id: 'final-1-18001', studentId: '18001', round: 1, score: 90 }] };
  const context = vm.createContext({
    state, selectedStudentCohort: '18',
    FINAL_GRADE_SUBJECTS: ['법규', '개론', '형사', '영어', '항해', '기관', '형소법(공판)'],
    normalizeCoastGuardTrack: value => String(value || '').trim(),
    getTeacherStudentRegisteredTrack: student => student.track,
    calculateFinalSubjectTotalsForTrack: () => ({ score: 280, maxScore: 400, submittedCount: 4, wrongCount: 24 }),
    createId: () => `unique-${++nextId}`,
    notify: message => notices.push(message),
    saveState: () => {}, render: () => {},
    persistFinalExamScoresToRemote: async rows => { writes.push(rows); return !failSave; },
    el(tag, props = {}, children = []) {
      const node = { tag, ...props, children, value: props.value || '', listeners: {}, addEventListener(event, fn) { this.listeners[event] = fn; } };
      nodes.push(node);
      return node;
    },
    field: (label, control, className, hint) => ({ label, control, hint }),
    button: (text, className, type, onClick) => ({ text, className, type, onClick, disabled: false }),
    closeInfoModal: () => { closed++; },
    openInfoModal: value => { modal = value; },
  });
  for (const name of ['getGradeSubjectHeaders', 'normalizeFinalBulkHeader', 'parseFinalBulkScoreRows', 'matchFinalBulkStudent', 'createFinalExternalStudentFromRow', 'slugFinalExternalValue', 'planFinalBulkStudentMatches', 'openFinalBulkStudentMatchModal', 'resolveFinalBulkLectureIdentities', 'saveFinalBulkScoreInput']) {
    vm.runInContext(extract(name), context);
  }
  return { context, nodes, notices, writes, state, modal: () => modal, closed: () => closed, setFailure: value => { failSave = value; } };
}

async function main() {
  const test = setup();
  const parsed = test.context.parseFinalBulkScoreRows(input);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].wrongCount, '24');
  assert.equal(parsed.rows[1].wrongCount, '36');
  const original = test.state.finalExamScores[0];
  await test.context.saveFinalBulkScoreInput(2, students, input, '18');
  assert.equal(test.writes.length, 0, 'duplicate identities must not reach the server');
  assert.equal(test.modal().title, '동명이인 성적 구분');
  assert.equal(test.state.finalExamScores[0], original);
  const selectors = test.nodes.filter(node => node.tag === 'select');
  const form = test.nodes.find(node => node.tag === 'form');
  const submit = () => form.listeners.submit({ preventDefault() {} });
  await submit();
  assert.equal(test.writes.length, 0, 'unselected identities cannot save');
  selectors[0].value = '0';
  selectors[1].value = '0';
  await submit();
  assert.equal(test.writes.length, 0, 'same student cannot receive two score rows');

  selectors[1].value = 'new-external';
  test.setFailure(true);
  await submit();
  assert.equal(test.closed(), 0, 'failed save keeps identity choices open');
  assert.equal(test.state.finalExamScores.length, 1);
  const externalId = test.writes[0][1].studentId;
  test.setFailure(false);
  await submit();
  assert.equal(test.writes[1][1].studentId, externalId, 'retry must reuse the same external ID');
  assert.equal(test.closed(), 1);
  assert.equal(test.state.finalExamScores.length, 3);
  assert.equal(test.state.finalExamScores[0], original, 'round 1 must remain unchanged');
  const saved = test.writes[1];
  assert.equal(saved[0].studentId, '18001');
  assert.equal(saved[0].subjectScores['법규'].score, 55);
  assert.equal(saved[1].subjectScores['법규'].score, 50);
  assert.equal(saved[1].isExternalFinalScore, true);
  assert.notEqual(saved[0].id, saved[1].id);

  const byId = new Map(students.map(student => [student.id, student]));
  const byName = new Map([['동명이인', students]]);
  const repeated = test.context.planFinalBulkStudentMatches(parsed.rows, byId, byName, '18');
  assert.equal(repeated.issues.length, 2, 'later imports must let the user distinguish the two existing participants');
  assert.equal(repeated.choices[0].length, 2);
  assert.ok(repeated.choices[0].some(student => student.id === externalId));
  const explicit = test.context.matchFinalBulkStudent({ id: 'another-id', name: '동명이인', track }, byId, byName);
  assert.equal(explicit, null, 'an explicit other ID must never fall back to an unrelated same-name student');
  const ambiguous = test.context.matchFinalBulkStudent({ name: '동명이인', track }, byId, new Map([['동명이인', [...students, { id: '18002', name: '동명이인', track }]]]));
  assert.equal(ambiguous, null, 'multiple matching registered students require selection');

  const unique = setup();
  await unique.context.saveFinalBulkScoreInput(2, students, input.split('\n')[0], '18');
  assert.equal(unique.writes.length, 1, 'ordinary unique-name paste keeps the existing one-click flow');
  assert.equal(unique.modal(), null);
  const external = setup();
  await external.context.saveFinalBulkScoreInput(2, [], input, '18');
  assert.equal(external.writes.length, 0, 'same-name unregistered participants also require distinction');
  assert.ok(external.modal());

  const withIds = setup();
  const lectureInput = input.split('\n').map((line, index) => {
    const cells = line.split('\t');
    cells.splice(1, 0, index ? 'private_online_id' : 'private_offline_id');
    return cells.join('\t');
  }).join('\n');
  const parsedIds = withIds.context.parseFinalBulkScoreRows(lectureInput);
  assert.equal(parsedIds.usesLectureIds, true);
  assert.equal(parsedIds.rows[0].lectureId, 'private_offline_id');
  assert.equal(parsedIds.rows[0].track, track);
  assert.equal(parsedIds.rows[0].subjectScores['법규'], '55');
  assert.equal(parsedIds.rows[1].wrongCount, '36');
  const header = ['이름', '인강 아이디', '직렬', '법규', '개론', '형사', '영어', '항해', '기관', '형소법(공판)', '개수'].join('\t');
  assert.equal(withIds.context.parseFinalBulkScoreRows(header + '\n' + lectureInput).rows.length, 2);
  assert.equal(withIds.context.parseFinalBulkScoreRows(lectureInput.replace('private_offline_id', 'id')).rows.length, 2, 'a login named id must not be mistaken for a header');
  let apiRequests = 0;
  withIds.context.fetch = async (url, options) => {
    assert.equal(url, '/api/final-score-identities');
    assert.equal(options.credentials, 'same-origin');
    const body = JSON.parse(options.body);
    assert.equal(body.entries[0].lectureId, 'private_offline_id');
    assert.equal(body.entries[1].lectureId, 'private_online_id');
    apiRequests++;
    return { ok: true, json: async () => ({ ok: true, students: [students[0], { id: 'external-opaque-id', name: '동명이인', track, isExternalFinalScore: true }], choices: [], issues: [] }) };
  };
  await withIds.context.saveFinalBulkScoreInput(2, students, lectureInput, '18');
  assert.equal(apiRequests, 1);
  assert.equal(withIds.writes[0][0].studentId, '18001');
  assert.equal(withIds.writes[0][1].studentId, 'external-opaque-id');
  assert.equal(withIds.writes[0][1].subjectScores['법규'].score, 50);
  assert.ok(!JSON.stringify(withIds.writes).includes('private_'), 'raw lecture IDs must not enter public grade payloads');
  assert.ok(!JSON.stringify(withIds.state).includes('private_'), 'raw lecture IDs must not enter shared/local-storage state');
  const failure = setup();
  failure.context.fetch = async () => ({ ok: false, json: async () => ({ ok: false, error: 'duplicate_lecture_id', row: 2 }) });
  await failure.context.saveFinalBulkScoreInput(2, students, lectureInput, '18');
  assert.equal(failure.writes.length, 0);
  assert.ok(failure.notices[0].includes('같은 인강 아이디'));
  assert.equal(failure.state.finalExamScores.length, 1);
  console.log('final score student matching tests passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
