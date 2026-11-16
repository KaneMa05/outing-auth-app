package com.ronpark.interview;

import android.content.Context;
import android.os.*;
import android.util.Base64;
import org.json.JSONObject;
import java.io.*;
import java.security.*;
import java.security.cert.*;
import java.util.Arrays;
import java.util.concurrent.TimeUnit;
import javax.net.ssl.*;
import okhttp3.*;

/** Debug local bridge only; the provider key remains on the user's PC. */
final class PracticeBridge {
    private final Handler main=new Handler(Looper.getMainLooper());
    private OkHttpClient http;
    private String token="",origin="";
    PracticeBridge(Context context){
        try(InputStream input=context.getAssets().open("interview-local-bridge.json");ByteArrayOutputStream out=new ByteArrayOutputStream()){
            byte[] buffer=new byte[2048];int count;while((count=input.read(buffer))!=-1)out.write(buffer,0,count);
            JSONObject config=new JSONObject(out.toString("UTF-8"));String address=config.getString("url"),key=config.getString("token");
            if(!PracticeBridgePolicy.accepts(address)||!key.matches("[a-f0-9]{64}"))return;
            OkHttpClient.Builder builder=new OkHttpClient.Builder().connectTimeout(5,TimeUnit.SECONDS).readTimeout(50,TimeUnit.SECONDS).callTimeout(55,TimeUnit.SECONDS).retryOnConnectionFailure(false).followRedirects(false).followSslRedirects(false);
            if(address.startsWith("https:")){
                byte[] der=Base64.decode(config.getString("certificate"),Base64.DEFAULT);
                X509Certificate certificate=(X509Certificate)CertificateFactory.getInstance("X.509").generateCertificate(new ByteArrayInputStream(der));certificate.checkValidity();
                KeyStore anchors=KeyStore.getInstance(KeyStore.getDefaultType());anchors.load(null);anchors.setCertificateEntry("local-debug",certificate);
                TrustManagerFactory factory=TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());factory.init(anchors);
                X509TrustManager delegate=(X509TrustManager)factory.getTrustManagers()[0];
                X509TrustManager pinned=new X509TrustManager(){
                    public void checkClientTrusted(X509Certificate[] c,String a)throws CertificateException{throw new CertificateException("client_not_supported");}
                    public void checkServerTrusted(X509Certificate[] chain,String auth)throws CertificateException{
                        if(chain.length==0||!Arrays.equals(chain[0].getEncoded(),der))throw new CertificateException("certificate_pin_mismatch");
                        chain[0].checkValidity();delegate.checkServerTrusted(chain,auth);
                    }
                    public X509Certificate[] getAcceptedIssuers(){return delegate.getAcceptedIssuers();}
                };
                SSLContext tls=SSLContext.getInstance("TLS");tls.init(null,new TrustManager[]{pinned},new SecureRandom());
                builder.sslSocketFactory(tls.getSocketFactory(),pinned); // OkHttp still verifies the host/IP SAN.
            }
            http=builder.build();http.dispatcher().setMaxRequestsPerHost(1);origin=address.replaceAll("/$","");token=key;
        }catch(Exception ignored){http=null;token="";origin="";}
    }
    boolean configured(){return http!=null&&!token.isEmpty();}
    void status(InterviewApi.Reply reply){if(!configured()){reply.done(null,"not_configured");return;}send(new Request.Builder().url(origin+"/status").get(),reply);}
    InterviewLiveCaptions captions(String question,String mode,String prefix,InterviewLiveCaptions.Listener listener){
        return new InterviewLiveCaptions(http,token,question,mode,prefix,listener,origin.replaceFirst("^http","ws")+"/live");
    }
    void analyze(File audio,String question,String mode,String transcript,InterviewApi.Reply reply){
        new Thread(()->{
            try(FileInputStream input=new FileInputStream(audio);ByteArrayOutputStream out=new ByteArrayOutputStream()){
                if(!configured()||audio.length()<=44||audio.length()>3000000)throw new IOException();
                byte[] buffer=new byte[4096];int n;while((n=input.read(buffer))!=-1){out.write(buffer,0,n);if(out.size()>3000000)throw new IOException();}
                JSONObject body=InterviewApi.json("audio",Base64.encodeToString(out.toByteArray(),Base64.NO_WRAP),"question",question,"mode",mode,"transcript",transcript,"consent",true);
                send(new Request.Builder().url(origin+"/analyze").post(RequestBody.create(body.toString(),MediaType.get("application/json"))),reply);
            }catch(Exception error){main.post(()->reply.done(null,"invalid_audio"));}
        },"PracticeAnalysis").start();
    }
    private void send(Request.Builder builder,InterviewApi.Reply reply){
        http.newCall(builder.header("Authorization","Bearer "+token).build()).enqueue(new Callback(){
            public void onFailure(Call call,IOException error){main.post(()->reply.done(null,"bridge_unavailable"));}
            public void onResponse(Call call,Response response){try(Response r=response){JSONObject body=new JSONObject(r.body().string());String error=r.isSuccessful()&&body.optBoolean("ok")?null:body.optString("error","analysis_failed");main.post(()->reply.done(body,error));}catch(Exception e){main.post(()->reply.done(null,"invalid_response"));}}
        });
    }
    void close(){if(http!=null){http.dispatcher().cancelAll();http.connectionPool().evictAll();}}
}
