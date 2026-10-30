'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const option=(name,fallback)=>process.argv.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3)||fallback;
const base=path.resolve(option('base',path.join(root,'.tmp/play-android'))),target=path.resolve(option('target',path.join(root,'.tmp/play-android-native')));
if(!fs.existsSync(path.join(base,'app/src/main/AndroidManifest.xml')))throw Error('Generate the existing TWA Android project first.');
fs.cpSync(base,target,{recursive:true,filter:p=>!['build','.gradle','.git'].includes(path.basename(p))});
fs.cpSync(path.join(root,'native/android/interview'),path.join(target,'interview'),{recursive:true});
// Optional local USB test bridge. Contains a loopback token, never a Gemini API key.
const localBridge=path.join(root,'.tmp/interview-free-api',process.argv.includes('--device-bridge')?'bridge-device.json':'bridge.json');
if(process.argv.includes('--device-bridge')&&!fs.existsSync(localBridge))throw Error('Prepare the local Wi-Fi device bridge first.');
if(fs.existsSync(localBridge)){
 const assets=path.join(target,'interview/src/debug/assets');fs.mkdirSync(assets,{recursive:true});
 fs.copyFileSync(localBridge,path.join(assets,'interview-local-bridge.json'));
}
const edit=(p,fn)=>{const file=path.join(target,p);fs.writeFileSync(file,fn(fs.readFileSync(file,'utf8')));};
edit('settings.gradle',s=>s+"\ninclude ':interview'\n");
edit('build.gradle',s=>s.replaceAll('jcenter()','mavenCentral()'));
edit('app/build.gradle',s=>s.replace("launchUrl: '/index.html#home'","launchUrl: '/index.html?nativeInterview=1#home'")
 .replace('versionCode 1','versionCode 2').replace("versionName \"1.0.0\"","versionName \"1.1.0\"")
 .replace('buildTypes {',"signingConfigs { debug { storeFile file('../debug.keystore') } }\n    buildTypes {\n        debug { applicationIdSuffix '.nativepreview'; versionNameSuffix '-native-preview' }")
 .replace('dependencies {',"dependencies {\n    implementation project(':interview')"));
fs.writeFileSync(path.join(target,'local.properties'),'sdk.dir='+path.resolve(option('sdk',path.join(root,'.tmp/play-tools/android-sdk'))).replaceAll('\\','/')+'\n');
// A local debug-only key; never use the Play upload/release keystore for previews.
const debugKey=path.join(target,'debug.keystore');
const existingDebugKey=option('debug-key','');
if(existingDebugKey){if(!fs.existsSync(existingDebugKey))throw Error('The requested existing Debug key is missing.');if(path.resolve(existingDebugKey)!==path.resolve(debugKey))fs.copyFileSync(existingDebugKey,debugKey);}
if(!fs.existsSync(debugKey)){
 const javaHome=process.env.JAVA_HOME||path.join(root,'.tmp/play-tools/jdk/jdk-17.0.20.1+1');
 require('node:child_process').execFileSync(path.join(javaHome,'bin/keytool.exe'),['-genkeypair','-keystore',debugKey,'-storepass','android','-alias','androiddebugkey','-keypass','android','-keyalg','RSA','-keysize','2048','-validity','10000','-dname','CN=Android Debug,O=Android,C=US'],{stdio:'pipe'});
}
console.log('Prepared isolated hybrid Android project: '+target+'\nExisting TWA launcher retained; native interview Activity added. Debug key only; no release signing or publishing.');
