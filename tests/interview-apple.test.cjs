'use strict';
const {test} = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto'), fs = require('node:fs');
const apple = require('../lib/interview-apple-auth'), webAuth = require('../lib/interview-web-auth');
const {createHandler} = require('../api/interview-apple');
const {createDb} = require('./helpers/interview-db.cjs');
const migration = 'supabase/migrations/20261109054842_interview_apple_login.sql';
const ec = crypto.generateKeyPairSync('ec', {namedCurve: 'prime256v1'});
const cfg = {enabled: true, clientId: 'com.example.web', teamId: 'ABCDEFGHIJ', keyId: '0123456789',
  encryptionKey: 'a'.repeat(64), privateKey: ec.privateKey.export({type: 'pkcs8', format: 'pem'})};

test('Apple signature, issuer, audience, expiry and nonce are verified; private email never becomes an identity key', async () => {
  const keys = crypto.generateKeyPairSync('rsa', {modulusLength: 2048}), now = 1794182400000;
  const jwk = {...keys.publicKey.export({format: 'jwk'}), kid: 'test-key', alg: 'RS256', use: 'sig'};
  let reads = 0;
  const verify = apple.createVerifier({now: () => now, fetcher: async url => {
    assert.equal(url, 'https://appleid.apple.com/auth/keys'); reads++; return {ok: true, json: async () => ({keys: [jwk]})};
  }});
  const claims = {iss: 'https://appleid.apple.com', aud: cfg.clientId, sub: 'stable-apple-subject', exp: now / 1000 + 3600,
    iat: now / 1000, nonce: 'nonce', email: 'private@privaterelay.appleid.com', is_private_email: true};
  function token(changes = {}, header = {}) {
    const h = Buffer.from(JSON.stringify({alg: 'RS256', kid: 'test-key', ...header})).toString('base64url');
    const b = Buffer.from(JSON.stringify({...claims, ...changes})).toString('base64url'), input = h + '.' + b;
    return input + '.' + crypto.sign('RSA-SHA256', Buffer.from(input), keys.privateKey).toString('base64url');
  }
  const expected = {clientId: cfg.clientId, nonce: 'nonce'};
  assert.equal(await verify(token(), expected), claims.sub);
  assert.equal(await verify(token({email: 'another@privaterelay.appleid.com'}), expected), claims.sub);
  for (const change of [{iss: 'https://evil.example'}, {aud: 'another-client'}, {nonce: 'replayed'}, {exp: now / 1000},
    {iat: now / 1000 + 61}, {iat: now / 1000 - 601}, {sub: ''}]) await assert.rejects(verify(token(change), expected));
  await assert.rejects(verify(token({}, {alg: 'HS256'}), expected));
  await assert.rejects(verify(token({}, {kid: 'attacker'}), expected));
  const signed = token(); await assert.rejects(verify(signed.slice(0, -8) + 'aaaaaaaa', expected));
  assert.equal(reads, 1, 'Cache Apple keys and never fetch a token-provided URL');
});

test('Apple code exchange uses a short-lived ES256 client secret and encrypts revocation grants', async () => {
  const now = Date.now(), secret = apple.clientSecret(cfg, now), parts = secret.split('.');
  assert(crypto.verify('sha256', Buffer.from(parts[0] + '.' + parts[1]), {key: ec.publicKey, dsaEncoding: 'ieee-p1363'}, Buffer.from(parts[2], 'base64url')));
  const body = JSON.parse(Buffer.from(parts[1], 'base64url'));
  assert.equal(body.exp - body.iat, 300); assert.equal(body.sub, cfg.clientId);
  const result = await apple.exchange('single-use-code', {...cfg, redirectUri: 'https://app.test/api/interview-apple?action=callback'}, 'nonce', {
    fetcher: async (url, options) => {
      assert.equal(url, 'https://appleid.apple.com/auth/token'); const f = new URLSearchParams(options.body);
      assert.equal(f.get('grant_type'), 'authorization_code'); assert.equal(f.get('code'), 'single-use-code');
      assert.equal(f.get('client_id'), cfg.clientId); assert(f.get('client_secret').split('.').length === 3);
      return {ok: true, json: async () => ({id_token: 'signed-token', refresh_token: 'private-refresh-token'})};
    }, verifyToken: async (token, expected) => { assert.equal(token, 'signed-token'); assert.equal(expected.nonce, 'nonce'); return 'subject'; },
  });
  assert(!result.encryptedRefreshToken.includes('private-refresh-token'));
  assert.equal(apple.unseal(result.encryptedRefreshToken, cfg, cfg.clientId + ':subject'), 'private-refresh-token');
  assert.throws(() => apple.unseal(result.encryptedRefreshToken, cfg, cfg.clientId + ':another-person'));
  await apple.revoke(result.encryptedRefreshToken, cfg, 'subject', async (url, options) => {
    assert.equal(url, 'https://appleid.apple.com/auth/revoke'); assert.equal(new URLSearchParams(options.body).get('token'), 'private-refresh-token');
    return {ok: true};
  });
});

