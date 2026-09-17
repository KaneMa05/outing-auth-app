// Dry-run by default. Apply only after explicit release approval.
const {readBank}=require('./ox-import-data.cjs');
async function main() {
  const filename=process.argv.find(x=>x.startsWith('--source='))?.slice(9);
  if(!filename) throw Error('Usage: node scripts/import-ox.cjs --source=<questions.json> [--apply]');
  const data=readBank(filename);
  console.log(JSON.stringify({questions:data.questions.length,chapters:data.chapters.length,published:data.questions.filter(q=>q.status==='published').length,draft:data.questions.filter(q=>q.status==='draft').length}));
  if(!process.argv.includes('--apply')) {console.log('Dry run only. No database changes.');return;}
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url || !key) throw Error('Server environment configuration is required.');
  const target=new URL(url);if(target.protocol!=='https:' || target.username || target.password) throw Error('Invalid database target.');
  async function invoke(body) {
    const response=await fetch(`${url.replace(/\/$/,'')}/rest/v1/rpc/ox_service`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({p_action:'admin_import',p_actor:{type:'admin',id:'initial-import'},p_body:body})});
    if(!response.ok) throw Error(`OX import failed (${response.status}). Existing edits are preserved; rerun after fixing the issue.`);
  }
  await invoke({collections:data.collections,chapters:data.chapters,questions:[]});
  for(let i=0;i<data.questions.length;i+=100) await invoke({collections:[],chapters:[],questions:data.questions.slice(i,i+100)});
  console.log('Import complete. Existing questions and the feature enablement setting were preserved.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
