'use strict';
// Generate a short-lived certificate pinned only by the local Debug app.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),cp=require('node:child_process');
const dir=path.resolve(__dirname,'../../.tmp/interview-free-api');
fs.mkdirSync(dir,{recursive:true});
const privateIP=value=>/^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(value);
const addresses=Object.values(os.networkInterfaces()).flat().filter(a=>a.family==='IPv4'&&!a.internal&&privateIP(a.address));
const host=process.argv[2]||addresses[0]?.address;
if(!addresses.some(a=>a.address===host))throw Error('Choose a private IPv4 address assigned to this Mac');
let loopback;try{loopback=JSON.parse(fs.readFileSync(path.join(dir,'bridge.json'),'utf8'));}catch{}
if(!loopback?.token?.match(/^[a-f0-9]{64}$/)){loopback={url:'http://127.0.0.1:8787',token:crypto.randomBytes(32).toString('hex')};fs.writeFileSync(path.join(dir,'bridge.json'),JSON.stringify(loopback),{mode:0o600});}
const key=path.join(dir,'device-server.key'),cert=path.join(dir,'device-server.crt'),config=path.join(dir,'device-tls.cnf');
fs.writeFileSync(config,`[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=Ronpark Local Debug Bridge\n[ext]\nsubjectAltName=IP:${host}\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,digitalSignature,keyEncipherment,keyCertSign\nextendedKeyUsage=serverAuth\n`);
cp.execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','2','-sha256','-keyout',key,'-out',cert,'-config',config],{stdio:'ignore'});
fs.chmodSync(key,0o600);
const der=cp.execFileSync('openssl',['x509','-in',cert,'-outform','DER']);
fs.writeFileSync(path.join(dir,'bridge-device.json'),JSON.stringify({url:`https://${host}:8788`,token:loopback.token,certificate:der.toString('base64')}),{mode:0o600});
console.log(`Device bridge prepared for https://${host}:8788; certificate expires in two days. No secrets logged.`);
