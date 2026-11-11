package com.ronpark.interview;

import android.os.Handler;
import android.os.Looper;
import android.webkit.CookieManager;
import okhttp3.*;
import org.json.JSONObject;
import java.io.IOException;
import java.util.*;
import java.util.concurrent.TimeUnit;

/** Memory-only authenticated portal capability; no cookie, account, or API key in intents. */
final class InterviewPortalSession {
    private static final Map<String,InterviewPortalSession> sessions=new HashMap<>();
    final Handler main=new Handler(Looper.getMainLooper());
    final OkHttpClient http=new OkHttpClient.Builder().connectTimeout(15,TimeUnit.SECONDS).readTimeout(25,TimeUnit.SECONDS).callTimeout(30,TimeUnit.SECONDS).followRedirects(false).followSslRedirects(false).retryOnConnectionFailure(false).build();
    final String mode;
    private String cookie;
    private InterviewPortalSession(String mode){this.mode=mode;cookie=CookieManager.getInstance().getCookie(InterviewTestPolicy.ORIGIN);}
    static String create(String mode){if(!InterviewTestPolicy.mode(mode))throw new IllegalArgumentException();String id=UUID.randomUUID().toString();sessions.put(id,new InterviewPortalSession(mode));return id;}
    static InterviewPortalSession take(String id){return sessions.remove(id);}
    void bootstrap(InterviewApi.Reply reply){post("/api/interview-prep",InterviewApi.json("action","practice_bootstrap","mode",mode),reply);}
    void analysis(String action,JSONObject fields,InterviewApi.Reply reply){if(!Arrays.asList("status","get","submit").contains(action)||fields.has("action")){reply.done(null,"invalid_request");return;}try{fields.put("action",action);}catch(Exception e){reply.done(null,"invalid_request");return;}post("/api/interview-practice-openai",fields,reply);}
    private void post(String path,JSONObject body,InterviewApi.Reply reply){
        if(cookie==null||cookie.isEmpty()){reply.done(null,"unauthorized");return;}
        Request r=new Request.Builder().url(InterviewTestPolicy.ORIGIN+path).header("Origin",InterviewTestPolicy.ORIGIN).header("X-Interview-Test-App","1").header("Cookie",cookie).post(RequestBody.create(body.toString(),MediaType.get("application/json"))).build();
        http.newCall(r).enqueue(new Callback(){public void onFailure(Call c,IOException e){main.post(()->reply.done(null,"network_unavailable"));}public void onResponse(Call c,Response response){try(Response res=response){JSONObject result=new JSONObject(res.body().string());String error=res.isSuccessful()&&result.optBoolean("ok")?null:result.optString("error","invalid_response");main.post(()->reply.done(result,error));}catch(Exception e){main.post(()->reply.done(null,"invalid_response"));}}});
    }
    void close(){cookie="";http.dispatcher().cancelAll();}
}
