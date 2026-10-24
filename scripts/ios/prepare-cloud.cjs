'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const snapshotName='ios-cloud-build-20261021';
const branch='codex/ios-native-build-20261021';
const fixed=[
 '.github/workflows/ios-native-build.yml','AGENTS.md',
 'native/ios/App/project.yml','native/ios/App/Info.plist','native/ios/InterviewNative/Package.swift',
 'scripts/ios/install-tools.sh','scripts/ios/build-cloud.sh','scripts/ios/select-simulator.py'
];
function sourceFiles(sourceRoot=root){
 const files=[...fixed];
 function swiftFiles(folder){for(const entry of fs.readdirSync(path.join(sourceRoot,folder),{withFileTypes:true})){
  const relative=folder+'/'+entry.name;
  if(entry.isSymbolicLink())throw Error('Refusing source symlink: '+relative);
  if(entry.isDirectory())swiftFiles(relative);
  else if(entry.name.endsWith('.swift'))files.push(relative);
  else throw Error('Unexpected file in Swift source: '+relative);
 }}
 for(const folder of ['native/ios/App/Sources','native/ios/App/Tests','native/ios/InterviewNative/Sources'])swiftFiles(folder);
 for(const file of files){const resolved=path.resolve(sourceRoot,file);if(!resolved.startsWith(path.resolve(sourceRoot)+path.sep)||fs.lstatSync(resolved).isSymbolicLink())throw Error('Invalid source path');}
 return files.sort();
}
function prepare({sourceRoot=root,target=path.join(root,'.tmp',snapshotName)}={}){
 const files=sourceFiles(sourceRoot),marker=path.join(target,'.ios-source-manifest.json');
 if(fs.existsSync(target)&&!fs.existsSync(marker))throw Error('Refusing to overwrite an unrecognized directory');
 if(fs.existsSync(marker)&&JSON.parse(fs.readFileSync(marker,'utf8')).kind!=='ronpark-ios-cloud-source')throw Error('Invalid snapshot marker');
 fs.mkdirSync(target,{recursive:true});
 const entries=[];
 for(const file of files){const data=fs.readFileSync(path.join(sourceRoot,file));
  const destination=path.join(target,file);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,data);
  entries.push({path:file,sha256:crypto.createHash('sha256').update(data).digest('hex')});
 }
 fs.writeFileSync(path.join(target,'vercel.json'),JSON.stringify({$schema:'https://openapi.vercel.sh/vercel.json',git:{deploymentEnabled:false}},null,2)+'\n');
 fs.writeFileSync(path.join(target,'.gitignore'),'artifacts/\n.build/\nDerivedData/\n*.xcodeproj/\n*.xcworkspace/\n.env*\n*.p12\n*.p8\n*.mobileprovision\n');
 const report={kind:'ronpark-ios-cloud-source',branch,files:entries,sourceCount:entries.length,
  deploymentEnabled:false,remotePushPerformed:false,cloudBuildPerformed:false};
 fs.writeFileSync(marker,JSON.stringify(report,null,2)+'\n');
 return {target,...report};
}
if(require.main===module){const result=prepare();console.log(JSON.stringify({target:result.target,branch:result.branch,sourceCount:result.sourceCount,remotePushPerformed:false,cloudBuildPerformed:false},null,2));}
module.exports={prepare,sourceFiles,branch};
