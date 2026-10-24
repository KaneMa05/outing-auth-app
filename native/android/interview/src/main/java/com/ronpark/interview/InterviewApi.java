package com.ronpark.interview;

import android.os.Handler;
import android.os.Looper;
import org.json.JSONObject;
import java.io.IOException;
import java.util.concurrent.TimeUnit;
import okhttp3.*;

/** Session credentials stay in memory; neither the app nor deep links contain an OpenAI key. */
final class InterviewApi {
    static final String ORIGIN="https://outing-auth-app.vercel.app";
    final OkHttpClient http=new OkHttpClient.Builder().connectTimeout(15,TimeUnit.SECONDS).readTimeout(60,TimeUnit.SECONDS).callTimeout(65,TimeUnit.SECONDS).followRedirects(false).followSslRedirects(false).retryOnConnectionFailure(false).build();
    final Handler main=new Handler(Looper.getMainLooper());
    private String token="";
    interface Reply {void done(JSONObject data,String error);}
    static JSONObject json(Object... pairs){JSONObject out=new JSONObject();try{for(int i=0;i<pairs.length;i+=2)out.put((String)pairs[i],pairs[i+1]);}catch(Exception e){throw new IllegalArgumentException(e);}return out;}
    void exchange(String code,Reply reply){post(json("action","exchange","code",code),(data,error)->{if(error==null)token=data.optString("token");reply.done(data,error);});}
    void command(String action,JSONObject fields,Reply reply){try{fields.put("action",action);}catch(Exception ignored){}post(json("action","command","command",fields),reply);}
    private void post(JSONObject body,Reply reply){
        Request.Builder b=new Request.Builder().url(ORIGIN+"/api/interview-native").post(RequestBody.create(body.toString(),MediaType.get("application/json")));
        if(!token.isEmpty())b.header("Authorization","Bearer "+token);
        http.newCall(b.build()).enqueue(new Callback(){
            public void onFailure(Call c,IOException e){main.post(()->reply.done(null,"network_unavailable"));}
            public void onResponse(Call c,Response r){try(Response response=r){JSONObject d=new JSONObject(response.body().string());String error=response.isSuccessful()&&d.optBoolean("ok")?null:d.optString("error","network_unavailable");main.post(()->reply.done(d,error));}catch(Exception e){main.post(()->reply.done(null,"invalid_response"));}}
        });
    }
    void clear(){token="";http.dispatcher().cancelAll();}
}
