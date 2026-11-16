'use strict';
// Generates a Debug-only beta host. Does not build, test, install, sign for Play, or publish.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),output=path.join(root,'.tmp/android-beta');
if(process.argv.includes('--help')){
 console.log('Prepare Android beta: node scripts/play-store/prepare-android-beta.cjs\nSet ANDROID_SDK_ROOT (or ANDROID_HOME) and JAVA_HOME before a later build.\nGenerated project: .tmp/android-beta; Debug package: com.ronpark.study.nativepreview\nThis command only prepares local project files.');process.exit(0);
}
const sdk=process.env.ANDROID_SDK_ROOT||process.env.ANDROID_HOME||path.join(root,'.tmp/android-tools/sdk');
fs.mkdirSync(path.join(output,'app/src/main'),{recursive:true});
const write=(file,value)=>fs.writeFileSync(path.join(output,file),value);
write('settings.gradle',`pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }
dependencyResolutionManagement { repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS); repositories { google(); mavenCentral() } }
rootProject.name='RonparkBeta'
include ':app', ':interview'
project(':interview').projectDir=new File(settingsDir,'../../native/android/interview')
`);
write('build.gradle',`plugins {
 id 'com.android.application' version '8.11.1' apply false
 id 'com.android.library' version '8.11.1' apply false
}
project(':interview') { layout.buildDirectory.set(new File(rootProject.projectDir,'build/interview')) }
`);
write('app/build.gradle',`plugins { id 'com.android.application' }
android {
 namespace 'com.ronpark.betapreview'
 compileSdk 36
 defaultConfig { applicationId 'com.ronpark.study.nativepreview'; minSdk 24; targetSdk 36; versionCode 3; versionName '1.2.0-beta' }
 compileOptions { sourceCompatibility JavaVersion.VERSION_1_8; targetCompatibility JavaVersion.VERSION_1_8 }
}
dependencies { implementation project(':interview') }
androidComponents { beforeVariants(selector().withBuildType('release')) { variant -> variant.enable = false } }
`);
write('app/src/main/AndroidManifest.xml',`<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools">
 <application android:label="론박 면접 테스트" android:theme="@android:style/Theme.Material.Light.NoActionBar" android:allowBackup="false">
  <activity android:name="com.ronpark.interview.InterviewPreviewActivity" tools:node="remove" />
  <activity android:name="com.ronpark.interview.InterviewPracticeActivity" android:exported="true">
   <intent-filter><action android:name="android.intent.action.MAIN"/><category android:name="android.intent.category.LAUNCHER"/></intent-filter>
  </activity>
 </application>
</manifest>
`);
write('local.properties','sdk.dir='+path.resolve(sdk).replaceAll('\\','/')+'\n');
console.log('Prepared Debug-only Android beta project: '+output+'\nNo build, tests, device installation or deployment was started.');
