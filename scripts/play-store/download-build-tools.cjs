// Download official build tools into the ignored workspace; no machine-wide installation.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),dir=path.join(root,'.tmp/play-tools/downloads');
async function download(url,file,expected){
  const response=await fetch(url);
  if(!response.ok)throw Error('Download failed: '+response.status+' '+new URL(url).hostname);
  const data=Buffer.from(await response.arrayBuffer());
  const sha=crypto.createHash('sha256').update(data).digest('hex');
  if(expected&&sha!==expected)throw Error('Checksum mismatch: '+file);
  await fs.writeFile(path.join(dir,file),data);
  console.log(file+': '+data.length+' bytes, SHA256 '+sha);
}
async function main(){
  await fs.mkdir(dir,{recursive:true});
  const response=await fetch('https://api.adoptium.net/v3/assets/latest/17/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse');
  if(!response.ok)throw Error('JDK metadata unavailable');
  const assets=await response.json();
  const pkg=assets[0].binary.package;
  await fs.writeFile(path.join(dir,'jdk-source.json'),JSON.stringify({version:assets[0].version,package:pkg},null,2));
  await Promise.all([
    download(pkg.link,'jdk17.zip',pkg.checksum),
    download('https://dl.google.com/android/repository/commandlinetools-win-15859902_latest.zip','android-command-tools.zip',
      '90ae805d20434428bffcb699c290860f19bb5f66a67e6b330067e3de801fb04a')
  ]);
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
