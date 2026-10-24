// Offline metric calculation. Does not call providers or upload recordings.
const fs=require('node:fs');
const {summarize}=require('../lib/interview-exam-metrics');
if(process.argv.length!==3){console.error('Usage: node scripts/evaluate-interview-exam.cjs <reviewed-samples.json>');process.exitCode=1;}
else{try{console.log(JSON.stringify(summarize(JSON.parse(fs.readFileSync(process.argv[2],'utf8'))),null,2));}catch(e){console.error(e.message);process.exitCode=1;}}
