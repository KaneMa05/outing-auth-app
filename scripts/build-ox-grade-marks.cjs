// Bake the original pencil texture into transparent PNGs once, off the learner's device.
// Run with Node 22+ and Chrome (override CHROME_PATH where necessary).
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, '.tmp'), { recursive: true });
const profile = fs.mkdtempSync(path.join(root, '.tmp', 'ox-mark-build-'));
const strokes = {
  circle: 'M53 13 C37 5 19 14 13 31 C6 49 17 66 34 69 C52 73 67 59 69 42 C71 26 61 13 47 11 C35 8 23 15 18 24',
  slash: 'M19 65 C29 52 41 41 49 30 C54 23 58 19 62 15',
};
const markup = stroke => `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;background:transparent}svg{display:block;width:108px;height:108px;fill:none;stroke:#d93632;stroke-linecap:round;stroke-linejoin:round}
</style><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">
<defs><filter id="pencil" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB">
<feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="3" seed="12" result="grain"/>
<feColorMatrix in="grain" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1.8 -.35" result="pencil-grain"/>
<feComposite in="SourceGraphic" in2="pencil-grain" operator="in"/>
</filter></defs><g filter="url(#pencil)">
<path d="${stroke}" stroke-width="5.4" opacity=".85"/>
<path d="${stroke}" transform="translate(-1 .8)" stroke-width="2" opacity=".7"/>
<path d="${stroke}" transform="translate(1.2 -.6)" stroke-width="1.2" opacity=".65"/>
</g></svg>`;

(async () => {
  let browser, ws;
  try {
    browser = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'],
      { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    const endpoint = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(Error('Chrome startup timeout')), 15000);
      browser.on('error', error => { clearTimeout(timer); reject(error); });
      browser.stderr.on('data', chunk => {
        output += chunk;
        const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
    });
    const tabs = await (await fetch('http://' + new URL(endpoint).host + '/json')).json();
    ws = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
    let id = 0;
    const pending = new Map();
    ws.addEventListener('message', event => {
      const message = JSON.parse(event.data), request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id); clearTimeout(request.timer);
      message.error ? request.reject(Error(message.error.message)) : request.resolve(message.result);
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const next = ++id, timer = setTimeout(() => { pending.delete(next); reject(Error(method + ' timed out')); }, 15000);
      pending.set(next, { resolve, reject, timer });
      ws.send(JSON.stringify({ id: next, method, params }));
    });
    // Bake at the displayed size so averaging a high-density noise texture does
    // not erase the visible pencil grain when the image is downscaled.
    await send('Emulation.setDeviceMetricsOverride', { width: 108, height: 108, deviceScaleFactor: 1, mobile: false });
    await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    for (const [name, stroke] of Object.entries(strokes)) {
      await send('Page.navigate', { url: 'data:text/html;charset=utf-8,' + encodeURIComponent(markup(stroke)) });
      await send('Runtime.evaluate', { expression: 'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))', awaitPromise: true });
      const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 108, height: 108, scale: 1 } });
      const buffer = Buffer.from(shot.data, 'base64');
      if (buffer.readUInt32BE(16) !== 108 || buffer.readUInt32BE(20) !== 108) throw Error('Unexpected PNG dimensions');
      fs.writeFileSync(path.join(root, `ox-grade-${name}.png`), buffer);
      console.log(`ox-grade-${name}.png: 108 x 108, ${buffer.length} bytes`);
    }
  } finally { ws?.close(); browser?.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
