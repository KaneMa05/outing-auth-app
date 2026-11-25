const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const m=JSON.parse(fs.readFileSync('store-release-source.json'));
assert.equal(m.version,'1.1.0');assert.equal(m.buildNumber,6);
for(const f of m.files){const data=fs.readFileSync(f.path);assert.equal(crypto.createHash('sha256').update(data).digest('hex'),f.sha256,f.path);}
assert.equal(JSON.parse(fs.readFileSync('vercel.json')).git.deploymentEnabled,false);
console.log('PASS exact reviewed iOS source; version 1.1.0 build 6; website deployments disabled.');
