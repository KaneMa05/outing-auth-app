// Render the standalone design and verify its preview controls in an isolated headless browser.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const output = path.join(__dirname, 'images');
const browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=9359',
  `--user-data-dir=${path.resolve(__dirname, '../../tmp/hair-preview-qa')}`, 'about:blank'
], { windowsHide: true, stdio: 'ignore' });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
(async () => {
  fs.mkdirSync(output, { recursive: true });
  let tabs;
  for (let n = 0; n < 60; n++) {
    try { tabs = await (await fetch('http://127.0.0.1:9359/json')).json(); break; }
    catch { await delay(100); }
  }
  if (!tabs) throw new Error('Headless renderer did not start');
  socket = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const task = pending.get(message.id);
    pending.delete(message.id);
    message.error ? task.reject(message.error) : task.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const next = ++id;
    pending.set(next, { resolve, reject });
    socket.send(JSON.stringify({ id: next, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await send('Page.enable');
  for (const width of [1440, 390, 320]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1100, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: pathToFileURL(path.join(__dirname, 'index.html')).href });
    for (let n = 0; n < 60; n++) {
      if (await evaluate('document.readyState === "complete" && !!document.querySelector("#hero .scene")')) break;
      await delay(50);
    }
    await evaluate('document.fonts.ready.then(() => true)');
    if (await evaluate('document.documentElement.scrollWidth > innerWidth')) throw new Error(`Horizontal overflow at ${width}px`);
    const failures = await evaluate(`(() => {
      const errors = [];
      for (let n = 0; n < 5; n++) {
        const button = document.querySelector('[data-style="' + n + '"]');
        button.click();
        if (button.getAttribute('aria-pressed') !== 'true') errors.push('selection ' + n);
        const expected = button.querySelector('h3').textContent;
        if (document.querySelector('#selected-name').textContent !== expected || document.querySelector('#after-label').textContent !== expected) errors.push('label ' + n);
        const hair = document.querySelector('#hero .hair-design path').getAttribute('d');
        if (!Array.from(document.querySelectorAll('#seats .hair-design path:first-child, #after .hair-design path:first-child')).every(p => p.getAttribute('d') === hair)) errors.push('hair consistency ' + n);
      }
      for (let n = 0; n < 4; n++) {
        const button = document.querySelector('[data-color="' + n + '"]');
        button.click();
        if (button.getAttribute('aria-pressed') !== 'true') errors.push('outfit ' + n);
        const fills = new Set(Array.from(document.querySelectorAll('.study-cafe-avatar-body')).map(el => getComputedStyle(el).backgroundColor));
        if (fills.size !== 1) errors.push('outfit consistency ' + n);
      }
      document.querySelector('[data-style="2"]').click();
      document.querySelector('[data-color="0"]').click();
      return errors;
    })()`);
    if (failures.length) throw new Error(failures.join(', '));
    const height = await evaluate('document.documentElement.scrollHeight');
    const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height, scale: 1 } });
    fs.writeFileSync(path.join(output, width === 1440 ? 'desktop.png' : width === 390 ? 'mobile.png' : 'mobile-small.png'), Buffer.from(data, 'base64'));
    console.log(`${width}px: no overflow; 5 hairstyles and 4 outfit controls passed; screenshot ${width} x ${height}`);
  }
  await send('Browser.close');
  socket.close();
})().catch(error => {
  console.error(error);
  socket?.close();
  browser.kill();
  process.exitCode = 1;
});
