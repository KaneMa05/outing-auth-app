package com.ronpark.interview;
import org.json.*;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

final class InterviewPracticeArchive {
    interface Status{void pending(boolean value);}
    private static final ExecutorService WORK=Executors.newSingleThreadExecutor();
    final InterviewPracticeStore store;final InterviewPracticeApi api;final Status status;
    final AtomicBoolean requested=new AtomicBoolean(),running=new AtomicBoolean();
    InterviewPracticeArchive(InterviewPracticeStore store,InterviewPracticeApi api,Status status){this.store=store;this.api=api;this.status=status;}
    void schedule(){requested.set(true);if(!running.compareAndSet(false,true))return;WORK.execute(()->{try{while(requested.getAndSet(false)){
        try{List<JSONObject> records=store.list();Collections.reverse(records);for(JSONObject saved:records){if(store.synced(saved))continue;String id=saved.getString("runId"),fingerprint=InterviewPracticeStore.fingerprint(saved);JSONObject body=new JSONObject(saved.toString());body.remove("_archiveFingerprint");body.put("action","sync");JSONArray turns=body.getJSONArray("turns");Map<Integer,File> files=new HashMap<>();
            for(int i=0;i<turns.length();i++){JSONObject turn=turns.getJSONObject(i);int number=turn.getInt("number");File wav=store.audio(id,number);turn.put("audioBytes",0).put("audioHash","");if(wav.isFile()){File encoded=InterviewPracticeAac.encode(wav);turn.put("audioBytes",encoded.length()).put("audioHash",InterviewPracticeStore.hash(encoded));files.put(number,encoded);}}
            JSONObject response=api.post("/api/interview-practice-records",body);JSONArray uploads=response.getJSONArray("uploads");
            for(int i=0;i<uploads.length();i++){JSONObject item=uploads.getJSONObject(i);int number=item.getInt("number");File file=files.get(number);String hash=item.getString("audioHash");if(file==null||!InterviewPracticeStore.hash(file).equals(hash))throw new IOException("invalid_upload");api.upload(item.getString("url"),id,number,hash,file);api.post("/api/interview-practice-records",InterviewApi.json("action","uploaded","runId",id,"number",number,"audioHash",hash));}
            store.mark(id,fingerprint);
        }status.pending(false);}catch(Exception error){requested.set(false);status.pending(true);}
    }}finally{running.set(false);if(requested.get())schedule();}});}
}
