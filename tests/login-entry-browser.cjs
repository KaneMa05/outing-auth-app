'use strict';
// Local browser fixtures only. Never contact Apple/Kakao or the production database.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const {chromium} = require('C:/Users/W11/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
  const root = process.cwd(), output = path.join(root, '.tmp/app-review-login-qa'); fs.mkdirSync(output, {recursive: true});
  let current = {ok: true, enabled: true, kakaoEnabled: true, appleEnabled: true, authenticated: false}, requests = [], sessionUnavailable = false;
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://local');
    if (url.pathname.startsWith('/api/')) {
      res.setHeader('Content-Type', 'application/json');
      if (req.method === 'GET') {
        if (sessionUnavailable && url.pathname === '/api/interview-auth') { res.statusCode = 503; return res.end('{"ok":false,"error":"interview_unavailable"}'); }
        return res.end(JSON.stringify(current));
      }
      let raw = ''; for await (const chunk of req) raw += chunk; const body = JSON.parse(raw); requests.push({path: url.pathname, body});
      if(url.pathname==='/api/interview-prep')return res.end(JSON.stringify({ok:true,allowed:false,member:{track:'공채',exam_number:'QA'}}));
      if (body.action === 'apply') {
        current = {...current, account: {ownerId: 'local-student', name: body.name, appleLinked: true}, application: {id: 'local-application', status: 'pending', name: body.name, track: body.track, exam_number: body.examNumber, access_product: body.accessProduct, revision: body.revision + 1}};
        return res.end('{"ok":true}');
      }
      if (body.action === 'logout') { current = {...current, authenticated: false, available: false, account: null}; return res.end('{"ok":true}'); }
      return res.end(JSON.stringify({ok: true, url: '/__qa/authorization?provider=' + (url.pathname.endsWith('apple') ? 'apple' : 'kakao')}));
    }
    if (url.pathname === '/index.html') {
      // Exercise the real launch head without student APIs or production data.
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      const head = fs.readFileSync(path.join(root, 'index.html'), 'utf8').split('</head>')[0];
      return res.end(head + '</head><body><div id="app-startup" role="status"><p data-startup-message>앱을 여는 중</p><button data-startup-retry hidden>다시 시도</button></div><main data-student-shell>필기반 시작 화면</main><script>if(!window.__interviewAppRedirecting)localStorage.setItem("qa-student-shown","1");window.__appStartup?.finish();</script></body></html>');
    }
    if (url.pathname.startsWith('/__qa/')) return res.end('<!doctype html><title>Local login route fixture</title>');
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
    for (const [platform, userAgent, appleVisible] of [
      ['android', 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36', false],
      ['ios', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', true],
    ]) {
      const device = await browser.newContext({userAgent, viewport: {width: 393, height: 852}});
      try {
        await device.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
        const mobile = await device.newPage();
        for (const entry of ['/interview', '/interview?app=1']) {
          await mobile.goto(base + entry);
          await mobile.locator('[data-kakao="login"]').waitFor();
          await mobile.locator('#app-startup').waitFor({state: 'hidden'});
          assert.equal(await mobile.locator('[data-apple]').count(), appleVisible ? 1 : 0, platform + ': Apple button follows the device');
          assert.equal(await mobile.locator('[data-kakao="login"]').isEnabled(), true);
          assert.equal(await mobile.locator('[data-student-entry]').isVisible(), true);
        }
        await mobile.screenshot({path: path.join(output, 'login-' + platform + '.png'), fullPage: true});
        await mobile.locator('[data-kakao="login"]').click(); await mobile.waitForURL('**/__qa/authorization?provider=kakao');
      } finally { await device.close(); }
    }
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
    const android = await browser.newContext({userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36', viewport: {width: 393, height: 852}});
    try {
      await android.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
      const myPage = await android.newPage();
      await myPage.goto(base + '/interview?app=1#interview-prep?tab=my');
      await myPage.locator('.ip-app-profile').waitFor();
      await myPage.locator('#app-startup').waitFor({state: 'hidden'});
      assert.equal(await myPage.locator('[data-apple]').count(), 0, 'Android must also hide Apple account linking in the header and My tab');
      assert.equal(await myPage.locator('[data-app-logout]').isVisible(), true);
      await myPage.screenshot({path: path.join(output, 'my-android.png'), fullPage: true});
    } finally { await android.close(); }
    const installed = await browser.newContext({userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148', viewport: {width: 393, height: 852}});
    try {
      // Match the installed iOS wrapper; a new tab drops sessionStorage like a cold launch.
      await installed.addInitScript(() => Object.defineProperty(navigator, 'standalone', {value: true}));
      await installed.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
      let launch = await installed.newPage();
      await launch.goto(base + '/interview?app=1#interview-prep?tab=my');
      await launch.locator('[data-app-logout]').waitFor();
      assert.equal(await launch.evaluate(() => localStorage.getItem('outing-interview-web-app')), '1');
      assert.equal(await launch.locator('meta[name="theme-color"]').getAttribute('content'), '#f2f5f7');
      await launch.close(); launch = await installed.newPage();
      await launch.goto(base + '/index.html#home');
      await launch.waitForURL('**/interview?app=1');
      await launch.locator('.ip-app-shell').waitFor();
      assert.equal(await launch.evaluate(() => localStorage.getItem('qa-student-shown')), null, 'Cold launch must redirect before rendering the written-course shell');
      // Logout clears authentication, but the user's selected app stays the interview app.
      await launch.goto(base + '/interview?app=1#interview-prep?tab=my');
      await launch.locator('[data-app-logout]').click();
      await launch.locator('[data-kakao="login"]').waitFor();
      assert.equal(await launch.evaluate(() => localStorage.getItem('outing-interview-web-app')), '1');
      await launch.close(); launch = await installed.newPage();
      await launch.goto(base + '/index.html#home');
      await launch.waitForURL('**/interview?app=1');
      await launch.locator('[data-kakao="login"]').waitFor();
      await launch.locator('#app-startup').waitFor({state: 'hidden'});
      assert.equal(await launch.locator('meta[name="theme-color"]').getAttribute('content'), '#050f1c');
      assert.equal(await launch.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(5, 15, 28)');
      assert.equal(await launch.evaluate(() => localStorage.getItem('qa-student-shown')), null, 'Expired sessions must show interview login instead of the written-course app');
      sessionUnavailable = true;
      await launch.close(); launch = await installed.newPage();
      await launch.goto(base + '/index.html#home');
      await launch.waitForURL('**/interview?app=1');
      await launch.locator('.ip-coast-retry').waitFor();
      assert.equal(await launch.evaluate(() => localStorage.getItem('outing-interview-web-app')), '1');
      assert.equal(await launch.evaluate(() => localStorage.getItem('qa-student-shown')), null, 'Network failures must stay in the selected app');
      sessionUnavailable = false;
      await launch.locator('.ip-coast-retry').click();
      await launch.locator('[data-kakao="login"]:enabled').waitFor();
      await launch.locator('[data-student-entry]').click();
      await launch.locator('[data-student-shell]').waitFor({state: 'visible'});
      assert.equal(await launch.evaluate(() => localStorage.getItem('outing-interview-web-app')), null);
      await launch.close(); launch = await installed.newPage();
      await launch.goto(base + '/index.html#home');
      await launch.locator('[data-student-shell]').waitFor({state: 'visible'});
      assert(launch.url().includes('/index.html'), 'Explicit written-course choice must persist on the next launch');
    } finally { sessionUnavailable = false; await installed.close(); }
    assert.deepEqual(errors, []);
    console.log('PASS local browser login routes: remembered cold launches, logout/expiry/network retry, explicit student switch, matching page themes, Android Apple hiding, iOS/desktop Apple, enrollment and account linking. Screenshots: .tmp/app-review-login-qa');
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
