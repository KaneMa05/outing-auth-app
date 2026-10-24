package com.ronpark.interview;
import android.content.Context;
import android.view.ViewGroup;
import org.webrtc.*;

/** Preview frames never enter a PeerConnection, recorder, file, or upload. */
final class InterviewCamera {
    private EglBase egl;private PeerConnectionFactory factory;private VideoSource source;private VideoTrack track;private CameraVideoCapturer capturer;private SurfaceTextureHelper helper;private SurfaceViewRenderer renderer;
    void start(Context context,ViewGroup parent) throws Exception {
        stop();PeerConnectionFactory.initialize(PeerConnectionFactory.InitializationOptions.builder(context).createInitializationOptions());
        egl=EglBase.create();factory=PeerConnectionFactory.builder().createPeerConnectionFactory();
        Camera2Enumerator cameras=new Camera2Enumerator(context);String id=null;for(String name:cameras.getDeviceNames())if(cameras.isFrontFacing(name)){id=name;break;}if(id==null&&cameras.getDeviceNames().length>0)id=cameras.getDeviceNames()[0];if(id==null)throw new IllegalStateException();
        capturer=cameras.createCapturer(id,null);source=factory.createVideoSource(false);helper=SurfaceTextureHelper.create("InterviewPreview",egl.getEglBaseContext());capturer.initialize(helper,context,source.getCapturerObserver());
        track=factory.createVideoTrack("preview-only",source);renderer=new SurfaceViewRenderer(context);renderer.init(egl.getEglBaseContext(),null);renderer.setMirror(cameras.isFrontFacing(id));renderer.setScalingType(RendererCommon.ScalingType.SCALE_ASPECT_FILL);track.addSink(renderer);attach(parent);capturer.startCapture(640,480,15);
    }
    void attach(ViewGroup parent){if(renderer==null)return;if(renderer.getParent() instanceof ViewGroup)((ViewGroup)renderer.getParent()).removeView(renderer);parent.addView(renderer,new ViewGroup.LayoutParams(-1,-1));}
    void stop(){if(capturer!=null){try{capturer.stopCapture();}catch(Exception ignored){}capturer.dispose();capturer=null;}if(track!=null){if(renderer!=null)track.removeSink(renderer);track.dispose();track=null;}if(renderer!=null){if(renderer.getParent() instanceof ViewGroup)((ViewGroup)renderer.getParent()).removeView(renderer);renderer.release();renderer=null;}if(source!=null){source.dispose();source=null;}if(helper!=null){helper.dispose();helper=null;}if(factory!=null){factory.dispose();factory=null;}if(egl!=null){egl.release();egl=null;}}
}
