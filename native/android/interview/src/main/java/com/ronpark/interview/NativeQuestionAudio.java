package com.ronpark.interview;
import android.content.Context;
import org.json.*;
import okhttp3.*;
import java.io.*;
import java.util.*;
import java.util.concurrent.TimeUnit;

/** Public exact-prompt recordings, cached only after byte count and SHA verification. */
final class NativeQuestionAudio {
    private final File root;
    private final Map<String,JSONObject> catalogs=new HashMap<>();
    private final OkHttpClient http=new OkHttpClient.Builder().connectTimeout(10,TimeUnit.SECONDS).readTimeout(15,TimeUnit.SECONDS).callTimeout(20,TimeUnit.SECONDS).followRedirects(false).followSslRedirects(false).build();
    NativeQuestionAudio(Context context){root=new File(context.getCacheDir(),"practice-question-audio");root.mkdirs();}
    private byte[] get(String raw,int limit)throws Exception {
        try(Response response=http.newCall(new Request.Builder().url(raw).build()).execute()){
            if(!response.isSuccessful()||response.body()==null||response.body().contentLength()>limit)throw new IOException();
            try(InputStream in=response.body().byteStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1){if(out.size()+n>limit)throw new IOException();out.write(b,0,n);}return out.toByteArray();}
        }
    }
    File resolve(String mode,String id,String prompt)throws Exception {
        if(!Arrays.asList("job","personality").contains(mode))throw new IOException();String base="https://app.ronparkpass.com/assets/interview-"+mode+"-audio/";
        JSONObject catalog=catalogs.get(mode);if(catalog==null){catalog=new JSONObject();JSONArray rows=new JSONObject(new String(get(base+"catalog.json",8000000),java.nio.charset.StandardCharsets.UTF_8)).getJSONArray("clips");for(int i=0;i<rows.length();i++){JSONObject clip=rows.getJSONObject(i);catalog.put(clip.getString("id"),clip);}catalogs.put(mode,catalog);}
        JSONObject clip=catalog.optJSONObject(id);if(clip==null||!prompt.equals(clip.optString("prompt")))throw new IOException();String name=clip.getString("file"),hash=clip.getString("sha256");long bytes=clip.getLong("bytes");
        if(!name.matches("[A-Za-z0-9_-]+\\.mp3")||!hash.matches("[a-f0-9]{64}")||bytes<1||bytes>1048576)throw new IOException();File file=new File(root,name);if(file.isFile()&&file.length()==bytes&&InterviewPracticeStore.hash(file).equals(hash))return file;
        byte[] data=get(base+name,1048576);if(data.length!=bytes||!InterviewPracticeStore.hash(data).equals(hash))throw new IOException();File temporary=File.createTempFile("question-",".mp3",root);
        try{try(FileOutputStream out=new FileOutputStream(temporary)){out.write(data);out.getFD().sync();}if(file.exists()&&!file.delete())throw new IOException();if(!temporary.renameTo(file))throw new IOException();return file;}finally{temporary.delete();}
    }
}
