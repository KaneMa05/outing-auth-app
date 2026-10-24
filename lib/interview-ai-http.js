'use strict';
const {fail, object} = require('./interview-ai-validation');
async function bodyOf(req, max = 100000) {
  let body = req.body;
  if (body === undefined) {
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (Buffer.byteLength(raw) > max) fail('request_too_large', 413);
    }
    try { body = JSON.parse(raw || '{}'); } catch { fail('invalid_request'); }
  } else if (typeof body === 'string') {
    if (Buffer.byteLength(body) > max) fail('request_too_large', 413);
    try { body = JSON.parse(body); } catch { fail('invalid_request'); }
  }
  if (!object(body)) fail('invalid_request');
  if (Buffer.byteLength(JSON.stringify(body)) > max) fail('request_too_large', 413);
  return body;
}
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (origin) {
    try { if (new URL(origin).host !== req.headers.host) fail('forbidden', 403); }
    catch { fail('forbidden', 403); }
  }
}
const codes = {
  unauthorized: 401, forbidden: 403, not_enrolled: 403, not_found: 404,
  questions_unavailable: 409, session_expired: 409,
  source_changed: 409, idempotency_conflict: 409, lease_lost: 409,
  execution_mismatch: 409, unsafe_retry: 409, bundle_mismatch: 409,
  automation_disabled: 409, bundle_unconfigured: 409, invalid_core30: 422,
  invalid_request: 400, unsupported_action: 400, invalid_output: 422,
  invalid_evidence: 422, experience_required: 422, daily_limit: 429,
  request_limit: 429, request_rate_limited: 429, queue_full: 429, admission_busy: 429,
  method_not_allowed: 405, request_too_large: 413
};
function sendError(res, error) {
  const code = Object.keys(codes).find(c => error.message === c || error.message?.includes(`"message":"${c}"`));
  if (['request_rate_limited','queue_full','admission_busy'].includes(code)) {
    const seconds = code === 'admission_busy' ? 5 : 60;
    res.setHeader('Retry-After', String(seconds));
    return res.status(429).json({ok: false, error: code, retryAfterSeconds: seconds});
  }
  return res.status(code ? codes[code] : 503).json({ok: false, error: code || 'automation_unavailable'});
}
function postOnly(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {res.setHeader('Allow', 'POST'); fail('method_not_allowed', 405);}
}
module.exports = {bodyOf, sameOrigin, sendError, postOnly};
