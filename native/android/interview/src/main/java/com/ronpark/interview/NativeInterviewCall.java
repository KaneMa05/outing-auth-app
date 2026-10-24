package com.ronpark.interview;

import android.content.Context;
import android.media.AudioManager;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.json.JSONObject;
import org.webrtc.*;
import org.webrtc.audio.JavaAudioDeviceModule;
import okhttp3.*;

/** Native WebRTC capture/playback. Question generation and durable recording remain server-owned. */
final class NativeInterviewCall {
    interface Listener {void ready(String run,String question);void event(JSONObject event);void ended(String run,String error);}
    final Handler main=new Handler(Looper.getMainLooper());
    final InterviewApi api; final Listener listener; final Context context;
    PeerConnectionFactory factory;PeerConnection peer;AudioSource source;AudioTrack track;DataChannel channel;JavaAudioDeviceModule adm;
    WebSocket socket;String runId="",sdp="";boolean ended=false,closing=false,offerSent=false,sessionStarted=false,begun=false;int nextId=0;
    final Map<Integer,InterviewApi.Reply> pending=new HashMap<>();final Map<Integer,Runnable> timeouts=new HashMap<>();
    AudioManager audio;int oldMode;boolean oldSpeaker;AudioFocusRequest focusRequest;
    final AudioManager.OnAudioFocusChangeListener focus=change->{if(change<0)main.post(()->stop("audio_interrupted"));};
    NativeInterviewCall(Context c,InterviewApi a,Listener l){context=c;api=a;listener=l;}
    void start(){try{
        PeerConnectionFactory.initialize(PeerConnectionFactory.InitializationOptions.builder(context).createInitializationOptions());
        audio=(AudioManager)context.getSystemService(Context.AUDIO_SERVICE);oldMode=audio.getMode();oldSpeaker=audio.isSpeakerphoneOn();audio.setMode(AudioManager.MODE_IN_COMMUNICATION);
        int granted;
        if(Build.VERSION.SDK_INT>=26){focusRequest=new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT).setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()).setOnAudioFocusChangeListener(focus,main).build();granted=audio.requestAudioFocus(focusRequest);}
        else granted=audio.requestAudioFocus(focus,AudioManager.STREAM_VOICE_CALL,AudioManager.AUDIOFOCUS_GAIN_TRANSIENT);
        if(granted!=AudioManager.AUDIOFOCUS_REQUEST_GRANTED)throw new IllegalStateException();
        // Keep wired/Bluetooth routing. Speaker only when no headset is attached.
        if(!audio.isWiredHeadsetOn()&&!audio.isBluetoothScoOn())audio.setSpeakerphoneOn(true);
        adm=JavaAudioDeviceModule.builder(context).setUseHardwareAcousticEchoCanceler(true).setUseHardwareNoiseSuppressor(true).createAudioDeviceModule();
        factory=PeerConnectionFactory.builder().setAudioDeviceModule(adm).createPeerConnectionFactory();
        PeerConnection.RTCConfiguration cfg=new PeerConnection.RTCConfiguration(Collections.emptyList());cfg.sdpSemantics=PeerConnection.SdpSemantics.UNIFIED_PLAN;
        peer=factory.createPeerConnection(cfg,new PeerConnection.Observer(){
            public void onSignalingChange(PeerConnection.SignalingState s){}public void onIceConnectionReceivingChange(boolean b){}
            public void onIceConnectionChange(PeerConnection.IceConnectionState s){main.post(()->{if(s==PeerConnection.IceConnectionState.FAILED)stop("connection_lost");else if(s==PeerConnection.IceConnectionState.DISCONNECTED)main.postDelayed(()->{if(!ended&&!closing&&peer!=null&&peer.iceConnectionState()==PeerConnection.IceConnectionState.DISCONNECTED)stop("connection_lost");},5000);});}
            public void onIceGatheringChange(PeerConnection.IceGatheringState s){if(s==PeerConnection.IceGatheringState.COMPLETE)main.post(()->sendOffer());}
            public void onIceCandidate(IceCandidate c){}public void onIceCandidatesRemoved(IceCandidate[] c){}public void onAddStream(MediaStream s){}public void onRemoveStream(MediaStream s){}public void onDataChannel(DataChannel d){}public void onRenegotiationNeeded(){}
        });
        if(peer==null)throw new IllegalStateException();
        MediaConstraints constraints=new MediaConstraints();constraints.mandatory.add(new MediaConstraints.KeyValuePair("googEchoCancellation","true"));constraints.mandatory.add(new MediaConstraints.KeyValuePair("googNoiseSuppression","true"));
        source=factory.createAudioSource(constraints);track=factory.createAudioTrack("student-audio",source);peer.addTrack(track,Collections.singletonList("interview"));
        channel=peer.createDataChannel("oai-events",new DataChannel.Init());channel.registerObserver(new DataChannel.Observer(){
            public void onBufferedAmountChange(long n){}public void onStateChange(){}
            public void onMessage(DataChannel.Buffer b){if(b.binary)return;byte[] bytes=new byte[b.data.remaining()];b.data.get(bytes);String text=new String(bytes,StandardCharsets.UTF_8);main.post(()->event(text));}
        });
        peer.createOffer(new Sdp(){public void onCreateSuccess(SessionDescription offer){main.post(()->{if(ended||closing)return;peer.setLocalDescription(new Sdp(){public void onSetSuccess(){main.post(()->{if(!ended&&!closing&&peer.iceGatheringState()==PeerConnection.IceGatheringState.COMPLETE)sendOffer();});}},offer);});}},new MediaConstraints());
        main.postDelayed(()->{if(!offerSent&&!ended)stop("connection_timeout");},15000);
    }catch(Exception e){stop("microphone_unavailable");}}
    void sendOffer(){if(ended||closing||offerSent||peer==null||peer.getLocalDescription()==null)return;offerSent=true;sdp=peer.getLocalDescription().description;String key=UUID.randomUUID().toString();
        JSONObject fields=InterviewApi.json("requestKey",key,"sdp",sdp);
        api.command("start",fields,(result,error)->{
            if(ended||closing)return;if(error!=null){stop(error);return;}
            if(!"websocket".equals(result.optString("transport"))||!"/api/interview-live-socket".equals(result.optString("url"))){stop("unsupported_transport");return;}
            String ticket=result.optString("ticket");
            socket=api.http.newWebSocket(new Request.Builder().url(InterviewApi.ORIGIN.replace("https:","wss:")+"/api/interview-live-socket").header("Origin",InterviewApi.ORIGIN).build(),new WebSocketListener(){
                public void onOpen(WebSocket ws,Response response){main.post(()->{if(ended||closing){ws.close(1000,"cancelled");return;}send("start",fields,ticket,(data,err)->{
                    if(err!=null){stop(err);return;}runId=data.optString("runId");if(runId.isEmpty()){stop("invalid_response");return;}
                    if(ended||closing){api.command("finish",InterviewApi.json("runId",runId),(d,e)->{});return;}
                    peer.setRemoteDescription(new Sdp(){public void onSetSuccess(){main.post(()->{if(ended||closing)return;begin();listener.ready(runId,data.optString("question"));heartbeat();main.postDelayed(()->stop(null),600000);});}},new SessionDescription(SessionDescription.Type.ANSWER,data.optString("sdp")));
                });});}
                public void onMessage(WebSocket ws,String text){main.post(()->receive(text));}
                public void onFailure(WebSocket ws,Throwable t,Response r){main.post(()->stop("connection_lost"));}
                public void onClosed(WebSocket ws,int code,String reason){main.post(()->{if(!ended&&!closing)stop("connection_lost");});}
            });
        });
    }
    void event(String text){if(ended||closing)return;try{JSONObject e=new JSONObject(text);String type=e.optString("type");if(type.equals("session.started")){sessionStarted=true;begin();}if(type.equals("session.closed")){stop(null);return;}if(type.equals("error")){stop("voice_error");return;}listener.event(e);}catch(Exception e){stop("invalid_response");}}
    void begin(){if(begun||!sessionStarted||runId.isEmpty()||ended||closing)return;begun=true;command("begin",(d,e)->{if(e!=null)stop(e);});}
    void heartbeat(){if(ended||closing)return;command("heartbeat",(d,e)->{if(e!=null){stop(e);return;}String state=d.optJSONObject("run")==null?"":d.optJSONObject("run").optString("state");if(Arrays.asList("completed","interrupted","unknown").contains(state))stop(null);});main.postDelayed(()->heartbeat(),10000);}
    void mute(boolean muted){if(track!=null)track.setEnabled(!muted);}
    void answer(InterviewApi.Reply callback){command("answer_done",callback);}
    void command(String action,InterviewApi.Reply callback){send(action,InterviewApi.json("runId",runId),null,callback);}
    void send(String action,JSONObject fields,String ticket,InterviewApi.Reply cb){if(socket==null||ended){cb.done(null,"connection_lost");return;}try{fields.put("action",action);int id=++nextId;JSONObject m=InterviewApi.json("id",id,"body",fields);if(ticket!=null)m.put("ticket",ticket);pending.put(id,cb);Runnable timer=()->{InterviewApi.Reply p=pending.remove(id);timeouts.remove(id);if(p!=null)p.done(null,"connection_timeout");stop("connection_timeout");};timeouts.put(id,timer);main.postDelayed(timer,55000);if(!socket.send(m.toString()))stop("connection_lost");}catch(Exception e){stop("invalid_request");}}
    void receive(String text){if(ended)return;try{JSONObject d=new JSONObject(text);if(d.has("event")){if(!closing)listener.event(d.getJSONObject("event"));return;}int id=d.optInt("id");InterviewApi.Reply cb=pending.remove(id);Runnable t=timeouts.remove(id);if(t!=null)main.removeCallbacks(t);JSONObject result=d.optJSONObject("result");if(cb!=null)cb.done(result,d.has("error")?d.optString("error"):result!=null&&result.optBoolean("ok")?null:"invalid_response");}catch(Exception e){stop("invalid_response");}}
    void stop(String error){if(ended||closing)return;closing=true;if(track!=null)track.setEnabled(false);
        if(channel!=null&&channel.state()==DataChannel.State.OPEN)channel.send(new DataChannel.Buffer(ByteBuffer.wrap(InterviewApi.json("type","session.close","event_id",UUID.randomUUID().toString()).toString().getBytes(StandardCharsets.UTF_8)),false));
        // Release hardware capture immediately; the independent control socket finalizes recording.
        if(peer!=null)peer.close();
        if(runId.isEmpty()||socket==null){release(error);return;}
        command("finish",(d,e)->release(error!=null?error:e));main.postDelayed(()->release(error==null?"save_pending":error),20000);
    }
    void release(String error){if(ended)return;ended=true;main.removeCallbacksAndMessages(null);for(InterviewApi.Reply cb:new ArrayList<>(pending.values()))cb.done(null,"connection_closed");pending.clear();timeouts.clear();
        if(socket!=null)socket.close(1000,"finished");if(channel!=null){channel.close();channel.dispose();}if(peer!=null){peer.close();peer.dispose();}if(track!=null)track.dispose();if(source!=null)source.dispose();if(factory!=null)factory.dispose();if(adm!=null)adm.release();
        if(audio!=null){if(Build.VERSION.SDK_INT>=26&&focusRequest!=null)audio.abandonAudioFocusRequest(focusRequest);else audio.abandonAudioFocus(focus);audio.setMode(oldMode);audio.setSpeakerphoneOn(oldSpeaker);}listener.ended(runId,error);
    }
    abstract class Sdp implements SdpObserver {public void onCreateSuccess(SessionDescription d){}public void onSetSuccess(){}public void onCreateFailure(String e){main.post(()->stop("connection_failed"));}public void onSetFailure(String e){main.post(()->stop("connection_failed"));}}
}
