package com.ronpark.interview;

import android.content.Context;
import android.util.AtomicFile;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** App-private practice recordings; no cloud upload or API credentials. */
final class InterviewLocalStore {
    private final File root;
    InterviewLocalStore(Context context){root=new File(context.getNoBackupFilesDir(),"interview-practice");root.mkdirs();}
    String create(){String id=UUID.randomUUID().toString();folder(id).mkdirs();return id;}
    private File folder(String id){if(id==null||!id.matches("[a-f0-9-]{36}"))throw new IllegalArgumentException();return new File(root,id);}
    File audio(String id,int question){if(question<1||question>100)throw new IllegalArgumentException();return new File(folder(id),"answer-"+question+".wav");}
    void save(String id,JSONObject record)throws IOException{
        AtomicFile file=new AtomicFile(new File(folder(id),"record.json"));FileOutputStream stream=null;
        try{stream=file.startWrite();stream.write(record.toString().getBytes(StandardCharsets.UTF_8));file.finishWrite(stream);}
        catch(IOException e){if(stream!=null)file.failWrite(stream);throw e;}
    }
    JSONObject load(String id)throws Exception{
        try(InputStream in=new AtomicFile(new File(folder(id),"record.json")).openRead();ByteArrayOutputStream out=new ByteArrayOutputStream()){
            byte[] b=new byte[4096];int n;while((n=in.read(b))!=-1)out.write(b,0,n);return new JSONObject(new String(out.toByteArray(),StandardCharsets.UTF_8));
        }
    }
    List<JSONObject> list(){
        ArrayList<JSONObject> result=new ArrayList<>();File[] dirs=root.listFiles();if(dirs==null)return result;
        for(File dir:dirs)try{JSONObject record=load(dir.getName());result.add(record);}catch(Exception ignored){}
        Collections.sort(result,(a,b)->Long.compare(b.optLong("created_at"),a.optLong("created_at")));return result;
    }
    void delete(String id)throws IOException{File dir=folder(id);File[] files=dir.listFiles();if(files!=null)for(File f:files)if(!f.delete())throw new IOException();if(!dir.delete())throw new IOException();}
}
