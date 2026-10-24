'use strict';
// New endpoint; existing UI and note_save handlers are deliberately unchanged.
const crypto = require('node:crypto');
const {KINDS, UUID, HASH, fail, text, keys, hash} = require('../lib/interview-ai-validation');
const {bodyOf, sameOrigin, sendError, postOnly} = require('../lib/interview-ai-http');
function defaultDeps() {
  const auth = require('./teacher-auth-utils');
  return {
    authenticateWeb: require('../lib/interview-web-auth').authenticatePortal,
    authenticateDevice: require('./criminal-law-ox')._private.authenticateStudent,
    previewAllowed: require('../lib/interview-preview-access').isPreviewStudent,
    authenticateAdmin: async (req, write) => {
      const session = auth.readSessionToken(auth.readCookie(req, auth.COOKIE_NAME), auth.getConfig().secret);
      if (!session) fail('unauthorized', 401);
      if (session.role !== 'admin' || !auth.hasPermission(session, write ? 'interview.write' : 'interview.read'))
        fail('forbidden', 403);
      return {id: session.username};
    },
    invoke: (action, actor, body) => require('./curriculum')._private.requestSupabase('POST',
      'rpc/ip_ai_service', {p_action: action, p_actor: actor, p_body: body})
  };
}
function validate(body) {
  const allowed = {
    prepare: ['kind'], generate: ['kind', 'questionId', 'sourceHash', 'requestKey', 'regenerate'],
    status: ['requestId', 'version'], requests: [], retry_items: ['requestId', 'itemKeys', 'sourceHash', 'requestKey'],
    admin_configure: ['enabled', 'bundleHash', 'dailyCallLimit', 'coreQuestionIds', 'maxPendingTotal', 'requestsPerMinute'],
    admin_register_worker: ['label', 'studentIds'], admin_revoke_worker: ['workerId'],
    admin_retry_job: ['jobId'], admin_resolve_unknown: ['jobId', 'executionId', 'confirmedStopped'], admin_overview: []
  };
  if (!allowed[body.action]) fail('unsupported_action');
  keys(body, ['action', 'studentId', 'deviceToken', ...allowed[body.action]]);
  if (body.studentId !== undefined && !text(body.studentId, 120)) fail('invalid_request');
  if (body.deviceToken !== undefined && !text(body.deviceToken, 256)) fail('invalid_request');
  if (['prepare', 'generate'].includes(body.action) && !KINDS.has(body.kind)) fail('invalid_request');
  if (body.action==='generate' && (body.kind==='core30' ? !text(body.questionId,120) : body.questionId!==undefined))
    fail('invalid_request');
  if (['generate','retry_items'].includes(body.action) && (!HASH.test(body.sourceHash || '') ||
      !text(body.requestKey, 100, 8) || (body.regenerate !== undefined && typeof body.regenerate !== 'boolean')))
    fail('invalid_request');
  for (const key of ['requestId', 'workerId', 'jobId', 'executionId']) {
    if (key in body && !UUID.test(body[key])) fail('invalid_request');
  }
  if (['status', 'admin_revoke_worker', 'admin_retry_job'].includes(body.action) &&
      !body[{status: 'requestId', admin_revoke_worker: 'workerId', admin_retry_job: 'jobId'}[body.action]])
    fail('invalid_request');
  if (body.action === 'admin_resolve_unknown' &&
      (!body.jobId || !body.executionId || body.confirmedStopped !== true)) fail('invalid_request');
  if (body.action === 'retry_items' && (!body.requestId || !Array.isArray(body.itemKeys) ||
      !body.itemKeys.length || body.itemKeys.length > 30 || new Set(body.itemKeys).size !== body.itemKeys.length ||
      body.itemKeys.some(k => !text(k, 120)))) fail('invalid_request');
  if (body.action === 'admin_register_worker' && (!text(body.label, 80) || !Array.isArray(body.studentIds) ||
      !body.studentIds.length || body.studentIds.length > 200 || body.studentIds.some(s => !text(s, 120))))
    fail('invalid_request');
  if ('enabled' in body && typeof body.enabled !== 'boolean') fail('invalid_request');
  if ('bundleHash' in body && !HASH.test(body.bundleHash)) fail('invalid_request');
  if ('version' in body && !HASH.test(body.version)) fail('invalid_request');
  for (const [key, max] of [['maxPendingTotal', 5000], ['requestsPerMinute', 60]]) {
    if (key in body && (!Number.isInteger(body[key]) || body[key] < (key === 'maxPendingTotal' ? 30 : 1) || body[key] > max))
      fail('invalid_request');
  }
  if ('dailyCallLimit' in body && (!Number.isInteger(body.dailyCallLimit) || body.dailyCallLimit < 1 || body.dailyCallLimit > 10000))
    fail('invalid_request');
  if ('coreQuestionIds' in body && (!Array.isArray(body.coreQuestionIds) || body.coreQuestionIds.length !== 30 ||
      new Set(body.coreQuestionIds).size !== 30 || body.coreQuestionIds.some(s => !text(s, 120)))) fail('invalid_core30', 422);
}
function createHandler(deps) {
  return async (req, res) => {
    try {
      postOnly(req, res); sameOrigin(req);
      const body = await bodyOf(req, 16000); validate(body);
      const d = deps || defaultDeps();
      let actor;
      if (body.action.startsWith('admin_')) {
        const admin = await d.authenticateAdmin(req, body.action !== 'admin_overview');
        actor = {type: 'admin', id: admin.id};
      } else {
        let student = await d.authenticateWeb(req);
        if (!student) {
          if (!d.previewAllowed(body.studentId)) fail('forbidden', 403);
          student = await d.authenticateDevice({studentId: body.studentId, deviceToken: body.deviceToken});
          if (!student) fail('unauthorized', 401);
          if (!d.previewAllowed(student.id)) fail('forbidden', 403);
        }
        actor = {type: 'student', id: student.id};
      }
      const payload = {...body};
      for (const k of ['action', 'studentId', 'deviceToken']) delete payload[k];
      let token;
      if (body.action === 'admin_register_worker') {
        token = crypto.randomBytes(32).toString('base64url');
        payload.tokenHash = hash(token);
      }
      const result = await d.invoke(body.action, actor, payload);
      res.status(200).json(token ? {...result, token} : result);
    } catch (error) { sendError(res, error); }
  };
}
module.exports = createHandler();
module.exports.createHandler = createHandler;
module.exports.validate = validate;
