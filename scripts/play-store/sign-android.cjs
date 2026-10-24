// Local-only signing. Private material stays in the git-ignored .play-signing directory.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const java = path.join(root,'.tmp/play-tools/jdk/jdk-17.0.20.1+1/bin');
const signing = path.join(root,'.play-signing');
const output = path.join(root,'artifacts/play-console');
const alias = 'ronpark-study-upload';
function run(exe,args,env={}) {
  const r=spawnSync(exe,args,{encoding:'utf8',env:{...process.env,...env},windowsHide:true});
  if(r.status!==0) throw Error(`${path.basename(exe)} failed: ${r.stderr||r.error||r.stdout}`);
  return r.stdout;
}
async function main(){
  await fs.mkdir(signing,{recursive:true});
  await fs.mkdir(output,{recursive:true});
  const secretFile=path.join(signing,'upload-password.txt');
  let secret;
  try {secret=(await fs.readFile(secretFile,'utf8')).trim();}
  catch(e){if(e.code!=='ENOENT')throw e;secret=crypto.randomBytes(32).toString('base64url');await fs.writeFile(secretFile,secret+'\n',{flag:'wx'});}
  const env={PLAY_UPLOAD_PASSWORD:secret};
  const key=path.join(signing,'upload.jks');
  try{await fs.access(key);}catch{
    run(path.join(java,'keytool.exe'),['-genkeypair','-keystore',key,'-storetype','JKS',
      '-alias',alias,'-keyalg','RSA','-keysize','3072','-validity','10000',
      '-dname','CN=Ronpark Study Upload, O=Ronpark, C=KR',
      '-storepass:env','PLAY_UPLOAD_PASSWORD','-keypass:env','PLAY_UPLOAD_PASSWORD'],env);
  }
  const aab=path.join(output,'ronpark-study-1.0.0.aab');
  await fs.copyFile(path.join(root,'.tmp/play-android/app/build/outputs/bundle/release/app-release.aab'),aab);
  run(path.join(java,'jarsigner.exe'),['-keystore',key,'-storepass:env','PLAY_UPLOAD_PASSWORD',
    '-keypass:env','PLAY_UPLOAD_PASSWORD','-sigalg','SHA256withRSA','-digestalg','SHA-256',aab,alias],env);
  const verification=run(path.join(java,'jarsigner.exe'),['-verify',aab]);
  if(!verification.includes('jar verified'))throw Error('AAB signature verification did not succeed');
  const cert=path.join(output,'upload-certificate.pem');
  run(path.join(java,'keytool.exe'),['-exportcert','-rfc','-keystore',key,'-alias',alias,
    '-storepass:env','PLAY_UPLOAD_PASSWORD','-file',cert],env);
  const x509=new crypto.X509Certificate(await fs.readFile(cert));
  const apk=path.join(output,'ronpark-study-1.0.0.apk');
  const apksigner=path.join(root,'.tmp/play-tools/android-sdk/build-tools/36.0.0/lib/apksigner.jar');
  run(path.join(java,'java.exe'),['-jar',apksigner,'sign','--ks',key,
    '--ks-key-alias',alias,'--ks-pass','env:PLAY_UPLOAD_PASSWORD',
    '--key-pass','env:PLAY_UPLOAD_PASSWORD','--out',apk,
    path.join(root,'.tmp/play-android/app/build/outputs/apk/release/app-release-unsigned.apk')],env);
  run(path.join(java,'java.exe'),['-jar',apksigner,'verify','--verbose',apk]);
  const metadata={packageName:'com.ronpark.study',versionName:'1.0.0',versionCode:1,
    minSdk:24,targetSdk:36,uploadCertificateSha256:x509.fingerprint256,
    aabSha256:crypto.createHash('sha256').update(await fs.readFile(aab)).digest('hex'),
    signatureVerified:true,apkSignatureVerified:true,
    important:'This is the upload certificate. Production assetlinks.json must use the Google Play app signing certificate.',
    deviceTested:false,uploadedToPlay:false};
  await fs.writeFile(path.join(output,'android-build.json'),JSON.stringify(metadata,null,2)+'\n');
  console.log(JSON.stringify(metadata,null,2));
  console.log('Private signing key and password saved under .play-signing. Back up securely.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
