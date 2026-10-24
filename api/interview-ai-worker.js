'use strict';
const {UUID, HASH, fail, keys, validateResult, hash, text} = require('../lib/interview-ai-validation');
const {bodyOf, sendError, postOnly} = require('../lib/interview-ai-http');
function createHandler({invoke = (action, tokenHash, body) =>
  require('./curriculum')._private.requestSupabase('POST', 'rpc/ip_ai_worker_service',
    {p_action: action, p_token_hash: tokenHash, p_body: body})} = {}) {
  return async (req, res) => {
    try {
      postOnly(req, res);
      // This endpoint has no browser-cookie authentication or permissive CORS.
      if (req.headers.origin) fail('forbidden', 403);
      const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization || '');
      if (!match) fail('unauthorized', 401);
      const body = await bodyOf(req);
      const fields = {
        claim: ['bundleHash'], inspect: ['jobId', 'executionId'], renew: [],
        execution_start: ['executionId'], session: ['executionId', 'sessionRef'],
        recover: ['executionId'], complete: ['executionId', 'result'], report: ['reason']
      };
      if (!fields[body.action]) fail('unsupported_action');
      const lease = body.action !== 'claim' && body.action !== 'inspect';
      keys(body, ['action', ...fields[body.action], ...(lease ? ['jobId', 'leaseToken', 'leaseEpoch'] : [])]);
      if (body.action === 'claim' && !HASH.test(body.bundleHash || '')) fail('invalid_request');
      if (body.action !== 'claim' && !UUID.test(body.jobId || '')) fail('invalid_request');
      if (lease && (!UUID.test(body.leaseToken || '') || !Number.isInteger(body.leaseEpoch) || body.leaseEpoch < 1))
        fail('invalid_request');
      if (fields[body.action].includes('executionId') && (body.action !== 'inspect' || body.executionId !== undefined) &&
          !UUID.test(body.executionId || '')) fail('invalid_request');
      if (body.action === 'session' && !text(body.sessionRef, 120)) fail('invalid_request');
      if (body.action === 'complete') validateResult(body.result);
      const payload = {...body}; delete payload.action;
      res.status(200).json(await invoke(body.action, hash(match[1]), payload));
    } catch (error) { sendError(res, error); }
  };
}
module.exports = createHandler();
module.exports.createHandler = createHandler;
