package com.ronpark.interview;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import org.json.JSONObject;
import okhttp3.*;
import java.io.*;
import java.util.concurrent.TimeUnit;

/** Debug USB bridge only. The bundled token authenticates a loopback server, never Gemini. */
final class InterviewFreeApi {
    private final OkHttpClient http=new OkHttpClient.Builder().connectTimeout(3,TimeUnit.SECONDS).readTimeout(50,TimeUnit.SECONDS).callTimeout(55,TimeUnit.SECONDS).retryOnConnectionFailure(false).followRedirects(false).build();
    private final Handler main=new Handler(Looper.getMainLooper());
    private String token="";
    InterviewFreeApi(Context context){http.dispatcher().setMaxRequestsPerHost(1);if(!BuildConfig.DEBUG)return;try(InputStream in=context.getAssets().open("interview-local-bridge.json");ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[1024];int n;while((n=in.read(b))!=-1)out.write(b,0,n);JSONObject config=new JSONObject(out.toString("UTF-8"));if("http://127.0.0.1:8787".equals(config.optString("url")))token=config.optString("token");}catch(Exception ignored){}}
    boolean configured(){return BuildConfig.DEBUG&&token.matches("[a-f0-9]{64}");}
    InterviewLiveCaptions captions(String question,String mode,String prefix,InterviewLiveCaptions.Listener listener){return new InterviewLiveCaptions(http,token,question,mode,prefix,listener);}
    void status(InterviewApi.Reply reply){if(!configured()){reply.done(null,"not_configured");return;}send(new Request.Builder().url("http://127.0.0.1:8787/status").get(),reply);}
    void analyze(File audio,String question,String mode,String transcript,InterviewApi.Reply reply){
        if(!configured()||!audio.exists()||audio.length()<44||audio.length()>3000000){reply.done(null,"invalid_audio");return;}
        new Thread(()->{try(FileInputStream in=new FileInputStream(audio);ByteArrayOutputStream out=new ByteArrayOutputStream()){
            byte[] b=new byte[4096];int n;while((n=in.read(b))!=-1){out.write(b,0,n);if(out.size()>3000000)throw new IOException();}
            JSONObject body=InterviewApi.json("audio",Base64.encodeToString(out.toByteArray(),Base64.NO_WRAP),"question",question,"mode",mode,"transcript",transcript,"consent",true);
            send(new Request.Builder().url("http://127.0.0.1:8787/analyze").post(RequestBody.create(body.toString(),MediaType.get("application/json"))),reply);
        }catch(Exception error){main.post(()->reply.done(null,"invalid_audio"));}},"InterviewLocalUpload").start();
    }
    private void send(Request.Builder request,InterviewApi.Reply reply){
        http.newCall(request.header("Authorization","Bearer "+token).build()).enqueue(new Callback(){
            public void onFailure(Call c,IOException error){main.post(()->reply.done(null,"bridge_unavailable"));}
            public void onResponse(Call c,Response response){try(Response r=response){JSONObject value=new JSONObject(r.body().string());String error=r.isSuccessful()&&value.optBoolean("ok")?null:value.optString("error","analysis_failed");main.post(()->reply.done(value,error));}catch(Exception error){main.post(()->reply.done(null,"analysis_failed"));}}
        });
    }
    void close(){http.dispatcher().cancelAll();}
}
