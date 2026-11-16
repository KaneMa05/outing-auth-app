package com.ronpark.interview;

import org.json.*;
import java.io.*;
import java.util.concurrent.TimeUnit;
import okhttp3.*;

/** Only an exchanged, server-bound practice token is used. No browser cookies or API keys. */
final class InterviewPracticeApi {
    final OkHttpClient http=new OkHttpClient.Builder().connectTimeout(15,TimeUnit.SECONDS).readTimeout(90,TimeUnit.SECONDS).callTimeout(120,TimeUnit.SECONDS).followRedirects(false).followSslRedirects(false).retryOnConnectionFailure(false).build();
    private volatile String token="";
    JSONObject post(String path,JSONObject body)throws Exception {
        Request.Builder request=new Request.Builder().url(InterviewApi.ORIGIN+path).header("X-Interview-Test-App","1").header("Origin",InterviewApi.ORIGIN)
            .post(RequestBody.create(body.toString(),MediaType.get("application/json")));
        if(!token.isEmpty())request.header("Authorization","Bearer "+token);
        try(Response response=http.newCall(request.build()).execute()){
            if(response.body()==null)throw new IOException("invalid_response");
            JSONObject value=new JSONObject(response.body().string());
            if(!response.isSuccessful()||!value.optBoolean("ok"))throw new IOException(value.optString("error","network_unavailable"));
            return value;
        }
    }
    JSONObject exchange(String code)throws Exception {
        JSONObject value=post("/api/interview-native",InterviewApi.json("action","exchange","code",code,"practice",true));
        String account=value.optString("accountId"),session=value.optString("token");
        if(account.isEmpty()||session.isEmpty())throw new IOException("unauthorized");token=session;return value;
    }
    JSONObject bootstrap(String mode)throws Exception{return post("/api/interview-native",InterviewApi.json("action","practice_bootstrap","mode",mode));}
    void upload(String raw,String run,int number,String hash,File file)throws Exception {
        HttpUrl url=HttpUrl.parse(raw);
        String expected="/storage/v1/object/upload/sign/interview-practice/"+run+"/"+number+"-"+hash+".m4a";
        if(url==null||!url.isHttps()||!url.host().endsWith(".supabase.co")||url.port()!=443||!url.username().isEmpty()||!url.password().isEmpty()||!url.encodedPath().equals(expected)||url.queryParameter("token")==null)throw new IOException("invalid_upload");
        Request request=new Request.Builder().url(url).header("x-upsert","true").put(RequestBody.create(file,MediaType.get("audio/mp4"))).build();
        try(Response r=http.newCall(request).execute()){if(!r.isSuccessful())throw new IOException("upload_failed");}
    }
}
