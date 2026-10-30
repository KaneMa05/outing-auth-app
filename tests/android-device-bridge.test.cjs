'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),https=require('node:https'),tls=require('node:tls'),crypto=require('node:crypto');
const {privateIP,prepare}=require('../scripts/play-store/prepare-device-bridge.cjs');
test('device bridge accepts private IPv4 only, not URLs, public addresses or malformed octets',()=>{
 for(const value of ['10.0.0.1','172.16.0.1','172.31.255.255','192.168.0.1'])assert(privateIP(value));
 for(const value of ['127.0.0.1','8.8.8.8','172.32.0.1','192.168.0.','192.168.256.1','https://192.168.0.1','192.168.0.1/','::1'])assert(!privateIP(value),value);
});
test('generated device certificate and bundled pin form a real TLS connection without provider calls',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'android-bridge-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const host=Object.values(os.networkInterfaces()).flat().find(a=>a.family==='IPv4'&&!a.internal&&privateIP(a.address))?.address;
 if(!host){t.skip('No local private IPv4 adapter');return;}
 const result=prepare(host,{directory});assert.equal(result.url,`https://${host}:8788`);
 const configuration=JSON.parse(fs.readFileSync(path.join(directory,'bridge-device.json')));
 const certificate=fs.readFileSync(path.join(directory,'device-server.crt')),key=fs.readFileSync(path.join(directory,'device-server.key'));
 const x509=new crypto.X509Certificate(certificate);assert.equal(x509.checkIP(host),host);assert.equal(x509.raw.toString('base64'),configuration.certificate);
 assert.match(configuration.token,/^[a-f0-9]{64}$/);assert(Date.parse(x509.validTo)>Date.now()+86400000);assert(Date.parse(x509.validTo)<Date.now()+3*86400000);
 const server=https.createServer({key,cert:certificate},(_req,res)=>res.end('local-fixture'));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const response=await new Promise((resolve,reject)=>{
  https.get({hostname:'127.0.0.1',port:server.address().port,ca:certificate,checkServerIdentity:(_host,peer)=>tls.checkServerIdentity(host,peer)},res=>{let body='';res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve(body));}).on('error',reject);
 });assert.equal(response,'local-fixture');
 const before=configuration.token;prepare(host,{directory});assert.equal(JSON.parse(fs.readFileSync(path.join(directory,'bridge-device.json'))).token,before);
});
