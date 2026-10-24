'use strict';
const assert = require('node:assert/strict');
const {createHandler: studentHandler} = require('../api/interview-ai');
const {createHandler: workerHandler} = require('../api/interview-ai-worker');
const {validateResult} = require('../lib/interview-ai-validation');
const crypto = require('node:crypto');
const call = async (handler, body, headers = {}) => {
  let status, data;
  await handler({method: 'POST', body, headers: {host: 'test.local', ...headers}}, {
    setHeader() {}, status(n) {status = n; return this;}, json(d) {data = d;}
  });
  return {status, data};
};
(async () => {
  const calls = [];
  const handler = studentHandler({
    authenticateWeb: async () => ({id: 'true-owner'}),
    authenticateDevice: async () => null, previewAllowed: () => false,
    authenticateAdmin: async () => {throw Error('unauthorized');},
    invoke: async (...args) => {calls.push(args); return {ok: true};}
  });
  assert.equal((await call(handler, {action: 'prepare', kind: 'self_intro', studentId: 'forged'})).status, 200);
  assert.equal(calls[0][1].id, 'true-owner'); assert(!('studentId' in calls[0][2]));
  assert.equal((await call(handler, {action: 'generate', kind: 'core30', sourceHash: 'a'.repeat(64),
    requestKey: 'abcdefgh', sources: [{id: 'other', text: 'invented'}]})).status, 400);
  const core={action:'generate',kind:'core30',sourceHash:'a'.repeat(64),requestKey:'one-question-key'};
  assert.equal((await call(handler,core)).status,400);
  assert.equal((await call(handler,{...core,questionId:['q1','q2']})).status,400);
  assert.equal((await call(handler,{...core,questionId:'q1'})).status,200);
  assert.equal(calls.at(-1)[2].questionId,'q1');
  assert.equal((await call(handler,{...core,kind:'self_intro',questionId:'q1'})).status,400);
  assert.equal((await call(handler, {action: 'prepare', kind: 'self_intro'}, {origin: 'https://evil.local'})).status, 403);
  assert.equal((await call(handler, {action: 'admin_configure', enabled: true})).status, 401);
  assert.equal((await call(handler, '{invalid')).status, 400);
  assert.equal((await call(handler, {action: 'prepare', kind: 'anything'})).status, 400);
  const workerCalls = [];
  const wh = workerHandler({invoke: async (...args) => {workerCalls.push(args); return {ok: true};}});
  const token = 'a'.repeat(43), auth = {authorization: 'Bearer ' + token};
  assert.equal((await call(wh, {action: 'claim', bundleHash: 'b'.repeat(64)}, auth)).status, 200);
  assert.equal(workerCalls[0][1], crypto.createHash('sha256').update(token).digest('hex'));
  assert.equal((await call(wh, {action: 'claim', bundleHash: 'b'.repeat(64)})).status, 401);
  assert.equal((await call(wh, {action: 'claim', bundleHash: 'b'.repeat(64)}, {...auth, origin: 'https://test.local'})).status, 403);
  assert.equal((await call(wh, {action: 'complete', jobId: crypto.randomUUID(), executionId: crypto.randomUUID(),
    leaseToken: crypto.randomUUID(), leaseEpoch: 1, result: {answer: 'invalid'}}, auth)).status, 422);
  const result = {schema_version: '1.0', status: 'ready', answer: '학생 자료', missing: [], experience_coverage: [],
    source_refs: [{source_id: 'own', quote: '학생', answer_excerpt: '학생'}]};
  validateResult(result, [{id: 'own', text: '학생 자료'}], 'motivation');
  assert.throws(() => validateResult(result, [{id: 'other', text: '학생 자료'}], 'motivation'), /invalid_evidence/);
  assert.throws(() => validateResult({...result, status: 'needs_input', answer: ''}), /invalid_output/);
  console.log('PASS API auth, forged owner/source rejection, CSRF origin, token hashing, input limits and evidence validation');
})().catch(e => {console.error(e); process.exitCode = 1;});
