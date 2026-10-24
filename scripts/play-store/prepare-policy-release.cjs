const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const target = path.join(root, '.tmp/play-policy-release');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const targetRead = name => fs.readFileSync(path.join(target, name), 'utf8');
const write = (name, text) => fs.writeFileSync(path.join(target, name), text);
assert.ok(fs.existsSync(path.join(target, '.git')), 'Use the isolated production worktree');
for (const name of ['account-deletion.html', 'app-privacy.html', 'privacy-pages.css', '.well-known/assetlinks.json']) {
  fs.mkdirSync(path.dirname(path.join(target, name)), { recursive: true });
  fs.copyFileSync(path.join(root, name), path.join(target, name));
}
const linkStart = read('app.js').indexOf('    el("nav", { className: "student-policy-links"');
const linkEnd = read('app.js').indexOf('\n  ]);\n}', linkStart);
assert.ok(linkStart > 0 && linkEnd > linkStart);
const links = read('app.js').slice(linkStart, linkEnd);
const app = targetRead('app.js');
const anchor = '    renderHomeScreenInstallCard(),';
assert.equal(app.split(anchor).length, 2, 'Unique student My insertion point');
write('app.js', app.replace(anchor, `${anchor}\n${links}`));
const styles = read('styles.css');
const styleStart = styles.indexOf('.student-mypage .student-policy-links {');
const styleEnd = styles.indexOf('.student-push-settings-page {', styleStart);
assert.ok(styleStart > 0 && styleEnd > styleStart);
write('styles.css', targetRead('styles.css') + '\n' + styles.slice(styleStart, styleEnd));
for (const name of ['index.html', 'teacher.html']) {
  write(name, targetRead(name)
    .replace(/app\.js\?v=[^"]+/g, 'app.js?v=20261020-play-privacy')
    .replace(/styles\.css\?v=[^"]+/g, 'styles.css?v=20261020-play-privacy'));
}
let worker = targetRead('sw.js')
  .replace(/const CACHE_NAME = "[^"]+";/, 'const CACHE_NAME = "outing-auth-app-v487-play-privacy";')
  .replace(/app\.js\?v=[^"]+/g, 'app.js?v=20261020-play-privacy')
  .replace(/styles\.css\?v=[^"]+/g, 'styles.css?v=20261020-play-privacy')
  .replace('  "/index.html",', '  "/index.html",\n  "/account-deletion.html",\n  "/app-privacy.html",\n  "/privacy-pages.css",');
worker = worker.replace('  "/styles.css?v=20261020-play-privacy",', '');
write('sw.js', worker);
for (const name of ['.gitignore', '.vercelignore']) {
  const extra = name === '.gitignore'
    ? '\n# Private Google Play signing material\n/.play-signing/\n'
    : '\n# Local Play registration evidence and private signing material\nartifacts/\n.play-signing/\n';
  write(name, targetRead(name).trimEnd() + '\n' + extra);
}
console.log('Prepared policy-only release from the production worktree.');
