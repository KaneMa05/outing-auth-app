package com.ronpark.interview;

import android.media.*;
import android.os.*;
import android.view.Surface;
import org.webrtc.*;
import java.io.File;
import java.nio.ByteBuffer;
import java.util.*;

/** Local MP4: one shared microphone, H.264 surface video + AAC, never uploaded. */
final class PracticeVideo implements VideoSink,PracticeCapture.Pcm {
    interface Listener{void started(boolean success);void finished(File file,boolean success);}
    private final Handler main=new Handler(Looper.getMainLooper());
    private final HandlerThread thread=new HandlerThread("PracticeVideoMuxer");
    private final Handler worker;
    private final File file;
    private final Listener listener;
    private MediaCodec video,audio;private MediaMuxer muxer;private Surface surface;
    private volatile EglRenderer renderer;
    private volatile boolean accepting,stopping;
    private boolean muxing,ended,videoEnd,audioEnd,announced;
    private int videoTrack=-1,audioTrack=-1,pendingBytes;
    private long epochNs,audioOriginUs=-1,audioSamples,lastVideoUs=-1,lastAudioUs=-1,stopAt;
    private final List<Packet> pending=new ArrayList<>();
    PracticeVideo(File file,Listener listener){this.file=file;this.listener=listener;thread.start();worker=new Handler(thread.getLooper());}
    void start(EglBase.Context shared){worker.post(()->{
        try{
            if(file.getParentFile().getUsableSpace()<100L*1024*1024)throw new IllegalStateException("storage_full");
            video=MediaCodec.createEncoderByType("video/avc");MediaFormat v=MediaFormat.createVideoFormat("video/avc",480,640);
            v.setInteger(MediaFormat.KEY_COLOR_FORMAT,MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface);v.setInteger(MediaFormat.KEY_BIT_RATE,1200000);v.setInteger(MediaFormat.KEY_FRAME_RATE,15);v.setInteger(MediaFormat.KEY_I_FRAME_INTERVAL,2);
            video.configure(v,null,null,MediaCodec.CONFIGURE_FLAG_ENCODE);surface=video.createInputSurface();video.start();
            audio=MediaCodec.createEncoderByType("audio/mp4a-latm");MediaFormat a=MediaFormat.createAudioFormat("audio/mp4a-latm",16000,1);
            a.setInteger(MediaFormat.KEY_AAC_PROFILE,MediaCodecInfo.CodecProfileLevel.AACObjectLC);a.setInteger(MediaFormat.KEY_BIT_RATE,64000);a.setInteger(MediaFormat.KEY_MAX_INPUT_SIZE,8192);
            audio.configure(a,null,null,MediaCodec.CONFIGURE_FLAG_ENCODE);audio.start();muxer=new MediaMuxer(file.getAbsolutePath(),MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
            EglRenderer r=new EglRenderer("PracticeMovieSurface");r.init(shared,EglBase.CONFIG_RECORDABLE,new GlRectDrawer(),true);r.setMirror(true);r.setLayoutAspectRatio(480f/640);r.setFpsReduction(15);r.createEglSurface(surface);renderer=r;
            epochNs=System.nanoTime();accepting=true;pump();
            worker.postDelayed(()->{if(!ended&&!announced)fail();},5000);
            worker.postDelayed(()->{if(!ended)stop();},610000);
        }catch(Exception error){fail();}
    });}
    @Override public void onFrame(VideoFrame frame){
        EglRenderer r=renderer;if(!accepting||r==null)return;
        frame.getBuffer().retain();VideoFrame timed=new VideoFrame(frame.getBuffer(),frame.getRotation(),Math.max(0,System.nanoTime()-epochNs));
        try{r.onFrame(timed);}finally{timed.release();}
    }
    @Override public void sample(byte[] bytes,long timeNs){
        if(!accepting)return;worker.post(()->{
            if(stopping||ended)return;
            try{
                if(audioOriginUs<0)audioOriginUs=Math.max(0,(timeNs-epochNs)/1000-bytes.length*1000000L/32000);
                int offset=0;
                while(offset<bytes.length){
                    int index=audio.dequeueInputBuffer(10000);if(index<0){drain(audio,false);index=audio.dequeueInputBuffer(10000);}if(index<0)throw new IllegalStateException("audio_backpressure");
                    ByteBuffer target=audio.getInputBuffer(index);target.clear();int count=Math.min(target.remaining(),bytes.length-offset)&~1;
                    target.put(bytes,offset,count);audio.queueInputBuffer(index,0,count,audioOriginUs+audioSamples*1000000L/16000,0);audioSamples+=count/2;offset+=count;
                }
                drain(audio,false);
            }catch(Exception error){fail();}
        });
    }
    private void pump(){if(ended)return;try{drain(video,true);drain(audio,false);if(stopping&&(videoEnd&&audioEnd||SystemClock.elapsedRealtime()-stopAt>3000)){finish();return;}}catch(Exception error){fail();return;}worker.postDelayed(this::pump,20);}
    private void drain(MediaCodec codec,boolean isVideo){
        MediaCodec.BufferInfo info=new MediaCodec.BufferInfo();
        while(true){int index=codec.dequeueOutputBuffer(info,0);if(index==MediaCodec.INFO_TRY_AGAIN_LATER)return;
            if(index==MediaCodec.INFO_OUTPUT_FORMAT_CHANGED){int track=muxer.addTrack(codec.getOutputFormat());if(isVideo)videoTrack=track;else audioTrack=track;startMuxer();continue;}
            if(index<0)continue;
            try{
                if(info.size>0&&(info.flags&MediaCodec.BUFFER_FLAG_CODEC_CONFIG)==0){
                    ByteBuffer data=codec.getOutputBuffer(index);data.position(info.offset);data.limit(info.offset+info.size);byte[] copy=new byte[info.size];data.get(copy);
                    long timestamp=Math.max(0,info.presentationTimeUs);if(isVideo){timestamp=Math.max(lastVideoUs+1,timestamp);lastVideoUs=timestamp;}else{timestamp=Math.max(lastAudioUs+1,timestamp);lastAudioUs=timestamp;}
                    Packet packet=new Packet(isVideo,copy,timestamp,info.flags);if(muxing)write(packet);else{pendingBytes+=copy.length;if(pendingBytes>2*1024*1024)throw new IllegalStateException("muxer_not_ready");pending.add(packet);}
                }
                if((info.flags&MediaCodec.BUFFER_FLAG_END_OF_STREAM)!=0){if(isVideo)videoEnd=true;else audioEnd=true;}
            }finally{codec.releaseOutputBuffer(index,false);}
        }
    }
    private void startMuxer(){if(muxing||videoTrack<0||audioTrack<0)return;muxer.start();muxing=true;for(Packet packet:pending)write(packet);pending.clear();pendingBytes=0;}
    private void write(Packet p){MediaCodec.BufferInfo info=new MediaCodec.BufferInfo();info.set(0,p.bytes.length,p.timeUs,p.flags);muxer.writeSampleData(p.video?videoTrack:audioTrack,ByteBuffer.wrap(p.bytes),info);if(lastVideoUs>=0&&lastAudioUs>=0)announce(true);}
    void stop(){accepting=false;worker.post(()->{
        if(ended||stopping)return;stopping=true;stopAt=SystemClock.elapsedRealtime();
        try{EglRenderer r=renderer;renderer=null;if(r!=null)r.release();video.signalEndOfInputStream();queueAudioEnd();}catch(Exception e){fail();}
    });}
    private void queueAudioEnd(){
        if(ended)return;try{int index=audio.dequeueInputBuffer(10000);if(index>=0)audio.queueInputBuffer(index,0,0,Math.max(0,audioOriginUs)+audioSamples*1000000L/16000,MediaCodec.BUFFER_FLAG_END_OF_STREAM);else if(SystemClock.elapsedRealtime()-stopAt<2500){drain(audio,false);worker.postDelayed(this::queueAudioEnd,20);}else fail();}catch(Exception e){fail();}
    }
    private void announce(boolean success){if(!announced){announced=true;main.post(()->listener.started(success));}}
    private void fail(){if(ended)return;accepting=false;announce(false);finish(false);}
    private void finish(){finish(muxing&&lastVideoUs>=0&&lastAudioUs>=0&&videoEnd&&audioEnd);}
    private void finish(boolean success){
        if(ended)return;ended=true;accepting=false;worker.removeCallbacksAndMessages(null);
        EglRenderer r=renderer;renderer=null;if(r!=null)try{r.release();}catch(Exception ignored){}
        for(MediaCodec codec:new MediaCodec[]{video,audio})if(codec!=null){try{codec.stop();}catch(Exception ignored){}codec.release();}
        if(muxer!=null){try{if(muxing)muxer.stop();}catch(Exception error){success=false;}muxer.release();}if(surface!=null)surface.release();
        if(success){MediaExtractor check=new MediaExtractor();try{check.setDataSource(file.getAbsolutePath());boolean v=false,a=false;for(int i=0;i<check.getTrackCount();i++){String mime=check.getTrackFormat(i).getString(MediaFormat.KEY_MIME);v|=mime.startsWith("video/");a|=mime.startsWith("audio/");}success=v&&a;}catch(Exception e){success=false;}finally{check.release();}}
        if(!success)file.delete();final boolean valid=success;main.post(()->listener.finished(file,valid));thread.quitSafely();
    }
    private static final class Packet{final boolean video;final byte[] bytes;final long timeUs;final int flags;Packet(boolean v,byte[] b,long t,int f){video=v;bytes=b;timeUs=t;flags=f;}}
}
