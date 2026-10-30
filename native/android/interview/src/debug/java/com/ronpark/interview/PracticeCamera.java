package com.ronpark.interview;

import android.content.Context;
import android.os.*;
import android.view.ViewGroup;
import org.webrtc.*;

/** Camera setup/release stays off the UI thread; the preview host can move without restarting capture. */
final class PracticeCamera {
    interface Reply{void done(boolean ready);}
    private final Handler main=new Handler(Looper.getMainLooper());
    private final HandlerThread thread=new HandlerThread("PracticeCamera");
    private final Handler worker;
    private int generation;
    private Resources resources;
    private SurfaceViewRenderer preview;
    private ViewGroup host;
    private boolean starting,ready;
    PracticeCamera(){thread.start();worker=new Handler(thread.getLooper());}
    boolean ready(){return ready;}
    EglBase.Context context(){return resources==null?null:resources.egl.getEglBaseContext();}
    void start(Context context,ViewGroup parent,Reply reply){
        host=parent;if(ready){attach(parent);reply.done(true);return;}if(starting)return;
        starting=true;int active=++generation;
        worker.post(()->{
            Resources r=new Resources();
            try{
                PeerConnectionFactory.initialize(PeerConnectionFactory.InitializationOptions.builder(context).createInitializationOptions());
                r.egl=EglBase.create();r.factory=PeerConnectionFactory.builder().createPeerConnectionFactory();
                Camera2Enumerator devices=new Camera2Enumerator(context);String name=null;
                for(String item:devices.getDeviceNames())if(devices.isFrontFacing(item)){name=item;break;}
                if(name==null)throw new IllegalStateException("front_camera_unavailable");
                r.capture=devices.createCapturer(name,null);r.source=r.factory.createVideoSource(false);r.helper=SurfaceTextureHelper.create("PracticeCameraFrames",r.egl.getEglBaseContext());
                r.capture.initialize(r.helper,context,r.source.getCapturerObserver());r.track=r.factory.createVideoTrack("local-practice-camera",r.source);
                main.post(()->{
                    if(active!=generation){worker.post(r::release);return;}
                    resources=r;preview=new SurfaceViewRenderer(context);
                    preview.init(r.egl.getEglBaseContext(),new RendererCommon.RendererEvents(){
                        public void onFirstFrameRendered(){main.post(()->{if(active==generation){starting=false;ready=true;reply.done(true);}});}
                        public void onFrameResolutionChanged(int w,int h,int rotation){}
                    });
                    preview.setMirror(true);preview.setScalingType(RendererCommon.ScalingType.SCALE_ASPECT_FILL);r.track.addSink(preview);attach(host);
                    worker.post(()->{try{r.capture.startCapture(640,480,15);}catch(Exception error){main.post(()->{if(active==generation){stop();reply.done(false);}});}});
                });
            }catch(Exception error){r.release();main.post(()->{if(active==generation){starting=false;reply.done(false);}});}
        });
        main.postDelayed(()->{if(active==generation&&!ready){stop();reply.done(false);}},10000);
    }
    void attach(ViewGroup parent){host=parent;if(preview==null||parent==null)return;if(preview.getParent() instanceof ViewGroup)((ViewGroup)preview.getParent()).removeView(preview);parent.addView(preview,0,new ViewGroup.LayoutParams(-1,-1));}
    void addSink(VideoSink sink){if(resources!=null)resources.track.addSink(sink);}
    void removeSink(VideoSink sink){if(resources!=null)resources.track.removeSink(sink);}
    void stop(){
        generation++;ready=false;starting=false;Resources old=resources;resources=null;
        if(preview!=null){if(old!=null)old.track.removeSink(preview);if(preview.getParent() instanceof ViewGroup)((ViewGroup)preview.getParent()).removeView(preview);preview.release();preview=null;}
        if(old!=null)worker.post(old::release);
    }
    void close(){stop();worker.post(thread::quitSafely);}
    private static final class Resources {
        EglBase egl;PeerConnectionFactory factory;VideoSource source;VideoTrack track;CameraVideoCapturer capture;SurfaceTextureHelper helper;
        void release(){if(capture!=null){try{capture.stopCapture();}catch(Exception ignored){}capture.dispose();}if(track!=null)track.dispose();if(source!=null)source.dispose();if(helper!=null)helper.dispose();if(factory!=null)factory.dispose();if(egl!=null)egl.release();}
    }
}
