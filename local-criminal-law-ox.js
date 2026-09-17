const fs=require('fs');
const path=require('path');
const {readBank}=require('./scripts/ox-import-data.cjs');
let ready;
async function database() {
  if(!ready) ready=(async()=> {
    const {PGlite}=require(process.env.OX_PGLITE_MODULE || 'C:/Users/Public/Documents/ESTsoft/CreatorTemp/ox-db-tools/node_modules/@electric-sql/pglite');
    const db=new PGlite(path.join(__dirname,'.tmp/ox-learning-db'));
    const exists=await db.query("select to_regclass('public.ox_config') as found");
    if(!exists.rows[0].found) {
      await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create table public.students(id text primary key,is_active boolean not null default true);");
      await db.exec(fs.readFileSync(path.join(__dirname,'supabase/migrations/20260917124608_criminal_law_ox.sql'),'utf8'));
      const bank=readBank(process.env.OX_SOURCE_FILE || 'C:/Users/W11/Documents/형사법 오엑스/database/questions.json');
      await db.query('select public.ox_service($1,$2::jsonb,$3::jsonb)', ['admin_import',JSON.stringify({type:'admin',id:'local-import'}),JSON.stringify(bank)]);
    }
    await db.exec("alter table public.students add column if not exists name text not null default ''; alter table public.students add column if not exists class_name text not null default ''; alter table public.students add column if not exists student_category text not null default 'offline'; alter table public.students add column if not exists account_type text not null default 'student';");
    const members=await db.query("select to_regclass('public.ox_members') as found");
    if(!members.rows[0].found) await db.exec(fs.readFileSync(path.join(__dirname,'supabase/migrations/20260917124623_criminal_law_ox_members.sql'),'utf8'));
    return db;
  })().catch(error=>{ready=null;throw error;});
  return ready;
}
async function invoke(action,actor,body) {
  const db=await database();
  // The local admin searches the same roster as the local student preview.
  // Copy only display/access fields; never copy passwords or device credentials.
  const stateFile=path.join(__dirname,'.local-dev-state.json');
  const state=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,'utf8')):{};
  const students=(state?.students || []).filter(s=>s.id).map(s=>({id:String(s.id),name:s.name || '',class_name:s.className || s.class_name || '',student_category:s.studentCategory || s.student_category || 'offline',account_type:s.accountType || s.account_type || 'student',is_active:s.isActive!==false && s.is_active!==false}));
  await db.transaction(async tx=>{
    await tx.exec('update public.students set is_active=false');
    await tx.query("insert into public.students(id,name,class_name,student_category,account_type,is_active) select id,name,class_name,student_category,account_type,is_active from jsonb_to_recordset($1::jsonb) as s(id text,name text,class_name text,student_category text,account_type text,is_active boolean) on conflict(id) do update set name=excluded.name,class_name=excluded.class_name,student_category=excluded.student_category,account_type=excluded.account_type,is_active=excluded.is_active",[JSON.stringify(students)]);
  });
  const result=await db.query('select public.ox_service($1,$2::jsonb,$3::jsonb) as result',[action,JSON.stringify(actor),JSON.stringify(body)]);
  return result.rows[0].result;
}
module.exports={invoke,database};
