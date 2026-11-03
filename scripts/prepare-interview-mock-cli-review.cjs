'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {detail}=require('../tests/interview-exam.test.cjs');
const p=require('../tests/helpers/interview-personality-fixture.cjs');
async function main(){const root=path.resolve('output/interview-mock-cli');await fs.mkdir(root,{recursive:true});
 const samples={job:{kind:'job',detail:detail(),transcriptSource:'operator',transcripts:['VHF를 사용하고 위치 정보를 교환합니다.','VHF를 사용하고 위치 정보를 교환합니다.']},
  personality:{kind:'personality',question:p.question,transcriptSource:'operator',transcripts:[p.transcript,p.transcript]},
  report:{kind:'report',run:{state:'completed',turns:[{kind:'initial',question:p.question.prompt,answer:p.transcript,complete:true}]}}};
 for(const [name,input] of Object.entries(samples))await fs.writeFile(path.join(root,name+'-input.json'),JSON.stringify(input,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({directory:root,scope:'fictional transcripts only; no real student data'}));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
