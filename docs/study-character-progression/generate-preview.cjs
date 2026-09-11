// Design artifacts only. Uses the existing CSS character without loading the app.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
function section(start, end) {
  const first = source.indexOf('\n' + start);
  const last = source.indexOf('\n' + end, first);
  if (first < 0 || last <= first) throw new Error('Missing native CSS section: ' + start);
  return source.slice(first, last);
}
const native = section('.study-cafe-avatar {', '.study-cafe-avatar.shop-outfit-coast-guard-uniform')
  + section('.study-cafe-desk {', '.study-cafe-empty-plus {');
fs.writeFileSync(path.join(__dirname, 'character-base.css'), '/* Existing character geometry copied from styles.css for a standalone design preview. */\n' + native);
console.log('Character CSS snapshot written.');
