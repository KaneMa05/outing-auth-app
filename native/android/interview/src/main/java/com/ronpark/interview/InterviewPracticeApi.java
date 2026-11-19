package com.ronpark.interview;

import org.json.*;
import java.io.*;
import java.util.concurrent.TimeUnit;
import okhttp3.*;

/** Mode-scoped practice credentials are exchanged from a single-use launch code. */
final class InterviewPracticeApi {
    final OkHttpClient http=new OkHttpClient.Builder().connectTimeout(15,TimeUnit.SECONDS).readTimeout(90,TimeUnit.SECONDS).callTimeout(120,TimeUnit.SECONDS).followRedirects(false).followSslRedirects(false).retryOnConnectionFailure(false).build();
    final String mode;private volatile String token="";private volatile boolean closed;
    InterviewPracticeApi(String mode){this.mode=mode;}
    JSONObject post(String path,JSONObject body)throws Exception {
        if(closed||!path.equals("/api/interview-native-practice")&&!path.equals("/api/interview-practice-records"))throw new IOException("practice_action_forbidden");
        Request.Builder request=new Request.Builder().url(InterviewApi.ORIGIN+path).header("Origin",InterviewApi.ORIGIN).post(RequestBody.create(body.toString(),MediaType.get("application/json")));
        if(!token.isEmpty())request.header("Authorization","Bearer "+token);
        try(Response response=http.newCall(request.build()).execute()){if(response.body()==null)throw new IOException("invalid_response");JSONObject result=new JSONObject(response.body().string());if(!response.isSuccessful()||!result.optBoolean("ok"))throw new IOException("practice_request_failed");return result;}
    }
    JSONObject exchange(String code)throws Exception {JSONObject value=post("/api/interview-native-practice",InterviewApi.json("action","exchange","code",code,"mode",mode));if(!mode.equals(value.optString("mode"))||value.optString("accountId").isEmpty()||value.optString("token").isEmpty())throw new IOException("unauthorized");token=value.getString("token");return value;}
    JSONObject bootstrap(String requested)throws Exception{if(!mode.equals(requested))throw new IOException("practice_mode_changed");return post("/api/interview-native-practice",InterviewApi.json("action","bootstrap","mode",mode));}
    void upload(String raw,String run,int number,String hash,File file)throws Exception {
        HttpUrl url=HttpUrl.parse(raw);
        String expected="/storage/v1/object/upload/sign/interview-practice/"+run+"/"+number+"-"+hash+".m4a";
        if(closed||url==null||!url.isHttps()||!url.host().endsWith(".supabase.co")||url.port()!=443||!url.username().isEmpty()||!url.password().isEmpty()||!url.encodedPath().equals(expected)||url.queryParameter("token")==null)throw new IOException("invalid_upload");
        Request request=new Request.Builder().url(url).header("x-upsert","true").put(RequestBody.create(file,MediaType.get("audio/mp4"))).build();
        try(Response r=http.newCall(request).execute()){if(!r.isSuccessful())throw new IOException("upload_failed");}
    }
    void close(){closed=true;token="";http.dispatcher().cancelAll();}
    boolean isClosed(){return closed;}
}
