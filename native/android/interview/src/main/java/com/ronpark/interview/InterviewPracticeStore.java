package com.ronpark.interview;
import android.content.Context;
import android.util.AtomicFile;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

/** Account-scoped archive queue. Unowned legacy demo recordings are never reassigned. */
final class InterviewPracticeStore {
    private static final Object LOCK=new Object(); final File root; final String account;
    InterviewPracticeStore(Context c,String account){this.account=account;root=new File(c.getNoBackupFilesDir(),"interview-accounts/"+hash(account.getBytes(StandardCharsets.UTF_8)));if(!root.isDirectory()&&!root.mkdirs())throw new IllegalStateException("storage_unavailable");}
    File folder(String id){if(id==null||!id.matches("[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}"))throw new IllegalArgumentException();return new File(root,id);}
    File audio(String id,int number){if(number<1||number>20)throw new IllegalArgumentException();return new File(folder(id),"answer-"+number+".wav");}
    void save(JSONObject record)throws Exception {synchronized(LOCK){File dir=folder(record.getString("runId"));if(!dir.isDirectory()&&!dir.mkdirs())throw new IOException();AtomicFile file=new AtomicFile(new File(dir,"record.json"));FileOutputStream stream=null;try{stream=file.startWrite();stream.write(record.toString().getBytes(StandardCharsets.UTF_8));file.finishWrite(stream);}catch(Exception e){if(stream!=null)file.failWrite(stream);throw e;}}}
    JSONObject load(String id)throws Exception{synchronized(LOCK){try(InputStream in=new AtomicFile(new File(folder(id),"record.json")).openRead();ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1)out.write(b,0,n);return new JSONObject(out.toString("UTF-8"));}}}
    List<JSONObject> list(){synchronized(LOCK){List<JSONObject> out=new ArrayList<>();File[] dirs=root.listFiles();if(dirs!=null)for(File dir:dirs)try{out.add(load(dir.getName()));}catch(Exception ignored){}Collections.sort(out,(a,b)->b.optString("recordedAt").compareTo(a.optString("recordedAt")));return out;}}
    void mark(String id,String fingerprint)throws Exception{synchronized(LOCK){JSONObject latest=load(id);if(fingerprint(latest).equals(fingerprint)){latest.put("_archiveFingerprint",fingerprint);save(latest);}}}
    boolean synced(JSONObject record){return fingerprint(record).equals(record.optString("_archiveFingerprint"));}
    void delete(String id)throws Exception{synchronized(LOCK){File dir=folder(id);File[] files=dir.listFiles();if(files!=null)for(File f:files)if(!f.delete())throw new IOException();if(!dir.delete())throw new IOException();}}
    static String hash(byte[] data){try{return hex(MessageDigest.getInstance("SHA-256").digest(data));}catch(Exception e){throw new IllegalStateException(e);}}
    static String hash(File file)throws Exception{MessageDigest hash=MessageDigest.getInstance("SHA-256");try(InputStream in=new FileInputStream(file)){byte[] b=new byte[65536];int n;while((n=in.read(b))!=-1)hash.update(b,0,n);}return hex(hash.digest());}
    private static String hex(byte[] bytes){StringBuilder out=new StringBuilder();for(byte b:bytes)out.append(String.format(Locale.ROOT,"%02x",b&255));return out.toString();}
    static String canonical(Object value){if(value instanceof JSONObject){JSONObject obj=(JSONObject)value;List<String> keys=new ArrayList<>();Iterator<String> it=obj.keys();while(it.hasNext()){String key=it.next();if(!key.equals("_archiveFingerprint"))keys.add(key);}Collections.sort(keys);StringBuilder out=new StringBuilder("{");for(String key:keys){if(out.length()>1)out.append(',');out.append(JSONObject.quote(key)).append(':').append(canonical(obj.opt(key)));}return out.append('}').toString();}if(value instanceof JSONArray){JSONArray a=(JSONArray)value;StringBuilder out=new StringBuilder("[");for(int i=0;i<a.length();i++){if(i>0)out.append(',');out.append(canonical(a.opt(i)));}return out.append(']').toString();}return value instanceof String?JSONObject.quote((String)value):String.valueOf(value);}
    static String fingerprint(JSONObject record){return hash(("aac32-v1:"+canonical(record)).getBytes(StandardCharsets.UTF_8));}
}
