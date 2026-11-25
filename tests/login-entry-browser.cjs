'use strict';
// Local browser fixtures only. Never contact Apple/Kakao or the production database.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const {chromium} = require('C:/Users/W11/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
  const root = process.cwd(), output = path.join(root, '.tmp/app-review-login-qa'); fs.mkdirSync(output, {recursive: true});
  let current = {ok: true, enabled: true, kakaoEnabled: true, appleEnabled: true, authenticated: false}, requests = [];
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://local');
    if (url.pathname.startsWith('/api/')) {
      res.setHeader('Content-Type', 'application/json');
      if (req.method === 'GET') return res.end(JSON.stringify(current));
      let raw = ''; for await (const chunk of req) raw += chunk; const body = JSON.parse(raw); requests.push({path: url.pathname, body});
      if(url.pathname==='/api/interview-prep')return res.end(JSON.stringify({ok:true,allowed:false,member:{track:'공채',exam_number:'QA'}}));
      if (body.action === 'apply') {
        current = {...current, account: {ownerId: 'local-student', name: body.name, appleLinked: true}, application: {id: 'local-application', status: 'pending', name: body.name, track: body.track, exam_number: body.examNumber, access_product: body.accessProduct, revision: body.revision + 1}};
        return res.end('{"ok":true}');
      }
      return res.end(JSON.stringify({ok: true, url: '/__qa/authorization?provider=' + (url.pathname.endsWith('apple') ? 'apple' : 'kakao')}));
    }
    if (url.pathname.startsWith('/__qa/') || url.pathname === '/index.html') return res.end('<!doctype html><title>Local login route fixture</title>');
    const file = path.resolve(root, '.' + (url.pathname === '/interview' ? '/interview.html' : url.pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.statusCode = 404; return res.end(); }
    const ext = path.extname(file); res.setHeader('Content-Type', ({'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2'})[ext] || 'application/octet-stream'); res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); let browser;
  try {
    browser = await chromium.launch({headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
    const base = 'http://127.0.0.1:' + server.address().port, page = await browser.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    for (const [width, height] of [[440, 956], [375, 667], [320, 568], [1280, 900]]) {
      await page.setViewportSize({width, height}); await page.goto(base + '/interview?app=1');
      await page.locator('[data-apple="login"]').waitFor();
      await page.locator('#app-startup').waitFor({state: 'hidden'});
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      const image = page.locator('.ip-coast-apple img'); assert(await image.evaluate(n => n.complete && n.naturalWidth > 0));
      const apple = await page.locator('[data-apple="login"]').boundingBox();
      assert(apple.y + apple.height <= height, 'Both social buttons must be visible at ' + width + 'x' + height);
      await page.screenshot({path: path.join(output, 'login-' + width + '.png'), fullPage: true});
    }
    await page.locator('[data-apple="login"]').click(); await page.waitForURL('**/__qa/authorization?provider=apple');
    assert.equal(requests.at(-1).body.intent, 'login');
    await page.goto(base + '/interview?app=1'); await page.locator('[data-kakao]').click(); await page.waitForURL('**/__qa/authorization?provider=kakao');
    current = {...current, authenticated: true, available: false, account: {ownerId: null}};
    for (const [width, height] of [[320, 568], [375, 667], [1280, 900]]) {
      await page.setViewportSize({width, height}); await page.goto(base + '/interview?app=1');
      await page.getByRole('heading', {name: '면접반 수강 정보 확인', exact: true}).waitFor();
      await page.locator('#app-startup').waitFor({state: 'hidden'});
      const form = page.locator('[data-application-form]');
      assert.equal(await form.locator('input, select').first().getAttribute('name'), 'accessProduct');
      assert.equal(await page.locator('[name=studentId], [name=password], [data-link-student-form]').count(), 0);
      assert.equal(await page.getByText('등록번호가 없나요?', {exact: true}).count(), 0);
      assert.equal(await page.getByRole('button', {name: '다른 계정으로 로그인', exact: true}).count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      const product = await form.locator('[name=accessProduct]').boundingBox();
      assert(product.y + product.height <= height, 'Course selection must appear immediately after login');
      await page.screenshot({path: path.join(output, 'enrollment-' + width + '.png'), fullPage: true});
    }
    const form = page.locator('[data-application-form]');
    await form.getByLabel('수강 상품').selectOption('aptitude_only');
    await form.getByLabel('이름', {exact: true}).fill('로컬 신청자');
    await form.locator('[name=track]').selectOption({label: '공채'});
    await form.getByLabel('수험번호', {exact: true}).fill('QA-001');
    await form.getByRole('button', {name: '수강 등록 신청', exact: true}).click();
    await page.getByRole('heading', {name: '수강 신청을 확인하고 있습니다.', exact: true}).waitFor();
    assert.deepEqual(requests.at(-1).body, {action: 'apply', accessProduct: 'aptitude_only', name: '로컬 신청자', track: '공채', examNumber: 'QA-001', revision: 0});
    assert.equal(requests.some(request => request.body.action === 'legacy_login'), false);
    current = {...current, member: {enabled: true}};
    await page.getByRole('button', {name: '등록 상태 확인', exact: true}).click();
    await page.getByText('면접반 운영 준비 중입니다.', {exact: true}).waitFor();
    await page.locator('[data-student-entry]').click(); await page.waitForURL('**/index.html?entry=student#home');
    assert.equal(await page.evaluate(() => localStorage.getItem('outing-interview-web-app')), null);
    current = {...current, authenticated: true, available: true, account: {ownerId:'local-student', name:'로컬 수강생', appleLinked:false,kakaoLinked:true}};
    await page.setViewportSize({width:375,height:667});
    await page.goto(base+'/interview?app=1#interview-prep?tab=my');
    await page.locator('.ip-app-shell [data-apple="link"]').waitFor();
    await page.locator('#app-startup').waitFor({state:'hidden'});
    await page.screenshot({path:path.join(output,'my-apple-link.png'),fullPage:true});
    await page.locator('.ip-app-shell [data-apple="link"]').click();await page.waitForURL('**/__qa/authorization?provider=apple');
    assert.equal(requests.at(-1).body.intent,'link');
    assert.deepEqual(errors, []);
    console.log('PASS local browser login routes: mobile/desktop social login, course-first enrollment without registration credentials, application submission, registered status, My account linking and student return. Screenshots: .tmp/app-review-login-qa');
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
