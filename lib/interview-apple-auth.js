'use strict';
const crypto = require('node:crypto');
const webAuth = require('./interview-web-auth');
const fail = (message = 'apple_login_failed') => { throw Error(message); };
const issuer = 'https://appleid.apple.com';
function config(env = process.env) {
  const result = {
    clientId: env.APPLE_SERVICE_ID || '', teamId: env.APPLE_TEAM_ID || '', keyId: env.APPLE_KEY_ID || '',
    privateKey: (env.APPLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'), encryptionKey: env.APPLE_TOKEN_ENCRYPTION_KEY || '',
  };
  result.enabled = env.INTERVIEW_APPLE_ENABLED === 'true' && !!result.clientId &&
    /^[A-Z0-9]{10}$/.test(result.teamId) && /^[A-Z0-9]{10}$/.test(result.keyId) &&
    result.privateKey.includes('PRIVATE KEY') && /^[a-f0-9]{64}$/.test(result.encryptionKey);
  if (result.enabled) {
    try {
      const key = crypto.createPrivateKey(result.privateKey);
      result.enabled = key.asymmetricKeyType === 'ec' && key.asymmetricKeyDetails?.namedCurve === 'prime256v1';
    } catch { result.enabled = false; }
  }
  return result;
}
function clientSecret(cfg, now = Date.now()) {
  const header = Buffer.from(JSON.stringify({alg: 'ES256', kid: cfg.keyId})).toString('base64url');
  const body = Buffer.from(JSON.stringify({iss: cfg.teamId, iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + 300,
    aud: issuer, sub: cfg.clientId})).toString('base64url');
  const input = header + '.' + body;
  const signature = crypto.sign('sha256', Buffer.from(input), {key: cfg.privateKey, dsaEncoding: 'ieee-p1363'});
  return input + '.' + signature.toString('base64url');
}
// Encryption is server-only. Bind stored grants to the exact Apple client and subject.
function seal(value, cfg, context) {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(cfg.encryptionKey, 'hex'), iv);
  cipher.setAAD(Buffer.from(context));
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), data.toString('base64url'), cipher.getAuthTag().toString('base64url')].join('.');
}
function unseal(value, cfg, context) {
  if (typeof value !== 'string' || value.length > 10000) fail();
  const parts = value.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') fail();
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(cfg.encryptionKey, 'hex'), Buffer.from(parts[1], 'base64url'));
  decipher.setAAD(Buffer.from(context)); decipher.setAuthTag(Buffer.from(parts[3], 'base64url'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(parts[2], 'base64url')), decipher.final()]).toString('utf8'));
}
function createVerifier({fetcher = fetch, now = Date.now} = {}) {
  let cached = [], loaded = 0;
  return async (token, {clientId, nonce}) => {
    if (typeof token !== 'string' || token.length > 8192 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) fail();
    const [h, b, s] = token.split('.');
    const header = JSON.parse(Buffer.from(h, 'base64url')), claims = JSON.parse(Buffer.from(b, 'base64url'));
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid || header.kid.length > 128) fail();
    if (!loaded || now() - loaded > 3600000 || (!cached.some(k => k.kid === header.kid) && now() - loaded > 60000)) {
      const response = await fetcher(issuer + '/auth/keys', {signal: AbortSignal.timeout(10000)});
      const body = await response.json();
      if (!response.ok || !Array.isArray(body.keys)) fail();
      cached = body.keys; loaded = now();
    }
    const jwk = cached.find(k => k.kid === header.kid && k.kty === 'RSA' && k.alg === 'RS256' && k.use === 'sig');
    if (!jwk || !crypto.verify('RSA-SHA256', Buffer.from(h + '.' + b), crypto.createPublicKey({key: jwk, format: 'jwk'}), Buffer.from(s, 'base64url'))) fail();
    const seconds = Math.floor(now() / 1000);
    if (claims.iss !== issuer || claims.aud !== clientId || typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 255 ||
        !Number.isFinite(claims.exp) || claims.exp <= seconds || !Number.isFinite(claims.iat) || claims.iat > seconds + 60 ||
        claims.iat < seconds - 600 || typeof nonce !== 'string' || !nonce || claims.nonce !== nonce) fail();
    // Do not link by email: private-relay addresses and changed email addresses are valid.
    return claims.sub;
  };
}
const verify = createVerifier();
async function exchange(code, cfg, nonce, {fetcher = fetch, verifyToken = verify} = {}) {
  const form = new URLSearchParams({client_id: cfg.clientId, client_secret: clientSecret(cfg), code,
    grant_type: 'authorization_code', redirect_uri: cfg.redirectUri});
  const response = await fetcher(issuer + '/auth/token', {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: form.toString(), signal: AbortSignal.timeout(10000)});
  const token = await response.json();
  if (!response.ok || typeof token.refresh_token !== 'string' || !token.refresh_token || token.refresh_token.length > 4096) fail();
  const subject = await verifyToken(token.id_token, {clientId: cfg.clientId, nonce});
  return {subject, encryptedRefreshToken: seal(token.refresh_token, cfg, cfg.clientId + ':' + subject)};
}
async function revoke(encrypted, cfg, subject, fetcher = fetch) {
  const token = unseal(encrypted, cfg, cfg.clientId + ':' + subject);
  if (typeof token !== 'string' || !token) fail();
  const response = await fetcher(issuer + '/auth/revoke', {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({client_id: cfg.clientId, client_secret: clientSecret(cfg), token, token_type_hint: 'refresh_token'}).toString(),
    signal: AbortSignal.timeout(10000)});
  if (!response.ok) fail('apple_revoke_failed');
}
module.exports = {config, clientSecret, seal, unseal, createVerifier, exchange, revoke, nonce: state => webAuth.hash('apple:' + state)};
