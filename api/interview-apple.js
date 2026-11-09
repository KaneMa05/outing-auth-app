'use strict';
const crypto = require('node:crypto');
const apple = require('../lib/interview-apple-auth');
const webAuth = require('../lib/interview-web-auth');
const {readCookie} = require('./teacher-auth-utils');
const {requestSupabase} = require('./curriculum')._private;
const BROWSER = 'ip_apple_browser', RESULT = 'ip_apple_result', PATH = '/api/interview-apple';
const RETURN_STYLE = `:root{color-scheme:dark;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#050f1c;color:#f5f8fc}*{box-sizing:border-box}body{margin:0;min-height:100vh;min-height:100dvh;display:grid;place-items:center;padding:32px 24px;text-align:center}main{width:min(100%,320px)}.mark{display:grid;place-items:center;width:64px;height:64px;margin:0 auto 20px;border-radius:20px;background:#f5f8fc;color:#102c46;font-size:40px;font-weight:850;font-style:italic}h1{margin:0;font-size:22px;letter-spacing:-.6px}p{margin:12px 0 0;color:#b2c2d2;font-size:14px;line-height:1.7;word-break:keep-all}.spinner{display:block;width:24px;height:24px;margin:30px auto 0;border:2px solid #294052;border-top-color:#f5f8fc;border-radius:50%;animation:spin .85s linear infinite}.fallback{margin-top:32px;visibility:hidden;animation:show .01s 6s forwards}.fallback a{display:inline-block;padding:12px 24px;border:1px solid #53687c;border-radius:12px;color:#e7eef5;text-decoration:none;font-size:14px}.fallback a:focus-visible{outline:2px solid #fff;outline-offset:4px}@keyframes spin{to{transform:rotate(360deg)}}@keyframes show{to{visibility:visible}}@media(prefers-reduced-motion:reduce){.spinner{animation:none}}`;
const RETURN_CSP = "default-src 'none'; style-src 'sha256-" + crypto.createHash('sha256').update(RETURN_STYLE).digest('base64') + "'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
const RETURN_HTML = '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="theme-color" content="#050f1c"><title>론박스터디</title><style>' + RETURN_STYLE + '</style><meta http-equiv="refresh" content="0;url=/api/interview-apple?action=complete"></head><body><main data-auth-return><div class="mark" aria-hidden="true">R</div><h1>론박스터디</h1><p role="status">론박스터디로 돌아가는 중이에요</p><span class="spinner" aria-hidden="true"></span><div class="fallback"><a href="/api/interview-apple?action=complete">계속하기</a></div></main></body></html>';
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
        res.setHeader('Content-Security-Policy', RETURN_CSP);
        res.statusCode = 200;
        return res.end(RETURN_HTML);
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
