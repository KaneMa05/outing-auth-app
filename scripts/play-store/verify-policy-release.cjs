const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const release = path.join(root, '.tmp/play-policy-release');
const base = path.join(root, '.tmp/penalty-export-release');
const origin = 'https://outing-auth-app.vercel.app';
const after = process.argv.includes('--deployed');
const normalize = value => value.replace(/\r\n/g, '\n').replace(/^\uFEFF/, '').trim();
async function response(route) {
  const r = await fetch(origin + '/' + route, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
  assert.equal(r.status, 200, route);
  return r;
}
(async () => {
  const files = after
    ? ['app.js', 'styles.css', 'index.html', 'teacher.html', 'sw.js', 'account-deletion.html', 'app-privacy.html', 'privacy-pages.css', '.well-known/assetlinks.json']
    : ['app.js', 'styles.css', 'index.html', 'teacher.html', 'sw.js'];
  const results = await Promise.allSettled(files.map(async file => {
    const text = await (await response(file)).text();
    assert.equal(normalize(text), normalize(fs.readFileSync(path.join(after ? release : base, file), 'utf8')), file + ' matches expected release');
    console.log(file + ': matches ' + (after ? 'approved release' : 'current production baseline'));
  }));
  for (const result of results) if (result.status === 'rejected') throw result.reason;
  const configText = await (await response('config.js')).text();
  const context = { window: {} };
  vm.runInNewContext(configText, context, { timeout: 1000 });
  const config = context.window.OUTING_APP_CONFIG;
  assert.equal(config.supabaseUrl, 'https://ehzrwkvuarertwvwoyus.supabase.co');
  assert.ok(config.supabaseAnonKey && !config.supabaseServiceRoleKey);
  if (!after) {
    const original = fs.readFileSync(path.join(root, 'config.js'));
    process.chdir(release);
    process.env.SUPABASE_URL = config.supabaseUrl;
    process.env.SUPABASE_ANON_KEY = config.supabaseAnonKey;
    process.env.VERCEL = '1';
    require(path.join(release, 'build-config.js'));
    assert.ok(original.equals(fs.readFileSync(path.join(root, 'config.js'))), 'Root config unchanged');
    console.log('Production-mode isolated build passed; root configuration unchanged.');
  } else {
    const assets = [...fs.readFileSync(path.join(release, 'sw.js'), 'utf8').split('];')[0].matchAll(/"(\/[^"\n]*)"/g)].map(m => m[1]);
    for (let i = 0; i < assets.length; i += 8) {
      const checks = await Promise.allSettled(assets.slice(i, i + 8).map(asset => response(asset.slice(1))));
      for (const check of checks) if (check.status === 'rejected') throw check.reason;
    }
    console.log('All ' + assets.length + ' service worker assets return HTTP 200.');
    for (const route of ['artifacts/play-console/registration-status.json', '.play-signing/upload-password.txt', 'AGENTS.md']) {
      const r = await fetch(origin + '/' + route, { method: 'HEAD', signal: AbortSignal.timeout(15000) });
      assert.equal(r.status, 404, 'Non-public file excluded: ' + route);
    }
    console.log('Private evidence and signing files are not published.');
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
