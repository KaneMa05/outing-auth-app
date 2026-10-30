'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {createPersonalityStorage}=require('../lib/interview-personality-storage.cjs');
const {createDb}=require('./helpers/interview-db.cjs');
const {wav}=require('./interview-exam.test.cjs');
test('personality audio uses its own private bucket, immutable upload and bounded playback',async()=>{
 const bytes=wav(),calls=[],id='8d8a8f7e-684c-44f9-8bd6-65caf866a39a';
 const storage=createPersonalityStorage({url:'https://storage.example',key:'server-only-test',fetchImpl:async(url,options)=>{calls.push({url,options});if(url.includes('/object/sign/'))return {ok:true,json:async()=>({signedURL:'/object/sign/interview-personality/'+id+'/answer.wav?token=test'})};if(options.method==='POST')return {ok:false,status:409};return {ok:true,arrayBuffer:async()=>bytes};}});
 await storage.put(id,bytes);assert.equal(calls.length,2);assert.equal(calls[0].options.headers['x-upsert'],undefined);
 const url=await storage.signed(id,new Date(Date.now()+20000).toISOString());assert.ok(url.includes('/interview-personality/'));const seconds=JSON.parse(calls.at(-1).options.body).expiresIn;assert.ok(seconds>0&&seconds<=20);assert.ok(calls.every(c=>!c.url.includes('interview-job')));
 await assert.rejects(storage.signed(id,new Date(Date.now()-1).toISOString()),/not_found/);
});
test('personality bucket is created private and an existing public bucket is refused',async()=>{
 const file=fs.readdirSync('supabase/migrations').find(n=>n.endsWith('_interview_student_personality.sql'));
 for(const existingPublic of [false,true]){
  const {db}=await createDb();try{
   await db.exec('create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);');
   if(existingPublic)await db.exec("insert into storage.buckets(id,name,public) values('interview-personality','interview-personality',true)");
   if(existingPublic){await assert.rejects(db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8')),/unsafe_bucket_configuration/);await db.exec('rollback');}
   else{await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));const r=(await db.query("select * from storage.buckets where id='interview-personality'")).rows[0];assert.equal(r.public,false);assert.equal(Number(r.file_size_limit),3000000);}
  }finally{await db.close();}
 }
});
