package com.ronpark.interview;

import android.os.Handler;
import android.os.Looper;
import org.json.JSONObject;
import okhttp3.*;
import okio.ByteString;
import java.util.ArrayDeque;

/** Streams the same local recorder PCM used for saved answers; no second microphone. */
final class InterviewLiveCaptions {
    interface Listener{void text(String text,boolean speech);void failed();}
    interface FinalReply{void done(String text,boolean confirmed);}
    private final Handler main=new Handler(Looper.getMainLooper());
    private final Listener listener;
    private final InterviewCaptionState state=new InterviewCaptionState();
    private final ArrayDeque<byte[]> queued=new ArrayDeque<>();
    private final String prefix;
    private WebSocket socket;private volatile boolean closed;private boolean ready,finishing;private int queuedBytes;private FinalReply reply;
    private final Runnable finishTimeout=()->complete(state.text(),false);
    InterviewLiveCaptions(OkHttpClient http,String token,String question,String mode,String prefix,Listener listener){
        this.listener=listener;this.prefix=prefix.trim();
        socket=http.newWebSocket(new Request.Builder().url("ws://127.0.0.1:8787/live").header("Authorization","Bearer "+token).build(),new WebSocketListener(){
            @Override public void onOpen(WebSocket ws,Response response){ws.send(InterviewApi.json("type","configure","question",question,"mode",mode).toString());}
            @Override public void onMessage(WebSocket ws,String raw){try{
                JSONObject message=new JSONObject(raw);
                main.post(()->receive(message));
            }catch(Exception ignored){}}
            @Override public void onFailure(WebSocket ws,Throwable error,Response response){fail();}
            @Override public void onClosed(WebSocket ws,int code,String reason){if(!closed)fail();}
        });
    }
    private void receive(JSONObject message){
        if(closed)return;
        String type=message.optString("type");
        if(type.equals("ready"))ready();
        if(type.equals("transcript")){
            boolean speech=state.update(message.optString("text"),message.optBoolean("partial"));
            if(!finishing)listener.text(full(state.text()),speech);
        }
        if(type.equals("finished"))complete(message.optString("text",state.text()),message.optBoolean("confirmed"));
        if(type.equals("error"))fail();
    }
    private String full(String text){return prefix.isEmpty()?text:text.isEmpty()?prefix:prefix+" "+text;}
    boolean available(){return !closed;}
    private synchronized void ready(){
        if(closed)return;ready=true;
        while(!queued.isEmpty())socket.send(ByteString.of(queued.removeFirst()));queuedBytes=0;
        if(finishing)socket.send("{\"type\":\"end\"}");
    }
    private void fail(){main.post(()->{if(!closed){boolean pending=finishing;complete(state.text(),false);if(!pending)listener.failed();}});}
    synchronized void pcm(byte[] bytes){
        if(closed||finishing||socket==null)return;
        if(queuedBytes+bytes.length+socket.queueSize()>512000){fail();return;}
        if(ready)socket.send(ByteString.of(bytes));else{queued.addLast(bytes.clone());queuedBytes+=bytes.length;}
    }
    synchronized void finish(FinalReply callback){
        if(finishing)return;
        if(closed){callback.done(full(state.text()),false);return;}
        finishing=true;reply=callback;
        if(ready)socket.send("{\"type\":\"end\"}");
        main.postDelayed(finishTimeout,6000);
    }
    private synchronized void complete(String text,boolean confirmed){
        if(closed)return;state.update(text,false);closed=true;main.removeCallbacks(finishTimeout);queued.clear();queuedBytes=0;
        if(socket!=null){socket.close(1000,"transcription complete");socket=null;}
        FinalReply callback=reply;reply=null;if(callback!=null)callback.done(full(text),confirmed&&prefix.isEmpty());
    }
    synchronized void close(){closed=true;main.removeCallbacks(finishTimeout);queued.clear();queuedBytes=0;reply=null;if(socket!=null){socket.cancel();socket=null;}}
}