test('Incomplete or invalid signing configuration cannot advertise a working Apple login', () => {
  const env = {INTERVIEW_APPLE_ENABLED:'true',APPLE_SERVICE_ID:cfg.clientId,APPLE_TEAM_ID:cfg.teamId,APPLE_KEY_ID:cfg.keyId,
    APPLE_PRIVATE_KEY:cfg.privateKey,APPLE_TOKEN_ENCRYPTION_KEY:cfg.encryptionKey};
  assert.equal(apple.config(env).enabled,true);
  for(const key of Object.keys(env))assert.equal(apple.config({...env,[key]:''}).enabled,false,key);
  assert.equal(apple.config({...env,APPLE_PRIVATE_KEY:'-----BEGIN PRIVATE KEY-----invalid'}).enabled,false);
});

test('Operator Apple revocation retains encrypted grants when Apple is unavailable', async () => {
  const {revokeOwner}=require('../scripts/revoke-interview-apple.cjs');
  const operations=[];
  const request=async(method,path)=>{
    operations.push({method,path});
    return path.startsWith('ip_web_identities?')?[{id:'identity',app_id:'apple:'+cfg.clientId,subject:'subject'}]:[{encrypted_refresh_token:'encrypted-fixture'}];
  };
  await assert.rejects(revokeOwner('ip-a',{cfg,request,revoke:async()=>{throw Error('unavailable');}}));
  assert(operations.every(row=>row.method==='GET'),'Never lose the revocation grant after a failed Apple request');
  operations.length=0;
  const result=await revokeOwner('ip-a',{cfg,request,revoke:async(token)=>assert.equal(token,'encrypted-fixture')});
  assert.equal(result.revokedAppleIdentities,1);assert.equal(result.accountDataDeleted,false);
  assert.equal(operations.filter(row=>row.method==='DELETE').length,2);
});

