'use strict';
const apple = require('../lib/interview-apple-auth');
const webAuth = require('../lib/interview-web-auth');
const {readCookie} = require('./teacher-auth-utils');
const {requestSupabase} = require('./curriculum')._private;
const BROWSER = 'ip_apple_browser', RESULT = 'ip_apple_result', PATH = '/api/interview-apple';
const validState = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
const fail = (message, status = 400) => { throw Object.assign(Error(message), {status}); };
async function readBody(req, form = false) {
  let body = req.body;
  if (body === undefined) { const chunks = []; let size = 0; for await (const chunk of req) {
    size += Buffer.byteLength(chunk); if (size > 10000) fail('invalid_request'); chunks.push(Buffer.from(chunk));
  } body = Buffer.concat(chunks).toString('utf8'); }
  if (typeof body === 'string') body = form ? Object.fromEntries(new URLSearchParams(body)) : JSON.parse(body);
  if (!body || typeof body !== 'object' || Array.isArray(body) || Buffer.byteLength(JSON.stringify(body)) > 10000) fail('invalid_request');
  return body;
}
function createHandler({getConfig = webAuth.config, getAppleConfig = apple.config, invoke = webAuth.invoke,
  login = body => requestSupabase('POST', 'rpc/ip_apple_login', {p_body: body}), exchange = apple.exchange,
  random = webAuth.random, now = Date.now} = {}) {
  return async (req, res) => {
    const cfg = webAuth.requestConfig(req, getConfig()), ac = getAppleConfig();
    const action = new URL(req.url || PATH, 'http://localhost').searchParams.get('action');
    const callback = action === 'callback' || action === 'complete';
    const cookie = (name, value, seconds) => webAuth.cookie(name, value, seconds, cfg, PATH);
    const clear = () => [cookie(BROWSER, '', 0), cookie(RESULT, '', 0)];
    const redirect = error => { res.statusCode = 303; res.setHeader('Location', '/interview' + (error ? '?auth_error=' + encodeURIComponent(error) : '')); res.end(); };
    res.setHeader('Cache-Control', 'no-store, max-age=0'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      if (!cfg.enabled || !ac.enabled || !cfg.origin.startsWith('https:')) fail('apple_not_configured', 503);
      if (action === 'callback' && req.method === 'POST') {
        if (req.headers.origin && req.headers.origin !== 'https://appleid.apple.com') fail('forbidden', 403);
        const body = await readBody(req, true);
        if (!validState(body.state) || (!body.error && (typeof body.code !== 'string' || !body.code || body.code.length > 2048))) fail('apple_login_failed');
        const result = apple.seal({state: body.state, code: body.error ? '' : body.code,
          cancelled: !!body.error, expires: now() + 120000}, ac, 'callback:' + cfg.origin);
        res.setHeader('Set-Cookie', cookie(RESULT, result, 120));
        // Apple sends a cross-site form POST. First return a same-origin page, then
        // navigate with GET so WKWebView/Safari send the original SameSite=Lax cookies.
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Content-Security-Policy', "default-src 'none'; base-uri 'none'; frame-ancestors 'none'");
        res.statusCode = 200;
        return res.end('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=/api/interview-apple?action=complete"><title>Apple 로그인</title><p>로그인을 완료하고 있습니다.</p><a href="/api/interview-apple?action=complete">로그인 계속하기</a></html>');
      }
      if (action === 'complete' && req.method === 'GET') {
        const result = apple.unseal(readCookie(req, RESULT), ac, 'callback:' + cfg.origin), browser = readCookie(req, BROWSER);
        if (!validState(result.state) || !validState(browser) || !Number.isFinite(result.expires) || result.expires <= now()) fail('oauth_state_invalid');
        const transaction = await invoke('oauth_consume', {stateHash: apple.nonce(result.state), browserHash: webAuth.hash(browser)});
        if (transaction.intent === 'link' && transaction.sessionHash !== webAuth.sessionHash(req)) fail('oauth_state_invalid');
        if (result.cancelled) fail('apple_cancelled');
        const identity = await exchange(result.code, {...ac, redirectUri: cfg.origin + PATH + '?action=callback'}, apple.nonce(result.state));
        const token = random();
        await login({appId: 'apple:' + ac.clientId, subject: identity.subject, intent: transaction.intent,
          sessionHash: transaction.sessionHash, newHash: webAuth.hash(token), encryptedRefreshToken: identity.encryptedRefreshToken});
        res.setHeader('Set-Cookie', [webAuth.cookie(webAuth.COOKIE, token, 604800, cfg), ...clear()]);
        return redirect();
      }
      if (req.method !== 'POST' || action) { res.setHeader('Allow', 'POST'); fail('method_not_allowed', 405); }
      webAuth.requireOrigin(req, cfg);
      const body = await readBody(req);
      if (body.action !== 'start' || !['login', 'link'].includes(body.intent)) fail('invalid_request');
      const network = String(req.socket?.remoteAddress || req.headers['x-vercel-forwarded-for'] || 'shared');
      if (!(await invoke('rate', {key: webAuth.hash('apple:' + network), limit: 300})).allowed) fail('too_many_attempts', 429);
      const state = random(), browser = random();
      await invoke('oauth_start', {stateHash: apple.nonce(state), browserHash: webAuth.hash(browser), intent: body.intent, sessionHash: webAuth.sessionHash(req)});
      const url = new URL('https://appleid.apple.com/auth/authorize');
      url.search = new URLSearchParams({client_id: ac.clientId, redirect_uri: cfg.origin + PATH + '?action=callback',
        response_type: 'code', response_mode: 'form_post', scope: 'name email', state, nonce: apple.nonce(state)}).toString();
      res.setHeader('Set-Cookie', cookie(BROWSER, browser, 600));
      return res.status(200).json({ok: true, url: url.href});
    } catch (error) {
      const known = ['apple_not_configured', 'apple_login_failed', 'apple_cancelled', 'oauth_state_invalid', 'account_already_linked', 'forbidden', 'unauthorized', 'invalid_request', 'too_many_attempts', 'method_not_allowed'];
      const code = known.includes(error.message) ? error.message : 'apple_login_failed';
      if (callback) { res.setHeader('Set-Cookie', clear()); return redirect(code); }
      return res.status(error.status || 400).json({ok: false, error: code});
    }
  };
}
module.exports = createHandler();
module.exports.createHandler = createHandler;
