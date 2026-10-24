// Generate into an ignored folder; never uploads, publishes, or changes web app code.
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const {TwaManifest,TwaGenerator,ConsoleLog} = require(path.join(root,'.tmp/play-tools/node_modules/@bubblewrap/core'));
async function main(){
  const output=path.join(root,'.tmp/play-android');
  const manifest=TwaManifest.fromWebManifestJson(
    new URL('https://outing-auth-app.vercel.app/manifest.webmanifest'),
    JSON.parse(await fs.readFile(path.join(root,'manifest.webmanifest'),'utf8')));
  manifest.packageId='com.ronpark.study';
  manifest.name='론박스터디';
  manifest.launcherName='론박스터디';
  manifest.appVersionName='1.0.0';
  manifest.appVersionCode=1;
  manifest.minSdkVersion=24;
  manifest.startUrl='/index.html#home';
  manifest.orientation='default';
  manifest.enableNotifications=true;
  manifest.enableSiteSettingsShortcut=true;
  manifest.fallbackType='customtabs';
  manifest.signingKey={path:path.join(root,'.play-signing/upload.jks'),alias:'ronpark-study-upload'};
  manifest.generatorApp='bubblewrap-cli';
  // Capture uses the existing production icon, not a redesigned asset.
  const buildManifest=new TwaManifest({...manifest.toJson(),iconUrl:'http://127.0.0.1:4337/icon-512.png',
    maskableIconUrl:'http://127.0.0.1:4337/icon-512.png',webManifestUrl:undefined});
  const error=manifest.validate();if(error)throw Error(error);
  await fs.mkdir(output,{recursive:true});
  await new TwaGenerator().createTwaProject(output,buildManifest,new ConsoleLog('ronpark-android'));
  await manifest.saveToFile(path.join(output,'twa-manifest.json'));
  await fs.mkdir(path.join(output,'app/src/main/assets'),{recursive:true});
  await fs.copyFile(path.join(root,'manifest.webmanifest'),path.join(output,'app/src/main/assets/web-manifest.json'));
  console.log('Generated Android project: '+output);
  console.log('Package: '+manifest.packageId+'; version: '+manifest.appVersionName+'; minSdk: '+manifest.minSdkVersion);
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
