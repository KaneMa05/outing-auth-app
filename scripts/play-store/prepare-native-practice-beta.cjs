const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../..'),target=path.resolve(process.env.RONPARK_NATIVE_BUILD_DIR||path.join(root,'.tmp/native-practice-beta-android'));
if(fs.existsSync(target)&&!fs.existsSync(path.join(target,'.native-beta-build')))throw Error('Unrecognized build folder');
fs.mkdirSync(target,{recursive:true});fs.writeFileSync(path.join(target,'.native-beta-build'),'unsigned-production-and-isolated-review');
const write=(file,text)=>{const p=path.join(target,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,text);};
const tools=process.env.RONPARK_ANDROID_TOOLS||'C:/Users/W11/Desktop/Coding/Codex_Project/outing-auth-app/.tmp/play-tools';
const sdk=path.join(tools,'android-sdk'),java=path.join(tools,'jdk/jdk-17.0.20.1+1');
if(!fs.existsSync(path.join(sdk,'platforms/android-36/android.jar')))throw Error('Android 36 SDK required');
const library=path.resolve(target,'interview');
if(!library.startsWith(path.resolve(target)+path.sep)||fs.existsSync(library)&&fs.lstatSync(library).isSymbolicLink())throw Error('Invalid isolated library path');
if(fs.existsSync(library))fs.rmSync(library,{recursive:true,force:true});
fs.cpSync(path.join(root,'native/android/interview'),library,{recursive:true,filter:p=>!['build','.gradle'].includes(path.basename(p))});
write('settings.gradle',"pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }\ndependencyResolutionManagement { repositories { google(); mavenCentral() } }\nrootProject.name='RonparkNativePracticeBeta'\ninclude ':app', ':interview'\n");
write('build.gradle',"buildscript { repositories { google(); mavenCentral() }; dependencies { classpath 'com.android.tools.build:gradle:8.9.1' } }\n");
write('gradle.properties','android.useAndroidX=true\nandroid.overridePathCheck=true\norg.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8\n');
write('local.properties','sdk.dir='+sdk.replaceAll('\\','/')+'\n');
const base=process.env.RONPARK_ANDROID_TWA||'C:/Users/W11/Desktop/Coding/Codex_Project/outing-auth-app/.tmp/play-android';
let appGradle=fs.readFileSync(path.join(base,'app/build.gradle'),'utf8');
if(/storePassword|keyPassword|signingConfigs/.test(appGradle))throw Error('Use an unsigned TWA source template');
fs.cpSync(path.join(base,'app/src/main'),path.join(target,'app/src/main'),{recursive:true});
appGradle=appGradle.replace("launchUrl: '/index.html#home'","launchUrl: '/index.html?nativeInterview=1&nativePractice=1#home'")
 .replace('versionCode 1','versionCode 2').replace('versionName "1.0.0"','versionName "1.1.0-native-beta"')
 .replace('dependencies {',"dependencies {\n        implementation project(':interview')");
appGradle+=`\nandroid {
 signingConfigs { debug { storeFile file('../debug.keystore'); storePassword 'android'; keyAlias 'androiddebugkey'; keyPassword 'android' } }
 buildTypes { debug { applicationIdSuffix '.nativebeta'; versionNameSuffix '-review'; resValue 'string','launchUrl','https://outing-auth-app.vercel.app/index.html?nativeInterview=1&nativePractice=1&nativePracticePackage=com.ronpark.study.nativebeta#home' }; release { minifyEnabled false } }
}\n`;
write('app/build.gradle',appGradle);
// Review APK exercises production code and ordinary access; PC/test launchers,
// local bridge files, avatars and fixture Activities never enter either binary.
write('interview/src/empty/AndroidManifest.xml','<manifest xmlns:android="http://schemas.android.com/apk/res/android"/>');
write('interview/src/betaTest/java/com/ronpark/interview/NativePracticePolicyTest.java',fs.readFileSync(path.join(root,'native/android/interview/src/test/java/com/ronpark/interview/NativePracticePolicyTest.java'),'utf8'));
fs.appendFileSync(path.join(target,'interview/build.gradle'),`\nandroid { sourceSets { debug { java.setSrcDirs([]); res.setSrcDirs([]); assets.setSrcDirs([]); manifest.srcFile 'src/empty/AndroidManifest.xml' }; test { java.setSrcDirs(['src/betaTest/java']) } } }\n`);
const key=path.join(target,'debug.keystore');if(!fs.existsSync(key))cp.execFileSync(path.join(java,'bin/keytool.exe'),['-genkeypair','-keystore',key,'-storepass','android','-alias','androiddebugkey','-keypass','android','-keyalg','RSA','-keysize','2048','-validity','10000','-dname','CN=Local Native Review,O=Android,C=US'],{stdio:'pipe',windowsHide:true});
fs.writeFileSync(path.join(target,'review-info.json'),JSON.stringify({productionPackage:'com.ronpark.study',reviewPackage:'com.ronpark.study.nativebeta',existingTwaLauncherRetained:true,productionSigning:false,publishing:false,versionNeedsStoreConfirmation:true},null,2));
console.log('Prepared native practice review APK and unsigned Release project: '+target);
