'use strict';
// Local Debug configuration only. No provider call, app upload, or production mutation.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const privateIP=value=>{if(!/^[0-9]{1,3}(\.[0-9]{1,3}){3}$/.test(value))return false;const a=value.split('.').map(Number);return a.every(n=>n>=0&&n<=255)&&(a[0]===10||a[0]===192&&a[1]===168||a[0]===172&&a[1]>=16&&a[1]<=31);};
function prepare(host,options={}){
 const dir=options.directory||path.join(root,'.tmp/interview-free-api');
 const addresses=Object.values(os.networkInterfaces()).flat().filter(a=>a.family==='IPv4'&&!a.internal&&privateIP(a.address));
 host=host||addresses[0]?.address;if(!addresses.some(a=>a.address===host))throw Error('Choose a private IPv4 address assigned to this PC.');
 fs.mkdirSync(dir,{recursive:true});let loopback;try{loopback=JSON.parse(fs.readFileSync(path.join(dir,'bridge.json'),'utf8'));}catch{}
 if(!loopback?.token?.match(/^[a-f0-9]{64}$/)){loopback={url:'http://127.0.0.1:8787',token:crypto.randomBytes(32).toString('hex')};fs.writeFileSync(path.join(dir,'bridge.json'),JSON.stringify(loopback),{mode:0o600});}
 const openssl=options.openssl||process.env.OPENSSL_PATH||(process.platform==='win32'&&fs.existsSync('C:/Program Files/Git/usr/bin/openssl.exe')?'C:/Program Files/Git/usr/bin/openssl.exe':'openssl');
 const key=path.join(dir,'device-server.key'),cert=path.join(dir,'device-server.crt'),config=path.join(dir,'device-tls.cnf');
 fs.writeFileSync(config,`[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=Ronpark Local Debug Bridge\n[ext]\nsubjectAltName=IP:${host}\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,digitalSignature,keyEncipherment,keyCertSign\nextendedKeyUsage=serverAuth\n`);
 cp.execFileSync(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-days','2','-sha256','-keyout',key,'-out',cert,'-config',config],{stdio:'ignore'});
 const der=cp.execFileSync(openssl,['x509','-in',cert,'-outform','DER']);
 fs.writeFileSync(path.join(dir,'bridge-device.json'),JSON.stringify({url:`https://${host}:8788`,token:loopback.token,certificate:der.toString('base64')}),{mode:0o600});
 return {url:`https://${host}:8788`,expiresInDays:2};
}
if(require.main===module)console.log(JSON.stringify(prepare(process.argv[2])));
module.exports={privateIP,prepare};