test('Apple form POST, browser binding, replay, provider linking, enrollment and private grants use the real local DB', async () => {
  const {db, invoke} = await createDb();
  try {
    await db.exec(fs.readFileSync(migration, 'utf8'));
    const rpc = (action, body) => invoke(action, {type: 'server'}, body);
    const login = async body => (await db.query('select ip_apple_login($1::jsonb) result', [JSON.stringify(body)])).rows[0].result;
    let exchanges = 0;
    const handler = createHandler({getConfig: () => ({enabled: true, origin: 'https://app.test'}), getAppleConfig: () => cfg, invoke: rpc, login,
      exchange: async code => { exchanges++; return {subject: code, encryptedRefreshToken: apple.seal('refresh', cfg, cfg.clientId + ':' + code)}; }});
    async function call(method, query, body, jar = {}, origin = 'https://app.test') {
      const out = {headers: {}};
      await handler({method, url: '/api/interview-apple' + query, body,
        headers: {host: 'app.test', origin, cookie: Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ')}, socket: {remoteAddress: 'qa'}},
      {setHeader(k, v) { out.headers[k] = v; }, set statusCode(v) { out.status = v; }, status(v) { out.status = v; return this; },
        json(data) { out.data = data; }, end(html) { out.html = html; }});
      for (const cookie of [].concat(out.headers['Set-Cookie'] || [])) { const [name, value] = cookie.split(';')[0].split('='); if (value) jar[name] = value; else delete jar[name]; }
      return out;
    }
    async function start(jar, intent = 'login') {
      const out = await call('POST', '', {action: 'start', intent}, jar); assert.equal(out.status, 200);
      const url = new URL(out.data.url); assert.equal(url.origin, 'https://appleid.apple.com');
      assert.equal(url.searchParams.get('scope'), 'name email'); assert.equal(url.searchParams.get('response_mode'), 'form_post');
      assert.equal(url.searchParams.get('nonce'), apple.nonce(url.searchParams.get('state')));
      return url.searchParams.get('state');
    }
    const jar = {}, state = await start(jar);
    // Cross-site POST receives no original SameSite=Lax cookies, just like Safari.
    const callbackJar = {}, response = await call('POST', '?action=callback', new URLSearchParams({code: 'apple-one', state}).toString(), callbackJar, 'https://appleid.apple.com');
    assert.equal(response.status, 200); assert(!response.html.includes('apple-one'));
    assert(response.html.includes('/api/interview-apple?action=complete'));
    const callbackResult = {...callbackJar};
    const rejected = await call('GET', '?action=complete', undefined, {...callbackJar});
    assert(rejected.headers.Location.includes('oauth_state_invalid')); assert.equal(exchanges, 0);
    Object.assign(jar, callbackResult);
    const browserBefore = {...jar};
    const completed = await call('GET', '?action=complete', undefined, jar); assert.equal(completed.status, 303);
    const session = await rpc('session', {sessionHash: webAuth.hash(jar[webAuth.COOKIE])});
    assert.equal(session.authenticated, true); assert.equal(session.account.ownerId, null); assert.equal(session.available, false);
    assert((await call('GET', '?action=complete', undefined, browserBefore)).headers.Location.includes('oauth_state_invalid'));
    assert.equal(exchanges, 1, 'Single-use state rejects replay before exchanging an Apple code');
    const application=await rpc('apply',{sessionHash:webAuth.hash(jar[webAuth.COOKIE]),name:'새 면접 수강생',track:'공채',examNumber:'LOCAL',revision:0});
    const reverseToken=webAuth.random();
    await rpc('oauth_login',{appId:'kakao-client',subject:'kakao-after-apple',intent:'link',sessionHash:webAuth.hash(jar[webAuth.COOKIE]),newHash:webAuth.hash(reverseToken)});
    const reverse=await rpc('session',{sessionHash:webAuth.hash(reverseToken)});
    assert.equal(reverse.account.ownerId,application.application.owner_id);
    assert.equal(reverse.account.appleLinked,true);assert.equal(reverse.account.kakaoLinked,true);
    assert.equal(reverse.available,false,'Linking another provider cannot approve a pending student');
    // Existing student identity, Kakao link and study records stay on the same owner.
    await db.query('update students set password_hash=$1 where id=$2', [webAuth.hash('existing-password'), 'ip-a']);
    const legacyToken = webAuth.random(), kakaoToken = webAuth.random();
    await rpc('legacy_login', {studentId: 'ip-a', passwordHash: webAuth.hash('existing-password'), intent: 'login', sessionHash: '', newHash: webAuth.hash(legacyToken)});
    await rpc('oauth_login', {appId: 'kakao-client', subject: 'kakao-one', intent: 'link', sessionHash: webAuth.hash(legacyToken), newHash: webAuth.hash(kakaoToken)});
    const existing = {[webAuth.COOKIE]: kakaoToken}, linkedState = await start(existing, 'link');
    await call('POST', '?action=callback', {code: 'apple-existing', state: linkedState}, existing, 'https://appleid.apple.com');
    const wrongSession = {...existing, [webAuth.COOKIE]: 'another-session'};
    assert((await call('GET', '?action=complete', undefined, wrongSession)).headers.Location.includes('oauth_state_invalid'));
    // The consumed failed attempt cannot be reused; start a new link request.
    const linkedState2 = await start(existing, 'link');
    await call('POST', '?action=callback', {code: 'apple-existing', state: linkedState2}, existing, 'https://appleid.apple.com');
    await call('GET', '?action=complete', undefined, existing);
    const linked = await rpc('session', {sessionHash: webAuth.hash(existing[webAuth.COOKIE])});
    assert.equal(linked.account.ownerId, 'ip-a'); assert.equal(linked.account.appleLinked, true);
    assert.equal(Number((await db.query("select count(*) n from ip_web_identities where owner_id='ip-a'")).rows[0].n), 2);
    await assert.rejects(login({appId: 'apple:' + cfg.clientId, subject: 'another-apple', intent: 'link', sessionHash: webAuth.hash(existing[webAuth.COOKIE]), newHash: webAuth.hash('duplicate'), encryptedRefreshToken: apple.seal('refresh', cfg, 'context')}), /account_already_linked/);
    // A broken grant write must roll back session creation and preserve old access.
    await assert.rejects(login({appId: 'apple:' + cfg.clientId, subject: 'apple-existing', intent: 'login', sessionHash: webAuth.hash(existing[webAuth.COOKIE]), newHash: webAuth.hash('bad-grant'), encryptedRefreshToken: 'v1.x'}));
    assert.equal((await rpc('session', {sessionHash: webAuth.hash(existing[webAuth.COOKIE])})).authenticated, true);
    assert.equal(Number((await db.query('select count(*) n from ip_web_sessions where token_hash=$1', [webAuth.hash('bad-grant')])).rows[0].n), 0);
    assert.equal((await call('POST', '', {action: 'start', intent: 'login'}, {}, 'https://evil.test')).status, 403);
    const cancel = {}, cancelState = await start(cancel);
    await call('POST', '?action=callback', {state: cancelState, error: 'user_cancelled_authorize'}, cancel, 'https://appleid.apple.com');
    assert((await call('GET', '?action=complete', undefined, cancel)).headers.Location.includes('apple_cancelled'));
    for (const role of ['anon', 'authenticated']) {
      await db.exec('set role ' + role);
      await assert.rejects(db.query('select * from ip_apple_grants'), /permission denied/);
      await assert.rejects(login({}), /permission denied/);
      await db.exec('reset role');
    }
    assert.equal(Number((await db.query('select count(*) n from students')).rows[0].n), 3, 'Apple sign-in never creates a normal student');
  } finally { await db.close(); }
});
